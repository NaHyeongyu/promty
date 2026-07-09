from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

from app.services.prompt_search import (
    prompt_search_hashes_for_query,
    prompt_search_hashes_for_text,
    prompt_search_text,
)


def test_prompt_search_query_hashes_match_indexed_substring() -> None:
    indexed = set(
        prompt_search_hashes_for_text(
            "Refactor ProjectDetailPage so prompt activities load separately"
        )
    )
    query = set(prompt_search_hashes_for_query("detail activities"))

    assert query
    assert query.issubset(indexed)


def test_prompt_search_hashes_do_not_store_plaintext_tokens() -> None:
    hashes = prompt_search_hashes_for_text("very-secret-prompt-value")

    assert hashes
    assert all(len(value) == 64 for value in hashes)
    assert "secret" not in hashes
    assert "very-secret-prompt-value" not in hashes


def test_prompt_search_text_includes_prompt_and_metadata() -> None:
    session_id = uuid4()
    event = SimpleNamespace(
        created_at=datetime(2026, 7, 9, 12, 30, tzinfo=timezone.utc),
        sequence=7,
        session_id=session_id,
        tool="codex-cli",
    )

    text = prompt_search_text(
        event,
        {
            "model": "gpt-5-mini",
            "prompt": "Split the activity panel",
        },
    )

    assert "Split the activity panel" in text
    assert "gpt-5-mini" in text
    assert "7" in text
    assert str(session_id) in text
