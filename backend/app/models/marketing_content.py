from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.time import utc_now
from app.db.session import Base


class MarketingContent(Base):
    __tablename__ = "marketing_content"
    __table_args__ = (
        CheckConstraint(
            "source_type in ('manual', 'release', 'public_project', 'faq', 'support')",
            name="ck_marketing_content_source_type",
        ),
        CheckConstraint(
            "status in ('draft', 'review', 'approved', 'scheduled', 'published', 'failed')",
            name="ck_marketing_content_status",
        ),
        Index("ix_marketing_content_status_updated_at", "status", "updated_at"),
        Index("ix_marketing_content_created_at", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    creator_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    campaign_name: Mapped[str] = mapped_column(String(255), nullable=False)
    source_type: Mapped[str] = mapped_column(
        String(32),
        default="manual",
        nullable=False,
        server_default="manual",
    )
    source_title: Mapped[str] = mapped_column(String(500), nullable=False)
    source_summary: Mapped[str] = mapped_column(Text, nullable=False)
    source_url: Mapped[str | None] = mapped_column(String(2048))
    cta_url: Mapped[str | None] = mapped_column(String(2048))
    tone: Mapped[str] = mapped_column(
        String(32),
        default="practical",
        nullable=False,
        server_default="practical",
    )
    status: Mapped[str] = mapped_column(
        String(32),
        default="draft",
        nullable=False,
        server_default="draft",
    )
    channels: Mapped[list[str]] = mapped_column(JSONB, default=list, nullable=False)
    content: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    delivery_results: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    generated_by: Mapped[str | None] = mapped_column(String(255))
    last_error: Mapped[str | None] = mapped_column(String(1000))
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
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

    creator = relationship("User")
