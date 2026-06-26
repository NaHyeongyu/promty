from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
import os
from typing import Any, Literal
from uuid import NAMESPACE_DNS, UUID, uuid4, uuid5

SupportedTool = Literal["claude-code", "codex-cli", "cursor", "gemini-cli"]
EventType = Literal[
    "SESSION_STARTED",
    "PROMPT_SENT",
    "PROMPT_RESPONSE",
    "FILES_CHANGED",
    "COMMIT_CREATED",
    "SESSION_ENDED",
]

SUPPORTED_TOOLS: tuple[SupportedTool, ...] = (
    "claude-code",
    "codex-cli",
    "cursor",
    "gemini-cli",
)
SUPPORTED_EVENT_TYPES: tuple[EventType, ...] = (
    "SESSION_STARTED",
    "PROMPT_SENT",
    "PROMPT_RESPONSE",
    "FILES_CHANGED",
    "COMMIT_CREATED",
    "SESSION_ENDED",
)

TOOL_ALIASES: dict[str, SupportedTool] = {
    "claude": "claude-code",
    "claude-code": "claude-code",
    "codex": "codex-cli",
    "codex-cli": "codex-cli",
    "cursor": "cursor",
    "gemini": "gemini-cli",
    "gemini-cli": "gemini-cli",
}


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass(slots=True)
class BaseEvent:
    tool: SupportedTool
    event_type: EventType
    payload: dict[str, Any]
    project_id: str
    session_id: str
    id: str = field(default_factory=lambda: str(uuid4()))
    timestamp: str = field(default_factory=utc_now_iso)

    def to_dict(self) -> dict[str, Any]:
        event = asdict(self)
        return {
            "id": event["id"],
            "project_id": event["project_id"],
            "session_id": event["session_id"],
            "tool": event["tool"],
            "event_type": event["event_type"],
            "timestamp": event["timestamp"],
            "payload": event["payload"],
        }


def normalize_tool(tool: str) -> SupportedTool:
    normalized = TOOL_ALIASES.get(tool)
    if normalized is None:
        raise ValueError(f"Unsupported tool: {tool}")
    return normalized


def normalize_event_type(event_type: str) -> EventType:
    if event_type not in SUPPORTED_EVENT_TYPES:
        raise ValueError(f"Unsupported event type: {event_type}")
    return event_type  # type: ignore[return-value]


def coerce_uuid(value: Any) -> str | None:
    if value is None:
        return None
    try:
        return str(UUID(str(value)))
    except ValueError:
        return None


def stable_uuid(namespace_name: str, value: Any) -> str:
    namespace = uuid5(NAMESPACE_DNS, namespace_name)
    return str(uuid5(namespace, str(value)))


def resolve_project_id(raw_payload: dict[str, Any], event_payload: dict[str, Any]) -> str:
    explicit_project_id = (
        coerce_uuid(raw_payload.get("project_id"))
        or coerce_uuid(event_payload.get("project_id"))
        or coerce_uuid(os.environ.get("PROMPTHUB_PROJECT_ID"))
    )
    if explicit_project_id:
        return explicit_project_id

    project_seed = (
        event_payload.get("cwd")
        or raw_payload.get("cwd")
        or raw_payload.get("workspace")
        or os.getcwd()
    )
    return stable_uuid("prompthub.project", project_seed)


def resolve_session_id(
    tool: SupportedTool,
    project_id: str,
    raw_payload: dict[str, Any],
    event_payload: dict[str, Any],
) -> str:
    explicit_session_id = (
        coerce_uuid(raw_payload.get("session_id"))
        or coerce_uuid(event_payload.get("session_id"))
        or coerce_uuid(os.environ.get("PROMPTHUB_SESSION_ID"))
    )
    if explicit_session_id:
        return explicit_session_id

    session_seed = (
        raw_payload.get("session_id")
        or raw_payload.get("conversation_id")
        or raw_payload.get("thread_id")
        or event_payload.get("session_id")
        or f"{project_id}:{tool}"
    )
    return stable_uuid("prompthub.session", f"{project_id}:{tool}:{session_seed}")


def build_event(
    *,
    tool: SupportedTool,
    event_type: EventType,
    payload: dict[str, Any],
    raw_payload: dict[str, Any],
) -> BaseEvent:
    project_id = resolve_project_id(raw_payload, payload)
    session_id = resolve_session_id(tool, project_id, raw_payload, payload)

    return BaseEvent(
        project_id=project_id,
        session_id=session_id,
        tool=tool,
        event_type=event_type,
        payload=payload,
    )
