import hashlib
import secrets
from fastapi import Header, HTTPException, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from backend.database import get_db
from backend.models.tenant import Tenant


def generate_api_key() -> tuple[str, str, str]:
    """Generate an API key. Returns (raw_key, hashed_key, prefix)."""
    raw = f"wc_live_{secrets.token_urlsafe(32)}"
    hashed = hashlib.sha256(raw.encode()).hexdigest()
    prefix = raw[:12]
    return raw, hashed, prefix


def hash_api_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode()).hexdigest()


async def authenticate_api_key(
    x_api_key: str = Header(..., alias="X-Api-Key"),
    db: AsyncSession = Depends(get_db),
) -> Tenant:
    """Validate API key from request header, return the tenant."""
    if not x_api_key or not x_api_key.startswith("wc_live_"):
        raise HTTPException(status_code=401, detail="Invalid API key format")

    key_hash = hash_api_key(x_api_key)
    result = await db.execute(
        select(Tenant).where(Tenant.api_key_hash == key_hash, Tenant.is_active == True)
    )
    tenant = result.scalar_one_or_none()

    if not tenant:
        raise HTTPException(status_code=401, detail="Invalid or inactive API key")

    return tenant
