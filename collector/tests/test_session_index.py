from pathlib import Path

from session_index import SessionIndex


def test_ignored_session_is_persisted(tmp_path: Path) -> None:
    index = SessionIndex(tmp_path / "sessions.json")

    index.ignore("codex-cli", "background-session", cwd="/tmp/project")

    assert index.is_ignored("codex-cli", "background-session")
    assert not index.is_ignored("codex-cli", "interactive-session")
