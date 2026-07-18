from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.time import utc_now
from app.db.session import Base


class Artifact(Base):
    __tablename__ = "artifacts"
    __table_args__ = (
        Index(
            "ix_artifacts_project_type_created_at",
            "project_id",
            "type",
            "created_at",
        ),
        Index(
            "ix_artifacts_project_type_updated_created",
            "project_id",
            "type",
            "updated_at",
            "created_at",
        ),
        Index(
            "ux_artifacts_memory_storage_key",
            "project_id",
            "type",
            "storage_key",
            unique=True,
            postgresql_where=text("type IN ('MemoryTask', 'MemoryDraft', 'ProjectMemory')"),
        ),
        Index(
            "ix_artifacts_pending_memory_project_session_created",
            "project_id",
            "session_id",
            "created_at",
            "id",
            postgresql_where=text(
                "type = 'MemoryDraft' "
                "AND metadata ->> 'artifact_stage' = 'pending_draft' "
                "AND metadata ->> 'review_state' = 'draft'"
            ),
        ),
        Index(
            "ix_artifacts_memory_slice_session_end",
            "session_id",
            text("((metadata ->> 'end_sequence')::integer)"),
            postgresql_where=text(
                "type = 'MemoryDraft' "
                "AND metadata ->> 'artifact_stage' = 'pending_draft' "
                "AND metadata ->> 'memory_strategy' = 'prompt_window_v1'"
            ),
        ),
        Index(
            "ix_artifacts_generated_memory_project_updated",
            "project_id",
            "updated_at",
            "created_at",
            "id",
            postgresql_where=text(
                "type = 'MemoryTask' "
                "AND metadata ->> 'artifact_stage' IN "
                "('generated_memory', 'verified_memory') "
                "AND metadata ->> 'review_state' IN ('generated', 'verified')"
            ),
        ),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    schema_version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    project_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        index=True,
    )
    session_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("sessions.id", ondelete="SET NULL"),
        index=True,
    )
    event_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("events.id", ondelete="SET NULL"),
        index=True,
    )
    type: Mapped[str] = mapped_column(String(64))
    title: Mapped[str] = mapped_column(Text)
    summary: Mapped[str | None] = mapped_column(Text)
    reason: Mapped[str | None] = mapped_column(Text)
    outcome: Mapped[str | None] = mapped_column(Text)
    storage_key: Mapped[str] = mapped_column(String(2048))
    tags: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    technologies: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    sections: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    changed_files: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    prompt_event_ids: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    commit_sha: Mapped[str | None] = mapped_column(String(64))
    model: Mapped[str | None] = mapped_column(String(255))
    generator: Mapped[str | None] = mapped_column(String(64))
    metadata_: Mapped[dict] = mapped_column("metadata", JSONB, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False,
    )

    project = relationship("Project", back_populates="artifacts")
    session = relationship("Session", back_populates="artifacts")
    event = relationship("Event", back_populates="artifacts")
    versions = relationship(
        "ArtifactVersion",
        back_populates="artifact",
        cascade="all, delete-orphan",
    )
