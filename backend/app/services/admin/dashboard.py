from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
from typing import Any
from uuid import UUID

from sqlalchemy import and_, case, desc, func, literal, nullslast, or_, select, true, union_all
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.admin_audit_logs import AdminAuditLog
from app.models.admin_alert_states import AdminAlertState
from app.models.artifacts import Artifact
from app.models.events import Event
from app.models.github_connections import GitHubConnection
from app.models.project_files import ProjectFile
from app.models.projects import Project
from app.models.project_memory_batches import ProjectMemoryBatch
from app.models.public_project_views import PublicProjectView
from app.models.sessions import Session as PromptSession
from app.models.support_inquiries import SupportInquiry
from app.models.tokens import CollectorToken
from app.models.users import User
from app.services.memory.constants import (
    MEMORY_ARTIFACT_TYPE,
    MEMORY_DRAFT_ARTIFACT_TYPE,
    PENDING_DRAFT_STAGE,
    REVIEW_STATE_DRAFT,
)

OPERATIONAL_RISK_KEYS = {
    "app-encryption-key",
    "external-memory-generator",
    "github-token-key",
    "session-cookie-secure",
}

ADMIN_ALERT_KEYS = {
    "generation-failed",
    "generation-stale",
    "memory-pending",
    "projects-no-activity",
    "projects-no-repository",
    "responses-missing-24h",
    "support-notification-failed",
    "support-open",
} | {f"risk:{key}" for key in OPERATIONAL_RISK_KEYS}


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _pending_memory_draft_filter() -> Any:
    return and_(
        Artifact.type == MEMORY_DRAFT_ARTIFACT_TYPE,
        Artifact.metadata_["artifact_stage"].astext == PENDING_DRAFT_STAGE,
        Artifact.metadata_["review_state"].astext == REVIEW_STATE_DRAFT,
    )


