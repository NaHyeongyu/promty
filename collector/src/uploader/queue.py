from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from events import BaseEvent

DEFAULT_QUEUE_PATH = Path(
    os.environ.get("PROMPTHUB_QUEUE_PATH", "~/.prompthub/events.jsonl")
).expanduser()


class JSONLQueue:
    def __init__(self, path: str | Path | None = None) -> None:
        self.path = Path(path).expanduser() if path else DEFAULT_QUEUE_PATH

    def push(self, event: BaseEvent) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("a", encoding="utf-8") as file:
            file.write(json.dumps(event.to_dict(), ensure_ascii=False))
            file.write("\n")

    def read_batch(self, limit: int = 100) -> list[dict[str, Any]]:
        if not self.path.exists():
            return []

        events: list[dict[str, Any]] = []
        with self.path.open("r", encoding="utf-8") as file:
            for line in file:
                if len(events) >= limit:
                    break
                if not line.strip():
                    continue
                events.append(json.loads(line))
        return events

    def ack(self, event_ids: set[str]) -> None:
        if not self.path.exists() or not event_ids:
            return

        remaining: list[str] = []
        with self.path.open("r", encoding="utf-8") as file:
            for line in file:
                if not line.strip():
                    continue
                event = json.loads(line)
                if event.get("id") not in event_ids:
                    remaining.append(line)

        tmp_path = self.path.with_suffix(f"{self.path.suffix}.tmp")
        with tmp_path.open("w", encoding="utf-8") as file:
            file.writelines(remaining)
        tmp_path.replace(self.path)
