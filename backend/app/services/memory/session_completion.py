from __future__ import annotations

from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session as DBSession

from app.core.time import utc_now
from app.models.events import Event
from app.models.sessions import Session
from app.services.memory.constants import SESSION_IDLE_COMPLETE_AFTER


def session_completion_state(db: DBSession, session: Session) -> dict[str, Any]:
    latest_event_at = db.scalar(
        select(func.max(Event.created_at)).where(
            Event.project_id == session.project_id,
            Event.session_id == session.id,
        )
    )
    latest_prompt_at = db.scalar(
        select(func.max(Event.created_at)).where(
            Event.project_id == session.project_id,
            Event.session_id == session.id,
            Event.event_type == "PromptSubmitted",
        )
    )
    if session.ended_at is not None:
        return {
            "completed": True,
            "completed_at": session.ended_at,
            "reason": "explicit",
        }
    idle_reference_at = latest_prompt_at or latest_event_at
    if idle_reference_at and idle_reference_at <= utc_now() - SESSION_IDLE_COMPLETE_AFTER:
        return {
            "completed": True,
            "completed_at": latest_event_at or idle_reference_at,
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

    latest_event_at = db.scalar(
        select(func.max(Event.created_at)).where(
            Event.project_id == session.project_id,
            Event.session_id == session.id,
        )
    )
    session.ended_at = latest_event_at or utc_now()
    db.flush()
    return {
        "completed": True,
        "completed_at": session.ended_at,
        "reason": "manual",
    }
