from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal
from urllib.parse import urlsplit, urlunsplit
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import Text, case, cast, desc, func, nullslast, or_, select
from sqlalchemy.orm import Session

from app.models.artifacts import Artifact
from app.models.events import Event
from app.models.project_files import ProjectFile
from app.models.projects import Project
from app.models.public_project_saves import PublicProjectSave
from app.models.public_project_views import PublicProjectView
from app.models.sessions import Session as PromptSession
from app.models.users import User
from app.services.memory.constants import (
    MEMORY_ARTIFACT_TYPE,
    PROJECT_MEMORY_ARTIFACT_TYPE,
    REVIEW_STATE_EDITED,
    REVIEW_STATE_VERIFIED,
)
from app.services.memory.serializers import serialize_memory_artifact_summary
from app.services.projects.activity import model_name
from app.services.projects.analytics import public_project_view_analytics
from app.services.projects.management import project_summary
from app.services.projects.popularity import (
    REPEAT_VIEW_WEIGHT,
    SAVE_WEIGHT,
    UNIQUE_VIEW_WEIGHT,
    WEEKLY_POPULARITY_WINDOW,
)
from app.services.projects.views import read_project_detail_response


PUBLIC_MEMORY_REVIEW_STATES = (REVIEW_STATE_EDITED, REVIEW_STATE_VERIFIED)
PUBLIC_MEMORY_TYPES = (MEMORY_ARTIFACT_TYPE, PROJECT_MEMORY_ARTIFACT_TYPE)


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
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, "", ""))


def _public_memory_conditions(project_id: UUID) -> tuple[Any, ...]:
    return (
        Artifact.project_id == project_id,
        Artifact.type.in_(PUBLIC_MEMORY_TYPES),
        Artifact.metadata_["review_state"].astext.in_(PUBLIC_MEMORY_REVIEW_STATES),
    )


def _serialize_public_memory_artifact(artifact: Artifact) -> dict[str, Any]:
    serialized = serialize_memory_artifact_summary(artifact)
    return {
        "artifact_stage": serialized["artifact_stage"],
        "changed_file_count": serialized["changed_file_count"],
        "created_at": serialized["created_at"],
        "first_event_at": serialized["first_event_at"],
        "generator": serialized["generator"],
        "id": serialized["id"],
        "last_event_at": serialized["last_event_at"],
        "memory_scope": serialized["memory_scope"],
        "model": serialized["model"],
        "outcome": serialized["outcome"],
        "prompt_count": serialized["prompt_count"],
        "reason": serialized["reason"],
        "review_state": serialized["review_state"],
        "sections": serialized["sections"],
        "summary": serialized["summary"],
        "tags": serialized["tags"],
        "technologies": serialized["technologies"],
        "title": serialized["title"],
        "type": serialized["type"],
        "updated_at": serialized["updated_at"],
        "why_it_matters": serialized["why_it_matters"],
    }


