from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from events import (
    SUPPORTED_EVENT_TYPES,
    BaseEvent,
    CommitCreatedPayload,
    EventType,
    FilesChangedPayload,
    PromptSubmittedPayload,
    ResponseReceivedPayload,
    SessionEndedPayload,
    SessionStartedPayload,
    SupportedTool,
    build_event,
    normalize_event_type,
)

EXTERNAL_EVENT_ALIASES: dict[str, EventType] = {
    "UserPromptSubmit": "PromptSubmitted",
    "user_prompt_submit": "PromptSubmitted",
    "prompt_sent": "PromptSubmitted",
    "prompt_submitted": "PromptSubmitted",
    "session_started": "SessionStarted",
    "session_ended": "SessionEnded",
    "files_changed": "FilesChanged",
    "commit_created": "CommitCreated",
    "response_received": "ResponseReceived",
    "prompt_response": "ResponseReceived",
}


def _payload_views(payload: Mapping[str, Any]) -> tuple[Mapping[str, Any], ...]:
    nested_payload = payload.get("payload")
    if isinstance(nested_payload, dict):
        return nested_payload, payload
    return (payload,)


def _get_first_string(payloads: tuple[Mapping[str, Any], ...], keys: tuple[str, ...]) -> str | None:
    for payload in payloads:
        for key in keys:
            value = payload.get(key)
            if isinstance(value, str) and value:
                return value
    return None


def _get_first_value(payloads: tuple[Mapping[str, Any], ...], keys: tuple[str, ...]) -> Any:
    for payload in payloads:
        for key in keys:
            if key in payload and payload[key] is not None:
                return payload[key]
    return None


def _get_first_int(payloads: tuple[Mapping[str, Any], ...], keys: tuple[str, ...]) -> int | None:
    value = _get_first_value(payloads, keys)
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.isdigit():
        return int(value)
    return None


def _get_first_bool(payloads: tuple[Mapping[str, Any], ...], keys: tuple[str, ...]) -> bool | None:
    value = _get_first_value(payloads, keys)
    if isinstance(value, bool):
        return value
    return None


def _get_string_list(payloads: tuple[Mapping[str, Any], ...], keys: tuple[str, ...]) -> list[str]:
    value = _get_first_value(payloads, keys)
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, str)]


def infer_event_type(raw_payload: Mapping[str, Any], default: EventType = "PromptSubmitted") -> EventType:
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


def normalize_event_payload(
    event_type: EventType,
    raw_payload: Mapping[str, Any],
) -> (
    SessionStartedPayload
    | PromptSubmittedPayload
    | ResponseReceivedPayload
    | FilesChangedPayload
    | CommitCreatedPayload
    | SessionEndedPayload
):
    payloads = _payload_views(raw_payload)

    if event_type == "SessionStarted":
        return SessionStartedPayload(
            cwd=_get_first_string(payloads, ("cwd", "working_directory", "workspace")),
            branch=_get_first_string(payloads, ("branch", "git_branch")),
            model=_get_first_string(payloads, ("model", "model_name")),
            permission_mode=_get_first_string(payloads, ("permission_mode",)),
            session_id=_get_first_string(payloads, ("session_id", "conversation_id", "thread_id")),
        )

    if event_type == "PromptSubmitted":
        prompt = _get_first_string(payloads, ("prompt", "input", "text", "message"))
        if not prompt or not prompt.strip():
            raise ValueError("Hook payload is missing a non-empty prompt/input")

        return PromptSubmittedPayload(
            prompt=prompt,
            cwd=_get_first_string(payloads, ("cwd", "working_directory", "workspace")),
            model=_get_first_string(payloads, ("model", "model_name")),
            permission_mode=_get_first_string(payloads, ("permission_mode",)),
            transcript_path=_get_first_string(payloads, ("transcript_path", "transcript")),
            turn_id=_get_first_value(payloads, ("turn_id", "turn", "message_index")),
            session_id=_get_first_string(payloads, ("session_id", "conversation_id", "thread_id")),
            branch=_get_first_string(payloads, ("branch", "git_branch")),
            hook_event_name=_get_first_string(payloads, ("hook_event_name",)),
            approval_policy=_get_first_string(payloads, ("approval_policy",)),
            sandbox_mode=_get_first_string(payloads, ("sandbox_mode",)),
        )

    if event_type == "ResponseReceived":
        return ResponseReceivedPayload(
            tokens=_get_first_int(payloads, ("tokens", "total_tokens")),
            duration_ms=_get_first_int(payloads, ("duration_ms", "elapsed_ms")),
            success=_get_first_bool(payloads, ("success", "ok")),
            model=_get_first_string(payloads, ("model", "model_name")),
            session_id=_get_first_string(payloads, ("session_id", "conversation_id", "thread_id")),
        )

    if event_type == "FilesChanged":
        return FilesChangedPayload(
            files=_get_string_list(payloads, ("files", "changed_files", "paths")),
            cwd=_get_first_string(payloads, ("cwd", "working_directory", "workspace")),
            session_id=_get_first_string(payloads, ("session_id", "conversation_id", "thread_id")),
        )

    if event_type == "CommitCreated":
        return CommitCreatedPayload(
            hash=_get_first_string(payloads, ("hash", "commit_hash", "sha")),
            message=_get_first_string(payloads, ("message", "commit_message")),
            branch=_get_first_string(payloads, ("branch", "git_branch")),
            cwd=_get_first_string(payloads, ("cwd", "working_directory", "workspace")),
            session_id=_get_first_string(payloads, ("session_id", "conversation_id", "thread_id")),
        )

    if event_type == "SessionEnded":
        return SessionEndedPayload(
            reason=_get_first_string(payloads, ("reason", "exit_reason")),
            duration=_get_first_int(payloads, ("duration", "duration_seconds")),
            session_id=_get_first_string(payloads, ("session_id", "conversation_id", "thread_id")),
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
