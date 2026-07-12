from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
from types import MappingProxyType
from typing import Any, Mapping
from uuid import UUID

from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session as DBSession

from app.core.config import settings
from app.models.artifacts import Artifact
from app.models.projects import Project
from app.schemas.memory import ProjectMemorySnapshot
from app.services.memory.constants import (
    LOCAL_MEMORY_GENERATOR,
    MEMORY_ARTIFACT_TYPE,
    PROJECT_MEMORY_ARTIFACT_TYPE,
    REVIEW_STATE_EDITED,
    REVIEW_STATE_GENERATED,
    REVIEW_STATE_VERIFIED,
)
from app.services.memory.context import iso
from app.services.memory.errors import MemoryGenerationError
from app.services.memory.providers import (
    generator_for_provider,
    model_metadata_for_provider,
    provider_name,
)
from app.services.memory.repository import write_memory_artifact_payload
from app.services.memory_pipeline import compile_project_memory_snapshot


@dataclass(frozen=True, slots=True)
class ProjectMemoryCompilationInput:
    base_guard: str
    existing_artifact_id: UUID | None
    force_regenerate: bool
    previous_snapshot: Mapping[str, Any] | None
    project_context: Mapping[str, Any]
    project_id: UUID
    provider: str
    reuse_existing: bool
    source_memory_contexts: tuple[Mapping[str, Any], ...]
    source_memory_ids: tuple[str, ...]
    source_session_ids: tuple[str, ...]
    memory_batch_ids: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class PreparedProjectMemoryCompilation:
    base_guard: str
    existing_artifact_id: UUID | None
    extra_metadata: Mapping[str, Any] | None
    payload: Mapping[str, Any] | None
    project_id: UUID
    reuse_existing: bool
    snapshot: Mapping[str, Any] | None


@dataclass(frozen=True, slots=True)
class _ProjectMemoryBaseState:
    base_guard: str
    existing_artifact_id: UUID | None
    existing_source_memory_ids: tuple[str, ...]
    previous_snapshot: Mapping[str, Any] | None
    project_context: Mapping[str, Any]
    source_memory_contexts: tuple[Mapping[str, Any], ...]


class ProjectMemoryCompilationConflict(RuntimeError):
    """The compilation base changed while provider generation was in flight."""


def _freeze_json(value: Any) -> Any:
    if isinstance(value, Mapping):
        return MappingProxyType({str(key): _freeze_json(item) for key, item in value.items()})
    if isinstance(value, (list, tuple)):
        return tuple(_freeze_json(item) for item in value)
    if value is None or isinstance(value, (bool, float, int, str)):
        return value
    raise TypeError("Project Memory compilation values must be JSON-compatible")


def _thaw_json(value: Any) -> Any:
    if isinstance(value, Mapping):
        return {str(key): _thaw_json(item) for key, item in value.items()}
    if isinstance(value, tuple):
        return [_thaw_json(item) for item in value]
    return value


def _guard_token(value: Mapping[str, Any]) -> str:
    canonical = json.dumps(
        _thaw_json(value),
        ensure_ascii=True,
        separators=(",", ":"),
        sort_keys=True,
    )
    digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return f"project-memory-v1:{digest}"


def _source_memory_context(artifact: Artifact) -> dict[str, Any]:
    metadata = artifact.metadata_ if isinstance(artifact.metadata_, dict) else {}
    return {
        "changed_file_count": len(artifact.changed_files or []),
        "created_at": iso(artifact.created_at),
        "draft_details": metadata.get("draft_details"),
        "draft_type": metadata.get("draft_type"),
        "id": str(artifact.id),
        "memory_scope": metadata.get("memory_scope"),
        "outcome": artifact.outcome,
        "reason": artifact.reason,
        "sections": artifact.sections,
        "source_draft_id": metadata.get("source_draft_id"),
        "source_draft_ids": metadata.get("source_draft_ids") or [],
        "source_draft_version_ids": metadata.get("source_draft_version_ids") or [],
        "source_session_ids": metadata.get("source_session_ids") or [],
        "memory_batch_id": metadata.get("memory_batch_id"),
        "first_event_at": metadata.get("first_event_at"),
        "last_event_at": metadata.get("last_event_at"),
        "session_id": str(artifact.session_id) if artifact.session_id else None,
        "summary": artifact.summary,
        "tags": artifact.tags,
        "technologies": artifact.technologies,
        "title": artifact.title,
        "updated_at": iso(artifact.updated_at),
    }


