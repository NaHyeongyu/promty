from __future__ import annotations

from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import subprocess
from typing import Any
from uuid import uuid4

from events import BaseEvent
from git_context import normalize_github_url
from payloads import TURN_ID_KEYS, get_first_value

try:
    import fcntl
except ImportError:  # pragma: no cover - non-POSIX fallback
    fcntl = None

DEFAULT_CHANGE_BASELINE_PATH = Path(
    os.environ.get("PROMPTHUB_CHANGE_BASELINE_PATH", "~/.prompthub/change-baselines.json")
).expanduser()
GIT_TIMEOUT_SECONDS = float(os.environ.get("PROMPTHUB_GIT_TIMEOUT", "5"))
FINGERPRINT_MAX_BYTES = int(os.environ.get("PROMPTHUB_FINGERPRINT_MAX_BYTES", "2097152"))
UNTRACKED_LINE_COUNT_MAX_BYTES = int(
    os.environ.get("PROMPTHUB_UNTRACKED_LINE_COUNT_MAX_BYTES", "1048576")
)
BASELINE_TTL_HOURS = float(os.environ.get("PROMPTHUB_BASELINE_TTL_HOURS", "24"))
CONSUMED_BASELINE_TTL_HOURS = float(
    os.environ.get("PROMPTHUB_CONSUMED_BASELINE_TTL_HOURS", "1")
)
BASELINE_MAX_RECORDS = int(os.environ.get("PROMPTHUB_BASELINE_MAX_RECORDS", "500"))


