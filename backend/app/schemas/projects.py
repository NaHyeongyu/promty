from __future__ import annotations

import re
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


def _slugify_project_name(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug[:255] or "project"


class ProjectCreateRequest(BaseModel):
    name: str | None = Field(default=None, max_length=255)
    description: str | None = Field(default=None, max_length=2000)
    github_url: str = Field(..., min_length=1, max_length=2048)
    default_branch: str | None = Field(default=None, max_length=255)

    @field_validator("name", "description", "github_url", "default_branch", mode="before")
    @classmethod
    def strip_string(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value


class ProjectRepositoryUpdateRequest(BaseModel):
    github_url: str = Field(..., min_length=1, max_length=2048)
    default_branch: str | None = Field(default=None, max_length=255)

    @field_validator("github_url", "default_branch", mode="before")
    @classmethod
    def strip_string(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value


class ProjectDescriptionUpdateRequest(BaseModel):
    description: str | None = Field(default=None, max_length=2000)

    @field_validator("description", mode="before")
    @classmethod
    def strip_description(cls, value: Any) -> Any:
        if value is None:
            return None
        if isinstance(value, str):
            stripped = value.strip()
            return stripped or None
        return value


class ProjectMetadataUpdateRequest(BaseModel):
    slug: str | None = Field(default=None, min_length=1, max_length=255)
    project_url: str | None = Field(default=None, max_length=2048)
    tags: list[str] | None = None
    visibility: str | None = Field(default=None)

    @field_validator("slug", mode="before")
    @classmethod
    def normalize_slug(cls, value: Any) -> Any:
        if value is None:
            return None
        if not isinstance(value, str):
            return value
        slug = _slugify_project_name(value)
        if not slug:
            raise ValueError("Project URL is required.")
        return slug

    @field_validator("project_url", mode="before")
    @classmethod
    def normalize_project_url(cls, value: Any) -> Any:
        if value is None:
            return None
        if isinstance(value, str):
            return value.strip() or None
        return value

    @field_validator("tags", mode="before")
    @classmethod
    def normalize_tags(cls, value: Any) -> list[str] | None:
        if value is None:
            return None
        if isinstance(value, str):
            raw_tags = value.split(",")
        elif isinstance(value, list):
            raw_tags = value
        else:
            return value

        normalized_tags: list[str] = []
        seen_tags: set[str] = set()
        for tag in raw_tags:
            if not isinstance(tag, str):
                continue
            normalized_tag = re.sub(r"\s+", " ", tag.strip().lower())
            if not normalized_tag or normalized_tag in seen_tags:
                continue
            seen_tags.add(normalized_tag)
            normalized_tags.append(normalized_tag[:40])
            if len(normalized_tags) >= 12:
                break
        return normalized_tags

    @field_validator("visibility", mode="before")
    @classmethod
    def normalize_visibility(cls, value: Any) -> str | None:
        if value is None:
            return None
        if not isinstance(value, str):
            return value
        visibility = value.strip().lower()
        if visibility not in {"public", "private"}:
            raise ValueError("Visibility must be public or private.")
        return visibility


class ProjectBookmarkUpdateRequest(BaseModel):
    is_bookmarked: bool


class ProjectSummaryResponse(BaseModel):
    connected_models: list[str]
    created_at: str
    default_branch: str
    events: int
    git_remote: str | None
    github_url: str | None
    id: str
    is_bookmarked: bool
    latest_event_at: str | None
    latest_memory_at: str | None
    memory_count: int
    name: str
    prompts: int
    pending_memory_count: int
    project_url: str | None
    sessions: int
    slug: str
    tags: list[str]
    tracked_files: int
    updated_at: str
    visibility: Literal["private", "public"]
