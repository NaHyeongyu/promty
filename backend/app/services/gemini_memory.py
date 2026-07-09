from __future__ import annotations

import json
from typing import Any
from urllib import error, parse, request

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
from app.services.memory.retry import (
    bounded_retry_delay,
    retry_after_header_delay,
    retry_delay_from_text,
    sleep_before_retry,
)

GEMINI_MEMORY_DRAFT_GENERATOR = "gemini-memory-draft-v1"
GEMINI_PROJECT_MEMORY_GENERATOR = "gemini-project-memory-v1"
RETRYABLE_HTTP_STATUS_CODES = {429, 500, 502, 503, 504}


class GeminiMemoryGenerationError(MemoryGenerationError):
    pass


def _extract_text(response_payload: dict[str, Any]) -> str:
    candidates = response_payload.get("candidates")
    if not isinstance(candidates, list) or not candidates:
        raise GeminiMemoryGenerationError("Gemini response did not include candidates.")
    content = candidates[0].get("content") if isinstance(candidates[0], dict) else None
    parts = content.get("parts") if isinstance(content, dict) else None
    if not isinstance(parts, list):
        raise GeminiMemoryGenerationError("Gemini response did not include content parts.")
    text = "".join(part.get("text", "") for part in parts if isinstance(part, dict))
    if not text.strip():
        raise GeminiMemoryGenerationError("Gemini response text was empty.")
    return text.strip()


def _request_gemini_json(prompt: str) -> dict[str, Any]:
    if not settings.gemini_api_key:
        raise GeminiMemoryGenerationError("Gemini API key is not configured.")

    model = settings.gemini_model.strip() or "gemini-2.5-flash"
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{parse.quote(model)}:generateContent?"
        f"{parse.urlencode({'key': settings.gemini_api_key})}"
    )
    body = {
        "contents": [
            {
                "parts": [
                    {
                        "text": prompt,
                    }
                ],
                "role": "user",
            }
        ],
        "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": 0.2,
        },
    }
    request_payload = json.dumps(body).encode("utf-8")
    max_retries = max(settings.gemini_max_retries, 0)
    last_error: GeminiMemoryGenerationError | None = None
    for attempt in range(max_retries + 1):
        http_request = request.Request(
            url,
            data=request_payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with request.urlopen(
                http_request,
                timeout=max(settings.gemini_timeout_seconds, 1),
            ) as response:
                response_payload = json.loads(response.read().decode("utf-8"))
            return parse_json_text(
                _extract_text(response_payload),
                error_cls=GeminiMemoryGenerationError,
                provider="Gemini",
            )
        except error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            last_error = GeminiMemoryGenerationError(
                f"Gemini request failed with HTTP {exc.code}: {detail[:500]}"
            )
            if exc.code not in RETRYABLE_HTTP_STATUS_CODES or attempt >= max_retries:
                raise last_error from exc
            sleep_before_retry(_gemini_retry_delay(exc, detail, attempt))
        except (error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            last_error = GeminiMemoryGenerationError(f"Gemini request failed: {exc}")
            if attempt >= max_retries:
                raise last_error from exc
            sleep_before_retry(_gemini_retry_delay(None, "", attempt))

    if last_error is not None:
        raise last_error
    raise GeminiMemoryGenerationError("Gemini request failed.")


def _gemini_retry_delay(
    exc: error.HTTPError | None,
    detail: str,
    attempt: int,
) -> float:
    return bounded_retry_delay(
        attempt=attempt,
        base_seconds=settings.gemini_retry_base_seconds,
        body_delay=retry_delay_from_text(detail),
        header_delay=retry_after_header_delay(exc.headers) if exc is not None else None,
        max_sleep_seconds=settings.gemini_retry_max_sleep_seconds,
    )


def generate_gemini_memory_drafts(context: dict[str, Any]) -> dict[str, Any]:
    generated = _request_gemini_json(build_memory_draft_prompt(context))
    return MemoryDraftGeneration.parse_obj(
        clean_memory_drafts_response(generated, context)
    ).dict()


def generate_gemini_project_memory(context: dict[str, Any]) -> dict[str, Any]:
    generated = _request_gemini_json(build_project_memory_prompt(context))
    return ProjectMemorySnapshot.parse_obj(
        clean_project_memory_response(generated, context)
    ).dict()
