"""add project detail resource tables

Revision ID: 0004_project_detail_resources
Revises: 0003_collector_tokens
Create Date: 2026-06-27 00:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0004_project_detail_resources"
down_revision: str | None = "0003_collector_tokens"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UTC_NOW = sa.text("timezone('utc', now())")


def upgrade() -> None:
    op.create_table(
        "project_files",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("last_event_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("path", sa.String(length=2048), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False, server_default="file"),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("changed_at", sa.DateTime(timezone=True), server_default=UTC_NOW, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=UTC_NOW, nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=UTC_NOW, nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["last_event_id"], ["events.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("project_id", "path", name="uq_project_files_project_path"),
    )
    op.create_index("ix_project_files_project_id", "project_files", ["project_id"])
    op.create_index("ix_project_files_last_event_id", "project_files", ["last_event_id"])
    op.create_index(
        "ix_project_files_project_changed_at",
        "project_files",
        ["project_id", "changed_at"],
    )

    op.create_table(
        "project_knowledge_resources",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("last_event_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("file_type", sa.String(length=64), nullable=False),
        sa.Column("category", sa.String(length=64), nullable=False),
        sa.Column("source_path", sa.String(length=2048), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=UTC_NOW, nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=UTC_NOW, nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["last_event_id"], ["events.id"], ondelete="SET NULL"),
        sa.UniqueConstraint(
            "project_id",
            "title",
            name="uq_project_knowledge_resources_project_title",
        ),
    )
    op.create_index(
        "ix_project_knowledge_resources_project_id",
        "project_knowledge_resources",
        ["project_id"],
    )
    op.create_index(
        "ix_project_knowledge_resources_last_event_id",
        "project_knowledge_resources",
        ["last_event_id"],
    )
    op.create_index(
        "ix_project_knowledge_resources_project_updated_at",
        "project_knowledge_resources",
        ["project_id", "updated_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_project_knowledge_resources_project_updated_at",
        table_name="project_knowledge_resources",
    )
    op.drop_index(
        "ix_project_knowledge_resources_last_event_id",
        table_name="project_knowledge_resources",
    )
    op.drop_index(
        "ix_project_knowledge_resources_project_id",
        table_name="project_knowledge_resources",
    )
    op.drop_table("project_knowledge_resources")

    op.drop_index("ix_project_files_project_changed_at", table_name="project_files")
    op.drop_index("ix_project_files_last_event_id", table_name="project_files")
    op.drop_index("ix_project_files_project_id", table_name="project_files")
    op.drop_table("project_files")
