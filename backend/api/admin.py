import logging
import math
import os
import uuid as uuid_mod
from datetime import datetime, timezone
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from backend.database import get_db
from backend.models.tenant import Tenant
from backend.models.document import Document
from backend.models.conversation import Conversation
from backend.models.lead import Lead
from backend.security.auth import generate_api_key, hash_api_key
from backend.security.admin_auth import require_admin
from backend.ingestion.embedder import ingest_website, ingest_text
from backend.config import get_settings
from backend.api.schemas import (
    TenantCreate,
    TenantResponse,
    TenantCreateResponse,
    TenantUpdate,
    IngestRequest,
    IngestTextRequest,
    IngestResponse,
    TenantStats,
    WidgetConfig,
    WidgetConfigResponse,
    ApiKeyRotateResponse,
)
from backend.api.portal_schemas import CreatePortalUser, PortalUserResponse
from backend.models.client_user import ClientUser
from backend.security.portal_auth import hash_password

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


@router.post("/tenants/{tenant_id}/ingest-text", response_model=IngestResponse)
async def ingest_text_content(
    tenant_id: UUID,
    payload: IngestTextRequest,
    _admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Ingest raw text directly -- for FAQs, docs, or anything not on a website."""
    await _get_tenant_or_404(db, tenant_id)

    stats = await ingest_text(
        db=db,
        tenant_id=tenant_id,
        text=payload.text,
        title=payload.title,
        source_label=payload.source_label,
        clear_existing=payload.clear_existing,
    )

    return IngestResponse(
        status="completed",
        pages_scraped=0,
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
        enable_lead_capture=cfg.enable_lead_capture,
        lead_cta_text=cfg.lead_cta_text,
        lead_form_title=cfg.lead_form_title,
        lead_form_subtitle=cfg.lead_form_subtitle,
        lead_form_fields=cfg.lead_form_fields,
        lead_success_message=cfg.lead_success_message,
        suggested_questions=cfg.suggested_questions,
    )


# --- Image Upload ---

ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"}
MAX_IMAGE_SIZE = 2 * 1024 * 1024  # 2 MB


@router.post("/tenants/{tenant_id}/upload-image")
async def upload_image(
    tenant_id: UUID,
    file: UploadFile = File(...),
    _admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Upload an image for bot avatar or launcher icon. Returns the public URL."""
    await _get_tenant_or_404(db, tenant_id)

    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type: {file.content_type}. Allowed: png, jpg, gif, webp, svg.",
        )

    contents = await file.read()
    if len(contents) > MAX_IMAGE_SIZE:
        raise HTTPException(status_code=400, detail="File too large. Max 2 MB.")

    ext = file.filename.rsplit(".", 1)[-1].lower() if file.filename and "." in file.filename else "png"
    if ext not in ("png", "jpg", "jpeg", "gif", "webp", "svg"):
        ext = "png"

    filename = f"{tenant_id}_{uuid_mod.uuid4().hex[:8]}.{ext}"
    upload_dir = os.path.join("static", "uploads")
    os.makedirs(upload_dir, exist_ok=True)
    filepath = os.path.join(upload_dir, filename)

    with open(filepath, "wb") as f:
        f.write(contents)

    settings = get_settings()
    base_url = settings.widget_cdn_url.rstrip("/").replace("/static", "")
    image_url = f"{base_url}/static/uploads/{filename}"

    logger.info(f"Uploaded image for tenant {tenant_id}: {filename}")
    return {"url": image_url, "filename": filename}


# --- Leads / Bookings ---


