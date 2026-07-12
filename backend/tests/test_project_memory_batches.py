from __future__ import annotations

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.models.project_memory_batches import (
    ProjectMemoryBatch,
    ProjectMemoryBatchItem,
    ProjectMemoryBatchRequest,
)
from app.models.artifacts import Artifact
from app.services.memory import batches
from app.services.memory.constants import (
    REVIEW_STATE_DRAFT,
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
    assert ProjectMemoryBatchRequest.__table__.c.idempotency_key.primary_key is True
    assert ProjectMemoryBatchRequest.__table__.c.project_id.primary_key is True
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


def test_batch_chunks_all_sessions_into_one_project_update(monkeypatch) -> None:
    project_id, rows = _batch_rows(first_session_count=7, second_session_count=2)
    generated_calls: list[list[object]] = []
    generations = []
    for session_id in dict.fromkeys(session.id for _, _, _, session in rows):
        session_rows = [row for row in rows if row[3].id == session_id]
        for chunk_rows in batches._chunks(
            session_rows,
            batches.PROJECT_MEMORY_BATCH_CHUNK_SIZE,
        ):
            generations.append(
                batches.PendingChunkGeneration(
                    context={},
                    snapshots=[snapshot for _, _, snapshot, _ in chunk_rows],
                    source_session_id=str(session_id),
                )
            )
    prepared = batches.BatchAttemptSnapshot(
        batch_id=uuid4(),
        chunk_generations=generations,
        project_id=project_id,
        project_name="Promty",
        snapshot_manifest=[
            {"draft_id": str(draft.id)} for _, draft, _, _ in rows
        ],
        source_session_ids=list(
            dict.fromkeys(str(session.id) for _, _, _, session in rows)
        ),
    )

    def generate_chunk(*, snapshots, **_kwargs):
        generated_calls.append(snapshots)
        return [_generated_chunk(snapshots)]

    monkeypatch.setattr(batches, "_generate_chunk_payloads", generate_chunk)

    generated_chunks = batches._generate_batch_chunks(prepared)
    memory = batches._prepare_project_batch_memory(
        batch=prepared,
        chunks=generated_chunks,
    )

    assert [len(chunk) for chunk in generated_calls] == [6, 1, 2]
    assert memory.extra_metadata["internal_chunk_count"] == 3
    assert memory.extra_metadata["source_session_ids"] == prepared.source_session_ids
    assert memory.storage_key.endswith(f"/batch/{prepared.batch_id}/memory")


def test_generation_failure_does_not_consume_any_snapshot_draft(monkeypatch) -> None:
    project_id, rows = _batch_rows(first_session_count=7)
    call_count = 0
    prepared = batches.BatchAttemptSnapshot(
        batch_id=uuid4(),
        chunk_generations=[
            batches.PendingChunkGeneration(
                context={},
                snapshots=[snapshot for _, _, snapshot, _ in chunk_rows],
                source_session_id=str(chunk_rows[0][3].id),
            )
            for chunk_rows in batches._chunks(
                rows,
                batches.PROJECT_MEMORY_BATCH_CHUNK_SIZE,
            )
        ],
        project_id=project_id,
        project_name="Promty",
        snapshot_manifest=[],
        source_session_ids=[],
    )

    def generate_chunk(**_kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 2:
            raise batches.ProjectMemoryBatchGenerationError("provider unavailable")
        return [_generated_chunk(_kwargs["snapshots"])]

    monkeypatch.setattr(batches, "_generate_chunk_payloads", generate_chunk)

    with pytest.raises(batches.ProjectMemoryBatchGenerationError):
        batches._generate_batch_chunks(prepared)

    assert call_count == 2
    assert all(draft.metadata_ == {"review_state": REVIEW_STATE_DRAFT} for _, draft, _, _ in rows)


def test_successful_empty_generation_consumes_snapshot_without_compiling(monkeypatch) -> None:
    project_id, rows = _batch_rows(first_session_count=2)
    batch = SimpleNamespace(id=uuid4(), project_id=project_id)
    batches._consume_batch_snapshots(
        FakeDB(),
        batch=batch,
        generated_chunks=[],
        memory=None,
        rows=rows,
    )

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
            context={"last_event_id": None},
            snapshots=[snapshot],
            source_session_id=str(session.id),
        )
