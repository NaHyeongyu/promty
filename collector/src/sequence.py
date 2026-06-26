from __future__ import annotations

from contextlib import contextmanager
import json
import os
from pathlib import Path
from uuid import uuid4

from events import BaseEvent

try:
    import fcntl
except ImportError:  # pragma: no cover - non-POSIX fallback
    fcntl = None

DEFAULT_SEQUENCE_PATH = Path(
    os.environ.get("PROMPTHUB_SEQUENCE_PATH", "~/.prompthub/sequences.json")
).expanduser()


class SequenceStore:
    def __init__(self, path: str | Path | None = None) -> None:
        self.path = Path(path).expanduser() if path else DEFAULT_SEQUENCE_PATH
        self.lock_path = self.path.with_suffix(f"{self.path.suffix}.lock")

    def assign(self, event: BaseEvent) -> BaseEvent:
        with self._locked():
            if event.sequence > 0:
                self._observe(event.session_id, event.sequence)
                return event

            sequences = self._read()
            next_sequence = sequences.get(event.session_id, 0) + 1
            sequences[event.session_id] = next_sequence
            self._write(sequences)
            event.sequence = next_sequence
            return event

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

    def _observe(self, session_id: str, sequence: int) -> None:
        sequences = self._read()
        if sequences.get(session_id, 0) >= sequence:
            return
        sequences[session_id] = sequence
        self._write(sequences)

    def _read(self) -> dict[str, int]:
        if not self.path.exists():
            return {}

        with self.path.open("r", encoding="utf-8") as file:
            payload = json.load(file)

        if not isinstance(payload, dict):
            return {}

        return {
            key: value
            for key, value in payload.items()
            if isinstance(key, str) and isinstance(value, int)
        }

    def _write(self, sequences: dict[str, int]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = self.path.with_suffix(f"{self.path.suffix}.{uuid4()}.tmp")
        with tmp_path.open("w", encoding="utf-8") as file:
            json.dump(sequences, file, ensure_ascii=False)
        tmp_path.replace(self.path)
