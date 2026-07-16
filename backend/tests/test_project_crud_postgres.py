from __future__ import annotations

from datetime import UTC, datetime
import os
from uuid import UUID, uuid4

import pytest
from sqlalchemy import event as sqlalchemy_event
from sqlalchemy.orm import Session

from app.db.session import SessionLocal, engine
from app.models.events import Event
from app.models.projects import Project
from app.models.sessions import Session as PromptSession
from app.models.users import User
from app.services.projects import management
from app.schemas.project_responses import ProjectDetailResponse
from app.services.projects.views import read_project_detail_response

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


def test_project_create_read_update_delete_round_trip(
    db: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    marker = str(uuid4())
    user = User(
        github_id=f"crud-{marker}",
        email=f"crud-{marker}@example.com",
        username=f"crud-{marker}",
    )
    db.add(user)
    db.flush()
    repository_url = f"https://github.com/promty/crud-{marker}"
    monkeypatch.setattr(
        management,
        "repository_metadata_from_url",
        lambda *_args, **_kwargs: {
            "default_branch": "main",
            "description": "Repository description",
            "html_url": repository_url,
            "name": "CRUD project",
        },
    )

    created = management.create_project_summary(
        db,
        default_branch=None,
        description=None,
        github_url=repository_url,
        name=None,
        user=user,
    )
    project_id = UUID(created["id"])

    listed = management.list_project_summaries(db, current_user=user)
    assert [project["id"] for project in listed] == [str(project_id)]
    assert listed[0]["name"] == "CRUD project"

    management.update_project_description_summary(
        db,
        description="Updated description",
        project_id=project_id,
        user=user,
    )
    updated = management.update_project_metadata_summary(
        db,
        project_id=project_id,
        project_url="https://example.com/crud",
        project_url_is_set=True,
        slug="crud-updated",
        tags=["api", "postgres"],
        user=user,
        visibility="public",
    )
    bookmarked = management.update_project_bookmark_summary(
        db,
        is_bookmarked=True,
        project_id=project_id,
        user=user,
    )
    assert updated["slug"] == "crud-updated"
    assert updated["tags"] == ["api", "postgres"]
    assert updated["visibility"] == "public"
    assert bookmarked["is_bookmarked"] is True

    project = db.get(Project, project_id)
    assert project is not None
    assert project.description == "Updated description"
    prompt_session = PromptSession(
        project=project,
        tool="codex-cli",
        started_at=datetime.now(UTC),
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
        payload={"prompt": "Verify cascading project deletion."},
        created_at=datetime.now(UTC),
    )
    files_changed_event = Event(
        id=uuid4(),
        project_id=project.id,
        session_id=prompt_session.id,
        sequence=2,
        schema_version=1,
        tool="codex-cli",
        event_type="FilesChanged",
        payload={
            "changes": [
                {"path": "frontend/src/App.tsx", "status": "modified"},
                {"path": "backend/app/main.py", "status": "modified"},
                {"path": "frontend/src/App.tsx", "status": "modified"},
            ]
        },
        created_at=datetime.now(UTC),
    )
    db.add_all((event, files_changed_event))
    db.flush()
    session_id = prompt_session.id
    event_id = event.id

    detail_statements: list[str] = []

    def capture_detail_statement(
        _connection,
        _cursor,
        statement: str,
        *_args,
    ) -> None:
        detail_statements.append(statement)

    sqlalchemy_event.listen(engine, "before_cursor_execute", capture_detail_statement)
    try:
        detail = read_project_detail_response(project.id, user, db)
    finally:
        sqlalchemy_event.remove(engine, "before_cursor_execute", capture_detail_statement)
    ProjectDetailResponse.model_validate(detail)
    assert detail["activities"][0]["files_changed"] == 2
    assert len(detail_statements) <= 7

    management.delete_project(db, project_id=project.id, user=user)
    db.expire_all()

    assert db.get(Project, project.id) is None
    assert db.get(PromptSession, session_id) is None
    assert db.get(Event, event_id) is None
