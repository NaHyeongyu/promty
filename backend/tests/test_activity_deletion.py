from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from app.models.events import Event
from app.services.projects.activity_deletion import _linked_prompt_event_ids


def _event(
    *,
    event_type: str,
    project_id,
    sequence: int,
    session_id,
    payload: dict | None = None,
) -> Event:
    return Event(
        created_at=datetime(2026, 1, 1, sequence, tzinfo=timezone.utc),
        event_type=event_type,
        id=uuid4(),
        payload=payload or {},
        project_id=project_id,
        schema_version=1,
        sequence=sequence,
        session_id=session_id,
        tool="codex-cli",
    )


def test_linked_prompt_events_stop_at_the_next_prompt() -> None:
    project_id = uuid4()
    session_id = uuid4()
    first_prompt = _event(
        event_type="PromptSubmitted",
        project_id=project_id,
        sequence=1,
        session_id=session_id,
        payload={"turn_id": "turn-1"},
    )
    first_response = _event(
        event_type="ResponseReceived",
        project_id=project_id,
        sequence=2,
        session_id=session_id,
        payload={"turn_id": "turn-1"},
    )
    first_files = _event(
        event_type="FilesChanged",
        project_id=project_id,
        sequence=3,
        session_id=session_id,
    )
    second_prompt = _event(
        event_type="PromptSubmitted",
        project_id=project_id,
        sequence=4,
        session_id=session_id,
        payload={"turn_id": "turn-2"},
    )
    second_response = _event(
        event_type="ResponseReceived",
        project_id=project_id,
        sequence=5,
        session_id=session_id,
    )

    linked_ids = _linked_prompt_event_ids(
        [first_prompt, first_response, first_files, second_prompt, second_response],
        prompt_event_id=first_prompt.id,
    )

    assert linked_ids == {first_prompt.id, first_response.id, first_files.id}


def test_explicit_prompt_reference_wins_over_latest_prompt_fallback() -> None:
    project_id = uuid4()
    session_id = uuid4()
    first_prompt = _event(
        event_type="PromptSubmitted",
        project_id=project_id,
        sequence=1,
        session_id=session_id,
    )
    second_prompt = _event(
        event_type="PromptSubmitted",
        project_id=project_id,
        sequence=2,
        session_id=session_id,
    )
    delayed_files = _event(
        event_type="FilesChanged",
        project_id=project_id,
        sequence=3,
        session_id=session_id,
        payload={"prompt_event_id": str(first_prompt.id)},
    )

    linked_ids = _linked_prompt_event_ids(
        [first_prompt, second_prompt, delayed_files],
        prompt_event_id=first_prompt.id,
    )

    assert linked_ids == {first_prompt.id, delayed_files.id}
