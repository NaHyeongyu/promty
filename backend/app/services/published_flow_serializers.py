from __future__ import annotations

from datetime import datetime
from typing import Any

from app.core.config import settings
from app.models.published_flows import PublishedFlow, PublishedFlowAsset
from app.models.users import User
from app.services.published_flow_redaction import (
    PUBLISHED_FLOW_DIFF_PURPOSE,
    PUBLISHED_FLOW_PROMPT_PURPOSE,
    PUBLISHED_FLOW_RESPONSE_PURPOSE,
    readable_published_text,
    redact_file_path,
    redact_text,
)


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _markdown_alt_text(value: str | None, fallback: str) -> str:
    raw = (value or fallback).strip() or "Image"
    return raw.replace("\n", " ").replace("\r", " ").replace("[", "(").replace("]", ")")[:255]


def serialize_flow_asset(flow: PublishedFlow, asset: PublishedFlowAsset) -> dict[str, Any]:
    url = f"{settings.api_public_url.rstrip('/')}/api/published-flows/{flow.slug}/assets/{asset.id}"
    alt_text = _markdown_alt_text(asset.alt_text, asset.file_name)
    return {
        "alt_text": redact_text(asset.alt_text),
        "byte_size": asset.byte_size,
        "content_type": asset.content_type,
        "created_at": _iso(asset.created_at),
        "file_name": redact_text(asset.file_name) or "image",
        "id": str(asset.id),
        "markdown": f"![{alt_text}]({url})",
        "sha256": asset.sha256,
        "url": url,
    }


def serialize_flow_summary(flow: PublishedFlow, *, current_user: User) -> dict[str, Any]:
    return {
        "author": {
            "avatar_url": flow.author.avatar_url if flow.author else None,
            "id": str(flow.author_id) if flow.author_id else None,
            "username": flow.author.username if flow.author else "Unknown",
        },
        "created_at": _iso(flow.created_at),
        "file_count": flow.file_count,
        "id": str(flow.id),
        "is_owner": flow.author_id == current_user.id,
        "metrics": (flow.metrics or {}) if flow.author_id == current_user.id else {},
        "model_name": flow.model_name,
        "prompt_count": flow.prompt_count,
        "published_at": _iso(flow.published_at),
        "slug": flow.slug,
        "status": flow.status,
        "summary": redact_text(flow.summary),
        "tags": [redact_text(tag) or "[redacted]" for tag in (flow.tags or [])],
        "title": redact_text(flow.title) or "Prompt flow",
        "tool_name": flow.tool_name,
        "updated_at": _iso(flow.updated_at),
        "visibility": flow.visibility,
    }


def serialize_flow_detail(flow: PublishedFlow, *, current_user: User) -> dict[str, Any]:
    is_owner = flow.author_id == current_user.id
    files = flow.files if is_owner else [file for file in flow.files if file.is_included]
    items = flow.items if is_owner else [item for item in flow.items if item.is_included]
    payload = serialize_flow_summary(flow, current_user=current_user)
    payload.update(
        {
            "context_summary": redact_text(flow.context_summary),
            "end_sequence": flow.end_sequence,
            "assets": [serialize_flow_asset(flow, asset) for asset in flow.assets],
            "files": [
                {
                    "additions": file.additions,
                    "change_type": file.change_type,
                    "deletions": file.deletions,
                    "diff": readable_published_text(
                        file.diff,
                        purpose=PUBLISHED_FLOW_DIFF_PURPOSE,
                    )
                    if is_owner
                    else None,
                    "file_path": redact_file_path(file.file_path),
                    "id": str(file.id),
                    "is_included": file.is_included,
                    "language": file.language,
                    "source_event_id": str(file.source_event_id)
                    if is_owner and file.source_event_id
                    else None,
                }
                for file in files
            ],
            "items": [
                {
                    "files_changed": item.files_changed,
                    "id": str(item.id),
                    "is_included": item.is_included,
                    "item_order": item.item_order,
                    "model_name": item.model_name,
                    "prompt_text": readable_published_text(
                        item.prompt_text,
                        purpose=PUBLISHED_FLOW_PROMPT_PURPOSE,
                    )
                    or "",
                    "response_received_at": _iso(item.response_received_at),
                    "response_text": readable_published_text(
                        item.response_text,
                        purpose=PUBLISHED_FLOW_RESPONSE_PURPOSE,
                    ),
                    "sequence": item.sequence,
                    "source_event_id": str(item.source_event_id)
                    if is_owner and item.source_event_id
                    else None,
                    "submitted_at": _iso(item.submitted_at),
                    "tool_name": item.tool_name,
                }
                for item in items
            ],
            "notes": redact_text(flow.notes),
            "source_project_id": str(flow.source_project_id)
            if is_owner and flow.source_project_id
            else None,
            "source_session_id": str(flow.source_session_id)
            if is_owner and flow.source_session_id
            else None,
            "source_start_event_id": str(flow.source_start_event_id)
            if is_owner and flow.source_start_event_id
            else None,
            "source_end_event_id": str(flow.source_end_event_id)
            if is_owner and flow.source_end_event_id
            else None,
            "start_sequence": flow.start_sequence,
        }
    )
    return payload
