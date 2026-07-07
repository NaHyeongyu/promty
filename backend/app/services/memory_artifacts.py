from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session as DBSession

from app.core.config import settings
from app.core.time import utc_now
from app.models.artifact_generation_jobs import ArtifactGenerationJob
from app.models.artifact_versions import ArtifactVersion
from app.models.artifacts import Artifact
from app.models.events import Event
from app.models.projects import Project
from app.models.sessions import Session
from app.schemas.memory import (
    ProjectMemorySnapshot,
)
from app.services.event_payload_security import decrypt_event_payload
from app.services.gemini_memory import (
    GEMINI_MEMORY_DRAFT_GENERATOR,
    GeminiMemoryGenerationError,
)
from app.services.memory_pipeline import (
    compile_memory_drafts,
    compile_project_memory_snapshot,
)
from app.services.openai_memory import (
    OPENAI_MEMORY_DRAFT_GENERATOR,
    OPENAI_PROJECT_MEMORY_GENERATOR,
)

MEMORY_ARTIFACT_TYPE = "MemoryTask"
MEMORY_DRAFT_ARTIFACT_TYPE = "MemoryDraft"
PROJECT_MEMORY_ARTIFACT_TYPE = "ProjectMemory"
LOCAL_MEMORY_GENERATOR = "local-memory-slice-v1"
PENDING_MEMORY_DRAFT_GENERATOR = "local-pending-memory-draft-v1"
MEMORY_WINDOW_STRATEGY = "prompt_window_v1"
SESSION_IDLE_COMPLETE_AFTER = timedelta(hours=1)
LONG_TEXT_AI_PREVIEW_AFTER = 10_000
LONG_TEXT_AI_PREVIEW_EDGE = 300
PENDING_DRAFT_STAGE = "pending_draft"
REVIEW_STATE_DRAFT = "draft"
REVIEW_STATE_EDITED = "edited"
REVIEW_STATE_GENERATED = "generated"
REVIEW_STATE_IGNORED = "ignored"
REVIEW_STATE_SAVED = "saved"
REVIEW_STATE_VERIFIED = "verified"


def _provider_name(value: str | None) -> str:
    return value.strip().lower() if isinstance(value, str) else "local"


def _generator_for_provider(provider: str, *, stage: str) -> str:
    if provider == "openai":
        return {
            "draft": OPENAI_MEMORY_DRAFT_GENERATOR,
            "project": OPENAI_PROJECT_MEMORY_GENERATOR,
        }[stage]
    if provider == "gemini":
        return {
            "draft": GEMINI_MEMORY_DRAFT_GENERATOR,
            "project": "gemini-project-memory-v1",
        }[stage]
    return LOCAL_MEMORY_GENERATOR


def _model_metadata_for_provider(provider: str) -> dict[str, Any]:
    if provider == "openai":
        return {"openai_model": settings.openai_model}
    if provider == "gemini":
        return {"gemini_model": settings.gemini_model}
    return {}

def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _string_or_none(value: Any) -> str | None:
    return value.strip() if isinstance(value, str) and value.strip() else None


def _truncate(value: str, limit: int = 220) -> str:
    cleaned = " ".join(value.split())
    return cleaned if len(cleaned) <= limit else f"{cleaned[: limit - 3].rstrip()}..."


def _is_generic_local_memory_summary(value: str | None) -> bool:
    if not isinstance(value, str):
        return False
    return "prompts and" in value.lower() and "ai responses were captured" in value.lower()


def _long_text_ai_preview(value: str, *, label: str) -> str:
    head = value[:LONG_TEXT_AI_PREVIEW_EDGE]
    tail = value[-LONG_TEXT_AI_PREVIEW_EDGE:]
    return (
        f"[Long {label} preview: original_size={len(value)} chars]\n"
        f"Head: {head}\n"
        f"Tail: {tail}"
    )


def _ai_text_preview(value: str | None, *, label: str) -> str | None:
    if value is None:
        return None
    if len(value) <= LONG_TEXT_AI_PREVIEW_AFTER:
        return value
    return _long_text_ai_preview(value, label=label)


def _ai_text_metadata(value: str | None, *, prefix: str) -> dict[str, Any]:
    if value is None or len(value) <= LONG_TEXT_AI_PREVIEW_AFTER:
        return {
            f"{prefix}_ai_preview_truncated": False,
            f"{prefix}_original_size": len(value) if value is not None else None,
        }
    return {
        f"{prefix}_ai_preview_policy": "head_300_tail_300_size",
        f"{prefix}_ai_preview_truncated": True,
        f"{prefix}_original_size": len(value),
    }


def _prompt_ai_text(value: str | None) -> str | None:
    return _ai_text_preview(value, label="prompt")


def _prompt_ai_metadata(value: str | None) -> dict[str, Any]:
    return _ai_text_metadata(value, prefix="prompt")


def _response_ai_text(value: str | None) -> str | None:
    return _ai_text_preview(value, label="AI output")


def _response_ai_metadata(value: str | None) -> dict[str, Any]:
    return _ai_text_metadata(value, prefix="response")


def _payload(event: Event) -> dict[str, Any]:
    return decrypt_event_payload(event.event_type, event.payload)


def _event_model(event: Event, payload: dict[str, Any]) -> str | None:
    model = _string_or_none(payload.get("model"))
    return model if model and model.lower() not in {event.tool, "codex", "cursor"} else None


def _changed_files_from_payload(payload: dict[str, Any]) -> list[dict[str, Any]]:
    files: list[dict[str, Any]] = []
    changes = payload.get("changes")
    if isinstance(changes, list):
        for change in changes:
            if not isinstance(change, dict):
                continue
            path = _string_or_none(change.get("path"))
            if not path:
                continue
            files.append(
                {
                    "additions": change.get("additions")
                    if isinstance(change.get("additions"), int)
                    else change.get("insertions_delta")
                    if isinstance(change.get("insertions_delta"), int)
                    else None,
                    "deletions": change.get("deletions")
                    if isinstance(change.get("deletions"), int)
                    else change.get("deletions_delta")
                    if isinstance(change.get("deletions_delta"), int)
                    else None,
                    "binary": change.get("binary") is True,
                    "old_path": _string_or_none(change.get("old_path")),
                    "patch": change.get("patch") if isinstance(change.get("patch"), str) else None,
                    "patch_omitted_reason": _string_or_none(
                        change.get("patch_omitted_reason")
                    ),
                    "patch_truncated": change.get("patch_truncated") is True,
                    "path": path,
                    "status": _string_or_none(change.get("status")) or "changed",
                }
            )
        return files

    raw_files = payload.get("files")
    if isinstance(raw_files, list):
        return [
            {"additions": None, "deletions": None, "path": path, "status": "changed"}
            for path in raw_files
            if isinstance(path, str) and path
        ]
    return []


def _event_context_payload(event_type: str, payload: dict[str, Any]) -> dict[str, Any]:
    if event_type == "PromptSubmitted":
        prompt = _string_or_none(payload.get("prompt"))
        return {
            "prompt": _truncate(_prompt_ai_text(prompt) or "", 600),
            "turn_id": payload.get("turn_id"),
            **_prompt_ai_metadata(prompt),
        }
    if event_type == "ResponseReceived":
        response = _string_or_none(payload.get("response"))
        return {
            "response": _truncate(_response_ai_text(response) or "", 500),
            "success": payload.get("success"),
            "turn_id": payload.get("turn_id"),
            **_response_ai_metadata(response),
        }
    if event_type == "FilesChanged":
        return {
            "change_detection_complete": payload.get("change_detection_complete") is True,
            "files": [
                file["path"]
                for file in _changed_files_from_payload(payload)[:30]
            ],
            "no_changes": payload.get("no_changes") is True,
            "summary": payload.get("summary") if isinstance(payload.get("summary"), dict) else None,
        }
    if event_type == "CommitCreated":
        return {
            "hash": _string_or_none(payload.get("hash")),
            "message": _truncate(_string_or_none(payload.get("message")) or "", 240),
        }
    return {}


def _dedupe_files(files: list[dict[str, Any]]) -> list[dict[str, Any]]:
    merged: dict[str, dict[str, Any]] = {}
    for file in files:
        path = file["path"]
        current = merged.setdefault(
            path,
            {
                "additions": 0,
                "binary": file.get("binary") is True,
                "deletions": 0,
                "old_path": file.get("old_path"),
                "patch": file.get("patch"),
                "patch_omitted_reason": file.get("patch_omitted_reason"),
                "patch_truncated": file.get("patch_truncated") is True,
                "path": path,
                "status": file.get("status") or "changed",
            },
        )
        current["status"] = file.get("status") or current["status"]
        for key in ("old_path", "patch", "patch_omitted_reason"):
            if current.get(key) is None and file.get(key) is not None:
                current[key] = file.get(key)
        current["binary"] = current.get("binary") is True or file.get("binary") is True
        current["patch_truncated"] = (
            current.get("patch_truncated") is True or file.get("patch_truncated") is True
        )
        if isinstance(file.get("additions"), int):
            current["additions"] += file["additions"]
        if isinstance(file.get("deletions"), int):
            current["deletions"] += file["deletions"]

    return [
        {
            **file,
            "additions": file["additions"] if file["additions"] > 0 else None,
            "deletions": file["deletions"] if file["deletions"] > 0 else None,
        }
        for file in sorted(merged.values(), key=lambda item: item["path"])
    ]


def _tags_for_session(
    *,
    changed_files: list[dict[str, Any]],
    model: str | None,
    tool: str,
) -> list[str]:
    tags = {"memory", tool}
    if model:
        tags.add(model.lower().replace(" ", "-"))
    for file in changed_files[:20]:
        path = file["path"]
        if "." in path:
            tags.add(path.rsplit(".", 1)[1].lower())
    return sorted(tags)[:12]


