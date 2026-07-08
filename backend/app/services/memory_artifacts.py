from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session as DBSession

from app.core.config import settings
from app.core.time import utc_now
from app.models.artifact_generation_jobs import ArtifactGenerationJob
from app.models.artifacts import Artifact
from app.models.events import Event
from app.models.projects import Project
from app.models.sessions import Session
from app.services.memory.context import (
    build_pending_memory_draft_payload as _build_pending_memory_draft_payload,
    build_session_memory_context as _build_session_memory_context,
    dedupe_files as _dedupe_files,
    is_generic_local_memory_summary as _is_generic_local_memory_summary,
    iso as _iso,
    pending_draft_evidence_from_context as _pending_draft_evidence_from_context,
    string_or_none as _string_or_none,
    tags_for_session as _tags_for_session,
    technologies_for_session as _technologies_for_session,
    truncate as _truncate,
)
from app.services.memory.errors import MemoryGenerationError
from app.services.memory.providers import (
    generator_for_provider as _generator_for_provider,
    model_metadata_for_provider as _model_metadata_for_provider,
    provider_name as _provider_name,
)
from app.services.memory.project_memory import (
    compile_project_memory as compile_project_memory,
    get_latest_project_memory as get_latest_project_memory,
    list_project_memory_artifacts as list_project_memory_artifacts,
    update_project_memory_snapshot as update_project_memory_snapshot,
)
from app.services.memory.windows import (
    due_memory_window as _due_memory_window,
    latest_memory_slice as _latest_memory_slice,
    latest_memory_slice_end_sequence as _latest_memory_slice_end_sequence,
    latest_session_event as _latest_session_event,
    memory_slice_prompt_target as _memory_slice_prompt_target,
    next_memory_slice_index as _next_memory_slice_index,
    slice_metadata as _slice_metadata,
)
from app.services.memory.repository import (
    payload_from_artifact as _payload_from_artifact,
    write_memory_artifact_payload as _write_memory_artifact_payload,
)
from app.services.memory.constants import (
    MEMORY_ARTIFACT_TYPE,
    MEMORY_DRAFT_ARTIFACT_TYPE,
    MEMORY_WINDOW_STRATEGY,
    PENDING_DRAFT_STAGE,
    REVIEW_STATE_DRAFT,
    REVIEW_STATE_GENERATED,
    REVIEW_STATE_IGNORED,
    REVIEW_STATE_SAVED,
    REVIEW_STATE_VERIFIED,
    SESSION_IDLE_COMPLETE_AFTER,
)
from app.services.memory_pipeline import (
    compile_memory_drafts,
)
from app.services.memory.serializers import (
    serialize_artifact_version as serialize_artifact_version,
    serialize_generation_job as serialize_generation_job,
    serialize_memory_artifact as serialize_memory_artifact,
    serialize_memory_artifact_summary as serialize_memory_artifact_summary,
)


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
    except MemoryGenerationError as exc:
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