def _overview_metrics(
    db: Session,
    *,
    since_24h: datetime,
    since_7d: datetime,
    stale_job_cutoff: datetime,
) -> dict[str, int]:
    """Load all overview counters in one database round-trip.

    Every CTE returns exactly one row. Joining those aggregate rows avoids a
    cross-product between the underlying tables while keeping the dashboard's
    point-in-time counters in one statement.
    """

    user_stats = select(func.count(User.id).label("users")).cte("admin_user_stats")
    project_stats = select(
        func.count(Project.id).label("projects"),
        func.count(Project.id).filter(Project.git_remote.is_(None)).label("projects_without_repo"),
        func.count(Project.id)
        .filter(~select(Event.id).where(Event.project_id == Project.id).exists())
        .label("projects_without_activity"),
    ).cte("admin_project_stats")
    event_stats = select(
        func.count(Event.id).label("events"),
        func.count(Event.id).filter(Event.event_type == "PromptSubmitted").label("prompts"),
        func.count(Event.id).filter(Event.event_type == "ResponseReceived").label("responses"),
        func.count(Event.id).filter(Event.created_at >= since_24h).label("events_24h"),
        func.count(Event.id).filter(Event.created_at >= since_7d).label("events_7d"),
        func.count(Event.id)
        .filter(Event.event_type == "PromptSubmitted", Event.created_at >= since_24h)
        .label("prompts_24h"),
        func.count(Event.id)
        .filter(Event.event_type == "ResponseReceived", Event.created_at >= since_24h)
        .label("responses_24h"),
    ).cte("admin_event_stats")
    session_stats = select(func.count(PromptSession.id).label("sessions")).cte(
        "admin_session_stats"
    )
    file_stats = select(
        func.count(ProjectFile.id).filter(ProjectFile.status != "deleted").label("tracked_files")
    ).cte("admin_file_stats")
    pending_draft_filter = _pending_memory_draft_filter()
    artifact_stats = select(
        func.count(Artifact.id)
        .filter(Artifact.type == MEMORY_ARTIFACT_TYPE)
        .label("memory_artifacts"),
        func.count(Artifact.id)
        .filter(
            Artifact.type == MEMORY_ARTIFACT_TYPE,
            Artifact.created_at >= since_24h,
        )
        .label("memory_artifacts_24h"),
        func.count(Artifact.id).filter(pending_draft_filter).label("pending_memory_drafts"),
        func.count(func.distinct(Artifact.project_id))
        .filter(pending_draft_filter)
        .label("pending_memory_projects"),
    ).cte("admin_artifact_stats")
    token_stats = select(
        func.count(CollectorToken.id)
        .filter(CollectorToken.revoked_at.is_(None))
        .label("active_collector_tokens")
    ).cte("admin_token_stats")
    github_stats = select(
        func.count(GitHubConnection.id)
        .filter(GitHubConnection.revoked_at.is_(None))
        .label("github_connections")
    ).cte("admin_github_stats")
    job_stats = select(
        func.count(ProjectMemoryBatch.id)
        .filter(
            or_(
                ProjectMemoryBatch.status == "failed",
                and_(
                    ProjectMemoryBatch.status == "superseded",
                    ProjectMemoryBatch.result_status == "generation_failed",
                ),
            ),
            ProjectMemoryBatch.updated_at >= since_7d,
        )
        .label("failed_jobs"),
        func.count(ProjectMemoryBatch.id)
        .filter(ProjectMemoryBatch.status == "running")
        .label("running_jobs"),
        func.count(ProjectMemoryBatch.id)
        .filter(ProjectMemoryBatch.status == "pending")
        .label("pending_jobs"),
        func.count(ProjectMemoryBatch.id)
        .filter(
            or_(
                and_(
                    ProjectMemoryBatch.status == "pending",
                    ProjectMemoryBatch.updated_at < stale_job_cutoff,
                ),
                and_(
                    ProjectMemoryBatch.status == "running",
                    ProjectMemoryBatch.lease_expires_at.is_not(None),
                    ProjectMemoryBatch.lease_expires_at < func.now(),
                ),
            )
        )
        .label("stale_jobs"),
    ).cte("admin_job_stats")
    view_stats = select(
        func.count(PublicProjectView.id).label("public_project_views"),
        func.count(PublicProjectView.id)
        .filter(PublicProjectView.viewed_at >= since_24h)
        .label("public_project_views_24h"),
        func.count(PublicProjectView.id)
        .filter(PublicProjectView.viewed_at >= since_7d)
        .label("public_project_views_7d"),
        func.count(func.distinct(PublicProjectView.viewer_id))
        .filter(PublicProjectView.viewed_at >= since_7d)
        .label("unique_public_viewers_7d"),
    ).cte("admin_public_project_view_stats")
    support_stats = select(
        func.count(SupportInquiry.id)
        .filter(SupportInquiry.status != "resolved")
        .label("open_support_inquiries"),
        func.count(SupportInquiry.id)
        .filter(
            SupportInquiry.notification_status == "failed",
            SupportInquiry.updated_at >= since_7d,
        )
        .label("failed_support_notifications"),
    ).cte("admin_support_stats")

    statement = (
        select(
            *user_stats.c,
            *project_stats.c,
            *event_stats.c,
            *session_stats.c,
            *file_stats.c,
            *artifact_stats.c,
            *token_stats.c,
            *github_stats.c,
            *job_stats.c,
            *view_stats.c,
            *support_stats.c,
        )
        .select_from(user_stats)
        .join(project_stats, true())
        .join(event_stats, true())
        .join(session_stats, true())
        .join(file_stats, true())
        .join(artifact_stats, true())
        .join(token_stats, true())
        .join(github_stats, true())
        .join(job_stats, true())
        .join(view_stats, true())
        .join(support_stats, true())
    )
    row = db.execute(statement).mappings().one()
    return {key: int(value or 0) for key, value in row.items()}


