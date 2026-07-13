"""add durable Project Memory chunk progress

Revision ID: 0024_memory_chunk_progress
Revises: 0023_memory_read_indexes
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0024_memory_chunk_progress"
down_revision: str | None = "0023_memory_read_indexes"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "project_memory_batches",
        sa.Column(
            "chunk_results",
            JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("project_memory_batches", "chunk_results")
