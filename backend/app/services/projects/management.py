from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import case, desc, func, nullslast, select
from sqlalchemy.orm import Session

from app.models.events import Event
from app.models.project_files import ProjectFile
from app.models.projects import Project
from app.models.sessions import Session as PromptSession
from app.models.users import User
from app.services.github_repositories import repository_metadata_from_url
from app.services.projects.views import (
    iso,
    model_name,
    normalize_github_url,
    project_for_user,
)


def slugify_project_name(name: str) -> str:
    import re

    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug[:255] or "project"


def project_summary(
    project: Project,
    *,
    connected_models: list[str] | tuple[str, ...] = (),
    event_count: int = 0,
    latest_event_at: Any = None,
    prompt_count: int = 0,
    session_count: int = 0,
    tracked_files: int = 0,
) -> dict[str, Any]:
    return {
        "id": str(project.id),
        "slug": project.slug,
        "name": project.name,
        "git_remote": project.git_remote,
        "github_url": normalize_github_url(project.git_remote),
        "default_branch": project.default_branch,
        "created_at": project.created_at.isoformat(),
        "is_bookmarked": bool(project.is_bookmarked),
        "tags": project.tags or [],
        "visibility": project.visibility,
        "connected_models": sorted(connected_models),
        "sessions": int(session_count or 0),
        "events": int(event_count or 0),
        "prompts": int(prompt_count or 0),
        "tracked_files": int(tracked_files or 0),
        "latest_event_at": latest_event_at.isoformat() if latest_event_at else None,
        "updated_at": project.updated_at.isoformat(),
    }


def project_summary_with_counts(db: Session, project: Project) -> dict[str, Any]:
    session_count = (
        db.scalar(
            select(func.count())
            .select_from(PromptSession)
            .where(PromptSession.project_id == project.id)
        )
        or 0
    )
    event_count = (
        db.scalar(select(func.count()).select_from(Event).where(Event.project_id == project.id))
        or 0
    )
    latest_event_at = db.scalar(
        select(func.max(Event.created_at)).where(Event.project_id == project.id)
    )
    prompt_count = (
        db.scalar(
            select(func.count())
            .select_from(Event)
            .where(Event.project_id == project.id, Event.event_type == "PromptSubmitted")
        )
        or 0
    )
    tracked_files = (
        db.scalar(
            select(func.count())
            .select_from(ProjectFile)
            .where(ProjectFile.project_id == project.id, ProjectFile.status != "deleted")
        )
        or 0
    )
    sessions = list(
        db.execute(
            select(PromptSession.model).where(PromptSession.project_id == project.id)
        ).all()
    )
    return project_summary(
        project,
        connected_models=[
            model
            for (session_model,) in sessions
            if (model := model_name(session_model)) is not None
        ],
        event_count=event_count,
        latest_event_at=latest_event_at,
        prompt_count=prompt_count,
        session_count=session_count,
        tracked_files=tracked_files,
    )


def list_project_summaries(db: Session, *, current_user: User) -> list[dict[str, Any]]:
    owned_project_ids = select(Project.id).where(Project.owner_id == current_user.id)
    session_stats = (
        select(
            PromptSession.project_id.label("project_id"),
            func.count(PromptSession.id).label("session_count"),
        )
        .where(PromptSession.project_id.in_(owned_project_ids))
        .group_by(PromptSession.project_id)
        .subquery()
    )
    event_stats = (
        select(
            Event.project_id.label("project_id"),
            func.count(Event.id).label("event_count"),
            func.count(case((Event.event_type == "PromptSubmitted", 1))).label(
                "prompt_count",
            ),
            func.max(Event.created_at).label("latest_event_at"),
        )
        .where(Event.project_id.in_(owned_project_ids))
        .group_by(Event.project_id)
        .subquery()
    )
    tracked_file_stats = (
        select(
            ProjectFile.project_id.label("project_id"),
            func.count(ProjectFile.id).label("tracked_files"),
        )
        .where(
            ProjectFile.project_id.in_(owned_project_ids),
            ProjectFile.status != "deleted",
        )
        .group_by(ProjectFile.project_id)
        .subquery()
    )
    rows = db.execute(
        select(
            Project,
            session_stats.c.session_count,
            event_stats.c.event_count,
            event_stats.c.latest_event_at,
            event_stats.c.prompt_count,
            tracked_file_stats.c.tracked_files,
        )
        .outerjoin(session_stats, session_stats.c.project_id == Project.id)
        .outerjoin(event_stats, event_stats.c.project_id == Project.id)
        .outerjoin(tracked_file_stats, tracked_file_stats.c.project_id == Project.id)
        .where(Project.owner_id == current_user.id)
        .order_by(nullslast(desc(event_stats.c.latest_event_at)), desc(Project.updated_at))
    ).all()
    project_ids = [project.id for project, *_ in rows]
    if not project_ids:
        return []

    connected_models: dict[UUID, set[str]] = {project_id: set() for project_id in project_ids}
    for project_id, model_value in db.execute(
        select(PromptSession.project_id, PromptSession.model)
        .where(
            PromptSession.project_id.in_(project_ids),
            PromptSession.model.is_not(None),
        )
        .distinct()
    ).all():
        if (model := model_name(model_value)) is not None:
            connected_models.setdefault(project_id, set()).add(model)

    return [
        project_summary(
            project,
            connected_models=tuple(connected_models.get(project.id, set())),
            event_count=event_count,
            latest_event_at=latest_event_at,
            prompt_count=prompt_count,
            session_count=session_count,
            tracked_files=tracked_files,
        )
        for (
            project,
            session_count,
            event_count,
            latest_event_at,
            prompt_count,
            tracked_files,
        ) in rows
    ]


