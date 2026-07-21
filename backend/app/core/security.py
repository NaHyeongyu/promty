from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import json
import secrets
import time
from typing import Any, Literal
from uuid import UUID

from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.encoding import base64_urldecode, base64_urlencode
from app.db.session import get_db
from app.models.tokens import CollectorToken
from app.models.users import User
from app.models.web_sessions import WebSession


class JWTError(ValueError):
    pass


WEB_ACCESS_TOKEN_MAX_CHARS = 8_192
WEB_REFRESH_TOKEN_MAX_CHARS = 512


def hash_collector_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def issue_collector_token() -> str:
    return f"ph_{secrets.token_urlsafe(32)}"


def _jwt_secret() -> bytes:
    secret = settings.jwt_secret
    if not secret:
        raise RuntimeError("PROMTY_JWT_SECRET is not configured")
    return secret.encode("utf-8")


def _json_bytes(payload: dict[str, Any]) -> bytes:
    return json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")


def _sign_jwt(header: str, payload: str) -> str:
    signature = hmac.new(
        _jwt_secret(),
        f"{header}.{payload}".encode("ascii"),
        hashlib.sha256,
    ).digest()
    return base64_urlencode(signature)


def issue_web_access_token(user: User, *, session_id: UUID) -> str:
    now = int(time.time())
    header = base64_urlencode(_json_bytes({"alg": "HS256", "typ": "JWT"}))
    payload = base64_urlencode(
        _json_bytes(
            {
                "aud": settings.jwt_audience,
                "exp": now + settings.access_token_ttl_seconds,
                "iat": now,
                "iss": settings.jwt_issuer,
                "sid": str(session_id),
                "sub": str(user.id),
                "typ": "access",
            }
        )
    )
    return f"{header}.{payload}.{_sign_jwt(header, payload)}"


def verify_web_access_token_claims(token: str) -> tuple[UUID, UUID]:
    if len(token) > WEB_ACCESS_TOKEN_MAX_CHARS:
        raise JWTError("Invalid JWT")
    try:
        header_part, payload_part, signature_part = token.split(".", 2)
        header = json.loads(base64_urldecode(header_part))
        payload = json.loads(base64_urldecode(payload_part))
    except (ValueError, json.JSONDecodeError) as exc:
        raise JWTError("Invalid JWT") from exc

    expected_signature = _sign_jwt(header_part, payload_part)
    if not hmac.compare_digest(signature_part, expected_signature):
        raise JWTError("Invalid JWT signature")

    if not isinstance(header, dict) or header.get("alg") != "HS256":
        raise JWTError("Unsupported JWT algorithm")
    if not isinstance(payload, dict):
        raise JWTError("Invalid JWT payload")
    if payload.get("typ") != "access":
        raise JWTError("Invalid JWT type")
    if payload.get("iss") != settings.jwt_issuer:
        raise JWTError("Invalid JWT issuer")
    if payload.get("aud") != settings.jwt_audience:
        raise JWTError("Invalid JWT audience")

    exp = payload.get("exp")
    now = int(time.time())
    if not isinstance(exp, int) or exp <= now:
        raise JWTError("Expired JWT")
    issued_at = payload.get("iat")
    if not isinstance(issued_at, int) or issued_at > now + 60:
        raise JWTError("Invalid JWT issued-at time")

    subject = payload.get("sub")
    session_id = payload.get("sid")
    if not isinstance(subject, str) or not isinstance(session_id, str):
        raise JWTError("Missing JWT subject or session")
    try:
        return UUID(subject), UUID(session_id)
    except ValueError as exc:
        raise JWTError("Invalid JWT subject or session") from exc


def verify_web_access_token(token: str) -> UUID:
    user_id, _ = verify_web_access_token_claims(token)
    return user_id


def issue_web_refresh_token(session_id: UUID) -> str:
    return f"{session_id}.{secrets.token_urlsafe(48)}"


def hash_web_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _web_refresh_session_id(token: str) -> UUID:
    if len(token) > WEB_REFRESH_TOKEN_MAX_CHARS:
        raise ValueError("Invalid refresh token")
    session_id, separator, secret = token.partition(".")
    if not separator or len(secret) < 32:
        raise ValueError("Invalid refresh token")
    return UUID(session_id)


