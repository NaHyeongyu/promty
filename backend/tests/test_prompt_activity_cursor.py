from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.services.project_views import (
    _decode_prompt_activity_cursor,
    _encode_prompt_activity_cursor,
)


def test_prompt_activity_cursor_round_trip() -> None:
    event_id = uuid4()
    created_at = datetime(2026, 7, 9, 12, 30, 5, tzinfo=timezone.utc)
    event = SimpleNamespace(id=event_id, sequence=42, created_at=created_at)

    cursor = _encode_prompt_activity_cursor(event)

    assert _decode_prompt_activity_cursor(cursor) == (created_at, 42, event_id)


def test_prompt_activity_cursor_rejects_invalid_value() -> None:
    with pytest.raises(HTTPException) as exc:
        _decode_prompt_activity_cursor("not-a-cursor")

    assert exc.value.status_code == 400
    assert exc.value.detail == "Invalid prompt activity cursor"
