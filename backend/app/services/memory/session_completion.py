from __future__ import annotations

from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session as DBSession

from app.core.time import utc_now
from app.models.events import Event
from app.models.sessions import Session
from app.services.memory.constants import SESSION_IDLE_COMPLETE_AFTER


def session_completion_state(db: DBSession, session: Session) -> dict[str, Any]:
    if session.ended_at is not None:
        return {
            "completed": True,
            "completed_at": session.ended_at,
            "reason": "explicit",
        }
    latest_event_at = getattr(session, "last_activity_at", None)
    if latest_event_at is None:
        # Defensive fallback for rows created outside the collector path. The
        # migration backfills production sessions and normal ingest keeps the
        # column current, so this query should be exceptional.
        latest_event_at = db.scalar(
            select(func.max(Event.created_at)).where(
                Event.project_id == session.project_id,
                Event.session_id == session.id,
            )
        )
    # A response or file-change hook is still session activity. Using the most
    # recent prompt alone can finalize a session while its trailing events are
    # actively arriving.
    idle_reference_at = latest_event_at
    if idle_reference_at and idle_reference_at <= utc_now() - SESSION_IDLE_COMPLETE_AFTER:
        return {
            "completed": True,
            "completed_at": idle_reference_at,
            "reason": "idle_timeout",
        }
    return {
        "completed": False,
        "completed_at": None,
        "reason": "open",
    }


def complete_session_if_ready(
    db: DBSession,
    session: Session,
    *,
    force: bool = False,
) -> dict[str, Any]:
    state = session_completion_state(db, session)
    if state["completed"]:
        if session.ended_at is None:
            session.ended_at = state["completed_at"]
            db.flush()
        return state
    if not force:
        return state

    session.ended_at = getattr(session, "last_activity_at", None) or utc_now()
    db.flush()
    return {
        "completed": True,
        "completed_at": session.ended_at,
        "reason": "manual",
    }
