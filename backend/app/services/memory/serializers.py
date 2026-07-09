from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session as DBSession

from app.models.artifact_generation_jobs import ArtifactGenerationJob
from app.models.artifact_versions import ArtifactVersion
from app.models.artifacts import Artifact
from app.models.events import Event
from app.services.memory.constants import PROJECT_MEMORY_ARTIFACT_TYPE


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _artifact_stage(artifact: Artifact, metadata: dict[str, Any]) -> str | None:
    stage = metadata.get("artifact_stage")
    if isinstance(stage, str) and stage:
        return stage
    if artifact.type == PROJECT_MEMORY_ARTIFACT_TYPE:
        return "project_memory"
    return None


def _int_or_none(value: Any) -> int | None:
    return value if isinstance(value, int) else None


def _uuid_or_none(value: Any) -> UUID | None:
    if isinstance(value, UUID):
        return value
    if not isinstance(value, str):
        return None
    try:
        return UUID(value)
    except ValueError:
        return None


def _artifact_event_range(
    db: DBSession,
    artifact: Artifact,
    metadata: dict[str, Any],
) -> tuple[str | None, str | None]:
    start_sequence = _int_or_none(metadata.get("start_sequence"))
    end_sequence = _int_or_none(metadata.get("end_sequence"))
    if artifact.session_id and (start_sequence is not None or end_sequence is not None):
        filters = [
            Event.project_id == artifact.project_id,
            Event.session_id == artifact.session_id,
        ]
        if start_sequence is not None:
            filters.append(Event.sequence >= start_sequence)
        if end_sequence is not None:
            filters.append(Event.sequence <= end_sequence)
        first_event_at, last_event_at = db.execute(
            select(func.min(Event.created_at), func.max(Event.created_at)).where(*filters)
        ).one()
        if first_event_at or last_event_at:
            return _iso(first_event_at), _iso(last_event_at or first_event_at)

    event_ids = [
        event_id
        for event_id in (
            _uuid_or_none(metadata.get("first_event_id")),
            _uuid_or_none(metadata.get("last_event_id")),
        )
        if event_id is not None
    ]
    if event_ids:
        first_event_at, last_event_at = db.execute(
            select(func.min(Event.created_at), func.max(Event.created_at)).where(
                Event.id.in_(event_ids)
            )
        ).one()
        if first_event_at or last_event_at:
            return _iso(first_event_at), _iso(last_event_at or first_event_at)

    return None, None


def _artifact_versions(
    db: DBSession,
    artifact: Artifact,
    *,
    limit: int = 8,
) -> list[ArtifactVersion]:
    return list(
        db.execute(
            select(ArtifactVersion)
            .where(ArtifactVersion.artifact_id == artifact.id)
            .order_by(desc(ArtifactVersion.version))
            .limit(limit)
        ).scalars()
    )


def serialize_artifact_version(version: ArtifactVersion) -> dict[str, Any]:
    metadata = version.metadata_ if isinstance(version.metadata_, dict) else {}
    return {
        "changed_file_count": len(version.changed_files or []),
        "changed_files": version.changed_files,
        "commit_sha": version.commit_sha,
        "created_at": _iso(version.created_at),
        "end_sequence": metadata.get("end_sequence"),
        "generator": version.generator,
        "id": str(version.id),
        "memory_scope": metadata.get("memory_scope"),
        "model": version.model,
        "outcome": version.outcome,
        "prompt_count": metadata.get("prompt_count"),
        "reason": version.reason,
        "review_state": metadata.get("review_state"),
        "sections": version.sections,
        "session_id": str(version.session_id) if version.session_id else None,
        "slice_index": metadata.get("slice_index"),
        "start_sequence": metadata.get("start_sequence"),
        "summary": version.summary,
        "tags": version.tags,
        "technologies": version.technologies,
        "title": version.title,
        "version": version.version,
        "window_reason": metadata.get("window_reason"),
    }


