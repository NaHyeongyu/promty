from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session as DBSession


from app.core.security import require_external_ai_consent, require_web_user
from app.db.session import get_db
from app.models.users import User
from app.schemas.memory import ProjectMemoryGenerateRequest, ProjectMemoryUpdateRequest
from app.schemas.memory_responses import (
    MemoryArtifactSummaryResponse,
    MemoryBatchResponse,
    MemoryGenerationPreviewResponse,
    MemoryGenerationReviewResponse,
    MemoryGeneratorStatusResponse,
    MemoryReviewQueueResponse,
    PendingMemoryRangeResponse,
    ProjectMemorySnapshotResponse,
    SessionCompletionResponse,
)
from app.services.memory.workflows import (
    approve_project_memory_response,
    complete_project_session_response,
    generate_project_memory_response,
    list_pending_memory_ranges_response,
    list_project_artifacts_response,
    memory_generator_status,
    preview_project_memory_generation_response,
    project_memory_generation_review_response,
    delete_project_memory_review_prompt_response,
    read_project_memory_batch_response,
    read_latest_project_memory_batch_response,
    read_project_memory_response,
    refresh_memory_review_queue_response,
    update_project_memory_response,
)

router = APIRouter(prefix="/api/projects", tags=["memory"])


@router.post(
    "/memory/review-queue/refresh",
    response_model=MemoryReviewQueueResponse,
)
def refresh_memory_review_queue(
    limit: int = Query(default=100, ge=1, le=100),
    current_user: User = Depends(require_web_user),
    db: DBSession = Depends(get_db),
) -> dict[str, Any]:
    response = refresh_memory_review_queue_response(
        db,
        limit=limit,
        user=current_user,
    )
    db.commit()
    return response


@router.get(
    "/{project_id}/memory/pending",
    response_model=list[PendingMemoryRangeResponse],
)
def list_project_memory_pending(
    project_id: UUID,
    limit: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(require_web_user),
    db: DBSession = Depends(get_db),
) -> list[dict[str, Any]]:
    ranges = list_pending_memory_ranges_response(
        db,
        limit=limit,
        project_id=project_id,
        user=current_user,
    )
    db.commit()
    return ranges


@router.get("/_memory/generator", response_model=MemoryGeneratorStatusResponse)
def read_memory_generator_status(
    _current_user: User = Depends(require_web_user),
) -> dict[str, Any]:
    return memory_generator_status()


@router.post(
    "/{project_id}/sessions/{session_id}/complete",
    response_model=SessionCompletionResponse,
)
def complete_project_session(
    project_id: UUID,
    session_id: UUID,
    force: bool = Query(default=True),
    current_user: User = Depends(require_web_user),
    db: DBSession = Depends(get_db),
) -> dict[str, Any]:
    response = complete_project_session_response(
        db,
        force=force,
        project_id=project_id,
        session_id=session_id,
        user=current_user,
    )
    db.commit()
    return response


@router.post(
    "/{project_id}/memory/generate",
    status_code=202,
    response_model=MemoryBatchResponse,
)
def generate_project_memory(
    project_id: UUID,
    payload: ProjectMemoryGenerateRequest,
    current_user: User = Depends(require_external_ai_consent),
    db: DBSession = Depends(get_db),
) -> dict[str, Any]:
    response = generate_project_memory_response(
        db,
        idempotency_key=str(payload.idempotency_key),
        review_token=payload.review_token,
        project_id=project_id,
        user=current_user,
    )
    db.commit()
    return response


@router.get(
    "/{project_id}/memory/generation-preview",
    response_model=MemoryGenerationPreviewResponse,
)
def preview_project_memory_generation(
    project_id: UUID,
    current_user: User = Depends(require_web_user),
    db: DBSession = Depends(get_db),
) -> dict[str, Any]:
    return preview_project_memory_generation_response(
        db,
        project_id=project_id,
        user=current_user,
    )


@router.get(
    "/{project_id}/memory/generation-review",
    response_model=MemoryGenerationReviewResponse,
)
def review_project_memory_generation(
    project_id: UUID,
    current_user: User = Depends(require_web_user),
    db: DBSession = Depends(get_db),
) -> dict[str, Any]:
    return project_memory_generation_review_response(
        db,
        project_id=project_id,
        user=current_user,
    )


@router.delete(
    "/{project_id}/memory/generation-review/prompts/{event_id}",
)
def delete_project_memory_review_prompt(
    project_id: UUID,
    event_id: UUID,
    current_user: User = Depends(require_web_user),
    db: DBSession = Depends(get_db),
) -> dict[str, Any]:
    response = delete_project_memory_review_prompt_response(
        db,
        project_id=project_id,
        event_id=event_id,
        user=current_user,
    )
    db.commit()
    return response


@router.get(
    "/{project_id}/memory/batches/latest",
    response_model=MemoryBatchResponse | None,
)
def read_latest_project_memory_batch(
    project_id: UUID,
    current_user: User = Depends(require_web_user),
    db: DBSession = Depends(get_db),
) -> dict[str, Any] | None:
    return read_latest_project_memory_batch_response(
        db,
        project_id=project_id,
        user=current_user,
    )


@router.get(
    "/{project_id}/memory/batches/{batch_id}",
    response_model=MemoryBatchResponse,
)
def read_project_memory_batch(
    project_id: UUID,
    batch_id: UUID,
    current_user: User = Depends(require_web_user),
    db: DBSession = Depends(get_db),
) -> dict[str, Any]:
    return read_project_memory_batch_response(
        db,
        batch_id=batch_id,
        project_id=project_id,
        user=current_user,
    )


@router.get(
    "/{project_id}/memory/project",
    response_model=ProjectMemorySnapshotResponse | None,
)
def read_project_memory_snapshot(
    project_id: UUID,
    current_user: User = Depends(require_web_user),
    db: DBSession = Depends(get_db),
) -> dict[str, Any] | None:
    return read_project_memory_response(db, project_id=project_id, user=current_user)


@router.patch(
    "/{project_id}/memory/project",
    response_model=ProjectMemorySnapshotResponse,
)
def update_project_memory(
    project_id: UUID,
    payload: ProjectMemoryUpdateRequest,
    current_user: User = Depends(require_web_user),
    db: DBSession = Depends(get_db),
) -> dict[str, Any]:
    response = update_project_memory_response(
        db,
        body_markdown=payload.body_markdown,
        project_id=project_id,
        user=current_user,
    )
    db.commit()
    return response


@router.post(
    "/{project_id}/memory/project/approve",
    response_model=ProjectMemorySnapshotResponse,
)
def approve_project_memory(
    project_id: UUID,
    current_user: User = Depends(require_web_user),
    db: DBSession = Depends(get_db),
) -> dict[str, Any]:
    response = approve_project_memory_response(
        db,
        project_id=project_id,
        user=current_user,
    )
    db.commit()
    return response


@router.get(
    "/{project_id}/artifacts",
    response_model=list[MemoryArtifactSummaryResponse],
)
def list_project_artifacts(
    project_id: UUID,
    limit: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(require_web_user),
    db: DBSession = Depends(get_db),
) -> list[dict[str, Any]]:
    return list_project_artifacts_response(
        db,
        limit=limit,
        project_id=project_id,
        user=current_user,
    )
