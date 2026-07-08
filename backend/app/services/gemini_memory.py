from __future__ import annotations

import json
import re
import time
from typing import Any
from urllib import error, parse, request

from app.core.config import settings
from app.schemas.memory import (
    MemoryDraftGeneration,
    ProjectMemorySnapshot,
)

GEMINI_MEMORY_DRAFT_GENERATOR = "gemini-memory-draft-v1"
MAX_CHANGED_FILES = 60
MAX_EVENT_TIMELINE = 80
MAX_MEMORY_DRAFTS = 3
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


def _clean_text(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


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
            "response_ai_preview_truncated": response.get("response_ai_preview_truncated") is True,
            "response_original_size": response.get("response_original_size"),
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
            "change_detection_complete": payload.get("change_detection_complete") is True,
            "file_count": len(files),
            "files": files[:8],
            "no_changes": payload.get("no_changes") is True,
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
    pending_drafts = (
        context.get("pending_drafts")
        if isinstance(context.get("pending_drafts"), list)
        else []
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
        "omitted": {
            "changed_files": max(len(changed_files) - MAX_CHANGED_FILES, 0),
            "events": max(len(events) - MAX_EVENT_TIMELINE, 0),
            "prompts": max(len(prompts) - MAX_PROMPTS, 0),
            "responses": max(len(responses) - MAX_RESPONSE_SAMPLES, 0),
        },
        "pending_drafts": pending_drafts,
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


def _build_memory_draft_prompt(context: dict[str, Any]) -> str:
    compact_context = _compact_context(context)
    pending_drafts = compact_context["pending_drafts"]
    source_draft_ids = [
        draft.get("id")
        for draft in pending_drafts
        if isinstance(draft, dict) and isinstance(draft.get("id"), str)
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
            "Pending draft evidence is authoritative; remaining event previews are secondary."
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
            "You are Promty's generated context memory assistant.",
            "",
            "Your job is to create user-facing generated context memories from pending draft evidence packages.",
            "",
            "These generated memories are saved automatically and then used to recompile Project Memory.",
            "",
            "You are working inside Promty, a developer-focused product that turns AI coding conversations into work logs, decision notes, and reusable project memory.",
            "",
            "The current Promty memory flow is:",
            "Raw Events",
            "→ pending drafts are created after prompt-count/session-end/idle triggers",
            "→ each pending draft contains original user input, original AI output, and file-change evidence",
            "→ the user clicks Generate once for pending drafts",
            "→ generated context memories are saved to History",
            "→ Project Memory is recompiled immediately",
            "",
            "This is a second-pass user-facing context memory generation step.",
            "Your job is NOT to create final Project Memory.",
            "Your job is to create useful generated memories that preserve concrete project context.",
            "Each generated memory must be structured around Summary, Tasks, Decisions, and Follow-ups.",
            "Tasks record what was done.",
            "Decisions record what was chosen, why it was chosen, and what communication led to it.",
            "",
            "Important:",
            "Optimize for the memory UX: a Pending Memory batch should usually become one generated memory item.",
            f"Return 1 memory_draft by default. Return at most {MAX_MEMORY_DRAFTS} memory_drafts.",
            "Only split into multiple memory_drafts when the batch contains clearly separate work streams that would be confusing to review as one draft.",
            "Do not split small decisions, policy updates, implementation steps, or follow-up items into separate drafts.",
            "Put those items inside the draft's Summary, Tasks, Decisions, and Follow-ups sections instead.",
            "For larger batches, preserve more detail inside those sections instead of compressing them to a fixed item count.",
            "The amount of Tasks, Decisions, Follow-ups, and Open Questions should scale with the amount of meaningful work in the batch.",
            "When unsure whether to split, keep one draft.",
            "",
            "Draft types:",
            "- work_log: concrete implementation or development progress",
            "- thinking_note: brainstorming, product reasoning, problem definition",
            "- decision_note: clear decision and reasoning",
            "- issue_note: unresolved issue, risk, or technical limitation",
            "- process_note: workflow or process policy",
            "",
            "Important rules:",
            "1. Use only the provided pending draft evidence, changed file metadata, and commit metadata.",
            '2. Do not invent missing details. If something is unclear, put it in "overall_uncertainties" or mark the draft as needs_user_verification.',
            "3. Separate confirmed facts from inferred points. Use confidence scores between 0 and 1.",
            '4. If a cause came from an AI answer, phrase it as "AI answer suggested..." or "AI 답변 기준으로는...".',
            "5. If an input or output was large/truncated, do not claim to have analyzed the full content.",
            "6. For large user prompts, infer the issue mainly from the paired AI output, not from the missing raw content.",
            "7. Commit messages are metadata only. Use them as weak hints, not primary evidence. Do not treat commits as summary triggers.",
            "8. Changed file metadata can support implementation context. Do not infer exact code behavior from file names alone.",
            "9. Prefer one specific batch-level generated memory item over many narrow cards.",
            '10. If the user rejected a direction, corrected the AI, or said something like "아니야", "현실성 없어", "다시 생각해보자", "이걸로 가자", capture that as an important product decision signal.',
            "11. Include rejected directions if they shaped the final direction.",
            "12. Every generated memory item must include source_event_ids and source_chunk_ids. Use source_chunk_ids to carry the pending draft ids.",
            '13. Suggested user action: "save" if likely useful and clear, "edit" if useful but uncertain, "ignore" if vague or low-signal.',
            "14. Do not create fallback-style generic drafts such as counts of prompts and AI responses.",
            "15. The best output for a normal batch is exactly one memory_drafts item with detailed sections.",
            "16. Do not omit meaningful tasks or decisions just to keep section arrays short.",
            "17. Return JSON only. Do not include markdown. Do not include explanations outside the JSON.",
            "",
            "Project context:",
            json.dumps(project_context, ensure_ascii=False),
            "",
            "Finalize trigger:",
            json.dumps(finalize_trigger, ensure_ascii=False),
            "",
            "Pending draft evidence packages:",
            json.dumps(pending_drafts, ensure_ascii=False),
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
                    "source_chunk_ids": source_draft_ids,
                    "source_event_ids": ["event id"],
                    "memory_drafts": [
                        {
                            "type": "work_log",
                            "title": "string",
                            "summary": "string",
                            "why_it_matters": "string",
                            "details": {
                                "summary": "string",
                                "tasks": ["what was done"],
                                "problem": None,
                                "why_started": None,
                                "what_happened": ["string"],
                                "decisions": [
                                    {
                                        "decision": "string",
                                        "reason": "string",
                                        "source_event_ids": ["event id"],
                                        "source_chunk_ids": source_draft_ids,
                                        "confidence": 0.0,
                                    }
                                ],
                                "rejected_directions": [
                                    {
                                        "content": "string",
                                        "reason": None,
                                        "source_event_ids": ["event id"],
                                        "source_chunk_ids": source_draft_ids,
                                        "confidence": 0.0,
                                    }
                                ],
                                "open_questions": [
                                    {
                                        "question": "string",
                                        "source_event_ids": ["event id"],
                                        "source_chunk_ids": source_draft_ids,
                                    }
                                ],
                                "follow_ups": ["string"],
                                "next_steps": ["string"],
                            },
                            "evidence": {
                                "source_event_ids": ["event id"],
                                "source_chunk_ids": source_draft_ids,
                                "based_on": ["user_direction", "paired_ai_output", "changed_files"],
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
                            "source_chunk_ids": source_draft_ids,
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
    source_memories = (
        context.get("source_memories")
        if isinstance(context.get("source_memories"), list)
        else context.get("verified_memories")
        if isinstance(context.get("verified_memories"), list)
        else []
    )
    previous_snapshot = context.get("previous_project_memory")
    source_memory_ids = [
        memory.get("id")
        for memory in source_memories
        if isinstance(memory, dict) and isinstance(memory.get("id"), str)
    ]
    return "\n".join(
        [
            "You are Promty's Project Memory compiler.",
            "",
            "Your job is to compile generated and user-edited memories into a concrete Project Memory document that can be given to future AI coding agents such as Codex, Claude Code, Cursor, or other AI coding tools.",
            "",
            "You are working inside Promty, a developer-focused product that turns AI coding conversations into work logs, decision notes, and reusable project memory.",
            "",
            "The current Promty memory flow is:",
            "Raw Events",
            "→ pending draft evidence is created after prompt-count/session-end/idle triggers",
            "→ each pending draft contains original user input, original AI output, and file-change evidence",
            "→ user runs Generate for pending drafts",
            "→ generated context memories are saved to History",
            "→ Project Memory is recompiled immediately",
            "→ user may edit generated memories and the final Project Memory snapshot later",
            "",
            "This is the final Project Memory compilation step.",
            "",
            "Use generated and user-edited source memories by default.",
            "Do not use pending draft evidence directly.",
            "Do not use ignored or removed memories.",
            "Do not treat old unreviewed Memory Drafts as source of truth.",
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
            "1. Do not summarize raw conversations. Compile durable project context from source memories.",
            "2. Do not include pending draft evidence directly.",
            "3. Do not include ignored or removed memories.",
            "4. If memories conflict, prefer the most recent generated or user-edited memory unless an older one is explicitly marked as still active.",
            '5. If a memory is marked as superseded, archived, or rejected, include it only in "Rejected Directions" or "Superseded Decisions" if it helps explain the current direction.',
            "6. Preserve concrete context. Longer output is acceptable when it helps future AI agents understand the project.",
            "7. Do not include unnecessary emotional or conversational details.",
            "8. Preserve concrete decisions, numbers, thresholds, and policies.",
            "9. Use clear section headings.",
            "10. Preserve user edits from the previous Project Memory snapshot unless newer source memories clearly supersede them.",
            '11. Return JSON only. The JSON should contain a markdown string in "body_markdown".',
            "",
            "Project context:",
            json.dumps(project_context, ensure_ascii=False),
            "",
            "Source memories:",
            json.dumps(source_memories, ensure_ascii=False),
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


def _source_chunk_ids_from_context(context: dict[str, Any]) -> list[str]:
    pending_drafts = (
        context.get("pending_drafts")
        if isinstance(context.get("pending_drafts"), list)
        else []
    )
    pending_ids = [
        draft.get("id")
        for draft in pending_drafts
        if isinstance(draft, dict) and isinstance(draft.get("id"), str) and draft.get("id")
    ]
    return pending_ids


def _clean_string_list(
    value: Any,
    *,
    limit: int | None = 12,
    text_limit: int = 500,
) -> list[str]:
    if not isinstance(value, list):
        return []
    items = value if limit is None else value[:limit]
    return [
        cleaned
        for item in items
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
        "commit_metadata",
        "paired_ai_output",
        "pending_draft",
        "remaining_event_preview",
        "user_direction",
    }
    if not isinstance(value, list):
        return ["pending_draft"]
    cleaned = [item for item in value if isinstance(item, str) and item in allowed]
    return cleaned or ["pending_draft"]


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
    return cleaned


def _clean_memory_drafts_response(value: Any, context: dict[str, Any]) -> dict[str, Any]:
    fallback_event_ids = _source_event_ids_from_context(context)
    fallback_chunk_ids = _source_chunk_ids_from_context(context)
    parsed = value if isinstance(value, dict) else {}
    raw_drafts = parsed.get("memory_drafts") if isinstance(parsed.get("memory_drafts"), list) else []
    memory_drafts: list[dict[str, Any]] = []
    for raw in raw_drafts[:MAX_MEMORY_DRAFTS]:
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
            "follow_ups": _clean_string_list(
                details.get("follow_ups") or details.get("next_steps"),
                limit=None,
            ),
            "next_steps": _clean_string_list(details.get("next_steps"), limit=None),
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
            "summary": _truncate(details.get("summary"), 1000),
            "tasks": _clean_string_list(
                details.get("tasks") or details.get("what_happened"),
                limit=None,
            ),
            "what_happened": _clean_string_list(details.get("what_happened"), limit=None),
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
        or "Memory draft generation ran from pending draft evidence packages.",
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
        context.get("source_memories")
        if isinstance(context.get("source_memories"), list)
        else context.get("verified_memories")
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
    return cleaned


def _clean_project_memory_response(value: Any, context: dict[str, Any]) -> dict[str, Any]:
    fallback_ids = _source_memory_ids_from_context(context)
    parsed = value if isinstance(value, dict) else {}
    sections = parsed.get("sections") if isinstance(parsed.get("sections"), dict) else {}
    cleaned_sections = {
        "core_workflow": _clean_string_list(sections.get("core_workflow"), limit=None),
        "current_direction": _clean_text(sections.get("current_direction")),
        "important_decisions": _clean_memory_id_items(
            sections.get("important_decisions"),
            fallback_ids=fallback_ids,
            key="decision",
        ),
        "instructions_for_future_ai_agents": _clean_string_list(
            sections.get("instructions_for_future_ai_agents"),
            limit=None,
        ),
        "open_questions": _clean_string_list(sections.get("open_questions"), limit=None),
        "product_goal": _clean_text(sections.get("product_goal")),
        "rejected_directions": _clean_memory_id_items(
            sections.get("rejected_directions"),
            fallback_ids=fallback_ids,
            key="direction",
        ),
        "technical_assumptions": _clean_string_list(
            sections.get("technical_assumptions"),
            limit=None,
        ),
    }
    body_markdown = _clean_text(parsed.get("body_markdown"))
    if not body_markdown:
        body_markdown = "\n\n".join(
            part
            for part in (
                "# Project Memory",
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
        "warnings": _clean_string_list(parsed.get("warnings"), limit=None),
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
