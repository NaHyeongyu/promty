from __future__ import annotations

import asyncio
import json
from typing import Any

from app.middleware.security_rate_limit import (
    SecurityRateLimitMiddleware,
    SlidingWindowRateLimiter,
)


def _scope(path: str, *, forwarded_for: str = "203.0.113.10") -> dict[str, Any]:
    return {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "GET",
        "scheme": "https",
        "path": path,
        "raw_path": path.encode("ascii"),
        "query_string": b"",
        "headers": [(b"x-forwarded-for", forwarded_for.encode("ascii"))],
        "client": ("127.0.0.1", 1234),
        "server": ("testserver", 443),
    }


def _request(middleware: SecurityRateLimitMiddleware, scope: dict[str, Any]) -> list[dict]:
    sent: list[dict] = []

    async def receive() -> dict[str, Any]:
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message: dict[str, Any]) -> None:
        sent.append(message)

    asyncio.run(middleware(scope, receive, send))
    return sent


def _middleware() -> SecurityRateLimitMiddleware:
    async def app(_scope, _receive, send) -> None:
        await send({"type": "http.response.start", "status": 204, "headers": []})
        await send({"type": "http.response.body", "body": b""})

    return SecurityRateLimitMiddleware(
        app,
        admin_requests=2,
        admin_window_seconds=60,
        auth_requests=2,
        auth_window_seconds=60,
        community_requests=2,
        community_window_seconds=60,
        support_requests=2,
        support_window_seconds=60,
    )


def test_admin_rate_limit_rejects_requests_after_the_configured_limit() -> None:
    middleware = _middleware()

    assert _request(middleware, _scope("/api/admin/overview"))[0]["status"] == 204
    assert _request(middleware, _scope("/api/admin/overview"))[0]["status"] == 204
    rejected = _request(middleware, _scope("/api/admin/overview"))

    assert rejected[0]["status"] == 429
    assert json.loads(rejected[1]["body"]) == {"detail": "Too many requests. Try again later."}
    assert (b"retry-after", b"60") in rejected[0]["headers"]


def test_rate_limit_is_scoped_by_forwarded_client_address() -> None:
    middleware = _middleware()
    path = "/api/auth/github/web/start"

    _request(middleware, _scope(path, forwarded_for="203.0.113.10"))
    _request(middleware, _scope(path, forwarded_for="203.0.113.10"))

    assert _request(middleware, _scope(path, forwarded_for="203.0.113.11"))[0]["status"] == 204


def test_rate_limit_does_not_apply_to_regular_project_requests() -> None:
    middleware = _middleware()

    for _ in range(5):
        assert _request(middleware, _scope("/api/projects"))[0]["status"] == 204


def test_community_rate_limit_covers_flows_and_public_explore() -> None:
    for path in ("/api/published-flows", "/api/projects/public"):
        middleware = _middleware()
        assert _request(middleware, _scope(path))[0]["status"] == 204
        assert _request(middleware, _scope(path))[0]["status"] == 204
        assert _request(middleware, _scope(path))[0]["status"] == 429


def test_support_rate_limit_is_separate_and_stricter_ready() -> None:
    middleware = _middleware()
    path = "/api/support/inquiries"

    assert _request(middleware, _scope(path))[0]["status"] == 204
    assert _request(middleware, _scope(path))[0]["status"] == 204
    assert _request(middleware, _scope(path))[0]["status"] == 429


def test_sliding_window_allows_requests_after_the_window_expires() -> None:
    limiter = SlidingWindowRateLimiter()

    assert limiter.retry_after("auth:test", limit=1, now=10.0, window_seconds=5) is None
    assert limiter.retry_after("auth:test", limit=1, now=12.0, window_seconds=5) == 3
    assert limiter.retry_after("auth:test", limit=1, now=15.1, window_seconds=5) is None


def test_main_wires_security_rate_limit_middleware() -> None:
    from app.core.config import settings
    from app.main import app

    middleware = next(
        item for item in app.user_middleware if item.cls is SecurityRateLimitMiddleware
    )

    assert middleware.kwargs["admin_requests"] == settings.admin_rate_limit_requests
    assert middleware.kwargs["auth_requests"] == settings.auth_rate_limit_requests
    assert middleware.kwargs["community_requests"] == settings.community_rate_limit_requests
    assert middleware.kwargs["support_requests"] == settings.support_rate_limit_requests
