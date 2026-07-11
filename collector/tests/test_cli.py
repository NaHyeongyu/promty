from __future__ import annotations

import pytest

from cli import build_parser, main


def test_parser_exposes_expected_commands() -> None:
    parser = build_parser()

    for command in ("capture", "capture-changes", "doctor", "init", "upload"):
        args = parser.parse_args([command])
        assert args.command == command


def test_main_returns_parser_error_for_missing_command() -> None:
    with pytest.raises(SystemExit) as exc_info:
        main([])

    assert exc_info.value.code == 2
