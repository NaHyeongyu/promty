from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import timedelta
import hashlib
import logging
from typing import Any
from uuid import NAMESPACE_URL, UUID, uuid5

from sqlalchemy import delete, desc, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DBSession

from app.core.time import utc_now
from app.models.artifact_versions import ArtifactVersion
from app.models.artifacts import Artifact
from app.models.project_memory_batches import (
    ProjectMemoryBatch,
    ProjectMemoryBatchItem,
    ProjectMemoryBatchRequest,
)
from app.models.projects import Project
from app.models.sessions import Session
from app.services.memory.artifacts import (
    _pending_draft_generation_context,
    materialize_project_memory_drafts,
)
from app.services.memory.context import dedupe_files, truncate
from app.services.memory.constants import (
    MEMORY_ARTIFACT_TYPE,
    MEMORY_DRAFT_ARTIFACT_TYPE,
    PENDING_DRAFT_STAGE,
    REVIEW_STATE_DRAFT,
    REVIEW_STATE_GENERATED,
    REVIEW_STATE_IGNORED,
)
from app.services.memory.draft_payloads import build_memory_draft_payloads_from_context
from app.services.memory.project_memory import (
    generate_project_memory_compilation,
    prepare_project_memory_compilation,
    project_memory_compilation_guard,
    write_project_memory_compilation,
)
from app.services.memory.repository import write_memory_artifact_payload


logger = logging.getLogger(__name__)

PROJECT_MEMORY_BATCH_CHUNK_SIZE = 6
PROJECT_MEMORY_BATCH_GENERATOR = "project-memory-batch-v1"
PROJECT_MEMORY_BATCH_LEASE = timedelta(minutes=10)
PROJECT_MEMORY_BATCH_TRIGGER = "project_batch"


class ProjectMemoryBatchError(RuntimeError):
    code = "project_memory_batch_failed"


class ProjectMemoryBatchGenerationError(ProjectMemoryBatchError):
    code = "generation_failed"


class ProjectMemoryBatchInvariantError(ProjectMemoryBatchError):
    code = "snapshot_invalid"


@dataclass(frozen=True)
class PendingDraftSnapshot:
    id: UUID
    version_id: UUID
    title: str
    summary: str | None
    metadata_: dict[str, Any]
    created_at: Any


@dataclass(frozen=True)
class GeneratedChunkPayload:
    first_event_at: str | None
    last_event_at: str | None
    metadata: dict[str, Any]
    payload: dict[str, Any]
    source_draft_ids: list[str]
    source_draft_version_ids: list[str]
    source_session_id: str


@dataclass(frozen=True)
class PendingChunkGeneration:
    context: dict[str, Any]
    snapshots: list[PendingDraftSnapshot]
    source_session_id: str


@dataclass(frozen=True)
class BatchAttemptSnapshot:
    batch_id: UUID
    chunk_generations: list[PendingChunkGeneration]
    project_id: UUID
    project_name: str
    snapshot_manifest: list[dict[str, Any]]
    source_session_ids: list[str]


@dataclass(frozen=True)
class PreparedBatchMemory:
    artifact_id: UUID
    event_id: UUID | None
    extra_metadata: dict[str, Any]
    payload: dict[str, Any]
    project_id: UUID
    storage_key: str
    timestamp: Any


def _pending_draft_filters(project_id: UUID) -> tuple[Any, ...]:
    return (
        Artifact.project_id == project_id,
        Artifact.type == MEMORY_DRAFT_ARTIFACT_TYPE,
        Artifact.metadata_["artifact_stage"].astext == PENDING_DRAFT_STAGE,
        Artifact.metadata_["review_state"].astext == REVIEW_STATE_DRAFT,
    )


def _project_memory_lock_key(project_id: UUID) -> int:
    return int.from_bytes(
        hashlib.blake2b(project_id.bytes, digest_size=8).digest(),
        byteorder="big",
        signed=True,
    )


def lock_project_memory(db: DBSession, project_id: UUID) -> Project:
    db.execute(select(func.pg_advisory_xact_lock(_project_memory_lock_key(project_id))))
    project = db.get(Project, project_id)
    if project is None:
        raise ProjectMemoryBatchInvariantError("Project not found")
    return project


def _batch_by_idempotency_key(
    db: DBSession,
    *,
    idempotency_key: str,
    project_id: UUID,
) -> ProjectMemoryBatch | None:
    mapped = db.execute(
        select(ProjectMemoryBatch)
        .join(
            ProjectMemoryBatchRequest,
            ProjectMemoryBatchRequest.batch_id == ProjectMemoryBatch.id,
        )
        .where(
            ProjectMemoryBatchRequest.project_id == project_id,
            ProjectMemoryBatchRequest.idempotency_key == idempotency_key,
            ProjectMemoryBatch.project_id == ProjectMemoryBatchRequest.project_id,
        )
        .with_for_update(of=ProjectMemoryBatch)
    ).scalar_one_or_none()
    if mapped is not None:
        return mapped
    return db.execute(
        select(ProjectMemoryBatch)
        .where(
            ProjectMemoryBatch.project_id == project_id,
            or_(
                ProjectMemoryBatch.idempotency_key == idempotency_key,
                ProjectMemoryBatch.idempotency_keys.contains([idempotency_key]),
            ),
        )
        .with_for_update()
    ).scalar_one_or_none()


