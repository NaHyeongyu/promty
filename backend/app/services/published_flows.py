from __future__ import annotations

import hashlib
from pathlib import Path
import re
from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from fastapi import HTTPException, status
from sqlalchemy import desc, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core.config import settings
from app.core.encryption import maybe_decrypt_app_text_from_string
from app.models.code_change_patches import CodeChangePatch
from app.models.events import Event
from app.models.projects import Project
from app.models.published_flows import (
    PublishedFlow,
    PublishedFlowAsset,
    PublishedFlowFile,
    PublishedFlowItem,
)
from app.models.sessions import Session as PromptSession
from app.models.users import User
from app.services.event_payload_security import (
    CODE_CHANGE_PATCH_PURPOSE,
    decrypt_event_payload,
)

MAX_TAGS = 12
MAX_TAG_LENGTH = 40
MAX_TITLE_LENGTH = 255
VALID_FLOW_STATUSES = {"archived", "draft", "published"}
VALID_CREATE_FLOW_STATUSES = {"draft", "published"}
VALID_FLOW_VISIBILITIES = {"private", "public", "unlisted"}
ASSET_CONTENT_TYPES = {
    "image/gif": ".gif",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}

SECRET_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (
        re.compile(
            r"(?i)\b(api[_-]?key|authorization|password|secret|token)\b"
            r"(\s*[:=]\s*)(['\"]?)[^\s'\",;}]{8,}(['\"]?)"
        ),
        r"\1\2\3[redacted]\4",
    ),
    (re.compile(r"\bsk-[A-Za-z0-9_-]{16,}\b"), "[redacted-openai-key]"),
    (re.compile(r"\bghp_[A-Za-z0-9_]{20,}\b"), "[redacted-github-token]"),
    (re.compile(r"\bgithub_pat_[A-Za-z0-9_]{20,}\b"), "[redacted-github-token]"),
    (re.compile(r"/Users/[^/\s]+"), "/Users/[local-user]"),
    (re.compile(r"/home/[^/\s]+"), "/home/[local-user]"),
    (
        re.compile(r"(?i)\b([A-Z]:)[\\/]+Users[\\/]+[^\\/\s]+"),
        r"\1\\Users\\[local-user]",
    ),
)

LANGUAGE_BY_EXTENSION = {
    ".css": "CSS",
    ".go": "Go",
    ".html": "HTML",
    ".js": "JavaScript",
    ".json": "JSON",
    ".jsx": "React",
    ".md": "Markdown",
    ".py": "Python",
    ".rs": "Rust",
    ".sql": "SQL",
    ".swift": "Swift",
    ".ts": "TypeScript",
    ".tsx": "React",
    ".yml": "YAML",
    ".yaml": "YAML",
}


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _tool_label(tool: str | None) -> str | None:
    if tool is None:
        return None
    labels = {
        "claude-code": "Claude Code",
        "codex-cli": "Codex",
        "cursor": "Cursor",
        "gemini-cli": "Gemini CLI",
    }
    return labels.get(tool, tool)


def _payload_model(payload: dict[str, Any], tool: str) -> str:
    model = payload.get("model")
    return model if isinstance(model, str) and model else _tool_label(tool) or tool


def _payload_prompt(payload: dict[str, Any]) -> str:
    prompt = payload.get("prompt")
    if isinstance(prompt, str) and prompt.strip():
        return prompt.strip()
    return "Untitled prompt"


def _string_or_none(value: Any) -> str | None:
    return value if isinstance(value, str) and value else None


def _first_int(*values: Any) -> int | None:
    for value in values:
        if isinstance(value, int):
            return value
    return None


def _redact_text(value: str | None) -> str | None:
    if value is None:
        return None
    redacted = value
    for pattern, replacement in SECRET_PATTERNS:
        redacted = pattern.sub(replacement, redacted)
    return redacted


def _normalize_tags(tags: list[str]) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for tag in tags:
        value = tag.strip().strip("#").lower()
        if not value or value in seen:
            continue
        seen.add(value)
        normalized.append(value[:MAX_TAG_LENGTH])
        if len(normalized) >= MAX_TAGS:
            break
    return normalized


def _asset_root() -> Path:
    return Path(settings.published_flow_asset_root).expanduser().resolve()


def _asset_path(storage_key: str) -> Path:
    root = _asset_root()
    path = (root / storage_key).resolve()
    if root != path and root not in path.parents:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Published flow asset path is invalid",
        )
    return path


