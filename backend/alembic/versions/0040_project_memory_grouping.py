"""add per-project memory grouping mode

Revision ID: 0040_project_memory_grouping
Revises: 0039_memory_detail_full_text
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "0040_project_memory_grouping"
down_revision: str | None = "0039_memory_detail_full_text"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "projects",
        sa.Column(
            "memory_grouping_mode",
            sa.String(length=16),
            nullable=False,
            server_default="session",
        ),
    )
    op.create_check_constraint(
        "ck_projects_memory_grouping_mode",
        "projects",
        "memory_grouping_mode in ('session', 'chronological')",
    )
    op.add_column(
        "project_memory_batches",
        sa.Column(
            "grouping_mode",
            sa.String(length=16),
            nullable=False,
            server_default="session",
        ),
    )
    op.create_check_constraint(
        "ck_project_memory_batches_grouping_mode",
        "project_memory_batches",
        "grouping_mode in ('session', 'chronological')",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_project_memory_batches_grouping_mode",
        "project_memory_batches",
        type_="check",
    )
    op.drop_column("project_memory_batches", "grouping_mode")
    op.drop_constraint(
        "ck_projects_memory_grouping_mode",
        "projects",
        type_="check",
    )
    op.drop_column("projects", "memory_grouping_mode")
