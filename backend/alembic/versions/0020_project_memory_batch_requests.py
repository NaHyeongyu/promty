"""add race-safe project memory batch request keys

Revision ID: 0020_memory_batch_requests
Revises: 0019_project_memory_guards
Create Date: 2026-07-12 00:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0020_memory_batch_requests"
down_revision: str | None = "0019_project_memory_guards"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UTC_NOW = sa.text("timezone('utc', now())")


def upgrade() -> None:
    op.create_table(
        "project_memory_batch_requests",
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("idempotency_key", sa.String(length=64), nullable=False),
        sa.Column("batch_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=UTC_NOW,
        ),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("project_id", "idempotency_key"),
    )
    op.create_index(
        "ix_project_memory_batch_requests_batch_id",
        "project_memory_batch_requests",
        ["batch_id"],
    )
    op.execute(
        sa.text(
            """
            WITH request_keys AS (
                SELECT
                    project_id,
                    id AS batch_id,
                    idempotency_key,
                    updated_at
                FROM project_memory_batches
                UNION ALL
                SELECT
                    batches.project_id,
                    batches.id AS batch_id,
                    aliases.idempotency_key,
                    batches.updated_at
                FROM project_memory_batches AS batches
                CROSS JOIN LATERAL jsonb_array_elements_text(
                    COALESCE(batches.idempotency_keys, '[]'::jsonb)
                ) AS aliases(idempotency_key)
            ),
            ranked AS (
                SELECT
                    project_id,
                    batch_id,
                    idempotency_key,
                    row_number() OVER (
                        PARTITION BY project_id, idempotency_key
                        ORDER BY updated_at DESC, batch_id DESC
                    ) AS request_rank
                FROM request_keys
                WHERE idempotency_key <> ''
            )
            INSERT INTO project_memory_batch_requests (
                project_id,
                idempotency_key,
                batch_id
            )
            SELECT project_id, idempotency_key, batch_id
            FROM ranked
            WHERE request_rank = 1
            """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            UPDATE project_memory_batches AS batches
            SET idempotency_keys = merged.keys
            FROM (
                SELECT
                    requests.batch_id,
                    jsonb_agg(DISTINCT request_keys.idempotency_key) AS keys
                FROM project_memory_batch_requests AS requests
                JOIN project_memory_batches AS target_batch
                  ON target_batch.id = requests.batch_id
                 AND target_batch.project_id = requests.project_id
                CROSS JOIN LATERAL (
                    SELECT jsonb_array_elements_text(
                        COALESCE(target_batch.idempotency_keys, '[]'::jsonb)
                    ) AS idempotency_key
                    UNION
                    SELECT requests.idempotency_key
                    UNION
                    SELECT target_batch.idempotency_key
                ) AS request_keys
                GROUP BY requests.batch_id
            ) AS merged
            WHERE batches.id = merged.batch_id
            """
        )
    )
    op.drop_index(
        "ix_project_memory_batch_requests_batch_id",
        table_name="project_memory_batch_requests",
    )
    op.drop_table("project_memory_batch_requests")
