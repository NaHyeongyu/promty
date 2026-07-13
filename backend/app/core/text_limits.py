from __future__ import annotations

from typing import Any


PROJECT_MEMORY_BODY_MAX_BYTES = 131_072
PROJECT_MEMORY_UPDATE_REQUEST_MAX_BYTES = 1_048_576
PROJECT_MEMORY_WARNING_MAX_ITEMS = 32


def ensure_utf8_byte_limit(
    value: str,
    *,
    field_name: str,
    max_bytes: int,
) -> str:
    if len(value.encode("utf-8")) > max_bytes:
        raise ValueError(f"{field_name} must be at most {max_bytes} UTF-8 bytes")
    return value


def truncate_utf8_bytes(value: Any, *, max_bytes: int) -> str:
    if not isinstance(value, str):
        return ""
    encoded = value.encode("utf-8")
    if len(encoded) <= max_bytes:
        return value
    return encoded[:max_bytes].decode("utf-8", errors="ignore")
