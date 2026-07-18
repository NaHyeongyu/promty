from __future__ import annotations

from datetime import UTC, datetime
import os
from uuid import uuid4

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.artifact_generation_jobs import ArtifactGenerationJob
from app.models.artifacts import Artifact
from app.models.projects import Project
from app.models.sessions import Session as PromptSession
from app.models.users import User
from app.services.memory import artifacts as memory_artifacts
from app.services.memory.constants import (
    MEMORY_DRAFT_ARTIFACT_TYPE,
    MEMORY_WINDOW_STRATEGY,
    PENDING_DRAFT_STAGE,
)

pytestmark = pytest.mark.skipif(
    os.environ.get("PROMTY_RUN_POSTGRES_TESTS") != "1",
    reason="PostgreSQL integration tests are disabled",
)


@pytest.fixture
def db() -> Session:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


def test_failed_generation_job_restores_resume_marker_and_partial_writes(
    db: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    marker = str(uuid4())
    now = datetime.now(UTC)
    project_id = uuid4()
    session_id = uuid4()
    user = User(
        github_id=f"memory-resume-{marker}",
        email=f"memory-resume-{marker}@example.com",
        username=f"memory-resume-{marker}",
    )
    project = Project(
        id=project_id,
        owner=user,
        name="Memory resume rollback test",
        slug=f"memory-resume-{marker}",
        visibility="private",
        default_branch="main",
    )
    prompt_session = PromptSession(
        id=session_id,
        project=project,
        tool="codex-cli",
        started_at=now,
        ended_at=now,
    )
    resume_artifact = Artifact(
        project=project,
        session=prompt_session,
        type=MEMORY_DRAFT_ARTIFACT_TYPE,
        title="Resume boundary",
        summary="Resume marker must survive a failed generation attempt.",
        storage_key=f"memory/resume-test/{marker}/boundary",
        metadata_={
            "artifact_stage": PENDING_DRAFT_STAGE,
            "end_sequence": 20,
            "materialization_end_sequence": 20,
            "memory_resume_required": True,
            "memory_strategy": MEMORY_WINDOW_STRATEGY,
            "review_state": "draft",
            "slice_index": 2,
        },
    )
    job = ArtifactGenerationJob(
        project_id=project_id,
        session_id=session_id,
        reason="manual",
        status="pending",
    )
    db.add_all((user, project, prompt_session, resume_artifact, job))
    db.flush()

    partial_storage_key = f"memory/resume-test/{marker}/partial"

    def fail_after_partial_write(
        target_db: Session,
        target_session: PromptSession,
        **_kwargs,
    ) -> list[Artifact]:
        memory_artifacts._clear_memory_resume_marker(target_db, target_session)
        target_db.flush()
        target_db.add(
            Artifact(
                project_id=project.id,
                session_id=prompt_session.id,
                type=MEMORY_DRAFT_ARTIFACT_TYPE,
                title="Partial slice",
                storage_key=partial_storage_key,
                metadata_={
                    "artifact_stage": PENDING_DRAFT_STAGE,
                    "end_sequence": 21,
                    "materialization_end_sequence": 30,
                    "memory_strategy": MEMORY_WINDOW_STRATEGY,
                    "review_state": "draft",
                    "slice_index": 3,
                },
            )
        )
        target_db.flush()
        raise RuntimeError("forced generation failure")

    monkeypatch.setattr(
        memory_artifacts,
        "generate_due_memory_artifacts_for_session",
        fail_after_partial_write,
    )

    result = memory_artifacts.run_artifact_generation_job(db, job)
    db.flush()
    db.expire_all()

    stored_job = db.get(ArtifactGenerationJob, result.id)
    stored_resume_artifact = db.get(Artifact, resume_artifact.id)
    partial_count = db.scalar(
        select(func.count(Artifact.id)).where(Artifact.storage_key == partial_storage_key)
    )

    assert stored_job is not None
    assert stored_job.status == "failed"
    assert stored_job.error == "forced generation failure"
    assert stored_resume_artifact is not None
    assert stored_resume_artifact.metadata_.get("memory_resume_required") is True
    assert partial_count == 0


def test_worker_resumes_ended_marker_session_and_ignores_null_marker_group(
    db: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    marker = str(uuid4())
    user = User(
        github_id=f"memory-worker-{marker}",
        email=f"memory-worker-{marker}@example.com",
        username=f"memory-worker-{marker}",
    )
    project = Project(
        owner=user,
        name="Ended memory resume worker test",
        slug=f"memory-worker-{marker}",
        visibility="private",
        default_branch="main",
    )
    no_resume_session = PromptSession(
        project=project,
        tool="codex-cli",
        started_at=datetime(1960, 1, 1, tzinfo=UTC),
        ended_at=datetime(1960, 1, 1, 1, tzinfo=UTC),
    )
    resume_session = PromptSession(
        project=project,
        tool="codex-cli",
        started_at=datetime(1970, 1, 1, tzinfo=UTC),
        ended_at=datetime(1970, 1, 1, 1, tzinfo=UTC),
    )
    db.add_all((user, project, no_resume_session, resume_session))
    db.flush()
    db.add_all(
        (
            Artifact(
                project_id=project.id,
                session_id=no_resume_session.id,
                type=MEMORY_DRAFT_ARTIFACT_TYPE,
                title="Complete slice without marker",
                storage_key=f"memory/worker-test/{marker}/complete",
                metadata_={
                    "artifact_stage": PENDING_DRAFT_STAGE,
                    "end_sequence": 10,
                    "materialization_end_sequence": 10,
                    "memory_strategy": MEMORY_WINDOW_STRATEGY,
                    "review_state": "draft",
                    "slice_index": 1,
                },
            ),
            Artifact(
                project_id=project.id,
                session_id=resume_session.id,
                type=MEMORY_DRAFT_ARTIFACT_TYPE,
                title="Older repaired slice with stale marker",
                storage_key=f"memory/worker-test/{marker}/earlier",
                metadata_={
                    "artifact_stage": PENDING_DRAFT_STAGE,
                    "end_sequence": 10,
                    "materialization_end_sequence": 10,
                    "memory_resume_required": True,
                    "memory_strategy": MEMORY_WINDOW_STRATEGY,
                    "review_state": "draft",
                    "slice_index": 1,
                },
            ),
            Artifact(
                project_id=project.id,
                session_id=resume_session.id,
                type=MEMORY_DRAFT_ARTIFACT_TYPE,
                title="Newer completed slice without marker",
                storage_key=f"memory/worker-test/{marker}/resume",
                metadata_={
                    "artifact_stage": PENDING_DRAFT_STAGE,
                    "end_sequence": 20,
                    "materialization_end_sequence": 20,
                    "memory_strategy": MEMORY_WINDOW_STRATEGY,
                    "review_state": "draft",
                    "slice_index": 2,
                },
            ),
        )
    )
    db.flush()

    calls: list[tuple[PromptSession, bool]] = []

    def record_generation(
        _target_db: Session,
        target_session: PromptSession,
        *,
        finalize: bool,
        **_kwargs,
    ) -> list[Artifact]:
        calls.append((target_session, finalize))
        return []

    monkeypatch.setattr(
        memory_artifacts,
        "generate_due_memory_artifacts_for_session",
        record_generation,
    )

    assert memory_artifacts.materialize_next_idle_memory_session(db) is True
    assert [(session.id, finalize) for session, finalize in calls] == [(resume_session.id, True)]
    db.flush()
    db.expire_all()
    stale_marker = db.scalar(
        select(Artifact).where(Artifact.storage_key == f"memory/worker-test/{marker}/earlier")
    )
    assert stale_marker is not None
    assert "memory_resume_required" not in stale_marker.metadata_
    assert memory_artifacts.materialize_next_idle_memory_session(db) is False
