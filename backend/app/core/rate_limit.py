"""Rate limiting middleware with route-specific buckets and multi-worker synchronization for ThermoCell-AI."""
from __future__ import annotations

import time
from collections import defaultdict
from typing import Dict, List, Tuple
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app.core.config import get_settings


class InMemoryRateLimiter:
    """
    Sliding window in-memory rate limiter.
    Maintains timestamp lists per (client_ip, bucket_category).
    """

    def __init__(self) -> None:
        # map (key, bucket) -> list of timestamps
        self._history: Dict[Tuple[str, str], List[float]] = defaultdict(list)

    def is_allowed(self, key: str, bucket: str, limit: int, window_seconds: int = 60) -> Tuple[bool, int]:
        """
        Check if request is within rate limit.
        Returns (is_allowed, retry_after_seconds).
        """
        now = time.monotonic()
        cutoff = now - window_seconds
        timestamps = self._history.get((key, bucket), [])

        # Evict timestamps older than window
        valid_timestamps = [t for t in timestamps if t > cutoff]
        if valid_timestamps:
            self._history[(key, bucket)] = valid_timestamps
        else:
            self._history.pop((key, bucket), None)
            valid_timestamps = []

        if len(valid_timestamps) >= limit:
            oldest = valid_timestamps[0]
            retry_after = max(1, int(window_seconds - (now - oldest)))
            return False, retry_after

        valid_timestamps.append(now)
        self._history[(key, bucket)] = valid_timestamps
        return True, 0

    def reset(self) -> None:
        """Clear all rate limit records."""
        self._history.clear()


class UnifiedRateLimiter:
    """
    Unified rate limiter supporting in-memory mode for development/testing
    and shared PostgreSQL mode for multi-worker production deployments.
    """

    def __init__(self) -> None:
        self._memory = InMemoryRateLimiter()

    def is_allowed(self, key: str, bucket: str, limit: int, window_seconds: int = 60) -> Tuple[bool, int]:
        settings = get_settings()
        if settings.DATABASE_URL.lower().startswith("postgres"):
            try:
                from app.services.session_store import get_session_store
                return get_session_store().check_and_record_rate_limit(key, bucket, limit, window_seconds)
            except Exception:
                # Graceful fallback to memory on database unavailability
                return self._memory.is_allowed(key, bucket, limit, window_seconds)
        return self._memory.is_allowed(key, bucket, limit, window_seconds)

    def reset(self) -> None:
        self._memory.reset()
        settings = get_settings()
        if settings.DATABASE_URL.lower().startswith("postgres"):
            try:
                from app.services.session_store import get_session_store
                get_session_store().reset_rate_limits()
            except Exception:
                pass


# Global singleton limiter
limiter = UnifiedRateLimiter()


def get_client_ip(request: Request) -> str:
    """Extract client host IP directly from request.client without trusting unverified forwarded headers."""
    if request.client and request.client.host:
        return request.client.host
    return "127.0.0.1"


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    FastAPI middleware enforcing endpoint-specific rate limits.
    Configured limits:
      - /api/auth/token: 5 req/min (anti-brute-force)
      - /api/simulate, /api/screen: 30 req/min (compute-heavy physics & ML)
      - /api/telemetry/frame: 600 req/min (supports 10Hz streaming without frame drops)
      - Default: 120 req/min
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        settings = get_settings()
        if not settings.RATE_LIMIT_ENABLED:
            return await call_next(request)

        # Skip rate limiting on OPTIONS preflight
        if request.method == "OPTIONS":
            return await call_next(request)

        path = request.url.path
        client_ip = get_client_ip(request)

        # Determine rate limit bucket
        if path == "/api/auth/token":
            bucket = "auth"
            limit = 5
            window = 60
        elif path.startswith("/api/simulate") or path.startswith("/api/screen"):
            bucket = "compute"
            limit = 30
            window = 60
        elif path == "/api/telemetry/frame":
            bucket = "telemetry_frame"
            limit = 600
            window = 60
        elif path.startswith("/api/"):
            bucket = "general_api"
            limit = 120
            window = 60
        else:
            # Static / docs / root / health
            return await call_next(request)

        allowed, retry_after = limiter.is_allowed(client_ip, bucket, limit, window)
        if not allowed:
            return JSONResponse(
                status_code=429,
                content={
                    "detail": "Rate limit exceeded. Too many requests.",
                    "bucket": bucket,
                    "retry_after": retry_after,
                },
                headers={"Retry-After": str(retry_after)},
            )

        return await call_next(request)
