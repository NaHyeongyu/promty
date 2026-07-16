from __future__ import annotations

from datetime import datetime, timedelta, timezone
import os
from typing import Any
from uuid import uuid4

import pytest
from sqlalchemy import event as sqlalchemy_event
from sqlalchemy.orm import Session

from app.db.session import SessionLocal, engine
from app.models.artifacts import Artifact
from app.models.events import Event
from app.models.github_connections import GitHubConnection
from app.models.project_files import ProjectFile
from app.models.project_memory_batches import ProjectMemoryBatch
from app.models.projects import Project
from app.models.sessions import Session as PromptSession
from app.models.tokens import CollectorToken
from app.models.users import User
from app.schemas.admin_responses import AdminOverviewResponse
from app.services.admin.dashboard import admin_overview_response
from app.services.memory.constants import (
    MEMORY_ARTIFACT_TYPE,
    MEMORY_DRAFT_ARTIFACT_TYPE,
    PENDING_DRAFT_STAGE,
    REVIEW_STATE_DRAFT,
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


def _seed_dashboard_rows(db: Session) -> tuple[User, Project, datetime]:
    marker = str(uuid4())
    now = datetime.now(timezone.utc) + timedelta(seconds=1)
    user = User(
        github_id=f"admin-dashboard-{marker}",
        email=f"admin-dashboard-{marker}@example.com",
        username=f"admin-dashboard-{marker}",
        created_at=now,
        updated_at=now,
    )
    project = Project(
        owner=user,
        name="Admin dashboard query test",
        slug=f"admin-dashboard-{marker}",
        description="A synthetic project for the admin dashboard integration test.",
        tags=["admin", "performance"],
        visibility="private",
        git_remote="https://github.com/promty/admin-dashboard-query-test",
        default_branch="main",
        created_at=now,
        updated_at=now,
    )
    session = PromptSession(
        project=project,
        tool="codex-cli",
        model="gpt-5",
        started_at=now,
    )
    db.add_all((user, project, session))
    db.flush()

    events = [
        Event(
            id=uuid4(),
            project_id=project.id,
            session_id=session.id,
            sequence=sequence,
            schema_version=1,
            tool="codex-cli",
            event_type=event_type,
            payload={"large_unused_value": "x" * 50_000},
            created_at=now + timedelta(seconds=sequence),
        )
        for sequence, event_type in enumerate(
            ("PromptSubmitted", "ResponseReceived", "FilesChanged"),
            start=1,
        )
    ]
    memory_artifact = Artifact(
        project_id=project.id,
        session_id=session.id,
        type=MEMORY_ARTIFACT_TYPE,
        title="Recent generated memory",
        summary="A compact dashboard summary.",
        storage_key=f"memory/test/{marker}",
        changed_files=[{"path": "one.py"}, {"path": "two.py"}],
        metadata_={"artifact_stage": "generated_memory", "review_state": "generated"},
        created_at=now,
        updated_at=now,
    )
    pending_draft = Artifact(
        project_id=project.id,
        session_id=session.id,
        type=MEMORY_DRAFT_ARTIFACT_TYPE,
        title="Pending memory",
        summary="Waiting to be organized.",
        storage_key=f"memory/pending/{marker}",
        metadata_={
            "artifact_stage": PENDING_DRAFT_STAGE,
            "review_state": REVIEW_STATE_DRAFT,
        },
        created_at=now,
        updated_at=now,
    )
    db.add_all(
        (
            *events,
            memory_artifact,
            pending_draft,
            ProjectFile(
                project_id=project.id,
                path="backend/app/services/admin/dashboard.py",
                status="active",
                changed_at=now,
                created_at=now,
                updated_at=now,
            ),
            CollectorToken(
                user_id=user.id,
                token_hash=f"dashboard-token-{marker}",
                name="Dashboard test token",
                created_at=now,
            ),
            GitHubConnection(
                user_id=user.id,
                access_token_encrypted=f"dashboard-encrypted-token-{marker}",
                created_at=now,
                updated_at=now,
            ),
            ProjectMemoryBatch(
                idempotency_key=f"dashboard-failed-{marker}",
                project_id=project.id,
                requested_by_user_id=user.id,
                source_session_ids=[str(session.id)],
                status="failed",
                error_code="test",
                error_message="Dashboard integration failure",
                created_at=now,
                updated_at=now,
                completed_at=now,
            ),
            ProjectMemoryBatch(
                idempotency_key=f"dashboard-pending-{marker}",
                project_id=project.id,
                requested_by_user_id=user.id,
                source_session_ids=[str(session.id)],
                status="pending",
                created_at=now - timedelta(hours=1),
                updated_at=now - timedelta(hours=1),
            ),
        )
    )
    db.flush()
    return user, project, now


def test_admin_overview_uses_eight_statements_and_preserves_contract(db: Session) -> None:
    baseline = admin_overview_response(db)
    user, project, _now = _seed_dashboard_rows(db)
    statements: list[str] = []

    def capture_statement(
        _connection: Any,
        _cursor: Any,
        statement: str,
        _parameters: Any,
        _context: Any,
        _executemany: bool,
    ) -> None:
        statements.append(statement)

    sqlalchemy_event.listen(engine, "before_cursor_execute", capture_statement)
    try:
        response = admin_overview_response(db)
    finally:
        sqlalchemy_event.remove(engine, "before_cursor_execute", capture_statement)

    AdminOverviewResponse.model_validate(response)

    assert len(statements) == 8
    assert set(response) == {
        "action_items",
        "ai_activity",
        "breakdowns",
        "generated_at",
        "memory_monitor",
        "metrics",
        "project_monitor",
        "recent_admin_audit_logs",
        "recent_events",
        "recent_projects",
        "recent_users",
        "risks",
        "system",
    }
    assert set(response["metrics"]) == set(baseline["metrics"])
    assert set(response["memory_monitor"]) == set(baseline["memory_monitor"])
    assert set(response["ai_activity"]) == set(baseline["ai_activity"])
    assert set(response["project_monitor"]) == set(baseline["project_monitor"])
    assert set(response["breakdowns"]) == set(baseline["breakdowns"])

    expected_increments = {
        "active_collector_tokens": 1,
        "events": 3,
        "events_24h": 3,
        "events_7d": 3,
        "failed_jobs": 1,
        "github_connections": 1,
        "memory_artifacts": 1,
        "memory_artifacts_24h": 1,
        "pending_jobs": 1,
        "pending_memory_drafts": 1,
        "projects": 1,
        "prompts": 1,
        "prompts_24h": 1,
        "responses": 1,
        "responses_24h": 1,
        "sessions": 1,
        "stale_jobs": 1,
        "tracked_files": 1,
        "users": 1,
    }
    for key, increment in expected_increments.items():
        assert response["metrics"][key] == baseline["metrics"][key] + increment

    assert response["recent_projects"][0]["id"] == str(project.id)
    assert response["recent_projects"][0]["counts"] == {
        "events": 3,
        "files": 1,
        "memory": 1,
        "prompts": 1,
        "sessions": 1,
    }
    assert response["recent_users"][0]["id"] == str(user.id)
    assert response["recent_users"][0]["github_connected"] is True
    assert response["memory_monitor"]["pending_projects"] == (
        baseline["memory_monitor"]["pending_projects"] + 1
    )
    assert response["memory_monitor"]["recent_artifacts"][0]["changed_file_count"] == 2

    recent_event_statement = next(
        statement
        for statement in statements
        if "FROM events ORDER BY events.created_at DESC" in statement
    )
    assert "events.payload" not in recent_event_statement
    recent_memory_statement = next(
        statement for statement in statements if "jsonb_array_length" in statement
    )
    assert "artifacts.metadata" not in recent_memory_statement
    assert "artifacts.sections" not in recent_memory_statement
