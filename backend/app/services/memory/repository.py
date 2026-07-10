from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session as DBSession

from app.core.time import utc_now
from app.models.artifact_versions import ArtifactVersion
from app.models.artifacts import Artifact
from app.models.events import Event
from app.services.memory.constants import LOCAL_MEMORY_GENERATOR


def _iso(value: Any) -> str | None:
    return value.isoformat() if value else None


def payload_from_artifact(
    artifact: Artifact,
    *,
    overrides: dict[str, Any] | None = None,
) -> dict[str, Any]:
    metadata = artifact.metadata_ if isinstance(artifact.metadata_, dict) else {}
    payload = {
        "changed_files": artifact.changed_files or [],
        "commit_sha": artifact.commit_sha,
        "event_count": metadata.get("event_count") or 0,
        "first_event_id": metadata.get("first_event_id"),
        "generator": artifact.generator or LOCAL_MEMORY_GENERATOR,
        "last_event_id": metadata.get("last_event_id"),
        "model": artifact.model,
        "outcome": artifact.outcome,
        "prompt_event_ids": artifact.prompt_event_ids or [],
        "reason": artifact.reason,
        "sections": artifact.sections or [],
        "summary": artifact.summary,
        "tags": artifact.tags or [],
        "technologies": artifact.technologies or [],
        "title": artifact.title,
        "tool": metadata.get("tool"),
    }
    if overrides:
        payload.update({key: value for key, value in overrides.items() if value is not None})
    return payload


def _next_artifact_version(db: DBSession, artifact_id: UUID) -> int:
    latest_version = db.scalar(
        select(func.max(ArtifactVersion.version)).where(
            ArtifactVersion.artifact_id == artifact_id,
        )
    )
    return (latest_version or 0) + 1


def _create_artifact_version(
    db: DBSession,
    *,
    artifact: Artifact,
    generation_metadata: dict[str, Any],
    payload: dict[str, Any],
) -> ArtifactVersion:
    version = _next_artifact_version(db, artifact.id)
    artifact_version = ArtifactVersion(
        artifact_id=artifact.id,
        project_id=artifact.project_id,
        session_id=artifact.session_id,
        version=version,
        title=payload["title"],
        summary=payload["summary"],
        reason=payload["reason"],
        outcome=payload["outcome"],
        technologies=payload["technologies"],
        sections=payload["sections"],
        tags=payload["tags"],
        changed_files=payload["changed_files"],
        prompt_event_ids=payload["prompt_event_ids"],
        commit_sha=payload["commit_sha"],
        generator=payload["generator"],
        model=payload["model"],
        metadata_={
            "event_count": payload["event_count"],
            "first_event_id": payload["first_event_id"],
            "last_event_id": payload["last_event_id"],
            "tool": payload["tool"],
            **generation_metadata,
        },
    )
    db.add(artifact_version)
    db.flush()
    return artifact_version


def _event_range_metadata(
    db: DBSession,
    *,
    metadata: dict[str, Any],
    project_id: UUID,
    session_id: UUID | None,
) -> dict[str, str | None]:
    existing_first = metadata.get("first_event_at")
    existing_last = metadata.get("last_event_at")
    if isinstance(existing_first, str) and isinstance(existing_last, str):
        return {
            "first_event_at": existing_first,
            "last_event_at": existing_last,
        }

    start_sequence = metadata.get("start_sequence")
    end_sequence = metadata.get("end_sequence")
    if session_id and (isinstance(start_sequence, int) or isinstance(end_sequence, int)):
        filters = [
            Event.project_id == project_id,
            Event.session_id == session_id,
        ]
        if isinstance(start_sequence, int):
            filters.append(Event.sequence >= start_sequence)
        if isinstance(end_sequence, int):
            filters.append(Event.sequence <= end_sequence)
        first_event_at, last_event_at = db.execute(
            select(func.min(Event.created_at), func.max(Event.created_at)).where(*filters)
        ).one()
        if first_event_at or last_event_at:
            return {
                "first_event_at": _iso(first_event_at),
                "last_event_at": _iso(last_event_at or first_event_at),
            }

    event_ids: list[UUID] = []
    for raw_event_id in (metadata.get("first_event_id"), metadata.get("last_event_id")):
        if isinstance(raw_event_id, UUID):
            event_ids.append(raw_event_id)
            continue
        if isinstance(raw_event_id, str) and raw_event_id:
            try:
                event_ids.append(UUID(raw_event_id))
            except ValueError:
                continue
    if event_ids:
        first_event_at, last_event_at = db.execute(
            select(func.min(Event.created_at), func.max(Event.created_at)).where(
                Event.id.in_(event_ids)
            )
        ).one()
        if first_event_at or last_event_at:
            return {
                "first_event_at": _iso(first_event_at),
                "last_event_at": _iso(last_event_at or first_event_at),
            }

    return {
        "first_event_at": None,
        "last_event_at": None,
    }


def write_memory_artifact_payload(
    db: DBSession,
    *,
    artifact_type: str,
    event_id: UUID | None,
    extra_metadata: dict[str, Any],
    payload: dict[str, Any],
    project_id: UUID,
    session_id: UUID | None,
    storage_key: str,
) -> Artifact:
    artifact = db.execute(
        select(Artifact).where(
            Artifact.project_id == project_id,
            Artifact.type == artifact_type,
            Artifact.storage_key == storage_key,
        )
    ).scalar_one_or_none()
    if artifact is None:
        artifact = Artifact(
            project_id=project_id,
            session_id=session_id,
            event_id=event_id,
            type=artifact_type,
            title=payload["title"],
            storage_key=storage_key,
        )
        db.add(artifact)
        db.flush()

    generation_metadata = {
        "event_count": payload["event_count"],
        "first_event_id": payload["first_event_id"],
        "last_event_id": payload["last_event_id"],
        "tool": payload["tool"],
        **extra_metadata,
    }
    generation_metadata = {
        **generation_metadata,
        **_event_range_metadata(
            db,
            metadata=generation_metadata,
            project_id=project_id,
            session_id=session_id,
        ),
    }
    artifact_version = _create_artifact_version(
        db,
        artifact=artifact,
        generation_metadata=generation_metadata,
        payload=payload,
    )
    artifact.schema_version = 1
    artifact.event_id = event_id
    artifact.title = payload["title"]
    artifact.summary = payload["summary"]
    artifact.reason = payload["reason"]
    artifact.outcome = payload["outcome"]
    artifact.tags = payload["tags"]
    artifact.technologies = payload["technologies"]
    artifact.sections = payload["sections"]
    artifact.changed_files = payload["changed_files"]
    artifact.prompt_event_ids = payload["prompt_event_ids"]
    artifact.commit_sha = payload["commit_sha"]
    artifact.model = payload["model"]
    artifact.generator = payload["generator"]
    artifact.metadata_ = {
        **generation_metadata,
        "latest_version": artifact_version.version,
        "latest_version_id": str(artifact_version.id),
    }
    artifact.updated_at = utc_now()
    db.flush()
    return artifact