def _sniff_image_content_type(content: bytes) -> str | None:
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if content.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if content.startswith((b"GIF87a", b"GIF89a")):
        return "image/gif"
    if len(content) >= 12 and content.startswith(b"RIFF") and content[8:12] == b"WEBP":
        return "image/webp"
    return None


def _safe_file_name(value: str | None, content_type: str) -> str:
    fallback = f"image{ASSET_CONTENT_TYPES[content_type]}"
    if not value:
        return fallback
    name = Path(value).name.strip().replace("\x00", "")
    if not name or name in {".", ".."}:
        return fallback
    return name[:255]


def _markdown_alt_text(value: str | None, fallback: str) -> str:
    raw = (value or fallback).strip() or "Image"
    return raw.replace("\n", " ").replace("\r", " ").replace("[", "(").replace("]", ")")[:255]


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug[:MAX_TITLE_LENGTH] or "prompt-flow"


def _unique_slug(db: Session, title: str) -> str:
    base = _slugify(title)
    candidate = base
    suffix = 2
    while db.scalar(select(PublishedFlow.id).where(PublishedFlow.slug == candidate)):
        suffix_text = f"-{suffix}"
        candidate = f"{base[: MAX_TITLE_LENGTH - len(suffix_text)]}{suffix_text}"
        suffix += 1
    return candidate


def _language_from_path(path: str) -> str | None:
    lowered = path.lower()
    for extension, language in LANGUAGE_BY_EXTENSION.items():
        if lowered.endswith(extension):
            return language
    return None


def _file_changes_from_files_changed(payload: dict[str, Any]) -> list[dict[str, Any]]:
    changes = payload.get("changes")
    if isinstance(changes, list):
        file_changes: list[dict[str, Any]] = []
        for change in changes:
            if not isinstance(change, dict):
                continue
            path = change.get("path")
            if not isinstance(path, str) or not path:
                continue
            file_changes.append(
                {
                    "path": path,
                    "status": change.get("status")
                    if isinstance(change.get("status"), str)
                    else "changed",
                    "additions": _first_int(
                        change.get("additions"),
                        change.get("insertions_delta"),
                    ),
                    "deletions": _first_int(
                        change.get("deletions_delta"),
                        change.get("deletions"),
                    ),
                    "patch": change.get("patch") if isinstance(change.get("patch"), str) else None,
                }
            )
        if file_changes:
            return file_changes

    files = payload.get("files")
    if isinstance(files, list):
        return [
            {
                "path": path,
                "status": "changed",
                "additions": 0,
                "deletions": 0,
                "patch": None,
            }
            for path in files
            if isinstance(path, str) and path
        ]
    return []


def _file_change_from_patch(patch: CodeChangePatch) -> dict[str, Any]:
    return {
        "additions": patch.additions or 0,
        "deletions": patch.deletions or 0,
        "patch": maybe_decrypt_app_text_from_string(
            patch.patch,
            purpose=CODE_CHANGE_PATCH_PURPOSE,
        ),
        "path": patch.path,
        "status": patch.status,
    }


def _project_for_user(db: Session, project_id: UUID, user: User) -> Project:
    project = db.scalar(
        select(Project).where(Project.id == project_id, Project.owner_id == user.id)
    )
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )
    return project


def _session_for_project(db: Session, project_id: UUID, session_id: UUID) -> PromptSession:
    session = db.scalar(
        select(PromptSession).where(
            PromptSession.id == session_id,
            PromptSession.project_id == project_id,
        )
    )
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )
    return session


def _session_events(
    db: Session,
    *,
    project_id: UUID,
    session_id: UUID,
) -> tuple[list[Event], dict[UUID, dict[str, Any]]]:
    events = list(
        db.execute(
            select(Event)
            .where(Event.project_id == project_id, Event.session_id == session_id)
            .order_by(Event.created_at, Event.sequence)
        ).scalars()
    )
    return events, {
        event.id: decrypt_event_payload(event.event_type, event.payload) for event in events
    }


