from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from events import (
    SUPPORTED_EVENT_TYPES,
    BaseEvent,
    EventType,
    SupportedTool,
    build_event,
    normalize_event_type,
)

EXTERNAL_EVENT_ALIASES: dict[str, EventType] = {
    "UserPromptSubmit": "PROMPT_SENT",
    "user_prompt_submit": "PROMPT_SENT",
    "prompt_sent": "PROMPT_SENT",
    "session_started": "SESSION_STARTED",
    "session_ended": "SESSION_ENDED",
    "files_changed": "FILES_CHANGED",
    "commit_created": "COMMIT_CREATED",
}


def _get_first_string(payload: Mapping[str, Any], keys: tuple[str, ...]) -> str | None:
    for key in keys:
        value = payload.get(key)
        if isinstance(value, str) and value:
            return value
    return None


def _get_first_value(payload: Mapping[str, Any], keys: tuple[str, ...]) -> Any:
    for key in keys:
        if key in payload and payload[key] is not None:
            return payload[key]
    return None


def _compact(payload: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in payload.items() if value is not None}


def infer_event_type(raw_payload: Mapping[str, Any], default: EventType = "PROMPT_SENT") -> EventType:
    explicit_event_type = raw_payload.get("event_type")
    if isinstance(explicit_event_type, str):
        return normalize_event_type(explicit_event_type)

    for key in ("hook_event_name", "type", "event"):
        raw_event_type = raw_payload.get(key)
        if not isinstance(raw_event_type, str):
            continue
        if raw_event_type in SUPPORTED_EVENT_TYPES:
            return normalize_event_type(raw_event_type)
        alias = EXTERNAL_EVENT_ALIASES.get(raw_event_type)
        if alias:
            return alias

    return default


def normalize_event_payload(event_type: EventType, raw_payload: Mapping[str, Any]) -> dict[str, Any]:
    nested_payload = raw_payload.get("payload")
    if isinstance(nested_payload, dict):
        raw_payload = nested_payload

    if event_type == "SESSION_STARTED":
        return _compact(
            {
                "cwd": _get_first_string(raw_payload, ("cwd", "working_directory", "workspace")),
                "branch": _get_first_string(raw_payload, ("branch", "git_branch")),
                "model": _get_first_string(raw_payload, ("model", "model_name")),
            }
        )

    if event_type == "PROMPT_SENT":
        prompt = _get_first_string(raw_payload, ("prompt", "input", "text", "message"))
        if not prompt or not prompt.strip():
            raise ValueError("Hook payload is missing a non-empty prompt/input")

        return _compact(
            {
                "prompt": prompt,
                "cwd": _get_first_string(raw_payload, ("cwd", "working_directory", "workspace")),
                "model": _get_first_string(raw_payload, ("model", "model_name")),
                "transcript_path": _get_first_string(raw_payload, ("transcript_path", "transcript")),
                "turn": _get_first_value(raw_payload, ("turn", "turn_id", "message_index")),
            }
        )

    if event_type == "PROMPT_RESPONSE":
        return _compact(
            {
                "tokens": _get_first_value(raw_payload, ("tokens", "total_tokens")),
                "duration_ms": _get_first_value(raw_payload, ("duration_ms", "elapsed_ms")),
                "success": _get_first_value(raw_payload, ("success", "ok")),
            }
        )

    if event_type == "FILES_CHANGED":
        files = _get_first_value(raw_payload, ("files", "changed_files", "paths"))
        return {"files": files if isinstance(files, list) else []}

    if event_type == "COMMIT_CREATED":
        return _compact(
            {
                "hash": _get_first_string(raw_payload, ("hash", "commit_hash", "sha")),
                "message": _get_first_string(raw_payload, ("message", "commit_message")),
            }
        )

    if event_type == "SESSION_ENDED":
        return _compact(
            {
                "reason": _get_first_string(raw_payload, ("reason", "exit_reason")),
                "duration": _get_first_value(raw_payload, ("duration", "duration_seconds")),
            }
        )

    raise ValueError(f"Unsupported event type: {event_type}")


def normalize_tool_event(
    tool: SupportedTool,
    raw_payload: Mapping[str, Any],
    event_type: EventType | None = None,
) -> BaseEvent:
    event_type = event_type or infer_event_type(raw_payload)
    normalized_payload = normalize_event_payload(event_type, raw_payload)
    return build_event(
        tool=tool,
        event_type=event_type,
        payload=normalized_payload,
        raw_payload=dict(raw_payload),
    )
