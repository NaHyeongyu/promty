from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
import re
from typing import Any
from uuid import UUID

from sqlalchemy import desc, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DBSession

from app.core.encryption import maybe_decrypt_app_text_from_string
from app.models.code_change_patches import CodeChangePatch
from app.models.events import Event
from app.models.projects import Project
from app.models.published_prompts import (
    PublishedPrompt,
    PublishedPromptComment,
    PublishedPromptFile,
    PublishedPromptReaction,
)
from app.models.sessions import Session as PromptSession
from app.models.users import User
from app.schemas.prompt_hub import (
    PromptHubDraftFromActivityRequest,
    PromptHubSharedScope,
    PromptHubUpdateRequest,
)
from app.services.event_payload_security import (
    CODE_CHANGE_PATCH_PURPOSE,
    decrypt_event_payload,
)

DEFAULT_PROMPT_PLACEHOLDER = "Prompt text was not included in this draft."
PROMPT_HUB_DIFF_MAX_CHARS = 12000
PROMPT_HUB_RESULT_MAX_CHARS = 12000


class PromptHubError(ValueError):
    pass


class PromptHubNotFound(PromptHubError):
    pass


class PromptHubConflict(PromptHubError):
    pass


class PromptHubValidationError(PromptHubError):
    pass


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug[:120] or "prompt"


def _unique_slug(db: DBSession, title: str, *, ignore_id: UUID | None = None) -> str:
    base = _slugify(title)
    candidate = base
    suffix = 2
    while True:
        query = select(PublishedPrompt.id).where(PublishedPrompt.slug == candidate)
        if ignore_id is not None:
            query = query.where(PublishedPrompt.id != ignore_id)
        if db.scalar(query) is None:
            return candidate
        suffix_text = f"-{suffix}"
        candidate = f"{base[: 255 - len(suffix_text)]}{suffix_text}"
        suffix += 1


def _normalize_tags(tags: list[str] | None) -> list[str]:
    if tags is None:
        return []
    normalized: list[str] = []
    seen: set[str] = set()
    for raw_tag in tags:
        tag = raw_tag.strip().lower()
        if not tag or tag in seen:
            continue
        seen.add(tag)
        normalized.append(tag)
    return normalized


def _scope_dict(scope: PromptHubSharedScope | dict[str, Any]) -> dict[str, bool]:
    if isinstance(scope, PromptHubSharedScope):
        return scope.model_dump()
    return PromptHubSharedScope(**scope).dict()


def _project_for_user(db: DBSession, project_id: UUID, user: User) -> Project:
    project = db.scalar(
        select(Project).where(Project.id == project_id, Project.owner_id == user.id)
    )
    if project is None:
        raise PromptHubNotFound("Project not found")
    return project


def _draft_for_user(db: DBSession, prompt_id: UUID, user: User) -> PublishedPrompt:
    prompt = db.get(PublishedPrompt, prompt_id)
    if prompt is None or prompt.author_id != user.id:
        raise PromptHubNotFound("Published prompt not found")
    return prompt


def _payload(event: Event) -> dict[str, Any]:
    return decrypt_event_payload(event.event_type, event.payload)


def _string_payload_value(payload: dict[str, Any], key: str) -> str | None:
    value = payload.get(key)
    return value if isinstance(value, str) and value.strip() else None


def _model_name(event: Event, session: PromptSession | None, payload: dict[str, Any]) -> str | None:
    return _string_payload_value(payload, "model") or (session.model if session else None)


def _find_prompt_event(
    db: DBSession,
    *,
    activity_id: UUID,
    project_id: UUID,
) -> tuple[Event | None, PromptSession | None]:
    event = db.scalar(
        select(Event).where(Event.id == activity_id, Event.project_id == project_id)
    )
    if event is not None:
        session = db.get(PromptSession, event.session_id)
        if event.event_type == "PromptSubmitted":
            return event, session
        prompt_event = db.scalar(
            select(Event)
            .where(
                Event.project_id == project_id,
                Event.session_id == event.session_id,
                Event.event_type == "PromptSubmitted",
                Event.created_at <= event.created_at,
            )
            .order_by(desc(Event.created_at), desc(Event.sequence))
        )
        return prompt_event, session

    session = db.scalar(
        select(PromptSession).where(
            PromptSession.id == activity_id,
            PromptSession.project_id == project_id,
        )
    )
    if session is None:
        raise PromptHubNotFound("Activity not found")

    prompt_event = db.scalar(
        select(Event)
        .where(
            Event.project_id == project_id,
            Event.session_id == session.id,
            Event.event_type == "PromptSubmitted",
        )
        .order_by(desc(Event.created_at), desc(Event.sequence))
    )
    return prompt_event, session


