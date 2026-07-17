from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
import os
import platform
import time
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import String, and_, cast, delete, desc, func, or_, select, text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import is_admin_user
from app.core.time import utc_now
from app.db.session import engine
from app.models.artifacts import Artifact
from app.models.events import Event
from app.models.project_memory_batches import (
    ProjectMemoryBatch,
    ProjectMemoryBatchItem,
)
from app.models.projects import Project
from app.models.sessions import Session as PromptSession
from app.models.tokens import CollectorToken
from app.models.users import User
from app.services.account_settings import create_collector_token_response
from app.services.event_payload_security import decrypt_event_payload
from app.services.projects.management import slugify_project_name

_STARTED_AT = datetime.now(timezone.utc)
_STARTED_MONOTONIC = time.monotonic()
_EVENT_SEARCH_SCAN_LIMIT = 5_000
_EXPORT_EVENT_LIMIT = 10_000


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _user_or_404(db: Session, user_id: UUID) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


def _project_or_404(db: Session, project_id: UUID) -> Project:
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


def _confirm(expected: str, confirmation: str) -> None:
    if confirmation != expected:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f'Type "{expected}" to confirm this administrator action.',
        )


def _prevent_admin_self_action(actor: User, target: User, action: str) -> None:
    if actor.id == target.id or is_admin_user(target):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"The configured administrator cannot be {action} from the console.",
        )


def _normalize_tags(tags: list[str]) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for value in tags:
        tag = " ".join(str(value).strip().lower().split())[:40]
        if not tag or tag in seen:
            continue
        seen.add(tag)
        normalized.append(tag)
        if len(normalized) >= 12:
            break
    return normalized


def _delete_memory_batch_items_for_projects(db: Session, project_ids: Any) -> None:
    batch_ids = select(ProjectMemoryBatch.id).where(ProjectMemoryBatch.project_id.in_(project_ids))
    db.execute(delete(ProjectMemoryBatchItem).where(ProjectMemoryBatchItem.batch_id.in_(batch_ids)))


def _available_slug(
    db: Session,
    *,
    owner_id: UUID,
    requested: str,
    project_id: UUID | None = None,
) -> str:
    slug = slugify_project_name(requested)
    existing = db.scalar(
        select(Project.id).where(
            Project.owner_id == owner_id,
            Project.slug == slug,
            *(tuple() if project_id is None else (Project.id != project_id,)),
        )
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Project URL is already in use for this owner.",
        )
    return slug


def _serialize_project(project: Project, owner: User) -> dict[str, Any]:
    return {
        "created_at": _iso(project.created_at),
        "default_branch": project.default_branch,
        "description": project.description,
        "github_url": project.git_remote,
        "id": str(project.id),
        "name": project.name,
        "owner": {"id": str(owner.id), "username": owner.username},
        "project_url": project.project_url,
        "slug": project.slug,
        "tags": project.tags or [],
        "updated_at": _iso(project.updated_at),
        "visibility": project.visibility,
    }


def suspend_admin_user_response(
    db: Session,
    *,
    actor: User,
    confirmation: str,
    reason: str,
    user_id: UUID,
) -> dict[str, Any]:
    user = _user_or_404(db, user_id)
    _prevent_admin_self_action(actor, user, "suspended")
    _confirm(user.username, confirmation)
    if user.suspended_at is None:
        user.suspended_at = utc_now()
    user.suspension_reason = reason.strip()[:500]
    db.flush()
    return {
        "status": "suspended",
        "suspended_at": _iso(user.suspended_at),
        "suspension_reason": user.suspension_reason,
        "user_id": str(user.id),
    }


def restore_admin_user_response(
    db: Session,
    *,
    actor: User,
    confirmation: str,
    user_id: UUID,
) -> dict[str, Any]:
    user = _user_or_404(db, user_id)
    _prevent_admin_self_action(actor, user, "restored")
    _confirm(user.username, confirmation)
    user.suspended_at = None
    user.suspension_reason = None
    db.flush()
    return {"status": "active", "user_id": str(user.id)}


def delete_admin_user_response(
    db: Session,
    *,
    actor: User,
    confirmation: str,
    user_id: UUID,
) -> dict[str, Any]:
    user = _user_or_404(db, user_id)
    _prevent_admin_self_action(actor, user, "deleted")
    _confirm(user.username, confirmation)
    counts = {
        "collector_tokens": int(
            db.scalar(
                select(func.count(CollectorToken.id)).where(CollectorToken.user_id == user.id)
            )
            or 0
        ),
        "projects": int(
            db.scalar(select(func.count(Project.id)).where(Project.owner_id == user.id)) or 0
        ),
    }
    deleted = {"counts": counts, "user_id": str(user.id), "username": user.username}
    owned_project_ids = select(Project.id).where(Project.owner_id == user.id)
    _delete_memory_batch_items_for_projects(db, owned_project_ids)
    db.execute(
        delete(User).where(User.id == user.id).execution_options(synchronize_session="fetch")
    )
    db.flush()
    db.expire_all()
    return deleted


