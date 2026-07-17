from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session as DBSession

from app.models.users import User
from app.services.memory.artifacts import get_latest_project_memory
from app.services.memory.workflows import project_for_user


def read_agent_project_context(
    db: DBSession,
    *,
    project_id: UUID,
    user: User,
) -> dict[str, Any]:
    project = project_for_user(db, project_id, user)
    artifact = get_latest_project_memory(db, project_id=project.id)
    metadata = artifact.metadata_ if artifact and isinstance(artifact.metadata_, dict) else {}
    snapshot = metadata.get("project_memory_snapshot")
    memory = snapshot if isinstance(snapshot, dict) else None

    return {
        "available": memory is not None,
        "project": {
            "id": project.id,
            "name": project.name,
            "slug": project.slug,
            "description": project.description,
            "default_branch": project.default_branch,
            "git_remote": project.git_remote,
            "tags": project.tags,
        },
        "memory_id": artifact.id if memory is not None else None,
        "updated_at": artifact.updated_at if memory is not None else None,
        "memory": memory,
    }
