from __future__ import annotations

import asyncio
from typing import Any

from app.core.config import settings


def _admin_methods() -> set[str]:
    from app.main import app

    return {
        method.upper()
        for path, operations in app.openapi()["paths"].items()
        if path.startswith("/api/admin")
        for method in operations
    }


def _preflight(method: str) -> list[dict[str, Any]]:
    from app.main import app

    sent: list[dict[str, Any]] = []
    origin = settings.cors_origins[0]
    headers = [
        (b"origin", origin.encode("ascii")),
        (b"access-control-request-method", method.encode("ascii")),
        (b"access-control-request-headers", b"authorization,content-type"),
    ]
    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "OPTIONS",
        "scheme": "https",
        "path": "/api/admin/overview",
        "raw_path": b"/api/admin/overview",
        "query_string": b"",
        "headers": headers,
        "client": ("127.0.0.1", 1234),
        "server": ("testserver", 443),
    }

    async def receive() -> dict[str, Any]:
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message: dict[str, Any]) -> None:
        sent.append(message)

    asyncio.run(app(scope, receive, send))
    return sent


def test_cors_allows_every_admin_route_method() -> None:
    for method in _admin_methods():
        response = _preflight(method)
        response_start = response[0]
        headers = dict(response_start["headers"])

        assert response_start["status"] == 200, method
        assert method in headers[b"access-control-allow-methods"].decode("ascii").split(", ")
        assert headers[b"access-control-allow-origin"].decode("ascii") == settings.cors_origins[0]
