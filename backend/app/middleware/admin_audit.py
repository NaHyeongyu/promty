from __future__ import annotations

import logging
from typing import Callable

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.services.admin.audit import is_admin_audit_candidate, record_admin_request

logger = logging.getLogger(__name__)


class AdminAuditMiddleware:
    def __init__(
        self,
        app: ASGIApp,
        *,
        recorder: Callable[[Scope, int], None] = record_admin_request,
    ) -> None:
        self.app = app
        self.recorder = recorder

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if not is_admin_audit_candidate(scope):
            await self.app(scope, receive, send)
            return

        status_code: int | None = None

        async def capture_status(message: Message) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = int(message["status"])
            await send(message)

        await self.app(scope, receive, capture_status)
        if status_code is None:
            return
        try:
            self.recorder(scope, status_code)
        except Exception:
            logger.exception("Administrator request audit recorder failed")