def _events_for_sessions(
    db: Session,
    *,
    project_id: UUID,
    session_ids: set[UUID],
) -> tuple[dict[UUID, list[Event]], dict[UUID, dict[str, Any]]]:
    if not session_ids:
        return {}, {}

    events = list(
        db.execute(
            select(Event)
            .where(Event.project_id == project_id, Event.session_id.in_(list(session_ids)))
            .order_by(Event.session_id, Event.created_at, Event.sequence)
        ).scalars()
    )
    events_by_session: dict[UUID, list[Event]] = {}
    payloads = {
        event.id: decrypt_event_payload(event.event_type, event.payload) for event in events
    }
    for event in events:
        events_by_session.setdefault(event.session_id, []).append(event)
    return events_by_session, payloads


def _prompt_responses(
    events: list[Event],
    payloads: dict[UUID, dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    prompt_responses: dict[str, dict[str, Any]] = {}
    prompt_by_turn: dict[str, str] = {}
    latest_prompt: Event | None = None

    for event in events:
        payload = payloads[event.id]
        if event.event_type == "PromptSubmitted":
            latest_prompt = event
            turn_id = payload.get("turn_id")
            if turn_id is not None:
                prompt_by_turn[str(turn_id)] = str(event.id)
            continue

        if event.event_type != "ResponseReceived":
            continue

        prompt_event_id = _string_or_none(payload.get("prompt_event_id"))
        if prompt_event_id is None:
            turn_id = payload.get("turn_id")
            if turn_id is not None:
                prompt_event_id = prompt_by_turn.get(str(turn_id))
        if prompt_event_id is None and latest_prompt is not None:
            prompt_event_id = str(latest_prompt.id)
        if prompt_event_id is not None:
            prompt_responses[prompt_event_id] = {
                "response": _redact_text(_string_or_none(payload.get("response"))),
                "response_received_at": event.created_at,
            }

    return prompt_responses


def _prompt_file_changes(
    db: Session,
    *,
    events: list[Event],
    payloads: dict[UUID, dict[str, Any]],
    prompt_event_ids: set[str],
    project_id: UUID,
) -> dict[str, list[dict[str, Any]]]:
    prompt_changes: dict[str, list[dict[str, Any]]] = {}
    prompt_event_uuids = [UUID(prompt_event_id) for prompt_event_id in prompt_event_ids]
    if not prompt_event_uuids:
        return prompt_changes

    patch_rows = list(
        db.execute(
            select(CodeChangePatch)
            .where(
                CodeChangePatch.project_id == project_id,
                CodeChangePatch.prompt_event_id.in_(prompt_event_uuids),
            )
            .order_by(CodeChangePatch.created_at, CodeChangePatch.path)
        ).scalars()
    )
    for patch in patch_rows:
        if patch.prompt_event_id is None:
            continue
        prompt_changes.setdefault(str(patch.prompt_event_id), []).append(
            _file_change_from_patch(patch)
        )

    for event in events:
        if event.event_type != "FilesChanged":
            continue
        payload = payloads[event.id]
        prompt_event_id = payload.get("prompt_event_id")
        if (
            not isinstance(prompt_event_id, str)
            or prompt_event_id not in prompt_event_ids
            or prompt_event_id in prompt_changes
        ):
            continue
        prompt_changes[prompt_event_id] = _file_changes_from_files_changed(payload)

    return prompt_changes


def _default_title(project: Project, selected_events: list[Event], payloads: dict[UUID, dict[str, Any]]) -> str:
    first_prompt = _payload_prompt(payloads[selected_events[0].id])
    first_line = first_prompt.splitlines()[0].strip()
    return f"{project.name}: {first_line}"[:MAX_TITLE_LENGTH]


def _default_summary(selected_events: list[Event], file_count: int) -> str:
    prompt_label = "prompt" if len(selected_events) == 1 else "prompts"
    file_label = "file" if file_count == 1 else "files"
    return (
        f"A {len(selected_events)}-{prompt_label} development flow with "
        f"{file_count} changed {file_label}."
    )


def _readable_flow_filter(current_user: User):
    return or_(
        PublishedFlow.author_id == current_user.id,
        (
            (PublishedFlow.status == "published")
            & (PublishedFlow.visibility.in_(["public", "unlisted"]))
        ),
    )


def _can_read_flow(flow: PublishedFlow, current_user: User) -> bool:
    if flow.author_id == current_user.id:
        return True
    return flow.status == "published" and flow.visibility in {"public", "unlisted"}


def _flow_by_key(db: Session, flow_key: str) -> PublishedFlow | None:
    try:
        flow_id = UUID(flow_key)
    except ValueError:
        flow_id = None

    statement = select(PublishedFlow)
    if flow_id is not None:
        statement = statement.where(PublishedFlow.id == flow_id)
    else:
        statement = statement.where(PublishedFlow.slug == flow_key)
    return db.scalar(statement)


def _flow_for_owner(db: Session, *, current_user: User, flow_key: str) -> PublishedFlow:
    flow = _flow_by_key(db, flow_key)
    if flow is None or flow.author_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Published flow not found",
        )
    return flow


def _optional_redacted_text(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return _redact_text(stripped) if stripped else None


def _apply_flow_status(flow: PublishedFlow, status_value: str) -> None:
    if status_value not in VALID_FLOW_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid status",
        )

    flow.status = status_value
    if status_value == "published" and flow.published_at is None:
        flow.published_at = utc_now()
    if status_value == "draft":
        flow.published_at = None


def create_published_flow(
    db: Session,
    *,
    context_summary: str | None,
    current_user: User,
    end_prompt_event_id: UUID | None,
    notes: str | None,
    prompt_event_ids: list[UUID] | None,
    project_id: UUID,
    session_id: UUID | None,
    start_prompt_event_id: UUID | None,
    status_value: str,
    summary: str | None,
    tags: list[str],
    title: str | None,
    visibility: str,
) -> dict[str, Any]:
    if visibility not in VALID_FLOW_VISIBILITIES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid visibility")
    if status_value not in VALID_CREATE_FLOW_STATUSES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid status")

    project = _project_for_user(db, project_id, current_user)
    session: PromptSession | None = None
    events: list[Event] = []
    payloads: dict[UUID, dict[str, Any]] = {}
    responses: dict[str, dict[str, Any]] = {}
    prompt_events: list[Event] = []
    selection_type = "project_collection"

    if prompt_event_ids:
        unique_prompt_ids = list(dict.fromkeys(prompt_event_ids))
        selected_prompt_rows = list(
            db.execute(
                select(Event).where(
                    Event.project_id == project.id,
                    Event.event_type == "PromptSubmitted",
                    Event.id.in_(unique_prompt_ids),
                )
            ).scalars()
        )
        prompt_by_id = {event.id: event for event in selected_prompt_rows}
        selected_events = [
            prompt_by_id[prompt_id]
            for prompt_id in unique_prompt_ids
            if prompt_id in prompt_by_id
        ]

        if len(selected_events) != len(unique_prompt_ids):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="One or more selected prompts were not found in this project",
            )

        session_ids = {
            event.session_id
            for event in selected_events
            if event.session_id is not None
        }
        events_by_session, payloads = _events_for_sessions(
            db,
            project_id=project.id,
            session_ids=session_ids,
        )
        for selected_session_id in session_ids:
            session_events = events_by_session.get(selected_session_id, [])
            events.extend(session_events)
            responses.update(_prompt_responses(session_events, payloads))
        for event in selected_events:
            if event.id not in payloads:
                payloads[event.id] = decrypt_event_payload(event.event_type, event.payload)

        start_event = selected_events[0]
        end_event = selected_events[-1]
        start_sequence = start_event.sequence
        end_sequence = end_event.sequence
    else:
        if session_id is None or start_prompt_event_id is None or end_prompt_event_id is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Select prompts from a session or provide selected prompt ids",
            )

        session = _session_for_project(db, project.id, session_id)
        events, payloads = _session_events(db, project_id=project.id, session_id=session.id)
        prompt_events = [
            event for event in events if event.event_type == "PromptSubmitted"
        ]
        prompt_by_id = {event.id: event for event in prompt_events}
        start_event = prompt_by_id.get(start_prompt_event_id)
        end_event = prompt_by_id.get(end_prompt_event_id)

        if start_event is None or end_event is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Prompt selection was not found in this session",
            )

        start_sequence = min(start_event.sequence, end_event.sequence)
        end_sequence = max(start_event.sequence, end_event.sequence)
        selected_events = [
            event
            for event in prompt_events
            if start_sequence <= event.sequence <= end_sequence
        ]
        responses = _prompt_responses(events, payloads)
        selection_type = (
            "session_range" if len(selected_events) != len(prompt_events) else "session"
        )

    if not selected_events:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Select at least one prompt to share",
        )

    prompt_event_ids = {str(event.id) for event in selected_events}
    file_changes = _prompt_file_changes(
        db,
        events=events,
        payloads=payloads,
        prompt_event_ids=prompt_event_ids,
        project_id=project.id,
    )
    distinct_files = {
        change["path"]
        for changes in file_changes.values()
        for change in changes
        if isinstance(change.get("path"), str)
    }
    file_count = len(distinct_files)
    flow_title = (title or _default_title(project, selected_events, payloads)).strip()
    if not flow_title:
        flow_title = _default_title(project, selected_events, payloads)
    flow_title = flow_title[:MAX_TITLE_LENGTH]
    flow_summary = (summary or _default_summary(selected_events, file_count)).strip()
    normalized_tags = _normalize_tags(tags)
    published_at = utc_now() if status_value == "published" else None
    selected_session_ids = {
        event.session_id for event in selected_events if event.session_id is not None
    }
    source_session_id = (
        session.id
        if session is not None
        else next(iter(selected_session_ids))
        if len(selected_session_ids) == 1
        else None
    )

    flow = PublishedFlow(
        author_id=current_user.id,
        context_summary=_redact_text(context_summary.strip()) if context_summary else None,
        end_sequence=end_sequence,
        file_count=file_count,
        metrics={"selection_type": selection_type},
        model_name=(
            session.model
            if session is not None and session.model
            else _payload_model(payloads[selected_events[0].id], selected_events[0].tool)
        ),
        notes=_redact_text(notes.strip()) if notes else None,
        prompt_count=len(selected_events),
        published_at=published_at,
        slug=_unique_slug(db, flow_title),
        source_end_event_id=end_event.id,
        source_project_id=project.id,
        source_session_id=source_session_id,
        source_start_event_id=start_event.id,
        start_sequence=start_sequence,
        status=status_value,
        summary=_redact_text(flow_summary) if flow_summary else None,
        tags=normalized_tags,
        title=flow_title,
        tool_name=(
            _tool_label(session.tool)
            if session is not None
            else _tool_label(selected_events[0].tool)
        ),
        visibility=visibility,
    )
    db.add(flow)
    db.flush()

    for index, event in enumerate(selected_events, start=1):
        payload = payloads[event.id]
        changes = file_changes.get(str(event.id), [])
        response = responses.get(str(event.id), {})
        db.add(
            PublishedFlowItem(
                files_changed=len({change["path"] for change in changes}),
                item_order=index,
                model_name=_payload_model(payload, event.tool),
                prompt_text=_redact_text(_payload_prompt(payload)) or "",
                published_flow_id=flow.id,
                response_received_at=response.get("response_received_at"),
                response_text=response.get("response"),
                sequence=event.sequence,
                source_event_id=event.id,
                submitted_at=event.created_at,
                tool_name=_tool_label(event.tool),
            )
        )
        for change in changes:
            path = change.get("path")
            if not isinstance(path, str) or not path:
                continue
            db.add(
                PublishedFlowFile(
                    additions=change.get("additions") or 0,
                    change_type=change.get("status") if isinstance(change.get("status"), str) else None,
                    deletions=change.get("deletions") or 0,
                    diff=_redact_text(change.get("patch") if isinstance(change.get("patch"), str) else None),
                    file_path=path,
                    language=_language_from_path(path),
                    published_flow_id=flow.id,
                    source_event_id=event.id,
                )
            )

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Published flow could not be created because it conflicts with existing data.",
        ) from exc

    saved_flow = get_published_flow(db, flow_key=str(flow.id), current_user=current_user)
    return saved_flow


