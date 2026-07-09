from __future__ import annotations

import hashlib
import hmac
import json
import time
from typing import Any
from urllib import parse

from fastapi import HTTPException, status

from app.core.config import settings
from app.core.encoding import base64_urldecode, base64_urlencode

STATE_TTL_SECONDS = 600


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


def encode_oauth_state(payload: dict[str, Any]) -> str:
    body = base64_urlencode(
        json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    )
    signature = hmac.new(_state_secret(), body.encode("ascii"), hashlib.sha256).digest()
    return f"{body}.{base64_urlencode(signature)}"


def decode_oauth_state(value: str) -> dict[str, Any]:
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


def validate_cli_redirect_uri(uri: str) -> str:
    parsed = parse.urlparse(uri)
    if (
        parsed.scheme != "http"
        or parsed.hostname not in {"127.0.0.1", "localhost"}
        or parsed.path != "/callback"
    ):
        raise HTTPException(status_code=400, detail="Invalid CLI redirect_uri")
    return uri


def validate_web_return_to(uri: str | None) -> str:
    if not uri:
        return settings.app_url.rstrip("/")

    parsed = parse.urlparse(uri)
    app = parse.urlparse(settings.app_url)
    if parsed.scheme != app.scheme or parsed.netloc != app.netloc:
        raise HTTPException(status_code=400, detail="Invalid web return_to URL")
    if parsed.path.startswith("//"):
        raise HTTPException(status_code=400, detail="Invalid web return_to URL")
    return uri


def nonce_hash(nonce: str) -> str:
    return hashlib.sha256(nonce.encode("utf-8")).hexdigest()


def require_web_oauth_nonce(payload: dict[str, Any], nonce: str | None) -> None:
    expected = payload.get("web_nonce_hash")
    if not isinstance(expected, str) or nonce is None:
        raise HTTPException(status_code=400, detail="Missing OAuth state cookie")
    if not hmac.compare_digest(expected, nonce_hash(nonce)):
        raise HTTPException(status_code=400, detail="Invalid OAuth state cookie")