def create_admin_collector_token_response(
    db: Session,
    *,
    confirmation: str,
    name: str,
    user_id: UUID,
) -> dict[str, Any]:
    user = _user_or_404(db, user_id)
    _confirm(user.username, confirmation)
    if user.suspended_at is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Collector tokens cannot be issued to a suspended user.",
        )
    return create_collector_token_response(db, name=name, user=user)


def create_admin_project_response(
    db: Session,
    *,
    confirmation: str,
    default_branch: str,
    description: str | None,
    github_url: str | None,
    name: str,
    owner_id: UUID,
    project_url: str | None,
    requested_slug: str | None,
    tags: list[str],
    visibility: str,
) -> dict[str, Any]:
    owner = _user_or_404(db, owner_id)
    _confirm(owner.username, confirmation)
    slug = _available_slug(
        db,
        owner_id=owner.id,
        requested=requested_slug or name,
    )
    project = Project(
        default_branch=default_branch,
        description=description,
        git_remote=github_url,
        name=name,
        owner_id=owner.id,
        project_url=project_url,
        slug=slug,
        tags=_normalize_tags(tags),
        visibility=visibility,
    )
    db.add(project)
    db.flush()
    return _serialize_project(project, owner)


def update_admin_project_response(
    db: Session,
    *,
    confirmation: str,
    fields: dict[str, Any],
    project_id: UUID,
) -> dict[str, Any]:
    project = _project_or_404(db, project_id)
    owner = _user_or_404(db, project.owner_id)
    _confirm(project.slug, confirmation)
    if "slug" in fields and fields["slug"] is not None:
        project.slug = _available_slug(
            db,
            owner_id=project.owner_id,
            project_id=project.id,
            requested=fields["slug"],
        )
    for field_name, model_name in (
        ("name", "name"),
        ("description", "description"),
        ("github_url", "git_remote"),
        ("default_branch", "default_branch"),
        ("project_url", "project_url"),
        ("visibility", "visibility"),
    ):
        if field_name in fields and (
            fields[field_name] is not None
            or field_name in {"description", "github_url", "project_url"}
        ):
            setattr(project, model_name, fields[field_name])
    if "tags" in fields and fields["tags"] is not None:
        project.tags = _normalize_tags(fields["tags"])
    project.updated_at = utc_now()
    db.flush()
    return _serialize_project(project, owner)


def delete_admin_project_response(
    db: Session,
    *,
    confirmation: str,
    project_id: UUID,
) -> dict[str, Any]:
    project = _project_or_404(db, project_id)
    _confirm(project.slug, confirmation)
    counts = {
        "artifacts": int(
            db.scalar(select(func.count(Artifact.id)).where(Artifact.project_id == project.id)) or 0
        ),
        "events": int(
            db.scalar(select(func.count(Event.id)).where(Event.project_id == project.id)) or 0
        ),
        "sessions": int(
            db.scalar(
                select(func.count(PromptSession.id)).where(PromptSession.project_id == project.id)
            )
            or 0
        ),
    }
    deleted = {
        "counts": counts,
        "name": project.name,
        "project_id": str(project.id),
        "slug": project.slug,
    }
    _delete_memory_batch_items_for_projects(db, select(Project.id).where(Project.id == project.id))
    db.execute(
        delete(Project)
        .where(Project.id == project.id)
        .execution_options(synchronize_session="fetch")
    )
    db.flush()
    db.expire_all()
    return deleted


def _batch_filters(job_status: str | None, stale_cutoff: datetime) -> list[Any]:
    if job_status == "stale":
        return [
            or_(
                and_(
                    ProjectMemoryBatch.status == "running",
                    ProjectMemoryBatch.lease_expires_at.is_not(None),
                    ProjectMemoryBatch.lease_expires_at < utc_now(),
                ),
                and_(
                    ProjectMemoryBatch.status == "pending",
                    ProjectMemoryBatch.updated_at < stale_cutoff,
                ),
            )
        ]
    if job_status:
        return [ProjectMemoryBatch.status == job_status]
    return []