def _latest_project_memory_snapshot(db: DBSession, project_id: UUID) -> Artifact | None:
    return db.execute(
        select(Artifact)
        .where(
            Artifact.project_id == project_id,
            Artifact.type == PROJECT_MEMORY_ARTIFACT_TYPE,
        )
        .order_by(desc(Artifact.updated_at), desc(Artifact.created_at), desc(Artifact.id))
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


def _project_memory_base_state(
    db: DBSession,
    project_id: UUID,
) -> _ProjectMemoryBaseState:
    project = db.get(Project, project_id)
    if project is None:
        raise ValueError("Project not found")
    existing = _latest_project_memory_snapshot(db, project_id)
    source_memories = list_project_memory_artifacts(
        db,
        project_id=project_id,
        limit=100,
    )
    project_context = _project_context(project)
    source_memory_contexts = [_source_memory_context(memory) for memory in source_memories]
    existing_metadata = (
        existing.metadata_ if existing and isinstance(existing.metadata_, dict) else {}
    )
    previous_snapshot = (
        existing_metadata.get("project_memory_snapshot")
        if isinstance(existing_metadata.get("project_memory_snapshot"), dict)
        else None
    )
    existing_source_memory_ids = (
        existing_metadata.get("source_memory_ids")
        if isinstance(existing_metadata.get("source_memory_ids"), list)
        else []
    )
    guard_context = {
        "existing_project_memory": (
            {
                "generator": existing.generator,
                "id": str(existing.id),
                "project_memory_snapshot": previous_snapshot,
                "review_state": existing_metadata.get("review_state"),
                "source_memory_ids": existing_source_memory_ids,
                "updated_at": iso(existing.updated_at),
            }
            if existing is not None
            else None
        ),
        "project_context": project_context,
        "source_memories": source_memory_contexts,
    }
    return _ProjectMemoryBaseState(
        base_guard=_guard_token(guard_context),
        existing_artifact_id=existing.id if existing is not None else None,
        existing_source_memory_ids=tuple(
            value for value in existing_source_memory_ids if isinstance(value, str) and value
        ),
        previous_snapshot=_freeze_json(previous_snapshot)
        if previous_snapshot is not None
        else None,
        project_context=_freeze_json(project_context),
        source_memory_contexts=tuple(_freeze_json(memory) for memory in source_memory_contexts),
    )


def project_memory_compilation_guard(db: DBSession, project_id: UUID) -> str:
    """Return a deterministic token for the DB state used by Project Memory compilation."""

    return _project_memory_base_state(db, project_id).base_guard


def _local_project_memory_snapshot_from_context(
    *,
    project_context: Mapping[str, Any],
    requested_provider: str,
    source_memory_contexts: list[dict[str, Any]],
) -> dict[str, Any]:
    source_memory_ids = [
        memory_id
        for memory in source_memory_contexts
        if isinstance((memory_id := memory.get("id")), str) and memory_id
    ]
    product_goal = (
        project_context.get("description")
        or "Promty captures generated AI coding memory for future project context."
    )
    current_direction = (
        source_memory_contexts[0].get("summary")
        if source_memory_contexts and source_memory_contexts[0].get("summary")
        else "No generated memory has established a detailed current direction yet."
    )
    workflow = [
        "Raw Events are stored for every captured event.",
        "Pending Memory Drafts are created after 20 prompts, session end, or 1 hour of idle time.",
        "Captured work is converted into user-facing generated memories with AI answer and file-change evidence.",
        "The user generates all pending drafts into context memories with one action.",
        "Generated memories use Summary, Tasks, Decisions, and Follow-ups.",
        "Generated memories are saved to History and Project Memory is recompiled immediately.",
        "Users can edit generated memories and the final Project Memory snapshot after generation.",
    ]
    important_decisions = [
        {
            "decision": memory.get("title") or "Untitled memory",
            "reason": memory.get("reason") or memory.get("summary") or "",
            "source_memory_ids": [memory["id"]],
        }
        for memory in source_memory_contexts[:12]
        if isinstance(memory.get("id"), str) and memory.get("id")
    ]
    technical_assumptions = [
        "Project Memory uses generated and user-edited memories by default.",
        "Pending drafts and ignored memories are not source of truth.",
        "Prompt chunk size is 20 PromptSubmitted events.",
        "Large captured inputs are summarized before generation and should not be displayed as raw prompts.",
        "Cause analysis should primarily use generated summaries and paired AI answer evidence.",
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
                "\n".join(f"- {item['decision']}: {item['reason']}" for item in important_decisions)
                if important_decisions
                else "- No generated decisions yet."
            ),
            "## Technical Assumptions\n" + "\n".join(f"- {item}" for item in technical_assumptions),
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
    return ProjectMemorySnapshot.model_validate(
        {
            "body_markdown": body_markdown,
            "confidence": 0.45 if source_memory_contexts else 0.2,
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
            if requested_provider in {"gemini", "openai"}
            else [],
        }
    ).model_dump()


def _project_memory_payload(
    *,
    generator: str,
    project_context: Mapping[str, Any],
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
        "sections": [section for section in rendered_sections if section["summary"]],
        "summary": sections.get("current_direction") or "Compiled project memory snapshot.",
        "tags": sorted(set([*(project_context.get("tags") or []), "project-memory"]))[:12],
        "technologies": [],
        "title": f"{project_context.get('name') or 'Project'} Project Memory",
        "tool": "promty",
    }


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
            .order_by(desc(Artifact.updated_at), desc(Artifact.created_at), desc(Artifact.id))
            .limit(limit * 3)
        ).scalars()
    )
    source_memories = [
        artifact
        for artifact in artifacts
        if (metadata := artifact.metadata_ if isinstance(artifact.metadata_, dict) else {}).get(
            "review_state"
        )
        in {REVIEW_STATE_GENERATED, REVIEW_STATE_VERIFIED}
        and metadata.get("artifact_stage") in {"generated_memory", "verified_memory"}
    ]
    return source_memories[:limit]


