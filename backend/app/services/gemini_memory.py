from __future__ import annotations

import json
from typing import Any
from urllib import error, parse, request

from app.core.config import settings

GEMINI_MEMORY_GENERATOR = "gemini-session-v1"
MAX_CHANGED_FILES = 60
MAX_EVENT_TIMELINE = 80
MAX_PROMPTS = 10
MAX_RESPONSE_SAMPLES = 3


class GeminiMemoryGenerationError(RuntimeError):
    pass


def _truncate(value: str | None, limit: int) -> str | None:
    if value is None:
        return None
    cleaned = " ".join(value.split())
    return cleaned if len(cleaned) <= limit else f"{cleaned[: limit - 3].rstrip()}..."


def _compact_files(files: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "additions": file.get("additions"),
            "deletions": file.get("deletions"),
            "path": file.get("path"),
            "status": file.get("status"),
        }
        for file in files[:MAX_CHANGED_FILES]
        if file.get("path")
    ]


def _compact_commits(commits: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "hash": _truncate(commit.get("hash"), 16),
            "message": _truncate(commit.get("message"), 180),
        }
        for commit in commits[-5:]
    ]


def _select_prompts(prompts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if len(prompts) <= MAX_PROMPTS:
        selected = prompts
    else:
        first_count = 3
        last_count = MAX_PROMPTS - first_count
        selected = [*prompts[:first_count], *prompts[-last_count:]]

    return [
        {
            "id": prompt["id"],
            "prompt": _truncate(prompt["prompt"], 700),
            "sequence": prompt["sequence"],
        }
        for prompt in selected
        if prompt.get("prompt")
    ]


def _compact_responses(responses: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "response": _truncate(response["response"], 320),
            "sequence": response["sequence"],
        }
        for response in responses[-MAX_RESPONSE_SAMPLES:]
        if response.get("response")
    ]


def _compact_event(event: dict[str, Any]) -> dict[str, Any]:
    payload = event.get("payload") if isinstance(event.get("payload"), dict) else {}
    event_type = event.get("event_type")
    compact_payload: dict[str, Any] = {}

    if event_type == "PromptSubmitted":
        compact_payload = {
            "prompt": _truncate(payload.get("prompt"), 220),
            "turn_id": payload.get("turn_id"),
        }
    elif event_type == "ResponseReceived":
        compact_payload = {
            "success": payload.get("success"),
            "turn_id": payload.get("turn_id"),
        }
    elif event_type == "FilesChanged":
        files = payload.get("files") if isinstance(payload.get("files"), list) else []
        compact_payload = {
            "file_count": len(files),
            "files": files[:8],
        }
    elif event_type == "CommitCreated":
        compact_payload = {
            "hash": _truncate(payload.get("hash"), 16),
            "message": _truncate(payload.get("message"), 180),
        }

    return {
        "event_type": event_type,
        "payload": compact_payload,
        "sequence": event.get("sequence"),
        "timestamp": event.get("timestamp"),
    }


def _response_success_count(events: list[dict[str, Any]]) -> int:
    return sum(
        1
        for event in events
        if event.get("event_type") == "ResponseReceived"
        and isinstance(event.get("payload"), dict)
        and event["payload"].get("success") is True
    )


def _evidence_bullets(context: dict[str, Any]) -> list[str]:
    changed_files = context["changed_files"]
    commits = context["commits"]
    prompts = context["prompt_events"]
    responses = context["responses"]
    events = context["events"]

    bullets = [
        (
            f"{context['project_name']} session captured {context['event_count']} events, "
            f"{len(prompts)} prompts, {len(responses)} AI responses, and "
            f"{len(changed_files)} changed files."
        )
    ]
    if prompts:
        bullets.append(f"Initial user intent: {_truncate(prompts[0].get('prompt'), 260)}")
    if len(prompts) > 1:
        bullets.append(f"Latest user request: {_truncate(prompts[-1].get('prompt'), 260)}")
    if commits:
        latest_commit = commits[-1]
        bullets.append(
            "Latest commit: "
            f"{_truncate(latest_commit.get('message') or latest_commit.get('hash'), 220)}"
        )
    if changed_files:
        sample_paths = ", ".join(
            file["path"] for file in changed_files[:12] if isinstance(file.get("path"), str)
        )
        bullets.append(f"Changed file sample: {sample_paths}")
    success_count = _response_success_count(events)
    if success_count:
        bullets.append(f"{success_count} AI responses reported success.")
    return [bullet for bullet in bullets if bullet and not bullet.endswith("None")]


def _compact_context(context: dict[str, Any]) -> dict[str, Any]:
    prompts = context["prompt_events"]
    changed_files = context["changed_files"]
    commits = context["commits"]
    responses = context["responses"]
    events = context["events"]

    return {
        "changed_file_count": len(changed_files),
        "changed_files": _compact_files(changed_files),
        "commit_count": len(commits),
        "commits": _compact_commits(commits),
        "event_count": context["event_count"],
        "event_timeline": [_compact_event(event) for event in events[-MAX_EVENT_TIMELINE:]],
        "evidence_bullets": _evidence_bullets(context),
        "omitted": {
            "changed_files": max(len(changed_files) - MAX_CHANGED_FILES, 0),
            "events": max(len(events) - MAX_EVENT_TIMELINE, 0),
            "prompts": max(len(prompts) - MAX_PROMPTS, 0),
            "responses": max(len(responses) - MAX_RESPONSE_SAMPLES, 0),
        },
        "prompts": _select_prompts(prompts),
        "response_count": context["response_count"],
        "response_samples": _compact_responses(responses),
        "session": {
            "id": context["session_id"],
            "model": context["model"],
            "project_name": context["project_name"],
            "tool": context["tool"],
        },
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
            "- Ground the summary only in the compact evidence.",
            "- Do not invent details omitted from the evidence.",
            "",
            "JSON shape:",
            json.dumps(
                {
                    "title": "short task title",
                    "summary": "1-2 sentence factual summary",
                    "reason": "why the change was requested or necessary",
                    "outcome": "what was completed or left unresolved",
                    "technologies": ["frameworks, languages, or tools involved"],
                    "sections": [
                        {
                            "title": "short section title",
                            "summary": "specific user-facing detail",
                        }
                    ],
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
                    "sections": fallback_payload["sections"],
                    "summary": fallback_payload["summary"],
                    "technologies": fallback_payload["technologies"],
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


def _clean_technologies(value: Any, fallback_technologies: list[str]) -> list[str]:
    if not isinstance(value, list):
        return fallback_technologies
    technologies = [
        technology.strip()
        for technology in value
        if isinstance(technology, str) and technology.strip()
    ]
    deduped = list(dict.fromkeys(technologies))
    return deduped[:12] or fallback_technologies


def _clean_sections(value: Any, fallback_sections: list[dict[str, str]]) -> list[dict[str, str]]:
    if not isinstance(value, list):
        return fallback_sections

    sections: list[dict[str, str]] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        title = _truncate(item.get("title"), 80)
        summary = _truncate(item.get("summary"), 360)
        if not title or not summary:
            continue
        sections.append({"summary": summary, "title": title})

    return sections[:6] or fallback_sections


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
        "sections": _clean_sections(generated.get("sections"), fallback_payload["sections"]),
        "summary": _truncate(generated.get("summary"), 800) or fallback_payload["summary"],
        "tags": _clean_tags(generated.get("tags"), fallback_payload["tags"]),
        "technologies": _clean_technologies(
            generated.get("technologies"),
            fallback_payload["technologies"],
        ),
        "title": _truncate(generated.get("title"), 180) or fallback_payload["title"],
    }
