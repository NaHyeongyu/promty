"""add user policy and external AI consent records

Revision ID: 0043_user_policy_consents
Revises: 0042_add_chinese_locale
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "0043_user_policy_consents"
down_revision: str | None = "0042_add_chinese_locale"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("policy_version", sa.String(32), nullable=True))
    op.add_column(
        "users",
        sa.Column("policy_accepted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("eligibility_confirmed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("external_ai_consent_version", sa.String(32), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("external_ai_consented_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "external_ai_consented_at")
    op.drop_column("users", "external_ai_consent_version")
    op.drop_column("users", "eligibility_confirmed_at")
    op.drop_column("users", "policy_accepted_at")
    op.drop_column("users", "policy_version")
