from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session as DBSession

from app.core.config import settings
from app.core.security import require_web_user
from app.db.session import get_db
from app.models.artifacts import Artifact
from app.models.projects import Project
from app.models.sessions import Session
from app.models.users import User
from app.services.memory_artifacts import (
    LOCAL_MEMORY_GENERATOR,
    PENDING_MEMORY_DRAFT_GENERATOR,
    compile_project_memory,
    complete_session_if_ready,
    generate_context_memories_for_session,
    list_project_memory_artifacts,
    list_project_memory_pending_ranges,
    get_latest_project_memory,
    serialize_memory_artifact,
    serialize_memory_artifact_summary,
    update_project_memory_snapshot,
)
from app.services.gemini_memory import (
    GEMINI_MEMORY_DRAFT_GENERATOR,
)
from app.services.openai_memory import (
    OPENAI_MEMORY_DRAFT_GENERATOR,
    OPENAI_PROJECT_MEMORY_GENERATOR,
)

router = APIRouter(prefix="/api/projects", tags=["memory"])


class ProjectMemoryUpdateRequest(BaseModel):
    body_markdown: str = Field(min_length=1)


def _project_for_user(db: DBSession, project_id: UUID, user: User) -> Project:
    project = db.get(Project, project_id)
    if project is None or project.owner_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )
    return project


def _session_for_project(db: DBSession, project: Project, session_id: UUID) -> Session:
    session = db.get(Session, session_id)
    if session is None or session.project_id != project.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )
    return session


def _serialize_project_memory_snapshot(artifact: Artifact | None) -> dict[str, Any] | None:
    if artifact is None:
        return None
    metadata = artifact.metadata_ if isinstance(artifact.metadata_, dict) else {}
    return {
        "artifact": serialize_memory_artifact(artifact),
        "snapshot": metadata.get("project_memory_snapshot"),
    }


@router.get("/{project_id}/memory/pending")
def list_project_memory_pending(
    project_id: UUID,
    limit: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(require_web_user),
    db: DBSession = Depends(get_db),
) -> list[dict[str, Any]]:
    project = _project_for_user(db, project_id, current_user)
    ranges = list_project_memory_pending_ranges(db, project_id=project.id, limit=limit)
    db.commit()
    return ranges


