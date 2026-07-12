"""add immutable project memory batches

Revision ID: 0018_project_memory_batches
Revises: 0017_prompt_search_documents
Create Date: 2026-07-12 00:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0018_project_memory_batches"
down_revision: str | None = "0017_prompt_search_documents"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UTC_NOW = sa.text("timezone('utc', now())")


def upgrade() -> None:
    op.create_table(
        "project_memory_batches",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("requested_by_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "project_memory_artifact_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
        sa.Column("idempotency_key", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="pending"),
        sa.Column("result_status", sa.String(length=32), nullable=True),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "generated_artifact_ids",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "source_session_ids",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("error_code", sa.String(length=64), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column(
            "snapshot_at", sa.DateTime(timezone=True), nullable=False, server_default=UTC_NOW
        ),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("lease_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=UTC_NOW),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=UTC_NOW),
        sa.CheckConstraint(
            "status in ('pending', 'running', 'succeeded', 'failed')",
            name="ck_project_memory_batches_status",
        ),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["requested_by_user_id"],
            ["users.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["project_memory_artifact_id"],
            ["artifacts.id"],
            ondelete="SET NULL",
        ),
        sa.UniqueConstraint(
            "project_id",
            "idempotency_key",
            name="uq_project_memory_batches_project_idempotency_key",
        ),
    )
    op.create_index(
        "ix_project_memory_batches_project_id",
        "project_memory_batches",
        ["project_id"],
    )
    op.create_index(
        "ix_project_memory_batches_requested_by_user_id",
        "project_memory_batches",
        ["requested_by_user_id"],
    )
    op.create_index(
        "ix_project_memory_batches_project_memory_artifact_id",
        "project_memory_batches",
        ["project_memory_artifact_id"],
    )
    op.create_index(
        "ix_project_memory_batches_project_status_updated",
        "project_memory_batches",
        ["project_id", "status", "updated_at"],
    )

    op.create_table(
        "project_memory_batch_items",
        sa.Column("batch_id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("draft_id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("draft_version_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("source_session_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("ordinal", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["batch_id"],
            ["project_memory_batches.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(["draft_id"], ["artifacts.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["draft_version_id"],
            ["artifact_versions.id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["source_session_id"],
            ["sessions.id"],
            ondelete="SET NULL",
        ),
        sa.UniqueConstraint(
            "draft_id",
            name="uq_project_memory_batch_items_draft_id",
        ),
        sa.UniqueConstraint(
            "batch_id",
            "ordinal",
            name="uq_project_memory_batch_items_batch_ordinal",
        ),
    )
    op.create_index(
        "ix_project_memory_batch_items_draft_version_id",
        "project_memory_batch_items",
        ["draft_version_id"],
    )
    op.create_index(
        "ix_project_memory_batch_items_source_session_id",
        "project_memory_batch_items",
        ["source_session_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_project_memory_batch_items_source_session_id",
        table_name="project_memory_batch_items",
    )
    op.drop_index(
        "ix_project_memory_batch_items_draft_version_id",
        table_name="project_memory_batch_items",
    )
    op.drop_table("project_memory_batch_items")
    op.drop_index(
        "ix_project_memory_batches_project_status_updated",
        table_name="project_memory_batches",
    )
    op.drop_index(
        "ix_project_memory_batches_project_memory_artifact_id",
        table_name="project_memory_batches",
    )
    op.drop_index(
        "ix_project_memory_batches_requested_by_user_id",
        table_name="project_memory_batches",
    )
    op.drop_index(
        "ix_project_memory_batches_project_id",
        table_name="project_memory_batches",
    )
    op.drop_table("project_memory_batches")
