from __future__ import annotations

import re
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, validator
from sqlalchemy import desc, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.encryption import maybe_decrypt_app_text_from_string
from app.core.security import require_web_user
from app.db.session import get_db
from app.models.code_change_patches import CodeChangePatch
from app.models.events import Event
from app.models.project_files import ProjectFile
from app.models.project_knowledge import ProjectKnowledgeResource
from app.models.projects import Project
from app.models.published_flows import PublishedFlow
from app.models.sessions import Session as PromptSession
from app.models.users import User
from app.services.event_payload_security import (
    CODE_CHANGE_PATCH_PURPOSE,
    decrypt_event_payload,
)
from app.services.github_repositories import (
    list_github_repositories,
    read_github_repository_file_content,
    read_github_repository_tree,
    repository_metadata_from_url,
)

router = APIRouter(prefix="/api/projects", tags=["projects"])


class ProjectCreateRequest(BaseModel):
    name: str | None = Field(default=None, max_length=255)
    description: str | None = Field(default=None, max_length=2000)
    github_url: str = Field(..., min_length=1, max_length=2048)
    default_branch: str | None = Field(default=None, max_length=255)

    @validator("name", "description", "github_url", "default_branch", pre=True)
    def strip_string(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value


class ProjectRepositoryUpdateRequest(BaseModel):
    github_url: str = Field(..., min_length=1, max_length=2048)
    default_branch: str | None = Field(default=None, max_length=255)

    @validator("github_url", "default_branch", pre=True)
    def strip_string(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value


def _normalize_github_url(remote_url: str | None) -> str | None:
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


def _iso(value) -> str | None:
    return value.isoformat() if value else None


def _tool_label(tool: str) -> str:
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


def _model_name(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    model = value.strip()
    if not model or model.lower() in TOOL_MODEL_ALIASES:
        return None
    return model


def _payload_model(payload: dict[str, Any], tool: str) -> str:
    return _model_name(payload.get("model")) or _tool_label(tool)


def _paths_from_files_changed(payload: dict[str, Any]) -> set[str]:
    paths: set[str] = set()
    files = payload.get("files")
    if isinstance(files, list):
        paths.update(path for path in files if isinstance(path, str) and path)
    changes = payload.get("changes")
    if isinstance(changes, list):
        for change in changes:
            if not isinstance(change, dict):
                continue
            path = change.get("path")
            if isinstance(path, str) and path:
                paths.add(path)
    return paths


def _payload_prompt(payload: dict[str, Any]) -> str:
    prompt = payload.get("prompt")
    if isinstance(prompt, str) and prompt.strip():
        return prompt.strip()
    return "Untitled prompt"


def _string_or_none(value: Any) -> str | None:
    return value if isinstance(value, str) and value else None


def _response_summary(event: Event, payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "response": _string_or_none(payload.get("response")),
        "response_original_length": payload.get("response_original_length")
        if isinstance(payload.get("response_original_length"), int)
        else None,
        "response_received_at": _iso(event.created_at),
        "response_source": _string_or_none(payload.get("response_source")),
        "response_storage_limit": payload.get("response_storage_limit")
        if isinstance(payload.get("response_storage_limit"), int)
        else None,
        "response_truncated": payload.get("response_truncated") is True,
    }


def _first_int(*values: Any) -> int | None:
    for value in values:
        if isinstance(value, int):
            return value
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
                    "status": change.get("status") if isinstance(change.get("status"), str) else "changed",
                    "additions": _first_int(change.get("additions"), change.get("insertions_delta")),
                    "deletions": _first_int(change.get("deletions_delta"), change.get("deletions")),
                    "old_path": change.get("old_path") if isinstance(change.get("old_path"), str) else None,
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


def _file_change_from_patch(patch: CodeChangePatch) -> dict[str, Any]:
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


def _build_file_tree(paths: list[str]) -> list[dict[str, Any]]:
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


def _project_for_user(db: Session, project_id: UUID, current_user: User) -> Project:
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


def _project_summary(
    project: Project,
    *,
    event_count: int = 0,
    latest_event_at: Any = None,
    session_count: int = 0,
) -> dict[str, Any]:
    return {
        "id": str(project.id),
        "slug": project.slug,
        "name": project.name,
        "git_remote": project.git_remote,
        "github_url": _normalize_github_url(project.git_remote),
        "default_branch": project.default_branch,
        "sessions": int(session_count or 0),
        "events": int(event_count or 0),
        "latest_event_at": latest_event_at.isoformat() if latest_event_at else None,
        "updated_at": project.updated_at.isoformat(),
    }


def _project_summary_with_counts(db: Session, project: Project) -> dict[str, Any]:
    session_count = db.scalar(
        select(func.count())
        .select_from(PromptSession)
        .where(PromptSession.project_id == project.id)
    ) or 0
    event_count = db.scalar(
        select(func.count()).select_from(Event).where(Event.project_id == project.id)
    ) or 0
    latest_event_at = db.scalar(
        select(func.max(Event.created_at)).where(Event.project_id == project.id)
    )
    return _project_summary(
        project,
        event_count=event_count,
        latest_event_at=latest_event_at,
        session_count=session_count,
    )


def _slugify_project_name(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug[:255] or "project"


def _unique_project_slug(db: Session, *, owner_id: UUID, name: str) -> str:
    base = _slugify_project_name(name)
    candidate = base
    suffix = 2
    while db.scalar(
        select(Project.id).where(Project.owner_id == owner_id, Project.slug == candidate)
    ):
        suffix_text = f"-{suffix}"
        candidate = f"{base[: 255 - len(suffix_text)]}{suffix_text}"
        suffix += 1
    return candidate


@router.get("")
def list_projects(
    current_user: User = Depends(require_web_user),
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    rows = db.execute(
        select(
            Project,
            func.count(func.distinct(PromptSession.id)).label("session_count"),
            func.count(func.distinct(Event.id)).label("event_count"),
            func.max(Event.created_at).label("latest_event_at"),
        )
        .outerjoin(PromptSession, PromptSession.project_id == Project.id)
        .outerjoin(Event, Event.project_id == Project.id)
        .where(Project.owner_id == current_user.id)
        .group_by(Project.id)
        .order_by(desc(func.max(Event.created_at)), desc(Project.updated_at))
    ).all()

    return [
        _project_summary(
            project,
            event_count=event_count,
            latest_event_at=latest_event_at,
            session_count=session_count,
        )
        for project, session_count, event_count, latest_event_at in rows
    ]


@router.post("")
def create_project(
    payload: ProjectCreateRequest,
    current_user: User = Depends(require_web_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    repository = repository_metadata_from_url(
        db,
        remote_url=payload.github_url,
        user=current_user,
    )
    repository_url = repository["html_url"]
    existing_project = db.scalar(
        select(Project).where(
            Project.owner_id == current_user.id,
            Project.git_remote == repository_url,
        )
    )
    if existing_project is not None:
        return _project_summary_with_counts(db, existing_project)

    project_name = payload.name or repository["name"]
    description = payload.description
    if description is None and repository["description"]:
        description = repository["description"]

    project = Project(
        owner_id=current_user.id,
        name=project_name[:255],
        slug=_unique_project_slug(db, owner_id=current_user.id, name=project_name),
        description=description,
        visibility="private",
        git_remote=repository_url,
        default_branch=payload.default_branch or repository["default_branch"] or "main",
    )
    db.add(project)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Project could not be created because it conflicts with an existing project.",
        ) from exc
    db.refresh(project)
    return _project_summary(project)


@router.get("/github/repositories")
def read_project_github_repositories(
    search: str | None = Query(default=None, max_length=120),
    current_user: User = Depends(require_web_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return list_github_repositories(db, user=current_user, query=search)


@router.get("/{project_id}/detail")
def read_project_detail(
    project_id: UUID,
    current_user: User = Depends(require_web_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    project = _project_for_user(db, project_id, current_user)
    repository_url = _normalize_github_url(project.git_remote)
    session_count = db.scalar(
        select(func.count())
        .select_from(PromptSession)
        .where(PromptSession.project_id == project.id)
    ) or 0
    event_count = db.scalar(
        select(func.count()).select_from(Event).where(Event.project_id == project.id)
    ) or 0
    prompt_count = db.scalar(
        select(func.count())
        .select_from(Event)
        .where(Event.project_id == project.id, Event.event_type == "PromptSubmitted")
    ) or 0
    latest_activity_at = db.scalar(
        select(func.max(Event.created_at)).where(Event.project_id == project.id)
    )
    flow_status_rows = db.execute(
        select(PublishedFlow.status, func.count(PublishedFlow.id))
        .where(
            PublishedFlow.source_project_id == project.id,
            PublishedFlow.author_id == current_user.id,
        )
        .group_by(PublishedFlow.status)
    ).all()
    flow_status_counts = {
        str(status_value): int(count_value or 0)
        for status_value, count_value in flow_status_rows
    }
    recent_flows = list(
        db.execute(
            select(PublishedFlow)
            .where(
                PublishedFlow.source_project_id == project.id,
                PublishedFlow.author_id == current_user.id,
            )
            .order_by(desc(PublishedFlow.updated_at), desc(PublishedFlow.created_at))
            .limit(3)
        ).scalars()
    )

    events = list(
        db.execute(
            select(Event)
            .where(Event.project_id == project.id)
            .order_by(desc(Event.created_at), desc(Event.sequence))
            .limit(5000)
        ).scalars()
    )
    event_payloads = {
        event.id: decrypt_event_payload(event.event_type, event.payload) for event in events
    }
    sessions = {
        session.id: session
        for session in db.execute(
            select(PromptSession).where(PromptSession.project_id == project.id)
        ).scalars()
    }

    activity_groups: dict[UUID, dict[str, Any]] = {}
    models: set[str] = {
        model
        for session in sessions.values()
        if (model := _model_name(session.model)) is not None
    }
    tools: set[str] = {
        _tool_label(session.tool) for session in sessions.values() if session.tool
    }
    for event in events:
        payload = event_payloads[event.id]
        session = sessions.get(event.session_id)
        session_model = _model_name(session.model) if session else None
        group = activity_groups.setdefault(
            event.session_id,
            {
                "id": str(event.session_id),
                "model": session_model or _payload_model(payload, event.tool),
                "started_at": session.started_at if session else event.created_at,
                "last_activity_at": event.created_at,
                "prompts": 0,
                "responses": 0,
                "events": 0,
                "files": set(),
            },
        )
        tools.add(_tool_label(event.tool))
        group["events"] += 1
        if event.created_at < group["started_at"]:
            group["started_at"] = event.created_at
        if event.created_at > group["last_activity_at"]:
            group["last_activity_at"] = event.created_at
        if event.event_type == "PromptSubmitted":
            group["prompts"] += 1
        if event.event_type == "ResponseReceived":
            group["responses"] += 1
        if event.event_type == "FilesChanged":
            group["files"].update(_paths_from_files_changed(payload))
        model = _model_name(payload.get("model"))
        if model:
            models.add(model)

    activities = sorted(
        activity_groups.values(),
        key=lambda item: item["last_activity_at"],
        reverse=True,
    )

    prompt_changes: dict[str, list[dict[str, Any]]] = {}
    patch_rows = list(
        db.execute(
            select(CodeChangePatch)
            .where(
                CodeChangePatch.project_id == project.id,
                CodeChangePatch.prompt_event_id.is_not(None),
            )
            .order_by(CodeChangePatch.created_at.desc(), CodeChangePatch.path)
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
        payload = event_payloads[event.id]
        prompt_event_id = payload.get("prompt_event_id")
        if not isinstance(prompt_event_id, str) or not prompt_event_id:
            continue
        if prompt_event_id in prompt_changes:
            continue
        prompt_changes.setdefault(prompt_event_id, []).extend(
            _file_changes_from_files_changed(payload)
        )

    prompt_responses: dict[str, dict[str, Any]] = {}
    prompt_by_session_turn: dict[tuple[UUID, str], str] = {}
    latest_prompt_by_session: dict[UUID, Event] = {}
    for event in sorted(events, key=lambda item: (item.created_at, item.sequence)):
        payload = event_payloads[event.id]
        if event.event_type == "PromptSubmitted":
            latest_prompt_by_session[event.session_id] = event
            turn_id = payload.get("turn_id")
            if turn_id is not None:
                prompt_by_session_turn[(event.session_id, str(turn_id))] = str(event.id)
            continue

        if event.event_type != "ResponseReceived":
            continue

        prompt_event_id = _string_or_none(payload.get("prompt_event_id"))
        if prompt_event_id is None:
            turn_id = payload.get("turn_id")
            if turn_id is not None:
                prompt_event_id = prompt_by_session_turn.get(
                    (event.session_id, str(turn_id))
                )
        if prompt_event_id is None:
            prompt_event = latest_prompt_by_session.get(event.session_id)
            prompt_event_id = str(prompt_event.id) if prompt_event else None
        if prompt_event_id is not None:
            prompt_responses[prompt_event_id] = _response_summary(event, payload)

    prompt_activities = [
        {
            "file_changes": prompt_changes.get(str(event.id), []),
            "files_changed": len(
                {change["path"] for change in prompt_changes.get(str(event.id), [])}
            ),
            "id": str(event.id),
            "model": _payload_model(event_payloads[event.id], event.tool),
            "prompt": _payload_prompt(event_payloads[event.id]),
            "prompt_original_length": event_payloads[event.id].get("prompt_original_length")
            if isinstance(event_payloads[event.id].get("prompt_original_length"), int)
            else None,
            "prompt_storage_limit": event_payloads[event.id].get("prompt_storage_limit")
            if isinstance(event_payloads[event.id].get("prompt_storage_limit"), int)
            else None,
            "prompt_truncated": event_payloads[event.id].get("prompt_truncated") is True,
            **prompt_responses.get(str(event.id), {}),
            "sequence": event.sequence,
            "session_id": str(event.session_id),
            "submitted_at": _iso(event.created_at),
        }
        for event in events
        if event.event_type == "PromptSubmitted"
    ][:100]

    active_files = list(
        db.execute(
            select(ProjectFile)
            .where(
                ProjectFile.project_id == project.id,
                ProjectFile.status != "deleted",
            )
            .order_by(ProjectFile.path)
        ).scalars()
    )
    knowledge_resources = list(
        db.execute(
            select(ProjectKnowledgeResource)
            .where(
                ProjectKnowledgeResource.project_id == project.id,
                ProjectKnowledgeResource.status != "deleted",
            )
            .order_by(desc(ProjectKnowledgeResource.updated_at))
        ).scalars()
    )

    last_modified_at = max((file.changed_at for file in active_files), default=None)

    return {
        "project": {
            "id": str(project.id),
            "slug": project.slug,
            "name": project.name,
            "description": project.description,
            "repository_status": "Repository connected"
            if repository_url
            else "Repository not connected",
            "repository_url": repository_url,
            "default_branch": project.default_branch,
            "updated_at": _iso(project.updated_at),
        },
        "metrics": {
            "connected_models": sorted(models),
            "connected_tools": sorted(tools),
            "latest_activity_at": _iso(latest_activity_at),
            "last_modified_at": _iso(last_modified_at or project.updated_at),
            "repository_connected": repository_url is not None,
            "tracked_files": len(active_files),
            "total_events": event_count,
            "total_prompts": prompt_count,
            "total_sessions": session_count,
        },
        "community": {
            "draft_flows": flow_status_counts.get("draft", 0),
            "latest_flow_at": _iso(recent_flows[0].updated_at) if recent_flows else None,
            "published_flows": flow_status_counts.get("published", 0),
            "recent_flows": [
                {
                    "file_count": flow.file_count,
                    "id": str(flow.id),
                    "prompt_count": flow.prompt_count,
                    "published_at": _iso(flow.published_at),
                    "slug": flow.slug,
                    "status": flow.status,
                    "summary": flow.summary,
                    "title": flow.title,
                    "updated_at": _iso(flow.updated_at),
                    "visibility": flow.visibility,
                }
                for flow in recent_flows
            ],
            "total_flows": sum(flow_status_counts.values()),
        },
        "activities": [
            {
                "id": activity["id"],
                "model": activity["model"],
                "started_at": _iso(activity["started_at"]),
                "last_activity_at": _iso(activity["last_activity_at"]),
                "prompts": activity["prompts"],
                "responses": activity["responses"],
                "events": activity["events"],
                "files_changed": len(activity["files"]),
            }
            for activity in activities[:50]
        ],
        "prompt_activities": prompt_activities,
        "knowledge": [
            {
                "id": str(resource.id),
                "title": resource.title,
                "file_type": resource.file_type,
                "updated_at": _iso(resource.updated_at),
                "source_path": resource.source_path,
            }
            for resource in knowledge_resources
        ],
        "files": _build_file_tree([file.path for file in active_files]),
    }


@router.patch("/{project_id}/repository")
def update_project_repository(
    project_id: UUID,
    payload: ProjectRepositoryUpdateRequest,
    current_user: User = Depends(require_web_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    project = _project_for_user(db, project_id, current_user)
    repository = repository_metadata_from_url(
        db,
        remote_url=payload.github_url,
        user=current_user,
    )
    project.git_remote = repository["html_url"]
    project.default_branch = payload.default_branch or repository["default_branch"] or "main"
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Repository could not be connected to this project.",
        ) from exc
    db.refresh(project)
    return _project_summary_with_counts(db, project)


@router.get("/{project_id}/github/files")
def read_project_github_files(
    project_id: UUID,
    current_user: User = Depends(require_web_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    project = _project_for_user(db, project_id, current_user)
    return read_github_repository_tree(db, project=project, user=current_user)


@router.get("/{project_id}/github/files/content")
def read_project_github_file_content(
    project_id: UUID,
    path: str = Query(..., min_length=1, max_length=2048),
    current_user: User = Depends(require_web_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    project = _project_for_user(db, project_id, current_user)
    return read_github_repository_file_content(
        db,
        path=path,
        project=project,
        user=current_user,
    )