def _technologies_for_session(changed_files: list[dict[str, Any]]) -> list[str]:
    technologies: set[str] = set()
    extension_map = {
        "css": "CSS",
        "html": "HTML",
        "js": "JavaScript",
        "json": "JSON",
        "jsx": "React",
        "md": "Markdown",
        "py": "Python",
        "sql": "SQL",
        "ts": "TypeScript",
        "tsx": "React",
        "yml": "YAML",
        "yaml": "YAML",
    }
    path_markers = {
        "alembic/": "Alembic",
        "app/api/": "FastAPI",
        "app/models/": "SQLAlchemy",
        "backend/": "FastAPI",
        "frontend/": "React",
    }

    for file in changed_files:
        path = file["path"]
        normalized_path = path.lower()
        for marker, technology in path_markers.items():
            if marker in normalized_path:
                technologies.add(technology)
        if "." in normalized_path:
            extension = normalized_path.rsplit(".", 1)[1]
            technology = extension_map.get(extension)
            if technology:
                technologies.add(technology)

    return sorted(technologies)[:12]


def _title_from_session(
    *,
    prompts: list[dict[str, Any]],
    project_name: str,
) -> str:
    for prompt in prompts:
        prompt_text = _string_or_none(prompt.get("prompt"))
        if prompt_text:
            return _truncate(prompt_text.splitlines()[0], 120)
    return f"{project_name} development session"


def _build_session_memory_context(
    db: DBSession,
    session: Session,
    *,
    end_sequence: int | None = None,
    slice_metadata: dict[str, Any] | None = None,
    start_sequence: int | None = None,
) -> dict[str, Any]:
    project = session.project or db.get(Project, session.project_id)
    query = select(Event).where(
        Event.project_id == session.project_id,
        Event.session_id == session.id,
    )
    if start_sequence is not None:
        query = query.where(Event.sequence >= start_sequence)
    if end_sequence is not None:
        query = query.where(Event.sequence <= end_sequence)
    events = list(db.execute(query.order_by(Event.sequence, Event.created_at)).scalars())
    payloads = [(event, _payload(event)) for event in events]
    prompt_events = [
        {
            "id": str(event.id),
            "prompt": _prompt_ai_text(_string_or_none(payload.get("prompt"))),
            "prompt_original": _string_or_none(payload.get("prompt")),
            **_prompt_ai_metadata(_string_or_none(payload.get("prompt"))),
            "sequence": event.sequence,
            "turn_id": payload.get("turn_id"),
        }
        for event, payload in payloads
        if event.event_type == "PromptSubmitted"
    ]
    responses = [
        {
            "id": str(event.id),
            "response": _response_ai_text(_string_or_none(payload.get("response"))),
            "response_original": _string_or_none(payload.get("response")),
            **_response_ai_metadata(_string_or_none(payload.get("response"))),
            "sequence": event.sequence,
            "turn_id": payload.get("turn_id"),
        }
        for event, payload in payloads
        if event.event_type == "ResponseReceived"
    ]
    response_count = sum(1 for event, _ in payloads if event.event_type == "ResponseReceived")
    commits = [
        {
            "hash": _string_or_none(payload.get("hash")),
            "message": _string_or_none(payload.get("message")),
        }
        for event, payload in payloads
        if event.event_type == "CommitCreated"
    ]
    changed_files = _dedupe_files(
        [
            file
            for event, payload in payloads
            if event.event_type == "FilesChanged"
            for file in _changed_files_from_payload(payload)
        ]
    )
    model = next(
        (
            model
            for event, payload in payloads
            if (model := _event_model(event, payload)) is not None
        ),
        session.model,
    )

    return {
        "changed_files": changed_files,
        "commits": commits,
        "ended_at": _iso(session.ended_at),
        "event_count": len(events),
        "events": [
            {
                "event_type": event.event_type,
                "payload": _event_context_payload(event.event_type, payload),
                "sequence": event.sequence,
                "timestamp": _iso(event.created_at),
            }
            for event, payload in payloads
        ],
        "first_event_id": str(events[0].id) if events else None,
        "last_event_id": str(events[-1].id) if events else None,
        "model": model,
        "project_id": str(session.project_id),
        "project_name": project.name,
        "prompt_events": prompt_events,
        "response_count": response_count,
        "responses": responses,
        "slice": slice_metadata or None,
        "session_id": str(session.id),
        "started_at": _iso(session.started_at),
        "tool": session.tool,
    }


def _ai_ready_text(value: str | None) -> dict[str, Any]:
    if not value:
        return {
            "original_length": 0,
            "text": "",
            "truncated_for_ai": False,
        }
    if len(value) <= LONG_TEXT_AI_PREVIEW_AFTER:
        return {
            "original_length": len(value),
            "text": value,
            "truncated_for_ai": False,
        }
    return {
        "head_chars": LONG_TEXT_AI_PREVIEW_EDGE,
        "original_length": len(value),
        "tail_chars": LONG_TEXT_AI_PREVIEW_EDGE,
        "text": (
            f"{value[:LONG_TEXT_AI_PREVIEW_EDGE]}\n"
            "[...prompt clipped for AI memory generation...]\n"
            f"{value[-LONG_TEXT_AI_PREVIEW_EDGE:]}"
        ),
        "truncated_for_ai": True,
    }


def _pending_draft_evidence_from_context(context: dict[str, Any]) -> dict[str, Any]:
    prompt_events = context["prompt_events"]
    responses = context["responses"]
    changed_files = context["changed_files"]
    response_by_turn = {
        str(response.get("turn_id")): response
        for response in responses
        if response.get("turn_id") is not None
    }
    response_by_sequence = list(responses)

    prompts: list[dict[str, Any]] = []
    for prompt in prompt_events:
        raw_prompt = _string_or_none(prompt.get("prompt_original")) or _string_or_none(
            prompt.get("prompt")
        )
        paired_response = None
        if prompt.get("turn_id") is not None:
            paired_response = response_by_turn.get(str(prompt.get("turn_id")))
        if paired_response is None:
            paired_response = next(
                (
                    response
                    for response in response_by_sequence
                    if isinstance(response.get("sequence"), int)
                    and isinstance(prompt.get("sequence"), int)
                    and response["sequence"] > prompt["sequence"]
                ),
                None,
            )
        prompts.append(
            {
                "ai_input": _ai_ready_text(raw_prompt),
                "event_id": prompt.get("id"),
                "original_input": raw_prompt,
                "original_length": prompt.get("prompt_original_size")
                or (len(raw_prompt) if raw_prompt else 0),
                "paired_response_event_id": paired_response.get("id")
                if isinstance(paired_response, dict)
                else None,
                "sequence": prompt.get("sequence"),
                "storage_truncated": prompt.get("prompt_ai_preview_truncated") is True,
                "turn_id": prompt.get("turn_id"),
            }
        )

    return {
        "changed_files": changed_files,
        "commits": context["commits"],
        "events": context["events"],
        "prompts": prompts,
        "responses": [
            {
                "event_id": response.get("id"),
                "original_length": response.get("response_original_size")
                or len(response.get("response_original") or response.get("response") or ""),
                "original_output": _string_or_none(response.get("response_original"))
                or _string_or_none(response.get("response")),
                "sequence": response.get("sequence"),
                "storage_truncated": response.get("response_ai_preview_truncated") is True,
                "turn_id": response.get("turn_id"),
            }
            for response in responses
        ],
        "session": {
            "ended_at": context.get("ended_at"),
            "id": context.get("session_id"),
            "model": context.get("model"),
            "project_id": context.get("project_id"),
            "project_name": context.get("project_name"),
            "started_at": context.get("started_at"),
            "tool": context.get("tool"),
        },
    }


def _build_pending_memory_draft_payload(context: dict[str, Any]) -> dict[str, Any]:
    evidence = _pending_draft_evidence_from_context(context)
    prompt_count = len(evidence["prompts"])
    response_count = len(evidence["responses"])
    file_count = len(evidence["changed_files"])
    title = _title_from_session(
        prompts=context["prompt_events"],
        project_name=context["project_name"],
    )
    summary = (
        f"{prompt_count} prompts are ready with {response_count} AI responses "
        f"and {file_count} changed files for one-time memory generation."
    )
    sections = [
        {
            "summary": f"{prompt_count} original user prompt inputs captured.",
            "title": "User inputs",
        },
        {
            "summary": f"{response_count} original AI outputs captured.",
            "title": "AI outputs",
        },
        {
            "summary": f"{file_count} changed files captured.",
            "title": "File changes",
        },
    ]
    return {
        "changed_files": context["changed_files"][:100],
        "commit_sha": context["commits"][-1]["hash"] if context["commits"] else None,
        "event_count": context["event_count"],
        "first_event_id": context["first_event_id"],
        "generator": PENDING_MEMORY_DRAFT_GENERATOR,
        "last_event_id": context["last_event_id"],
        "model": context["model"],
        "outcome": "Pending AI memory generation.",
        "prompt_event_ids": [prompt["id"] for prompt in context["prompt_events"]],
        "reason": "Prompt input, AI output, and file-change detection are all available.",
        "sections": sections,
        "summary": summary,
        "tags": sorted(
            set(
                [
                    *_tags_for_session(
                        changed_files=context["changed_files"],
                        model=context["model"],
                        tool=context["tool"],
                    ),
                    "pending-draft",
                ]
            )
        )[:12],
        "technologies": _technologies_for_session(context["changed_files"]),
        "title": f"Pending memory draft: {title}",
        "tool": context["tool"],
    }


def _source_event_ids_for_context(context: dict[str, Any]) -> list[str]:
    ids = [
        prompt["id"]
        for prompt in context["prompt_events"]
        if isinstance(prompt.get("id"), str) and prompt.get("id")
    ]
    if not ids and context.get("first_event_id"):
        ids.append(context["first_event_id"])
    if context.get("last_event_id") and context["last_event_id"] not in ids:
        ids.append(context["last_event_id"])
    return ids


