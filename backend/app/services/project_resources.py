from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session as DBSession

from app.core.encryption import encrypt_app_text_to_string
from app.models.code_change_patches import CodeChangePatch
from app.models.events import Event
from app.models.project_files import ProjectFile
from app.services.event_payload_security import CODE_CHANGE_PATCH_PURPOSE


def _clean_path(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    path = value.strip().replace("\\", "/")
    if not path or path.startswith("/"):
        return None
    parts = [part for part in path.split("/") if part and part not in {".", ".."}]
    if not parts:
        return None
    return "/".join(parts)[:2048]


def _status(value: Any) -> str:
    if not isinstance(value, str) or not value:
        return "modified"
    normalized = value.strip().lower()
    if normalized in {"added", "modified", "deleted", "renamed", "cleaned"}:
        return normalized
    return "modified"


def _int_or_none(value: Any) -> int | None:
    return value if isinstance(value, int) else None


def _uuid_or_none(value: Any) -> UUID | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        return UUID(value)
    except ValueError:
        return None


def _patch_metadata(change: dict[str, Any]) -> dict[str, Any]:
    excluded = {
        "path",
        "old_path",
        "before_path",
        "status",
        "additions",
        "insertions_delta",
        "deletions",
        "deletions_delta",
        "removals",
        "patch",
        "patch_truncated",
        "binary",
    }
    return {
        key: value
        for key, value in change.items()
        if key not in excluded and value is not None
    }


def _resource_metadata(change: dict[str, Any]) -> dict[str, Any]:
    return {
        key: value
        for key, value in change.items()
        if key not in {"path", "patch"} and value is not None
    }


def _changes_from_payload(payload: dict[str, Any]) -> list[dict[str, Any]]:
    changes = payload.get("changes")
    if isinstance(changes, list):
        entries = [change for change in changes if isinstance(change, dict)]
        if entries:
            return entries

    files = payload.get("files")
    if isinstance(files, list):
        return [{"path": path, "status": "modified"} for path in files]
    return []


def _create_code_change_patch(
    db: DBSession,
    *,
    event: Event,
    path: str,
    status: str,
    change: dict[str, Any],
    prompt_event_id: UUID | None,
) -> None:
    patch = change.get("patch")
    old_path = change.get("old_path") or change.get("before_path")
    additions = _int_or_none(change.get("additions"))
    if additions is None:
        additions = _int_or_none(change.get("insertions_delta"))
    deletions = _int_or_none(change.get("deletions_delta"))
    if deletions is None:
        deletions = _int_or_none(change.get("deletions"))

    db.add(
        CodeChangePatch(
            project_id=event.project_id,
            session_id=event.session_id,
            event_id=event.id,
            prompt_event_id=prompt_event_id,
            path=path,
            old_path=old_path if isinstance(old_path, str) and old_path else None,
            status=status,
            additions=additions,
            deletions=deletions,
            patch=encrypt_app_text_to_string(patch, purpose=CODE_CHANGE_PATCH_PURPOSE)
            if isinstance(patch, str) and patch
            else None,
            patch_truncated=change.get("patch_truncated") is True,
            binary=change.get("binary") is True,
            metadata_=_patch_metadata(change),
            created_at=event.created_at,
        )
    )


def _upsert_project_file(
    db: DBSession,
    *,
    event: Event,
    path: str,
    status: str,
    metadata: dict[str, Any],
) -> None:
    project_file = db.scalar(
        select(ProjectFile).where(
            ProjectFile.project_id == event.project_id,
            ProjectFile.path == path,
        )
    )
    if project_file is None:
        if status == "deleted":
            return
        project_file = ProjectFile(
            project_id=event.project_id,
            path=path,
            kind="file",
        )
        db.add(project_file)
        db.flush()

    project_file.last_event_id = event.id
    project_file.status = "deleted" if status == "deleted" else "active"
    project_file.metadata_ = metadata
    project_file.changed_at = event.created_at


def sync_project_resources_from_event(db: DBSession, event: Event, payload: dict[str, Any]) -> None:
    if event.event_type != "FilesChanged":
        return

    prompt_event_id = _uuid_or_none(payload.get("prompt_event_id"))
    for change in _changes_from_payload(payload):
        path = _clean_path(change.get("path"))
        if path is None:
            continue
        status = _status(change.get("status"))
        metadata = _resource_metadata(change)
        _upsert_project_file(
            db,
            event=event,
            path=path,
            status=status,
            metadata=metadata,
        )
        _create_code_change_patch(
            db,
            event=event,
            path=path,
            status=status,
            change=change,
            prompt_event_id=prompt_event_id,
        )
