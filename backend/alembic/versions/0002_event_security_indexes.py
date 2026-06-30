"""add event constraints and query indexes

Revision ID: 0002_event_security_indexes
Revises: 0001_initial_schema
Create Date: 2026-06-27 00:00:00.000000
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0002_event_security_indexes"
down_revision: str | None = "0001_initial_schema"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_index("ix_events_project_session_sequence", table_name="events")
    op.create_index(
        "ux_events_project_session_sequence",
        "events",
        ["project_id", "session_id", "sequence"],
        unique=True,
    )

    op.create_check_constraint(
        "ck_events_sequence_positive",
        "events",
        "sequence > 0",
    )
    op.create_check_constraint(
        "ck_events_schema_version_positive",
        "events",
        "schema_version >= 1",
    )
    op.create_check_constraint(
        "ck_events_tool_supported",
        "events",
        "tool in ('claude-code', 'codex-cli', 'cursor', 'gemini-cli')",
    )
    op.create_check_constraint(
        "ck_events_event_type_supported",
        "events",
        "event_type in ("
        "'SessionStarted', "
        "'PromptSubmitted', "
        "'ResponseReceived', "
        "'FilesChanged', "
        "'CommitCreated', "
        "'SessionEnded'"
        ")",
    )
    op.create_check_constraint(
        "ck_sessions_ended_after_started",
        "sessions",
        "ended_at is null or ended_at >= started_at",
    )

    op.create_index(
        "ix_events_created_at_sequence",
        "events",
        ["created_at", "sequence"],
    )
    op.create_index(
        "ix_events_event_type_created_at",
        "events",
        ["event_type", "created_at"],
    )
    op.create_index(
        "ix_events_session_created_at",
        "events",
        ["session_id", "created_at"],
    )
    op.create_index(
        "ix_events_project_session_created_at",
        "events",
        ["project_id", "session_id", "created_at"],
    )
    op.create_index(
        "ix_events_payload_gin",
        "events",
        ["payload"],
        postgresql_using="gin",
    )


def downgrade() -> None:
    op.drop_index("ix_events_payload_gin", table_name="events")
    op.drop_index("ix_events_project_session_created_at", table_name="events")
    op.drop_index("ix_events_session_created_at", table_name="events")
    op.drop_index("ix_events_event_type_created_at", table_name="events")
    op.drop_index("ix_events_created_at_sequence", table_name="events")

    op.drop_constraint("ck_sessions_ended_after_started", "sessions", type_="check")
    op.drop_constraint("ck_events_event_type_supported", "events", type_="check")
    op.drop_constraint("ck_events_tool_supported", "events", type_="check")
    op.drop_constraint("ck_events_schema_version_positive", "events", type_="check")
    op.drop_constraint("ck_events_sequence_positive", "events", type_="check")

    op.drop_index("ux_events_project_session_sequence", table_name="events")
    op.create_index(
        "ix_events_project_session_sequence",
        "events",
        ["project_id", "session_id", "sequence"],
    )
