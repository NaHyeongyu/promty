from __future__ import annotations

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.text_limits import PROJECT_MEMORY_UPDATE_REQUEST_MAX_BYTES

EVENT_BATCH_PATH = "/api/events/batch"


class _RequestBodyTooLarge(Exception):
    pass


class EventBatchBodyLimitMiddleware:
    """Limit event batch bodies before FastAPI parses and validates their JSON."""

    def __init__(
        self,
        app: ASGIApp,
        *,
        max_body_bytes: int,
        path: str = EVENT_BATCH_PATH,
    ) -> None:
        if max_body_bytes < 1:
            raise ValueError("max_body_bytes must be positive")
        self.app = app
        self.max_body_bytes = max_body_bytes
        self.path = path

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if not self._applies_to(scope):
            await self.app(scope, receive, send)
            return

        content_length = self._content_length(scope)
        if content_length is not None and content_length > self.max_body_bytes:
            await self._send_too_large(scope, receive, send)
            return

        received_bytes = 0

        async def limited_receive() -> Message:
            nonlocal received_bytes
            message = await receive()
            if message["type"] == "http.request":
                received_bytes += len(message.get("body", b""))
                if received_bytes > self.max_body_bytes:
                    raise _RequestBodyTooLarge
            return message

        try:
            await self.app(scope, limited_receive, send)
        except _RequestBodyTooLarge:
            await self._send_too_large(scope, receive, send)

    def _applies_to(self, scope: Scope) -> bool:
        return (
            scope["type"] == "http"
            and scope.get("method") == "POST"
            and scope.get("path") == self.path
        )

    @staticmethod
    def _content_length(scope: Scope) -> int | None:
        for name, value in scope.get("headers", []):
            if name.lower() != b"content-length":
                continue
            try:
                parsed = int(value)
            except (TypeError, ValueError):
                return None
            return parsed if parsed >= 0 else None
        return None

    @staticmethod
    async def _send_too_large(scope: Scope, receive: Receive, send: Send) -> None:
        response = JSONResponse(
            status_code=413,
            content={"detail": "Event batch request body too large"},
        )
        await response(scope, receive, send)


class ProjectMemoryBodyLimitMiddleware(EventBatchBodyLimitMiddleware):
    """Reject oversized Project Memory edits before JSON parsing and validation."""

    def __init__(
        self,
        app: ASGIApp,
        *,
        max_body_bytes: int = PROJECT_MEMORY_UPDATE_REQUEST_MAX_BYTES,
    ) -> None:
        super().__init__(app, max_body_bytes=max_body_bytes, path="")

    def _applies_to(self, scope: Scope) -> bool:
        parts = scope.get("path", "").split("/")
        return (
            scope["type"] == "http"
            and scope.get("method") == "PATCH"
            and len(parts) == 6
            and parts[1:3] == ["api", "projects"]
            and parts[4:] == ["memory", "project"]
        )

    @staticmethod
    async def _send_too_large(scope: Scope, receive: Receive, send: Send) -> None:
        response = JSONResponse(
            status_code=413,
            content={"detail": "Project Memory request body too large"},
        )
        await response(scope, receive, send)
