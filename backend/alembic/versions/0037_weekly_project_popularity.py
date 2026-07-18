"""index weekly project popularity inputs

Revision ID: 0037_weekly_project_popularity
Revises: 0037_merge_admin_web_heads
"""

from collections.abc import Sequence

from alembic import op


revision: str = "0037_weekly_project_popularity"
down_revision: str | None = "0037_merge_admin_web_heads"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "ix_public_project_saves_project_created_at",
        "public_project_saves",
        ["project_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_public_project_saves_project_created_at",
        table_name="public_project_saves",
    )
