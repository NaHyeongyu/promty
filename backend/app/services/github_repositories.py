from __future__ import annotations

import base64
import json
import re
from typing import Any
from urllib import error, parse, request

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session as DBSession

from app.core.encryption import decrypt_github_token
from app.models.github_connections import GitHubConnection
from app.models.projects import Project
from app.models.users import User

GITHUB_API_URL = "https://api.github.com"
MAX_CODE_VIEW_BYTES = 512 * 1024


def parse_github_repository(remote_url: str | None) -> tuple[str, str] | None:
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
            return match.group("owner"), match.group("repo")
    return None


def _github_request_json(path: str, *, token: str) -> Any:
    req = request.Request(
        f"{GITHUB_API_URL}{path}",
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "User-Agent": "BuildHub",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    try:
        with request.urlopen(req, timeout=10) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        detail = "GitHub repository request failed"
        if exc.code == 401:
            detail = "GitHub repository access token is invalid"
        elif exc.code == 403:
            detail = "GitHub repository access is forbidden"
        elif exc.code == 404:
            detail = "GitHub repository was not found or is not accessible"
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"{detail}: HTTP {exc.code}",
        ) from exc
    except (error.URLError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="GitHub repository request failed",
        ) from exc

    return payload


def _github_request(path: str, *, token: str) -> dict[str, Any]:
    payload = _github_request_json(path, token=token)
    if not isinstance(payload, dict):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="GitHub repository response was invalid",
        )
    return payload


def _github_list_request(path: str, *, token: str) -> list[dict[str, Any]]:
    payload = _github_request_json(path, token=token)
    if not isinstance(payload, list):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="GitHub repository list response was invalid",
        )
    return [item for item in payload if isinstance(item, dict)]


def _repository_url(owner: str, repo: str) -> str:
    return f"https://github.com/{owner}/{repo}"


def _repository_option(payload: dict[str, Any]) -> dict[str, Any]:
    owner_payload = payload.get("owner")
    owner_login = (
        owner_payload.get("login")
        if isinstance(owner_payload, dict) and isinstance(owner_payload.get("login"), str)
        else None
    )
    full_name = payload.get("full_name")
    name = payload.get("name")
    html_url = payload.get("html_url")
    default_branch = payload.get("default_branch")
    description = payload.get("description")
    updated_at = payload.get("updated_at")

    if not isinstance(full_name, str) or "/" not in full_name:
        owner = owner_login if owner_login else ""
        repo = name if isinstance(name, str) else ""
        full_name = f"{owner}/{repo}".strip("/")

    owner, _, repo_name = full_name.partition("/")
    return {
        "id": payload.get("id"),
        "default_branch": default_branch if isinstance(default_branch, str) else "main",
        "description": description if isinstance(description, str) else None,
        "full_name": full_name,
        "html_url": html_url if isinstance(html_url, str) else _repository_url(owner, repo_name),
        "name": name if isinstance(name, str) else repo_name,
        "owner": owner_login if owner_login else owner,
        "private": payload.get("private") is True,
        "updated_at": updated_at if isinstance(updated_at, str) else None,
    }


def _build_file_tree(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    root: dict[str, dict[str, Any]] = {}

    def folder_at(parts: list[str]) -> dict[str, dict[str, Any]]:
        current = root
        for index, part in enumerate(parts):
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
        return current

    for item in items:
        path = item.get("path")
        item_type = item.get("type")
        if not isinstance(path, str) or not path:
            continue
        parts = [part for part in path.split("/") if part]
        if not parts:
            continue
        if item_type == "tree":
            folder_at(parts)
            continue
        if item_type != "blob":
            continue
        parent = folder_at(parts[:-1])
        parent[parts[-1]] = {"name": parts[-1], "path": path, "type": "file"}

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


def _clean_repository_path(path: str) -> str:
    cleaned = path.strip().replace("\\", "/")
    parts = [part for part in cleaned.split("/") if part]
    if not parts or cleaned.startswith("/") or any(part in {".", ".."} for part in parts):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid repository file path",
        )
    return "/".join(parts)


def _decode_github_content(payload: dict[str, Any]) -> str:
    encoding = payload.get("encoding")
    content = payload.get("content")
    if encoding != "base64" or not isinstance(content, str):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="GitHub file content is not available as base64 text",
        )

    try:
        raw = base64.b64decode(content, validate=False)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="GitHub file content could not be decoded",
        ) from exc

    if b"\0" in raw:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Binary files cannot be previewed",
        )
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only UTF-8 text files can be previewed",
        ) from exc


