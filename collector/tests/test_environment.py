from __future__ import annotations

from pathlib import Path

import environment


def test_promote_legacy_environment_preserves_canonical_value(monkeypatch) -> None:
    monkeypatch.setenv("PROMPTHUB_API_URL", "https://legacy.example")
    monkeypatch.setenv("PROMPTHUB_API_TOKEN", "legacy-token")
    monkeypatch.setenv("PROMTY_API_URL", "https://promty.example")
    monkeypatch.delenv("PROMTY_API_TOKEN", raising=False)

    environment.promote_legacy_environment()

    assert environment.os.environ["PROMTY_API_URL"] == "https://promty.example"
    assert environment.os.environ["PROMTY_API_TOKEN"] == "legacy-token"


def test_migrate_legacy_data_root_copies_only_missing_files(
    monkeypatch,
    tmp_path: Path,
) -> None:
    legacy_root = tmp_path / ".prompthub"
    promty_root = tmp_path / ".promty"
    (legacy_root / "profiles" / "prod").mkdir(parents=True)
    (legacy_root / "profiles" / "prod" / "config.json").write_text(
        "legacy",
        encoding="utf-8",
    )
    promty_root.mkdir()
    (promty_root / "keep.txt").write_text("current", encoding="utf-8")
    monkeypatch.setattr(environment, "LEGACY_DATA_ROOT", legacy_root)
    monkeypatch.setenv("PROMTY_HOME", str(promty_root))

    environment.migrate_legacy_data_root()

    assert (promty_root / "profiles" / "prod" / "config.json").read_text(
        encoding="utf-8",
    ) == "legacy"
    assert (promty_root / "keep.txt").read_text(encoding="utf-8") == "current"
