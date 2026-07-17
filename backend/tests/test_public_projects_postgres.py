from __future__ import annotations

from datetime import UTC, datetime, timedelta
import os
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.events import Event
from app.models.projects import Project
from app.models.sessions import Session as PromptSession
from app.models.users import User
from app.schemas.project_responses import (
    PublicProjectDetailResponse,
    PublicProjectListResponse,
    PublicProfileResponse,
)
from app.services.projects.public import (
    list_public_project_summaries,
    read_public_project_detail_response,
    read_public_profile_response,
)

pytestmark = pytest.mark.skipif(
    os.environ.get("PROMPTHUB_RUN_POSTGRES_TESTS") != "1",
    reason="PostgreSQL integration tests are disabled",
)


@pytest.fixture
def db() -> Session:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


def test_public_project_list_and_read_only_detail_are_visible_to_other_users(
    db: Session,
) -> None:
    marker = str(uuid4())
    now = datetime.now(UTC)
    owner = User(
        avatar_url="https://avatars.example.test/owner.png",
        email=f"public-owner-{marker}@example.com",
        github_id=f"public-owner-{marker}",
        username=f"public-owner-{marker}",
    )
    viewer = User(
        email=f"public-viewer-{marker}@example.com",
        github_id=f"public-viewer-{marker}",
        username=f"public-viewer-{marker}",
    )
    public_project = Project(
        created_at=now - timedelta(days=2),
        default_branch="main",
        description="A searchable public collaboration project",
        git_remote="https://github.com/promty/public-project",
        name="Public collaboration project",
        owner=owner,
        project_url="javascript:alert(1)",
        slug=f"public-collaboration-{marker}",
        tags=["public", "collaboration"],
        updated_at=now,
        visibility="public",
    )
    private_project = Project(
        name="Private control project",
        owner=owner,
        slug=f"private-control-{marker}",
        visibility="private",
    )
    prompt_session = PromptSession(
        model="gpt-5",
        project=public_project,
        started_at=now,
        tool="codex-cli",
    )
    db.add_all((owner, viewer, public_project, private_project, prompt_session))
    db.flush()
    db.add(
        Event(
            id=uuid4(),
            created_at=now,
            event_type="PromptSubmitted",
            payload={"prompt": "This raw prompt must not appear in the public summary."},
            project_id=public_project.id,
            schema_version=1,
            sequence=1,
            session_id=prompt_session.id,
            tool="codex-cli",
        )
    )
    db.flush()

    listed = list_public_project_summaries(
        db,
        current_user=viewer,
        limit=24,
        offset=0,
        query="collaboration",
        sort="recent",
    )
    PublicProjectListResponse.model_validate(listed)
    listed_ids = {item["id"] for item in listed["items"]}
    assert str(public_project.id) in listed_ids
    assert str(private_project.id) not in listed_ids
    item = next(item for item in listed["items"] if item["id"] == str(public_project.id))
    assert item["owner"]["username"] == owner.username
    assert item["is_owner"] is False
    assert item["project_url"] is None
    assert item["prompts"] == 1
    assert "raw prompt" not in str(item).lower()
    assert "email" not in item["owner"]

    profile = read_public_profile_response(
        db,
        current_user=viewer,
        user_id=owner.id,
        limit=24,
        offset=0,
    )
    PublicProfileResponse.model_validate(profile)
    assert profile["profile"]["username"] == owner.username
    assert profile["total"] == 1
    assert [project["id"] for project in profile["items"]] == [str(public_project.id)]
    assert str(private_project.id) not in {project["id"] for project in profile["items"]}
    assert "email" not in profile["profile"]

    detail = read_public_project_detail_response(
        db,
        current_user=viewer,
        project_id=public_project.id,
    )
    PublicProjectDetailResponse.model_validate(detail)
    assert detail["is_owner"] is False
    assert detail["owner"]["username"] == owner.username
    assert detail["project"]["visibility"] == "public"
    assert detail["project"]["project_url"] is None
    assert detail["prompt_activities"] == []
    assert detail["files"] == []
    assert "raw prompt" not in str(detail).lower()

    owner_detail = read_public_project_detail_response(
        db,
        current_user=owner,
        project_id=public_project.id,
    )
    assert owner_detail["is_owner"] is True

    with pytest.raises(HTTPException) as private_error:
        read_public_project_detail_response(
            db,
            current_user=viewer,
            project_id=private_project.id,
        )
    assert private_error.value.status_code == 404

    public_project.visibility = "private"
    db.flush()
    hidden_profile = read_public_profile_response(
        db,
        current_user=viewer,
        user_id=owner.id,
        limit=24,
        offset=0,
    )
    assert hidden_profile["items"] == []
    assert hidden_profile["total"] == 0
    with pytest.raises(HTTPException) as hidden_detail_error:
        read_public_project_detail_response(
            db,
            current_user=viewer,
            project_id=public_project.id,
        )
    assert hidden_detail_error.value.status_code == 404
