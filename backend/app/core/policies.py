from __future__ import annotations

from typing import Any

from app.core.config import settings
from app.models.users import User


CURRENT_POLICY_VERSION = "2026-07-21"


def configured_external_ai_providers() -> list[str]:
    providers: list[str] = []
    for value in (settings.memory_draft_generator, settings.project_memory_generator):
        provider = value.strip().lower()
        if provider in {"gemini", "openai"} and provider not in providers:
            providers.append(provider)
    return providers


def user_has_current_policy_acceptance(user: User) -> bool:
    return (
        user.policy_version == CURRENT_POLICY_VERSION
        and user.policy_accepted_at is not None
        and user.eligibility_confirmed_at is not None
    )


def user_allows_external_ai(user: User) -> bool:
    return (
        user.external_ai_consent_version == CURRENT_POLICY_VERSION
        and user.external_ai_consented_at is not None
    )


def serialize_policy_consents(user: User) -> dict[str, Any]:
    return {
        "current_policy_version": CURRENT_POLICY_VERSION,
        "eligibility_confirmed": user_has_current_policy_acceptance(user),
        "external_ai_allowed": user_allows_external_ai(user),
        "external_ai_consented_at": (
            user.external_ai_consented_at.isoformat()
            if user.external_ai_consented_at is not None
            else None
        ),
        "external_ai_providers": configured_external_ai_providers(),
        "policy_accepted": user_has_current_policy_acceptance(user),
        "policy_accepted_at": (
            user.policy_accepted_at.isoformat()
            if user.policy_accepted_at is not None
            else None
        ),
    }