def _response_for_prompt(db: DBSession, prompt_event: Event) -> Event | None:
    prompt_payload = _payload(prompt_event)
    turn_id = prompt_payload.get("turn_id")
    events = list(
        db.execute(
            select(Event)
            .where(
                Event.project_id == prompt_event.project_id,
                Event.session_id == prompt_event.session_id,
                Event.event_type == "ResponseReceived",
                Event.created_at >= prompt_event.created_at,
            )
            .order_by(Event.created_at, Event.sequence)
        ).scalars()
    )
    for event in events:
        payload = _payload(event)
        if _string_payload_value(payload, "prompt_event_id") == str(prompt_event.id):
            return event
        if turn_id is not None and str(payload.get("turn_id")) == str(turn_id):
            return event
    return events[0] if events else None


def _truncate(value: str | None, limit: int) -> str | None:
    if value is None:
        return None
    return value if len(value) <= limit else value[:limit]


def _language_from_path(path: str) -> str | None:
    extension = path.rsplit(".", 1)[-1].lower() if "." in path else ""
    languages = {
        "css": "CSS",
        "go": "Go",
        "html": "HTML",
        "js": "JavaScript",
        "json": "JSON",
        "md": "Markdown",
        "py": "Python",
        "tsx": "TSX",
        "ts": "TypeScript",
        "yaml": "YAML",
        "yml": "YAML",
    }
    return languages.get(extension)


def _files_changed_events(db: DBSession, prompt_event: Event) -> list[Event]:
    return list(
        db.execute(
            select(Event)
            .where(
                Event.project_id == prompt_event.project_id,
                Event.session_id == prompt_event.session_id,
                Event.event_type == "FilesChanged",
                Event.created_at >= prompt_event.created_at,
            )
            .order_by(Event.created_at, Event.sequence)
        ).scalars()
    )


def _source_file_changes(
    db: DBSession,
    *,
    prompt_event: Event | None,
    include_diff: bool,
) -> list[dict[str, Any]]:
    if prompt_event is None:
        return []

    patches = list(
        db.execute(
            select(CodeChangePatch)
            .where(
                CodeChangePatch.project_id == prompt_event.project_id,
                CodeChangePatch.prompt_event_id == prompt_event.id,
            )
            .order_by(CodeChangePatch.path)
        ).scalars()
    )
    if patches:
        return [
            {
                "additions": patch.additions or 0,
                "change_type": patch.status,
                "deletions": patch.deletions or 0,
                "diff": _truncate(
                    maybe_decrypt_app_text_from_string(
                        patch.patch,
                        purpose=CODE_CHANGE_PATCH_PURPOSE,
                    )
                    if include_diff
                    else None,
                    PROMPT_HUB_DIFF_MAX_CHARS,
                ),
                "file_path": patch.path,
                "language": _language_from_path(patch.path),
            }
            for patch in patches
        ]

    changes_by_path: dict[str, dict[str, Any]] = {}
    for event in _files_changed_events(db, prompt_event):
        payload = _payload(event)
        prompt_event_id = _string_payload_value(payload, "prompt_event_id")
        if prompt_event_id and prompt_event_id != str(prompt_event.id):
            continue
        changes = payload.get("changes")
        if isinstance(changes, list):
            for change in changes:
                if not isinstance(change, dict):
                    continue
                path = change.get("path")
                if not isinstance(path, str) or not path:
                    continue
                changes_by_path[path] = {
                    "additions": change.get("additions") if isinstance(change.get("additions"), int) else 0,
                    "change_type": change.get("status") if isinstance(change.get("status"), str) else "changed",
                    "deletions": change.get("deletions") if isinstance(change.get("deletions"), int) else 0,
                    "diff": _truncate(
                        change.get("patch") if include_diff and isinstance(change.get("patch"), str) else None,
                        PROMPT_HUB_DIFF_MAX_CHARS,
                    ),
                    "file_path": path,
                    "language": _language_from_path(path),
                }
            continue
        files = payload.get("files")
        if isinstance(files, list):
            for path in files:
                if isinstance(path, str) and path:
                    changes_by_path.setdefault(
                        path,
                        {
                            "additions": 0,
                            "change_type": "changed",
                            "deletions": 0,
                            "diff": None,
                            "file_path": path,
                            "language": _language_from_path(path),
                        },
                    )
    return list(changes_by_path.values())


