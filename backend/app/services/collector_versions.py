from __future__ import annotations

import json
import logging
import re
import time
from threading import Lock
from urllib import request


NPM_PACKAGE = "promty-collector"
NPM_REGISTRY_URL = f"https://registry.npmjs.org/{NPM_PACKAGE}/latest"
REGISTRY_TIMEOUT_SECONDS = 2.0
SUCCESS_CACHE_TTL_SECONDS = 5 * 60
FAILURE_CACHE_TTL_SECONDS = 60

_VERSION_PATTERN = re.compile(r"^(?:v)?(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?$")
_cache_lock = Lock()
_cached_version: str | None = None
_cache_expires_at = 0.0
logger = logging.getLogger(__name__)


def _version_tuple(value: str) -> tuple[int, int, int] | None:
    match = _VERSION_PATTERN.fullmatch(value.strip())
    if match is None:
        return None
    return tuple(int(part) for part in match.groups())


def _newer_version(first: str, second: str) -> str:
    first_parts = _version_tuple(first)
    second_parts = _version_tuple(second)
    if first_parts is None:
        raise ValueError(f"Invalid collector version: {first}")
    if second_parts is None:
        raise ValueError(f"Invalid collector version: {second}")
    return second if second_parts > first_parts else first


def _fetch_registry_version() -> str:
    registry_request = request.Request(
        NPM_REGISTRY_URL,
        headers={
            "Accept": "application/json",
            "User-Agent": "Promty-Backend/collector-version-check",
        },
    )
    with request.urlopen(registry_request, timeout=REGISTRY_TIMEOUT_SECONDS) as response:
        payload = json.loads(response.read().decode("utf-8"))

    version = payload.get("version") if isinstance(payload, dict) else None
    if not isinstance(version, str) or _version_tuple(version) is None:
        raise ValueError("npm Registry returned an invalid collector version")
    return version.strip().removeprefix("v")


def get_latest_collector_version(*, fallback: str) -> str:
    """Return the latest published collector version with a short process-local cache."""
    global _cached_version, _cache_expires_at

    now = time.monotonic()
    if _cached_version is not None and now < _cache_expires_at:
        return _newer_version(fallback, _cached_version)

    with _cache_lock:
        now = time.monotonic()
        if _cached_version is not None and now < _cache_expires_at:
            return _newer_version(fallback, _cached_version)

        try:
            registry_version = _fetch_registry_version()
            resolved_version = _newer_version(fallback, registry_version)
            cache_ttl = SUCCESS_CACHE_TTL_SECONDS
        except Exception as error:
            logger.warning("Could not resolve the latest collector version: %s", error)
            resolved_version = fallback
            cache_ttl = FAILURE_CACHE_TTL_SECONDS

        _cached_version = resolved_version
        _cache_expires_at = now + cache_ttl
        return resolved_version


def _reset_version_cache() -> None:
    global _cached_version, _cache_expires_at

    with _cache_lock:
        _cached_version = None
        _cache_expires_at = 0.0