def count_project_memory_artifacts(
    db: DBSession,
    *,
    project_id: UUID,
    since: Any | None = None,
) -> int:
    filters = [
        Artifact.project_id == project_id,
        Artifact.type == MEMORY_ARTIFACT_TYPE,
        Artifact.metadata_["review_state"].astext.in_(
            [REVIEW_STATE_GENERATED, REVIEW_STATE_VERIFIED]
        ),
        Artifact.metadata_["artifact_stage"].astext.in_(["generated_memory", "verified_memory"]),
    ]
    if since is not None:
        filters.append(Artifact.created_at >= since)
    return db.scalar(select(func.count(Artifact.id)).where(*filters)) or 0


def list_project_memory_history_artifacts(
    db: DBSession,
    *,
    limit: int = 20,
    project_id: UUID,
) -> list[Artifact]:
    return list(
        db.execute(
            select(Artifact)
            .where(
                Artifact.project_id == project_id,
                Artifact.type.in_([MEMORY_ARTIFACT_TYPE, PROJECT_MEMORY_ARTIFACT_TYPE]),
            )
            .order_by(desc(Artifact.updated_at), desc(Artifact.created_at), desc(Artifact.id))
            .limit(limit)
        ).scalars()
    )


def count_project_memory_history_artifacts(
    db: DBSession,
    *,
    project_id: UUID,
    since: Any | None = None,
) -> int:
    filters = [
        Artifact.project_id == project_id,
        Artifact.type.in_([MEMORY_ARTIFACT_TYPE, PROJECT_MEMORY_ARTIFACT_TYPE]),
    ]
    if since is not None:
        filters.append(Artifact.created_at >= since)
    return db.scalar(select(func.count(Artifact.id)).where(*filters)) or 0


def _required_context_sort_key(context: Mapping[str, Any]) -> tuple[str, str, str]:
    return (
        str(context.get("updated_at") or ""),
        str(context.get("created_at") or ""),
        str(context.get("id") or ""),
    )


