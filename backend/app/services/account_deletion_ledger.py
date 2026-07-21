from __future__ import annotations

from datetime import datetime, timezone
import json
import logging
from pathlib import Path
from typing import Any, Iterator
from uuid import UUID

from app.core.config import settings


logger = logging.getLogger(__name__)
LEDGER_PREFIX = "account-deletion-ledger"


def _storage_backend() -> str:
    return settings.published_flow_asset_storage.strip().lower()


def _local_ledger_root() -> Path:
    asset_root = Path(settings.published_flow_asset_root).expanduser().resolve()
    return asset_root.parent / LEDGER_PREFIX


def _s3_client() -> Any:
    import boto3

    kwargs: dict[str, str] = {}
    if settings.aws_region:
        kwargs["region_name"] = settings.aws_region
    if settings.aws_s3_endpoint_url:
        kwargs["endpoint_url"] = settings.aws_s3_endpoint_url
    return boto3.client("s3", **kwargs)


def _s3_bucket() -> str:
    if not settings.aws_s3_bucket:
        raise RuntimeError("PROMTY_AWS_S3_BUCKET is required for the deletion ledger")
    return settings.aws_s3_bucket


def _payload(user_id: UUID, *, deleted_at: datetime | None = None) -> dict[str, str | int]:
    timestamp = deleted_at or datetime.now(timezone.utc)
    return {
        "deleted_at": timestamp.isoformat(),
        "schema_version": 1,
        "user_id": str(user_id),
    }


def record_account_deletion_tombstone(user_id: UUID) -> bool:
    """Persist a minimal restore-safe deletion marker outside PostgreSQL."""

    payload = json.dumps(_payload(user_id), separators=(",", ":")).encode("utf-8")
    try:
        if _storage_backend() == "s3":
            _s3_client().put_object(
                Body=payload,
                Bucket=_s3_bucket(),
                ContentType="application/json",
                Key=f"{LEDGER_PREFIX}/{user_id}.json",
                ServerSideEncryption="AES256",
            )
        else:
            root = _local_ledger_root()
            root.mkdir(parents=True, exist_ok=True)
            target = root / f"{user_id}.json"
            temporary = target.with_suffix(".json.tmp")
            temporary.write_bytes(payload)
            temporary.replace(target)
        return True
    except Exception:
        logger.exception("Could not persist account deletion tombstone for %s", user_id)
        return False


def remove_account_deletion_tombstone(user_id: UUID) -> bool:
    """Remove a marker when the matching database transaction did not commit."""

    try:
        if _storage_backend() == "s3":
            _s3_client().delete_object(
                Bucket=_s3_bucket(),
                Key=f"{LEDGER_PREFIX}/{user_id}.json",
            )
        else:
            (_local_ledger_root() / f"{user_id}.json").unlink(missing_ok=True)
        return True
    except Exception:
        logger.exception("Could not remove account deletion tombstone for %s", user_id)
        return False


def iter_account_deletion_tombstones() -> Iterator[dict[str, Any]]:
    if _storage_backend() == "s3":
        client = _s3_client()
        paginator = client.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=_s3_bucket(), Prefix=f"{LEDGER_PREFIX}/"):
            for item in page.get("Contents", []):
                key = item.get("Key")
                if not isinstance(key, str) or not key.endswith(".json"):
                    continue
                response = client.get_object(Bucket=_s3_bucket(), Key=key)
                yield json.loads(response["Body"].read().decode("utf-8"))
        return

    root = _local_ledger_root()
    if not root.is_dir():
        return
    for path in sorted(root.glob("*.json")):
        yield json.loads(path.read_text(encoding="utf-8"))
