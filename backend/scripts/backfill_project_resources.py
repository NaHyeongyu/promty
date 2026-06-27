from __future__ import annotations

from pathlib import Path
import sys

from sqlalchemy import select

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db.session import SessionLocal  # noqa: E402
from app.models.events import Event  # noqa: E402
from app.services.project_resources import sync_project_resources_from_event  # noqa: E402


def main() -> None:
    db = SessionLocal()
    try:
        events = db.execute(
            select(Event)
            .where(Event.event_type == "FilesChanged")
            .order_by(Event.created_at, Event.sequence)
        ).scalars()
        count = 0
        for event in events:
            sync_project_resources_from_event(db, event, event.payload)
            count += 1
        db.commit()
        print(f"Backfilled project resources from {count} FilesChanged events.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
