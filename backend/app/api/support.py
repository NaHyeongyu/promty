from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, status
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.transactions import commit_or_conflict as _commit_or_conflict
from app.core.security import require_web_user
from app.db.session import get_db
from app.models.users import User
from app.schemas.support import SupportInquiryCreateRequest, SupportInquiryResponse
from app.services.support import (
    create_support_inquiry,
    deliver_support_inquiry_notification,
    support_inquiry_response,
)


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/support", tags=["support"])


@router.post(
    "/inquiries",
    response_model=SupportInquiryResponse,
    status_code=status.HTTP_201_CREATED,
)
def submit_support_inquiry(
    payload: SupportInquiryCreateRequest,
    current_user: User = Depends(require_web_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    inquiry = create_support_inquiry(
        db,
        category=payload.category,
        current_user=current_user,
        message=payload.message,
        reply_email=payload.reply_email,
        subject=payload.subject,
    )
    _commit_or_conflict(db, detail="Support inquiry could not be submitted.")
    response = support_inquiry_response(inquiry)

    deliver_support_inquiry_notification(inquiry)
    try:
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        logger.exception(
            "Support inquiry %s notification status could not be saved",
            inquiry.id,
        )
    return response