def _events_count(db: DBSession, *, project_id: UUID, session_id: UUID | None) -> int:
    if session_id is None:
        return 0
    return int(
        db.scalar(
            select(func.count())
            .select_from(Event)
            .where(Event.project_id == project_id, Event.session_id == session_id)
        )
        or 0
    )


def _metrics(files: list[dict[str, Any]], *, events_count: int) -> dict[str, int]:
    return {
        "events_count": events_count,
        "files_changed": len(files),
        "lines_added": sum(int(file.get("additions") or 0) for file in files),
        "lines_removed": sum(int(file.get("deletions") or 0) for file in files),
    }


def create_draft_from_activity(
    db: DBSession,
    *,
    payload: PromptHubDraftFromActivityRequest,
    user: User,
) -> PublishedPrompt:
    project = _project_for_user(db, payload.project_id, user)
    prompt_event, session = _find_prompt_event(
        db,
        activity_id=payload.activity_id,
        project_id=project.id,
    )
    scope = _scope_dict(payload.shared_scope())
    prompt_payload = _payload(prompt_event) if prompt_event is not None else {}
    response_event = _response_for_prompt(db, prompt_event) if prompt_event else None
    response_payload = _payload(response_event) if response_event is not None else {}
    prompt_text = (
        _string_payload_value(prompt_payload, "prompt")
        if scope["include_prompt"]
        else None
    ) or DEFAULT_PROMPT_PLACEHOLDER
    result_summary = (
        _truncate(_string_payload_value(response_payload, "response"), PROMPT_HUB_RESULT_MAX_CHARS)
        if scope["include_response"]
        else None
    )
    files = (
        _source_file_changes(
            db,
            prompt_event=prompt_event,
            include_diff=scope["include_diff"],
        )
        if scope["include_files"]
        else []
    )
    events_count = _events_count(
        db,
        project_id=project.id,
        session_id=prompt_event.session_id if prompt_event is not None else session.id if session else None,
    )

    draft = PublishedPrompt(
        author_id=user.id,
        category=None,
        metrics=_metrics(files, events_count=events_count),
        model_name=_model_name(prompt_event, session, prompt_payload) if prompt_event else session.model if session else None,
        prompt_text=prompt_text,
        result_summary=result_summary,
        shared_scope=scope,
        slug=_unique_slug(db, payload.title),
        source_activity_id=prompt_event.id if prompt_event is not None else None,
        source_project_id=project.id,
        status="draft",
        summary=payload.summary,
        tags=[],
        title=payload.title,
        tool_name=prompt_event.tool if prompt_event is not None else session.tool if session else None,
        visibility="private",
    )
    db.add(draft)
    db.flush()
    for file in files:
        db.add(
            PublishedPromptFile(
                published_prompt_id=draft.id,
                file_path=file["file_path"],
                change_type=file.get("change_type"),
                language=file.get("language"),
                diff=file.get("diff"),
                additions=int(file.get("additions") or 0),
                deletions=int(file.get("deletions") or 0),
                is_included=True,
            )
        )
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise PromptHubConflict("Prompt draft could not be created") from exc
    db.refresh(draft)
    return draft


def list_published_prompts(
    db: DBSession,
    *,
    category: str | None = None,
    limit: int = 20,
    model: str | None = None,
    offset: int = 0,
    q: str | None = None,
    sort: str = "latest",
    tag: str | None = None,
) -> list[PublishedPrompt]:
    query = select(PublishedPrompt).where(
        PublishedPrompt.status == "published",
        PublishedPrompt.visibility == "public",
    )
    if q:
        pattern = f"%{q.strip()}%"
        query = query.where(
            or_(
                PublishedPrompt.title.ilike(pattern),
                PublishedPrompt.summary.ilike(pattern),
            )
        )
    if category:
        query = query.where(PublishedPrompt.category == category)
    if model:
        query = query.where(PublishedPrompt.model_name == model)
    if tag:
        query = query.where(PublishedPrompt.tags.contains([tag.strip().lower()]))

    if sort == "top":
        query = query.order_by(desc(PublishedPrompt.score_overall).nullslast(), desc(PublishedPrompt.published_at))
    elif sort == "trending":
        reaction_counts = (
            select(
                PublishedPromptReaction.published_prompt_id.label("prompt_id"),
                func.count(PublishedPromptReaction.id).label("reaction_count"),
            )
            .group_by(PublishedPromptReaction.published_prompt_id)
            .subquery()
        )
        comment_counts = (
            select(
                PublishedPromptComment.published_prompt_id.label("prompt_id"),
                func.count(PublishedPromptComment.id).label("comment_count"),
            )
            .group_by(PublishedPromptComment.published_prompt_id)
            .subquery()
        )
        query = (
            query.outerjoin(reaction_counts, reaction_counts.c.prompt_id == PublishedPrompt.id)
            .outerjoin(comment_counts, comment_counts.c.prompt_id == PublishedPrompt.id)
            .order_by(
                desc(
                    func.coalesce(reaction_counts.c.reaction_count, 0)
                    + func.coalesce(comment_counts.c.comment_count, 0)
                ),
                desc(PublishedPrompt.published_at),
            )
        )
    else:
        query = query.order_by(desc(PublishedPrompt.published_at))

    return list(db.execute(query.offset(offset).limit(limit)).scalars())


