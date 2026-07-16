from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import and_, desc, func, nullslast, or_, select
from sqlalchemy.orm import Session

from app.core.security import is_admin_user
from app.core.time import utc_now
from app.models.admin_audit_logs import AdminAuditLog
from app.models.artifact_generation_jobs import ArtifactGenerationJob
from app.models.artifacts import Artifact
from app.models.events import Event
from app.models.github_connections import GitHubConnection
from app.models.projects import Project
from app.models.project_memory_batches import ProjectMemoryBatch
from app.models.sessions import Session as PromptSession
from app.models.tokens import CollectorToken
from app.models.users import User
from app.services.account_settings import serialize_collector_token
from app.services.memory.constants import MEMORY_ARTIFACT_TYPE


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _user_or_404(db: Session, user_id: UUID) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    return user


def _confirm_target(user: User, confirmation: str) -> None:
    if confirmation != user.username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f'Type "{user.username}" to confirm this administrator action.',
        )


def admin_users_response(
    db: Session,
    *,
    limit: int,
    offset: int,
    query: str | None,
) -> dict[str, Any]:
    project_stats = (
        select(
            Project.owner_id.label("owner_id"),
            func.count(Project.id).label("project_count"),
        )
        .group_by(Project.owner_id)
        .cte("admin_control_user_project_stats")
    )
    event_stats = (
        select(
            Project.owner_id.label("owner_id"),
            func.count(Event.id).label("event_count"),
            func.count(Event.id)
            .filter(Event.event_type == "PromptSubmitted")
            .label("prompt_count"),
            func.max(Event.created_at).label("latest_activity_at"),
        )
        .join(Event, Event.project_id == Project.id)
        .group_by(Project.owner_id)
        .cte("admin_control_user_event_stats")
    )
    session_stats = (
        select(
            Project.owner_id.label("owner_id"),
            func.count(PromptSession.id).label("session_count"),
        )
        .join(PromptSession, PromptSession.project_id == Project.id)
        .group_by(Project.owner_id)
        .cte("admin_control_user_session_stats")
    )
    token_stats = (
        select(
            CollectorToken.user_id.label("user_id"),
            func.count(CollectorToken.id)
            .filter(CollectorToken.revoked_at.is_(None))
            .label("active_token_count"),
            func.max(CollectorToken.last_used_at).label("last_collector_at"),
        )
        .group_by(CollectorToken.user_id)
        .cte("admin_control_user_token_stats")
    )
    search_filter = None
    if query:
        pattern = f"%{query.strip()}%"
        search_filter = or_(
            User.username.ilike(pattern),
            User.email.ilike(pattern),
            User.github_id.ilike(pattern),
        )

    base_statement = select(User.id)
    if search_filter is not None:
        base_statement = base_statement.where(search_filter)
    total = int(db.scalar(select(func.count()).select_from(base_statement.subquery())) or 0)

    statement = (
        select(
            User,
            func.coalesce(project_stats.c.project_count, 0),
            func.coalesce(event_stats.c.event_count, 0),
            func.coalesce(event_stats.c.prompt_count, 0),
            func.coalesce(session_stats.c.session_count, 0),
            event_stats.c.latest_activity_at,
            func.coalesce(token_stats.c.active_token_count, 0),
            token_stats.c.last_collector_at,
            GitHubConnection,
        )
        .outerjoin(project_stats, project_stats.c.owner_id == User.id)
        .outerjoin(event_stats, event_stats.c.owner_id == User.id)
        .outerjoin(session_stats, session_stats.c.owner_id == User.id)
        .outerjoin(token_stats, token_stats.c.user_id == User.id)
        .outerjoin(GitHubConnection, GitHubConnection.user_id == User.id)
        .order_by(
            nullslast(desc(event_stats.c.latest_activity_at)),
            desc(User.created_at),
        )
        .limit(limit)
        .offset(offset)
    )
    if search_filter is not None:
        statement = statement.where(search_filter)
    rows = db.execute(statement).all()
    user_ids = [row[0].id for row in rows]
    tokens_by_user: dict[UUID, list[dict[str, Any]]] = {user_id: [] for user_id in user_ids}
    if user_ids:
        tokens = db.scalars(
            select(CollectorToken)
            .where(CollectorToken.user_id.in_(user_ids))
            .order_by(
                CollectorToken.revoked_at.is_not(None),
                nullslast(desc(CollectorToken.last_used_at)),
                desc(CollectorToken.created_at),
            )
        ).all()
        for token in tokens:
            tokens_by_user[token.user_id].append(serialize_collector_token(token))

    items = []
    for (
        user,
        project_count,
        event_count,
        prompt_count,
        session_count,
        latest_activity_at,
        active_token_count,
        last_collector_at,
        github_connection,
    ) in rows:
        github_connected = bool(
            github_connection is not None and github_connection.revoked_at is None
        )
        items.append(
            {
                "active_collector_tokens": int(active_token_count or 0),
                "avatar_url": user.avatar_url,
                "collector_tokens": tokens_by_user.get(user.id, []),
                "counts": {
                    "events": int(event_count or 0),
                    "projects": int(project_count or 0),
                    "prompts": int(prompt_count or 0),
                    "sessions": int(session_count or 0),
                },
                "created_at": _iso(user.created_at),
                "email": user.email,
                "github": {
                    "connected": github_connected,
                    "scopes": [
                        scope.strip()
                        for scope in (github_connection.scopes or "").split(",")
                        if scope.strip()
                    ]
                    if github_connection
                    else [],
                    "updated_at": _iso(github_connection.updated_at) if github_connection else None,
                },
                "github_id": user.github_id,
                "id": str(user.id),
                "is_admin": is_admin_user(user),
                "last_collector_at": _iso(last_collector_at),
                "latest_activity_at": _iso(latest_activity_at),
                "status": "suspended" if user.suspended_at else "active",
                "suspended_at": _iso(user.suspended_at),
                "suspension_reason": user.suspension_reason,
                "username": user.username,
            }
        )
    return {"items": items, "limit": limit, "offset": offset, "total": total}


