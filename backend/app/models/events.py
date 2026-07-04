from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.time import utc_now
from app.db.session import Base


class Event(Base):
    __tablename__ = "events"
    __table_args__ = (
        CheckConstraint("sequence > 0", name="ck_events_sequence_positive"),
        CheckConstraint("schema_version >= 1", name="ck_events_schema_version_positive"),
        CheckConstraint(
            "tool in ('claude-code', 'codex-cli', 'cursor', 'gemini-cli')",
            name="ck_events_tool_supported",
        ),
        CheckConstraint(
            "event_type in ("
            "'SessionStarted', "
            "'PromptSubmitted', "
            "'ResponseReceived', "
            "'FilesChanged', "
            "'CommitCreated', "
            "'SessionEnded'"
            ")",
            name="ck_events_event_type_supported",
        ),
        Index(
            "ux_events_project_session_sequence",
            "project_id",
            "session_id",
            "sequence",
            unique=True,
        ),
        Index("ix_events_project_created_at", "project_id", "created_at"),
        Index("ix_events_created_at_sequence", "created_at", "sequence"),
        Index("ix_events_event_type_created_at", "event_type", "created_at"),
        Index("ix_events_session_created_at", "session_id", "created_at"),
        Index("ix_events_project_session_created_at", "project_id", "session_id", "created_at"),
        Index("ix_events_payload_gin", "payload", postgresql_using="gin"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
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
    sequence: Mapped[int] = mapped_column(Integer)
    schema_version: Mapped[int] = mapped_column(Integer, default=1)
    tool: Mapped[str] = mapped_column(String(64))
    event_type: Mapped[str] = mapped_column(String(64))
    payload: Mapped[dict] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    project = relationship("Project", back_populates="events")
    session = relationship("Session", back_populates="events")
    artifacts = relationship("Artifact", back_populates="event")
