from types import SimpleNamespace

from app.workers import project_memory
from app.workers.health import record_worker_heartbeat, worker_heartbeat_is_fresh
from app.workers.project_memory import _next_idle_poll_seconds


def test_idle_poll_delay_backs_off_and_caps() -> None:
    assert _next_idle_poll_seconds(2, base=2, maximum=10) == 4
    assert _next_idle_poll_seconds(4, base=2, maximum=10) == 8
    assert _next_idle_poll_seconds(8, base=2, maximum=10) == 10
    assert _next_idle_poll_seconds(10, base=2, maximum=10) == 10


def test_idle_worker_uses_backoff_sequence(monkeypatch) -> None:
    class FakeStop:
        def __init__(self) -> None:
            self.waits: list[float] = []

        def is_set(self) -> bool:
            return len(self.waits) >= 4

        def wait(self, seconds: float) -> None:
            self.waits.append(seconds)

    class FakeDB:
        def close(self) -> None:
            pass

        def commit(self) -> None:
            pass

        def rollback(self) -> None:
            pass

    stop = FakeStop()
    monkeypatch.setattr(
        project_memory,
        "settings",
        SimpleNamespace(
            memory_worker_max_poll_seconds=10,
            memory_worker_poll_seconds=2,
        ),
    )
    monkeypatch.setattr(project_memory, "SessionLocal", FakeDB)
    heartbeats: list[None] = []
    monkeypatch.setattr(
        project_memory,
        "record_worker_heartbeat",
        lambda: heartbeats.append(None),
    )
    monkeypatch.setattr(project_memory, "run_next_project_memory_batch", lambda _db: False)
    monkeypatch.setattr(
        project_memory,
        "materialize_next_idle_memory_session",
        lambda _db: False,
    )

    project_memory.run_worker(stop)

    assert stop.waits == [2, 4, 8, 10]
    assert len(heartbeats) == 8


def test_worker_heartbeat_reports_missing_fresh_and_stale(tmp_path) -> None:
    heartbeat = tmp_path / "worker.heartbeat"

    assert worker_heartbeat_is_fresh(heartbeat, timeout_seconds=10) is False

    record_worker_heartbeat(heartbeat)
    modified_at = heartbeat.stat().st_mtime
    assert worker_heartbeat_is_fresh(
        heartbeat,
        now=modified_at + 9,
        timeout_seconds=10,
    ) is True
    assert worker_heartbeat_is_fresh(
        heartbeat,
        now=modified_at + 11,
        timeout_seconds=10,
    ) is False
