from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.models.artifacts import Artifact
from app.schemas.project_responses import PublicMemoryArtifactResponse
from app.services.projects.public import (
    _safe_public_url,
    _serialize_public_memory_artifact,
)


def test_safe_public_url_removes_query_secrets_and_fragments() -> None:
    assert (
        _safe_public_url("https://example.test/project?access_token=secret#private")
        == "https://example.test/project"
    )
    assert _safe_public_url("https://user:secret@example.test/project") is None
    assert _safe_public_url("javascript:alert(1)") is None


def test_public_memory_serializer_omits_internal_identifiers_and_paths() -> None:
    now = datetime.now(UTC)
    artifact = Artifact(
        changed_files=[{"path": "/Users/example/private.py", "status": "modified"}],
        commit_sha="secret-commit-sha",
        created_at=now,
        generator="openai",
        id=uuid4(),
        metadata_={
            "artifact_stage": "verified_memory",
            "memory_batch_id": str(uuid4()),
            "memory_scope": "verified",
            "review_state": "verified",
            "source_session_ids": [str(uuid4())],
        },
        model="gpt-5",
        outcome="Shipped",
        project_id=uuid4(),
        prompt_event_ids=[str(uuid4())],
        reason="Useful context",
        schema_version=1,
        sections=[{"title": "Decision", "summary": "Use the safe path."}],
        session_id=uuid4(),
        storage_key="memory/security-test",
        summary="Approved summary",
        tags=["security"],
        technologies=["FastAPI"],
        title="Approved memory",
        type="MemoryTask",
        updated_at=now,
    )

    serialized = _serialize_public_memory_artifact(artifact)
    validated = PublicMemoryArtifactResponse.model_validate(serialized)

    assert validated.review_state == "verified"
    assert set(serialized).isdisjoint(
        {
            "changed_files",
            "commit_sha",
            "memory_batch_id",
            "prompt_event_ids",
            "session_id",
            "source_session_ids",
        }
    )
    assert "private.py" not in str(serialized)
    assert "secret-commit-sha" not in str(serialized)


def test_public_memory_contract_rejects_unreviewed_content() -> None:
    payload = {
        "artifact_stage": "generated_memory",
        "changed_file_count": 0,
        "created_at": None,
        "first_event_at": None,
        "generator": "openai",
        "id": str(uuid4()),
        "last_event_at": None,
        "memory_scope": "generated",
        "model": "gpt-5",
        "outcome": None,
        "prompt_count": None,
        "reason": None,
        "review_state": "generated",
        "sections": [],
        "summary": "Not reviewed",
        "tags": [],
        "technologies": [],
        "title": "Generated",
        "type": "MemoryTask",
        "updated_at": None,
        "why_it_matters": None,
    }

    with pytest.raises(ValidationError, match="review_state"):
        PublicMemoryArtifactResponse.model_validate(payload)
