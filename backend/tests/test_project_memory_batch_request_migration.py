from __future__ import annotations

from pathlib import Path


MIGRATION_PATH = (
    Path(__file__).parents[1]
    / "alembic"
    / "versions"
    / "0020_project_memory_batch_requests.py"
)


def test_batch_request_migration_is_race_safe_and_alembic_compatible() -> None:
    source = MIGRATION_PATH.read_text()

    assert 'revision: str = "0020_memory_batch_requests"' in source
    assert len("0020_memory_batch_requests") <= 32
    assert '"project_memory_batch_requests"' in source
    assert 'sa.PrimaryKeyConstraint("project_id", "idempotency_key")' in source
    assert "jsonb_array_elements_text" in source
    assert "SET idempotency_keys = merged.keys" in source
    assert "SELECT requests.idempotency_key" in source
    assert 'ForeignKeyConstraint(["project_id"], ["projects.id"]' in source
    assert 'ForeignKeyConstraint(\n            ["batch_id"]' not in source
