from __future__ import annotations

import argparse
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
    _apply_profile_defaults,
    _parse_profiles,
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


@pytest.mark.parametrize(
    ("profile", "app_url", "api_url"),
    (
        ("dev", "http://127.0.0.1:5173", "http://127.0.0.1:8011"),
        ("prod", "https://promty.org", "https://api.promty.org"),
    ),
)
def test_profile_uses_isolated_config_queue_and_uploader_files(
    profile: str,
    app_url: str,
    api_url: str,
) -> None:
    args = build_parser().parse_args(["init", "--profile", profile])

    _apply_profile_defaults(args)

    profile_root = Path.home() / ".prompthub" / "profiles" / profile
    assert args.app_url == app_url
    assert args.api_url == api_url
    assert args.config_path == str(profile_root / "config.json")
    assert args.queue_path == str(profile_root / "events")
    assert args.pid_path == str(profile_root / "uploader.pid")
    assert args.log_path == str(profile_root / "uploader.log")


def test_profile_does_not_override_explicit_urls_or_paths() -> None:
    args = build_parser().parse_args(
        [
            "init",
            "--profile",
            "prod",
            "--api-url",
            "https://api.example.test",
            "--config-path",
            "/tmp/promty-test.json",
        ]
    )

    _apply_profile_defaults(args)

    assert args.api_url == "https://api.example.test"
    assert args.config_path == "/tmp/promty-test.json"


