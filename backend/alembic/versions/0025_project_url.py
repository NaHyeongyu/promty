"""add optional external project URL

Revision ID: 0025_project_url
Revises: 0024_memory_chunk_progress
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0025_project_url"
down_revision: str | None = "0024_memory_chunk_progress"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "projects",
        sa.Column("project_url", sa.String(length=2048), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("projects", "project_url")
