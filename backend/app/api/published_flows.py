from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import require_web_user
from app.db.session import get_db
from app.models.users import User
from app.services.published_flow_assets import (
    create_published_flow_asset,
    get_published_flow_asset,
)
from app.services.published_flows import (
    archive_published_flow,
    create_published_flow,
    get_published_flow,
    list_published_flows,
    update_published_flow,
)

router = APIRouter(prefix="/api/published-flows", tags=["published-flows"])


def _commit_or_conflict(db: Session, *, detail: str) -> None:
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=detail,
        ) from exc


class PublishedFlowCreateRequest(BaseModel):
    context_summary: str | None = Field(default=None, max_length=4000)
    end_prompt_event_id: UUID | None = None
    notes: str | None = Field(default=None, max_length=20000)
    prompt_event_ids: list[UUID] | None = None
    project_id: UUID
    session_id: UUID | None = None
    start_prompt_event_id: UUID | None = None
    status: str = Field(default="published")
    summary: str | None = Field(default=None, max_length=2000)
    tags: list[str] = Field(default_factory=list)
    title: str | None = Field(default=None, max_length=255)
    visibility: str = Field(default="public")

    @field_validator(
        "context_summary",
        "notes",
        "status",
        "summary",
        "title",
        "visibility",
        mode="before",
    )
    @classmethod
    def strip_string(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value

    @field_validator("tags", mode="before")
    @classmethod
    def normalize_tags_input(cls, value: Any) -> list[str]:
        if value is None:
            return []
        if isinstance(value, str):
            return [item for item in value.split(",") if item.strip()]
        if isinstance(value, list):
            return [item for item in value if isinstance(item, str)]
        return []

    model_config = ConfigDict(extra="forbid")


class PublishedFlowUpdateRequest(BaseModel):
    context_summary: str | None = Field(default=None, max_length=4000)
    notes: str | None = Field(default=None, max_length=20000)
    status: str | None = None
    summary: str | None = Field(default=None, max_length=2000)
    tags: list[str] | None = None
    title: str | None = Field(default=None, max_length=255)
    visibility: str | None = None

    @field_validator(
        "context_summary",
        "notes",
        "status",
        "summary",
        "title",
        "visibility",
        mode="before",
    )
    @classmethod
    def strip_string(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value

    @field_validator("tags", mode="before")
    @classmethod
    def normalize_tags_input(cls, value: Any) -> list[str] | None:
        if value is None:
            return None
        if isinstance(value, str):
            return [item for item in value.split(",") if item.strip()]
        if isinstance(value, list):
            return [item for item in value if isinstance(item, str)]
        return []

    model_config = ConfigDict(extra="forbid")


@router.get("")
def read_published_flows(
    limit: int = Query(default=50, ge=1, le=100),
    q: str | None = Query(default=None, max_length=120),
    current_user: User = Depends(require_web_user),
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    return list_published_flows(db, current_user=current_user, limit=limit, query=q)


@router.post("")
def publish_flow(
    payload: PublishedFlowCreateRequest,
    current_user: User = Depends(require_web_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    response = create_published_flow(
        db,
        context_summary=payload.context_summary,
        current_user=current_user,
        end_prompt_event_id=payload.end_prompt_event_id,
        notes=payload.notes,
        prompt_event_ids=payload.prompt_event_ids,
        project_id=payload.project_id,
        session_id=payload.session_id,
        start_prompt_event_id=payload.start_prompt_event_id,
        status_value=payload.status,
        summary=payload.summary,
        tags=payload.tags,
        title=payload.title,
        visibility=payload.visibility,
    )
    _commit_or_conflict(
        db,
        detail="Published flow could not be created because it conflicts with existing data.",
    )
    return response


@router.get("/{flow_key}")
def read_published_flow(
    flow_key: str,
    current_user: User = Depends(require_web_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return get_published_flow(db, current_user=current_user, flow_key=flow_key)


@router.patch("/{flow_key}")
def update_flow(
    flow_key: str,
    payload: PublishedFlowUpdateRequest,
    current_user: User = Depends(require_web_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    response = update_published_flow(
        db,
        context_summary=payload.context_summary,
        current_user=current_user,
        fields=payload.model_fields_set,
        flow_key=flow_key,
        notes=payload.notes,
        status_value=payload.status,
        summary=payload.summary,
        tags=payload.tags,
        title=payload.title,
        visibility=payload.visibility,
    )
    _commit_or_conflict(
        db,
        detail="Published flow could not be updated because it conflicts with existing data.",
    )
    return response


@router.post("/{flow_key}/archive")
def archive_flow(
    flow_key: str,
    current_user: User = Depends(require_web_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    response = archive_published_flow(db, current_user=current_user, flow_key=flow_key)
    _commit_or_conflict(
        db,
        detail="Published flow could not be archived because it conflicts with existing data.",
    )
    return response


@router.post("/{flow_key}/assets")
async def upload_flow_asset(
    flow_key: str,
    alt_text: str | None = Form(default=None, max_length=255),
    file: UploadFile = File(...),
    current_user: User = Depends(require_web_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    max_bytes = max(settings.published_flow_asset_max_bytes, 1)
    content = await file.read(max_bytes + 1)
    return create_published_flow_asset(
        db,
        alt_text=alt_text,
        content=content,
        content_type=file.content_type,
        current_user=current_user,
        file_name=file.filename,
        flow_key=flow_key,
    )


@router.get("/{flow_key}/assets/{asset_id}")
def read_flow_asset(
    flow_key: str,
    asset_id: UUID,
    current_user: User = Depends(require_web_user),
    db: Session = Depends(get_db),
) -> FileResponse:
    asset, path = get_published_flow_asset(
        db,
        asset_id=asset_id,
        current_user=current_user,
        flow_key=flow_key,
    )
    return FileResponse(
        path,
        filename=asset.file_name,
        headers={
            "Cache-Control": "private, max-age=3600",
            "X-Content-Type-Options": "nosniff",
        },
        media_type=asset.content_type,
    )