def _breakdowns(db: Session, *, limit: int = 12) -> dict[str, list[dict[str, Any]]]:
    dimensions = (
        ("events_by_type", Event.event_type, Event),
        ("events_by_tool", Event.tool, Event),
        ("jobs_by_status", ProjectMemoryBatch.status, ProjectMemoryBatch),
        ("projects_by_visibility", Project.visibility, Project),
    )
    statements = [
        select(
            literal(name).label("dimension"),
            column.label("key"),
            func.count().label("count"),
        )
        .select_from(model)
        .group_by(column)
        for name, column, model in dimensions
    ]
    rows = db.execute(union_all(*statements)).all()
    grouped: dict[str, list[dict[str, Any]]] = {name: [] for name, _column, _model in dimensions}
    for dimension, key, count in rows:
        grouped[dimension].append(
            {
                "count": int(count or 0),
                "key": str(key) if key is not None else "unknown",
            }
        )
    for values in grouped.values():
        values.sort(key=lambda item: item["count"], reverse=True)
        del values[limit:]
    return grouped


def _action_item(
    *,
    area: str,
    key: str,
    count: int | None,
    detail: str,
    severity: str,
    target: str,
    title: str,
    window: str,
) -> dict[str, Any]:
    return {
        "area": area,
        "key": key,
        "count": count,
        "detail": detail,
        "severity": severity,
        "target": target,
        "title": title,
        "window": window,
    }


def _operational_risks() -> list[dict[str, str]]:
    risks: list[dict[str, str]] = []
    if not settings.session_cookie_secure:
        risks.append(
            {
                "detail": "PROMPTHUB_SESSION_COOKIE_SECURE is false.",
                "key": "session-cookie-secure",
                "severity": "high",
                "title": "Session cookie is not marked secure",
            }
        )
    if not settings.github_token_encryption_key:
        risks.append(
            {
                "detail": "GitHub token encryption falls back to another application secret.",
                "key": "github-token-key",
                "severity": "medium",
                "title": "Dedicated GitHub token key is not configured",
            }
        )
    if not settings.app_encryption_key:
        risks.append(
            {
                "detail": "Prompt and response encryption falls back to another application secret.",
                "key": "app-encryption-key",
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
                "key": "external-memory-generator",
                "severity": "info",
                "title": "External memory generation is enabled",
            }
        )
    return risks


