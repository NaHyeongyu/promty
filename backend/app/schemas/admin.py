from __future__ import annotations

from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class AdminConfirmationRequest(BaseModel):
    confirmation: str = Field(..., min_length=1, max_length=255)


class AdminUserSuspendRequest(AdminConfirmationRequest):
    reason: str = Field(..., min_length=3, max_length=500)

    @field_validator("reason", mode="before")
    @classmethod
    def strip_reason(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value


class AdminCollectorTokenCreateRequest(AdminConfirmationRequest):
    name: str = Field(default="Admin-issued collector", min_length=1, max_length=255)

    @field_validator("name", mode="before")
    @classmethod
    def strip_name(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value


class AdminProjectCreateRequest(AdminConfirmationRequest):
    owner_id: UUID
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=2000)
    slug: str | None = Field(default=None, max_length=255)
    github_url: str | None = Field(default=None, max_length=2048)
    default_branch: str = Field(default="main", min_length=1, max_length=255)
    project_url: str | None = Field(default=None, max_length=2048)
    tags: list[str] = Field(default_factory=list, max_length=12)
    visibility: Literal["private", "public"] = "private"

    @field_validator(
        "name",
        "description",
        "slug",
        "github_url",
        "default_branch",
        "project_url",
        mode="before",
    )
    @classmethod
    def strip_strings(cls, value: Any) -> Any:
        if isinstance(value, str):
            return value.strip() or None
        return value


class AdminProjectUpdateRequest(AdminConfirmationRequest):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=2000)
    slug: str | None = Field(default=None, min_length=1, max_length=255)
    github_url: str | None = Field(default=None, max_length=2048)
    default_branch: str | None = Field(default=None, min_length=1, max_length=255)
    project_url: str | None = Field(default=None, max_length=2048)
    tags: list[str] | None = Field(default=None, max_length=12)
    visibility: Literal["private", "public"] | None = None

    @field_validator(
        "name",
        "description",
        "slug",
        "github_url",
        "default_branch",
        "project_url",
        mode="before",
    )
    @classmethod
    def strip_optional_strings(cls, value: Any) -> Any:
        if isinstance(value, str):
            return value.strip() or None
        return value


class AdminEventExportRequest(AdminConfirmationRequest):
    event_type: str | None = Field(default=None, max_length=64)
    project_id: UUID | None = None
    query: str | None = Field(default=None, max_length=200)
    user_id: UUID | None = None


class AdminProjectExportRequest(AdminConfirmationRequest):
    include_payloads: bool = True