def _source_chunk_ids_for_context(context: dict[str, Any]) -> list[str]:
    return _source_draft_ids_for_context(context)


def _section_from_strings(title: str, values: list[str]) -> dict[str, str] | None:
    summaries = [_truncate(value, 240) for value in values if value]
    if not summaries:
        return None
    return {"summary": " / ".join(summaries[:4]), "title": title}


def _sections_from_memory_draft(draft: dict[str, Any]) -> list[dict[str, str]]:
    details = draft.get("details") if isinstance(draft.get("details"), dict) else {}
    tasks = details.get("tasks") if isinstance(details.get("tasks"), list) else []
    if not tasks:
        tasks = details.get("what_happened") if isinstance(details.get("what_happened"), list) else []
    follow_ups = (
        details.get("follow_ups") if isinstance(details.get("follow_ups"), list) else []
    )
    if not follow_ups:
        follow_ups = details.get("next_steps") if isinstance(details.get("next_steps"), list) else []
    open_questions = (
        [
            item.get("question")
            for item in details.get("open_questions", [])
            if isinstance(item, dict) and isinstance(item.get("question"), str)
        ]
        if isinstance(details.get("open_questions"), list)
        else []
    )
    rejected_directions = (
        [
            item.get("content")
            for item in details.get("rejected_directions", [])
            if isinstance(item, dict) and isinstance(item.get("content"), str)
        ]
        if isinstance(details.get("rejected_directions"), list)
        else []
    )
    sections: list[dict[str, str]] = []
    for section in (
        _section_from_strings(
            "Summary",
            [
                value
                for value in (
                    draft.get("summary"),
                    details.get("summary"),
                    details.get("problem"),
                    details.get("why_started"),
                )
                if isinstance(value, str)
            ],
        ),
        _section_from_strings(
            "Tasks",
            tasks,
        ),
        _section_from_strings(
            "Decisions",
            [
                item.get("decision")
                for item in details.get("decisions", [])
                if isinstance(item, dict) and isinstance(item.get("decision"), str)
            ]
            if isinstance(details.get("decisions"), list)
            else [],
        ),
        _section_from_strings(
            "Follow-ups",
            [*rejected_directions, *follow_ups, *open_questions],
        ),
    ):
        if section is not None:
            sections.append(section)
    return sections[:4]


def _payload_from_memory_draft(
    context: dict[str, Any],
    draft: dict[str, Any],
    *,
    generator: str,
) -> dict[str, Any]:
    details = draft.get("details") if isinstance(draft.get("details"), dict) else {}
    what_happened = (
        details.get("what_happened") if isinstance(details.get("what_happened"), list) else []
    )
    outcome = " ".join(
        _truncate(item, 220)
        for item in what_happened
        if isinstance(item, str) and item.strip()
    )
    changed_files = context["changed_files"]
    draft_type = _string_or_none(draft.get("type")) or "thinking_note"
    suggested_action = _string_or_none(draft.get("suggested_user_action")) or "edit"
    return {
        "changed_files": changed_files[:100],
        "commit_sha": context["commits"][-1]["hash"] if context["commits"] else None,
        "event_count": context["event_count"],
        "first_event_id": context["first_event_id"],
        "generator": generator,
        "last_event_id": context["last_event_id"],
        "model": context["model"],
        "outcome": outcome or draft["summary"],
        "prompt_event_ids": draft["evidence"]["source_event_ids"],
        "reason": draft["why_it_matters"],
        "sections": _sections_from_memory_draft(draft),
        "summary": draft["summary"],
        "tags": sorted(
            set(
                [
                    *_tags_for_session(
                        changed_files=changed_files,
                        model=context["model"],
                        tool=context["tool"],
                    ),
                    draft_type,
                    suggested_action,
                ]
            )
        )[:12],
        "technologies": _technologies_for_session(changed_files),
        "title": draft["title"],
        "tool": context["tool"],
    }


def _build_memory_draft_payloads_from_context(
    context: dict[str, Any],
    *,
    trigger_reason: str,
) -> tuple[list[tuple[dict[str, Any], dict[str, Any]]], dict[str, Any]]:
    context = {**context, "trigger_reason": trigger_reason}
    source_chunk_ids = _source_chunk_ids_for_context(context)
    source_draft_ids = _source_draft_ids_for_context(context)
    source_event_ids = _source_event_ids_for_context(context)
    provider = _provider_name(settings.memory_draft_generator)
    if provider not in {"gemini", "openai"}:
        return [], {
            "fallback_reason": f"{provider}_disabled",
            "source_draft_ids": source_draft_ids,
            "source_chunk_ids": source_chunk_ids,
            "source_event_ids": source_event_ids,
        }

    try:
        response = compile_memory_drafts(context, provider=provider)
        generator = _generator_for_provider(provider, stage="draft")
        generation_metadata = {
            "draft_generation": response,
            "draft_generator": generator,
            **_model_metadata_for_provider(provider),
        }
    except GeminiMemoryGenerationError as exc:
        return [], {
            "fallback_reason": str(exc),
            "requested_generator": _generator_for_provider(provider, stage="draft"),
            "source_draft_ids": source_draft_ids,
            "source_chunk_ids": source_chunk_ids,
            "source_event_ids": source_event_ids,
        }

    drafts = response.get("memory_drafts") if isinstance(response.get("memory_drafts"), list) else []
    if not drafts:
        return [], {
            **generation_metadata,
            "fallback_reason": "Second-pass generator returned no usable drafts.",
            "source_draft_ids": source_draft_ids,
            "source_chunk_ids": source_chunk_ids,
            "source_event_ids": source_event_ids,
        }

    payloads: list[tuple[dict[str, Any], dict[str, Any]]] = []
    for index, draft in enumerate(drafts, start=1):
        if not isinstance(draft, dict):
            continue
        draft_metadata = {
            **generation_metadata,
            "draft_confidence": draft.get("confidence"),
            "draft_details": draft.get("details"),
            "draft_evidence": draft.get("evidence"),
            "draft_index": index,
            "draft_type": draft.get("type"),
            "needs_user_verification": draft.get("needs_user_verification") is True,
            "overall_uncertainties": response.get("overall_uncertainties", []),
            "source_draft_ids": source_draft_ids,
            "suggested_user_action": draft.get("suggested_user_action"),
        }
        payloads.append(
            (
                _payload_from_memory_draft(context, draft, generator=generator),
                draft_metadata,
            )
        )
    return payloads, generation_metadata


def _memory_slice_prompt_target() -> int:
    return max(settings.memory_slice_prompt_count, 1)


def _slice_metadata(artifact: Artifact) -> dict[str, Any]:
    metadata = artifact.metadata_ if isinstance(artifact.metadata_, dict) else {}
    if metadata.get("memory_strategy") != MEMORY_WINDOW_STRATEGY:
        return {}
    return metadata


def _memory_slice_artifacts(db: DBSession, session: Session) -> list[Artifact]:
    artifacts = list(
        db.execute(
            select(Artifact)
            .where(
                Artifact.project_id == session.project_id,
                Artifact.session_id == session.id,
                Artifact.type == MEMORY_DRAFT_ARTIFACT_TYPE,
            )
            .order_by(Artifact.created_at, Artifact.updated_at)
        ).scalars()
    )
    return [
        artifact
        for artifact in artifacts
        if _slice_metadata(artifact)
        and (
            metadata := artifact.metadata_ if isinstance(artifact.metadata_, dict) else {}
        ).get("artifact_stage")
        == PENDING_DRAFT_STAGE
    ]


def _latest_memory_slice_end_sequence(db: DBSession, session: Session) -> int | None:
    end_sequences = [
        metadata["end_sequence"]
        for artifact in _memory_slice_artifacts(db, session)
        if isinstance((metadata := _slice_metadata(artifact)).get("end_sequence"), int)
    ]
    return max(end_sequences) if end_sequences else None


def _next_memory_slice_index(db: DBSession, session: Session) -> int:
    slice_indexes = [
        metadata["slice_index"]
        for artifact in _memory_slice_artifacts(db, session)
        if isinstance((metadata := _slice_metadata(artifact)).get("slice_index"), int)
    ]
    return (max(slice_indexes) if slice_indexes else 0) + 1


def _latest_session_event(db: DBSession, session: Session) -> Event | None:
    return db.execute(
        select(Event)
        .where(Event.project_id == session.project_id, Event.session_id == session.id)
        .order_by(desc(Event.sequence), desc(Event.created_at))
        .limit(1)
    ).scalar_one_or_none()


def _event_type_value(event: Any) -> str | None:
    if isinstance(event, dict):
        value = event.get("event_type")
    else:
        value = getattr(event, "event_type", None)
    return value if isinstance(value, str) else None


def _event_sequence_value(event: Any) -> int | None:
    if isinstance(event, dict):
        value = event.get("sequence")
    else:
        value = getattr(event, "sequence", None)
    return value if isinstance(value, int) else None


def _event_payload_value(event: Any) -> dict[str, Any]:
    if isinstance(event, dict):
        payload = event.get("payload")
        return payload if isinstance(payload, dict) else {}
    if isinstance(event, Event):
        return _payload(event)
    payload = getattr(event, "payload", None)
    return payload if isinstance(payload, dict) else {}


def _event_has_response_text(event: Any) -> bool:
    if _event_type_value(event) != "ResponseReceived":
        return False
    return _string_or_none(_event_payload_value(event).get("response")) is not None


def _events_have_generation_inputs(events: list[Any]) -> bool:
    prompt_sequences = [
        sequence
        for event in events
        if _event_type_value(event) == "PromptSubmitted"
        and isinstance((sequence := _event_sequence_value(event)), int)
    ]
    if not prompt_sequences:
        return False

    latest_prompt_sequence = max(prompt_sequences)
    events_after_prompt = [
        event
        for event in events
        if isinstance((sequence := _event_sequence_value(event)), int)
        and sequence > latest_prompt_sequence
    ]
    return any(_event_has_response_text(event) for event in events_after_prompt) and any(
        _event_type_value(event) == "FilesChanged" for event in events_after_prompt
    )


