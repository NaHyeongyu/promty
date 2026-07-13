"""add backend optimization indexes

Revision ID: 0022_backend_opt_indexes
Revises: 0021_collector_versions
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0022_backend_opt_indexes"
down_revision: str | None = "0021_collector_versions"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "ix_artifacts_pending_memory_project_session_created",
        "artifacts",
        ["project_id", "session_id", "created_at", "id"],
        postgresql_where=sa.text(
            "type = 'MemoryDraft' "
            "AND metadata ->> 'artifact_stage' = 'pending_draft' "
            "AND metadata ->> 'review_state' = 'draft'"
        ),
    )
    op.create_index(
        "ix_project_memory_batches_pending_created",
        "project_memory_batches",
        ["created_at", "id"],
        postgresql_where=sa.text("status = 'pending'"),
    )
    op.create_index(
        "ix_project_memory_batches_running_lease",
        "project_memory_batches",
        ["lease_expires_at", "id"],
        postgresql_where=sa.text("status = 'running'"),
    )


def downgrade() -> None:
    op.drop_index(
        "ix_project_memory_batches_running_lease",
        table_name="project_memory_batches",
    )
    op.drop_index(
        "ix_project_memory_batches_pending_created",
        table_name="project_memory_batches",
    )
    op.drop_index(
        "ix_artifacts_pending_memory_project_session_created",
        table_name="artifacts",
    )