def _in_progress_batch_by_idempotency_key(
    db: DBSession,
    *,
    idempotency_key: str,
    project_id: UUID,
) -> ProjectMemoryBatch | None:
    mapped = db.execute(
        select(ProjectMemoryBatch)
        .join(
            ProjectMemoryBatchRequest,
            ProjectMemoryBatchRequest.batch_id == ProjectMemoryBatch.id,
        )
        .where(
            ProjectMemoryBatchRequest.project_id == project_id,
            ProjectMemoryBatchRequest.idempotency_key == idempotency_key,
            ProjectMemoryBatch.project_id == ProjectMemoryBatchRequest.project_id,
            ProjectMemoryBatch.status == "running",
            ProjectMemoryBatch.lease_expires_at > utc_now(),
        )
        .order_by(desc(ProjectMemoryBatch.updated_at))
        .limit(1)
    ).scalar_one_or_none()
    if mapped is not None:
        return mapped
    return db.execute(
        select(ProjectMemoryBatch)
        .where(
            ProjectMemoryBatch.project_id == project_id,
            ProjectMemoryBatch.status == "running",
            ProjectMemoryBatch.lease_expires_at > utc_now(),
            or_(
                ProjectMemoryBatch.idempotency_key == idempotency_key,
                ProjectMemoryBatch.idempotency_keys.contains([idempotency_key]),
            ),
        )
        .order_by(desc(ProjectMemoryBatch.updated_at))
        .limit(1)
    ).scalar_one_or_none()


def _active_batch(
    db: DBSession,
    *,
    project_id: UUID,
) -> ProjectMemoryBatch | None:
    return db.execute(
        select(ProjectMemoryBatch)
        .where(
            ProjectMemoryBatch.project_id == project_id,
            ProjectMemoryBatch.status.in_(["pending", "running"]),
        )
        .order_by(desc(ProjectMemoryBatch.updated_at))
        .limit(1)
        .with_for_update()
    ).scalar_one_or_none()


def _attach_idempotency_key(
    db: DBSession,
    batch: ProjectMemoryBatch,
    idempotency_key: str,
    *,
    update_legacy_keys: bool = True,
) -> ProjectMemoryBatch:
    request = db.get(
        ProjectMemoryBatchRequest,
        {
            "project_id": batch.project_id,
            "idempotency_key": idempotency_key,
        },
    )
    if request is None:
        try:
            with db.begin_nested():
                request = ProjectMemoryBatchRequest(
                    batch_id=batch.id,
                    idempotency_key=idempotency_key,
                    project_id=batch.project_id,
                )
                db.add(request)
                db.flush()
        except IntegrityError:
            request = db.get(
                ProjectMemoryBatchRequest,
                {
                    "project_id": batch.project_id,
                    "idempotency_key": idempotency_key,
                },
            )
    if request is None:
        raise ProjectMemoryBatchInvariantError("Idempotency request could not be recorded")
    if request.batch_id != batch.id:
        mapped = db.get(ProjectMemoryBatch, request.batch_id)
        if mapped is not None and mapped.project_id == batch.project_id:
            return mapped
        request.batch_id = batch.id

    if update_legacy_keys:
        keys = list(batch.idempotency_keys or [])
        if idempotency_key not in keys:
            batch.idempotency_keys = [*keys, idempotency_key]
    return batch


def _visible_active_batch(
    db: DBSession,
    *,
    project_id: UUID,
) -> ProjectMemoryBatch | None:
    return db.execute(
        select(ProjectMemoryBatch)
        .where(
            ProjectMemoryBatch.project_id == project_id,
            ProjectMemoryBatch.status.in_(["pending", "running"]),
        )
        .order_by(desc(ProjectMemoryBatch.updated_at))
        .limit(1)
    ).scalar_one_or_none()


def _failed_batch_for_retry(
    db: DBSession,
    *,
    project_id: UUID,
) -> ProjectMemoryBatch | None:
    return db.execute(
        select(ProjectMemoryBatch)
        .where(
            ProjectMemoryBatch.project_id == project_id,
            ProjectMemoryBatch.status == "failed",
        )
        .order_by(desc(ProjectMemoryBatch.updated_at))
        .limit(1)
        .with_for_update()
    ).scalar_one_or_none()


def _latest_versions_by_artifact(
    db: DBSession,
    draft_ids: list[UUID],
) -> dict[UUID, ArtifactVersion]:
    versions = list(
        db.execute(
            select(ArtifactVersion)
            .where(ArtifactVersion.artifact_id.in_(draft_ids))
            .order_by(
                ArtifactVersion.artifact_id,
                desc(ArtifactVersion.version),
            )
        ).scalars()
    )
    latest: dict[UUID, ArtifactVersion] = {}
    for version in versions:
        latest.setdefault(version.artifact_id, version)
    return latest


