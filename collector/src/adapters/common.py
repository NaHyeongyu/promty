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
from git_context import git_context
from payloads import (
    SESSION_ID_KEYS,
    TURN_ID_KEYS,
    WORKSPACE_KEYS,
    first_bool,
    first_int,
    first_string,
    first_value,
    payload_views,
    string_list,
)
from response_capture import response_payload_fields

EXTERNAL_EVENT_ALIASES: dict[str, EventType] = {
    "SessionStart": "SessionStarted",
    "SessionEnd": "SessionEnded",
    "Stop": "ResponseReceived",
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
    payloads = payload_views(raw_payload)
    cwd = first_string(payloads, WORKSPACE_KEYS)

    class LazyGitContext(dict[str, str]):
        def __init__(self) -> None:
            super().__init__()
            self._loaded = False

        def get(self, key: str, default: str | None = None) -> str | None:
            if not self._loaded:
                self.update(git_context(cwd))
                self._loaded = True
            return super().get(key, default)

    git = LazyGitContext()

    if event_type == "SessionStarted":
        return SessionStartedPayload(
            cwd=cwd,
            branch=first_string(payloads, ("branch", "git_branch")) or git.get("branch"),
            git_remote=first_string(payloads, ("git_remote", "remote_url")) or git.get("git_remote"),
            github_url=first_string(payloads, ("github_url", "repository_url")) or git.get("github_url"),
            model=first_string(payloads, ("model", "model_name")),
            permission_mode=first_string(payloads, ("permission_mode",)),
            session_id=first_string(payloads, SESSION_ID_KEYS),
        )

    if event_type == "PromptSubmitted":
        prompt = first_string(payloads, ("prompt", "input", "text", "message"))
        if not prompt or not prompt.strip():
            raise ValueError("Hook payload is missing a non-empty prompt/input")

        return PromptSubmittedPayload(
            prompt=prompt,
            cwd=cwd,
            model=first_string(payloads, ("model", "model_name")),
            permission_mode=first_string(payloads, ("permission_mode",)),
            transcript_path=first_string(payloads, ("transcript_path", "transcript")),
            turn_id=first_value(payloads, TURN_ID_KEYS),
            session_id=first_string(payloads, SESSION_ID_KEYS),
            branch=first_string(payloads, ("branch", "git_branch")) or git.get("branch"),
            git_remote=first_string(payloads, ("git_remote", "remote_url")) or git.get("git_remote"),
            github_url=first_string(payloads, ("github_url", "repository_url")) or git.get("github_url"),
            hook_event_name=first_string(payloads, ("hook_event_name",)),
            approval_policy=first_string(payloads, ("approval_policy",)),
            sandbox_mode=first_string(payloads, ("sandbox_mode",)),
        )

    if event_type == "ResponseReceived":
        return ResponseReceivedPayload(
            **response_payload_fields(raw_payload),
            duration_ms=first_int(payloads, ("duration_ms", "elapsed_ms")),
            success=first_bool(payloads, ("success", "ok")),
            model=first_string(payloads, ("model", "model_name")),
            session_id=first_string(payloads, SESSION_ID_KEYS),
            turn_id=first_value(payloads, TURN_ID_KEYS),
        )

    if event_type == "FilesChanged":
        return FilesChangedPayload(
            files=string_list(payloads, ("files", "changed_files", "paths")),
            cwd=cwd,
            session_id=first_string(payloads, SESSION_ID_KEYS),
            prompt_event_id=first_string(payloads, ("prompt_event_id",)),
            turn_id=first_value(payloads, TURN_ID_KEYS),
            git_root=first_string(payloads, ("git_root",)) or git.get("git_root"),
            branch=first_string(payloads, ("branch", "git_branch")) or git.get("branch"),
            git_remote=first_string(payloads, ("git_remote", "remote_url")) or git.get("git_remote"),
            github_url=first_string(payloads, ("github_url", "repository_url")) or git.get("github_url"),
            base_commit=first_string(payloads, ("base_commit",)),
            head_commit=first_string(payloads, ("head_commit",)),
            baseline_captured_at=first_string(payloads, ("baseline_captured_at",)),
            detected_at=first_string(payloads, ("detected_at",)),
            source=first_string(payloads, ("source",)),
            summary=first_value(payloads, ("summary",)),
            changes=first_value(payloads, ("changes",)) or [],
            change_detection_complete=first_bool(payloads, ("change_detection_complete",)),
            no_changes=first_bool(payloads, ("no_changes",)),
        )

    if event_type == "CommitCreated":
        return CommitCreatedPayload(
            hash=first_string(payloads, ("hash", "commit_hash", "sha")),
            message=first_string(payloads, ("message", "commit_message")),
            branch=first_string(payloads, ("branch", "git_branch")) or git.get("branch"),
            git_remote=first_string(payloads, ("git_remote", "remote_url")) or git.get("git_remote"),
            github_url=first_string(payloads, ("github_url", "repository_url")) or git.get("github_url"),
            cwd=cwd,
            session_id=first_string(payloads, SESSION_ID_KEYS),
        )

    if event_type == "SessionEnded":
        return SessionEndedPayload(
            reason=first_string(payloads, ("reason", "exit_reason")),
            duration=first_int(payloads, ("duration", "duration_seconds")),
            session_id=first_string(payloads, SESSION_ID_KEYS),
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
