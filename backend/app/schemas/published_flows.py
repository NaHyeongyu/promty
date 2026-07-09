from __future__ import annotations

from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class PublishedFlowCreateRequest(BaseModel):
    context_summary: str | None = Field(default=None, max_length=4000)
    end_prompt_event_id: UUID | None = None
    notes: str | None = Field(default=None, max_length=20000)
    prompt_event_ids: list[UUID] | None = None
    project_id: UUID
    session_id: UUID | None = None
    start_prompt_event_id: UUID | None = None
    status: str = Field(default="published")
    summary: str | None = Field(default=None, max_length=2000)
    tags: list[str] = Field(default_factory=list)
    title: str | None = Field(default=None, max_length=255)
    visibility: str = Field(default="public")

    @field_validator(
        "context_summary",
        "notes",
        "status",
        "summary",
        "title",
        "visibility",
        mode="before",
    )
    @classmethod
    def strip_string(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value

    @field_validator("tags", mode="before")
    @classmethod
    def normalize_tags_input(cls, value: Any) -> list[str]:
        if value is None:
            return []
        if isinstance(value, str):
            return [item for item in value.split(",") if item.strip()]
        if isinstance(value, list):
            return [item for item in value if isinstance(item, str)]
        return []

    model_config = ConfigDict(extra="forbid")


class PublishedFlowUpdateRequest(BaseModel):
    context_summary: str | None = Field(default=None, max_length=4000)
    notes: str | None = Field(default=None, max_length=20000)
    status: str | None = None
    summary: str | None = Field(default=None, max_length=2000)
    tags: list[str] | None = None
    title: str | None = Field(default=None, max_length=255)
    visibility: str | None = None

    @field_validator(
        "context_summary",
        "notes",
        "status",
        "summary",
        "title",
        "visibility",
        mode="before",
    )
    @classmethod
    def strip_string(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value

    @field_validator("tags", mode="before")
    @classmethod
    def normalize_tags_input(cls, value: Any) -> list[str] | None:
        if value is None:
            return None
        if isinstance(value, str):
            return [item for item in value.split(",") if item.strip()]
        if isinstance(value, list):
            return [item for item in value if isinstance(item, str)]
        return []

    model_config = ConfigDict(extra="forbid")
