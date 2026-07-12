from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys

import pytest

import cli
from cli import (
    CLAUDE_HOOKS,
    CODEX_HOOKS,
    LOGIN_CALLBACK_HTML,
    build_parser,
    install_hooks,
    main,
)
from runtime_install import install_runtime


def test_parser_exposes_expected_commands() -> None:
    parser = build_parser()

    for command in ("capture", "capture-changes", "doctor", "init", "upload"):
        args = parser.parse_args([command])
        assert args.command == command


def test_main_returns_parser_error_for_missing_command() -> None:
    with pytest.raises(SystemExit) as exc_info:
        main([])

    assert exc_info.value.code == 2


@pytest.mark.parametrize("command", ("doctor", "init", "install-hooks"))
@pytest.mark.parametrize("tool", ("cursor", "gemini-cli"))
def test_hook_commands_only_offer_verified_integrations(command: str, tool: str) -> None:
    parser = build_parser()

    with pytest.raises(SystemExit) as exc_info:
        parser.parse_args([command, "--tool", tool])

    assert exc_info.value.code == 2


def test_capture_keeps_legacy_adapter_compatibility() -> None:
    args = build_parser().parse_args(["capture", "--tool", "cursor"])

    assert args.tool == "cursor"


def test_runtime_launcher_uses_a_durable_copy(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    promty_home = tmp_path / "home with spaces" / ".promty"
    monkeypatch.setenv("PROMTY_HOME", str(promty_home))
    monkeypatch.delenv("PROMTY_PYTHON", raising=False)
    monkeypatch.delenv("PROMPTHUB_HOOK_PYTHON", raising=False)

    launcher_path = install_runtime()
    launcher_text = launcher_path.read_text(encoding="utf-8")
    runtime_directories = [path for path in (promty_home / "runtime").iterdir() if path.is_dir()]

    assert launcher_path == promty_home / "bin" / ("promty.cmd" if os.name == "nt" else "promty")
    assert len(runtime_directories) == 1
    runtime_path = runtime_directories[0]
    assert (runtime_path / "cli.py").is_file()
    assert (runtime_path / "adapters" / "codex" / "hook.py").is_file()
    assert str(runtime_path / "cli.py") in launcher_text
    assert str(Path(sys.executable)) in launcher_text
    assert str(Path(cli.__file__).resolve()) not in launcher_text
    if os.name != "nt":
        assert launcher_path.stat().st_mode & 0o111

    command = (
        ["cmd", "/c", str(launcher_path), "--help"]
        if os.name == "nt"
        else [str(launcher_path), "--help"]
    )
    result = subprocess.run(
        command,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0
    assert "Promty local AI activity collector" in result.stdout
    assert install_runtime() == launcher_path


@pytest.mark.parametrize(
    ("tool", "settings_path", "specs"),
    (
        ("codex-cli", Path(".codex/hooks.json"), CODEX_HOOKS),
        ("claude-code", Path(".claude/settings.local.json"), CLAUDE_HOOKS),
    ),
)
def test_install_hooks_uses_durable_launcher(
    tool: str,
    settings_path: Path,
    specs: tuple[dict[str, object], ...],
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repo_root = tmp_path / "repository"
    repo_root.mkdir()
    promty_home = tmp_path / "promty-home"
    monkeypatch.setenv("PROMTY_HOME", str(promty_home))
    monkeypatch.setenv("PROMTY_PYTHON", sys.executable)
    monkeypatch.setattr(cli, "_git_root", lambda _: repo_root)
    args = build_parser().parse_args(
        ["install-hooks", "--tool", tool, "--repo-root", str(repo_root)]
    )

    assert install_hooks(args) == 0

    config = json.loads((repo_root / settings_path).read_text(encoding="utf-8"))
    launcher_path = promty_home / "bin" / ("promty.cmd" if os.name == "nt" else "promty")
    for spec in specs:
        groups = config["hooks"][spec["event"]]
        commands = [hook["command"] for group in groups for hook in group["hooks"]]
        assert len(commands) == 1
        assert str(launcher_path) in commands[0]
        assert "collector/src/cli.py" not in commands[0]
        assert str(Path(cli.__file__).resolve()) not in commands[0]


def test_install_hooks_migrates_legacy_prompthub_command(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repo_root = tmp_path / "repository"
    hooks_path = repo_root / ".codex" / "hooks.json"
    hooks_path.parent.mkdir(parents=True)
    hooks_path.write_text(
        json.dumps(
            {
                "hooks": {
                    "UserPromptSubmit": [
                        {
                            "hooks": [
                                {
                                    "type": "command",
                                    "command": (
                                        "python3 collector/src/cli.py capture --tool codex-cli"
                                    ),
                                    "statusMessage": "Capturing PromptHub event",
                                }
                            ]
                        }
                    ]
                }
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setenv("PROMTY_HOME", str(tmp_path / ".promty"))
    monkeypatch.setenv("PROMTY_PYTHON", sys.executable)
    monkeypatch.setattr(cli, "_git_root", lambda _: repo_root)
    args = build_parser().parse_args(
        ["install-hooks", "--tool", "codex-cli", "--repo-root", str(repo_root)]
    )

    assert install_hooks(args) == 0

    config = json.loads(hooks_path.read_text(encoding="utf-8"))
    groups = config["hooks"]["UserPromptSubmit"]
    hooks = [hook for group in groups for hook in group["hooks"]]
    assert len(hooks) == 1
    assert ".promty" in hooks[0]["command"]
    assert hooks[0]["statusMessage"] == "Capturing Promty event"


def test_user_facing_brand_is_promty() -> None:
    assert "PromptHub" not in LOGIN_CALLBACK_HTML
    assert all("PromptHub" not in spec.get("statusMessage", "") for spec in CODEX_HOOKS)
