from __future__ import annotations

from typing import Any

from sqlalchemy import desc, select
from sqlalchemy.orm import Session as DBSession

from app.core.config import settings
from app.models.artifacts import Artifact
from app.models.events import Event
from app.models.sessions import Session
from app.services.memory.constants import (
    MEMORY_DRAFT_ARTIFACT_TYPE,
    MEMORY_WINDOW_STRATEGY,
    PENDING_DRAFT_STAGE,
)
from app.services.memory.context import payload as event_payload
from app.services.memory.context import string_or_none


def memory_slice_prompt_target() -> int:
    return max(settings.memory_slice_prompt_count, 1)


def slice_metadata(artifact: Artifact) -> dict[str, Any]:
    metadata = artifact.metadata_ if isinstance(artifact.metadata_, dict) else {}
    if metadata.get("memory_strategy") != MEMORY_WINDOW_STRATEGY:
        return {}
    return metadata


def memory_slice_artifacts(db: DBSession, session: Session) -> list[Artifact]:
    artifacts = list(
        db.execute(
            select(Artifact)
            .where(
                Artifact.project_id == session.project_id,
                Artifact.session_id == session.id,
                Artifact.type == MEMORY_DRAFT_ARTIFACT_TYPE,
            )
            .order_by(Artifact.created_at, Artifact.updated_at)
        ).scalars()
    )
    return [
        artifact
        for artifact in artifacts
        if slice_metadata(artifact).get("artifact_stage") == PENDING_DRAFT_STAGE
    ]


def latest_memory_slice_end_sequence(db: DBSession, session: Session) -> int | None:
    end_sequences = [
        metadata["end_sequence"]
        for artifact in memory_slice_artifacts(db, session)
        if isinstance((metadata := slice_metadata(artifact)).get("end_sequence"), int)
    ]
    return max(end_sequences) if end_sequences else None


def next_memory_slice_index(db: DBSession, session: Session) -> int:
    slice_indexes = [
        metadata["slice_index"]
        for artifact in memory_slice_artifacts(db, session)
        if isinstance((metadata := slice_metadata(artifact)).get("slice_index"), int)
    ]
    return (max(slice_indexes) if slice_indexes else 0) + 1


def latest_session_event(db: DBSession, session: Session) -> Event | None:
    return db.execute(
        select(Event)
        .where(Event.project_id == session.project_id, Event.session_id == session.id)
        .order_by(desc(Event.sequence), desc(Event.created_at))
        .limit(1)
    ).scalar_one_or_none()


def _event_type_value(event: Any) -> str | None:
    if isinstance(event, dict):
        value = event.get("event_type")
    else:
        value = getattr(event, "event_type", None)
    return value if isinstance(value, str) else None


def _event_sequence_value(event: Any) -> int | None:
    if isinstance(event, dict):
        value = event.get("sequence")
    else:
        value = getattr(event, "sequence", None)
    return value if isinstance(value, int) else None


def _event_payload_value(event: Any) -> dict[str, Any]:
    if isinstance(event, dict):
        payload = event.get("payload")
        return payload if isinstance(payload, dict) else {}
    if isinstance(event, Event):
        return event_payload(event)
    payload = getattr(event, "payload", None)
    return payload if isinstance(payload, dict) else {}


def _event_has_response_text(event: Any) -> bool:
    if _event_type_value(event) != "ResponseReceived":
        return False
    return string_or_none(_event_payload_value(event).get("response")) is not None


def events_have_generation_inputs(events: list[Any]) -> bool:
    prompt_sequences = [
        sequence
        for event in events
        if _event_type_value(event) == "PromptSubmitted"
        and isinstance((sequence := _event_sequence_value(event)), int)
    ]
    if not prompt_sequences:
        return False

    latest_prompt_sequence = max(prompt_sequences)
    events_after_prompt = [
        event
        for event in events
        if isinstance((sequence := _event_sequence_value(event)), int)
        and sequence > latest_prompt_sequence
    ]
    return any(_event_has_response_text(event) for event in events_after_prompt) and any(
        _event_type_value(event) == "FilesChanged" for event in events_after_prompt
    )


def _window_has_generation_inputs(
    db: DBSession,
    session: Session,
    *,
    latest_prompt_sequence: int,
    through_sequence: int,
) -> bool:
    events_after_prompt = list(
        db.execute(
            select(Event)
            .where(
                Event.project_id == session.project_id,
                Event.session_id == session.id,
                Event.sequence > latest_prompt_sequence,
                Event.sequence <= through_sequence,
            )
            .order_by(Event.sequence, Event.created_at)
        ).scalars()
    )
    return any(_event_has_response_text(event) for event in events_after_prompt) and any(
        event.event_type == "FilesChanged" for event in events_after_prompt
    )


def _prompt_events_after_sequence(
    db: DBSession,
    session: Session,
    *,
    after_sequence: int | None,
) -> list[Event]:
    query = select(Event).where(
        Event.project_id == session.project_id,
        Event.session_id == session.id,
        Event.event_type == "PromptSubmitted",
    )
    if after_sequence is not None:
        query = query.where(Event.sequence > after_sequence)
    return list(db.execute(query.order_by(Event.sequence, Event.created_at)).scalars())


def due_memory_window(
    db: DBSession,
    session: Session,
    *,
    after_sequence: int | None,
    finalize: bool,
) -> dict[str, Any] | None:
    prompts = _prompt_events_after_sequence(
        db,
        session,
        after_sequence=after_sequence,
    )
    if not prompts:
        return None

    latest_event = latest_session_event(db, session)
    if latest_event is None:
        return None

    prompt_target = memory_slice_prompt_target()
    if len(prompts) >= prompt_target:
        selected_prompts = prompts[:prompt_target]
        if latest_event.sequence <= selected_prompts[-1].sequence:
            return None
        next_prompt = prompts[prompt_target] if len(prompts) > prompt_target else None
        end_sequence = next_prompt.sequence - 1 if next_prompt else latest_event.sequence
        if not _window_has_generation_inputs(
            db,
            session,
            latest_prompt_sequence=selected_prompts[-1].sequence,
            through_sequence=end_sequence,
        ):
            return None
        return {
            "end_sequence": end_sequence,
            "reason": "prompt_count",
            "selected_prompts": selected_prompts,
            "start_sequence": selected_prompts[0].sequence,
        }

    if finalize:
        if not _window_has_generation_inputs(
            db,
            session,
            latest_prompt_sequence=prompts[-1].sequence,
            through_sequence=latest_event.sequence,
        ):
            return None
        return {
            "end_sequence": latest_event.sequence,
            "reason": "session_finalized",
            "selected_prompts": prompts,
            "start_sequence": prompts[0].sequence,
        }

    return None


def latest_memory_slice(db: DBSession, session: Session) -> Artifact | None:
    slices = memory_slice_artifacts(db, session)
    if not slices:
        return None
    return max(
        slices,
        key=lambda artifact: (
            slice_metadata(artifact).get("end_sequence") or -1,
            artifact.updated_at,
        ),
    )