def admin_memory_jobs_response(
    db: Session,
    *,
    job_status: str | None,
    limit: int,
    offset: int,
    query: str | None = None,
) -> dict[str, Any]:
    stale_cutoff = datetime.now(timezone.utc) - timedelta(minutes=30)
    filters = _batch_filters(job_status, stale_cutoff)
    if query and query.strip():
        pattern = f"%{query.strip()}%"
        filters.append(
            or_(
                cast(ProjectMemoryBatch.id, String).ilike(pattern),
                ProjectMemoryBatch.error_code.ilike(pattern),
                ProjectMemoryBatch.error_message.ilike(pattern),
                Project.name.ilike(pattern),
                Project.slug.ilike(pattern),
                User.username.ilike(pattern),
            )
        )
    base_statement = (
        select(ProjectMemoryBatch.id)
        .join(Project, Project.id == ProjectMemoryBatch.project_id)
        .join(User, User.id == Project.owner_id)
        .where(*filters)
    )
    total = int(db.scalar(select(func.count()).select_from(base_statement.subquery())) or 0)
    rows = db.execute(
        select(ProjectMemoryBatch, Project, User)
        .join(Project, Project.id == ProjectMemoryBatch.project_id)
        .join(User, User.id == Project.owner_id)
        .where(*filters)
        .order_by(desc(ProjectMemoryBatch.updated_at), desc(ProjectMemoryBatch.created_at))
        .limit(limit)
        .offset(offset)
    ).all()
    items = []
    now = datetime.now(timezone.utc)
    for batch, project, owner in rows:
        updated_at = batch.updated_at
        if updated_at is not None and updated_at.tzinfo is None:
            updated_at = updated_at.replace(tzinfo=timezone.utc)
        stale = bool(
            (
                batch.status == "running"
                and batch.lease_expires_at is not None
                and batch.lease_expires_at < now
            )
            or (batch.status == "pending" and updated_at is not None and updated_at < stale_cutoff)
        )
        retryable = bool(
            batch.status == "superseded"
            and batch.result_status == "admin_cancelled_before_start"
            and batch.attempt_count == 0
        )
        items.append(
            {
                "attempt_count": batch.attempt_count,
                "cancellable": batch.status in {"pending", "running"},
                "completed_at": _iso(batch.completed_at),
                "created_at": _iso(batch.created_at),
                "error": batch.error_message,
                "error_code": batch.error_code,
                "generator": settings.project_memory_generator,
                "id": str(batch.id),
                "lease_expires_at": _iso(batch.lease_expires_at),
                "owner": {"id": str(owner.id), "username": owner.username},
                "project": {
                    "id": str(project.id),
                    "name": project.name,
                    "slug": project.slug,
                },
                "reason": "project-memory",
                "result_status": batch.result_status,
                "retryable": retryable,
                "session_id": (batch.source_session_ids or [None])[0],
                "stale": stale,
                "status": batch.status,
                "updated_at": _iso(batch.updated_at),
            }
        )
    return {"items": items, "limit": limit, "offset": offset, "total": total}


def _batch_and_project_for_update(
    db: Session,
    batch_id: UUID,
) -> tuple[ProjectMemoryBatch, Project]:
    row = db.execute(
        select(ProjectMemoryBatch, Project)
        .join(Project, Project.id == ProjectMemoryBatch.project_id)
        .where(ProjectMemoryBatch.id == batch_id)
        .with_for_update(of=ProjectMemoryBatch)
    ).one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project Memory job not found",
        )
    return row


def cancel_admin_memory_job_response(
    db: Session,
    *,
    batch_id: UUID,
    confirmation: str,
) -> dict[str, Any]:
    batch, project = _batch_and_project_for_update(db, batch_id)
    _confirm(project.slug, confirmation)
    if batch.status not in {"pending", "running"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only pending or running jobs can be cancelled.",
        )
    was_running = batch.status == "running"
    if was_running:
        batch.attempt_count += 1
    now = utc_now()
    batch.status = "superseded"
    batch.result_status = (
        "admin_cancelled_after_start" if was_running else "admin_cancelled_before_start"
    )
    batch.error_code = "admin_cancelled"
    batch.error_message = "Cancelled by the administrator."
    batch.lease_expires_at = None
    batch.completed_at = now
    batch.updated_at = now
    batch.chunk_results = {}
    db.flush()
    return {
        "batch_id": str(batch.id),
        "external_call_may_complete": was_running,
        "retryable": not was_running,
        "status": "cancelled",
    }


