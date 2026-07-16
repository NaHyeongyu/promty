from __future__ import annotations

from typing import Any, Literal
from urllib.parse import urlsplit, urlunsplit
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import Text, and_, case, cast, desc, func, nullslast, or_, select
from sqlalchemy.orm import Session

from app.models.artifacts import Artifact
from app.models.events import Event
from app.models.project_files import ProjectFile
from app.models.projects import Project
from app.models.sessions import Session as PromptSession
from app.models.users import User
from app.services.memory.constants import (
    MEMORY_ARTIFACT_TYPE,
    PROJECT_MEMORY_ARTIFACT_TYPE,
    REVIEW_STATE_GENERATED,
    REVIEW_STATE_VERIFIED,
)
from app.services.projects.activity import model_name
from app.services.projects.management import project_summary
from app.services.projects.views import read_project_detail_response


def _safe_public_url(value: str | None) -> str | None:
    if not value:
        return None
    try:
        parsed = urlsplit(value.strip())
    except ValueError:
        return None
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
    ):
        return None
    return urlunsplit(parsed)


def _public_conditions(query: str | None) -> list[Any]:
    conditions: list[Any] = [Project.visibility == "public"]
    normalized_query = query.strip() if query else ""
    if normalized_query:
        pattern = f"%{normalized_query}%"
        conditions.append(
            or_(
                Project.name.ilike(pattern),
                Project.description.ilike(pattern),
                User.username.ilike(pattern),
                cast(Project.tags, Text).ilike(pattern),
            )
        )
    return conditions