def _window_has_generation_inputs(
    db: DBSession,
    session: Session,
    *,
    latest_prompt_sequence: int,
    through_sequence: int,
) -> bool:
    events_after_prompt = list(
        db.execute(
            select(Event)
            .where(
                Event.project_id == session.project_id,
                Event.session_id == session.id,
                Event.sequence > latest_prompt_sequence,
                Event.sequence <= through_sequence,
            )
            .order_by(Event.sequence, Event.created_at)
        ).scalars()
    )
    return any(_event_has_response_text(event) for event in events_after_prompt) and any(
        event.event_type == "FilesChanged" for event in events_after_prompt
    )


def _prompt_events_after_sequence(
    db: DBSession,
    session: Session,
    *,
    after_sequence: int | None,
) -> list[Event]:
    query = select(Event).where(
        Event.project_id == session.project_id,
        Event.session_id == session.id,
        Event.event_type == "PromptSubmitted",
    )
    if after_sequence is not None:
        query = query.where(Event.sequence > after_sequence)
    return list(db.execute(query.order_by(Event.sequence, Event.created_at)).scalars())


def _due_memory_window(
    db: DBSession,
    session: Session,
    *,
    after_sequence: int | None,
    finalize: bool,
) -> dict[str, Any] | None:
    prompts = _prompt_events_after_sequence(
        db,
        session,
        after_sequence=after_sequence,
    )
    if not prompts:
        return None

    latest_event = _latest_session_event(db, session)
    if latest_event is None:
        return None

    prompt_target = _memory_slice_prompt_target()
    if len(prompts) >= prompt_target:
        selected_prompts = prompts[:prompt_target]
        if latest_event.sequence <= selected_prompts[-1].sequence:
            return None
        next_prompt = prompts[prompt_target] if len(prompts) > prompt_target else None
        end_sequence = next_prompt.sequence - 1 if next_prompt else latest_event.sequence
        if not _window_has_generation_inputs(
            db,
            session,
            latest_prompt_sequence=selected_prompts[-1].sequence,
            through_sequence=end_sequence,
        ):
            return None
        return {
            "end_sequence": end_sequence,
            "reason": "prompt_count",
            "selected_prompts": selected_prompts,
            "start_sequence": selected_prompts[0].sequence,
        }

    if finalize:
        if not _window_has_generation_inputs(
            db,
            session,
            latest_prompt_sequence=prompts[-1].sequence,
            through_sequence=latest_event.sequence,
        ):
            return None
        return {
            "end_sequence": latest_event.sequence,
            "reason": "session_finalized",
            "selected_prompts": prompts,
            "start_sequence": prompts[0].sequence,
        }

    return None


def _artifact_is_current_for_context(artifact: Artifact, context: dict[str, Any]) -> bool:
    if not context["last_event_id"] or not artifact.summary:
        return False
    if not isinstance(artifact.sections, list) or not artifact.sections:
        return False
    metadata = artifact.metadata_ if isinstance(artifact.metadata_, dict) else {}
    return (
        metadata.get("last_event_id") == context["last_event_id"]
        and metadata.get("event_count") == context["event_count"]
    )


def _next_artifact_version(db: DBSession, artifact_id: UUID) -> int:
    latest_version = db.scalar(
        select(func.max(ArtifactVersion.version)).where(
            ArtifactVersion.artifact_id == artifact_id,
        )
    )
    return (latest_version or 0) + 1


def _create_artifact_version(
    db: DBSession,
    *,
    artifact: Artifact,
    generation_metadata: dict[str, Any],
    payload: dict[str, Any],
) -> ArtifactVersion:
    version = _next_artifact_version(db, artifact.id)
    artifact_version = ArtifactVersion(
        artifact_id=artifact.id,
        project_id=artifact.project_id,
        session_id=artifact.session_id,
        version=version,
        title=payload["title"],
        summary=payload["summary"],
        reason=payload["reason"],
        outcome=payload["outcome"],
        technologies=payload["technologies"],
        sections=payload["sections"],
        tags=payload["tags"],
        changed_files=payload["changed_files"],
        prompt_event_ids=payload["prompt_event_ids"],
        commit_sha=payload["commit_sha"],
        generator=payload["generator"],
        model=payload["model"],
        metadata_={
            "event_count": payload["event_count"],
            "first_event_id": payload["first_event_id"],
            "last_event_id": payload["last_event_id"],
            "tool": payload["tool"],
            **generation_metadata,
        },
    )
    db.add(artifact_version)
    db.flush()
    return artifact_version


def session_completion_state(db: DBSession, session: Session) -> dict[str, Any]:
    latest_event_at = db.scalar(
        select(func.max(Event.created_at)).where(
            Event.project_id == session.project_id,
            Event.session_id == session.id,
        )
    )
    latest_prompt_at = db.scalar(
        select(func.max(Event.created_at)).where(
            Event.project_id == session.project_id,
            Event.session_id == session.id,
            Event.event_type == "PromptSubmitted",
        )
    )
    if session.ended_at is not None:
        return {
            "completed": True,
            "completed_at": session.ended_at,
            "reason": "explicit",
        }
    idle_reference_at = latest_prompt_at or latest_event_at
    if idle_reference_at and idle_reference_at <= utc_now() - SESSION_IDLE_COMPLETE_AFTER:
        return {
            "completed": True,
            "completed_at": latest_event_at or idle_reference_at,
            "reason": "idle_timeout",
        }
    return {
        "completed": False,
        "completed_at": None,
        "reason": "open",
    }


def complete_session_if_ready(
    db: DBSession,
    session: Session,
    *,
    force: bool = False,
) -> dict[str, Any]:
    state = session_completion_state(db, session)
    if state["completed"]:
        if session.ended_at is None:
            session.ended_at = state["completed_at"]
            db.flush()
        return state
    if not force:
        return state

    latest_event_at = db.scalar(
        select(func.max(Event.created_at)).where(
            Event.project_id == session.project_id,
            Event.session_id == session.id,
        )
    )
    session.ended_at = latest_event_at or utc_now()
    db.flush()
    return {
        "completed": True,
        "completed_at": session.ended_at,
        "reason": "manual",
    }


def create_artifact_generation_job(
    db: DBSession,
    *,
    project_id: UUID,
    reason: str,
    session_id: UUID,
) -> ArtifactGenerationJob:
    job = ArtifactGenerationJob(
        project_id=project_id,
        session_id=session_id,
        reason=reason,
        status="pending",
        generator=_generator_for_provider(
            _provider_name(settings.memory_draft_generator),
            stage="draft",
        ),
    )
    db.add(job)
    db.flush()
    return job


def run_artifact_generation_job(
    db: DBSession,
    job: ArtifactGenerationJob,
    *,
    force_regenerate: bool = False,
) -> ArtifactGenerationJob:
    job.status = "running"
    job.updated_at = utc_now()
    db.flush()

    try:
        session = db.get(Session, job.session_id)
        if session is None:
            raise ValueError("Session not found")
        generate_due_memory_artifacts_for_session(
            db,
            session,
            finalize=True,
            force_regenerate_latest=force_regenerate,
        )
        artifacts = generate_context_memories_for_session(
            db,
            session,
            force_regenerate=force_regenerate,
            trigger_reason=job.reason,
        )
        if not artifacts:
            job.metadata_ = {
                "reason": "No pending memory draft was generated.",
                "status": "no_memory",
            }
        else:
            artifact = artifacts[0]
            job.artifact_id = artifact.id
            job.generator = artifact.generator or job.generator
            job.metadata_ = {
                "generated_memory_ids": [str(item.id) for item in artifacts],
                **(artifact.metadata_ if isinstance(artifact.metadata_, dict) else {}),
            }
        job.status = "succeeded"
        job.completed_at = utc_now()
        job.error = None
    except Exception as exc:
        job.status = "failed"
        job.error = str(exc)
        job.completed_at = utc_now()
    finally:
        job.updated_at = utc_now()
        db.flush()

    return job


def _generate_pending_draft_for_context(
    db: DBSession,
    *,
    context: dict[str, Any],
    force_regenerate: bool,
    session: Session,
    storage_key: str,
) -> Artifact:
    artifact = db.execute(
        select(Artifact).where(
            Artifact.project_id == session.project_id,
            Artifact.session_id == session.id,
            Artifact.type == MEMORY_DRAFT_ARTIFACT_TYPE,
            Artifact.storage_key == storage_key,
        )
    ).scalar_one_or_none()
    if (
        not force_regenerate
        and artifact is not None
        and _artifact_is_current_for_context(artifact, context)
    ):
        return artifact

    payload = _build_pending_memory_draft_payload(context)
    evidence = _pending_draft_evidence_from_context(context)
    slice_metadata = context.get("slice") if isinstance(context.get("slice"), dict) else {}
    return _write_memory_artifact_payload(
        db,
        artifact_type=MEMORY_DRAFT_ARTIFACT_TYPE,
        event_id=UUID(payload["last_event_id"]) if payload["last_event_id"] else None,
        extra_metadata={
            "artifact_stage": PENDING_DRAFT_STAGE,
            "commit_metadata": context["commits"],
            "draft_evidence": evidence,
            "event_count": payload["event_count"],
            "first_event_id": payload["first_event_id"],
            "last_event_id": payload["last_event_id"],
            "memory_scope": "pending_draft",
            "review_state": REVIEW_STATE_DRAFT,
            "summary_level": 1,
            **slice_metadata,
        },
        payload=payload,
        project_id=session.project_id,
        session_id=session.id,
        storage_key=storage_key,
    )


