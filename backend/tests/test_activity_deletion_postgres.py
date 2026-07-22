from __future__ import annotations

from datetime import UTC, datetime, timedelta
import os
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.artifact_versions import ArtifactVersion
from app.models.artifacts import Artifact
from app.models.events import Event
from app.models.projects import Project
from app.models.project_memory_batches import ProjectMemoryBatch
from app.models.project_stats import ProjectStats
from app.models.published_flows import PublishedFlow
from app.models.sessions import Session as PromptSession
from app.models.users import User
from app.services.projects.activity_deletion import (
    delete_prompt_activity,
    delete_session_activity,
)
from app.services.published_flows import create_published_flow

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


def test_prompt_and_session_deletion_remove_raw_copies_but_keep_generated_memory(
    db: Session,
) -> None:
    marker = str(uuid4())
    now = datetime.now(UTC)
    owner = User(
        email=f"activity-delete-{marker}@example.com",
        github_id=f"activity-delete-{marker}",
        username=f"activity-delete-{marker}",
    )
    project = Project(
        default_branch="main",
        name="Activity deletion integration",
        owner=owner,
        slug=f"activity-delete-{marker}",
        visibility="private",
    )
    prompt_session = PromptSession(
        model="gpt-5",
        project=project,
        started_at=now,
        tool="codex-cli",
    )
    db.add_all((owner, project, prompt_session))
    db.flush()

    first_prompt_id = uuid4()
    first_response_id = uuid4()
    first_files_id = uuid4()
    second_prompt_id = uuid4()
    second_response_id = uuid4()
    rows = (
        (first_prompt_id, "PromptSubmitted", {"prompt": "private prompt", "turn_id": "1"}),
        (
            first_response_id,
            "ResponseReceived",
            {
                "prompt_event_id": str(first_prompt_id),
                "response": "private response",
                "turn_id": "1",
            },
        ),
        (
            first_files_id,
            "FilesChanged",
            {
                "prompt_event_id": str(first_prompt_id),
                "changes": [{"path": "private.py", "status": "modified"}],
            },
        ),
        (second_prompt_id, "PromptSubmitted", {"prompt": "keep prompt", "turn_id": "2"}),
        (
            second_response_id,
            "ResponseReceived",
            {"response": "keep response", "turn_id": "2"},
        ),
    )
    for sequence, (event_id, event_type, payload) in enumerate(rows, start=1):
        db.add(
            Event(
                created_at=now + timedelta(seconds=sequence),
                event_type=event_type,
                id=event_id,
                payload=payload,
                project_id=project.id,
                schema_version=1,
                sequence=sequence,
                session_id=prompt_session.id,
                tool="codex-cli",
            )
        )
    db.flush()

    pending_draft = Artifact(
        changed_files=[{"path": "private.py"}],
        metadata_={
            "artifact_stage": "pending_draft",
            "draft_evidence": {
                "prompts": [
                    {"event_id": str(first_prompt_id), "ai_input": {"text": "private prompt"}},
                    {"event_id": str(second_prompt_id), "ai_input": {"text": "keep prompt"}},
                ],
                "responses": [
                    {"event_id": str(first_response_id), "output_preview": "private response"}
                ],
            },
            "review_state": "draft",
        },
        project_id=project.id,
        prompt_event_ids=[str(first_prompt_id), str(second_prompt_id)],
        sections=[{"title": "Raw", "summary": "private prompt"}],
        session_id=prompt_session.id,
        storage_key=f"activity-delete/{marker}/pending",
        summary="private prompt",
        title="Pending private activity",
        type="MemoryDraft",
    )
    generated_memory = Artifact(
        metadata_={"artifact_stage": "generated_memory", "review_state": "generated"},
        project_id=project.id,
        prompt_event_ids=[str(first_prompt_id)],
        session_id=prompt_session.id,
        storage_key=f"activity-delete/{marker}/generated",
        summary="Already generated memory",
        title="Generated memory",
        type="MemoryTask",
    )
    db.add_all((pending_draft, generated_memory))
    db.flush()
    pending_version = ArtifactVersion(
        artifact_id=pending_draft.id,
        metadata_=pending_draft.metadata_.copy(),
        project_id=project.id,
        prompt_event_ids=list(pending_draft.prompt_event_ids),
        session_id=prompt_session.id,
        summary=pending_draft.summary,
        title=pending_draft.title,
        version=1,
    )
    db.add(pending_version)
    db.flush()

    flow = create_published_flow(
        db,
        context_summary=None,
        current_user=owner,
        end_prompt_event_id=None,
        notes=None,
        prompt_event_ids=[first_prompt_id],
        project_id=project.id,
        session_id=None,
        start_prompt_event_id=None,
        status_value="draft",
        summary="Copied private activity",
        tags=[],
        title=None,
        visibility="private",
    )
    flow_id = UUID(flow["id"])

    active_batch = ProjectMemoryBatch(
        idempotency_key=f"activity-delete-{marker}",
        project_id=project.id,
        requested_by_user_id=owner.id,
        status="pending",
    )
    db.add(active_batch)
    db.flush()
    with pytest.raises(HTTPException) as active_error:
        delete_prompt_activity(
            db,
            project_id=project.id,
            prompt_event_id=first_prompt_id,
            user=owner,
        )
    assert active_error.value.status_code == 409
    assert db.get(Event, first_prompt_id) is not None
    active_batch.status = "failed"
    db.flush()

    result = delete_prompt_activity(
        db,
        project_id=project.id,
        prompt_event_id=first_prompt_id,
        user=owner,
    )
    db.expire_all()

    assert result.asset_storage_keys == ()
    assert db.get(Event, first_prompt_id) is None
    assert db.get(Event, first_response_id) is None
    assert db.get(Event, first_files_id) is None
    assert db.get(Event, second_prompt_id) is not None
    assert db.get(Event, second_response_id) is not None
    assert db.get(PublishedFlow, flow_id) is None

    stored_draft = db.get(Artifact, pending_draft.id)
    stored_version = db.get(ArtifactVersion, pending_version.id)
    stored_memory = db.get(Artifact, generated_memory.id)
    assert stored_draft is not None
    assert stored_draft.prompt_event_ids == []
    assert stored_draft.metadata_["artifact_stage"] == "discarded_source"
    assert stored_version is not None
    assert stored_version.prompt_event_ids == []
    assert stored_memory is not None
    assert stored_memory.summary == "Already generated memory"
    assert stored_memory.prompt_event_ids == [str(first_prompt_id)]
    stored_stats = db.get(ProjectStats, project.id)
    assert stored_stats is not None
    assert stored_stats.session_count == 1
    assert stored_stats.event_count == 2
    assert stored_stats.prompt_count == 1

    session_id = prompt_session.id
    delete_session_activity(
        db,
        project_id=project.id,
        session_id=session_id,
        user=owner,
    )
    db.expire_all()

    assert db.get(PromptSession, session_id) is None
    assert db.get(Event, second_prompt_id) is None
    assert db.get(Event, second_response_id) is None
    stored_memory = db.get(Artifact, generated_memory.id)
    assert stored_memory is not None
    assert stored_memory.session_id is None
    assert stored_memory.summary == "Already generated memory"
    stored_stats = db.get(ProjectStats, project.id)
    assert stored_stats is not None
    assert stored_stats.session_count == 0
    assert stored_stats.event_count == 0
    assert stored_stats.prompt_count == 0
