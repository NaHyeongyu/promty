from __future__ import annotations

import json
from typing import Any
from urllib import error, request

from fastapi import HTTPException, status

GITHUB_API_URL = "https://api.github.com"


def github_request_json(path: str, *, token: str) -> Any:
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


def github_request(path: str, *, token: str) -> dict[str, Any]:
    payload = github_request_json(path, token=token)
    if not isinstance(payload, dict):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="GitHub repository response was invalid",
        )
    return payload


def github_list_request(path: str, *, token: str) -> list[dict[str, Any]]:
    payload = github_request_json(path, token=token)
    if not isinstance(payload, list):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="GitHub repository list response was invalid",
        )
    return [item for item in payload if isinstance(item, dict)]
