from __future__ import annotations

from datetime import UTC, datetime
import os
from uuid import uuid4

import pytest
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.events import Event
from app.models.project_files import ProjectFile
from app.models.project_stats import ProjectStats
from app.models.projects import Project
from app.models.sessions import Session as PromptSession
from app.models.users import User
from app.services.projects.stats import count_project_stats_drift, reconcile_project_stats


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


def test_reconcile_project_stats_repairs_drift(db: Session) -> None:
    marker = str(uuid4())
    now = datetime.now(UTC)
    user = User(
        github_id=f"stats-{marker}",
        email=f"stats-{marker}@example.com",
        username=f"stats-{marker}",
    )
    project = Project(
        owner=user,
        name="Stats repair",
        slug=f"stats-{marker}",
        default_branch="main",
        visibility="private",
    )
    prompt_session = PromptSession(project=project, tool="codex-cli", started_at=now)
    db.add_all((user, project, prompt_session))
    db.flush()
    db.add_all(
        (
            Event(
                id=uuid4(),
                project_id=project.id,
                session_id=prompt_session.id,
                sequence=1,
                schema_version=1,
                tool="codex-cli",
                event_type="PromptSubmitted",
                payload={"prompt": "Repair project statistics."},
                created_at=now,
            ),
            Event(
                id=uuid4(),
                project_id=project.id,
                session_id=prompt_session.id,
                sequence=2,
                schema_version=1,
                tool="codex-cli",
                event_type="ResponseReceived",
                payload={"response": "Done."},
                created_at=now,
            ),
            ProjectFile(
                project_id=project.id,
                path="frontend/src/App.tsx",
                status="active",
                changed_at=now,
            ),
        )
    )
    db.flush()
    db.add(
        ProjectStats(
            project_id=project.id,
            session_count=99,
            event_count=99,
            prompt_count=99,
            tracked_files=99,
        )
    )
    db.flush()

    assert count_project_stats_drift(db) >= 1
    assert reconcile_project_stats(db) >= 1
    db.flush()

    stats = db.get(ProjectStats, project.id)
    assert stats is not None
    db.refresh(stats)
    assert stats.session_count == 1
    assert stats.event_count == 2
    assert stats.prompt_count == 1
    assert stats.tracked_files == 1
    assert stats.latest_event_at == now
    assert count_project_stats_drift(db) == 0
