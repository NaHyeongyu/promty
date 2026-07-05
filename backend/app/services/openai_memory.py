from __future__ import annotations

import json
import time
from typing import Any
from urllib import error, request

from app.core.config import settings
from app.schemas.memory import (
    ChunkSummary,
    MemoryDraftGeneration,
    ProjectMemorySnapshot,
)
from app.services.gemini_memory import (
    GeminiMemoryGenerationError,
    _build_chunk_summary_prompt,
    _build_memory_draft_prompt,
    _build_project_memory_prompt,
    _build_prompt,
    _clean_chunk_summary,
    _clean_memory_drafts_response,
    _clean_project_memory_response,
    _clean_sections,
    _clean_tags,
    _clean_technologies,
    _parse_json_text,
    _truncate,
)

OPENAI_MEMORY_GENERATOR = "openai-memory-slice-v1"
OPENAI_CHUNK_SUMMARY_GENERATOR = "openai-chunk-summary-v1"
OPENAI_MEMORY_DRAFT_GENERATOR = "openai-memory-draft-v1"
OPENAI_PROJECT_MEMORY_GENERATOR = "openai-project-memory-v1"
RETRYABLE_HTTP_STATUS_CODES = {429, 500, 502, 503, 504}
OPENAI_REASONING_EFFORTS = {"none", "minimal", "low", "medium", "high", "xhigh"}


class OpenAIMemoryGenerationError(GeminiMemoryGenerationError):
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
                    raise OpenAIMemoryGenerationError(f"OpenAI refused memory generation: {refusal}")

    text = "".join(chunks).strip()
    if not text:
        raise OpenAIMemoryGenerationError("OpenAI response text was empty.")
    return text


def _retry_delay(exc: error.HTTPError | None, attempt: int) -> float:
    header_delay = None
    if exc is not None:
        retry_after = exc.headers.get("Retry-After")
        if retry_after:
            try:
                header_delay = float(retry_after)
            except ValueError:
                header_delay = None

    fallback_delay = max(settings.openai_retry_base_seconds, 0.1) * (2**attempt)
    delay = header_delay or fallback_delay
    return max(0.1, min(delay, max(settings.openai_retry_max_sleep_seconds, 0.1)))


def _request_openai_json(prompt: str) -> dict[str, Any]:
    if not settings.openai_api_key:
        raise OpenAIMemoryGenerationError("OpenAI API key is not configured.")

    model = settings.openai_model.strip() or "gpt-5-mini"
    body = {
        "input": prompt,
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
                timeout=max(settings.openai_timeout_seconds, 1),
            ) as response:
                response_payload = json.loads(response.read().decode("utf-8"))
            return _parse_json_text(_extract_text(response_payload))
        except error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            last_error = OpenAIMemoryGenerationError(
                f"OpenAI request failed with HTTP {exc.code}: {detail[:500]}"
            )
            if exc.code not in RETRYABLE_HTTP_STATUS_CODES or attempt >= max_retries:
                raise last_error from exc
            time.sleep(_retry_delay(exc, attempt))
        except (error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            last_error = OpenAIMemoryGenerationError(f"OpenAI request failed: {exc}")
            if attempt >= max_retries:
                raise last_error from exc
            time.sleep(_retry_delay(None, attempt))

    if last_error is not None:
        raise last_error
    raise OpenAIMemoryGenerationError("OpenAI request failed.")


def generate_openai_memory_payload(
    *,
    context: dict[str, Any],
    fallback_payload: dict[str, Any],
) -> dict[str, Any]:
    generated = _request_openai_json(_build_prompt(context, fallback_payload))
    return {
        **fallback_payload,
        "generator": OPENAI_MEMORY_GENERATOR,
        "outcome": _truncate(generated.get("outcome"), 1000) or fallback_payload["outcome"],
        "reason": _truncate(generated.get("reason"), 1200) or fallback_payload["reason"],
        "sections": _clean_sections(generated.get("sections"), fallback_payload["sections"]),
        "summary": _truncate(generated.get("summary"), 800) or fallback_payload["summary"],
        "tags": _clean_tags(generated.get("tags"), fallback_payload["tags"]),
        "technologies": _clean_technologies(
            generated.get("technologies"),
            fallback_payload["technologies"],
        ),
        "title": _truncate(generated.get("title"), 180) or fallback_payload["title"],
    }


def generate_openai_chunk_summary(context: dict[str, Any]) -> dict[str, Any]:
    generated = _request_openai_json(_build_chunk_summary_prompt(context))
    return ChunkSummary.parse_obj(_clean_chunk_summary(generated, context)).dict()


def generate_openai_memory_drafts(context: dict[str, Any]) -> dict[str, Any]:
    generated = _request_openai_json(_build_memory_draft_prompt(context))
    return MemoryDraftGeneration.parse_obj(
        _clean_memory_drafts_response(generated, context)
    ).dict()


def generate_openai_project_memory(context: dict[str, Any]) -> dict[str, Any]:
    generated = _request_openai_json(_build_project_memory_prompt(context))
    return ProjectMemorySnapshot.parse_obj(
        _clean_project_memory_response(generated, context)
    ).dict()
