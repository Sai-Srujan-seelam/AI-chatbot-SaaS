"""Client Portal API — endpoints for tenant clients to manage their leads."""

import logging
import math
from datetime import datetime, timezone, timedelta
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, case, and_
from sqlalchemy.ext.asyncio import AsyncSession
from backend.database import get_db
from backend.models.client_user import ClientUser
from backend.models.lead import Lead
from backend.models.message import Message
from backend.models.notification import Notification
from backend.models.conversation import Conversation
from backend.models.document import Document
from backend.models.tenant import Tenant
from backend.security.portal_auth import (
    verify_password,
    create_access_token,
    get_current_user,
    hash_password,
)
from backend.api.portal_schemas import (
    PortalLogin,
    PortalLoginResponse,
    PortalUserResponse,
    LeadListItem,
    LeadDetail,
    LeadStatusUpdate,
    MessageCreate,
    MessageResponse,
    NotificationResponse,
    PortalAnalytics,
    PortalSettingsUpdate,
    PasswordChange,
    ReplyTemplate,
)
from backend.services.email import _send_email
from backend.services.sms import send_sms

logger = logging.getLogger(__name__)
router = APIRouter()


# ============================================================
# AUTH
# ============================================================

@router.post("/login", response_model=PortalLoginResponse)
async def portal_login(payload: PortalLogin, db: AsyncSession = Depends(get_db)):
    """Authenticate a client portal user and return a JWT."""
    result = await db.execute(
        select(ClientUser).where(ClientUser.email == payload.email, ClientUser.is_active == True)
    )
    user = result.scalar_one_or_none()

    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # Get tenant name
    tenant_result = await db.execute(select(Tenant.name).where(Tenant.id == user.tenant_id))
    tenant_name = tenant_result.scalar_one_or_none()

    token = create_access_token(user.id, user.tenant_id)

    return PortalLoginResponse(
        access_token=token,
        user=PortalUserResponse(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            role=user.role,
            tenant_id=user.tenant_id,
            tenant_name=tenant_name,
            notify_email=user.notify_email,
            notify_sms=user.notify_sms,
            digest_frequency=user.digest_frequency,
            phone=user.phone,
        ),
    )


@router.get("/me", response_model=PortalUserResponse)
async def get_profile(
    user: ClientUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    tenant_result = await db.execute(select(Tenant.name).where(Tenant.id == user.tenant_id))
    tenant_name = tenant_result.scalar_one_or_none()
    return PortalUserResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        tenant_id=user.tenant_id,
        tenant_name=tenant_name,
        notify_email=user.notify_email,
        notify_sms=user.notify_sms,
        digest_frequency=user.digest_frequency,
        phone=user.phone,
    )


# ============================================================
# DASHBOARD STATS
# ============================================================

