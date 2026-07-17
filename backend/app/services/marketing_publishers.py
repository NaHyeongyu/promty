from __future__ import annotations

import json
from datetime import timezone
from typing import Any
from urllib import error, request

from fastapi import HTTPException, status

from app.core.config import settings
from app.core.time import utc_now
from app.models.marketing_content import MarketingContent
from app.schemas.marketing import MarketingBilingualContent, MarketingDeliveryRequest


class MarketingDeliveryError(RuntimeError):
    pass


def _post_json(
    url: str,
    *,
    body: dict[str, Any],
    headers: dict[str, str],
) -> dict[str, Any]:
    payload = json.dumps(body).encode("utf-8")
    http_request = request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json", **headers},
        method="POST",
    )
    try:
        with request.urlopen(http_request, timeout=30) as response:
            raw = response.read(1_000_001)
            if len(raw) > 1_000_000:
                raise MarketingDeliveryError("Publisher response exceeded the size limit")
            parsed = json.loads(raw.decode("utf-8"))
    except error.HTTPError as exc:
        detail = exc.read(4096).decode("utf-8", errors="replace")
        raise MarketingDeliveryError(
            f"Publisher returned HTTP {exc.code}: {detail[:500]}"
        ) from None
    except (error.URLError, TimeoutError) as exc:
        raise MarketingDeliveryError(f"Publisher request failed: {type(exc).__name__}") from None
    except json.JSONDecodeError:
        raise MarketingDeliveryError("Publisher returned invalid JSON") from None
    if not isinstance(parsed, dict):
        raise MarketingDeliveryError("Publisher returned an unexpected response")
    return parsed


def _buffer_channel_ids() -> dict[str, str]:
    try:
        parsed = json.loads(settings.buffer_channel_ids_json or "{}")
    except json.JSONDecodeError:
        return {}
    if not isinstance(parsed, dict):
        return {}
    return {
        str(key).strip().lower(): str(value).strip()
        for key, value in parsed.items()
        if str(key).strip() and str(value).strip()
    }


def marketing_integration_status() -> dict[str, Any]:
    buffer_channels = _buffer_channel_ids()
    return {
        "ai": {
            "openai": bool(settings.openai_api_key),
            "gemini": bool(settings.gemini_api_key),
            "fallback_template": True,
        },
        "buffer": {
            "configured": bool(settings.buffer_api_key and buffer_channels),
            "channels": sorted(buffer_channels),
        },
        "devto": {
            "configured": bool(settings.devto_api_key),
            "organization_id": settings.devto_organization_id,
        },
        "github": {
            "configured": bool(
                settings.github_marketing_token
                and settings.github_marketing_repository_id
                and settings.github_marketing_discussion_category_id
            ),
        },
    }


def _variant(item: MarketingContent, *, channel: str, locale: str):
    content = MarketingBilingualContent.model_validate(item.content)
    variants = getattr(content, locale)
    if channel not in variants:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"The {locale}:{channel} variant has not been generated",
        )
    return variants[channel]


def _buffer_deliver(
    item: MarketingContent,
    *,
    delivery: MarketingDeliveryRequest,
) -> dict[str, Any]:
    if not settings.buffer_api_key:
        raise MarketingDeliveryError("Buffer API key is not configured")
    channels = _buffer_channel_ids()
    channel_id = channels.get(f"{delivery.channel}.{delivery.locale}") or channels.get(
        delivery.channel
    )
    if not channel_id:
        raise MarketingDeliveryError(
            f"Buffer channel ID is not configured for {delivery.channel}.{delivery.locale}"
        )
    variant = _variant(item, channel=delivery.channel, locale=delivery.locale)
    text = variant.body
    if variant.hashtags:
        text = f"{text.rstrip()}\n\n{' '.join(f'#{tag}' for tag in variant.hashtags)}"
    input_payload: dict[str, Any] = {
        "aiAssisted": bool(item.generated_by and not item.generated_by.startswith("template:")),
        "channelId": channel_id,
        "mode": "addToQueue",
        "schedulingType": "automatic",
        "text": text,
    }
    expected_status = "queued"
    if delivery.mode == "buffer_draft":
        input_payload["saveToDraft"] = True
        expected_status = "drafted"
    elif delivery.mode == "buffer_schedule":
        assert delivery.scheduled_at is not None
        scheduled_at = delivery.scheduled_at
        if scheduled_at.tzinfo is None:
            scheduled_at = scheduled_at.replace(tzinfo=timezone.utc)
        input_payload["mode"] = "customScheduled"
        input_payload["dueAt"] = scheduled_at.astimezone(timezone.utc).isoformat().replace(
            "+00:00", "Z"
        )
        expected_status = "scheduled"
    query = """
      mutation CreatePromtyPost($input: CreatePostInput!) {
        createPost(input: $input) {
          __typename
          ... on PostActionSuccess { post { id text dueAt status } }
          ... on MutationError { message }
        }
      }
    """
    response = _post_json(
        "https://api.buffer.com",
        body={"query": query, "variables": {"input": input_payload}},
        headers={"Authorization": f"Bearer {settings.buffer_api_key}"},
    )
    if response.get("errors"):
        raise MarketingDeliveryError(str(response["errors"])[:500])
    result = response.get("data", {}).get("createPost", {})
    if result.get("__typename") == "MutationError" or result.get("message"):
        raise MarketingDeliveryError(str(result.get("message") or "Buffer rejected the post"))
    post = result.get("post")
    if not isinstance(post, dict) or not post.get("id"):
        raise MarketingDeliveryError("Buffer did not return a post ID")
    return {
        "channel": delivery.channel,
        "locale": delivery.locale,
        "mode": delivery.mode,
        "status": expected_status,
        "external_id": str(post["id"]),
        "external_url": None,
        "due_at": post.get("dueAt"),
    }


