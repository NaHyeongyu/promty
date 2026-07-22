from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session

from app.core.time import utc_now
from app.models.artifact_versions import ArtifactVersion
from app.models.artifacts import Artifact
from app.models.code_change_patches import CodeChangePatch
from app.models.events import Event
from app.models.project_memory_batches import ProjectMemoryBatch
from app.models.project_stats import ProjectStats
from app.models.published_flows import (
    PublishedFlow,
    PublishedFlowAsset,
    PublishedFlowFile,
    PublishedFlowItem,
)
from app.models.sessions import Session as PromptSession
from app.models.users import User
from app.services.projects.views import project_for_user


@dataclass(frozen=True)
class ActivityDeletionResult:
    asset_storage_keys: tuple[str, ...]


def _refresh_project_stats(db: Session, *, project_id: UUID) -> None:
    session_count = int(
        db.scalar(
            select(func.count(PromptSession.id)).where(
                PromptSession.project_id == project_id
            )
        )
        or 0
    )
    event_count, prompt_count, latest_event_at = db.execute(
        select(
            func.count(Event.id),
            func.count(Event.id).filter(Event.event_type == "PromptSubmitted"),
            func.max(Event.created_at),
        ).where(Event.project_id == project_id)
    ).one()
    project_stats = db.get(ProjectStats, project_id)
    if project_stats is None:
        project_stats = ProjectStats(project_id=project_id)
        db.add(project_stats)
    project_stats.session_count = session_count
    project_stats.event_count = int(event_count or 0)
    project_stats.prompt_count = int(prompt_count or 0)
    project_stats.latest_event_at = latest_event_at
    project_stats.updated_at = utc_now()


def _string(value: Any) -> str | None:
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, str) and value:
        return value
    return None


def _ensure_generation_is_idle(db: Session, *, project_id: UUID) -> None:
    active_batch_id = db.scalar(
        select(ProjectMemoryBatch.id)
        .where(
            ProjectMemoryBatch.project_id == project_id,
            ProjectMemoryBatch.status.in_(("pending", "running")),
        )
        .limit(1)
    )
    if active_batch_id is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Wait for Project Memory generation to finish before deleting "
                "prompt activity."
            ),
        )


def _linked_prompt_event_ids(
    events: Iterable[Event],
    *,
    prompt_event_id: UUID,
) -> set[UUID]:
    target_id = str(prompt_event_id)
    current_prompt_id: str | None = None
    prompt_by_turn: dict[str, str] = {}
    linked_ids = {prompt_event_id}

    for event in events:
        payload = event.payload if isinstance(event.payload, dict) else {}
        if event.event_type == "PromptSubmitted":
            current_prompt_id = str(event.id)
            turn_id = payload.get("turn_id")
            if turn_id is not None:
                prompt_by_turn[str(turn_id)] = current_prompt_id
            continue

        if event.event_type in {"SessionStarted", "SessionEnded"}:
            continue

        linked_prompt_id = _string(payload.get("prompt_event_id"))
        if linked_prompt_id is None and payload.get("turn_id") is not None:
            linked_prompt_id = prompt_by_turn.get(str(payload["turn_id"]))
        if linked_prompt_id is None and event.event_type in {
            "ResponseReceived",
            "FilesChanged",
            "CommitCreated",
        }:
            linked_prompt_id = current_prompt_id
        if linked_prompt_id == target_id:
            linked_ids.add(event.id)

    return linked_ids


def _discard_pending_memory_drafts(
    db: Session,
    *,
    project_id: UUID,
    prompt_event_ids: set[UUID],
    session_id: UUID | None = None,
) -> None:
    prompt_ids = {str(event_id) for event_id in prompt_event_ids}
    drafts = list(
        db.scalars(
            select(Artifact).where(
                Artifact.project_id == project_id,
                Artifact.type == "MemoryDraft",
            )
        )
    )

    for draft in drafts:
        versions = list(
            db.scalars(
                select(ArtifactVersion).where(ArtifactVersion.artifact_id == draft.id)
            )
        )
        draft_prompt_ids = {str(value) for value in (draft.prompt_event_ids or [])}
        version_prompt_ids = {
            str(value)
            for version in versions
            for value in (version.prompt_event_ids or [])
        }
        contains_deleted_source = bool(
            prompt_ids.intersection(draft_prompt_ids | version_prompt_ids)
        )
        if session_id is not None:
            contains_deleted_source = contains_deleted_source or draft.session_id == session_id or any(
                version.session_id == session_id for version in versions
            )
        if not contains_deleted_source:
            continue

        discarded_metadata = {
            "artifact_stage": "discarded_source",
            "discarded_reason": "source_activity_deleted",
            "review_state": "ignored",
        }
        draft.title = "Discarded deleted activity"
        draft.summary = None
        draft.reason = None
        draft.outcome = None
        draft.sections = []
        draft.changed_files = []
        draft.prompt_event_ids = []
        draft.commit_sha = None
        draft.metadata_ = discarded_metadata
        draft.updated_at = utc_now()
        for version in versions:
            version.title = "Discarded deleted activity"
            version.summary = None
            version.reason = None
            version.outcome = None
            version.sections = []
            version.changed_files = []
            version.prompt_event_ids = []
            version.commit_sha = None
            version.metadata_ = discarded_metadata.copy()


