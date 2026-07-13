from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from adapters.common import normalize_tool_event
from events import BaseEvent, EventType
from payloads import payload_views, first_string


def is_internal_background_prompt(payload: Mapping[str, Any]) -> bool:
    """Identify non-interactive Codex background turns emitted through prompt hooks."""
    payloads = payload_views(payload)
    return (
        first_string(payloads, ("hook_event_name",)) == "UserPromptSubmit"
        and first_string(payloads, ("permission_mode",)) == "bypassPermissions"
        and first_string(payloads, ("transcript_path", "transcript")) is None
    )


def normalize(payload: Mapping[str, Any], event_type: EventType | None = None) -> BaseEvent:
    return normalize_tool_event("codex-cli", payload, event_type)
