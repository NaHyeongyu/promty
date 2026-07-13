from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.core.text_limits import (
    PROJECT_MEMORY_BODY_MAX_BYTES,
    PROJECT_MEMORY_WARNING_MAX_ITEMS,
)
from app.schemas.memory import ProjectMemorySnapshot, ProjectMemoryUpdateRequest
from app.services.memory import project_memory
from app.services.memory.project_memory import update_project_memory_snapshot


def _snapshot(body_markdown: str) -> dict:
    return {
        "body_markdown": body_markdown,
        "sections": {},
        "snapshot_type": "project_memory",
    }


def test_manual_project_memory_body_enforces_utf8_bytes_not_characters() -> None:
    ProjectMemoryUpdateRequest(body_markdown="a" * PROJECT_MEMORY_BODY_MAX_BYTES)

    multibyte_body = "한" * (PROJECT_MEMORY_BODY_MAX_BYTES // 2)
    assert len(multibyte_body) < PROJECT_MEMORY_BODY_MAX_BYTES
    with pytest.raises(ValidationError, match="UTF-8 bytes"):
        ProjectMemoryUpdateRequest(body_markdown=multibyte_body)


def test_generated_project_memory_snapshot_uses_the_same_body_limit() -> None:
    ProjectMemorySnapshot.model_validate(_snapshot("a" * PROJECT_MEMORY_BODY_MAX_BYTES))

    with pytest.raises(ValidationError, match="UTF-8 bytes"):
        ProjectMemorySnapshot.model_validate(_snapshot("a" * (PROJECT_MEMORY_BODY_MAX_BYTES + 1)))


def test_service_boundary_rejects_oversized_body_before_database_or_version_write() -> None:
    class DatabaseMustNotBeUsed:
        def get(self, *_args, **_kwargs):
            raise AssertionError("oversized body must fail before database access")

    with pytest.raises(ValueError, match="UTF-8 bytes"):
        update_project_memory_snapshot(
            DatabaseMustNotBeUsed(),  # type: ignore[arg-type]
            body_markdown="a" * (PROJECT_MEMORY_BODY_MAX_BYTES + 1),
            project_id=uuid4(),
        )


def test_repeated_manual_edits_store_one_warning_and_bounded_body(monkeypatch) -> None:
    project_id = uuid4()
    project = SimpleNamespace(
        default_branch="main",
        description=None,
        git_remote=None,
        id=project_id,
        name="Promty",
        slug="promty",
        tags=[],
        visibility="private",
    )
    existing = SimpleNamespace(
        generator="project-memory-local-v1",
        metadata_={
            "project_memory_snapshot": {
                "body_markdown": "old body",
                "sections": {},
                "source_memory_ids": [],
                "warnings": [
                    "Existing warning",
                    *[
                        f"Legacy warning {index}"
                        for index in range(PROJECT_MEMORY_WARNING_MAX_ITEMS + 10)
                    ],
                ],
            }
        },
    )
    stored_snapshots: list[dict] = []

    class FakeDB:
        def get(self, model, value):
            assert model is project_memory.Project
            assert value == project_id
            return project

    def write_payload(_db, **kwargs):
        snapshot = kwargs["extra_metadata"]["project_memory_snapshot"]
        stored_snapshots.append(snapshot)
        existing.metadata_ = kwargs["extra_metadata"]
        return existing

    monkeypatch.setattr(
        project_memory,
        "_latest_project_memory_snapshot",
        lambda _db, _project_id: existing,
    )
    monkeypatch.setattr(project_memory, "write_memory_artifact_payload", write_payload)
    body = "한" * (PROJECT_MEMORY_BODY_MAX_BYTES // 3)

    project_memory.update_project_memory_snapshot(
        FakeDB(),  # type: ignore[arg-type]
        body_markdown=body,
        project_id=project_id,
    )
    project_memory.update_project_memory_snapshot(
        FakeDB(),  # type: ignore[arg-type]
        body_markdown=body,
        project_id=project_id,
    )

    edit_warning = "Project Memory body was edited by the user."
    assert len(stored_snapshots) == 2
    assert len(stored_snapshots[-1]["warnings"]) == PROJECT_MEMORY_WARNING_MAX_ITEMS
    assert stored_snapshots[-1]["warnings"][0] == "Existing warning"
    assert stored_snapshots[-1]["warnings"][-1] == edit_warning
    assert stored_snapshots[-1]["warnings"].count(edit_warning) == 1
    assert len(stored_snapshots[-1]["body_markdown"].encode("utf-8")) <= (
        PROJECT_MEMORY_BODY_MAX_BYTES
    )
