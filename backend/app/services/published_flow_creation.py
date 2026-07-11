from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

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
from app.services.event_payload_security import decrypt_event_payload
from app.services.projects.activity import (
    files_changed_by_prompt_from_events,
    patch_file_changes_by_prompt,
    payload_model,
    payload_prompt,
    response_payloads_by_prompt,
    string_or_none,
    tool_label,
)
from app.services.published_flow_constants import (
    MAX_TITLE_LENGTH,
    VALID_CREATE_FLOW_STATUSES,
    VALID_FLOW_VISIBILITIES,
)
from app.services.published_flow_redaction import (
    normalize_tags,
    redact_text,
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


@dataclass
class FlowPromptSelection:
    end_event: Event
    end_sequence: int
    events: list[Event]
    payloads: dict[UUID, dict[str, Any]]
    responses: dict[str, dict[str, Any]]
    selected_events: list[Event]
    selection_type: str
    session: PromptSession | None
    start_event: Event
    start_sequence: int


def _slugify(value: str) -> str:
    import re

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
            "response": redact_text(string_or_none(payload.get("response"))),
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


def _default_title(
    project: Project,
    selected_events: list[Event],
    payloads: dict[UUID, dict[str, Any]],
) -> str:
    first_prompt = payload_prompt(payloads[selected_events[0].id])
    first_line = first_prompt.splitlines()[0].strip()
    return f"{project.name}: {first_line}"[:MAX_TITLE_LENGTH]


def _default_summary(selected_events: list[Event], file_count: int) -> str:
    prompt_label = "prompt" if len(selected_events) == 1 else "prompts"
    file_label = "file" if file_count == 1 else "files"
    return (
        f"A {len(selected_events)}-{prompt_label} development flow with "
        f"{file_count} changed {file_label}."
    )


def _validate_create_request(*, status_value: str, visibility: str) -> None:
    if visibility not in VALID_FLOW_VISIBILITIES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid visibility",
        )
    if status_value not in VALID_CREATE_FLOW_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid status",
        )


def _selected_prompts_by_ids(
    db: Session,
    *,
    project_id: UUID,
    prompt_event_ids: list[UUID],
) -> FlowPromptSelection:
    unique_prompt_ids = list(dict.fromkeys(prompt_event_ids))
    selected_prompt_rows = list(
        db.execute(
            select(Event).where(
                Event.project_id == project_id,
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
        event.session_id for event in selected_events if event.session_id is not None
    }
    events_by_session, payloads = _events_for_sessions(
        db,
        project_id=project_id,
        session_ids=session_ids,
    )
    events: list[Event] = []
    responses: dict[str, dict[str, Any]] = {}
    for selected_session_id in session_ids:
        session_events = events_by_session.get(selected_session_id, [])
        events.extend(session_events)
        responses.update(_prompt_responses(session_events, payloads))
    for event in selected_events:
        if event.id not in payloads:
            payloads[event.id] = decrypt_event_payload(event.event_type, event.payload)

    start_event = selected_events[0]
    end_event = selected_events[-1]
    return FlowPromptSelection(
        end_event=end_event,
        end_sequence=end_event.sequence,
        events=events,
        payloads=payloads,
        responses=responses,
        selected_events=selected_events,
        selection_type="project_collection",
        session=None,
        start_event=start_event,
        start_sequence=start_event.sequence,
    )


def _selected_prompts_by_session_range(
    db: Session,
    *,
    end_prompt_event_id: UUID,
    project_id: UUID,
    session_id: UUID,
    start_prompt_event_id: UUID,
) -> FlowPromptSelection:
    session = _session_for_project(db, project_id, session_id)
    events, payloads = _session_events(db, project_id=project_id, session_id=session.id)
    prompt_events = [event for event in events if event.event_type == "PromptSubmitted"]
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
        event for event in prompt_events if start_sequence <= event.sequence <= end_sequence
    ]
    return FlowPromptSelection(
        end_event=end_event,
        end_sequence=end_sequence,
        events=events,
        payloads=payloads,
        responses=_prompt_responses(events, payloads),
        selected_events=selected_events,
        selection_type="session_range"
        if len(selected_events) != len(prompt_events)
        else "session",
        session=session,
        start_event=start_event,
        start_sequence=start_sequence,
    )


def _select_prompts(
    db: Session,
    *,
    end_prompt_event_id: UUID | None,
    project_id: UUID,
    prompt_event_ids: list[UUID] | None,
    session_id: UUID | None,
    start_prompt_event_id: UUID | None,
) -> FlowPromptSelection:
    if prompt_event_ids:
        return _selected_prompts_by_ids(
            db,
            project_id=project_id,
            prompt_event_ids=prompt_event_ids,
        )

    if session_id is None or start_prompt_event_id is None or end_prompt_event_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Select prompts from a session or provide selected prompt ids",
        )
    return _selected_prompts_by_session_range(
        db,
        end_prompt_event_id=end_prompt_event_id,
        project_id=project_id,
        session_id=session_id,
        start_prompt_event_id=start_prompt_event_id,
    )


