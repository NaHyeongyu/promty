from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import require_admin_user
from app.db.session import get_db
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

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _count(db: Session, model: type[Any], *criteria: Any) -> int:
    statement = select(func.count()).select_from(model)
    if criteria:
        statement = statement.where(*criteria)
    return int(db.scalar(statement) or 0)


def _breakdown(db: Session, column: Any, model: type[Any], *, limit: int = 12) -> list[dict[str, Any]]:
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


def _project_counts(db: Session, project_id: Any) -> dict[str, int]:
    return {
        "events": _count(db, Event, Event.project_id == project_id),
        "files": _count(
            db,
            ProjectFile,
            ProjectFile.project_id == project_id,
            ProjectFile.status != "deleted",
        ),
        "prompts": _count(
            db,
            Event,
            Event.project_id == project_id,
            Event.event_type == "PromptSubmitted",
        ),
        "sessions": _count(db, PromptSession, PromptSession.project_id == project_id),
    }


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


@router.get("/overview")
def read_admin_overview(
    _admin_user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
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

    recent_users = [
        {
            "created_at": _iso(user.created_at),
            "email": user.email,
            "github_connected": user.github_connection is not None
            and user.github_connection.revoked_at is None,
            "id": str(user.id),
            "project_count": _count(db, Project, Project.owner_id == user.id),
            "username": user.username,
        }
        for user in db.execute(
            select(User).order_by(desc(User.created_at)).limit(8)
        ).scalars()
    ]

    latest_event_at = (
        select(Event.project_id, func.max(Event.created_at).label("latest_event_at"))
        .group_by(Event.project_id)
        .subquery()
    )
    recent_projects = []
    for project, owner, latest_at in db.execute(
        select(Project, User, latest_event_at.c.latest_event_at)
        .join(User, Project.owner_id == User.id)
        .outerjoin(latest_event_at, latest_event_at.c.project_id == Project.id)
        .order_by(desc(latest_event_at.c.latest_event_at), desc(Project.updated_at))
        .limit(12)
    ).all():
        counts = _project_counts(db, project.id)
        recent_projects.append(
            {
                "counts": counts,
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

    recent_events = [
        {
            "created_at": _iso(event.created_at),
            "event_type": event.event_type,
            "id": str(event.id),
            "project_id": str(event.project_id),
            "sequence": event.sequence,
            "session_id": str(event.session_id),
            "tool": event.tool,
        }
        for event in db.execute(
            select(Event).order_by(desc(Event.created_at), desc(Event.sequence)).limit(18)
        ).scalars()
    ]

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
        "recent_events": recent_events,
        "recent_projects": recent_projects,
        "recent_users": recent_users,
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
