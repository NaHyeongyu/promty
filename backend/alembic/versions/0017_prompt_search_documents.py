"""add prompt search documents

Revision ID: 0017_prompt_search_documents
Revises: 0016_query_performance_indexes
Create Date: 2026-07-09 00:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0017_prompt_search_documents"
down_revision: str | None = "0016_query_performance_indexes"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UTC_NOW = sa.text("timezone('utc', now())")


def upgrade() -> None:
    op.create_table(
        "prompt_search_documents",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("prompt_event_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "token_hashes",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=UTC_NOW,
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=UTC_NOW,
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["session_id"], ["sessions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["prompt_event_id"], ["events.id"], ondelete="CASCADE"),
        sa.UniqueConstraint(
            "prompt_event_id",
            name="uq_prompt_search_documents_prompt_event_id",
        ),
    )
    op.create_index(
        "ix_prompt_search_documents_project_id",
        "prompt_search_documents",
        ["project_id"],
    )
    op.create_index(
        "ix_prompt_search_documents_session_id",
        "prompt_search_documents",
        ["session_id"],
    )
    op.create_index(
        "ix_prompt_search_documents_project_session_event",
        "prompt_search_documents",
        ["project_id", "session_id", "prompt_event_id"],
    )
    op.create_index(
        "ix_prompt_search_documents_token_hashes_gin",
        "prompt_search_documents",
        ["token_hashes"],
        postgresql_using="gin",
    )


def downgrade() -> None:
    op.drop_index(
        "ix_prompt_search_documents_token_hashes_gin",
        table_name="prompt_search_documents",
    )
    op.drop_index(
        "ix_prompt_search_documents_project_session_event",
        table_name="prompt_search_documents",
    )
    op.drop_index(
        "ix_prompt_search_documents_session_id",
        table_name="prompt_search_documents",
    )
    op.drop_index(
        "ix_prompt_search_documents_project_id",
        table_name="prompt_search_documents",
    )
    op.drop_table("prompt_search_documents")
