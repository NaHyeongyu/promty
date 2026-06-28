from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class PublishedFlow(Base):
    __tablename__ = "published_flows"
    __table_args__ = (
        CheckConstraint(
            "visibility in ('private', 'unlisted', 'public')",
            name="ck_published_flows_visibility",
        ),
        CheckConstraint(
            "status in ('draft', 'published', 'archived')",
            name="ck_published_flows_status",
        ),
        CheckConstraint("prompt_count >= 0", name="ck_published_flows_prompt_count"),
        CheckConstraint("file_count >= 0", name="ck_published_flows_file_count"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    source_project_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="SET NULL"),
        index=True,
    )
    source_session_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("sessions.id", ondelete="SET NULL"),
        index=True,
    )
    source_start_event_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("events.id", ondelete="SET NULL"),
    )
    source_end_event_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("events.id", ondelete="SET NULL"),
    )
    author_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        index=True,
    )
    title: Mapped[str] = mapped_column(String(255))
    slug: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    summary: Mapped[str | None] = mapped_column(Text)
    context_summary: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)
    model_name: Mapped[str | None] = mapped_column(String(255))
    tool_name: Mapped[str | None] = mapped_column(String(64))
    visibility: Mapped[str] = mapped_column(String(16), default="private")
    status: Mapped[str] = mapped_column(String(16), default="draft")
    tags: Mapped[list[str]] = mapped_column(JSONB, default=list)
    metrics: Mapped[dict] = mapped_column(JSONB, default=dict)
    prompt_count: Mapped[int] = mapped_column(Integer, default=0)
    file_count: Mapped[int] = mapped_column(Integer, default=0)
    start_sequence: Mapped[int | None] = mapped_column(Integer)
    end_sequence: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
    )
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    author = relationship("User")
    source_project = relationship("Project")
    source_session = relationship("Session")
    items = relationship(
        "PublishedFlowItem",
        back_populates="published_flow",
        cascade="all, delete-orphan",
        order_by="PublishedFlowItem.item_order",
    )
    files = relationship(
        "PublishedFlowFile",
        back_populates="published_flow",
        cascade="all, delete-orphan",
        order_by="PublishedFlowFile.file_path",
    )
    comments = relationship(
        "PublishedFlowComment",
        back_populates="published_flow",
        cascade="all, delete-orphan",
    )
    reactions = relationship(
        "PublishedFlowReaction",
        back_populates="published_flow",
        cascade="all, delete-orphan",
    )


class PublishedFlowItem(Base):
    __tablename__ = "published_flow_items"
    __table_args__ = (
        CheckConstraint("item_order > 0", name="ck_published_flow_items_order_positive"),
        CheckConstraint(
            "sequence > 0",
            name="ck_published_flow_items_sequence_positive",
        ),
        CheckConstraint(
            "files_changed >= 0",
            name="ck_published_flow_items_files_changed",
        ),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    published_flow_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("published_flows.id", ondelete="CASCADE"),
        index=True,
    )
    source_event_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("events.id", ondelete="SET NULL"),
        index=True,
    )
    item_order: Mapped[int] = mapped_column(Integer)
    sequence: Mapped[int] = mapped_column(Integer)
    prompt_text: Mapped[str] = mapped_column(Text)
    response_text: Mapped[str | None] = mapped_column(Text)
    model_name: Mapped[str | None] = mapped_column(String(255))
    tool_name: Mapped[str | None] = mapped_column(String(64))
    files_changed: Mapped[int] = mapped_column(Integer, default=0)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    response_received_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_included: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    published_flow = relationship("PublishedFlow", back_populates="items")
    source_event = relationship("Event")


class PublishedFlowFile(Base):
    __tablename__ = "published_flow_files"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    published_flow_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("published_flows.id", ondelete="CASCADE"),
        index=True,
    )
    source_event_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("events.id", ondelete="SET NULL"),
        index=True,
    )
    file_path: Mapped[str] = mapped_column(String(2048))
    change_type: Mapped[str | None] = mapped_column(String(32))
    language: Mapped[str | None] = mapped_column(String(64))
    diff: Mapped[str | None] = mapped_column(Text)
    additions: Mapped[int] = mapped_column(Integer, default=0)
    deletions: Mapped[int] = mapped_column(Integer, default=0)
    is_included: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    published_flow = relationship("PublishedFlow", back_populates="files")
    source_event = relationship("Event")


class PublishedFlowComment(Base):
    __tablename__ = "published_flow_comments"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    published_flow_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("published_flows.id", ondelete="CASCADE"),
        index=True,
    )
    author_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        index=True,
    )
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
    )

    published_flow = relationship("PublishedFlow", back_populates="comments")
    author = relationship("User")


class PublishedFlowReaction(Base):
    __tablename__ = "published_flow_reactions"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    published_flow_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("published_flows.id", ondelete="CASCADE"),
        index=True,
    )
    author_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        index=True,
    )
    reaction_type: Mapped[str] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    published_flow = relationship("PublishedFlow", back_populates="reactions")
    author = relationship("User")
