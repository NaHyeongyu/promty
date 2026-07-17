from __future__ import annotations

from app.api.events import collector_heartbeat


class DatabaseStub:
    def __init__(self) -> None:
        self.commit_count = 0

    def commit(self) -> None:
        self.commit_count += 1


def test_collector_heartbeat_commits_token_last_used_at() -> None:
    db = DatabaseStub()

    response = collector_heartbeat(_ingest_owner=None, db=db)  # type: ignore[arg-type]

    assert response == {"status": "ok"}
    assert db.commit_count == 1
