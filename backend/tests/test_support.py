from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.core.time import utc_now
from app.core.encryption import ENCRYPTED_TEXT_PREFIX
from app.models.support_inquiries import SupportInquiry
from app.models.users import User
from app.schemas.support import SupportInquiryCreateRequest
from app.services import support


class FakeSession:
    def __init__(self) -> None:
        self.items: list[object] = []

    def add(self, item: object) -> None:
        self.items.append(item)

    def flush(self) -> None:
        return None


class FakeSesClient:
    def __init__(self, *, error: Exception | None = None) -> None:
        self.error = error
        self.requests: list[dict] = []

    def send_email(self, **kwargs):
        self.requests.append(kwargs)
        if self.error is not None:
            raise self.error
        return {"MessageId": "ses-message-123"}


def _settings(*, enabled: bool = True) -> SimpleNamespace:
    return SimpleNamespace(
        aws_region="ap-southeast-2" if enabled else None,
        support_email_provider="ses" if enabled else "disabled",
        support_from_email="support@promty.org" if enabled else None,
        support_notification_emails=("owner@example.com",) if enabled else (),
    )


def _inquiry() -> SupportInquiry:
    return SupportInquiry(
        category="bug",
        created_at=utc_now(),
        id=uuid4(),
        message="The generated memory detail did not show the complete content.",
        notification_status="pending",
        requester_email="member@example.com",
        requester_username="member",
        subject="Memory detail is truncated",
        user_id=uuid4(),
    )


def test_support_request_normalizes_fields_and_rejects_invalid_email() -> None:
    payload = SupportInquiryCreateRequest(
        category="question",
        message="  Please help me connect the collector correctly.  ",
        reply_email="  MEMBER@EXAMPLE.COM ",
        subject="  Collector setup help  ",
    )

    assert payload.reply_email == "member@example.com"
    assert payload.subject == "Collector setup help"
    assert payload.message == "Please help me connect the collector correctly."

    content_report = SupportInquiryCreateRequest(
        category="content_report",
        message="This published flow exposes private repository information.",
        reply_email="member@example.com",
        subject="Community content report",
    )
    assert content_report.category == "content_report"

    with pytest.raises(ValidationError):
        SupportInquiryCreateRequest(
            category="question",
            message="This message is long enough for validation.",
            reply_email="not-an-email",
            subject="Need help",
        )


def test_create_support_inquiry_stores_requester_snapshot(monkeypatch) -> None:
    monkeypatch.setattr(support, "settings", _settings(enabled=False))
    user = User(
        email="github@example.com",
        github_id="github-member",
        id=uuid4(),
        username="member",
    )
    db = FakeSession()

    inquiry = support.create_support_inquiry(
        db,  # type: ignore[arg-type]
        category="feature",
        current_user=user,
        message="Please add a compact weekly memory digest.",
        reply_email="reply@example.com",
        subject="Weekly memory digest",
    )

    assert db.items == [inquiry]
    assert inquiry.user_id == user.id
    assert inquiry.requester_username == "member"
    assert inquiry.requester_email == "reply@example.com"
    assert inquiry.notification_status == "disabled"
    assert inquiry.subject.startswith(ENCRYPTED_TEXT_PREFIX)
    assert inquiry.message.startswith(ENCRYPTED_TEXT_PREFIX)


def test_ses_notification_uses_requester_as_reply_to(monkeypatch) -> None:
    client = FakeSesClient()
    inquiry = _inquiry()
    monkeypatch.setattr(support, "settings", _settings())
    monkeypatch.setattr(support, "_ses_client", lambda: client)

    message_id = support.send_support_inquiry_notification(inquiry)

    assert message_id == "ses-message-123"
    assert inquiry.notification_status == "sent"
    assert inquiry.notified_at is not None
    request = client.requests[0]
    assert request["Source"] == "support@promty.org"
    assert request["Destination"] == {"ToAddresses": ["owner@example.com"]}
    assert request["ReplyToAddresses"] == ["member@example.com"]
    assert "Memory detail is truncated" in request["Message"]["Subject"]["Data"]
    assert inquiry.message in request["Message"]["Body"]["Text"]["Data"]


def test_notification_failure_is_recorded_without_losing_inquiry(monkeypatch) -> None:
    inquiry = _inquiry()
    monkeypatch.setattr(support, "settings", _settings())
    monkeypatch.setattr(
        support,
        "_ses_client",
        lambda: FakeSesClient(error=RuntimeError("SES unavailable")),
    )

    support.deliver_support_inquiry_notification(inquiry)

    assert inquiry.notification_status == "failed"
    assert inquiry.notification_error == "RuntimeError: SES unavailable"


def test_support_route_publishes_response_contract() -> None:
    from app.main import app

    operation = app.openapi()["paths"]["/api/support/inquiries"]["post"]

    assert operation["responses"]["201"]["content"]["application/json"]["schema"]["$ref"].endswith(
        "SupportInquiryResponse"
    )
