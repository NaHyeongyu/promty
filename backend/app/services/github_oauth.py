from __future__ import annotations

import json
from typing import Any
from urllib import error, parse, request

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.encryption import encrypt_github_token
from app.models.github_connections import GitHubConnection
from app.models.users import User

GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize"
GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_USER_URL = "https://api.github.com/user"
GITHUB_EMAILS_URL = "https://api.github.com/user/emails"
GITHUB_CLI_SCOPE = "read:user user:email"
GITHUB_WEB_SCOPE = "read:user user:email"
GITHUB_REPOSITORY_SCOPE = "read:user user:email repo"


def require_github_oauth_configured() -> None:
    if not settings.github_client_id or not settings.github_client_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="GitHub OAuth is not configured",
        )


def _callback_url() -> str:
    return f"{settings.api_public_url.rstrip('/')}/api/auth/github/callback"


def build_github_authorization_url(*, scope: str, state: str) -> str:
    require_github_oauth_configured()
    return f"{GITHUB_AUTHORIZE_URL}?" + parse.urlencode(
        {
            "client_id": settings.github_client_id,
            "redirect_uri": _callback_url(),
            "scope": scope,
            "state": state,
        }
    )


def _json_request(url: str, *, token: str | None = None) -> dict[str, Any] | list[Any]:
    headers = {
        "Accept": "application/json",
        "User-Agent": "Promty",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = request.Request(url, headers=headers)
    try:
        with request.urlopen(req, timeout=10) as response:
            return json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"GitHub API request failed: HTTP {exc.code}",
        ) from exc
    except (error.URLError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="GitHub API request failed",
        ) from exc


def exchange_code_for_token(code: str) -> dict[str, Any]:
    require_github_oauth_configured()
    body = parse.urlencode(
        {
            "client_id": settings.github_client_id,
            "client_secret": settings.github_client_secret,
            "code": code,
            "redirect_uri": _callback_url(),
        }
    ).encode("utf-8")
    req = request.Request(
        GITHUB_TOKEN_URL,
        data=body,
        headers={"Accept": "application/json", "User-Agent": "Promty"},
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=10) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (error.URLError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="GitHub token exchange failed",
        ) from exc

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="GitHub token exchange failed")
    access_token = payload.get("access_token")
    if not isinstance(access_token, str) or not access_token:
        raise HTTPException(status_code=400, detail="GitHub token exchange failed")
    return payload


def _fetch_primary_email(access_token: str) -> str | None:
    payload = _json_request(GITHUB_EMAILS_URL, token=access_token)
    if not isinstance(payload, list):
        return None

    for item in payload:
        if not isinstance(item, dict):
            continue
        if item.get("primary") is True and item.get("verified") is True:
            email = item.get("email")
            return email if isinstance(email, str) else None
    return None


def _unique_username(db: Session, username: str, github_id: str) -> str:
    existing = db.scalar(select(User).where(User.username == username))
    if existing is None or existing.github_id == github_id:
        return username
    return f"{username}-{github_id}"


def _available_email(db: Session, email: str | None, github_id: str) -> str | None:
    if not email:
        return None
    existing = db.scalar(select(User).where(User.email == email))
    if existing is None or existing.github_id == github_id:
        return email
    return None


def get_github_user_id(access_token: str) -> str:
    payload = _json_request(GITHUB_USER_URL, token=access_token)
    if not isinstance(payload, dict):
        raise HTTPException(status_code=502, detail="Invalid GitHub user response")

    github_id_value = payload.get("id")
    if github_id_value is None:
        raise HTTPException(status_code=502, detail="Invalid GitHub user response")
    return str(github_id_value)


def upsert_github_user(db: Session, access_token: str) -> User:
    payload = _json_request(GITHUB_USER_URL, token=access_token)
    if not isinstance(payload, dict):
        raise HTTPException(status_code=502, detail="Invalid GitHub user response")

    github_id_value = payload.get("id")
    login_value = payload.get("login")
    if github_id_value is None or not isinstance(login_value, str):
        raise HTTPException(status_code=502, detail="Invalid GitHub user response")

    github_id = str(github_id_value)
    username = _unique_username(db, login_value, github_id)
    email_value = payload.get("email")
    email = email_value if isinstance(email_value, str) else None
    if email is None:
        email = _fetch_primary_email(access_token)
    email = _available_email(db, email, github_id)
    avatar_value = payload.get("avatar_url")
    avatar_url = avatar_value if isinstance(avatar_value, str) else None

    user = db.scalar(select(User).where(User.github_id == github_id))
    if user is None:
        user = User(
            github_id=github_id,
            email=email,
            username=username,
            avatar_url=avatar_url,
        )
        db.add(user)
    else:
        user.email = email
        user.username = username
        user.avatar_url = avatar_url
    db.flush()
    return user


def upsert_github_connection(
    db: Session,
    *,
    access_token: str,
    scopes: str | None,
    token_type: str | None,
    user: User,
) -> None:
    connection = db.scalar(select(GitHubConnection).where(GitHubConnection.user_id == user.id))
    if connection is None:
        connection = GitHubConnection(
            user_id=user.id,
            access_token_encrypted=encrypt_github_token(access_token),
            scopes=scopes,
            token_type=token_type,
        )
        db.add(connection)
    else:
        connection.access_token_encrypted = encrypt_github_token(access_token)
        connection.scopes = scopes
        connection.token_type = token_type
        connection.revoked_at = None
    db.flush()
