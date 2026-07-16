from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import func, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.models.project_stats import ProjectStats


_PROJECT_STATS_ACTUAL_CTE = """
WITH actual AS (
    SELECT
        projects.id AS project_id,
        COALESCE(session_stats.session_count, 0)::integer AS session_count,
        COALESCE(event_stats.event_count, 0)::integer AS event_count,
        COALESCE(event_stats.prompt_count, 0)::integer AS prompt_count,
        COALESCE(file_stats.tracked_files, 0)::integer AS tracked_files,
        event_stats.latest_event_at AS latest_event_at
    FROM projects
    LEFT JOIN (
        SELECT project_id, COUNT(*) AS session_count
        FROM sessions
        GROUP BY project_id
    ) AS session_stats ON session_stats.project_id = projects.id
    LEFT JOIN (
        SELECT
            project_id,
            COUNT(*) AS event_count,
            COUNT(*) FILTER (WHERE event_type = 'PromptSubmitted') AS prompt_count,
            MAX(created_at) AS latest_event_at
        FROM events
        GROUP BY project_id
    ) AS event_stats ON event_stats.project_id = projects.id
    LEFT JOIN (
        SELECT project_id, COUNT(*) AS tracked_files
        FROM project_files
        WHERE status <> 'deleted'
        GROUP BY project_id
    ) AS file_stats ON file_stats.project_id = projects.id
)
"""


def increment_project_stats(
    db: Session,
    deltas: Iterable[dict[str, Any]],
) -> None:
    rows = [
        {
            "event_count": int(delta.get("event_count") or 0),
            "latest_event_at": delta.get("latest_event_at"),
            "project_id": delta["project_id"],
            "prompt_count": int(delta.get("prompt_count") or 0),
            "session_count": int(delta.get("session_count") or 0),
            "tracked_files": int(delta.get("tracked_files") or 0),
        }
        for delta in deltas
    ]
    if not rows:
        return

    statement = insert(ProjectStats).values(rows)
    excluded = statement.excluded
    db.execute(
        statement.on_conflict_do_update(
            index_elements=[ProjectStats.project_id],
            set_={
                "event_count": ProjectStats.event_count + excluded.event_count,
                "latest_event_at": func.coalesce(
                    func.greatest(ProjectStats.latest_event_at, excluded.latest_event_at),
                    ProjectStats.latest_event_at,
                    excluded.latest_event_at,
                ),
                "prompt_count": ProjectStats.prompt_count + excluded.prompt_count,
                "session_count": ProjectStats.session_count + excluded.session_count,
                "tracked_files": func.greatest(
                    ProjectStats.tracked_files + excluded.tracked_files,
                    0,
                ),
                "updated_at": func.now(),
            },
        )
    )


def project_stats_delta(
    *,
    event_count: int = 0,
    latest_event_at: datetime | None = None,
    project_id: UUID,
    prompt_count: int = 0,
    session_count: int = 0,
    tracked_files: int = 0,
) -> dict[str, Any]:
    return {
        "event_count": event_count,
        "latest_event_at": latest_event_at,
        "project_id": project_id,
        "prompt_count": prompt_count,
        "session_count": session_count,
        "tracked_files": tracked_files,
    }


def count_project_stats_drift(db: Session) -> int:
    statement = text(
        _PROJECT_STATS_ACTUAL_CTE
        + """
        SELECT COUNT(*)
        FROM actual
        LEFT JOIN project_stats ON project_stats.project_id = actual.project_id
        WHERE project_stats.project_id IS NULL
           OR ROW(
                project_stats.session_count,
                project_stats.event_count,
                project_stats.prompt_count,
                project_stats.tracked_files,
                project_stats.latest_event_at
              ) IS DISTINCT FROM ROW(
                actual.session_count,
                actual.event_count,
                actual.prompt_count,
                actual.tracked_files,
                actual.latest_event_at
              )
        """
    )
    return int(db.scalar(statement) or 0)


def reconcile_project_stats(db: Session) -> int:
    statement = text(
        _PROJECT_STATS_ACTUAL_CTE
        + """
        INSERT INTO project_stats (
            project_id,
            session_count,
            event_count,
            prompt_count,
            tracked_files,
            latest_event_at,
            updated_at
        )
        SELECT
            project_id,
            session_count,
            event_count,
            prompt_count,
            tracked_files,
            latest_event_at,
            now()
        FROM actual
        ON CONFLICT (project_id) DO UPDATE SET
            session_count = EXCLUDED.session_count,
            event_count = EXCLUDED.event_count,
            prompt_count = EXCLUDED.prompt_count,
            tracked_files = EXCLUDED.tracked_files,
            latest_event_at = EXCLUDED.latest_event_at,
            updated_at = now()
        """
    )
    result = db.execute(statement)
    return max(int(result.rowcount or 0), 0)
