from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import hmac
import json
import secrets
import time
from typing import Any
from uuid import UUID

from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.encoding import base64_urldecode, base64_urlencode
from app.db.session import get_db
from app.models.tokens import CollectorToken
from app.models.users import User


class JWTError(ValueError):
    pass


def hash_collector_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def issue_collector_token() -> str:
    return f"ph_{secrets.token_urlsafe(32)}"


def _jwt_secret() -> bytes:
    secret = settings.jwt_secret or settings.oauth_state_secret or settings.api_token
    if not secret:
        raise RuntimeError("PROMPTHUB_JWT_SECRET is not configured")
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


def issue_web_access_token(user: User) -> str:
    now = int(time.time())
    header = base64_urlencode(_json_bytes({"alg": "HS256", "typ": "JWT"}))
    payload = base64_urlencode(
        _json_bytes(
            {
                "aud": settings.jwt_audience,
                "exp": now + settings.access_token_ttl_seconds,
                "iat": now,
                "iss": settings.jwt_issuer,
                "sub": str(user.id),
                "typ": "access",
            }
        )
    )
    return f"{header}.{payload}.{_sign_jwt(header, payload)}"


def verify_web_access_token(token: str) -> UUID:
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
    if not isinstance(exp, int) or exp <= int(time.time()):
        raise JWTError("Expired JWT")

    subject = payload.get("sub")
    if not isinstance(subject, str):
        raise JWTError("Missing JWT subject")
    try:
        return UUID(subject)
    except ValueError as exc:
        raise JWTError("Invalid JWT subject") from exc


def _bearer_token(authorization: str | None) -> str | None:
    if authorization is None:
        return None
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None
    return token


def require_ingest_token(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User | None:
    token = _bearer_token(authorization)
    if settings.api_token is None and token is None:
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
            collector_token.last_used_at = datetime.now(timezone.utc)
            db.flush()
            return collector_token.user

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid Promty ingest token",
    )


def get_optional_web_user(
    request: Request,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User | None:
    token = _bearer_token(authorization) or request.cookies.get(settings.session_cookie_name)
    if not token:
        return None

    try:
        user_id = verify_web_access_token(token)
    except (JWTError, RuntimeError):
        return None

    user = db.get(User, user_id)
    return user


def is_admin_user(user: User) -> bool:
    admin_usernames = {value.lower() for value in settings.admin_usernames}
    admin_emails = {value.lower() for value in settings.admin_emails}
    admin_github_ids = set(settings.admin_github_ids)

    return (
        user.username.lower() in admin_usernames
        or (user.email is not None and user.email.lower() in admin_emails)
        or (user.github_id is not None and str(user.github_id) in admin_github_ids)
    )


def require_web_user(
    user: User | None = Depends(get_optional_web_user),
) -> User:
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Promty login required",
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