def _devto_deliver(
    item: MarketingContent,
    *,
    delivery: MarketingDeliveryRequest,
) -> dict[str, Any]:
    if not settings.devto_api_key:
        raise MarketingDeliveryError("DEV API key is not configured")
    variant = _variant(item, channel="devto", locale=delivery.locale)
    article: dict[str, Any] = {
        "title": variant.title,
        "body_markdown": variant.body,
        "published": False,
        "description": item.source_summary[:255],
        "tags": ",".join(tag.lower()[:30] for tag in variant.hashtags[:4]),
    }
    if settings.devto_organization_id:
        article["organization_id"] = settings.devto_organization_id
    response = _post_json(
        "https://dev.to/api/articles",
        body={"article": article},
        headers={
            "Accept": "application/vnd.forem.api-v1+json",
            "api-key": settings.devto_api_key,
        },
    )
    if not response.get("id"):
        raise MarketingDeliveryError("DEV did not return an article ID")
    return {
        "channel": "devto",
        "locale": delivery.locale,
        "mode": delivery.mode,
        "status": "drafted",
        "external_id": str(response["id"]),
        "external_url": response.get("url"),
    }


def _github_deliver(
    item: MarketingContent,
    *,
    delivery: MarketingDeliveryRequest,
) -> dict[str, Any]:
    if not (
        settings.github_marketing_token
        and settings.github_marketing_repository_id
        and settings.github_marketing_discussion_category_id
    ):
        raise MarketingDeliveryError("GitHub Discussions publishing is not configured")
    variant = _variant(item, channel="github", locale=delivery.locale)
    query = """
      mutation CreatePromtyDiscussion($repositoryId: ID!, $categoryId: ID!, $title: String!, $body: String!) {
        createDiscussion(input: {repositoryId: $repositoryId, categoryId: $categoryId, title: $title, body: $body}) {
          discussion { id url }
        }
      }
    """
    response = _post_json(
        "https://api.github.com/graphql",
        body={
            "query": query,
            "variables": {
                "repositoryId": settings.github_marketing_repository_id,
                "categoryId": settings.github_marketing_discussion_category_id,
                "title": variant.title,
                "body": variant.body,
            },
        },
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {settings.github_marketing_token}",
            "User-Agent": "Promty-Marketing-Studio",
        },
    )
    if response.get("errors"):
        raise MarketingDeliveryError(str(response["errors"])[:500])
    discussion = response.get("data", {}).get("createDiscussion", {}).get("discussion", {})
    if not discussion.get("id"):
        raise MarketingDeliveryError("GitHub did not return a discussion ID")
    return {
        "channel": "github",
        "locale": delivery.locale,
        "mode": delivery.mode,
        "status": "published",
        "external_id": str(discussion["id"]),
        "external_url": discussion.get("url"),
    }


def deliver_marketing_content(
    item: MarketingContent,
    *,
    delivery: MarketingDeliveryRequest,
) -> dict[str, Any]:
    if delivery.mode != "manual" and item.status not in {"approved", "scheduled", "published"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Approve the bilingual content before sending it to an external channel",
        )

    if delivery.mode.startswith("buffer_"):
        result = _buffer_deliver(item, delivery=delivery)
    elif delivery.mode == "devto_draft":
        result = _devto_deliver(item, delivery=delivery)
    elif delivery.mode == "github_discussion":
        result = _github_deliver(item, delivery=delivery)
    else:
        _variant(item, channel=delivery.channel, locale=delivery.locale)
        result = {
            "channel": delivery.channel,
            "locale": delivery.locale,
            "mode": delivery.mode,
            "status": "copied",
            "external_id": None,
            "external_url": None,
        }

    recorded = {**result, "delivered_at": utc_now().isoformat()}
    results = dict(item.delivery_results or {})
    results[f"{delivery.locale}:{delivery.channel}"] = recorded
    item.delivery_results = results
    item.last_error = None
    item.updated_at = utc_now()
    if result["status"] in {"queued", "scheduled"}:
        item.status = "scheduled"
        item.scheduled_at = delivery.scheduled_at
    elif result["status"] == "published":
        item.status = "published"
        item.published_at = utc_now()
    return result
