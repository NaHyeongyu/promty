"""add query performance indexes

Revision ID: 0016_query_performance_indexes
Revises: 0015_project_bookmarks
Create Date: 2026-07-09 00:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0016_query_performance_indexes"
down_revision: str | None = "0015_project_bookmarks"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "ix_events_project_event_type_created_at_sequence",
        "events",
        ["project_id", "event_type", "created_at", "sequence"],
    )
    op.create_index(
        "ix_sessions_project_started_at",
        "sessions",
        ["project_id", "started_at"],
    )
    op.create_index(
        "ix_projects_owner_git_remote",
        "projects",
        ["owner_id", "git_remote"],
    )
    op.create_index(
        "ix_code_change_patches_project_prompt_created_path",
        "code_change_patches",
        ["project_id", "prompt_event_id", "created_at", "path"],
    )
    op.create_index(
        "ix_project_files_active_project_path",
        "project_files",
        ["project_id", "path"],
        postgresql_where=sa.text("status <> 'deleted'"),
    )
    op.create_index(
        "ix_project_files_active_project_changed_at",
        "project_files",
        ["project_id", "changed_at"],
        postgresql_where=sa.text("status <> 'deleted'"),
    )
    op.create_index(
        "ix_artifacts_project_type_updated_created",
        "artifacts",
        ["project_id", "type", "updated_at", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_artifacts_project_type_updated_created", table_name="artifacts")
    op.drop_index("ix_project_files_active_project_changed_at", table_name="project_files")
    op.drop_index("ix_project_files_active_project_path", table_name="project_files")
    op.drop_index(
        "ix_code_change_patches_project_prompt_created_path",
        table_name="code_change_patches",
    )
    op.drop_index("ix_projects_owner_git_remote", table_name="projects")
    op.drop_index("ix_sessions_project_started_at", table_name="sessions")
    op.drop_index(
        "ix_events_project_event_type_created_at_sequence",
        table_name="events",
    )
