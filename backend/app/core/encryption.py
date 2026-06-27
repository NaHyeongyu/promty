from __future__ import annotations

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException, status

from app.core.config import settings


def _github_token_secret() -> str:
    secret = (
        settings.github_token_encryption_key
        or settings.jwt_secret
        or settings.oauth_state_secret
        or settings.api_token
    )
    if not secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="GitHub token encryption key is not configured",
        )
    return secret


def _fernet() -> Fernet:
    digest = hashlib.sha256(_github_token_secret().encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_github_token(token: str) -> str:
    return _fernet().encrypt(token.encode("utf-8")).decode("ascii")


def decrypt_github_token(value: str) -> str:
    try:
        return _fernet().decrypt(value.encode("ascii")).decode("utf-8")
    except InvalidToken as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="GitHub token encryption key cannot decrypt stored token",
        ) from exc
