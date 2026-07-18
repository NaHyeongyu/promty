from __future__ import annotations

from datetime import UTC, datetime, timedelta
import os
from typing import Any
from uuid import uuid4

import pytest
from sqlalchemy import event as sqlalchemy_event
from sqlalchemy.orm import Session

from app.db.session import SessionLocal, engine
from app.models.artifacts import Artifact
from app.models.projects import Project
from app.models.sessions import Session as PromptSession
from app.models.users import User
from app.services.memory.constants import (
    MEMORY_ARTIFACT_TYPE,
    MEMORY_DRAFT_ARTIFACT_TYPE,
    MEMORY_WINDOW_STRATEGY,
    PENDING_DRAFT_STAGE,
)
from app.services.memory.project_memory import list_project_memory_artifacts
from app.services.memory.windows import memory_slice_runtime_state, memory_slice_state

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


def _seed_project(db: Session) -> tuple[Project, PromptSession, datetime]:
    marker = str(uuid4())
    now = datetime.now(UTC)
    user = User(
        github_id=f"memory-read-{marker}",
        email=f"memory-read-{marker}@example.com",
        username=f"memory-read-{marker}",
    )
    project = Project(
        owner=user,
        name="Memory read query test",
        slug=f"memory-read-{marker}",
        visibility="private",
        default_branch="main",
    )
    prompt_session = PromptSession(
        project=project,
        tool="codex-cli",
        started_at=now,
    )
    db.add_all((user, project, prompt_session))
    db.flush()
    return project, prompt_session, now


def test_memory_state_and_list_queries_are_bounded_and_sql_filtered(db: Session) -> None:
    project, prompt_session, now = _seed_project(db)
    for index in range(1, 51):
        db.add(
            Artifact(
                project_id=project.id,
                session_id=prompt_session.id,
                type=MEMORY_DRAFT_ARTIFACT_TYPE,
                title=f"Slice {index}",
                summary="Bounded memory slice state.",
                storage_key=f"memory/read-test/slice/{index}",
                metadata_={
                    "artifact_stage": PENDING_DRAFT_STAGE,
                    "end_sequence": index * 10,
                    "memory_strategy": MEMORY_WINDOW_STRATEGY,
                    "review_state": "generated" if index < 50 else "draft",
                    "slice_index": index,
                },
                created_at=now + timedelta(seconds=index),
                updated_at=now + timedelta(seconds=index),
            )
        )

    for index in range(20):
        db.add(
            Artifact(
                project_id=project.id,
                session_id=prompt_session.id,
                type=MEMORY_ARTIFACT_TYPE,
                title=f"Excluded memory {index}",
                summary="This row must be filtered in SQL.",
                storage_key=f"memory/read-test/excluded/{index}",
                metadata_={
                    "artifact_stage": "internal_chunk",
                    "review_state": "generated",
                },
                created_at=now + timedelta(minutes=2, seconds=index),
                updated_at=now + timedelta(minutes=2, seconds=index),
            )
        )
    for index in range(8):
        db.add(
            Artifact(
                project_id=project.id,
                session_id=prompt_session.id,
                type=MEMORY_ARTIFACT_TYPE,
                title=f"Visible memory {index}",
                summary="This row belongs in the list.",
                storage_key=f"memory/read-test/visible/{index}",
                metadata_={
                    "artifact_stage": "generated_memory",
                    "review_state": "generated",
                },
                created_at=now + timedelta(minutes=1, seconds=index),
                updated_at=now + timedelta(minutes=1, seconds=index),
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
        state = memory_slice_state(db, prompt_session)
        runtime_state = memory_slice_runtime_state(db, prompt_session)
        memories = list_project_memory_artifacts(db, project_id=project.id, limit=5)
    finally:
        sqlalchemy_event.remove(engine, "before_cursor_execute", capture_statement)

    assert state == (500, 51)
    assert runtime_state == (500, 51, None, False)
    assert [memory.title for memory in memories] == [
        "Visible memory 7",
        "Visible memory 6",
        "Visible memory 5",
        "Visible memory 4",
        "Visible memory 3",
    ]
    assert len(statements) == 3
    assert "ORDER BY" in statements[0] and "LIMIT" in statements[0]
    assert "ORDER BY" in statements[1] and "LIMIT" in statements[1]
    assert "max(" not in statements[0].lower()
    assert "bool_or" not in statements[1]
    assert statements[2].count("artifacts.metadata ->>") == 2