def get_published_prompt_detail(db: DBSession, *, slug: str) -> PublishedPrompt:
    prompt = db.scalar(
        select(PublishedPrompt).where(
            PublishedPrompt.slug == slug,
            PublishedPrompt.status == "published",
            PublishedPrompt.visibility.in_(("public", "unlisted")),
        )
    )
    if prompt is None:
        raise PromptHubNotFound("Published prompt not found")
    return prompt


def count_comments(db: DBSession, *, prompt_id: UUID) -> int:
    return int(
        db.scalar(
            select(func.count())
            .select_from(PublishedPromptComment)
            .where(PublishedPromptComment.published_prompt_id == prompt_id)
        )
        or 0
    )


def count_reactions(db: DBSession, *, prompt_id: UUID) -> int:
    return int(
        db.scalar(
            select(func.count())
            .select_from(PublishedPromptReaction)
            .where(PublishedPromptReaction.published_prompt_id == prompt_id)
        )
        or 0
    )


def _score(value: float | None) -> Decimal | None:
    return Decimal(str(value)) if value is not None else None


def _validate_publishable(prompt: PublishedPrompt) -> None:
    if prompt.visibility == "public" and (
        not prompt.title.strip() or not prompt.prompt_text.strip()
    ):
        raise PromptHubValidationError("Public prompts require title and prompt_text")


def update_prompt_draft(
    db: DBSession,
    *,
    payload: PromptHubUpdateRequest,
    prompt_id: UUID,
    user: User,
) -> PublishedPrompt:
    prompt = _draft_for_user(db, prompt_id, user)
    if prompt.status != "draft":
        raise PromptHubConflict("Only draft prompts can be updated")

    if payload.title is not None and payload.title != prompt.title:
        prompt.title = payload.title
        prompt.slug = _unique_slug(db, payload.title, ignore_id=prompt.id)
    if payload.summary is not None:
        prompt.summary = payload.summary
    if payload.prompt_text is not None:
        prompt.prompt_text = payload.prompt_text
    if payload.result_summary is not None:
        prompt.result_summary = payload.result_summary
    if payload.category is not None:
        prompt.category = payload.category
    if payload.tags is not None:
        prompt.tags = _normalize_tags(payload.tags)
    if payload.visibility is not None:
        prompt.visibility = payload.visibility
    if payload.shared_scope is not None:
        prompt.shared_scope = _scope_dict(payload.shared_scope)
    for field in (
        "score_overall",
        "score_frontend",
        "score_backend",
        "score_architecture",
        "score_refactoring",
        "score_documentation",
    ):
        value = getattr(payload, field)
        if value is not None:
            setattr(prompt, field, _score(value))

    _validate_publishable(prompt)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise PromptHubConflict("Prompt draft could not be updated") from exc
    db.refresh(prompt)
    return prompt


def publish_prompt(db: DBSession, *, prompt_id: UUID, user: User) -> PublishedPrompt:
    prompt = _draft_for_user(db, prompt_id, user)
    _validate_publishable(prompt)
    prompt.status = "published"
    prompt.published_at = prompt.published_at or _utc_now()
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise PromptHubConflict("Prompt could not be published") from exc
    db.refresh(prompt)
    return prompt


def archive_prompt(db: DBSession, *, prompt_id: UUID, user: User) -> PublishedPrompt:
    prompt = _draft_for_user(db, prompt_id, user)
    prompt.status = "archived"
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise PromptHubConflict("Prompt could not be archived") from exc
    db.refresh(prompt)
    return prompt