def _risk_acknowledgement_state(
    db: Session,
    risks: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    risk_keys = [risk["key"] for risk in risks]
    if not risk_keys:
        return []
    logs = db.scalars(
        select(AdminAuditLog)
        .where(
            AdminAuditLog.resource_type == "risk",
            AdminAuditLog.resource_id.in_(risk_keys),
            AdminAuditLog.action.in_(
                ("admin.risk.acknowledge", "admin.risk.clear_acknowledgement")
            ),
        )
        .order_by(desc(AdminAuditLog.created_at), desc(AdminAuditLog.id))
    ).all()
    latest_by_key: dict[str, AdminAuditLog] = {}
    for log in logs:
        if log.resource_id and log.resource_id not in latest_by_key:
            latest_by_key[log.resource_id] = log
    enriched = []
    for risk in risks:
        latest = latest_by_key.get(risk["key"])
        acknowledged = bool(latest and latest.action == "admin.risk.acknowledge")
        enriched.append(
            {
                **risk,
                "acknowledged": acknowledged,
                "acknowledged_at": _iso(latest.created_at) if acknowledged and latest else None,
                "acknowledged_by": latest.actor_username if acknowledged and latest else None,
            }
        )
    return enriched


def _build_action_items(
    *,
    failed_jobs: int,
    failed_support_notifications: int,
    open_support_inquiries: int,
    pending_memory_drafts: int,
    projects_without_activity: int,
    projects_without_repo: int,
    response_gap: int,
    risks: list[dict[str, Any]],
    stale_jobs: int,
) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    if failed_support_notifications > 0:
        items.append(
            _action_item(
                area="Support",
                key="support-notification-failed",
                count=failed_support_notifications,
                detail="Inquiry email delivery failed in the last 7 days. Review the notification configuration and error.",
                severity="high",
                target="support",
                title="Support notifications failed",
                window="7d",
            )
        )
    if open_support_inquiries > 0:
        items.append(
            _action_item(
                area="Support",
                key="support-open",
                count=open_support_inquiries,
                detail="New or in-progress user inquiries are waiting for an administrator.",
                severity="medium",
                target="support",
                title="Support inquiries need review",
                window="current",
            )
        )
    if failed_jobs > 0:
        items.append(
            _action_item(
                area="AI generation",
                key="generation-failed",
                count=failed_jobs,
                detail="Review generation jobs that failed in the last 7 days before users retry.",
                severity="high",
                target="operations:failed",
                title="Generation jobs failed",
                window="7d",
            )
        )
    if stale_jobs > 0:
        items.append(
            _action_item(
                area="AI generation",
                key="generation-stale",
                count=stale_jobs,
                detail="Pending or running generation jobs have not updated recently.",
                severity="high",
                target="operations:stale",
                title="Generation jobs may be stuck",
                window="current",
            )
        )
    if response_gap > 0:
        items.append(
            _action_item(
                area="AI activity",
                key="responses-missing-24h",
                count=response_gap,
                detail="Prompt submissions exceeded recorded responses in the last 24 hours. Check collector ingestion.",
                severity="medium",
                target="activity",
                title="Responses may be missing",
                window="24h",
            )
        )
    if pending_memory_drafts > 0:
        items.append(
            _action_item(
                area="Memory",
                key="memory-pending",
                count=pending_memory_drafts,
                detail="Generated summaries are waiting to be organized from pending memory.",
                severity="medium",
                target="operations:all",
                title="Pending memory needs attention",
                window="current",
            )
        )
    if projects_without_repo > 0:
        items.append(
            _action_item(
                area="Projects",
                key="projects-no-repository",
                count=projects_without_repo,
                detail="Projects without repositories cannot show file context.",
                severity="info",
                target="projects",
                title="Repositories are not connected",
                window="current",
            )
        )
    if projects_without_activity > 0:
        items.append(
            _action_item(
                area="Projects",
                key="projects-no-activity",
                count=projects_without_activity,
                detail="Projects with no captured events may need onboarding follow-up.",
                severity="info",
                target="projects",
                title="Projects have no activity yet",
                window="current",
            )
        )
    for risk in risks:
        if risk.get("acknowledged"):
            continue
        items.append(
            _action_item(
                area="System",
                key=f"risk:{risk['key']}",
                count=None,
                detail=risk["detail"],
                severity=risk["severity"],
                target="security",
                title=risk["title"],
                window="current",
            )
        )
    severity_order = {"high": 0, "medium": 1, "info": 2}
    return sorted(items, key=lambda item: severity_order.get(item["severity"], 3))


def _condition_hash(item: dict[str, Any]) -> str:
    value = f"{item['key']}:{item.get('count')}:{item['severity']}:{item['window']}"
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _alert_state(
    db: Session,
    *,
    admin_user_id: UUID | None,
    items: list[dict[str, Any]],
    now: datetime,
) -> tuple[list[dict[str, Any]], dict[str, int]]:
    states: dict[str, AdminAlertState] = {}
    if admin_user_id is not None:
        states = {
            state.alert_key: state
            for state in db.scalars(
                select(AdminAlertState).where(AdminAlertState.admin_user_id == admin_user_id)
            ).all()
        }

    visible: list[dict[str, Any]] = []
    summary = {"active": 0, "read": 0, "resolved": 0, "snoozed": 0, "unread": 0}
    for item in items:
        condition_hash = _condition_hash(item)
        state = states.get(item["key"])
        status = "unread"
        snoozed_until: datetime | None = None
        if state is not None and state.condition_hash == condition_hash:
            status = state.status
            snoozed_until = state.snoozed_until
            if status == "snoozed" and (snoozed_until is None or snoozed_until <= now):
                status = "unread"
                snoozed_until = None

        if status == "resolved":
            summary["resolved"] += 1
            continue
        summary["active"] += 1
        summary[status] += 1
        visible.append(
            {
                **item,
                "condition_hash": condition_hash,
                "snoozed_until": _iso(snoozed_until),
                "state": status,
            }
        )
    return visible[:10], summary


def set_admin_alert_state(
    db: Session,
    *,
    admin_user_id: UUID,
    alert_key: str,
    condition_hash: str,
    status: str,
    snooze_hours: int,
) -> dict[str, Any]:
    if alert_key not in ADMIN_ALERT_KEYS:
        raise ValueError("Alert not found")
    now = datetime.now(timezone.utc)
    state = db.scalar(
        select(AdminAlertState).where(
            AdminAlertState.admin_user_id == admin_user_id,
            AdminAlertState.alert_key == alert_key,
        )
    )
    if state is None:
        state = AdminAlertState(admin_user_id=admin_user_id, alert_key=alert_key)
        db.add(state)
    state.condition_hash = condition_hash
    state.status = status
    state.snoozed_until = (
        now + timedelta(hours=snooze_hours) if status == "snoozed" else None
    )
    state.updated_at = now
    db.flush()
    return {
        "condition_hash": state.condition_hash,
        "key": state.alert_key,
        "snoozed_until": _iso(state.snoozed_until),
        "state": state.status,
    }


def _recent_users(db: Session) -> list[dict[str, Any]]:
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
        .cte("admin_recent_user_event_stats")
    )
    session_stats = (
        select(
            PromptSession.project_id.label("project_id"),
            func.count(PromptSession.id).label("session_count"),
        )
        .group_by(PromptSession.project_id)
        .cte("admin_recent_user_session_stats")
    )
    owner_stats = (
        select(
            Project.owner_id.label("owner_id"),
            func.count(Project.id).label("project_count"),
            func.coalesce(func.sum(event_stats.c.event_count), 0).label("event_count"),
            func.coalesce(func.sum(event_stats.c.prompt_count), 0).label("prompt_count"),
            func.coalesce(func.sum(session_stats.c.session_count), 0).label("session_count"),
            func.max(event_stats.c.latest_activity_at).label("latest_activity_at"),
        )
        .outerjoin(event_stats, event_stats.c.project_id == Project.id)
        .outerjoin(session_stats, session_stats.c.project_id == Project.id)
        .group_by(Project.owner_id)
        .cte("admin_recent_user_owner_stats")
    )
    rows = db.execute(
        select(
            User.id,
            User.created_at,
            User.email,
            User.username,
            func.coalesce(owner_stats.c.project_count, 0),
            func.coalesce(owner_stats.c.event_count, 0),
            func.coalesce(owner_stats.c.prompt_count, 0),
            func.coalesce(owner_stats.c.session_count, 0),
            owner_stats.c.latest_activity_at,
            GitHubConnection.id.is_not(None).label("github_connected"),
        )
        .outerjoin(owner_stats, owner_stats.c.owner_id == User.id)
        .outerjoin(
            GitHubConnection,
            and_(
                GitHubConnection.user_id == User.id,
                GitHubConnection.revoked_at.is_(None),
            ),
        )
        .order_by(
            nullslast(desc(owner_stats.c.latest_activity_at)),
            desc(User.created_at),
        )
        .limit(10)
    ).all()
    return [
        {
            "created_at": _iso(created_at),
            "email": email,
            "event_count": int(event_count or 0),
            "github_connected": bool(github_connected),
            "id": str(user_id),
            "latest_activity_at": _iso(latest_activity_at),
            "prompt_count": int(prompt_count or 0),
            "project_count": int(project_count or 0),
            "session_count": int(session_count or 0),
            "username": username,
        }
        for (
            user_id,
            created_at,
            email,
            username,
            project_count,
            event_count,
            prompt_count,
            session_count,
            latest_activity_at,
            github_connected,
        ) in rows
    ]


