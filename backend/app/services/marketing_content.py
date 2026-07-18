from __future__ import annotations

import json
import re
from datetime import datetime
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.time import utc_now
from app.models.marketing_content import MarketingContent
from app.models.users import User
from app.schemas.marketing import (
    MarketingBilingualContent,
    MarketingContentCreateRequest,
    MarketingContentUpdateRequest,
    MarketingVariant,
)
from app.services.gemini_memory import _request_gemini_json
from app.services.openai_memory import _request_openai_json


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value is not None else None


def marketing_content_response(item: MarketingContent) -> dict[str, Any]:
    creator = item.creator
    return {
        "id": str(item.id),
        "creator": (
            {"id": str(creator.id), "username": creator.username} if creator is not None else None
        ),
        "campaign_name": item.campaign_name,
        "source_type": item.source_type,
        "source_title": item.source_title,
        "source_summary": item.source_summary,
        "source_url": item.source_url,
        "cta_url": item.cta_url,
        "tone": item.tone,
        "status": item.status,
        "channels": list(item.channels or []),
        "content": dict(item.content or {}),
        "delivery_results": dict(item.delivery_results or {}),
        "generated_by": item.generated_by,
        "last_error": item.last_error,
        "scheduled_at": _iso(item.scheduled_at),
        "published_at": _iso(item.published_at),
        "created_at": _iso(item.created_at),
        "updated_at": _iso(item.updated_at),
    }


def read_marketing_content(db: Session, content_id: UUID) -> MarketingContent:
    item = db.scalar(select(MarketingContent).where(MarketingContent.id == content_id))
    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Marketing content not found"
        )
    return item


def list_marketing_content(
    db: Session,
    *,
    content_status: str | None,
    limit: int,
    offset: int,
    query: str | None,
) -> dict[str, Any]:
    filters = []
    if content_status:
        filters.append(MarketingContent.status == content_status)
    normalized_query = query.strip() if query else ""
    if normalized_query:
        pattern = f"%{normalized_query}%"
        filters.append(
            or_(
                MarketingContent.campaign_name.ilike(pattern),
                MarketingContent.source_title.ilike(pattern),
                MarketingContent.source_summary.ilike(pattern),
            )
        )
    statement = select(MarketingContent)
    count_statement = select(func.count()).select_from(MarketingContent)
    if filters:
        statement = statement.where(*filters)
        count_statement = count_statement.where(*filters)
    items = db.scalars(
        statement.order_by(MarketingContent.updated_at.desc(), MarketingContent.id.desc())
        .offset(offset)
        .limit(limit)
    ).all()
    return {
        "items": [marketing_content_response(item) for item in items],
        "limit": limit,
        "offset": offset,
        "total": int(db.scalar(count_statement) or 0),
    }


def create_marketing_content(
    db: Session,
    *,
    creator: User,
    payload: MarketingContentCreateRequest,
) -> MarketingContent:
    item = MarketingContent(
        campaign_name=payload.campaign_name,
        channels=list(payload.channels),
        creator_id=creator.id,
        cta_url=payload.cta_url,
        source_summary=payload.source_summary,
        source_title=payload.source_title,
        source_type=payload.source_type,
        source_url=payload.source_url,
        tone=payload.tone,
    )
    db.add(item)
    db.flush()
    return item


def update_marketing_content(
    item: MarketingContent,
    *,
    payload: MarketingContentUpdateRequest,
) -> MarketingContent:
    fields = payload.model_dump(exclude_unset=True)
    content = fields.pop("content", None)
    channels = fields.pop("channels", None)
    if content is not None:
        item.content = content
    if channels is not None:
        item.channels = list(channels)
    for field, value in fields.items():
        setattr(item, field, value)
    item.updated_at = utc_now()
    return item


def delete_marketing_content(
    db: Session,
    item: MarketingContent,
    *,
    confirmation: str,
) -> dict[str, str]:
    if confirmation != item.campaign_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f'Type "{item.campaign_name}" to confirm this administrator action.',
        )
    response = {
        "campaign_name": item.campaign_name,
        "id": str(item.id),
        "status": "deleted",
    }
    db.delete(item)
    db.flush()
    return response


def approve_marketing_content(item: MarketingContent) -> MarketingContent:
    validated = MarketingBilingualContent.model_validate(item.content)
    missing = [
        f"{locale}:{channel}"
        for locale in ("ko", "en")
        for channel in item.channels
        if channel not in getattr(validated, locale)
    ]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Generate or write every selected variant before approval: {', '.join(missing)}",
        )
    item.status = "approved"
    item.last_error = None
    item.updated_at = utc_now()
    return item