def _prepare_batch(
    db: DBSession,
    *,
    idempotency_key: str,
    project_id: UUID,
    user_id: UUID,
) -> ProjectMemoryBatch:
    materialize_project_memory_drafts(db, project_id=project_id)
    snapshot_at = utc_now()
    claimed_drafts = select(ProjectMemoryBatchItem.draft_id)
    drafts = list(
        db.execute(
            select(Artifact)
            .where(
                *_pending_draft_filters(project_id),
                Artifact.updated_at <= snapshot_at,
                Artifact.id.not_in(claimed_drafts),
            )
            .order_by(Artifact.created_at, Artifact.id)
            .with_for_update()
        ).scalars()
    )
    versions = _latest_versions_by_artifact(db, [draft.id for draft in drafts])
    missing_versions = [str(draft.id) for draft in drafts if draft.id not in versions]
    if missing_versions:
        raise ProjectMemoryBatchInvariantError(
            f"Pending drafts have no immutable version: {', '.join(missing_versions)}"
        )

    source_session_ids = list(
        dict.fromkeys(str(draft.session_id) for draft in drafts if draft.session_id is not None)
    )
    batch = ProjectMemoryBatch(
        idempotency_key=idempotency_key,
        idempotency_keys=[idempotency_key],
        project_id=project_id,
        requested_by_user_id=user_id,
        snapshot_at=snapshot_at,
        source_session_ids=source_session_ids,
        snapshot_manifest=[
            {
                "draft_id": str(draft.id),
                "draft_version_id": str(versions[draft.id].id),
                "ordinal": ordinal,
                "source_session_id": str(draft.session_id) if draft.session_id else None,
            }
            for ordinal, draft in enumerate(drafts, start=1)
        ],
        status="pending",
    )
    db.add(batch)
    db.flush()
    _attach_idempotency_key(db, batch, idempotency_key)
    for ordinal, draft in enumerate(drafts, start=1):
        db.add(
            ProjectMemoryBatchItem(
                batch_id=batch.id,
                draft_id=draft.id,
                draft_version_id=versions[draft.id].id,
                ordinal=ordinal,
                source_session_id=draft.session_id,
            )
        )

    if not drafts:
        now = utc_now()
        batch.status = "succeeded"
        batch.result_status = "no_pending"
        batch.completed_at = now
        batch.updated_at = now
    db.flush()
    db.commit()
    return batch


def _item_count(db: DBSession, batch_id: UUID) -> int:
    return (
        db.scalar(
            select(func.count(ProjectMemoryBatchItem.draft_id)).where(
                ProjectMemoryBatchItem.batch_id == batch_id
            )
        )
        or 0
    )


def _remaining_pending_count(db: DBSession, project_id: UUID) -> int:
    return (
        db.scalar(select(func.count(Artifact.id)).where(*_pending_draft_filters(project_id))) or 0
    )


def serialize_project_memory_batch(
    db: DBSession,
    batch: ProjectMemoryBatch,
    *,
    replayed: bool,
) -> dict[str, Any]:
    result_status = batch.result_status
    if batch.status in {"pending", "running"}:
        result_status = "generation_in_progress"
    elif batch.status in {"failed", "superseded"}:
        result_status = "generation_failed"
    retryable = batch.status == "failed" and batch.error_code != "snapshot_invalid"
    messages = {
        "generation_failed": (
            "Project Memory was not updated. Your captured work is safe and can be retried."
        ),
        "generation_in_progress": "Project Memory is being updated.",
        "memory_generated": "Project Memory was updated from the captured project work.",
        "no_memory": "No durable project context was found in the captured work.",
        "no_pending": "There is no captured work waiting for Project Memory.",
    }
    message = messages.get(result_status or "", "Project Memory batch completed.")
    if batch.error_code == "snapshot_invalid":
        message = "Captured work changed before generation. Refresh and try again."
    return {
        "batch_id": str(batch.id),
        "batch_status": batch.status,
        "completed_at": batch.completed_at.isoformat() if batch.completed_at else None,
        "error": (
            {
                "code": batch.error_code or "generation_failed",
                "message": (
                    "Captured work changed before generation. Refresh and try again."
                    if batch.error_code == "snapshot_invalid"
                    else messages["generation_failed"]
                ),
                "retryable": retryable,
            }
            if batch.status in {"failed", "superseded"}
            else None
        ),
        "generated_artifact_ids": list(batch.generated_artifact_ids or []),
        "message": message,
        "project_memory_artifact_id": (
            str(batch.project_memory_artifact_id) if batch.project_memory_artifact_id else None
        ),
        "remaining_pending_count": _remaining_pending_count(db, batch.project_id),
        "replayed": replayed,
        "snapshot_at": batch.snapshot_at.isoformat(),
        "retryable": retryable,
        "source_draft_count": max(
            _item_count(db, batch.id),
            len(batch.snapshot_manifest or []),
        ),
        "source_session_ids": list(batch.source_session_ids or []),
        "status": result_status,
    }


