from __future__ import annotations

import pytest

from adapters import normalize_collector_event


@pytest.mark.parametrize(
    ("tool", "expected_tool"),
    [
        ("claude-code", "claude-code"),
        ("codex-cli", "codex-cli"),
        ("cursor", "cursor"),
        ("gemini-cli", "gemini-cli"),
    ],
)
def test_supported_adapters_normalize_prompt_events(tool: str, expected_tool: str) -> None:
    event = normalize_collector_event(
        tool,
        {
            "cwd": "/tmp/project",
            "prompt": "inspect the repository",
            "session_id": "session-1",
        },
        "PromptSubmitted",
    )

    assert event.tool == expected_tool
    assert event.event_type == "PromptSubmitted"
    assert event.payload.to_dict()["prompt"] == "inspect the repository"


def test_unknown_adapter_is_rejected() -> None:
    with pytest.raises(ValueError, match="Unsupported tool"):
        normalize_collector_event("unknown", {}, "PromptSubmitted")