def retry_admin_memory_job_response(
    db: Session,
    *,
    batch_id: UUID,
    confirmation: str,
) -> dict[str, Any]:
    batch, project = _batch_and_project_for_update(db, batch_id)
    _confirm(project.slug, confirmation)
    if not (
        batch.status == "superseded"
        and batch.result_status == "admin_cancelled_before_start"
        and batch.attempt_count == 0
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This job cannot be retried safely because provider work may have started.",
        )
    draft_rows = db.execute(
        select(Artifact)
        .join(ProjectMemoryBatchItem, ProjectMemoryBatchItem.draft_id == Artifact.id)
        .where(ProjectMemoryBatchItem.batch_id == batch.id)
    ).scalars()
    if any(
        (draft.metadata_ if isinstance(draft.metadata_, dict) else {}).get("sent_to_ai_at")
        for draft in draft_rows
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This job cannot be retried because provider work already started.",
        )
    batch.status = "pending"
    batch.result_status = None
    batch.error_code = None
    batch.error_message = None
    batch.completed_at = None
    batch.updated_at = utc_now()
    db.flush()
    return {"batch_id": str(batch.id), "status": "pending"}


def _event_conditions(
    *,
    event_type: str | None,
    project_id: UUID | None,
    user_id: UUID | None,
) -> list[Any]:
    conditions: list[Any] = []
    if event_type:
        conditions.append(Event.event_type == event_type)
    if project_id:
        conditions.append(Event.project_id == project_id)
    if user_id:
        conditions.append(Project.owner_id == user_id)
    return conditions


def _serialize_event(event: Event, project: Project, owner: User) -> dict[str, Any]:
    return {
        "created_at": _iso(event.created_at),
        "event_type": event.event_type,
        "id": str(event.id),
        "owner": {"id": str(owner.id), "username": owner.username},
        "payload": decrypt_event_payload(event.event_type, event.payload),
        "project": {
            "id": str(project.id),
            "name": project.name,
            "slug": project.slug,
        },
        "schema_version": event.schema_version,
        "sequence": event.sequence,
        "session_id": str(event.session_id),
        "tool": event.tool,
    }


def admin_events_response(
    db: Session,
    *,
    event_type: str | None,
    limit: int,
    offset: int,
    project_id: UUID | None,
    query: str | None,
    user_id: UUID | None,
) -> dict[str, Any]:
    conditions = _event_conditions(
        event_type=event_type,
        project_id=project_id,
        user_id=user_id,
    )
    statement = (
        select(Event, Project, User)
        .join(Project, Project.id == Event.project_id)
        .join(User, User.id == Project.owner_id)
        .where(*conditions)
        .order_by(desc(Event.created_at), desc(Event.sequence))
    )
    if not query:
        total = int(
            db.scalar(
                select(func.count(Event.id))
                .join(Project, Project.id == Event.project_id)
                .where(*conditions)
            )
            or 0
        )
        rows = db.execute(statement.limit(limit).offset(offset)).all()
        return {
            "items": [_serialize_event(*row) for row in rows],
            "limit": limit,
            "offset": offset,
            "search_truncated": False,
            "total": total,
        }

    normalized_query = query.casefold().strip()
    candidates = db.execute(statement.limit(_EVENT_SEARCH_SCAN_LIMIT)).all()
    matched = []
    for event, project, owner in candidates:
        item = _serialize_event(event, project, owner)
        searchable = json.dumps(item, ensure_ascii=False, default=str).casefold()
        if normalized_query in searchable:
            matched.append(item)
    return {
        "items": matched[offset : offset + limit],
        "limit": limit,
        "offset": offset,
        "search_truncated": len(candidates) >= _EVENT_SEARCH_SCAN_LIMIT,
        "total": len(matched),
    }


def export_admin_events_response(
    db: Session,
    *,
    event_type: str | None,
    project_id: UUID | None,
    query: str | None,
    user_id: UUID | None,
) -> dict[str, Any]:
    result = admin_events_response(
        db,
        event_type=event_type,
        limit=_EXPORT_EVENT_LIMIT,
        offset=0,
        project_id=project_id,
        query=query,
        user_id=user_id,
    )
    return {
        "exported_at": _iso(utc_now()),
        "filters": {
            "event_type": event_type,
            "project_id": str(project_id) if project_id else None,
            "query": query,
            "user_id": str(user_id) if user_id else None,
        },
        "items": result["items"],
        "total_matching": result["total"],
        "truncated": result["total"] > len(result["items"]) or result["search_truncated"],
    }