def _slug(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return normalized[:80] or "promty-story"


def _tracked_url(item: MarketingContent, *, channel: str, locale: str) -> str:
    raw_url = item.cta_url or settings.app_url
    parts = urlsplit(raw_url)
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    query.update(
        {
            "utm_source": channel,
            "utm_medium": "organic_social",
            "utm_campaign": _slug(item.campaign_name),
            "utm_content": f"{str(item.id)[:8]}-{locale}-{channel}",
        }
    )
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


def _template_variant(
    item: MarketingContent,
    *,
    channel: str,
    locale: str,
) -> MarketingVariant:
    url = _tracked_url(item, channel=channel, locale=locale)
    title = item.source_title
    summary = item.source_summary.strip()
    if locale == "ko":
        lead = {
            "x": "AI 코딩 세션이 끝날 때마다 맥락이 사라지는 문제를 이렇게 풀었습니다.",
            "threads": "새 AI 세션에서 프로젝트를 처음부터 설명하지 않아도 되게 만들고 있습니다.",
            "bluesky": "AI 개발 도구 사이에서 프로젝트의 결정 맥락을 이어가는 방법을 만들었습니다.",
            "linkedin": "좋은 AI 개발 경험의 병목은 모델 성능보다 프로젝트 맥락의 단절일 수 있습니다.",
            "devto": "AI coding agents lose the reasoning behind a project between sessions. This is how Promty approaches that continuity problem.",
            "github": "이번 Promty 업데이트는 AI 세션 사이의 프로젝트 맥락을 더 안전하게 이어주는 데 집중했습니다.",
            "reddit": "AI 코딩 도구를 바꿀 때마다 프로젝트 맥락을 다시 설명하는 문제를 해결해보고 있습니다.",
            "hackernews": "Show HN: AI coding sessions에서 결정 맥락을 이어주는 프로젝트 메모리 도구를 만들었습니다.",
        }[channel]
        body = f"{lead}\n\n{title}\n\n{summary}\n\n{url}"
        hashtags = ["Promty", "AI개발", "개발도구"]
    else:
        lead = {
            "x": "AI coding tools forget the decisions that shaped a project. We built a way to carry that context forward.",
            "threads": "A new AI coding session should not mean explaining the entire project again.",
            "bluesky": "We are building durable project context that follows your work across AI coding tools.",
            "linkedin": "The bottleneck in AI-assisted development is often not model capability. It is lost project context between sessions and tools.",
            "devto": "AI coding agents lose the reasoning behind a project between sessions. This is how Promty approaches that continuity problem.",
            "github": "This Promty update focuses on carrying project decisions safely across AI coding sessions.",
            "reddit": "I am working on the problem of repeatedly explaining project context when switching AI coding tools.",
            "hackernews": "Show HN: Promty – durable project memory across AI coding sessions",
        }[channel]
        body = f"{lead}\n\n{title}\n\n{summary}\n\n{url}"
        hashtags = ["Promty", "AICoding", "DevTools"]
    return MarketingVariant(title=title, body=body, hashtags=hashtags)


def _template_content(item: MarketingContent) -> MarketingBilingualContent:
    return MarketingBilingualContent(
        ko={
            channel: _template_variant(item, channel=channel, locale="ko")
            for channel in item.channels
        },
        en={
            channel: _template_variant(item, channel=channel, locale="en")
            for channel in item.channels
        },
    )


def _generation_prompt(item: MarketingContent) -> str:
    channel_rules = {
        "x": "Concise standalone post, at most 260 characters before the URL.",
        "threads": "Conversational short post, at most 450 characters before the URL.",
        "bluesky": "Concise post, at most 260 characters before the URL.",
        "linkedin": "Founder-quality post with problem, concrete learning, and CTA; 700-1,300 characters.",
        "devto": "Useful technical Markdown article with headings, concrete implementation detail, and no hype; 600-1,000 words.",
        "github": "Repository update in Markdown with summary, changes, why it matters, and try-it link.",
        "reddit": "Community-first text post that explains the problem and asks for feedback; disclose the maker relationship; avoid sales language.",
        "hackernews": "Factual Show HN title and concise maker comment; no hype, emojis, or vote solicitation.",
    }
    requested = {
        channel: {
            "rule": channel_rules[channel],
            "ko_cta_url": _tracked_url(item, channel=channel, locale="ko"),
            "en_cta_url": _tracked_url(item, channel=channel, locale="en"),
        }
        for channel in item.channels
    }
    return "\n".join(
        (
            "Create bilingual marketing content for Promty, a durable project-memory product for AI coding tools.",
            'Return JSON only with exactly this shape: {"ko": {CHANNEL: {"title": string, "body": string, "hashtags": [string]}}, "en": {CHANNEL: {"title": string, "body": string, "hashtags": [string]}}}.',
            "Include every requested channel in both ko and en and no other channels.",
            "Write idiomatic Korean and idiomatic English independently; do not produce literal translations.",
            "Use only the supplied facts. Never invent metrics, customers, testimonials, integrations, or outcomes.",
            "Put the supplied locale-specific CTA URL once at the end of each body.",
            "Do not expose private prompts, responses, file paths, secrets, or personal data.",
            f"Tone: {item.tone}",
            f"Campaign: {item.campaign_name}",
            f"Source title: {item.source_title}",
            f"Source summary: {item.source_summary}",
            f"Source URL: {item.source_url or 'none'}",
            f"Requested channels: {json.dumps(requested, ensure_ascii=False)}",
        )
    )


def generate_marketing_content(
    item: MarketingContent,
    *,
    provider: str,
) -> MarketingContent:
    selected_provider = provider
    if selected_provider == "auto":
        if settings.openai_api_key:
            selected_provider = "openai"
        elif settings.gemini_api_key:
            selected_provider = "gemini"
        else:
            selected_provider = "template"

    if selected_provider == "openai":
        generated = _request_openai_json(
            _generation_prompt(item),
            stage="marketing_content_generation",
        )
        generator = f"openai:{settings.openai_model}"
    elif selected_provider == "gemini":
        generated = _request_gemini_json(
            _generation_prompt(item),
            stage="marketing_content_generation",
        )
        generator = f"gemini:{settings.gemini_model}"
    else:
        generated = _template_content(item).model_dump(mode="json")
        generator = "template:bilingual-v1"

    validated = MarketingBilingualContent.model_validate(generated)
    expected_channels = set(item.channels)
    for locale in ("ko", "en"):
        actual_channels = set(getattr(validated, locale))
        if actual_channels != expected_channels:
            missing = sorted(expected_channels - actual_channels)
            extra = sorted(actual_channels - expected_channels)
            raise ValueError(
                f"Generated {locale} channels did not match request; missing={missing}, extra={extra}"
            )

    item.content = validated.model_dump(mode="json")
    item.generated_by = generator
    item.last_error = None
    item.status = "review"
    item.updated_at = utc_now()
    return item
