from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.security import require_admin_user
from app.db.session import get_db
from app.models.users import User
from app.services.admin_dashboard import admin_overview_response

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/overview")
def read_admin_overview(
    _admin_user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return admin_overview_response(db)