@router.get("/tenants/{tenant_id}/leads")
async def list_leads(
    tenant_id: UUID,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    _admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """List captured leads and booking requests for a tenant."""
    await _get_tenant_or_404(db, tenant_id)

    count_result = await db.execute(
        select(func.count()).select_from(Lead).where(Lead.tenant_id == tenant_id)
    )
    total = count_result.scalar() or 0

    offset = (page - 1) * page_size
    result = await db.execute(
        select(Lead)
        .where(Lead.tenant_id == tenant_id)
        .order_by(Lead.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    leads = [
        {
            "id": str(l.id),
            "name": l.name,
            "email": l.email,
            "phone": l.phone,
            "company": l.company,
            "message": l.message,
            "lead_type": l.lead_type,
            "status": l.status,
            "session_id": l.session_id,
            "created_at": l.created_at.isoformat(),
        }
        for l in result.scalars().all()
    ]

    return {
        "items": leads,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": math.ceil(total / page_size) if total > 0 else 0,
    }


@router.patch("/leads/{lead_id}")
async def update_lead_status(
    lead_id: UUID,
    payload: dict,
    _admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Update a lead's status (new, contacted, converted, closed)."""
    result = await db.execute(select(Lead).where(Lead.id == lead_id))
    lead = result.scalar_one_or_none()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    if "status" in payload:
        lead.status = payload["status"]
    await db.commit()
    return {"id": str(lead.id), "status": lead.status}


# --- Portal User Management ---


@router.post("/tenants/{tenant_id}/portal-users", status_code=201)
async def create_portal_user(
    tenant_id: UUID,
    payload: CreatePortalUser,
    _admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Create a portal login for a tenant's staff."""
    await _get_tenant_or_404(db, tenant_id)

    # Check email uniqueness
    existing = await db.execute(
        select(ClientUser).where(ClientUser.email == payload.email)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")

    user = ClientUser(
        tenant_id=tenant_id,
        email=payload.email,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        role=payload.role,
        phone=payload.phone,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    logger.info(f"Created portal user: {user.email} for tenant {tenant_id}")

    return {
        "id": str(user.id),
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role,
        "tenant_id": str(tenant_id),
    }


@router.get("/tenants/{tenant_id}/portal-users")
async def list_portal_users(
    tenant_id: UUID,
    _admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """List portal users for a tenant."""
    await _get_tenant_or_404(db, tenant_id)
    result = await db.execute(
        select(ClientUser).where(ClientUser.tenant_id == tenant_id)
        .order_by(ClientUser.created_at.desc())
    )
    users = [
        {
            "id": str(u.id),
            "email": u.email,
            "full_name": u.full_name,
            "role": u.role,
            "is_active": u.is_active,
            "created_at": u.created_at.isoformat(),
        }
        for u in result.scalars().all()
    ]
    return {"items": users}


@router.delete("/portal-users/{user_id}", status_code=204)
async def delete_portal_user(
    user_id: UUID,
    _admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Delete a portal user."""
    result = await db.execute(select(ClientUser).where(ClientUser.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await db.delete(user)
    await db.commit()


# --- Master Analytics (all tenants) ---


@router.get("/analytics")
async def master_analytics(
    _admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Global analytics across all tenants."""
    from datetime import datetime, timezone, timedelta
    from backend.models.message import Message
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    total_tenants = (await db.execute(
        select(func.count()).select_from(Tenant)
    )).scalar() or 0

    total_leads = (await db.execute(
        select(func.count()).select_from(Lead)
    )).scalar() or 0

    leads_this_month = (await db.execute(
        select(func.count()).select_from(Lead).where(Lead.created_at >= month_start)
    )).scalar() or 0

    total_conversations = (await db.execute(
        select(func.count()).select_from(Conversation)
    )).scalar() or 0

    total_messages_sent = (await db.execute(
        select(func.count()).select_from(Message).where(Message.sender_type == "client")
    )).scalar() or 0

    # Leads per tenant
    leads_per_tenant = await db.execute(
        select(Tenant.name, func.count(Lead.id))
        .outerjoin(Lead, Lead.tenant_id == Tenant.id)
        .group_by(Tenant.name)
        .order_by(func.count(Lead.id).desc())
    )
    by_tenant = [{"tenant": row[0], "leads": row[1]} for row in leads_per_tenant.fetchall()]

    # Conversion rates per tenant
    conversion_result = await db.execute(
        select(
            Tenant.name,
            func.count(Lead.id).label("total"),
            func.count(case((Lead.status == "converted", 1))).label("converted"),
        )
        .outerjoin(Lead, Lead.tenant_id == Tenant.id)
        .group_by(Tenant.name)
    )
    conversions = []
    for row in conversion_result.fetchall():
        rate = round((row[2] / row[1]) * 100, 1) if row[1] > 0 else 0.0
        conversions.append({"tenant": row[0], "total": row[1], "converted": row[2], "rate": rate})

    # Response rates
    tenants_with_replies = (await db.execute(
        select(func.count(func.distinct(Message.tenant_id))).where(Message.sender_type == "client")
    )).scalar() or 0

    return {
        "total_tenants": total_tenants,
        "total_leads": total_leads,
        "leads_this_month": leads_this_month,
        "total_conversations": total_conversations,
        "total_messages_sent": total_messages_sent,
        "tenants_with_active_replies": tenants_with_replies,
        "leads_per_tenant": by_tenant,
        "conversion_rates": conversions,
    }


# --- Helpers ---


async def _get_tenant_or_404(db: AsyncSession, tenant_id: UUID) -> Tenant:
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return tenant
