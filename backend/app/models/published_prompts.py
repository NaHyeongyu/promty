from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class PublishedPrompt(Base):
    __tablename__ = "published_prompts"
    __table_args__ = (
        CheckConstraint(
            "visibility in ('private', 'unlisted', 'public')",
            name="ck_published_prompts_visibility",
        ),
        CheckConstraint(
            "status in ('draft', 'published', 'archived')",
            name="ck_published_prompts_status",
        ),
        Index("ix_published_prompts_published_at", "published_at"),
        Index("ix_published_prompts_status_visibility", "status", "visibility"),
        Index("ix_published_prompts_category", "category"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    source_project_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="SET NULL"),
        index=True,
    )
    source_activity_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("events.id", ondelete="SET NULL"),
        index=True,
    )
    author_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        index=True,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    summary: Mapped[str | None] = mapped_column(Text)
    prompt_text: Mapped[str] = mapped_column(Text, nullable=False)
    result_summary: Mapped[str | None] = mapped_column(Text)
    model_name: Mapped[str | None] = mapped_column(String(255))
    tool_name: Mapped[str | None] = mapped_column(String(64))
    visibility: Mapped[str] = mapped_column(String(16), default="private", nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="draft", nullable=False)
    category: Mapped[str | None] = mapped_column(String(120))
    tags: Mapped[list[str]] = mapped_column(JSONB, default=list, nullable=False)
    shared_scope: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    metrics: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    score_overall: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    score_frontend: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    score_backend: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    score_architecture: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    score_refactoring: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    score_documentation: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
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
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    files = relationship(
        "PublishedPromptFile",
        back_populates="published_prompt",
        cascade="all, delete-orphan",
    )
    comments = relationship(
        "PublishedPromptComment",
        back_populates="published_prompt",
        cascade="all, delete-orphan",
    )
    reactions = relationship(
        "PublishedPromptReaction",
        back_populates="published_prompt",
        cascade="all, delete-orphan",
    )


class PublishedPromptFile(Base):
    __tablename__ = "published_prompt_files"
    __table_args__ = (
        Index("ix_published_prompt_files_prompt_id", "published_prompt_id"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    published_prompt_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("published_prompts.id", ondelete="CASCADE"),
        nullable=False,
    )
    file_path: Mapped[str] = mapped_column(String(2048), nullable=False)
    change_type: Mapped[str | None] = mapped_column(String(32))
    language: Mapped[str | None] = mapped_column(String(64))
    diff: Mapped[str | None] = mapped_column(Text)
    additions: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    deletions: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_included: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )

    published_prompt = relationship("PublishedPrompt", back_populates="files")


class PublishedPromptComment(Base):
    __tablename__ = "published_prompt_comments"
    __table_args__ = (
        Index("ix_published_prompt_comments_prompt_id", "published_prompt_id"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    published_prompt_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("published_prompts.id", ondelete="CASCADE"),
        nullable=False,
    )
    author_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        index=True,
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
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

    published_prompt = relationship("PublishedPrompt", back_populates="comments")


class PublishedPromptReaction(Base):
    __tablename__ = "published_prompt_reactions"
    __table_args__ = (
        UniqueConstraint(
            "published_prompt_id",
            "author_id",
            "reaction_type",
            name="uq_published_prompt_reactions_prompt_author_type",
        ),
        Index("ix_published_prompt_reactions_prompt_id", "published_prompt_id"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    published_prompt_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("published_prompts.id", ondelete="CASCADE"),
        nullable=False,
    )
    author_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        index=True,
    )
    reaction_type: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )

    published_prompt = relationship("PublishedPrompt", back_populates="reactions")
