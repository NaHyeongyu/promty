from __future__ import annotations

import json
from typing import Any

from fastapi import HTTPException, status
from urllib3 import PoolManager
from urllib3.exceptions import HTTPError as Urllib3HTTPError
from urllib3.util import Retry, Timeout

GITHUB_API_URL = "https://api.github.com"
_GITHUB_HTTP = PoolManager(
    maxsize=10,
    num_pools=4,
    timeout=Timeout(connect=3.0, read=10.0),
    retries=Retry(
        connect=0,
        read=0,
        redirect=3,
        status=0,
        other=0,
    ),
)


def _github_http_error(status_code: int) -> HTTPException:
    detail = "GitHub repository request failed"
    if status_code == 401:
        detail = "GitHub repository access token is invalid"
    elif status_code == 403:
        detail = "GitHub repository access is forbidden"
    elif status_code == 404:
        detail = "GitHub repository was not found or is not accessible"
    return HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail=f"{detail}: HTTP {status_code}",
    )


def github_request_json(path: str, *, token: str) -> Any:
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {token}",
        "User-Agent": "Promty",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    try:
        response = _GITHUB_HTTP.request(
            "GET",
            f"{GITHUB_API_URL}{path}",
            headers=headers,
        )
        if response.status >= 400:
            raise _github_http_error(response.status)
        payload = json.loads(response.data.decode("utf-8"))
    except HTTPException:
        raise
    except (Urllib3HTTPError, UnicodeDecodeError, json.JSONDecodeError) as exc:
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