def _recent_admin_audit_logs(db: Session) -> list[dict[str, Any]]:
    rows = db.execute(
        select(AdminAuditLog)
        .order_by(desc(AdminAuditLog.created_at), desc(AdminAuditLog.id))
        .limit(20)
    ).scalars()
    return [
        {
            "action": audit.action,
            "actor": {
                "github_id": audit.actor_github_id,
                "id": str(audit.actor_user_id) if audit.actor_user_id else None,
                "username": audit.actor_username,
            },
            "created_at": _iso(audit.created_at),
            "id": str(audit.id),
            "request_method": audit.request_method,
            "request_path": audit.request_path,
            "resource_id": audit.resource_id,
            "resource_type": audit.resource_type,
            "status_code": audit.status_code,
        }
        for audit in rows
    ]


def _recent_projects(db: Session) -> list[dict[str, Any]]:
    event_stats = (
        select(
            Event.project_id.label("project_id"),
            func.max(Event.created_at).label("latest_event_at"),
            func.count(Event.id).label("event_count"),
            func.count(Event.id)
            .filter(Event.event_type == "PromptSubmitted")
            .label("prompt_count"),
        )
        .group_by(Event.project_id)
        .cte("admin_recent_project_event_stats")
    )
    session_stats = (
        select(
            PromptSession.project_id.label("project_id"),
            func.count(PromptSession.id).label("session_count"),
        )
        .group_by(PromptSession.project_id)
        .cte("admin_recent_project_session_stats")
    )
    file_stats = (
        select(
            ProjectFile.project_id.label("project_id"),
            func.count(ProjectFile.id).label("file_count"),
        )
        .where(ProjectFile.status != "deleted")
        .group_by(ProjectFile.project_id)
        .cte("admin_recent_project_file_stats")
    )
    memory_stats = (
        select(
            Artifact.project_id.label("project_id"),
            func.count(Artifact.id).label("memory_count"),
            func.max(Artifact.updated_at).label("latest_memory_at"),
        )
        .where(Artifact.type == MEMORY_ARTIFACT_TYPE)
        .group_by(Artifact.project_id)
        .cte("admin_recent_project_memory_stats")
    )
    failed_job_stats = (
        select(
            ProjectMemoryBatch.project_id.label("project_id"),
            func.count(ProjectMemoryBatch.id).label("failed_job_count"),
        )
        .where(
            or_(
                ProjectMemoryBatch.status == "failed",
                and_(
                    ProjectMemoryBatch.status == "superseded",
                    ProjectMemoryBatch.result_status == "generation_failed",
                ),
            )
        )
        .group_by(ProjectMemoryBatch.project_id)
        .cte("admin_recent_project_failed_job_stats")
    )
    view_stats = (
        select(
            PublicProjectView.project_id.label("project_id"),
            func.count(PublicProjectView.id).label("view_count"),
        )
        .group_by(PublicProjectView.project_id)
        .cte("admin_recent_project_view_stats")
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
        view_count,
    ) in db.execute(
        select(
            Project,
            User,
            event_stats.c.latest_event_at,
            func.coalesce(event_stats.c.event_count, 0),
            func.coalesce(event_stats.c.prompt_count, 0),
            func.coalesce(session_stats.c.session_count, 0),
            func.coalesce(file_stats.c.file_count, 0),
            func.coalesce(memory_stats.c.memory_count, 0),
            memory_stats.c.latest_memory_at,
            func.coalesce(failed_job_stats.c.failed_job_count, 0),
            func.coalesce(view_stats.c.view_count, 0),
        )
        .join(User, Project.owner_id == User.id)
        .outerjoin(event_stats, event_stats.c.project_id == Project.id)
        .outerjoin(session_stats, session_stats.c.project_id == Project.id)
        .outerjoin(file_stats, file_stats.c.project_id == Project.id)
        .outerjoin(memory_stats, memory_stats.c.project_id == Project.id)
        .outerjoin(failed_job_stats, failed_job_stats.c.project_id == Project.id)
        .outerjoin(view_stats, view_stats.c.project_id == Project.id)
        .order_by(nullslast(desc(event_stats.c.latest_event_at)), desc(Project.updated_at))
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
                    "views": int(view_count or 0),
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
            "changed_file_count": int(changed_file_count or 0),
            "created_at": _iso(created_at),
            "id": str(artifact_id),
            "project": {
                "id": str(project_id),
                "name": project_name,
            },
            "summary": summary,
            "title": title,
            "updated_at": _iso(updated_at),
        }
        for (
            artifact_id,
            project_id,
            project_name,
            summary,
            title,
            created_at,
            updated_at,
            changed_file_count,
        ) in db.execute(
            select(
                Artifact.id,
                Project.id,
                Project.name,
                Artifact.summary,
                Artifact.title,
                Artifact.created_at,
                Artifact.updated_at,
                func.jsonb_array_length(Artifact.changed_files),
            )
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
            "created_at": _iso(created_at),
            "event_type": event_type,
            "id": str(event_id),
            "project_id": str(project_id),
            "sequence": sequence,
            "session_id": str(session_id) if session_id is not None else None,
            "tool": tool,
        }
        for event_id, project_id, session_id, sequence, tool, event_type, created_at in db.execute(
            select(
                Event.id,
                Event.project_id,
                Event.session_id,
                Event.sequence,
                Event.tool,
                Event.event_type,
                Event.created_at,
            )
            .order_by(desc(Event.created_at), desc(Event.sequence))
            .limit(18)
        ).all()
    ]


