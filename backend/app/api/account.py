from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.api.transactions import commit_or_conflict as _commit_or_conflict
from app.core.config import settings
from app.core.security import is_admin_user, require_web_user
from app.db.session import get_db
from app.models.users import User
from app.schemas.account import (
    AccountDeletionRequest,
    AccountDeletionResponse,
    AccountOverviewResponse,
    AccountPolicyConsentRequest,
    AccountPolicyConsentsResponse,
    AccountPreferencesResponse,
    AccountPreferencesUpdateRequest,
    CollectorTokenCreateRequest,
    CollectorTokenCreateResponse,
    CollectorTokenResponse,
    CollectorTokenUpdateRequest,
    GitHubConnectionResponse,
)
from app.services.account_deletion import delete_user_account_data
from app.services.account_deletion_ledger import (
    record_account_deletion_tombstone,
    remove_account_deletion_tombstone,
)
from app.services.account_settings import (
    account_overview_response,
    create_collector_token_response,
    disconnect_github_response,
    revoke_collector_token_response,
    update_collector_token_response,
    update_account_preferences_response,
    update_policy_consents_response,
)

router = APIRouter(prefix="/api/account", tags=["account"])


def _clear_session_cookies(response: Response) -> None:
    response.delete_cookie(
        key=settings.session_cookie_name,
        path="/",
        secure=settings.session_cookie_secure,
        samesite=settings.session_cookie_samesite,
    )
    response.delete_cookie(
        key=settings.refresh_cookie_name,
        path="/api/auth",
        secure=settings.session_cookie_secure,
        samesite=settings.session_cookie_samesite,
    )


@router.delete("", response_model=AccountDeletionResponse)
def delete_current_account(
    payload: AccountDeletionRequest,
    response: Response,
    current_user: User = Depends(require_web_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    if is_admin_user(current_user):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The configured administrator account cannot delete itself.",
        )
    if payload.confirmation != current_user.username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Enter your exact username to confirm permanent account deletion.",
        )

    counts = delete_user_account_data(db, user=current_user)
    deleted_user_id = current_user.id
    if not record_account_deletion_tombstone(deleted_user_id):
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Account deletion could not be safely recorded. No database deletion was committed.",
        )
    try:
        _commit_or_conflict(db, detail="Account and owned data could not be deleted.")
    except Exception:
        remove_account_deletion_tombstone(deleted_user_id)
        raise
    _clear_session_cookies(response)
    return {"counts": counts, "status": "deleted"}


@router.patch("/preferences", response_model=AccountPreferencesResponse)
def update_account_preferences(
    payload: AccountPreferencesUpdateRequest,
    current_user: User = Depends(require_web_user),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    response = update_account_preferences_response(
        db,
        preferred_locale=payload.preferred_locale,
        user=current_user,
    )
    _commit_or_conflict(db, detail="Account preferences could not be updated.")
    return response


@router.put("/policy-consents", response_model=AccountPolicyConsentsResponse)
def update_policy_consents(
    payload: AccountPolicyConsentRequest,
    current_user: User = Depends(require_web_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    response = update_policy_consents_response(
        db,
        allow_external_ai=payload.allow_external_ai,
        user=current_user,
    )
    _commit_or_conflict(db, detail="Policy preferences could not be saved.")
    return response


@router.get("/overview", response_model=AccountOverviewResponse)
def read_account_overview(
    current_user: User = Depends(require_web_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    response = account_overview_response(db, user=current_user)
    db.commit()
    return response


@router.post("/collector-tokens", response_model=CollectorTokenCreateResponse)
def create_account_collector_token(
    payload: CollectorTokenCreateRequest,
    current_user: User = Depends(require_web_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    response = create_collector_token_response(
        db,
        name=payload.name,
        user=current_user,
    )
    _commit_or_conflict(db, detail="Collector token could not be created.")
    return response


@router.patch("/collector-tokens/{token_id}", response_model=CollectorTokenResponse)
def update_account_collector_token(
    token_id: UUID,
    payload: CollectorTokenUpdateRequest,
    current_user: User = Depends(require_web_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    response = update_collector_token_response(
        db,
        name=payload.name,
        token_id=token_id,
        user=current_user,
    )
    _commit_or_conflict(db, detail="Collector token could not be updated.")
    return response


@router.post("/collector-tokens/{token_id}/revoke", response_model=CollectorTokenResponse)
def revoke_account_collector_token(
    token_id: UUID,
    current_user: User = Depends(require_web_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    response = revoke_collector_token_response(
        db,
        token_id=token_id,
        user=current_user,
    )
    _commit_or_conflict(db, detail="Collector token could not be revoked.")
    return response


@router.post(
    "/github-connection/disconnect",
    response_model=GitHubConnectionResponse,
)
def disconnect_account_github_connection(
    current_user: User = Depends(require_web_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    response = disconnect_github_response(db, user=current_user)
    _commit_or_conflict(db, detail="GitHub connection could not be disconnected.")
    return response
    AccountDeletionRequest,
    AccountDeletionResponse,