def update_published_flow(
    db: Session,
    *,
    context_summary: str | None,
    current_user: User,
    fields: set[str],
    flow_key: str,
    notes: str | None,
    status_value: str | None,
    summary: str | None,
    tags: list[str] | None,
    title: str | None,
    visibility: str | None,
) -> dict[str, Any]:
    flow = _flow_for_owner(db, current_user=current_user, flow_key=flow_key)

    if "title" in fields:
        next_title = (title or "").strip()
        if not next_title:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Title is required",
            )
        flow.title = next_title[:MAX_TITLE_LENGTH]
    if "summary" in fields:
        flow.summary = _optional_redacted_text(summary)
    if "context_summary" in fields:
        flow.context_summary = _optional_redacted_text(context_summary)
    if "notes" in fields:
        flow.notes = _optional_redacted_text(notes)
    if "tags" in fields:
        flow.tags = _normalize_tags(tags or [])
    if "visibility" in fields:
        if visibility not in VALID_FLOW_VISIBILITIES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Invalid visibility",
            )
        flow.visibility = visibility
    if "status" in fields:
        if status_value is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Invalid status",
            )
        _apply_flow_status(flow, status_value)

    flow.updated_at = utc_now()
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Published flow could not be updated because it conflicts with existing data.",
        ) from exc

    return get_published_flow(db, flow_key=str(flow.id), current_user=current_user)


