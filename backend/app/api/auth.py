from __future__ import annotations

import hashlib
import hmac
import json
import secrets
import time
from typing import Any
from urllib import error, parse, request

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.encoding import base64_urldecode, base64_urlencode
from app.core.encryption import encrypt_github_token
from app.core.security import (
    hash_collector_token,
    issue_collector_token,
    issue_web_access_token,
    is_admin_user,
    require_web_user,
)
from app.db.session import get_db
from app.models.github_connections import GitHubConnection
from app.models.tokens import CollectorToken
from app.models.users import User

router = APIRouter(prefix="/api/auth", tags=["auth"])
GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize"
GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_USER_URL = "https://api.github.com/user"
GITHUB_EMAILS_URL = "https://api.github.com/user/emails"
STATE_TTL_SECONDS = 600
GITHUB_CLI_SCOPE = "read:user user:email"
GITHUB_WEB_SCOPE = "read:user user:email repo"


def _state_secret() -> bytes:
    secret = (
        settings.oauth_state_secret
        or settings.api_token
        or settings.github_client_secret
    )
    if not secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="PromptHub OAuth state secret is not configured",
        )
    return secret.encode("utf-8")


def _encode_state(payload: dict[str, Any]) -> str:
    body = base64_urlencode(
        json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    )
    signature = hmac.new(_state_secret(), body.encode("ascii"), hashlib.sha256).digest()
    return f"{body}.{base64_urlencode(signature)}"


def _decode_state(value: str) -> dict[str, Any]:
    try:
        body, signature = value.split(".", 1)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid OAuth state") from exc

    expected = hmac.new(_state_secret(), body.encode("ascii"), hashlib.sha256).digest()
    try:
        actual = base64_urldecode(signature)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid OAuth state") from exc
    if not hmac.compare_digest(actual, expected):
        raise HTTPException(status_code=400, detail="Invalid OAuth state")

    try:
        payload = json.loads(base64_urldecode(body))
    except (json.JSONDecodeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Invalid OAuth state") from exc
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid OAuth state")

    issued_at = payload.get("iat")
    if not isinstance(issued_at, int) or time.time() - issued_at > STATE_TTL_SECONDS:
        raise HTTPException(status_code=400, detail="Expired OAuth state")
    return payload


def _validate_cli_redirect_uri(uri: str) -> str:
    parsed = parse.urlparse(uri)
    if (
        parsed.scheme != "http"
        or parsed.hostname not in {"127.0.0.1", "localhost"}
        or parsed.path != "/callback"
    ):
        raise HTTPException(status_code=400, detail="Invalid CLI redirect_uri")
    return uri


def _validate_web_return_to(uri: str | None) -> str:
    if not uri:
        return settings.app_url.rstrip("/")

    parsed = parse.urlparse(uri)
    app = parse.urlparse(settings.app_url)
    if parsed.scheme != app.scheme or parsed.netloc != app.netloc:
        raise HTTPException(status_code=400, detail="Invalid web return_to URL")
    if parsed.path.startswith("//"):
        raise HTTPException(status_code=400, detail="Invalid web return_to URL")
    return uri


def _nonce_hash(nonce: str) -> str:
    return hashlib.sha256(nonce.encode("utf-8")).hexdigest()


def _require_web_oauth_nonce(payload: dict[str, Any], request: Request) -> None:
    expected = payload.get("web_nonce_hash")
    nonce = request.cookies.get(settings.oauth_state_cookie_name)
    if not isinstance(expected, str) or nonce is None:
        raise HTTPException(status_code=400, detail="Missing OAuth state cookie")
    if not hmac.compare_digest(expected, _nonce_hash(nonce)):
        raise HTTPException(status_code=400, detail="Invalid OAuth state cookie")


def _json_request(url: str, *, token: str | None = None) -> dict[str, Any] | list[Any]:
    headers = {
        "Accept": "application/json",
        "User-Agent": "PromptHub",
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


def _exchange_code_for_token(code: str) -> dict[str, Any]:
    if not settings.github_client_id or not settings.github_client_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="GitHub OAuth is not configured",
        )

    body = parse.urlencode(
        {
            "client_id": settings.github_client_id,
            "client_secret": settings.github_client_secret,
            "code": code,
            "redirect_uri": f"{settings.api_public_url.rstrip('/')}/api/auth/github/callback",
        }
    ).encode("utf-8")
    req = request.Request(
        GITHUB_TOKEN_URL,
        data=body,
        headers={"Accept": "application/json", "User-Agent": "PromptHub"},
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


def _upsert_user(db: Session, access_token: str) -> User:
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


def _upsert_github_connection(
    db: Session,
    *,
    access_token: str,
    scopes: str | None,
    token_type: str | None,
    user: User,
) -> None:
    connection = db.scalar(
        select(GitHubConnection).where(GitHubConnection.user_id == user.id)
    )
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


@router.get("/github/start")
def start_github_login(
    redirect_uri: str = Query(...),
    state: str = Query(...),
) -> RedirectResponse:
    if not settings.github_client_id or not settings.github_client_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="GitHub OAuth is not configured",
        )

    cli_redirect_uri = _validate_cli_redirect_uri(redirect_uri)
    oauth_state = _encode_state(
        {
            "cli_redirect_uri": cli_redirect_uri,
            "cli_state": state,
            "iat": int(time.time()),
            "mode": "cli",
        }
    )
    callback_url = f"{settings.api_public_url.rstrip('/')}/api/auth/github/callback"
    github_url = (
        f"{GITHUB_AUTHORIZE_URL}?"
        + parse.urlencode(
            {
                "client_id": settings.github_client_id,
                "redirect_uri": callback_url,
                "scope": GITHUB_CLI_SCOPE,
                "state": oauth_state,
            }
        )
    )
    return RedirectResponse(github_url, status_code=status.HTTP_302_FOUND)


@router.get("/github/web/start")
def start_github_web_login(
    return_to: str | None = Query(default=None),
) -> RedirectResponse:
    if not settings.github_client_id or not settings.github_client_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="GitHub OAuth is not configured",
        )

    nonce = secrets.token_urlsafe(32)
    oauth_state = _encode_state(
        {
            "iat": int(time.time()),
            "mode": "web",
            "return_to": _validate_web_return_to(return_to),
            "web_nonce_hash": _nonce_hash(nonce),
        }
    )
    callback_url = f"{settings.api_public_url.rstrip('/')}/api/auth/github/callback"
    github_url = (
        f"{GITHUB_AUTHORIZE_URL}?"
        + parse.urlencode(
            {
                "client_id": settings.github_client_id,
                "redirect_uri": callback_url,
                "scope": GITHUB_WEB_SCOPE,
                "state": oauth_state,
            }
        )
    )
    response = RedirectResponse(github_url, status_code=status.HTTP_302_FOUND)
    response.set_cookie(
        key=settings.oauth_state_cookie_name,
        value=nonce,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite=settings.session_cookie_samesite,
        max_age=STATE_TTL_SECONDS,
        path="/",
    )
    return response