def prepare_project_memory_compilation(
    db: DBSession,
    project_id: UUID,
    required_source_memory_contexts: list[dict[str, Any]] | None = None,
    *,
    force_regenerate: bool = False,
) -> ProjectMemoryCompilationInput:
    """Capture all DB-backed compiler inputs as detached, immutable values."""

    base_state = _project_memory_base_state(db, project_id)
    raw_required_contexts = required_source_memory_contexts or []
    if any(not isinstance(context, Mapping) for context in raw_required_contexts):
        raise ValueError("Required source memory contexts must be objects")
    sorted_required_contexts = sorted(
        [_thaw_json(context) for context in raw_required_contexts],
        key=_required_context_sort_key,
        reverse=True,
    )
    invalid_required_contexts = [
        context
        for context in sorted_required_contexts
        if not isinstance(context.get("id"), str) or not context.get("id")
    ]
    if invalid_required_contexts:
        raise ValueError("Required source memory contexts must include a non-empty string id")
    required_contexts_by_id: dict[str, dict[str, Any]] = {}
    for context in sorted_required_contexts:
        required_contexts_by_id.setdefault(context["id"], context)
    required_contexts = list(required_contexts_by_id.values())
    required_ids = {context["id"] for context in required_contexts}
    source_memory_contexts = [
        *required_contexts,
        *(
            _thaw_json(context)
            for context in base_state.source_memory_contexts
            if context.get("id") not in required_ids
        ),
    ]
    source_memory_ids = tuple(
        context["id"]
        for context in source_memory_contexts
        if isinstance(context.get("id"), str) and context.get("id")
    )
    source_session_ids = tuple(
        dict.fromkeys(
            source_session_id
            for memory in source_memory_contexts
            for source_session_id in (
                memory.get("source_session_ids")
                if isinstance(memory.get("source_session_ids"), list)
                else [memory.get("session_id")]
                if memory.get("session_id")
                else []
            )
            if isinstance(source_session_id, str) and source_session_id
        )
    )
    memory_batch_ids = tuple(
        dict.fromkeys(
            memory.get("memory_batch_id")
            for memory in source_memory_contexts
            if isinstance(memory.get("memory_batch_id"), str) and memory.get("memory_batch_id")
        )
    )
    return ProjectMemoryCompilationInput(
        base_guard=base_state.base_guard,
        existing_artifact_id=base_state.existing_artifact_id,
        force_regenerate=force_regenerate,
        previous_snapshot=base_state.previous_snapshot,
        project_context=base_state.project_context,
        project_id=project_id,
        provider=provider_name(settings.project_memory_generator),
        reuse_existing=(
            base_state.existing_artifact_id is not None
            and not force_regenerate
            and base_state.existing_source_memory_ids == source_memory_ids
        ),
        source_memory_contexts=tuple(_freeze_json(context) for context in source_memory_contexts),
        source_memory_ids=source_memory_ids,
        source_session_ids=source_session_ids,
        memory_batch_ids=memory_batch_ids,
    )


