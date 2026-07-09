from __future__ import annotations

from typing import Any


def clean_text(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def truncate(value: Any, limit: int) -> str | None:
    if not isinstance(value, str):
        return None
    cleaned = " ".join(value.split())
    return cleaned if len(cleaned) <= limit else f"{cleaned[: limit - 3].rstrip()}..."
