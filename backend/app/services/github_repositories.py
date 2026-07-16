from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any
from urllib import parse
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session as DBSession

from app.core.encryption import decrypt_github_token_with_rotation, encrypt_github_token
from app.models.github_connections import GitHubConnection
from app.models.projects import Project
from app.models.users import User
from app.services.github_repository_client import (
    github_list_request,
    github_request,
)
from app.services.github_repository_mappers import (
    MAX_CODE_VIEW_BYTES,
    build_file_tree,
    clean_repository_path,
    decode_github_content,
    parse_github_repository,
    repository_option,
    repository_url,
)

logger = logging.getLogger(__name__)


def _connection_for_user(db: DBSession, user: User) -> GitHubConnection | None:
    return db.scalar(
        select(GitHubConnection).where(
            GitHubConnection.user_id == user.id,
            GitHubConnection.revoked_at.is_(None),
        )
    )


def _github_token_snapshot(db: DBSession, *, user: User) -> str | None:
    """Copy the credential and release the read transaction before network I/O."""

    connection = _connection_for_user(db, user)
    if connection is None:
        return None

    token, needs_rotation = decrypt_github_token_with_rotation(connection.access_token_encrypted)
    if needs_rotation:
        connection.access_token_encrypted = encrypt_github_token(token)
        db.commit()
    else:
        db.rollback()
    return token


def _is_github_not_found(exc: HTTPException) -> bool:
    return exc.status_code == status.HTTP_404_NOT_FOUND or (
        exc.status_code == status.HTTP_502_BAD_GATEWAY and "HTTP 404" in str(exc.detail)
    )


def _persist_refreshed_default_branch(
    db: DBSession,
    *,
    expected_branch: str,
    project_id: UUID | None,
    refreshed_branch: str,
) -> None:
    if project_id is None:
        return

    try:
        db.execute(
            update(Project)
            .where(
                Project.id == project_id,
                Project.default_branch == expected_branch,
            )
            .values(default_branch=refreshed_branch)
        )
        db.commit()
    except Exception:
        db.rollback()
        logger.exception(
            "Could not persist refreshed GitHub default branch for project %s",
            project_id,
        )


def _github_request_with_branch_refresh(
    db: DBSession,
    *,
    branch: str,
    expected_branch: str,
    owner: str,
    project_id: UUID | None,
    repo: str,
    request_path: Callable[[str], str],
    token: str,
) -> tuple[dict[str, Any], str]:
    try:
        return github_request(request_path(branch), token=token), branch
    except HTTPException as exc:
        if not _is_github_not_found(exc):
            raise

        repository = github_request(f"/repos/{owner}/{repo}", token=token)
        default_branch = repository.get("default_branch")
        refreshed_branch = default_branch.strip() if isinstance(default_branch, str) else ""
        if not refreshed_branch or refreshed_branch == branch:
            raise

        payload = github_request(request_path(refreshed_branch), token=token)
        _persist_refreshed_default_branch(
            db,
            expected_branch=expected_branch,
            project_id=project_id,
            refreshed_branch=refreshed_branch,
        )
        return payload, refreshed_branch


def list_github_repositories(
    db: DBSession,
    *,
    user: User,
    query: str | None = None,
) -> dict[str, Any]:
    token = _github_token_snapshot(db, user=user)
    if token is None:
        return {
            "available": False,
            "message": "Sign in again with GitHub repository access to choose repositories.",
            "repositories": [],
            "status": "github_repository_access_required",
        }

    try:
        repositories = github_list_request(
            "/user/repos?type=all&sort=updated&per_page=100",
            token=token,
        )
    except HTTPException as exc:
        detail = str(exc.detail)
        if "invalid" in detail or "forbidden" in detail:
            return {
                "available": False,
                "message": "Sign in again with GitHub repository access to choose repositories.",
                "repositories": [],
                "status": "github_repository_access_required",
            }
        raise
    options = [repository_option(repository) for repository in repositories]
    search = query.strip().lower() if query else ""
    if search:
        options = [
            option
            for option in options
            if search in option["full_name"].lower()
            or search in option["name"].lower()
            or (option["description"] and search in option["description"].lower())
        ]

    return {
        "available": True,
        "message": None,
        "repositories": options,
        "status": "ok",
    }


