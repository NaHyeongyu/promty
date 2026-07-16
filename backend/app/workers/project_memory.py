from __future__ import annotations

import logging
import signal
from threading import Event
from time import monotonic

from app.core.config import settings
from app.db.session import SessionLocal
from app.services.memory.artifacts import materialize_next_idle_memory_session
from app.services.memory.batches import run_next_project_memory_batch
from app.workers.health import record_worker_heartbeat

logger = logging.getLogger(__name__)
IDLE_SESSION_RESCAN_SECONDS = 30.0


def _next_idle_poll_seconds(
    current: float,
    *,
    base: float,
    maximum: float,
) -> float:
    return min(max(current * 2, base), maximum)


def run_worker(stop: Event) -> None:
    poll_seconds = max(settings.memory_worker_poll_seconds, 0.1)
    max_poll_seconds = max(settings.memory_worker_max_poll_seconds, poll_seconds)
    idle_poll_seconds = poll_seconds
    next_idle_scan_at = 0.0
    while not stop.is_set():
        record_worker_heartbeat()
        db = SessionLocal()
        try:
            processed = run_next_project_memory_batch(db)
            if not processed and monotonic() >= next_idle_scan_at:
                processed = materialize_next_idle_memory_session(db)
                db.commit()
                if not processed:
                    next_idle_scan_at = monotonic() + IDLE_SESSION_RESCAN_SECONDS
        except Exception:
            db.rollback()
            logger.exception("Project Memory worker iteration failed")
            processed = False
        finally:
            db.close()
            record_worker_heartbeat()
        if processed:
            idle_poll_seconds = poll_seconds
            continue
        stop.wait(idle_poll_seconds)
        idle_poll_seconds = _next_idle_poll_seconds(
            idle_poll_seconds,
            base=poll_seconds,
            maximum=max_poll_seconds,
        )


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    stop = Event()

    def request_stop(_signum, _frame) -> None:
        logger.info("Project Memory worker shutdown requested")
        stop.set()

    signal.signal(signal.SIGTERM, request_stop)
    signal.signal(signal.SIGINT, request_stop)
    logger.info("Project Memory worker started")
    run_worker(stop)
    logger.info("Project Memory worker stopped")


if __name__ == "__main__":
    main()
