from __future__ import annotations

import re

from app.core.encryption import (
    encrypt_app_text_to_string,
    maybe_decrypt_app_text_from_string,
)

MAX_TAGS = 12
MAX_TAG_LENGTH = 40

PUBLISHED_FLOW_PROMPT_PURPOSE = "published-flow.prompt"
PUBLISHED_FLOW_RESPONSE_PURPOSE = "published-flow.response"
PUBLISHED_FLOW_DIFF_PURPOSE = "published-flow.diff"

SECRET_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (
        re.compile(
            r"-----BEGIN(?: [A-Z0-9]+)* PRIVATE KEY-----.*?"
            r"-----END(?: [A-Z0-9]+)* PRIVATE KEY-----",
            re.IGNORECASE | re.DOTALL,
        ),
        "[redacted-private-key]",
    ),
    (
        re.compile(r"(?i)\b(authorization\s*:\s*bearer\s+)[^\s,;]+"),
        r"\1[redacted]",
    ),
    (
        re.compile(r"(?i)\b((?:[a-z][a-z0-9+.-]*://)[^\s/:@]+):[^\s/@]+@"),
        r"\1:[redacted]@",
    ),
    (
        re.compile(
            r"(?i)\b([A-Z0-9_]*(?:API[_-]?KEY|ACCESS[_-]?KEY|TOKEN|SECRET|"
            r"PASSWORD|PASSWD|CREDENTIAL|DATABASE_URL)[A-Z0-9_]*)"
            r"(\s*[:=]\s*)(['\"]?)[^\s'\",;}]{4,}(['\"]?)"
        ),
        r"\1\2\3[redacted]\4",
    ),
    (
        re.compile(
            r"(?i)\b(api[_-]?key|authorization|password|secret|token)\b"
            r"(\s*[:=]\s*)(['\"]?)[^\s'\",;}]{8,}(['\"]?)"
        ),
        r"\1\2\3[redacted]\4",
    ),
    (re.compile(r"\bsk-[A-Za-z0-9_-]{16,}\b"), "[redacted-openai-key]"),
    (re.compile(r"\bghp_[A-Za-z0-9_]{20,}\b"), "[redacted-github-token]"),
    (re.compile(r"\bgithub_pat_[A-Za-z0-9_]{20,}\b"), "[redacted-github-token]"),
    (re.compile(r"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b"), "[redacted-aws-access-key]"),
    (
        re.compile(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b"),
        "[redacted-jwt]",
    ),
    (re.compile(r"/Users/[^/\s]+"), "/Users/[local-user]"),
    (re.compile(r"/home/[^/\s]+"), "/home/[local-user]"),
    (
        re.compile(r"(?i)\b([A-Z]:)[\\/]+Users[\\/]+[^\\/\s]+"),
        r"\1\\Users\\[local-user]",
    ),
)


def redact_text(value: str | None) -> str | None:
    if value is None:
        return None
    redacted = value
    for pattern, replacement in SECRET_PATTERNS:
        redacted = pattern.sub(replacement, redacted)
    return redacted


def normalize_tags(tags: list[str]) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for tag in tags:
        value = (redact_text(tag.strip().strip("#")) or "").lower()
        if not value or value in seen:
            continue
        seen.add(value)
        normalized.append(value[:MAX_TAG_LENGTH])
        if len(normalized) >= MAX_TAGS:
            break
    return normalized


def optional_redacted_text(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return redact_text(stripped) if stripped else None


def protected_published_text(value: str | None, *, purpose: str) -> str | None:
    redacted = redact_text(value)
    if redacted is None:
        return None
    return encrypt_app_text_to_string(redacted, purpose=purpose)


def readable_published_text(value: str | None, *, purpose: str) -> str | None:
    plaintext = maybe_decrypt_app_text_from_string(value, purpose=purpose)
    return redact_text(plaintext)


def redact_file_path(value: str) -> str:
    cleaned = value.replace("\x00", "").strip()[:2048]
    return redact_text(cleaned) or "[redacted-path]"
