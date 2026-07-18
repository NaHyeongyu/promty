from __future__ import annotations

from dataclasses import replace
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import HTTPException
import pytest
from starlette.requests import Request

import app.core.security as security
from app.core.security import (
    JWTError,
    get_optional_web_user,
    issue_web_access_token,
    require_ingest_token,
    require_web_user,
    revoke_web_session_token,
    verify_web_access_token,
    verify_web_access_token_claims,
)
from app.models.web_sessions import WebSession


class UserStub:
    def __init__(self) -> None:
        self.id = uuid4()
        self.suspended_at = None


class CollectorTokenStub:
    def __init__(self, user: UserStub) -> None:
        self.collector_version = None
        self.last_used_at = None
        self.user = user


class DatabaseStub:
    def __init__(self, collector_token: CollectorTokenStub) -> None:
        self.collector_token = collector_token
        self.flushed = False

    def scalar(self, _statement: object) -> CollectorTokenStub:
        return self.collector_token

    def flush(self) -> None:
        self.flushed = True


class WebSessionDatabaseStub:
    def __init__(self, web_session: object | None) -> None:
        self.web_session = web_session
        self.flushed = False

    def get(self, model: type[object], _session_id: object) -> object | None:
        return self.web_session if model is WebSession else None

    def flush(self) -> None:
        self.flushed = True


def _request_with_session(token: str) -> Request:
    return Request(
        {
            "type": "http",
            "http_version": "1.1",
            "method": "GET",
            "scheme": "https",
            "path": "/api/auth/me",
            "raw_path": b"/api/auth/me",
            "query_string": b"",
            "headers": [(b"cookie", f"promty_session={token}".encode("ascii"))],
            "client": ("127.0.0.1", 1234),
            "server": ("testserver", 443),
        }
    )


def test_web_access_token_round_trip() -> None:
    user = UserStub()
    session_id = uuid4()

    token = issue_web_access_token(user, session_id=session_id)

    assert verify_web_access_token(token) == user.id
    assert verify_web_access_token_claims(token) == (user.id, session_id)
    assert all("=" not in part for part in token.split("."))


def test_web_access_token_rejects_tampered_signature() -> None:
    user = UserStub()
    token = issue_web_access_token(user, session_id=uuid4())
    header, payload, signature = token.split(".")

    tampered_token = f"{header}.{payload}.{signature[:-1]}x"

    with pytest.raises(JWTError):
        verify_web_access_token(tampered_token)


def test_web_access_token_rejects_oversized_input() -> None:
    with pytest.raises(JWTError):
        verify_web_access_token_claims("x" * (security.WEB_ACCESS_TOKEN_MAX_CHARS + 1))


def test_web_token_does_not_reuse_other_application_secrets(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = UserStub()
    monkeypatch.setattr(
        security,
        "settings",
        replace(
            security.settings,
            api_token="shared-ingest-secret",
            jwt_secret=None,
            oauth_state_secret="shared-oauth-secret",
        ),
    )

    with pytest.raises(RuntimeError, match="PROMTY_JWT_SECRET"):
        issue_web_access_token(user, session_id=uuid4())


def test_web_auth_requires_an_active_server_side_session() -> None:
    user = UserStub()
    session_id = uuid4()
    token = issue_web_access_token(user, session_id=session_id)
    web_session = type(
        "WebSessionStub",
        (),
        {
            "expires_at": datetime.now(timezone.utc).replace(year=2099),
            "id": session_id,
            "revoked_at": None,
            "user": user,
            "user_id": user.id,
        },
    )()
    db = WebSessionDatabaseStub(web_session)

    assert (
        get_optional_web_user(
            _request_with_session(token),
            authorization=None,
            db=db,  # type: ignore[arg-type]
        )
        is user
    )

    assert revoke_web_session_token(db, token) is True  # type: ignore[arg-type]
    assert web_session.revoked_at is not None
    assert db.flushed is True
    assert (
        get_optional_web_user(
            _request_with_session(token),
            authorization=None,
            db=db,  # type: ignore[arg-type]
        )
        is None
    )


def test_ingest_requires_authorization_by_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        security,
        "settings",
        replace(security.settings, api_token=None, allow_anonymous_ingest=False),
    )

    with pytest.raises(HTTPException) as exc_info:
        require_ingest_token(authorization=None, db=None)  # type: ignore[arg-type]

    assert exc_info.value.status_code == 401


def test_ingest_can_explicitly_allow_anonymous_for_local_dev(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        security,
        "settings",
        replace(security.settings, api_token=None, allow_anonymous_ingest=True),
    )

    assert require_ingest_token(authorization=None, db=None) is None  # type: ignore[arg-type]


def test_suspended_user_is_blocked_from_web_and_collector_access(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = UserStub()
    user.suspended_at = datetime.now(timezone.utc)
    db = DatabaseStub(CollectorTokenStub(user))
    monkeypatch.setattr(
        security,
        "settings",
        replace(security.settings, api_token=None, allow_anonymous_ingest=False),
    )

    with pytest.raises(HTTPException) as web_error:
        require_web_user(user)  # type: ignore[arg-type]
    with pytest.raises(HTTPException) as ingest_error:
        require_ingest_token(authorization="Bearer collector-secret", db=db)  # type: ignore[arg-type]

    assert web_error.value.status_code == 403
    assert ingest_error.value.status_code == 403
    assert db.flushed is False