def read_project_memory_batch(
    db: DBSession,
    *,
    batch_id: UUID,
    project_id: UUID,
) -> ProjectMemoryBatch | None:
    return db.execute(
        select(ProjectMemoryBatch).where(
            ProjectMemoryBatch.id == batch_id,
            ProjectMemoryBatch.project_id == project_id,
        )
    ).scalar_one_or_none()


def _claim_batch_run(
    db: DBSession,
    batch_id: UUID,
) -> tuple[ProjectMemoryBatch, bool, int]:
    batch = db.execute(
        select(ProjectMemoryBatch).where(ProjectMemoryBatch.id == batch_id).with_for_update()
    ).scalar_one()
    now = utc_now()
    if batch.status == "succeeded" or (
        batch.status == "running"
        and batch.lease_expires_at is not None
        and batch.lease_expires_at > now
    ):
        attempt_count = batch.attempt_count
        db.commit()
        return batch, False, attempt_count
    batch.status = "running"
    batch.result_status = None
    batch.attempt_count += 1
    batch.started_at = now
    batch.lease_expires_at = now + PROJECT_MEMORY_BATCH_LEASE
    batch.completed_at = None
    batch.error_code = None
    batch.error_message = None
    batch.updated_at = now
    db.flush()
    db.commit()
    return batch, True, batch.attempt_count


def _load_batch_snapshots(
    db: DBSession,
    batch: ProjectMemoryBatch,
    *,
    lock_drafts: bool = False,
) -> list[tuple[ProjectMemoryBatchItem, Artifact, PendingDraftSnapshot, Session]]:
    statement = (
        select(
            ProjectMemoryBatchItem,
            Artifact,
            ArtifactVersion,
            Session,
        )
        .join(Artifact, Artifact.id == ProjectMemoryBatchItem.draft_id)
        .join(
            ArtifactVersion,
            ArtifactVersion.id == ProjectMemoryBatchItem.draft_version_id,
        )
        .join(Session, Session.id == ProjectMemoryBatchItem.source_session_id)
        .where(ProjectMemoryBatchItem.batch_id == batch.id)
        .order_by(ProjectMemoryBatchItem.ordinal)
    )
    if lock_drafts:
        statement = statement.with_for_update(of=Artifact)
    rows = db.execute(statement).all()
    snapshots: list[tuple[ProjectMemoryBatchItem, Artifact, PendingDraftSnapshot, Session]] = []
    for item, draft, version, session in rows:
        metadata = draft.metadata_ if isinstance(draft.metadata_, dict) else {}
        if metadata.get("review_state") != REVIEW_STATE_DRAFT:
            raise ProjectMemoryBatchInvariantError(f"Draft {draft.id} is no longer pending")
        if version.artifact_id != draft.id or version.project_id != batch.project_id:
            raise ProjectMemoryBatchInvariantError(
                f"Draft {draft.id} no longer matches its captured version"
            )
        latest_version_id = metadata.get("latest_version_id")
        if latest_version_id and latest_version_id != str(version.id):
            raise ProjectMemoryBatchInvariantError(
                f"Draft {draft.id} changed after the batch snapshot"
            )
        if session.project_id != batch.project_id:
            raise ProjectMemoryBatchInvariantError(
                f"Session {session.id} does not belong to the batch project"
            )
        snapshots.append(
            (
                item,
                draft,
                PendingDraftSnapshot(
                    id=draft.id,
                    version_id=version.id,
                    title=version.title,
                    summary=version.summary,
                    metadata_=version.metadata_ if isinstance(version.metadata_, dict) else {},
                    created_at=version.created_at,
                ),
                session,
            )
        )
    if len(snapshots) != _item_count(db, batch.id):
        raise ProjectMemoryBatchInvariantError("Batch source sessions are incomplete")
    return snapshots


def _chunks(values: list[Any], size: int) -> list[list[Any]]:
    return [values[index : index + size] for index in range(0, len(values), size)]


def _coverage_bounds(snapshots: list[PendingDraftSnapshot]) -> tuple[str | None, str | None]:
    timestamps: list[str] = []
    for snapshot in snapshots:
        evidence = snapshot.metadata_.get("draft_evidence")
        if not isinstance(evidence, dict):
            continue
        events = evidence.get("events") if isinstance(evidence.get("events"), list) else []
        timestamps.extend(
            timestamp
            for event in events
            if isinstance(event, dict)
            and isinstance((timestamp := event.get("timestamp")), str)
            and timestamp
        )
    timestamps.sort()
    if timestamps:
        return timestamps[0], timestamps[-1]
    created = sorted(
        snapshot.created_at.isoformat() for snapshot in snapshots if snapshot.created_at is not None
    )
    return (created[0], created[-1]) if created else (None, None)


def _event_id(value: Any) -> UUID | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        return UUID(value)
    except ValueError:
        return None


