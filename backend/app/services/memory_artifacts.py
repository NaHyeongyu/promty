from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session as DBSession

from app.core.config import settings
from app.models.artifact_generation_jobs import ArtifactGenerationJob
from app.models.artifacts import Artifact
from app.models.events import Event
from app.models.projects import Project
from app.models.sessions import Session
from app.services.event_payload_security import decrypt_event_payload
from app.services.gemini_memory import (
    GEMINI_MEMORY_GENERATOR,
    GeminiMemoryGenerationError,
    generate_gemini_memory_payload,
)

MEMORY_ARTIFACT_TYPE = "MemoryTask"
LOCAL_MEMORY_GENERATOR = "local-session-v1"
SESSION_IDLE_COMPLETE_AFTER = timedelta(minutes=45)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _string_or_none(value: Any) -> str | None:
    return value.strip() if isinstance(value, str) and value.strip() else None


def _truncate(value: str, limit: int = 220) -> str:
    cleaned = " ".join(value.split())
    return cleaned if len(cleaned) <= limit else f"{cleaned[: limit - 3].rstrip()}..."


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
        return {
            "prompt": _truncate(_string_or_none(payload.get("prompt")) or "", 600),
            "turn_id": payload.get("turn_id"),
        }
    if event_type == "ResponseReceived":
        return {
            "response": _truncate(_string_or_none(payload.get("response")) or "", 500),
            "success": payload.get("success"),
            "turn_id": payload.get("turn_id"),
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
    commits: list[dict[str, str | None]],
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
        file_sample = ", ".join(file["path"] for file in changed_files[:8])
        sections.append(
            {
                "summary": _truncate(file_sample, 360),
                "title": "Changed files",
            }
        )
    if commits:
        latest_commit = commits[-1]["message"] or commits[-1]["hash"] or "unknown"
        sections.append(
            {
                "summary": _truncate(latest_commit, 360),
                "title": "Latest commit",
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
    commits: list[dict[str, str | None]],
    prompts: list[dict[str, Any]],
    project_name: str,
) -> str:
    for commit in commits:
        message = _string_or_none(commit.get("message"))
        if message:
            return _truncate(message.splitlines()[0], 120)
    for prompt in prompts:
        prompt_text = _string_or_none(prompt.get("prompt"))
        if prompt_text:
            return _truncate(prompt_text.splitlines()[0], 120)
    return f"{project_name} development session"


def _build_session_memory_context(db: DBSession, session: Session) -> dict[str, Any]:
    project = session.project or db.get(Project, session.project_id)
    events = list(
        db.execute(
            select(Event)
            .where(Event.project_id == session.project_id, Event.session_id == session.id)
            .order_by(Event.sequence, Event.created_at)
        ).scalars()
    )
    payloads = [(event, _payload(event)) for event in events]
    prompt_events = [
        {
            "id": str(event.id),
            "prompt": _string_or_none(payload.get("prompt")),
            "sequence": event.sequence,
        }
        for event, payload in payloads
        if event.event_type == "PromptSubmitted"
    ]
    responses = [
        {
            "response": _string_or_none(payload.get("response")),
            "sequence": event.sequence,
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
    first_event = events[0] if events else None
    last_event = events[-1] if events else None
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
        "session_id": str(session.id),
        "started_at": _iso(session.started_at),
        "tool": session.tool,
    }


def _build_local_memory_payload(context: dict[str, Any]) -> dict[str, Any]:
    title = _title_from_session(
        commits=context["commits"],
        prompts=context["prompt_events"],
        project_name=context["project_name"],
    )
    changed_files = context["changed_files"]
    file_count = len(changed_files)
    prompt_count = len(context["prompt_events"])
    summary = (
        f"{prompt_count} prompts and {context['response_count']} AI responses were captured"
        f" in this session, touching {file_count} files."
    )
    reason = (
        _truncate(context["prompt_events"][0]["prompt"], 480)
        if context["prompt_events"] and context["prompt_events"][0]["prompt"]
        else "Promty captured this session as project memory from development events."
    )
    outcome = (
        f"Latest commit: {_truncate(context['commits'][-1]['message'] or context['commits'][-1]['hash'] or 'unknown', 240)}"
        if context["commits"]
        else f"{file_count} files changed and {prompt_count} prompts recorded."
    )
    technologies = _technologies_for_session(changed_files)
    sections = _local_sections_for_session(
        changed_files=changed_files,
        commits=context["commits"],
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
        "title": title,
        "tool": context["tool"],
    }


def _build_memory_payload_from_context(
    context: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any]]:
    local_payload = _build_local_memory_payload(context)

    if settings.memory_generator.strip().lower() != "gemini":
        return local_payload, {"fallback_reason": "gemini_disabled"}

    try:
        return generate_gemini_memory_payload(
            context=context,
            fallback_payload=local_payload,
        ), {"gemini_model": settings.gemini_model}
    except GeminiMemoryGenerationError as exc:
        local_payload["generator"] = LOCAL_MEMORY_GENERATOR
        return local_payload, {
            "fallback_generator": LOCAL_MEMORY_GENERATOR,
            "fallback_reason": str(exc),
            "requested_generator": GEMINI_MEMORY_GENERATOR,
        }


def _build_memory_payload(db: DBSession, session: Session) -> tuple[dict[str, Any], dict[str, Any]]:
    return _build_memory_payload_from_context(_build_session_memory_context(db, session))


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
        generator=GEMINI_MEMORY_GENERATOR
        if settings.memory_generator.strip().lower() == "gemini"
        else LOCAL_MEMORY_GENERATOR,
    )
    db.add(job)
    db.flush()
    return job


def run_artifact_generation_job(
    db: DBSession,
    job: ArtifactGenerationJob,
) -> ArtifactGenerationJob:
    job.status = "running"
    job.updated_at = utc_now()
    db.flush()

    try:
        session = db.get(Session, job.session_id)
        if session is None:
            raise ValueError("Session not found")
        artifact = generate_memory_artifact_for_session(db, session)
        job.artifact_id = artifact.id
        job.generator = artifact.generator or job.generator
        job.metadata_ = artifact.metadata_
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


def generate_memory_artifact_for_session(
    db: DBSession,
    session: Session,
) -> Artifact:
    context = _build_session_memory_context(db, session)
    artifact = db.execute(
        select(Artifact).where(
            Artifact.project_id == session.project_id,
            Artifact.session_id == session.id,
            Artifact.type == MEMORY_ARTIFACT_TYPE,
        )
    ).scalar_one_or_none()
    if artifact is not None and _artifact_is_current_for_context(artifact, context):
        return artifact

    payload, generation_metadata = _build_memory_payload_from_context(context)
    if artifact is None:
        artifact = Artifact(
            project_id=session.project_id,
            session_id=session.id,
            event_id=UUID(payload["last_event_id"]) if payload["last_event_id"] else None,
            type=MEMORY_ARTIFACT_TYPE,
            title=payload["title"],
            storage_key=f"memory/session/{session.id}",
        )
        db.add(artifact)

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
        "tool": payload["tool"],
        **generation_metadata,
    }
    artifact.updated_at = utc_now()
    db.flush()
    return artifact


