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
from app.models.projects import Project
from app.models.sessions import Session as PromptSession
from app.models.users import User
from app.services.github_repositories import (
    list_github_repositories,
    read_github_repository_file_content,
    read_github_repository_tree,
    repository_metadata_from_url,
)
from app.services.project_views import (
    iso as _iso,
    model_name as _model_name,
    normalize_github_url as _normalize_github_url,
    project_for_user as _project_for_user,
    read_project_detail_response,
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


class ProjectDescriptionUpdateRequest(BaseModel):
    description: str | None = Field(default=None, max_length=2000)

    @validator("description", pre=True)
    def strip_description(cls, value: Any) -> Any:
        if value is None:
            return None
        if isinstance(value, str):
            stripped = value.strip()
            return stripped or None
        return value


class ProjectMetadataUpdateRequest(BaseModel):
    slug: str | None = Field(default=None, min_length=1, max_length=255)
    tags: list[str] | None = None
    visibility: str | None = Field(default=None)

    @validator("slug", pre=True)
    def normalize_slug(cls, value: Any) -> Any:
        if value is None:
            return None
        if not isinstance(value, str):
            return value
        slug = _slugify_project_name(value)
        if not slug:
            raise ValueError("Project URL is required.")
        return slug

    @validator("tags", pre=True)
    def normalize_tags(cls, value: Any) -> list[str] | None:
        if value is None:
            return None
        if isinstance(value, str):
            raw_tags = value.split(",")
        elif isinstance(value, list):
            raw_tags = value
        else:
            return value

        normalized_tags: list[str] = []
        seen_tags: set[str] = set()
        for tag in raw_tags:
            if not isinstance(tag, str):
                continue
            normalized_tag = re.sub(r"\s+", " ", tag.strip().lower())
            if not normalized_tag or normalized_tag in seen_tags:
                continue
            seen_tags.add(normalized_tag)
            normalized_tags.append(normalized_tag[:40])
            if len(normalized_tags) >= 12:
                break
        return normalized_tags

    @validator("visibility", pre=True)
    def normalize_visibility(cls, value: Any) -> str | None:
        if value is None:
            return None
        if not isinstance(value, str):
            return value
        visibility = value.strip().lower()
        if visibility not in {"public", "private"}:
            raise ValueError("Visibility must be public or private.")
        return visibility


class ProjectBookmarkUpdateRequest(BaseModel):
    is_bookmarked: bool


def _project_summary(
    project: Project,
    *,
    connected_models: list[str] | tuple[str, ...] = (),
    event_count: int = 0,
    latest_event_at: Any = None,
    prompt_count: int = 0,
    session_count: int = 0,
    tracked_files: int = 0,
) -> dict[str, Any]:
    return {
        "id": str(project.id),
        "slug": project.slug,
        "name": project.name,
        "git_remote": project.git_remote,
        "github_url": _normalize_github_url(project.git_remote),
        "default_branch": project.default_branch,
        "created_at": project.created_at.isoformat(),
        "is_bookmarked": bool(project.is_bookmarked),
        "tags": project.tags or [],
        "visibility": project.visibility,
        "connected_models": sorted(connected_models),
        "sessions": int(session_count or 0),
        "events": int(event_count or 0),
        "prompts": int(prompt_count or 0),
        "tracked_files": int(tracked_files or 0),
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
    prompt_count = db.scalar(
        select(func.count())
        .select_from(Event)
        .where(Event.project_id == project.id, Event.event_type == "PromptSubmitted")
    ) or 0
    tracked_files = db.scalar(
        select(func.count())
        .select_from(ProjectFile)
        .where(ProjectFile.project_id == project.id, ProjectFile.status != "deleted")
    ) or 0
    sessions = list(
        db.execute(
            select(PromptSession.model).where(
                PromptSession.project_id == project.id
            )
        ).all()
    )
    return _project_summary(
        project,
        connected_models=[
            model
            for (session_model,) in sessions
            if (model := _model_name(session_model)) is not None
        ],
        event_count=event_count,
        latest_event_at=latest_event_at,
        prompt_count=prompt_count,
        session_count=session_count,
        tracked_files=tracked_files,
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
    project_ids = [project.id for project, *_ in rows]
    prompt_counts = dict(
        db.execute(
            select(Event.project_id, func.count(Event.id))
            .where(Event.project_id.in_(project_ids), Event.event_type == "PromptSubmitted")
            .group_by(Event.project_id)
        ).all()
    )
    tracked_file_counts = dict(
        db.execute(
            select(ProjectFile.project_id, func.count(ProjectFile.id))
            .where(ProjectFile.project_id.in_(project_ids), ProjectFile.status != "deleted")
            .group_by(ProjectFile.project_id)
        ).all()
    )
    connected_models: dict[UUID, set[str]] = {project_id: set() for project_id in project_ids}
    for project_id, model_value in db.execute(
        select(PromptSession.project_id, PromptSession.model).where(
            PromptSession.project_id.in_(project_ids)
        )
    ).all():
        if (model := _model_name(model_value)) is not None:
            connected_models.setdefault(project_id, set()).add(model)

    return [
        _project_summary(
            project,
            connected_models=tuple(connected_models.get(project.id, set())),
            event_count=event_count,
            latest_event_at=latest_event_at,
            prompt_count=prompt_counts.get(project.id, 0),
            session_count=session_count,
            tracked_files=tracked_file_counts.get(project.id, 0),
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
    return read_project_detail_response(project_id, current_user, db)


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


@router.patch("/{project_id}/description")
def update_project_description(
    project_id: UUID,
    payload: ProjectDescriptionUpdateRequest,
    current_user: User = Depends(require_web_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    project = _project_for_user(db, project_id, current_user)
    project.description = payload.description
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Project description could not be updated.",
        ) from exc
    db.refresh(project)
    return {
        "description": project.description,
        "id": str(project.id),
        "updated_at": _iso(project.updated_at),
    }


@router.patch("/{project_id}/metadata")
def update_project_metadata(
    project_id: UUID,
    payload: ProjectMetadataUpdateRequest,
    current_user: User = Depends(require_web_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    project = _project_for_user(db, project_id, current_user)
    if payload.slug is not None and payload.slug != project.slug:
        existing_project_id = db.scalar(
            select(Project.id).where(
                Project.owner_id == current_user.id,
                Project.slug == payload.slug,
                Project.id != project.id,
            )
        )
        if existing_project_id is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Project URL is already in use.",
            )
        project.slug = payload.slug
    if payload.tags is not None:
        project.tags = payload.tags
    if payload.visibility is not None:
        project.visibility = payload.visibility

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Project metadata could not be updated.",
        ) from exc
    db.refresh(project)
    return _project_summary_with_counts(db, project)


@router.patch("/{project_id}/bookmark")
def update_project_bookmark(
    project_id: UUID,
    payload: ProjectBookmarkUpdateRequest,
    current_user: User = Depends(require_web_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    project = _project_for_user(db, project_id, current_user)
    project.is_bookmarked = payload.is_bookmarked
    db.commit()
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
