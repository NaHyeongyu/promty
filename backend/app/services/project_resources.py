from __future__ import annotations

from pathlib import PurePosixPath
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session as DBSession

from app.models.events import Event
from app.models.project_files import ProjectFile
from app.models.project_knowledge import ProjectKnowledgeResource

KNOWLEDGE_KEYWORDS: tuple[tuple[str, str], ...] = (
    ("architecture", "Architecture"),
    ("design", "Design"),
    ("rules", "Rules"),
    ("guidelines", "Rules"),
    ("context", "Context"),
    ("memory", "Memory"),
)
RULE_FILE_NAMES = {"agents.md", "claude.md", ".cursorrules"}


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


def _file_type(path: str) -> str:
    suffix = PurePosixPath(path).suffix.lower()
    if suffix == ".md":
        return "Markdown"
    if suffix in {".json", ".jsonl"}:
        return "JSON"
    if suffix in {".txt", ".log"}:
        return "Text"
    if suffix in {".yml", ".yaml", ".toml"}:
        return "Config"
    if suffix:
        return suffix.lstrip(".").upper()
    return "Document"


def _knowledge_title(path: str) -> tuple[str, str] | None:
    posix_path = PurePosixPath(path)
    name = posix_path.name
    lower_name = name.lower()
    lower_path = path.lower()

    if lower_name.startswith("readme"):
        return name, "readme"
    if lower_name in RULE_FILE_NAMES:
        return "Rules", "rules"
    for keyword, title in KNOWLEDGE_KEYWORDS:
        if keyword in lower_path:
            return title, keyword if keyword != "guidelines" else "rules"
    return None


def _status(value: Any) -> str:
    if not isinstance(value, str) or not value:
        return "modified"
    normalized = value.strip().lower()
    if normalized in {"added", "modified", "deleted", "renamed", "cleaned"}:
        return normalized
    return "modified"


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


def _upsert_knowledge_resource(
    db: DBSession,
    *,
    event: Event,
    path: str,
    status: str,
    metadata: dict[str, Any],
) -> None:
    knowledge = _knowledge_title(path)
    if knowledge is None:
        return

    title, category = knowledge
    resource = db.scalar(
        select(ProjectKnowledgeResource).where(
            ProjectKnowledgeResource.project_id == event.project_id,
            ProjectKnowledgeResource.title == title,
        )
    )
    if resource is None:
        if status == "deleted":
            return
        resource = ProjectKnowledgeResource(
            project_id=event.project_id,
            title=title,
            category=category,
            file_type=_file_type(path),
            source_path=path,
        )
        db.add(resource)
        db.flush()

    resource.last_event_id = event.id
    resource.file_type = _file_type(path)
    resource.category = category
    resource.source_path = path
    resource.status = "deleted" if status == "deleted" else "active"
    resource.metadata_ = metadata
    resource.updated_at = event.created_at


def sync_project_resources_from_event(db: DBSession, event: Event, payload: dict[str, Any]) -> None:
    if event.event_type != "FilesChanged":
        return

    for change in _changes_from_payload(payload):
        path = _clean_path(change.get("path"))
        if path is None:
            continue
        status = _status(change.get("status"))
        metadata = {
            key: value
            for key, value in change.items()
            if key not in {"path"} and value is not None
        }
        _upsert_project_file(
            db,
            event=event,
            path=path,
            status=status,
            metadata=metadata,
        )
        _upsert_knowledge_resource(
            db,
            event=event,
            path=path,
            status=status,
            metadata=metadata,
        )