def archive_published_flow(
    db: Session,
    *,
    current_user: User,
    flow_key: str,
) -> dict[str, Any]:
    flow = _flow_for_owner(db, current_user=current_user, flow_key=flow_key)
    _apply_flow_status(flow, "archived")
    flow.updated_at = utc_now()
    db.commit()
    return get_published_flow(db, flow_key=str(flow.id), current_user=current_user)


def serialize_flow_asset(flow: PublishedFlow, asset: PublishedFlowAsset) -> dict[str, Any]:
    url = (
        f"{settings.api_public_url.rstrip('/')}"
        f"/api/published-flows/{flow.slug}/assets/{asset.id}"
    )
    alt_text = _markdown_alt_text(asset.alt_text, asset.file_name)
    return {
        "alt_text": asset.alt_text,
        "byte_size": asset.byte_size,
        "content_type": asset.content_type,
        "created_at": _iso(asset.created_at),
        "file_name": asset.file_name,
        "id": str(asset.id),
        "markdown": f"![{alt_text}]({url})",
        "sha256": asset.sha256,
        "url": url,
    }


def create_published_flow_asset(
    db: Session,
    *,
    alt_text: str | None,
    content: bytes,
    content_type: str | None,
    current_user: User,
    file_name: str | None,
    flow_key: str,
) -> dict[str, Any]:
    flow = _flow_for_owner(db, current_user=current_user, flow_key=flow_key)
    if flow.status == "archived":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Archived prompt flows cannot accept new assets",
        )

    max_bytes = max(settings.published_flow_asset_max_bytes, 1)
    if not content:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Image file is empty",
        )
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Image file must be {max_bytes} bytes or smaller",
        )

    detected_content_type = _sniff_image_content_type(content)
    if detected_content_type is None:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only PNG, JPEG, WEBP, and GIF images are supported",
        )
    declared_content_type = (content_type or "").split(";", 1)[0].strip().lower()
    expected_content_types = {detected_content_type, "application/octet-stream"}
    if detected_content_type == "image/jpeg":
        expected_content_types.add("image/jpg")
    if declared_content_type and declared_content_type not in expected_content_types:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Image content type does not match the uploaded file",
        )

    asset_id = uuid4()
    extension = ASSET_CONTENT_TYPES[detected_content_type]
    storage_key = f"{flow.id}/{asset_id}{extension}"
    path = _asset_path(storage_key)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)

    cleaned_alt_text = _optional_redacted_text(alt_text) if alt_text else None
    asset = PublishedFlowAsset(
        alt_text=cleaned_alt_text[:255] if cleaned_alt_text else None,
        author_id=current_user.id,
        byte_size=len(content),
        content_type=detected_content_type,
        file_name=_safe_file_name(file_name, detected_content_type),
        id=asset_id,
        published_flow_id=flow.id,
        sha256=hashlib.sha256(content).hexdigest(),
        storage_key=storage_key,
    )
    db.add(asset)
    flow.updated_at = utc_now()
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        try:
            path.unlink()
        except OSError:
            pass
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Image asset could not be saved because it conflicts with existing data.",
        ) from exc
    except Exception:
        db.rollback()
        try:
            path.unlink()
        except OSError:
            pass
        raise

    return serialize_flow_asset(flow, asset)


