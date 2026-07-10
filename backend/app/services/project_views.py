from __future__ import annotations

import json
import re
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import and_, case, desc, func, or_, select
from sqlalchemy.orm import Session

from app.core.encoding import base64_urldecode, base64_urlencode
from app.models.code_change_patches import CodeChangePatch
from app.models.events import Event
from app.models.project_files import ProjectFile
from app.models.projects import Project
from app.models.prompt_search_documents import PromptSearchDocument
from app.models.sessions import Session as PromptSession
from app.models.users import User
from app.services.event_payload_security import (
    decrypt_event_payload,
)
from app.services.memory_artifacts import (
    count_project_memory_history_artifacts,
    list_project_memory_history_artifacts,
)
from app.services.memory.serializers import (
    serialize_memory_artifact_summary,
)
from app.services.prompt_activity import (
    files_changed_by_prompt_from_events,
    format_response_summary,
    iso,
    model_name,
    patch_file_changes_by_prompt,
    payload_model,
    payload_prompt,
    response_payloads_by_prompt,
    tool_label,
)
from app.services.prompt_search import prompt_search_hashes_for_query

RECENT_ACTIVITY_LIMIT = 50
PROMPT_RELATED_EVENT_LIMIT = 1000
PROJECT_FILE_TREE_LIMIT = 2000
PROMPT_RELATED_EVENT_SEQUENCE_TRAILING = 40

PromptActivityCursor = tuple[datetime, int, UUID]


def normalize_github_url(remote_url: str | None) -> str | None:
    if not remote_url:
        return None

    value = remote_url.strip()
    patterns = (
        r"^git@github\.com:(?P<owner>[^/]+)/(?P<repo>[^/]+?)(?:\.git)?$",
        r"^ssh://git@github\.com/(?P<owner>[^/]+)/(?P<repo>[^/]+?)(?:\.git)?$",
        r"^https://github\.com/(?P<owner>[^/]+)/(?P<repo>[^/]+?)(?:\.git)?/?$",
    )
    for pattern in patterns:
        match = re.match(pattern, value)
        if match:
            return f"https://github.com/{match.group('owner')}/{match.group('repo')}"
    return value if value.startswith("https://github.com/") else None


def build_file_tree(paths: list[str]) -> list[dict[str, Any]]:
    root: dict[str, dict[str, Any]] = {}

    for path in paths:
        parts = [part for part in path.split("/") if part]
        if not parts:
            continue
        current = root
        for index, part in enumerate(parts[:-1]):
            node = current.setdefault(
                part,
                {
                    "name": part,
                    "path": "/".join(parts[: index + 1]),
                    "type": "folder",
                    "children": {},
                },
            )
            if node.get("type") != "folder":
                node["type"] = "folder"
                node["children"] = {}
            if not isinstance(node.get("children"), dict):
                node["children"] = {}
            current = node["children"]
        current[parts[-1]] = {"name": parts[-1], "path": path, "type": "file"}

    def serialize(nodes: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
        serialized: list[dict[str, Any]] = []
        for node in sorted(nodes.values(), key=lambda item: (item["type"] == "file", item["name"])):
            if node["type"] == "folder":
                serialized.append(
                    {
                        "name": node["name"],
                        "path": node["path"],
                        "type": "folder",
                        "children": serialize(node["children"]),
                    }
                )
            else:
                serialized.append(node)
        return serialized

    return serialize(root)


def project_for_user(db: Session, project_id: UUID, current_user: User) -> Project:
    project = db.scalar(
        select(Project).where(
            Project.id == project_id,
            Project.owner_id == current_user.id,
        )
    )
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )
    return project


def _active_file_stats(
    db: Session,
    *,
    project_id: UUID,
    since: datetime,
) -> tuple[int, int, datetime | None]:
    tracked_files, changed_since, last_modified_at = db.execute(
        select(
            func.count(ProjectFile.id),
            func.count(case((ProjectFile.changed_at >= since, 1))),
            func.max(ProjectFile.changed_at),
        ).where(
            ProjectFile.project_id == project_id,
            ProjectFile.status != "deleted",
        )
    ).one()
    return int(tracked_files or 0), int(changed_since or 0), last_modified_at


