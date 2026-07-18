from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from app.api.transactions import commit_or_conflict
from app.core.security import require_admin_user
from app.core.time import utc_now
from app.db.session import get_db
from app.models.users import User
from app.schemas.marketing import (
    MarketingContentCreateRequest,
    MarketingContentGenerateRequest,
    MarketingContentPageResponse,
    MarketingContentResponse,
    MarketingContentUpdateRequest,
    MarketingDeliveryRequest,
    MarketingDeliveryResponse,
    MarketingIntegrationsResponse,
)
from app.services.marketing_content import (
    approve_marketing_content,
    create_marketing_content,
    generate_marketing_content,
    list_marketing_content,
    marketing_content_response,
    read_marketing_content,
    update_marketing_content,
)
from app.services.marketing_publishers import (
    MarketingDeliveryError,
    deliver_marketing_content,
    marketing_integration_status,
)


router = APIRouter(prefix="/api/admin/marketing-content", tags=["admin-marketing"])


def _set_audit_action(
    request: Request,
    *,
    action: str,
    resource_id: UUID | str,
) -> None:
    request.state.admin_audit_action = action
    request.state.admin_audit_resource_id = str(resource_id)
    request.state.admin_audit_resource_type = "marketing_content"


@router.get("/integrations", response_model=MarketingIntegrationsResponse)
def read_marketing_integrations(
    _admin_user: User = Depends(require_admin_user),
) -> dict[str, Any]:
    return marketing_integration_status()


@router.get("", response_model=MarketingContentPageResponse)
def read_marketing_content_page(
    content_status: str | None = Query(
        default=None,
        alias="status",
        pattern="^(draft|review|approved|scheduled|published|failed)$",
    ),
    query: str | None = Query(default=None, max_length=255),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    _admin_user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return list_marketing_content(
        db,
        content_status=content_status,
        limit=limit,
        offset=offset,
        query=query,
    )


@router.post("", response_model=MarketingContentResponse, status_code=status.HTTP_201_CREATED)
def create_marketing_content_item(
    payload: MarketingContentCreateRequest,
    request: Request,
    admin_user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    item = create_marketing_content(db, creator=admin_user, payload=payload)
    _set_audit_action(request, action="admin.marketing_content.create", resource_id=item.id)
    commit_or_conflict(db, detail="Marketing content could not be created.")
    db.refresh(item)
    return marketing_content_response(item)


@router.get("/{content_id}", response_model=MarketingContentResponse)
def read_marketing_content_item(
    content_id: UUID,
    _admin_user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return marketing_content_response(read_marketing_content(db, content_id))


@router.patch("/{content_id}", response_model=MarketingContentResponse)
def update_marketing_content_item(
    content_id: UUID,
    payload: MarketingContentUpdateRequest,
    request: Request,
    _admin_user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    item = read_marketing_content(db, content_id)
    update_marketing_content(item, payload=payload)
    _set_audit_action(request, action="admin.marketing_content.update", resource_id=item.id)
    commit_or_conflict(db, detail="Marketing content could not be updated.")
    db.refresh(item)
    return marketing_content_response(item)


@router.post("/{content_id}/generate", response_model=MarketingContentResponse)
def generate_marketing_content_item(
    content_id: UUID,
    payload: MarketingContentGenerateRequest,
    request: Request,
    _admin_user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    item = read_marketing_content(db, content_id)
    _set_audit_action(request, action="admin.marketing_content.generate", resource_id=item.id)
    try:
        generate_marketing_content(item, provider=payload.provider)
    except Exception as exc:
        item.last_error = f"{type(exc).__name__}: {exc}"[:1000]
        item.status = "failed"
        item.updated_at = utc_now()
        commit_or_conflict(db, detail="Marketing generation failure could not be recorded.")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Bilingual content generation failed. Review the recorded error and retry.",
        ) from None
    commit_or_conflict(db, detail="Generated marketing content could not be saved.")
    db.refresh(item)
    return marketing_content_response(item)


@router.post("/{content_id}/approve", response_model=MarketingContentResponse)
def approve_marketing_content_item(
    content_id: UUID,
    request: Request,
    _admin_user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    item = read_marketing_content(db, content_id)
    approve_marketing_content(item)
    _set_audit_action(request, action="admin.marketing_content.approve", resource_id=item.id)
    commit_or_conflict(db, detail="Marketing content could not be approved.")
    db.refresh(item)
    return marketing_content_response(item)


@router.post("/{content_id}/deliver", response_model=MarketingDeliveryResponse)
def deliver_marketing_content_item(
    content_id: UUID,
    payload: MarketingDeliveryRequest,
    request: Request,
    _admin_user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    item = read_marketing_content(db, content_id)
    _set_audit_action(
        request,
        action=f"admin.marketing_content.deliver.{payload.mode}",
        resource_id=item.id,
    )
    try:
        result = deliver_marketing_content(item, delivery=payload)
    except MarketingDeliveryError as exc:
        item.last_error = str(exc)[:1000]
        item.updated_at = utc_now()
        commit_or_conflict(db, detail="Marketing delivery failure could not be recorded.")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from None
    commit_or_conflict(db, detail="Marketing delivery result could not be saved.")
    return result
