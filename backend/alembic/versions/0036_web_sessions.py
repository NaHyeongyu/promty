"""add revocable web sessions

Revision ID: 0036_web_sessions
Revises: 0035_marketing_content
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0036_web_sessions"
down_revision: str | None = "0035_marketing_content"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "web_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_web_sessions_expires_at", "web_sessions", ["expires_at"])
    op.create_index(
        "ix_web_sessions_user_revoked_at",
        "web_sessions",
        ["user_id", "revoked_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_web_sessions_user_revoked_at", table_name="web_sessions")
    op.drop_index("ix_web_sessions_expires_at", table_name="web_sessions")
    op.drop_table("web_sessions")
