from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.events import EventBatchCreate, EventBatchResponse, EventRead
from app.services.events import add_events, list_recent_events

router = APIRouter(prefix="/api/events", tags=["events"])


@router.post("/batch", response_model=EventBatchResponse)
def create_events(
    batch: EventBatchCreate,
    db: Session = Depends(get_db),
) -> EventBatchResponse:
    event_ids = add_events(db, batch.events)
    return EventBatchResponse(accepted=len(event_ids), event_ids=event_ids)


@router.get("", response_model=list[EventRead])
def list_events(db: Session = Depends(get_db)) -> list[EventRead]:
    return list_recent_events(db)
