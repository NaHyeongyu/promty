"""add support content report category

Revision ID: 0044_support_content_reports
Revises: 0043_user_policy_consents
"""

from collections.abc import Sequence

from alembic import op


revision: str = "0044_support_content_reports"
down_revision: str | None = "0043_user_policy_consents"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint("ck_support_inquiries_category", "support_inquiries", type_="check")
    op.create_check_constraint(
        "ck_support_inquiries_category",
        "support_inquiries",
        "category in ('question', 'bug', 'feature', 'privacy', 'content_report', 'other')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_support_inquiries_category", "support_inquiries", type_="check")
    op.create_check_constraint(
        "ck_support_inquiries_category",
        "support_inquiries",
        "category in ('question', 'bug', 'feature', 'privacy', 'other')",
    )
