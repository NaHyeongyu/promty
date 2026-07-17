"""add public project view tracking

Revision ID: 0034_public_project_views
Revises: 0033_support_inquiries
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0034_public_project_views"
down_revision: str | None = "0033_support_inquiries"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "public_project_views",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "project_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "viewer_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "source",
            sa.String(length=32),
            nullable=False,
            server_default="community",
        ),
        sa.Column(
            "viewed_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index(
        "ix_public_project_views_project_viewed_at",
        "public_project_views",
        ["project_id", "viewed_at"],
    )
    op.create_index(
        "ix_public_project_views_viewer_viewed_at",
        "public_project_views",
        ["viewer_id", "viewed_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_public_project_views_viewer_viewed_at",
        table_name="public_project_views",
    )
    op.drop_index(
        "ix_public_project_views_project_viewed_at",
        table_name="public_project_views",
    )
    op.drop_table("public_project_views")
