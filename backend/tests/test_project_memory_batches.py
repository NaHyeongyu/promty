from __future__ import annotations

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.models.project_memory_batches import (
    ProjectMemoryBatch,
    ProjectMemoryBatchItem,
)
from app.models.artifacts import Artifact
from app.services.memory import batches
from app.services.memory.constants import (
    REVIEW_STATE_DRAFT,
    REVIEW_STATE_GENERATED,
    REVIEW_STATE_IGNORED,
)


class FakeDB:
    def __init__(self) -> None:
        self.flush_count = 0

    def flush(self) -> None:
        self.flush_count += 1


class FakeScalarResult:
    def __init__(self, value) -> None:
        self.value = value

    def scalar_one(self):
        return self.value


class FakeClaimDB(FakeDB):
    def __init__(self, batch) -> None:
        super().__init__()
        self.batch = batch
        self.commit_count = 0

    def execute(self, _statement):
        return FakeScalarResult(self.batch)

    def commit(self) -> None:
        self.commit_count += 1


def _snapshot(draft_id=None):
    return batches.PendingDraftSnapshot(
        created_at=datetime(2026, 7, 12, tzinfo=UTC),
        id=draft_id or uuid4(),
        metadata_={},
        summary="Captured project work",
        title="Project work",
        version_id=uuid4(),
    )


def _generated_chunk(snapshots):
    return batches.GeneratedChunkPayload(
        first_event_at=None,
        last_event_at=None,
        metadata={},
        payload={"summary": "Generated context"},
        source_draft_ids=[str(snapshot.id) for snapshot in snapshots],
        source_draft_version_ids=[str(snapshot.version_id) for snapshot in snapshots],
        source_session_id=str(uuid4()),
    )


def _batch_rows(*, first_session_count: int, second_session_count: int = 0):
    project_id = uuid4()
    first_session = SimpleNamespace(id=uuid4(), project_id=project_id)
    second_session = SimpleNamespace(id=uuid4(), project_id=project_id)
    rows = []
    for index in range(first_session_count + second_session_count):
        session = first_session if index < first_session_count else second_session
        draft_id = uuid4()
        draft = SimpleNamespace(
            id=draft_id,
            metadata_={"review_state": REVIEW_STATE_DRAFT},
            updated_at=datetime(2026, 7, 12, tzinfo=UTC),
        )
        rows.append((SimpleNamespace(), draft, _snapshot(draft_id), session))
    return project_id, rows


def test_project_memory_batch_models_capture_exact_draft_versions() -> None:
    assert ProjectMemoryBatch.__table__.c.idempotency_key.nullable is False
    assert ProjectMemoryBatch.__table__.c.idempotency_keys.nullable is False
    assert ProjectMemoryBatch.__table__.c.lease_expires_at.nullable is True
    assert ProjectMemoryBatch.__table__.c.snapshot_manifest.nullable is False
    assert ProjectMemoryBatchItem.__table__.c.draft_version_id.nullable is False
    assert any(
        constraint.name == "uq_project_memory_batch_items_draft_id"
        for constraint in ProjectMemoryBatchItem.__table__.constraints
    )
    assert any(
        index.name == "ux_artifacts_memory_storage_key" and index.unique
        for index in Artifact.__table__.indexes
    )


def test_project_memory_lock_key_is_stable_and_project_specific() -> None:
    first_project_id = uuid4()
    second_project_id = uuid4()

    assert batches._project_memory_lock_key(first_project_id) == batches._project_memory_lock_key(
        first_project_id
    )
    assert batches._project_memory_lock_key(first_project_id) != batches._project_memory_lock_key(
        second_project_id
    )


def test_only_one_request_claims_a_running_batch_lease() -> None:
    now = datetime.now(UTC)
    batch = SimpleNamespace(
        attempt_count=4,
        lease_expires_at=now + timedelta(minutes=5),
        status="running",
    )
    db = FakeClaimDB(batch)

    claimed_batch, claimed, attempt_count = batches._claim_batch_run(db, uuid4())

    assert claimed_batch is batch
    assert claimed is False
    assert attempt_count == 4
    assert batch.attempt_count == 4
    assert db.commit_count == 1


