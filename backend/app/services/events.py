from __future__ import annotations

from app.schemas.events import EventCreate, EventRead


class InMemoryEventStore:
    def __init__(self) -> None:
        self._events: dict[str, EventRead] = {}

    def add_many(self, events: list[EventCreate]) -> list[str]:
        event_ids: list[str] = []
        for event in events:
            event_id = str(event.id)
            event_data = event.model_dump() if hasattr(event, "model_dump") else event.dict()
            self._events[event_id] = EventRead(**event_data)
            event_ids.append(event_id)
        return event_ids

    def list_recent(self, limit: int = 100) -> list[EventRead]:
        events = sorted(
            self._events.values(),
            key=lambda event: event.timestamp,
            reverse=True,
        )
        return events[:limit]


event_store = InMemoryEventStore()
