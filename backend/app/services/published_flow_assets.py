from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.time import utc_now
from app.models.published_flows import PublishedFlowAsset
from app.models.users import User
from app.services.published_flow_access import can_read_flow, flow_by_key, flow_for_owner
from app.services.published_flow_asset_storage import (
    StoredAsset,
    delete_published_flow_asset,
    read_published_flow_asset,
    save_published_flow_asset,
)
from app.services.published_flow_redaction import optional_redacted_text
from app.services.published_flow_serializers import serialize_flow_asset

ASSET_CONTENT_TYPES = {
    "image/gif": ".gif",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}


def _sniff_image_content_type(content: bytes) -> str | None:
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if content.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if content.startswith((b"GIF87a", b"GIF89a")):
        return "image/gif"
    if len(content) >= 12 and content.startswith(b"RIFF") and content[8:12] == b"WEBP":
        return "image/webp"
    return None


def _safe_file_name(value: str | None, content_type: str) -> str:
    fallback = f"image{ASSET_CONTENT_TYPES[content_type]}"
    if not value:
        return fallback
    name = Path(value).name.strip().replace("\x00", "")
    if not name or name in {".", ".."}:
        return fallback
    return name[:255]


def create_published_flow_asset(
    db: Session,
    *,
    alt_text: str | None,
    content: bytes,
    content_type: str | None,
    current_user: User,
    file_name: str | None,
    flow_key: str,
) -> dict[str, Any]:
    flow = flow_for_owner(db, current_user=current_user, flow_key=flow_key)
    if flow.status == "archived":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Archived prompt flows cannot accept new assets",
        )

    max_bytes = max(settings.published_flow_asset_max_bytes, 1)
    if not content:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Image file is empty",
        )
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Image file must be {max_bytes} bytes or smaller",
        )

    detected_content_type = _sniff_image_content_type(content)
    if detected_content_type is None:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only PNG, JPEG, WEBP, and GIF images are supported",
        )
    declared_content_type = (content_type or "").split(";", 1)[0].strip().lower()
    expected_content_types = {detected_content_type, "application/octet-stream"}
    if detected_content_type == "image/jpeg":
        expected_content_types.add("image/jpg")
    if declared_content_type and declared_content_type not in expected_content_types:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Image content type does not match the uploaded file",
        )

    asset_id = uuid4()
    extension = ASSET_CONTENT_TYPES[detected_content_type]
    storage_key = f"{flow.id}/{asset_id}{extension}"
    stored_asset = False
    try:
        save_published_flow_asset(
            content=content,
            content_type=detected_content_type,
            storage_key=storage_key,
        )
        stored_asset = True
        cleaned_alt_text = optional_redacted_text(alt_text) if alt_text else None
        asset = PublishedFlowAsset(
            alt_text=cleaned_alt_text[:255] if cleaned_alt_text else None,
            author_id=current_user.id,
            byte_size=len(content),
            content_type=detected_content_type,
            file_name=_safe_file_name(file_name, detected_content_type),
            id=asset_id,
            published_flow_id=flow.id,
            sha256=hashlib.sha256(content).hexdigest(),
            storage_key=storage_key,
        )
        db.add(asset)
        flow.updated_at = utc_now()
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if stored_asset:
            delete_published_flow_asset(storage_key)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Image asset could not be saved because it conflicts with existing data.",
        ) from exc
    except Exception:
        db.rollback()
        if stored_asset:
            delete_published_flow_asset(storage_key)
        raise

    return serialize_flow_asset(flow, asset)


def get_published_flow_asset(
    db: Session,
    *,
    asset_id: UUID,
    current_user: User,
    flow_key: str,
) -> tuple[PublishedFlowAsset, StoredAsset]:
    flow = flow_by_key(db, flow_key)
    if flow is None or not can_read_flow(flow, current_user):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Published flow not found",
        )

    asset = db.scalar(
        select(PublishedFlowAsset).where(
            PublishedFlowAsset.id == asset_id,
            PublishedFlowAsset.published_flow_id == flow.id,
        )
    )
    if asset is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Image asset not found",
        )

    return asset, read_published_flow_asset(asset.storage_key)