def generate_project_memory_compilation(
    compilation_input: ProjectMemoryCompilationInput,
) -> PreparedProjectMemoryCompilation:
    """Run Project Memory generation using detached input and no database access."""

    if compilation_input.reuse_existing:
        return PreparedProjectMemoryCompilation(
            base_guard=compilation_input.base_guard,
            existing_artifact_id=compilation_input.existing_artifact_id,
            extra_metadata=None,
            payload=None,
            project_id=compilation_input.project_id,
            reuse_existing=True,
            snapshot=None,
        )

    project_context = _thaw_json(compilation_input.project_context)
    previous_snapshot = (
        _thaw_json(compilation_input.previous_snapshot)
        if compilation_input.previous_snapshot is not None
        else None
    )
    source_memory_contexts = [
        _thaw_json(context) for context in compilation_input.source_memory_contexts
    ]
    local_snapshot = _local_project_memory_snapshot_from_context(
        project_context=project_context,
        requested_provider=compilation_input.provider,
        source_memory_contexts=source_memory_contexts,
    )
    context = {
        "previous_project_memory": previous_snapshot,
        "project_context": project_context,
        "source_memories": source_memory_contexts,
        "verified_memories": source_memory_contexts,
    }
    provider = compilation_input.provider
    if provider not in {"gemini", "openai"}:
        snapshot = local_snapshot
        generator = LOCAL_MEMORY_GENERATOR
        generation_metadata = {"fallback_reason": f"{provider}_disabled"}
    else:
        try:
            snapshot = compile_project_memory_snapshot(context, provider=provider)
            generator = generator_for_provider(provider, stage="project")
            generation_metadata = model_metadata_for_provider(provider)
        except MemoryGenerationError as exc:
            snapshot = local_snapshot
            generator = LOCAL_MEMORY_GENERATOR
            generation_metadata = {
                "fallback_generator": LOCAL_MEMORY_GENERATOR,
                "fallback_reason": str(exc),
                "requested_generator": generator_for_provider(provider, stage="project"),
            }

    snapshot = {
        **snapshot,
        "source_memory_ids": list(compilation_input.source_memory_ids),
    }
    payload = _project_memory_payload(
        generator=generator,
        project_context=project_context,
        snapshot=snapshot,
    )
    extra_metadata = {
        "memory_batch_ids": list(compilation_input.memory_batch_ids),
        "memory_scope": "project",
        "project_memory_snapshot": snapshot,
        "review_state": REVIEW_STATE_GENERATED,
        "source_memory_ids": snapshot.get("source_memory_ids")
        or list(compilation_input.source_memory_ids),
        "source_session_ids": list(compilation_input.source_session_ids),
        **generation_metadata,
    }
    return PreparedProjectMemoryCompilation(
        base_guard=compilation_input.base_guard,
        existing_artifact_id=compilation_input.existing_artifact_id,
        extra_metadata=_freeze_json(extra_metadata),
        payload=_freeze_json(payload),
        project_id=compilation_input.project_id,
        reuse_existing=False,
        snapshot=_freeze_json(snapshot),
    )


def write_project_memory_compilation(
    db: DBSession,
    prepared: PreparedProjectMemoryCompilation,
) -> Artifact:
    """Persist a prepared compilation without invoking a model provider."""

    if prepared.reuse_existing:
        if prepared.existing_artifact_id is None:
            raise ProjectMemoryCompilationConflict("Reusable Project Memory artifact is missing")
        existing = db.get(Artifact, prepared.existing_artifact_id)
        if existing is None or existing.project_id != prepared.project_id:
            raise ProjectMemoryCompilationConflict("Reusable Project Memory artifact changed")
        return existing
    if prepared.payload is None or prepared.extra_metadata is None:
        raise ValueError("Prepared Project Memory payload is incomplete")
    return write_memory_artifact_payload(
        db,
        artifact_id=prepared.existing_artifact_id,
        artifact_type=PROJECT_MEMORY_ARTIFACT_TYPE,
        event_id=None,
        extra_metadata=_thaw_json(prepared.extra_metadata),
        payload=_thaw_json(prepared.payload),
        project_id=prepared.project_id,
        session_id=None,
        storage_key=f"memory/project/{prepared.project_id}/latest",
    )


def compile_project_memory(
    db: DBSession,
    *,
    force_regenerate: bool = False,
    project_id: UUID,
    required_source_memories: list[Artifact] | None = None,
) -> Artifact:
    compilation_input = prepare_project_memory_compilation(
        db,
        project_id,
        [_source_memory_context(memory) for memory in (required_source_memories or [])],
        force_regenerate=force_regenerate,
    )
    prepared = generate_project_memory_compilation(compilation_input)
    if project_memory_compilation_guard(db, project_id) != prepared.base_guard:
        raise ProjectMemoryCompilationConflict("Project Memory compilation base changed")
    return write_project_memory_compilation(db, prepared)


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
    existing_metadata = (
        existing.metadata_ if existing and isinstance(existing.metadata_, dict) else {}
    )
    previous_snapshot = (
        existing_metadata.get("project_memory_snapshot")
        if isinstance(existing_metadata.get("project_memory_snapshot"), dict)
        else None
    )
    if previous_snapshot is None:
        previous_snapshot = _local_project_memory_snapshot_from_context(
            project_context=_project_context(project),
            requested_provider=provider_name(settings.project_memory_generator),
            source_memory_contexts=[
                _source_memory_context(memory)
                for memory in list_project_memory_artifacts(
                    db,
                    project_id=project_id,
                    limit=100,
                )
            ],
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
        project_context=_project_context(project),
        snapshot=snapshot,
    )
    return write_memory_artifact_payload(
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