def _generate_chunk_payloads(
    *,
    context: dict[str, Any],
    snapshots: list[PendingDraftSnapshot],
    source_session_id: str,
) -> list[GeneratedChunkPayload]:
    payloads, generation_metadata = build_memory_draft_payloads_from_context(
        context,
        trigger_reason=PROJECT_MEMORY_BATCH_TRIGGER,
    )
    if not payloads:
        if "draft_generation" in generation_metadata:
            return []
        raise ProjectMemoryBatchGenerationError(
            str(generation_metadata.get("fallback_reason") or "Memory generation failed")
        )

    source_draft_ids = [str(snapshot.id) for snapshot in snapshots]
    source_draft_version_ids = [str(snapshot.version_id) for snapshot in snapshots]
    first_event_at, last_event_at = _coverage_bounds(snapshots)
    return [
        GeneratedChunkPayload(
            first_event_at=first_event_at,
            last_event_at=last_event_at,
            metadata={
                **draft_metadata,
                **generation_metadata,
                "commit_metadata": context["commits"],
            },
            payload=payload,
            source_draft_ids=source_draft_ids,
            source_draft_version_ids=source_draft_version_ids,
            source_session_id=source_session_id,
        )
        for payload, draft_metadata in payloads
    ]


def _prepare_batch_attempt(
    db: DBSession,
    *,
    batch_id: UUID,
    expected_attempt_count: int,
) -> BatchAttemptSnapshot | None:
    batch = db.get(ProjectMemoryBatch, batch_id)
    if (
        batch is None
        or batch.status != "running"
        or batch.attempt_count != expected_attempt_count
    ):
        db.commit()
        return None

    rows = _load_batch_snapshots(db, batch)
    grouped: dict[UUID, list[tuple[Artifact, PendingDraftSnapshot, Session]]] = defaultdict(list)
    for _item, draft, snapshot, session in rows:
        grouped[session.id].append((draft, snapshot, session))

    chunk_generations: list[PendingChunkGeneration] = []
    for session_rows in grouped.values():
        for chunk_rows in _chunks(session_rows, PROJECT_MEMORY_BATCH_CHUNK_SIZE):
            snapshots = [snapshot for _, snapshot, _ in chunk_rows]
            session = chunk_rows[0][2]
            context = _pending_draft_generation_context(
                db,
                session,
                snapshots,  # type: ignore[arg-type]
            )
            chunk_generations.append(
                PendingChunkGeneration(
                    context=context,
                    snapshots=snapshots,
                    source_session_id=str(session.id),
                )
            )

    project = db.get(Project, batch.project_id)
    if project is None:
        raise ProjectMemoryBatchInvariantError("Project not found")
    prepared = BatchAttemptSnapshot(
        batch_id=batch.id,
        chunk_generations=chunk_generations,
        project_id=batch.project_id,
        project_name=project.name,
        snapshot_manifest=list(batch.snapshot_manifest or []),
        source_session_ids=list(batch.source_session_ids or []),
    )
    db.commit()
    return prepared


def _generate_batch_chunks(
    prepared: BatchAttemptSnapshot,
) -> list[GeneratedChunkPayload]:
    generated_chunks: list[GeneratedChunkPayload] = []
    for generation in prepared.chunk_generations:
        generated_chunks.extend(
            _generate_chunk_payloads(
                context=generation.context,
                snapshots=generation.snapshots,
                source_session_id=generation.source_session_id,
            )
        )
    return generated_chunks


def _unique_strings(values: list[Any]) -> list[str]:
    return list(dict.fromkeys(value for value in values if isinstance(value, str) and value))


def _consolidated_sections(
    chunks: list[GeneratedChunkPayload],
) -> list[dict[str, str]]:
    summaries_by_title: dict[str, list[str]] = {}
    for chunk in chunks:
        sections = (
            chunk.payload.get("sections") if isinstance(chunk.payload.get("sections"), list) else []
        )
        for section in sections:
            if not isinstance(section, dict):
                continue
            title = section.get("title")
            summary = section.get("summary")
            if not isinstance(title, str) or not isinstance(summary, str):
                continue
            values = summaries_by_title.setdefault(title, [])
            compact_summary = truncate(summary, 320)
            if compact_summary and compact_summary not in values:
                values.append(compact_summary)
    return [
        {
            "summary": truncate(" / ".join(summaries), 1800),
            "title": title,
        }
        for title, summaries in list(summaries_by_title.items())[:8]
        if summaries
    ]


