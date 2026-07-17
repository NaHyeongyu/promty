from __future__ import annotations

import os
from pathlib import Path
import stat
import tomllib

import pytest

from change_tracking import ChangeBaselineStore
from config import read_config, write_config
from events import BaseEvent, PromptSubmittedPayload
from session_index import SessionIndex
from sequence import SequenceStore
from secure_storage import UnsafeStoragePathError
from uploader.queue import JSONLQueue


def _mode(path: Path) -> int:
    return stat.S_IMODE(path.stat().st_mode)


def _event() -> BaseEvent:
    return BaseEvent(
        tool="codex-cli",
        event_type="PromptSubmitted",
        payload=PromptSubmittedPayload(prompt="sensitive prompt"),
        project_id="project",
        session_id="session",
        sequence=1,
    )


def test_private_collector_files_are_created_with_restricted_modes(tmp_path: Path) -> None:
    previous_umask = os.umask(0o022)
    try:
        queue_path = tmp_path / "queue" / "events.jsonl"
        queue = JSONLQueue(queue_path)
        queue.push(_event())

        config_path = tmp_path / "config" / "config.json"
        write_config({"token": "collector-secret"}, config_path)

        baseline_path = tmp_path / "baseline" / "change-baselines.json"
        ChangeBaselineStore(baseline_path)._write({"records": {}})

        sequence_path = tmp_path / "sequence" / "sequences.json"
        SequenceStore(sequence_path)._write({"session": 1})

        session_path = tmp_path / "session" / "session-index.json"
        SessionIndex(session_path)._write({"codex-cli:session": {"ignored": False}})
    finally:
        os.umask(previous_umask)

    for path in (
        queue_path,
        queue.lock_path,
        config_path,
        baseline_path,
        sequence_path,
        session_path,
    ):
        assert _mode(path) == 0o600
        assert _mode(path.parent) == 0o700

    assert read_config(config_path)["token"] == "collector-secret"


def test_reading_existing_private_data_tightens_file_permissions(tmp_path: Path) -> None:
    config_path = tmp_path / "config.json"
    config_path.write_text('{"token":"collector-secret"}', encoding="utf-8")
    config_path.chmod(0o644)

    assert read_config(config_path)["token"] == "collector-secret"
    assert _mode(config_path) == 0o600


def test_private_storage_refuses_symbolic_link_targets(tmp_path: Path) -> None:
    sensitive_target = tmp_path / "sensitive.txt"
    sensitive_target.write_text("do-not-change", encoding="utf-8")
    linked_config = tmp_path / "config.json"
    linked_config.symlink_to(sensitive_target)

    with pytest.raises(UnsafeStoragePathError, match="symbolic link"):
        write_config({"token": "attacker-controlled"}, linked_config)
    with pytest.raises(UnsafeStoragePathError, match="symbolic link"):
        read_config(linked_config)

    assert sensitive_target.read_text(encoding="utf-8") == "do-not-change"


def test_secure_storage_is_included_in_the_collector_package() -> None:
    package_config = tomllib.loads(
        (Path(__file__).parents[1] / "pyproject.toml").read_text(encoding="utf-8")
    )

    assert "secure_storage" in package_config["tool"]["setuptools"]["py-modules"]
