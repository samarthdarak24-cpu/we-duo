"""In-process sliding-window rate limiting for sensitive endpoints.

A production deployment should also enforce limits at the gateway (see
docs/SECURITY.md). This guard is real and enforced for the auth endpoints; it
returns 429 with Retry-After instead of silently allowing brute force.
"""
from __future__ import annotations

import os
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request


class RateLimiter:
    def __init__(self, limit: int, window_seconds: int) -> None:
        self.limit = max(1, limit)
        self.window = max(1, window_seconds)
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def _key(self, request: Request) -> str:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"

    def __call__(self, request: Request) -> None:
        now = time.time()
        key = self._key(request)
        hits = self._hits[key]
        while hits and hits[0] <= now - self.window:
            hits.popleft()
        if len(hits) >= self.limit:
            retry = max(1, int(self.window - (now - hits[0])))
            raise HTTPException(
                status_code=429,
                detail="Too many attempts. Please try again later.",
                headers={"Retry-After": str(retry)},
            )
        hits.append(now)


AUTH_LIMIT = int(os.getenv("TD_RATE_LIMIT_AUTH", "20"))
AUTH_WINDOW = int(os.getenv("TD_RATE_LIMIT_WINDOW", "60"))

# Shared instances so both /api/backend/auth and /api/v1/auth count together.
auth_limiter = RateLimiter(AUTH_LIMIT, AUTH_WINDOW)


def enforce_auth_limit(request: Request) -> None:
    """FastAPI dependency wrapper (a plain function so `Request` is injected)."""
    auth_limiter(request)
