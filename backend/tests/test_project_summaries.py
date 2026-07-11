from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from app.models.projects import Project
from app.schemas.projects import ProjectSummaryResponse
from app.services.projects.management import project_summary


def test_project_summary_exposes_memory_review_status() -> None:
    created_at = datetime(2026, 7, 10, 9, 30, tzinfo=timezone.utc)
    latest_event_at = datetime(2026, 7, 12, 8, 0, tzinfo=timezone.utc)
    latest_memory_at = datetime(2026, 7, 12, 8, 15, tzinfo=timezone.utc)
    project = Project(
        created_at=created_at,
        default_branch="main",
        git_remote="https://github.com/promty/example",
        id=uuid4(),
        is_bookmarked=True,
        name="Example",
        owner_id=uuid4(),
        slug="example",
        tags=["backend"],
        updated_at=latest_memory_at,
        visibility="private",
    )

    summary = project_summary(
        project,
        connected_models=["gpt-5"],
        event_count=12,
        latest_event_at=latest_event_at,
        latest_memory_at=latest_memory_at,
        memory_count=4,
        pending_memory_count=2,
        prompt_count=5,
        session_count=2,
        tracked_files=7,
    )

    response = ProjectSummaryResponse.model_validate(summary)
    assert response.latest_memory_at == latest_memory_at.isoformat()
    assert response.memory_count == 4
    assert response.pending_memory_count == 2
