from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field

SupportedTool = Literal["claude-code", "codex-cli", "cursor", "gemini-cli"]
EventType = Literal[
    "SESSION_STARTED",
    "PROMPT_SENT",
    "PROMPT_RESPONSE",
    "FILES_CHANGED",
    "COMMIT_CREATED",
    "SESSION_ENDED",
]


class EventCreate(BaseModel):
    id: UUID
    project_id: UUID
    session_id: UUID
    tool: SupportedTool
    event_type: EventType
    timestamp: datetime
    payload: dict[str, Any] = Field(default_factory=dict)


class EventRead(EventCreate):
    pass


class EventBatchCreate(BaseModel):
    events: list[EventCreate]


class EventBatchResponse(BaseModel):
    accepted: int
    event_ids: list[str]
