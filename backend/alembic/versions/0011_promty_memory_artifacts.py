"""extend artifacts for promty memory generation

Revision ID: 0011_promty_memory_artifacts
Revises: 0010_published_flow_assets
Create Date: 2026-07-03 00:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0011_promty_memory_artifacts"
down_revision: str | None = "0010_published_flow_assets"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UTC_NOW = sa.text("timezone('utc', now())")


def upgrade() -> None:
    op.add_column(
        "artifacts",
        sa.Column("schema_version", sa.Integer(), nullable=False, server_default="1"),
    )
    op.add_column("artifacts", sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("artifacts", sa.Column("summary", sa.Text(), nullable=True))
    op.add_column("artifacts", sa.Column("reason", sa.Text(), nullable=True))
    op.add_column("artifacts", sa.Column("outcome", sa.Text(), nullable=True))
    op.add_column(
        "artifacts",
        sa.Column(
            "tags",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    op.add_column(
        "artifacts",
        sa.Column(
            "changed_files",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    op.add_column(
        "artifacts",
        sa.Column(
            "prompt_event_ids",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    op.add_column("artifacts", sa.Column("commit_sha", sa.String(length=64), nullable=True))
    op.add_column("artifacts", sa.Column("model", sa.String(length=255), nullable=True))
    op.add_column("artifacts", sa.Column("generator", sa.String(length=64), nullable=True))
    op.add_column(
        "artifacts",
        sa.Column(
            "metadata",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )
    op.add_column(
        "artifacts",
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=UTC_NOW),
    )
    op.create_foreign_key(
        "fk_artifacts_session_id_sessions",
        "artifacts",
        "sessions",
        ["session_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_artifacts_session_id", "artifacts", ["session_id"])
    op.create_index("ix_artifacts_project_type_created_at", "artifacts", ["project_id", "type", "created_at"])

    op.create_table(
        "artifact_generation_jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("artifact_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="pending"),
        sa.Column("reason", sa.String(length=64), nullable=False, server_default="manual"),
        sa.Column("generator", sa.String(length=64), nullable=False, server_default="local-session-v1"),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column(
            "metadata",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=UTC_NOW),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=UTC_NOW),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status in ('pending', 'running', 'succeeded', 'failed')",
            name="ck_artifact_generation_jobs_status",
        ),
        sa.ForeignKeyConstraint(["artifact_id"], ["artifacts.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["session_id"], ["sessions.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_artifact_generation_jobs_project_id", "artifact_generation_jobs", ["project_id"])
    op.create_index("ix_artifact_generation_jobs_session_id", "artifact_generation_jobs", ["session_id"])
    op.create_index("ix_artifact_generation_jobs_artifact_id", "artifact_generation_jobs", ["artifact_id"])
    op.create_index(
        "ix_artifact_generation_jobs_status_created_at",
        "artifact_generation_jobs",
        ["status", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_artifact_generation_jobs_status_created_at", table_name="artifact_generation_jobs")
    op.drop_index("ix_artifact_generation_jobs_artifact_id", table_name="artifact_generation_jobs")
    op.drop_index("ix_artifact_generation_jobs_session_id", table_name="artifact_generation_jobs")
    op.drop_index("ix_artifact_generation_jobs_project_id", table_name="artifact_generation_jobs")
    op.drop_table("artifact_generation_jobs")

    op.drop_index("ix_artifacts_project_type_created_at", table_name="artifacts")
    op.drop_index("ix_artifacts_session_id", table_name="artifacts")
    op.drop_constraint("fk_artifacts_session_id_sessions", "artifacts", type_="foreignkey")
    op.drop_column("artifacts", "updated_at")
    op.drop_column("artifacts", "metadata")
    op.drop_column("artifacts", "generator")
    op.drop_column("artifacts", "model")
    op.drop_column("artifacts", "commit_sha")
    op.drop_column("artifacts", "prompt_event_ids")
    op.drop_column("artifacts", "changed_files")
    op.drop_column("artifacts", "tags")
    op.drop_column("artifacts", "outcome")
    op.drop_column("artifacts", "reason")
    op.drop_column("artifacts", "summary")
    op.drop_column("artifacts", "session_id")
    op.drop_column("artifacts", "schema_version")