def _latest_memory_slice(db: DBSession, session: Session) -> Artifact | None:
    slices = _memory_slice_artifacts(db, session)
    if not slices:
        return None
    return max(
        slices,
        key=lambda artifact: (
            _slice_metadata(artifact).get("end_sequence") or -1,
            artifact.updated_at,
        ),
    )


def generate_due_memory_artifacts_for_session(
    db: DBSession,
    session: Session,
    *,
    finalize: bool = False,
    force_regenerate_latest: bool = False,
) -> list[Artifact]:
    generated_artifacts: list[Artifact] = []
    after_sequence = _latest_memory_slice_end_sequence(db, session)

    while True:
        window = _due_memory_window(
            db,
            session,
            after_sequence=after_sequence,
            finalize=finalize,
        )
        if window is None:
            break

        selected_prompts = window["selected_prompts"]
        if not selected_prompts:
            break

        slice_index = _next_memory_slice_index(db, session)
        slice_metadata = {
            "end_prompt_sequence": selected_prompts[-1].sequence,
            "end_sequence": window["end_sequence"],
            "memory_strategy": MEMORY_WINDOW_STRATEGY,
            "prompt_count": len(selected_prompts),
            "slice_index": slice_index,
            "start_prompt_sequence": selected_prompts[0].sequence,
            "start_sequence": window["start_sequence"],
            "target_prompt_count": _memory_slice_prompt_target(),
            "window_reason": window["reason"],
        }
        artifact = _generate_pending_draft_for_context(
            db,
            context=_build_session_memory_context(
                db,
                session,
                end_sequence=window["end_sequence"],
                slice_metadata=slice_metadata,
                start_sequence=window["start_sequence"],
            ),
            force_regenerate=False,
            session=session,
            storage_key=(
                f"memory/session/{session.id}/pending/"
                f"{window['start_sequence']}-{window['end_sequence']}"
            ),
        )
        generated_artifacts.append(artifact)
        after_sequence = window["end_sequence"]

    if not generated_artifacts and force_regenerate_latest:
        latest_slice = _latest_memory_slice(db, session)
        if latest_slice is not None:
            metadata = _slice_metadata(latest_slice)
            start_sequence = metadata.get("start_sequence")
            end_sequence = metadata.get("end_sequence")
            if isinstance(start_sequence, int) and isinstance(end_sequence, int):
                generated_artifacts.append(
                    _generate_pending_draft_for_context(
                        db,
                        context=_build_session_memory_context(
                            db,
                            session,
                            end_sequence=end_sequence,
                            slice_metadata=metadata,
                            start_sequence=start_sequence,
                        ),
                        force_regenerate=True,
                        session=session,
                        storage_key=latest_slice.storage_key,
                    )
                )

    return generated_artifacts


def _pending_memory_drafts_for_session(
    db: DBSession,
    session: Session,
    *,
    end_sequence: int | None = None,
    start_sequence: int | None = None,
) -> list[Artifact]:
    artifacts = list(
        db.execute(
            select(Artifact)
            .where(
                Artifact.project_id == session.project_id,
                Artifact.session_id == session.id,
                Artifact.type == MEMORY_DRAFT_ARTIFACT_TYPE,
            )
            .order_by(Artifact.created_at, Artifact.updated_at)
        ).scalars()
    )
    pending: list[Artifact] = []
    for artifact in artifacts:
        metadata = artifact.metadata_ if isinstance(artifact.metadata_, dict) else {}
        if metadata.get("artifact_stage") != PENDING_DRAFT_STAGE:
            continue
        if metadata.get("review_state") != REVIEW_STATE_DRAFT:
            continue
        draft_start = metadata.get("start_sequence")
        draft_end = metadata.get("end_sequence")
        if start_sequence is not None and isinstance(draft_end, int) and draft_end < start_sequence:
            continue
        if end_sequence is not None and isinstance(draft_start, int) and draft_start > end_sequence:
            continue
        pending.append(artifact)
    return pending


def _pending_draft_range(artifact: Artifact) -> dict[str, Any]:
    metadata = artifact.metadata_ if isinstance(artifact.metadata_, dict) else {}
    evidence = metadata.get("draft_evidence") if isinstance(metadata.get("draft_evidence"), dict) else {}
    prompts = evidence.get("prompts") if isinstance(evidence.get("prompts"), list) else []
    responses = evidence.get("responses") if isinstance(evidence.get("responses"), list) else []
    changed_files = (
        evidence.get("changed_files") if isinstance(evidence.get("changed_files"), list) else []
    )
    return {
        "can_checkpoint": True,
        "draft_id": str(artifact.id),
        "end_sequence": metadata.get("end_sequence"),
        "event_count": metadata.get("event_count") or 0,
        "file_change_event_count": 1,
        "last_event_at": _iso(artifact.updated_at),
        "prompt_count": len(prompts) or len(artifact.prompt_event_ids or []),
        "response_count": len(responses),
        "session_id": str(artifact.session_id),
        "start_sequence": metadata.get("start_sequence"),
        "tool": metadata.get("tool") or "unknown",
        "changed_file_count": len(changed_files),
    }


def _latest_event_sequence(db: DBSession, session: Session) -> int | None:
    latest_event = _latest_session_event(db, session)
    return latest_event.sequence if latest_event is not None else None


def _source_draft_ids_for_context(context: dict[str, Any]) -> list[str]:
    drafts = context.get("pending_drafts") if isinstance(context.get("pending_drafts"), list) else []
    return [
        draft.get("id")
        for draft in drafts
        if isinstance(draft, dict) and isinstance(draft.get("id"), str) and draft.get("id")
    ]


def _pending_draft_generation_context(
    db: DBSession,
    session: Session,
    drafts: list[Artifact],
) -> dict[str, Any]:
    start_sequences = []
    end_sequences = []
    pending_drafts: list[dict[str, Any]] = []
    changed_files: list[dict[str, Any]] = []
    commits: list[dict[str, Any]] = []
    events: list[dict[str, Any]] = []
    prompt_events: list[dict[str, Any]] = []
    responses: list[dict[str, Any]] = []
    first_event_id = None
    last_event_id = None

    for draft in drafts:
        metadata = draft.metadata_ if isinstance(draft.metadata_, dict) else {}
        evidence = (
            metadata.get("draft_evidence")
            if isinstance(metadata.get("draft_evidence"), dict)
            else {}
        )
        if isinstance(metadata.get("start_sequence"), int):
            start_sequences.append(metadata["start_sequence"])
        if isinstance(metadata.get("end_sequence"), int):
            end_sequences.append(metadata["end_sequence"])
        if isinstance(metadata.get("first_event_id"), str) and first_event_id is None:
            first_event_id = metadata["first_event_id"]
        if isinstance(metadata.get("last_event_id"), str):
            last_event_id = metadata["last_event_id"]
        draft_changed_files = (
            evidence.get("changed_files")
            if isinstance(evidence.get("changed_files"), list)
            else []
        )
        draft_commits = evidence.get("commits") if isinstance(evidence.get("commits"), list) else []
        draft_events = evidence.get("events") if isinstance(evidence.get("events"), list) else []
        draft_prompts = evidence.get("prompts") if isinstance(evidence.get("prompts"), list) else []
        draft_responses = (
            evidence.get("responses") if isinstance(evidence.get("responses"), list) else []
        )
        changed_files.extend(
            file for file in draft_changed_files if isinstance(file, dict)
        )
        commits.extend(commit for commit in draft_commits if isinstance(commit, dict))
        events.extend(event for event in draft_events if isinstance(event, dict))
        prompt_events.extend(
            {
                "id": prompt.get("event_id"),
                "prompt": (prompt.get("ai_input") or {}).get("text")
                if isinstance(prompt.get("ai_input"), dict)
                else prompt.get("original_input"),
                "prompt_original": prompt.get("original_input"),
                "prompt_original_size": prompt.get("original_length"),
                "prompt_ai_preview_truncated": (
                    (prompt.get("ai_input") or {}).get("truncated_for_ai") is True
                    if isinstance(prompt.get("ai_input"), dict)
                    else False
                ),
                "sequence": prompt.get("sequence"),
                "turn_id": prompt.get("turn_id"),
            }
            for prompt in draft_prompts
            if isinstance(prompt, dict)
        )
        responses.extend(
            {
                "id": response.get("event_id"),
                "response": response.get("original_output"),
                "response_original": response.get("original_output"),
                "response_original_size": response.get("original_length"),
                "response_ai_preview_truncated": response.get("storage_truncated") is True,
                "sequence": response.get("sequence"),
                "turn_id": response.get("turn_id"),
            }
            for response in draft_responses
            if isinstance(response, dict)
        )
        pending_drafts.append(
            {
                "changed_files": draft_changed_files,
                "evidence": evidence,
                "id": str(draft.id),
                "summary": draft.summary,
                "title": draft.title,
            }
        )

    project = session.project or db.get(Project, session.project_id)
    return {
        "changed_files": _dedupe_files(changed_files),
        "commits": commits,
        "ended_at": _iso(session.ended_at),
        "event_count": len(events),
        "events": events,
        "first_event_id": first_event_id,
        "last_event_id": last_event_id,
        "model": session.model,
        "pending_drafts": pending_drafts,
        "project_id": str(session.project_id),
        "project_name": project.name if project else str(session.project_id),
        "prompt_events": prompt_events,
        "response_count": len(responses),
        "responses": responses,
        "session_id": str(session.id),
        "started_at": _iso(session.started_at),
        "tool": session.tool,
        "window": {
            "end_sequence": max(end_sequences) if end_sequences else None,
            "start_sequence": min(start_sequences) if start_sequences else None,
        },
    }


def _artifact_cover_end_sequence(artifact: Artifact) -> int | None:
    metadata = artifact.metadata_ if isinstance(artifact.metadata_, dict) else {}
    end_sequence = metadata.get("end_sequence")
    if isinstance(end_sequence, int):
        return end_sequence
    event = artifact.event
    return event.sequence if event is not None else None


