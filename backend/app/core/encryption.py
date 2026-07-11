from __future__ import annotations

import base64
import hashlib
import json
import os
from typing import Any

from cryptography.exceptions import InvalidTag
from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.core.config import settings
from app.core.encoding import base64_urldecode, base64_urlencode

ENCRYPTED_TEXT_MARKER = "__buildhub_encrypted_text__"
ENCRYPTED_TEXT_PREFIX = "bhenc:v1:"
APP_TEXT_ALGORITHM = "AES-256-GCM"


class EncryptionError(RuntimeError):
    pass


class EncryptionConfigurationError(EncryptionError):
    pass


class EncryptionDecryptionError(EncryptionError):
    pass


def _github_token_secret() -> str:
    secret = (
        settings.github_token_encryption_key
        or settings.jwt_secret
        or settings.oauth_state_secret
        or settings.api_token
    )
    if not secret:
        raise EncryptionConfigurationError("GitHub token encryption key is not configured")
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
        raise EncryptionDecryptionError(
            "GitHub token encryption key cannot decrypt stored token"
        ) from exc


def _app_encryption_secret() -> str:
    secrets = _app_encryption_secrets()
    secret = secrets[0] if secrets else None
    if not secret:
        raise EncryptionConfigurationError("Application encryption key is not configured")
    return secret


def _app_encryption_secrets() -> list[str]:
    values = (
        settings.app_encryption_key,
        *settings.app_encryption_previous_keys,
        settings.jwt_secret,
        settings.oauth_state_secret,
        settings.api_token,
    )
    secrets: list[str] = []
    for value in values:
        if value and value not in secrets:
            secrets.append(value)
    return secrets


def _key_from_secret(secret: str) -> bytes:
    return hashlib.sha256(secret.encode("utf-8")).digest()


def _app_encryption_key() -> bytes:
    return _key_from_secret(_app_encryption_secret())


def _aad(purpose: str) -> bytes:
    return f"buildhub:{purpose}".encode("utf-8")


def _encryption_error() -> EncryptionDecryptionError:
    return EncryptionDecryptionError(
        "Application encryption key cannot decrypt stored data"
    )


def encrypt_app_text(value: str, *, purpose: str) -> dict[str, Any]:
    nonce = os.urandom(12)
    ciphertext = AESGCM(_app_encryption_key()).encrypt(
        nonce,
        value.encode("utf-8"),
        _aad(purpose),
    )
    return {
        ENCRYPTED_TEXT_MARKER: True,
        "alg": APP_TEXT_ALGORITHM,
        "v": 1,
        "key_id": settings.app_encryption_key_id,
        "nonce": base64_urlencode(nonce),
        "ciphertext": base64_urlencode(ciphertext),
    }


def is_encrypted_app_text(value: Any) -> bool:
    return (
        isinstance(value, dict)
        and value.get(ENCRYPTED_TEXT_MARKER) is True
        and value.get("alg") == APP_TEXT_ALGORITHM
        and value.get("v") == 1
    )


def decrypt_app_text(value: dict[str, Any], *, purpose: str) -> str:
    if not is_encrypted_app_text(value):
        raise _encryption_error()
    nonce = value.get("nonce")
    ciphertext = value.get("ciphertext")
    if not isinstance(nonce, str) or not isinstance(ciphertext, str):
        raise _encryption_error()
    try:
        nonce_bytes = base64_urldecode(nonce)
        ciphertext_bytes = base64_urldecode(ciphertext)
    except ValueError as exc:
        raise _encryption_error() from exc

    last_error: Exception | None = None
    for secret in _app_encryption_secrets():
        try:
            plaintext = AESGCM(_key_from_secret(secret)).decrypt(
                nonce_bytes,
                ciphertext_bytes,
                _aad(purpose),
            )
            return plaintext.decode("utf-8")
        except (InvalidTag, ValueError) as exc:
            last_error = exc

    raise _encryption_error() from last_error


def maybe_decrypt_app_text(value: Any, *, purpose: str) -> str | None:
    if isinstance(value, str):
        return value
    if is_encrypted_app_text(value):
        return decrypt_app_text(value, purpose=purpose)
    return None


def encrypt_app_text_to_string(value: str, *, purpose: str) -> str:
    envelope = encrypt_app_text(value, purpose=purpose)
    payload = json.dumps(envelope, separators=(",", ":"), sort_keys=True).encode("utf-8")
    return f"{ENCRYPTED_TEXT_PREFIX}{base64_urlencode(payload)}"


def maybe_decrypt_app_text_from_string(value: str | None, *, purpose: str) -> str | None:
    if value is None:
        return None
    if not value.startswith(ENCRYPTED_TEXT_PREFIX):
        return value
    encoded = value[len(ENCRYPTED_TEXT_PREFIX) :]
    try:
        envelope = json.loads(base64_urldecode(encoded))
    except (ValueError, json.JSONDecodeError) as exc:
        raise _encryption_error() from exc
    if not isinstance(envelope, dict):
        raise _encryption_error()
    return decrypt_app_text(envelope, purpose=purpose)
