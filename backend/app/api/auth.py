from __future__ import annotations

import secrets
import time
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib import parse
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import (
    get_optional_web_user,
    hash_collector_token,
    issue_collector_token,
    issue_web_access_token,
    is_admin_user,
    require_web_user,
    revoke_web_session_token,
)
from app.db.session import get_db
from app.models.tokens import CollectorToken
from app.models.users import User
from app.models.web_sessions import WebSession
from app.schemas.auth import CurrentUserResponse, LogoutResponse
from app.services.github_oauth import (
    GITHUB_CLI_SCOPE,
    GITHUB_REPOSITORY_SCOPE,
    GITHUB_WEB_SCOPE,
    build_github_authorization_url,
    exchange_code_for_token,
    get_github_user_id,
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


@router.get("/github/web/repository/start")
def start_github_repository_authorization(
    return_to: str | None = Query(default=None),
    current_user: User = Depends(require_web_user),
) -> RedirectResponse:
    nonce = secrets.token_urlsafe(32)
    oauth_state = encode_oauth_state(
        {
            "expected_user_id": str(current_user.id),
            "iat": int(time.time()),
            "mode": "web_repository",
            "return_to": validate_web_return_to(return_to),
            "web_nonce_hash": nonce_hash(nonce),
        }
    )
    github_url = build_github_authorization_url(
        scope=GITHUB_REPOSITORY_SCOPE,
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
    state: str = Query(...),
    code: str | None = None,
    error: str | None = None,
    db: Session = Depends(get_db),
    current_web_user: User | None = Depends(get_optional_web_user),
) -> RedirectResponse:
    payload = decode_oauth_state(state)
    mode = payload.get("mode")
    if mode in {"web", "web_repository"}:
        require_web_oauth_nonce(payload, request.cookies.get(settings.oauth_state_cookie_name))

    if error:
        if mode in {"web", "web_repository"}:
            return_to = validate_web_return_to(str(payload.get("return_to", "")))
            parsed_return_to = parse.urlsplit(return_to)
            return_query = parse.parse_qsl(parsed_return_to.query, keep_blank_values=True)
            return_query.append(
                (
                    "auth_error",
                    "github_authorization_cancelled"
                    if error == "access_denied"
                    else "github_authorization_failed",
                )
            )
            response = RedirectResponse(
                parse.urlunsplit(parsed_return_to._replace(query=parse.urlencode(return_query))),
                status_code=status.HTTP_302_FOUND,
            )
            response.delete_cookie(
                key=settings.oauth_state_cookie_name,
                path="/",
                secure=settings.session_cookie_secure,
                samesite=settings.session_cookie_samesite,
            )
            return response

        cli_redirect_uri = validate_cli_redirect_uri(str(payload.get("cli_redirect_uri", "")))
        query = parse.urlencode(
            {
                "error": "github_authorization_cancelled",
                "state": str(payload.get("cli_state", "")),
            }
        )
        return RedirectResponse(
            f"{cli_redirect_uri}?{query}",
            status_code=status.HTTP_302_FOUND,
        )

    if not code:
        raise HTTPException(status_code=400, detail="GitHub authorization code is missing")

    token_payload = exchange_code_for_token(code)
    access_token = str(token_payload["access_token"])

    if mode == "web_repository":
        expected_user_id = payload.get("expected_user_id")
        if not isinstance(expected_user_id, str) or not expected_user_id:
            raise HTTPException(status_code=400, detail="Invalid repository OAuth state")
        if current_web_user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Repository authorization requires an authenticated Promty session",
            )
        if current_web_user.suspended_at is not None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Promty account is suspended",
            )
        if str(current_web_user.id) != expected_user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Repository authorization user does not match the current session",
            )
        github_id = get_github_user_id(access_token)
        if current_web_user.github_id is None or str(current_web_user.github_id) != github_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Repository authorization must use the signed-in GitHub account",
            )
        scopes = token_payload.get("scope")
        token_type = token_payload.get("token_type")
        upsert_github_connection(
            db,
            access_token=access_token,
            scopes=scopes if isinstance(scopes, str) else None,
            token_type=token_type if isinstance(token_type, str) else None,
            user=current_web_user,
        )
        db.commit()
        return_to = validate_web_return_to(str(payload.get("return_to", "")))
        response = RedirectResponse(return_to, status_code=status.HTTP_302_FOUND)
        response.delete_cookie(
            key=settings.oauth_state_cookie_name,
            path="/",
            secure=settings.session_cookie_secure,
            samesite=settings.session_cookie_samesite,
        )
        return response

    user = upsert_github_user(db, access_token)
    if user.suspended_at is not None:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Promty account is suspended",
        )

    if mode == "web":
        web_session = WebSession(
            id=uuid4(),
            user_id=user.id,
            expires_at=datetime.now(timezone.utc)
            + timedelta(seconds=settings.access_token_ttl_seconds),
        )
        db.add(web_session)
        db.commit()
        return_to = validate_web_return_to(str(payload.get("return_to", "")))
        response = RedirectResponse(return_to, status_code=status.HTTP_302_FOUND)
        response.set_cookie(
            key=settings.session_cookie_name,
            value=issue_web_access_token(user, session_id=web_session.id),
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
            name="Promty CLI",
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


@router.get("/me", response_model=CurrentUserResponse)
def read_current_user(user: User = Depends(require_web_user)) -> dict[str, Any]:
    return {
        "id": str(user.id),
        "username": user.username,
        "email": user.email,
        "avatar_url": user.avatar_url,
        "github_repository_access": user.github_connection is not None
        and user.github_connection.revoked_at is None,
        "is_admin": is_admin_user(user),
        "preferred_locale": user.preferred_locale,
    }


@router.post("/logout", response_model=LogoutResponse)
def logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> dict[str, str]:
    authorization = request.headers.get("authorization")
    scheme, _, bearer_token = authorization.partition(" ") if authorization else ("", "", "")
    token = (
        bearer_token
        if scheme.lower() == "bearer" and bearer_token
        else request.cookies.get(settings.session_cookie_name)
    )
    revoke_web_session_token(db, token)
    db.commit()
    response.delete_cookie(
        key=settings.session_cookie_name,
        path="/",
        secure=settings.session_cookie_secure,
        samesite=settings.session_cookie_samesite,
    )
    return {"status": "ok"}
