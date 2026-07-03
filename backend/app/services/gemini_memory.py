from __future__ import annotations

import json
from typing import Any
from urllib import error, parse, request

from app.core.config import settings

GEMINI_MEMORY_GENERATOR = "gemini-session-v1"


class GeminiMemoryGenerationError(RuntimeError):
    pass


def _truncate(value: str | None, limit: int) -> str | None:
    if value is None:
        return None
    cleaned = " ".join(value.split())
    return cleaned if len(cleaned) <= limit else f"{cleaned[: limit - 3].rstrip()}..."


def _compact_context(context: dict[str, Any]) -> dict[str, Any]:
    return {
        "changed_files": context["changed_files"][:80],
        "commits": context["commits"][-5:],
        "event_count": context["event_count"],
        "events": [
            {
                "event_type": event["event_type"],
                "payload": event["payload"],
                "sequence": event["sequence"],
                "timestamp": event["timestamp"],
            }
            for event in context["events"][-120:]
        ],
        "model": context["model"],
        "project_name": context["project_name"],
        "prompt_count": len(context["prompt_events"]),
        "prompts": [
            {
                "id": prompt["id"],
                "prompt": _truncate(prompt["prompt"], 1800),
                "sequence": prompt["sequence"],
            }
            for prompt in context["prompt_events"][-30:]
        ],
        "response_count": context["response_count"],
        "responses": [
            {
                "response": _truncate(response["response"], 1400),
                "sequence": response["sequence"],
            }
            for response in context["responses"][-20:]
            if response["response"]
        ],
        "session_id": context["session_id"],
        "tool": context["tool"],
    }


def _build_prompt(context: dict[str, Any], fallback_payload: dict[str, Any]) -> str:
    compact_context = _compact_context(context)
    return "\n".join(
        [
            "You are generating Promty project memory from one completed AI development session.",
            "Return strict JSON only. Do not include markdown fences.",
            "",
            "Goal:",
            "- Explain what meaningful development task happened.",
            "- Capture why it happened, how it changed, and the outcome.",
            "- Ground the summary only in the provided evidence.",
            "",
            "JSON shape:",
            json.dumps(
                {
                    "title": "short task title",
                    "summary": "1-2 sentence factual summary",
                    "reason": "why the change was requested or necessary",
                    "outcome": "what was completed or left unresolved",
                    "tags": ["short", "lowercase", "tags"],
                },
                indent=2,
            ),
            "",
            "Fallback local summary:",
            json.dumps(
                {
                    "outcome": fallback_payload["outcome"],
                    "reason": fallback_payload["reason"],
                    "summary": fallback_payload["summary"],
                    "title": fallback_payload["title"],
                },
                ensure_ascii=False,
            ),
            "",
            "Session evidence:",
            json.dumps(compact_context, ensure_ascii=False),
        ]
    )


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


def _parse_json_text(text: str) -> dict[str, Any]:
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as exc:
        raise GeminiMemoryGenerationError("Gemini response was not valid JSON.") from exc
    if not isinstance(parsed, dict):
        raise GeminiMemoryGenerationError("Gemini response JSON must be an object.")
    return parsed


def _clean_tags(value: Any, fallback_tags: list[str]) -> list[str]:
    if not isinstance(value, list):
        return fallback_tags
    tags = [
        tag.strip().lower().replace(" ", "-")
        for tag in value
        if isinstance(tag, str) and tag.strip()
    ]
    return sorted(set(tags))[:12] or fallback_tags


def generate_gemini_memory_payload(
    *,
    context: dict[str, Any],
    fallback_payload: dict[str, Any],
) -> dict[str, Any]:
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
                        "text": _build_prompt(context, fallback_payload),
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
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise GeminiMemoryGenerationError(
            f"Gemini request failed with HTTP {exc.code}: {detail[:500]}"
        ) from exc
    except (error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise GeminiMemoryGenerationError(f"Gemini request failed: {exc}") from exc

    generated = _parse_json_text(_extract_text(response_payload))
    return {
        **fallback_payload,
        "generator": GEMINI_MEMORY_GENERATOR,
        "outcome": _truncate(generated.get("outcome"), 1000) or fallback_payload["outcome"],
        "reason": _truncate(generated.get("reason"), 1200) or fallback_payload["reason"],
        "summary": _truncate(generated.get("summary"), 800) or fallback_payload["summary"],
        "tags": _clean_tags(generated.get("tags"), fallback_payload["tags"]),
        "title": _truncate(generated.get("title"), 180) or fallback_payload["title"],
    }
