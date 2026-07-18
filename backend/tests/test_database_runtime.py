from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace

from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError

from app.core import config
from app.core.config import Settings
from app.db import session as database_session
from app import main


def test_database_pool_settings_read_valid_environment(monkeypatch) -> None:
    monkeypatch.setenv("PROMTY_DATABASE_POOL_SIZE", "7")
    monkeypatch.setenv("PROMTY_DATABASE_MAX_OVERFLOW", "3")
    monkeypatch.setenv("PROMTY_DATABASE_POOL_TIMEOUT_SECONDS", "9")
    monkeypatch.setenv("PROMTY_DATABASE_POOL_RECYCLE_SECONDS", "600")
    monkeypatch.setenv("PROMTY_DATABASE_STATEMENT_TIMEOUT_MS", "30000")
    monkeypatch.setenv("PROMTY_DATABASE_LOCK_TIMEOUT_MS", "5000")

    configured = Settings()

    assert configured.database_pool_size == 7
    assert configured.database_max_overflow == 3
    assert configured.database_pool_timeout_seconds == 9
    assert configured.database_pool_recycle_seconds == 600
    assert configured.database_statement_timeout_ms == 30000
    assert configured.database_lock_timeout_ms == 5000


def test_legacy_environment_is_promoted_without_overriding_promty(monkeypatch) -> None:
    monkeypatch.setenv("PROMPTHUB_DATABASE_POOL_SIZE", "7")
    monkeypatch.setenv("PROMTY_DATABASE_POOL_SIZE", "9")
    monkeypatch.setenv("PROMPTHUB_DATABASE_MAX_OVERFLOW", "4")
    monkeypatch.delenv("PROMTY_DATABASE_MAX_OVERFLOW", raising=False)

    config._promote_legacy_environment()
    configured = Settings()

    assert configured.database_pool_size == 9
    assert configured.database_max_overflow == 4


def test_database_pool_settings_fall_back_for_invalid_values(monkeypatch) -> None:
    monkeypatch.setenv("PROMTY_DATABASE_POOL_SIZE", "0")
    monkeypatch.setenv("PROMTY_DATABASE_MAX_OVERFLOW", "-1")
    monkeypatch.setenv("PROMTY_DATABASE_POOL_TIMEOUT_SECONDS", "invalid")
    monkeypatch.setenv("PROMTY_DATABASE_POOL_RECYCLE_SECONDS", "0")
    monkeypatch.setenv("PROMTY_DATABASE_STATEMENT_TIMEOUT_MS", "-1")
    monkeypatch.setenv("PROMTY_DATABASE_LOCK_TIMEOUT_MS", "invalid")

    configured = Settings()

    assert configured.database_pool_size == 5
    assert configured.database_max_overflow == 2
    assert configured.database_pool_timeout_seconds == 5
    assert configured.database_pool_recycle_seconds == 300
    assert configured.database_statement_timeout_ms == 0
    assert configured.database_lock_timeout_ms == 0


def test_postgres_engine_uses_bounded_pool_options(monkeypatch) -> None:
    monkeypatch.setattr(
        database_session,
        "settings",
        SimpleNamespace(
            database_pool_size=4,
            database_max_overflow=1,
            database_pool_timeout_seconds=6,
            database_pool_recycle_seconds=240,
            database_statement_timeout_ms=30000,
            database_lock_timeout_ms=5000,
        ),
    )

    options = database_session._engine_options("postgresql+psycopg://user:pass@db/app")

    assert options == {
        "pool_pre_ping": True,
        "pool_size": 4,
        "max_overflow": 1,
        "pool_timeout": 6,
        "pool_recycle": 240,
        "connect_args": {
            "options": "-c statement_timeout=30000 -c lock_timeout=5000",
        },
    }


def test_postgres_engine_omits_disabled_server_timeouts(monkeypatch) -> None:
    monkeypatch.setattr(
        database_session,
        "settings",
        SimpleNamespace(
            database_pool_size=4,
            database_max_overflow=1,
            database_pool_timeout_seconds=6,
            database_pool_recycle_seconds=240,
            database_statement_timeout_ms=0,
            database_lock_timeout_ms=0,
        ),
    )

    options = database_session._engine_options("postgresql+psycopg://user:pass@db/app")

    assert "connect_args" not in options


def test_sqlite_engine_omits_queue_pool_only_options(monkeypatch) -> None:
    monkeypatch.setattr(database_session, "settings", SimpleNamespace())

    options = database_session._engine_options("sqlite+pysqlite:///:memory:")
    assert options == {"pool_pre_ping": True}

    sqlite_engine = create_engine("sqlite+pysqlite:///:memory:", **options)
    with sqlite_engine.connect() as connection:
        assert connection.scalar(text("SELECT 1")) == 1


def test_database_dependency_closes_without_threadpool_cleanup(monkeypatch) -> None:
    session = SimpleNamespace(close=lambda: setattr(session, "closed", True), closed=False)
    monkeypatch.setattr(database_session, "SessionLocal", lambda: session)

    async def exercise_dependency() -> None:
        dependency = database_session.get_db()
        assert await anext(dependency) is session
        await dependency.aclose()

    asyncio.run(exercise_dependency())

    assert session.closed is True


class _Connection:
    def __init__(self) -> None:
        self.statements: list[str] = []

    def __enter__(self) -> _Connection:
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def execute(self, statement: object) -> None:
        self.statements.append(str(statement))


class _ReadyEngine:
    def __init__(self) -> None:
        self.connection = _Connection()

    def connect(self) -> _Connection:
        return self.connection


class _UnavailableEngine:
    def connect(self) -> None:
        raise OperationalError("SELECT 1", {}, Exception("database unavailable"))


def test_health_and_liveness_remain_database_independent() -> None:
    assert main.health_check() == {"status": "ok"}
    assert main.liveness_check() == {"status": "ok"}


def test_readiness_checks_database(monkeypatch) -> None:
    ready_engine = _ReadyEngine()
    monkeypatch.setattr(main, "engine", ready_engine)

    assert main.readiness_check() == {"status": "ok", "database": "ok"}
    assert ready_engine.connection.statements == ["SELECT 1"]


def test_readiness_returns_503_when_database_is_unavailable(monkeypatch) -> None:
    monkeypatch.setattr(main, "engine", _UnavailableEngine())

    response = main.readiness_check()

    assert response.status_code == 503
    assert json.loads(response.body) == {
        "status": "unavailable",
        "database": "unavailable",
    }


def test_health_routes_are_published() -> None:
    paths = main.app.openapi()["paths"]

    assert "/health" in paths
    assert "/health/live" in paths
    assert "/health/ready" in paths