def _connection_for_user(db: DBSession, user: User) -> GitHubConnection | None:
    return db.scalar(
        select(GitHubConnection).where(
            GitHubConnection.user_id == user.id,
            GitHubConnection.revoked_at.is_(None),
        )
    )


def list_github_repositories(
    db: DBSession,
    *,
    user: User,
    query: str | None = None,
) -> dict[str, Any]:
    connection = _connection_for_user(db, user)
    if connection is None:
        return {
            "available": False,
            "message": "Sign in again with GitHub repository access to choose repositories.",
            "repositories": [],
            "status": "github_repository_access_required",
        }

    token = decrypt_github_token(connection.access_token_encrypted)
    try:
        repositories = _github_list_request(
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
    options = [_repository_option(repository) for repository in repositories]
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
    connection = _connection_for_user(db, user)
    if connection is None:
        return {
            "default_branch": "main",
            "description": None,
            "full_name": f"{owner}/{repo}",
            "html_url": _repository_url(owner, repo),
            "name": repo,
            "owner": owner,
            "private": None,
        }

    token = decrypt_github_token(connection.access_token_encrypted)
    repository = _github_request(f"/repos/{owner}/{repo}", token=token)
    metadata = _repository_option(repository)
    return {
        "default_branch": metadata["default_branch"],
        "description": metadata["description"],
        "full_name": metadata["full_name"],
        "html_url": metadata["html_url"],
        "name": metadata["name"],
        "owner": metadata["owner"],
        "private": metadata["private"],
    }


def read_github_repository_tree(db: DBSession, *, project: Project, user: User) -> dict[str, Any]:
    parsed = parse_github_repository(project.git_remote)
    if parsed is None:
        return {
            "available": False,
            "files": [],
            "message": "This project does not have a GitHub repository remote.",
            "repository": None,
            "status": "repository_not_connected",
        }

    connection = _connection_for_user(db, user)
    if connection is None:
        return {
            "available": False,
            "files": [],
            "message": "Sign in again with GitHub repository access to browse repository files.",
            "repository": f"{parsed[0]}/{parsed[1]}",
            "status": "github_repository_access_required",
        }

    token = decrypt_github_token(connection.access_token_encrypted)
    owner, repo = parsed
    repository = _github_request(f"/repos/{owner}/{repo}", token=token)
    default_branch = repository.get("default_branch")
    branch = default_branch if isinstance(default_branch, str) and default_branch else project.default_branch
    tree_payload = _github_request(
        f"/repos/{owner}/{repo}/git/trees/{branch}?recursive=1",
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
        "files": _build_file_tree([item for item in tree if isinstance(item, dict)]),
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
    parsed = parse_github_repository(project.git_remote)
    if parsed is None:
        return {
            "available": False,
            "content": None,
            "message": "This project does not have a GitHub repository remote.",
            "status": "repository_not_connected",
        }

    connection = _connection_for_user(db, user)
    if connection is None:
        return {
            "available": False,
            "content": None,
            "message": "Sign in again with GitHub repository access to preview files.",
            "repository": f"{parsed[0]}/{parsed[1]}",
            "status": "github_repository_access_required",
        }

    owner, repo = parsed
    cleaned_path = _clean_repository_path(path)
    token = decrypt_github_token(connection.access_token_encrypted)
    repository = _github_request(f"/repos/{owner}/{repo}", token=token)
    default_branch = repository.get("default_branch")
    branch = default_branch if isinstance(default_branch, str) and default_branch else project.default_branch
    encoded_path = parse.quote(cleaned_path, safe="/")
    payload = _github_request(
        f"/repos/{owner}/{repo}/contents/{encoded_path}?ref={parse.quote(branch, safe='')}",
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
        "content": _decode_github_content(payload),
        "html_url": html_url if isinstance(html_url, str) else None,
        "message": None,
        "name": name if isinstance(name, str) else cleaned_path.rsplit("/", 1)[-1],
        "path": cleaned_path,
        "repository": f"{owner}/{repo}",
        "size": size if isinstance(size, int) else None,
        "status": "ok",
    }
