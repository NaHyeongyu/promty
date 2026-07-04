from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
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
    complete_session_if_ready,
    create_and_run_session_memory_job,
    list_project_memory_artifacts,
    serialize_generation_job,
    serialize_memory_artifact,
    serialize_memory_artifact_summary,
)
from app.services.gemini_memory import GEMINI_MEMORY_GENERATOR

router = APIRouter(prefix="/api/projects", tags=["memory"])


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


@router.get("/_memory/generator")
def read_memory_generator_status(
    _current_user: User = Depends(require_web_user),
) -> dict[str, Any]:
    requested_generator = settings.memory_generator.strip().lower()
    gemini_enabled = requested_generator == "gemini"
    return {
        "active_generator": GEMINI_MEMORY_GENERATOR
        if gemini_enabled and settings.gemini_api_key
        else LOCAL_MEMORY_GENERATOR,
        "fallback_generator": LOCAL_MEMORY_GENERATOR,
        "gemini_configured": bool(settings.gemini_api_key),
        "gemini_model": settings.gemini_model,
        "requested_generator": GEMINI_MEMORY_GENERATOR
        if gemini_enabled
        else LOCAL_MEMORY_GENERATOR,
        "timeout_seconds": settings.gemini_timeout_seconds,
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
