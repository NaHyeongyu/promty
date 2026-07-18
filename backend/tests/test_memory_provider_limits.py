from __future__ import annotations

from io import BytesIO
import json
from types import SimpleNamespace
from urllib import error

import pytest

from app.core.config import Settings
from app.services import gemini_memory, openai_memory
from app.services.memory import provider_limits


class StreamingResponse:
    def __init__(
        self,
        payload: bytes,
        *,
        headers: dict[str, str] | None = None,
    ) -> None:
        self.headers = headers or {}
        self.payload = payload
        self.offset = 0
        self.status = 200

    def __enter__(self) -> StreamingResponse:
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def read1(self, size: int) -> bytes:
        chunk = self.payload[self.offset : self.offset + size]
        self.offset += len(chunk)
        return chunk


def _openai_settings(**overrides: object) -> SimpleNamespace:
    values = {
        "memory_provider_output_max_tokens": 8_192,
        "memory_provider_response_max_bytes": 1_048_576,
        "memory_provider_wall_deadline_seconds": 120.0,
        "openai_api_key": "test-key",
        "openai_max_retries": 0,
        "openai_model": "gpt-test",
        "openai_reasoning_effort": "minimal",
        "openai_retry_base_seconds": 0.1,
        "openai_retry_max_sleep_seconds": 2.0,
        "openai_timeout_seconds": 10,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def _gemini_settings(**overrides: object) -> SimpleNamespace:
    values = {
        "gemini_api_key": "test-key",
        "gemini_max_retries": 0,
        "gemini_model": "gemini-test",
        "gemini_retry_base_seconds": 0.1,
        "gemini_retry_max_sleep_seconds": 2.0,
        "gemini_timeout_seconds": 10,
        "memory_provider_output_max_tokens": 8_192,
        "memory_provider_response_max_bytes": 1_048_576,
        "memory_provider_wall_deadline_seconds": 120.0,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def test_provider_requests_include_configured_output_token_caps(monkeypatch) -> None:
    requests = []
    monkeypatch.setattr(
        openai_memory,
        "settings",
        _openai_settings(memory_provider_output_max_tokens=321),
    )
    monkeypatch.setattr(
        gemini_memory,
        "settings",
        _gemini_settings(memory_provider_output_max_tokens=654),
    )

    def openai_urlopen(http_request, *, timeout):
        assert timeout <= 10
        requests.append(("openai", http_request))
        payload = json.dumps({"output_text": json.dumps({"value": 1})}).encode()
        return StreamingResponse(payload)

    def gemini_urlopen(http_request, *, timeout):
        assert timeout <= 10
        requests.append(("gemini", http_request))
        payload = json.dumps(
            {"candidates": [{"content": {"parts": [{"text": json.dumps({"value": 2})}]}}]}
        ).encode()
        return StreamingResponse(payload)

    monkeypatch.setattr(openai_memory.request, "urlopen", openai_urlopen)
    assert openai_memory._request_openai_json("prompt") == {"value": 1}
    monkeypatch.setattr(gemini_memory.request, "urlopen", gemini_urlopen)
    assert gemini_memory._request_gemini_json("prompt") == {"value": 2}

    openai_body = json.loads(requests[0][1].data)
    gemini_body = json.loads(requests[1][1].data)
    assert openai_body["max_output_tokens"] == 321
    assert "untrusted evidence data" in openai_body["instructions"].lower()
    assert gemini_body["generationConfig"]["maxOutputTokens"] == 654
    assert "untrusted evidence data" in gemini_body["systemInstruction"]["parts"][0]["text"].lower()


def test_provider_rejects_oversize_success_body_without_exposing_content(
    monkeypatch,
) -> None:
    secret = "OVERSIZE_RESPONSE_SECRET_7bb302"
    monkeypatch.setattr(
        openai_memory,
        "settings",
        _openai_settings(memory_provider_response_max_bytes=64),
    )
    response = StreamingResponse(
        secret.encode() * 20,
        headers={"Content-Length": "500"},
    )
    monkeypatch.setattr(
        openai_memory.request,
        "urlopen",
        lambda *_args, **_kwargs: response,
    )

    with pytest.raises(openai_memory.OpenAIMemoryGenerationError) as raised:
        openai_memory._request_openai_json("prompt")

    assert str(raised.value) == "OpenAI response exceeded the configured size limit."
    assert secret not in str(raised.value)
    assert response.offset == 0


def test_chunked_response_reads_only_max_plus_one_bytes_before_rejection() -> None:
    response = StreamingResponse(b"x" * 10_000)
    deadline = provider_limits.ProviderWallDeadline.start(10)

    with pytest.raises(provider_limits.ProviderResponseTooLargeError):
        provider_limits.read_limited_response(
            response,
            deadline=deadline,
            max_bytes=64,
        )

    assert response.offset == 65


def test_response_reader_never_falls_back_to_unbounded_read() -> None:
    class UnsafeReadResponse:
        def read(self) -> bytes:
            raise AssertionError("unbounded read must not be called")

    deadline = provider_limits.ProviderWallDeadline.start(10)
    with pytest.raises(TypeError):
        provider_limits.read_limited_response(
            UnsafeReadResponse(),
            deadline=deadline,
            max_bytes=64,
        )


def test_each_blocking_read_lowers_nested_socket_timeout_to_remaining_deadline(
    monkeypatch,
) -> None:
    clock = SimpleNamespace(now=9.75)
    monkeypatch.setattr(provider_limits, "monotonic", lambda: clock.now)

    class FakeSSLSocket:
        def __init__(self) -> None:
            self.timeout = 30.0
            self.set_calls: list[float] = []

        def gettimeout(self) -> float:
            return self.timeout

        def settimeout(self, value: float) -> None:
            self.timeout = value
            self.set_calls.append(value)

    socket = FakeSSLSocket()

    class BlockingResponse:
        fp = SimpleNamespace(raw=SimpleNamespace(_sock=socket))

        def read1(self, _size: int) -> bytes:
            assert socket.timeout == pytest.approx(0.25)
            clock.now += socket.timeout
            raise TimeoutError

    with pytest.raises(TimeoutError):
        provider_limits.read_limited_response(
            BlockingResponse(),
            deadline=provider_limits.ProviderWallDeadline(expires_at=10.0),
            max_bytes=64,
        )

    assert socket.set_calls == [pytest.approx(0.25)]


def test_bytes_io_and_unsettable_socket_wrappers_remain_safe(monkeypatch) -> None:
    clock = SimpleNamespace(now=0.0)
    monkeypatch.setattr(provider_limits, "monotonic", lambda: clock.now)
    deadline = provider_limits.ProviderWallDeadline(expires_at=10.0)
    assert (
        provider_limits.read_limited_response(
            BytesIO(b"bounded"),
            deadline=deadline,
            max_bytes=64,
        )
        == b"bounded"
    )

    class UnsettableSocket:
        def gettimeout(self) -> float:
            return 30.0

        def settimeout(self, _value: float) -> None:
            raise OSError("wrapper does not expose its socket timeout")

    class WrappedResponse(StreamingResponse):
        fp = SimpleNamespace(raw=SimpleNamespace(_sock=UnsettableSocket()))

    assert (
        provider_limits.read_limited_response(
            WrappedResponse(b"still bounded"),
            deadline=deadline,
            max_bytes=64,
        )
        == b"still bounded"
    )


def test_slow_trickle_read_stops_at_monotonic_wall_deadline(monkeypatch) -> None:
    clock = SimpleNamespace(now=0.0)
    monkeypatch.setattr(provider_limits, "monotonic", lambda: clock.now)
    monkeypatch.setattr(
        openai_memory,
        "settings",
        _openai_settings(
            memory_provider_response_max_bytes=1_024,
            memory_provider_wall_deadline_seconds=1.0,
        ),
    )

    class TrickleResponse(StreamingResponse):
        def read1(self, _size: int) -> bytes:
            clock.now += 0.6
            return b"{"

    monkeypatch.setattr(
        openai_memory.request,
        "urlopen",
        lambda *_args, **_kwargs: TrickleResponse(b""),
    )

    with pytest.raises(openai_memory.OpenAIMemoryGenerationError) as raised:
        openai_memory._request_openai_json("prompt")

    assert str(raised.value) == "OpenAI request exceeded the configured time limit."
    assert clock.now == pytest.approx(1.2)


def test_retry_configuration_does_not_start_a_second_provider_call(monkeypatch) -> None:
    calls = 0
    monkeypatch.setattr(
        openai_memory,
        "settings",
        _openai_settings(
            memory_provider_wall_deadline_seconds=1.0,
            openai_max_retries=3,
            openai_retry_base_seconds=2.0,
        ),
    )

    def urlopen(*_args, **_kwargs):
        nonlocal calls
        calls += 1
        raise error.URLError("secret transport detail")

    monkeypatch.setattr(openai_memory.request, "urlopen", urlopen)

    with pytest.raises(openai_memory.OpenAIMemoryGenerationError) as raised:
        openai_memory._request_openai_json("prompt")

    assert str(raised.value) == "OpenAI request failed before receiving an HTTP response."
    assert calls == 1


def test_retry_sleep_rechecks_deadline_after_sleeper_returns(monkeypatch) -> None:
    clock = SimpleNamespace(now=0.0)
    monkeypatch.setattr(provider_limits, "monotonic", lambda: clock.now)
    deadline = provider_limits.ProviderWallDeadline.start(1.0)

    def sleeper(_delay: float) -> None:
        clock.now = 1.1

    with pytest.raises(provider_limits.ProviderWallDeadlineExceededError):
        provider_limits.sleep_before_retry_with_deadline(
            deadline,
            0.5,
            sleeper,
        )


def test_provider_limit_settings_support_aliases_and_safe_defaults(monkeypatch) -> None:
    names = (
        "PROMTY_MEMORY_PROVIDER_RESPONSE_MAX_BYTES",
        "PROMTY_MEMORY_PROVIDER_RESPONSE_MAX_BYTES",
        "PROMTY_MEMORY_PROVIDER_OUTPUT_MAX_TOKENS",
        "PROMTY_MEMORY_PROVIDER_OUTPUT_MAX_TOKENS",
        "PROMTY_MEMORY_PROVIDER_WALL_DEADLINE_SECONDS",
        "PROMTY_MEMORY_PROVIDER_WALL_DEADLINE_SECONDS",
        "PROMTY_OPENAI_INPUT_USD_PER_MILLION_TOKENS",
        "PROMTY_OPENAI_INPUT_USD_PER_MILLION_TOKENS",
        "PROMTY_OPENAI_OUTPUT_USD_PER_MILLION_TOKENS",
        "PROMTY_OPENAI_OUTPUT_USD_PER_MILLION_TOKENS",
        "PROMTY_GEMINI_INPUT_USD_PER_MILLION_TOKENS",
        "PROMTY_GEMINI_INPUT_USD_PER_MILLION_TOKENS",
        "PROMTY_GEMINI_OUTPUT_USD_PER_MILLION_TOKENS",
        "PROMTY_GEMINI_OUTPUT_USD_PER_MILLION_TOKENS",
    )
    for name in names:
        monkeypatch.delenv(name, raising=False)

    defaults = Settings()
    assert defaults.memory_provider_response_max_bytes == 1_048_576
    assert defaults.memory_provider_output_max_tokens == 8_192
    assert defaults.memory_provider_wall_deadline_seconds == 120.0
    assert defaults.openai_input_usd_per_million_tokens == 0.25
    assert defaults.openai_output_usd_per_million_tokens == 2.0
    assert defaults.gemini_input_usd_per_million_tokens == 0.30
    assert defaults.gemini_output_usd_per_million_tokens == 2.50

    monkeypatch.setenv("PROMTY_MEMORY_PROVIDER_RESPONSE_MAX_BYTES", "2048")
    monkeypatch.setenv("PROMTY_MEMORY_PROVIDER_OUTPUT_MAX_TOKENS", "777")
    monkeypatch.setenv("PROMTY_MEMORY_PROVIDER_WALL_DEADLINE_SECONDS", "4.5")
    monkeypatch.setenv("PROMTY_OPENAI_INPUT_USD_PER_MILLION_TOKENS", "0.4")
    monkeypatch.setenv("PROMTY_GEMINI_OUTPUT_USD_PER_MILLION_TOKENS", "3.5")
    configured = Settings()
    assert configured.memory_provider_response_max_bytes == 2_048
    assert configured.memory_provider_output_max_tokens == 777
    assert configured.memory_provider_wall_deadline_seconds == 4.5
    assert configured.openai_input_usd_per_million_tokens == 0.4
    assert configured.gemini_output_usd_per_million_tokens == 3.5
