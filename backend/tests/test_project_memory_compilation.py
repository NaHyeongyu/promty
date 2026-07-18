from __future__ import annotations

from dataclasses import replace
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.services.memory import project_memory


def _base_state(project_id):
    return project_memory._ProjectMemoryBaseState(
        base_guard="project-memory-v1:base",
        existing_artifact_id=None,
        existing_source_memory_ids=(),
        previous_snapshot=None,
        project_context=project_memory._freeze_json(
            {
                "default_branch": "main",
                "description": "Compilation boundary test",
                "git_remote": None,
                "id": str(project_id),
                "name": "Promty",
                "slug": "promty",
                "tags": ["memory"],
                "visibility": "private",
            }
        ),
        source_memory_contexts=(
            project_memory._freeze_json(
                {
                    "created_at": "2026-07-11T00:00:00+00:00",
                    "id": str(uuid4()),
                    "memory_batch_id": "older-batch",
                    "source_session_ids": [str(uuid4())],
                    "summary": "Older durable context",
                    "title": "Older memory",
                    "updated_at": "2026-07-11T00:00:00+00:00",
                }
            ),
        ),
    )


def test_prepare_compilation_detaches_and_deeply_freezes_preview_context(monkeypatch) -> None:
    project_id = uuid4()
    base_state = _base_state(project_id)
    monkeypatch.setattr(
        project_memory,
        "_project_memory_base_state",
        lambda _db, _project_id: base_state,
    )
    preview_id = str(uuid4())
    preview = {
        "created_at": "2026-07-12T00:00:00+00:00",
        "id": preview_id,
        "memory_batch_id": "current-batch",
        "source_session_ids": [str(uuid4())],
        "summary": "Current batch preview",
        "tags": ["preview"],
        "title": "Current memory",
        "updated_at": "2026-07-12T00:00:00+00:00",
    }

    compilation_input = project_memory.prepare_project_memory_compilation(
        object(),  # type: ignore[arg-type]
        project_id,
        [preview],
    )
    preview["summary"] = "mutated after preparation"
    preview["tags"].append("mutated")

    assert compilation_input.base_guard == base_state.base_guard
    assert compilation_input.source_memory_ids[0] == preview_id
    assert compilation_input.source_memory_contexts[0]["summary"] == "Current batch preview"
    assert compilation_input.source_memory_contexts[0]["tags"] == ("preview",)
    assert compilation_input.memory_batch_ids == ("current-batch", "older-batch")
    with pytest.raises(TypeError):
        compilation_input.source_memory_contexts[0]["summary"] = "not allowed"  # type: ignore[index]


def test_generate_compilation_returns_frozen_payload_without_database_access(monkeypatch) -> None:
    project_id = uuid4()
    base_state = _base_state(project_id)
    monkeypatch.setattr(
        project_memory,
        "_project_memory_base_state",
        lambda _db, _project_id: base_state,
    )
    preview_id = str(uuid4())
    compilation_input = project_memory.prepare_project_memory_compilation(
        object(),  # type: ignore[arg-type]
        project_id,
        [
            {
                "id": preview_id,
                "memory_batch_id": "current-batch",
                "source_session_ids": [str(uuid4())],
                "summary": "Prepared outside the final transaction",
                "title": "Prepared memory",
            }
        ],
    )
    compilation_input = replace(compilation_input, provider="disabled")

    prepared = project_memory.generate_project_memory_compilation(compilation_input)

    assert prepared.base_guard == compilation_input.base_guard
    assert prepared.project_id == project_id
    assert prepared.payload is not None
    assert prepared.payload["prompt_event_ids"][0] == preview_id
    assert prepared.extra_metadata is not None
    assert prepared.extra_metadata["source_memory_ids"][0] == preview_id
    assert prepared.snapshot is not None
    assert prepared.snapshot["source_memory_ids"][0] == preview_id
    with pytest.raises(TypeError):
        prepared.payload["title"] = "not allowed"  # type: ignore[index]


def test_write_compilation_only_persists_prepared_values(monkeypatch) -> None:
    project_id = uuid4()
    prepared = project_memory.PreparedProjectMemoryCompilation(
        base_guard="project-memory-v1:base",
        existing_artifact_id=None,
        extra_metadata=project_memory._freeze_json({"source_memory_ids": ["memory-id"]}),
        payload=project_memory._freeze_json(
            {
                "changed_files": [],
                "commit_sha": None,
                "event_count": 1,
                "first_event_id": None,
                "generator": "test-generator",
                "last_event_id": None,
                "model": None,
                "outcome": "Project Memory",
                "prompt_event_ids": ["memory-id"],
                "reason": "Current direction",
                "sections": [],
                "summary": "Current direction",
                "tags": ["project-memory"],
                "technologies": [],
                "title": "Promty Project Memory",
                "tool": "promty",
            }
        ),
        project_id=project_id,
        reuse_existing=False,
        snapshot=project_memory._freeze_json({"source_memory_ids": ["memory-id"]}),
    )
    calls = []
    artifact = SimpleNamespace(id=uuid4())

    def write(_db, **kwargs):
        calls.append(kwargs)
        return artifact

    monkeypatch.setattr(project_memory, "write_memory_artifact_payload", write)
    monkeypatch.setattr(
        project_memory,
        "compile_project_memory_snapshot",
        lambda *_args, **_kwargs: pytest.fail("write must not invoke the provider"),
    )

    result = project_memory.write_project_memory_compilation(
        object(),  # type: ignore[arg-type]
        prepared,
    )

    assert result is artifact
    assert len(calls) == 1
    assert calls[0]["project_id"] == project_id
    assert calls[0]["payload"]["prompt_event_ids"] == ["memory-id"]


def test_guard_recomputes_the_current_db_base(monkeypatch) -> None:
    project_id = uuid4()
    base_state = _base_state(project_id)
    monkeypatch.setattr(
        project_memory,
        "_project_memory_base_state",
        lambda _db, _project_id: replace(base_state, base_guard="project-memory-v1:current"),
    )

    assert (
        project_memory.project_memory_compilation_guard(
            object(),  # type: ignore[arg-type]
            project_id,
        )
        == "project-memory-v1:current"
    )


def test_manual_project_memory_regeneration_route_is_not_exposed() -> None:
    from app.main import app

    paths = app.openapi()["paths"]

    assert "/api/projects/{project_id}/memory/project/compile" not in paths
