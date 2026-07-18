from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


MarketingChannel = Literal[
    "x",
    "threads",
    "bluesky",
    "linkedin",
    "devto",
    "github",
    "reddit",
    "hackernews",
]
MarketingLocale = Literal["ko", "en"]
MarketingStatus = Literal[
    "draft",
    "review",
    "approved",
    "scheduled",
    "published",
    "failed",
]

SUPPORTED_MARKETING_CHANNELS: tuple[str, ...] = (
    "x",
    "threads",
    "bluesky",
    "linkedin",
    "devto",
    "github",
    "reddit",
    "hackernews",
)


class StrictMarketingRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")


def _strip_optional(value: Any) -> Any:
    if isinstance(value, str):
        return value.strip() or None
    return value


def _validate_public_url(value: Any) -> Any:
    value = _strip_optional(value)
    if value is None:
        return None
    if not isinstance(value, str) or not value.lower().startswith(("http://", "https://")):
        raise ValueError("URL must use http or https")
    return value


class MarketingVariant(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(..., min_length=1, max_length=500)
    body: str = Field(..., min_length=1, max_length=30_000)
    hashtags: list[str] = Field(default_factory=list, max_length=10)

    @field_validator("title", "body", mode="before")
    @classmethod
    def strip_text(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value

    @field_validator("hashtags", mode="before")
    @classmethod
    def normalize_hashtags(cls, value: Any) -> Any:
        if not isinstance(value, list):
            return value
        result: list[str] = []
        for item in value:
            if not isinstance(item, str):
                continue
            normalized = item.strip().lstrip("#").replace(" ", "")[:64]
            if normalized and normalized.lower() not in {tag.lower() for tag in result}:
                result.append(normalized)
        return result[:10]


class MarketingBilingualContent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ko: dict[str, MarketingVariant]
    en: dict[str, MarketingVariant]

    @field_validator("ko", "en")
    @classmethod
    def validate_channels(cls, value: dict[str, MarketingVariant]) -> dict[str, MarketingVariant]:
        unknown = sorted(set(value) - set(SUPPORTED_MARKETING_CHANNELS))
        if unknown:
            raise ValueError(f"Unsupported marketing channels: {', '.join(unknown)}")
        if not value:
            raise ValueError("At least one channel is required for each locale")
        return value


class MarketingContentCreateRequest(StrictMarketingRequest):
    campaign_name: str = Field(..., min_length=1, max_length=255)
    source_type: Literal["manual", "release", "public_project", "faq", "support"] = "manual"
    source_title: str = Field(..., min_length=1, max_length=500)
    source_summary: str = Field(..., min_length=10, max_length=20_000)
    source_url: str | None = Field(default=None, max_length=2048)
    cta_url: str | None = Field(default=None, max_length=2048)
    tone: Literal["practical", "technical", "founder", "launch"] = "practical"
    channels: list[MarketingChannel] = Field(
        default_factory=lambda: list(SUPPORTED_MARKETING_CHANNELS),
        min_length=1,
        max_length=len(SUPPORTED_MARKETING_CHANNELS),
    )

    @field_validator("campaign_name", "source_title", "source_summary", mode="before")
    @classmethod
    def strip_required_text(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value

    @field_validator("source_url", "cta_url", mode="before")
    @classmethod
    def validate_urls(cls, value: Any) -> Any:
        return _validate_public_url(value)

    @field_validator("channels")
    @classmethod
    def unique_channels(cls, value: list[MarketingChannel]) -> list[MarketingChannel]:
        return list(dict.fromkeys(value))


class MarketingContentUpdateRequest(StrictMarketingRequest):
    campaign_name: str | None = Field(default=None, min_length=1, max_length=255)
    source_title: str | None = Field(default=None, min_length=1, max_length=500)
    source_summary: str | None = Field(default=None, min_length=10, max_length=20_000)
    source_url: str | None = Field(default=None, max_length=2048)
    cta_url: str | None = Field(default=None, max_length=2048)
    tone: Literal["practical", "technical", "founder", "launch"] | None = None
    channels: list[MarketingChannel] | None = Field(
        default=None,
        min_length=1,
        max_length=len(SUPPORTED_MARKETING_CHANNELS),
    )
    content: MarketingBilingualContent | None = None
    status: MarketingStatus | None = None
    scheduled_at: datetime | None = None

    @field_validator("campaign_name", "source_title", "source_summary", mode="before")
    @classmethod
    def strip_optional_text(cls, value: Any) -> Any:
        return _strip_optional(value)

    @field_validator("source_url", "cta_url", mode="before")
    @classmethod
    def validate_urls(cls, value: Any) -> Any:
        return _validate_public_url(value)

    @field_validator("channels")
    @classmethod
    def unique_channels(cls, value: list[MarketingChannel] | None) -> list[MarketingChannel] | None:
        return list(dict.fromkeys(value)) if value is not None else None


class MarketingContentGenerateRequest(StrictMarketingRequest):
    provider: Literal["auto", "openai", "gemini", "template"] = "auto"


class MarketingContentDeleteRequest(StrictMarketingRequest):
    confirmation: str = Field(..., min_length=1, max_length=255)


class MarketingDeliveryRequest(StrictMarketingRequest):
    channel: MarketingChannel
    locale: MarketingLocale
    mode: Literal[
        "buffer_draft",
        "buffer_queue",
        "buffer_schedule",
        "devto_draft",
        "github_discussion",
        "manual",
    ]
    scheduled_at: datetime | None = None

    @model_validator(mode="after")
    def validate_mode_for_channel(self) -> "MarketingDeliveryRequest":
        buffer_channels = {"x", "threads", "bluesky", "linkedin"}
        if self.mode.startswith("buffer_") and self.channel not in buffer_channels:
            raise ValueError("Buffer delivery is only available for configured social channels")
        if self.mode == "devto_draft" and self.channel != "devto":
            raise ValueError("DEV delivery requires the devto channel")
        if self.mode == "github_discussion" and self.channel != "github":
            raise ValueError("GitHub delivery requires the github channel")
        if self.mode == "buffer_schedule" and self.scheduled_at is None:
            raise ValueError("scheduled_at is required for scheduled Buffer delivery")
        return self


class MarketingContentResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    creator: dict[str, str] | None
    campaign_name: str
    source_type: str
    source_title: str
    source_summary: str
    source_url: str | None
    cta_url: str | None
    tone: str
    status: MarketingStatus
    channels: list[MarketingChannel]
    content: dict[str, Any]
    delivery_results: dict[str, Any]
    generated_by: str | None
    last_error: str | None
    scheduled_at: str | None
    published_at: str | None
    created_at: str | None
    updated_at: str | None


class MarketingContentPageResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[MarketingContentResponse]
    limit: int
    offset: int
    total: int


class MarketingContentDeleteResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    campaign_name: str
    id: str
    status: Literal["deleted"]


class MarketingDeliveryResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    channel: MarketingChannel
    locale: MarketingLocale
    mode: str
    status: Literal["copied", "drafted", "queued", "scheduled", "published"]
    external_id: str | None
    external_url: str | None


class MarketingIntegrationsResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ai: dict[str, Any]
    buffer: dict[str, Any]
    devto: dict[str, Any]
    github: dict[str, Any]