def admin_projects_response(
    db: Session,
    *,
    limit: int,
    offset: int,
    query: str | None,
) -> dict[str, Any]:
    event_stats = (
        select(
            Event.project_id.label("project_id"),
            func.count(Event.id).label("event_count"),
            func.count(Event.id)
            .filter(Event.event_type == "PromptSubmitted")
            .label("prompt_count"),
            func.max(Event.created_at).label("latest_activity_at"),
        )
        .group_by(Event.project_id)
        .cte("admin_control_project_event_stats")
    )
    memory_stats = (
        select(
            Artifact.project_id.label("project_id"),
            func.count(Artifact.id).label("memory_count"),
            func.max(Artifact.updated_at).label("latest_memory_at"),
        )
        .where(Artifact.type == MEMORY_ARTIFACT_TYPE)
        .group_by(Artifact.project_id)
        .cte("admin_control_project_memory_stats")
    )
    job_stats = (
        select(
            ProjectMemoryBatch.project_id.label("project_id"),
            func.count(ProjectMemoryBatch.id)
            .filter(ProjectMemoryBatch.status.in_(["failed", "superseded"]))
            .label("failed_jobs"),
            func.count(ProjectMemoryBatch.id)
            .filter(ProjectMemoryBatch.status.in_(["pending", "running"]))
            .label("active_jobs"),
        )
        .group_by(ProjectMemoryBatch.project_id)
        .cte("admin_control_project_job_stats")
    )
    search_filter = None
    if query:
        pattern = f"%{query.strip()}%"
        search_filter = or_(
            Project.name.ilike(pattern),
            Project.slug.ilike(pattern),
            User.username.ilike(pattern),
        )

    total_statement = select(func.count(Project.id)).join(User, User.id == Project.owner_id)
    if search_filter is not None:
        total_statement = total_statement.where(search_filter)
    total = int(db.scalar(total_statement) or 0)

    statement = (
        select(
            Project,
            User,
            func.coalesce(event_stats.c.event_count, 0),
            func.coalesce(event_stats.c.prompt_count, 0),
            event_stats.c.latest_activity_at,
            func.coalesce(memory_stats.c.memory_count, 0),
            memory_stats.c.latest_memory_at,
            func.coalesce(job_stats.c.failed_jobs, 0),
            func.coalesce(job_stats.c.active_jobs, 0),
        )
        .join(User, User.id == Project.owner_id)
        .outerjoin(event_stats, event_stats.c.project_id == Project.id)
        .outerjoin(memory_stats, memory_stats.c.project_id == Project.id)
        .outerjoin(job_stats, job_stats.c.project_id == Project.id)
        .order_by(
            nullslast(desc(event_stats.c.latest_activity_at)),
            desc(Project.updated_at),
        )
        .limit(limit)
        .offset(offset)
    )
    if search_filter is not None:
        statement = statement.where(search_filter)
    items = [
        {
            "active_jobs": int(active_jobs or 0),
            "created_at": _iso(project.created_at),
            "default_branch": project.default_branch,
            "description": project.description,
            "event_count": int(event_count or 0),
            "failed_jobs": int(failed_jobs or 0),
            "github_connected": bool(project.git_remote),
            "github_url": project.git_remote,
            "id": str(project.id),
            "latest_activity_at": _iso(latest_activity_at),
            "latest_memory_at": _iso(latest_memory_at),
            "memory_count": int(memory_count or 0),
            "name": project.name,
            "owner": {"id": str(owner.id), "username": owner.username},
            "project_url": project.project_url,
            "prompt_count": int(prompt_count or 0),
            "slug": project.slug,
            "tags": project.tags or [],
            "updated_at": _iso(project.updated_at),
            "visibility": project.visibility,
        }
        for (
            project,
            owner,
            event_count,
            prompt_count,
            latest_activity_at,
            memory_count,
            latest_memory_at,
            failed_jobs,
            active_jobs,
        ) in db.execute(statement).all()
    ]
    return {"items": items, "limit": limit, "offset": offset, "total": total}


