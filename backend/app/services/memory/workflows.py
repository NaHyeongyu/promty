from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session as DBSession

from app.core.config import settings
from app.core.security import is_admin_user
from app.models.artifacts import Artifact
from app.models.projects import Project
from app.models.sessions import Session
from app.models.users import User
from app.services.memory.constants import (
    LOCAL_MEMORY_GENERATOR,
    PENDING_MEMORY_DRAFT_GENERATOR,
)
from app.services.memory.providers import configured_generator_for_provider
from app.services.memory.serializers import (
    serialize_memory_artifact,
    serialize_memory_artifact_summary,
)
from app.services.memory.artifacts import (
    compile_project_memory,
    generate_context_memories_for_session,
    get_latest_project_memory,
    list_project_memory_history_artifacts,
    list_project_memory_pending_ranges,
    update_project_memory_snapshot,
)
from app.services.memory.session_completion import complete_session_if_ready


def project_for_user(
    db: DBSession,
    project_id: UUID,
    user: User,
    *,
    allow_admin: bool = False,
) -> Project:
    project = db.get(Project, project_id)
    if project is None or (
        project.owner_id != user.id and not (allow_admin and is_admin_user(user))
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )
    return project


def session_for_project(db: DBSession, project: Project, session_id: UUID) -> Session:
    session = db.get(Session, session_id)
    if session is None or session.project_id != project.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )
    return session


def serialize_project_memory_snapshot(artifact: Artifact | None) -> dict[str, Any] | None:
    if artifact is None:
        return None
    metadata = artifact.metadata_ if isinstance(artifact.metadata_, dict) else {}
    return {
        "artifact": serialize_memory_artifact(artifact),
        "snapshot": metadata.get("project_memory_snapshot"),
    }


def memory_generator_status() -> dict[str, Any]:
    return {
        "fallback_generator": LOCAL_MEMORY_GENERATOR,
        "gemini_configured": bool(settings.gemini_api_key),
        "gemini_max_retries": settings.gemini_max_retries,
        "gemini_model": settings.gemini_model,
        "openai_configured": bool(settings.openai_api_key),
        "openai_max_retries": settings.openai_max_retries,
        "openai_model": settings.openai_model,
        "generators": {
            "draft": configured_generator_for_provider(
                settings.memory_draft_generator,
                stage="draft",
            ),
            "pending_draft": PENDING_MEMORY_DRAFT_GENERATOR,
            "project": configured_generator_for_provider(
                settings.project_memory_generator,
                stage="project",
            ),
        },
        "requested_generators": {
            "draft": settings.memory_draft_generator,
            "pending_draft": "local",
            "project": settings.project_memory_generator,
        },
        "timeout_seconds": {
            "gemini": settings.gemini_timeout_seconds,
            "openai": settings.openai_timeout_seconds,
        },
    }


def list_pending_memory_ranges_response(
    db: DBSession,
    *,
    limit: int,
    project_id: UUID,
    user: User,
) -> list[dict[str, Any]]:
    project = project_for_user(db, project_id, user, allow_admin=True)
    return list_project_memory_pending_ranges(db, project_id=project.id, limit=limit)


def complete_project_session_response(
    db: DBSession,
    *,
    force: bool,
    project_id: UUID,
    session_id: UUID,
    user: User,
) -> dict[str, Any]:
    project = project_for_user(db, project_id, user)
    session = session_for_project(db, project, session_id)
    completion = complete_session_if_ready(db, session, force=force)
    if not completion["completed"]:
        return {
            "artifact": None,
            "completion": {
                "completed": False,
                "completed_at": None,
                "reason": completion["reason"],
            },
            "pending_range": None,
            "status": "session_open",
        }

    pending_range = next(
        (
            item
            for item in list_project_memory_pending_ranges(db, project_id=project.id, limit=100)
            if item["session_id"] == str(session.id)
        ),
        None,
    )
    return {
        "artifact": None,
        "completion": {
            "completed": True,
            "completed_at": completion["completed_at"].isoformat()
            if completion["completed_at"]
            else None,
            "reason": completion["reason"],
        },
        "message": "Session completed. Pending Memory is waiting for batch organization.",
        "pending_range": pending_range,
        "status": "pending_memory",
    }


