"""JWT-based authentication for the client portal."""

import jwt
from datetime import datetime, timezone, timedelta
from uuid import UUID
from fastapi import Header, HTTPException, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from passlib.hash import bcrypt
from backend.config import get_settings
from backend.database import get_db
from backend.models.client_user import ClientUser

settings = get_settings()


def hash_password(password: str) -> str:
    return bcrypt.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.verify(plain, hashed)


def create_access_token(user_id: UUID, tenant_id: UUID) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    payload = {
        "sub": str(user_id),
        "tenant_id": str(tenant_id),
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def get_current_user(
    authorization: str = Header(..., alias="Authorization"),
    db: AsyncSession = Depends(get_db),
) -> ClientUser:
    """Extract and validate JWT from Authorization header, return the ClientUser."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Bearer token")

    token = authorization[7:]
    payload = decode_token(token)

    user_id = payload.get("sub")
    payload_tenant_id = payload.get("tenant_id")
    if not user_id or not payload_tenant_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    result = await db.execute(
        select(ClientUser).where(ClientUser.id == user_id, ClientUser.is_active == True)
    )
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=401, detail="User not found or inactive")

    # Validate JWT tenant_id matches the user's actual tenant — prevents token tampering
    if str(user.tenant_id) != payload_tenant_id:
        raise HTTPException(status_code=401, detail="Invalid token")

    return user
