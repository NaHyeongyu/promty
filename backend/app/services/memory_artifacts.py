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
    ChunkSummary,
    MemoryDraftGeneration,
    ProjectMemorySnapshot,
)
from app.services.event_payload_security import decrypt_event_payload
from app.services.gemini_memory import (
    GEMINI_CHUNK_SUMMARY_GENERATOR,
    GEMINI_MEMORY_DRAFT_GENERATOR,
    GEMINI_MEMORY_GENERATOR,
    GeminiMemoryGenerationError,
    generate_gemini_memory_payload,
)
from app.services.memory_pipeline import (
    compile_internal_chunk_summary,
    compile_memory_drafts,
    compile_project_memory_snapshot,
)
from app.services.openai_memory import (
    OPENAI_CHUNK_SUMMARY_GENERATOR,
    OPENAI_MEMORY_DRAFT_GENERATOR,
    OPENAI_MEMORY_GENERATOR,
    OPENAI_PROJECT_MEMORY_GENERATOR,
    generate_openai_memory_payload,
)

MEMORY_ARTIFACT_TYPE = "MemoryTask"
MEMORY_CHUNK_ARTIFACT_TYPE = "MemoryChunk"
MEMORY_DRAFT_ARTIFACT_TYPE = "MemoryDraft"
PROJECT_MEMORY_ARTIFACT_TYPE = "ProjectMemory"
LOCAL_MEMORY_GENERATOR = "local-memory-slice-v1"
MEMORY_WINDOW_STRATEGY = "prompt_window_v1"
SESSION_IDLE_COMPLETE_AFTER = timedelta(hours=1)
LONG_TEXT_AI_PREVIEW_AFTER = 10_000
LONG_TEXT_AI_PREVIEW_EDGE = 100
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
            "chunk": OPENAI_CHUNK_SUMMARY_GENERATOR,
            "draft": OPENAI_MEMORY_DRAFT_GENERATOR,
            "legacy": OPENAI_MEMORY_GENERATOR,
            "project": OPENAI_PROJECT_MEMORY_GENERATOR,
        }[stage]
    if provider == "gemini":
        return {
            "chunk": GEMINI_CHUNK_SUMMARY_GENERATOR,
            "draft": GEMINI_MEMORY_DRAFT_GENERATOR,
            "legacy": GEMINI_MEMORY_GENERATOR,
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
        f"{prefix}_ai_preview_policy": "head_100_tail_100_size",
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
            "files": [
                file["path"]
                for file in _changed_files_from_payload(payload)[:30]
            ],
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
                "deletions": 0,
                "path": path,
                "status": file.get("status") or "changed",
            },
        )
        current["status"] = file.get("status") or current["status"]
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