def get_published_flow_asset(
    db: Session,
    *,
    asset_id: UUID,
    current_user: User,
    flow_key: str,
) -> tuple[PublishedFlowAsset, Path]:
    flow = _flow_by_key(db, flow_key)
    if flow is None or not _can_read_flow(flow, current_user):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Published flow not found",
        )

    asset = db.scalar(
        select(PublishedFlowAsset).where(
            PublishedFlowAsset.id == asset_id,
            PublishedFlowAsset.published_flow_id == flow.id,
        )
    )
    if asset is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Image asset not found",
        )

    path = _asset_path(asset.storage_key)
    if not path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Image asset file not found",
        )
    return asset, path


def list_published_flows(
    db: Session,
    *,
    current_user: User,
    limit: int = 50,
    query: str | None = None,
) -> list[dict[str, Any]]:
    statement = (
        select(PublishedFlow)
        .options(selectinload(PublishedFlow.author))
        .where(_readable_flow_filter(current_user))
        .order_by(desc(PublishedFlow.published_at), desc(PublishedFlow.created_at))
        .limit(limit)
    )
    if query:
        lowered = f"%{query.strip().lower()}%"
        statement = statement.where(
            or_(
                func.lower(PublishedFlow.title).like(lowered),
                func.lower(PublishedFlow.summary).like(lowered),
            )
        )

    return [
        serialize_flow_summary(flow, current_user=current_user)
        for flow in db.execute(statement).scalars()
    ]


