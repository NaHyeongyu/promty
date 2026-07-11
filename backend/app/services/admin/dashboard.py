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
from app.services.memory.constants import (
    MEMORY_ARTIFACT_TYPE,
    MEMORY_DRAFT_ARTIFACT_TYPE,
    PENDING_DRAFT_STAGE,
    REVIEW_STATE_DRAFT,
)


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


def _pending_memory_draft_artifacts(db: Session) -> list[Artifact]:
    return list(
        db.execute(
            select(Artifact)
            .where(
                Artifact.type == MEMORY_DRAFT_ARTIFACT_TYPE,
                Artifact.metadata_["artifact_stage"].as_string() == PENDING_DRAFT_STAGE,
                Artifact.metadata_["review_state"].as_string() == REVIEW_STATE_DRAFT,
            )
            .order_by(desc(Artifact.updated_at), desc(Artifact.created_at))
        ).scalars()
    )


def _action_item(
    *,
    area: str,
    count: int | None,
    detail: str,
    severity: str,
    title: str,
) -> dict[str, Any]:
    return {
        "area": area,
        "count": count,
        "detail": detail,
        "severity": severity,
        "title": title,
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


def _build_action_items(
    *,
    failed_jobs: int,
    pending_memory_drafts: int,
    projects_without_activity: int,
    projects_without_repo: int,
    response_gap: int,
    risks: list[dict[str, str]],
    stale_jobs: int,
) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    if failed_jobs > 0:
        items.append(
            _action_item(
                area="AI generation",
                count=failed_jobs,
                detail="Review failed artifact generation jobs before users retry.",
                severity="high",
                title="Generation jobs failed",
            )
        )
    if stale_jobs > 0:
        items.append(
            _action_item(
                area="AI generation",
                count=stale_jobs,
                detail="Pending or running generation jobs have not updated recently.",
                severity="high",
                title="Generation jobs may be stuck",
            )
        )
    if response_gap > 0:
        items.append(
            _action_item(
                area="AI activity",
                count=response_gap,
                detail="Prompt submissions exceed recorded responses. Check collector ingestion.",
                severity="medium",
                title="Responses may be missing",
            )
        )
    if pending_memory_drafts > 0:
        items.append(
            _action_item(
                area="Memory",
                count=pending_memory_drafts,
                detail="Generated summaries are waiting to be organized from pending memory.",
                severity="medium",
                title="Pending memory needs attention",
            )
        )
    if projects_without_repo > 0:
        items.append(
            _action_item(
                area="Projects",
                count=projects_without_repo,
                detail="Projects without repositories cannot show file context.",
                severity="info",
                title="Repositories are not connected",
            )
        )
    if projects_without_activity > 0:
        items.append(
            _action_item(
                area="Projects",
                count=projects_without_activity,
                detail="Projects with no captured events may need onboarding follow-up.",
                severity="info",
                title="Projects have no activity yet",
            )
        )
    for risk in risks:
        items.append(
            _action_item(
                area="System",
                count=None,
                detail=risk["detail"],
                severity=risk["severity"],
                title=risk["title"],
            )
        )
    severity_order = {"high": 0, "medium": 1, "info": 2}
    return sorted(items, key=lambda item: severity_order.get(item["severity"], 3))[:10]


def _recent_users(db: Session) -> list[dict[str, Any]]:
    project_count_sq = (
        select(func.count(Project.id))
        .where(Project.owner_id == User.id)
        .correlate(User)
        .scalar_subquery()
    )
    event_count_sq = (
        select(func.count(Event.id))
        .select_from(Event)
        .join(Project, Project.id == Event.project_id)
        .where(Project.owner_id == User.id)
        .correlate(User)
        .scalar_subquery()
    )
    prompt_count_sq = (
        select(func.count(Event.id))
        .select_from(Event)
        .join(Project, Project.id == Event.project_id)
        .where(Project.owner_id == User.id, Event.event_type == "PromptSubmitted")
        .correlate(User)
        .scalar_subquery()
    )
    session_count_sq = (
        select(func.count(PromptSession.id))
        .select_from(PromptSession)
        .join(Project, Project.id == PromptSession.project_id)
        .where(Project.owner_id == User.id)
        .correlate(User)
        .scalar_subquery()
    )
    latest_activity_at_sq = (
        select(func.max(Event.created_at))
        .select_from(Event)
        .join(Project, Project.id == Event.project_id)
        .where(Project.owner_id == User.id)
        .correlate(User)
        .scalar_subquery()
    )
    return [
        {
            "created_at": _iso(user.created_at),
            "email": user.email,
            "event_count": int(event_count or 0),
            "github_connected": user.github_connection is not None
            and user.github_connection.revoked_at is None,
            "id": str(user.id),
            "latest_activity_at": _iso(latest_activity_at),
            "prompt_count": int(prompt_count or 0),
            "project_count": int(project_count or 0),
            "session_count": int(session_count or 0),
            "username": user.username,
        }
        for (
            user,
            project_count,
            event_count,
            prompt_count,
            session_count,
            latest_activity_at,
        ) in db.execute(
            select(
                User,
                project_count_sq,
                event_count_sq,
                prompt_count_sq,
                session_count_sq,
                latest_activity_at_sq,
            )
            .options(selectinload(User.github_connection))
            .order_by(nullslast(desc(latest_activity_at_sq)), desc(User.created_at))
            .limit(10)
        ).all()
    ]


def _recent_projects(db: Session) -> list[dict[str, Any]]:
    latest_event_at_sq = (
        select(func.max(Event.created_at))
        .where(Event.project_id == Project.id)
        .correlate(Project)
        .scalar_subquery()
    )
    event_count_sq = (
        select(func.count(Event.id))
        .where(Event.project_id == Project.id)
        .correlate(Project)
        .scalar_subquery()
    )
    prompt_count_sq = (
        select(func.count(Event.id))
        .where(Event.project_id == Project.id, Event.event_type == "PromptSubmitted")
        .correlate(Project)
        .scalar_subquery()
    )
    session_count_sq = (
        select(func.count(PromptSession.id))
        .where(PromptSession.project_id == Project.id)
        .correlate(Project)
        .scalar_subquery()
    )
    file_count_sq = (
        select(func.count(ProjectFile.id))
        .where(ProjectFile.project_id == Project.id, ProjectFile.status != "deleted")
        .correlate(Project)
        .scalar_subquery()
    )
    memory_count_sq = (
        select(func.count(Artifact.id))
        .where(Artifact.project_id == Project.id, Artifact.type == MEMORY_ARTIFACT_TYPE)
        .correlate(Project)
        .scalar_subquery()
    )
    latest_memory_at_sq = (
        select(func.max(Artifact.updated_at))
        .where(Artifact.project_id == Project.id, Artifact.type == MEMORY_ARTIFACT_TYPE)
        .correlate(Project)
        .scalar_subquery()
    )
    failed_job_count_sq = (
        select(func.count(ArtifactGenerationJob.id))
        .where(
            ArtifactGenerationJob.project_id == Project.id,
            ArtifactGenerationJob.status == "failed",
        )
        .correlate(Project)
        .scalar_subquery()
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
        memory_count,
        latest_memory_at,
        failed_job_count,
    ) in db.execute(
        select(
            Project,
            User,
            latest_event_at_sq,
            event_count_sq,
            prompt_count_sq,
            session_count_sq,
            file_count_sq,
            memory_count_sq,
            latest_memory_at_sq,
            failed_job_count_sq,
        )
        .join(User, Project.owner_id == User.id)
        .order_by(nullslast(desc(latest_event_at_sq)), desc(Project.updated_at))
        .limit(12)
    ).all():
        projects.append(
            {
                "counts": {
                    "events": int(event_count or 0),
                    "files": int(file_count or 0),
                    "memory": int(memory_count or 0),
                    "prompts": int(prompt_count or 0),
                    "sessions": int(session_count or 0),
                },
                "default_branch": project.default_branch,
                "failed_jobs": int(failed_job_count or 0),
                "github_connected": bool(project.git_remote),
                "id": str(project.id),
                "latest_event_at": _iso(latest_at),
                "latest_memory_at": _iso(latest_memory_at),
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


def _recent_memory_artifacts(db: Session) -> list[dict[str, Any]]:
    return [
        {
            "changed_file_count": len(artifact.changed_files or []),
            "created_at": _iso(artifact.created_at),
            "id": str(artifact.id),
            "project": {
                "id": str(project.id),
                "name": project.name,
            },
            "summary": artifact.summary,
            "title": artifact.title,
            "updated_at": _iso(artifact.updated_at),
        }
        for artifact, project in db.execute(
            select(Artifact, Project)
            .join(Project, Project.id == Artifact.project_id)
            .where(Artifact.type == MEMORY_ARTIFACT_TYPE)
            .order_by(desc(Artifact.updated_at), desc(Artifact.created_at))
            .limit(8)
        ).all()
    ]


def _session_response_gaps(db: Session) -> list[dict[str, Any]]:
    session_activity = (
        select(
            Event.project_id.label("project_id"),
            Event.session_id.label("session_id"),
            func.count(case((Event.event_type == "PromptSubmitted", 1))).label(
                "prompt_count",
            ),
            func.count(case((Event.event_type == "ResponseReceived", 1))).label(
                "response_count",
            ),
            func.max(Event.created_at).label("latest_event_at"),
            func.max(Event.tool).label("tool"),
        )
        .group_by(Event.project_id, Event.session_id)
        .subquery()
    )
    rows = db.execute(
        select(
            session_activity.c.session_id,
            session_activity.c.prompt_count,
            session_activity.c.response_count,
            session_activity.c.latest_event_at,
            session_activity.c.tool,
            Project,
            User,
        )
        .join(Project, Project.id == session_activity.c.project_id)
        .join(User, User.id == Project.owner_id)
        .where(session_activity.c.prompt_count > session_activity.c.response_count)
        .order_by(desc(session_activity.c.latest_event_at))
        .limit(8)
    ).all()
    return [
        {
            "latest_event_at": _iso(latest_event_at),
            "missing_responses": int(prompt_count or 0) - int(response_count or 0),
            "project": {
                "id": str(project.id),
                "name": project.name,
            },
            "prompts": int(prompt_count or 0),
            "responses": int(response_count or 0),
            "session_id": str(session_id),
            "tool": tool,
            "user": {
                "id": str(owner.id),
                "username": owner.username,
            },
        }
        for (
            session_id,
            prompt_count,
            response_count,
            latest_event_at,
            tool,
            project,
            owner,
        ) in rows
    ]


def _recent_events(db: Session) -> list[dict[str, Any]]:
    return [
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


def admin_overview_response(db: Session) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    since_24h = now - timedelta(hours=24)
    since_7d = now - timedelta(days=7)
    stale_job_cutoff = now - timedelta(minutes=30)

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
    failed_jobs = _count(db, ArtifactGenerationJob, ArtifactGenerationJob.status == "failed")
    running_jobs = _count(db, ArtifactGenerationJob, ArtifactGenerationJob.status == "running")
    pending_jobs = _count(db, ArtifactGenerationJob, ArtifactGenerationJob.status == "pending")
    stale_jobs = _count(
        db,
        ArtifactGenerationJob,
        ArtifactGenerationJob.status.in_(["pending", "running"]),
        ArtifactGenerationJob.updated_at < stale_job_cutoff,
    )
    prompts_24h = _count(
        db,
        Event,
        Event.event_type == "PromptSubmitted",
        Event.created_at >= since_24h,
    )
    responses_24h = _count(
        db,
        Event,
        Event.event_type == "ResponseReceived",
        Event.created_at >= since_24h,
    )
    memory_artifacts_24h = _count(
        db,
        Artifact,
        Artifact.type == MEMORY_ARTIFACT_TYPE,
        Artifact.created_at >= since_24h,
    )
    pending_memory_drafts = _pending_memory_draft_artifacts(db)
    pending_memory_project_ids = {
        str(artifact.project_id) for artifact in pending_memory_drafts
    }
    projects_without_repo = _count(db, Project, Project.git_remote.is_(None))
    projects_without_activity = _count(
        db,
        Project,
        ~Project.id.in_(select(Event.project_id).distinct()),
    )
    response_gap = max(total_prompts - total_responses, 0)
    response_gap_24h = max(prompts_24h - responses_24h, 0)
    risks = _operational_risks()

    return {
        "generated_at": _iso(now),
        "action_items": _build_action_items(
            failed_jobs=failed_jobs,
            pending_memory_drafts=len(pending_memory_drafts),
            projects_without_activity=projects_without_activity,
            projects_without_repo=projects_without_repo,
            response_gap=response_gap,
            risks=risks,
            stale_jobs=stale_jobs,
        ),
        "ai_activity": {
            "prompts_24h": prompts_24h,
            "responses_24h": responses_24h,
            "response_gap": response_gap,
            "response_gap_24h": response_gap_24h,
            "session_gaps": _session_response_gaps(db),
        },
        "metrics": {
            "active_collector_tokens": active_tokens,
            "events_24h": _count(db, Event, Event.created_at >= since_24h),
            "events_7d": _count(db, Event, Event.created_at >= since_7d),
            "failed_jobs": failed_jobs,
            "github_connections": github_connections,
            "memory_artifacts": memory_artifacts,
            "memory_artifacts_24h": memory_artifacts_24h,
            "pending_jobs": pending_jobs,
            "pending_memory_drafts": len(pending_memory_drafts),
            "projects": total_projects,
            "projects_without_activity": projects_without_activity,
            "projects_without_repo": projects_without_repo,
            "prompts": total_prompts,
            "prompts_24h": prompts_24h,
            "responses": total_responses,
            "responses_24h": responses_24h,
            "running_jobs": running_jobs,
            "sessions": total_sessions,
            "stale_jobs": stale_jobs,
            "tracked_files": tracked_files,
            "users": total_users,
            "events": total_events,
        },
        "memory_monitor": {
            "failed_jobs": failed_jobs,
            "pending_drafts": len(pending_memory_drafts),
            "pending_projects": len(pending_memory_project_ids),
            "recent_artifacts": _recent_memory_artifacts(db),
            "stale_jobs": stale_jobs,
            "summaries_24h": memory_artifacts_24h,
            "total_summaries": memory_artifacts,
        },
        "project_monitor": {
            "without_activity": projects_without_activity,
            "without_repo": projects_without_repo,
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
        "risks": risks,
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
