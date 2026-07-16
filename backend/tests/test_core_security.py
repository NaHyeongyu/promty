from __future__ import annotations

from dataclasses import replace
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import HTTPException
import pytest

import app.core.security as security
from app.core.security import (
    JWTError,
    issue_web_access_token,
    require_ingest_token,
    require_web_user,
    verify_web_access_token,
)


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


def test_web_access_token_round_trip() -> None:
    user = UserStub()

    token = issue_web_access_token(user)

    assert verify_web_access_token(token) == user.id
    assert all("=" not in part for part in token.split("."))


def test_web_access_token_rejects_tampered_signature() -> None:
    user = UserStub()
    token = issue_web_access_token(user)
    header, payload, signature = token.split(".")

    tampered_token = f"{header}.{payload}.{signature[:-1]}x"

    with pytest.raises(JWTError):
        verify_web_access_token(tampered_token)


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
