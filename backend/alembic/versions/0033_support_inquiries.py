"""add support inquiries

Revision ID: 0033_support_inquiries
Revises: 0032_public_project_saves
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0033_support_inquiries"
down_revision: str | None = "0032_public_project_saves"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "support_inquiries",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("requester_username", sa.String(length=255), nullable=False),
        sa.Column("requester_email", sa.String(length=320), nullable=False),
        sa.Column("category", sa.String(length=32), nullable=False),
        sa.Column("subject", sa.Text(), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="new"),
        sa.Column(
            "notification_status",
            sa.String(length=32),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("notification_message_id", sa.String(length=255), nullable=True),
        sa.Column("notification_error", sa.String(length=500), nullable=True),
        sa.Column("notified_at", sa.DateTime(timezone=True), nullable=True),
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
            "category in ('question', 'bug', 'feature', 'privacy', 'other')",
            name="ck_support_inquiries_category",
        ),
        sa.CheckConstraint(
            "status in ('new', 'in_progress', 'resolved')",
            name="ck_support_inquiries_status",
        ),
        sa.CheckConstraint(
            "notification_status in ('pending', 'sent', 'failed', 'disabled')",
            name="ck_support_inquiries_notification_status",
        ),
    )
    op.create_index(
        "ix_support_inquiries_status_created_at",
        "support_inquiries",
        ["status", "created_at"],
    )
    op.create_index(
        "ix_support_inquiries_user_created_at",
        "support_inquiries",
        ["user_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_support_inquiries_user_created_at", table_name="support_inquiries")
    op.drop_index("ix_support_inquiries_status_created_at", table_name="support_inquiries")
    op.drop_table("support_inquiries")