def _prepare_project_batch_memory(
    *,
    batch: BatchAttemptSnapshot,
    chunks: list[GeneratedChunkPayload],
) -> PreparedBatchMemory:
    changed_files = dedupe_files(
        [
            file
            for chunk in chunks
            for file in (
                chunk.payload.get("changed_files")
                if isinstance(chunk.payload.get("changed_files"), list)
                else []
            )
            if isinstance(file, dict) and isinstance(file.get("path"), str)
        ]
    )
    summaries = _unique_strings([chunk.payload.get("summary") for chunk in chunks])
    outcomes = _unique_strings([chunk.payload.get("outcome") for chunk in chunks])
    prompt_event_ids = _unique_strings(
        [
            event_id
            for chunk in chunks
            for event_id in (
                chunk.payload.get("prompt_event_ids")
                if isinstance(chunk.payload.get("prompt_event_ids"), list)
                else []
            )
        ]
    )
    source_draft_ids = _unique_strings(
        [draft_id for chunk in chunks for draft_id in chunk.source_draft_ids]
    )
    source_draft_version_ids = _unique_strings(
        [version_id for chunk in chunks for version_id in chunk.source_draft_version_ids]
    )
    first_event_at = min(
        (chunk.first_event_at for chunk in chunks if chunk.first_event_at),
        default=None,
    )
    last_event_at = max(
        (chunk.last_event_at for chunk in chunks if chunk.last_event_at),
        default=None,
    )
    first_event_ids = _unique_strings([chunk.payload.get("first_event_id") for chunk in chunks])
    last_event_ids = _unique_strings([chunk.payload.get("last_event_id") for chunk in chunks])
    tools = _unique_strings([chunk.payload.get("tool") for chunk in chunks])
    models = _unique_strings([chunk.payload.get("model") for chunk in chunks])
    commit_shas = _unique_strings([chunk.payload.get("commit_sha") for chunk in chunks])
    tags = _unique_strings(
        [
            tag
            for chunk in chunks
            for tag in (
                chunk.payload.get("tags") if isinstance(chunk.payload.get("tags"), list) else []
            )
        ]
    )
    technologies = _unique_strings(
        [
            technology
            for chunk in chunks
            for technology in (
                chunk.payload.get("technologies")
                if isinstance(chunk.payload.get("technologies"), list)
                else []
            )
        ]
    )
    payload = {
        "changed_files": changed_files[:100],
        "commit_sha": commit_shas[-1] if commit_shas else None,
        "event_count": sum(
            value
            for chunk in chunks
            if isinstance((value := chunk.payload.get("event_count")), int)
        ),
        "first_event_id": first_event_ids[0] if first_event_ids else None,
        "generator": PROJECT_MEMORY_BATCH_GENERATOR,
        "last_event_id": last_event_ids[-1] if last_event_ids else None,
        "model": models[0] if len(models) == 1 else "multiple" if models else None,
        "outcome": truncate(" ".join(outcomes), 2400),
        "prompt_event_ids": prompt_event_ids,
        "reason": "Created from the captured work in this project update.",
        "sections": _consolidated_sections(chunks),
        "summary": truncate(" ".join(summaries), 1800),
        "tags": _unique_strings([*tags, "project-update"])[:12],
        "technologies": technologies[:20],
        "title": f"{batch.project_name} memory update",
        "tool": tools[0] if len(tools) == 1 else "multiple" if tools else "promty",
    }
    batch_source_draft_ids = _unique_strings(
        [item.get("draft_id") for item in batch.snapshot_manifest or [] if isinstance(item, dict)]
    )
    timestamp = utc_now()
    return PreparedBatchMemory(
        artifact_id=uuid5(
            NAMESPACE_URL,
            f"promty:project-memory-batch:{batch.batch_id}:memory",
        ),
        event_id=_event_id(payload["last_event_id"]),
        extra_metadata={
            "artifact_stage": "generated_memory",
            "batch_source_draft_ids": batch_source_draft_ids,
            "draft_generator": PROJECT_MEMORY_BATCH_GENERATOR,
            "draft_type": "work_log",
            "first_event_at": first_event_at,
            "internal_chunk_count": len(chunks),
            "last_event_at": last_event_at,
            "memory_batch_id": str(batch.batch_id),
            "memory_scope": "generated",
            "prompt_count": len(prompt_event_ids),
            "review_state": REVIEW_STATE_GENERATED,
            "source_chunk_ids": source_draft_ids,
            "source_draft_ids": source_draft_ids,
            "source_draft_version_ids": source_draft_version_ids,
            "source_session_ids": list(batch.source_session_ids or []),
            "summary_level": 2,
            "trigger_reason": PROJECT_MEMORY_BATCH_TRIGGER,
        },
        project_id=batch.project_id,
        payload=payload,
        storage_key=f"memory/project/{batch.project_id}/batch/{batch.batch_id}/memory",
        timestamp=timestamp,
    )


def _prepared_batch_memory_context(memory: PreparedBatchMemory) -> dict[str, Any]:
    metadata = memory.extra_metadata
    payload = memory.payload
    return {
        "changed_file_count": len(payload.get("changed_files") or []),
        "created_at": memory.timestamp.isoformat(),
        "draft_details": metadata.get("draft_details"),
        "draft_type": metadata.get("draft_type"),
        "first_event_at": metadata.get("first_event_at"),
        "id": str(memory.artifact_id),
        "last_event_at": metadata.get("last_event_at"),
        "memory_batch_id": metadata.get("memory_batch_id"),
        "memory_scope": metadata.get("memory_scope"),
        "outcome": payload.get("outcome"),
        "reason": payload.get("reason"),
        "sections": payload.get("sections") or [],
        "session_id": None,
        "source_draft_id": metadata.get("source_draft_id"),
        "source_draft_ids": metadata.get("source_draft_ids") or [],
        "source_draft_version_ids": metadata.get("source_draft_version_ids") or [],
        "source_session_ids": metadata.get("source_session_ids") or [],
        "summary": payload.get("summary"),
        "tags": payload.get("tags") or [],
        "technologies": payload.get("technologies") or [],
        "title": payload.get("title"),
        "updated_at": memory.timestamp.isoformat(),
    }