def _local_sections_for_session(
    *,
    changed_files: list[dict[str, Any]],
    outcome: str,
    prompt_events: list[dict[str, Any]],
) -> list[dict[str, str]]:
    sections: list[dict[str, str]] = []
    if prompt_events and prompt_events[0]["prompt"]:
        sections.append(
            {
                "summary": _truncate(prompt_events[0]["prompt"], 360),
                "title": "User intent",
            }
        )
    if changed_files:
        file_sample = ", ".join(file.get("path") for file in changed_files[:8] if file.get("path"))
        sections.append(
            {
                "summary": _truncate(file_sample, 360),
                "title": "Changed files",
            }
        )
    sections.append(
        {
            "summary": _truncate(outcome, 360),
            "title": "Outcome",
        }
    )
    return sections[:6]


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
            **_prompt_ai_metadata(_string_or_none(payload.get("prompt"))),
            "sequence": event.sequence,
            "turn_id": payload.get("turn_id"),
        }
        for event, payload in payloads
        if event.event_type == "PromptSubmitted"
    ]
    responses = [
        {
            "response": _response_ai_text(_string_or_none(payload.get("response"))),
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


def _build_local_memory_payload(context: dict[str, Any]) -> dict[str, Any]:
    title = _title_from_session(
        prompts=context["prompt_events"],
        project_name=context["project_name"],
    )
    changed_files = context["changed_files"]
    file_count = len(changed_files)
    prompt_count = len(context["prompt_events"])
    slice_metadata = context.get("slice") if isinstance(context.get("slice"), dict) else {}
    scope_label = "memory slice" if slice_metadata else "session"
    summary = (
        f"{prompt_count} prompts and {context['response_count']} AI responses were captured"
        f" in this {scope_label}, touching {file_count} files."
    )
    first_prompt = context["prompt_events"][0] if context["prompt_events"] else None
    paired_response = next(
        (
            response
            for response in context["responses"]
            if first_prompt
            and first_prompt.get("turn_id") is not None
            and response.get("turn_id") == first_prompt.get("turn_id")
            and response.get("response")
        ),
        None,
    )
    reason_source = (
        paired_response.get("response")
        if first_prompt
        and first_prompt.get("prompt_ai_preview_truncated") is True
        and paired_response
        else first_prompt.get("prompt")
        if first_prompt
        else None
    )
    reason = (
        _truncate(reason_source, 480)
        if reason_source
        else f"Promty captured this {scope_label} as project memory from development events."
    )
    outcome = f"{file_count} files changed and {prompt_count} prompts recorded."
    technologies = _technologies_for_session(changed_files)
    sections = _local_sections_for_session(
        changed_files=changed_files,
        outcome=outcome,
        prompt_events=context["prompt_events"],
    )

    return {
        "changed_files": changed_files[:100],
        "commit_sha": context["commits"][-1]["hash"] if context["commits"] else None,
        "event_count": context["event_count"],
        "first_event_id": context["first_event_id"],
        "generator": LOCAL_MEMORY_GENERATOR,
        "last_event_id": context["last_event_id"],
        "model": context["model"],
        "outcome": outcome,
        "prompt_event_ids": [prompt["id"] for prompt in context["prompt_events"]],
        "reason": reason,
        "sections": sections,
        "summary": summary,
        "tags": _tags_for_session(
            changed_files=changed_files,
            model=context["model"],
            tool=context["tool"],
        ),
        "technologies": technologies,
        "title": f"{title} · Slice {slice_metadata['slice_index']}"
        if slice_metadata.get("slice_index")
        else title,
        "tool": context["tool"],
    }


def _build_memory_payload_from_context(
    context: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any]]:
    local_payload = _build_local_memory_payload(context)
    provider = _provider_name(settings.memory_generator)

    if provider not in {"gemini", "openai"}:
        return local_payload, {"fallback_reason": f"{provider}_disabled"}

    try:
        if provider == "openai":
            payload = generate_openai_memory_payload(
                context=context,
                fallback_payload=local_payload,
            )
        else:
            payload = generate_gemini_memory_payload(
                context=context,
                fallback_payload=local_payload,
            )
        return payload, _model_metadata_for_provider(provider)
    except GeminiMemoryGenerationError as exc:
        local_payload["generator"] = LOCAL_MEMORY_GENERATOR
        return local_payload, {
            "fallback_generator": LOCAL_MEMORY_GENERATOR,
            "fallback_reason": str(exc),
            "requested_generator": _generator_for_provider(provider, stage="legacy"),
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


def _build_local_chunk_summary(context: dict[str, Any]) -> dict[str, Any]:
    slice_metadata = context.get("slice") if isinstance(context.get("slice"), dict) else {}
    chunk_index = slice_metadata.get("slice_index") if isinstance(slice_metadata, dict) else 1
    source_event_ids = _source_event_ids_for_context(context)
    changed_files = context["changed_files"]
    prompt_events = context["prompt_events"]
    responses = context["responses"]
    first_prompt = prompt_events[0] if prompt_events else None
    first_response = responses[0] if responses else None
    main_topics = []
    if first_prompt and first_prompt.get("prompt"):
        main_topics.append(_truncate(first_prompt["prompt"], 120))
    if changed_files:
        main_topics.append("code changes")

    user_intents = []
    if first_prompt and first_prompt.get("prompt"):
        user_intents.append(
            {
                "confidence": 0.55,
                "intent": _truncate(first_prompt["prompt"], 500),
                "source_event_ids": [first_prompt["id"]],
            }
        )
    ai_explanations = []
    if first_response and first_response.get("response"):
        ai_explanations.append(
            {
                "based_on": "ai_answer",
                "confidence": 0.5,
                "explanation": _truncate(first_response["response"], 700),
                "is_inferred": True,
                "source_event_ids": source_event_ids,
            }
        )
    implementation_signals = []
    if changed_files:
        implementation_signals.append(
            {
                "based_on": "changed_files",
                "confidence": 0.55,
                "content": f"{len(changed_files)} changed files were observed in this chunk.",
                "source_event_ids": source_event_ids,
            }
        )

    handoff = (
        f"Internal chunk {chunk_index} captured {len(prompt_events)} prompts, "
        f"{len(responses)} AI responses, and {len(changed_files)} changed files. "
        "Use this as intermediate evidence only."
    )
    return ChunkSummary.parse_obj({
        "ai_explanations": ai_explanations,
        "chunk_index": chunk_index if isinstance(chunk_index, int) else 1,
        "chunk_purpose": "internal_summary",
        "decisions_or_directions": [],
        "handoff_summary_for_second_pass": handoff,
        "implementation_signals": implementation_signals,
        "important_for_project_memory": [
            {
                "confidence": 0.45,
                "content": handoff,
                "reason": "This chunk may be needed by the second-pass memory draft generator.",
                "source_event_ids": source_event_ids,
            }
        ],
        "main_topics": main_topics,
        "open_questions": [],
        "rejected_directions": [],
        "source_event_ids": source_event_ids,
        "summary_level": 1,
        "uncertainties": [
            {
                "content": "Local fallback did not perform semantic analysis.",
                "reason": "Gemini chunk summary generation was unavailable or disabled.",
                "source_event_ids": source_event_ids,
            }
        ],
        "user_intents": user_intents,
    }).dict()


def _sections_from_chunk_summary(chunk_summary: dict[str, Any]) -> list[dict[str, str]]:
    sections: list[dict[str, str]] = []
    for key, title in (
        ("user_intents", "User intents"),
        ("ai_explanations", "AI explanations"),
        ("decisions_or_directions", "Decisions or directions"),
        ("rejected_directions", "Rejected directions"),
        ("implementation_signals", "Implementation signals"),
        ("open_questions", "Open questions"),
        ("uncertainties", "Uncertainties"),
    ):
        value = chunk_summary.get(key)
        if not isinstance(value, list) or not value:
            continue
        summaries: list[str] = []
        for item in value[:3]:
            if not isinstance(item, dict):
                continue
            text = (
                item.get("intent")
                or item.get("explanation")
                or item.get("content")
                or item.get("question")
            )
            if isinstance(text, str) and text.strip():
                summaries.append(_truncate(text, 160))
        if summaries:
            sections.append({"summary": " / ".join(summaries), "title": title})
    return sections[:6]


def _build_chunk_memory_payload_from_summary(
    context: dict[str, Any],
    chunk_summary: dict[str, Any],
    *,
    generator: str,
) -> dict[str, Any]:
    changed_files = context["changed_files"]
    handoff = _string_or_none(chunk_summary.get("handoff_summary_for_second_pass")) or (
        "Internal chunk summary generated without a clear handoff."
    )
    topics = [
        topic
        for topic in chunk_summary.get("main_topics", [])
        if isinstance(topic, str) and topic.strip()
    ]
    title_seed = topics[0] if topics else f"Internal memory chunk {chunk_summary['chunk_index']}"
    return {
        "changed_files": changed_files[:100],
        "commit_sha": context["commits"][-1]["hash"] if context["commits"] else None,
        "event_count": context["event_count"],
        "first_event_id": context["first_event_id"],
        "generator": generator,
        "last_event_id": context["last_event_id"],
        "model": context["model"],
        "outcome": handoff,
        "prompt_event_ids": [prompt["id"] for prompt in context["prompt_events"]],
        "reason": handoff,
        "sections": _sections_from_chunk_summary(chunk_summary),
        "summary": handoff,
        "tags": _tags_for_session(
            changed_files=changed_files,
            model=context["model"],
            tool=context["tool"],
        ),
        "technologies": _technologies_for_session(changed_files),
        "title": _truncate(f"Internal chunk {chunk_summary['chunk_index']}: {title_seed}", 180),
        "tool": context["tool"],
    }


def _build_chunk_payload_from_context(
    context: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any]]:
    local_chunk_summary = _build_local_chunk_summary(context)
    provider = _provider_name(settings.memory_chunk_generator)

    if provider not in {"gemini", "openai"}:
        return _build_chunk_memory_payload_from_summary(
            context,
            local_chunk_summary,
            generator=LOCAL_MEMORY_GENERATOR,
        ), {
            "chunk_summary": local_chunk_summary,
            "chunk_summary_generator": LOCAL_MEMORY_GENERATOR,
            "fallback_reason": f"{provider}_disabled",
        }

    try:
        chunk_summary = compile_internal_chunk_summary(context, provider=provider)
        generator = _generator_for_provider(provider, stage="chunk")
        return _build_chunk_memory_payload_from_summary(
            context,
            chunk_summary,
            generator=generator,
        ), {
            "chunk_summary": chunk_summary,
            "chunk_summary_generator": generator,
            **_model_metadata_for_provider(provider),
        }
    except GeminiMemoryGenerationError as exc:
        return _build_chunk_memory_payload_from_summary(
            context,
            local_chunk_summary,
            generator=LOCAL_MEMORY_GENERATOR,
        ), {
            "chunk_summary": local_chunk_summary,
            "chunk_summary_generator": LOCAL_MEMORY_GENERATOR,
            "fallback_generator": LOCAL_MEMORY_GENERATOR,
            "fallback_reason": str(exc),
            "requested_generator": _generator_for_provider(provider, stage="chunk"),
        }


def _source_chunk_ids_for_context(context: dict[str, Any]) -> list[str]:
    chunks = context.get("memory_chunks") if isinstance(context.get("memory_chunks"), list) else []
    return [
        chunk.get("id")
        for chunk in chunks
        if isinstance(chunk, dict) and isinstance(chunk.get("id"), str) and chunk.get("id")
    ]


def _source_events_from_chunk_summary(
    chunk_summary: dict[str, Any],
    fallback_ids: list[str],
) -> list[str]:
    source_ids = chunk_summary.get("source_event_ids")
    if isinstance(source_ids, list):
        cleaned = [item for item in source_ids if isinstance(item, str) and item]
        if cleaned:
            return cleaned
    return fallback_ids


def _draft_confidence_from_items(*items: list[Any]) -> float:
    confidences: list[float] = []
    for item_list in items:
        for item in item_list:
            if isinstance(item, dict) and isinstance(item.get("confidence"), (int, float)):
                confidences.append(float(item["confidence"]))
    if not confidences:
        return 0.52
    return max(0.35, min(sum(confidences) / len(confidences), 0.82))


def _local_draft_type_from_chunk(chunk_summary: dict[str, Any]) -> str:
    decisions = chunk_summary.get("decisions_or_directions")
    rejected = chunk_summary.get("rejected_directions")
    implementations = chunk_summary.get("implementation_signals")
    questions = chunk_summary.get("open_questions")
    topics = " ".join(
        item
        for item in chunk_summary.get("main_topics", [])
        if isinstance(item, str)
    ).lower()
    if isinstance(decisions, list) and decisions:
        return "process_note" if any(word in topics for word in ("policy", "flow", "workflow")) else "decision_note"
    if isinstance(rejected, list) and rejected:
        return "decision_note"
    if isinstance(implementations, list) and implementations:
        return "work_log"
    if isinstance(questions, list) and questions:
        return "issue_note"
    return "thinking_note"


def _local_draft_from_chunk(
    chunk: dict[str, Any],
    *,
    fallback_event_ids: list[str],
) -> dict[str, Any] | None:
    chunk_summary = chunk.get("chunk_summary")
    if not isinstance(chunk_summary, dict):
        return None

    chunk_id = chunk.get("id") if isinstance(chunk.get("id"), str) else None
    source_chunk_ids = [chunk_id] if chunk_id else []
    source_event_ids = _source_events_from_chunk_summary(chunk_summary, fallback_event_ids)
    topics = [
        item.strip()
        for item in chunk_summary.get("main_topics", [])
        if isinstance(item, str) and item.strip()
    ]
    handoff = _string_or_none(chunk_summary.get("handoff_summary_for_second_pass"))
    title = _truncate(topics[0] if topics else chunk.get("title") or "Memory draft", 120)
    summary = _truncate(
        handoff
        or chunk.get("summary")
        or "Local fallback converted an internal chunk summary into generated context memory.",
        700,
    )
    user_intents = (
        chunk_summary.get("user_intents")
        if isinstance(chunk_summary.get("user_intents"), list)
        else []
    )
    ai_explanations = (
        chunk_summary.get("ai_explanations")
        if isinstance(chunk_summary.get("ai_explanations"), list)
        else []
    )
    decisions = (
        chunk_summary.get("decisions_or_directions")
        if isinstance(chunk_summary.get("decisions_or_directions"), list)
        else []
    )
    rejected = (
        chunk_summary.get("rejected_directions")
        if isinstance(chunk_summary.get("rejected_directions"), list)
        else []
    )
    implementations = (
        chunk_summary.get("implementation_signals")
        if isinstance(chunk_summary.get("implementation_signals"), list)
        else []
    )
    important = (
        chunk_summary.get("important_for_project_memory")
        if isinstance(chunk_summary.get("important_for_project_memory"), list)
        else []
    )
    questions = (
        chunk_summary.get("open_questions")
        if isinstance(chunk_summary.get("open_questions"), list)
        else []
    )
    uncertainties = (
        chunk_summary.get("uncertainties")
        if isinstance(chunk_summary.get("uncertainties"), list)
        else []
    )
    confidence = _draft_confidence_from_items(
        user_intents,
        ai_explanations,
        decisions,
        rejected,
        implementations,
        important,
    )
    first_important = next((item for item in important if isinstance(item, dict)), None)
    first_intent = user_intents[0] if user_intents and isinstance(user_intents[0], dict) else {}
    first_intent_text = _string_or_none(first_intent.get("intent"))
    why_it_matters = _truncate(
        (_string_or_none(first_important.get("reason")) if first_important else None)
        or summary,
        700,
    )
    return {
        "confidence": confidence,
        "details": {
            "decisions": [
                {
                    "confidence": float(item.get("confidence", confidence)),
                    "decision": _truncate(item.get("content"), 500),
                    "reason": _truncate(
                        item.get("reason") or "Confirmed in the internal chunk summary.",
                        500,
                    ),
                    "source_chunk_ids": source_chunk_ids,
                    "source_event_ids": item.get("source_event_ids")
                    if isinstance(item.get("source_event_ids"), list)
                    else source_event_ids,
                }
                for item in decisions
                if isinstance(item, dict) and _string_or_none(item.get("content"))
            ],
            "next_steps": [],
            "open_questions": [
                {
                    "question": _truncate(item.get("question"), 500),
                    "source_chunk_ids": source_chunk_ids,
                    "source_event_ids": item.get("source_event_ids")
                    if isinstance(item.get("source_event_ids"), list)
                    else source_event_ids,
                }
                for item in questions
                if isinstance(item, dict) and _string_or_none(item.get("question"))
            ],
            "problem": _truncate(first_intent_text, 700) if first_intent_text else None,
            "rejected_directions": [
                {
                    "confidence": float(item.get("confidence", confidence)),
                    "content": _truncate(item.get("content"), 500),
                    "reason": _truncate(item.get("reason"), 500)
                    if _string_or_none(item.get("reason"))
                    else None,
                    "source_chunk_ids": source_chunk_ids,
                    "source_event_ids": item.get("source_event_ids")
                    if isinstance(item.get("source_event_ids"), list)
                    else source_event_ids,
                }
                for item in rejected
                if isinstance(item, dict) and _string_or_none(item.get("content"))
            ],
            "what_happened": [
                _truncate(item.get("content"), 500)
                for item in implementations
                if isinstance(item, dict) and _string_or_none(item.get("content"))
            ]
            or [summary],
            "why_started": _truncate(first_intent_text, 700) if first_intent_text else None,
        },
        "evidence": {
            "based_on": ["chunk_summary"],
            "source_chunk_ids": source_chunk_ids,
            "source_event_ids": source_event_ids,
        },
        "needs_user_verification": confidence < 0.7 or bool(uncertainties),
        "suggested_user_action": "edit" if confidence < 0.7 or uncertainties else "save",
        "summary": summary,
        "title": title,
        "type": _local_draft_type_from_chunk(chunk_summary),
        "why_it_matters": why_it_matters,
    }


def _paired_response_for_prompt(
    prompt: dict[str, Any] | None,
    responses: list[dict[str, Any]],
) -> dict[str, Any] | None:
    if not prompt or prompt.get("turn_id") is None:
        return None
    return next(
        (
            response
            for response in responses
            if response.get("turn_id") == prompt.get("turn_id")
            and _string_or_none(response.get("response"))
        ),
        None,
    )


def _local_draft_from_remaining_events(context: dict[str, Any]) -> dict[str, Any]:
    source_event_ids = _source_event_ids_for_context(context)
    prompts = context["prompt_events"]
    responses = context["responses"]
    latest_prompt = prompts[-1] if prompts else None
    first_prompt = prompts[0] if prompts else None
    prompt_text = _string_or_none(latest_prompt.get("prompt")) if latest_prompt else None
    first_prompt_text = _string_or_none(first_prompt.get("prompt")) if first_prompt else None
    paired_response = _paired_response_for_prompt(latest_prompt, responses)
    response_text = _string_or_none(paired_response.get("response")) if paired_response else None
    basis_text = response_text if latest_prompt and latest_prompt.get("prompt_ai_preview_truncated") else prompt_text
    title = _title_from_session(
        prompts=context["prompt_events"],
        project_name=context["project_name"],
    )
    if basis_text:
        summary = _truncate(
            (
                f"AI answer suggested: {basis_text}"
                if response_text and latest_prompt and latest_prompt.get("prompt_ai_preview_truncated")
                else basis_text
            ),
            700,
        )
    else:
        summary = "Local fallback captured remaining event previews for review."
    why_started = _truncate(first_prompt_text or prompt_text or summary, 700)
    based_on = ["remaining_event_preview"]
    if response_text:
        based_on.append("paired_ai_output")
    return {
        "confidence": 0.52 if basis_text else 0.35,
        "details": {
            "decisions": [],
            "next_steps": [],
            "open_questions": [],
            "problem": _truncate(prompt_text or first_prompt_text or summary, 700),
            "rejected_directions": [],
            "what_happened": [summary],
            "why_started": why_started,
        },
        "evidence": {
            "based_on": based_on,
            "source_chunk_ids": [],
            "source_event_ids": source_event_ids,
        },
        "needs_user_verification": True,
        "suggested_user_action": "edit",
        "summary": summary,
        "title": title,
        "type": "thinking_note",
        "why_it_matters": why_started,
    }


def _build_local_memory_drafts_response(
    context: dict[str, Any],
    *,
    trigger_reason: str,
) -> dict[str, Any]:
    source_event_ids = _source_event_ids_for_context(context)
    source_chunk_ids = _source_chunk_ids_for_context(context)
    chunks = context.get("memory_chunks") if isinstance(context.get("memory_chunks"), list) else []
    drafts = [
        draft
        for chunk in chunks
        if isinstance(chunk, dict)
        for draft in [_local_draft_from_chunk(chunk, fallback_event_ids=source_event_ids)]
        if draft is not None
    ]
    if not drafts:
        drafts = [_local_draft_from_remaining_events(context)]
    return MemoryDraftGeneration.parse_obj({
        "draft_generation_reason": (
            f"Local fallback generated {len(drafts)} draft(s) for {trigger_reason} "
            "from chunk summaries or remaining event previews."
        ),
        "memory_drafts": drafts,
        "overall_uncertainties": [
            {
                "content": "Local fallback used deterministic draft assembly instead of Gemini second-pass reasoning.",
                "reason": "Gemini memory draft generation was unavailable or disabled.",
                "source_chunk_ids": source_chunk_ids,
                "source_event_ids": source_event_ids,
            }
        ],
        "source_chunk_ids": source_chunk_ids,
        "source_event_ids": source_event_ids,
        "summary_level": 2,
    }).dict()


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
    source_event_ids = _source_event_ids_for_context(context)
    provider = _provider_name(settings.memory_draft_generator)
    if provider not in {"gemini", "openai"}:
        return [], {
            "fallback_reason": f"{provider}_disabled",
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
            "source_chunk_ids": source_chunk_ids,
            "source_event_ids": source_event_ids,
        }

    drafts = response.get("memory_drafts") if isinstance(response.get("memory_drafts"), list) else []
    if not drafts:
        return [], {
            **generation_metadata,
            "fallback_reason": "Second-pass generator returned no usable drafts.",
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
            "suggested_user_action": draft.get("suggested_user_action"),
        }
        payloads.append(
            (
                _payload_from_memory_draft(context, draft, generator=generator),
                draft_metadata,
            )
        )
    return payloads, generation_metadata


def _build_memory_payload(db: DBSession, session: Session) -> tuple[dict[str, Any], dict[str, Any]]:
    return _build_memory_payload_from_context(_build_session_memory_context(db, session))


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
                Artifact.type == MEMORY_CHUNK_ARTIFACT_TYPE,
            )
            .order_by(Artifact.created_at, Artifact.updated_at)
        ).scalars()
    )
    return [artifact for artifact in artifacts if _slice_metadata(artifact)]


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
        return {
            "end_sequence": next_prompt.sequence - 1 if next_prompt else latest_event.sequence,
            "reason": "prompt_count",
            "selected_prompts": selected_prompts,
            "start_sequence": selected_prompts[0].sequence,
        }

    if finalize:
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
    if session.ended_at is not None:
        return {
            "completed": True,
            "completed_at": session.ended_at,
            "reason": "explicit",
        }
    if latest_event_at and latest_event_at <= utc_now() - SESSION_IDLE_COMPLETE_AFTER:
        return {
            "completed": True,
            "completed_at": latest_event_at,
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
        artifact = generate_memory_draft_for_session(
            db,
            session,
            force_regenerate=force_regenerate,
            trigger_reason=job.reason,
        )
        if artifact is None:
            job.metadata_ = {"status": "no_draft", "reason": "No pending memory range."}
        else:
            job.artifact_id = artifact.id
            job.generator = artifact.generator or job.generator
            job.metadata_ = {
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


def _generate_memory_artifact_for_context(
    db: DBSession,
    *,
    artifact_type: str = MEMORY_ARTIFACT_TYPE,
    context: dict[str, Any],
    extra_metadata: dict[str, Any] | None = None,
    force_regenerate: bool,
    session: Session,
    storage_key: str,
) -> Artifact:
    artifact = db.execute(
        select(Artifact).where(
            Artifact.project_id == session.project_id,
            Artifact.session_id == session.id,
            Artifact.type == artifact_type,
            Artifact.storage_key == storage_key,
        )
    ).scalar_one_or_none()
    if (
        not force_regenerate
        and artifact is not None
        and _artifact_is_current_for_context(artifact, context)
    ):
        return artifact

    if artifact_type == MEMORY_CHUNK_ARTIFACT_TYPE:
        payload, generation_metadata = _build_chunk_payload_from_context(context)
    else:
        payload, generation_metadata = _build_memory_payload_from_context(context)
    if force_regenerate:
        generation_metadata = {
            **generation_metadata,
            "forced_regeneration": True,
        }
    slice_metadata = context.get("slice") if isinstance(context.get("slice"), dict) else {}
    generation_metadata = {
        "commit_metadata": context["commits"],
        "memory_scope": "prompt_window" if slice_metadata else "session",
        **slice_metadata,
        **generation_metadata,
        **(extra_metadata or {}),
    }
    if artifact is None:
        artifact = Artifact(
            project_id=session.project_id,
            session_id=session.id,
            event_id=UUID(payload["last_event_id"]) if payload["last_event_id"] else None,
            type=artifact_type,
            title=payload["title"],
            storage_key=storage_key,
        )
        db.add(artifact)
        db.flush()

    artifact_version = _create_artifact_version(
        db,
        artifact=artifact,
        generation_metadata=generation_metadata,
        payload=payload,
    )

    artifact.schema_version = 1
    artifact.event_id = UUID(payload["last_event_id"]) if payload["last_event_id"] else None
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
        "event_count": payload["event_count"],
        "first_event_id": payload["first_event_id"],
        "last_event_id": payload["last_event_id"],
        "latest_version": artifact_version.version,
        "latest_version_id": str(artifact_version.id),
        "tool": payload["tool"],
        **generation_metadata,
    }
    artifact.updated_at = utc_now()
    db.flush()
    return artifact


def generate_memory_artifact_for_session(
    db: DBSession,
    session: Session,
    *,
    force_regenerate: bool = False,
) -> Artifact:
    return _generate_memory_artifact_for_context(
        db,
        context=_build_session_memory_context(db, session),
        extra_metadata={"review_state": REVIEW_STATE_VERIFIED},
        force_regenerate=force_regenerate,
        session=session,
        storage_key=f"memory/session/{session.id}/full",
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
        artifact = _generate_memory_artifact_for_context(
            db,
            artifact_type=MEMORY_CHUNK_ARTIFACT_TYPE,
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
                f"memory/session/{session.id}/window/"
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
                    _generate_memory_artifact_for_context(
                        db,
                        artifact_type=MEMORY_CHUNK_ARTIFACT_TYPE,
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


def _memory_chunks_for_session(db: DBSession, session: Session) -> list[Artifact]:
    return list(
        db.execute(
            select(Artifact)
            .where(
                Artifact.project_id == session.project_id,
                Artifact.session_id == session.id,
                Artifact.type == MEMORY_CHUNK_ARTIFACT_TYPE,
            )
            .order_by(Artifact.created_at, Artifact.updated_at)
        ).scalars()
    )


def _latest_draft_for_session(
    db: DBSession,
    session: Session,
    *,
    storage_key: str,
) -> Artifact | None:
    return db.execute(
        select(Artifact).where(
            Artifact.project_id == session.project_id,
            Artifact.session_id == session.id,
            Artifact.type == MEMORY_DRAFT_ARTIFACT_TYPE,
            Artifact.storage_key == storage_key,
        )
    ).scalar_one_or_none()


def _memory_chunk_evidence(chunks: list[Artifact]) -> list[dict[str, Any]]:
    evidence: list[dict[str, Any]] = []
    for chunk in chunks:
        metadata = chunk.metadata_ if isinstance(chunk.metadata_, dict) else {}
        evidence.append(
            {
                "changed_file_count": len(chunk.changed_files or []),
                "chunk_summary": metadata.get("chunk_summary")
                if isinstance(metadata.get("chunk_summary"), dict)
                else None,
                "end_sequence": metadata.get("end_sequence"),
                "id": str(chunk.id),
                "outcome": chunk.outcome,
                "prompt_count": metadata.get("prompt_count"),
                "reason": chunk.reason,
                "sections": chunk.sections,
                "slice_index": metadata.get("slice_index"),
                "start_sequence": metadata.get("start_sequence"),
                "summary": chunk.summary,
                "title": chunk.title,
                "window_reason": metadata.get("window_reason"),
            }
        )
    return evidence


def _remaining_event_previews_after_chunks(
    context: dict[str, Any],
    chunks: list[Artifact],
) -> list[dict[str, Any]]:
    end_sequences = [
        metadata["end_sequence"]
        for chunk in chunks
        if isinstance((metadata := chunk.metadata_ if isinstance(chunk.metadata_, dict) else {}).get("end_sequence"), int)
    ]
    if not end_sequences:
        return context["events"]
    latest_chunk_end = max(end_sequences)
    return [
        event
        for event in context["events"]
        if isinstance(event.get("sequence"), int) and event["sequence"] > latest_chunk_end
    ]


def _latest_event_sequence(db: DBSession, session: Session) -> int | None:
    latest_event = _latest_session_event(db, session)
    return latest_event.sequence if latest_event is not None else None


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
        covered_end = _latest_memory_cover_end_sequence(db, session)
        pending_query = select(Event).where(
            Event.project_id == project_id,
            Event.session_id == session.id,
        )
        if covered_end is not None:
            pending_query = pending_query.where(Event.sequence > covered_end)
        events = list(db.execute(pending_query.order_by(Event.sequence)).scalars())
        if not events:
            continue
        prompt_count = sum(1 for event in events if event.event_type == "PromptSubmitted")
        ranges.append(
            {
                "can_checkpoint": prompt_count > 0,
                "end_sequence": events[-1].sequence,
                "event_count": len(events),
                "last_event_at": _iso(events[-1].created_at),
                "prompt_count": prompt_count,
                "session_id": str(session.id),
                "start_sequence": events[0].sequence,
                "tool": session.tool,
            }
        )
        if len(ranges) >= limit:
            break
    return ranges


def generate_memory_drafts_for_session(
    db: DBSession,
    session: Session,
    *,
    end_sequence: int | None = None,
    force_regenerate: bool = False,
    start_sequence: int | None = None,
    trigger_reason: str,
) -> list[Artifact]:
    chunks = generate_due_memory_artifacts_for_session(
        db,
        session,
        finalize=True,
        force_regenerate_latest=force_regenerate,
    )
    all_chunks = _memory_chunks_for_session(db, session)
    latest_sequence = end_sequence if end_sequence is not None else _latest_event_sequence(db, session)

    context = _build_session_memory_context(
        db,
        session,
        end_sequence=end_sequence,
        start_sequence=start_sequence,
    )
    if not context["events"]:
        return []
    covered_start_sequence = context["events"][0]["sequence"]
    covered_end_sequence = context["events"][-1]["sequence"]
    relevant_chunks = [
        chunk
        for chunk in all_chunks
        if not isinstance((metadata := chunk.metadata_ if isinstance(chunk.metadata_, dict) else {}).get("end_sequence"), int)
        or metadata["end_sequence"] >= covered_start_sequence
    ]
    context["memory_chunks"] = _memory_chunk_evidence(relevant_chunks)
    context["remaining_event_previews"] = _remaining_event_previews_after_chunks(
        context,
        relevant_chunks,
    )
    source_chunk_ids = [str(chunk.id) for chunk in relevant_chunks]
    payloads, generation_metadata = _build_memory_draft_payloads_from_context(
        context,
        trigger_reason=trigger_reason,
    )
    drafts: list[Artifact] = []
    event_id = UUID(context["last_event_id"]) if context["last_event_id"] else None
    for index, (payload, draft_metadata) in enumerate(payloads, start=1):
        storage_key = (
            f"memory/session/{session.id}/draft/"
            f"{latest_sequence or 0}/{trigger_reason}/{index}"
        )
        existing_draft = _latest_draft_for_session(db, session, storage_key=storage_key)
        if existing_draft is not None and not force_regenerate:
            metadata = (
                existing_draft.metadata_ if isinstance(existing_draft.metadata_, dict) else {}
            )
            if metadata.get("review_state") == REVIEW_STATE_DRAFT:
                drafts.append(existing_draft)
                continue
        drafts.append(
            _write_memory_artifact_payload(
                db,
                artifact_type=MEMORY_DRAFT_ARTIFACT_TYPE,
                event_id=event_id,
                extra_metadata={
                    **draft_metadata,
                    **generation_metadata,
                    "artifact_stage": "memory_draft",
                    "commit_metadata": context["commits"],
                    "memory_scope": "draft",
                    "review_state": REVIEW_STATE_DRAFT,
                    "summary_level": 2,
                    "trigger_reason": trigger_reason,
                    "generated_chunk_ids": [str(chunk.id) for chunk in relevant_chunks],
                    "source_chunk_ids": source_chunk_ids,
                    "start_sequence": covered_start_sequence,
                    "end_sequence": covered_end_sequence,
                },
                payload=payload,
                project_id=session.project_id,
                session_id=session.id,
                storage_key=storage_key,
            )
        )

    return drafts


def generate_context_memories_for_session(
    db: DBSession,
    session: Session,
    *,
    end_sequence: int | None = None,
    force_regenerate: bool = False,
    start_sequence: int | None = None,
    trigger_reason: str,
) -> list[Artifact]:
    generate_due_memory_artifacts_for_session(
        db,
        session,
        finalize=True,
        force_regenerate_latest=force_regenerate,
    )
    all_chunks = _memory_chunks_for_session(db, session)
    latest_sequence = end_sequence if end_sequence is not None else _latest_event_sequence(db, session)

    context = _build_session_memory_context(
        db,
        session,
        end_sequence=end_sequence,
        start_sequence=start_sequence,
    )
    if not context["events"]:
        return []
    covered_start_sequence = context["events"][0]["sequence"]
    covered_end_sequence = context["events"][-1]["sequence"]
    relevant_chunks = [
        chunk
        for chunk in all_chunks
        if not isinstance((metadata := chunk.metadata_ if isinstance(chunk.metadata_, dict) else {}).get("end_sequence"), int)
        or metadata["end_sequence"] >= covered_start_sequence
    ]
    context["memory_chunks"] = _memory_chunk_evidence(relevant_chunks)
    context["remaining_event_previews"] = _remaining_event_previews_after_chunks(
        context,
        relevant_chunks,
    )
    source_chunk_ids = [str(chunk.id) for chunk in relevant_chunks]
    payloads, generation_metadata = _build_memory_draft_payloads_from_context(
        context,
        trigger_reason=trigger_reason,
    )
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
                    "generated_chunk_ids": [str(chunk.id) for chunk in relevant_chunks],
                    "source_chunk_ids": source_chunk_ids,
                    "start_sequence": covered_start_sequence,
                    "end_sequence": covered_end_sequence,
                },
                payload=payload,
                project_id=session.project_id,
                session_id=session.id,
                storage_key=storage_key,
            )
        )

    return memories


def generate_memory_draft_for_session(
    db: DBSession,
    session: Session,
    *,
    end_sequence: int | None = None,
    force_regenerate: bool = False,
    start_sequence: int | None = None,
    trigger_reason: str,
) -> Artifact | None:
    drafts = generate_memory_drafts_for_session(
        db,
        session,
        end_sequence=end_sequence,
        force_regenerate=force_regenerate,
        start_sequence=start_sequence,
        trigger_reason=trigger_reason,
    )
    if drafts:
        return drafts[0]

    context = _build_session_memory_context(
        db,
        session,
        end_sequence=end_sequence,
        start_sequence=start_sequence,
    )
    if not context["events"]:
        return None
    payload = _build_local_memory_payload(context)
    all_chunks = _memory_chunks_for_session(db, session)
    covered_start_sequence = context["events"][0]["sequence"]
    covered_end_sequence = context["events"][-1]["sequence"]
    return _write_memory_artifact_payload(
        db,
        artifact_type=MEMORY_DRAFT_ARTIFACT_TYPE,
        event_id=UUID(context["last_event_id"]) if context["last_event_id"] else None,
        extra_metadata={
            "artifact_stage": "memory_draft",
            "commit_metadata": context["commits"],
            "draft_generator": LOCAL_MEMORY_GENERATOR,
            "memory_scope": "draft",
            "generated_chunk_ids": [],
            "review_state": REVIEW_STATE_DRAFT,
            "summary_level": 2,
            "source_chunk_ids": [str(chunk.id) for chunk in all_chunks],
            "start_sequence": covered_start_sequence,
            "end_sequence": covered_end_sequence,
            "trigger_reason": trigger_reason,
        },
        payload=payload,
        project_id=session.project_id,
        session_id=session.id,
        storage_key=f"memory/session/{session.id}/draft/{_latest_event_sequence(db, session) or 0}/{trigger_reason}/fallback",
    )


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
        "Pending Memory accumulates event ranges that have not been organized.",
        "Prompt count, session, and token thresholds are used only for internal chunking.",
        "Internal chunk summaries are hidden from users.",
        "The user batch-organizes Pending Memory into generated context memories.",
        "Generated memories use Summary, Tasks, Decisions, and Follow-ups.",
        "Generated memories are saved automatically and Project Memory is recompiled immediately.",
        "Users can edit the final Project Memory snapshot after generation.",
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
        "Internal chunk summaries and ignored drafts are not source of truth.",
        "Prompt chunk size is 20 PromptSubmitted events.",
        "Prompts over 10,000 characters are summarized for AI using the first 100 characters, last 100 characters, and size.",
        "Large outputs follow the same preview policy when sent to AI.",
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
                    "- Do not rely on internal chunks or ignored drafts.",
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
                "Do not rely on internal chunks or ignored drafts.",
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
