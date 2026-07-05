from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
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
    MEMORY_DRAFT_ARTIFACT_TYPE,
    compile_project_memory,
    complete_session_if_ready,
    create_and_run_session_memory_job,
    generate_memory_draft_for_session,
    ignore_memory_draft,
    list_project_memory_drafts,
    list_project_memory_artifacts,
    list_project_memory_pending_ranges,
    get_latest_project_memory,
    serialize_generation_job,
    serialize_memory_artifact,
    serialize_memory_artifact_summary,
    save_memory_draft_as_verified,
    update_memory_draft,
)
from app.services.gemini_memory import (
    GEMINI_CHUNK_SUMMARY_GENERATOR,
    GEMINI_MEMORY_DRAFT_GENERATOR,
    GEMINI_MEMORY_GENERATOR,
)
from app.services.openai_memory import (
    OPENAI_CHUNK_SUMMARY_GENERATOR,
    OPENAI_MEMORY_DRAFT_GENERATOR,
    OPENAI_MEMORY_GENERATOR,
    OPENAI_PROJECT_MEMORY_GENERATOR,
)

router = APIRouter(prefix="/api/projects", tags=["memory"])


class MemoryDraftUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    summary: str | None = None
    why_it_matters: str | None = None
    reason: str | None = None
    outcome: str | None = None
    tags: list[str] | None = None
    technologies: list[str] | None = None
    sections: list[dict[str, str]] | None = None


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


def _draft_for_project(db: DBSession, project: Project, draft_id: UUID) -> Artifact:
    draft = db.get(Artifact, draft_id)
    if (
        draft is None
        or draft.project_id != project.id
        or draft.type != MEMORY_DRAFT_ARTIFACT_TYPE
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Memory draft not found",
        )
    return draft


def _draft_updates(payload: MemoryDraftUpdateRequest | None) -> dict[str, Any]:
    if payload is None:
        return {}
    updates = payload.dict(exclude_unset=True)
    why_it_matters = updates.pop("why_it_matters", None)
    if why_it_matters is not None:
        updates["reason"] = why_it_matters
    return updates


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
    return list_project_memory_pending_ranges(db, project_id=project.id, limit=limit)


