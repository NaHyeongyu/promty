from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


class CollectorTokenCreateRequest(BaseModel):
    name: str | None = Field(default=None, max_length=255)

    @field_validator("name", mode="before")
    @classmethod
    def strip_name(cls, value: Any) -> Any:
        if value is None:
            return None
        if isinstance(value, str):
            stripped = value.strip()
            return stripped or None
        return value


class CollectorTokenUpdateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)

    @field_validator("name", mode="before")
    @classmethod
    def strip_name(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value


class AccountUserResponse(BaseModel):
    avatar_url: str | None
    email: str | None
    github_repository_access: bool
    id: str
    is_admin: bool
    preferred_locale: Literal["en", "ja", "ko", "zh"]
    username: str


class AccountPreferencesUpdateRequest(BaseModel):
    preferred_locale: Literal["en", "ja", "ko", "zh"]


class AccountPreferencesResponse(BaseModel):
    preferred_locale: Literal["en", "ja", "ko", "zh"]


class AccountPolicyAcceptanceRequest(BaseModel):
    accept_privacy_notice: Literal[True]
    accept_terms: Literal[True]
    confirm_age_and_business_use: Literal[True]


class AccountExternalAIConsentRequest(BaseModel):
    allow_external_ai: bool


class AccountPolicyConsentsResponse(BaseModel):
    current_policy_version: str
    eligibility_confirmed: bool
    external_ai_allowed: bool
    external_ai_consented_at: str | None
    external_ai_providers: list[Literal["gemini", "openai"]]
    policy_accepted: bool
    policy_accepted_at: str | None


class AccountDeletionRequest(BaseModel):
    confirmation: str = Field(..., min_length=1, max_length=255)
    acknowledge_permanent_deletion: Literal[True]


class AccountDeletionCountsResponse(BaseModel):
    collector_tokens: int
    projects: int
    published_flows: int


class AccountDeletionResponse(BaseModel):
    counts: AccountDeletionCountsResponse
    status: Literal["deleted"]


class GitHubConnectionResponse(BaseModel):
    connected: bool
    created_at: str | None
    revoked_at: str | None
    scopes: list[str]
    status: Literal["connected", "not_connected"]
    token_type: str | None
    updated_at: str | None


class CollectorTokenResponse(BaseModel):
    collector_version: str | None
    created_at: str | None
    id: str
    last_used_at: str | None
    name: str
    revoked_at: str | None
    status: Literal["active", "revoked"]


class AccountOverviewResponse(BaseModel):
    collector_tokens: list[CollectorTokenResponse]
    github_connection: GitHubConnectionResponse
    latest_collector_version: str
    policy_consents: AccountPolicyConsentsResponse
    user: AccountUserResponse


class CollectorTokenCreateResponse(BaseModel):
    collector_token: CollectorTokenResponse
    token: str