def export_admin_project_response(
    db: Session,
    *,
    confirmation: str,
    include_payloads: bool,
    project_id: UUID,
) -> dict[str, Any]:
    project = _project_or_404(db, project_id)
    _confirm(project.slug, confirmation)
    owner = _user_or_404(db, project.owner_id)
    sessions = db.scalars(
        select(PromptSession)
        .where(PromptSession.project_id == project.id)
        .order_by(PromptSession.started_at)
    ).all()
    event_rows = db.scalars(
        select(Event)
        .where(Event.project_id == project.id)
        .order_by(Event.created_at, Event.sequence)
        .limit(_EXPORT_EVENT_LIMIT)
    ).all()
    artifacts = db.scalars(
        select(Artifact).where(Artifact.project_id == project.id).order_by(Artifact.created_at)
    ).all()
    return {
        "artifacts": [
            {
                "created_at": _iso(artifact.created_at),
                "generator": artifact.generator,
                "id": str(artifact.id),
                "metadata": artifact.metadata_,
                "model": artifact.model,
                "sections": artifact.sections,
                "summary": artifact.summary,
                "tags": artifact.tags,
                "title": artifact.title,
                "type": artifact.type,
                "updated_at": _iso(artifact.updated_at),
            }
            for artifact in artifacts
        ],
        "events": [
            {
                "created_at": _iso(event.created_at),
                "event_type": event.event_type,
                "id": str(event.id),
                "payload": (
                    decrypt_event_payload(event.event_type, event.payload)
                    if include_payloads
                    else None
                ),
                "sequence": event.sequence,
                "session_id": str(event.session_id),
                "tool": event.tool,
            }
            for event in event_rows
        ],
        "exported_at": _iso(utc_now()),
        "owner": {"id": str(owner.id), "username": owner.username},
        "project": _serialize_project(project, owner),
        "sessions": [
            {
                "branch": session.branch,
                "ended_at": _iso(session.ended_at),
                "id": str(session.id),
                "model": session.model,
                "started_at": _iso(session.started_at),
                "tool": session.tool,
            }
            for session in sessions
        ],
        "truncated": len(event_rows) >= _EXPORT_EVENT_LIMIT,
    }


def admin_system_response(db: Session) -> dict[str, Any]:
    dialect = db.bind.dialect.name if db.bind is not None else "unknown"
    database: dict[str, Any] = {
        "dialect": dialect,
        "pool": engine.pool.status(),
        "size_bytes": None,
        "table_sizes": [],
        "connections": {},
        "migration": None,
    }
    if dialect == "postgresql":
        database["size_bytes"] = int(
            db.scalar(text("SELECT pg_database_size(current_database())")) or 0
        )
        database["migration"] = db.scalar(text("SELECT version_num FROM alembic_version"))
        database["connections"] = {
            str(state or "unknown"): int(count or 0)
            for state, count in db.execute(
                text(
                    "SELECT state, count(*) FROM pg_stat_activity "
                    "WHERE datname = current_database() GROUP BY state"
                )
            ).all()
        }
        database["table_sizes"] = [
            {"name": name, "size_bytes": int(size_bytes or 0)}
            for name, size_bytes in db.execute(
                text(
                    "SELECT relname, pg_total_relation_size(relid) "
                    "FROM pg_catalog.pg_statio_user_tables "
                    "ORDER BY pg_total_relation_size(relid) DESC LIMIT 12"
                )
            ).all()
        ]

    pending_batches = int(
        db.scalar(
            select(func.count(ProjectMemoryBatch.id)).where(ProjectMemoryBatch.status == "pending")
        )
        or 0
    )
    running_batches = int(
        db.scalar(
            select(func.count(ProjectMemoryBatch.id)).where(ProjectMemoryBatch.status == "running")
        )
        or 0
    )
    return {
        "database": database,
        "deployment": {
            "environment": os.environ.get("PROMPTHUB_ENVIRONMENT", "development"),
            "release_sha": os.environ.get("PROMPTHUB_RELEASE_SHA") or os.environ.get("GITHUB_SHA"),
            "region": settings.aws_region,
        },
        "providers": {
            "gemini": {
                "configured": bool(settings.gemini_api_key),
                "model": settings.gemini_model,
            },
            "openai": {
                "configured": bool(settings.openai_api_key),
                "model": settings.openai_model,
            },
            "real_billing_available": False,
        },
        "runtime": {
            "api_url": settings.api_public_url,
            "app_url": settings.app_url,
            "platform": platform.platform(),
            "python": platform.python_version(),
            "started_at": _iso(_STARTED_AT),
            "uptime_seconds": round(time.monotonic() - _STARTED_MONOTONIC),
        },
        "worker": {
            "pending_batches": pending_batches,
            "running_batches": running_batches,
            "status": "active" if running_batches > 0 else "idle_or_external",
        },
    }
