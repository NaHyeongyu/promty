from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.schemas.events import (
    EVENT_CHANGE_PATCH_MAX_CHARS,
    EVENT_CHANGES_MAX_ITEMS,
    EVENT_FILE_PATH_MAX_CHARS,
    EVENT_FILES_MAX_ITEMS,
    EVENT_RESOURCE_ENTRIES_MAX_PER_BATCH,
    EventBatchCreate,
    EventCreate,
)


def _files_changed_event(*, files=None, changes=None) -> dict:
    payload = {}
    if files is not None:
        payload["files"] = files
    if changes is not None:
        payload["changes"] = changes
    return {
        "id": str(uuid4()),
        "schema_version": 1,
        "project_id": str(uuid4()),
        "session_id": str(uuid4()),
        "sequence": 1,
        "tool": "codex-cli",
        "event_type": "FilesChanged",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "payload": payload,
    }


def test_files_changed_accepts_values_at_individual_limits() -> None:
    event = EventCreate.model_validate(
        _files_changed_event(
            files=["a"] * EVENT_FILES_MAX_ITEMS,
            changes=[
                {
                    "path": "p" * EVENT_FILE_PATH_MAX_CHARS,
                    "patch": "x" * EVENT_CHANGE_PATCH_MAX_CHARS,
                }
            ],
        )
    )

    assert len(event.payload.files) == EVENT_FILES_MAX_ITEMS
    assert len(event.payload.changes[0]["patch"]) == EVENT_CHANGE_PATCH_MAX_CHARS


@pytest.mark.parametrize(
    ("payload", "message"),
    [
        ({"files": ["a"] * (EVENT_FILES_MAX_ITEMS + 1)}, "List should have at most"),
        (
            {"changes": [{"path": "a"}] * (EVENT_CHANGES_MAX_ITEMS + 1)},
            "List should have at most",
        ),
        (
            {"files": ["a" * (EVENT_FILE_PATH_MAX_CHARS + 1)]},
            "file paths must be at most",
        ),
        (
            {"changes": [{"old_path": "a" * (EVENT_FILE_PATH_MAX_CHARS + 1)}]},
            "change paths must be at most",
        ),
        (
            {"changes": [{"patch": "x" * (EVENT_CHANGE_PATCH_MAX_CHARS + 1)}]},
            "change patches must be at most",
        ),
    ],
)
def test_files_changed_rejects_values_over_individual_limits(
    payload: dict,
    message: str,
) -> None:
    with pytest.raises(ValidationError, match=message):
        EventCreate.model_validate(_files_changed_event(**payload))


def test_event_batch_accepts_resource_entries_at_aggregate_limit() -> None:
    half = EVENT_RESOURCE_ENTRIES_MAX_PER_BATCH // 2
    batch = EventBatchCreate.model_validate(
        {
            "events": [
                _files_changed_event(changes=[{"path": "a"}] * half),
                _files_changed_event(changes=[{"path": "b"}] * half),
            ]
        }
    )

    assert len(batch.events) == 2


def test_event_batch_rejects_resource_entries_over_aggregate_limit() -> None:
    with pytest.raises(ValidationError, match="event batch contains more than"):
        EventBatchCreate.model_validate(
            {
                "events": [
                    _files_changed_event(changes=[{"path": "a"}] * EVENT_CHANGES_MAX_ITEMS),
                    _files_changed_event(changes=[{"path": "b"}] * EVENT_CHANGES_MAX_ITEMS),
                    _files_changed_event(changes=[{"path": "c"}]),
                ]
            }
        )


def test_batch_resource_count_matches_ingest_change_precedence() -> None:
    event = _files_changed_event(
        files=["a"] * EVENT_FILES_MAX_ITEMS,
        changes=[{"path": "only-change-counts"}],
    )

    batch = EventBatchCreate.model_validate({"events": [event, event]})

    assert len(batch.events) == 2
