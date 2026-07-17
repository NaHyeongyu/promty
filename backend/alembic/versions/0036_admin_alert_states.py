"""add per-administrator alert workflow state

Revision ID: 0036_admin_alert_states
Revises: 0035_marketing_content
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0036_admin_alert_states"
down_revision: str | None = "0035_marketing_content"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "admin_alert_states",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "admin_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("alert_key", sa.String(length=96), nullable=False),
        sa.Column("condition_hash", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("snoozed_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint(
            "status in ('read', 'snoozed', 'resolved')",
            name="ck_admin_alert_states_status",
        ),
        sa.UniqueConstraint(
            "admin_user_id",
            "alert_key",
            name="uq_admin_alert_states_admin_alert",
        ),
    )
    op.create_index(
        "ix_admin_alert_states_admin_updated",
        "admin_alert_states",
        ["admin_user_id", "updated_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_admin_alert_states_admin_updated", table_name="admin_alert_states")
    op.drop_table("admin_alert_states")