def admin_jobs_response(
    db: Session,
    *,
    job_status: str | None,
    limit: int,
    offset: int,
) -> dict[str, Any]:
    status_filter = None
    stale_cutoff = datetime.now(timezone.utc) - timedelta(minutes=30)
    if job_status == "stale":
        status_filter = and_(
            ArtifactGenerationJob.status.in_(["pending", "running"]),
            ArtifactGenerationJob.updated_at < stale_cutoff,
        )
    elif job_status:
        status_filter = ArtifactGenerationJob.status == job_status

    total_statement = select(func.count(ArtifactGenerationJob.id))
    if status_filter is not None:
        total_statement = total_statement.where(status_filter)
    total = int(db.scalar(total_statement) or 0)

    statement = (
        select(ArtifactGenerationJob, Project, User)
        .join(Project, Project.id == ArtifactGenerationJob.project_id)
        .join(User, User.id == Project.owner_id)
        .order_by(desc(ArtifactGenerationJob.updated_at), desc(ArtifactGenerationJob.created_at))
        .limit(limit)
        .offset(offset)
    )
    if status_filter is not None:
        statement = statement.where(status_filter)
    items = []
    for job, project, owner in db.execute(statement).all():
        updated_at = job.updated_at
        if updated_at is not None and updated_at.tzinfo is None:
            updated_at = updated_at.replace(tzinfo=timezone.utc)
        items.append(
            {
                "completed_at": _iso(job.completed_at),
                "created_at": _iso(job.created_at),
                "error": job.error[:1000] if job.error else None,
                "generator": job.generator,
                "id": str(job.id),
                "owner": {"id": str(owner.id), "username": owner.username},
                "project": {
                    "id": str(project.id),
                    "name": project.name,
                    "slug": project.slug,
                },
                "reason": job.reason,
                "session_id": str(job.session_id),
                "stale": bool(
                    job.status in {"pending", "running"}
                    and updated_at is not None
                    and updated_at < stale_cutoff
                ),
                "status": job.status,
                "updated_at": _iso(job.updated_at),
            }
        )
    return {"items": items, "limit": limit, "offset": offset, "total": total}


def admin_audit_logs_response(
    db: Session,
    *,
    limit: int,
    offset: int,
) -> dict[str, Any]:
    total = int(db.scalar(select(func.count(AdminAuditLog.id))) or 0)
    logs = db.scalars(
        select(AdminAuditLog)
        .order_by(desc(AdminAuditLog.created_at), desc(AdminAuditLog.id))
        .limit(limit)
        .offset(offset)
    ).all()
    return {
        "items": [
            {
                "action": log.action,
                "actor": {
                    "github_id": log.actor_github_id,
                    "id": str(log.actor_user_id) if log.actor_user_id else None,
                    "username": log.actor_username,
                },
                "created_at": _iso(log.created_at),
                "id": str(log.id),
                "request_method": log.request_method,
                "request_path": log.request_path,
                "resource_id": log.resource_id,
                "resource_type": log.resource_type,
                "status_code": log.status_code,
            }
            for log in logs
        ],
        "limit": limit,
        "offset": offset,
        "total": total,
    }


def revoke_admin_collector_token_response(
    db: Session,
    *,
    confirmation: str,
    token_id: UUID,
    user_id: UUID,
) -> dict[str, Any]:
    user = _user_or_404(db, user_id)
    _confirm_target(user, confirmation)
    token = db.get(CollectorToken, token_id)
    if token is None or token.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Collector token not found",
        )
    if token.revoked_at is None:
        token.revoked_at = utc_now()
    db.flush()
    return serialize_collector_token(token)


def revoke_all_admin_collector_tokens_response(
    db: Session,
    *,
    confirmation: str,
    user_id: UUID,
) -> dict[str, Any]:
    user = _user_or_404(db, user_id)
    _confirm_target(user, confirmation)
    tokens = db.scalars(
        select(CollectorToken).where(
            CollectorToken.user_id == user.id,
            CollectorToken.revoked_at.is_(None),
        )
    ).all()
    revoked_at = utc_now()
    for token in tokens:
        token.revoked_at = revoked_at
    db.flush()
    return {"revoked": len(tokens), "user_id": str(user.id)}


def disconnect_admin_github_response(
    db: Session,
    *,
    confirmation: str,
    user_id: UUID,
) -> dict[str, Any]:
    user = _user_or_404(db, user_id)
    _confirm_target(user, confirmation)
    connection = db.scalar(
        select(GitHubConnection).where(
            GitHubConnection.user_id == user.id,
            GitHubConnection.revoked_at.is_(None),
        )
    )
    disconnected = connection is not None
    if connection is not None:
        connection.revoked_at = utc_now()
        db.flush()
    return {"disconnected": disconnected, "user_id": str(user.id)}
