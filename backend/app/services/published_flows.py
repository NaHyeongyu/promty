from __future__ import annotations

import re
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import desc, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.time import utc_now
from app.models.events import Event
from app.models.projects import Project
from app.models.published_flows import (
    PublishedFlow,
    PublishedFlowFile,
    PublishedFlowItem,
)
from app.models.sessions import Session as PromptSession
from app.models.users import User
from app.services.event_payload_security import (
    decrypt_event_payload,
)
from app.services.published_flow_access import (
    can_read_flow as _can_read_flow,
    flow_for_owner as _flow_for_owner,
    readable_flow_filter as _readable_flow_filter,
)
from app.services.published_flow_redaction import (
    normalize_tags as _normalize_tags,
    optional_redacted_text as _optional_redacted_text,
    redact_text as _redact_text,
)
from app.services.published_flow_serializers import (
    serialize_flow_detail,
    serialize_flow_summary,
)
from app.services.prompt_activity import (
    files_changed_by_prompt_from_events,
    patch_file_changes_by_prompt,
    payload_model as _payload_model,
    payload_prompt as _payload_prompt,
    response_payloads_by_prompt,
    string_or_none as _string_or_none,
    tool_label as _tool_label,
)

MAX_TITLE_LENGTH = 255
VALID_FLOW_STATUSES = {"archived", "draft", "published"}
VALID_CREATE_FLOW_STATUSES = {"draft", "published"}
VALID_FLOW_VISIBILITIES = {"private", "public", "unlisted"}

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
    return {
        prompt_event_id: {
            "response": _redact_text(_string_or_none(payload.get("response"))),
            "response_received_at": event.created_at,
        }
        for prompt_event_id, (event, payload) in response_payloads_by_prompt(
            events,
            payloads,
        ).items()
    }


def _prompt_file_changes(
    db: Session,
    *,
    events: list[Event],
    payloads: dict[UUID, dict[str, Any]],
    prompt_event_ids: set[str],
    project_id: UUID,
) -> dict[str, list[dict[str, Any]]]:
    prompt_event_uuids = [UUID(prompt_event_id) for prompt_event_id in prompt_event_ids]
    if not prompt_event_uuids:
        return {}

    prompt_changes = patch_file_changes_by_prompt(
        db,
        project_id=project_id,
        prompt_event_ids=prompt_event_uuids,
    )
    for prompt_event_id, changes in files_changed_by_prompt_from_events(
        events,
        payloads,
        existing_prompt_ids=set(prompt_changes),
        prompt_event_ids=prompt_event_ids,
    ).items():
        prompt_changes.setdefault(prompt_event_id, []).extend(changes)

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

    db.flush()

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
    db.flush()

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
    db.flush()
    return get_published_flow(db, flow_key=str(flow.id), current_user=current_user)


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
