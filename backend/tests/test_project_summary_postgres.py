from __future__ import annotations

from datetime import UTC, datetime
import os
from typing import Any
from uuid import uuid4

import pytest
from sqlalchemy import event as sqlalchemy_event
from sqlalchemy.orm import Session

from app.db.session import SessionLocal, engine
from app.models.artifacts import Artifact
from app.models.events import Event
from app.models.project_files import ProjectFile
from app.models.projects import Project
from app.models.sessions import Session as PromptSession
from app.models.users import User
from app.services.projects.management import project_summary_with_counts

pytestmark = pytest.mark.skipif(
    os.environ.get("PROMTY_RUN_POSTGRES_TESTS") != "1",
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


def test_project_mutation_summary_uses_one_aggregate_statement(db: Session) -> None:
    marker = str(uuid4())
    now = datetime.now(UTC)
    user = User(
        github_id=f"summary-{marker}",
        email=f"summary-{marker}@example.com",
        username=f"summary-{marker}",
    )
    project = Project(
        owner=user,
        name="Summary query test",
        slug=f"summary-{marker}",
        visibility="private",
        default_branch="main",
    )
    first_session = PromptSession(
        project=project,
        tool="codex-cli",
        model="gpt-5",
        started_at=now,
    )
    second_session = PromptSession(
        project=project,
        tool="claude-code",
        model="claude-sonnet",
        started_at=now,
    )
    db.add_all((user, project, first_session, second_session))
    db.flush()
    db.add_all(
        (
            Event(
                id=uuid4(),
                project_id=project.id,
                session_id=first_session.id,
                sequence=1,
                schema_version=1,
                tool="codex-cli",
                event_type="PromptSubmitted",
                payload={"prompt": "Measure the summary query."},
                created_at=now,
            ),
            Event(
                id=uuid4(),
                project_id=project.id,
                session_id=first_session.id,
                sequence=2,
                schema_version=1,
                tool="codex-cli",
                event_type="ResponseReceived",
                payload={"response": "Done."},
                created_at=now,
            ),
            ProjectFile(
                project_id=project.id,
                path="backend/app/services/projects/management.py",
                status="active",
                changed_at=now,
            ),
            Artifact(
                project_id=project.id,
                session_id=first_session.id,
                type="MemoryTask",
                title="Generated summary",
                summary="The aggregate query was consolidated.",
                storage_key=f"memory/summary/{marker}",
                metadata_={
                    "artifact_stage": "generated_memory",
                    "review_state": "generated",
                },
                created_at=now,
                updated_at=now,
            ),
            Artifact(
                project_id=project.id,
                session_id=first_session.id,
                type="MemoryDraft",
                title="Pending summary",
                summary="Pending work.",
                storage_key=f"memory/summary/pending/{marker}",
                metadata_={
                    "artifact_stage": "pending_draft",
                    "review_state": "draft",
                },
                created_at=now,
                updated_at=now,
            ),
        )
    )
    db.flush()
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
        summary = project_summary_with_counts(db, project)
    finally:
        sqlalchemy_event.remove(engine, "before_cursor_execute", capture_statement)

    assert len(statements) == 1
    assert summary["sessions"] == 2
    assert summary["events"] == 2
    assert summary["prompts"] == 1
    assert summary["tracked_files"] == 1
    assert summary["memory_count"] == 1
    assert summary["pending_memory_count"] == 1
    assert summary["connected_models"] == ["claude-sonnet", "gpt-5"]
