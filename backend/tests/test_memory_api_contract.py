from datetime import UTC, datetime
from uuid import uuid4

from app.api.memory import _serialize_project_memory_snapshot
from app.models.artifacts import Artifact
from app.services.memory.constants import (
    MEMORY_ARTIFACT_TYPE,
    PROJECT_MEMORY_ARTIFACT_TYPE,
    REVIEW_STATE_EDITED,
    REVIEW_STATE_GENERATED,
)
from app.services.memory.serializers import serialize_memory_artifact


def _artifact(*, artifact_type: str = MEMORY_ARTIFACT_TYPE) -> Artifact:
    now = datetime(2026, 7, 5, 12, 0, tzinfo=UTC)
    return Artifact(
        changed_files=[
            {"additions": 3, "deletions": 1, "path": "backend/app/api/memory.py"}
        ],
        commit_sha=None,
        created_at=now,
        event_id=uuid4(),
        generator="openai-memory-draft-v1",
        id=uuid4(),
        metadata_={
            "artifact_stage": "generated_memory",
            "draft_confidence": 0.82,
            "draft_details": {"tasks": ["Implemented generated memory flow."]},
            "draft_generator": "openai-memory-draft-v1",
            "draft_type": "work_log",
            "end_sequence": 8,
            "memory_scope": "generated",
            "review_state": REVIEW_STATE_GENERATED,
            "source_chunk_ids": ["chunk-1"],
            "start_sequence": 1,
            "summary_level": 2,
            "trigger_reason": "batch_organize",
        },
        model="gpt-5-mini",
        outcome="Generated memory was saved automatically.",
        prompt_event_ids=[str(uuid4())],
        project_id=uuid4(),
        reason="The user wanted memory to update without manual confirmation.",
        sections=[
            {"title": "Summary", "summary": "Auto-saved generated memory."},
            {"title": "Tasks", "summary": "Removed Draft Inbox review flow."},
        ],
        session_id=uuid4(),
        storage_key="memory/session/test/generated/8/batch_organize/1",
        summary="Auto-saved generated memory for the batch.",
        tags=["memory"],
        technologies=["FastAPI", "React"],
        title="Generated memory auto-save flow",
        type=artifact_type,
        updated_at=now,
    )


def test_generated_memory_serializer_matches_frontend_contract() -> None:
    serialized = serialize_memory_artifact(_artifact())

    assert isinstance(serialized["changed_file_count"], int)
    assert serialized["changed_file_count"] == 1
    assert serialized["artifact_stage"] == "generated_memory"
    assert serialized["memory_scope"] == "generated"
    assert serialized["review_state"] == "generated"
    assert serialized["summary_level"] == 2
    assert serialized["start_sequence"] == 1
    assert serialized["end_sequence"] == 8
    assert isinstance(serialized["sections"], list)
    assert isinstance(serialized["tags"], list)
    assert isinstance(serialized["technologies"], list)


def test_project_memory_snapshot_serializer_matches_frontend_contract() -> None:
    artifact = _artifact(artifact_type=PROJECT_MEMORY_ARTIFACT_TYPE)
    artifact.event_id = None
    artifact.session_id = None
    artifact.metadata_ = {
        "memory_scope": "project",
        "project_memory_snapshot": {
            "body_markdown": "# Project Memory\n\nUse generated memory.",
            "confidence": 0.77,
            "sections": {
                "core_workflow": ["Pending Work is organized into generated memory."],
                "current_direction": "Auto-save generated memory and compile Project Memory.",
                "important_decisions": [
                    {
                        "decision": "Remove mandatory user confirmation.",
                        "reason": "The user wanted a lower-friction memory flow.",
                        "source_memory_ids": ["memory-1"],
                    }
                ],
                "instructions_for_future_ai_agents": ["Read Project Memory first."],
                "open_questions": [],
                "product_goal": "Keep AI coding context current.",
                "rejected_directions": [],
                "technical_assumptions": ["Internal chunk summaries stay hidden."],
            },
            "snapshot_type": "project_memory",
            "source_memory_ids": ["memory-1"],
            "warnings": [],
        },
        "review_state": REVIEW_STATE_EDITED,
        "source_memory_ids": ["memory-1"],
        "user_edited": True,
    }

    serialized = _serialize_project_memory_snapshot(artifact)

    assert serialized is not None
    assert serialized["artifact"]["changed_file_count"] == 1
    assert serialized["artifact"]["memory_scope"] == "project"
    assert serialized["artifact"]["review_state"] == "edited"
    assert serialized["snapshot"]["body_markdown"].startswith("# Project Memory")
    assert serialized["snapshot"]["sections"]["current_direction"]
    assert serialized["snapshot"]["source_memory_ids"] == ["memory-1"]