def test_batch_chunks_all_sessions_and_compiles_project_memory_once(monkeypatch) -> None:
    project_id, rows = _batch_rows(first_session_count=7, second_session_count=2)
    batch = SimpleNamespace(id=uuid4(), project_id=project_id)
    generated_calls: list[list[object]] = []
    compile_calls: list[list[object]] = []

    monkeypatch.setattr(batches, "_load_batch_snapshots", lambda _db, _batch: rows)

    def generate_chunk(_db, *, snapshots, **_kwargs):
        generated_calls.append(snapshots)
        return [_generated_chunk(snapshots)]

    def compile_memory(_db, *, required_source_memories, **_kwargs):
        compile_calls.append(required_source_memories)
        return SimpleNamespace(id=uuid4())

    monkeypatch.setattr(batches, "_generate_chunk_payloads", generate_chunk)
    monkeypatch.setattr(
        batches,
        "_write_project_batch_memory",
        lambda *_args, **_kwargs: SimpleNamespace(id=uuid4()),
    )
    monkeypatch.setattr(batches, "compile_project_memory", compile_memory)

    memories, project_memory, status = batches._run_batch_contents(FakeDB(), batch)

    assert [len(chunk) for chunk in generated_calls] == [6, 1, 2]
    assert len(memories) == 1
    assert len(compile_calls) == 1
    assert compile_calls[0] == memories
    assert project_memory is not None
    assert status == "memory_generated"
    assert all(draft.metadata_["review_state"] == REVIEW_STATE_GENERATED for _, draft, _, _ in rows)


def test_generation_failure_does_not_consume_any_snapshot_draft(monkeypatch) -> None:
    project_id, rows = _batch_rows(first_session_count=7)
    batch = SimpleNamespace(id=uuid4(), project_id=project_id)
    call_count = 0

    monkeypatch.setattr(batches, "_load_batch_snapshots", lambda _db, _batch: rows)

    def generate_chunk(_db, **_kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 2:
            raise batches.ProjectMemoryBatchGenerationError("provider unavailable")
        return [_generated_chunk(_kwargs["snapshots"])]

    monkeypatch.setattr(batches, "_generate_chunk_payloads", generate_chunk)
    monkeypatch.setattr(
        batches,
        "_write_project_batch_memory",
        lambda *_args, **_kwargs: SimpleNamespace(id=uuid4()),
    )
    monkeypatch.setattr(
        batches,
        "compile_project_memory",
        lambda *_args, **_kwargs: pytest.fail("compile must not run after a chunk failure"),
    )

    with pytest.raises(batches.ProjectMemoryBatchGenerationError):
        batches._run_batch_contents(FakeDB(), batch)

    assert call_count == 2
    assert all(draft.metadata_ == {"review_state": REVIEW_STATE_DRAFT} for _, draft, _, _ in rows)


def test_successful_empty_generation_consumes_snapshot_without_compiling(monkeypatch) -> None:
    project_id, rows = _batch_rows(first_session_count=2)
    batch = SimpleNamespace(id=uuid4(), project_id=project_id)

    monkeypatch.setattr(batches, "_load_batch_snapshots", lambda _db, _batch: rows)
    monkeypatch.setattr(batches, "_generate_chunk_payloads", lambda *_args, **_kwargs: [])
    monkeypatch.setattr(
        batches,
        "compile_project_memory",
        lambda *_args, **_kwargs: pytest.fail("empty generation must not compile"),
    )

    memories, project_memory, status = batches._run_batch_contents(FakeDB(), batch)

    assert memories == []
    assert project_memory is None
    assert status == "no_memory"
    assert all(draft.metadata_["review_state"] == REVIEW_STATE_IGNORED for _, draft, _, _ in rows)


def test_provider_failure_is_not_treated_as_successful_empty_generation(monkeypatch) -> None:
    snapshot = _snapshot()
    project_id = uuid4()
    session = SimpleNamespace(id=uuid4(), project_id=project_id)

    monkeypatch.setattr(
        batches,
        "_pending_draft_generation_context",
        lambda *_args: {"last_event_id": None},
    )
    monkeypatch.setattr(
        batches,
        "build_memory_draft_payloads_from_context",
        lambda *_args, **_kwargs: (
            [],
            {"fallback_reason": "provider request failed"},
        ),
    )

    with pytest.raises(batches.ProjectMemoryBatchGenerationError):
        batches._generate_chunk_payloads(
            FakeDB(),
            session=session,
            snapshots=[snapshot],
        )
