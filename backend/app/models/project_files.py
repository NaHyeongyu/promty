from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, Index, String, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.time import utc_now
from app.db.session import Base


class ProjectFile(Base):
    __tablename__ = "project_files"
    __table_args__ = (
        UniqueConstraint("project_id", "path", name="uq_project_files_project_path"),
        Index("ix_project_files_project_changed_at", "project_id", "changed_at"),
        Index(
            "ix_project_files_active_project_path",
            "project_id",
            "path",
            postgresql_where=text("status <> 'deleted'"),
        ),
        Index(
            "ix_project_files_active_project_changed_at",
            "project_id",
            "changed_at",
            postgresql_where=text("status <> 'deleted'"),
        ),
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
    path: Mapped[str] = mapped_column(String(2048))
    kind: Mapped[str] = mapped_column(String(16), default="file")
    status: Mapped[str] = mapped_column(String(32), default="active")
    metadata_: Mapped[dict] = mapped_column("metadata", JSONB, default=dict)
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
    )

    project = relationship("Project", back_populates="files")
