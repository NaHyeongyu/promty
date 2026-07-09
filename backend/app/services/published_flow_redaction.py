from __future__ import annotations

import re

MAX_TAGS = 12
MAX_TAG_LENGTH = 40

SECRET_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
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
        value = tag.strip().strip("#").lower()
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
