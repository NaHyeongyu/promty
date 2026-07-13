"""add memory read path indexes

Revision ID: 0023_memory_read_indexes
Revises: 0022_backend_opt_indexes
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0023_memory_read_indexes"
down_revision: str | None = "0022_backend_opt_indexes"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "ix_artifacts_memory_slice_session_end",
        "artifacts",
        [
            "session_id",
            sa.text("((metadata ->> 'end_sequence')::integer)"),
        ],
        postgresql_where=sa.text(
            "type = 'MemoryDraft' "
            "AND metadata ->> 'artifact_stage' = 'pending_draft' "
            "AND metadata ->> 'memory_strategy' = 'prompt_window_v1'"
        ),
    )
    op.create_index(
        "ix_artifacts_generated_memory_project_updated",
        "artifacts",
        ["project_id", "updated_at", "created_at", "id"],
        postgresql_where=sa.text(
            "type = 'MemoryTask' "
            "AND metadata ->> 'artifact_stage' IN "
            "('generated_memory', 'verified_memory') "
            "AND metadata ->> 'review_state' IN ('generated', 'verified')"
        ),
    )


def downgrade() -> None:
    op.drop_index(
        "ix_artifacts_generated_memory_project_updated",
        table_name="artifacts",
    )
    op.drop_index(
        "ix_artifacts_memory_slice_session_end",
        table_name="artifacts",
    )
