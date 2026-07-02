"""add published flow image assets

Revision ID: 0010_published_flow_assets
Revises: 0009_remove_knowledge_resources
Create Date: 2026-07-02 00:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0010_published_flow_assets"
down_revision: str | None = "0009_remove_knowledge_resources"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UTC_NOW = sa.text("timezone('utc', now())")


def upgrade() -> None:
    op.create_table(
        "published_flow_assets",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("published_flow_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("author_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("file_name", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=64), nullable=False),
        sa.Column("byte_size", sa.Integer(), nullable=False),
        sa.Column("storage_key", sa.String(length=1024), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("alt_text", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=UTC_NOW),
        sa.CheckConstraint("byte_size > 0", name="ck_published_flow_assets_byte_size"),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["published_flow_id"], ["published_flows.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("storage_key", name="uq_published_flow_assets_storage_key"),
    )
    op.create_index(
        "ix_published_flow_assets_author_id",
        "published_flow_assets",
        ["author_id"],
    )
    op.create_index(
        "ix_published_flow_assets_published_flow_id",
        "published_flow_assets",
        ["published_flow_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_published_flow_assets_published_flow_id", table_name="published_flow_assets")
    op.drop_index("ix_published_flow_assets_author_id", table_name="published_flow_assets")
    op.drop_table("published_flow_assets")
