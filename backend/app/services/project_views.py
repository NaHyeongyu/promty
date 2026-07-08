from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import case, desc, func, select
from sqlalchemy.orm import Session

from app.core.encryption import maybe_decrypt_app_text_from_string
from app.models.artifacts import Artifact
from app.models.code_change_patches import CodeChangePatch
from app.models.events import Event
from app.models.project_files import ProjectFile
from app.models.projects import Project
from app.models.sessions import Session as PromptSession
from app.models.users import User
from app.services.event_payload_security import (
    CODE_CHANGE_PATCH_PURPOSE,
    decrypt_event_payload,
)
from app.services.memory_artifacts import (
    PROJECT_MEMORY_ARTIFACT_TYPE,
    serialize_memory_artifact_summary,
)

RECENT_ACTIVITY_LIMIT = 50
PROMPT_DETAIL_LIMIT = 100
PROMPT_RELATED_EVENT_LIMIT = 1000


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


def iso(value: Any) -> str | None:
    return value.isoformat() if value else None


def tool_label(tool: str) -> str:
    labels = {
        "claude-code": "Claude Code",
        "codex-cli": "Codex",
        "cursor": "Cursor",
        "gemini-cli": "Gemini CLI",
    }
    return labels.get(tool, tool)


TOOL_MODEL_ALIASES = {
    "claude code",
    "claude-code",
    "codex",
    "codex-cli",
    "cursor",
    "gemini cli",
    "gemini-cli",
}


def model_name(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    model = value.strip()
    if not model or model.lower() in TOOL_MODEL_ALIASES:
        return None
    return model


def payload_model(payload: dict[str, Any], tool: str) -> str:
    return model_name(payload.get("model")) or tool_label(tool)


def payload_prompt(payload: dict[str, Any]) -> str:
    prompt = payload.get("prompt")
    if isinstance(prompt, str) and prompt.strip():
        return prompt.strip()
    return "Untitled prompt"


def string_or_none(value: Any) -> str | None:
    return value if isinstance(value, str) and value else None


def response_summary(event: Event, payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "response": string_or_none(payload.get("response")),
        "response_original_length": payload.get("response_original_length")
        if isinstance(payload.get("response_original_length"), int)
        else None,
        "response_received_at": iso(event.created_at),
        "response_source": string_or_none(payload.get("response_source")),
        "response_storage_limit": payload.get("response_storage_limit")
        if isinstance(payload.get("response_storage_limit"), int)
        else None,
        "response_truncated": payload.get("response_truncated") is True,
    }


def first_int(*values: Any) -> int | None:
    for value in values:
        if isinstance(value, int):
            return value
    return None


def file_changes_from_files_changed(payload: dict[str, Any]) -> list[dict[str, Any]]:
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
                    "additions": first_int(
                        change.get("additions"),
                        change.get("insertions_delta"),
                    ),
                    "deletions": first_int(
                        change.get("deletions_delta"),
                        change.get("deletions"),
                    ),
                    "old_path": change.get("old_path")
                    if isinstance(change.get("old_path"), str)
                    else None,
                    "patch": change.get("patch") if isinstance(change.get("patch"), str) else None,
                    "patch_omitted_reason": change.get("patch_omitted_reason")
                    if isinstance(change.get("patch_omitted_reason"), str)
                    else None,
                    "patch_truncated": change.get("patch_truncated") is True,
                    "binary": change.get("binary") is True,
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
                "additions": None,
                "deletions": None,
            }
            for path in files
            if isinstance(path, str) and path
        ]
    return []


def file_change_from_patch(patch: CodeChangePatch) -> dict[str, Any]:
    return {
        "additions": patch.additions,
        "binary": patch.binary,
        "deletions": patch.deletions,
        "event_id": str(patch.event_id),
        "old_path": patch.old_path,
        "patch": maybe_decrypt_app_text_from_string(
            patch.patch,
            purpose=CODE_CHANGE_PATCH_PURPOSE,
        ),
        "patch_omitted_reason": patch.metadata_.get("patch_omitted_reason")
        if isinstance(patch.metadata_, dict)
        else None,
        "patch_truncated": patch.patch_truncated,
        "path": patch.path,
        "status": patch.status,
    }


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


def _event_sort_key(event: Event) -> tuple[datetime, int]:
    return event.created_at, event.sequence


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


