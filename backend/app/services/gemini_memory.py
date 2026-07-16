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
from app.services.memory.provider_metrics import (
    ProviderRequestAttempt,
    response_status,
)
from app.services.memory.provider_limits import (
    ProviderResponseTooLargeError,
    ProviderWallDeadline,
    ProviderWallDeadlineExceededError,
    read_limited_response,
)

GEMINI_MEMORY_DRAFT_GENERATOR = "gemini-memory-draft-v1"
GEMINI_PROJECT_MEMORY_GENERATOR = "gemini-project-memory-v1"


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


def _request_gemini_json(
    prompt: str,
    *,
    stage: str = "memory_generation",
) -> dict[str, Any]:
    if not settings.gemini_api_key:
        raise GeminiMemoryGenerationError("Gemini API key is not configured.")

    model = settings.gemini_model.strip() or "gemini-2.5-flash"
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
            "maxOutputTokens": output_max_tokens,
            "responseMimeType": "application/json",
            "temperature": 0.2,
        },
    }
    request_payload = json.dumps(body).encode("utf-8")
    # Provider calls are intentionally at-most-once. A failed response is
    # surfaced to the batch instead of spending again on the same prompt.
    for attempt in range(1):
        metrics = ProviderRequestAttempt(
            provider="gemini",
            model=model,
            stage=stage,
            request_bytes=len(request_payload),
            attempt=attempt + 1,
        )
        http_request = request.Request(
            url,
            data=request_payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with request.urlopen(
                http_request,
                timeout=deadline.request_timeout(
                    max(settings.gemini_timeout_seconds, 1),
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
                error_cls=GeminiMemoryGenerationError,
                provider="Gemini",
            )
            deadline.remaining_seconds()
            metrics.finish(outcome="success", status=status_code)
            return parsed
        except ProviderResponseTooLargeError:
            metrics.finish(outcome="failure", status="response_too_large")
            raise GeminiMemoryGenerationError(
                "Gemini response exceeded the configured size limit."
            ) from None
        except ProviderWallDeadlineExceededError:
            metrics.finish(outcome="failure", status="deadline_exceeded")
            raise GeminiMemoryGenerationError(
                "Gemini request exceeded the configured time limit."
            ) from None
        except error.HTTPError as exc:
            provider_error = GeminiMemoryGenerationError(
                f"Gemini request failed with HTTP status {exc.code}."
            )
            metrics.finish(
                outcome="failure",
                status=f"http_{exc.code}",
            )
            raise provider_error from None
        except (error.URLError, TimeoutError):
            try:
                deadline.remaining_seconds()
            except ProviderWallDeadlineExceededError:
                metrics.finish(outcome="failure", status="deadline_exceeded")
                raise GeminiMemoryGenerationError(
                    "Gemini request exceeded the configured time limit."
                ) from None
            provider_error = GeminiMemoryGenerationError(
                "Gemini request failed before receiving an HTTP response."
            )
            metrics.finish(
                outcome="failure",
                status="transport_error",
            )
            raise provider_error from None
        except json.JSONDecodeError:
            metrics.finish(
                outcome="failure",
                status="invalid_json",
            )
            raise GeminiMemoryGenerationError(
                "Gemini returned an invalid JSON response."
            ) from None
        except GeminiMemoryGenerationError:
            metrics.finish(outcome="failure", status="invalid_response")
            raise GeminiMemoryGenerationError("Gemini returned an invalid response.") from None
        except Exception:
            metrics.finish(outcome="failure", status="unexpected_error")
            raise GeminiMemoryGenerationError(
                "Gemini request failed before a valid response was produced."
            ) from None

    raise GeminiMemoryGenerationError("Gemini request failed.")


def generate_gemini_memory_drafts(context: dict[str, Any]) -> dict[str, Any]:
    generated = _request_gemini_json(
        build_memory_draft_prompt(context),
        stage="memory_draft_generation",
    )
    return MemoryDraftGeneration.parse_obj(clean_memory_drafts_response(generated, context)).dict()


def generate_gemini_project_memory(context: dict[str, Any]) -> dict[str, Any]:
    generated = _request_gemini_json(
        build_project_memory_prompt(context),
        stage="project_memory_generation",
    )
    return ProjectMemorySnapshot.parse_obj(clean_project_memory_response(generated, context)).dict()