def read_project_files_response(
    project_id: UUID,
    current_user: User,
    db: Session,
    *,
    limit: int = PROJECT_FILE_TREE_LIMIT,
) -> dict[str, Any]:
    project = project_for_user(db, project_id, current_user)
    total = int(
        db.scalar(
            select(func.count(ProjectFile.id)).where(
                ProjectFile.project_id == project.id,
                ProjectFile.status != "deleted",
            )
        )
        or 0
    )
    file_paths = list(
        db.execute(
            select(ProjectFile.path)
            .where(
                ProjectFile.project_id == project.id,
                ProjectFile.status != "deleted",
            )
            .order_by(ProjectFile.path)
            .limit(limit + 1)
        ).scalars()
    )
    page_paths = file_paths[:limit]
    return {
        "files": build_file_tree(page_paths),
        "limit": limit,
        "total": total,
        "truncated": len(file_paths) > limit,
    }


def _session_metadata_for_project(db: Session, project_id: UUID) -> tuple[set[str], set[str]]:
    models: set[str] = set()
    tools: set[str] = set()
    for session_model, session_tool in db.execute(
        select(PromptSession.model, PromptSession.tool).where(
            PromptSession.project_id == project_id
        )
    ).all():
        if (model := model_name(session_model)) is not None:
            models.add(model)
        if session_tool:
            tools.add(tool_label(session_tool))
    return models, tools


def _activity_summaries(db: Session, project_id: UUID) -> tuple[list[dict[str, Any]], set[str]]:
    rows = db.execute(
        select(
            Event.session_id,
            func.count(Event.id).label("event_count"),
            func.count(case((Event.event_type == "PromptSubmitted", 1))).label("prompt_count"),
            func.count(case((Event.event_type == "ResponseReceived", 1))).label("response_count"),
            func.min(Event.created_at).label("first_event_at"),
            func.max(Event.created_at).label("last_activity_at"),
            func.max(Event.tool).label("fallback_tool"),
        )
        .where(Event.project_id == project_id)
        .group_by(Event.session_id)
        .order_by(desc(func.max(Event.created_at)))
        .limit(RECENT_ACTIVITY_LIMIT)
    ).all()
    session_ids = [session_id for session_id, *_ in rows]
    sessions = (
        {
            session.id: session
            for session in db.execute(
                select(PromptSession).where(PromptSession.id.in_(session_ids))
            ).scalars()
        }
        if session_ids
        else {}
    )
    file_counts = (
        dict(
            db.execute(
                select(
                    CodeChangePatch.session_id,
                    func.count(func.distinct(CodeChangePatch.path)),
                )
                .where(
                    CodeChangePatch.project_id == project_id,
                    CodeChangePatch.session_id.in_(session_ids),
                )
                .group_by(CodeChangePatch.session_id)
            ).all()
        )
        if session_ids
        else {}
    )

    tools: set[str] = set()
    activities: list[dict[str, Any]] = []
    for (
        session_id,
        event_count,
        prompt_count,
        response_count,
        first_event_at,
        last_activity_at,
        fallback_tool,
    ) in rows:
        session = sessions.get(session_id)
        session_tool = session.tool if session else fallback_tool
        if session_tool:
            tools.add(tool_label(session_tool))
        started_at = session.started_at if session else first_event_at
        if first_event_at is not None and started_at is not None and first_event_at < started_at:
            started_at = first_event_at
        session_model = model_name(session.model if session else None)
        activities.append(
            {
                "events": int(event_count or 0),
                "files_changed": int(file_counts.get(session_id, 0) or 0),
                "id": str(session_id),
                "last_activity_at": iso(last_activity_at),
                "model": session_model or tool_label(session_tool or "unknown"),
                "prompts": int(prompt_count or 0),
                "responses": int(response_count or 0),
                "started_at": iso(started_at),
            }
        )
    return activities, tools


