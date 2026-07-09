from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import case, desc, func, nullslast, select
from sqlalchemy.orm import Session, selectinload

from app.core.config import settings
from app.models.artifact_generation_jobs import ArtifactGenerationJob
from app.models.artifacts import Artifact
from app.models.events import Event
from app.models.github_connections import GitHubConnection
from app.models.project_files import ProjectFile
from app.models.projects import Project
from app.models.sessions import Session as PromptSession
from app.models.tokens import CollectorToken
from app.models.users import User
from app.services.memory.constants import MEMORY_ARTIFACT_TYPE


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _count(db: Session, model: type[Any], *criteria: Any) -> int:
    statement = select(func.count()).select_from(model)
    if criteria:
        statement = statement.where(*criteria)
    return int(db.scalar(statement) or 0)


def _breakdown(
    db: Session,
    column: Any,
    model: type[Any],
    *,
    limit: int = 12,
) -> list[dict[str, Any]]:
    rows = db.execute(
        select(column, func.count())
        .select_from(model)
        .group_by(column)
        .order_by(desc(func.count()))
        .limit(limit)
    ).all()
    return [
        {
            "count": int(count or 0),
            "key": str(key) if key is not None else "unknown",
        }
        for key, count in rows
    ]


def _operational_risks() -> list[dict[str, str]]:
    risks: list[dict[str, str]] = []
    if not settings.session_cookie_secure:
        risks.append(
            {
                "detail": "PROMPTHUB_SESSION_COOKIE_SECURE is false.",
                "severity": "high",
                "title": "Session cookie is not marked secure",
            }
        )
    if not settings.github_token_encryption_key:
        risks.append(
            {
                "detail": "GitHub token encryption falls back to another application secret.",
                "severity": "medium",
                "title": "Dedicated GitHub token key is not configured",
            }
        )
    if not settings.app_encryption_key:
        risks.append(
            {
                "detail": "Prompt and response encryption falls back to another application secret.",
                "severity": "medium",
                "title": "Dedicated app encryption key is not configured",
            }
        )
    external_memory_enabled = any(
        generator.strip().lower() in {"gemini", "openai"}
        for generator in (
            settings.memory_draft_generator,
            settings.project_memory_generator,
        )
    )
    if external_memory_enabled and (settings.gemini_api_key or settings.openai_api_key):
        risks.append(
            {
                "detail": "Compact prompt and response evidence can be sent to an external memory generator.",
                "severity": "info",
                "title": "External memory generation is enabled",
            }
        )
    return risks


def _recent_users(db: Session) -> list[dict[str, Any]]:
    project_counts = (
        select(
            Project.owner_id.label("owner_id"),
            func.count(Project.id).label("project_count"),
        )
        .group_by(Project.owner_id)
        .subquery()
    )
    return [
        {
            "created_at": _iso(user.created_at),
            "email": user.email,
            "github_connected": user.github_connection is not None
            and user.github_connection.revoked_at is None,
            "id": str(user.id),
            "project_count": int(project_count or 0),
            "username": user.username,
        }
        for user, project_count in db.execute(
            select(User, project_counts.c.project_count)
            .options(selectinload(User.github_connection))
            .outerjoin(project_counts, project_counts.c.owner_id == User.id)
            .order_by(desc(User.created_at))
            .limit(8)
        ).all()
    ]


