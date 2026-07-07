from __future__ import annotations

from datetime import datetime
from typing import Literal, Union
from uuid import UUID

from pydantic import BaseModel, Field, root_validator, validator

SupportedTool = Literal["claude-code", "codex-cli", "cursor", "gemini-cli"]
EventType = Literal[
    "SessionStarted",
    "PromptSubmitted",
    "ResponseReceived",
    "FilesChanged",
    "CommitCreated",
    "SessionEnded",
]


class PayloadModel(BaseModel):
    class Config:
        extra = "forbid"


class SessionStartedPayload(PayloadModel):
    cwd: str | None = None
    branch: str | None = None
    git_remote: str | None = None
    github_url: str | None = None
    model: str | None = None
    permission_mode: str | None = None
    session_id: str | None = None


class PromptSubmittedPayload(PayloadModel):
    prompt: str
    prompt_truncated: bool = False
    prompt_original_length: int | None = None
    prompt_storage_limit: int | None = None
    cwd: str | None = None
    model: str | None = None
    permission_mode: str | None = None
    transcript_path: str | None = None
    turn_id: str | int | None = None
    session_id: str | None = None
    branch: str | None = None
    git_remote: str | None = None
    github_url: str | None = None
    hook_event_name: str | None = None
    approval_policy: str | None = None
    sandbox_mode: str | None = None


class ResponseReceivedPayload(PayloadModel):
    response: str | None = None
    response_truncated: bool = False
    response_original_length: int | None = None
    response_storage_limit: int | None = None
    response_source: str | None = None
    transcript_path: str | None = None
    turn_id: str | int | None = None
    duration_ms: int | None = None
    success: bool | None = None
    model: str | None = None
    session_id: str | None = None


class FilesChangedPayload(PayloadModel):
    files: list[str] = Field(default_factory=list)
    cwd: str | None = None
    session_id: str | None = None
    prompt_event_id: str | None = None
    turn_id: str | int | None = None
    git_root: str | None = None
    branch: str | None = None
    git_remote: str | None = None
    github_url: str | None = None
    base_commit: str | None = None
    head_commit: str | None = None
    baseline_captured_at: str | None = None
    detected_at: str | None = None
    source: str | None = None
    summary: dict | None = None
    changes: list[dict] = Field(default_factory=list)
    change_detection_complete: bool | None = None
    no_changes: bool | None = None


class CommitCreatedPayload(PayloadModel):
    hash: str | None = None
    message: str | None = None
    branch: str | None = None
    git_remote: str | None = None
    github_url: str | None = None
    cwd: str | None = None
    session_id: str | None = None


class SessionEndedPayload(PayloadModel):
    reason: str | None = None
    duration: int | None = None
    session_id: str | None = None


EventPayload = Union[
    SessionStartedPayload,
    PromptSubmittedPayload,
    ResponseReceivedPayload,
    FilesChangedPayload,
    CommitCreatedPayload,
    SessionEndedPayload,
]
LEGACY_USAGE_KEYS = frozenset(("tokens", "total_tokens"))
PAYLOAD_BY_EVENT_TYPE: dict[str, type[PayloadModel]] = {
    "SessionStarted": SessionStartedPayload,
    "PromptSubmitted": PromptSubmittedPayload,
    "ResponseReceived": ResponseReceivedPayload,
    "FilesChanged": FilesChangedPayload,
    "CommitCreated": CommitCreatedPayload,
    "SessionEnded": SessionEndedPayload,
}


class EventCreate(BaseModel):
    id: UUID
    schema_version: int = Field(default=1, ge=1)
    project_id: UUID
    session_id: UUID
    sequence: int = Field(gt=0)
    tool: SupportedTool
    event_type: EventType
    timestamp: datetime
    payload: EventPayload

    @root_validator(pre=True)
    def coerce_typed_payload(cls, values: dict) -> dict:
        event_type = values.get("event_type")
        payload_model = PAYLOAD_BY_EVENT_TYPE.get(event_type)
        if payload_model is not None and isinstance(values.get("payload"), dict):
            payload = {
                key: value
                for key, value in values["payload"].items()
                if key not in LEGACY_USAGE_KEYS
            }
            values["payload"] = payload_model(**payload)
        return values

    @validator("timestamp")
    def require_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("timestamp must be timezone-aware")
        return value

    class Config:
        extra = "forbid"


class EventRead(EventCreate):
    pass


class EventBatchCreate(BaseModel):
    events: list[EventCreate] = Field(..., min_items=1, max_items=500)


class EventBatchResponse(BaseModel):
    accepted: int
    event_ids: list[str]
