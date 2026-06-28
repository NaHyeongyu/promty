from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field, validator

PromptVisibility = Literal["private", "unlisted", "public"]
PromptStatus = Literal["draft", "published", "archived"]
PromptSort = Literal["latest", "trending", "top"]


class PromptHubSharedScope(BaseModel):
    include_prompt: bool = True
    include_response: bool = True
    include_files: bool = False
    include_diff: bool = False
    include_terminal: bool = False
    include_project_context: bool = False


class PromptHubDraftFromActivityRequest(BaseModel):
    project_id: UUID
    activity_id: UUID
    title: str = Field(..., min_length=1, max_length=255)
    summary: str | None = Field(default=None, max_length=4000)
    include_prompt: bool = True
    include_response: bool = True
    include_files: bool = False
    include_diff: bool = False
    include_terminal: bool = False
    include_project_context: bool = False

    @validator("title", "summary", pre=True)
    def strip_string(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value

    def shared_scope(self) -> PromptHubSharedScope:
        return PromptHubSharedScope(
            include_prompt=self.include_prompt,
            include_response=self.include_response,
            include_files=self.include_files,
            include_diff=self.include_diff,
            include_terminal=self.include_terminal,
            include_project_context=self.include_project_context,
        )


class PromptHubUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    summary: str | None = Field(default=None, max_length=4000)
    prompt_text: str | None = Field(default=None, min_length=1)
    result_summary: str | None = Field(default=None, max_length=12000)
    category: str | None = Field(default=None, max_length=120)
    tags: list[str] | None = Field(default=None, max_items=20)
    visibility: PromptVisibility | None = None
    shared_scope: PromptHubSharedScope | None = None
    score_overall: float | None = Field(default=None, ge=0, le=100)
    score_frontend: float | None = Field(default=None, ge=0, le=100)
    score_backend: float | None = Field(default=None, ge=0, le=100)
    score_architecture: float | None = Field(default=None, ge=0, le=100)
    score_refactoring: float | None = Field(default=None, ge=0, le=100)
    score_documentation: float | None = Field(default=None, ge=0, le=100)

    @validator("title", "summary", "prompt_text", "result_summary", "category", pre=True)
    def strip_optional_string(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value

    @validator("tags")
    def normalize_tags(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None

        normalized: list[str] = []
        seen: set[str] = set()
        for raw_tag in value:
            tag = raw_tag.strip().lower()
            if not tag or tag in seen:
                continue
            if len(tag) > 40:
                raise ValueError("tags must be 40 characters or fewer")
            seen.add(tag)
            normalized.append(tag)
        return normalized


class PromptHubFileRead(BaseModel):
    id: UUID
    file_path: str
    change_type: str | None
    language: str | None
    diff: str | None
    additions: int
    deletions: int
    is_included: bool

    class Config:
        from_attributes = True


class PromptHubListItem(BaseModel):
    id: UUID
    title: str
    slug: str
    summary: str | None
    model_name: str | None
    tool_name: str | None
    category: str | None
    tags: list[str]
    score_overall: float | None
    metrics: dict[str, Any]
    published_at: datetime | None


class PromptHubDetail(PromptHubListItem):
    prompt_text: str
    result_summary: str | None
    visibility: PromptVisibility
    status: PromptStatus
    shared_scope: dict[str, Any]
    score_frontend: float | None
    score_backend: float | None
    score_architecture: float | None
    score_refactoring: float | None
    score_documentation: float | None
    files: list[PromptHubFileRead]
    comments_count: int
    reactions_count: int
    created_at: datetime
    updated_at: datetime