def _recent_projects(db: Session) -> list[dict[str, Any]]:
    event_stats = (
        select(
            Event.project_id.label("project_id"),
            func.count(Event.id).label("event_count"),
            func.count(case((Event.event_type == "PromptSubmitted", 1))).label(
                "prompt_count",
            ),
            func.max(Event.created_at).label("latest_event_at"),
        )
        .group_by(Event.project_id)
        .subquery()
    )
    session_stats = (
        select(
            PromptSession.project_id.label("project_id"),
            func.count(PromptSession.id).label("session_count"),
        )
        .group_by(PromptSession.project_id)
        .subquery()
    )
    file_stats = (
        select(
            ProjectFile.project_id.label("project_id"),
            func.count(ProjectFile.id).label("file_count"),
        )
        .where(ProjectFile.status != "deleted")
        .group_by(ProjectFile.project_id)
        .subquery()
    )
    projects: list[dict[str, Any]] = []
    for (
        project,
        owner,
        latest_at,
        event_count,
        prompt_count,
        session_count,
        file_count,
    ) in db.execute(
        select(
            Project,
            User,
            event_stats.c.latest_event_at,
            event_stats.c.event_count,
            event_stats.c.prompt_count,
            session_stats.c.session_count,
            file_stats.c.file_count,
        )
        .join(User, Project.owner_id == User.id)
        .outerjoin(event_stats, event_stats.c.project_id == Project.id)
        .outerjoin(session_stats, session_stats.c.project_id == Project.id)
        .outerjoin(file_stats, file_stats.c.project_id == Project.id)
        .order_by(nullslast(desc(event_stats.c.latest_event_at)), desc(Project.updated_at))
        .limit(12)
    ).all():
        projects.append(
            {
                "counts": {
                    "events": int(event_count or 0),
                    "files": int(file_count or 0),
                    "prompts": int(prompt_count or 0),
                    "sessions": int(session_count or 0),
                },
                "default_branch": project.default_branch,
                "github_connected": bool(project.git_remote),
                "id": str(project.id),
                "latest_event_at": _iso(latest_at),
                "name": project.name,
                "owner": {
                    "id": str(owner.id),
                    "username": owner.username,
                },
                "slug": project.slug,
                "tags": project.tags or [],
                "updated_at": _iso(project.updated_at),
            }
        )
    return projects


def _recent_events(db: Session) -> list[dict[str, Any]]:
    return [
        {
            "created_at": _iso(event.created_at),
            "event_type": event.event_type,
            "id": str(event.id),
            "project_id": str(event.project_id),
            "sequence": event.sequence,
            "session_id": str(event.session_id) if event.session_id is not None else None,
            "tool": event.tool,
        }
        for event in db.execute(
            select(Event).order_by(desc(Event.created_at), desc(Event.sequence)).limit(18)
        ).scalars()
    ]


def admin_overview_response(db: Session) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    since_24h = now - timedelta(hours=24)
    since_7d = now - timedelta(days=7)

    total_users = _count(db, User)
    total_projects = _count(db, Project)
    total_events = _count(db, Event)
    total_sessions = _count(db, PromptSession)
    total_prompts = _count(db, Event, Event.event_type == "PromptSubmitted")
    total_responses = _count(db, Event, Event.event_type == "ResponseReceived")
    tracked_files = _count(db, ProjectFile, ProjectFile.status != "deleted")
    memory_artifacts = _count(db, Artifact, Artifact.type == MEMORY_ARTIFACT_TYPE)
    active_tokens = _count(db, CollectorToken, CollectorToken.revoked_at.is_(None))
    github_connections = _count(db, GitHubConnection, GitHubConnection.revoked_at.is_(None))

    return {
        "generated_at": _iso(now),
        "metrics": {
            "active_collector_tokens": active_tokens,
            "events_24h": _count(db, Event, Event.created_at >= since_24h),
            "events_7d": _count(db, Event, Event.created_at >= since_7d),
            "github_connections": github_connections,
            "memory_artifacts": memory_artifacts,
            "projects": total_projects,
            "prompts": total_prompts,
            "responses": total_responses,
            "sessions": total_sessions,
            "tracked_files": tracked_files,
            "users": total_users,
            "events": total_events,
        },
        "breakdowns": {
            "events_by_type": _breakdown(db, Event.event_type, Event),
            "events_by_tool": _breakdown(db, Event.tool, Event),
            "jobs_by_status": _breakdown(db, ArtifactGenerationJob.status, ArtifactGenerationJob),
            "projects_by_visibility": _breakdown(db, Project.visibility, Project),
        },
        "recent_events": _recent_events(db),
        "recent_projects": _recent_projects(db),
        "recent_users": _recent_users(db),
        "risks": _operational_risks(),
        "system": {
            "admin_configured": bool(
                settings.admin_usernames
                or settings.admin_emails
                or settings.admin_github_ids
            ),
            "app_url": settings.app_url,
            "cors_origins": list(settings.cors_origins),
            "gemini_configured": bool(settings.gemini_api_key),
            "openai_configured": bool(settings.openai_api_key),
            "memory_generators": {
                "draft": settings.memory_draft_generator,
                "project": settings.project_memory_generator,
            },
            "published_flows_enabled": False,
            "session_cookie_secure": settings.session_cookie_secure,
            "session_cookie_samesite": settings.session_cookie_samesite,
        },
    }
