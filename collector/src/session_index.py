from __future__ import annotations

from contextlib import contextmanager
import json
import os
from pathlib import Path
from typing import Any

from events import BaseEvent, SupportedTool, utc_now_iso
from file_lock import locked_file
from secure_storage import open_private_text, write_private_text_atomic

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

    def is_ignored(self, tool: SupportedTool, external_session_id: str) -> bool:
        record = self.lookup(tool, external_session_id)
        return bool(record and record.get("ignored") is True)

    def ignore(
        self,
        tool: SupportedTool,
        external_session_id: str,
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
                "cwd": cwd or existing_cwd,
                "ignored": True,
                "updated_at": utc_now_iso(),
            }
            self._write(records)

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
                "ignored": False,
                "updated_at": utc_now_iso(),
            }
            self._write(records)

    def _key(self, tool: SupportedTool, external_session_id: str) -> str:
        return f"{tool}:{external_session_id}"

    @contextmanager
    def _locked(self):
        with locked_file(self.lock_path):
            yield

    def _read(self) -> dict[str, Any]:
        if not self.path.exists():
            return {}

        try:
            with open_private_text(self.path, "r") as file:
                payload = json.load(file)
        except (OSError, json.JSONDecodeError):
            return {}

        return payload if isinstance(payload, dict) else {}

    def _write(self, records: dict[str, Any]) -> None:
        write_private_text_atomic(
            self.path,
            json.dumps(records, ensure_ascii=False),
        )
