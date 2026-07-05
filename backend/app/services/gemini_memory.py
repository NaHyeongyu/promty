from __future__ import annotations

import json
import re
import time
from typing import Any
from urllib import error, parse, request

from app.core.config import settings
from app.schemas.memory import (
    ChunkSummary,
    MemoryDraftGeneration,
    ProjectMemorySnapshot,
)

GEMINI_MEMORY_GENERATOR = "gemini-memory-slice-v1"
GEMINI_CHUNK_SUMMARY_GENERATOR = "gemini-chunk-summary-v1"
GEMINI_MEMORY_DRAFT_GENERATOR = "gemini-memory-draft-v1"
MAX_CHANGED_FILES = 60
MAX_EVENT_TIMELINE = 80
MAX_PROMPTS = 10
MAX_RESPONSE_SAMPLES = 3
RETRYABLE_HTTP_STATUS_CODES = {429, 500, 502, 503, 504}


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
            "prompt_ai_preview_truncated": prompt.get("prompt_ai_preview_truncated") is True,
            "prompt_original_size": prompt.get("prompt_original_size"),
            "sequence": prompt["sequence"],
            "turn_id": prompt.get("turn_id"),
        }
        for prompt in selected
        if prompt.get("prompt")
    ]


def _compact_responses(responses: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "response": _truncate(response["response"], 320),
            "sequence": response["sequence"],
            "turn_id": response.get("turn_id"),
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
            "prompt_ai_preview_truncated": payload.get("prompt_ai_preview_truncated") is True,
            "prompt_original_size": payload.get("prompt_original_size"),
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
            "metadata_only": True,
            "hash": _truncate(payload.get("hash"), 16),
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
    memory_chunks = (
        context.get("memory_chunks") if isinstance(context.get("memory_chunks"), list) else []
    )

    return {
        "changed_file_count": len(changed_files),
        "changed_files": _compact_files(changed_files),
        "commit_count": len(commits),
        "commit_metadata": {
            "hashes": [
                commit.get("hash")
                for commit in commits[-5:]
                if isinstance(commit.get("hash"), str) and commit.get("hash")
            ],
            "metadata_only": True,
        },
        "event_count": context["event_count"],
        "event_timeline": [_compact_event(event) for event in events[-MAX_EVENT_TIMELINE:]],
        "evidence_bullets": _evidence_bullets(context),
        "memory_chunks": memory_chunks,
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
        "window": context.get("slice") if isinstance(context.get("slice"), dict) else None,
    }


def _build_prompt(context: dict[str, Any], fallback_payload: dict[str, Any]) -> str:
    compact_context = _compact_context(context)
    return "\n".join(
        [
            "You are generating Promty project memory from a bounded AI development slice.",
            "The slice may cover only part of a longer session.",
            "Return strict JSON only. Do not include markdown fences.",
            "",
            "Goal:",
            "- Explain what meaningful development task happened.",
            "- Capture why it happened, how it changed, and the outcome.",
            "- Ground the summary only in the compact evidence.",
            "- Do not invent details omitted from the evidence.",
            "- Commit events are metadata only; do not use commit messages as the reason, trigger, or main evidence.",
            "- If a prompt is marked prompt_ai_preview_truncated, infer intent mainly from the paired AI output with the same turn_id.",
            "- Prefer memory_chunks when present; they are internal first-pass summaries.",
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


def _build_chunk_summary_prompt(context: dict[str, Any]) -> str:
    compact_context = _compact_context(context)
    slice_metadata = context.get("slice") if isinstance(context.get("slice"), dict) else {}
    chunk_index = slice_metadata.get("slice_index") if isinstance(slice_metadata, dict) else None
    project_context = {
        "model": context.get("model"),
        "project_id": context.get("project_id"),
        "project_name": context.get("project_name"),
        "session_id": context.get("session_id"),
        "summary_level": 1,
        "tool": context.get("tool"),
        "window": slice_metadata or None,
    }
    events_json = {
        "event_timeline": compact_context["event_timeline"],
        "prompts": compact_context["prompts"],
        "response_samples": compact_context["response_samples"],
    }
    changed_files_json = {
        "changed_file_count": compact_context["changed_file_count"],
        "changed_files": compact_context["changed_files"],
        "omitted_changed_files": compact_context["omitted"]["changed_files"],
    }
    commits_json = {
        **compact_context["commit_metadata"],
        "commit_count": compact_context["commit_count"],
    }
    return "\n".join(
        [
            "You are Promty's internal chunk summary assistant.",
            "",
            "Your job is NOT to create a final user-facing memory.",
            "Your job is to compress one chunk of AI coding conversation into a structured intermediate summary.",
            "",
            "This summary will be used later by another model to create user-facing Memory Drafts.",
            "",
            "You are working inside Promty, a developer-focused product that turns AI coding conversations into work logs, decision notes, and reusable project memory.",
            "",
            "The current Promty memory flow is:",
            "Raw Events",
            "→ Active Buffer",
            "→ every 20 PromptSubmitted events, create an internal chunk summary",
            "→ on idle 1 hour / SessionEnded / manual checkpoint, combine chunk summaries and remaining previews into Memory Drafts",
            "→ user Save/Edit/Ignore",
            "→ Verified Memory",
            "→ Project Memory",
            "",
            "This is a first-pass internal summary.",
            "Do not make it polished for the user.",
            "Do not create final memory drafts.",
            "Do not create project memory.",
            "Only extract the important information from this chunk.",
            "",
            "Focus on:",
            "- what the user was trying to do",
            "- what problem, question, or decision was being discussed",
            "- what explanation, cause, or direction the AI provided",
            "- what direction the user accepted, rejected, or corrected",
            "- important decisions or decision candidates",
            "- rejected directions",
            "- unresolved questions",
            "- information that may be useful for future AI coding sessions",
            "",
            "Important rules:",
            "1. Do not summarize every message. Extract only information that could matter for future project understanding.",
            '2. Do not invent missing context. If something is unclear, put it in "uncertainties".',
            "3. Separate confirmed facts from inferred points. Use confidence scores between 0 and 1.",
            "4. If a user input or AI output is marked as large or truncated, do not pretend you saw the full content.",
            "5. For large user prompts, infer the issue mainly from the paired AI output, not from the missing raw content.",
            '6. If the cause comes from the AI answer, phrase it as "AI answer suggested..." or "AI 답변 기준으로는...".',
            "7. Do not state an AI-suggested cause as confirmed truth unless the user explicitly confirmed it.",
            "8. Commit messages are metadata only. Use them as weak hints, not as primary evidence. Do not treat commits as summary triggers.",
            "9. Changed file metadata is allowed as supporting context. Do not assume exact code behavior from file names alone.",
            '10. Pay special attention when the user corrects the direction, for example "아니야", "다시 생각해보자", "현실성 없어", "이걸로 가자", "이건 제외하자".',
            "11. Every important claim must include source_event_ids.",
            "12. Return JSON only. Do not include markdown. Do not include explanations outside the JSON.",
            "",
            "Project context:",
            json.dumps(project_context, ensure_ascii=False),
            "",
            "Input events:",
            json.dumps(events_json, ensure_ascii=False),
            "",
            "Changed file metadata:",
            json.dumps(changed_files_json, ensure_ascii=False),
            "",
            "Commit metadata:",
            json.dumps(commits_json, ensure_ascii=False),
            "",
            "Return this JSON schema:",
            json.dumps(
                {
                    "chunk_index": chunk_index or 1,
                    "summary_level": 1,
                    "chunk_purpose": "internal_summary",
                    "source_event_ids": ["event id"],
                    "main_topics": ["topic"],
                    "user_intents": [
                        {
                            "intent": "string",
                            "source_event_ids": ["event id"],
                            "confidence": 0.0,
                        }
                    ],
                    "ai_explanations": [
                        {
                            "explanation": "string",
                            "based_on": "ai_answer",
                            "source_event_ids": ["event id"],
                            "confidence": 0.0,
                            "is_inferred": True,
                        }
                    ],
                    "decisions_or_directions": [
                        {
                            "content": "string",
                            "reason": None,
                            "source_event_ids": ["event id"],
                            "confidence": 0.0,
                        }
                    ],
                    "rejected_directions": [
                        {
                            "content": "string",
                            "reason": None,
                            "source_event_ids": ["event id"],
                            "confidence": 0.0,
                        }
                    ],
                    "implementation_signals": [
                        {
                            "content": "string",
                            "based_on": "changed_files",
                            "source_event_ids": ["event id"],
                            "confidence": 0.0,
                        }
                    ],
                    "important_for_project_memory": [
                        {
                            "content": "string",
                            "reason": "string",
                            "source_event_ids": ["event id"],
                            "confidence": 0.0,
                        }
                    ],
                    "open_questions": [
                        {
                            "question": "string",
                            "source_event_ids": ["event id"],
                        }
                    ],
                    "uncertainties": [
                        {
                            "content": "string",
                            "reason": "string",
                            "source_event_ids": ["event id"],
                        }
                    ],
                    "handoff_summary_for_second_pass": "string",
                },
                ensure_ascii=False,
                indent=2,
            ),
        ]
    )


def _build_memory_draft_prompt(context: dict[str, Any]) -> str:
    compact_context = _compact_context(context)
    memory_chunks = compact_context["memory_chunks"]
    source_chunk_ids = [
        chunk.get("id")
        for chunk in memory_chunks
        if isinstance(chunk, dict) and isinstance(chunk.get("id"), str)
    ]
    project_context = {
        "model": context.get("model"),
        "project_id": context.get("project_id"),
        "project_name": context.get("project_name"),
        "session_id": context.get("session_id"),
        "tool": context.get("tool"),
    }
    finalize_trigger = {
        "reason": context.get("trigger_reason"),
        "summary_level": 2,
        "window": context.get("slice") if isinstance(context.get("slice"), dict) else None,
    }
    remaining_event_previews = (
        context.get("remaining_event_previews")
        if isinstance(context.get("remaining_event_previews"), list)
        else compact_context["event_timeline"]
    )
    remaining_events = {
        "event_timeline": remaining_event_previews,
        "omitted_note": (
            "Only events after the last internal chunk are included here when chunk summaries exist."
        ),
    }
    changed_files = {
        "changed_file_count": compact_context["changed_file_count"],
        "changed_files": compact_context["changed_files"],
        "omitted_changed_files": compact_context["omitted"]["changed_files"],
    }
    commit_metadata = {
        **compact_context["commit_metadata"],
        "commit_count": compact_context["commit_count"],
    }
    return "\n".join(
        [
            "You are Promty's memory draft assistant.",
            "",
            "Your job is to create user-facing Memory Drafts from internal chunk summaries, remaining event previews, and metadata.",
            "",
            "These Memory Drafts will be shown to the user, who can Save, Edit, or Ignore them.",
            "",
            "You are working inside Promty, a developer-focused product that turns AI coding conversations into work logs, decision notes, and reusable project memory.",
            "",
            "The current Promty memory flow is:",
            "Raw Events",
            "→ Active Buffer",
            "→ every 20 PromptSubmitted events, create an internal chunk summary",
            "→ on idle 1 hour / SessionEnded / manual checkpoint, combine chunk summaries and remaining previews into Memory Drafts",
            "→ user Save/Edit/Ignore",
            "→ Verified Memory",
            "→ Project Memory",
            "",
            "This is a second-pass user-facing draft generation step.",
            "Your job is NOT to create final Project Memory.",
            "Your job is to create useful Memory Drafts that the user can review.",
            "",
            "Important:",
            "Do not create one broad summary if there are multiple distinct decisions, topics, or work streams.",
            "Split them into multiple memory_drafts.",
            "",
            "Draft types:",
            "- work_log: concrete implementation or development progress",
            "- thinking_note: brainstorming, product reasoning, problem definition",
            "- decision_note: clear decision and reasoning",
            "- issue_note: unresolved issue, risk, or technical limitation",
            "- process_note: workflow or process policy",
            "",
            "Important rules:",
            "1. Use only the provided chunk summaries, remaining event previews, changed file metadata, and commit metadata.",
            '2. Do not invent missing details. If something is unclear, put it in "overall_uncertainties" or mark the draft as needs_user_verification.',
            "3. Separate confirmed facts from inferred points. Use confidence scores between 0 and 1.",
            '4. If a cause came from an AI answer, phrase it as "AI answer suggested..." or "AI 답변 기준으로는...".',
            "5. If an input or output was large/truncated, do not claim to have analyzed the full content.",
            "6. For large user prompts, infer the issue mainly from the paired AI output, not from the missing raw content.",
            "7. Commit messages are metadata only. Use them as weak hints, not primary evidence. Do not treat commits as summary triggers.",
            "8. Changed file metadata can support implementation context. Do not infer exact code behavior from file names alone.",
            "9. Prefer specific Memory Drafts over vague session summaries.",
            '10. If the user rejected a direction, corrected the AI, or said something like "아니야", "현실성 없어", "다시 생각해보자", "이걸로 가자", capture that as an important product decision signal.',
            "11. Include rejected directions if they shaped the final direction.",
            "12. Every Memory Draft must include source_event_ids and source_chunk_ids.",
            '13. Suggested user action: "save" if likely useful and clear, "edit" if useful but uncertain, "ignore" if vague or low-signal.',
            "14. Return JSON only. Do not include markdown. Do not include explanations outside the JSON.",
            "",
            "Project context:",
            json.dumps(project_context, ensure_ascii=False),
            "",
            "Finalize trigger:",
            json.dumps(finalize_trigger, ensure_ascii=False),
            "",
            "Internal chunk summaries:",
            json.dumps(memory_chunks, ensure_ascii=False),
            "",
            "Remaining event previews:",
            json.dumps(remaining_events, ensure_ascii=False),
            "",
            "Changed file metadata:",
            json.dumps(changed_files, ensure_ascii=False),
            "",
            "Commit metadata:",
            json.dumps(commit_metadata, ensure_ascii=False),
            "",
            "Return this JSON schema:",
            json.dumps(
                {
                    "summary_level": 2,
                    "draft_generation_reason": "string",
                    "source_chunk_ids": source_chunk_ids,
                    "source_event_ids": ["event id"],
                    "memory_drafts": [
                        {
                            "type": "work_log",
                            "title": "string",
                            "summary": "string",
                            "why_it_matters": "string",
                            "details": {
                                "problem": None,
                                "why_started": None,
                                "what_happened": ["string"],
                                "decisions": [
                                    {
                                        "decision": "string",
                                        "reason": "string",
                                        "source_event_ids": ["event id"],
                                        "source_chunk_ids": source_chunk_ids,
                                        "confidence": 0.0,
                                    }
                                ],
                                "rejected_directions": [
                                    {
                                        "content": "string",
                                        "reason": None,
                                        "source_event_ids": ["event id"],
                                        "source_chunk_ids": source_chunk_ids,
                                        "confidence": 0.0,
                                    }
                                ],
                                "open_questions": [
                                    {
                                        "question": "string",
                                        "source_event_ids": ["event id"],
                                        "source_chunk_ids": source_chunk_ids,
                                    }
                                ],
                                "next_steps": ["string"],
                            },
                            "evidence": {
                                "source_event_ids": ["event id"],
                                "source_chunk_ids": source_chunk_ids,
                                "based_on": ["chunk_summary"],
                            },
                            "confidence": 0.0,
                            "needs_user_verification": False,
                            "suggested_user_action": "save",
                        }
                    ],
                    "overall_uncertainties": [
                        {
                            "content": "string",
                            "reason": "string",
                            "source_event_ids": ["event id"],
                            "source_chunk_ids": source_chunk_ids,
                        }
                    ],
                },
                ensure_ascii=False,
                indent=2,
            ),
        ]
    )


def _build_project_memory_prompt(context: dict[str, Any]) -> str:
    project_context = context.get("project_context")
    verified_memories = (
        context.get("verified_memories")
        if isinstance(context.get("verified_memories"), list)
        else []
    )
    previous_snapshot = context.get("previous_project_memory")
    source_memory_ids = [
        memory.get("id")
        for memory in verified_memories
        if isinstance(memory, dict) and isinstance(memory.get("id"), str)
    ]
    return "\n".join(
        [
            "You are Promty's Project Memory compiler.",
            "",
            "Your job is to compile verified memories into a concise Project Memory document that can be given to future AI coding agents such as Codex, Claude Code, Cursor, or other AI coding tools.",
            "",
            "You are working inside Promty, a developer-focused product that turns AI coding conversations into work logs, decision notes, and reusable project memory.",
            "",
            "The current Promty memory flow is:",
            "Raw Events",
            "→ Active Buffer",
            "→ every 20 PromptSubmitted events, create an internal chunk summary",
            "→ on idle 1 hour / SessionEnded / manual checkpoint, combine chunk summaries and remaining previews into Memory Drafts",
            "→ user Save/Edit/Ignore",
            "→ Verified Memory",
            "→ Project Memory",
            "",
            "This is the final Project Memory compilation step.",
            "",
            "Use only Verified Memories by default.",
            "Do not use internal chunk summaries.",
            "Do not use ignored drafts.",
            "Do not treat unverified Memory Drafts as source of truth unless they are explicitly marked as allowed.",
            "",
            "Your output should help a future AI coding agent quickly understand:",
            "- what the product is",
            "- what the current direction is",
            "- what decisions have already been made",
            "- which directions were rejected",
            "- what the current memory workflow is",
            "- what technical assumptions should be respected",
            "- what open questions remain",
            "- what the future AI should avoid repeating",
            "",
            "Important rules:",
            "1. Do not summarize raw conversations. Compile verified project knowledge.",
            "2. Do not include internal chunk summaries.",
            "3. Do not include ignored drafts.",
            "4. If memories conflict, prefer the most recent verified memory unless an older one is explicitly marked as still active.",
            '5. If a memory is marked as superseded, archived, or rejected, include it only in "Rejected Directions" or "Superseded Decisions" if it helps explain the current direction.',
            "6. Keep the output concise but useful. This document will be pasted into future AI coding sessions.",
            "7. Do not include unnecessary emotional or conversational details.",
            "8. Preserve concrete decisions, numbers, thresholds, and policies.",
            "9. Use clear section headings.",
            '10. Return JSON only. The JSON should contain a markdown string in "body_markdown".',
            "",
            "Project context:",
            json.dumps(project_context, ensure_ascii=False),
            "",
            "Verified memories:",
            json.dumps(verified_memories, ensure_ascii=False),
            "",
            "Optional previous project memory snapshot:",
            json.dumps(previous_snapshot, ensure_ascii=False),
            "",
            "Return this JSON schema:",
            json.dumps(
                {
                    "snapshot_type": "project_memory",
                    "source_memory_ids": source_memory_ids,
                    "body_markdown": "markdown string",
                    "sections": {
                        "product_goal": "string",
                        "current_direction": "string",
                        "core_workflow": ["string"],
                        "important_decisions": [
                            {
                                "decision": "string",
                                "reason": "string",
                                "source_memory_ids": source_memory_ids,
                            }
                        ],
                        "rejected_directions": [
                            {
                                "direction": "string",
                                "reason": "string",
                                "source_memory_ids": source_memory_ids,
                            }
                        ],
                        "technical_assumptions": ["string"],
                        "open_questions": ["string"],
                        "instructions_for_future_ai_agents": ["string"],
                    },
                    "confidence": 0.0,
                    "warnings": ["string"],
                },
                ensure_ascii=False,
                indent=2,
            ),
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


def _source_event_ids_from_context(context: dict[str, Any]) -> list[str]:
    ids = [
        prompt.get("id")
        for prompt in context.get("prompt_events", [])
        if isinstance(prompt, dict) and isinstance(prompt.get("id"), str)
    ]
    if not ids and isinstance(context.get("first_event_id"), str):
        ids.append(context["first_event_id"])
    if (
        isinstance(context.get("last_event_id"), str)
        and context["last_event_id"] not in ids
    ):
        ids.append(context["last_event_id"])
    return ids


def _clean_confidence(value: Any, fallback: float = 0.5) -> float:
    if isinstance(value, (int, float)):
        return max(0.0, min(float(value), 1.0))
    return fallback


def _clean_source_ids(value: Any, fallback_ids: list[str]) -> list[str]:
    if not isinstance(value, list):
        return fallback_ids
    ids = [item for item in value if isinstance(item, str) and item]
    return ids or fallback_ids


def _clean_chunk_items(
    value: Any,
    *,
    allowed_based_on: set[str] | None = None,
    fallback_ids: list[str],
    required_text_key: str,
) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    cleaned: list[dict[str, Any]] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        text = _truncate(item.get(required_text_key), 1000)
        if not text:
            continue
        cleaned_item: dict[str, Any] = {
            required_text_key: text,
            "source_event_ids": _clean_source_ids(
                item.get("source_event_ids"),
                fallback_ids,
            ),
        }
        if "confidence" in item:
            cleaned_item["confidence"] = _clean_confidence(item.get("confidence"))
        if "reason" in item:
            cleaned_item["reason"] = _truncate(item.get("reason"), 1000)
        if "is_inferred" in item:
            cleaned_item["is_inferred"] = item.get("is_inferred") is True
        if "based_on" in item:
            based_on = item.get("based_on")
            cleaned_item["based_on"] = (
                based_on
                if isinstance(based_on, str)
                and (allowed_based_on is None or based_on in allowed_based_on)
                else "user_input"
            )
        cleaned.append(cleaned_item)
    return cleaned[:12]


def _clean_chunk_summary(value: Any, context: dict[str, Any]) -> dict[str, Any]:
    fallback_ids = _source_event_ids_from_context(context)
    slice_metadata = context.get("slice") if isinstance(context.get("slice"), dict) else {}
    chunk_index = slice_metadata.get("slice_index") if isinstance(slice_metadata, dict) else None
    parsed = value if isinstance(value, dict) else {}
    return {
        "ai_explanations": _clean_chunk_items(
            parsed.get("ai_explanations"),
            allowed_based_on={"ai_answer", "user_input", "changed_files", "commit_metadata"},
            fallback_ids=fallback_ids,
            required_text_key="explanation",
        ),
        "chunk_index": chunk_index if isinstance(chunk_index, int) else parsed.get("chunk_index", 1),
        "chunk_purpose": "internal_summary",
        "decisions_or_directions": _clean_chunk_items(
            parsed.get("decisions_or_directions"),
            fallback_ids=fallback_ids,
            required_text_key="content",
        ),
        "handoff_summary_for_second_pass": _truncate(
            parsed.get("handoff_summary_for_second_pass"),
            1600,
        )
        or "Internal chunk summary could not identify a clear handoff.",
        "implementation_signals": _clean_chunk_items(
            parsed.get("implementation_signals"),
            allowed_based_on={"changed_files", "commit_metadata", "ai_answer", "user_input"},
            fallback_ids=fallback_ids,
            required_text_key="content",
        ),
        "important_for_project_memory": _clean_chunk_items(
            parsed.get("important_for_project_memory"),
            fallback_ids=fallback_ids,
            required_text_key="content",
        ),
        "main_topics": [
            _truncate(item, 120)
            for item in parsed.get("main_topics", [])
            if isinstance(item, str) and item.strip()
        ][:8],
        "open_questions": _clean_chunk_items(
            parsed.get("open_questions"),
            fallback_ids=fallback_ids,
            required_text_key="question",
        ),
        "rejected_directions": _clean_chunk_items(
            parsed.get("rejected_directions"),
            fallback_ids=fallback_ids,
            required_text_key="content",
        ),
        "source_event_ids": _clean_source_ids(parsed.get("source_event_ids"), fallback_ids),
        "summary_level": 1,
        "uncertainties": _clean_chunk_items(
            parsed.get("uncertainties"),
            fallback_ids=fallback_ids,
            required_text_key="content",
        ),
        "user_intents": _clean_chunk_items(
            parsed.get("user_intents"),
            fallback_ids=fallback_ids,
            required_text_key="intent",
        ),
    }


def _source_chunk_ids_from_context(context: dict[str, Any]) -> list[str]:
    memory_chunks = (
        context.get("memory_chunks") if isinstance(context.get("memory_chunks"), list) else []
    )
    return [
        chunk.get("id")
        for chunk in memory_chunks
        if isinstance(chunk, dict) and isinstance(chunk.get("id"), str) and chunk.get("id")
    ]


def _clean_string_list(value: Any, *, limit: int = 12, text_limit: int = 500) -> list[str]:
    if not isinstance(value, list):
        return []
    return [
        cleaned
        for item in value[:limit]
        if isinstance(item, str) and (cleaned := _truncate(item, text_limit))
    ]


def _clean_draft_type(value: Any) -> str:
    allowed = {"decision_note", "issue_note", "process_note", "thinking_note", "work_log"}
    return value if isinstance(value, str) and value in allowed else "thinking_note"


def _clean_suggested_action(value: Any, *, confidence: float, needs_verification: bool) -> str:
    allowed = {"edit", "ignore", "save"}
    if isinstance(value, str) and value in allowed:
        return value
    if confidence < 0.35:
        return "ignore"
    return "edit" if needs_verification else "save"


def _clean_based_on(value: Any) -> list[str]:
    allowed = {
        "changed_files",
        "chunk_summary",
        "commit_metadata",
        "paired_ai_output",
        "remaining_event_preview",
        "user_direction",
    }
    if not isinstance(value, list):
        return ["chunk_summary"]
    cleaned = [item for item in value if isinstance(item, str) and item in allowed]
    return cleaned or ["chunk_summary"]


def _clean_draft_nested_items(
    value: Any,
    *,
    fallback_chunk_ids: list[str],
    fallback_event_ids: list[str],
    required_text_key: str,
) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    cleaned: list[dict[str, Any]] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        text = _truncate(item.get(required_text_key), 1000)
        if not text:
            continue
        cleaned_item: dict[str, Any] = {
            required_text_key: text,
            "source_chunk_ids": _clean_source_ids(
                item.get("source_chunk_ids"),
                fallback_chunk_ids,
            ),
            "source_event_ids": _clean_source_ids(
                item.get("source_event_ids"),
                fallback_event_ids,
            ),
        }
        if "confidence" in item:
            cleaned_item["confidence"] = _clean_confidence(item.get("confidence"))
        if "reason" in item:
            cleaned_item["reason"] = _truncate(item.get("reason"), 1000)
        cleaned.append(cleaned_item)
    return cleaned[:12]


def _clean_memory_drafts_response(value: Any, context: dict[str, Any]) -> dict[str, Any]:
    fallback_event_ids = _source_event_ids_from_context(context)
    fallback_chunk_ids = _source_chunk_ids_from_context(context)
    parsed = value if isinstance(value, dict) else {}
    raw_drafts = parsed.get("memory_drafts") if isinstance(parsed.get("memory_drafts"), list) else []
    memory_drafts: list[dict[str, Any]] = []
    for raw in raw_drafts:
        if not isinstance(raw, dict):
            continue
        title = _truncate(raw.get("title"), 180)
        summary = _truncate(raw.get("summary"), 1000)
        why_it_matters = _truncate(raw.get("why_it_matters"), 1000)
        if not title or not summary or not why_it_matters:
            continue
        details = raw.get("details") if isinstance(raw.get("details"), dict) else {}
        evidence = raw.get("evidence") if isinstance(raw.get("evidence"), dict) else {}
        confidence = _clean_confidence(raw.get("confidence"))
        needs_verification = raw.get("needs_user_verification") is True
        draft_event_ids = _clean_source_ids(
            evidence.get("source_event_ids") or raw.get("source_event_ids"),
            fallback_event_ids,
        )
        draft_chunk_ids = _clean_source_ids(
            evidence.get("source_chunk_ids") or raw.get("source_chunk_ids"),
            fallback_chunk_ids,
        )
        cleaned_details = {
            "decisions": _clean_draft_nested_items(
                details.get("decisions"),
                fallback_chunk_ids=draft_chunk_ids,
                fallback_event_ids=draft_event_ids,
                required_text_key="decision",
            ),
            "next_steps": _clean_string_list(details.get("next_steps"), limit=8),
            "open_questions": _clean_draft_nested_items(
                details.get("open_questions"),
                fallback_chunk_ids=draft_chunk_ids,
                fallback_event_ids=draft_event_ids,
                required_text_key="question",
            ),
            "problem": _truncate(details.get("problem"), 1000),
            "rejected_directions": _clean_draft_nested_items(
                details.get("rejected_directions"),
                fallback_chunk_ids=draft_chunk_ids,
                fallback_event_ids=draft_event_ids,
                required_text_key="content",
            ),
            "what_happened": _clean_string_list(details.get("what_happened"), limit=10),
            "why_started": _truncate(details.get("why_started"), 1000),
        }
        memory_drafts.append(
            {
                "confidence": confidence,
                "details": cleaned_details,
                "evidence": {
                    "based_on": _clean_based_on(evidence.get("based_on")),
                    "source_chunk_ids": draft_chunk_ids,
                    "source_event_ids": draft_event_ids,
                },
                "needs_user_verification": needs_verification,
                "suggested_user_action": _clean_suggested_action(
                    raw.get("suggested_user_action"),
                    confidence=confidence,
                    needs_verification=needs_verification,
                ),
                "summary": summary,
                "title": title,
                "type": _clean_draft_type(raw.get("type")),
                "why_it_matters": why_it_matters,
            }
        )

    return {
        "draft_generation_reason": _truncate(
            parsed.get("draft_generation_reason"),
            500,
        )
        or "Memory draft generation ran from available chunk summaries and event previews.",
        "memory_drafts": memory_drafts,
        "overall_uncertainties": _clean_draft_nested_items(
            parsed.get("overall_uncertainties"),
            fallback_chunk_ids=fallback_chunk_ids,
            fallback_event_ids=fallback_event_ids,
            required_text_key="content",
        ),
        "source_chunk_ids": _clean_source_ids(parsed.get("source_chunk_ids"), fallback_chunk_ids),
        "source_event_ids": _clean_source_ids(parsed.get("source_event_ids"), fallback_event_ids),
        "summary_level": 2,
    }


def _source_memory_ids_from_context(context: dict[str, Any]) -> list[str]:
    memories = (
        context.get("verified_memories")
        if isinstance(context.get("verified_memories"), list)
        else []
    )
    return [
        memory.get("id")
        for memory in memories
        if isinstance(memory, dict) and isinstance(memory.get("id"), str) and memory.get("id")
    ]


def _clean_memory_id_items(
    value: Any,
    *,
    fallback_ids: list[str],
    key: str,
) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    cleaned: list[dict[str, Any]] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        text = _truncate(item.get(key), 1000)
        reason = _truncate(item.get("reason"), 1000)
        if not text:
            continue
        cleaned.append(
            {
                key: text,
                "reason": reason or "",
                "source_memory_ids": _clean_source_ids(
                    item.get("source_memory_ids"),
                    fallback_ids,
                ),
            }
        )
    return cleaned[:20]


def _clean_project_memory_response(value: Any, context: dict[str, Any]) -> dict[str, Any]:
    fallback_ids = _source_memory_ids_from_context(context)
    parsed = value if isinstance(value, dict) else {}
    sections = parsed.get("sections") if isinstance(parsed.get("sections"), dict) else {}
    cleaned_sections = {
        "core_workflow": _clean_string_list(sections.get("core_workflow"), limit=12),
        "current_direction": _truncate(sections.get("current_direction"), 1600) or "",
        "important_decisions": _clean_memory_id_items(
            sections.get("important_decisions"),
            fallback_ids=fallback_ids,
            key="decision",
        ),
        "instructions_for_future_ai_agents": _clean_string_list(
            sections.get("instructions_for_future_ai_agents"),
            limit=16,
        ),
        "open_questions": _clean_string_list(sections.get("open_questions"), limit=12),
        "product_goal": _truncate(sections.get("product_goal"), 1600) or "",
        "rejected_directions": _clean_memory_id_items(
            sections.get("rejected_directions"),
            fallback_ids=fallback_ids,
            key="direction",
        ),
        "technical_assumptions": _clean_string_list(
            sections.get("technical_assumptions"),
            limit=16,
        ),
    }
    body_markdown = _truncate(parsed.get("body_markdown"), 8000)
    if not body_markdown:
        body_markdown = "\n\n".join(
            part
            for part in (
                f"# Project Memory",
                f"## Product Goal\n{cleaned_sections['product_goal']}",
                f"## Current Direction\n{cleaned_sections['current_direction']}",
            )
            if part.strip()
        )
    return {
        "body_markdown": body_markdown,
        "confidence": _clean_confidence(parsed.get("confidence"), fallback=0.45),
        "sections": cleaned_sections,
        "snapshot_type": "project_memory",
        "source_memory_ids": _clean_source_ids(parsed.get("source_memory_ids"), fallback_ids),
        "warnings": _clean_string_list(parsed.get("warnings"), limit=12),
    }


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
            return _parse_json_text(_extract_text(response_payload))
        except error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            last_error = GeminiMemoryGenerationError(
                f"Gemini request failed with HTTP {exc.code}: {detail[:500]}"
            )
            if exc.code not in RETRYABLE_HTTP_STATUS_CODES or attempt >= max_retries:
                raise last_error from exc
            time.sleep(_gemini_retry_delay(exc, detail, attempt))
        except (error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            last_error = GeminiMemoryGenerationError(f"Gemini request failed: {exc}")
            if attempt >= max_retries:
                raise last_error from exc
            time.sleep(_gemini_retry_delay(None, "", attempt))

    if last_error is not None:
        raise last_error
    raise GeminiMemoryGenerationError("Gemini request failed.")


def _gemini_retry_delay(
    exc: error.HTTPError | None,
    detail: str,
    attempt: int,
) -> float:
    header_delay = None
    if exc is not None:
        retry_after = exc.headers.get("Retry-After")
        if retry_after:
            try:
                header_delay = float(retry_after)
            except ValueError:
                header_delay = None

    body_delay = None
    match = re.search(r"retry\s+in\s+([0-9]+(?:\.[0-9]+)?)s", detail, flags=re.IGNORECASE)
    if match:
        try:
            body_delay = float(match.group(1))
        except ValueError:
            body_delay = None

    fallback_delay = max(settings.gemini_retry_base_seconds, 0.1) * (2**attempt)
    delay = header_delay or body_delay or fallback_delay
    return max(0.1, min(delay, max(settings.gemini_retry_max_sleep_seconds, 0.1)))


def generate_gemini_memory_payload(
    *,
    context: dict[str, Any],
    fallback_payload: dict[str, Any],
) -> dict[str, Any]:
    generated = _request_gemini_json(_build_prompt(context, fallback_payload))
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


def generate_gemini_chunk_summary(context: dict[str, Any]) -> dict[str, Any]:
    generated = _request_gemini_json(_build_chunk_summary_prompt(context))
    return ChunkSummary.parse_obj(_clean_chunk_summary(generated, context)).dict()


def generate_gemini_memory_drafts(context: dict[str, Any]) -> dict[str, Any]:
    generated = _request_gemini_json(_build_memory_draft_prompt(context))
    return MemoryDraftGeneration.parse_obj(
        _clean_memory_drafts_response(generated, context)
    ).dict()


def generate_gemini_project_memory(context: dict[str, Any]) -> dict[str, Any]:
    generated = _request_gemini_json(_build_project_memory_prompt(context))
    return ProjectMemorySnapshot.parse_obj(
        _clean_project_memory_response(generated, context)
    ).dict()
