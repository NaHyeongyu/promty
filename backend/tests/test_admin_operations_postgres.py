from __future__ import annotations

from datetime import datetime, timezone
import os
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.schemas.account import CollectorTokenCreateResponse
from app.schemas.admin_responses import (
    AdminCancelJobResponse,
    AdminDeleteProjectResponse,
    AdminDeleteUserResponse,
    AdminEventPageResponse,
    AdminJobResponse,
    AdminPageResponse,
    AdminProjectMutationResponse,
    AdminRestoreUserResponse,
    AdminRetryJobResponse,
    AdminSuspendUserResponse,
    AdminSystemResponse,
)
from app.models.artifact_versions import ArtifactVersion
from app.models.artifacts import Artifact
from app.models.events import Event
from app.models.project_memory_batches import ProjectMemoryBatch, ProjectMemoryBatchItem
from app.models.projects import Project
from app.models.sessions import Session as PromptSession
from app.models.tokens import CollectorToken
from app.models.users import User
from app.services.admin.operations import (
    admin_events_response,
    admin_memory_jobs_response,
    admin_system_response,
    cancel_admin_memory_job_response,
    create_admin_collector_token_response,
    create_admin_project_response,
    delete_admin_project_response,
    delete_admin_user_response,
    export_admin_events_response,
    export_admin_project_response,
    restore_admin_user_response,
    retry_admin_memory_job_response,
    suspend_admin_user_response,
    update_admin_project_response,
)
from app.services.memory.constants import MEMORY_DRAFT_ARTIFACT_TYPE

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


def _user(marker: str, role: str) -> User:
    return User(
        email=f"admin-ops-{role}-{marker}@example.com",
        github_id=f"admin-ops-{role}-{marker}",
        username=f"admin-ops-{role}-{marker}",
    )


def test_admin_user_lifecycle_and_token_issue(db: Session) -> None:
    marker = str(uuid4())
    actor = _user(marker, "actor")
    managed = _user(marker, "managed")
    db.add_all((actor, managed))
    db.flush()

    suspended = suspend_admin_user_response(
        db,
        actor=actor,
        confirmation=managed.username,
        reason="Compromised workstation under investigation",
        user_id=managed.id,
    )
    AdminSuspendUserResponse.model_validate(suspended)
    assert suspended["status"] == "suspended"
    assert managed.suspended_at is not None

    restored = restore_admin_user_response(
        db,
        actor=actor,
        confirmation=managed.username,
        user_id=managed.id,
    )
    AdminRestoreUserResponse.model_validate(restored)
    assert restored["status"] == "active"
    assert managed.suspended_at is None

    issued = create_admin_collector_token_response(
        db,
        confirmation=managed.username,
        name="Operations collector",
        user_id=managed.id,
    )
    CollectorTokenCreateResponse.model_validate(issued)
    assert issued["token"].startswith("ph_")
    token = db.scalar(select(CollectorToken).where(CollectorToken.user_id == managed.id))
    assert token is not None
    assert token.name == "Operations collector"
    assert token.token_hash != issued["token"]


