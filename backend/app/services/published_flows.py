from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import desc, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.time import utc_now
from app.models.published_flows import PublishedFlow
from app.models.users import User
from app.services.published_flow_access import (
    can_read_flow as _can_read_flow,
    flow_for_owner as _flow_for_owner,
    readable_flow_filter as _readable_flow_filter,
)
from app.services.published_flow_constants import (
    MAX_TITLE_LENGTH,
    VALID_FLOW_STATUSES,
    VALID_FLOW_VISIBILITIES,
)
from app.services.published_flow_creation import create_published_flow_record
from app.services.published_flow_redaction import (
    normalize_tags as _normalize_tags,
    optional_redacted_text as _optional_redacted_text,
    redact_text as _redact_text,
)
from app.services.published_flow_serializers import (
    serialize_flow_detail,
    serialize_flow_summary,
)


def _apply_flow_status(flow: PublishedFlow, status_value: str) -> None:
    if status_value not in VALID_FLOW_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid status",
        )

    flow.status = status_value
    if status_value == "published" and flow.published_at is None:
        flow.published_at = utc_now()
    if status_value == "draft":
        flow.published_at = None


def create_published_flow(
    db: Session,
    *,
    context_summary: str | None,
    current_user: User,
    end_prompt_event_id: UUID | None,
    notes: str | None,
    prompt_event_ids: list[UUID] | None,
    project_id: UUID,
    session_id: UUID | None,
    start_prompt_event_id: UUID | None,
    status_value: str,
    summary: str | None,
    tags: list[str],
    title: str | None,
    visibility: str,
) -> dict[str, Any]:
    flow = create_published_flow_record(
        db,
        context_summary=context_summary,
        current_user=current_user,
        end_prompt_event_id=end_prompt_event_id,
        notes=notes,
        prompt_event_ids=prompt_event_ids,
        project_id=project_id,
        session_id=session_id,
        start_prompt_event_id=start_prompt_event_id,
        status_value=status_value,
        summary=summary,
        tags=tags,
        title=title,
        visibility=visibility,
    )
    return get_published_flow(db, flow_key=str(flow.id), current_user=current_user)


def update_published_flow(
    db: Session,
    *,
    context_summary: str | None,
    current_user: User,
    fields: set[str],
    flow_key: str,
    included_file_ids: list[UUID] | None,
    included_item_ids: list[UUID] | None,
    notes: str | None,
    status_value: str | None,
    summary: str | None,
    tags: list[str] | None,
    title: str | None,
    visibility: str | None,
) -> dict[str, Any]:
    flow = _flow_for_owner(db, current_user=current_user, flow_key=flow_key)

    if "title" in fields:
        next_title = (title or "").strip()
        if not next_title:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Title is required",
            )
        flow.title = (_redact_text(next_title) or "Prompt flow")[:MAX_TITLE_LENGTH]
    if "summary" in fields:
        flow.summary = _optional_redacted_text(summary)
    if "context_summary" in fields:
        flow.context_summary = _optional_redacted_text(context_summary)
    if "notes" in fields:
        flow.notes = _optional_redacted_text(notes)
    if "tags" in fields:
        flow.tags = _normalize_tags(tags or [])
    if "included_item_ids" in fields:
        selected_item_ids = set(included_item_ids or [])
        known_item_ids = {item.id for item in flow.items}
        if not selected_item_ids.issubset(known_item_ids):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="One or more selected prompts do not belong to this flow",
            )
        for item in flow.items:
            item.is_included = item.id in selected_item_ids
    if "included_file_ids" in fields:
        selected_file_ids = set(included_file_ids or [])
        known_file_ids = {file.id for file in flow.files}
        if not selected_file_ids.issubset(known_file_ids):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="One or more selected files do not belong to this flow",
            )
        for file in flow.files:
            file.is_included = file.id in selected_file_ids
    if "visibility" in fields:
        if visibility not in VALID_FLOW_VISIBILITIES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Invalid visibility",
            )
        flow.visibility = visibility
    if "status" in fields:
        if status_value is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Invalid status",
            )
        _apply_flow_status(flow, status_value)

    flow.prompt_count = sum(1 for item in flow.items if item.is_included)
    flow.file_count = len({file.file_path for file in flow.files if file.is_included})
    if flow.status == "published" and flow.prompt_count < 1:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Select at least one prompt before publishing",
        )

    flow.updated_at = utc_now()
    db.flush()

    return get_published_flow(db, flow_key=str(flow.id), current_user=current_user)


def archive_published_flow(
    db: Session,
    *,
    current_user: User,
    flow_key: str,
) -> dict[str, Any]:
    flow = _flow_for_owner(db, current_user=current_user, flow_key=flow_key)
    _apply_flow_status(flow, "archived")
    flow.updated_at = utc_now()
    db.flush()
    return get_published_flow(db, flow_key=str(flow.id), current_user=current_user)


def list_published_flows(
    db: Session,
    *,
    current_user: User,
    limit: int = 50,
    query: str | None = None,
) -> list[dict[str, Any]]:
    statement = (
        select(PublishedFlow)
        .options(selectinload(PublishedFlow.author))
        .where(_readable_flow_filter(current_user))
        .order_by(desc(PublishedFlow.published_at), desc(PublishedFlow.created_at))
        .limit(limit)
    )
    if query:
        lowered = f"%{query.strip().lower()}%"
        statement = statement.where(
            or_(
                func.lower(PublishedFlow.title).like(lowered),
                func.lower(PublishedFlow.summary).like(lowered),
            )
        )

    return [
        serialize_flow_summary(flow, current_user=current_user)
        for flow in db.execute(statement).scalars()
    ]


def get_published_flow(
    db: Session,
    *,
    current_user: User,
    flow_key: str,
) -> dict[str, Any]:
    flow_id: UUID | None = None
    try:
        flow_id = UUID(flow_key)
    except ValueError:
        flow_id = None

    statement = select(PublishedFlow).options(
        selectinload(PublishedFlow.assets),
        selectinload(PublishedFlow.author),
        selectinload(PublishedFlow.files),
        selectinload(PublishedFlow.items),
    )
    if flow_id is not None:
        statement = statement.where(PublishedFlow.id == flow_id)
    else:
        statement = statement.where(PublishedFlow.slug == flow_key)

    flow = db.scalar(statement)
    if flow is None or not _can_read_flow(flow, current_user):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Published flow not found",
        )

    return serialize_flow_detail(flow, current_user=current_user)
