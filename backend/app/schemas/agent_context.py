from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.schemas.memory import ProjectMemorySnapshot


class StrictResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")


class AgentContextProjectResponse(StrictResponse):
    id: UUID
    name: str
    slug: str
    description: str | None
    default_branch: str
    git_remote: str | None
    tags: list[str]


class AgentProjectContextResponse(StrictResponse):
    available: bool
    review_required: bool
    safety_notice: str
    project: AgentContextProjectResponse
    memory_id: UUID | None
    updated_at: datetime | None
    memory: ProjectMemorySnapshot | None
