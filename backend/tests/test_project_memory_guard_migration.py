from __future__ import annotations

from importlib import util
from pathlib import Path
from types import ModuleType
from typing import Any


MIGRATION_PATH = (
    Path(__file__).parents[1] / "alembic" / "versions" / "0019_project_memory_guards.py"
)


class RecordingOperations:
    def __init__(self) -> None:
        self.calls: list[tuple[str, tuple[Any, ...], dict[str, Any]]] = []
        self.sql: list[str] = []

    def execute(self, statement: Any) -> None:
        self.sql.append(str(statement))

    def __getattr__(self, name: str):
        def record(*args: Any, **kwargs: Any) -> None:
            self.calls.append((name, args, kwargs))

        return record


def _load_migration() -> ModuleType:
    spec = util.spec_from_file_location("project_memory_guards_migration", MIGRATION_PATH)
    assert spec is not None and spec.loader is not None
    module = util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_duplicate_repair_releases_all_claims_and_preserves_artifacts(monkeypatch) -> None:
    migration = _load_migration()
    operations = RecordingOperations()
    monkeypatch.setattr(migration, "op", operations)

    migration.upgrade()

    sql = "\n".join(operations.sql)
    normalized = " ".join(sql.split())
    assert "CREATE TEMPORARY TABLE project_memory_artifact_duplicate_map" in sql
    assert "WHERE batches.status IN ('pending', 'running', 'failed')" in sql
    assert "lease_expires_at = NULL" in sql
    assert "completed_at = COALESCE" in sql
    assert (
        "DELETE FROM project_memory_batch_items AS items "
        "USING project_memory_affected_batches AS affected"
    ) in normalized
    assert "DELETE FROM artifacts" not in sql
    assert "type = 'MemoryArchive'" in sql
    assert "'deduplicated_into', duplicates.survivor_id" in sql


def test_duplicate_repair_remaps_canonical_result_references(monkeypatch) -> None:
    migration = _load_migration()
    operations = RecordingOperations()
    monkeypatch.setattr(migration, "op", operations)

    migration.upgrade()

    sql = "\n".join(operations.sql)
    assert "SET project_memory_artifact_id = duplicates.survivor_id" in sql
    assert "SET generated_artifact_ids = (" in sql
    assert "GROUP BY COALESCE(duplicates.survivor_id::text, entries.artifact_id)" in sql
    assert "UPDATE artifact_generation_jobs AS jobs" in sql
    assert "SET artifact_id = duplicates.survivor_id" in sql


def test_downgrade_restores_archived_memory_types(monkeypatch) -> None:
    migration = _load_migration()
    operations = RecordingOperations()
    monkeypatch.setattr(migration, "op", operations)

    migration.downgrade()

    sql = "\n".join(operations.sql)
    assert "type = metadata ->> 'deduplicated_original_type'" in sql
    assert "metadata = metadata - 'deduplicated_into' - 'deduplicated_original_type'" in sql
    assert "INSERT INTO project_memory_batch_items" in sql
    assert "jsonb_array_elements(batches.snapshot_manifest)" in sql
    assert "versions.artifact_id = drafts.id" in sql
    assert "project_memory_downgrade_restorable_batches" in sql
    assert "batches.error_code = 'duplicate_snapshot_source'" in sql
    assert "ON CONFLICT DO NOTHING" not in sql
    assert "status = 'succeeded'" in sql
    assert "error_code = 'downgrade_snapshot_unavailable'" in sql
