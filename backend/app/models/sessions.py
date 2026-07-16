from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.time import utc_now
from app.db.session import Base


class Session(Base):
    __tablename__ = "sessions"
    __table_args__ = (
        CheckConstraint(
            "ended_at is null or ended_at >= started_at",
            name="ck_sessions_ended_after_started",
        ),
        Index("ix_sessions_project_started_at", "project_id", "started_at"),
        Index(
            "ix_sessions_open_last_activity",
            "last_activity_at",
            "started_at",
            "id",
            postgresql_where=text(
                "ended_at IS NULL AND last_activity_at IS NOT NULL"
            ),
        ),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    project_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        index=True,
    )
    device_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("devices.id", ondelete="SET NULL"),
        index=True,
    )
    tool: Mapped[str] = mapped_column(String(64))
    tool_version: Mapped[str | None] = mapped_column(String(64))
    model: Mapped[str | None] = mapped_column(String(255))
    cwd: Mapped[str | None] = mapped_column(String(2048))
    branch: Mapped[str | None] = mapped_column(String(255))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    last_activity_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    project = relationship("Project", back_populates="sessions")
    device = relationship("Device", back_populates="sessions")
    events = relationship("Event", back_populates="session", cascade="all, delete-orphan")
    artifacts = relationship("Artifact", back_populates="session")
