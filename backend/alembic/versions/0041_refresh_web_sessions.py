"""add rotating refresh credentials to web sessions

Revision ID: 0041_refresh_web_sessions
Revises: 0040_project_memory_grouping
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "0041_refresh_web_sessions"
down_revision: str | None = "0040_project_memory_grouping"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "web_sessions",
        sa.Column("idle_expires_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "web_sessions",
        sa.Column("refresh_token_hash", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "web_sessions",
        sa.Column("previous_refresh_token_hash", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "web_sessions",
        sa.Column(
            "previous_refresh_token_expires_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("web_sessions", "previous_refresh_token_expires_at")
    op.drop_column("web_sessions", "previous_refresh_token_hash")
    op.drop_column("web_sessions", "refresh_token_hash")
    op.drop_column("web_sessions", "idle_expires_at")
