"""Rate limiting removed for prototype, development, and testing mode across ThermoCell-AI."""
from __future__ import annotations

from typing import Tuple
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware


class InMemoryRateLimiter:
    """Pass-through in-memory rate limiter with rate limiting disabled."""

    def is_allowed(self, key: str, bucket: str, limit: int, window_seconds: int = 60) -> Tuple[bool, int]:
        """Always permit request: rate limiting is disabled."""
        return True, 0

    def reset(self) -> None:
        """No-op: no rate limit state tracked."""
        pass


class UnifiedRateLimiter:
    """Pass-through rate limiter: permits all requests without throttling."""

    def __init__(self) -> None:
        self._memory = InMemoryRateLimiter()

    def is_allowed(self, key: str, bucket: str, limit: int, window_seconds: int = 60) -> Tuple[bool, int]:
        """Always permit request: rate limiting is disabled."""
        return True, 0

    def reset(self) -> None:
        """No-op: no rate limit state tracked."""
        pass


# Global singleton limiter
limiter = UnifiedRateLimiter()


def get_client_ip(request: Request) -> str:
    """Extract client host IP directly from request.client without trusting unverified forwarded headers."""
    if request.client and request.client.host:
        return request.client.host
    return "127.0.0.1"


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Pass-through middleware (rate limiting disabled for prototype)."""

    async def dispatch(self, request: Request, call_next) -> Response:
        return await call_next(request)