def _latest_memory_cover_end_sequence(db: DBSession, session: Session) -> int | None:
    artifacts = list(
        db.execute(
            select(Artifact)
            .where(
                Artifact.project_id == session.project_id,
                Artifact.session_id == session.id,
                Artifact.type == MEMORY_ARTIFACT_TYPE,
            )
            .order_by(desc(Artifact.updated_at), desc(Artifact.created_at))
        ).scalars()
    )
    end_sequences = [
        end_sequence
        for artifact in artifacts
        if isinstance((end_sequence := _artifact_cover_end_sequence(artifact)), int)
    ]
    return max(end_sequences) if end_sequences else None


def list_project_memory_pending_ranges(
    db: DBSession,
    *,
    limit: int = 20,
    project_id: UUID,
) -> list[dict[str, Any]]:
    sessions = list(
        db.execute(
            select(Session)
            .where(Session.project_id == project_id)
            .order_by(desc(Session.started_at))
            .limit(limit * 4)
        ).scalars()
    )
    ranges: list[dict[str, Any]] = []
    for session in sessions:
        completion = complete_session_if_ready(db, session, force=False)
        generate_due_memory_artifacts_for_session(
            db,
            session,
            finalize=completion["completed"],
        )
        ranges.extend(
            _pending_draft_range(draft)
            for draft in _pending_memory_drafts_for_session(db, session)
        )
        if len(ranges) >= limit:
            break
    return ranges[:limit]


def generate_context_memories_for_session(
    db: DBSession,
    session: Session,
    *,
    end_sequence: int | None = None,
    force_regenerate: bool = False,
    start_sequence: int | None = None,
    trigger_reason: str,
) -> list[Artifact]:
    pending_drafts = _pending_memory_drafts_for_session(
        db,
        session,
        end_sequence=end_sequence,
        start_sequence=start_sequence,
    )
    if not pending_drafts:
        generate_due_memory_artifacts_for_session(
            db,
            session,
            finalize=True,
            force_regenerate_latest=force_regenerate,
        )
        pending_drafts = _pending_memory_drafts_for_session(
            db,
            session,
            end_sequence=end_sequence,
            start_sequence=start_sequence,
        )
    if not pending_drafts:
        return []

    context = _pending_draft_generation_context(db, session, pending_drafts)
    covered_start_sequence = context["window"]["start_sequence"]
    covered_end_sequence = context["window"]["end_sequence"]
    latest_sequence = covered_end_sequence if isinstance(covered_end_sequence, int) else _latest_event_sequence(db, session)
    source_draft_ids = [str(draft.id) for draft in pending_drafts]
    payloads, generation_metadata = _build_memory_draft_payloads_from_context(
        context,
        trigger_reason=trigger_reason,
    )
    if not payloads:
        return []
    memories: list[Artifact] = []
    event_id = UUID(context["last_event_id"]) if context["last_event_id"] else None
    for index, (payload, draft_metadata) in enumerate(payloads, start=1):
        storage_key = (
            f"memory/session/{session.id}/generated/"
            f"{latest_sequence or 0}/{trigger_reason}/{index}"
        )
        existing_memory = db.execute(
            select(Artifact).where(
                Artifact.project_id == session.project_id,
                Artifact.type == MEMORY_ARTIFACT_TYPE,
                Artifact.storage_key == storage_key,
            )
        ).scalar_one_or_none()
        if existing_memory is not None and not force_regenerate:
            memories.append(existing_memory)
            continue
        memories.append(
            _write_memory_artifact_payload(
                db,
                artifact_type=MEMORY_ARTIFACT_TYPE,
                event_id=event_id,
                extra_metadata={
                    **draft_metadata,
                    **generation_metadata,
                    "artifact_stage": "generated_memory",
                    "commit_metadata": context["commits"],
                    "memory_scope": "generated",
                    "review_state": REVIEW_STATE_GENERATED,
                    "summary_level": 2,
                    "trigger_reason": trigger_reason,
                    "source_draft_ids": source_draft_ids,
                    "source_chunk_ids": source_draft_ids,
                    "start_sequence": covered_start_sequence,
                    "end_sequence": covered_end_sequence,
                },
                payload=payload,
                project_id=session.project_id,
                session_id=session.id,
                storage_key=storage_key,
            )
        )

    generated_ids = [str(memory.id) for memory in memories]
    for draft in pending_drafts:
        metadata = draft.metadata_ if isinstance(draft.metadata_, dict) else {}
        draft.metadata_ = {
            **metadata,
            "generated_memory_ids": generated_ids,
            "review_state": REVIEW_STATE_GENERATED,
            "sent_to_ai_at": _iso(utc_now()),
        }
        draft.updated_at = utc_now()
        db.flush()

    return memories


def _payload_from_artifact(
    artifact: Artifact,
    *,
    overrides: dict[str, Any] | None = None,
) -> dict[str, Any]:
    metadata = artifact.metadata_ if isinstance(artifact.metadata_, dict) else {}
    payload = {
        "changed_files": artifact.changed_files or [],
        "commit_sha": artifact.commit_sha,
        "event_count": metadata.get("event_count") or 0,
        "first_event_id": metadata.get("first_event_id"),
        "generator": artifact.generator or LOCAL_MEMORY_GENERATOR,
        "last_event_id": metadata.get("last_event_id"),
        "model": artifact.model,
        "outcome": artifact.outcome,
        "prompt_event_ids": artifact.prompt_event_ids or [],
        "reason": artifact.reason,
        "sections": artifact.sections or [],
        "summary": artifact.summary,
        "tags": artifact.tags or [],
        "technologies": artifact.technologies or [],
        "title": artifact.title,
        "tool": metadata.get("tool"),
    }
    if overrides:
        payload.update({key: value for key, value in overrides.items() if value is not None})
    return payload


def _write_memory_artifact_payload(
    db: DBSession,
    *,
    artifact_type: str,
    event_id: UUID | None,
    extra_metadata: dict[str, Any],
    payload: dict[str, Any],
    project_id: UUID,
    session_id: UUID | None,
    storage_key: str,
) -> Artifact:
    artifact = db.execute(
        select(Artifact).where(
            Artifact.project_id == project_id,
            Artifact.type == artifact_type,
            Artifact.storage_key == storage_key,
        )
    ).scalar_one_or_none()
    if artifact is None:
        artifact = Artifact(
            project_id=project_id,
            session_id=session_id,
            event_id=event_id,
            type=artifact_type,
            title=payload["title"],
            storage_key=storage_key,
        )
        db.add(artifact)
        db.flush()

    generation_metadata = {
        "event_count": payload["event_count"],
        "first_event_id": payload["first_event_id"],
        "last_event_id": payload["last_event_id"],
        "tool": payload["tool"],
        **extra_metadata,
    }
    artifact_version = _create_artifact_version(
        db,
        artifact=artifact,
        generation_metadata=generation_metadata,
        payload=payload,
    )
    artifact.schema_version = 1
    artifact.event_id = event_id
    artifact.title = payload["title"]
    artifact.summary = payload["summary"]
    artifact.reason = payload["reason"]
    artifact.outcome = payload["outcome"]
    artifact.tags = payload["tags"]
    artifact.technologies = payload["technologies"]
    artifact.sections = payload["sections"]
    artifact.changed_files = payload["changed_files"]
    artifact.prompt_event_ids = payload["prompt_event_ids"]
    artifact.commit_sha = payload["commit_sha"]
    artifact.model = payload["model"]
    artifact.generator = payload["generator"]
    artifact.metadata_ = {
        **generation_metadata,
        "latest_version": artifact_version.version,
        "latest_version_id": str(artifact_version.id),
    }
    artifact.updated_at = utc_now()
    db.flush()
    return artifact


def update_memory_draft(
    db: DBSession,
    draft: Artifact,
    *,
    updates: dict[str, Any],
) -> Artifact:
    metadata = draft.metadata_ if isinstance(draft.metadata_, dict) else {}
    payload = _payload_from_artifact(draft, overrides=updates)
    return _write_memory_artifact_payload(
        db,
        artifact_type=MEMORY_DRAFT_ARTIFACT_TYPE,
        event_id=draft.event_id,
        extra_metadata={
            **metadata,
            "artifact_stage": "memory_draft",
            "review_state": REVIEW_STATE_DRAFT,
            "summary_level": 2,
            "user_edited": True,
        },
        payload=payload,
        project_id=draft.project_id,
        session_id=draft.session_id,
        storage_key=draft.storage_key,
    )


def save_memory_draft_as_verified(
    db: DBSession,
    draft: Artifact,
    *,
    updates: dict[str, Any] | None = None,
) -> Artifact:
    metadata = draft.metadata_ if isinstance(draft.metadata_, dict) else {}
    if updates:
        draft = update_memory_draft(db, draft, updates=updates)
        metadata = draft.metadata_ if isinstance(draft.metadata_, dict) else {}
    payload = _payload_from_artifact(draft)
    verified = _write_memory_artifact_payload(
        db,
        artifact_type=MEMORY_ARTIFACT_TYPE,
        event_id=draft.event_id,
        extra_metadata={
            **metadata,
            "artifact_stage": "verified_memory",
            "memory_scope": "verified",
            "review_state": REVIEW_STATE_VERIFIED,
            "source_draft_id": str(draft.id),
        },
        payload=payload,
        project_id=draft.project_id,
        session_id=draft.session_id,
        storage_key=f"memory/session/{draft.session_id}/verified/{draft.id}",
    )
    draft.metadata_ = {
        **metadata,
        "review_state": REVIEW_STATE_SAVED,
        "verified_artifact_id": str(verified.id),
    }
    draft.updated_at = utc_now()
    db.flush()
    return verified


