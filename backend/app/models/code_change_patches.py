from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.time import utc_now
from app.db.session import Base


class CodeChangePatch(Base):
    __tablename__ = "code_change_patches"
    __table_args__ = (
        Index("ix_code_change_patches_project_prompt", "project_id", "prompt_event_id"),
        Index("ix_code_change_patches_project_created_at", "project_id", "created_at"),
        Index("ix_code_change_patches_event_id", "event_id"),
        Index("ix_code_change_patches_session_id", "session_id"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    project_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        index=True,
    )
    session_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("sessions.id", ondelete="CASCADE"),
        index=True,
    )
    event_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("events.id", ondelete="CASCADE"),
    )
    prompt_event_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), index=True)
    path: Mapped[str] = mapped_column(String(2048), nullable=False)
    old_path: Mapped[str | None] = mapped_column(String(2048))
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    additions: Mapped[int | None] = mapped_column(Integer)
    deletions: Mapped[int | None] = mapped_column(Integer)
    patch: Mapped[str | None] = mapped_column(Text)
    patch_truncated: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    binary: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    metadata_: Mapped[dict] = mapped_column("metadata", JSONB, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )

    project = relationship("Project", back_populates="code_change_patches")
