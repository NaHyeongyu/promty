from __future__ import annotations

import time
from typing import Any
from uuid import uuid4

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.api import auth
from app.core.config import settings
from app.models.users import User
from app.services.github_oauth import GITHUB_REPOSITORY_SCOPE, GITHUB_WEB_SCOPE
from app.services.oauth_state import decode_oauth_state, encode_oauth_state, nonce_hash


class FakeSession:
    def __init__(self) -> None:
        self.added: list[object] = []
        self.commit_count = 0

    def add(self, item: object) -> None:
        self.added.append(item)

    def commit(self) -> None:
        self.commit_count += 1


def _user(*, github_id: str = "github-123") -> User:
    return User(
        id=uuid4(),
        email="member@example.com",
        github_id=github_id,
        username="member",
    )


def _request_with_oauth_cookie(nonce: str, *, language: str = "en-US") -> Request:
    cookie = f"{settings.oauth_state_cookie_name}={nonce}".encode("ascii")
    return Request(
        {
            "type": "http",
            "http_version": "1.1",
            "method": "GET",
            "scheme": "http",
            "path": "/api/auth/github/callback",
            "raw_path": b"/api/auth/github/callback",
            "query_string": b"",
            "headers": [
                (b"cookie", cookie),
                (b"accept-language", language.encode("ascii")),
            ],
            "client": ("127.0.0.1", 1234),
            "server": ("testserver", 80),
        }
    )


def _capture_authorization_url(
    monkeypatch: pytest.MonkeyPatch,
) -> dict[str, str]:
    captured: dict[str, str] = {}

    def build_url(*, scope: str, state: str) -> str:
        captured.update(scope=scope, state=state)
        return "https://github.example/authorize"

    monkeypatch.setattr(auth, "build_github_authorization_url", build_url)
    return captured


def test_web_login_requests_identity_scope_only(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured = _capture_authorization_url(monkeypatch)

    response = auth.start_github_web_login(return_to=None)
    payload = decode_oauth_state(captured["state"])

    assert response.status_code == 302
    assert captured["scope"] == GITHUB_WEB_SCOPE
    assert "repo" not in captured["scope"].split()
    assert payload["mode"] == "web"
    assert "expected_user_id" not in payload


def test_web_login_callback_does_not_store_repository_connection(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    nonce = "login-nonce"
    user = _user()
    db = FakeSession()
    state = encode_oauth_state(
        {
            "iat": int(time.time()),
            "mode": "web",
            "return_to": settings.app_url.rstrip("/"),
            "web_nonce_hash": nonce_hash(nonce),
        }
    )
    monkeypatch.setattr(
        auth,
        "exchange_code_for_token",
        lambda _code: {"access_token": "identity-token", "scope": GITHUB_WEB_SCOPE},
    )
    captured_locale: dict[str, str] = {}

    def upsert_user(
        _db: object,
        _token: str,
        *,
        preferred_locale: str,
    ) -> User:
        captured_locale["value"] = preferred_locale
        return user

    monkeypatch.setattr(auth, "upsert_github_user", upsert_user)

    def unexpected_connection(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("identity login must not create a repository connection")

    monkeypatch.setattr(auth, "upsert_github_connection", unexpected_connection)

    response = auth.finish_github_login(
        request=_request_with_oauth_cookie(nonce, language="ja-JP,ja;q=0.9,en;q=0.8"),
        code="code",
        state=state,
        db=db,  # type: ignore[arg-type]
        current_web_user=None,
    )

    assert response.status_code == 302
    assert db.commit_count == 1
    assert len(db.added) == 1
    assert captured_locale == {"value": "ja"}
    assert settings.session_cookie_name in response.headers.get("set-cookie", "")


def test_repository_authorization_binds_signed_in_user_and_requests_repo_scope(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = _user()
    captured = _capture_authorization_url(monkeypatch)

    response = auth.start_github_repository_authorization(
        return_to=None,
        current_user=user,
    )
    payload = decode_oauth_state(captured["state"])

    assert response.status_code == 302
    assert captured["scope"] == GITHUB_REPOSITORY_SCOPE
    assert "repo" in captured["scope"].split()
    assert payload["mode"] == "web_repository"
    assert payload["expected_user_id"] == str(user.id)


def test_repository_callback_stores_connection_only_for_matching_account(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    nonce = "repository-nonce"
    user = _user()
    db = FakeSession()
    state = encode_oauth_state(
        {
            "expected_user_id": str(user.id),
            "iat": int(time.time()),
            "mode": "web_repository",
            "return_to": settings.app_url.rstrip("/"),
            "web_nonce_hash": nonce_hash(nonce),
        }
    )
    monkeypatch.setattr(
        auth,
        "exchange_code_for_token",
        lambda _code: {
            "access_token": "repository-token",
            "scope": GITHUB_REPOSITORY_SCOPE,
            "token_type": "bearer",
        },
    )
    monkeypatch.setattr(auth, "get_github_user_id", lambda _token: "github-123")
    captured_connection: dict[str, Any] = {}

    def capture_connection(
        _db: object,
        **kwargs: object,
    ) -> None:
        captured_connection.update(kwargs)

    monkeypatch.setattr(auth, "upsert_github_connection", capture_connection)

    response = auth.finish_github_login(
        request=_request_with_oauth_cookie(nonce),
        code="code",
        state=state,
        db=db,  # type: ignore[arg-type]
        current_web_user=user,
    )

    assert response.status_code == 302
    assert db.commit_count == 1
    assert captured_connection["user"] is user
    assert captured_connection["access_token"] == "repository-token"

    monkeypatch.setattr(auth, "get_github_user_id", lambda _token: "other-account")
    with pytest.raises(HTTPException) as exc_info:
        auth.finish_github_login(
            request=_request_with_oauth_cookie(nonce),
            code="code",
            state=state,
            db=FakeSession(),  # type: ignore[arg-type]
            current_web_user=user,
        )

    assert exc_info.value.status_code == 403


def test_cancelled_web_authorization_returns_to_the_app(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    nonce = "cancelled-nonce"
    state = encode_oauth_state(
        {
            "iat": int(time.time()),
            "mode": "web_repository",
            "return_to": settings.app_url.rstrip("/"),
            "web_nonce_hash": nonce_hash(nonce),
        }
    )

    monkeypatch.setattr(
        auth,
        "exchange_code_for_token",
        lambda _code: pytest.fail("cancelled authorization must not exchange a token"),
    )
    response = auth.finish_github_login(
        request=_request_with_oauth_cookie(nonce),
        code=None,
        error="access_denied",
        state=state,
        db=FakeSession(),  # type: ignore[arg-type]
        current_web_user=_user(),
    )

    assert response.status_code == 302
    assert "auth_error=github_authorization_cancelled" in response.headers["location"]
