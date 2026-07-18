from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.time import utc_now
from app.db.session import Base


class ProjectMemoryBatch(Base):
    __tablename__ = "project_memory_batches"
    __table_args__ = (
        CheckConstraint(
            "status in ('pending', 'running', 'succeeded', 'failed', 'superseded')",
            name="ck_project_memory_batches_status",
        ),
        CheckConstraint(
            "grouping_mode in ('session', 'chronological')",
            name="ck_project_memory_batches_grouping_mode",
        ),
        UniqueConstraint(
            "project_id",
            "idempotency_key",
            name="uq_project_memory_batches_project_idempotency_key",
        ),
        Index(
            "ix_project_memory_batches_project_status_updated",
            "project_id",
            "status",
            "updated_at",
        ),
        Index(
            "ix_project_memory_batches_pending_created",
            "created_at",
            "id",
            postgresql_where=text("status = 'pending'"),
        ),
        Index(
            "ix_project_memory_batches_running_lease",
            "lease_expires_at",
            "id",
            postgresql_where=text("status = 'running'"),
        ),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    project_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        index=True,
    )
    requested_by_user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
    )
    project_memory_artifact_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("artifacts.id", ondelete="SET NULL"),
        index=True,
    )
    idempotency_key: Mapped[str] = mapped_column(String(64), nullable=False)
    idempotency_keys: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="pending", nullable=False)
    grouping_mode: Mapped[str] = mapped_column(String(16), default="session", nullable=False)
    result_status: Mapped[str | None] = mapped_column(String(32))
    attempt_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    chunk_results: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    generated_artifact_ids: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    source_session_ids: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    snapshot_manifest: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    error_code: Mapped[str | None] = mapped_column(String(64))
    error_message: Mapped[str | None] = mapped_column(Text)
    snapshot_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    lease_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
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

    project = relationship("Project")
    requested_by = relationship("User")
    project_memory_artifact = relationship("Artifact")
    items = relationship(
        "ProjectMemoryBatchItem",
        back_populates="batch",
        cascade="all, delete-orphan",
        order_by="ProjectMemoryBatchItem.ordinal",
    )


class ProjectMemoryBatchItem(Base):
    __tablename__ = "project_memory_batch_items"
    __table_args__ = (
        UniqueConstraint("draft_id", name="uq_project_memory_batch_items_draft_id"),
        UniqueConstraint(
            "batch_id",
            "ordinal",
            name="uq_project_memory_batch_items_batch_ordinal",
        ),
    )

    batch_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("project_memory_batches.id", ondelete="CASCADE"),
        primary_key=True,
    )
    draft_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("artifacts.id", ondelete="RESTRICT"),
        primary_key=True,
    )
    draft_version_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("artifact_versions.id", ondelete="RESTRICT"),
        index=True,
    )
    source_session_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("sessions.id", ondelete="SET NULL"),
        index=True,
    )
    ordinal: Mapped[int] = mapped_column(Integer, nullable=False)

    batch = relationship("ProjectMemoryBatch", back_populates="items")
    draft = relationship("Artifact", foreign_keys=[draft_id])
    draft_version = relationship("ArtifactVersion", foreign_keys=[draft_version_id])
    source_session = relationship("Session", foreign_keys=[source_session_id])


class ProjectMemoryBatchRequest(Base):
    __tablename__ = "project_memory_batch_requests"

    project_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        primary_key=True,
    )
    idempotency_key: Mapped[str] = mapped_column(
        String(64),
        primary_key=True,
    )
    # A batch FK would make alias inserts wait behind the batch's final FOR UPDATE lock.
    batch_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        index=True,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )

    project = relationship("Project")
