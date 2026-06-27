from __future__ import annotations

from contextlib import contextmanager
import json
import os
from pathlib import Path
from typing import Any
from uuid import uuid4

from events import BaseEvent

try:
    import fcntl
except ImportError:  # pragma: no cover - non-POSIX fallback
    fcntl = None

DEFAULT_QUEUE_ROOT = Path(
    os.environ.get("PROMPTHUB_QUEUE_DIR", "~/.prompthub/events")
).expanduser()
LEGACY_QUEUE_PATH = Path("~/.prompthub/events.jsonl").expanduser()


def _safe_path_part(value: Any) -> str:
    safe_value = "".join(
        char for char in str(value) if char.isalnum() or char in ("-", "_")
    )
    return safe_value or "unknown"


class JSONLQueue:
    def __init__(self, path: str | Path | None = None) -> None:
        configured_path = path or os.environ.get("PROMPTHUB_QUEUE_PATH")
        self.root = None if configured_path else DEFAULT_QUEUE_ROOT
        self.path = Path(configured_path).expanduser() if configured_path else DEFAULT_QUEUE_ROOT
        self.lock_path = (
            self.path.with_suffix(f"{self.path.suffix}.lock")
            if self.root is None
            else self.path / ".lock"
        )

    def push(self, event: BaseEvent) -> None:
        with self._locked():
            queue_file = self._event_path(event)
            queue_file.parent.mkdir(parents=True, exist_ok=True)
            with queue_file.open("a", encoding="utf-8") as file:
                file.write(json.dumps(event.to_dict(), ensure_ascii=False))
                file.write("\n")

    def read_batch(self, limit: int = 100) -> list[dict[str, Any]]:
        with self._locked():
            events: list[dict[str, Any]] = []
            for queue_file in self._queue_files():
                with queue_file.open("r", encoding="utf-8") as file:
                    for line in file:
                        if len(events) >= limit:
                            return events
                        if not line.strip():
                            continue
                        try:
                            event = json.loads(line)
                        except json.JSONDecodeError:
                            continue
                        if isinstance(event, dict):
                            events.append(event)
            return events

    def ack(self, event_ids: set[str]) -> None:
        if not event_ids:
            return

        with self._locked():
            for queue_file in self._queue_files():
                self._ack_file(queue_file, event_ids)

    def _event_path(self, event: BaseEvent) -> Path:
        if self.root is None:
            return self.path
        return (
            self.root
            / _safe_path_part(event.project_id)
            / _safe_path_part(event.session_id)
            / "events.jsonl"
        )

    def _queue_files(self) -> list[Path]:
        if self.root is None:
            return [self.path] if self.path.exists() else []

        queue_files: list[Path] = []
        if LEGACY_QUEUE_PATH.exists():
            queue_files.append(LEGACY_QUEUE_PATH)
        if self.root.exists():
            queue_files.extend(sorted(self.root.glob("*/*/events.jsonl")))
        return queue_files

    def _ack_file(self, queue_file: Path, event_ids: set[str]) -> None:
        if not queue_file.exists():
            return

        remaining: list[str] = []
        with queue_file.open("r", encoding="utf-8") as file:
            for line in file:
                if not line.strip():
                    continue
                try:
                    event = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if not isinstance(event, dict):
                    continue
                if event.get("id") not in event_ids:
                    remaining.append(line)

        tmp_path = queue_file.with_suffix(f"{queue_file.suffix}.{uuid4()}.tmp")
        with tmp_path.open("w", encoding="utf-8") as file:
            file.writelines(remaining)
        tmp_path.replace(queue_file)

    @contextmanager
    def _locked(self):
        self.lock_path.parent.mkdir(parents=True, exist_ok=True)
        with self.lock_path.open("a", encoding="utf-8") as lock_file:
            if fcntl is not None:
                fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
            try:
                yield
            finally:
                if fcntl is not None:
                    fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)
