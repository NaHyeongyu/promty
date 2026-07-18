from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import and_, case, desc, func, nullslast, select, true
from sqlalchemy.orm import Session

from app.models.artifacts import Artifact
from app.models.events import Event
from app.models.project_files import ProjectFile
from app.models.projects import Project
from app.models.project_stats import ProjectStats
from app.models.sessions import Session as PromptSession
from app.models.users import User
from app.services.github_repositories import repository_metadata_from_url
from app.services.memory.constants import (
    MEMORY_ARTIFACT_TYPE,
    MEMORY_DRAFT_ARTIFACT_TYPE,
    PROJECT_MEMORY_ARTIFACT_TYPE,
    PENDING_DRAFT_STAGE,
    REVIEW_STATE_DRAFT,
)
from app.services.projects.views import model_name, normalize_github_url, project_for_user


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
    latest_memory_at: Any = None,
    memory_count: int = 0,
    pending_memory_count: int = 0,
    prompt_count: int = 0,
    session_count: int = 0,
    tracked_files: int = 0,
) -> dict[str, Any]:
    return {
        "id": str(project.id),
        "slug": project.slug,
        "name": project.name,
        "project_url": project.project_url,
        "git_remote": project.git_remote,
        "github_url": normalize_github_url(project.git_remote),
        "default_branch": project.default_branch,
        "created_at": project.created_at.isoformat(),
        "is_bookmarked": bool(project.is_bookmarked),
        "memory_grouping_mode": project.memory_grouping_mode or "session",
        "tags": project.tags or [],
        "visibility": project.visibility,
        "connected_models": sorted(connected_models),
        "sessions": int(session_count or 0),
        "events": int(event_count or 0),
        "prompts": int(prompt_count or 0),
        "tracked_files": int(tracked_files or 0),
        "latest_event_at": latest_event_at.isoformat() if latest_event_at else None,
        "latest_memory_at": latest_memory_at.isoformat() if latest_memory_at else None,
        "memory_count": int(memory_count or 0),
        "pending_memory_count": int(pending_memory_count or 0),
        "updated_at": project.updated_at.isoformat(),
    }


def project_summary_with_counts(db: Session, project: Project) -> dict[str, Any]:
    session_stats = (
        select(
            func.count(PromptSession.id).label("session_count"),
            func.array_agg(func.distinct(PromptSession.model))
            .filter(PromptSession.model.is_not(None))
            .label("connected_models"),
        )
        .where(PromptSession.project_id == project.id)
        .subquery()
    )
    event_stats = (
        select(
            func.count(Event.id).label("event_count"),
            func.count(case((Event.event_type == "PromptSubmitted", 1))).label("prompt_count"),
            func.max(Event.created_at).label("latest_event_at"),
        )
        .where(Event.project_id == project.id)
        .subquery()
    )
    artifact_stats = (
        select(
            func.count(
                case(
                    (
                        Artifact.type.in_((MEMORY_ARTIFACT_TYPE, PROJECT_MEMORY_ARTIFACT_TYPE)),
                        1,
                    )
                )
            ).label("memory_count"),
            func.count(
                case(
                    (
                        and_(
                            Artifact.type == MEMORY_DRAFT_ARTIFACT_TYPE,
                            Artifact.metadata_["artifact_stage"].astext == PENDING_DRAFT_STAGE,
                            Artifact.metadata_["review_state"].astext == REVIEW_STATE_DRAFT,
                            Artifact.metadata_["sent_to_ai_at"].astext.is_(None),
                        ),
                        1,
                    )
                )
            ).label("pending_memory_count"),
            func.max(
                case(
                    (
                        Artifact.type.in_((MEMORY_ARTIFACT_TYPE, PROJECT_MEMORY_ARTIFACT_TYPE)),
                        Artifact.updated_at,
                    )
                )
            ).label("latest_memory_at"),
        )
        .where(Artifact.project_id == project.id)
        .subquery()
    )
    file_stats = (
        select(func.count(ProjectFile.id).label("tracked_files"))
        .where(
            ProjectFile.project_id == project.id,
            ProjectFile.status != "deleted",
        )
        .subquery()
    )
    aggregate_sources = (
        session_stats.join(event_stats, true())
        .join(artifact_stats, true())
        .join(file_stats, true())
    )
    (
        session_count,
        connected_model_values,
        event_count,
        prompt_count,
        latest_event_at,
        memory_count,
        pending_memory_count,
        latest_memory_at,
        tracked_files,
    ) = db.execute(
        select(
            session_stats.c.session_count,
            session_stats.c.connected_models,
            event_stats.c.event_count,
            event_stats.c.prompt_count,
            event_stats.c.latest_event_at,
            artifact_stats.c.memory_count,
            artifact_stats.c.pending_memory_count,
            artifact_stats.c.latest_memory_at,
            file_stats.c.tracked_files,
        ).select_from(aggregate_sources)
    ).one()
    return project_summary(
        project,
        connected_models=[
            model
            for session_model in connected_model_values or []
            if (model := model_name(session_model)) is not None
        ],
        event_count=event_count,
        latest_event_at=latest_event_at,
        latest_memory_at=latest_memory_at,
        memory_count=memory_count,
        pending_memory_count=pending_memory_count,
        prompt_count=prompt_count,
        session_count=session_count,
        tracked_files=tracked_files,
    )


