from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.time import utc_now
from app.db.session import Base


class SupportInquiry(Base):
    __tablename__ = "support_inquiries"
    __table_args__ = (
        CheckConstraint(
            "category in ('question', 'bug', 'feature', 'privacy', 'other')",
            name="ck_support_inquiries_category",
        ),
        CheckConstraint(
            "status in ('new', 'in_progress', 'resolved')",
            name="ck_support_inquiries_status",
        ),
        CheckConstraint(
            "notification_status in ('pending', 'sent', 'failed', 'disabled')",
            name="ck_support_inquiries_notification_status",
        ),
        Index("ix_support_inquiries_status_created_at", "status", "created_at"),
        Index("ix_support_inquiries_user_created_at", "user_id", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    requester_username: Mapped[str] = mapped_column(String(255), nullable=False)
    requester_email: Mapped[str] = mapped_column(String(320), nullable=False)
    category: Mapped[str] = mapped_column(String(32), nullable=False)
    subject: Mapped[str] = mapped_column(Text, nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(
        String(32),
        default="new",
        nullable=False,
        server_default="new",
    )
    notification_status: Mapped[str] = mapped_column(
        String(32),
        default="pending",
        nullable=False,
        server_default="pending",
    )
    notification_message_id: Mapped[str | None] = mapped_column(String(255))
    notification_error: Mapped[str | None] = mapped_column(String(500))
    notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False,
    )

    user = relationship("User")
