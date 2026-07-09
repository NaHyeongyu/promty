from __future__ import annotations

import secrets
import time
from typing import Any
from urllib import parse

from fastapi import APIRouter, Depends, Query, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import (
    hash_collector_token,
    issue_collector_token,
    issue_web_access_token,
    is_admin_user,
    require_web_user,
)
from app.db.session import get_db
from app.models.tokens import CollectorToken
from app.models.users import User
from app.services.github_oauth import (
    GITHUB_CLI_SCOPE,
    GITHUB_WEB_SCOPE,
    build_github_authorization_url,
    exchange_code_for_token,
    upsert_github_connection,
    upsert_github_user,
)
from app.services.oauth_state import (
    STATE_TTL_SECONDS,
    decode_oauth_state,
    encode_oauth_state,
    nonce_hash,
    require_web_oauth_nonce,
    validate_cli_redirect_uri,
    validate_web_return_to,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/github/start")
def start_github_login(
    redirect_uri: str = Query(...),
    state: str = Query(...),
) -> RedirectResponse:
    cli_redirect_uri = validate_cli_redirect_uri(redirect_uri)
    oauth_state = encode_oauth_state(
        {
            "cli_redirect_uri": cli_redirect_uri,
            "cli_state": state,
            "iat": int(time.time()),
            "mode": "cli",
        }
    )
    github_url = build_github_authorization_url(
        scope=GITHUB_CLI_SCOPE,
        state=oauth_state,
    )
    return RedirectResponse(github_url, status_code=status.HTTP_302_FOUND)


@router.get("/github/web/start")
def start_github_web_login(
    return_to: str | None = Query(default=None),
) -> RedirectResponse:
    nonce = secrets.token_urlsafe(32)
    oauth_state = encode_oauth_state(
        {
            "iat": int(time.time()),
            "mode": "web",
            "return_to": validate_web_return_to(return_to),
            "web_nonce_hash": nonce_hash(nonce),
        }
    )
    github_url = build_github_authorization_url(
        scope=GITHUB_WEB_SCOPE,
        state=oauth_state,
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
    payload = decode_oauth_state(state)
    if payload.get("mode") == "web":
        require_web_oauth_nonce(payload, request.cookies.get(settings.oauth_state_cookie_name))

    token_payload = exchange_code_for_token(code)
    access_token = str(token_payload["access_token"])
    user = upsert_github_user(db, access_token)

    if payload.get("mode") == "web":
        scopes = token_payload.get("scope")
        token_type = token_payload.get("token_type")
        upsert_github_connection(
            db,
            access_token=access_token,
            scopes=scopes if isinstance(scopes, str) else None,
            token_type=token_type if isinstance(token_type, str) else None,
            user=user,
        )
        db.commit()
        return_to = validate_web_return_to(str(payload.get("return_to", "")))
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

    cli_redirect_uri = validate_cli_redirect_uri(str(payload.get("cli_redirect_uri", "")))
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
