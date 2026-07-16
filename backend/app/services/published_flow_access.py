from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models.published_flows import PublishedFlow
from app.models.users import User


def readable_flow_filter(current_user: User):
    return or_(
        PublishedFlow.author_id == current_user.id,
        ((PublishedFlow.status == "published") & (PublishedFlow.visibility == "public")),
    )


def can_read_flow(flow: PublishedFlow, current_user: User) -> bool:
    if flow.author_id == current_user.id:
        return True
    return flow.status == "published" and flow.visibility in {"public", "unlisted"}


def flow_by_key(db: Session, flow_key: str) -> PublishedFlow | None:
    try:
        flow_id = UUID(flow_key)
    except ValueError:
        flow_id = None

    statement = select(PublishedFlow)
    if flow_id is not None:
        statement = statement.where(PublishedFlow.id == flow_id)
    else:
        statement = statement.where(PublishedFlow.slug == flow_key)
    return db.scalar(statement)


def flow_for_owner(db: Session, *, current_user: User, flow_key: str) -> PublishedFlow:
    flow = flow_by_key(db, flow_key)
    if flow is None or flow.author_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Published flow not found",
        )
    return flow
