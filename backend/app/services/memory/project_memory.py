from __future__ import annotations

from typing import Any
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
        "Captured work is converted into user-facing generated memories with AI answer and file-change evidence.",
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
        if provider_name(settings.project_memory_generator) in {"gemini", "openai"}
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
            .order_by(desc(Artifact.updated_at), desc(Artifact.created_at))
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
    provider = provider_name(settings.project_memory_generator)
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

    payload = _project_memory_payload(
        generator=generator,
        project=project,
        snapshot=snapshot,
    )
    return write_memory_artifact_payload(
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
