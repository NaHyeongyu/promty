"""add artifact versions

Revision ID: 0013_artifact_versions
Revises: 0012_structured_memory_artifacts
Create Date: 2026-07-04 00:00:00.000000
"""

from collections.abc import Sequence
from uuid import uuid4

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0013_artifact_versions"
down_revision: str | None = "0012_structured_memory_artifacts"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UTC_NOW = sa.text("timezone('utc', now())")


def upgrade() -> None:
    op.create_table(
        "artifact_versions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("artifact_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("outcome", sa.Text(), nullable=True),
        sa.Column(
            "technologies",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "sections",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "tags",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "changed_files",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "prompt_event_ids",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("commit_sha", sa.String(length=64), nullable=True),
        sa.Column("generator", sa.String(length=64), nullable=True),
        sa.Column("model", sa.String(length=255), nullable=True),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=UTC_NOW),
        sa.ForeignKeyConstraint(["artifact_id"], ["artifacts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["session_id"], ["sessions.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("artifact_id", "version", name="ux_artifact_versions_artifact_version"),
    )
    op.create_index("ix_artifact_versions_artifact_id", "artifact_versions", ["artifact_id"])
    op.create_index("ix_artifact_versions_project_id", "artifact_versions", ["project_id"])
    op.create_index("ix_artifact_versions_session_id", "artifact_versions", ["session_id"])
    op.create_index(
        "ix_artifact_versions_project_created_at",
        "artifact_versions",
        ["project_id", "created_at"],
    )

    connection = op.get_bind()
    jsonb = postgresql.JSONB(astext_type=sa.Text())
    existing_artifacts = list(
        connection.execute(
            sa.text(
                """
                SELECT
                    id,
                    project_id,
                    session_id,
                    title,
                    summary,
                    reason,
                    outcome,
                    technologies,
                    sections,
                    tags,
                    changed_files,
                    prompt_event_ids,
                    commit_sha,
                    generator,
                    model,
                    metadata,
                    updated_at
                FROM artifacts
                """
            )
        ).mappings()
    )
    if existing_artifacts:
        artifact_versions = sa.table(
            "artifact_versions",
            sa.column("id", postgresql.UUID(as_uuid=True)),
            sa.column("artifact_id", postgresql.UUID(as_uuid=True)),
            sa.column("project_id", postgresql.UUID(as_uuid=True)),
            sa.column("session_id", postgresql.UUID(as_uuid=True)),
            sa.column("version", sa.Integer()),
            sa.column("title", sa.String(length=255)),
            sa.column("summary", sa.Text()),
            sa.column("reason", sa.Text()),
            sa.column("outcome", sa.Text()),
            sa.column("technologies", jsonb),
            sa.column("sections", jsonb),
            sa.column("tags", jsonb),
            sa.column("changed_files", jsonb),
            sa.column("prompt_event_ids", jsonb),
            sa.column("commit_sha", sa.String(length=64)),
            sa.column("generator", sa.String(length=64)),
            sa.column("model", sa.String(length=255)),
            sa.column("metadata", jsonb),
            sa.column("created_at", sa.DateTime(timezone=True)),
        )
        op.bulk_insert(
            artifact_versions,
            [
                {
                    "id": uuid4(),
                    "artifact_id": artifact["id"],
                    "project_id": artifact["project_id"],
                    "session_id": artifact["session_id"],
                    "version": 1,
                    "title": artifact["title"],
                    "summary": artifact["summary"],
                    "reason": artifact["reason"],
                    "outcome": artifact["outcome"],
                    "technologies": artifact["technologies"] or [],
                    "sections": artifact["sections"] or [],
                    "tags": artifact["tags"] or [],
                    "changed_files": artifact["changed_files"] or [],
                    "prompt_event_ids": artifact["prompt_event_ids"] or [],
                    "commit_sha": artifact["commit_sha"],
                    "generator": artifact["generator"],
                    "model": artifact["model"],
                    "metadata": artifact["metadata"] or {},
                    "created_at": artifact["updated_at"],
                }
                for artifact in existing_artifacts
            ],
        )


def downgrade() -> None:
    op.drop_index("ix_artifact_versions_project_created_at", table_name="artifact_versions")
    op.drop_index("ix_artifact_versions_session_id", table_name="artifact_versions")
    op.drop_index("ix_artifact_versions_project_id", table_name="artifact_versions")
    op.drop_index("ix_artifact_versions_artifact_id", table_name="artifact_versions")
    op.drop_table("artifact_versions")
