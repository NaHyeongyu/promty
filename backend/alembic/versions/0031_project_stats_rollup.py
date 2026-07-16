"""add incrementally maintained project activity statistics

Revision ID: 0031_project_stats_rollup
Revises: 0030_session_activity_queries
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0031_project_stats_rollup"
down_revision: str | None = "0030_session_activity_queries"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "project_stats",
        sa.Column(
            "project_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("session_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("event_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("prompt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("tracked_files", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("latest_event_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.execute(
        sa.text(
            """
            INSERT INTO project_stats (
                project_id,
                session_count,
                event_count,
                prompt_count,
                tracked_files,
                latest_event_at,
                updated_at
            )
            SELECT
                projects.id,
                COALESCE(session_stats.session_count, 0),
                COALESCE(event_stats.event_count, 0),
                COALESCE(event_stats.prompt_count, 0),
                COALESCE(file_stats.tracked_files, 0),
                event_stats.latest_event_at,
                now()
            FROM projects
            LEFT JOIN (
                SELECT project_id, COUNT(*) AS session_count
                FROM sessions
                GROUP BY project_id
            ) AS session_stats ON session_stats.project_id = projects.id
            LEFT JOIN (
                SELECT
                    project_id,
                    COUNT(*) AS event_count,
                    COUNT(*) FILTER (WHERE event_type = 'PromptSubmitted') AS prompt_count,
                    MAX(created_at) AS latest_event_at
                FROM events
                GROUP BY project_id
            ) AS event_stats ON event_stats.project_id = projects.id
            LEFT JOIN (
                SELECT project_id, COUNT(*) AS tracked_files
                FROM project_files
                WHERE status <> 'deleted'
                GROUP BY project_id
            ) AS file_stats ON file_stats.project_id = projects.id
            """
        )
    )


def downgrade() -> None:
    op.drop_table("project_stats")
