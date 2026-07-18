"""recover retryable project memory drafts

Revision ID: 0038_recover_failed_drafts
Revises: 0037_weekly_project_popularity
"""

from collections.abc import Sequence

from alembic import op


revision: str = "0038_recover_failed_drafts"
down_revision: str | None = "0037_weekly_project_popularity"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE artifacts AS drafts
        SET metadata = jsonb_set(
                jsonb_set(drafts.metadata, '{review_state}', '"draft"'::jsonb, true),
                '{sent_to_ai_at}',
                'null'::jsonb,
                true
            ),
            updated_at = NOW()
        FROM project_memory_batch_items AS items
        JOIN project_memory_batches AS batches ON batches.id = items.batch_id
        WHERE drafts.id = items.draft_id
          AND batches.status = 'failed'
          AND drafts.metadata->>'review_state' = 'generation_failed'
        """
    )
    op.execute(
        """
        DELETE FROM project_memory_batch_items AS items
        USING project_memory_batches AS batches
        WHERE batches.id = items.batch_id
          AND batches.status = 'failed'
        """
    )


def downgrade() -> None:
    # Recovered user work must not be hidden again during a rollback.
    pass
