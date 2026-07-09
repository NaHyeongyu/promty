from __future__ import annotations

from app.services.memory.retry import (
    bounded_retry_delay,
    retry_after_header_delay,
    retry_delay_from_text,
)


def test_retry_after_header_delay_parses_numeric_header() -> None:
    assert retry_after_header_delay({"Retry-After": "2.5"}) == 2.5
    assert retry_after_header_delay({"Retry-After": "soon"}) is None


def test_retry_delay_from_text_parses_provider_message() -> None:
    assert retry_delay_from_text("please retry in 7.25s") == 7.25
    assert retry_delay_from_text("try later") is None


def test_bounded_retry_delay_prefers_header_then_body_then_backoff() -> None:
    assert (
        bounded_retry_delay(
            attempt=3,
            base_seconds=2,
            body_delay=4,
            header_delay=3,
            max_sleep_seconds=20,
        )
        == 3
    )
    assert (
        bounded_retry_delay(
            attempt=3,
            base_seconds=2,
            body_delay=4,
            max_sleep_seconds=20,
        )
        == 4
    )
    assert (
        bounded_retry_delay(
            attempt=3,
            base_seconds=2,
            max_sleep_seconds=10,
        )
        == 10
    )
