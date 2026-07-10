from __future__ import annotations

from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.models.projects import Project
from app.models.users import User
from app.services import memory_workflows, project_views
from app.services.memory_workflows import project_for_user as memory_project_for_user
from app.services.project_views import project_for_user as detail_project_for_user


class FakeSession:
    def __init__(self, project: Project | None) -> None:
        self.project = project

    def get(self, model: type[Project], project_id: object) -> Project | None:
        if model is not Project or self.project is None or self.project.id != project_id:
            return None
        return self.project


def _user(*, username: str = "member") -> User:
    return User(
        email=f"{username}@example.com",
        github_id=f"github-{username}",
        id=uuid4(),
        username=username,
    )


def _project(owner: User) -> Project:
    return Project(
        default_branch="main",
        id=uuid4(),
        name="Owner Project",
        owner_id=owner.id,
        slug="owner-project",
        tags=[],
        visibility="private",
    )


def test_project_detail_lookup_allows_admin_read_for_unowned_project(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        project_views,
        "is_admin_user",
        lambda user: user.username == "admin",
    )
    owner = _user(username="owner")
    admin = _user(username="admin")
    project = _project(owner)

    assert (
        detail_project_for_user(
            FakeSession(project),
            project.id,
            admin,
            allow_admin=True,
        )
        is project
    )


def test_project_detail_lookup_keeps_non_admin_unowned_project_hidden(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        project_views,
        "is_admin_user",
        lambda user: user.username == "admin",
    )
    owner = _user(username="owner")
    member = _user(username="member")
    project = _project(owner)

    with pytest.raises(HTTPException) as exc_info:
        detail_project_for_user(
            FakeSession(project),
            project.id,
            member,
            allow_admin=True,
        )

    assert exc_info.value.status_code == 404


def test_memory_project_lookup_is_owner_only_by_default(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        memory_workflows,
        "is_admin_user",
        lambda user: user.username == "admin",
    )
    owner = _user(username="owner")
    admin = _user(username="admin")
    project = _project(owner)

    with pytest.raises(HTTPException) as exc_info:
        memory_project_for_user(FakeSession(project), project.id, admin)

    assert exc_info.value.status_code == 404
