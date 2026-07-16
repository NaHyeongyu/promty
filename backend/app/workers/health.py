from pathlib import Path
from time import time

from app.core.config import settings


def worker_health_path(path: str | Path | None = None) -> Path:
    configured = path if path is not None else settings.memory_worker_health_file
    return Path(configured).expanduser()


def record_worker_heartbeat(path: str | Path | None = None) -> None:
    target = worker_health_path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.touch()


def worker_heartbeat_is_fresh(
    path: str | Path | None = None,
    *,
    now: float | None = None,
    timeout_seconds: float | None = None,
) -> bool:
    target = worker_health_path(path)
    try:
        modified_at = target.stat().st_mtime
    except OSError:
        return False
    maximum_age = (
        float(timeout_seconds)
        if timeout_seconds is not None
        else float(settings.memory_worker_health_timeout_seconds)
    )
    return (time() if now is None else now) - modified_at <= maximum_age
