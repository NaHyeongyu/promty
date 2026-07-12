from __future__ import annotations

from dataclasses import replace
from uuid import uuid4

from fastapi import HTTPException
import pytest

import app.core.security as security
from app.core.security import (
    JWTError,
    issue_web_access_token,
    require_ingest_token,
    verify_web_access_token,
)


class UserStub:
    def __init__(self) -> None:
        self.id = uuid4()


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
