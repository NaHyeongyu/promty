from __future__ import annotations

import time

import pytest
from fastapi import HTTPException

from app.core.config import settings
from app.services.oauth_state import (
    STATE_TTL_SECONDS,
    decode_oauth_state,
    encode_oauth_state,
    nonce_hash,
    require_web_oauth_nonce,
    validate_cli_redirect_uri,
    validate_web_return_to,
)


def test_oauth_state_round_trip_rejects_tampering() -> None:
    payload = {
        "iat": int(time.time()),
        "mode": "web",
        "return_to": settings.app_url.rstrip("/"),
        "web_nonce_hash": nonce_hash("nonce"),
    }

    token = encode_oauth_state(payload)

    assert decode_oauth_state(token) == payload

    body, signature = token.rsplit(".", 1)
    replacement = "A" if body[0] != "A" else "B"
    tampered_token = f"{replacement}{body[1:]}.{signature}"

    with pytest.raises(HTTPException) as exc:
        decode_oauth_state(tampered_token)

    assert exc.value.status_code == 400


def test_oauth_state_rejects_expired_payload() -> None:
    token = encode_oauth_state(
        {
            "iat": int(time.time()) - STATE_TTL_SECONDS - 60,
            "mode": "cli",
        }
    )

    with pytest.raises(HTTPException) as exc:
        decode_oauth_state(token)

    assert exc.value.status_code == 400
    assert exc.value.detail == "Expired OAuth state"


def test_validate_cli_redirect_uri_allows_only_local_callback() -> None:
    assert (
        validate_cli_redirect_uri("http://127.0.0.1:39123/callback")
        == "http://127.0.0.1:39123/callback"
    )
    assert (
        validate_cli_redirect_uri("http://localhost:39123/callback")
        == "http://localhost:39123/callback"
    )

    for uri in (
        "https://127.0.0.1:39123/callback",
        "http://0.0.0.0:39123/callback",
        "http://127.0.0.1:39123/other",
        "http://example.com/callback",
    ):
        with pytest.raises(HTTPException):
            validate_cli_redirect_uri(uri)


def test_validate_web_return_to_stays_on_app_origin() -> None:
    app_url = settings.app_url.rstrip("/")

    assert validate_web_return_to(None) == app_url
    assert validate_web_return_to(f"{app_url}/projects") == f"{app_url}/projects"

    for uri in (
        "https://example.com/projects",
        f"{app_url}//example.com",
    ):
        with pytest.raises(HTTPException):
            validate_web_return_to(uri)


def test_require_web_oauth_nonce_matches_cookie_hash() -> None:
    payload = {"web_nonce_hash": nonce_hash("nonce")}

    require_web_oauth_nonce(payload, "nonce")

    with pytest.raises(HTTPException) as missing_exc:
        require_web_oauth_nonce(payload, None)
    with pytest.raises(HTTPException) as invalid_exc:
        require_web_oauth_nonce(payload, "other")

    assert missing_exc.value.status_code == 400
    assert invalid_exc.value.status_code == 400
