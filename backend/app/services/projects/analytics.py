from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.models.projects import Project
from app.models.public_project_views import PublicProjectView
from app.models.users import User


PUBLIC_VIEW_DEDUPE_WINDOW = timedelta(minutes=30)
PUBLIC_VIEW_HISTORY_DAYS = 14


def public_project_view_analytics(
    db: Session,
    *,
    project_id: UUID,
    now: datetime | None = None,
) -> dict[str, Any]:
    current_time = now or datetime.now(timezone.utc)
    since_7d = current_time - timedelta(days=7)
    history_start = (current_time - timedelta(days=PUBLIC_VIEW_HISTORY_DAYS - 1)).date()

    total_views, unique_viewers, views_7d = db.execute(
        select(
            func.count(PublicProjectView.id),
            func.count(func.distinct(PublicProjectView.viewer_id)),
            func.count(PublicProjectView.id).filter(
                PublicProjectView.viewed_at >= since_7d,
            ),
        ).where(PublicProjectView.project_id == project_id)
    ).one()
    daily_rows = db.execute(
        select(
            func.date(PublicProjectView.viewed_at).label("view_date"),
            func.count(PublicProjectView.id),
        )
        .where(
            PublicProjectView.project_id == project_id,
            PublicProjectView.viewed_at >= datetime.combine(
                history_start,
                datetime.min.time(),
                tzinfo=timezone.utc,
            ),
        )
        .group_by("view_date")
    ).all()
    views_by_date = {str(view_date): int(count or 0) for view_date, count in daily_rows}
    return {
        "unique_viewers": int(unique_viewers or 0),
        "view_count": int(total_views or 0),
        "view_history": [
            {
                "date": (history_start + timedelta(days=index)).isoformat(),
                "views": views_by_date.get(
                    (history_start + timedelta(days=index)).isoformat(),
                    0,
                ),
            }
            for index in range(PUBLIC_VIEW_HISTORY_DAYS)
        ],
        "views_7d": int(views_7d or 0),
    }


def record_public_project_view(
    db: Session,
    *,
    current_user: User,
    project_id: UUID,
    source: str = "community",
    now: datetime | None = None,
) -> dict[str, Any]:
    project = db.scalar(
        select(Project).where(
            Project.id == project_id,
            Project.visibility == "public",
        ).with_for_update()
    )
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Public project not found",
        )

    current_time = now or datetime.now(timezone.utc)
    recorded = False
    if project.owner_id != current_user.id:
        latest_view = db.scalar(
            select(PublicProjectView.viewed_at)
            .where(
                PublicProjectView.project_id == project.id,
                PublicProjectView.viewer_id == current_user.id,
            )
            .order_by(desc(PublicProjectView.viewed_at))
            .limit(1)
        )
        if latest_view is None or latest_view < current_time - PUBLIC_VIEW_DEDUPE_WINDOW:
            db.add(
                PublicProjectView(
                    project_id=project.id,
                    source=source[:32],
                    viewed_at=current_time,
                    viewer_id=current_user.id,
                )
            )
            db.flush()
            recorded = True

    return {
        **public_project_view_analytics(db, project_id=project.id, now=current_time),
        "project_id": str(project.id),
        "recorded": recorded,
    }
