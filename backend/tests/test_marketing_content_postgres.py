from __future__ import annotations

import os
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.users import User
from app.schemas.marketing import (
    MarketingContentCreateRequest,
    MarketingContentDeleteResponse,
    MarketingContentResponse,
    MarketingDeliveryRequest,
)
from app.services.marketing_content import (
    approve_marketing_content,
    create_marketing_content,
    delete_marketing_content,
    generate_marketing_content,
    list_marketing_content,
    marketing_content_response,
)
from app.services.marketing_publishers import deliver_marketing_content


pytestmark = pytest.mark.skipif(
    os.environ.get("PROMTY_RUN_POSTGRES_TESTS") != "1",
    reason="PostgreSQL integration tests are disabled",
)


@pytest.fixture
def db() -> Session:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


def test_bilingual_marketing_campaign_persists_and_lists(db: Session) -> None:
    marker = str(uuid4())
    admin = User(
        email=f"marketing-admin-{marker}@example.com",
        github_id=f"marketing-admin-{marker}",
        username=f"marketing-admin-{marker}",
    )
    db.add(admin)
    db.flush()
    item = create_marketing_content(
        db,
        creator=admin,
        payload=MarketingContentCreateRequest(
            campaign_name=f"Bilingual launch {marker}",
            channels=["x", "linkedin", "reddit"],
            cta_url="https://promty.org/app",
            source_summary=(
                "Promty keeps verified project decisions available across AI coding sessions "
                "and generates a read-only handoff for the next agent."
            ),
            source_title="Durable context for the next AI coding session",
            source_type="release",
            tone="technical",
        ),
    )
    generate_marketing_content(item, provider="template")
    approve_marketing_content(item)
    manual = deliver_marketing_content(
        item,
        delivery=MarketingDeliveryRequest(
            channel="reddit",
            locale="ko",
            mode="manual",
        ),
    )
    db.flush()

    response = marketing_content_response(item)
    MarketingContentResponse.model_validate(response)
    assert response["status"] == "approved"
    assert set(response["content"]) == {"ko", "en"}
    assert set(response["content"]["ko"]) == {"x", "linkedin", "reddit"}
    assert response["delivery_results"]["ko:reddit"]["status"] == "copied"
    assert manual["status"] == "copied"

    page = list_marketing_content(
        db,
        content_status="approved",
        limit=10,
        offset=0,
        query=marker,
    )
    assert page["total"] == 1
    assert page["items"][0]["id"] == str(item.id)
    assert page["items"][0]["creator"]["username"] == admin.username

    with pytest.raises(HTTPException) as exc_info:
        delete_marketing_content(db, item, confirmation="wrong campaign")
    assert exc_info.value.status_code == 400

    deleted = delete_marketing_content(db, item, confirmation=item.campaign_name)
    MarketingContentDeleteResponse.model_validate(deleted)
    assert deleted["status"] == "deleted"
    assert (
        list_marketing_content(
            db,
            content_status=None,
            limit=10,
            offset=0,
            query=marker,
        )["total"]
        == 0
    )
