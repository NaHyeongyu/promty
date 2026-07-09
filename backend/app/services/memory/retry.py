from __future__ import annotations

import re
import time
from typing import Any, Callable


def retry_after_header_delay(headers: Any) -> float | None:
    retry_after = headers.get("Retry-After") if hasattr(headers, "get") else None
    if not retry_after:
        return None
    try:
        return float(retry_after)
    except ValueError:
        return None


def retry_delay_from_text(detail: str) -> float | None:
    match = re.search(r"retry\s+in\s+([0-9]+(?:\.[0-9]+)?)s", detail, flags=re.IGNORECASE)
    if match is None:
        return None
    try:
        return float(match.group(1))
    except ValueError:
        return None


def bounded_retry_delay(
    *,
    attempt: int,
    base_seconds: float,
    body_delay: float | None = None,
    header_delay: float | None = None,
    max_sleep_seconds: float,
) -> float:
    fallback_delay = max(base_seconds, 0.1) * (2**attempt)
    delay = header_delay or body_delay or fallback_delay
    return max(0.1, min(delay, max(max_sleep_seconds, 0.1)))


def sleep_before_retry(
    delay_seconds: float,
    *,
    sleeper: Callable[[float], None] = time.sleep,
) -> None:
    sleeper(delay_seconds)