def _as_utc(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def _web_session_is_active(
    web_session: WebSession,
    *,
    now: datetime | None = None,
) -> bool:
    current_time = now or datetime.now(timezone.utc)
    if web_session.revoked_at is not None or _as_utc(web_session.expires_at) <= current_time:
        return False
    idle_expires_at = web_session.idle_expires_at
    return idle_expires_at is None or _as_utc(idle_expires_at) > current_time


def _active_web_session(db: Session, token: str) -> WebSession | None:
    try:
        user_id, session_id = verify_web_access_token_claims(token)
    except (JWTError, RuntimeError):
        return None
    web_session = db.get(WebSession, session_id)
    if web_session is None or web_session.user_id != user_id:
        return None
    if not _web_session_is_active(web_session):
        return None
    return web_session


def web_session_for_refresh(
    db: Session,
    token: str,
    *,
    lock: bool = False,
    now: datetime | None = None,
) -> tuple[WebSession, Literal["current", "previous"]] | None:
    try:
        session_id = _web_refresh_session_id(token)
    except ValueError:
        return None
    web_session = db.get(WebSession, session_id, with_for_update=lock)
    current_time = now or datetime.now(timezone.utc)
    if web_session is None or not _web_session_is_active(web_session, now=current_time):
        return None

    token_hash = hash_web_refresh_token(token)
    if web_session.refresh_token_hash and secrets.compare_digest(
        token_hash,
        web_session.refresh_token_hash,
    ):
        return web_session, "current"

    previous_expires_at = web_session.previous_refresh_token_expires_at
    if (
        web_session.previous_refresh_token_hash
        and previous_expires_at is not None
        and _as_utc(previous_expires_at) > current_time
        and secrets.compare_digest(token_hash, web_session.previous_refresh_token_hash)
    ):
        return web_session, "previous"
    return None


def rotate_web_refresh_token(
    web_session: WebSession,
    *,
    now: datetime | None = None,
) -> str:
    current_time = now or datetime.now(timezone.utc)
    refresh_token = issue_web_refresh_token(web_session.id)
    web_session.previous_refresh_token_hash = web_session.refresh_token_hash
    web_session.previous_refresh_token_expires_at = min(
        _as_utc(web_session.expires_at),
        current_time + timedelta(seconds=settings.refresh_token_rotation_grace_seconds),
    )
    web_session.refresh_token_hash = hash_web_refresh_token(refresh_token)
    web_session.idle_expires_at = min(
        _as_utc(web_session.expires_at),
        current_time + timedelta(seconds=settings.refresh_token_idle_ttl_seconds),
    )
    return refresh_token


def revoke_web_session_token(db: Session, token: str | None) -> bool:
    if not token:
        return False
    web_session = _active_web_session(db, token)
    if web_session is None:
        return False
    web_session.revoked_at = datetime.now(timezone.utc)
    db.flush()
    return True


def revoke_web_refresh_token(db: Session, token: str | None) -> bool:
    if not token:
        return False
    try:
        session_id = _web_refresh_session_id(token)
    except ValueError:
        return False
    web_session = db.get(WebSession, session_id, with_for_update=True)
    if web_session is None:
        return False
    token_hash = hash_web_refresh_token(token)
    token_matches = any(
        candidate and secrets.compare_digest(token_hash, candidate)
        for candidate in (
            web_session.refresh_token_hash,
            web_session.previous_refresh_token_hash,
        )
    )
    if not token_matches:
        return False
    if web_session.revoked_at is None:
        web_session.revoked_at = datetime.now(timezone.utc)
        db.flush()
    return True


def _bearer_token(authorization: str | None) -> str | None:
    if authorization is None:
        return None
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None
    return token


def require_ingest_token(
    authorization: str | None = Header(default=None),
    x_promty_collector_version: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User | None:
    token = _bearer_token(authorization)
    if settings.api_token is None and token is None and settings.allow_anonymous_ingest:
        return None

    if settings.api_token is not None and token is not None:
        if secrets.compare_digest(token, settings.api_token):
            return None

    if token is not None:
        collector_token = db.scalar(
            select(CollectorToken).where(
                CollectorToken.token_hash == hash_collector_token(token),
                CollectorToken.revoked_at.is_(None),
            )
        )
        if collector_token is not None:
            if collector_token.user.suspended_at is not None:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Promty account is suspended",
                )
            collector_token.last_used_at = datetime.now(timezone.utc)
            if x_promty_collector_version:
                collector_token.collector_version = x_promty_collector_version.strip()[:64]
            db.flush()
            return collector_token.user

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid Promty ingest token",
    )


def require_collector_user(
    authorization: str | None = Header(default=None),
    x_promty_collector_version: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    """Authenticate a user-owned collector token for private read APIs.

    Unlike event ingest, this deliberately rejects the global ingest token and
    anonymous development mode so a shared secret cannot read user context.
    """
    token = _bearer_token(authorization)
    if token is not None:
        collector_token = db.scalar(
            select(CollectorToken).where(
                CollectorToken.token_hash == hash_collector_token(token),
                CollectorToken.revoked_at.is_(None),
            )
        )
        if collector_token is not None:
            if collector_token.user.suspended_at is not None:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Promty account is suspended",
                )
            collector_token.last_used_at = datetime.now(timezone.utc)
            if x_promty_collector_version:
                collector_token.collector_version = x_promty_collector_version.strip()[:64]
            db.flush()
            return collector_token.user

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid Promty collector token",
    )


def get_optional_web_user(
    request: Request,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User | None:
    token = _bearer_token(authorization) or request.cookies.get(settings.session_cookie_name)
    if not token:
        return None

    web_session = _active_web_session(db, token)
    return web_session.user if web_session is not None else None


def is_admin_user(user: User) -> bool:
    admin_github_ids = set(settings.admin_github_ids)
    return user.github_id is not None and str(user.github_id) in admin_github_ids


def require_web_user(
    user: User | None = Depends(get_optional_web_user),
) -> User:
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Promty login required",
        )
    if user.suspended_at is not None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Promty account is suspended",
        )
    return user


def require_admin_user(
    user: User = Depends(require_web_user),
) -> User:
    if not is_admin_user(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Promty admin access required",
        )
    return user


def require_external_ai_consent(
    user: User = Depends(require_web_user),
) -> User:
    from app.core.policies import user_allows_external_ai, user_has_current_policy_acceptance

    if not user_has_current_policy_acceptance(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accept the current Terms and Privacy Notice before using AI generation.",
        )
    if not user_allows_external_ai(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="External AI processing is disabled for this account.",
        )
    return user