def _public_conditions(
    query: str | None,
    *,
    owner_id: UUID | None = None,
) -> list[Any]:
    conditions: list[Any] = [Project.visibility == "public"]
    if owner_id is not None:
        conditions.append(Project.owner_id == owner_id)
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
    sort: Literal["newest", "popular", "recent"],
    saved_only: bool = False,
    owner_id: UUID | None = None,
) -> dict[str, Any]:
    since_7d = datetime.now(timezone.utc) - WEEKLY_POPULARITY_WINDOW
    conditions = _public_conditions(query, owner_id=owner_id)
    if saved_only:
        conditions.append(
            Project.id.in_(
                select(PublicProjectSave.project_id).where(
                    PublicProjectSave.user_id == current_user.id,
                )
            )
        )
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
            Artifact.type.in_(PUBLIC_MEMORY_TYPES),
            Artifact.metadata_["review_state"].astext.in_(PUBLIC_MEMORY_REVIEW_STATES),
        )
        .group_by(Artifact.project_id)
        .subquery()
    )
    view_stats = (
        select(
            PublicProjectView.project_id.label("project_id"),
            func.count(PublicProjectView.id).label("view_count"),
            func.count(PublicProjectView.id)
            .filter(PublicProjectView.viewed_at >= since_7d)
            .label("weekly_views"),
            func.count(func.distinct(PublicProjectView.viewer_id))
            .filter(PublicProjectView.viewed_at >= since_7d)
            .label("weekly_unique_viewers"),
        )
        .where(PublicProjectView.project_id.in_(public_project_ids))
        .group_by(PublicProjectView.project_id)
        .subquery()
    )
    save_stats = (
        select(
            PublicProjectSave.project_id.label("project_id"),
            func.count(PublicProjectSave.user_id)
            .filter(PublicProjectSave.created_at >= since_7d)
            .label("weekly_saves"),
        )
        .join(Project, Project.id == PublicProjectSave.project_id)
        .where(
            PublicProjectSave.project_id.in_(public_project_ids),
            PublicProjectSave.user_id != Project.owner_id,
        )
        .group_by(PublicProjectSave.project_id)
        .subquery()
    )
    weekly_popularity = (
        func.coalesce(view_stats.c.weekly_unique_viewers, 0) * UNIQUE_VIEW_WEIGHT
        + func.greatest(
            func.coalesce(view_stats.c.weekly_views, 0)
            - func.coalesce(view_stats.c.weekly_unique_viewers, 0),
            0,
        )
        * REPEAT_VIEW_WEIGHT
        + func.coalesce(save_stats.c.weekly_saves, 0) * SAVE_WEIGHT
    ).label("weekly_popularity_score")
    if sort == "newest":
        order_by = (desc(Project.created_at), desc(Project.id))
    elif sort == "popular":
        order_by = (
            desc(weekly_popularity),
            desc(func.coalesce(save_stats.c.weekly_saves, 0)),
            desc(func.coalesce(view_stats.c.weekly_unique_viewers, 0)),
            nullslast(desc(event_stats.c.latest_event_at)),
            desc(Project.updated_at),
        )
    else:
        order_by = (
            nullslast(desc(event_stats.c.latest_event_at)),
            desc(Project.updated_at),
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
            view_stats.c.view_count,
            view_stats.c.weekly_views,
            view_stats.c.weekly_unique_viewers,
            save_stats.c.weekly_saves,
            weekly_popularity,
        )
        .join(User, User.id == Project.owner_id)
        .outerjoin(session_stats, session_stats.c.project_id == Project.id)
        .outerjoin(event_stats, event_stats.c.project_id == Project.id)
        .outerjoin(file_stats, file_stats.c.project_id == Project.id)
        .outerjoin(memory_stats, memory_stats.c.project_id == Project.id)
        .outerjoin(view_stats, view_stats.c.project_id == Project.id)
        .outerjoin(save_stats, save_stats.c.project_id == Project.id)
        .where(*conditions)
        .order_by(*order_by)
        .limit(limit)
        .offset(offset)
    ).all()
    project_ids = [project.id for project, *_ in rows]
    saved_project_ids = (
        set(
            db.scalars(
                select(PublicProjectSave.project_id).where(
                    PublicProjectSave.user_id == current_user.id,
                    PublicProjectSave.project_id.in_(project_ids),
                )
            ).all()
        )
        if project_ids
        else set()
    )
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
        view_count,
        weekly_views,
        weekly_unique_viewers,
        weekly_saves,
        weekly_popularity_score,
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
                "is_saved": project.id in saved_project_ids,
                "latest_event_at": summary["latest_event_at"],
                "latest_memory_at": summary["latest_memory_at"],
                "memory_count": summary["memory_count"],
                "name": summary["name"],
                "owner": {
                    "avatar_url": _safe_public_url(owner.avatar_url),
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
                "view_count": int(view_count or 0),
                "weekly_popularity_score": round(float(weekly_popularity_score or 0), 2),
                "weekly_saves": int(weekly_saves or 0),
                "weekly_unique_viewers": int(weekly_unique_viewers or 0),
                "weekly_views": int(weekly_views or 0),
                "visibility": "public",
            }
        )
    return {"items": items, "limit": limit, "offset": offset, "total": total}


def read_public_profile_response(
    db: Session,
    *,
    current_user: User,
    user_id: UUID,
    limit: int,
    offset: int,
) -> dict[str, Any]:
    profile = db.get(User, user_id)
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Public profile not found",
        )

    projects = list_public_project_summaries(
        db,
        current_user=current_user,
        limit=limit,
        offset=offset,
        query=None,
        sort="recent",
        owner_id=profile.id,
    )
    return {
        **projects,
        "profile": {
            "avatar_url": _safe_public_url(profile.avatar_url),
            "id": str(profile.id),
            "username": profile.username,
        },
    }


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
    project_response = dict(response["project"])
    project_response["is_bookmarked"] = (
        bool(project.is_bookmarked) if project.owner_id == current_user.id else False
    )
    project_response["project_url"] = _safe_public_url(project_response.get("project_url"))
    project_response["repository_url"] = _safe_public_url(project_response.get("repository_url"))
    public_memory_artifacts = list(
        db.scalars(
            select(Artifact)
            .where(*_public_memory_conditions(project.id))
            .order_by(desc(Artifact.updated_at), desc(Artifact.id))
            .limit(10)
        ).all()
    )
    public_memory_count = int(
        db.scalar(select(func.count(Artifact.id)).where(*_public_memory_conditions(project.id)))
        or 0
    )
    analytics = public_project_view_analytics(db, project_id=project.id)
    return {
        "activities": [],
        "files": [],
        "is_owner": project.owner_id == current_user.id,
        "is_saved": db.get(
            PublicProjectSave,
            (current_user.id, project.id),
        )
        is not None,
        "memory": {
            "latest_artifact_at": (
                public_memory_artifacts[0].updated_at.isoformat()
                if public_memory_artifacts
                else None
            ),
            "recent_artifacts": [
                _serialize_public_memory_artifact(artifact) for artifact in public_memory_artifacts
            ],
            "total_artifacts": public_memory_count,
        },
        "metrics": response["metrics"],
        "owner": {
            "avatar_url": _safe_public_url(owner.avatar_url),
            "id": str(owner.id),
            "username": owner.username,
        },
        "project": project_response,
        "prompt_activities": [],
        **analytics,
    }


def update_public_project_save(
    db: Session,
    *,
    current_user: User,
    project_id: UUID,
    is_saved: bool,
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

    existing = db.get(PublicProjectSave, (current_user.id, project.id))
    if is_saved and existing is None:
        db.add(PublicProjectSave(user_id=current_user.id, project_id=project.id))
    elif not is_saved and existing is not None:
        db.delete(existing)
    db.flush()
    return {"is_saved": is_saved, "project_id": str(project.id)}
