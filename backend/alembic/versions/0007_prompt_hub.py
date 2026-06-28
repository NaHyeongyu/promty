"""add prompt hub community tables

Revision ID: 0007_prompt_hub
Revises: 0006_code_change_patches
Create Date: 2026-06-28 00:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0007_prompt_hub"
down_revision: str | None = "0006_code_change_patches"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UTC_NOW = sa.text("timezone('utc', now())")


def upgrade() -> None:
    op.create_table(
        "published_prompts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("source_project_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("source_activity_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("author_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("slug", sa.String(length=255), nullable=False),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("prompt_text", sa.Text(), nullable=False),
        sa.Column("result_summary", sa.Text(), nullable=True),
        sa.Column("model_name", sa.String(length=255), nullable=True),
        sa.Column("tool_name", sa.String(length=64), nullable=True),
        sa.Column("visibility", sa.String(length=16), nullable=False, server_default="private"),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="draft"),
        sa.Column("category", sa.String(length=120), nullable=True),
        sa.Column(
            "tags",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "shared_scope",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "metrics",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("score_overall", sa.Numeric(precision=5, scale=2), nullable=True),
        sa.Column("score_frontend", sa.Numeric(precision=5, scale=2), nullable=True),
        sa.Column("score_backend", sa.Numeric(precision=5, scale=2), nullable=True),
        sa.Column("score_architecture", sa.Numeric(precision=5, scale=2), nullable=True),
        sa.Column("score_refactoring", sa.Numeric(precision=5, scale=2), nullable=True),
        sa.Column("score_documentation", sa.Numeric(precision=5, scale=2), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=UTC_NOW, nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=UTC_NOW, nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "visibility in ('private', 'unlisted', 'public')",
            name="ck_published_prompts_visibility",
        ),
        sa.CheckConstraint(
            "status in ('draft', 'published', 'archived')",
            name="ck_published_prompts_status",
        ),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["source_activity_id"], ["events.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["source_project_id"], ["projects.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("slug", name="uq_published_prompts_slug"),
    )
    op.create_index("ix_published_prompts_author_id", "published_prompts", ["author_id"])
    op.create_index("ix_published_prompts_category", "published_prompts", ["category"])
    op.create_index("ix_published_prompts_published_at", "published_prompts", ["published_at"])
    op.create_index(
        "ix_published_prompts_source_activity_id",
        "published_prompts",
        ["source_activity_id"],
    )
    op.create_index(
        "ix_published_prompts_source_project_id",
        "published_prompts",
        ["source_project_id"],
    )
    op.create_index(
        "ix_published_prompts_status_visibility",
        "published_prompts",
        ["status", "visibility"],
    )

    op.create_table(
        "published_prompt_files",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("published_prompt_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("file_path", sa.String(length=2048), nullable=False),
        sa.Column("change_type", sa.String(length=32), nullable=True),
        sa.Column("language", sa.String(length=64), nullable=True),
        sa.Column("diff", sa.Text(), nullable=True),
        sa.Column("additions", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("deletions", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_included", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=UTC_NOW, nullable=False),
        sa.ForeignKeyConstraint(
            ["published_prompt_id"],
            ["published_prompts.id"],
            ondelete="CASCADE",
        ),
    )
    op.create_index(
        "ix_published_prompt_files_prompt_id",
        "published_prompt_files",
        ["published_prompt_id"],
    )

    op.create_table(
        "published_prompt_comments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("published_prompt_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("author_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=UTC_NOW, nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=UTC_NOW, nullable=False),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(
            ["published_prompt_id"],
            ["published_prompts.id"],
            ondelete="CASCADE",
        ),
    )
    op.create_index(
        "ix_published_prompt_comments_author_id",
        "published_prompt_comments",
        ["author_id"],
    )
    op.create_index(
        "ix_published_prompt_comments_prompt_id",
        "published_prompt_comments",
        ["published_prompt_id"],
    )

    op.create_table(
        "published_prompt_reactions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("published_prompt_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("author_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("reaction_type", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=UTC_NOW, nullable=False),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(
            ["published_prompt_id"],
            ["published_prompts.id"],
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "published_prompt_id",
            "author_id",
            "reaction_type",
            name="uq_published_prompt_reactions_prompt_author_type",
        ),
    )
    op.create_index(
        "ix_published_prompt_reactions_author_id",
        "published_prompt_reactions",
        ["author_id"],
    )
    op.create_index(
        "ix_published_prompt_reactions_prompt_id",
        "published_prompt_reactions",
        ["published_prompt_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_published_prompt_reactions_prompt_id",
        table_name="published_prompt_reactions",
    )
    op.drop_index(
        "ix_published_prompt_reactions_author_id",
        table_name="published_prompt_reactions",
    )
    op.drop_table("published_prompt_reactions")
    op.drop_index(
        "ix_published_prompt_comments_prompt_id",
        table_name="published_prompt_comments",
    )
    op.drop_index(
        "ix_published_prompt_comments_author_id",
        table_name="published_prompt_comments",
    )
    op.drop_table("published_prompt_comments")
    op.drop_index(
        "ix_published_prompt_files_prompt_id",
        table_name="published_prompt_files",
    )
    op.drop_table("published_prompt_files")
    op.drop_index("ix_published_prompts_status_visibility", table_name="published_prompts")
    op.drop_index("ix_published_prompts_source_project_id", table_name="published_prompts")
    op.drop_index("ix_published_prompts_source_activity_id", table_name="published_prompts")
    op.drop_index("ix_published_prompts_published_at", table_name="published_prompts")
    op.drop_index("ix_published_prompts_category", table_name="published_prompts")
    op.drop_index("ix_published_prompts_author_id", table_name="published_prompts")
    op.drop_table("published_prompts")
