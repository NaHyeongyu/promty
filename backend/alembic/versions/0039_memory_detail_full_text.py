"""preserve complete memory detail text

Revision ID: 0039_memory_detail_full_text
Revises: 0038_recover_failed_drafts
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "0039_memory_detail_full_text"
down_revision: str | None = "0038_recover_failed_drafts"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column(
        "artifacts",
        "title",
        existing_type=sa.String(length=255),
        type_=sa.Text(),
        existing_nullable=False,
    )
    op.alter_column(
        "artifact_versions",
        "title",
        existing_type=sa.String(length=255),
        type_=sa.Text(),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.execute(
        "UPDATE artifact_versions SET title = LEFT(title, 255) "
        "WHERE LENGTH(title) > 255"
    )
    op.alter_column(
        "artifact_versions",
        "title",
        existing_type=sa.Text(),
        type_=sa.String(length=255),
        existing_nullable=False,
    )
    op.execute(
        "UPDATE artifacts SET title = LEFT(title, 255) WHERE LENGTH(title) > 255"
    )
    op.alter_column(
        "artifacts",
        "title",
        existing_type=sa.Text(),
        type_=sa.String(length=255),
        existing_nullable=False,
    )
