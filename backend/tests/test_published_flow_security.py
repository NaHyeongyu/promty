from __future__ import annotations

from app.core.encryption import ENCRYPTED_TEXT_PREFIX
from app.services.published_flow_redaction import (
    PUBLISHED_FLOW_PROMPT_PURPOSE,
    protected_published_text,
    readable_published_text,
    redact_text,
)


def test_redaction_covers_common_secret_and_local_identity_formats() -> None:
    source = "\n".join(
        (
            "Authorization: Bearer very-secret-bearer-token",
            "AWS_ACCESS_KEY_ID=AKIAABCDEFGHIJKLMNOP",
            "DATABASE_URL=postgresql://admin:db-password@db.example.test/app",
            "JWT=eyJabcdefghijk.abcdefghijklmnop.abcdefghijklmnop",
            "-----BEGIN PRIVATE KEY-----\nprivate-material\n-----END PRIVATE KEY-----",
            "/Users/alice/work/project",
        )
    )

    redacted = redact_text(source) or ""

    for secret in (
        "very-secret-bearer-token",
        "AKIAABCDEFGHIJKLMNOP",
        "db-password",
        "eyJabcdefghijk",
        "private-material",
        "/Users/alice",
    ):
        assert secret not in redacted
    assert "[redacted" in redacted


def test_published_prompt_text_is_redacted_then_encrypted_at_rest() -> None:
    stored = protected_published_text(
        "token=ghp_abcdefghijklmnopqrstuvwxyz123456",
        purpose=PUBLISHED_FLOW_PROMPT_PURPOSE,
    )

    assert stored is not None
    assert stored.startswith(ENCRYPTED_TEXT_PREFIX)
    assert "ghp_" not in stored
    assert (
        readable_published_text(
            stored,
            purpose=PUBLISHED_FLOW_PROMPT_PURPOSE,
        )
        == "token=[redacted]"
    )


def test_legacy_plaintext_published_content_remains_readable() -> None:
    assert (
        readable_published_text(
            "legacy prompt",
            purpose=PUBLISHED_FLOW_PROMPT_PURPOSE,
        )
        == "legacy prompt"
    )
