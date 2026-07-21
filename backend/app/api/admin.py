from __future__ import annotations

import json
from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy.orm import Session

from app.api.transactions import commit_or_conflict as _commit_or_conflict
from app.core.security import require_admin_user
from app.db.session import get_db
from app.models.users import User
from app.schemas.admin import (
    AdminAlertStateRequest,
    AdminCollectorTokenCreateRequest,
    AdminConfirmationRequest,
    AdminEventExportRequest,
    AdminProjectCreateRequest,
    AdminProjectExportRequest,
    AdminProjectUpdateRequest,
    AdminSupportInquiryStatusRequest,
    AdminUserSuspendRequest,
)
from app.schemas.account import CollectorTokenCreateResponse, CollectorTokenResponse
from app.schemas.admin_responses import (
    AdminAlertStateResponse,
    AdminAuditLogResponse,
    AdminCancelJobResponse,
    AdminDeleteProjectResponse,
    AdminDeleteUserResponse,
    AdminDisconnectGithubResponse,
    AdminEventPageResponse,
    AdminJobResponse,
    AdminOverviewResponse,
    AdminPageResponse,
    AdminProjectMutationResponse,
    AdminProjectResponse,
    AdminRestoreUserResponse,
    AdminRetryJobResponse,
    AdminRiskAcknowledgementResponse,
    AdminRevokeAllTokensResponse,
    AdminSuspendUserResponse,
    AdminSystemResponse,
    AdminSupportInquiryResponse,
    AdminUserResponse,
)
from app.services.admin.control_center import (
    admin_audit_logs_response,
    admin_projects_response,
    admin_support_inquiries_response,
    admin_users_response,
    disconnect_admin_github_response,
    revoke_admin_collector_token_response,
    revoke_all_admin_collector_tokens_response,
    update_admin_support_inquiry_status,
)
from app.services.admin.dashboard import (
    OPERATIONAL_RISK_KEYS,
    admin_overview_response,
    set_admin_alert_state,
)
from app.services.admin.operations import (
    admin_events_response,
    admin_memory_jobs_response,
    admin_system_response,
    cancel_admin_memory_job_response,
    create_admin_collector_token_response,
    create_admin_project_response,
    delete_admin_project_response,
    delete_admin_user_response,
    export_admin_events_response,
    export_admin_project_response,
    restore_admin_user_response,
    retry_admin_memory_job_response,
    suspend_admin_user_response,
    update_admin_project_response,
)
from app.services.account_deletion_ledger import (
    record_account_deletion_tombstone,
    remove_account_deletion_tombstone,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/overview", response_model=AdminOverviewResponse)
def read_admin_overview(
    admin_user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return admin_overview_response(db, admin_user_id=admin_user.id)


@router.put(
    "/alerts/{alert_key}/state",
    response_model=AdminAlertStateResponse,
)
def update_admin_alert_state(
    alert_key: str,
    payload: AdminAlertStateRequest,
    request: Request,
    admin_user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    _set_audit_action(
        request,
        action=f"admin.alert.{payload.state}",
        resource_id=alert_key,
        resource_type="admin_alert",
    )
    try:
        response = set_admin_alert_state(
            db,
            admin_user_id=admin_user.id,
            alert_key=alert_key,
            condition_hash=payload.condition_hash,
            status=payload.state,
            snooze_hours=payload.snooze_hours,
        )
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error
    _commit_or_conflict(db, detail="Administrator alert state could not be saved.")
    return response


@router.get("/users", response_model=AdminPageResponse[AdminUserResponse])
def read_admin_users(
    query: str | None = Query(default=None, max_length=255),
    limit: int = Query(default=100, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _admin_user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return admin_users_response(db, limit=limit, offset=offset, query=query)


@router.get("/projects", response_model=AdminPageResponse[AdminProjectResponse])
def read_admin_projects(
    query: str | None = Query(default=None, max_length=255),
    sort: Literal["popularity", "recent", "saves", "views", "views_7d"] = Query(
        default="recent"
    ),
    visibility: Literal["all", "private", "public"] = Query(default="all"),
    limit: int = Query(default=100, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _admin_user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return admin_projects_response(
        db,
        limit=limit,
        offset=offset,
        query=query,
        sort=sort,
        visibility=None if visibility == "all" else visibility,
    )


@router.get(
    "/support-inquiries",
    response_model=AdminPageResponse[AdminSupportInquiryResponse],
)
def read_admin_support_inquiries(
    inquiry_status: str | None = Query(
        default=None,
        alias="status",
        pattern="^(new|in_progress|resolved)$",
    ),
    limit: int = Query(default=100, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _admin_user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return admin_support_inquiries_response(
        db,
        inquiry_status=inquiry_status,
        limit=limit,
        offset=offset,
    )


@router.patch(
    "/support-inquiries/{inquiry_id}",
    response_model=AdminSupportInquiryResponse,
)
def update_admin_support_inquiry(
    inquiry_id: UUID,
    payload: AdminSupportInquiryStatusRequest,
    request: Request,
    _admin_user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    _set_audit_action(
        request,
        action="admin.support_inquiry.update",
        resource_id=inquiry_id,
        resource_type="support_inquiry",
    )
    response = update_admin_support_inquiry_status(
        db,
        inquiry_id=inquiry_id,
        status=payload.status,
    )
    if response is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inquiry not found")
    _commit_or_conflict(db, detail="Support inquiry could not be updated.")
    return response


@router.get("/jobs", response_model=AdminPageResponse[AdminJobResponse])
def read_admin_jobs(
    status: str | None = Query(
        default=None,
        pattern="^(pending|running|succeeded|failed|superseded|stale)$",
    ),
    query: str | None = Query(default=None, max_length=255),
    limit: int = Query(default=100, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _admin_user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return admin_memory_jobs_response(
        db,
        job_status=status,
        limit=limit,
        offset=offset,
        query=query,
    )


@router.get("/audit-logs", response_model=AdminPageResponse[AdminAuditLogResponse])
def read_admin_audit_logs(
    action: str | None = Query(default=None, max_length=128),
    outcome: str | None = Query(default=None, pattern="^(success|error)$"),
    query: str | None = Query(default=None, max_length=255),
    resource_type: str | None = Query(default=None, max_length=64),
    limit: int = Query(default=100, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _admin_user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return admin_audit_logs_response(
        db,
        action=action,
        limit=limit,
        offset=offset,
        outcome=outcome,
        query=query,
        resource_type=resource_type,
    )


def _set_audit_action(
    request: Request,
    *,
    action: str,
    resource_id: UUID | str,
    resource_type: str,
) -> None:
    request.state.admin_audit_action = action
    request.state.admin_audit_resource_id = str(resource_id)
    request.state.admin_audit_resource_type = resource_type


def _risk_acknowledgement_response(
    *,
    acknowledged: bool,
    admin_user: User,
    confirmation: str,
    request: Request,
    risk_key: str,
) -> dict[str, Any]:
    if risk_key not in OPERATIONAL_RISK_KEYS:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Risk not found")
    if confirmation != admin_user.username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f'Type "{admin_user.username}" to confirm this administrator action.',
        )
    _set_audit_action(
        request,
        action="admin.risk.acknowledge" if acknowledged else "admin.risk.clear_acknowledgement",
        resource_id=risk_key,
        resource_type="risk",
    )
    return {"acknowledged": acknowledged, "key": risk_key}


@router.post(
    "/risks/{risk_key}/acknowledge",
    response_model=AdminRiskAcknowledgementResponse,
)
def acknowledge_admin_risk(
    risk_key: str,
    payload: AdminConfirmationRequest,
    request: Request,
    admin_user: User = Depends(require_admin_user),
) -> dict[str, Any]:
    return _risk_acknowledgement_response(
        acknowledged=True,
        admin_user=admin_user,
        confirmation=payload.confirmation,
        request=request,
        risk_key=risk_key,
    )


@router.post(
    "/risks/{risk_key}/clear-acknowledgement",
    response_model=AdminRiskAcknowledgementResponse,
)
def clear_admin_risk_acknowledgement(
    risk_key: str,
    payload: AdminConfirmationRequest,
    request: Request,
    admin_user: User = Depends(require_admin_user),
) -> dict[str, Any]:
    return _risk_acknowledgement_response(
        acknowledged=False,
        admin_user=admin_user,
        confirmation=payload.confirmation,
        request=request,
        risk_key=risk_key,
    )


@router.get("/events", response_model=AdminEventPageResponse)
def read_admin_events(
    event_type: str | None = Query(default=None, max_length=64),
    project_id: UUID | None = Query(default=None),
    user_id: UUID | None = Query(default=None),
    query: str | None = Query(default=None, max_length=200),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    _admin_user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return admin_events_response(
        db,
        event_type=event_type,
        limit=limit,
        offset=offset,
        project_id=project_id,
        query=query,
        user_id=user_id,
    )


@router.get("/system", response_model=AdminSystemResponse)
def read_admin_system(
    _admin_user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return admin_system_response(db)


@router.post("/users/{user_id}/suspend", response_model=AdminSuspendUserResponse)
def suspend_admin_user(
    user_id: UUID,
    payload: AdminUserSuspendRequest,
    request: Request,
    admin_user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    _set_audit_action(
        request,
        action="admin.user.suspend",
        resource_id=user_id,
        resource_type="user",
    )
    response = suspend_admin_user_response(
        db,
        actor=admin_user,
        confirmation=payload.confirmation,
        reason=payload.reason,
        user_id=user_id,
    )
    _commit_or_conflict(db, detail="User could not be suspended.")
    return response


@router.post("/users/{user_id}/restore", response_model=AdminRestoreUserResponse)
def restore_admin_user(
    user_id: UUID,
    payload: AdminConfirmationRequest,
    request: Request,
    admin_user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    _set_audit_action(
        request,
        action="admin.user.restore",
        resource_id=user_id,
        resource_type="user",
    )
    response = restore_admin_user_response(
        db,
        actor=admin_user,
        confirmation=payload.confirmation,
        user_id=user_id,
    )
    _commit_or_conflict(db, detail="User could not be restored.")
    return response


@router.delete("/users/{user_id}", response_model=AdminDeleteUserResponse)
def delete_admin_user(
    user_id: UUID,
    payload: AdminConfirmationRequest,
    request: Request,
    admin_user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    _set_audit_action(
        request,
        action="admin.user.delete",
        resource_id=user_id,
        resource_type="user",
    )
    response = delete_admin_user_response(
        db,
        actor=admin_user,
        confirmation=payload.confirmation,
        user_id=user_id,
    )
    if not record_account_deletion_tombstone(user_id):
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="User deletion could not be safely recorded. No database deletion was committed.",
        )
    try:
        _commit_or_conflict(db, detail="User and owned data could not be deleted.")
    except Exception:
        remove_account_deletion_tombstone(user_id)
        raise
    return response


@router.post(
    "/users/{user_id}/collector-tokens",
    response_model=CollectorTokenCreateResponse,
)
def create_admin_collector_token(
    user_id: UUID,
    payload: AdminCollectorTokenCreateRequest,
    request: Request,
    _admin_user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    _set_audit_action(
        request,
        action="admin.user.collector_token.create",
        resource_id=user_id,
        resource_type="user",
    )
    response = create_admin_collector_token_response(
        db,
        confirmation=payload.confirmation,
        name=payload.name,
        user_id=user_id,
    )
    _commit_or_conflict(db, detail="Collector token could not be created.")
    return response


@router.post("/projects", response_model=AdminProjectMutationResponse)
def create_admin_project(
    payload: AdminProjectCreateRequest,
    request: Request,
    _admin_user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    _set_audit_action(
        request,
        action="admin.project.create",
        resource_id=payload.owner_id,
        resource_type="user",
    )
    response = create_admin_project_response(
        db,
        confirmation=payload.confirmation,
        default_branch=payload.default_branch,
        description=payload.description,
        github_url=payload.github_url,
        name=payload.name,
        owner_id=payload.owner_id,
        project_url=payload.project_url,
        requested_slug=payload.slug,
        tags=payload.tags,
        visibility=payload.visibility,
    )
    _commit_or_conflict(db, detail="Project could not be created.")
    return response


@router.patch("/projects/{project_id}", response_model=AdminProjectMutationResponse)
def update_admin_project(
    project_id: UUID,
    payload: AdminProjectUpdateRequest,
    request: Request,
    _admin_user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    _set_audit_action(
        request,
        action="admin.project.update",
        resource_id=project_id,
        resource_type="project",
    )
    fields = payload.model_dump(exclude={"confirmation"}, exclude_unset=True)
    response = update_admin_project_response(
        db,
        confirmation=payload.confirmation,
        fields=fields,
        project_id=project_id,
    )
    _commit_or_conflict(db, detail="Project could not be updated.")
    return response


@router.delete("/projects/{project_id}", response_model=AdminDeleteProjectResponse)
def delete_admin_project(
    project_id: UUID,
    payload: AdminConfirmationRequest,
    request: Request,
    _admin_user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    _set_audit_action(
        request,
        action="admin.project.delete",
        resource_id=project_id,
        resource_type="project",
    )
    response = delete_admin_project_response(
        db,
        confirmation=payload.confirmation,
        project_id=project_id,
    )
    _commit_or_conflict(db, detail="Project and related data could not be deleted.")
    return response


@router.post("/jobs/{batch_id}/cancel", response_model=AdminCancelJobResponse)
def cancel_admin_memory_job(
    batch_id: UUID,
    payload: AdminConfirmationRequest,
    request: Request,
    _admin_user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    _set_audit_action(
        request,
        action="admin.memory_job.cancel",
        resource_id=batch_id,
        resource_type="memory_job",
    )
    response = cancel_admin_memory_job_response(
        db,
        batch_id=batch_id,
        confirmation=payload.confirmation,
    )
    _commit_or_conflict(db, detail="Memory job could not be cancelled.")
    return response


@router.post("/jobs/{batch_id}/retry", response_model=AdminRetryJobResponse)
def retry_admin_memory_job(
    batch_id: UUID,
    payload: AdminConfirmationRequest,
    request: Request,
    _admin_user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    _set_audit_action(
        request,
        action="admin.memory_job.retry",
        resource_id=batch_id,
        resource_type="memory_job",
    )
    response = retry_admin_memory_job_response(
        db,
        batch_id=batch_id,
        confirmation=payload.confirmation,
    )
    _commit_or_conflict(db, detail="Memory job could not be retried.")
    return response


def _json_download(payload: dict[str, Any], filename: str) -> Response:
    return Response(
        content=json.dumps(payload, ensure_ascii=False, default=str, indent=2),
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        media_type="application/json",
    )


@router.post("/exports/events")
def export_admin_events(
    payload: AdminEventExportRequest,
    request: Request,
    admin_user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> Response:
    _set_audit_action(
        request,
        action="admin.events.export",
        resource_id="events",
        resource_type="event_export",
    )
    if payload.confirmation != admin_user.username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f'Type "{admin_user.username}" to confirm this export.',
        )
    export = export_admin_events_response(
        db,
        event_type=payload.event_type,
        project_id=payload.project_id,
        query=payload.query,
        user_id=payload.user_id,
    )
    return _json_download(export, "promty-events-export.json")


@router.post("/exports/projects/{project_id}")
def export_admin_project(
    project_id: UUID,
    payload: AdminProjectExportRequest,
    request: Request,
    _admin_user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> Response:
    _set_audit_action(
        request,
        action="admin.project.export",
        resource_id=project_id,
        resource_type="project",
    )
    export = export_admin_project_response(
        db,
        confirmation=payload.confirmation,
        include_payloads=payload.include_payloads,
        project_id=project_id,
    )
    return _json_download(export, f"promty-project-{project_id}.json")


@router.post(
    "/users/{user_id}/collector-tokens/{token_id}/revoke",
    response_model=CollectorTokenResponse,
)
def revoke_admin_collector_token(
    user_id: UUID,
    token_id: UUID,
    payload: AdminConfirmationRequest,
    request: Request,
    _admin_user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    _set_audit_action(
        request,
        action="admin.user.collector_token.revoke",
        resource_id=user_id,
        resource_type="user",
    )
    response = revoke_admin_collector_token_response(
        db,
        confirmation=payload.confirmation,
        token_id=token_id,
        user_id=user_id,
    )
    _commit_or_conflict(db, detail="Collector token could not be revoked.")
    return response


@router.post(
    "/users/{user_id}/collector-tokens/revoke-all",
    response_model=AdminRevokeAllTokensResponse,
)
def revoke_all_admin_collector_tokens(
    user_id: UUID,
    payload: AdminConfirmationRequest,
    request: Request,
    _admin_user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    _set_audit_action(
        request,
        action="admin.user.collector_tokens.revoke_all",
        resource_id=user_id,
        resource_type="user",
    )
    response = revoke_all_admin_collector_tokens_response(
        db,
        confirmation=payload.confirmation,
        user_id=user_id,
    )
    _commit_or_conflict(db, detail="Collector tokens could not be revoked.")
    return response


@router.post(
    "/users/{user_id}/github-connection/disconnect",
    response_model=AdminDisconnectGithubResponse,
)
def disconnect_admin_github_connection(
    user_id: UUID,
    payload: AdminConfirmationRequest,
    request: Request,
    _admin_user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    _set_audit_action(
        request,
        action="admin.user.github.disconnect",
        resource_id=user_id,
        resource_type="user",
    )
    response = disconnect_admin_github_response(
        db,
        confirmation=payload.confirmation,
        user_id=user_id,
    )
    _commit_or_conflict(db, detail="GitHub connection could not be disconnected.")
    return response