def test_profile_queue_path_is_written_into_hooks(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repo_root = tmp_path / "repository"
    repo_root.mkdir()
    monkeypatch.setattr(cli, "_git_root", lambda _: repo_root)
    args = build_parser().parse_args(
        [
            "install-hooks",
            "--tool",
            "codex-cli",
            "--hook-command",
            "promty",
            "--repo-root",
            str(repo_root),
            "--profile",
            "dev",
        ]
    )
    _apply_profile_defaults(args)

    assert install_hooks(args) == 0

    config = json.loads((repo_root / ".codex" / "hooks.json").read_text())
    command = config["hooks"]["UserPromptSubmit"][0]["hooks"][0]["command"]
    expected_queue = Path.home() / ".prompthub" / "profiles" / "dev" / "events"
    assert command == f"promty capture --tool codex-cli --queue-path {expected_queue}"


def test_profiles_parse_comma_separated_values_without_duplicates() -> None:
    assert _parse_profiles("dev,prod,dev") == ("dev", "prod")


def test_profiles_write_primary_and_mirror_queues_into_hooks(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repo_root = tmp_path / "repository"
    repo_root.mkdir()
    monkeypatch.setattr(cli, "_git_root", lambda _: repo_root)
    args = build_parser().parse_args(
        [
            "install-hooks",
            "--tool",
            "codex-cli",
            "--hook-command",
            "promty",
            "--repo-root",
            str(repo_root),
            "--profiles",
            "dev,prod",
        ]
    )

    assert install_hooks(args) == 0

    config = json.loads((repo_root / ".codex" / "hooks.json").read_text())
    command = config["hooks"]["UserPromptSubmit"][0]["hooks"][0]["command"]
    dev_queue = Path.home() / ".prompthub" / "profiles" / "dev" / "events"
    prod_queue = Path.home() / ".prompthub" / "profiles" / "prod" / "events"
    assert command == (
        f"promty capture --tool codex-cli --queue-path {dev_queue} --mirror-queue-path {prod_queue}"
    )
    assert cli._hook_status(
        repo_root,
        "codex-cli",
        expected_queue_paths=[str(dev_queue), str(prod_queue)],
    )[0]


def test_doctor_profiles_checks_each_profile_independently(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    checked_profiles: list[tuple[str, Path, Path]] = []

    monkeypatch.setattr(
        cli,
        "_doctor_hook_checks",
        lambda *_args, **_kwargs: [("hooks", True, "installed")],
    )

    def fake_runtime_checks(
        args: argparse.Namespace,
        *,
        prefix: str = "",
    ) -> list[tuple[str, bool, str]]:
        checked_profiles.append((prefix, Path(args.queue_path), Path(args.pid_path)))
        return [(f"{prefix}backend", True, "ok")]

    monkeypatch.setattr(cli, "_doctor_runtime_checks", fake_runtime_checks)
    args = build_parser().parse_args(["doctor", "--profiles", "dev,prod"])

    assert args.func(args) == 0
    assert checked_profiles == [
        (
            "dev/",
            Path.home() / ".prompthub" / "profiles" / "dev" / "events",
            Path.home() / ".prompthub" / "profiles" / "dev" / "uploader.pid",
        ),
        (
            "prod/",
            Path.home() / ".prompthub" / "profiles" / "prod" / "events",
            Path.home() / ".prompthub" / "profiles" / "prod" / "uploader.pid",
        ),
    ]
    output = capsys.readouterr().out
    assert "dev/backend: ok" in output
    assert "prod/backend: ok" in output


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


def test_init_installs_codex_and_claude_hooks_by_default(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repo_root = tmp_path / "repository"
    repo_root.mkdir()
    launcher_path = tmp_path / "promty-home" / "bin" / "promty"
    runtime_install_count = 0

    def fake_install_runtime() -> Path:
        nonlocal runtime_install_count
        runtime_install_count += 1
        return launcher_path

    monkeypatch.setattr(cli, "_git_root", lambda _: repo_root)
    monkeypatch.setattr(cli, "install_runtime", fake_install_runtime)
    args = build_parser().parse_args(
        [
            "init",
            "--repo-root",
            str(repo_root),
            "--skip-login",
            "--skip-uploader",
        ]
    )

    assert args.tool == "all"
    assert args.func(args) == 0
    assert runtime_install_count == 1
    assert args.func(args) == 0
    assert runtime_install_count == 2

    for tool, settings_path, specs in (
        ("codex-cli", Path(".codex/hooks.json"), CODEX_HOOKS),
        ("claude-code", Path(".claude/settings.local.json"), CLAUDE_HOOKS),
    ):
        config = json.loads((repo_root / settings_path).read_text(encoding="utf-8"))
        for spec in specs:
            groups = config["hooks"][spec["event"]]
            commands = [hook["command"] for group in groups for hook in group["hooks"]]
            assert len(commands) == 1
            assert str(launcher_path) in commands[0]
            assert f"--tool {tool}" in commands[0]


def test_init_profiles_install_one_mirrored_hook_and_start_two_uploaders(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    installed_hooks: list[argparse.Namespace] = []
    started_uploaders: list[argparse.Namespace] = []

    def fake_install_hooks(args: argparse.Namespace) -> int:
        installed_hooks.append(args)
        return 0

    def fake_start_uploader(args: argparse.Namespace) -> int:
        started_uploaders.append(args)
        return 0

    monkeypatch.setattr(cli, "install_hooks", fake_install_hooks)
    monkeypatch.setattr(cli, "start_uploader", fake_start_uploader)
    args = build_parser().parse_args(["init", "--profiles", "dev,prod", "--skip-login"])

    assert args.func(args) == 0

    assert len(installed_hooks) == 1
    assert installed_hooks[0].profiles == ("dev", "prod")
    assert installed_hooks[0].queue_path is None
    assert [Path(item.queue_path) for item in started_uploaders] == [
        Path.home() / ".prompthub" / "profiles" / "dev" / "events",
        Path.home() / ".prompthub" / "profiles" / "prod" / "events",
    ]
    assert [Path(item.pid_path) for item in started_uploaders] == [
        Path.home() / ".prompthub" / "profiles" / "dev" / "uploader.pid",
        Path.home() / ".prompthub" / "profiles" / "prod" / "uploader.pid",
    ]


@pytest.mark.parametrize(
    ("tool", "expected_path", "unexpected_path"),
    (
        ("codex-cli", Path(".codex/hooks.json"), Path(".claude/settings.local.json")),
        ("claude-code", Path(".claude/settings.local.json"), Path(".codex/hooks.json")),
    ),
)
def test_init_keeps_explicit_single_tool_installation(
    tool: str,
    expected_path: Path,
    unexpected_path: Path,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repo_root = tmp_path / "repository"
    repo_root.mkdir()
    monkeypatch.setenv("PROMTY_HOME", str(tmp_path / "promty-home"))
    monkeypatch.setenv("PROMTY_PYTHON", sys.executable)
    monkeypatch.setattr(cli, "_git_root", lambda _: repo_root)
    args = build_parser().parse_args(
        [
            "init",
            "--tool",
            tool,
            "--repo-root",
            str(repo_root),
            "--skip-login",
            "--skip-uploader",
        ]
    )

    assert args.func(args) == 0
    assert (repo_root / expected_path).is_file()
    assert not (repo_root / unexpected_path).exists()


def test_init_attempts_both_hooks_and_fails_on_partial_installation(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    repo_root = tmp_path / "repository"
    codex_hooks_path = repo_root / ".codex" / "hooks.json"
    codex_hooks_path.parent.mkdir(parents=True)
    codex_hooks_path.write_text("not-json", encoding="utf-8")
    monkeypatch.setenv("PROMTY_HOME", str(tmp_path / "promty-home"))
    monkeypatch.setenv("PROMTY_PYTHON", sys.executable)
    monkeypatch.setattr(cli, "_git_root", lambda _: repo_root)
    uploader_start_count = 0

    def fake_start_uploader(_: object) -> int:
        nonlocal uploader_start_count
        uploader_start_count += 1
        return 0

    monkeypatch.setattr(cli, "start_uploader", fake_start_uploader)
    args = build_parser().parse_args(
        [
            "init",
            "--repo-root",
            str(repo_root),
            "--skip-login",
        ]
    )

    assert args.func(args) == 1
    assert uploader_start_count == 1
    output = capsys.readouterr()
    assert "codex-cli hook installation failed" in output.err
    assert "Promty hook installation incomplete" in output.err
    assert "Promty init incomplete" in output.err
    assert "Promty init complete" not in output.out
    assert (repo_root / ".claude" / "settings.local.json").is_file()


def test_doctor_can_check_both_hook_integrations(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    repo_root = tmp_path / "repository"
    repo_root.mkdir()
    monkeypatch.setattr(cli, "_git_root", lambda _: repo_root)
    install_args = build_parser().parse_args(
        [
            "install-hooks",
            "--tool",
            "all",
            "--hook-command",
            "promty",
            "--repo-root",
            str(repo_root),
        ]
    )
    assert install_hooks(install_args) == 0
    capsys.readouterr()

    monkeypatch.setattr(cli, "read_config", lambda _: {"auth": {}})
    monkeypatch.setattr(cli, "resolve_token", lambda *_: "collector-token")
    monkeypatch.setattr(cli, "_queue_status", lambda _: (True, "empty"))
    monkeypatch.setattr(cli, "_health_status", lambda *_: (True, "ok"))
    monkeypatch.setattr(cli, "_read_pid", lambda _: 123)
    monkeypatch.setattr(cli, "_pid_is_running", lambda _: True)
    doctor_args = build_parser().parse_args(
        ["doctor", "--tool", "all", "--repo-root", str(repo_root)]
    )

    assert doctor_args.func(doctor_args) == 0
    output = capsys.readouterr().out
    assert "hooks/codex-cli: ok" in output
    assert "hooks/claude-code: ok" in output


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
