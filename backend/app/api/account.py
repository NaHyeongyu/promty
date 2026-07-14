from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.transactions import commit_or_conflict as _commit_or_conflict
from app.core.security import require_web_user
from app.db.session import get_db
from app.models.users import User
from app.schemas.account import (
    AccountOverviewResponse,
    AccountPreferencesResponse,
    AccountPreferencesUpdateRequest,
    CollectorTokenCreateRequest,
    CollectorTokenCreateResponse,
    CollectorTokenResponse,
    CollectorTokenUpdateRequest,
    GitHubConnectionResponse,
)
from app.services.account_settings import (
    account_overview_response,
    create_collector_token_response,
    disconnect_github_response,
    revoke_collector_token_response,
    update_collector_token_response,
    update_account_preferences_response,
)

router = APIRouter(prefix="/api/account", tags=["account"])


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
