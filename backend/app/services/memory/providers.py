from __future__ import annotations

from typing import Literal

from app.core.config import settings
from app.services.gemini_memory import (
    GEMINI_MEMORY_DRAFT_GENERATOR,
    GEMINI_PROJECT_MEMORY_GENERATOR,
)
from app.services.memory.constants import (
    LOCAL_MEMORY_GENERATOR,
    PENDING_MEMORY_DRAFT_GENERATOR,
)
from app.services.openai_memory import (
    OPENAI_MEMORY_DRAFT_GENERATOR,
    OPENAI_PROJECT_MEMORY_GENERATOR,
)

GenerationStage = Literal["draft", "pending_draft", "project"]


def provider_name(value: str | None) -> str:
    return value.strip().lower() if isinstance(value, str) else "local"


def generator_for_provider(provider: str, *, stage: GenerationStage) -> str:
    if stage == "pending_draft":
        return PENDING_MEMORY_DRAFT_GENERATOR
    if provider == "openai":
        return {
            "draft": OPENAI_MEMORY_DRAFT_GENERATOR,
            "project": OPENAI_PROJECT_MEMORY_GENERATOR,
        }[stage]
    if provider == "gemini":
        return {
            "draft": GEMINI_MEMORY_DRAFT_GENERATOR,
            "project": GEMINI_PROJECT_MEMORY_GENERATOR,
        }[stage]
    return LOCAL_MEMORY_GENERATOR


def configured_generator_for_provider(provider: str, *, stage: GenerationStage) -> str:
    provider = provider_name(provider)
    if stage == "pending_draft":
        return PENDING_MEMORY_DRAFT_GENERATOR
    if provider == "openai" and settings.openai_api_key:
        return generator_for_provider(provider, stage=stage)
    if provider == "gemini" and settings.gemini_api_key:
        return generator_for_provider(provider, stage=stage)
    return LOCAL_MEMORY_GENERATOR


def provider_is_configured(provider: str | None) -> bool:
    provider = provider_name(provider)
    if provider == "openai":
        return bool(settings.openai_api_key)
    if provider == "gemini":
        return bool(settings.gemini_api_key)
    return False


def model_metadata_for_provider(provider: str) -> dict[str, str]:
    if provider == "openai":
        return {"openai_model": settings.openai_model}
    if provider == "gemini":
        return {"gemini_model": settings.gemini_model}
    return {}
