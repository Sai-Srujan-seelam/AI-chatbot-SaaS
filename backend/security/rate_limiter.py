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
    """Sliding window rate limiter using Redis."""
    limit = limit or settings.rate_limit_requests
    window = window or settings.rate_limit_window

    # Rate limit by IP + API key combination
    api_key = request.headers.get("x-api-key", "anonymous")
    ip = request.client.host if request.client else "unknown"
    key = f"ratelimit:{ip}:{api_key[:12]}"

    r = await get_redis()
    current = await r.get(key)

    if current and int(current) >= limit:
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded. Max {limit} requests per {window}s.",
        )

    pipe = r.pipeline()
    pipe.incr(key)
    pipe.expire(key, window)
    await pipe.execute()