def ignore_memory_draft(db: DBSession, draft: Artifact) -> Artifact:
    metadata = draft.metadata_ if isinstance(draft.metadata_, dict) else {}
    draft.metadata_ = {
        **metadata,
        "review_state": REVIEW_STATE_IGNORED,
    }
    draft.updated_at = utc_now()
    db.flush()
    return draft


def list_project_memory_drafts(
    db: DBSession,
    *,
    limit: int = 20,
    project_id: UUID,
) -> list[Artifact]:
    artifacts = list(
        db.execute(
            select(Artifact)
            .where(Artifact.project_id == project_id, Artifact.type == MEMORY_DRAFT_ARTIFACT_TYPE)
            .order_by(desc(Artifact.updated_at), desc(Artifact.created_at))
            .limit(limit * 5)
        ).scalars()
    )
    filtered = [
        artifact
        for artifact in artifacts
        if (
            (metadata := artifact.metadata_ if isinstance(artifact.metadata_, dict) else {})
        ).get("artifact_stage")
        == "memory_draft"
        and metadata.get("review_state") == REVIEW_STATE_DRAFT
        and metadata.get("summary_level") == 2
        and not metadata.get("fallback_reason")
        and not _is_generic_local_memory_summary(artifact.summary)
    ]
    return filtered[:limit]


def _source_memory_context(artifact: Artifact) -> dict[str, Any]:
    metadata = artifact.metadata_ if isinstance(artifact.metadata_, dict) else {}
    return {
        "changed_file_count": len(artifact.changed_files or []),
        "created_at": _iso(artifact.created_at),
        "draft_details": metadata.get("draft_details"),
        "draft_type": metadata.get("draft_type"),
        "id": str(artifact.id),
        "memory_scope": metadata.get("memory_scope"),
        "outcome": artifact.outcome,
        "reason": artifact.reason,
        "sections": artifact.sections,
        "source_draft_id": metadata.get("source_draft_id"),
        "summary": artifact.summary,
        "tags": artifact.tags,
        "technologies": artifact.technologies,
        "title": artifact.title,
        "updated_at": _iso(artifact.updated_at),
    }


def _latest_project_memory_snapshot(db: DBSession, project_id: UUID) -> Artifact | None:
    return db.execute(
        select(Artifact)
        .where(
            Artifact.project_id == project_id,
            Artifact.type == PROJECT_MEMORY_ARTIFACT_TYPE,
        )
        .order_by(desc(Artifact.updated_at), desc(Artifact.created_at))
        .limit(1)
    ).scalar_one_or_none()


def _project_context(project: Project) -> dict[str, Any]:
    return {
        "default_branch": project.default_branch,
        "description": project.description,
        "git_remote": project.git_remote,
        "id": str(project.id),
        "name": project.name,
        "slug": project.slug,
        "tags": project.tags or [],
        "visibility": project.visibility,
    }


def _local_project_memory_snapshot(
    *,
    previous_snapshot: Artifact | None,
    project: Project,
    verified_memories: list[Artifact],
) -> dict[str, Any]:
    source_memory_ids = [str(memory.id) for memory in verified_memories]
    product_goal = (
        project.description
        or "Promty captures generated AI coding memory for future project context."
    )
    current_direction = (
        verified_memories[0].summary
        if verified_memories and verified_memories[0].summary
        else "No generated memory has established a detailed current direction yet."
    )
    workflow = [
        "Raw Events are stored for every captured event.",
        "Pending Memory Drafts are created after 20 prompts, session end, or 1 hour of idle time.",
        "Pending drafts contain original user input, original AI output, and file-change evidence.",
        "The user generates all pending drafts into context memories with one action.",
        "Generated memories use Summary, Tasks, Decisions, and Follow-ups.",
        "Generated memories are saved to History and Project Memory is recompiled immediately.",
        "Users can edit generated memories and the final Project Memory snapshot after generation.",
    ]
    important_decisions = [
        {
            "decision": memory.title,
            "reason": memory.reason or memory.summary or "",
            "source_memory_ids": [str(memory.id)],
        }
        for memory in verified_memories[:12]
    ]
    technical_assumptions = [
        "Project Memory uses generated and user-edited memories by default.",
        "Pending drafts and ignored memories are not source of truth.",
        "Prompt chunk size is 20 PromptSubmitted events.",
        "Prompts over 10,000 characters are sent to AI using the first 300 characters, last 300 characters, and original size.",
        "For large prompts, cause analysis should primarily use the paired AI output.",
        "Commit messages are metadata only and are not summary triggers.",
        "LLM failure fallback must not be exposed as user-facing memory.",
    ]
    body_markdown = "\n\n".join(
        [
            "# Project Memory",
            f"## Product Goal\n{product_goal}",
            f"## Current Direction\n{current_direction}",
            "## Core Workflow\n" + "\n".join(f"- {item}" for item in workflow),
            "## Important Decisions\n"
            + (
                "\n".join(
                    f"- {item['decision']}: {item['reason']}"
                    for item in important_decisions
                )
                if important_decisions
                else "- No generated decisions yet."
            ),
            "## Technical Assumptions\n"
            + "\n".join(f"- {item}" for item in technical_assumptions),
            "## Instructions For Future AI Agents\n"
            + "\n".join(
                [
                    "- Use generated and user-edited memory as the source of truth.",
                    "- Do not rely on pending drafts or ignored memories.",
                    "- Preserve existing memory workflow thresholds unless the user changes them.",
                ]
            ),
        ]
    )
    return ProjectMemorySnapshot.parse_obj({
        "body_markdown": body_markdown,
        "confidence": 0.45 if verified_memories else 0.2,
        "sections": {
            "core_workflow": workflow,
            "current_direction": current_direction,
            "important_decisions": important_decisions,
            "instructions_for_future_ai_agents": [
                "Use generated and user-edited memory as the source of truth.",
                "Do not rely on pending drafts or ignored memories.",
                "Preserve existing memory workflow thresholds unless the user changes them.",
            ],
            "open_questions": [],
            "product_goal": product_goal,
            "rejected_directions": [],
            "technical_assumptions": technical_assumptions,
        },
        "snapshot_type": "project_memory",
        "source_memory_ids": source_memory_ids,
        "warnings": ["Local fallback compiler was used."]
        if _provider_name(settings.project_memory_generator) in {"gemini", "openai"}
        else [],
    }).dict()


def _project_memory_payload(
    *,
    generator: str,
    project: Project,
    snapshot: dict[str, Any],
) -> dict[str, Any]:
    sections = snapshot.get("sections") if isinstance(snapshot.get("sections"), dict) else {}
    important_decisions = (
        sections.get("important_decisions")
        if isinstance(sections.get("important_decisions"), list)
        else []
    )
    rendered_sections = [
        {"summary": sections.get("product_goal") or "", "title": "Product Goal"},
        {"summary": sections.get("current_direction") or "", "title": "Current Direction"},
    ]
    if important_decisions:
        rendered_sections.append(
            {
                "summary": " / ".join(
                    item.get("decision", "")
                    for item in important_decisions[:6]
                    if isinstance(item, dict)
                ),
                "title": "Important Decisions",
            }
        )
    return {
        "changed_files": [],
        "commit_sha": None,
        "event_count": len(snapshot.get("source_memory_ids") or []),
        "first_event_id": None,
        "generator": generator,
        "last_event_id": None,
        "model": None,
        "outcome": snapshot.get("body_markdown"),
        "prompt_event_ids": snapshot.get("source_memory_ids") or [],
        "reason": sections.get("current_direction") or "Compiled from verified memories.",
        "sections": [
            section
            for section in rendered_sections
            if section["summary"]
        ],
        "summary": sections.get("current_direction") or "Compiled project memory snapshot.",
        "tags": sorted(set([*(project.tags or []), "project-memory"]))[:12],
        "technologies": [],
        "title": f"{project.name} Project Memory",
        "tool": "promty",
    }


def compile_project_memory(
    db: DBSession,
    *,
    force_regenerate: bool = False,
    project_id: UUID,
) -> Artifact:
    project = db.get(Project, project_id)
    if project is None:
        raise ValueError("Project not found")
    existing = _latest_project_memory_snapshot(db, project_id)
    source_memories = list_project_memory_artifacts(
        db,
        project_id=project_id,
        limit=100,
    )
    source_memory_ids = [str(memory.id) for memory in source_memories]
    existing_metadata = existing.metadata_ if existing and isinstance(existing.metadata_, dict) else {}
    if (
        existing is not None
        and not force_regenerate
        and existing_metadata.get("source_memory_ids") == source_memory_ids
    ):
        return existing

    previous_snapshot = existing
    local_snapshot = _local_project_memory_snapshot(
        previous_snapshot=previous_snapshot,
        project=project,
        verified_memories=source_memories,
    )
    source_memory_context = [
        _source_memory_context(memory)
        for memory in source_memories
    ]
    context = {
        "previous_project_memory": previous_snapshot.metadata_.get("project_memory_snapshot")
        if previous_snapshot and isinstance(previous_snapshot.metadata_, dict)
        else None,
        "project_context": _project_context(project),
        "source_memories": source_memory_context,
        "verified_memories": source_memory_context,
    }
    provider = _provider_name(settings.project_memory_generator)
    if provider not in {"gemini", "openai"}:
        snapshot = local_snapshot
        generator = LOCAL_MEMORY_GENERATOR
        generation_metadata = {"fallback_reason": f"{provider}_disabled"}
    else:
        try:
            snapshot = compile_project_memory_snapshot(context, provider=provider)
            generator = _generator_for_provider(provider, stage="project")
            generation_metadata = _model_metadata_for_provider(provider)
        except GeminiMemoryGenerationError as exc:
            snapshot = local_snapshot
            generator = LOCAL_MEMORY_GENERATOR
            generation_metadata = {
                "fallback_generator": LOCAL_MEMORY_GENERATOR,
                "fallback_reason": str(exc),
                "requested_generator": _generator_for_provider(provider, stage="project"),
            }

    payload = _project_memory_payload(
        generator=generator,
        project=project,
        snapshot=snapshot,
    )
    artifact = _write_memory_artifact_payload(
        db,
        artifact_type=PROJECT_MEMORY_ARTIFACT_TYPE,
        event_id=None,
        extra_metadata={
            "memory_scope": "project",
            "project_memory_snapshot": snapshot,
            "review_state": REVIEW_STATE_GENERATED,
            "source_memory_ids": snapshot.get("source_memory_ids") or source_memory_ids,
            **generation_metadata,
        },
        payload=payload,
        project_id=project_id,
        session_id=None,
        storage_key=f"memory/project/{project_id}/latest",
    )
    return artifact


