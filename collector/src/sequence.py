from __future__ import annotations

from contextlib import contextmanager
import json
import os
from pathlib import Path

from events import BaseEvent
from file_lock import locked_file
from secure_storage import open_private_text, write_private_text_atomic

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
        with locked_file(self.lock_path):
            yield

    def _observe(self, session_id: str, sequence: int) -> None:
        sequences = self._read()
        if sequences.get(session_id, 0) >= sequence:
            return
        sequences[session_id] = sequence
        self._write(sequences)

    def _read(self) -> dict[str, int]:
        if not self.path.exists():
            return {}

        with open_private_text(self.path, "r") as file:
            payload = json.load(file)

        if not isinstance(payload, dict):
            return {}

        return {
            key: value
            for key, value in payload.items()
            if isinstance(key, str) and isinstance(value, int)
        }

    def _write(self, sequences: dict[str, int]) -> None:
        write_private_text_atomic(
            self.path,
            json.dumps(sequences, ensure_ascii=False),
        )
