from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
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
    status: Literal["draft", "published"] = "draft"
    summary: str | None = Field(default=None, max_length=2000)
    tags: list[str] = Field(default_factory=list)
    title: str | None = Field(default=None, max_length=255)
    visibility: Literal["private", "public", "unlisted"] = "private"

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
    included_file_ids: list[UUID] | None = Field(default=None, max_length=500)
    included_item_ids: list[UUID] | None = Field(default=None, max_length=200)
    notes: str | None = Field(default=None, max_length=20000)
    status: Literal["archived", "draft", "published"] | None = None
    summary: str | None = Field(default=None, max_length=2000)
    tags: list[str] | None = None
    title: str | None = Field(default=None, max_length=255)
    visibility: Literal["private", "public", "unlisted"] | None = None

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


class PublishedFlowAuthorResponse(BaseModel):
    avatar_url: str | None = None
    id: UUID | None = None
    username: str

    model_config = ConfigDict(extra="forbid")


class PublishedFlowAssetResponse(BaseModel):
    alt_text: str | None = None
    byte_size: int
    content_type: str
    created_at: datetime
    file_name: str
    id: UUID
    markdown: str
    sha256: str
    url: str

    model_config = ConfigDict(extra="forbid")


class PublishedFlowSummaryResponse(BaseModel):
    author: PublishedFlowAuthorResponse
    created_at: datetime
    file_count: int
    id: UUID
    is_owner: bool
    metrics: dict[str, Any]
    model_name: str | None = None
    prompt_count: int
    published_at: datetime | None = None
    slug: str
    status: Literal["archived", "draft", "published"]
    summary: str | None = None
    tags: list[str]
    title: str
    tool_name: str | None = None
    updated_at: datetime
    visibility: Literal["private", "public", "unlisted"]

    model_config = ConfigDict(extra="forbid")


class PublishedFlowFileResponse(BaseModel):
    additions: int
    change_type: str | None = None
    deletions: int
    diff: str | None = None
    file_path: str
    id: UUID
    is_included: bool
    language: str | None = None
    source_event_id: UUID | None = None

    model_config = ConfigDict(extra="forbid")


class PublishedFlowItemResponse(BaseModel):
    files_changed: int
    id: UUID
    is_included: bool
    item_order: int
    model_name: str | None = None
    prompt_text: str
    response_received_at: datetime | None = None
    response_text: str | None = None
    sequence: int
    source_event_id: UUID | None = None
    submitted_at: datetime
    tool_name: str | None = None

    model_config = ConfigDict(extra="forbid")


class PublishedFlowDetailResponse(PublishedFlowSummaryResponse):
    assets: list[PublishedFlowAssetResponse]
    context_summary: str | None = None
    end_sequence: int | None = None
    files: list[PublishedFlowFileResponse]
    items: list[PublishedFlowItemResponse]
    notes: str | None = None
    source_end_event_id: UUID | None = None
    source_project_id: UUID | None = None
    source_session_id: UUID | None = None
    source_start_event_id: UUID | None = None
    start_sequence: int | None = None

    model_config = ConfigDict(extra="forbid")
