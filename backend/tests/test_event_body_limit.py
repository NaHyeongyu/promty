from __future__ import annotations

import asyncio
import json
from collections.abc import Sequence
from typing import Any

import pytest

from app.middleware.request_body_limit import (
    EventBatchBodyLimitMiddleware,
    ProjectMemoryBodyLimitMiddleware,
)


def _scope(
    *,
    content_length: int | None = None,
    method: str = "POST",
    path: str = "/api/events/batch",
) -> dict[str, Any]:
    headers = []
    if content_length is not None:
        headers.append((b"content-length", str(content_length).encode("ascii")))
    return {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": method,
        "scheme": "http",
        "path": path,
        "raw_path": path.encode("ascii"),
        "query_string": b"",
        "headers": headers,
        "client": ("127.0.0.1", 1234),
        "server": ("testserver", 80),
    }


def _run_request(
    chunks: Sequence[bytes],
    *,
    content_length: int | None = None,
    max_body_bytes: int = 8,
    method: str = "POST",
    middleware_cls=EventBatchBodyLimitMiddleware,
    path: str = "/api/events/batch",
) -> tuple[list[dict[str, Any]], bool, bytes]:
    messages = [
        {
            "type": "http.request",
            "body": chunk,
            "more_body": index < len(chunks) - 1,
        }
        for index, chunk in enumerate(chunks)
    ]
    if not messages:
        messages.append({"type": "http.request", "body": b"", "more_body": False})

    sent: list[dict[str, Any]] = []
    app_called = False
    received_body = b""

    async def receive() -> dict[str, Any]:
        if messages:
            return messages.pop(0)
        return {"type": "http.disconnect"}

    async def send(message: dict[str, Any]) -> None:
        sent.append(message)

    async def app(scope, receive, send) -> None:
        nonlocal app_called, received_body
        app_called = True
        while True:
            message = await receive()
            if message["type"] != "http.request":
                break
            received_body += message.get("body", b"")
            if not message.get("more_body", False):
                break
        await send({"type": "http.response.start", "status": 204, "headers": []})
        await send({"type": "http.response.body", "body": b""})

    middleware = middleware_cls(app, max_body_bytes=max_body_bytes)
    asyncio.run(
        middleware(
            _scope(content_length=content_length, method=method, path=path),
            receive,
            send,
        )
    )
    return sent, app_called, received_body


def test_event_batch_body_at_limit_is_accepted() -> None:
    sent, app_called, received_body = _run_request(
        [b"1234", b"5678"],
        content_length=8,
    )

    assert app_called is True
    assert received_body == b"12345678"
    assert sent[0]["status"] == 204


def test_event_batch_content_length_over_limit_is_rejected_before_app() -> None:
    sent, app_called, received_body = _run_request(
        [b"ignored"],
        content_length=9,
    )

    assert app_called is False
    assert received_body == b""
    assert sent[0]["status"] == 413
    assert json.loads(sent[1]["body"]) == {"detail": "Event batch request body too large"}


def test_chunked_event_batch_over_limit_is_rejected_while_streaming() -> None:
    sent, app_called, received_body = _run_request(
        [b"1234", b"5678", b"9"],
        content_length=None,
    )

    assert app_called is True
    assert received_body == b"12345678"
    assert sent[0]["status"] == 413


def test_event_batch_does_not_trust_a_smaller_content_length() -> None:
    sent, _, _ = _run_request(
        [b"12345678", b"9"],
        content_length=1,
    )

    assert sent[0]["status"] == 413


def test_body_limit_does_not_apply_to_other_routes() -> None:
    sent, app_called, received_body = _run_request(
        [b"123456789"],
        content_length=9,
        path="/api/projects",
    )

    assert app_called is True
    assert received_body == b"123456789"
    assert sent[0]["status"] == 204


def test_body_limit_requires_a_positive_limit() -> None:
    with pytest.raises(ValueError, match="must be positive"):
        EventBatchBodyLimitMiddleware(lambda *_: None, max_body_bytes=0)


def test_main_wires_the_configured_event_batch_limit() -> None:
    from app.core.config import settings
    from app.main import app

    middleware = next(
        item for item in app.user_middleware if item.cls is EventBatchBodyLimitMiddleware
    )

    assert middleware.kwargs["max_body_bytes"] == settings.event_batch_max_body_bytes


def test_project_memory_body_limit_rejects_before_app() -> None:
    sent, app_called, received_body = _run_request(
        [b"ignored"],
        content_length=9,
        max_body_bytes=8,
        method="PATCH",
        middleware_cls=ProjectMemoryBodyLimitMiddleware,
        path="/api/projects/00000000-0000-0000-0000-000000000001/memory/project",
    )

    assert app_called is False
    assert received_body == b""
    assert sent[0]["status"] == 413
    assert json.loads(sent[1]["body"]) == {"detail": "Project Memory request body too large"}


def test_project_memory_body_limit_does_not_apply_to_other_patch_routes() -> None:
    sent, app_called, received_body = _run_request(
        [b"123456789"],
        content_length=9,
        max_body_bytes=8,
        method="PATCH",
        middleware_cls=ProjectMemoryBodyLimitMiddleware,
        path="/api/projects/project-1/description",
    )

    assert app_called is True
    assert received_body == b"123456789"
    assert sent[0]["status"] == 204


def test_main_wires_the_project_memory_request_limit() -> None:
    from app.core.text_limits import PROJECT_MEMORY_UPDATE_REQUEST_MAX_BYTES
    from app.main import app

    middleware = next(
        item for item in app.user_middleware if item.cls is ProjectMemoryBodyLimitMiddleware
    )

    assert middleware.kwargs["max_body_bytes"] == PROJECT_MEMORY_UPDATE_REQUEST_MAX_BYTES
