from __future__ import annotations

from collections import deque
import hashlib
from ipaddress import ip_address, ip_network
import math
from threading import Lock
import time

from starlette.datastructures import Headers
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send


def client_address(scope: Scope, *, trusted_proxy_networks: tuple = ()) -> str:
    client = scope.get("client")
    immediate_address = str(client[0]) if client else "unknown"
    headers = Headers(scope=scope)
    forwarded_for = headers.get("x-forwarded-for")
    try:
        proxy_is_trusted = any(
            ip_address(immediate_address) in network for network in trusted_proxy_networks
        )
    except ValueError:
        proxy_is_trusted = False
    if forwarded_for and proxy_is_trusted:
        forwarded_address = forwarded_for.split(",", 1)[0].strip()
        try:
            return str(ip_address(forwarded_address))
        except ValueError:
            return immediate_address
    return immediate_address


def bearer_token_fingerprint(scope: Scope) -> str | None:
    authorization = Headers(scope=scope).get("authorization", "")
    scheme, separator, token = authorization.partition(" ")
    if not separator or scheme.lower() != "bearer" or not token.strip():
        return None
    digest = hashlib.sha256(token.strip().encode("utf-8")).hexdigest()
    return f"token:{digest}"


class SlidingWindowRateLimiter:
    def __init__(self, *, max_keys: int = 50_000) -> None:
        if max_keys < 1:
            raise ValueError("max_keys must be positive")
        self.max_keys = max_keys
        self._requests: dict[str, deque[float]] = {}
        self._lock = Lock()

    def retry_after(
        self,
        key: str,
        *,
        limit: int,
        now: float,
        window_seconds: int,
    ) -> int | None:
        if limit < 1 or window_seconds < 1:
            raise ValueError("rate limit and window must be positive")
        cutoff = now - window_seconds
        with self._lock:
            timestamps = self._requests.setdefault(key, deque())
            while timestamps and timestamps[0] <= cutoff:
                timestamps.popleft()
            if len(timestamps) >= limit:
                return max(1, math.ceil(timestamps[0] + window_seconds - now))
            timestamps.append(now)
            if len(self._requests) > self.max_keys:
                oldest_key = next(iter(self._requests))
                if oldest_key != key:
                    self._requests.pop(oldest_key, None)
            return None


class SecurityRateLimitMiddleware:
    def __init__(
        self,
        app: ASGIApp,
        *,
        admin_requests: int,
        admin_window_seconds: int,
        auth_requests: int,
        auth_window_seconds: int,
        community_requests: int = 120,
        community_window_seconds: int = 60,
        ingest_requests: int = 120,
        ingest_window_seconds: int = 60,
        support_requests: int = 5,
        support_window_seconds: int = 300,
        trusted_proxy_cidrs: tuple[str, ...] = (),
        limiter: SlidingWindowRateLimiter | None = None,
    ) -> None:
        for value in (
            admin_requests,
            admin_window_seconds,
            auth_requests,
            auth_window_seconds,
            community_requests,
            community_window_seconds,
            ingest_requests,
            ingest_window_seconds,
            support_requests,
            support_window_seconds,
        ):
            if value < 1:
                raise ValueError("rate limit settings must be positive")
        self.app = app
        self.admin_requests = admin_requests
        self.admin_window_seconds = admin_window_seconds
        self.auth_requests = auth_requests
        self.auth_window_seconds = auth_window_seconds
        self.community_requests = community_requests
        self.community_window_seconds = community_window_seconds
        self.ingest_requests = ingest_requests
        self.ingest_window_seconds = ingest_window_seconds
        self.support_requests = support_requests
        self.support_window_seconds = support_window_seconds
        try:
            self.trusted_proxy_networks = tuple(
                ip_network(value, strict=False) for value in trusted_proxy_cidrs
            )
        except ValueError as exc:
            raise ValueError("trusted proxy CIDRs must be valid networks") from exc
        self.limiter = limiter or SlidingWindowRateLimiter()

    def _rule(self, scope: Scope) -> tuple[str, int, int] | None:
        if scope.get("type") != "http" or scope.get("method") == "OPTIONS":
            return None
        path = str(scope.get("path", ""))
        if path.startswith("/api/auth/github/") or path == "/api/auth/refresh":
            return "auth", self.auth_requests, self.auth_window_seconds
        if path == "/api/admin" or path.startswith("/api/admin/"):
            return "admin", self.admin_requests, self.admin_window_seconds
        if path == "/api/published-flows" or path.startswith("/api/published-flows/"):
            return "community", self.community_requests, self.community_window_seconds
        if path == "/api/projects/public" or path.startswith("/api/projects/public/"):
            return "community", self.community_requests, self.community_window_seconds
        if (
            path in {"/api/events/batch", "/api/events/heartbeat"}
            and scope.get("method") == "POST"
        ):
            return "ingest", self.ingest_requests, self.ingest_window_seconds
        if path == "/api/support" or path.startswith("/api/support/"):
            return "support", self.support_requests, self.support_window_seconds
        return None

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        rule = self._rule(scope)
        if rule is None:
            await self.app(scope, receive, send)
            return

        group, limit, window_seconds = rule
        address_key = f"{group}:ip:{client_address(scope, trusted_proxy_networks=self.trusted_proxy_networks)}"
        rate_limit_keys = [(address_key, limit)]
        if group == "ingest" and (token_key := bearer_token_fingerprint(scope)):
            # Bound both a credential and its source. The source ceiling prevents
            # attackers from bypassing the limiter with a stream of random tokens.
            rate_limit_keys = [
                (f"{group}:{token_key}", limit),
                (address_key, limit * 4),
            ]
        now = time.monotonic()
        retry_after_values = [
            retry_after
            for key, key_limit in rate_limit_keys
            if (
                retry_after := self.limiter.retry_after(
                    key,
                    limit=key_limit,
                    now=now,
                    window_seconds=window_seconds,
                )
            )
            is not None
        ]
        if not retry_after_values:
            await self.app(scope, receive, send)
            return

        retry_after = max(retry_after_values)
        response = JSONResponse(
            status_code=429,
            content={"detail": "Too many requests. Try again later."},
            headers={
                "Cache-Control": "no-store",
                "Retry-After": str(retry_after),
            },
        )
        await response(scope, receive, send)
