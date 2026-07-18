from __future__ import annotations

from datetime import timedelta
import json
from types import SimpleNamespace
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.core.time import utc_now
from app.models.marketing_content import MarketingContent
from app.schemas.marketing import (
    MarketingContentCreateRequest,
    MarketingDeliveryRequest,
)
from app.services.marketing_content import (
    approve_marketing_content,
    generate_marketing_content,
)
from app.services import marketing_publishers


def _content_item() -> MarketingContent:
    return MarketingContent(
        campaign_name="context continuity launch",
        channels=["x", "linkedin", "reddit", "hackernews"],
        content={},
        delivery_results={},
        id=uuid4(),
        source_summary=(
            "Promty captures coding sessions and turns decisions, reasons, and open questions "
            "into durable project memory for the next AI coding session."
        ),
        source_title="Your AI tools forget. Promty remembers.",
        source_type="release",
        status="draft",
        tone="practical",
    )

def test_marketing_request_requires_public_urls_and_valid_channels() -> None:
    payload = MarketingContentCreateRequest(
        campaign_name="  Launch story  ",
        channels=["x", "linkedin", "x"],
        cta_url=" https://promty.org/app ",
        source_summary="A sufficiently detailed source summary for generation.",
        source_title="  Durable context  ",
    )

    assert payload.campaign_name == "Launch story"
    assert payload.channels == ["x", "linkedin"]
    assert payload.cta_url == "https://promty.org/app"

    with pytest.raises(ValidationError):
        MarketingContentCreateRequest(
            campaign_name="Unsafe",
            cta_url="javascript:alert(1)",
            source_summary="A sufficiently detailed source summary for generation.",
            source_title="Unsafe URL",
        )


def test_template_generation_always_creates_korean_and_english_variants() -> None:
    item = _content_item()

    generated = generate_marketing_content(item, provider="template")

    assert generated.status == "review"
    assert generated.generated_by == "template:bilingual-v1"
    assert set(generated.content) == {"ko", "en"}
    assert set(generated.content["ko"]) == set(item.channels)
    assert set(generated.content["en"]) == set(item.channels)
    assert "utm_source=x" in generated.content["ko"]["x"]["body"]
    assert "utm_content=" in generated.content["en"]["linkedin"]["body"]

    approve_marketing_content(generated)
    assert generated.status == "approved"


def test_delivery_request_rejects_mismatched_provider_channel() -> None:
    with pytest.raises(ValidationError):
        MarketingDeliveryRequest(
            channel="reddit",
            locale="ko",
            mode="buffer_queue",
        )

    with pytest.raises(ValidationError):
        MarketingDeliveryRequest(
            channel="x",
            locale="en",
            mode="buffer_schedule",
        )


def test_buffer_delivery_records_locale_channel_result(monkeypatch) -> None:
    item = _content_item()
    generate_marketing_content(item, provider="template")
    approve_marketing_content(item)
    scheduled_at = utc_now() + timedelta(days=1)
    captured: dict = {}

    monkeypatch.setattr(
        marketing_publishers,
        "settings",
        SimpleNamespace(
            buffer_api_key="buffer-secret",
            buffer_channel_ids_json=json.dumps({"x.ko": "channel-ko"}),
            devto_api_key=None,
            devto_organization_id=None,
            gemini_api_key=None,
            github_marketing_discussion_category_id=None,
            github_marketing_repository_id=None,
            github_marketing_token=None,
            openai_api_key=None,
        ),
    )

    def fake_post_json(url: str, *, body: dict, headers: dict) -> dict:
        captured.update({"url": url, "body": body, "headers": headers})
        return {
            "data": {
                "createPost": {
                    "__typename": "PostActionSuccess",
                    "post": {
                        "dueAt": scheduled_at.isoformat(),
                        "id": "buffer-post-1",
                        "status": "scheduled",
                        "text": "scheduled",
                    },
                }
            }
        }

    monkeypatch.setattr(marketing_publishers, "_post_json", fake_post_json)
    result = marketing_publishers.deliver_marketing_content(
        item,
        delivery=MarketingDeliveryRequest(
            channel="x",
            locale="ko",
            mode="buffer_schedule",
            scheduled_at=scheduled_at,
        ),
    )

    assert result["status"] == "scheduled"
    assert result["external_id"] == "buffer-post-1"
    assert item.status == "scheduled"
    assert item.delivery_results["ko:x"]["external_id"] == "buffer-post-1"
    assert captured["url"] == "https://api.buffer.com"
    assert captured["body"]["variables"]["input"]["channelId"] == "channel-ko"
    assert captured["body"]["variables"]["input"]["mode"] == "customScheduled"
    assert captured["headers"]["Authorization"] == "Bearer buffer-secret"


def test_marketing_admin_routes_publish_response_contracts() -> None:
    from app.main import app

    paths = app.openapi()["paths"]
    assert paths["/api/admin/marketing-content"]["get"]["responses"]["200"]["content"][
        "application/json"
    ]["schema"]["$ref"].endswith("MarketingContentPageResponse")
    assert paths["/api/admin/marketing-content/{content_id}/generate"]["post"]["responses"][
        "200"
    ]["content"]["application/json"]["schema"]["$ref"].endswith(
        "MarketingContentResponse"
    )
