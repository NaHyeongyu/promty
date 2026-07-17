"""merge admin alert state and web session migration heads

Revision ID: 0037_merge_admin_web_heads
Revises: 0036_admin_alert_states, 0036_web_sessions
Create Date: 2026-07-17
"""

from collections.abc import Sequence

revision: str = "0037_merge_admin_web_heads"
down_revision: tuple[str, str] = (
    "0036_admin_alert_states",
    "0036_web_sessions",
)
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