def _prompt_file_changes(
    db: Session,
    *,
    project_id: UUID,
    prompt_events: list[Event],
) -> dict[str, list[dict[str, Any]]]:
    prompt_event_ids = {event.id for event in prompt_events}
    prompt_event_id_values = list(prompt_event_ids)
    prompt_event_id_strings = {str(prompt_event_id) for prompt_event_id in prompt_event_ids}

    prompt_changes: dict[str, list[dict[str, Any]]] = {}
    prompt_changes = patch_file_changes_by_prompt(
        db,
        descending=True,
        project_id=project_id,
        prompt_event_ids=prompt_event_id_values,
    )

    if not prompt_events:
        return prompt_changes
    if prompt_changes:
        return prompt_changes

    prompt_session_ids = {event.session_id for event in prompt_events}
    earliest_prompt_at = min(event.created_at for event in prompt_events)
    sequence_filters = _prompt_related_sequence_filters(
        prompt_events,
        trailing=PROMPT_RELATED_EVENT_SEQUENCE_TRAILING,
    )
    fallback_events = list(
        db.execute(
            select(Event)
            .where(
                Event.project_id == project_id,
                Event.event_type == "FilesChanged",
                Event.session_id.in_(prompt_session_ids),
                Event.created_at >= earliest_prompt_at,
                or_(*sequence_filters),
            )
            .order_by(desc(Event.created_at), desc(Event.sequence))
            .limit(PROMPT_RELATED_EVENT_LIMIT)
        ).scalars()
    )
    fallback_payloads = {
        event.id: decrypt_event_payload(event.event_type, event.payload)
        for event in fallback_events
    }
    for prompt_event_id, changes in files_changed_by_prompt_from_events(
        fallback_events,
        fallback_payloads,
        existing_prompt_ids=set(prompt_changes),
        prompt_event_ids=prompt_event_id_strings,
    ).items():
        prompt_changes.setdefault(prompt_event_id, []).extend(changes)

    return prompt_changes


def _prompt_related_sequence_filters(
    prompt_events: list[Event],
    *,
    trailing: int,
) -> list[Any]:
    windows: dict[UUID, tuple[int, int]] = {}
    for event in prompt_events:
        minimum, maximum = windows.get(event.session_id, (event.sequence, event.sequence))
        windows[event.session_id] = (
            min(minimum, event.sequence),
            max(maximum, event.sequence),
        )
    return [
        and_(
            Event.session_id == session_id,
            Event.sequence >= minimum,
            Event.sequence <= maximum + trailing,
        )
        for session_id, (minimum, maximum) in windows.items()
    ]


