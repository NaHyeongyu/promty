from __future__ import annotations

from datetime import UTC, datetime, timedelta
import os
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.encryption import ENCRYPTED_TEXT_PREFIX
from app.db.session import SessionLocal
from app.models.events import Event
from app.models.projects import Project
from app.models.published_flows import PublishedFlowFile, PublishedFlowItem
from app.models.sessions import Session as PromptSession
from app.models.users import User
from app.schemas.published_flows import PublishedFlowDetailResponse
from app.services.published_flows import (
    create_published_flow,
    get_published_flow,
    list_published_flow_details_for_project,
    list_published_flows,
    update_published_flow,
)

pytestmark = pytest.mark.skipif(
    os.environ.get("PROMPTHUB_RUN_POSTGRES_TESTS") != "1",
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


def test_community_visibility_content_selection_and_private_storage(db: Session) -> None:
    marker = str(uuid4())
    now = datetime.now(UTC)
    owner = User(
        email=f"flow-owner-{marker}@example.com",
        github_id=f"flow-owner-{marker}",
        username=f"flow-owner-{marker}",
    )
    viewer = User(
        email=f"flow-viewer-{marker}@example.com",
        github_id=f"flow-viewer-{marker}",
        username=f"flow-viewer-{marker}",
    )
    project = Project(
        name="Community security test",
        owner=owner,
        slug=f"community-security-{marker}",
        visibility="private",
    )
    prompt_session = PromptSession(
        model="gpt-5",
        project=project,
        started_at=now,
        tool="codex-cli",
    )
    db.add_all((owner, viewer, project, prompt_session))
    db.flush()

    first_prompt_id = uuid4()
    second_prompt_id = uuid4()
    event_rows = (
        (
            first_prompt_id,
            "PromptSubmitted",
            {"prompt": "Use token=ghp_abcdefghijklmnopqrstuvwxyz123456"},
        ),
        (
            uuid4(),
            "ResponseReceived",
            {
                "prompt_event_id": str(first_prompt_id),
                "response": "Authorization: Bearer secret-response-token",
            },
        ),
        (
            uuid4(),
            "FilesChanged",
            {
                "prompt_event_id": str(first_prompt_id),
                "changes": [
                    {
                        "path": "/Users/alice/private/app.py",
                        "status": "modified",
                        "additions": 2,
                        "deletions": 1,
                        "patch": "+AWS_ACCESS_KEY_ID=AKIAABCDEFGHIJKLMNOP",
                    }
                ],
            },
        ),
        (second_prompt_id, "PromptSubmitted", {"prompt": "Add the safe community view"}),
        (
            uuid4(),
            "ResponseReceived",
            {"prompt_event_id": str(second_prompt_id), "response": "Implemented the safe view."},
        ),
    )
    for index, (event_id, event_type, payload) in enumerate(event_rows, start=1):
        db.add(
            Event(
                id=event_id,
                created_at=now + timedelta(seconds=index),
                event_type=event_type,
                payload=payload,
                project_id=project.id,
                schema_version=1,
                sequence=index,
                session_id=prompt_session.id,
                tool="codex-cli",
            )
        )
    db.flush()

    draft = create_published_flow(
        db,
        context_summary=None,
        current_user=owner,
        end_prompt_event_id=None,
        notes=None,
        prompt_event_ids=[first_prompt_id, second_prompt_id],
        project_id=project.id,
        session_id=None,
        start_prompt_event_id=None,
        status_value="draft",
        summary="A reviewed workflow",
        tags=["security"],
        title=None,
        visibility="private",
    )
    PublishedFlowDetailResponse.model_validate(draft)
    assert draft["status"] == "draft"
    assert draft["visibility"] == "private"
    assert len(list_published_flows(db, current_user=owner)) == 1
    assert list_published_flows(db, current_user=viewer) == []
    with pytest.raises(HTTPException) as private_error:
        get_published_flow(db, current_user=viewer, flow_key=draft["slug"])
    assert private_error.value.status_code == 404

    stored_items = list(
        db.scalars(
            select(PublishedFlowItem)
            .where(PublishedFlowItem.published_flow_id == draft["id"])
            .order_by(PublishedFlowItem.item_order)
        )
    )
    stored_file = db.scalar(
        select(PublishedFlowFile).where(PublishedFlowFile.published_flow_id == draft["id"])
    )
    assert all(item.prompt_text.startswith(ENCRYPTED_TEXT_PREFIX) for item in stored_items)
    assert stored_items[0].response_text is not None
    assert stored_items[0].response_text.startswith(ENCRYPTED_TEXT_PREFIX)
    assert stored_file is not None and stored_file.diff is not None
    assert stored_file.diff.startswith(ENCRYPTED_TEXT_PREFIX)
    assert "/Users/alice" not in stored_file.file_path

    published = update_published_flow(
        db,
        context_summary=None,
        current_user=owner,
        fields={"included_file_ids", "included_item_ids", "status", "visibility"},
        flow_key=draft["slug"],
        included_file_ids=[],
        included_item_ids=[stored_items[1].id],
        notes=None,
        status_value="published",
        summary=None,
        tags=None,
        title=None,
        visibility="public",
    )
    assert published["prompt_count"] == 1
    assert published["file_count"] == 0

    public_list = list_published_flows(db, current_user=viewer)
    assert [flow["slug"] for flow in public_list] == [draft["slug"]]
    assert [flow["slug"] for flow in list_published_flows(
        db,
        current_user=viewer,
        project_id=project.id,
    )] == [draft["slug"]]
    assert list_published_flows(
        db,
        current_user=viewer,
        project_id=uuid4(),
    ) == []
    project_flow_details = list_published_flow_details_for_project(
        db,
        current_user=viewer,
        project_id=project.id,
    )
    assert [flow["slug"] for flow in project_flow_details] == [draft["slug"]]
    assert [item["prompt_text"] for item in project_flow_details[0]["items"]] == [
        "Add the safe community view"
    ]
    public_detail = get_published_flow(
        db,
        current_user=viewer,
        flow_key=draft["slug"],
    )
    PublishedFlowDetailResponse.model_validate(public_detail)
    assert [item["prompt_text"] for item in public_detail["items"]] == [
        "Add the safe community view"
    ]
    assert public_detail["files"] == []
    assert public_detail["source_project_id"] is None
    assert public_detail["items"][0]["source_event_id"] is None

    update_published_flow(
        db,
        context_summary=None,
        current_user=owner,
        fields={"visibility"},
        flow_key=draft["slug"],
        included_file_ids=None,
        included_item_ids=None,
        notes=None,
        status_value=None,
        summary=None,
        tags=None,
        title=None,
        visibility="unlisted",
    )
    assert list_published_flows(db, current_user=viewer) == []
    assert (
        get_published_flow(db, current_user=viewer, flow_key=draft["slug"])["slug"] == draft["slug"]
    )

    with pytest.raises(HTTPException) as owner_error:
        update_published_flow(
            db,
            context_summary=None,
            current_user=viewer,
            fields={"title"},
            flow_key=draft["slug"],
            included_file_ids=None,
            included_item_ids=None,
            notes=None,
            status_value=None,
            summary=None,
            tags=None,
            title="Hijacked",
            visibility=None,
        )
    assert owner_error.value.status_code == 404
