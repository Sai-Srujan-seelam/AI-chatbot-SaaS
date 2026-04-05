import hashlib
import hmac
from fastapi import Header, HTTPException
from backend.config import get_settings

settings = get_settings()


def _expected_admin_hash() -> str:
    """Hash the admin secret from settings."""
    return hashlib.sha256(settings.app_secret_key.encode()).hexdigest()


async def require_admin(
    authorization: str = Header(..., alias="Authorization"),
):
    """
    Protect admin endpoints with a Bearer token.
    The token is the APP_SECRET_KEY from .env.
    In production, swap this for JWT or OAuth.
    """
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Bearer token")

    token = authorization[7:]
    token_hash = hashlib.sha256(token.encode()).hexdigest()

    # Use constant-time comparison to prevent timing attacks.
    # A regular != leaks hash info via response-time differences.
    if not hmac.compare_digest(token_hash, _expected_admin_hash()):
        raise HTTPException(status_code=403, detail="Invalid admin token")
