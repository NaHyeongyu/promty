from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ProjectKnowledgeResource(Base):
    __tablename__ = "project_knowledge_resources"
    __table_args__ = (
        UniqueConstraint(
            "project_id",
            "title",
            name="uq_project_knowledge_resources_project_title",
        ),
        Index("ix_project_knowledge_resources_project_updated_at", "project_id", "updated_at"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    project_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        index=True,
    )
    last_event_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("events.id", ondelete="SET NULL"),
        index=True,
    )
    title: Mapped[str] = mapped_column(String(255))
    file_type: Mapped[str] = mapped_column(String(64))
    category: Mapped[str] = mapped_column(String(64))
    source_path: Mapped[str | None] = mapped_column(String(2048))
    status: Mapped[str] = mapped_column(String(32), default="active")
    metadata_: Mapped[dict] = mapped_column("metadata", JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
    )

    project = relationship("Project", back_populates="knowledge_resources")
