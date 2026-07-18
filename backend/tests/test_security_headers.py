from __future__ import annotations

import asyncio
from typing import Any

from app.middleware.security_headers import (
    API_SECURITY_HEADERS,
    APISecurityHeadersMiddleware,
)


def _scope(path: str) -> dict[str, Any]:
    return {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "GET",
        "scheme": "https",
        "path": path,
        "raw_path": path.encode("ascii"),
        "query_string": b"",
        "headers": [],
        "client": ("127.0.0.1", 1234),
        "server": ("testserver", 443),
    }


def _request(path: str, *, existing_cache_control: str | None = None) -> list[dict]:
    sent: list[dict] = []

    async def receive() -> dict[str, Any]:
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message: dict[str, Any]) -> None:
        sent.append(message)

    async def app(_scope, _receive, app_send) -> None:
        headers = []
        if existing_cache_control:
            headers.append((b"cache-control", existing_cache_control.encode("ascii")))
        await app_send({"type": "http.response.start", "status": 200, "headers": headers})
        await app_send({"type": "http.response.body", "body": b"{}"})

    asyncio.run(APISecurityHeadersMiddleware(app)(_scope(path), receive, send))
    return sent


def test_api_responses_receive_defense_in_depth_headers() -> None:
    response = _request("/api/projects")
    headers = dict(response[0]["headers"])

    for name, value in API_SECURITY_HEADERS.items():
        assert headers[name.lower().encode("ascii")] == value.encode("ascii")


def test_non_api_responses_are_not_modified() -> None:
    response = _request("/health")

    assert response[0]["headers"] == []


def test_explicit_route_cache_policy_is_preserved() -> None:
    response = _request(
        "/api/published-flows/flow/assets/asset",
        existing_cache_control="public, max-age=3600",
    )
    headers = dict(response[0]["headers"])

    assert headers[b"cache-control"] == b"public, max-age=3600"


def test_main_wires_api_security_headers_middleware() -> None:
    from app.main import app

    assert any(item.cls is APISecurityHeadersMiddleware for item in app.user_middleware)