def _prompt_responses(
    db: Session,
    *,
    project_id: UUID,
    prompt_events: list[Event],
    prompt_payloads: dict[UUID, dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    if not prompt_events:
        return {}

    prompt_session_ids = {event.session_id for event in prompt_events}
    earliest_prompt_at = min(event.created_at for event in prompt_events)
    sequence_filters = _prompt_related_sequence_filters(
        prompt_events,
        trailing=PROMPT_RELATED_EVENT_SEQUENCE_TRAILING,
    )
    response_events = list(
        db.execute(
            select(Event)
            .where(
                Event.project_id == project_id,
                Event.event_type == "ResponseReceived",
                Event.session_id.in_(prompt_session_ids),
                Event.created_at >= earliest_prompt_at,
                or_(*sequence_filters),
            )
            .order_by(desc(Event.created_at), desc(Event.sequence))
            .limit(PROMPT_RELATED_EVENT_LIMIT)
        ).scalars()
    )

    response_payloads = {
        event.id: decrypt_event_payload(event.event_type, event.payload)
        for event in response_events
    }
    return {
        prompt_event_id: format_response_summary(event, payload)
        for prompt_event_id, (event, payload) in response_payloads_by_prompt(
            [*prompt_events, *response_events],
            {**prompt_payloads, **response_payloads},
        ).items()
    }


def _prompt_activity_items(
    db: Session,
    *,
    project_id: UUID,
    prompt_events: list[Event],
    prompt_payloads: dict[UUID, dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    if not prompt_events:
        return []

    payloads = prompt_payloads or {
        event.id: decrypt_event_payload(event.event_type, event.payload)
        for event in prompt_events
    }
    prompt_changes = _prompt_file_changes(
        db,
        project_id=project_id,
        prompt_events=prompt_events,
    )
    prompt_responses = _prompt_responses(
        db,
        project_id=project_id,
        prompt_events=prompt_events,
        prompt_payloads=payloads,
    )

    return [
        {
            "file_changes": prompt_changes.get(str(event.id), []),
            "files_changed": len(
                {change["path"] for change in prompt_changes.get(str(event.id), [])}
            ),
            "id": str(event.id),
            "model": payload_model(payloads[event.id], event.tool),
            "prompt": payload_prompt(payloads[event.id]),
            "prompt_original_length": payloads[event.id].get("prompt_original_length")
            if isinstance(payloads[event.id].get("prompt_original_length"), int)
            else None,
            "prompt_storage_limit": payloads[event.id].get("prompt_storage_limit")
            if isinstance(payloads[event.id].get("prompt_storage_limit"), int)
            else None,
            "prompt_truncated": payloads[event.id].get("prompt_truncated") is True,
            **prompt_responses.get(str(event.id), {}),
            "sequence": event.sequence,
            "session_id": str(event.session_id),
            "submitted_at": iso(event.created_at),
        }
        for event in prompt_events
    ]


def _encode_prompt_activity_cursor(event: Event) -> str:
    payload = {
        "created_at": event.created_at.isoformat(),
        "id": str(event.id),
        "sequence": event.sequence,
    }
    return base64_urlencode(
        json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    )


def _decode_prompt_activity_cursor(value: str | None) -> PromptActivityCursor | None:
    if not value:
        return None

    try:
        payload = json.loads(base64_urldecode(value))
        created_at_value = payload["created_at"]
        sequence = payload["sequence"]
        event_id = UUID(payload["id"])
    except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid prompt activity cursor",
        ) from exc

    if not isinstance(created_at_value, str) or not isinstance(sequence, int):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid prompt activity cursor",
        )

    try:
        created_at = datetime.fromisoformat(created_at_value)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid prompt activity cursor",
        ) from exc
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    return created_at, sequence, event_id


def _prompt_activity_order_by() -> tuple[Any, Any, Any]:
    return desc(Event.created_at), desc(Event.sequence), desc(Event.id)


def _apply_prompt_activity_cursor(statement: Any, cursor: PromptActivityCursor | None) -> Any:
    if cursor is None:
        return statement

    created_at, sequence, event_id = cursor
    return statement.where(
        or_(
            Event.created_at < created_at,
            and_(Event.created_at == created_at, Event.sequence < sequence),
            and_(
                Event.created_at == created_at,
                Event.sequence == sequence,
                Event.id < event_id,
            ),
        )
    )


def read_project_prompt_activities_response(
    project_id: UUID,
    current_user: User,
    db: Session,
    *,
    limit: int,
    cursor: str | None = None,
    query: str | None = None,
    session_id: UUID | None = None,
) -> dict[str, Any]:
    project = project_for_user(db, project_id, current_user)
    normalized_query = re.sub(r"\s+", " ", query.strip().lower()) if query else ""
    decoded_cursor = _decode_prompt_activity_cursor(cursor)
    base_query = select(Event).where(
        Event.project_id == project.id,
        Event.event_type == "PromptSubmitted",
    )
    total_query = select(func.count(Event.id)).where(
        Event.project_id == project.id,
        Event.event_type == "PromptSubmitted",
    )
    if session_id is not None:
        base_query = base_query.where(Event.session_id == session_id)
        total_query = total_query.where(Event.session_id == session_id)

    if not normalized_query:
        total = int(db.scalar(total_query) or 0)
        prompt_events = list(
            db.execute(
                _apply_prompt_activity_cursor(base_query, decoded_cursor)
                .order_by(*_prompt_activity_order_by())
                .limit(limit + 1)
            ).scalars()
        )
        page_events = prompt_events[:limit]
        has_more = len(prompt_events) > limit
        return {
            "cursor": cursor,
            "has_more": has_more,
            "items": _prompt_activity_items(
                db,
                project_id=project.id,
                prompt_events=page_events,
            ),
            "limit": limit,
            "next_cursor": _encode_prompt_activity_cursor(page_events[-1])
            if has_more and page_events
            else None,
            "query": None,
            "scanned": len(page_events),
            "session_id": str(session_id) if session_id else None,
            "total": total,
        }

    query_hashes = prompt_search_hashes_for_query(normalized_query)
    if not query_hashes:
        return {
            "cursor": cursor,
            "has_more": False,
            "items": [],
            "limit": limit,
            "next_cursor": None,
            "query": normalized_query,
            "scanned": 0,
            "session_id": str(session_id) if session_id else None,
            "total": None,
        }

    search_query = (
        select(Event)
        .join(
            PromptSearchDocument,
            PromptSearchDocument.prompt_event_id == Event.id,
        )
        .where(
            Event.project_id == project.id,
            Event.event_type == "PromptSubmitted",
            PromptSearchDocument.project_id == project.id,
            PromptSearchDocument.token_hashes.contains(query_hashes),
        )
    )
    if session_id is not None:
        search_query = search_query.where(
            Event.session_id == session_id,
            PromptSearchDocument.session_id == session_id,
        )

    matched_events = list(
        db.execute(
            _apply_prompt_activity_cursor(search_query, decoded_cursor)
            .order_by(*_prompt_activity_order_by())
            .limit(limit + 1)
        ).scalars()
    )
    page_events = matched_events[:limit]
    has_more = len(matched_events) > limit
    return {
        "cursor": cursor,
        "has_more": has_more,
        "items": _prompt_activity_items(
            db,
            project_id=project.id,
            prompt_events=page_events,
        ),
        "limit": limit,
        "next_cursor": _encode_prompt_activity_cursor(page_events[-1])
        if has_more and page_events
        else None,
        "query": normalized_query,
        "scanned": len(page_events),
        "session_id": str(session_id) if session_id else None,
        "total": None,
    }


def read_project_detail_response(
    project_id: UUID,
    current_user: User,
    db: Session,
) -> dict[str, Any]:
    project = project_for_user(db, project_id, current_user)
    repository_url = normalize_github_url(project.git_remote)
    since_yesterday_at = datetime.now(timezone.utc) - timedelta(days=1)
    session_count, session_count_since_yesterday = db.execute(
        select(
            func.count(PromptSession.id),
            func.count(
                case((PromptSession.started_at >= since_yesterday_at, 1)),
            ),
        ).where(PromptSession.project_id == project.id)
    ).one()
    event_count, prompt_count, prompt_count_since_yesterday, latest_activity_at = db.execute(
        select(
            func.count(Event.id),
            func.count(case((Event.event_type == "PromptSubmitted", 1))),
            func.count(
                case(
                    (
                        and_(
                            Event.event_type == "PromptSubmitted",
                            Event.created_at >= since_yesterday_at,
                        ),
                        1,
                    )
                )
            ),
            func.max(Event.created_at),
        ).where(Event.project_id == project.id)
    ).one()
    memory_artifact_count = count_project_memory_history_artifacts(
        db,
        project_id=project.id,
    )
    memory_artifact_count_since_yesterday = count_project_memory_history_artifacts(
        db,
        project_id=project.id,
        since=since_yesterday_at,
    )

    models, tools = _session_metadata_for_project(db, project.id)
    activities, activity_tools = _activity_summaries(db, project.id)
    tools.update(activity_tools)

    tracked_file_count, files_changed_since_yesterday, last_modified_at = _active_file_stats(
        db,
        project_id=project.id,
        since=since_yesterday_at,
    )
    memory_artifacts = list_project_memory_history_artifacts(
        db,
        limit=10,
        project_id=project.id,
    )

    return {
        "project": {
            "id": str(project.id),
            "slug": project.slug,
            "name": project.name,
            "description": project.description,
            "created_at": iso(project.created_at),
            "is_bookmarked": bool(project.is_bookmarked),
            "tags": project.tags or [],
            "visibility": project.visibility,
            "repository_status": "Repository connected"
            if repository_url
            else "Repository not connected",
            "repository_url": repository_url,
            "default_branch": project.default_branch,
            "updated_at": iso(project.updated_at),
        },
        "metrics": {
            "connected_models": sorted(models),
            "connected_tools": sorted(tools),
            "files_changed_since_yesterday": files_changed_since_yesterday,
            "latest_activity_at": iso(latest_activity_at),
            "last_modified_at": iso(last_modified_at or project.updated_at),
            "memory_artifacts_since_yesterday": memory_artifact_count_since_yesterday,
            "prompts_since_yesterday": prompt_count_since_yesterday,
            "repository_connected": repository_url is not None,
            "sessions_since_yesterday": session_count_since_yesterday,
            "tracked_files": tracked_file_count,
            "total_events": event_count,
            "total_prompts": prompt_count,
            "total_sessions": session_count,
        },
        "memory": {
            "latest_artifact_at": iso(memory_artifacts[0].updated_at) if memory_artifacts else None,
            "recent_artifacts": [
                serialize_memory_artifact_summary(artifact) for artifact in memory_artifacts
            ],
            "total_artifacts": memory_artifact_count,
        },
        "activities": activities,
        "prompt_activities": [],
        "files": [],
    }
