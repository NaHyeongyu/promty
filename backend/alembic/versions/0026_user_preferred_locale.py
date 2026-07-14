"""add user preferred locale

Revision ID: 0026_user_preferred_locale
Revises: 0025_project_url
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0026_user_preferred_locale"
down_revision: str | None = "0025_project_url"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "preferred_locale",
            sa.String(length=8),
            nullable=False,
            server_default="en",
        ),
    )
    op.create_check_constraint(
        "ck_users_preferred_locale",
        "users",
        "preferred_locale in ('en', 'ja', 'ko')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_users_preferred_locale", "users", type_="check")
    op.drop_column("users", "preferred_locale")