def update_project_memory_snapshot(
    db: DBSession,
    *,
    body_markdown: str,
    project_id: UUID,
) -> Artifact:
    project = db.get(Project, project_id)
    if project is None:
        raise ValueError("Project not found")
    existing = _latest_project_memory_snapshot(db, project_id)
    existing_metadata = existing.metadata_ if existing and isinstance(existing.metadata_, dict) else {}
    previous_snapshot = (
        existing_metadata.get("project_memory_snapshot")
        if isinstance(existing_metadata.get("project_memory_snapshot"), dict)
        else None
    )
    if previous_snapshot is None:
        previous_snapshot = _local_project_memory_snapshot(
            previous_snapshot=existing,
            project=project,
            verified_memories=list_project_memory_artifacts(
                db,
                project_id=project_id,
                limit=100,
            ),
        )
    snapshot = {
        **previous_snapshot,
        "body_markdown": body_markdown,
        "warnings": [
            *(
                previous_snapshot.get("warnings")
                if isinstance(previous_snapshot.get("warnings"), list)
                else []
            ),
            "Project Memory body was edited by the user.",
        ],
    }
    payload = _project_memory_payload(
        generator=existing.generator if existing and existing.generator else LOCAL_MEMORY_GENERATOR,
        project=project,
        snapshot=snapshot,
    )
    return _write_memory_artifact_payload(
        db,
        artifact_type=PROJECT_MEMORY_ARTIFACT_TYPE,
        event_id=None,
        extra_metadata={
            **existing_metadata,
            "memory_scope": "project",
            "project_memory_snapshot": snapshot,
            "review_state": REVIEW_STATE_EDITED,
            "source_memory_ids": snapshot.get("source_memory_ids") or [],
            "user_edited": True,
        },
        payload=payload,
        project_id=project_id,
        session_id=None,
        storage_key=f"memory/project/{project_id}/latest",
    )


def get_latest_project_memory(db: DBSession, *, project_id: UUID) -> Artifact | None:
    return _latest_project_memory_snapshot(db, project_id)


def create_and_run_session_memory_job(
    db: DBSession,
    *,
    project_id: UUID,
    reason: str,
    session_id: UUID,
    force_regenerate: bool = False,
) -> ArtifactGenerationJob:
    job = create_artifact_generation_job(
        db,
        project_id=project_id,
        reason=reason,
        session_id=session_id,
    )
    return run_artifact_generation_job(
        db,
        job,
        force_regenerate=force_regenerate,
    )


def list_project_memory_artifacts(
    db: DBSession,
    *,
    limit: int = 20,
    project_id: UUID,
) -> list[Artifact]:
    artifacts = list(
        db.execute(
            select(Artifact)
            .where(Artifact.project_id == project_id, Artifact.type == MEMORY_ARTIFACT_TYPE)
            .order_by(desc(Artifact.updated_at), desc(Artifact.created_at))
            .limit(limit * 3)
        ).scalars()
    )
    source_memories = [
        artifact
        for artifact in artifacts
        if (
            metadata := artifact.metadata_ if isinstance(artifact.metadata_, dict) else {}
        ).get("review_state")
        in {REVIEW_STATE_GENERATED, REVIEW_STATE_VERIFIED}
        and metadata.get("artifact_stage") in {"generated_memory", "verified_memory"}
    ]
    return source_memories[:limit]


def _artifact_versions(
    db: DBSession,
    artifact: Artifact,
    *,
    limit: int = 8,
) -> list[ArtifactVersion]:
    return list(
        db.execute(
            select(ArtifactVersion)
            .where(ArtifactVersion.artifact_id == artifact.id)
            .order_by(desc(ArtifactVersion.version))
            .limit(limit)
        ).scalars()
    )


def serialize_artifact_version(version: ArtifactVersion) -> dict[str, Any]:
    metadata = version.metadata_ if isinstance(version.metadata_, dict) else {}
    return {
        "changed_file_count": len(version.changed_files or []),
        "changed_files": version.changed_files,
        "commit_sha": version.commit_sha,
        "created_at": _iso(version.created_at),
        "end_sequence": metadata.get("end_sequence"),
        "generator": version.generator,
        "id": str(version.id),
        "memory_scope": metadata.get("memory_scope"),
        "model": version.model,
        "outcome": version.outcome,
        "prompt_count": metadata.get("prompt_count"),
        "reason": version.reason,
        "review_state": metadata.get("review_state"),
        "sections": version.sections,
        "session_id": str(version.session_id) if version.session_id else None,
        "slice_index": metadata.get("slice_index"),
        "start_sequence": metadata.get("start_sequence"),
        "summary": version.summary,
        "tags": version.tags,
        "technologies": version.technologies,
        "title": version.title,
        "version": version.version,
        "window_reason": metadata.get("window_reason"),
    }


def serialize_memory_artifact(artifact: Artifact) -> dict[str, Any]:
    metadata = artifact.metadata_ if isinstance(artifact.metadata_, dict) else {}
    return {
        "changed_file_count": len(artifact.changed_files or []),
        "changed_files": artifact.changed_files,
        "commit_sha": artifact.commit_sha,
        "created_at": _iso(artifact.created_at),
        "artifact_stage": metadata.get("artifact_stage"),
        "draft_confidence": metadata.get("draft_confidence"),
        "draft_generator": metadata.get("draft_generator"),
        "draft_type": metadata.get("draft_type"),
        "end_sequence": metadata.get("end_sequence"),
        "fallback_reason": metadata.get("fallback_reason"),
        "generator": artifact.generator,
        "id": str(artifact.id),
        "memory_scope": metadata.get("memory_scope"),
        "model": artifact.model,
        "needs_user_verification": metadata.get("needs_user_verification"),
        "outcome": artifact.outcome,
        "prompt_count": metadata.get("prompt_count"),
        "prompt_event_ids": artifact.prompt_event_ids,
        "reason": artifact.reason,
        "requested_generator": metadata.get("requested_generator"),
        "review_state": metadata.get("review_state"),
        "sections": artifact.sections,
        "session_id": str(artifact.session_id) if artifact.session_id else None,
        "slice_index": metadata.get("slice_index"),
        "start_sequence": metadata.get("start_sequence"),
        "summary": artifact.summary,
        "summary_level": metadata.get("summary_level"),
        "suggested_user_action": metadata.get("suggested_user_action"),
        "tags": artifact.tags,
        "technologies": artifact.technologies,
        "title": artifact.title,
        "trigger_reason": metadata.get("trigger_reason"),
        "type": artifact.type,
        "updated_at": _iso(artifact.updated_at),
        "why_it_matters": artifact.reason,
        "window_reason": metadata.get("window_reason"),
    }


def serialize_memory_artifact_summary(
    artifact: Artifact,
    *,
    db: DBSession,
) -> dict[str, Any]:
    metadata = artifact.metadata_ if isinstance(artifact.metadata_, dict) else {}
    return {
        "changed_file_count": len(artifact.changed_files or []),
        "changed_files": artifact.changed_files,
        "commit_sha": artifact.commit_sha,
        "created_at": _iso(artifact.created_at),
        "artifact_stage": metadata.get("artifact_stage"),
        "draft_confidence": metadata.get("draft_confidence"),
        "draft_generator": metadata.get("draft_generator"),
        "draft_type": metadata.get("draft_type"),
        "end_sequence": metadata.get("end_sequence"),
        "fallback_reason": metadata.get("fallback_reason"),
        "generator": artifact.generator,
        "id": str(artifact.id),
        "memory_scope": metadata.get("memory_scope"),
        "model": artifact.model,
        "needs_user_verification": metadata.get("needs_user_verification"),
        "outcome": artifact.outcome,
        "prompt_count": metadata.get("prompt_count"),
        "reason": artifact.reason,
        "requested_generator": metadata.get("requested_generator"),
        "review_state": metadata.get("review_state"),
        "sections": artifact.sections,
        "session_id": str(artifact.session_id) if artifact.session_id else None,
        "slice_index": metadata.get("slice_index"),
        "start_sequence": metadata.get("start_sequence"),
        "summary": artifact.summary,
        "summary_level": metadata.get("summary_level"),
        "suggested_user_action": metadata.get("suggested_user_action"),
        "tags": artifact.tags,
        "technologies": artifact.technologies,
        "title": artifact.title,
        "trigger_reason": metadata.get("trigger_reason"),
        "type": artifact.type,
        "updated_at": _iso(artifact.updated_at),
        "why_it_matters": artifact.reason,
        "window_reason": metadata.get("window_reason"),
        "versions": [
            serialize_artifact_version(version)
            for version in _artifact_versions(db, artifact)
        ],
    }


def serialize_generation_job(job: ArtifactGenerationJob) -> dict[str, Any]:
    return {
        "artifact_id": str(job.artifact_id) if job.artifact_id else None,
        "completed_at": _iso(job.completed_at),
        "created_at": _iso(job.created_at),
        "error": job.error,
        "generator": job.generator,
        "id": str(job.id),
        "project_id": str(job.project_id),
        "reason": job.reason,
        "session_id": str(job.session_id),
        "status": job.status,
        "updated_at": _iso(job.updated_at),
    }
