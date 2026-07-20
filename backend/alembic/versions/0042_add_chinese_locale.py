"""add Simplified Chinese as a preferred locale

Revision ID: 0042_add_chinese_locale
Revises: 0041_refresh_web_sessions
"""

from collections.abc import Sequence

from alembic import op


revision: str = "0042_add_chinese_locale"
down_revision: str | None = "0041_refresh_web_sessions"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint("ck_users_preferred_locale", "users", type_="check")
    op.create_check_constraint(
        "ck_users_preferred_locale",
        "users",
        "preferred_locale in ('en', 'ja', 'ko', 'zh')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_users_preferred_locale", "users", type_="check")
    op.create_check_constraint(
        "ck_users_preferred_locale",
        "users",
        "preferred_locale in ('en', 'ja', 'ko')",
    )
