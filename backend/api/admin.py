import logging
import math
from datetime import datetime, timezone
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from backend.database import get_db
from backend.models.tenant import Tenant
from backend.models.document import Document
from backend.models.conversation import Conversation
from backend.security.auth import generate_api_key, hash_api_key
from backend.security.admin_auth import require_admin
from backend.ingestion.embedder import ingest_website
from backend.api.schemas import (
    TenantCreate,
    TenantResponse,
    TenantCreateResponse,
    TenantUpdate,
    IngestRequest,
    IngestResponse,
    TenantStats,
    WidgetConfig,
    WidgetConfigResponse,
    ApiKeyRotateResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter()


# --- Tenant CRUD (all require admin auth) ---


@router.post("/tenants", response_model=TenantCreateResponse, status_code=201)
async def create_tenant(
    payload: TenantCreate,
    _admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Create a new tenant and return their API key (shown only once)."""
    raw_key, hashed_key, prefix = generate_api_key()

    tenant = Tenant(
        name=payload.name,
        domain=payload.domain,
        api_key_hash=hashed_key,
        api_key_prefix=prefix,
        widget_config=payload.widget_config.model_dump(),
        max_conversations_per_month=payload.max_conversations_per_month,
        subscription_tier=payload.subscription_tier,
        contact_email=payload.contact_email,
        current_billing_period_start=datetime.now(timezone.utc),
    )
    db.add(tenant)
    await db.commit()
    await db.refresh(tenant)

    logger.info(f"Created tenant: {tenant.name} ({tenant.id})")

    return TenantCreateResponse(
        tenant=TenantResponse.model_validate(tenant),
        api_key=raw_key,
    )


@router.get("/tenants", response_model=dict)
async def list_tenants(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    _admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """List tenants with pagination."""
    # Count total
    count_result = await db.execute(select(func.count()).select_from(Tenant))
    total = count_result.scalar() or 0

    # Fetch page
    offset = (page - 1) * page_size
    result = await db.execute(
        select(Tenant)
        .order_by(Tenant.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    tenants = [TenantResponse.model_validate(t) for t in result.scalars().all()]

    return {
        "items": tenants,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": math.ceil(total / page_size) if total > 0 else 0,
    }


@router.get("/tenants/{tenant_id}", response_model=TenantResponse)
async def get_tenant(
    tenant_id: UUID,
    _admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get a single tenant by ID."""
    tenant = await _get_tenant_or_404(db, tenant_id)
    return TenantResponse.model_validate(tenant)


@router.patch("/tenants/{tenant_id}", response_model=TenantResponse)
async def update_tenant(
    tenant_id: UUID,
    payload: TenantUpdate,
    _admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Update tenant settings."""
    tenant = await _get_tenant_or_404(db, tenant_id)

    update_data = payload.model_dump(exclude_unset=True)

    # Convert WidgetConfig to dict if provided
    if "widget_config" in update_data and update_data["widget_config"] is not None:
        update_data["widget_config"] = payload.widget_config.model_dump()

    for field, value in update_data.items():
        setattr(tenant, field, value)

    await db.commit()
    await db.refresh(tenant)
    return TenantResponse.model_validate(tenant)


@router.delete("/tenants/{tenant_id}", status_code=204)
async def delete_tenant(
    tenant_id: UUID,
    _admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Delete a tenant and all their data."""
    tenant = await _get_tenant_or_404(db, tenant_id)
    await db.delete(tenant)
    await db.commit()


# --- API Key rotation ---


@router.post("/tenants/{tenant_id}/rotate-key", response_model=ApiKeyRotateResponse)
async def rotate_api_key(
    tenant_id: UUID,
    _admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Generate a new API key for a tenant. The old key stops working immediately."""
    tenant = await _get_tenant_or_404(db, tenant_id)

    raw_key, hashed_key, prefix = generate_api_key()
    tenant.api_key_hash = hashed_key
    tenant.api_key_prefix = prefix

    await db.commit()
    logger.info(f"Rotated API key for tenant: {tenant.name} ({tenant.id})")

    return ApiKeyRotateResponse(api_key=raw_key, api_key_prefix=prefix)


# --- Ingestion ---


@router.post("/tenants/{tenant_id}/ingest", response_model=IngestResponse)
async def ingest_content(
    tenant_id: UUID,
    payload: IngestRequest,
    _admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Scrape a website and ingest content for a tenant."""
    tenant = await _get_tenant_or_404(db, tenant_id)

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


# --- Knowledge base management ---


@router.get("/tenants/{tenant_id}/documents")
async def list_documents(
    tenant_id: UUID,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    _admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """List ingested document chunks for a tenant."""
    await _get_tenant_or_404(db, tenant_id)

    count_result = await db.execute(
        select(func.count()).select_from(Document).where(Document.tenant_id == tenant_id)
    )
    total = count_result.scalar() or 0

    offset = (page - 1) * page_size
    result = await db.execute(
        select(Document.id, Document.source_url, Document.title, Document.chunk_index, Document.created_at)
        .where(Document.tenant_id == tenant_id)
        .order_by(Document.source_url, Document.chunk_index)
        .offset(offset)
        .limit(page_size)
    )
    docs = [
        {
            "id": str(row.id),
            "source_url": row.source_url,
            "title": row.title,
            "chunk_index": row.chunk_index,
            "created_at": row.created_at.isoformat(),
        }
        for row in result.fetchall()
    ]

    return {
        "items": docs,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": math.ceil(total / page_size) if total > 0 else 0,
    }


# --- Conversation logs ---


@router.get("/tenants/{tenant_id}/conversations")
async def list_conversations(
    tenant_id: UUID,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    _admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """List conversation logs for a tenant."""
    await _get_tenant_or_404(db, tenant_id)

    count_result = await db.execute(
        select(func.count()).select_from(Conversation).where(Conversation.tenant_id == tenant_id)
    )
    total = count_result.scalar() or 0

    offset = (page - 1) * page_size
    result = await db.execute(
        select(Conversation)
        .where(Conversation.tenant_id == tenant_id)
        .order_by(Conversation.updated_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    convos = [
        {
            "id": str(c.id),
            "session_id": c.session_id,
            "message_count": c.message_count,
            "messages": c.messages,
            "created_at": c.created_at.isoformat(),
            "updated_at": c.updated_at.isoformat(),
        }
        for c in result.scalars().all()
    ]

    return {
        "items": convos,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": math.ceil(total / page_size) if total > 0 else 0,
    }


# --- Analytics ---


@router.get("/tenants/{tenant_id}/stats", response_model=TenantStats)
async def get_tenant_stats(
    tenant_id: UUID,
    _admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get usage stats for a tenant."""
    tenant = await _get_tenant_or_404(db, tenant_id)

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

    max_convos = tenant.max_conversations_per_month or 1
    usage_pct = (tenant.conversations_this_month / max_convos) * 100

    return TenantStats(
        tenant_id=str(tenant_id),
        tenant_name=tenant.name,
        document_chunks=doc_count.scalar() or 0,
        total_conversations=conv_count.scalar() or 0,
        total_messages=total_messages.scalar() or 0,
        conversations_this_month=tenant.conversations_this_month,
        usage_percent=round(min(usage_pct, 100.0), 1),
    )


# --- Widget Config (public endpoint, called by widget -- no admin auth) ---


@router.get("/widget-config")
async def get_widget_config(
    api_key: str,
    db: AsyncSession = Depends(get_db),
):
    """Public endpoint for widget to fetch its full configuration."""
    key_hash = hash_api_key(api_key)
    result = await db.execute(
        select(Tenant).where(Tenant.api_key_hash == key_hash, Tenant.is_active == True)
    )
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Invalid API key")

    # Parse config with defaults
    cfg = WidgetConfig(**(tenant.widget_config or {}))

    # Override welcome_message default if empty
    welcome = cfg.welcome_message or f"Hi! Ask me anything about {tenant.name}."

    return WidgetConfigResponse(
        tenant_name=tenant.name,
        primary_color=cfg.primary_color,
        accent_color=cfg.accent_color,
        background_color=cfg.background_color,
        text_color=cfg.text_color,
        font_family=cfg.font_family,
        border_radius=cfg.border_radius,
        theme=cfg.theme,
        position=cfg.position,
        launcher_icon=cfg.launcher_icon,
        launcher_icon_url=cfg.launcher_icon_url,
        launcher_size=cfg.launcher_size,
        window_width=cfg.window_width,
        window_height=cfg.window_height,
        bot_name=cfg.bot_name,
        bot_avatar_url=cfg.bot_avatar_url,
        header_text=cfg.header_text,
        welcome_message=welcome,
        placeholder_text=cfg.placeholder_text,
        show_powered_by=cfg.show_powered_by,
        auto_open=cfg.auto_open,
        auto_open_delay_ms=cfg.auto_open_delay_ms,
        persist_conversations=cfg.persist_conversations,
        show_sources=cfg.show_sources,
        max_message_length=cfg.max_message_length,
    )


# --- Helpers ---


async def _get_tenant_or_404(db: AsyncSession, tenant_id: UUID) -> Tenant:
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return tenant
