from __future__ import annotations

from io import BytesIO
import json
import logging
from types import SimpleNamespace
import traceback
from urllib import error

import pytest

from app.services import gemini_memory, openai_memory
from app.services.memory.provider_metrics import logger as metrics_logger


class _Response:
    def __init__(self, payload: dict[str, object], *, status: int = 200) -> None:
        self._body = json.dumps(payload).encode("utf-8")
        self._offset = 0
        self.status = status

    def __enter__(self) -> _Response:
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def read(self, size: int = -1) -> bytes:
        end = len(self._body) if size < 0 else self._offset + size
        chunk = self._body[self._offset : end]
        self._offset += len(chunk)
        return chunk


def _metric_fields(message: str) -> dict[str, str]:
    return dict(field.split("=", 1) for field in message.split())


def test_openai_success_logs_only_safe_request_metadata(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    prompt_sentinel = "PROMPT_SECRET_4b6724"
    api_key_sentinel = "API_KEY_SECRET_21cae5"
    response_sentinel = "RESPONSE_SECRET_a4393a"
    requests: list[object] = []
    monkeypatch.setattr(
        openai_memory,
        "settings",
        SimpleNamespace(
            openai_api_key=api_key_sentinel,
            openai_model="gpt-test",
            openai_reasoning_effort="minimal",
            openai_max_retries=0,
            openai_timeout_seconds=1,
            openai_retry_base_seconds=0,
            openai_retry_max_sleep_seconds=0,
        ),
    )

    def urlopen(http_request: object, *, timeout: int) -> _Response:
        assert timeout == 1
        requests.append(http_request)
        return _Response(
            {
                "output_text": json.dumps(
                    {"value": response_sentinel},
                )
            },
            status=201,
        )

    monkeypatch.setattr(openai_memory.request, "urlopen", urlopen)
    caplog.set_level(logging.INFO, logger=metrics_logger.name)

    result = openai_memory._request_openai_json(
        prompt_sentinel,
        stage="memory_draft_generation",
    )

    assert result == {"value": response_sentinel}
    assert len(requests) == 1
    request_bytes = len(getattr(requests[0], "data"))
    records = [record for record in caplog.records if record.name == metrics_logger.name]
    assert len(records) == 1
    fields = _metric_fields(records[0].getMessage())
    assert set(fields) == {
        "provider",
        "model",
        "stage",
        "request_bytes",
        "attempt",
        "duration_ms",
        "outcome",
        "status",
    }
    assert fields == {
        "provider": "openai",
        "model": "gpt-test",
        "stage": "memory_draft_generation",
        "request_bytes": str(request_bytes),
        "attempt": "1",
        "duration_ms": fields["duration_ms"],
        "outcome": "success",
        "status": "201",
    }
    assert int(fields["duration_ms"]) >= 0
    assert prompt_sentinel not in caplog.text
    assert api_key_sentinel not in caplog.text
    assert response_sentinel not in caplog.text


def test_gemini_failure_logs_each_retry_without_sensitive_content(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    prompt_sentinel = "PROMPT_SECRET_80ed01"
    api_key_sentinel = "API_KEY_SECRET_d22f49"
    error_sentinel = "ERROR_BODY_SECRET_f7ab40"
    requests: list[object] = []
    monkeypatch.setattr(
        gemini_memory,
        "settings",
        SimpleNamespace(
            gemini_api_key=api_key_sentinel,
            gemini_model="gemini-test",
            gemini_max_retries=1,
            gemini_timeout_seconds=1,
            gemini_retry_base_seconds=0,
            gemini_retry_max_sleep_seconds=0,
        ),
    )

    def urlopen(http_request: object, *, timeout: int) -> _Response:
        assert timeout == 1
        requests.append(http_request)
        raise error.HTTPError(
            getattr(http_request, "full_url"),
            429,
            "rate limited",
            {"Retry-After": "0"},
            BytesIO(error_sentinel.encode("utf-8")),
        )

    monkeypatch.setattr(gemini_memory.request, "urlopen", urlopen)
    monkeypatch.setattr(gemini_memory, "sleep_before_retry", lambda _delay: None)
    caplog.set_level(logging.INFO, logger=metrics_logger.name)

    with pytest.raises(
        gemini_memory.GeminiMemoryGenerationError,
        match="HTTP status 429",
    ) as raised:
        gemini_memory._request_gemini_json(
            prompt_sentinel,
            stage="project_memory_generation",
        )

    assert len(requests) == 2
    request_bytes = len(getattr(requests[0], "data"))
    records = [record for record in caplog.records if record.name == metrics_logger.name]
    fields = [_metric_fields(record.getMessage()) for record in records]
    assert len(fields) == 2
    assert [field["attempt"] for field in fields] == ["1", "2"]
    assert [field["outcome"] for field in fields] == ["retry", "failure"]
    assert {field["status"] for field in fields} == {"http_429"}
    assert {field["provider"] for field in fields} == {"gemini"}
    assert {field["model"] for field in fields} == {"gemini-test"}
    assert {field["stage"] for field in fields} == {"project_memory_generation"}
    assert {field["request_bytes"] for field in fields} == {str(request_bytes)}
    assert all(int(field["duration_ms"]) >= 0 for field in fields)
    assert prompt_sentinel not in caplog.text
    assert api_key_sentinel not in caplog.text
    assert error_sentinel not in caplog.text
    assert str(raised.value) == "Gemini request failed with HTTP status 429."
    rendered_error = "".join(
        traceback.format_exception(
            type(raised.value),
            raised.value,
            raised.value.__traceback__,
        )
    )
    assert error_sentinel not in rendered_error
    assert api_key_sentinel not in rendered_error


def test_openai_transport_exception_redacts_underlying_error_and_context(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    api_key_sentinel = "API_KEY_SECRET_cf4578"
    transport_sentinel = "TRANSPORT_SECRET_d82587"
    monkeypatch.setattr(
        openai_memory,
        "settings",
        SimpleNamespace(
            openai_api_key=api_key_sentinel,
            openai_model="gpt-test",
            openai_reasoning_effort="minimal",
            openai_max_retries=0,
            openai_timeout_seconds=1,
            openai_retry_base_seconds=0,
            openai_retry_max_sleep_seconds=0,
        ),
    )
    monkeypatch.setattr(
        openai_memory.request,
        "urlopen",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(error.URLError(transport_sentinel)),
    )

    with pytest.raises(openai_memory.OpenAIMemoryGenerationError) as raised:
        openai_memory._request_openai_json("safe prompt")

    assert str(raised.value) == "OpenAI request failed before receiving an HTTP response."
    rendered_error = "".join(
        traceback.format_exception(
            type(raised.value),
            raised.value,
            raised.value.__traceback__,
        )
    )
    assert transport_sentinel not in rendered_error
    assert api_key_sentinel not in rendered_error


def test_openai_refusal_exception_does_not_include_provider_response(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    refusal_sentinel = "REFUSAL_RESPONSE_SECRET_b2d86a"
    monkeypatch.setattr(
        openai_memory,
        "settings",
        SimpleNamespace(
            openai_api_key="test-key",
            openai_model="gpt-test",
            openai_reasoning_effort="minimal",
            openai_max_retries=0,
            openai_timeout_seconds=1,
            openai_retry_base_seconds=0,
            openai_retry_max_sleep_seconds=0,
        ),
    )
    monkeypatch.setattr(
        openai_memory.request,
        "urlopen",
        lambda *_args, **_kwargs: _Response(
            {"output": [{"content": [{"refusal": refusal_sentinel}]}]}
        ),
    )

    with pytest.raises(openai_memory.OpenAIMemoryGenerationError) as raised:
        openai_memory._request_openai_json("safe prompt")

    assert str(raised.value) == "OpenAI returned an invalid response."
    assert refusal_sentinel not in str(raised.value)