def repository_metadata_from_url(
    db: DBSession,
    *,
    remote_url: str,
    user: User,
) -> dict[str, Any]:
    parsed = parse_github_repository(remote_url)
    if parsed is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Enter a valid GitHub repository URL, for example https://github.com/owner/repo.",
        )

    owner, repo = parsed
    token = _github_token_snapshot(db, user=user)
    if token is None:
        return {
            "default_branch": "main",
            "description": None,
            "full_name": f"{owner}/{repo}",
            "html_url": repository_url(owner, repo),
            "name": repo,
            "owner": owner,
            "private": None,
        }

    repository = github_request(f"/repos/{owner}/{repo}", token=token)
    metadata = repository_option(repository)
    return {
        "default_branch": metadata["default_branch"],
        "description": metadata["description"],
        "full_name": metadata["full_name"],
        "html_url": metadata["html_url"],
        "name": metadata["name"],
        "owner": metadata["owner"],
        "private": metadata["private"],
    }


def _repository_branch(*, default_branch: str) -> str:
    branch = default_branch.strip()
    return branch if branch else "main"


def read_github_repository_tree(
    db: DBSession,
    *,
    project: Project,
    user: User,
) -> dict[str, Any]:
    project_id = project.id
    remote_url = project.git_remote
    expected_branch = project.default_branch
    branch = _repository_branch(default_branch=expected_branch)
    parsed = parse_github_repository(remote_url)
    if parsed is None:
        return {
            "available": False,
            "files": [],
            "message": "This project does not have a GitHub repository remote.",
            "repository": None,
            "status": "repository_not_connected",
        }

    token = _github_token_snapshot(db, user=user)
    if token is None:
        return {
            "available": False,
            "files": [],
            "message": "Sign in again with GitHub repository access to browse repository files.",
            "repository": f"{parsed[0]}/{parsed[1]}",
            "status": "github_repository_access_required",
        }

    owner, repo = parsed
    tree_payload, branch = _github_request_with_branch_refresh(
        db,
        branch=branch,
        expected_branch=expected_branch,
        owner=owner,
        project_id=project_id,
        repo=repo,
        request_path=lambda value: (
            f"/repos/{owner}/{repo}/git/trees/{parse.quote(value, safe='')}?recursive=1"
        ),
        token=token,
    )
    tree = tree_payload.get("tree")
    if not isinstance(tree, list):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="GitHub repository tree response was invalid",
        )

    return {
        "available": True,
        "default_branch": branch,
        "files": build_file_tree([item for item in tree if isinstance(item, dict)]),
        "message": None,
        "repository": f"{owner}/{repo}",
        "status": "ok",
        "truncated": tree_payload.get("truncated") is True,
    }


def read_github_repository_file_content(
    db: DBSession,
    *,
    path: str,
    project: Project,
    user: User,
) -> dict[str, Any]:
    project_id = project.id
    remote_url = project.git_remote
    expected_branch = project.default_branch
    branch = _repository_branch(default_branch=expected_branch)
    parsed = parse_github_repository(remote_url)
    if parsed is None:
        return {
            "available": False,
            "content": None,
            "message": "This project does not have a GitHub repository remote.",
            "status": "repository_not_connected",
        }

    token = _github_token_snapshot(db, user=user)
    if token is None:
        return {
            "available": False,
            "content": None,
            "message": "Sign in again with GitHub repository access to preview files.",
            "repository": f"{parsed[0]}/{parsed[1]}",
            "status": "github_repository_access_required",
        }

    owner, repo = parsed
    cleaned_path = clean_repository_path(path)
    encoded_path = parse.quote(cleaned_path, safe="/")
    payload, branch = _github_request_with_branch_refresh(
        db,
        branch=branch,
        expected_branch=expected_branch,
        owner=owner,
        project_id=project_id,
        repo=repo,
        request_path=lambda value: (
            f"/repos/{owner}/{repo}/contents/{encoded_path}?ref={parse.quote(value, safe='')}"
        ),
        token=token,
    )
    if payload.get("type") != "file":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only files can be previewed",
        )
    size = payload.get("size")
    if isinstance(size, int) and size > MAX_CODE_VIEW_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File is too large to preview",
        )

    html_url = payload.get("html_url")
    name = payload.get("name")
    return {
        "available": True,
        "branch": branch,
        "content": decode_github_content(payload),
        "html_url": html_url if isinstance(html_url, str) else None,
        "message": None,
        "name": name if isinstance(name, str) else cleaned_path.rsplit("/", 1)[-1],
        "path": cleaned_path,
        "repository": f"{owner}/{repo}",
        "size": size if isinstance(size, int) else None,
        "status": "ok",
    }
