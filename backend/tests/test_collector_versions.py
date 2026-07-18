from __future__ import annotations

import pytest

from app.services import collector_versions


@pytest.fixture(autouse=True)
def reset_version_cache() -> None:
    collector_versions._reset_version_cache()
    yield
    collector_versions._reset_version_cache()


def test_latest_collector_version_comes_from_npm_registry(monkeypatch) -> None:
    monkeypatch.setattr(collector_versions, "_fetch_registry_version", lambda: "0.1.5")

    version = collector_versions.get_latest_collector_version(fallback="0.1.4")

    assert version == "0.1.5"


def test_latest_collector_version_is_cached(monkeypatch) -> None:
    fetch_count = 0

    def fetch_registry_version() -> str:
        nonlocal fetch_count
        fetch_count += 1
        return "0.1.5"

    monkeypatch.setattr(
        collector_versions,
        "_fetch_registry_version",
        fetch_registry_version,
    )

    assert collector_versions.get_latest_collector_version(fallback="0.1.4") == "0.1.5"
    assert collector_versions.get_latest_collector_version(fallback="0.1.4") == "0.1.5"
    assert fetch_count == 1


def test_latest_collector_version_falls_back_when_registry_fails(monkeypatch) -> None:
    def fail_registry_request() -> str:
        raise TimeoutError("registry timed out")

    monkeypatch.setattr(
        collector_versions,
        "_fetch_registry_version",
        fail_registry_request,
    )

    assert collector_versions.get_latest_collector_version(fallback="0.1.4") == "0.1.4"


def test_latest_collector_version_never_downgrades_below_fallback(monkeypatch) -> None:
    monkeypatch.setattr(collector_versions, "_fetch_registry_version", lambda: "0.1.3")

    assert collector_versions.get_latest_collector_version(fallback="0.1.4") == "0.1.4"