def _public_view_analytics(
    db: Session,
    *,
    since_7d: datetime,
) -> dict[str, Any]:
    totals = (
        select(
            PublicProjectView.project_id.label("project_id"),
            func.count(PublicProjectView.id).label("view_count"),
            func.count(PublicProjectView.id)
            .filter(PublicProjectView.viewed_at >= since_7d)
            .label("views_7d"),
        )
        .group_by(PublicProjectView.project_id)
        .cte("admin_top_public_project_views")
    )
    rows = db.execute(
        select(
            Project.id,
            Project.name,
            User.username,
            totals.c.view_count,
            totals.c.views_7d,
        )
        .join(totals, totals.c.project_id == Project.id)
        .join(User, User.id == Project.owner_id)
        .where(Project.visibility == "public")
        .order_by(desc(totals.c.views_7d), desc(totals.c.view_count))
        .limit(8)
    ).all()
    return {
        "top_projects": [
            {
                "id": str(project_id),
                "name": name,
                "owner_username": owner_username,
                "view_count": int(view_count or 0),
                "views_7d": int(views_7d or 0),
            }
            for project_id, name, owner_username, view_count, views_7d in rows
        ]
    }


def admin_overview_response(
    db: Session,
    *,
    admin_user_id: UUID | None = None,
) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    since_24h = now - timedelta(hours=24)
    since_7d = now - timedelta(days=7)
    stale_job_cutoff = now - timedelta(minutes=30)

    metrics = _overview_metrics(
        db,
        since_24h=since_24h,
        since_7d=since_7d,
        stale_job_cutoff=stale_job_cutoff,
    )
    total_users = metrics["users"]
    total_projects = metrics["projects"]
    total_events = metrics["events"]
    total_sessions = metrics["sessions"]
    total_prompts = metrics["prompts"]
    total_responses = metrics["responses"]
    tracked_files = metrics["tracked_files"]
    memory_artifacts = metrics["memory_artifacts"]
    active_tokens = metrics["active_collector_tokens"]
    github_connections = metrics["github_connections"]
    failed_jobs = metrics["failed_jobs"]
    running_jobs = metrics["running_jobs"]
    pending_jobs = metrics["pending_jobs"]
    stale_jobs = metrics["stale_jobs"]
    prompts_24h = metrics["prompts_24h"]
    responses_24h = metrics["responses_24h"]
    memory_artifacts_24h = metrics["memory_artifacts_24h"]
    pending_memory_drafts = metrics["pending_memory_drafts"]
    pending_memory_projects = metrics["pending_memory_projects"]
    projects_without_repo = metrics["projects_without_repo"]
    projects_without_activity = metrics["projects_without_activity"]
    failed_support_notifications = metrics["failed_support_notifications"]
    open_support_inquiries = metrics["open_support_inquiries"]
    response_gap = max(total_prompts - total_responses, 0)
    response_gap_24h = max(prompts_24h - responses_24h, 0)
    risks = _risk_acknowledgement_state(db, _operational_risks())
    breakdowns = _breakdowns(db)

    raw_action_items = _build_action_items(
        failed_jobs=failed_jobs,
        failed_support_notifications=failed_support_notifications,
        open_support_inquiries=open_support_inquiries,
        pending_memory_drafts=pending_memory_drafts,
        projects_without_activity=projects_without_activity,
        projects_without_repo=projects_without_repo,
        response_gap=response_gap_24h,
        risks=risks,
        stale_jobs=stale_jobs,
    )
    action_items, action_summary = _alert_state(
        db,
        admin_user_id=admin_user_id,
        items=raw_action_items,
        now=now,
    )

    return {
        "generated_at": _iso(now),
        "action_items": action_items,
        "action_summary": action_summary,
        "ai_activity": {
            "prompts_24h": prompts_24h,
            "responses_24h": responses_24h,
            "response_gap": response_gap,
            "response_gap_24h": response_gap_24h,
            "session_gaps": _session_response_gaps(db),
        },
        "metrics": {
            "active_collector_tokens": active_tokens,
            "events_24h": metrics["events_24h"],
            "events_7d": metrics["events_7d"],
            "failed_jobs": failed_jobs,
            "failed_support_notifications": failed_support_notifications,
            "github_connections": github_connections,
            "memory_artifacts": memory_artifacts,
            "memory_artifacts_24h": memory_artifacts_24h,
            "open_support_inquiries": open_support_inquiries,
            "pending_jobs": pending_jobs,
            "pending_memory_drafts": pending_memory_drafts,
            "projects": total_projects,
            "projects_without_activity": projects_without_activity,
            "projects_without_repo": projects_without_repo,
            "public_project_views": metrics["public_project_views"],
            "public_project_views_24h": metrics["public_project_views_24h"],
            "public_project_views_7d": metrics["public_project_views_7d"],
            "prompts": total_prompts,
            "prompts_24h": prompts_24h,
            "responses": total_responses,
            "responses_24h": responses_24h,
            "running_jobs": running_jobs,
            "sessions": total_sessions,
            "stale_jobs": stale_jobs,
            "tracked_files": tracked_files,
            "unique_public_viewers_7d": metrics["unique_public_viewers_7d"],
            "users": total_users,
            "events": total_events,
        },
        "memory_monitor": {
            "failed_jobs": failed_jobs,
            "pending_drafts": pending_memory_drafts,
            "pending_projects": pending_memory_projects,
            "recent_artifacts": _recent_memory_artifacts(db),
            "stale_jobs": stale_jobs,
            "summaries_24h": memory_artifacts_24h,
            "total_summaries": memory_artifacts,
        },
        "project_monitor": {
            "without_activity": projects_without_activity,
            "without_repo": projects_without_repo,
        },
        "view_analytics": {
            **_public_view_analytics(db, since_7d=since_7d),
            "total_views": metrics["public_project_views"],
            "views_24h": metrics["public_project_views_24h"],
            "views_7d": metrics["public_project_views_7d"],
            "unique_viewers_7d": metrics["unique_public_viewers_7d"],
        },
        "breakdowns": breakdowns,
        "recent_events": _recent_events(db),
        "recent_admin_audit_logs": _recent_admin_audit_logs(db),
        "recent_projects": _recent_projects(db),
        "recent_users": _recent_users(db),
        "risks": risks,
        "system": {
            "admin_configured": bool(settings.admin_github_ids),
            "admin_audit_retention_days": settings.admin_audit_retention_days,
            "admin_rate_limit": {
                "requests": settings.admin_rate_limit_requests,
                "window_seconds": settings.admin_rate_limit_window_seconds,
            },
            "app_url": settings.app_url,
            "auth_rate_limit": {
                "requests": settings.auth_rate_limit_requests,
                "window_seconds": settings.auth_rate_limit_window_seconds,
            },
            "cors_origins": list(settings.cors_origins),
            "gemini_configured": bool(settings.gemini_api_key),
            "openai_configured": bool(settings.openai_api_key),
            "memory_generators": {
                "draft": settings.memory_draft_generator,
                "project": settings.project_memory_generator,
            },
            "published_flows_enabled": settings.published_flows_enabled,
            "session_cookie_secure": settings.session_cookie_secure,
            "session_cookie_samesite": settings.session_cookie_samesite,
        },
    }
