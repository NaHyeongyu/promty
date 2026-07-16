from __future__ import annotations

from datetime import datetime, timedelta, timezone
import os
from uuid import uuid4

import pytest
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.admin_audit_logs import AdminAuditLog
from app.models.artifacts import Artifact
from app.models.events import Event
from app.models.github_connections import GitHubConnection
from app.models.projects import Project
from app.models.project_memory_batches import ProjectMemoryBatch
from app.models.sessions import Session as PromptSession
from app.models.tokens import CollectorToken
from app.models.users import User
from app.services.admin.control_center import (
    admin_audit_logs_response,
    admin_projects_response,
    admin_users_response,
    disconnect_admin_github_response,
    revoke_all_admin_collector_tokens_response,
)
from app.services.admin.operations import admin_memory_jobs_response
from app.services.memory.constants import MEMORY_ARTIFACT_TYPE

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


def test_control_center_inventory_and_security_actions(db: Session) -> None:
    marker = str(uuid4())
    now = datetime.now(timezone.utc)
    user = User(
        github_id=f"control-center-{marker}",
        email=f"control-center-{marker}@example.com",
        username=f"control-center-{marker}",
        created_at=now,
        updated_at=now,
    )
    project = Project(
        owner=user,
        name="Control center project",
        slug=f"control-center-{marker}",
        visibility="private",
        git_remote="https://github.com/promty/control-center",
        created_at=now,
        updated_at=now,
    )
    prompt_session = PromptSession(
        project=project,
        model="gpt-5",
        started_at=now,
        tool="codex-cli",
    )
    db.add_all((user, project, prompt_session))
    db.flush()
    token = CollectorToken(
        name="Control center collector",
        token_hash=f"control-center-token-{marker}",
        user_id=user.id,
    )
    connection = GitHubConnection(
        access_token_encrypted=f"control-center-encrypted-{marker}",
        scopes="repo,read:user",
        user_id=user.id,
    )
    db.add_all(
        (
            token,
            connection,
            Event(
                id=uuid4(),
                project_id=project.id,
                session_id=prompt_session.id,
                sequence=1,
                schema_version=1,
                tool="codex-cli",
                event_type="PromptSubmitted",
                payload={},
                created_at=now,
            ),
            Artifact(
                project_id=project.id,
                session_id=prompt_session.id,
                type=MEMORY_ARTIFACT_TYPE,
                title="Control center memory",
                storage_key=f"control-center/{marker}",
                created_at=now,
                updated_at=now,
            ),
            ProjectMemoryBatch(
                idempotency_key=f"control-center-{marker}",
                project_id=project.id,
                requested_by_user_id=user.id,
                source_session_ids=[str(prompt_session.id)],
                status="pending",
                created_at=now - timedelta(hours=1),
                updated_at=now - timedelta(hours=1),
            ),
            AdminAuditLog(
                actor_user_id=user.id,
                actor_github_id=user.github_id,
                actor_username=user.username,
                action="admin.control_center.test",
                resource_type="user",
                resource_id=str(user.id),
                request_method="GET",
                request_path="/api/admin/users",
                status_code=200,
                created_at=now,
            ),
        )
    )
    db.flush()

    users = admin_users_response(db, limit=200, offset=0, query=marker)
    projects = admin_projects_response(db, limit=200, offset=0, query=marker)
    jobs = admin_memory_jobs_response(db, job_status="stale", limit=200, offset=0)
    audit = admin_audit_logs_response(db, limit=200, offset=0)

    managed_user = next(item for item in users["items"] if item["id"] == str(user.id))
    managed_project = next(item for item in projects["items"] if item["id"] == str(project.id))
    managed_job = next(item for item in jobs["items"] if item["project"]["id"] == str(project.id))
    assert managed_user["active_collector_tokens"] == 1
    assert managed_user["github"]["connected"] is True
    assert managed_user["counts"]["prompts"] == 1
    assert managed_project["memory_count"] == 1
    assert managed_project["prompt_count"] == 1
    assert managed_job["stale"] is True
    assert any(item["action"] == "admin.control_center.test" for item in audit["items"])

    revoked = revoke_all_admin_collector_tokens_response(
        db,
        confirmation=user.username,
        user_id=user.id,
    )
    disconnected = disconnect_admin_github_response(
        db,
        confirmation=user.username,
        user_id=user.id,
    )
    assert revoked["revoked"] == 1
    assert disconnected["disconnected"] is True
    assert token.revoked_at is not None
    assert connection.revoked_at is not None
