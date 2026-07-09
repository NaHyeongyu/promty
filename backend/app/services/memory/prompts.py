from __future__ import annotations

import json
from typing import Any

from app.services.memory.text import truncate

MAX_CHANGED_FILES = 60
MAX_EVENT_TIMELINE = 80
MAX_MEMORY_DRAFTS = 3
MAX_PROMPTS = 10
MAX_RESPONSE_SAMPLES = 3


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
            "hash": truncate(commit.get("hash"), 16),
            "message": truncate(commit.get("message"), 180),
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
            "prompt": truncate(prompt["prompt"], 700),
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
            "response": truncate(response["response"], 320),
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
            "prompt": truncate(payload.get("prompt"), 220),
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
            "hash": truncate(payload.get("hash"), 16),
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
        bullets.append(f"Initial user intent: {truncate(prompts[0].get('prompt'), 260)}")
    if len(prompts) > 1:
        bullets.append(f"Latest user request: {truncate(prompts[-1].get('prompt'), 260)}")
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


def build_memory_draft_prompt(context: dict[str, Any]) -> str:
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
            "→ each pending draft keeps paired user direction, AI answer evidence, and file-change evidence",
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


def build_project_memory_prompt(context: dict[str, Any]) -> str:
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
            "→ pending work is created after prompt-count/session-end/idle triggers",
            "→ pending work keeps paired user direction, AI answer evidence, and file-change evidence",
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
            "11. Do not expose internal generation mechanics or raw AI prompts. Avoid terms such as MemoryDraft, source_chunk_ids, draft_evidence, ResponseReceived, FilesChanged, sent_to_ai_at, or prompt sent to AI.",
            '12. Return JSON only. The JSON should contain a markdown string in "body_markdown".',
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