def create_and_run_session_memory_job(
    db: DBSession,
    *,
    project_id: UUID,
    reason: str,
    session_id: UUID,
) -> ArtifactGenerationJob:
    job = create_artifact_generation_job(
        db,
        project_id=project_id,
        reason=reason,
        session_id=session_id,
    )
    return run_artifact_generation_job(db, job)


def list_project_memory_artifacts(
    db: DBSession,
    *,
    limit: int = 20,
    project_id: UUID,
) -> list[Artifact]:
    return list(
        db.execute(
            select(Artifact)
            .where(Artifact.project_id == project_id, Artifact.type == MEMORY_ARTIFACT_TYPE)
            .order_by(desc(Artifact.updated_at), desc(Artifact.created_at))
            .limit(limit)
        ).scalars()
    )


def serialize_memory_artifact(artifact: Artifact) -> dict[str, Any]:
    return {
        "changed_files": artifact.changed_files,
        "commit_sha": artifact.commit_sha,
        "created_at": _iso(artifact.created_at),
        "generator": artifact.generator,
        "id": str(artifact.id),
        "model": artifact.model,
        "outcome": artifact.outcome,
        "prompt_event_ids": artifact.prompt_event_ids,
        "reason": artifact.reason,
        "sections": artifact.sections,
        "session_id": str(artifact.session_id) if artifact.session_id else None,
        "summary": artifact.summary,
        "tags": artifact.tags,
        "technologies": artifact.technologies,
        "title": artifact.title,
        "type": artifact.type,
        "updated_at": _iso(artifact.updated_at),
    }


def serialize_memory_artifact_summary(artifact: Artifact) -> dict[str, Any]:
    return {
        "changed_file_count": len(artifact.changed_files or []),
        "changed_files": artifact.changed_files,
        "commit_sha": artifact.commit_sha,
        "created_at": _iso(artifact.created_at),
        "generator": artifact.generator,
        "id": str(artifact.id),
        "model": artifact.model,
        "outcome": artifact.outcome,
        "reason": artifact.reason,
        "sections": artifact.sections,
        "session_id": str(artifact.session_id) if artifact.session_id else None,
        "summary": artifact.summary,
        "tags": artifact.tags,
        "technologies": artifact.technologies,
        "title": artifact.title,
        "updated_at": _iso(artifact.updated_at),
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
