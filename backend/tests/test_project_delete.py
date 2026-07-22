from __future__ import annotations

from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.projects import router
from app.models.projects import Project
from app.models.users import User
from app.services.projects.management import delete_project


class FakeSession:
    def __init__(self, project: Project | None) -> None:
        self.project = project
        self.deleted: list[Project] = []
        self.flushed = False

    def get(self, model: type[Project], project_id: object) -> Project | None:
        if model is not Project or self.project is None or self.project.id != project_id:
            return None
        return self.project

    def delete(self, project: Project) -> None:
        self.deleted.append(project)

    def flush(self) -> None:
        self.flushed = True


def _user(username: str) -> User:
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
        name="Disposable project",
        owner_id=owner.id,
        slug="disposable-project",
        tags=[],
        visibility="private",
    )


def test_delete_project_removes_an_owned_project() -> None:
    owner = _user("owner")
    project = _project(owner)
    db = FakeSession(project)

    delete_project(db, project_id=project.id, user=owner)  # type: ignore[arg-type]

    assert db.deleted == [project]
    assert db.flushed is True


def test_delete_project_hides_an_unowned_project() -> None:
    owner = _user("owner")
    project = _project(owner)
    db = FakeSession(project)

    with pytest.raises(HTTPException) as exc_info:
        delete_project(
            db,  # type: ignore[arg-type]
            project_id=project.id,
            user=_user("other"),
        )

    assert exc_info.value.status_code == 404
    assert db.deleted == []
    assert db.flushed is False


def test_project_delete_route_returns_no_content() -> None:
    delete_route = next(
        route
        for route in router.routes
        if getattr(route, "path", None) == "/api/projects/{project_id}"
        and "DELETE" in getattr(route, "methods", set())
    )

    assert delete_route.status_code == 204


@pytest.mark.parametrize(
    ("path", "identifier"),
    [
        (
            "/api/projects/{project_id}/prompt-activities/{prompt_event_id}",
            "prompt_event_id",
        ),
        ("/api/projects/{project_id}/sessions/{session_id}", "session_id"),
    ],
)
def test_activity_delete_routes_are_project_scoped_and_return_no_content(
    path: str,
    identifier: str,
) -> None:
    delete_route = next(
        route
        for route in router.routes
        if getattr(route, "path", None) == path
        and "DELETE" in getattr(route, "methods", set())
    )

    assert delete_route.status_code == 204
    assert "project_id" in delete_route.path_format
    assert identifier in delete_route.path_format
