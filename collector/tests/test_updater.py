from __future__ import annotations

import updater


def test_update_available_compares_semantic_versions() -> None:
    assert updater.update_available("0.1.1", "0.1.2") is True
    assert updater.update_available("0.1.2", "0.1.2") is False
    assert updater.update_available("0.2.0", "0.1.9") is False


def test_auto_update_installs_only_a_newer_version(monkeypatch) -> None:
    installed: list[str] = []
    monkeypatch.setattr(updater, "latest_version", lambda: "9.0.0")
    monkeypatch.setattr(
        updater,
        "install_latest",
        lambda version: installed.append(version) is None or True,
    )

    assert updater.auto_update() == "9.0.0"
    assert installed == ["9.0.0"]
