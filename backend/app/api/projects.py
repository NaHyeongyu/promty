from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.transactions import commit_or_conflict as _commit_or_conflict
from app.core.security import require_web_user
from app.db.session import get_db
from app.models.users import User
from app.schemas.projects import (
    ProjectBookmarkUpdateRequest,
    ProjectCreateRequest,
    ProjectDescriptionUpdateRequest,
    ProjectMetadataUpdateRequest,
    ProjectRepositoryUpdateRequest,
    ProjectSummaryResponse,
)
from app.services.github_repositories import (
    list_github_repositories,
    read_github_repository_file_content,
    read_github_repository_tree,
)
from app.services.projects.management import (
    create_project_summary,
    list_project_summaries,
    update_project_bookmark_summary,
    update_project_description_summary,
    update_project_metadata_summary,
    update_project_repository_summary,
)
from app.services.projects.views import (
    project_for_user as _project_for_user,
    read_project_detail_response,
    read_project_files_response,
    read_project_prompt_activities_response,
)

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.get("", response_model=list[ProjectSummaryResponse])
def list_projects(
    current_user: User = Depends(require_web_user),
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    return list_project_summaries(db, current_user=current_user)


@router.post("", response_model=ProjectSummaryResponse)
def create_project(
    payload: ProjectCreateRequest,
    current_user: User = Depends(require_web_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    response = create_project_summary(
        db,
        default_branch=payload.default_branch,
        description=payload.description,
        github_url=payload.github_url,
        name=payload.name,
        user=current_user,
    )
    _commit_or_conflict(
        db,
        detail="Project could not be created because it conflicts with an existing project.",
    )
    return response


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


@router.get("/{project_id}/prompt-activities")
def read_project_prompt_activities(
    project_id: UUID,
    limit: int = Query(default=50, ge=1, le=100),
    cursor: str | None = Query(default=None, max_length=512),
    q: str | None = Query(default=None, max_length=120),
    session_id: UUID | None = Query(default=None),
    current_user: User = Depends(require_web_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return read_project_prompt_activities_response(
        project_id,
        current_user,
        db,
        limit=limit,
        cursor=cursor,
        query=q,
        session_id=session_id,
    )


@router.get("/{project_id}/files")
def read_project_files(
    project_id: UUID,
    limit: int = Query(default=2000, ge=1, le=5000),
    current_user: User = Depends(require_web_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return read_project_files_response(
        project_id,
        current_user,
        db,
        limit=limit,
    )


@router.patch("/{project_id}/repository", response_model=ProjectSummaryResponse)
def update_project_repository(
    project_id: UUID,
    payload: ProjectRepositoryUpdateRequest,
    current_user: User = Depends(require_web_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    response = update_project_repository_summary(
        db,
        default_branch=payload.default_branch,
        github_url=payload.github_url,
        project_id=project_id,
        user=current_user,
    )
    _commit_or_conflict(db, detail="Repository could not be connected to this project.")
    return response


@router.patch("/{project_id}/description", response_model=ProjectSummaryResponse)
def update_project_description(
    project_id: UUID,
    payload: ProjectDescriptionUpdateRequest,
    current_user: User = Depends(require_web_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    response = update_project_description_summary(
        db,
        description=payload.description,
        project_id=project_id,
        user=current_user,
    )
    _commit_or_conflict(db, detail="Project description could not be updated.")
    return response


@router.patch("/{project_id}/metadata", response_model=ProjectSummaryResponse)
def update_project_metadata(
    project_id: UUID,
    payload: ProjectMetadataUpdateRequest,
    current_user: User = Depends(require_web_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    response = update_project_metadata_summary(
        db,
        project_id=project_id,
        slug=payload.slug,
        tags=payload.tags,
        user=current_user,
        visibility=payload.visibility,
    )
    _commit_or_conflict(db, detail="Project metadata could not be updated.")
    return response


@router.patch("/{project_id}/bookmark", response_model=ProjectSummaryResponse)
def update_project_bookmark(
    project_id: UUID,
    payload: ProjectBookmarkUpdateRequest,
    current_user: User = Depends(require_web_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    response = update_project_bookmark_summary(
        db,
        is_bookmarked=payload.is_bookmarked,
        project_id=project_id,
        user=current_user,
    )
    _commit_or_conflict(db, detail="Project bookmark could not be updated.")
    return response


@router.get("/{project_id}/github/files")
def read_project_github_files(
    project_id: UUID,
    current_user: User = Depends(require_web_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    project = _project_for_user(db, project_id, current_user, allow_admin=True)
    return read_github_repository_tree(db, project=project, user=current_user)


@router.get("/{project_id}/github/files/content")
def read_project_github_file_content(
    project_id: UUID,
    path: str = Query(..., min_length=1, max_length=2048),
    current_user: User = Depends(require_web_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    project = _project_for_user(db, project_id, current_user, allow_admin=True)
    return read_github_repository_file_content(
        db,
        path=path,
        project=project,
        user=current_user,
    )
