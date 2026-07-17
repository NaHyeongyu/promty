"""add user-specific public project saves

Revision ID: 0032_public_project_saves
Revises: 0031_project_stats_rollup
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0032_public_project_saves"
down_revision: str | None = "0031_project_stats_rollup"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "public_project_saves",
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "project_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index(
        "ix_public_project_saves_project_id",
        "public_project_saves",
        ["project_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_public_project_saves_project_id",
        table_name="public_project_saves",
    )
    op.drop_table("public_project_saves")