def get_published_flow(
    db: Session,
    *,
    current_user: User,
    flow_key: str,
) -> dict[str, Any]:
    flow_id: UUID | None = None
    try:
        flow_id = UUID(flow_key)
    except ValueError:
        flow_id = None

    statement = select(PublishedFlow).options(
        selectinload(PublishedFlow.assets),
        selectinload(PublishedFlow.author),
        selectinload(PublishedFlow.files),
        selectinload(PublishedFlow.items),
    )
    if flow_id is not None:
        statement = statement.where(PublishedFlow.id == flow_id)
    else:
        statement = statement.where(PublishedFlow.slug == flow_key)

    flow = db.scalar(statement)
    if flow is None or not _can_read_flow(flow, current_user):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Published flow not found",
        )

    return serialize_flow_detail(flow, current_user=current_user)


def serialize_flow_summary(flow: PublishedFlow, *, current_user: User) -> dict[str, Any]:
    return {
        "author": {
            "avatar_url": flow.author.avatar_url if flow.author else None,
            "id": str(flow.author_id) if flow.author_id else None,
            "username": flow.author.username if flow.author else "Unknown",
        },
        "created_at": _iso(flow.created_at),
        "file_count": flow.file_count,
        "id": str(flow.id),
        "is_owner": flow.author_id == current_user.id,
        "metrics": flow.metrics or {},
        "model_name": flow.model_name,
        "prompt_count": flow.prompt_count,
        "published_at": _iso(flow.published_at),
        "slug": flow.slug,
        "status": flow.status,
        "summary": flow.summary,
        "tags": flow.tags or [],
        "title": flow.title,
        "tool_name": flow.tool_name,
        "updated_at": _iso(flow.updated_at),
        "visibility": flow.visibility,
    }


def serialize_flow_detail(flow: PublishedFlow, *, current_user: User) -> dict[str, Any]:
    payload = serialize_flow_summary(flow, current_user=current_user)
    payload.update(
        {
            "context_summary": flow.context_summary,
            "end_sequence": flow.end_sequence,
            "assets": [
                serialize_flow_asset(flow, asset)
                for asset in flow.assets
            ],
            "files": [
                {
                    "additions": file.additions,
                    "change_type": file.change_type,
                    "deletions": file.deletions,
                    "diff": file.diff,
                    "file_path": file.file_path,
                    "id": str(file.id),
                    "is_included": file.is_included,
                    "language": file.language,
                    "source_event_id": str(file.source_event_id)
                    if file.source_event_id
                    else None,
                }
                for file in flow.files
            ],
            "items": [
                {
                    "files_changed": item.files_changed,
                    "id": str(item.id),
                    "is_included": item.is_included,
                    "item_order": item.item_order,
                    "model_name": item.model_name,
                    "prompt_text": item.prompt_text,
                    "response_received_at": _iso(item.response_received_at),
                    "response_text": item.response_text,
                    "sequence": item.sequence,
                    "source_event_id": str(item.source_event_id)
                    if item.source_event_id
                    else None,
                    "submitted_at": _iso(item.submitted_at),
                    "tool_name": item.tool_name,
                }
                for item in flow.items
            ],
            "notes": flow.notes,
            "source_project_id": str(flow.source_project_id)
            if flow.source_project_id
            else None,
            "source_session_id": str(flow.source_session_id)
            if flow.source_session_id
            else None,
            "source_start_event_id": str(flow.source_start_event_id)
            if flow.source_start_event_id
            else None,
            "source_end_event_id": str(flow.source_end_event_id)
            if flow.source_end_event_id
            else None,
            "start_sequence": flow.start_sequence,
        }
    )
    return payload
