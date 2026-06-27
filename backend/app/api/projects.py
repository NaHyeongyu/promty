from __future__ import annotations

import re
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, validator
from sqlalchemy import desc, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import require_web_user
from app.db.session import get_db
from app.models.events import Event
from app.models.project_files import ProjectFile
from app.models.project_knowledge import ProjectKnowledgeResource
from app.models.projects import Project
from app.models.sessions import Session as PromptSession
from app.models.users import User
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


def _payload_model(payload: dict[str, Any], tool: str) -> str:
    model = payload.get("model")
    return model if isinstance(model, str) and model else _tool_label(tool)


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
    latest_activity_at = db.scalar(
        select(func.max(Event.created_at)).where(Event.project_id == project.id)
    )

    events = list(
        db.execute(
            select(Event)
            .where(Event.project_id == project.id)
            .order_by(desc(Event.created_at), desc(Event.sequence))
            .limit(5000)
        ).scalars()
    )
    sessions = {
        session.id: session
        for session in db.execute(
            select(PromptSession).where(PromptSession.project_id == project.id)
        ).scalars()
    }

    activity_groups: dict[UUID, dict[str, Any]] = {}
    models: set[str] = {session.model for session in sessions.values() if session.model}
    for event in events:
        session = sessions.get(event.session_id)
        group = activity_groups.setdefault(
            event.session_id,
            {
                "id": str(event.session_id),
                "model": session.model if session and session.model else _payload_model(event.payload, event.tool),
                "started_at": session.started_at if session else event.created_at,
                "last_activity_at": event.created_at,
                "prompts": 0,
                "responses": 0,
                "events": 0,
                "files": set(),
            },
        )
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
            group["files"].update(_paths_from_files_changed(event.payload))
        model = _payload_model(event.payload, event.tool)
        if model:
            models.add(model)

    activities = sorted(
        activity_groups.values(),
        key=lambda item: item["last_activity_at"],
        reverse=True,
    )
    prompt_activities = [
        {
            "id": str(event.id),
            "model": _payload_model(event.payload, event.tool),
            "prompt": _payload_prompt(event.payload),
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
            "latest_activity_at": _iso(latest_activity_at),
            "last_modified_at": _iso(last_modified_at or project.updated_at),
            "repository_connected": repository_url is not None,
            "tracked_files": len(active_files),
            "total_events": event_count,
            "total_sessions": session_count,
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
