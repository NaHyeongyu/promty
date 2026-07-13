from __future__ import annotations

from importlib import util
from pathlib import Path
from types import ModuleType
from typing import Any

MIGRATION_PATH = (
    Path(__file__).parents[1] / "alembic" / "versions" / "0022_backend_optimization_indexes.py"
)


class RecordingOperations:
    def __init__(self) -> None:
        self.calls: list[tuple[str, tuple[Any, ...], dict[str, Any]]] = []

    def __getattr__(self, name: str):
        def record(*args: Any, **kwargs: Any) -> None:
            self.calls.append((name, args, kwargs))

        return record


def _load_migration() -> ModuleType:
    spec = util.spec_from_file_location("backend_optimization_migration", MIGRATION_PATH)
    assert spec is not None and spec.loader is not None
    module = util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_backend_optimization_indexes_match_hot_query_predicates(monkeypatch) -> None:
    migration = _load_migration()
    operations = RecordingOperations()
    monkeypatch.setattr(migration, "op", operations)

    migration.upgrade()

    create_calls = [call for call in operations.calls if call[0] == "create_index"]
    assert [call[1][0] for call in create_calls] == [
        "ix_artifacts_pending_memory_project_session_created",
        "ix_project_memory_batches_pending_created",
        "ix_project_memory_batches_running_lease",
    ]
    predicates = [str(call[2].get("postgresql_where")) for call in create_calls]
    assert "metadata ->> 'artifact_stage' = 'pending_draft'" in predicates[0]
    assert predicates[1] == "status = 'pending'"
    assert predicates[2] == "status = 'running'"


def test_backend_optimization_migration_drops_indexes_in_reverse_order(monkeypatch) -> None:
    migration = _load_migration()
    operations = RecordingOperations()
    monkeypatch.setattr(migration, "op", operations)

    migration.downgrade()

    assert [call[1][0] for call in operations.calls] == [
        "ix_project_memory_batches_running_lease",
        "ix_project_memory_batches_pending_created",
        "ix_artifacts_pending_memory_project_session_created",
    ]
