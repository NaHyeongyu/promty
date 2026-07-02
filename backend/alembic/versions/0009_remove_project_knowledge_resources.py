"""remove project knowledge resources

Revision ID: 0009_remove_project_knowledge_resources
Revises: 0008_published_flows
Create Date: 2026-07-02 00:00:00.000000
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0009_remove_project_knowledge_resources"
down_revision: str | None = "0008_published_flows"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("DROP TABLE IF EXISTS project_knowledge_resources CASCADE")


def downgrade() -> None:
    pass
