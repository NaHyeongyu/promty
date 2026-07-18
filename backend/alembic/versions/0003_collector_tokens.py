"""add collector tokens

Revision ID: 0003_collector_tokens
Revises: 0002_event_security_indexes
Create Date: 2026-06-27 00:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0003_collector_tokens"
down_revision: str | None = "0002_event_security_indexes"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UTC_NOW = sa.text("timezone('utc', now())")


def upgrade() -> None:
    op.create_table(
        "collector_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("token_hash", sa.String(length=128), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False, server_default="Promty CLI"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=UTC_NOW, nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_collector_tokens_user_id", "collector_tokens", ["user_id"])
    op.create_index("ix_collector_tokens_token_hash", "collector_tokens", ["token_hash"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_collector_tokens_token_hash", table_name="collector_tokens")
    op.drop_index("ix_collector_tokens_user_id", table_name="collector_tokens")
    op.drop_table("collector_tokens")
