from app.services.projects.popularity import weekly_popularity_score


def test_weekly_popularity_score_weights_unique_engagement_and_saves() -> None:
    assert weekly_popularity_score(unique_viewers=3, views=5, saves=2) == 22.5


def test_weekly_popularity_score_clamps_invalid_repeat_counts() -> None:
    assert weekly_popularity_score(unique_viewers=3, views=2, saves=-1) == 6.0
