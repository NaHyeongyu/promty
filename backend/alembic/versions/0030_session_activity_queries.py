"""store session activity for bounded worker queries

Revision ID: 0030_session_activity_queries
Revises: 0029_admin_user_lifecycle
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "0030_session_activity_queries"
down_revision: str | None = "0029_admin_user_lifecycle"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "sessions",
        sa.Column("last_activity_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.execute(
        sa.text(
            """
            UPDATE sessions AS target
            SET last_activity_at = activity.last_activity_at
            FROM (
                SELECT session_id, MAX(created_at) AS last_activity_at
                FROM events
                GROUP BY session_id
            ) AS activity
            WHERE target.id = activity.session_id
            """
        )
    )
    op.create_index(
        "ix_sessions_open_last_activity",
        "sessions",
        ["last_activity_at", "started_at", "id"],
        postgresql_where=sa.text(
            "ended_at IS NULL AND last_activity_at IS NOT NULL"
        ),
    )


def downgrade() -> None:
    op.drop_index("ix_sessions_open_last_activity", table_name="sessions")
    op.drop_column("sessions", "last_activity_at")
