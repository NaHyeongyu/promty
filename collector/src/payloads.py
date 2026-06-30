from __future__ import annotations

from collections.abc import Mapping
from typing import Any

SESSION_ID_KEYS = ("session_id", "conversation_id", "thread_id")
WORKSPACE_KEYS = ("cwd", "working_directory", "workspace")
PROJECT_CONTEXT_KEYS = ("project_id", *WORKSPACE_KEYS)
TURN_ID_KEYS = ("turn_id", "turn", "message_index")


def payload_views(payload: Mapping[str, Any]) -> tuple[Mapping[str, Any], ...]:
    nested_payload = payload.get("payload")
    if isinstance(nested_payload, Mapping):
        return nested_payload, payload
    return (payload,)


def get_first_value(payload: Mapping[str, Any], keys: tuple[str, ...]) -> Any:
    return first_value(payload_views(payload), keys)


def get_first_string(payload: Mapping[str, Any], keys: tuple[str, ...]) -> str | None:
    return first_string(payload_views(payload), keys)


def first_value(payloads: tuple[Mapping[str, Any], ...], keys: tuple[str, ...]) -> Any:
    for payload in payloads:
        for key in keys:
            if key in payload and payload[key] is not None:
                return payload[key]
    return None


def first_string(payloads: tuple[Mapping[str, Any], ...], keys: tuple[str, ...]) -> str | None:
    value = first_value(payloads, keys)
    return value if isinstance(value, str) and value else None


def first_int(payloads: tuple[Mapping[str, Any], ...], keys: tuple[str, ...]) -> int | None:
    value = first_value(payloads, keys)
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.isdigit():
        return int(value)
    return None


def first_bool(payloads: tuple[Mapping[str, Any], ...], keys: tuple[str, ...]) -> bool | None:
    value = first_value(payloads, keys)
    return value if isinstance(value, bool) else None


def string_list(payloads: tuple[Mapping[str, Any], ...], keys: tuple[str, ...]) -> list[str]:
    value = first_value(payloads, keys)
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, str)]
