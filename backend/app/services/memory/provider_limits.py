from __future__ import annotations

from dataclasses import dataclass
from time import monotonic
from typing import Any, Callable


PROVIDER_RESPONSE_READ_CHUNK_BYTES = 64 * 1024
_RESPONSE_IO_ATTRIBUTES = ("fp", "raw", "_sock", "sock", "socket")
_MAX_RESPONSE_IO_DEPTH = 6


class ProviderResponseTooLargeError(RuntimeError):
    pass


class ProviderWallDeadlineExceededError(RuntimeError):
    pass


@dataclass(frozen=True)
class ProviderWallDeadline:
    expires_at: float

    @classmethod
    def start(cls, seconds: float) -> ProviderWallDeadline:
        return cls(expires_at=monotonic() + max(seconds, 0.001))

    def remaining_seconds(self) -> float:
        remaining = self.expires_at - monotonic()
        if remaining <= 0:
            raise ProviderWallDeadlineExceededError
        return remaining

    def request_timeout(self, configured_seconds: float) -> float:
        return min(max(configured_seconds, 0.001), self.remaining_seconds())

    def ensure_retry_delay_fits(self, delay_seconds: float) -> None:
        if max(delay_seconds, 0.0) >= self.remaining_seconds():
            raise ProviderWallDeadlineExceededError


def _content_length(response: object) -> int | None:
    headers = getattr(response, "headers", None)
    raw_value = headers.get("Content-Length") if hasattr(headers, "get") else None
    if raw_value is None:
        return None
    try:
        value = int(raw_value)
    except (TypeError, ValueError):
        return None
    return value if value >= 0 else None


def _response_reader(response: object) -> Callable[[int], Any]:
    read1 = getattr(response, "read1", None)
    if callable(read1):
        return read1
    read = getattr(response, "read", None)
    if not callable(read):
        raise TypeError("Provider response is not readable")

    def read_chunk(size: int) -> Any:
        return read(size)

    return read_chunk


def _lower_response_read_timeout(response: object, remaining_seconds: float) -> bool:
    queue: list[tuple[object, int]] = [(response, 0)]
    visited: set[int] = set()
    while queue:
        current, depth = queue.pop(0)
        identity = id(current)
        if identity in visited:
            continue
        visited.add(identity)

        try:
            settimeout = getattr(current, "settimeout", None)
        except (AttributeError, OSError, ValueError):
            settimeout = None
        if callable(settimeout):
            timeout = max(remaining_seconds, 0.000_001)
            try:
                gettimeout = getattr(current, "gettimeout", None)
            except (AttributeError, OSError, ValueError):
                gettimeout = None
            if callable(gettimeout):
                try:
                    existing = gettimeout()
                except (OSError, TypeError, ValueError):
                    existing = None
                if isinstance(existing, (int, float)) and existing >= 0:
                    timeout = min(timeout, existing)
            try:
                settimeout(timeout)
            except (OSError, TypeError, ValueError):
                return False
            return True

        if depth >= _MAX_RESPONSE_IO_DEPTH:
            continue
        for attribute in _RESPONSE_IO_ATTRIBUTES:
            try:
                nested = getattr(current, attribute, None)
            except (AttributeError, OSError, ValueError):
                continue
            if nested is not None and id(nested) not in visited:
                queue.append((nested, depth + 1))
    return False


def _prepare_response_read(
    response: object,
    deadline: ProviderWallDeadline,
) -> None:
    remaining = deadline.remaining_seconds()
    _lower_response_read_timeout(response, remaining)


def read_limited_response(
    response: object,
    *,
    deadline: ProviderWallDeadline,
    max_bytes: int,
) -> bytes:
    byte_limit = max(max_bytes, 1)
    content_length = _content_length(response)
    if content_length is not None and content_length > byte_limit:
        raise ProviderResponseTooLargeError

    reader = _response_reader(response)
    body = bytearray()
    while True:
        _prepare_response_read(response, deadline)
        chunk = reader(
            min(
                PROVIDER_RESPONSE_READ_CHUNK_BYTES,
                byte_limit + 1 - len(body),
            )
        )
        deadline.remaining_seconds()
        if not chunk:
            return bytes(body)
        if not isinstance(chunk, (bytes, bytearray, memoryview)):
            raise TypeError("Provider response returned a non-byte chunk")
        body.extend(chunk)
        if len(body) > byte_limit:
            raise ProviderResponseTooLargeError


def read_response_prefix(
    response: object,
    *,
    deadline: ProviderWallDeadline,
    max_bytes: int,
) -> bytes:
    byte_limit = max(max_bytes, 1)
    reader = _response_reader(response)
    body = bytearray()
    while len(body) < byte_limit:
        _prepare_response_read(response, deadline)
        chunk = reader(
            min(
                PROVIDER_RESPONSE_READ_CHUNK_BYTES,
                byte_limit - len(body),
            )
        )
        deadline.remaining_seconds()
        if not chunk:
            break
        if not isinstance(chunk, (bytes, bytearray, memoryview)):
            raise TypeError("Provider response returned a non-byte chunk")
        body.extend(chunk[: byte_limit - len(body)])
    return bytes(body)


def sleep_before_retry_with_deadline(
    deadline: ProviderWallDeadline,
    delay_seconds: float,
    sleeper: Callable[[float], None],
) -> None:
    deadline.ensure_retry_delay_fits(delay_seconds)
    sleeper(delay_seconds)
    deadline.remaining_seconds()