def _combined_pending_range(checkpointable_ranges: list[dict[str, Any]]) -> dict[str, Any]:
    start_sequences = [
        item["start_sequence"]
        for item in checkpointable_ranges
        if isinstance(item.get("start_sequence"), int)
    ]
    end_sequences = [
        item["end_sequence"]
        for item in checkpointable_ranges
        if isinstance(item.get("end_sequence"), int)
    ]
    return {
        **checkpointable_ranges[0],
        "end_sequence": max(end_sequences)
        if end_sequences
        else checkpointable_ranges[0]["end_sequence"],
        "event_count": sum(item.get("event_count") or 0 for item in checkpointable_ranges),
        "prompt_count": sum(item.get("prompt_count") or 0 for item in checkpointable_ranges),
        "response_count": sum(item.get("response_count") or 0 for item in checkpointable_ranges),
        "start_sequence": min(start_sequences)
        if start_sequences
        else checkpointable_ranges[0]["start_sequence"],
    }


def checkpoint_project_session_response(
    db: DBSession,
    *,
    project_id: UUID,
    regenerate: bool,
    session_id: UUID,
    user: User,
) -> dict[str, Any]:
    project = project_for_user(db, project_id, user)
    session = session_for_project(db, project, session_id)
    pending_ranges = [
        item
        for item in list_project_memory_pending_ranges(db, project_id=project.id, limit=100)
        if item["session_id"] == str(session.id)
    ]
    if not pending_ranges:
        return {
            "artifacts": [],
            "message": "No pending memory range for this session.",
            "status": "no_pending_range",
        }

    checkpointable_ranges = [item for item in pending_ranges if item["can_checkpoint"]]
    if not checkpointable_ranges:
        return {
            "artifacts": [],
            "message": "Pending range has no prompts to summarize.",
            "pending_range": pending_ranges[0],
            "status": "no_memory",
        }

    pending_range = _combined_pending_range(checkpointable_ranges)
    memories = generate_context_memories_for_session(
        db,
        session,
        end_sequence=pending_range["end_sequence"],
        force_regenerate=regenerate,
        start_sequence=pending_range["start_sequence"],
        trigger_reason="batch_organize",
    )
    if not memories:
        return {
            "artifacts": [],
            "message": "No memory was generated for this pending range.",
            "pending_range": pending_range,
            "status": "no_memory",
        }

    compile_project_memory(db, project_id=project.id)
    return {
        "artifacts": [],
        "message": "Project Memory document was generated.",
        "pending_range": pending_range,
        "status": "memory_generated",
    }


def compile_project_memory_response(
    db: DBSession,
    *,
    project_id: UUID,
    regenerate: bool,
    user: User,
) -> dict[str, Any]:
    project = project_for_user(db, project_id, user)
    artifact = compile_project_memory(
        db,
        force_regenerate=regenerate,
        project_id=project.id,
    )
    return serialize_project_memory_snapshot(artifact) or {"artifact": None, "snapshot": None}


def read_project_memory_response(
    db: DBSession,
    *,
    project_id: UUID,
    user: User,
) -> dict[str, Any] | None:
    project = project_for_user(db, project_id, user, allow_admin=True)
    return serialize_project_memory_snapshot(
        get_latest_project_memory(db, project_id=project.id)
    )


def update_project_memory_response(
    db: DBSession,
    *,
    body_markdown: str,
    project_id: UUID,
    user: User,
) -> dict[str, Any]:
    project = project_for_user(db, project_id, user)
    artifact = update_project_memory_snapshot(
        db,
        body_markdown=body_markdown,
        project_id=project.id,
    )
    return serialize_project_memory_snapshot(artifact) or {"artifact": None, "snapshot": None}


def list_project_artifacts_response(
    db: DBSession,
    *,
    limit: int,
    project_id: UUID,
    user: User,
) -> list[dict[str, Any]]:
    project = project_for_user(db, project_id, user, allow_admin=True)
    artifacts = list_project_memory_history_artifacts(
        db,
        limit=limit,
        project_id=project.id,
    )
    return [serialize_memory_artifact_summary(artifact) for artifact in artifacts]
