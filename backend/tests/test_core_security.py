from __future__ import annotations

from uuid import uuid4

import pytest

from app.core.security import JWTError, issue_web_access_token, verify_web_access_token


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
