"""add code change patches

Revision ID: 0006_code_change_patches
Revises: 0005_github_connections
Create Date: 2026-06-28 00:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0006_code_change_patches"
down_revision: str | None = "0005_github_connections"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UTC_NOW = sa.text("timezone('utc', now())")


def upgrade() -> None:
    op.create_table(
        "code_change_patches",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("prompt_event_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("path", sa.String(length=2048), nullable=False),
        sa.Column("old_path", sa.String(length=2048), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("additions", sa.Integer(), nullable=True),
        sa.Column("deletions", sa.Integer(), nullable=True),
        sa.Column("patch", sa.Text(), nullable=True),
        sa.Column("patch_truncated", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("binary", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=UTC_NOW, nullable=False),
        sa.ForeignKeyConstraint(["event_id"], ["events.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["session_id"], ["sessions.id"], ondelete="CASCADE"),
    )
    op.create_index(
        "ix_code_change_patches_project_prompt",
        "code_change_patches",
        ["project_id", "prompt_event_id"],
    )
    op.create_index(
        "ix_code_change_patches_project_created_at",
        "code_change_patches",
        ["project_id", "created_at"],
    )
    op.create_index("ix_code_change_patches_event_id", "code_change_patches", ["event_id"])
    op.create_index("ix_code_change_patches_session_id", "code_change_patches", ["session_id"])


def downgrade() -> None:
    op.drop_index("ix_code_change_patches_session_id", table_name="code_change_patches")
    op.drop_index("ix_code_change_patches_event_id", table_name="code_change_patches")
    op.drop_index("ix_code_change_patches_project_created_at", table_name="code_change_patches")
    op.drop_index("ix_code_change_patches_project_prompt", table_name="code_change_patches")
    op.drop_table("code_change_patches")
