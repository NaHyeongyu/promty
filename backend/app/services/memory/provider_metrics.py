from __future__ import annotations

from dataclasses import dataclass, field
import logging
from time import perf_counter


logger = logging.getLogger(__name__)


@dataclass
class ProviderRequestAttempt:
    provider: str
    model: str
    stage: str
    request_bytes: int
    attempt: int
    _started_at: float = field(default_factory=perf_counter)
    _finished: bool = False

    def finish(self, *, outcome: str, status: str | int) -> None:
        if self._finished:
            return
        self._finished = True
        duration_ms = max(int((perf_counter() - self._started_at) * 1000), 0)
        logger.info(
            "provider=%s model=%s stage=%s request_bytes=%d attempt=%d "
            "duration_ms=%d outcome=%s status=%s",
            self.provider,
            self.model,
            self.stage,
            self.request_bytes,
            self.attempt,
            duration_ms,
            outcome,
            status,
        )


def response_status(response: object) -> int:
    status = getattr(response, "status", None)
    if isinstance(status, int):
        return status
    getcode = getattr(response, "getcode", None)
    if callable(getcode):
        code = getcode()
        if isinstance(code, int):
            return code
    return 200
