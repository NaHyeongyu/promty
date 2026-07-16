from __future__ import annotations

import asyncio
from dataclasses import replace
from typing import Any
from uuid import uuid4

from app.core import security
from app.middleware.admin_audit import AdminAuditMiddleware
from app.models.users import User
from app.services.admin.audit import is_admin_audit_candidate, project_id_from_path
from app.api.admin import _set_audit_action
from starlette.requests import Request


def _scope(path: str, *, method: str = "GET") -> dict[str, Any]:
    return {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": method,
        "scheme": "https",
        "path": path,
        "raw_path": path.encode("ascii"),
        "query_string": b"",
        "headers": [],
        "client": ("127.0.0.1", 1234),
        "server": ("testserver", 443),
    }


def test_admin_access_matches_only_configured_github_id(monkeypatch) -> None:
    monkeypatch.setattr(
        security,
        "settings",
        replace(security.settings, admin_github_ids=("191438254",)),
    )
    admin = User(
        id=uuid4(),
        email="admin@example.com",
        github_id="191438254",
        username="renamed-admin",
    )
    same_username_wrong_id = User(
        id=uuid4(),
        email="other@example.com",
        github_id="999999999",
        username="NaHyeongyu",
    )

    assert security.is_admin_user(admin) is True
    assert security.is_admin_user(same_username_wrong_id) is False


def test_admin_audit_candidate_recognizes_admin_and_project_routes() -> None:
    project_id = uuid4()

    assert is_admin_audit_candidate(_scope("/api/admin/overview")) is True
    assert is_admin_audit_candidate(_scope(f"/api/projects/{project_id}/detail")) is True
    assert is_admin_audit_candidate(_scope("/api/projects")) is False
    assert project_id_from_path(f"/api/projects/{project_id}/memory/project") == project_id


def test_admin_audit_middleware_records_response_status() -> None:
    recorded: list[tuple[str, int]] = []

    async def app(_scope, _receive, send) -> None:
        await send({"type": "http.response.start", "status": 403, "headers": []})
        await send({"type": "http.response.body", "body": b""})

    async def receive() -> dict[str, Any]:
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(_message: dict[str, Any]) -> None:
        return None

    middleware = AdminAuditMiddleware(
        app,
        recorder=lambda scope, status: recorded.append((str(scope["path"]), status)),
    )
    asyncio.run(middleware(_scope("/api/admin/overview"), receive, send))

    assert recorded == [("/api/admin/overview", 403)]


def test_main_wires_admin_audit_middleware() -> None:
    from app.main import app

    assert any(item.cls is AdminAuditMiddleware for item in app.user_middleware)


def test_admin_route_can_attach_specific_audit_metadata() -> None:
    scope = _scope("/api/admin/users/example/collector-tokens/revoke", method="POST")
    scope["state"] = {}
    request = Request(scope)
    user_id = uuid4()

    _set_audit_action(
        request,
        action="admin.user.collector_tokens.revoke_all",
        resource_id=user_id,
        resource_type="user",
    )

    assert scope["state"] == {
        "admin_audit_action": "admin.user.collector_tokens.revoke_all",
        "admin_audit_resource_id": str(user_id),
        "admin_audit_resource_type": "user",
    }
