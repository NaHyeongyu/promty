from __future__ import annotations

import json
import os
from collections.abc import Mapping
from pathlib import Path
from typing import Any

from payloads import first_string, first_value, payload_views

RESPONSE_CAPTURE_MAX_CHARS = int(
    os.environ.get("PROMPTHUB_RESPONSE_CAPTURE_MAX_CHARS", "50000")
)
TRANSCRIPT_CAPTURE_MAX_BYTES = int(
    os.environ.get("PROMPTHUB_RESPONSE_TRANSCRIPT_MAX_BYTES", "1048576")
)
RESPONSE_KEYS = (
    "response",
    "assistant_response",
    "assistant_message",
    "last_assistant_message",
    "answer",
    "completion",
    "output",
    "output_text",
    "result",
    "text",
    "message",
    "content",
)
TRANSCRIPT_PATH_KEYS = ("transcript_path", "transcript")
ASSISTANT_ROLES = {"assistant", "ai", "model"}
SKIPPED_CONTENT_TYPES = {"tool_call", "tool_result", "tool_use", "function_call"}


def response_payload_fields(raw_payload: Mapping[str, Any]) -> dict[str, Any]:
    payloads = payload_views(raw_payload)
    response_source: str | None = None
    response_text = _direct_response_text(payloads)
    if response_text:
        response_source = "hook_payload"

    transcript_path = first_string(payloads, TRANSCRIPT_PATH_KEYS)
    if not response_text and transcript_path:
        response_text = _response_text_from_transcript(transcript_path)
        if response_text:
            response_source = "transcript"

    fields: dict[str, Any] = {}
    if transcript_path:
        fields["transcript_path"] = transcript_path
    if not response_text:
        return fields

    original_length = len(response_text)
    limit = max(RESPONSE_CAPTURE_MAX_CHARS, 1)
    fields.update(
        {
            "response": response_text[:limit],
            "response_original_length": original_length,
            "response_source": response_source,
            "response_storage_limit": limit,
            "response_truncated": original_length > limit,
        }
    )
    return fields


def _direct_response_text(payloads: tuple[Mapping[str, Any], ...]) -> str | None:
    for payload in payloads:
        for key in RESPONSE_KEYS:
            value = first_value((payload,), (key,))
            text = _extract_text(value)
            if text:
                return text
    return None


def _response_text_from_transcript(path_value: str) -> str | None:
    transcript_path = Path(path_value).expanduser()
    if not transcript_path.is_file():
        return None

    try:
        content = _read_transcript_tail(transcript_path)
    except OSError:
        return None

    if not content.strip():
        return None

    parsed = _parse_json_document(content)
    if parsed is not None:
        text = _extract_assistant_text(parsed)
        if text:
            return text

    records = []
    for line in content.splitlines():
        if not line.strip():
            continue
        try:
            record = json.loads(line)
        except json.JSONDecodeError:
            continue
        records.append(record)

    for record in reversed(records):
        text = _extract_assistant_text(record)
        if text:
            return text
    return None


def _read_transcript_tail(path: Path) -> str:
    size = path.stat().st_size
    max_bytes = max(TRANSCRIPT_CAPTURE_MAX_BYTES, 1)
    with path.open("rb") as file:
        if size > max_bytes:
            file.seek(size - max_bytes)
            file.readline()
        return file.read(max_bytes).decode("utf-8", errors="ignore")


def _parse_json_document(content: str) -> Any:
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        return None


def _extract_assistant_text(value: Any) -> str | None:
    if isinstance(value, list):
        for item in reversed(value):
            text = _extract_assistant_text(item)
            if text:
                return text
        return None

    if not isinstance(value, dict):
        return None

    role = _role(value)
    if role in ASSISTANT_ROLES:
        return _extract_text(value)

    value_type = value.get("type")
    if isinstance(value_type, str) and "assistant" in value_type.lower():
        text = _extract_text(value)
        if text:
            return text

    for key in ("message", "payload", "item", "data", "response", "event"):
        text = _extract_assistant_text(value.get(key))
        if text:
            return text

    for key in ("messages", "items", "events", "responses", "output"):
        text = _extract_assistant_text(value.get(key))
        if text:
            return text

    return None


def _role(value: Mapping[str, Any]) -> str | None:
    role = value.get("role") or value.get("author")
    if isinstance(role, str):
        return role.lower()
    if isinstance(role, Mapping):
        nested_role = role.get("role") or role.get("name")
        if isinstance(nested_role, str):
            return nested_role.lower()
    return None


def _extract_text(value: Any) -> str | None:
    if isinstance(value, str):
        text = value.strip()
        return text or None

    if isinstance(value, list):
        parts = [_extract_text(item) for item in value]
        text = "\n".join(part for part in parts if part)
        return text.strip() or None

    if not isinstance(value, dict):
        return None

    value_type = value.get("type")
    if isinstance(value_type, str) and value_type in SKIPPED_CONTENT_TYPES:
        return None

    for key in ("text", "output_text", "content", "message", "body", "response"):
        text = _extract_text(value.get(key))
        if text:
            return text

    return None
