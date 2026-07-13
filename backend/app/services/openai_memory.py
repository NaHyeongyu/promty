from __future__ import annotations

import json
from typing import Any
from urllib import error, request

from app.core.config import settings
from app.schemas.memory import (
    MemoryDraftGeneration,
    ProjectMemorySnapshot,
)
from app.services.memory.cleaners import (
    clean_memory_drafts_response,
    clean_project_memory_response,
    parse_json_text,
)
from app.services.memory.errors import MemoryGenerationError
from app.services.memory.prompts import (
    build_memory_draft_prompt,
    build_project_memory_prompt,
)
from app.services.memory.provider_metrics import (
    ProviderRequestAttempt,
    response_status,
)
from app.services.memory.provider_limits import (
    ProviderResponseTooLargeError,
    ProviderWallDeadline,
    ProviderWallDeadlineExceededError,
    read_limited_response,
    sleep_before_retry_with_deadline,
)
from app.services.memory.retry import (
    bounded_retry_delay,
    retry_after_header_delay,
    sleep_before_retry,
)

OPENAI_MEMORY_DRAFT_GENERATOR = "openai-memory-draft-v1"
OPENAI_PROJECT_MEMORY_GENERATOR = "openai-project-memory-v1"
RETRYABLE_HTTP_STATUS_CODES = {429, 500, 502, 503, 504}
OPENAI_REASONING_EFFORTS = {"none", "minimal", "low", "medium", "high", "xhigh"}


class OpenAIMemoryGenerationError(MemoryGenerationError):
    pass


def _extract_text(response_payload: dict[str, Any]) -> str:
    output_text = response_payload.get("output_text")
    if isinstance(output_text, str) and output_text.strip():
        return output_text.strip()

    chunks: list[str] = []
    output = response_payload.get("output")
    if isinstance(output, list):
        for item in output:
            if not isinstance(item, dict):
                continue
            content = item.get("content")
            if not isinstance(content, list):
                continue
            for part in content:
                if not isinstance(part, dict):
                    continue
                text = part.get("text")
                if isinstance(text, str) and text.strip():
                    chunks.append(text)
                refusal = part.get("refusal")
                if isinstance(refusal, str) and refusal.strip():
                    raise OpenAIMemoryGenerationError("OpenAI refused memory generation.")

    text = "".join(chunks).strip()
    if not text:
        raise OpenAIMemoryGenerationError("OpenAI response text was empty.")
    return text


def _retry_delay(exc: error.HTTPError | None, attempt: int) -> float:
    return bounded_retry_delay(
        attempt=attempt,
        base_seconds=settings.openai_retry_base_seconds,
        header_delay=retry_after_header_delay(exc.headers) if exc is not None else None,
        max_sleep_seconds=settings.openai_retry_max_sleep_seconds,
    )


