from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.security import require_web_user
from app.db.session import get_db
from app.models.published_prompts import PublishedPrompt, PublishedPromptFile
from app.models.users import User
from app.schemas.prompt_hub import (
    PromptHubDetail,
    PromptHubDraftFromActivityRequest,
    PromptHubFileRead,
    PromptHubListItem,
    PromptHubUpdateRequest,
    PromptSort,
)
from app.services.prompt_hub import (
    PromptHubConflict,
    PromptHubNotFound,
    PromptHubValidationError,
    archive_prompt,
    count_comments,
    count_reactions,
    create_draft_from_activity,
    get_published_prompt_detail,
    list_published_prompts,
    publish_prompt,
    update_prompt_draft,
)

router = APIRouter(prefix="/api/prompt-hub", tags=["prompt-hub"])


def _float(value: Decimal | None) -> float | None:
    return float(value) if value is not None else None


def _list_item(prompt: PublishedPrompt) -> PromptHubListItem:
    return PromptHubListItem(
        category=prompt.category,
        id=prompt.id,
        metrics=prompt.metrics,
        model_name=prompt.model_name,
        published_at=prompt.published_at,
        score_overall=_float(prompt.score_overall),
        slug=prompt.slug,
        summary=prompt.summary,
        tags=prompt.tags,
        title=prompt.title,
        tool_name=prompt.tool_name,
    )


def _file_item(file: PublishedPromptFile) -> PromptHubFileRead:
    return PromptHubFileRead(
        additions=file.additions,
        change_type=file.change_type,
        deletions=file.deletions,
        diff=file.diff,
        file_path=file.file_path,
        id=file.id,
        is_included=file.is_included,
        language=file.language,
    )


def _detail(db: Session, prompt: PublishedPrompt) -> PromptHubDetail:
    return PromptHubDetail(
        category=prompt.category,
        comments_count=count_comments(db, prompt_id=prompt.id),
        created_at=prompt.created_at,
        files=[_file_item(file) for file in prompt.files if file.is_included],
        id=prompt.id,
        metrics=prompt.metrics,
        model_name=prompt.model_name,
        prompt_text=prompt.prompt_text,
        published_at=prompt.published_at,
        reactions_count=count_reactions(db, prompt_id=prompt.id),
        result_summary=prompt.result_summary,
        score_architecture=_float(prompt.score_architecture),
        score_backend=_float(prompt.score_backend),
        score_documentation=_float(prompt.score_documentation),
        score_frontend=_float(prompt.score_frontend),
        score_overall=_float(prompt.score_overall),
        score_refactoring=_float(prompt.score_refactoring),
        shared_scope=prompt.shared_scope,
        slug=prompt.slug,
        status=prompt.status,
        summary=prompt.summary,
        tags=prompt.tags,
        title=prompt.title,
        tool_name=prompt.tool_name,
        updated_at=prompt.updated_at,
        visibility=prompt.visibility,
    )


def _http_error(error: Exception) -> HTTPException:
    if isinstance(error, PromptHubNotFound):
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error))
    if isinstance(error, PromptHubConflict):
        return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error))
    if isinstance(error, PromptHubValidationError):
        return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(error))
    return HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Prompt Hub request failed",
    )


@router.get("", response_model=list[PromptHubListItem])
def read_prompt_hub(
    category: str | None = Query(default=None, max_length=120),
    limit: int = Query(default=20, ge=1, le=100),
    model: str | None = Query(default=None, max_length=255),
    offset: int = Query(default=0, ge=0),
    q: str | None = Query(default=None, max_length=200),
    sort: PromptSort = Query(default="latest"),
    tag: str | None = Query(default=None, max_length=40),
    db: Session = Depends(get_db),
) -> list[PromptHubListItem]:
    prompts = list_published_prompts(
        db,
        category=category,
        limit=limit,
        model=model,
        offset=offset,
        q=q,
        sort=sort,
        tag=tag,
    )
    return [_list_item(prompt) for prompt in prompts]


@router.post("/drafts/from-activity", response_model=PromptHubDetail)
def create_prompt_hub_draft_from_activity(
    payload: PromptHubDraftFromActivityRequest,
    current_user: User = Depends(require_web_user),
    db: Session = Depends(get_db),
) -> PromptHubDetail:
    try:
        prompt = create_draft_from_activity(db, payload=payload, user=current_user)
    except (PromptHubNotFound, PromptHubConflict, PromptHubValidationError) as exc:
        raise _http_error(exc) from exc
    return _detail(db, prompt)


@router.patch("/{prompt_id}", response_model=PromptHubDetail)
def update_prompt_hub_draft(
    prompt_id: UUID,
    payload: PromptHubUpdateRequest,
    current_user: User = Depends(require_web_user),
    db: Session = Depends(get_db),
) -> PromptHubDetail:
    try:
        prompt = update_prompt_draft(
            db,
            payload=payload,
            prompt_id=prompt_id,
            user=current_user,
        )
    except (PromptHubNotFound, PromptHubConflict, PromptHubValidationError) as exc:
        raise _http_error(exc) from exc
    return _detail(db, prompt)


@router.post("/{prompt_id}/publish", response_model=PromptHubDetail)
def publish_prompt_hub_prompt(
    prompt_id: UUID,
    current_user: User = Depends(require_web_user),
    db: Session = Depends(get_db),
) -> PromptHubDetail:
    try:
        prompt = publish_prompt(db, prompt_id=prompt_id, user=current_user)
    except (PromptHubNotFound, PromptHubConflict, PromptHubValidationError) as exc:
        raise _http_error(exc) from exc
    return _detail(db, prompt)


@router.post("/{prompt_id}/archive", response_model=PromptHubDetail)
def archive_prompt_hub_prompt(
    prompt_id: UUID,
    current_user: User = Depends(require_web_user),
    db: Session = Depends(get_db),
) -> PromptHubDetail:
    try:
        prompt = archive_prompt(db, prompt_id=prompt_id, user=current_user)
    except (PromptHubNotFound, PromptHubConflict, PromptHubValidationError) as exc:
        raise _http_error(exc) from exc
    return _detail(db, prompt)


@router.get("/{slug}", response_model=PromptHubDetail)
def read_prompt_hub_detail(
    slug: str,
    db: Session = Depends(get_db),
) -> PromptHubDetail:
    try:
        prompt = get_published_prompt_detail(db, slug=slug)
    except PromptHubNotFound as exc:
        raise _http_error(exc) from exc
    return _detail(db, prompt)
