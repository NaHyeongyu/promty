"""Track the last collector version used by each token.

Revision ID: 0021_collector_versions
Revises: 0020_memory_batch_requests
"""

from alembic import op
import sqlalchemy as sa


revision = "0021_collector_versions"
down_revision = "0020_memory_batch_requests"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "collector_tokens",
        sa.Column("collector_version", sa.String(length=64), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("collector_tokens", "collector_version")
