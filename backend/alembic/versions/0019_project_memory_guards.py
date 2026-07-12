"""add project memory idempotency and storage guards

Revision ID: 0019_project_memory_guards
Revises: 0018_project_memory_batches
Create Date: 2026-07-12 00:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0019_project_memory_guards"
down_revision: str | None = "0018_project_memory_batches"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

MEMORY_TYPES = "'MemoryTask', 'MemoryDraft', 'ProjectMemory'"


def upgrade() -> None:
    op.add_column(
        "project_memory_batches",
        sa.Column(
            "idempotency_keys",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    op.add_column(
        "project_memory_batches",
        sa.Column(
            "snapshot_manifest",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    op.execute(
        sa.text(
            """
            UPDATE project_memory_batches
            SET idempotency_keys = jsonb_build_array(idempotency_key)
            WHERE idempotency_keys = '[]'::jsonb
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE project_memory_batches AS batches
            SET snapshot_manifest = manifests.items
            FROM (
                SELECT
                    batch_id,
                    jsonb_agg(
                        jsonb_build_object(
                            'draft_id', draft_id,
                            'draft_version_id', draft_version_id,
                            'ordinal', ordinal,
                            'source_session_id', source_session_id
                        )
                        ORDER BY ordinal
                    ) AS items
                FROM project_memory_batch_items
                GROUP BY batch_id
            ) AS manifests
            WHERE batches.id = manifests.batch_id
            """
        )
    )
    op.drop_constraint(
        "ck_project_memory_batches_status",
        "project_memory_batches",
        type_="check",
    )
    op.create_check_constraint(
        "ck_project_memory_batches_status",
        "project_memory_batches",
        "status in ('pending', 'running', 'succeeded', 'failed', 'superseded')",
    )

    op.execute(
        sa.text(
            f"""
            WITH ranked AS (
                SELECT
                    id,
                    row_number() OVER (
                        PARTITION BY project_id, type, storage_key
                        ORDER BY updated_at DESC, created_at DESC, id DESC
                    ) AS duplicate_rank
                FROM artifacts
                WHERE type IN ({MEMORY_TYPES})
            )
            UPDATE project_memory_batches
            SET
                status = 'superseded',
                result_status = 'generation_failed',
                error_code = 'duplicate_snapshot_source',
                error_message = 'A duplicate snapshot source was removed during migration.'
            WHERE id IN (
                SELECT items.batch_id
                FROM project_memory_batch_items AS items
                JOIN ranked ON ranked.id = items.draft_id
                WHERE ranked.duplicate_rank > 1
            )
            """
        )
    )
    op.execute(
        sa.text(
            f"""
            WITH ranked AS (
                SELECT
                    id,
                    row_number() OVER (
                        PARTITION BY project_id, type, storage_key
                        ORDER BY updated_at DESC, created_at DESC, id DESC
                    ) AS duplicate_rank
                FROM artifacts
                WHERE type IN ({MEMORY_TYPES})
            )
            DELETE FROM project_memory_batch_items
            WHERE draft_id IN (
                SELECT id FROM ranked WHERE duplicate_rank > 1
            )
            """
        )
    )
    op.execute(
        sa.text(
            f"""
            WITH ranked AS (
                SELECT
                    id,
                    row_number() OVER (
                        PARTITION BY project_id, type, storage_key
                        ORDER BY updated_at DESC, created_at DESC, id DESC
                    ) AS duplicate_rank
                FROM artifacts
                WHERE type IN ({MEMORY_TYPES})
            )
            DELETE FROM artifacts
            WHERE id IN (
                SELECT id FROM ranked WHERE duplicate_rank > 1
            )
            """
        )
    )
    op.create_index(
        "ux_artifacts_memory_storage_key",
        "artifacts",
        ["project_id", "type", "storage_key"],
        unique=True,
        postgresql_where=sa.text(f"type IN ({MEMORY_TYPES})"),
    )


def downgrade() -> None:
    op.drop_index("ux_artifacts_memory_storage_key", table_name="artifacts")
    op.drop_constraint(
        "ck_project_memory_batches_status",
        "project_memory_batches",
        type_="check",
    )
    op.execute(
        sa.text("UPDATE project_memory_batches SET status = 'failed' WHERE status = 'superseded'")
    )
    op.create_check_constraint(
        "ck_project_memory_batches_status",
        "project_memory_batches",
        "status in ('pending', 'running', 'succeeded', 'failed')",
    )
    op.drop_column("project_memory_batches", "snapshot_manifest")
    op.drop_column("project_memory_batches", "idempotency_keys")