def list_project_summaries(db: Session, *, current_user: User) -> list[dict[str, Any]]:
    owned_project_ids = select(Project.id).where(Project.owner_id == current_user.id)
    artifact_stats = (
        select(
            Artifact.project_id.label("project_id"),
            func.count(
                case(
                    (
                        Artifact.type.in_((MEMORY_ARTIFACT_TYPE, PROJECT_MEMORY_ARTIFACT_TYPE)),
                        1,
                    )
                )
            ).label("memory_count"),
            func.count(
                case(
                    (
                        and_(
                            Artifact.type == MEMORY_DRAFT_ARTIFACT_TYPE,
                            Artifact.metadata_["artifact_stage"].astext == PENDING_DRAFT_STAGE,
                            Artifact.metadata_["review_state"].astext == REVIEW_STATE_DRAFT,
                            Artifact.metadata_["sent_to_ai_at"].astext.is_(None),
                        ),
                        1,
                    )
                )
            ).label("pending_memory_count"),
            func.max(
                case(
                    (
                        Artifact.type.in_((MEMORY_ARTIFACT_TYPE, PROJECT_MEMORY_ARTIFACT_TYPE)),
                        Artifact.updated_at,
                    )
                )
            ).label("latest_memory_at"),
        )
        .where(Artifact.project_id.in_(owned_project_ids))
        .group_by(Artifact.project_id)
        .subquery()
    )
    rows = db.execute(
        select(
            Project,
            func.coalesce(ProjectStats.session_count, 0),
            func.coalesce(ProjectStats.event_count, 0),
            ProjectStats.latest_event_at,
            func.coalesce(ProjectStats.prompt_count, 0),
            func.coalesce(ProjectStats.tracked_files, 0),
            artifact_stats.c.memory_count,
            artifact_stats.c.pending_memory_count,
            artifact_stats.c.latest_memory_at,
        )
        .outerjoin(ProjectStats, ProjectStats.project_id == Project.id)
        .outerjoin(artifact_stats, artifact_stats.c.project_id == Project.id)
        .where(Project.owner_id == current_user.id)
        .order_by(nullslast(desc(ProjectStats.latest_event_at)), desc(Project.updated_at))
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
            memory_count=memory_count,
            pending_memory_count=pending_memory_count,
            latest_memory_at=latest_memory_at,
        )
        for (
            project,
            session_count,
            event_count,
            latest_event_at,
            prompt_count,
            tracked_files,
            memory_count,
            pending_memory_count,
            latest_memory_at,
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
    return project_summary_with_counts(db, project)


def update_project_metadata_summary(
    db: Session,
    *,
    project_id: UUID,
    memory_grouping_mode: str | None,
    name: str | None,
    project_url: str | None,
    project_url_is_set: bool,
    slug: str | None,
    tags: list[str] | None,
    user: User,
    visibility: str | None,
) -> dict[str, Any]:
    project = project_for_user(db, project_id, user)
    if name is not None:
        project.name = name
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
    if memory_grouping_mode is not None:
        project.memory_grouping_mode = memory_grouping_mode
    if project_url_is_set:
        project.project_url = project_url
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


def delete_project(
    db: Session,
    *,
    project_id: UUID,
    user: User,
) -> None:
    project = project_for_user(db, project_id, user)
    db.delete(project)
    db.flush()
