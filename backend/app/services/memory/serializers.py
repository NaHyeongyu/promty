from __future__ import annotations

from datetime import datetime
from typing import Any

from app.models.artifact_generation_jobs import ArtifactGenerationJob
from app.models.artifact_versions import ArtifactVersion
from app.models.artifacts import Artifact
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


def _str_or_none(value: Any) -> str | None:
    return value if isinstance(value, str) and value else None


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
        "memory_batch_id": metadata.get("memory_batch_id"),
        "memory_batch_ids": metadata.get("memory_batch_ids") or [],
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
        "source_draft_ids": metadata.get("source_draft_ids") or [],
        "source_session_ids": metadata.get("source_session_ids") or [],
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
) -> dict[str, Any]:
    metadata = artifact.metadata_ if isinstance(artifact.metadata_, dict) else {}
    first_event_at = _str_or_none(metadata.get("first_event_at")) or _iso(artifact.created_at)
    last_event_at = _str_or_none(metadata.get("last_event_at")) or _iso(artifact.updated_at)
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
        "memory_batch_id": metadata.get("memory_batch_id"),
        "memory_batch_ids": metadata.get("memory_batch_ids") or [],
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
        "source_draft_ids": metadata.get("source_draft_ids") or [],
        "source_session_ids": metadata.get("source_session_ids") or [],
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
