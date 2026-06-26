from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from adapters.common import normalize_tool_event
from events import BaseEvent, EventType


def normalize(payload: Mapping[str, Any], event_type: EventType | None = None) -> BaseEvent:
    return normalize_tool_event("cursor", payload, event_type)