@router.get("/github/callback")
def finish_github_login(
    request: Request,
    code: str = Query(...),
    state: str = Query(...),
    db: Session = Depends(get_db),
) -> RedirectResponse:
    payload = _decode_state(state)
    if payload.get("mode") == "web":
        _require_web_oauth_nonce(payload, request)

    token_payload = _exchange_code_for_token(code)
    access_token = str(token_payload["access_token"])
    user = _upsert_user(db, access_token)

    if payload.get("mode") == "web":
        scopes = token_payload.get("scope")
        token_type = token_payload.get("token_type")
        _upsert_github_connection(
            db,
            access_token=access_token,
            scopes=scopes if isinstance(scopes, str) else None,
            token_type=token_type if isinstance(token_type, str) else None,
            user=user,
        )
        db.commit()
        return_to = _validate_web_return_to(str(payload.get("return_to", "")))
        response = RedirectResponse(return_to, status_code=status.HTTP_302_FOUND)
        response.set_cookie(
            key=settings.session_cookie_name,
            value=issue_web_access_token(user),
            httponly=True,
            secure=settings.session_cookie_secure,
            samesite=settings.session_cookie_samesite,
            max_age=settings.access_token_ttl_seconds,
            path="/",
        )
        response.delete_cookie(
            key=settings.oauth_state_cookie_name,
            path="/",
            secure=settings.session_cookie_secure,
            samesite=settings.session_cookie_samesite,
        )
        return response

    cli_redirect_uri = _validate_cli_redirect_uri(str(payload.get("cli_redirect_uri", "")))
    cli_state = str(payload.get("cli_state", ""))
    collector_token = issue_collector_token()
    db.add(
        CollectorToken(
            user_id=user.id,
            token_hash=hash_collector_token(collector_token),
            name="PromptHub CLI",
        )
    )
    db.commit()

    query = parse.urlencode(
        {
            "state": cli_state,
            "token": collector_token,
            "api_url": settings.api_public_url.rstrip("/"),
            "username": user.username,
        }
    )
    return RedirectResponse(f"{cli_redirect_uri}?{query}", status_code=status.HTTP_302_FOUND)


@router.get("/me")
def read_current_user(user: User = Depends(require_web_user)) -> dict[str, Any]:
    return {
        "id": str(user.id),
        "username": user.username,
        "email": user.email,
        "avatar_url": user.avatar_url,
        "github_repository_access": user.github_connection is not None
        and user.github_connection.revoked_at is None,
        "is_admin": is_admin_user(user),
    }


@router.post("/logout")
def logout(response: Response) -> dict[str, str]:
    response.delete_cookie(
        key=settings.session_cookie_name,
        path="/",
        secure=settings.session_cookie_secure,
        samesite=settings.session_cookie_samesite,
    )
    return {"status": "ok"}
