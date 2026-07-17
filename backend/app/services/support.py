from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.encryption import (
    encrypt_app_text_to_string,
    maybe_decrypt_app_text_from_string,
)
from app.core.time import utc_now
from app.models.support_inquiries import SupportInquiry
from app.models.users import User


logger = logging.getLogger(__name__)

CATEGORY_LABELS = {
    "question": "일반 문의",
    "bug": "오류 신고",
    "feature": "기능 제안",
    "privacy": "개인정보 및 데이터",
    "other": "기타",
}
SUPPORT_MESSAGE_PURPOSE = "support_inquiry.message"
SUPPORT_SUBJECT_PURPOSE = "support_inquiry.subject"


def support_email_is_configured() -> bool:
    return bool(
        settings.support_email_provider == "ses"
        and settings.support_notification_emails
        and settings.aws_region
    )


def create_support_inquiry(
    db: Session,
    *,
    category: str,
    current_user: User,
    message: str,
    reply_email: str,
    subject: str,
) -> SupportInquiry:
    inquiry = SupportInquiry(
        category=category,
        message=encrypt_app_text_to_string(message, purpose=SUPPORT_MESSAGE_PURPOSE),
        notification_status="pending" if support_email_is_configured() else "disabled",
        requester_email=reply_email,
        requester_username=current_user.username,
        subject=encrypt_app_text_to_string(subject, purpose=SUPPORT_SUBJECT_PURPOSE),
        user_id=current_user.id,
    )
    db.add(inquiry)
    db.flush()
    return inquiry


def _notification_body(inquiry: SupportInquiry) -> str:
    category = CATEGORY_LABELS.get(inquiry.category, inquiry.category)
    message = (
        maybe_decrypt_app_text_from_string(
            inquiry.message,
            purpose=SUPPORT_MESSAGE_PURPOSE,
        )
        or ""
    )
    subject = (
        maybe_decrypt_app_text_from_string(
            inquiry.subject,
            purpose=SUPPORT_SUBJECT_PURPOSE,
        )
        or ""
    )
    return "\n".join(
        (
            "Promty에 새 문의가 접수되었습니다.",
            "",
            f"문의 ID: {inquiry.id}",
            f"유형: {category}",
            f"사용자: {inquiry.requester_username}",
            f"회신 이메일: {inquiry.requester_email}",
            f"제목: {subject}",
            "",
            "문의 내용",
            "----------",
            message,
        )
    )


def _ses_client() -> Any:
    import boto3

    return boto3.client("ses", region_name=settings.aws_region)


def send_support_inquiry_notification(inquiry: SupportInquiry) -> str | None:
    if not support_email_is_configured():
        inquiry.notification_status = "disabled"
        return None

    source = settings.support_from_email or settings.support_notification_emails[0]
    subject = (
        maybe_decrypt_app_text_from_string(
            inquiry.subject,
            purpose=SUPPORT_SUBJECT_PURPOSE,
        )
        or "새 문의"
    )
    response = _ses_client().send_email(
        Source=source,
        Destination={"ToAddresses": list(settings.support_notification_emails)},
        Message={
            "Subject": {
                "Charset": "UTF-8",
                "Data": f"[Promty 문의] {subject}",
            },
            "Body": {
                "Text": {
                    "Charset": "UTF-8",
                    "Data": _notification_body(inquiry),
                }
            },
        },
        ReplyToAddresses=[inquiry.requester_email],
    )
    message_id = response.get("MessageId")
    inquiry.notification_message_id = str(message_id)[:255] if message_id is not None else None
    inquiry.notification_error = None
    inquiry.notification_status = "sent"
    inquiry.notified_at = utc_now()
    return inquiry.notification_message_id


def deliver_support_inquiry_notification(inquiry: SupportInquiry) -> None:
    try:
        send_support_inquiry_notification(inquiry)
    except Exception as exc:
        logger.exception("Support inquiry %s email notification failed", inquiry.id)
        inquiry.notification_error = f"{type(exc).__name__}: {exc}"[:500]
        inquiry.notification_status = "failed"


def support_inquiry_response(inquiry: SupportInquiry) -> dict[str, Any]:
    return {
        "created_at": inquiry.created_at,
        "id": inquiry.id,
        "status": "received",
    }
