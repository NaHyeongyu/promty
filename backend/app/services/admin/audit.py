from __future__ import annotations

from datetime import datetime, timedelta, timezone
import logging
from threading import Lock
import time
from uuid import UUID

from sqlalchemy import delete
from starlette.datastructures import Headers
from starlette.requests import Request
from starlette.types import Scope

from app.core.config import settings
from app.core.security import JWTError, is_admin_user, verify_web_access_token
from app.db.session import SessionLocal
from app.models.admin_audit_logs import AdminAuditLog
from app.models.projects import Project
from app.models.users import User

logger = logging.getLogger(__name__)

_prune_lock = Lock()
_next_prune_at = 0.0
_PRUNE_INTERVAL_SECONDS = 86_400
_ADMIN_READ_ACTIONS = {
    "/api/admin/audit-logs": "admin.audit_logs.read",
    "/api/admin/events": "admin.events.read",
    "/api/admin/jobs": "admin.jobs.read",
    "/api/admin/overview": "admin.overview.read",
    "/api/admin/projects": "admin.projects.read",
    "/api/admin/system": "admin.system.read",
    "/api/admin/users": "admin.users.read",
}


def _bearer_token(value: str | None) -> str | None:
    if not value:
        return None
    scheme, _, token = value.partition(" ")
    return token if scheme.lower() == "bearer" and token else None


def _request_token(scope: Scope) -> str | None:
    headers = Headers(scope=scope)
    return _bearer_token(headers.get("authorization")) or Request(scope).cookies.get(
        settings.session_cookie_name
    )


def project_id_from_path(path: str) -> UUID | None:
    parts = path.split("/")
    if len(parts) < 4 or parts[1:3] != ["api", "projects"]:
        return None
    try:
        return UUID(parts[3])
    except ValueError:
        return None


def is_admin_audit_candidate(scope: Scope) -> bool:
    if scope.get("type") != "http" or scope.get("method") == "OPTIONS":
        return False
    path = str(scope.get("path", ""))
    return (
        path == "/api/admin"
        or path.startswith("/api/admin/")
        or project_id_from_path(path) is not None
    )


def _should_prune(now: float) -> bool:
    global _next_prune_at
    with _prune_lock:
        if now < _next_prune_at:
            return False
        _next_prune_at = now + _PRUNE_INTERVAL_SECONDS
        return True


def record_admin_request(scope: Scope, status_code: int) -> None:
    token = _request_token(scope)
    if not token:
        return
    try:
        user_id = verify_web_access_token(token)
    except (JWTError, RuntimeError):
        return

    path = str(scope.get("path", ""))[:2048]
    method = str(scope.get("method", "GET"))[:16]
    project_id = project_id_from_path(path)
    request_state = scope.get("state") or {}

    db = SessionLocal()
    try:
        actor = db.get(User, user_id)
        if actor is None or not is_admin_user(actor):
            return

        resource_type: str | None = None
        resource_id: str | None = None
        if path == "/api/admin" or path.startswith("/api/admin/"):
            action = request_state.get("admin_audit_action") or (
                _ADMIN_READ_ACTIONS.get(path, "admin.api.read")
                if method == "GET"
                else "admin.api.write"
            )
            resource_type = request_state.get("admin_audit_resource_type") or "admin_console"
            resource_id = request_state.get("admin_audit_resource_id")
        elif project_id is not None:
            project = db.get(Project, project_id)
            if project is None or project.owner_id == actor.id:
                return
            action = "admin.project.read" if method == "GET" else "admin.project.write_attempt"
            resource_type = "project"
            resource_id = str(project_id)
        else:
            return

        db.add(
            AdminAuditLog(
                actor_user_id=actor.id,
                actor_github_id=str(actor.github_id),
                actor_username=actor.username,
                action=action,
                resource_type=resource_type,
                resource_id=resource_id,
                request_method=method,
                request_path=path,
                status_code=status_code,
            )
        )
        if _should_prune(time.monotonic()):
            cutoff = datetime.now(timezone.utc) - timedelta(
                days=settings.admin_audit_retention_days
            )
            db.execute(delete(AdminAuditLog).where(AdminAuditLog.created_at < cutoff))
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Could not persist administrator audit log")
    finally:
        db.close()