def _delete_copied_flows(
    db: Session,
    *,
    event_ids: set[UUID],
    project_id: UUID,
    session_id: UUID | None = None,
) -> tuple[str, ...]:
    item_flow_ids = select(PublishedFlowItem.published_flow_id).where(
        PublishedFlowItem.source_event_id.in_(event_ids)
    )
    file_flow_ids = select(PublishedFlowFile.published_flow_id).where(
        PublishedFlowFile.source_event_id.in_(event_ids)
    )
    flow_conditions = [
        PublishedFlow.source_start_event_id.in_(event_ids),
        PublishedFlow.source_end_event_id.in_(event_ids),
        PublishedFlow.id.in_(item_flow_ids),
        PublishedFlow.id.in_(file_flow_ids),
    ]
    if session_id is not None:
        flow_conditions.append(PublishedFlow.source_session_id == session_id)

    flow_ids = list(
        db.scalars(
            select(PublishedFlow.id).where(
                PublishedFlow.source_project_id == project_id,
                or_(*flow_conditions),
            )
        )
    )
    if not flow_ids:
        return ()

    storage_keys = tuple(
        db.scalars(
            select(PublishedFlowAsset.storage_key).where(
                PublishedFlowAsset.published_flow_id.in_(flow_ids)
            )
        )
    )
    db.execute(delete(PublishedFlow).where(PublishedFlow.id.in_(flow_ids)))
    return storage_keys


def delete_prompt_activity(
    db: Session,
    *,
    project_id: UUID,
    prompt_event_id: UUID,
    user: User,
) -> ActivityDeletionResult:
    project_for_user(db, project_id, user)
    _ensure_generation_is_idle(db, project_id=project_id)
    prompt_event = db.scalar(
        select(Event).where(
            Event.id == prompt_event_id,
            Event.project_id == project_id,
            Event.event_type == "PromptSubmitted",
        )
    )
    if prompt_event is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt activity not found",
        )

    session_events = list(
        db.scalars(
            select(Event)
            .where(Event.session_id == prompt_event.session_id)
            .order_by(Event.sequence, Event.created_at, Event.id)
        )
    )
    event_ids = _linked_prompt_event_ids(
        session_events,
        prompt_event_id=prompt_event_id,
    )
    patch_event_ids = set(
        db.scalars(
            select(CodeChangePatch.event_id).where(
                CodeChangePatch.project_id == project_id,
                CodeChangePatch.prompt_event_id == prompt_event_id,
            )
        )
    )
    event_ids.update(patch_event_ids)

    asset_storage_keys = _delete_copied_flows(
        db,
        event_ids=event_ids,
        project_id=project_id,
    )
    _discard_pending_memory_drafts(
        db,
        project_id=project_id,
        prompt_event_ids={prompt_event_id},
    )
    db.execute(
        delete(CodeChangePatch).where(
            CodeChangePatch.project_id == project_id,
            CodeChangePatch.prompt_event_id == prompt_event_id,
        )
    )
    db.execute(
        delete(Event).where(
            Event.project_id == project_id,
            Event.id.in_(event_ids),
        )
    )
    db.flush()
    _refresh_project_stats(db, project_id=project_id)
    db.flush()
    return ActivityDeletionResult(asset_storage_keys=asset_storage_keys)


def delete_session_activity(
    db: Session,
    *,
    project_id: UUID,
    session_id: UUID,
    user: User,
) -> ActivityDeletionResult:
    project_for_user(db, project_id, user)
    _ensure_generation_is_idle(db, project_id=project_id)
    session = db.scalar(
        select(PromptSession).where(
            PromptSession.id == session_id,
            PromptSession.project_id == project_id,
        )
    )
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session activity not found",
        )

    event_rows = list(
        db.execute(
            select(Event.id, Event.event_type).where(Event.session_id == session_id)
        )
    )
    event_ids = {event_id for event_id, _event_type in event_rows}
    prompt_event_ids = {
        event_id
        for event_id, event_type in event_rows
        if event_type == "PromptSubmitted"
    }
    asset_storage_keys = _delete_copied_flows(
        db,
        event_ids=event_ids,
        project_id=project_id,
        session_id=session_id,
    )
    _discard_pending_memory_drafts(
        db,
        project_id=project_id,
        prompt_event_ids=prompt_event_ids,
        session_id=session_id,
    )
    db.delete(session)
    db.flush()
    _refresh_project_stats(db, project_id=project_id)
    db.flush()
    return ActivityDeletionResult(asset_storage_keys=asset_storage_keys)
