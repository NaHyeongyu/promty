from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

from fastapi import HTTPException
import pytest

import app.core.security as security
from app.core.security import require_collector_user
from app.main import app
from app.models.projects import Project
from app.models.users import User
from app.services import agent_context


class CollectorDatabaseStub:
    def __init__(self, collector_token: object | None) -> None:
        self.collector_token = collector_token
        self.flushed = False

    def scalar(self, _statement: object) -> object | None:
        return self.collector_token

    def flush(self) -> None:
        self.flushed = True


class ProjectDatabaseStub:
    def __init__(self, project: Project) -> None:
        self.project = project

    def get(self, model: type[Project], project_id: object) -> Project | None:
        if model is Project and self.project.id == project_id:
            return self.project
        return None


def _user(name: str = "owner") -> User:
    return User(
        email=f"{name}@example.com",
        github_id=f"github-{name}",
        id=uuid4(),
        username=name,
    )


def _project(owner: User) -> Project:
    return Project(
        default_branch="main",
        description="Keep AI project context current.",
        git_remote="https://github.com/example/promty.git",
        id=uuid4(),
        name="Promty",
        owner_id=owner.id,
        slug="promty",
        tags=["ai", "memory"],
        visibility="private",
    )


def _snapshot() -> dict[str, object]:
    return {
        "snapshot_type": "project_memory",
        "source_memory_ids": ["memory-1"],
        "body_markdown": "# Project Memory\n\nKeep changes small.",
        "sections": {
            "product_goal": "Keep AI context current.",
            "current_direction": "Expose existing memory read-only.",
            "core_workflow": ["Capture", "Compile", "Read"],
            "important_decisions": [],
            "rejected_directions": [],
            "technical_assumptions": ["Collector tokens are user-owned."],
            "open_questions": [],
            "instructions_for_future_ai_agents": ["Read context before editing."],
        },
        "confidence": 0.9,
        "warnings": [],
    }


def test_collector_read_auth_rejects_global_ingest_token(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        security,
        "settings",
        replace(security.settings, api_token="shared-ingest-secret"),
    )
    db = CollectorDatabaseStub(None)

    with pytest.raises(HTTPException) as exc_info:
        require_collector_user(
            authorization="Bearer shared-ingest-secret",
            x_promty_collector_version=None,
            db=db,  # type: ignore[arg-type]
        )

    assert exc_info.value.status_code == 401
    assert db.flushed is False


def test_collector_read_auth_returns_token_owner_and_tracks_usage() -> None:
    owner = _user()
    token = SimpleNamespace(
        collector_version=None,
        last_used_at=None,
        user=owner,
    )
    db = CollectorDatabaseStub(token)

    result = require_collector_user(
        authorization="Bearer user-token",
        x_promty_collector_version="0.1.4",
        db=db,  # type: ignore[arg-type]
    )

    assert result is owner
    assert token.collector_version == "0.1.4"
    assert token.last_used_at is not None
    assert db.flushed is True


def test_agent_context_reuses_latest_project_memory(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    owner = _user()
    project = _project(owner)
    updated_at = datetime(2026, 7, 17, 8, 0, tzinfo=UTC)
    artifact = SimpleNamespace(
        id=uuid4(),
        metadata_={"project_memory_snapshot": _snapshot()},
        updated_at=updated_at,
    )
    monkeypatch.setattr(
        agent_context, "get_latest_project_memory", lambda *_args, **_kwargs: artifact
    )

    result = agent_context.read_agent_project_context(
        ProjectDatabaseStub(project),  # type: ignore[arg-type]
        project_id=project.id,
        user=owner,
    )

    assert result["available"] is True
    assert result["memory_id"] == artifact.id
    assert result["updated_at"] == updated_at
    assert result["memory"] == _snapshot()
    assert result["project"]["id"] == project.id


def test_agent_context_is_owner_only(monkeypatch: pytest.MonkeyPatch) -> None:
    owner = _user("owner")
    other_user = _user("other")
    project = _project(owner)
    monkeypatch.setattr(agent_context, "get_latest_project_memory", lambda *_args, **_kwargs: None)

    with pytest.raises(HTTPException) as exc_info:
        agent_context.read_agent_project_context(
            ProjectDatabaseStub(project),  # type: ignore[arg-type]
            project_id=project.id,
            user=other_user,
        )

    assert exc_info.value.status_code == 404


def test_agent_context_api_publishes_concrete_response_model() -> None:
    schema = app.openapi()["paths"]["/api/agent/projects/{project_id}/context"]["get"]["responses"][
        "200"
    ]["content"]["application/json"]["schema"]

    assert schema["$ref"].endswith("/AgentProjectContextResponse")