def _unique_project_slug(db: Session, *, owner_id: UUID, name: str) -> str:
    base = slugify_project_name(name)
    candidate = base
    suffix = 2
    while db.scalar(
        select(Project.id).where(Project.owner_id == owner_id, Project.slug == candidate)
    ):
        suffix_text = f"-{suffix}"
        candidate = f"{base[: 255 - len(suffix_text)]}{suffix_text}"
        suffix += 1
    return candidate


def create_project_summary(
    db: Session,
    *,
    default_branch: str | None,
    description: str | None,
    github_url: str,
    name: str | None,
    user: User,
) -> dict[str, Any]:
    repository = repository_metadata_from_url(db, remote_url=github_url, user=user)
    repository_url = repository["html_url"]
    existing_project = db.scalar(
        select(Project).where(
            Project.owner_id == user.id,
            Project.git_remote == repository_url,
        )
    )
    if existing_project is not None:
        return project_summary_with_counts(db, existing_project)

    project_name = name or repository["name"]
    project_description = description
    if project_description is None and repository["description"]:
        project_description = repository["description"]

    project = Project(
        owner_id=user.id,
        name=project_name[:255],
        slug=_unique_project_slug(db, owner_id=user.id, name=project_name),
        description=project_description,
        visibility="private",
        git_remote=repository_url,
        default_branch=default_branch or repository["default_branch"] or "main",
    )
    db.add(project)
    db.flush()
    return project_summary(project)


def update_project_repository_summary(
    db: Session,
    *,
    default_branch: str | None,
    github_url: str,
    project_id: UUID,
    user: User,
) -> dict[str, Any]:
    project = project_for_user(db, project_id, user)
    repository = repository_metadata_from_url(db, remote_url=github_url, user=user)
    project.git_remote = repository["html_url"]
    project.default_branch = default_branch or repository["default_branch"] or "main"
    db.flush()
    return project_summary_with_counts(db, project)


def update_project_description_summary(
    db: Session,
    *,
    description: str | None,
    project_id: UUID,
    user: User,
) -> dict[str, Any]:
    project = project_for_user(db, project_id, user)
    project.description = description
    db.flush()
    return {
        "description": project.description,
        "id": str(project.id),
        "updated_at": iso(project.updated_at),
    }


def update_project_metadata_summary(
    db: Session,
    *,
    project_id: UUID,
    slug: str | None,
    tags: list[str] | None,
    user: User,
    visibility: str | None,
) -> dict[str, Any]:
    project = project_for_user(db, project_id, user)
    if slug is not None and slug != project.slug:
        existing_project_id = db.scalar(
            select(Project.id).where(
                Project.owner_id == user.id,
                Project.slug == slug,
                Project.id != project.id,
            )
        )
        if existing_project_id is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Project URL is already in use.",
            )
        project.slug = slug
    if tags is not None:
        project.tags = tags
    if visibility is not None:
        project.visibility = visibility

    db.flush()
    return project_summary_with_counts(db, project)


def update_project_bookmark_summary(
    db: Session,
    *,
    is_bookmarked: bool,
    project_id: UUID,
    user: User,
) -> dict[str, Any]:
    project = project_for_user(db, project_id, user)
    project.is_bookmarked = is_bookmarked
    db.flush()
    return project_summary_with_counts(db, project)