def _source_session_id(selection: FlowPromptSelection) -> UUID | None:
    if selection.session is not None:
        return selection.session.id

    selected_session_ids = {
        event.session_id
        for event in selection.selected_events
        if event.session_id is not None
    }
    if len(selected_session_ids) == 1:
        return next(iter(selected_session_ids))
    return None


def create_published_flow_record(
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
) -> PublishedFlow:
    _validate_create_request(status_value=status_value, visibility=visibility)

    project = _project_for_user(db, project_id, current_user)
    selection = _select_prompts(
        db,
        end_prompt_event_id=end_prompt_event_id,
        project_id=project.id,
        prompt_event_ids=prompt_event_ids,
        session_id=session_id,
        start_prompt_event_id=start_prompt_event_id,
    )
    if not selection.selected_events:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Select at least one prompt to share",
        )

    prompt_event_ids_set = {str(event.id) for event in selection.selected_events}
    file_changes = _prompt_file_changes(
        db,
        events=selection.events,
        payloads=selection.payloads,
        prompt_event_ids=prompt_event_ids_set,
        project_id=project.id,
    )
    distinct_files = {
        change["path"]
        for changes in file_changes.values()
        for change in changes
        if isinstance(change.get("path"), str)
    }
    file_count = len(distinct_files)
    flow_title = (
        title or _default_title(project, selection.selected_events, selection.payloads)
    ).strip()
    if not flow_title:
        flow_title = _default_title(project, selection.selected_events, selection.payloads)
    flow_title = flow_title[:MAX_TITLE_LENGTH]
    flow_summary = (summary or _default_summary(selection.selected_events, file_count)).strip()
    selected_event = selection.selected_events[0]
    source_session_id = _source_session_id(selection)

    flow = PublishedFlow(
        author_id=current_user.id,
        context_summary=redact_text(context_summary.strip()) if context_summary else None,
        end_sequence=selection.end_sequence,
        file_count=file_count,
        metrics={"selection_type": selection.selection_type},
        model_name=(
            selection.session.model
            if selection.session is not None and selection.session.model
            else payload_model(selection.payloads[selected_event.id], selected_event.tool)
        ),
        notes=redact_text(notes.strip()) if notes else None,
        prompt_count=len(selection.selected_events),
        published_at=utc_now() if status_value == "published" else None,
        slug=_unique_slug(db, flow_title),
        source_end_event_id=selection.end_event.id,
        source_project_id=project.id,
        source_session_id=source_session_id,
        source_start_event_id=selection.start_event.id,
        start_sequence=selection.start_sequence,
        status=status_value,
        summary=redact_text(flow_summary) if flow_summary else None,
        tags=normalize_tags(tags),
        title=flow_title,
        tool_name=(
            tool_label(selection.session.tool)
            if selection.session is not None
            else tool_label(selected_event.tool)
        ),
        visibility=visibility,
    )
    db.add(flow)
    db.flush()

    for index, event in enumerate(selection.selected_events, start=1):
        payload = selection.payloads[event.id]
        changes = file_changes.get(str(event.id), [])
        response = selection.responses.get(str(event.id), {})
        db.add(
            PublishedFlowItem(
                files_changed=len({change["path"] for change in changes}),
                item_order=index,
                model_name=payload_model(payload, event.tool),
                prompt_text=redact_text(payload_prompt(payload)) or "",
                published_flow_id=flow.id,
                response_received_at=response.get("response_received_at"),
                response_text=response.get("response"),
                sequence=event.sequence,
                source_event_id=event.id,
                submitted_at=event.created_at,
                tool_name=tool_label(event.tool),
            )
        )
        for change in changes:
            path = change.get("path")
            if not isinstance(path, str) or not path:
                continue
            db.add(
                PublishedFlowFile(
                    additions=change.get("additions") or 0,
                    change_type=change.get("status")
                    if isinstance(change.get("status"), str)
                    else None,
                    deletions=change.get("deletions") or 0,
                    diff=redact_text(
                        change.get("patch") if isinstance(change.get("patch"), str) else None
                    ),
                    file_path=path,
                    language=_language_from_path(path),
                    published_flow_id=flow.id,
                    source_event_id=event.id,
                )
            )

    db.flush()
    return flow
