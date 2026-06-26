from __future__ import annotations

from datetime import datetime
from typing import Literal, Union
from uuid import UUID

from pydantic import BaseModel, Field, root_validator

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
    model: str | None = None
    permission_mode: str | None = None
    session_id: str | None = None


class PromptSubmittedPayload(PayloadModel):
    prompt: str
    cwd: str | None = None
    model: str | None = None
    permission_mode: str | None = None
    transcript_path: str | None = None
    turn_id: str | int | None = None
    session_id: str | None = None
    branch: str | None = None
    hook_event_name: str | None = None
    approval_policy: str | None = None
    sandbox_mode: str | None = None


class ResponseReceivedPayload(PayloadModel):
    tokens: int | None = None
    duration_ms: int | None = None
    success: bool | None = None
    model: str | None = None
    session_id: str | None = None


class FilesChangedPayload(PayloadModel):
    files: list[str] = Field(default_factory=list)
    cwd: str | None = None
    session_id: str | None = None


class CommitCreatedPayload(PayloadModel):
    hash: str | None = None
    message: str | None = None
    branch: str | None = None
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
    schema_version: int = 1
    project_id: UUID
    session_id: UUID
    sequence: int
    tool: SupportedTool
    event_type: EventType
    timestamp: datetime
    payload: EventPayload

    @root_validator(pre=True)
    def coerce_typed_payload(cls, values: dict) -> dict:
        event_type = values.get("event_type")
        payload_model = PAYLOAD_BY_EVENT_TYPE.get(event_type)
        if payload_model is not None and isinstance(values.get("payload"), dict):
            values["payload"] = payload_model(**values["payload"])
        return values

    class Config:
        extra = "forbid"


class EventRead(EventCreate):
    pass


class EventBatchCreate(BaseModel):
    events: list[EventCreate]


class EventBatchResponse(BaseModel):
    accepted: int
    event_ids: list[str]
