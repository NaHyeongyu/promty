from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.core import encryption
from app.core.encryption import (
    EncryptionDecryptionError,
    decrypt_app_text,
    decrypt_github_token,
    encrypt_app_text,
    encrypt_app_text_to_string,
    encrypt_github_token,
    maybe_decrypt_app_text_from_string,
)


def test_app_text_encryption_round_trip() -> None:
    encrypted = encrypt_app_text("sensitive text", purpose="test.payload")

    assert decrypt_app_text(encrypted, purpose="test.payload") == "sensitive text"


def test_app_text_encryption_binds_purpose_as_aad() -> None:
    encrypted = encrypt_app_text("sensitive text", purpose="test.payload")

    with pytest.raises(EncryptionDecryptionError):
        decrypt_app_text(encrypted, purpose="other.payload")


def test_app_text_string_encryption_round_trip() -> None:
    encrypted = encrypt_app_text_to_string("stored patch", purpose="test.patch")

    assert maybe_decrypt_app_text_from_string(encrypted, purpose="test.patch") == "stored patch"


def test_app_text_decryption_accepts_an_explicit_previous_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    legacy_settings = SimpleNamespace(
        api_token=None,
        app_encryption_key="legacy-key",
        app_encryption_key_id="legacy",
        app_encryption_previous_keys=(),
        jwt_secret=None,
        oauth_state_secret=None,
    )
    monkeypatch.setattr(encryption, "settings", legacy_settings)
    encrypted = encrypt_app_text("rotated text", purpose="test.rotation")

    rotated_settings = SimpleNamespace(
        api_token=None,
        app_encryption_key="current-key",
        app_encryption_key_id="current",
        app_encryption_previous_keys=("legacy-key",),
        jwt_secret=None,
        oauth_state_secret=None,
    )
    monkeypatch.setattr(encryption, "settings", rotated_settings)

    assert decrypt_app_text(encrypted, purpose="test.rotation") == "rotated text"


def test_github_token_encryption_round_trip() -> None:
    token = "ghp_example_token_value_for_test"

    encrypted = encrypt_github_token(token)

    assert decrypt_github_token(encrypted) == token