@dataclass(slots=True)
class ChangeDetectionResult:
    baseline: dict[str, Any]
    current: dict[str, Any]
    payload: dict[str, Any]


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_datetime(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed


def _run_git(args: list[str], cwd: str | Path, timeout: float = GIT_TIMEOUT_SECONDS) -> str | None:
    try:
        result = subprocess.run(
            ["git", *args],
            cwd=str(cwd),
            check=False,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None

    if result.returncode != 0:
        return None
    return result.stdout


def resolve_git_root(cwd: str | Path | None) -> str | None:
    start = Path(cwd or os.getcwd()).expanduser()
    output = _run_git(["rev-parse", "--show-toplevel"], start)
    if output is None:
        return None
    return output.strip() or None


def _parse_num(value: str) -> int | None:
    if value == "-":
        return None
    try:
        return int(value)
    except ValueError:
        return None


def _parse_numstat(output: str | None) -> dict[str, dict[str, Any]]:
    if not output:
        return {}

    entries: dict[str, dict[str, Any]] = {}
    for line in output.splitlines():
        parts = line.split("\t")
        if len(parts) < 3:
            continue
        insertions = _parse_num(parts[0])
        deletions = _parse_num(parts[1])
        path = parts[-1]
        entries[path] = {
            "insertions": insertions,
            "deletions": deletions,
            "binary": insertions is None or deletions is None,
        }
    return entries


def _parse_status(output: str | None) -> dict[str, dict[str, Any]]:
    if not output:
        return {}

    entries: dict[str, dict[str, Any]] = {}
    for line in output.splitlines():
        if len(line) < 4:
            continue
        code = line[:2]
        path = line[3:]
        old_path = None
        if " -> " in path:
            old_path, path = path.split(" -> ", 1)
        entries[path] = {
            "code": code,
            "old_path": old_path,
        }
    return entries


def _file_fingerprint(path: Path) -> dict[str, Any] | None:
    if not path.exists() or not path.is_file():
        return None

    try:
        stat = path.stat()
    except OSError:
        return None

    fingerprint: dict[str, Any] = {
        "size": stat.st_size,
    }
    if stat.st_size > FINGERPRINT_MAX_BYTES:
        fingerprint["mtime_ns"] = stat.st_mtime_ns
        fingerprint["truncated"] = True
        return fingerprint

    try:
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
    except OSError:
        return fingerprint

    fingerprint["sha256"] = digest
    return fingerprint


def _count_text_lines(path: Path) -> int | None:
    try:
        stat = path.stat()
    except OSError:
        return None

    if stat.st_size > UNTRACKED_LINE_COUNT_MAX_BYTES:
        return None

    try:
        data = path.read_bytes()
    except OSError:
        return None

    if b"\0" in data:
        return None
    if not data:
        return 0
    return data.count(b"\n") + (0 if data.endswith(b"\n") else 1)


def capture_git_snapshot(cwd: str | Path | None) -> dict[str, Any] | None:
    git_root = resolve_git_root(cwd)
    if git_root is None:
        return None

    status = _parse_status(
        _run_git(["status", "--porcelain=v1", "--untracked-files=all"], git_root)
    )
    numstat = _parse_numstat(_run_git(["diff", "--numstat", "HEAD", "--"], git_root))
    signatures: dict[str, dict[str, Any] | None] = {}

    for path, entry in status.items():
        signatures[path] = _file_fingerprint(Path(git_root) / path)
        if entry.get("code") == "??" and path not in numstat:
            line_count = _count_text_lines(Path(git_root) / path)
            numstat[path] = {
                "insertions": line_count,
                "deletions": 0 if line_count is not None else None,
                "binary": line_count is None,
            }

    return {
        "git_root": git_root,
        "head_commit": (_run_git(["rev-parse", "HEAD"], git_root) or "").strip() or None,
        "branch": (_run_git(["branch", "--show-current"], git_root) or "").strip() or None,
        "git_remote": (_run_git(["remote", "get-url", "origin"], git_root) or "").strip() or None,
        "status": status,
        "numstat": numstat,
        "signatures": signatures,
        "captured_at": utc_now_iso(),
    }


def _status_from_code(code: str | None, baseline_present: bool) -> str:
    if code is None:
        return "cleaned" if baseline_present else "modified"
    if code == "??":
        return "added"
    if "R" in code:
        return "renamed"
    if "D" in code:
        return "deleted"
    if "A" in code:
        return "added"
    return "modified"


def _metric_delta(
    current: dict[str, Any] | None,
    baseline: dict[str, Any] | None,
    key: str,
) -> int | None:
    current_value = (current or {}).get(key)
    baseline_value = (baseline or {}).get(key)
    if current_value is None and baseline_value is None:
        return None
    return (current_value or 0) - (baseline_value or 0)


def _changed_paths(
    baseline_snapshot: dict[str, Any],
    current_snapshot: dict[str, Any],
) -> list[dict[str, Any]]:
    baseline_status = baseline_snapshot.get("status") or {}
    current_status = current_snapshot.get("status") or {}
    baseline_numstat = baseline_snapshot.get("numstat") or {}
    current_numstat = current_snapshot.get("numstat") or {}
    baseline_signatures = baseline_snapshot.get("signatures") or {}
    current_signatures = current_snapshot.get("signatures") or {}
    paths = sorted(
        set(baseline_status)
        | set(current_status)
        | set(baseline_numstat)
        | set(current_numstat)
        | set(baseline_signatures)
        | set(current_signatures)
    )

    changes: list[dict[str, Any]] = []
    for path in paths:
        before_status = baseline_status.get(path)
        after_status = current_status.get(path)
        before_numstat = baseline_numstat.get(path)
        after_numstat = current_numstat.get(path)
        before_signature = baseline_signatures.get(path)
        after_signature = current_signatures.get(path)

        if (
            before_status == after_status
            and before_numstat == after_numstat
            and before_signature == after_signature
        ):
            continue

        insertions_delta = _metric_delta(after_numstat, before_numstat, "insertions")
        deletions_delta = _metric_delta(after_numstat, before_numstat, "deletions")
        change = {
            "path": path,
            "status": _status_from_code(
                (after_status or {}).get("code"),
                baseline_present=before_status is not None or before_numstat is not None,
            ),
            "old_path": (after_status or before_status or {}).get("old_path"),
            "before_path": (after_status or before_status or {}).get("old_path"),
            "git_status": (after_status or {}).get("code"),
            "insertions": (after_numstat or {}).get("insertions"),
            "deletions": (after_numstat or {}).get("deletions"),
            "insertions_delta": insertions_delta,
            "deletions_delta": deletions_delta,
            "additions": insertions_delta,
            "binary": bool((after_numstat or {}).get("binary")),
        }
        if deletions_delta is not None:
            change["removals"] = deletions_delta
        changes.append({key: value for key, value in change.items() if value is not None})

    return changes


def _summarize_changes(changes: list[dict[str, Any]]) -> dict[str, Any]:
    summary = {
        "total": len(changes),
        "files_changed": len(changes),
        "files": len(changes),
        "added": 0,
        "modified": 0,
        "deleted": 0,
        "renamed": 0,
        "cleaned": 0,
        "additions": 0,
        "deletions": 0,
        "insertions_delta": 0,
        "deletions_delta": 0,
    }

    for change in changes:
        status = change.get("status")
        if status in summary:
            summary[status] += 1
        additions = change.get("insertions_delta") or 0
        deletions = change.get("deletions_delta") or 0
        summary["additions"] += additions
        summary["deletions"] += deletions
        summary["insertions_delta"] += additions
        summary["deletions_delta"] += deletions
    return summary


def detect_changes(record: dict[str, Any], cwd: str | Path | None = None) -> ChangeDetectionResult | None:
    baseline_snapshot = record.get("snapshot")
    if not isinstance(baseline_snapshot, dict):
        return None

    current_snapshot = capture_git_snapshot(cwd or record.get("cwd") or baseline_snapshot.get("git_root"))
    if current_snapshot is None:
        return None

    if current_snapshot.get("git_root") != baseline_snapshot.get("git_root"):
        return None

    changes = _changed_paths(baseline_snapshot, current_snapshot)
    if not changes:
        return None

    payload = {
        "files": [change["path"] for change in changes],
        "cwd": record.get("cwd"),
        "session_id": record.get("external_session_id"),
        "prompt_event_id": record.get("prompt_event_id"),
        "turn_id": record.get("turn_id"),
        "git_root": baseline_snapshot.get("git_root"),
        "branch": current_snapshot.get("branch") or baseline_snapshot.get("branch"),
        "git_remote": current_snapshot.get("git_remote") or baseline_snapshot.get("git_remote"),
        "github_url": normalize_github_url(
            current_snapshot.get("git_remote") or baseline_snapshot.get("git_remote")
        ),
        "base_commit": baseline_snapshot.get("head_commit"),
        "head_commit": current_snapshot.get("head_commit"),
        "baseline_captured_at": baseline_snapshot.get("captured_at"),
        "detected_at": current_snapshot.get("captured_at"),
        "source": "git",
        "summary": _summarize_changes(changes),
        "changes": changes,
    }
    return ChangeDetectionResult(
        baseline=record,
        current=current_snapshot,
        payload={key: value for key, value in payload.items() if value is not None},
    )


class ChangeBaselineStore:
    def __init__(self, path: str | Path | None = None) -> None:
        self.path = Path(path).expanduser() if path else DEFAULT_CHANGE_BASELINE_PATH
        self.lock_path = self.path.with_suffix(f"{self.path.suffix}.lock")

    def observe_prompt(
        self,
        *,
        tool: str,
        event: BaseEvent,
        raw_payload: dict[str, Any],
        external_session_id: str | None,
        cwd: str | None,
    ) -> None:
        snapshot = capture_git_snapshot(cwd)
        if snapshot is None:
            return

        record = {
            "id": event.id,
            "tool": tool,
            "prompt_event_id": event.id,
            "project_id": event.project_id,
            "session_id": event.session_id,
            "external_session_id": external_session_id,
            "turn_id": get_first_value(raw_payload, TURN_ID_KEYS),
            "cwd": cwd,
            "created_at": utc_now_iso(),
            "consumed_at": None,
            "snapshot": snapshot,
        }
        with self._locked():
            data = self._read()
            data.setdefault("records", {})[event.id] = record
            self._prune(data)
            self._write(data)

    def find_latest(
        self,
        *,
        tool: str,
        external_session_id: str | None,
        cwd: str | None,
    ) -> dict[str, Any] | None:
        git_root = resolve_git_root(cwd) if cwd else None
        with self._locked():
            records = list((self._read().get("records") or {}).values())

        candidates: list[dict[str, Any]] = []
        for record in records:
            if not isinstance(record, dict) or record.get("consumed_at"):
                continue
            if record.get("tool") != tool:
                continue
            if external_session_id and record.get("external_session_id") == external_session_id:
                candidates.append(record)
                continue
            record_git_root = ((record.get("snapshot") or {}).get("git_root"))
            if git_root and record_git_root == git_root:
                candidates.append(record)

        candidates.sort(key=lambda record: str(record.get("created_at") or ""))
        return candidates[-1] if candidates else None

    def mark_consumed(self, record_id: str) -> None:
        with self._locked():
            data = self._read()
            record = (data.get("records") or {}).get(record_id)
            if isinstance(record, dict):
                record["consumed_at"] = utc_now_iso()
                self._prune(data)
                self._write(data)

    def _prune(self, data: dict[str, Any]) -> None:
        records = data.get("records")
        if not isinstance(records, dict):
            data["records"] = {}
            return

        now = datetime.now(timezone.utc)
        baseline_cutoff = now - timedelta(hours=BASELINE_TTL_HOURS)
        consumed_cutoff = now - timedelta(hours=CONSUMED_BASELINE_TTL_HOURS)

        retained: list[tuple[str, dict[str, Any], datetime]] = []
        for record_id, record in records.items():
            if not isinstance(record_id, str) or not isinstance(record, dict):
                continue
            created_at = _parse_datetime(record.get("created_at")) or now
            consumed_at = _parse_datetime(record.get("consumed_at"))
            if consumed_at is not None and consumed_at < consumed_cutoff:
                continue
            if consumed_at is None and created_at < baseline_cutoff:
                continue
            retained.append((record_id, record, created_at))

        retained.sort(key=lambda item: item[2])
        if len(retained) > BASELINE_MAX_RECORDS:
            retained = retained[-BASELINE_MAX_RECORDS:]
        data["records"] = {record_id: record for record_id, record, _ in retained}

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
            return {"records": {}}
        try:
            with self.path.open("r", encoding="utf-8") as file:
                data = json.load(file)
        except (OSError, json.JSONDecodeError):
            return {"records": {}}
        if not isinstance(data, dict):
            return {"records": {}}
        data.setdefault("records", {})
        return data

    def _write(self, data: dict[str, Any]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = self.path.with_suffix(f"{self.path.suffix}.{uuid4()}.tmp")
        with tmp_path.open("w", encoding="utf-8") as file:
            json.dump(data, file, ensure_ascii=False)
        tmp_path.replace(self.path)
