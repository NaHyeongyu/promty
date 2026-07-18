from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from app.models.projects import Project
from app.schemas.projects import ProjectMetadataUpdateRequest, ProjectSummaryResponse
from app.services.projects.management import project_summary
from app.services.projects.views import normalize_github_url


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
        project_url="www.google.com",
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
    assert response.memory_grouping_mode == "session"
    assert response.pending_memory_count == 2
    assert response.project_url == "www.google.com"


def test_project_metadata_preserves_external_url_without_adding_a_host() -> None:
    payload = ProjectMetadataUpdateRequest(project_url="  www.google.com  ")

    assert payload.project_url == "www.google.com"
    assert "project_url" in payload.model_fields_set


def test_project_metadata_allows_clearing_external_url() -> None:
    payload = ProjectMetadataUpdateRequest(project_url="   ")

    assert payload.project_url is None
    assert "project_url" in payload.model_fields_set


def test_project_metadata_validates_memory_grouping_mode() -> None:
    payload = ProjectMetadataUpdateRequest(memory_grouping_mode="chronological")

    assert payload.memory_grouping_mode == "chronological"


def test_public_project_routes_publish_read_only_contracts() -> None:
    from app.main import app

    paths = app.openapi()["paths"]

    assert set(paths["/api/projects/public"]) == {"get"}
    assert set(paths["/api/projects/public/{project_id}"]) == {"get"}
    assert set(paths["/api/projects/public/{project_id}/save"]) == {"patch"}
    assert set(paths["/api/projects/public/{project_id}/view"]) == {"post"}


def test_github_remote_normalization_removes_url_credentials_and_query_data() -> None:
    assert (
        normalize_github_url("https://github.com/promty/example.git?token=private#fragment")
        == "https://github.com/promty/example"
    )
    assert normalize_github_url("https://user:secret@github.com/promty/example") is None
    assert normalize_github_url("https://example.com/promty/example") is None
    assert normalize_github_url("https://github.com/promty/example/issues") is None
