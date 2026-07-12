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
ARCHIVED_MEMORY_TYPE = "MemoryArchive"


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
            CREATE TEMPORARY TABLE project_memory_artifact_duplicate_map (
                duplicate_id uuid PRIMARY KEY,
                survivor_id uuid NOT NULL
            ) ON COMMIT DROP;

            INSERT INTO project_memory_artifact_duplicate_map (duplicate_id, survivor_id)
            SELECT id, survivor_id
            FROM (
                SELECT
                    id,
                    first_value(id) OVER duplicate_group AS survivor_id,
                    row_number() OVER duplicate_group AS duplicate_rank
                FROM artifacts
                WHERE type IN ({MEMORY_TYPES})
                WINDOW duplicate_group AS (
                    PARTITION BY project_id, type, storage_key
                    ORDER BY updated_at DESC, created_at DESC, id DESC
                )
            ) AS ranked
            WHERE duplicate_rank > 1;

            CREATE TEMPORARY TABLE project_memory_affected_batches (
                batch_id uuid PRIMARY KEY
            ) ON COMMIT DROP;

            INSERT INTO project_memory_affected_batches (batch_id)
            SELECT DISTINCT items.batch_id
            FROM project_memory_batch_items AS items
            JOIN project_memory_batches AS batches ON batches.id = items.batch_id
            LEFT JOIN artifact_versions AS versions ON versions.id = items.draft_version_id
            LEFT JOIN project_memory_artifact_duplicate_map AS draft_duplicates
                ON draft_duplicates.duplicate_id = items.draft_id
            LEFT JOIN project_memory_artifact_duplicate_map AS version_duplicates
                ON version_duplicates.duplicate_id = versions.artifact_id
            WHERE batches.status IN ('pending', 'running', 'failed')
              AND (
                  draft_duplicates.duplicate_id IS NOT NULL
                  OR version_duplicates.duplicate_id IS NOT NULL
              );
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE project_memory_batches AS batches
            SET
                status = 'superseded',
                result_status = 'generation_failed',
                error_code = 'duplicate_snapshot_source',
                error_message = 'A duplicate snapshot source was archived during migration.',
                lease_expires_at = NULL,
                completed_at = COALESCE(batches.completed_at, timezone('utc', now())),
                updated_at = timezone('utc', now())
            FROM project_memory_affected_batches AS affected
            WHERE batches.id = affected.batch_id
            """
        )
    )
    op.execute(
        sa.text(
            """
            DELETE FROM project_memory_batch_items AS items
            USING project_memory_affected_batches AS affected
            WHERE items.batch_id = affected.batch_id
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE project_memory_batches AS batches
            SET project_memory_artifact_id = duplicates.survivor_id
            FROM project_memory_artifact_duplicate_map AS duplicates
            WHERE batches.project_memory_artifact_id = duplicates.duplicate_id
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE project_memory_batches AS batches
            SET generated_artifact_ids = (
                SELECT COALESCE(
                    jsonb_agg(to_jsonb(mapped.artifact_id) ORDER BY mapped.first_ordinal),
                    '[]'::jsonb
                )
                FROM (
                    SELECT
                        COALESCE(duplicates.survivor_id::text, entries.artifact_id) AS artifact_id,
                        min(entries.ordinality) AS first_ordinal
                    FROM jsonb_array_elements_text(batches.generated_artifact_ids)
                        WITH ORDINALITY AS entries(artifact_id, ordinality)
                    LEFT JOIN project_memory_artifact_duplicate_map AS duplicates
                        ON duplicates.duplicate_id::text = entries.artifact_id
                    GROUP BY COALESCE(duplicates.survivor_id::text, entries.artifact_id)
                ) AS mapped
            )
            WHERE jsonb_typeof(batches.generated_artifact_ids) = 'array'
              AND EXISTS (
                  SELECT 1
                  FROM jsonb_array_elements_text(batches.generated_artifact_ids) AS entries(artifact_id)
                  JOIN project_memory_artifact_duplicate_map AS duplicates
                    ON duplicates.duplicate_id::text = entries.artifact_id
              )
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE artifact_generation_jobs AS jobs
            SET artifact_id = duplicates.survivor_id
            FROM project_memory_artifact_duplicate_map AS duplicates
            WHERE jobs.artifact_id = duplicates.duplicate_id
            """
        )
    )
    op.execute(
        sa.text(
            f"""
            UPDATE artifacts AS artifacts_to_archive
            SET
                type = '{ARCHIVED_MEMORY_TYPE}',
                metadata = artifacts_to_archive.metadata || jsonb_build_object(
                    'deduplicated_into', duplicates.survivor_id,
                    'deduplicated_original_type', artifacts_to_archive.type
                )
            FROM project_memory_artifact_duplicate_map AS duplicates
            WHERE artifacts_to_archive.id = duplicates.duplicate_id
            """
        )
    )
    # Keep dedupe and uniqueness in one transaction. Large installations should drain
    # artifact writers while this one-time index is built to avoid ingestion latency.
    op.create_index(
        "ux_artifacts_memory_storage_key",
        "artifacts",
        ["project_id", "type", "storage_key"],
        unique=True,
        postgresql_where=sa.text(f"type IN ({MEMORY_TYPES})"),
    )


def downgrade() -> None:
    op.drop_index("ux_artifacts_memory_storage_key", table_name="artifacts")
    op.execute(
        sa.text(
            f"""
            UPDATE artifacts
            SET
                type = metadata ->> 'deduplicated_original_type',
                metadata = metadata - 'deduplicated_into' - 'deduplicated_original_type'
            WHERE type = '{ARCHIVED_MEMORY_TYPE}'
              AND metadata ? 'deduplicated_original_type'
            """
        )
    )
    op.execute(
        sa.text(
            """
            CREATE TEMPORARY TABLE project_memory_downgrade_restorable_batches (
                batch_id uuid PRIMARY KEY
            ) ON COMMIT DROP;

            INSERT INTO project_memory_downgrade_restorable_batches (batch_id)
            SELECT batches.id
            FROM project_memory_batches AS batches
            WHERE batches.status = 'superseded'
              AND batches.error_code = 'duplicate_snapshot_source'
              AND jsonb_typeof(batches.snapshot_manifest) = 'array'
              AND jsonb_array_length(batches.snapshot_manifest) > 0
              AND jsonb_array_length(batches.snapshot_manifest) = (
                  SELECT count(DISTINCT (manifest.item ->> 'draft_id'))
                  FROM jsonb_array_elements(batches.snapshot_manifest) AS manifest(item)
              )
              AND jsonb_array_length(batches.snapshot_manifest) = (
                  SELECT count(DISTINCT (manifest.item ->> 'ordinal'))
                  FROM jsonb_array_elements(batches.snapshot_manifest) AS manifest(item)
              )
              AND NOT EXISTS (
                  SELECT 1
                  FROM jsonb_array_elements(batches.snapshot_manifest) AS manifest(item)
                  LEFT JOIN artifacts AS drafts
                    ON drafts.id = (manifest.item ->> 'draft_id')::uuid
                  LEFT JOIN artifact_versions AS versions
                    ON versions.id = (manifest.item ->> 'draft_version_id')::uuid
                   AND versions.artifact_id = drafts.id
                  LEFT JOIN project_memory_batch_items AS claimed_drafts
                    ON claimed_drafts.draft_id = drafts.id
                  LEFT JOIN project_memory_batch_items AS claimed_ordinals
                    ON claimed_ordinals.batch_id = batches.id
                   AND claimed_ordinals.ordinal = (manifest.item ->> 'ordinal')::integer
                  WHERE drafts.id IS NULL
                     OR versions.id IS NULL
                     OR claimed_drafts.draft_id IS NOT NULL
                     OR claimed_ordinals.batch_id IS NOT NULL
              )
            """
        )
    )
    op.execute(
        sa.text(
            """
            INSERT INTO project_memory_batch_items (
                batch_id,
                draft_id,
                draft_version_id,
                source_session_id,
                ordinal
            )
            SELECT
                batches.id,
                (manifest.item ->> 'draft_id')::uuid,
                (manifest.item ->> 'draft_version_id')::uuid,
                CASE
                    WHEN manifest.item ->> 'source_session_id' IS NULL THEN NULL
                    WHEN EXISTS (
                        SELECT 1
                        FROM sessions
                        WHERE sessions.id = (manifest.item ->> 'source_session_id')::uuid
                    ) THEN (manifest.item ->> 'source_session_id')::uuid
                    ELSE NULL
                END,
                (manifest.item ->> 'ordinal')::integer
            FROM project_memory_batches AS batches
            JOIN project_memory_downgrade_restorable_batches AS restorable
              ON restorable.batch_id = batches.id
            CROSS JOIN LATERAL jsonb_array_elements(batches.snapshot_manifest)
                AS manifest(item)
            JOIN artifacts AS drafts
              ON drafts.id = (manifest.item ->> 'draft_id')::uuid
            JOIN artifact_versions AS versions
              ON versions.id = (manifest.item ->> 'draft_version_id')::uuid
             AND versions.artifact_id = drafts.id
            WHERE batches.status = 'superseded'
            """
        )
    )
    op.execute(
        sa.text(
            """
            DELETE FROM project_memory_batch_items AS items
            USING project_memory_batches AS batches
            WHERE items.batch_id = batches.id
              AND batches.status = 'superseded'
              AND NOT EXISTS (
                  SELECT 1
                  FROM project_memory_downgrade_restorable_batches AS restorable
                  WHERE restorable.batch_id = batches.id
              )
            """
        )
    )
    op.drop_constraint(
        "ck_project_memory_batches_status",
        "project_memory_batches",
        type_="check",
    )
    op.execute(
        sa.text(
            """
            UPDATE project_memory_batches AS batches
            SET status = 'failed'
            FROM project_memory_downgrade_restorable_batches AS restorable
            WHERE batches.id = restorable.batch_id
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE project_memory_batches
            SET
                status = 'succeeded',
                result_status = 'no_pending',
                error_code = 'downgrade_snapshot_unavailable',
                error_message = 'The exact superseded snapshot could not be restored during downgrade.'
            WHERE status = 'superseded'
            """
        )
    )
    op.create_check_constraint(
        "ck_project_memory_batches_status",
        "project_memory_batches",
        "status in ('pending', 'running', 'succeeded', 'failed')",
    )
    op.drop_column("project_memory_batches", "snapshot_manifest")
    op.drop_column("project_memory_batches", "idempotency_keys")