@router.get("/_memory/generator")
def read_memory_generator_status(
    _current_user: User = Depends(require_web_user),
) -> dict[str, Any]:
    def active_generator(provider: str, *, stage: str) -> str:
        provider = provider.strip().lower()
        if provider == "openai" and settings.openai_api_key:
            return {
                "draft": OPENAI_MEMORY_DRAFT_GENERATOR,
                "pending_draft": PENDING_MEMORY_DRAFT_GENERATOR,
                "project": OPENAI_PROJECT_MEMORY_GENERATOR,
            }[stage]
        if provider == "gemini" and settings.gemini_api_key:
            return {
                "draft": GEMINI_MEMORY_DRAFT_GENERATOR,
                "pending_draft": PENDING_MEMORY_DRAFT_GENERATOR,
                "project": "gemini-project-memory-v1",
            }[stage]
        return LOCAL_MEMORY_GENERATOR

    return {
        "fallback_generator": LOCAL_MEMORY_GENERATOR,
        "gemini_configured": bool(settings.gemini_api_key),
        "gemini_max_retries": settings.gemini_max_retries,
        "gemini_model": settings.gemini_model,
        "openai_configured": bool(settings.openai_api_key),
        "openai_max_retries": settings.openai_max_retries,
        "openai_model": settings.openai_model,
        "generators": {
            "draft": active_generator(settings.memory_draft_generator, stage="draft"),
            "pending_draft": PENDING_MEMORY_DRAFT_GENERATOR,
            "project": active_generator(settings.project_memory_generator, stage="project"),
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


@router.post("/{project_id}/sessions/{session_id}/complete")
def complete_project_session(
    project_id: UUID,
    session_id: UUID,
    force: bool = Query(default=True),
    regenerate: bool = Query(default=False),
    current_user: User = Depends(require_web_user),
    db: DBSession = Depends(get_db),
) -> dict[str, Any]:
    project = _project_for_user(db, project_id, current_user)
    session = _session_for_project(db, project, session_id)
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

    db.commit()
    pending_range = next(
        (
            item
            for item in list_project_memory_pending_ranges(db, project_id=project.id, limit=100)
            if item["session_id"] == str(session.id)
        ),
        None,
    )
    db.commit()
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


@router.post("/{project_id}/sessions/{session_id}/checkpoint")
def checkpoint_project_session(
    project_id: UUID,
    session_id: UUID,
    regenerate: bool = Query(default=False),
    current_user: User = Depends(require_web_user),
    db: DBSession = Depends(get_db),
) -> dict[str, Any]:
    project = _project_for_user(db, project_id, current_user)
    session = _session_for_project(db, project, session_id)
    pending_ranges = [
        item
        for item in list_project_memory_pending_ranges(db, project_id=project.id, limit=100)
        if item["session_id"] == str(session.id)
    ]
    if not pending_ranges:
        db.commit()
        return {
            "artifacts": [],
            "message": "No pending memory range for this session.",
            "status": "no_pending_range",
        }
    checkpointable_ranges = [item for item in pending_ranges if item["can_checkpoint"]]
    if not checkpointable_ranges:
        db.commit()
        return {
            "artifacts": [],
            "message": "Pending range has no prompts to summarize.",
            "pending_range": pending_ranges[0],
            "status": "no_memory",
        }
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
    pending_range = {
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
    memories = generate_context_memories_for_session(
        db,
        session,
        end_sequence=pending_range["end_sequence"],
        force_regenerate=regenerate,
        start_sequence=pending_range["start_sequence"],
        trigger_reason="batch_organize",
    )
    if not memories:
        project_memory = get_latest_project_memory(db, project_id=project.id)
        db.commit()
        return {
            "artifacts": [],
            "message": "No memory was generated for this pending range.",
            "pending_range": pending_range,
            "project_memory": _serialize_project_memory_snapshot(project_memory),
            "status": "no_memory",
        }
    project_memory = compile_project_memory(db, project_id=project.id)
    db.commit()
    return {
        "artifacts": [serialize_memory_artifact(memory) for memory in memories],
        "message": "Pending Memory was organized and Project Memory was updated.",
        "pending_range": pending_range,
        "project_memory": _serialize_project_memory_snapshot(project_memory),
        "status": "memory_generated",
    }


@router.post("/{project_id}/memory/project/compile")
def compile_project_memory_snapshot(
    project_id: UUID,
    regenerate: bool = Query(default=False),
    current_user: User = Depends(require_web_user),
    db: DBSession = Depends(get_db),
) -> dict[str, Any]:
    project = _project_for_user(db, project_id, current_user)
    artifact = compile_project_memory(
        db,
        force_regenerate=regenerate,
        project_id=project.id,
    )
    db.commit()
    return _serialize_project_memory_snapshot(artifact) or {"artifact": None, "snapshot": None}


@router.get("/{project_id}/memory/project")
def read_project_memory_snapshot(
    project_id: UUID,
    current_user: User = Depends(require_web_user),
    db: DBSession = Depends(get_db),
) -> dict[str, Any] | None:
    project = _project_for_user(db, project_id, current_user)
    return _serialize_project_memory_snapshot(
        get_latest_project_memory(db, project_id=project.id)
    )


@router.patch("/{project_id}/memory/project")
def update_project_memory(
    project_id: UUID,
    payload: ProjectMemoryUpdateRequest,
    current_user: User = Depends(require_web_user),
    db: DBSession = Depends(get_db),
) -> dict[str, Any]:
    project = _project_for_user(db, project_id, current_user)
    artifact = update_project_memory_snapshot(
        db,
        body_markdown=payload.body_markdown,
        project_id=project.id,
    )
    db.commit()
    return _serialize_project_memory_snapshot(artifact) or {"artifact": None, "snapshot": None}


@router.get("/{project_id}/artifacts")
def list_project_artifacts(
    project_id: UUID,
    limit: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(require_web_user),
    db: DBSession = Depends(get_db),
) -> list[dict[str, Any]]:
    project = _project_for_user(db, project_id, current_user)
    artifacts = list_project_memory_artifacts(db, project_id=project.id, limit=limit)
    return [serialize_memory_artifact_summary(artifact, db=db) for artifact in artifacts]
