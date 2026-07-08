from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import require_ingest_token, require_web_user
from app.db.session import get_db
from app.models.users import User
from app.schemas.events import EventBatchCreate, EventBatchResponse, EventRead, EventType
from app.services.events import EventIngestConflict, add_events, list_recent_events

router = APIRouter(prefix="/api/events", tags=["events"])


@router.post("/batch", response_model=EventBatchResponse)
def create_events(
    batch: EventBatchCreate,
    ingest_owner: User | None = Depends(require_ingest_token),
    db: Session = Depends(get_db),
) -> EventBatchResponse:
    try:
        event_ids = add_events(db, batch.events, owner=ingest_owner)
        db.commit()
    except EventIngestConflict as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=exc.detail,
        ) from exc
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Event batch violates database constraints",
        ) from exc
    return EventBatchResponse(accepted=len(event_ids), event_ids=event_ids)


@router.get("", response_model=list[EventRead])
def list_events(
    project_id: UUID | None = None,
    session_id: UUID | None = None,
    event_type: EventType | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    current_user: User = Depends(require_web_user),
    db: Session = Depends(get_db),
) -> list[EventRead]:
    return list_recent_events(
        db,
        owner=current_user,
        project_id=project_id,
        session_id=session_id,
        event_type=event_type,
        limit=limit,
    )
