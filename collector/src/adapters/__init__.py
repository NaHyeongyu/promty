from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from events import BaseEvent, EventType, normalize_tool


def normalize_collector_event(
    tool: str,
    payload: Mapping[str, Any],
    event_type: EventType | None = None,
) -> BaseEvent:
    normalized_tool = normalize_tool(tool)

    if normalized_tool == "claude-code":
        from adapters.claude.hook import normalize

        return normalize(payload, event_type)
    if normalized_tool == "codex-cli":
        from adapters.codex.hook import normalize

        return normalize(payload, event_type)
    if normalized_tool == "cursor":
        from adapters.cursor.hook import normalize

        return normalize(payload, event_type)
    if normalized_tool == "gemini-cli":
        from adapters.gemini.hook import normalize

        return normalize(payload, event_type)
    raise ValueError(f"Unsupported tool: {tool}")
