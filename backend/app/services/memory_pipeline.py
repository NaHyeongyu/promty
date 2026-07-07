from __future__ import annotations

from typing import Any

from app.schemas.memory import (
    MemoryDraftGeneration,
    ProjectMemorySnapshot,
)
from app.services.gemini_memory import (
    generate_gemini_memory_drafts,
    generate_gemini_project_memory,
)
from app.services.openai_memory import (
    generate_openai_memory_drafts,
    generate_openai_project_memory,
)


def compile_memory_drafts(
    context: dict[str, Any],
    *,
    provider: str = "gemini",
) -> dict[str, Any]:
    """Normalize pending draft evidence into generated context memory JSON."""
    if provider == "openai":
        return MemoryDraftGeneration.parse_obj(generate_openai_memory_drafts(context)).dict()
    return MemoryDraftGeneration.parse_obj(generate_gemini_memory_drafts(context)).dict()


def compile_project_memory_snapshot(
    context: dict[str, Any],
    *,
    provider: str = "gemini",
) -> dict[str, Any]:
    """Stage 3: normalize verified memories into project memory snapshot JSON."""
    if provider == "openai":
        return ProjectMemorySnapshot.parse_obj(generate_openai_project_memory(context)).dict()
    return ProjectMemorySnapshot.parse_obj(generate_gemini_project_memory(context)).dict()
