"""make Project Memory generation attempts terminal

Revision ID: 0028_at_most_once_memory
Revises: 0027_admin_audit_logs
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0028_at_most_once_memory"
down_revision: str | None = "0027_admin_audit_logs"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            UPDATE artifacts AS drafts
            SET
                metadata = COALESCE(drafts.metadata, '{}'::jsonb) || jsonb_build_object(
                    'review_state', 'generation_failed',
                    'sent_to_ai_at', COALESCE(
                        drafts.metadata ->> 'sent_to_ai_at',
                        batches.completed_at::text,
                        batches.updated_at::text
                    )
                ),
                updated_at = GREATEST(drafts.updated_at, batches.updated_at)
            FROM project_memory_batch_items AS items
            JOIN project_memory_batches AS batches ON batches.id = items.batch_id
            WHERE drafts.id = items.draft_id
              AND batches.status = 'failed'
              AND drafts.metadata ->> 'review_state' = 'draft'
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE project_memory_batches
            SET chunk_results = '{}'::jsonb
            WHERE status = 'failed'
            """
        )
    )


def downgrade() -> None:
    # Provider attempts cannot safely be made retryable again because an
    # external request may already have been billed.
    pass