@router.get("/_memory/generator")
def read_memory_generator_status(
    _current_user: User = Depends(require_web_user),
) -> dict[str, Any]:
    def active_generator(provider: str, *, stage: str) -> str:
        provider = provider.strip().lower()
        if provider == "openai" and settings.openai_api_key:
            return {
                "chunk": OPENAI_CHUNK_SUMMARY_GENERATOR,
                "draft": OPENAI_MEMORY_DRAFT_GENERATOR,
                "legacy": OPENAI_MEMORY_GENERATOR,
                "project": OPENAI_PROJECT_MEMORY_GENERATOR,
            }[stage]
        if provider == "gemini" and settings.gemini_api_key:
            return {
                "chunk": GEMINI_CHUNK_SUMMARY_GENERATOR,
                "draft": GEMINI_MEMORY_DRAFT_GENERATOR,
                "legacy": GEMINI_MEMORY_GENERATOR,
                "project": "gemini-project-memory-v1",
            }[stage]
        return LOCAL_MEMORY_GENERATOR

    return {
        "active_generator": active_generator(settings.memory_generator, stage="legacy"),
        "fallback_generator": LOCAL_MEMORY_GENERATOR,
        "gemini_configured": bool(settings.gemini_api_key),
        "gemini_max_retries": settings.gemini_max_retries,
        "gemini_model": settings.gemini_model,
        "openai_configured": bool(settings.openai_api_key),
        "openai_max_retries": settings.openai_max_retries,
        "openai_model": settings.openai_model,
        "generators": {
            "chunk": active_generator(settings.memory_chunk_generator, stage="chunk"),
            "draft": active_generator(settings.memory_draft_generator, stage="draft"),
            "legacy": active_generator(settings.memory_generator, stage="legacy"),
            "project": active_generator(settings.project_memory_generator, stage="project"),
        },
        "requested_generator": settings.memory_generator,
        "requested_generators": {
            "chunk": settings.memory_chunk_generator,
            "draft": settings.memory_draft_generator,
            "legacy": settings.memory_generator,
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
            "job": None,
        }

    job = create_and_run_session_memory_job(
        db,
        force_regenerate=regenerate,
        project_id=project.id,
        reason=completion["reason"],
        session_id=session.id,
    )
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Memory artifact could not be generated.",
        ) from exc

    if job.status == "failed":
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=job.error or "Memory artifact generation failed.",
        )

    artifact = db.get(Artifact, job.artifact_id) if job.artifact_id else None
    return {
        "artifact": serialize_memory_artifact(artifact) if artifact else None,
        "completion": {
            "completed": True,
            "completed_at": completion["completed_at"].isoformat()
            if completion["completed_at"]
            else None,
            "reason": completion["reason"],
        },
        "job": serialize_generation_job(job),
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
    pending_range = next(
        (
            item
            for item in list_project_memory_pending_ranges(db, project_id=project.id, limit=100)
            if item["session_id"] == str(session.id)
        ),
        None,
    )
    if pending_range is None:
        return {
            "draft": None,
            "message": "No pending memory range for this session.",
            "status": "no_pending_range",
        }
    if not pending_range["can_checkpoint"]:
        return {
            "draft": None,
            "message": "Pending range has no prompts to summarize.",
            "pending_range": pending_range,
            "status": "no_draft",
        }
    draft = generate_memory_draft_for_session(
        db,
        session,
        end_sequence=pending_range["end_sequence"],
        force_regenerate=regenerate,
        start_sequence=pending_range["start_sequence"],
        trigger_reason="manual_checkpoint",
    )
    db.commit()
    if draft is None:
        return {
            "draft": None,
            "message": "No draft was generated for this pending range.",
            "pending_range": pending_range,
            "status": "no_draft",
        }
    return {
        "draft": serialize_memory_artifact(draft),
        "pending_range": pending_range,
        "status": "draft_created",
    }


@router.get("/{project_id}/memory/drafts")
def list_project_memory_draft_artifacts(
    project_id: UUID,
    limit: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(require_web_user),
    db: DBSession = Depends(get_db),
) -> list[dict[str, Any]]:
    project = _project_for_user(db, project_id, current_user)
    drafts = list_project_memory_drafts(db, project_id=project.id, limit=limit)
    return [serialize_memory_artifact_summary(draft, db=db) for draft in drafts]


@router.patch("/{project_id}/memory/drafts/{draft_id}")
def update_project_memory_draft(
    project_id: UUID,
    draft_id: UUID,
    payload: MemoryDraftUpdateRequest,
    current_user: User = Depends(require_web_user),
    db: DBSession = Depends(get_db),
) -> dict[str, Any]:
    project = _project_for_user(db, project_id, current_user)
    draft = _draft_for_project(db, project, draft_id)
    updated = update_memory_draft(db, draft, updates=_draft_updates(payload))
    db.commit()
    return {"draft": serialize_memory_artifact(updated)}


@router.post("/{project_id}/memory/drafts/{draft_id}/save")
def save_project_memory_draft(
    project_id: UUID,
    draft_id: UUID,
    payload: MemoryDraftUpdateRequest | None = None,
    current_user: User = Depends(require_web_user),
    db: DBSession = Depends(get_db),
) -> dict[str, Any]:
    project = _project_for_user(db, project_id, current_user)
    draft = _draft_for_project(db, project, draft_id)
    verified = save_memory_draft_as_verified(
        db,
        draft,
        updates=_draft_updates(payload),
    )
    project_memory = compile_project_memory(db, project_id=project.id)
    db.commit()
    return {
        "artifact": serialize_memory_artifact(verified),
        "project_memory": _serialize_project_memory_snapshot(project_memory),
    }


@router.post("/{project_id}/memory/drafts/{draft_id}/ignore")
def ignore_project_memory_draft(
    project_id: UUID,
    draft_id: UUID,
    current_user: User = Depends(require_web_user),
    db: DBSession = Depends(get_db),
) -> dict[str, Any]:
    project = _project_for_user(db, project_id, current_user)
    draft = _draft_for_project(db, project, draft_id)
    ignored = ignore_memory_draft(db, draft)
    db.commit()
    return {"draft": serialize_memory_artifact(ignored)}


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
