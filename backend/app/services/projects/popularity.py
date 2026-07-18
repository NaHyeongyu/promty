from __future__ import annotations

from datetime import timedelta


WEEKLY_POPULARITY_WINDOW = timedelta(days=7)
UNIQUE_VIEW_WEIGHT = 2.0
REPEAT_VIEW_WEIGHT = 0.25
SAVE_WEIGHT = 8.0


def weekly_popularity_score(
    *,
    unique_viewers: int,
    views: int,
    saves: int,
) -> float:
    """Return the rolling seven-day community popularity score.

    Views are already deduplicated per viewer/project for 30 minutes. A save is
    unique per user/project and intentionally carries more weight than a view.
    """

    unique = max(int(unique_viewers), 0)
    repeats = max(int(views) - unique, 0)
    active_saves = max(int(saves), 0)
    return round(
        unique * UNIQUE_VIEW_WEIGHT
        + repeats * REPEAT_VIEW_WEIGHT
        + active_saves * SAVE_WEIGHT,
        2,
    )
