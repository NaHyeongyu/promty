"""add published prompt flow tables

Revision ID: 0008_published_flows
Revises: 0007_prompt_hub
Create Date: 2026-06-28 00:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0008_published_flows"
down_revision: str | None = "0007_prompt_hub"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UTC_NOW = sa.text("timezone('utc', now())")


def upgrade() -> None:
    op.create_table(
        "published_flows",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("source_project_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("source_session_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("source_start_event_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("source_end_event_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("author_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("slug", sa.String(length=255), nullable=False),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("context_summary", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("model_name", sa.String(length=255), nullable=True),
        sa.Column("tool_name", sa.String(length=64), nullable=True),
        sa.Column("visibility", sa.String(length=16), nullable=False, server_default="private"),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="draft"),
        sa.Column(
            "tags",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "metrics",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("prompt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("file_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("start_sequence", sa.Integer(), nullable=True),
        sa.Column("end_sequence", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=UTC_NOW),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=UTC_NOW),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "visibility in ('private', 'unlisted', 'public')",
            name="ck_published_flows_visibility",
        ),
        sa.CheckConstraint(
            "status in ('draft', 'published', 'archived')",
            name="ck_published_flows_status",
        ),
        sa.CheckConstraint("prompt_count >= 0", name="ck_published_flows_prompt_count"),
        sa.CheckConstraint("file_count >= 0", name="ck_published_flows_file_count"),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["source_project_id"], ["projects.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["source_session_id"], ["sessions.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["source_start_event_id"], ["events.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["source_end_event_id"], ["events.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("slug", name="uq_published_flows_slug"),
    )
    op.create_index("ix_published_flows_author_id", "published_flows", ["author_id"])
    op.create_index("ix_published_flows_published_at", "published_flows", ["published_at"])
    op.create_index(
        "ix_published_flows_source_project_id",
        "published_flows",
        ["source_project_id"],
    )
    op.create_index(
        "ix_published_flows_source_session_id",
        "published_flows",
        ["source_session_id"],
    )
    op.create_index(
        "ix_published_flows_status_visibility",
        "published_flows",
        ["status", "visibility"],
    )

    op.create_table(
        "published_flow_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("published_flow_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("source_event_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("item_order", sa.Integer(), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("prompt_text", sa.Text(), nullable=False),
        sa.Column("response_text", sa.Text(), nullable=True),
        sa.Column("model_name", sa.String(length=255), nullable=True),
        sa.Column("tool_name", sa.String(length=64), nullable=True),
        sa.Column("files_changed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("response_received_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_included", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=UTC_NOW),
        sa.CheckConstraint("item_order > 0", name="ck_published_flow_items_order_positive"),
        sa.CheckConstraint("sequence > 0", name="ck_published_flow_items_sequence_positive"),
        sa.CheckConstraint("files_changed >= 0", name="ck_published_flow_items_files_changed"),
        sa.ForeignKeyConstraint(["published_flow_id"], ["published_flows.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["source_event_id"], ["events.id"], ondelete="SET NULL"),
        sa.UniqueConstraint(
            "published_flow_id",
            "item_order",
            name="uq_published_flow_items_order",
        ),
    )
    op.create_index(
        "ix_published_flow_items_flow_id",
        "published_flow_items",
        ["published_flow_id"],
    )
    op.create_index(
        "ix_published_flow_items_source_event_id",
        "published_flow_items",
        ["source_event_id"],
    )

    op.create_table(
        "published_flow_files",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("published_flow_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("source_event_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("file_path", sa.String(length=2048), nullable=False),
        sa.Column("change_type", sa.String(length=32), nullable=True),
        sa.Column("language", sa.String(length=64), nullable=True),
        sa.Column("diff", sa.Text(), nullable=True),
        sa.Column("additions", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("deletions", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_included", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=UTC_NOW),
        sa.ForeignKeyConstraint(["published_flow_id"], ["published_flows.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["source_event_id"], ["events.id"], ondelete="SET NULL"),
    )
    op.create_index(
        "ix_published_flow_files_flow_id",
        "published_flow_files",
        ["published_flow_id"],
    )
    op.create_index(
        "ix_published_flow_files_source_event_id",
        "published_flow_files",
        ["source_event_id"],
    )

    op.create_table(
        "published_flow_comments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("published_flow_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("author_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=UTC_NOW),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=UTC_NOW),
        sa.ForeignKeyConstraint(["published_flow_id"], ["published_flows.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index(
        "ix_published_flow_comments_author_id",
        "published_flow_comments",
        ["author_id"],
    )
    op.create_index(
        "ix_published_flow_comments_flow_id",
        "published_flow_comments",
        ["published_flow_id"],
    )

    op.create_table(
        "published_flow_reactions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("published_flow_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("author_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("reaction_type", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=UTC_NOW),
        sa.ForeignKeyConstraint(["published_flow_id"], ["published_flows.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint(
            "published_flow_id",
            "author_id",
            "reaction_type",
            name="uq_published_flow_reactions_flow_author_type",
        ),
    )
    op.create_index(
        "ix_published_flow_reactions_author_id",
        "published_flow_reactions",
        ["author_id"],
    )
    op.create_index(
        "ix_published_flow_reactions_flow_id",
        "published_flow_reactions",
        ["published_flow_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_published_flow_reactions_flow_id", table_name="published_flow_reactions")
    op.drop_index("ix_published_flow_reactions_author_id", table_name="published_flow_reactions")
    op.drop_table("published_flow_reactions")
    op.drop_index("ix_published_flow_comments_flow_id", table_name="published_flow_comments")
    op.drop_index("ix_published_flow_comments_author_id", table_name="published_flow_comments")
    op.drop_table("published_flow_comments")
    op.drop_index("ix_published_flow_files_source_event_id", table_name="published_flow_files")
    op.drop_index("ix_published_flow_files_flow_id", table_name="published_flow_files")
    op.drop_table("published_flow_files")
    op.drop_index("ix_published_flow_items_source_event_id", table_name="published_flow_items")
    op.drop_index("ix_published_flow_items_flow_id", table_name="published_flow_items")
    op.drop_table("published_flow_items")
    op.drop_index("ix_published_flows_status_visibility", table_name="published_flows")
    op.drop_index("ix_published_flows_source_session_id", table_name="published_flows")
    op.drop_index("ix_published_flows_source_project_id", table_name="published_flows")
    op.drop_index("ix_published_flows_published_at", table_name="published_flows")
    op.drop_index("ix_published_flows_author_id", table_name="published_flows")
    op.drop_table("published_flows")