def _write_project_batch_memory(
    db: DBSession,
    memory: PreparedBatchMemory,
) -> Artifact:
    return write_memory_artifact_payload(
        db,
        artifact_id=memory.artifact_id,
        artifact_type=MEMORY_ARTIFACT_TYPE,
        event_id=memory.event_id,
        extra_metadata=memory.extra_metadata,
        payload=memory.payload,
        project_id=memory.project_id,
        session_id=None,
        storage_key=memory.storage_key,
    )


def _consume_batch_snapshots(
    db: DBSession,
    *,
    batch: ProjectMemoryBatch,
    generated_chunks: list[GeneratedChunkPayload],
    memory: Artifact | None,
    rows: list[tuple[ProjectMemoryBatchItem, Artifact, PendingDraftSnapshot, Session]],
) -> None:
    contributed_draft_ids = {
        UUID(draft_id)
        for chunk in generated_chunks
        for draft_id in chunk.source_draft_ids
    }
    generated_ids = [str(memory.id)] if memory is not None else []
    consumed_at = utc_now()
    for _item, draft, _snapshot, _session in rows:
        metadata = draft.metadata_ if isinstance(draft.metadata_, dict) else {}
        draft_generated_ids = generated_ids if draft.id in contributed_draft_ids else []
        draft.metadata_ = {
            **metadata,
            "generated_memory_ids": draft_generated_ids,
            "memory_batch_id": str(batch.id),
            "review_state": (
                REVIEW_STATE_GENERATED if draft_generated_ids else REVIEW_STATE_IGNORED
            ),
            "sent_to_ai_at": consumed_at.isoformat(),
        }
        draft.updated_at = consumed_at
    db.flush()


def _finalize_batch_attempt(
    db: DBSession,
    *,
    expected_attempt_count: int,
    generated_chunks: list[GeneratedChunkPayload],
    prepared: BatchAttemptSnapshot,
    prepared_memory: PreparedBatchMemory | None,
    prepared_project_memory: Any | None,
) -> ProjectMemoryBatch:
    lock_project_memory(db, prepared.project_id)
    batch = db.execute(
        select(ProjectMemoryBatch)
        .where(ProjectMemoryBatch.id == prepared.batch_id)
        .with_for_update()
    ).scalar_one()
    if batch.status != "running" or batch.attempt_count != expected_attempt_count:
        db.commit()
        return batch
    if (
        batch.project_id != prepared.project_id
        or list(batch.snapshot_manifest or []) != prepared.snapshot_manifest
    ):
        raise ProjectMemoryBatchInvariantError("Batch snapshot changed during generation")

    rows = _load_batch_snapshots(db, batch, lock_drafts=True)
    if prepared_project_memory is not None and (
        project_memory_compilation_guard(db, prepared.project_id)
        != prepared_project_memory.base_guard
    ):
        raise ProjectMemoryBatchGenerationError(
            "Project Memory changed during generation; retry the same captured work"
        )

    memory = (
        _write_project_batch_memory(db, prepared_memory)
        if prepared_memory is not None
        else None
    )
    _consume_batch_snapshots(
        db,
        batch=batch,
        generated_chunks=generated_chunks,
        memory=memory,
        rows=rows,
    )
    project_memory = (
        write_project_memory_compilation(db, prepared_project_memory)
        if prepared_project_memory is not None
        else None
    )

    now = utc_now()
    batch.status = "succeeded"
    batch.result_status = "memory_generated" if memory is not None else "no_memory"
    batch.generated_artifact_ids = [str(memory.id)] if memory is not None else []
    batch.project_memory_artifact_id = project_memory.id if project_memory else None
    batch.error_code = None
    batch.error_message = None
    batch.lease_expires_at = None
    batch.completed_at = now
    batch.updated_at = now
    db.flush()
    db.commit()
    return batch


def _record_batch_failure(
    db: DBSession,
    *,
    batch_id: UUID,
    error: Exception,
    expected_attempt_count: int,
) -> ProjectMemoryBatch:
    batch = db.execute(
        select(ProjectMemoryBatch).where(ProjectMemoryBatch.id == batch_id).with_for_update()
    ).scalar_one()
    if batch.status != "running" or batch.attempt_count != expected_attempt_count:
        db.commit()
        return batch
    now = utc_now()
    is_terminal = isinstance(error, ProjectMemoryBatchInvariantError)
    batch.status = "superseded" if is_terminal else "failed"
    batch.result_status = "generation_failed"
    batch.error_code = (
        error.code if isinstance(error, ProjectMemoryBatchError) else "generation_failed"
    )
    batch.error_message = str(error)[:2000]
    batch.lease_expires_at = None
    batch.completed_at = now
    batch.updated_at = now
    if is_terminal:
        db.execute(
            delete(ProjectMemoryBatchItem).where(ProjectMemoryBatchItem.batch_id == batch.id)
        )
    db.flush()
    db.commit()
    return batch


