from app.core.config import Settings, settings
from app.main import app


def test_published_flow_feature_defaults_to_disabled(monkeypatch) -> None:
    monkeypatch.delenv("PROMPTHUB_PUBLISHED_FLOWS_ENABLED", raising=False)
    assert Settings().published_flows_enabled is False


def test_published_flow_routes_follow_feature_flag() -> None:
    routes_are_enabled = any(
        getattr(route, "path", "").startswith("/api/published-flows")
        for route in app.routes
    )
    assert routes_are_enabled is settings.published_flows_enabled
