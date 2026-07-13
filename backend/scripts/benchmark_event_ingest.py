from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import json
from time import perf_counter
from typing import Any
from uuid import uuid4

from sqlalchemy import event as sqlalchemy_event
from sqlalchemy.engine import Connection

from app.db.session import SessionLocal, engine
from app.schemas.events import EventCreate
from app.services.events import add_events


def _event_batch(size: int) -> list[EventCreate]:
    project_id = uuid4()
    session_id = uuid4()
    timestamp = datetime.now(timezone.utc)
    return [
        EventCreate(
            id=uuid4(),
            schema_version=1,
            project_id=project_id,
            session_id=session_id,
            sequence=index,
            tool="codex-cli",
            event_type="PromptSubmitted",
            timestamp=timestamp,
            payload={
                "prompt": f"Synthetic ingest benchmark event {index}",
                "turn_id": str(index),
            },
        )
        for index in range(1, size + 1)
    ]


def run(size: int) -> dict[str, Any]:
    statements: Counter[str] = Counter()
    flushes = 0

    def count_statement(
        _connection: Connection,
        _cursor: Any,
        statement: str,
        _parameters: Any,
        _context: Any,
        _executemany: bool,
    ) -> None:
        operation = statement.lstrip().split(None, 1)[0].upper()
        statements[operation] += 1

    def count_flush(*_args: Any) -> None:
        nonlocal flushes
        flushes += 1

    sqlalchemy_event.listen(engine, "before_cursor_execute", count_statement)
    db = SessionLocal()
    sqlalchemy_event.listen(db, "after_flush", count_flush)
    started_at = perf_counter()
    try:
        add_events(db, _event_batch(size))
        db.flush()
        elapsed_seconds = perf_counter() - started_at
    finally:
        db.rollback()
        db.close()
        sqlalchemy_event.remove(engine, "before_cursor_execute", count_statement)

    return {
        "elapsed_ms": round(elapsed_seconds * 1000, 3),
        "event_count": size,
        "flush_count": flushes,
        "statements": dict(sorted(statements.items())),
        "statement_count": sum(statements.values()),
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Measure event-ingest SQL/flush counts and roll back all benchmark writes."
    )
    parser.add_argument("--events", type=int, default=100)
    args = parser.parse_args()
    if not 1 <= args.events <= 500:
        parser.error("--events must be between 1 and 500")
    print(json.dumps(run(args.events), indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
