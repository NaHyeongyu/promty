from __future__ import annotations

from datetime import datetime, timezone
import json
import os
from pathlib import Path
from typing import Any

from secure_storage import open_private_text, write_private_text_atomic

DEFAULT_CONFIG_PATH = Path(
    os.environ.get("PROMPTHUB_CONFIG_PATH", "~/.prompthub/config.json")
).expanduser()
DEFAULT_APP_URL = os.environ.get("PROMPTHUB_APP_URL", "http://127.0.0.1:5173")
DEFAULT_API_URL = os.environ.get("PROMPTHUB_API_URL", "http://127.0.0.1:8011")
DEFAULT_UPLOADER_PID_PATH = Path(
    os.environ.get("PROMPTHUB_UPLOADER_PID_PATH", "~/.prompthub/uploader.pid")
).expanduser()
DEFAULT_UPLOADER_LOG_PATH = Path(
    os.environ.get("PROMPTHUB_UPLOADER_LOG_PATH", "~/.prompthub/uploader.log")
).expanduser()


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def config_path(path: str | Path | None = None) -> Path:
    return Path(path).expanduser() if path else DEFAULT_CONFIG_PATH


def read_config(path: str | Path | None = None) -> dict[str, Any]:
    target = config_path(path)
    if not target.exists():
        return {}

    try:
        with open_private_text(target, "r") as file:
            payload = json.load(file)
    except (OSError, json.JSONDecodeError):
        return {}

    return payload if isinstance(payload, dict) else {}


def write_config(values: dict[str, Any], path: str | Path | None = None) -> dict[str, Any]:
    target = config_path(path)
    existing = read_config(target)
    merged = {**existing, **values, "updated_at": utc_now_iso()}
    serialized = json.dumps(merged, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    write_private_text_atomic(target, serialized)
    return merged


def resolve_app_url(value: str | None = None, path: str | Path | None = None) -> str:
    if value:
        return value.rstrip("/")
    if os.environ.get("PROMPTHUB_APP_URL"):
        return os.environ["PROMPTHUB_APP_URL"].rstrip("/")
    configured = read_config(path).get("app_url")
    if isinstance(configured, str) and configured.strip():
        return configured.rstrip("/")
    return DEFAULT_APP_URL.rstrip("/")


def resolve_api_url(value: str | None = None, path: str | Path | None = None) -> str:
    if value:
        return value.rstrip("/")
    if os.environ.get("PROMPTHUB_API_URL"):
        return os.environ["PROMPTHUB_API_URL"].rstrip("/")
    configured = read_config(path).get("api_url")
    if isinstance(configured, str) and configured.strip():
        return configured.rstrip("/")
    return DEFAULT_API_URL.rstrip("/")


def resolve_token(value: str | None = None, path: str | Path | None = None) -> str | None:
    if value:
        return value
    if os.environ.get("PROMPTHUB_API_TOKEN"):
        return os.environ["PROMPTHUB_API_TOKEN"]
    configured = read_config(path).get("token")
    return configured if isinstance(configured, str) and configured.strip() else None