def _request_openai_json(
    prompt: str,
    *,
    stage: str = "memory_generation",
) -> dict[str, Any]:
    if not settings.openai_api_key:
        raise OpenAIMemoryGenerationError("OpenAI API key is not configured.")

    model = settings.openai_model.strip() or "gpt-5-mini"
    output_max_tokens = max(
        int(getattr(settings, "memory_provider_output_max_tokens", 8_192)),
        1,
    )
    response_max_bytes = max(
        int(getattr(settings, "memory_provider_response_max_bytes", 1_048_576)),
        1,
    )
    deadline = ProviderWallDeadline.start(
        float(getattr(settings, "memory_provider_wall_deadline_seconds", 120.0))
    )
    body = {
        "input": prompt,
        "max_output_tokens": output_max_tokens,
        "model": model,
        "store": False,
        "text": {
            "format": {"type": "json_object"},
            "verbosity": "low",
        },
    }
    reasoning_effort = settings.openai_reasoning_effort.strip().lower()
    if reasoning_effort in OPENAI_REASONING_EFFORTS:
        body["reasoning"] = {"effort": reasoning_effort}
    request_payload = json.dumps(body).encode("utf-8")
    max_retries = max(settings.openai_max_retries, 0)
    last_error: OpenAIMemoryGenerationError | None = None

    for attempt in range(max_retries + 1):
        metrics = ProviderRequestAttempt(
            provider="openai",
            model=model,
            stage=stage,
            request_bytes=len(request_payload),
            attempt=attempt + 1,
        )
        http_request = request.Request(
            "https://api.openai.com/v1/responses",
            data=request_payload,
            headers={
                "Authorization": f"Bearer {settings.openai_api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with request.urlopen(
                http_request,
                timeout=deadline.request_timeout(
                    max(settings.openai_timeout_seconds, 1),
                ),
            ) as response:
                status_code = response_status(response)
                response_payload = json.loads(
                    read_limited_response(
                        response,
                        deadline=deadline,
                        max_bytes=response_max_bytes,
                    ).decode("utf-8")
                )
            parsed = parse_json_text(
                _extract_text(response_payload),
                error_cls=OpenAIMemoryGenerationError,
                provider="OpenAI",
            )
            deadline.remaining_seconds()
            metrics.finish(outcome="success", status=status_code)
            return parsed
        except ProviderResponseTooLargeError:
            metrics.finish(outcome="failure", status="response_too_large")
            raise OpenAIMemoryGenerationError(
                "OpenAI response exceeded the configured size limit."
            ) from None
        except ProviderWallDeadlineExceededError:
            metrics.finish(outcome="failure", status="deadline_exceeded")
            raise OpenAIMemoryGenerationError(
                "OpenAI request exceeded the configured time limit."
            ) from None
        except error.HTTPError as exc:
            last_error = OpenAIMemoryGenerationError(
                f"OpenAI request failed with HTTP status {exc.code}."
            )
            should_retry = exc.code in RETRYABLE_HTTP_STATUS_CODES and attempt < max_retries
            if should_retry:
                delay = _retry_delay(exc, attempt)
                try:
                    sleep_before_retry_with_deadline(
                        deadline,
                        delay,
                        sleep_before_retry,
                    )
                except ProviderWallDeadlineExceededError:
                    metrics.finish(outcome="failure", status="deadline_exceeded")
                    raise OpenAIMemoryGenerationError(
                        "OpenAI request exceeded the configured time limit."
                    ) from None
                metrics.finish(outcome="retry", status=f"http_{exc.code}")
                continue
            metrics.finish(
                outcome="failure",
                status=f"http_{exc.code}",
            )
            raise last_error from None
        except (error.URLError, TimeoutError):
            try:
                deadline.remaining_seconds()
            except ProviderWallDeadlineExceededError:
                metrics.finish(outcome="failure", status="deadline_exceeded")
                raise OpenAIMemoryGenerationError(
                    "OpenAI request exceeded the configured time limit."
                ) from None
            last_error = OpenAIMemoryGenerationError(
                "OpenAI request failed before receiving an HTTP response."
            )
            should_retry = attempt < max_retries
            if should_retry:
                delay = _retry_delay(None, attempt)
                try:
                    sleep_before_retry_with_deadline(
                        deadline,
                        delay,
                        sleep_before_retry,
                    )
                except ProviderWallDeadlineExceededError:
                    metrics.finish(outcome="failure", status="deadline_exceeded")
                    raise OpenAIMemoryGenerationError(
                        "OpenAI request exceeded the configured time limit."
                    ) from None
                metrics.finish(outcome="retry", status="transport_error")
                continue
            metrics.finish(
                outcome="failure",
                status="transport_error",
            )
            raise last_error from None
        except json.JSONDecodeError:
            last_error = OpenAIMemoryGenerationError("OpenAI returned an invalid JSON response.")
            should_retry = attempt < max_retries
            if should_retry:
                delay = _retry_delay(None, attempt)
                try:
                    sleep_before_retry_with_deadline(
                        deadline,
                        delay,
                        sleep_before_retry,
                    )
                except ProviderWallDeadlineExceededError:
                    metrics.finish(outcome="failure", status="deadline_exceeded")
                    raise OpenAIMemoryGenerationError(
                        "OpenAI request exceeded the configured time limit."
                    ) from None
                metrics.finish(outcome="retry", status="invalid_json")
                continue
            metrics.finish(
                outcome="failure",
                status="invalid_json",
            )
            raise last_error from None
        except OpenAIMemoryGenerationError:
            metrics.finish(outcome="failure", status="invalid_response")
            raise OpenAIMemoryGenerationError("OpenAI returned an invalid response.") from None
        except Exception:
            metrics.finish(outcome="failure", status="unexpected_error")
            raise OpenAIMemoryGenerationError(
                "OpenAI request failed before a valid response was produced."
            ) from None

    if last_error is not None:
        raise last_error
    raise OpenAIMemoryGenerationError("OpenAI request failed.")


def generate_openai_memory_drafts(context: dict[str, Any]) -> dict[str, Any]:
    generated = _request_openai_json(
        build_memory_draft_prompt(context),
        stage="memory_draft_generation",
    )
    return MemoryDraftGeneration.parse_obj(clean_memory_drafts_response(generated, context)).dict()


def generate_openai_project_memory(context: dict[str, Any]) -> dict[str, Any]:
    generated = _request_openai_json(
        build_project_memory_prompt(context),
        stage="project_memory_generation",
    )
    return ProjectMemorySnapshot.parse_obj(clean_project_memory_response(generated, context)).dict()
