from __future__ import annotations

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import uuid4

from app.services import events as event_service
from app.services.memory import session_completion


class NoQueryDB:
    def scalar(self, _statement):
        raise AssertionError("persisted session activity should avoid an event aggregate")


def test_trailing_response_activity_prevents_early_idle_completion(monkeypatch) -> None:
    now = datetime(2026, 7, 13, 12, tzinfo=UTC)
    latest_event_at = now - timedelta(minutes=5)
    session = SimpleNamespace(
        ended_at=None,
        id=uuid4(),
        last_activity_at=latest_event_at,
        project_id=uuid4(),
    )
    monkeypatch.setattr(session_completion, "utc_now", lambda: now)

    state = session_completion.session_completion_state(
        NoQueryDB(),
        session,
    )

    assert state == {
        "completed": False,
        "completed_at": None,
        "reason": "open",
    }


def test_newer_event_reopens_a_previously_completed_session() -> None:
    ended_at = datetime(2026, 7, 13, 10, tzinfo=UTC)
    session = SimpleNamespace(
        branch=None,
        cwd=None,
        ended_at=ended_at,
        model=None,
    )
    later_event = SimpleNamespace(
        event_type="ResponseReceived",
        payload=SimpleNamespace(model_dump=lambda **_kwargs: {}),
        timestamp=ended_at + timedelta(minutes=1),
    )

    event_service._apply_session_metadata(session, later_event)

    assert session.ended_at is None


def test_session_ended_event_still_closes_a_reopened_session() -> None:
    timestamp = datetime(2026, 7, 13, 12, tzinfo=UTC)
    session = SimpleNamespace(branch=None, cwd=None, ended_at=None, model=None)
    ended_event = SimpleNamespace(
        event_type="SessionEnded",
        payload=SimpleNamespace(model_dump=lambda **_kwargs: {}),
        timestamp=timestamp,
    )

    event_service._apply_session_metadata(session, ended_event)

    assert session.ended_at == timestamp