def _prompt_detail_events(db: Session, project_id: UUID) -> list[Event]:
    return list(
        db.execute(
            select(Event)
            .where(
                Event.project_id == project_id,
                Event.event_type == "PromptSubmitted",
            )
            .order_by(desc(Event.created_at), desc(Event.sequence))
            .limit(PROMPT_DETAIL_LIMIT)
        ).scalars()
    )


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
    patch_rows = (
        list(
            db.execute(
                select(CodeChangePatch)
                .where(
                    CodeChangePatch.project_id == project_id,
                    CodeChangePatch.prompt_event_id.in_(prompt_event_id_values),
                )
                .order_by(CodeChangePatch.created_at.desc(), CodeChangePatch.path)
            ).scalars()
        )
        if prompt_event_id_values
        else []
    )
    for patch in patch_rows:
        if patch.prompt_event_id is None:
            continue
        prompt_changes.setdefault(str(patch.prompt_event_id), []).append(
            file_change_from_patch(patch)
        )

    if not prompt_events:
        return prompt_changes

    prompt_session_ids = {event.session_id for event in prompt_events}
    earliest_prompt_at = min(event.created_at for event in prompt_events)
    fallback_events = list(
        db.execute(
            select(Event)
            .where(
                Event.project_id == project_id,
                Event.event_type == "FilesChanged",
                Event.session_id.in_(prompt_session_ids),
                Event.created_at >= earliest_prompt_at,
            )
            .order_by(desc(Event.created_at), desc(Event.sequence))
            .limit(PROMPT_RELATED_EVENT_LIMIT)
        ).scalars()
    )
    for event in fallback_events:
        payload = decrypt_event_payload(event.event_type, event.payload)
        prompt_event_id = payload.get("prompt_event_id")
        if not isinstance(prompt_event_id, str) or prompt_event_id not in prompt_event_id_strings:
            continue
        if prompt_event_id in prompt_changes:
            continue
        prompt_changes.setdefault(prompt_event_id, []).extend(
            file_changes_from_files_changed(payload)
        )

    return prompt_changes


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
    response_events = list(
        db.execute(
            select(Event)
            .where(
                Event.project_id == project_id,
                Event.event_type == "ResponseReceived",
                Event.session_id.in_(prompt_session_ids),
                Event.created_at >= earliest_prompt_at,
            )
            .order_by(desc(Event.created_at), desc(Event.sequence))
            .limit(PROMPT_RELATED_EVENT_LIMIT)
        ).scalars()
    )

    prompt_responses: dict[str, dict[str, Any]] = {}
    prompt_by_session_turn: dict[tuple[UUID, str], str] = {}
    latest_prompt_by_session: dict[UUID, Event] = {}
    for event in sorted([*prompt_events, *response_events], key=_event_sort_key):
        if event.event_type == "PromptSubmitted":
            payload = prompt_payloads[event.id]
            latest_prompt_by_session[event.session_id] = event
            turn_id = payload.get("turn_id")
            if turn_id is not None:
                prompt_by_session_turn[(event.session_id, str(turn_id))] = str(event.id)
            continue

        payload = decrypt_event_payload(event.event_type, event.payload)
        prompt_event_id = string_or_none(payload.get("prompt_event_id"))
        if prompt_event_id is None:
            turn_id = payload.get("turn_id")
            if turn_id is not None:
                prompt_event_id = prompt_by_session_turn.get((event.session_id, str(turn_id)))
        if prompt_event_id is None:
            prompt_event = latest_prompt_by_session.get(event.session_id)
            prompt_event_id = str(prompt_event.id) if prompt_event else None
        if prompt_event_id is not None:
            prompt_responses[prompt_event_id] = response_summary(event, payload)

    return prompt_responses