@router.get("/dashboard")
async def portal_dashboard(
    user: ClientUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get dashboard summary stats for the logged-in client."""
    tid = user.tenant_id
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    week_start = now - timedelta(days=now.weekday())
    week_start = week_start.replace(hour=0, minute=0, second=0, microsecond=0)

    # Total leads
    total = (await db.execute(
        select(func.count()).select_from(Lead).where(Lead.tenant_id == tid)
    )).scalar() or 0

    # Leads this month
    this_month = (await db.execute(
        select(func.count()).select_from(Lead).where(
            Lead.tenant_id == tid, Lead.created_at >= month_start
        )
    )).scalar() or 0

    # Leads this week
    this_week = (await db.execute(
        select(func.count()).select_from(Lead).where(
            Lead.tenant_id == tid, Lead.created_at >= week_start
        )
    )).scalar() or 0

    # New (uncontacted) leads
    new_leads = (await db.execute(
        select(func.count()).select_from(Lead).where(
            Lead.tenant_id == tid, Lead.status == "new"
        )
    )).scalar() or 0

    # Status breakdown
    status_counts = {}
    result = await db.execute(
        select(Lead.status, func.count()).where(Lead.tenant_id == tid).group_by(Lead.status)
    )
    for row in result.fetchall():
        status_counts[row[0]] = row[1]

    # Unread notifications
    unread_notifs = (await db.execute(
        select(func.count()).select_from(Notification).where(
            Notification.tenant_id == tid,
            Notification.is_read == False,
        )
    )).scalar() or 0

    # Recent leads (last 5)
    recent_result = await db.execute(
        select(Lead).where(Lead.tenant_id == tid)
        .order_by(Lead.created_at.desc()).limit(5)
    )
    recent_leads = [
        {
            "id": str(l.id), "name": l.name, "email": l.email,
            "lead_type": l.lead_type, "status": l.status,
            "created_at": l.created_at.isoformat(),
        }
        for l in recent_result.scalars().all()
    ]

    conversion_rate = 0.0
    if total > 0:
        converted = status_counts.get("converted", 0)
        conversion_rate = round((converted / total) * 100, 1)

    return {
        "total_leads": total,
        "leads_this_month": this_month,
        "leads_this_week": this_week,
        "new_leads": new_leads,
        "status_breakdown": status_counts,
        "conversion_rate": conversion_rate,
        "unread_notifications": unread_notifs,
        "recent_leads": recent_leads,
    }


# ============================================================
# LEADS
# ============================================================

@router.get("/leads")
async def list_leads(
    user: ClientUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    status: str | None = Query(default=None),
    source: str | None = Query(default=None),
    search: str | None = Query(default=None),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    sort_by: str = Query(default="created_at"),
    sort_order: str = Query(default="desc"),
):
    """List leads with filtering, search, and pagination."""
    tid = user.tenant_id

    # Base query
    query = select(Lead).where(Lead.tenant_id == tid)
    count_query = select(func.count()).select_from(Lead).where(Lead.tenant_id == tid)

    # Filters
    if status:
        query = query.where(Lead.status == status)
        count_query = count_query.where(Lead.status == status)

    if source:
        query = query.where(Lead.lead_type == source)
        count_query = count_query.where(Lead.lead_type == source)

    if search:
        search_filter = Lead.name.ilike(f"%{search}%") | Lead.email.ilike(f"%{search}%")
        query = query.where(search_filter)
        count_query = count_query.where(search_filter)

    if date_from:
        try:
            from_dt = datetime.fromisoformat(date_from)
            query = query.where(Lead.created_at >= from_dt)
            count_query = count_query.where(Lead.created_at >= from_dt)
        except ValueError:
            pass

    if date_to:
        try:
            to_dt = datetime.fromisoformat(date_to)
            query = query.where(Lead.created_at <= to_dt)
            count_query = count_query.where(Lead.created_at <= to_dt)
        except ValueError:
            pass

    # Sorting
    sort_col = getattr(Lead, sort_by, Lead.created_at)
    if sort_order == "asc":
        query = query.order_by(sort_col.asc())
    else:
        query = query.order_by(sort_col.desc())

    # Count
    total = (await db.execute(count_query)).scalar() or 0

    # Paginate
    offset = (page - 1) * page_size
    result = await db.execute(query.offset(offset).limit(page_size))
    leads = result.scalars().all()

    # Get unread message counts per lead
    lead_ids = [l.id for l in leads]
    unread_counts = {}
    if lead_ids:
        unread_result = await db.execute(
            select(Message.lead_id, func.count()).where(
                Message.lead_id.in_(lead_ids),
                Message.tenant_id == tid,
                Message.sender_type == "lead",
                Message.is_read == False,
            ).group_by(Message.lead_id)
        )
        for row in unread_result.fetchall():
            unread_counts[row[0]] = row[1]

    items = [
        LeadListItem(
            id=l.id, name=l.name, email=l.email, phone=l.phone,
            company=l.company, message=l.message, lead_type=l.lead_type,
            status=l.status, source=l.lead_type,
            session_id=l.session_id, created_at=l.created_at,
            unread_count=unread_counts.get(l.id, 0),
        ).model_dump()
        for l in leads
    ]

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": math.ceil(total / page_size) if total > 0 else 0,
    }


@router.get("/leads/{lead_id}")
async def get_lead_detail(
    lead_id: UUID,
    user: ClientUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get detailed lead view with conversation history."""
    lead = await _get_lead_or_404(db, lead_id, user.tenant_id)

    # Get reply messages
    msg_result = await db.execute(
        select(Message).where(Message.lead_id == lead_id)
        .order_by(Message.created_at.asc())
    )
    messages = msg_result.scalars().all()

    # Get original chatbot conversation if session_id exists
    chatbot_convo = None
    if lead.session_id:
        conv_result = await db.execute(
            select(Conversation).where(
                Conversation.tenant_id == user.tenant_id,
                Conversation.session_id == lead.session_id,
            )
        )
        conv = conv_result.scalar_one_or_none()
        if conv:
            chatbot_convo = conv.messages

    # Get sender names for messages
    sender_ids = {m.sender_id for m in messages if m.sender_id}
    sender_names = {}
    if sender_ids:
        users_result = await db.execute(
            select(ClientUser.id, ClientUser.full_name).where(ClientUser.id.in_(sender_ids))
        )
        for row in users_result.fetchall():
            sender_names[row[0]] = row[1]

    msg_responses = [
        MessageResponse(
            id=m.id, lead_id=m.lead_id, sender_type=m.sender_type,
            sender_name=sender_names.get(m.sender_id) if m.sender_type == "client" else lead.name,
            channel=m.channel, subject=m.subject, body=m.body,
            is_read=m.is_read, created_at=m.created_at,
        ).model_dump()
        for m in messages
    ]

    # Mark unread messages from lead as read
    for m in messages:
        if m.sender_type == "lead" and not m.is_read:
            m.is_read = True
    await db.commit()

    return LeadDetail(
        id=lead.id, name=lead.name, email=lead.email, phone=lead.phone,
        company=lead.company, message=lead.message, lead_type=lead.lead_type,
        status=lead.status, source=lead.lead_type,
        session_id=lead.session_id, created_at=lead.created_at,
        conversation_messages=msg_responses,
        chatbot_conversation=chatbot_convo,
    ).model_dump()


@router.patch("/leads/{lead_id}/status")
async def update_lead_status(
    lead_id: UUID,
    payload: LeadStatusUpdate,
    user: ClientUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a lead's status."""
    lead = await _get_lead_or_404(db, lead_id, user.tenant_id)
    lead.status = payload.status
    await db.commit()
    return {"id": str(lead.id), "status": lead.status}


# ============================================================
# REPLY / MESSAGING
# ============================================================

@router.post("/leads/{lead_id}/reply")
async def reply_to_lead(
    lead_id: UUID,
    payload: MessageCreate,
    user: ClientUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Send a reply to a lead via email or SMS."""
    lead = await _get_lead_or_404(db, lead_id, user.tenant_id)

    # Save message to DB
    msg = Message(
        lead_id=lead_id,
        tenant_id=user.tenant_id,
        sender_type="client",
        sender_id=user.id,
        channel=payload.channel,
        subject=payload.subject,
        body=payload.body,
    )
    db.add(msg)

    # Update lead status to contacted if it's new
    if lead.status == "new":
        lead.status = "contacted"

    await db.commit()
    await db.refresh(msg)

    # Get tenant name for email
    tenant_result = await db.execute(select(Tenant.name).where(Tenant.id == user.tenant_id))
    tenant_name = tenant_result.scalar_one_or_none() or "Our Team"

    # Send via channel
    if payload.channel == "email":
        subject = payload.subject or f"Re: Your inquiry with {tenant_name}"
        html_body = f"""
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <p style="color: #1a1a1a; line-height: 1.6; white-space: pre-wrap;">{payload.body}</p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
            <p style="color: #9ca3af; font-size: 13px;">
                {user.full_name} from {tenant_name}
            </p>
        </div>
        """
        await _send_email(lead.email, subject, html_body)

    elif payload.channel == "sms" and lead.phone:
        await send_sms(lead.phone, payload.body)

    logger.info(f"Reply sent to lead {lead.email} via {payload.channel} by {user.email}")

    return MessageResponse(
        id=msg.id, lead_id=msg.lead_id, sender_type=msg.sender_type,
        sender_name=user.full_name, channel=msg.channel,
        subject=msg.subject, body=msg.body,
        is_read=msg.is_read, created_at=msg.created_at,
    ).model_dump()


@router.get("/templates")
async def get_reply_templates(user: ClientUser = Depends(get_current_user)):
    """Return default reply templates."""
    return [
        ReplyTemplate(
            id="thanks", name="Thank You",
            subject="Thanks for reaching out!",
            body="Hi {name},\n\nThank you for reaching out to us! We've received your inquiry and will get back to you shortly.\n\nBest regards",
        ).model_dump(),
        ReplyTemplate(
            id="availability", name="Availability",
            subject="Our availability",
            body="Hi {name},\n\nThanks for your interest! Here's our current availability:\n\n[Add your availability here]\n\nWould any of these times work for you?",
        ).model_dump(),
        ReplyTemplate(
            id="followup", name="Follow Up",
            subject="Following up on your inquiry",
            body="Hi {name},\n\nI wanted to follow up on your recent inquiry. Do you have any questions I can help with?\n\nLooking forward to hearing from you!",
        ).model_dump(),
        ReplyTemplate(
            id="booking_confirm", name="Booking Confirmation",
            subject="Your appointment is confirmed!",
            body="Hi {name},\n\nGreat news! Your appointment has been confirmed for:\n\nDate: [Date]\nTime: [Time]\n\nPlease let us know if you need to reschedule.\n\nSee you soon!",
        ).model_dump(),
    ]


# ============================================================
# NOTIFICATIONS
# ============================================================

@router.get("/notifications")
async def list_notifications(
    user: ClientUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=50),
    unread_only: bool = Query(default=False),
):
    """List notifications for the client."""
    tid = user.tenant_id
    query = select(Notification).where(Notification.tenant_id == tid)
    count_query = select(func.count()).select_from(Notification).where(Notification.tenant_id == tid)

    if unread_only:
        query = query.where(Notification.is_read == False)
        count_query = count_query.where(Notification.is_read == False)

    total = (await db.execute(count_query)).scalar() or 0
    unread_total = (await db.execute(
        select(func.count()).select_from(Notification).where(
            Notification.tenant_id == tid, Notification.is_read == False
        )
    )).scalar() or 0

    offset = (page - 1) * page_size
    result = await db.execute(
        query.order_by(Notification.created_at.desc()).offset(offset).limit(page_size)
    )

    items = [
        NotificationResponse(
            id=n.id, type=n.type, title=n.title, body=n.body,
            lead_id=n.lead_id, is_read=n.is_read, created_at=n.created_at,
        ).model_dump()
        for n in result.scalars().all()
    ]

    return {
        "items": items,
        "total": total,
        "unread_count": unread_total,
        "page": page,
        "page_size": page_size,
        "pages": math.ceil(total / page_size) if total > 0 else 0,
    }


@router.patch("/notifications/{notification_id}/read")
async def mark_notification_read(
    notification_id: UUID,
    user: ClientUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Notification).where(
            Notification.id == notification_id, Notification.tenant_id == user.tenant_id
        )
    )
    notif = result.scalar_one_or_none()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    notif.is_read = True
    await db.commit()
    return {"id": str(notif.id), "is_read": True}


@router.post("/notifications/mark-all-read")
async def mark_all_notifications_read(
    user: ClientUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import update
    await db.execute(
        update(Notification).where(
            Notification.tenant_id == user.tenant_id,
            Notification.is_read == False,
        ).values(is_read=True)
    )
    await db.commit()
    return {"success": True}


# ============================================================
# ANALYTICS
# ============================================================

@router.get("/analytics", response_model=PortalAnalytics)
async def get_analytics(
    user: ClientUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    days: int = Query(default=30, ge=7, le=365),
):
    """Get detailed analytics for the client's leads."""
    tid = user.tenant_id
    now = datetime.now(timezone.utc)
    start_date = now - timedelta(days=days)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    week_start = now - timedelta(days=now.weekday())
    week_start = week_start.replace(hour=0, minute=0, second=0, microsecond=0)

    # Total leads
    total = (await db.execute(
        select(func.count()).select_from(Lead).where(Lead.tenant_id == tid)
    )).scalar() or 0

    # This month / week
    this_month = (await db.execute(
        select(func.count()).select_from(Lead).where(
            Lead.tenant_id == tid, Lead.created_at >= month_start
        )
    )).scalar() or 0

    this_week = (await db.execute(
        select(func.count()).select_from(Lead).where(
            Lead.tenant_id == tid, Lead.created_at >= week_start
        )
    )).scalar() or 0

    # Status counts
    status_result = await db.execute(
        select(Lead.status, func.count()).where(Lead.tenant_id == tid).group_by(Lead.status)
    )
    status_map = dict(status_result.fetchall())

    new_leads = status_map.get("new", 0)
    contacted = status_map.get("contacted", 0)
    converted = status_map.get("converted", 0)
    lost = status_map.get("lost", 0)

    conversion_rate = round((converted / total) * 100, 1) if total > 0 else 0.0

    # Leads by source
    source_result = await db.execute(
        select(Lead.lead_type, func.count()).where(Lead.tenant_id == tid).group_by(Lead.lead_type)
    )
    leads_by_source = dict(source_result.fetchall())

    # Leads by day (last N days)
    daily_result = await db.execute(
        select(
            func.date_trunc("day", Lead.created_at).label("day"),
            func.count().label("count"),
        ).where(
            Lead.tenant_id == tid, Lead.created_at >= start_date
        ).group_by("day").order_by("day")
    )
    leads_by_day = [
        {"date": row[0].strftime("%Y-%m-%d"), "count": row[1]}
        for row in daily_result.fetchall()
    ]

    # Leads by month (last 12 months)
    twelve_months_ago = now - timedelta(days=365)
    monthly_result = await db.execute(
        select(
            func.date_trunc("month", Lead.created_at).label("month"),
            func.count().label("count"),
        ).where(
            Lead.tenant_id == tid, Lead.created_at >= twelve_months_ago
        ).group_by("month").order_by("month")
    )
    leads_by_month = [
        {"month": row[0].strftime("%Y-%m"), "count": row[1]}
        for row in monthly_result.fetchall()
    ]

    # Average response time (time from lead creation to first client reply)
    avg_response = await db.execute(
        select(
            func.avg(
                func.extract("epoch", Message.created_at) - func.extract("epoch", Lead.created_at)
            )
        ).select_from(Message).join(Lead, Message.lead_id == Lead.id).where(
            Message.tenant_id == tid,
            Lead.tenant_id == tid,
            Message.sender_type == "client",
        )
    )
    avg_seconds = avg_response.scalar()
    avg_response_hours = round(avg_seconds / 3600, 1) if avg_seconds else None

    return PortalAnalytics(
        total_leads=total,
        leads_this_month=this_month,
        leads_this_week=this_week,
        new_leads=new_leads,
        contacted_leads=contacted,
        converted_leads=converted,
        lost_leads=lost,
        conversion_rate=conversion_rate,
        avg_response_time_hours=avg_response_hours,
        leads_by_source=leads_by_source,
        leads_by_day=leads_by_day,
        leads_by_month=leads_by_month,
    )


# ============================================================
# SETTINGS
# ============================================================

@router.patch("/settings")
async def update_settings(
    payload: PortalSettingsUpdate,
    user: ClientUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(user, field, value)
    await db.commit()
    await db.refresh(user)
    return {"success": True}


@router.post("/change-password")
async def change_password(
    payload: PasswordChange,
    user: ClientUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    user.password_hash = hash_password(payload.new_password)
    await db.commit()
    return {"success": True}


# ============================================================
# CONVERSATION INBOX
# ============================================================

@router.get("/conversations")
async def list_conversations(
    user: ClientUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    search: str | None = Query(default=None),
):
    """Unified inbox of all chatbot conversations for this tenant."""
    tid = user.tenant_id

    query = select(Conversation).where(Conversation.tenant_id == tid)
    count_query = select(func.count()).select_from(Conversation).where(Conversation.tenant_id == tid)

    total = (await db.execute(count_query)).scalar() or 0

    offset = (page - 1) * page_size
    result = await db.execute(
        query.order_by(Conversation.updated_at.desc()).offset(offset).limit(page_size)
    )
    conversations = result.scalars().all()

    # Match conversations to leads via session_id
    session_ids = [c.session_id for c in conversations]
    lead_map = {}
    if session_ids:
        lead_result = await db.execute(
            select(Lead).where(Lead.tenant_id == tid, Lead.session_id.in_(session_ids))
        )
        for lead in lead_result.scalars().all():
            if lead.session_id:
                lead_map[lead.session_id] = {
                    "id": str(lead.id), "name": lead.name,
                    "email": lead.email, "status": lead.status,
                }

    items = []
    for c in conversations:
        msgs = c.messages or []
        # Extract visitor info from messages
        last_user_msg = next((m["content"] for m in reversed(msgs) if m.get("role") == "user"), None)
        first_user_msg = next((m["content"] for m in msgs if m.get("role") == "user"), None)

        # Filter by search if provided
        if search:
            search_lower = search.lower()
            all_text = " ".join(m.get("content", "") for m in msgs).lower()
            lead_info = lead_map.get(c.session_id, {})
            lead_name = lead_info.get("name", "").lower() if lead_info else ""
            lead_email = lead_info.get("email", "").lower() if lead_info else ""
            if search_lower not in all_text and search_lower not in lead_name and search_lower not in lead_email:
                continue

        items.append({
            "id": str(c.id),
            "session_id": c.session_id,
            "message_count": c.message_count,
            "last_message": last_user_msg,
            "first_message": first_user_msg,
            "messages": msgs,
            "lead": lead_map.get(c.session_id),
            "visitor_metadata": c.visitor_metadata,
            "created_at": c.created_at.isoformat(),
            "updated_at": c.updated_at.isoformat(),
        })

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": math.ceil(total / page_size) if total > 0 else 0,
    }


@router.get("/conversations/{conversation_id}")
async def get_conversation(
    conversation_id: UUID,
    user: ClientUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single conversation with full message history."""
    result = await db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.tenant_id == user.tenant_id,
        )
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Find linked lead
    lead_info = None
    if conv.session_id:
        lead_result = await db.execute(
            select(Lead).where(
                Lead.tenant_id == user.tenant_id,
                Lead.session_id == conv.session_id,
            )
        )
        lead = lead_result.scalar_one_or_none()
        if lead:
            lead_info = {
                "id": str(lead.id), "name": lead.name,
                "email": lead.email, "phone": lead.phone,
                "status": lead.status, "lead_type": lead.lead_type,
            }

    return {
        "id": str(conv.id),
        "session_id": conv.session_id,
        "message_count": conv.message_count,
        "messages": conv.messages or [],
        "lead": lead_info,
        "visitor_metadata": conv.visitor_metadata,
        "created_at": conv.created_at.isoformat(),
        "updated_at": conv.updated_at.isoformat(),
    }


# ============================================================
# CHATBOT CONFIGURATION
# ============================================================

@router.get("/chatbot-config")
async def get_chatbot_config(
    user: ClientUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the chatbot widget configuration for the tenant."""
    result = await db.execute(select(Tenant).where(Tenant.id == user.tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    config = tenant.widget_config or {}

    # Knowledge base stats
    doc_count = (await db.execute(
        select(func.count()).select_from(Document).where(Document.tenant_id == user.tenant_id)
    )).scalar() or 0

    unique_sources = (await db.execute(
        select(func.count(func.distinct(Document.source_url))).where(Document.tenant_id == user.tenant_id)
    )).scalar() or 0

    return {
        "config": config,
        "tenant_name": tenant.name,
        "domain": tenant.domain,
        "knowledge_base": {
            "total_chunks": doc_count,
            "unique_sources": unique_sources,
        },
    }


@router.patch("/chatbot-config")
async def update_chatbot_config(
    payload: dict,
    user: ClientUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update chatbot widget configuration. Clients can change appearance/behavior."""
    result = await db.execute(select(Tenant).where(Tenant.id == user.tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    # Only allow certain fields to be updated by clients
    ALLOWED_FIELDS = {
        "primary_color", "accent_color", "background_color", "text_color",
        "font_family", "border_radius", "theme", "position",
        "launcher_icon", "launcher_icon_url", "launcher_size",
        "window_width", "window_height",
        "bot_name", "bot_avatar_url", "header_text", "welcome_message",
        "placeholder_text", "show_powered_by",
        "auto_open", "auto_open_delay_ms", "persist_conversations",
        "show_sources", "max_message_length",
        "enable_lead_capture", "lead_cta_text", "lead_form_title",
        "lead_form_subtitle", "lead_form_fields", "lead_success_message",
        "suggested_questions",
    }

    current_config = dict(tenant.widget_config or {})
    for key, value in payload.items():
        if key in ALLOWED_FIELDS:
            current_config[key] = value

    tenant.widget_config = current_config
    await db.commit()
    await db.refresh(tenant)

    return {"success": True, "config": tenant.widget_config}


# ============================================================
# ENHANCED ANALYTICS
# ============================================================

@router.get("/analytics/conversations")
async def get_conversation_analytics(
    user: ClientUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    days: int = Query(default=30, ge=7, le=365),
):
    """Conversation-level analytics: volume, engagement, common questions."""
    tid = user.tenant_id
    now = datetime.now(timezone.utc)
    start_date = now - timedelta(days=days)

    # Total conversations
    total_convos = (await db.execute(
        select(func.count()).select_from(Conversation).where(Conversation.tenant_id == tid)
    )).scalar() or 0

    # Conversations in period
    period_convos = (await db.execute(
        select(func.count()).select_from(Conversation).where(
            Conversation.tenant_id == tid, Conversation.created_at >= start_date
        )
    )).scalar() or 0

    # Avg messages per conversation
    avg_msgs = (await db.execute(
        select(func.avg(Conversation.message_count)).where(
            Conversation.tenant_id == tid, Conversation.created_at >= start_date
        )
    )).scalar()

    # Conversations by day
    daily_result = await db.execute(
        select(
            func.date_trunc("day", Conversation.created_at).label("day"),
            func.count().label("count"),
        ).where(
            Conversation.tenant_id == tid, Conversation.created_at >= start_date
        ).group_by("day").order_by("day")
    )
    convos_by_day = [
        {"date": row[0].strftime("%Y-%m-%d"), "count": row[1]}
        for row in daily_result.fetchall()
    ]

    # Extract common user questions from recent conversations
    recent_convos = await db.execute(
        select(Conversation.messages).where(
            Conversation.tenant_id == tid,
            Conversation.created_at >= start_date,
        ).order_by(Conversation.updated_at.desc()).limit(100)
    )
    question_counts: dict[str, int] = {}
    total_user_messages = 0
    for row in recent_convos.fetchall():
        msgs = row[0] or []
        for msg in msgs:
            if msg.get("role") == "user":
                total_user_messages += 1
                content = msg["content"].strip().lower()[:100]
                # Simple grouping by first 50 chars
                key = content[:50]
                question_counts[key] = question_counts.get(key, 0) + 1

    # Top questions sorted by frequency
    top_questions = sorted(question_counts.items(), key=lambda x: -x[1])[:15]

    # Lead conversion from conversations
    convos_with_leads = (await db.execute(
        select(func.count(func.distinct(Lead.session_id))).where(
            Lead.tenant_id == tid, Lead.session_id.isnot(None)
        )
    )).scalar() or 0

    conversion_to_lead = round((convos_with_leads / total_convos) * 100, 1) if total_convos > 0 else 0

    return {
        "total_conversations": total_convos,
        "conversations_in_period": period_convos,
        "avg_messages_per_conversation": round(avg_msgs or 0, 1),
        "total_user_messages": total_user_messages,
        "conversations_by_day": convos_by_day,
        "top_questions": [{"question": q, "count": c} for q, c in top_questions],
        "conversations_with_leads": convos_with_leads,
        "conversation_to_lead_rate": conversion_to_lead,
    }


@router.get("/analytics/engagement")
async def get_engagement_analytics(
    user: ClientUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    days: int = Query(default=30, ge=7, le=365),
):
    """Engagement insights: source attribution, lead quality."""
    tid = user.tenant_id
    now = datetime.now(timezone.utc)
    start_date = now - timedelta(days=days)

    # Leads by source/type
    source_result = await db.execute(
        select(Lead.lead_type, func.count()).where(
            Lead.tenant_id == tid, Lead.created_at >= start_date
        ).group_by(Lead.lead_type)
    )
    leads_by_source = dict(source_result.fetchall())

    # Lead status flow (how many move through the funnel)
    status_result = await db.execute(
        select(Lead.status, func.count()).where(
            Lead.tenant_id == tid, Lead.created_at >= start_date
        ).group_by(Lead.status)
    )
    status_breakdown = dict(status_result.fetchall())

    # Response metrics: how many leads have been replied to
    total_leads_period = sum(status_breakdown.values())
    leads_with_replies = (await db.execute(
        select(func.count(func.distinct(Message.lead_id))).where(
            Message.tenant_id == tid,
            Message.sender_type == "client",
            Message.created_at >= start_date,
        )
    )).scalar() or 0

    response_rate = round((leads_with_replies / total_leads_period) * 100, 1) if total_leads_period > 0 else 0

    # Time-to-first-response distribution
    first_responses = await db.execute(
        select(
            func.min(Message.created_at).label("first_reply"),
            Lead.created_at.label("lead_created"),
        ).select_from(Message).join(Lead, Message.lead_id == Lead.id).where(
            Message.tenant_id == tid,
            Lead.tenant_id == tid,
            Message.sender_type == "client",
            Lead.created_at >= start_date,
        ).group_by(Lead.id, Lead.created_at)
    )

    response_times = []
    for row in first_responses.fetchall():
        diff_hours = (row[0] - row[1]).total_seconds() / 3600
        response_times.append(diff_hours)

    response_time_distribution = {
        "under_1h": sum(1 for t in response_times if t < 1),
        "1h_to_4h": sum(1 for t in response_times if 1 <= t < 4),
        "4h_to_24h": sum(1 for t in response_times if 4 <= t < 24),
        "over_24h": sum(1 for t in response_times if t >= 24),
    }

    # Weekly trend
    weekly_result = await db.execute(
        select(
            func.date_trunc("week", Lead.created_at).label("week"),
            func.count().label("count"),
        ).where(
            Lead.tenant_id == tid, Lead.created_at >= start_date
        ).group_by("week").order_by("week")
    )
    weekly_trend = [
        {"week": row[0].strftime("%Y-%m-%d"), "count": row[1]}
        for row in weekly_result.fetchall()
    ]

    return {
        "leads_by_source": leads_by_source,
        "status_breakdown": status_breakdown,
        "total_leads_in_period": total_leads_period,
        "leads_with_replies": leads_with_replies,
        "response_rate": response_rate,
        "response_time_distribution": response_time_distribution,
        "avg_response_time_hours": round(sum(response_times) / len(response_times), 1) if response_times else None,
        "weekly_trend": weekly_trend,
    }


# ============================================================
# HELPERS
# ============================================================

async def _get_lead_or_404(db: AsyncSession, lead_id: UUID, tenant_id: UUID) -> Lead:
    result = await db.execute(
        select(Lead).where(Lead.id == lead_id, Lead.tenant_id == tenant_id)
    )
    lead = result.scalar_one_or_none()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    return lead


async def create_lead_notification(
    db: AsyncSession, tenant_id: UUID, lead: Lead
):
    """Create an in-app notification when a new lead comes in."""
    notif = Notification(
        tenant_id=tenant_id,
        type="new_lead",
        title=f"New {lead.lead_type} lead",
        body=f"{lead.name} ({lead.email}) submitted a {lead.lead_type} request",
        lead_id=lead.id,
    )
    db.add(notif)
