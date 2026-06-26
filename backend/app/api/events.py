from __future__ import annotations

from fastapi import APIRouter

from app.schemas.events import EventBatchCreate, EventBatchResponse, EventRead
from app.services.events import event_store

router = APIRouter(prefix="/api/events", tags=["events"])


@router.post("/batch", response_model=EventBatchResponse)
def create_events(batch: EventBatchCreate) -> EventBatchResponse:
    event_ids = event_store.add_many(batch.events)
    return EventBatchResponse(accepted=len(event_ids), event_ids=event_ids)


@router.get("", response_model=list[EventRead])
def list_events() -> list[EventRead]:
    return event_store.list_recent()