def read_project_detail_response(
    project_id: UUID,
    current_user: User,
    db: Session,
) -> dict[str, Any]:
    project = project_for_user(db, project_id, current_user)
    repository_url = normalize_github_url(project.git_remote)
    since_yesterday_at = datetime.now(timezone.utc) - timedelta(days=1)
    session_count = (
        db.scalar(
            select(func.count())
            .select_from(PromptSession)
            .where(PromptSession.project_id == project.id)
        )
        or 0
    )
    session_count_since_yesterday = (
        db.scalar(
            select(func.count())
            .select_from(PromptSession)
            .where(
                PromptSession.project_id == project.id,
                PromptSession.started_at >= since_yesterday_at,
            )
        )
        or 0
    )
    event_count = (
        db.scalar(select(func.count()).select_from(Event).where(Event.project_id == project.id))
        or 0
    )
    prompt_count = (
        db.scalar(
            select(func.count())
            .select_from(Event)
            .where(Event.project_id == project.id, Event.event_type == "PromptSubmitted")
        )
        or 0
    )
    prompt_count_since_yesterday = (
        db.scalar(
            select(func.count())
            .select_from(Event)
            .where(
                Event.project_id == project.id,
                Event.event_type == "PromptSubmitted",
                Event.created_at >= since_yesterday_at,
            )
        )
        or 0
    )
    latest_activity_at = db.scalar(
        select(func.max(Event.created_at)).where(Event.project_id == project.id)
    )

    models, tools = _session_metadata_for_project(db, project.id)
    activities, activity_tools = _activity_summaries(db, project.id)
    tools.update(activity_tools)

    prompt_events = _prompt_detail_events(db, project.id)
    prompt_payloads = {
        event.id: decrypt_event_payload(event.event_type, event.payload) for event in prompt_events
    }
    for payload in prompt_payloads.values():
        if (model := model_name(payload.get("model"))) is not None:
            models.add(model)

    prompt_changes = _prompt_file_changes(
        db,
        project_id=project.id,
        prompt_events=prompt_events,
    )
    prompt_responses = _prompt_responses(
        db,
        project_id=project.id,
        prompt_events=prompt_events,
        prompt_payloads=prompt_payloads,
    )
    prompt_activities = [
        {
            "file_changes": prompt_changes.get(str(event.id), []),
            "files_changed": len(
                {change["path"] for change in prompt_changes.get(str(event.id), [])}
            ),
            "id": str(event.id),
            "model": payload_model(prompt_payloads[event.id], event.tool),
            "prompt": payload_prompt(prompt_payloads[event.id]),
            "prompt_original_length": prompt_payloads[event.id].get("prompt_original_length")
            if isinstance(prompt_payloads[event.id].get("prompt_original_length"), int)
            else None,
            "prompt_storage_limit": prompt_payloads[event.id].get("prompt_storage_limit")
            if isinstance(prompt_payloads[event.id].get("prompt_storage_limit"), int)
            else None,
            "prompt_truncated": prompt_payloads[event.id].get("prompt_truncated") is True,
            **prompt_responses.get(str(event.id), {}),
            "sequence": event.sequence,
            "session_id": str(event.session_id),
            "submitted_at": iso(event.created_at),
        }
        for event in prompt_events
    ]

    active_file_paths = list(
        db.execute(
            select(ProjectFile.path)
            .where(
                ProjectFile.project_id == project.id,
                ProjectFile.status != "deleted",
            )
            .order_by(ProjectFile.path)
        ).scalars()
    )
    last_modified_at = db.scalar(
        select(func.max(ProjectFile.changed_at)).where(
            ProjectFile.project_id == project.id,
            ProjectFile.status != "deleted",
        )
    )
    files_changed_since_yesterday = (
        db.scalar(
            select(func.count())
            .select_from(ProjectFile)
            .where(
                ProjectFile.project_id == project.id,
                ProjectFile.status != "deleted",
                ProjectFile.changed_at >= since_yesterday_at,
            )
        )
        or 0
    )
    memory_artifacts = list(
        db.execute(
            select(Artifact)
            .where(
                Artifact.project_id == project.id,
                Artifact.type == PROJECT_MEMORY_ARTIFACT_TYPE,
            )
            .order_by(desc(Artifact.updated_at), desc(Artifact.created_at))
            .limit(5)
        ).scalars()
    )
    memory_artifact_count = (
        db.scalar(
            select(func.count())
            .select_from(Artifact)
            .where(
                Artifact.project_id == project.id,
                Artifact.type == PROJECT_MEMORY_ARTIFACT_TYPE,
            )
        )
        or 0
    )
    memory_artifact_count_since_yesterday = (
        db.scalar(
            select(func.count())
            .select_from(Artifact)
            .where(
                Artifact.project_id == project.id,
                Artifact.type == PROJECT_MEMORY_ARTIFACT_TYPE,
                Artifact.created_at >= since_yesterday_at,
            )
        )
        or 0
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
            "tracked_files": len(active_file_paths),
            "total_events": event_count,
            "total_prompts": prompt_count,
            "total_sessions": session_count,
        },
        "memory": {
            "latest_artifact_at": iso(memory_artifacts[0].updated_at) if memory_artifacts else None,
            "recent_artifacts": [
                serialize_memory_artifact_summary(artifact, db=db) for artifact in memory_artifacts
            ],
            "total_artifacts": memory_artifact_count,
        },
        "activities": activities,
        "prompt_activities": prompt_activities,
        "files": build_file_tree(active_file_paths),
    }
