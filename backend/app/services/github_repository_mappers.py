from __future__ import annotations

import base64
import re
from typing import Any

from fastapi import HTTPException, status

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


def repository_url(owner: str, repo: str) -> str:
    return f"https://github.com/{owner}/{repo}"


def repository_option(payload: dict[str, Any]) -> dict[str, Any]:
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
        "html_url": html_url if isinstance(html_url, str) else repository_url(owner, repo_name),
        "name": name if isinstance(name, str) else repo_name,
        "owner": owner_login if owner_login else owner,
        "private": payload.get("private") is True,
        "updated_at": updated_at if isinstance(updated_at, str) else None,
    }


def build_file_tree(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
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
            if node.get("type") != "folder":
                node["type"] = "folder"
                node["children"] = {}
            if not isinstance(node.get("children"), dict):
                node["children"] = {}
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


def clean_repository_path(path: str) -> str:
    cleaned = path.strip().replace("\\", "/")
    parts = [part for part in cleaned.split("/") if part]
    if not parts or cleaned.startswith("/") or any(part in {".", ".."} for part in parts):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid repository file path",
        )
    return "/".join(parts)


def decode_github_content(payload: dict[str, Any]) -> str:
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
