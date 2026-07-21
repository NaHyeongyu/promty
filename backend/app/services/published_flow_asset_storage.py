from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from fastapi import HTTPException, status

from app.core.config import settings

_cached_s3_client: Any | None = None


@dataclass(frozen=True)
class StoredAsset:
    content: bytes | None = None
    path: Path | None = None


def _storage_backend() -> str:
    backend = settings.published_flow_asset_storage.strip().lower()
    if backend not in {"local", "s3"}:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="PROMTY_PUBLISHED_FLOW_ASSET_STORAGE must be local or s3",
        )
    return backend


def _normalized_storage_key(storage_key: str) -> str:
    parts = [
        part
        for part in storage_key.replace("\\", "/").split("/")
        if part and part != "."
    ]
    if not parts or any(part == ".." for part in parts):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Published flow asset storage key is invalid",
        )
    return "/".join(parts)


def _asset_root() -> Path:
    return Path(settings.published_flow_asset_root).expanduser().resolve()


def _local_asset_path(storage_key: str) -> Path:
    root = _asset_root()
    path = (root / _normalized_storage_key(storage_key)).resolve()
    if root != path and root not in path.parents:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Published flow asset path is invalid",
        )
    return path


def _s3_bucket() -> str:
    bucket = settings.aws_s3_bucket
    if not bucket:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="PROMTY_AWS_S3_BUCKET is required for S3 asset storage",
        )
    return bucket


def _s3_object_key(storage_key: str) -> str:
    key = _normalized_storage_key(storage_key)
    prefix = settings.aws_s3_prefix.strip().strip("/")
    return f"{prefix}/{key}" if prefix else key


def _s3_client() -> Any:
    global _cached_s3_client
    if _cached_s3_client is not None:
        return _cached_s3_client

    try:
        import boto3
    except ModuleNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="boto3 is required for S3 asset storage",
        ) from exc

    kwargs: dict[str, str] = {}
    if settings.aws_region:
        kwargs["region_name"] = settings.aws_region
    if settings.aws_s3_endpoint_url:
        kwargs["endpoint_url"] = settings.aws_s3_endpoint_url
    _cached_s3_client = boto3.client("s3", **kwargs)
    return _cached_s3_client


def save_published_flow_asset(
    *,
    content: bytes,
    content_type: str,
    storage_key: str,
) -> None:
    if _storage_backend() == "s3":
        _s3_client().put_object(
            Body=content,
            Bucket=_s3_bucket(),
            ContentType=content_type,
            Key=_s3_object_key(storage_key),
        )
        return

    path = _local_asset_path(storage_key)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)


def delete_published_flow_asset(storage_key: str) -> bool:
    if _storage_backend() == "s3":
        try:
            _s3_client().delete_object(
                Bucket=_s3_bucket(),
                Key=_s3_object_key(storage_key),
            )
        except Exception:
            return False
        return True

    try:
        _local_asset_path(storage_key).unlink()
    except FileNotFoundError:
        return True
    except OSError:
        return False
    return True


def read_published_flow_asset(storage_key: str) -> StoredAsset:
    if _storage_backend() == "s3":
        try:
            response = _s3_client().get_object(
                Bucket=_s3_bucket(),
                Key=_s3_object_key(storage_key),
            )
            stream = response["Body"]
            try:
                body = stream.read()
            finally:
                stream.close()
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Image asset file not found",
            ) from exc
        return StoredAsset(content=body)

    path = _local_asset_path(storage_key)
    if not path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Image asset file not found",
        )
    return StoredAsset(path=path)
