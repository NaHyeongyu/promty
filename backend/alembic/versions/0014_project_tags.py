"""add project tags

Revision ID: 0014_project_tags
Revises: 0013_artifact_versions
Create Date: 2026-07-05 00:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0014_project_tags"
down_revision: str | None = "0013_artifact_versions"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "projects",
        sa.Column(
            "tags",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    op.alter_column("projects", "tags", server_default=None)


def downgrade() -> None:
    op.drop_column("projects", "tags")
