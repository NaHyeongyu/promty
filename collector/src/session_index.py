from __future__ import annotations

from contextlib import contextmanager
import json
import os
from pathlib import Path
from typing import Any
from uuid import uuid4

from events import BaseEvent, SupportedTool, utc_now_iso

try:
    import fcntl
except ImportError:  # pragma: no cover - non-POSIX fallback
    fcntl = None

DEFAULT_SESSION_INDEX_PATH = Path(
    os.environ.get("PROMPTHUB_SESSION_INDEX_PATH", "~/.prompthub/session-index.json")
).expanduser()


class SessionIndex:
    def __init__(self, path: str | Path | None = None) -> None:
        self.path = Path(path).expanduser() if path else DEFAULT_SESSION_INDEX_PATH
        self.lock_path = self.path.with_suffix(f"{self.path.suffix}.lock")

    def lookup(self, tool: SupportedTool, external_session_id: str) -> dict[str, Any] | None:
        with self._locked():
            record = self._read().get(self._key(tool, external_session_id))
        return record if isinstance(record, dict) else None

    def observe(
        self,
        tool: SupportedTool,
        external_session_id: str,
        event: BaseEvent,
        cwd: str | None = None,
    ) -> None:
        with self._locked():
            records = self._read()
            key = self._key(tool, external_session_id)
            existing = records.get(key)
            existing_cwd = existing.get("cwd") if isinstance(existing, dict) else None
            records[key] = {
                "tool": tool,
                "external_session_id": external_session_id,
                "project_id": event.project_id,
                "session_id": event.session_id,
                "cwd": cwd or existing_cwd,
                "updated_at": utc_now_iso(),
            }
            self._write(records)

    def _key(self, tool: SupportedTool, external_session_id: str) -> str:
        return f"{tool}:{external_session_id}"

    @contextmanager
    def _locked(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.lock_path.open("a", encoding="utf-8") as lock_file:
            if fcntl is not None:
                fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
            try:
                yield
            finally:
                if fcntl is not None:
                    fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)

    def _read(self) -> dict[str, Any]:
        if not self.path.exists():
            return {}

        try:
            with self.path.open("r", encoding="utf-8") as file:
                payload = json.load(file)
        except (OSError, json.JSONDecodeError):
            return {}

        return payload if isinstance(payload, dict) else {}

    def _write(self, records: dict[str, Any]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = self.path.with_suffix(f"{self.path.suffix}.{uuid4()}.tmp")
        with tmp_path.open("w", encoding="utf-8") as file:
            json.dump(records, file, ensure_ascii=False)
        tmp_path.replace(self.path)