def test_admin_project_crud_events_export_and_safe_job_control(db: Session) -> None:
    marker = str(uuid4())
    owner = _user(marker, "owner")
    db.add(owner)
    db.flush()

    created = create_admin_project_response(
        db,
        confirmation=owner.username,
        default_branch="main",
        description="Full control center integration fixture",
        github_url="https://github.com/promty/admin-operations",
        name="Admin operations fixture",
        owner_id=owner.id,
        project_url="https://example.test/admin-operations",
        requested_slug=f"admin-ops-{marker}",
        tags=["Admin", "Operations"],
        visibility="private",
    )
    AdminProjectMutationResponse.model_validate(created)
    project_id = created["id"]
    project = db.get(Project, project_id)
    assert project is not None

    updated = update_admin_project_response(
        db,
        confirmation=project.slug,
        fields={"description": None, "name": "Admin operations updated", "visibility": "public"},
        project_id=project.id,
    )
    AdminProjectMutationResponse.model_validate(updated)
    assert updated["name"] == "Admin operations updated"
    assert updated["description"] is None
    assert updated["visibility"] == "public"

    prompt_session = PromptSession(
        project_id=project.id,
        model="gpt-5",
        started_at=datetime.now(timezone.utc),
        tool="codex-cli",
    )
    db.add(prompt_session)
    db.flush()
    event = Event(
        id=uuid4(),
        project_id=project.id,
        session_id=prompt_session.id,
        sequence=1,
        schema_version=1,
        tool="codex-cli",
        event_type="PromptSubmitted",
        payload={"prompt": "control center searchable payload"},
    )
    batch = ProjectMemoryBatch(
        idempotency_key=f"admin-ops-{marker}",
        project_id=project.id,
        requested_by_user_id=owner.id,
        source_session_ids=[str(prompt_session.id)],
        status="pending",
    )
    draft = Artifact(
        project_id=project.id,
        session_id=prompt_session.id,
        type=MEMORY_DRAFT_ARTIFACT_TYPE,
        title="Pending draft",
        storage_key=f"admin-ops/{marker}/draft",
    )
    db.add_all((event, batch, draft))
    db.flush()
    version = ArtifactVersion(
        artifact_id=draft.id,
        project_id=project.id,
        session_id=prompt_session.id,
        title=draft.title,
        version=1,
    )
    db.add(version)
    db.flush()
    db.add(
        ProjectMemoryBatchItem(
            batch_id=batch.id,
            draft_id=draft.id,
            draft_version_id=version.id,
            ordinal=1,
            source_session_id=prompt_session.id,
        )
    )
    db.flush()

    events = admin_events_response(
        db,
        event_type=None,
        limit=100,
        offset=0,
        project_id=project.id,
        query="searchable payload",
        user_id=None,
    )
    AdminEventPageResponse.model_validate(events)
    assert events["total"] == 1
    assert events["items"][0]["payload"]["prompt"] == "control center searchable payload"
    event_export = export_admin_events_response(
        db,
        event_type=None,
        project_id=project.id,
        query=None,
        user_id=None,
    )
    project_export = export_admin_project_response(
        db,
        confirmation=project.slug,
        include_payloads=True,
        project_id=project.id,
    )
    assert event_export["items"][0]["id"] == str(event.id)
    assert project_export["events"][0]["payload"]["prompt"] == "control center searchable payload"

    listed = admin_memory_jobs_response(db, job_status=None, limit=200, offset=0)
    AdminPageResponse[AdminJobResponse].model_validate(listed)
    listed_batch = next(item for item in listed["items"] if item["id"] == str(batch.id))
    assert listed_batch["cancellable"] is True
    cancelled = cancel_admin_memory_job_response(
        db,
        batch_id=batch.id,
        confirmation=project.slug,
    )
    AdminCancelJobResponse.model_validate(cancelled)
    assert cancelled["retryable"] is True
    retried = retry_admin_memory_job_response(
        db,
        batch_id=batch.id,
        confirmation=project.slug,
    )
    AdminRetryJobResponse.model_validate(retried)
    assert retried["status"] == "pending"

    deleted = delete_admin_project_response(
        db,
        confirmation=project.slug,
        project_id=project.id,
    )
    AdminDeleteProjectResponse.model_validate(deleted)
    assert deleted["counts"] == {"artifacts": 1, "events": 1, "sessions": 1}
    assert db.get(Project, project.id) is None


def test_admin_system_telemetry_and_user_owned_data_cascade(db: Session) -> None:
    marker = str(uuid4())
    actor = _user(marker, "cascade-actor")
    managed = _user(marker, "cascade-managed")
    project = Project(
        name="Cascade fixture",
        owner=managed,
        slug=f"cascade-{marker}",
        visibility="private",
    )
    db.add_all((actor, managed, project))
    db.flush()
    managed_id = managed.id
    project_id = project.id

    telemetry = admin_system_response(db)
    AdminSystemResponse.model_validate(telemetry)
    assert telemetry["database"]["dialect"] == "postgresql"
    assert telemetry["database"]["migration"] == "0037_weekly_project_popularity"
    assert telemetry["runtime"]["uptime_seconds"] >= 0

    deleted = delete_admin_user_response(
        db,
        actor=actor,
        confirmation=managed.username,
        user_id=managed.id,
    )
    AdminDeleteUserResponse.model_validate(deleted)
    assert deleted["counts"]["projects"] == 1
    assert db.get(User, managed_id) is None
    assert db.get(Project, project_id) is None