def list_public_project_summaries(
    db: Session,
    *,
    current_user: User,
    limit: int,
    offset: int,
    query: str | None,
    sort: Literal["newest", "recent"],
) -> dict[str, Any]:
    conditions = _public_conditions(query)
    total = int(
        db.scalar(
            select(func.count(Project.id))
            .join(User, User.id == Project.owner_id)
            .where(*conditions)
        )
        or 0
    )
    public_project_ids = (
        select(Project.id).join(User, User.id == Project.owner_id).where(*conditions)
    )
    session_stats = (
        select(
            PromptSession.project_id.label("project_id"),
            func.count(PromptSession.id).label("session_count"),
        )
        .where(PromptSession.project_id.in_(public_project_ids))
        .group_by(PromptSession.project_id)
        .subquery()
    )
    event_stats = (
        select(
            Event.project_id.label("project_id"),
            func.count(Event.id).label("event_count"),
            func.count(case((Event.event_type == "PromptSubmitted", 1))).label("prompt_count"),
            func.max(Event.created_at).label("latest_event_at"),
        )
        .where(Event.project_id.in_(public_project_ids))
        .group_by(Event.project_id)
        .subquery()
    )
    file_stats = (
        select(
            ProjectFile.project_id.label("project_id"),
            func.count(ProjectFile.id).label("tracked_files"),
        )
        .where(
            ProjectFile.project_id.in_(public_project_ids),
            ProjectFile.status != "deleted",
        )
        .group_by(ProjectFile.project_id)
        .subquery()
    )
    memory_stats = (
        select(
            Artifact.project_id.label("project_id"),
            func.count(Artifact.id).label("memory_count"),
            func.max(Artifact.updated_at).label("latest_memory_at"),
        )
        .where(
            Artifact.project_id.in_(public_project_ids),
            or_(
                Artifact.type == PROJECT_MEMORY_ARTIFACT_TYPE,
                and_(
                    Artifact.type == MEMORY_ARTIFACT_TYPE,
                    Artifact.metadata_["review_state"].astext.in_(
                        (REVIEW_STATE_GENERATED, REVIEW_STATE_VERIFIED)
                    ),
                    Artifact.metadata_["artifact_stage"].astext.in_(
                        ("generated_memory", "verified_memory")
                    ),
                ),
            ),
        )
        .group_by(Artifact.project_id)
        .subquery()
    )
    order_by = (
        (desc(Project.created_at), desc(Project.id))
        if sort == "newest"
        else (
            nullslast(desc(event_stats.c.latest_event_at)),
            desc(Project.updated_at),
        )
    )
    rows = db.execute(
        select(
            Project,
            User,
            session_stats.c.session_count,
            event_stats.c.event_count,
            event_stats.c.prompt_count,
            event_stats.c.latest_event_at,
            file_stats.c.tracked_files,
            memory_stats.c.memory_count,
            memory_stats.c.latest_memory_at,
        )
        .join(User, User.id == Project.owner_id)
        .outerjoin(session_stats, session_stats.c.project_id == Project.id)
        .outerjoin(event_stats, event_stats.c.project_id == Project.id)
        .outerjoin(file_stats, file_stats.c.project_id == Project.id)
        .outerjoin(memory_stats, memory_stats.c.project_id == Project.id)
        .where(*conditions)
        .order_by(*order_by)
        .limit(limit)
        .offset(offset)
    ).all()
    project_ids = [project.id for project, *_ in rows]
    connected_models: dict[UUID, set[str]] = {project_id: set() for project_id in project_ids}
    if project_ids:
        for project_id, model_value in db.execute(
            select(PromptSession.project_id, PromptSession.model)
            .where(
                PromptSession.project_id.in_(project_ids),
                PromptSession.model.is_not(None),
            )
            .distinct()
        ).all():
            if (normalized_model := model_name(model_value)) is not None:
                connected_models.setdefault(project_id, set()).add(normalized_model)

    items = []
    for (
        project,
        owner,
        session_count,
        event_count,
        prompt_count,
        latest_event_at,
        tracked_files,
        memory_count,
        latest_memory_at,
    ) in rows:
        summary = project_summary(
            project,
            connected_models=tuple(connected_models.get(project.id, set())),
            event_count=event_count,
            latest_event_at=latest_event_at,
            latest_memory_at=latest_memory_at,
            memory_count=memory_count,
            prompt_count=prompt_count,
            session_count=session_count,
            tracked_files=tracked_files,
        )
        items.append(
            {
                "connected_models": summary["connected_models"],
                "created_at": summary["created_at"],
                "default_branch": summary["default_branch"],
                "description": project.description,
                "events": summary["events"],
                "github_url": _safe_public_url(summary["github_url"]),
                "id": summary["id"],
                "is_owner": project.owner_id == current_user.id,
                "latest_event_at": summary["latest_event_at"],
                "latest_memory_at": summary["latest_memory_at"],
                "memory_count": summary["memory_count"],
                "name": summary["name"],
                "owner": {
                    "avatar_url": owner.avatar_url,
                    "id": str(owner.id),
                    "username": owner.username,
                },
                "project_url": _safe_public_url(summary["project_url"]),
                "prompts": summary["prompts"],
                "sessions": summary["sessions"],
                "slug": summary["slug"],
                "tags": summary["tags"],
                "tracked_files": summary["tracked_files"],
                "updated_at": summary["updated_at"],
                "visibility": "public",
            }
        )
    return {"items": items, "limit": limit, "offset": offset, "total": total}


def read_public_project_detail_response(
    db: Session,
    *,
    current_user: User,
    project_id: UUID,
) -> dict[str, Any]:
    project = db.scalar(
        select(Project).where(
            Project.id == project_id,
            Project.visibility == "public",
        )
    )
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Public project not found",
        )
    owner = db.get(User, project.owner_id)
    if owner is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Public project owner not found",
        )
    response = read_project_detail_response(
        project.id,
        current_user,
        db,
        allow_public=True,
    )
    response["project"]["is_bookmarked"] = (
        bool(project.is_bookmarked) if project.owner_id == current_user.id else False
    )
    response["project"]["project_url"] = _safe_public_url(response["project"].get("project_url"))
    response["project"]["repository_url"] = _safe_public_url(
        response["project"].get("repository_url")
    )
    response["is_owner"] = project.owner_id == current_user.id
    response["owner"] = {
        "avatar_url": owner.avatar_url,
        "id": str(owner.id),
        "username": owner.username,
    }
    return response
