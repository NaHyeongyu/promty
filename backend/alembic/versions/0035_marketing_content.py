"""add bilingual marketing content studio

Revision ID: 0035_marketing_content
Revises: 0034_public_project_views
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0035_marketing_content"
down_revision: str | None = "0034_public_project_views"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "marketing_content",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "creator_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("campaign_name", sa.String(length=255), nullable=False),
        sa.Column("source_type", sa.String(length=32), nullable=False, server_default="manual"),
        sa.Column("source_title", sa.String(length=500), nullable=False),
        sa.Column("source_summary", sa.Text(), nullable=False),
        sa.Column("source_url", sa.String(length=2048), nullable=True),
        sa.Column("cta_url", sa.String(length=2048), nullable=True),
        sa.Column("tone", sa.String(length=32), nullable=False, server_default="practical"),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="draft"),
        sa.Column(
            "channels",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "content",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "delivery_results",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("generated_by", sa.String(length=255), nullable=True),
        sa.Column("last_error", sa.String(length=1000), nullable=True),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint(
            "source_type in ('manual', 'release', 'public_project', 'faq', 'support')",
            name="ck_marketing_content_source_type",
        ),
        sa.CheckConstraint(
            "status in ('draft', 'review', 'approved', 'scheduled', 'published', 'failed')",
            name="ck_marketing_content_status",
        ),
    )
    op.create_index(
        "ix_marketing_content_creator_id",
        "marketing_content",
        ["creator_id"],
    )
    op.create_index(
        "ix_marketing_content_status_updated_at",
        "marketing_content",
        ["status", "updated_at"],
    )
    op.create_index(
        "ix_marketing_content_created_at",
        "marketing_content",
        ["created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_marketing_content_created_at", table_name="marketing_content")
    op.drop_index("ix_marketing_content_status_updated_at", table_name="marketing_content")
    op.drop_index("ix_marketing_content_creator_id", table_name="marketing_content")
    op.drop_table("marketing_content")
