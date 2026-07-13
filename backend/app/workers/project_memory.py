from __future__ import annotations

import logging
import signal
from threading import Event
from time import monotonic

from app.core.config import settings
from app.db.session import SessionLocal
from app.services.memory.artifacts import materialize_next_idle_memory_session
from app.services.memory.batches import run_next_project_memory_batch

logger = logging.getLogger(__name__)
IDLE_SESSION_RESCAN_SECONDS = 30.0


def run_worker(stop: Event) -> None:
    poll_seconds = max(settings.memory_worker_poll_seconds, 0.1)
    next_idle_scan_at = 0.0
    while not stop.is_set():
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
        if not processed:
            stop.wait(poll_seconds)


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
