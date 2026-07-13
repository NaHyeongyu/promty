from __future__ import annotations

from importlib import util
from pathlib import Path
from types import ModuleType
from typing import Any

MIGRATION_PATH = Path(__file__).parents[1] / "alembic" / "versions" / "0023_memory_read_indexes.py"


class RecordingOperations:
    def __init__(self) -> None:
        self.calls: list[tuple[str, tuple[Any, ...], dict[str, Any]]] = []

    def __getattr__(self, name: str):
        def record(*args: Any, **kwargs: Any) -> None:
            self.calls.append((name, args, kwargs))

        return record


def _load_migration() -> ModuleType:
    spec = util.spec_from_file_location("memory_read_migration", MIGRATION_PATH)
    assert spec is not None and spec.loader is not None
    module = util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_memory_read_indexes_match_query_predicates(monkeypatch) -> None:
    migration = _load_migration()
    operations = RecordingOperations()
    monkeypatch.setattr(migration, "op", operations)

    migration.upgrade()

    create_calls = [call for call in operations.calls if call[0] == "create_index"]
    assert [call[1][0] for call in create_calls] == [
        "ix_artifacts_memory_slice_session_end",
        "ix_artifacts_generated_memory_project_updated",
    ]
    predicates = [str(call[2]["postgresql_where"]) for call in create_calls]
    assert "memory_strategy' = 'prompt_window_v1'" in predicates[0]
    assert "artifact_stage' IN ('generated_memory', 'verified_memory')" in predicates[1]


def test_memory_read_migration_drops_indexes_in_reverse_order(monkeypatch) -> None:
    migration = _load_migration()
    operations = RecordingOperations()
    monkeypatch.setattr(migration, "op", operations)

    migration.downgrade()

    assert [call[1][0] for call in operations.calls] == [
        "ix_artifacts_generated_memory_project_updated",
        "ix_artifacts_memory_slice_session_end",
    ]