def serialize_memory_artifact(artifact: Artifact) -> dict[str, Any]:
    metadata = artifact.metadata_ if isinstance(artifact.metadata_, dict) else {}
    return {
        "changed_file_count": len(artifact.changed_files or []),
        "changed_files": artifact.changed_files,
        "commit_sha": artifact.commit_sha,
        "created_at": _iso(artifact.created_at),
        "artifact_stage": _artifact_stage(artifact, metadata),
        "draft_confidence": metadata.get("draft_confidence"),
        "draft_generator": metadata.get("draft_generator"),
        "draft_type": metadata.get("draft_type"),
        "end_sequence": metadata.get("end_sequence"),
        "fallback_reason": metadata.get("fallback_reason"),
        "first_event_at": metadata.get("first_event_at"),
        "generator": artifact.generator,
        "id": str(artifact.id),
        "last_event_at": metadata.get("last_event_at"),
        "memory_scope": metadata.get("memory_scope"),
        "model": artifact.model,
        "needs_user_verification": metadata.get("needs_user_verification"),
        "outcome": artifact.outcome,
        "prompt_count": metadata.get("prompt_count"),
        "prompt_event_ids": artifact.prompt_event_ids,
        "reason": artifact.reason,
        "requested_generator": metadata.get("requested_generator"),
        "review_state": metadata.get("review_state"),
        "sections": artifact.sections,
        "session_id": str(artifact.session_id) if artifact.session_id else None,
        "slice_index": metadata.get("slice_index"),
        "start_sequence": metadata.get("start_sequence"),
        "summary": artifact.summary,
        "summary_level": metadata.get("summary_level"),
        "suggested_user_action": metadata.get("suggested_user_action"),
        "tags": artifact.tags,
        "technologies": artifact.technologies,
        "title": artifact.title,
        "trigger_reason": metadata.get("trigger_reason"),
        "type": artifact.type,
        "updated_at": _iso(artifact.updated_at),
        "why_it_matters": artifact.reason,
        "window_reason": metadata.get("window_reason"),
    }


def serialize_memory_artifact_summary(
    artifact: Artifact,
    *,
    db: DBSession,
) -> dict[str, Any]:
    metadata = artifact.metadata_ if isinstance(artifact.metadata_, dict) else {}
    first_event_at, last_event_at = _artifact_event_range(db, artifact, metadata)
    return {
        "changed_file_count": len(artifact.changed_files or []),
        "changed_files": artifact.changed_files,
        "commit_sha": artifact.commit_sha,
        "created_at": _iso(artifact.created_at),
        "artifact_stage": _artifact_stage(artifact, metadata),
        "draft_confidence": metadata.get("draft_confidence"),
        "draft_generator": metadata.get("draft_generator"),
        "draft_type": metadata.get("draft_type"),
        "end_sequence": metadata.get("end_sequence"),
        "fallback_reason": metadata.get("fallback_reason"),
        "first_event_at": first_event_at,
        "generator": artifact.generator,
        "id": str(artifact.id),
        "last_event_at": last_event_at,
        "memory_scope": metadata.get("memory_scope"),
        "model": artifact.model,
        "needs_user_verification": metadata.get("needs_user_verification"),
        "outcome": artifact.outcome,
        "prompt_count": metadata.get("prompt_count"),
        "reason": artifact.reason,
        "requested_generator": metadata.get("requested_generator"),
        "review_state": metadata.get("review_state"),
        "sections": artifact.sections,
        "session_id": str(artifact.session_id) if artifact.session_id else None,
        "slice_index": metadata.get("slice_index"),
        "start_sequence": metadata.get("start_sequence"),
        "summary": artifact.summary,
        "summary_level": metadata.get("summary_level"),
        "suggested_user_action": metadata.get("suggested_user_action"),
        "tags": artifact.tags,
        "technologies": artifact.technologies,
        "title": artifact.title,
        "trigger_reason": metadata.get("trigger_reason"),
        "type": artifact.type,
        "updated_at": _iso(artifact.updated_at),
        "why_it_matters": artifact.reason,
        "window_reason": metadata.get("window_reason"),
        "versions": [
            serialize_artifact_version(version)
            for version in _artifact_versions(db, artifact)
        ],
    }


def serialize_generation_job(job: ArtifactGenerationJob) -> dict[str, Any]:
    return {
        "artifact_id": str(job.artifact_id) if job.artifact_id else None,
        "completed_at": _iso(job.completed_at),
        "created_at": _iso(job.created_at),
        "error": job.error,
        "generator": job.generator,
        "id": str(job.id),
        "project_id": str(job.project_id),
        "reason": job.reason,
        "session_id": str(job.session_id),
        "status": job.status,
        "updated_at": _iso(job.updated_at),
    }
