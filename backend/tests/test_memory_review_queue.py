from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

from app.services.memory import workflows


class FakeNestedTransaction:
    def __enter__(self) -> None:
        return None

    def __exit__(self, *_args: object) -> None:
        return None


class FakeSession:
    def begin_nested(self) -> FakeNestedTransaction:
        return FakeNestedTransaction()


def test_review_queue_refresh_materializes_projects_before_recount(monkeypatch) -> None:
    project_id = uuid4()
    initial_summary = {
        "id": str(project_id),
        "pending_memory_count": 0,
    }
    refreshed_summary = {
        "id": str(project_id),
        "pending_memory_count": 2,
    }
    summary_calls = iter([[initial_summary], [refreshed_summary]])
    pending_calls: list[tuple[object, int, object]] = []

    monkeypatch.setattr(
        workflows,
        "list_project_summaries",
        lambda _db, *, current_user: next(summary_calls),
    )

    def pending_ranges(db, *, limit, project_id):
        pending_calls.append((db, limit, project_id))
        return [{"draft_id": "draft-1"}, {"draft_id": "draft-2"}]

    monkeypatch.setattr(
        workflows,
        "list_project_memory_pending_ranges",
        pending_ranges,
    )

    db = FakeSession()
    response = workflows.refresh_memory_review_queue_response(
        db,
        limit=100,
        user=object(),
    )

    assert pending_calls == [(db, 100, project_id)]
    assert response["errors"] == []
    assert response["project_summaries"] == [refreshed_summary]
    assert response["projects"] == [
        {
            "pending_count": 2,
            "project_id": str(project_id),
            "ranges": [{"draft_id": "draft-1"}, {"draft_id": "draft-2"}],
        }
    ]
    assert response["total_pending_count"] == 2


def test_review_queue_refresh_route_is_exposed() -> None:
    from app.main import app

    operation = app.openapi()["paths"]["/api/projects/memory/review-queue/refresh"]

    assert "post" in operation


def test_memory_generation_is_project_scoped() -> None:
    from app.main import app

    paths = app.openapi()["paths"]

    assert "post" in paths["/api/projects/{project_id}/memory/generate"]
    assert "get" in paths["/api/projects/{project_id}/memory/batches/{batch_id}"]
    assert "/api/projects/{project_id}/sessions/{session_id}/checkpoint" not in paths


def test_review_queue_refresh_isolates_project_materialization_errors(
    monkeypatch,
) -> None:
    failing_project_id = uuid4()
    healthy_project_id = uuid4()
    initial_summaries = [
        {"id": str(failing_project_id), "pending_memory_count": 0},
        {"id": str(healthy_project_id), "pending_memory_count": 0},
    ]
    refreshed_summaries = [
        {"id": str(failing_project_id), "pending_memory_count": 0},
        {"id": str(healthy_project_id), "pending_memory_count": 1},
    ]
    summary_calls = iter([initial_summaries, refreshed_summaries])

    monkeypatch.setattr(
        workflows,
        "list_project_summaries",
        lambda _db, *, current_user: next(summary_calls),
    )

    def pending_ranges(_db, *, limit, project_id):
        if project_id == failing_project_id:
            raise ValueError("broken project")
        return [{"draft_id": "healthy-draft"}]

    monkeypatch.setattr(
        workflows,
        "list_project_memory_pending_ranges",
        pending_ranges,
    )

    response = workflows.refresh_memory_review_queue_response(
        FakeSession(),
        limit=100,
        user=object(),
    )

    assert response["errors"] == [
        {
            "message": "Captured work could not be checked for this project.",
            "project_id": str(failing_project_id),
        }
    ]
    assert response["projects"] == [
        {
            "pending_count": 1,
            "project_id": str(healthy_project_id),
            "ranges": [{"draft_id": "healthy-draft"}],
        }
    ]


def test_manual_session_completion_materializes_the_final_pending_window(
    monkeypatch,
) -> None:
    project = SimpleNamespace(id=uuid4())
    session = SimpleNamespace(id=uuid4())
    generated_sessions: list[object] = []
    pending_range = {
        "can_checkpoint": True,
        "session_id": str(session.id),
    }

    monkeypatch.setattr(workflows, "project_for_user", lambda *_args, **_kwargs: project)
    monkeypatch.setattr(workflows, "session_for_project", lambda *_args: session)
    monkeypatch.setattr(
        workflows,
        "complete_session_if_ready",
        lambda *_args, **_kwargs: {
            "completed": True,
            "completed_at": datetime(2026, 7, 12, tzinfo=UTC),
            "reason": "manual",
        },
    )
    monkeypatch.setattr(
        workflows,
        "generate_due_memory_artifacts_for_session",
        lambda _db, target_session, **_kwargs: generated_sessions.append(target_session),
    )
    monkeypatch.setattr(
        workflows,
        "list_project_memory_pending_ranges",
        lambda *_args, **_kwargs: [pending_range],
    )

    response = workflows.complete_project_session_response(
        object(),
        force=True,
        project_id=project.id,
        session_id=session.id,
        user=object(),
    )

    assert generated_sessions == [session]
    assert response["pending_range"] == pending_range
    assert response["status"] == "pending_memory"
