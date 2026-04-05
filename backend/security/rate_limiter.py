import time
import redis.asyncio as aioredis
from fastapi import Request, HTTPException
from backend.config import get_settings

settings = get_settings()

_redis = None


async def get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(settings.redis_url, decode_responses=True)
    return _redis


async def rate_limit(
    request: Request,
    limit: int | None = None,
    window: int | None = None,
):
    """Sliding window rate limiter using Redis sorted sets.

    Each request is scored by its timestamp. On every call we:
    1. Remove entries older than the window.
    2. Count remaining entries.
    3. If under the limit, add the current request; otherwise reject.

    This gives accurate per-second granularity without the burst problem
    of a simple INCR + EXPIRE fixed-window approach.
    """
    limit = limit or settings.rate_limit_requests
    window = window or settings.rate_limit_window

    api_key = request.headers.get("x-api-key", "anonymous")
    ip = request.client.host if request.client else "unknown"
    key = f"ratelimit:{ip}:{api_key[:12]}"

    now = time.time()
    window_start = now - window

    r = await get_redis()

    pipe = r.pipeline()
    # Remove entries outside the current window
    pipe.zremrangebyscore(key, "-inf", window_start)
    # Count entries inside the window
    pipe.zcard(key)
    results = await pipe.execute()

    current_count = results[1]

    if current_count >= limit:
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded. Max {limit} requests per {window}s.",
        )

    # Add current request and set key expiry as a safety net
    pipe2 = r.pipeline()
    pipe2.zadd(key, {f"{now}": now})
    pipe2.expire(key, window + 1)
    await pipe2.execute()
