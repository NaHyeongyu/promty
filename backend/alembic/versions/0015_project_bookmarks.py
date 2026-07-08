"""add project bookmarks

Revision ID: 0015_project_bookmarks
Revises: 0014_project_tags
Create Date: 2026-07-08 00:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0015_project_bookmarks"
down_revision: str | None = "0014_project_tags"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "projects",
        sa.Column(
            "is_bookmarked",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.alter_column("projects", "is_bookmarked", server_default=None)


def downgrade() -> None:
    op.drop_column("projects", "is_bookmarked")