def _run_prepared_batch(
    db: DBSession,
    *,
    batch_id: UUID,
    replayed: bool,
) -> dict[str, Any]:
    batch, claimed, attempt_count = _claim_batch_run(db, batch_id)
    if not claimed:
        return serialize_project_memory_batch(db, batch, replayed=True)
    try:
        prepared = _prepare_batch_attempt(
            db,
            batch_id=batch_id,
            expected_attempt_count=attempt_count,
        )
        if prepared is None:
            current = db.get(ProjectMemoryBatch, batch_id)
            if current is None:
                raise ProjectMemoryBatchInvariantError("Project Memory batch not found")
            return serialize_project_memory_batch(db, current, replayed=True)

        generated_chunks = _generate_batch_chunks(prepared)
        prepared_memory = (
            _prepare_project_batch_memory(batch=prepared, chunks=generated_chunks)
            if generated_chunks
            else None
        )
        prepared_project_memory = None
        if prepared_memory is not None:
            compilation_input = prepare_project_memory_compilation(
                db,
                project_id=prepared.project_id,
                required_source_memory_contexts=[
                    _prepared_batch_memory_context(prepared_memory)
                ],
            )
            db.commit()
            prepared_project_memory = generate_project_memory_compilation(
                compilation_input
            )
        batch = _finalize_batch_attempt(
            db,
            expected_attempt_count=attempt_count,
            generated_chunks=generated_chunks,
            prepared=prepared,
            prepared_memory=prepared_memory,
            prepared_project_memory=prepared_project_memory,
        )
    except Exception as exc:
        db.rollback()
        logger.exception("Project Memory batch %s failed", batch_id)
        batch = _record_batch_failure(
            db,
            batch_id=batch_id,
            error=exc,
            expected_attempt_count=attempt_count,
        )
    return serialize_project_memory_batch(db, batch, replayed=replayed)


def generate_project_memory_batch(
    db: DBSession,
    *,
    idempotency_key: str,
    project_id: UUID,
    user_id: UUID,
) -> dict[str, Any]:
    in_progress = _in_progress_batch_by_idempotency_key(
        db,
        idempotency_key=idempotency_key,
        project_id=project_id,
    )
    if in_progress is not None:
        in_progress = _attach_idempotency_key(
            db,
            in_progress,
            idempotency_key,
            update_legacy_keys=False,
        )
        response = serialize_project_memory_batch(db, in_progress, replayed=True)
        db.commit()
        return response

    visible_active = _visible_active_batch(db, project_id=project_id)
    if visible_active is not None:
        mapped = _attach_idempotency_key(
            db,
            visible_active,
            idempotency_key,
            update_legacy_keys=False,
        )
        mapped_id = mapped.id
        db.commit()
        mapped = db.get(ProjectMemoryBatch, mapped_id)
        if mapped is None:
            raise ProjectMemoryBatchInvariantError("Project Memory batch not found")
        if mapped.status == "pending" or (
            mapped.status == "running"
            and mapped.lease_expires_at is not None
            and mapped.lease_expires_at <= utc_now()
        ):
            return _run_prepared_batch(db, batch_id=mapped.id, replayed=True)
        return serialize_project_memory_batch(db, mapped, replayed=True)

    lock_project_memory(db, project_id)
    existing = _batch_by_idempotency_key(
        db,
        idempotency_key=idempotency_key,
        project_id=project_id,
    )
    if existing is not None:
        existing = _attach_idempotency_key(db, existing, idempotency_key)
        if existing.status in {"failed", "pending"} or (
            existing.status == "running"
            and existing.lease_expires_at is not None
            and existing.lease_expires_at <= utc_now()
        ):
            db.commit()
            return _run_prepared_batch(db, batch_id=existing.id, replayed=True)
        response = serialize_project_memory_batch(db, existing, replayed=True)
        db.commit()
        return response

    active = _active_batch(db, project_id=project_id)
    if active is not None:
        active = _attach_idempotency_key(db, active, idempotency_key)
        if active.status == "pending" or (
            active.status == "running"
            and active.lease_expires_at is not None
            and active.lease_expires_at <= utc_now()
        ):
            db.commit()
            return _run_prepared_batch(db, batch_id=active.id, replayed=True)
        response = serialize_project_memory_batch(db, active, replayed=True)
        db.commit()
        return response

    failed = _failed_batch_for_retry(db, project_id=project_id)
    if failed is not None:
        failed = _attach_idempotency_key(db, failed, idempotency_key)
        db.commit()
        return _run_prepared_batch(db, batch_id=failed.id, replayed=True)

    batch = _prepare_batch(
        db,
        idempotency_key=idempotency_key,
        project_id=project_id,
        user_id=user_id,
    )
    if batch.status == "succeeded":
        return serialize_project_memory_batch(db, batch, replayed=False)
    return _run_prepared_batch(db, batch_id=batch.id, replayed=False)
