import logging
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from backend.database import get_db
from backend.models.tenant import Tenant
from backend.models.document import Document
from backend.models.conversation import Conversation
from backend.security.auth import generate_api_key
from backend.ingestion.embedder import ingest_website
from backend.api.schemas import (
    TenantCreate,
    TenantResponse,
    TenantCreateResponse,
    TenantUpdate,
    IngestRequest,
    IngestResponse,
    WidgetConfigResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter()


# --- Tenant CRUD ---


@router.post("/tenants", response_model=TenantCreateResponse, status_code=201)
async def create_tenant(
    payload: TenantCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a new tenant and return their API key (shown only once)."""
    raw_key, hashed_key, prefix = generate_api_key()

    tenant = Tenant(
        name=payload.name,
        domain=payload.domain,
        api_key_hash=hashed_key,
        api_key_prefix=prefix,
        widget_config=payload.widget_config,
        max_conversations_per_month=payload.max_conversations_per_month,
    )
    db.add(tenant)
    await db.commit()
    await db.refresh(tenant)

    logger.info(f"Created tenant: {tenant.name} ({tenant.id})")

    return TenantCreateResponse(
        tenant=TenantResponse.model_validate(tenant),
        api_key=raw_key,
    )


@router.get("/tenants", response_model=list[TenantResponse])
async def list_tenants(db: AsyncSession = Depends(get_db)):
    """List all tenants."""
    result = await db.execute(select(Tenant).order_by(Tenant.created_at.desc()))
    return [TenantResponse.model_validate(t) for t in result.scalars().all()]


@router.get("/tenants/{tenant_id}", response_model=TenantResponse)
async def get_tenant(tenant_id: UUID, db: AsyncSession = Depends(get_db)):
    """Get a single tenant by ID."""
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return TenantResponse.model_validate(tenant)


@router.patch("/tenants/{tenant_id}", response_model=TenantResponse)
async def update_tenant(
    tenant_id: UUID,
    payload: TenantUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update tenant settings."""
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(tenant, field, value)

    await db.commit()
    await db.refresh(tenant)
    return TenantResponse.model_validate(tenant)


@router.delete("/tenants/{tenant_id}", status_code=204)
async def delete_tenant(tenant_id: UUID, db: AsyncSession = Depends(get_db)):
    """Delete a tenant and all their data."""
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    await db.delete(tenant)
    await db.commit()


# --- Ingestion ---


@router.post("/tenants/{tenant_id}/ingest", response_model=IngestResponse)
async def ingest_content(
    tenant_id: UUID,
    payload: IngestRequest,
    db: AsyncSession = Depends(get_db),
):
    """Scrape a website and ingest content for a tenant."""
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    stats = await ingest_website(
        db=db,
        tenant_id=tenant.id,
        url=payload.url,
        max_pages=payload.max_pages,
        clear_existing=payload.clear_existing,
    )

    return IngestResponse(
        status="completed",
        pages_scraped=stats.get("pages_scraped", 0),
        chunks_stored=stats.get("chunks_stored", 0),
        sources=stats.get("sources", []),
        error=stats.get("error"),
    )


# --- Analytics ---


@router.get("/tenants/{tenant_id}/stats")
async def get_tenant_stats(
    tenant_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get usage stats for a tenant."""
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    doc_count = await db.execute(
        select(func.count()).select_from(Document).where(Document.tenant_id == tenant_id)
    )
    conv_count = await db.execute(
        select(func.count()).select_from(Conversation).where(Conversation.tenant_id == tenant_id)
    )
    total_messages = await db.execute(
        select(func.sum(Conversation.message_count))
        .where(Conversation.tenant_id == tenant_id)
    )

    return {
        "tenant_id": str(tenant_id),
        "tenant_name": tenant.name,
        "document_chunks": doc_count.scalar() or 0,
        "total_conversations": conv_count.scalar() or 0,
        "total_messages": total_messages.scalar() or 0,
    }


# --- Widget Config (public endpoint, called by widget) ---


@router.get("/widget-config")
async def get_widget_config(
    api_key: str,
    db: AsyncSession = Depends(get_db),
):
    """Public endpoint for widget to fetch its configuration."""
    from backend.security.auth import hash_api_key

    key_hash = hash_api_key(api_key)
    result = await db.execute(
        select(Tenant).where(Tenant.api_key_hash == key_hash, Tenant.is_active == True)
    )
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Invalid API key")

    cfg = tenant.widget_config or {}
    return WidgetConfigResponse(
        tenant_name=tenant.name,
        primary_color=cfg.get("primary_color", "#2563eb"),
        position=cfg.get("position", "bottom-right"),
        welcome_message=cfg.get("welcome_message", f"Hi! Ask me anything about {tenant.name}."),
        bot_name=cfg.get("bot_name", "Assistant"),
        header_text=cfg.get("header_text", "Chat with us"),
    )
