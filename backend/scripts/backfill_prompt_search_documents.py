from __future__ import annotations

from pathlib import Path
import sys

from sqlalchemy import select

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db.session import SessionLocal  # noqa: E402
from app.models.events import Event  # noqa: E402
from app.services.event_payload_security import decrypt_event_payload  # noqa: E402
from app.services.prompt_search import upsert_prompt_search_document  # noqa: E402

BATCH_SIZE = 500


def main() -> None:
    db = SessionLocal()
    try:
        events = db.execute(
            select(Event)
            .where(Event.event_type == "PromptSubmitted")
            .order_by(Event.created_at, Event.sequence)
            .execution_options(yield_per=BATCH_SIZE)
        ).scalars()
        count = 0
        for event in events:
            payload = decrypt_event_payload(event.event_type, event.payload)
            upsert_prompt_search_document(db, event, payload)
            count += 1
            if count % BATCH_SIZE == 0:
                db.commit()
        db.commit()
        print(f"Backfilled prompt search documents from {count} PromptSubmitted events.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
