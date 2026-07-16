"""add administrator-managed user lifecycle state

Revision ID: 0029_admin_user_lifecycle
Revises: 0028_at_most_once_memory
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0029_admin_user_lifecycle"
down_revision: str | None = "0028_at_most_once_memory"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("suspended_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("suspension_reason", sa.String(length=500), nullable=True),
    )
    op.create_index("ix_users_suspended_at", "users", ["suspended_at"])


def downgrade() -> None:
    op.drop_index("ix_users_suspended_at", table_name="users")
    op.drop_column("users", "suspension_reason")
    op.drop_column("users", "suspended_at")
