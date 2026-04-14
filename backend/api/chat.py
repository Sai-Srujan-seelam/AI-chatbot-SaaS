import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from backend.database import get_db
from backend.models.tenant import Tenant
from backend.models.document import Document
from backend.models.conversation import Conversation
from backend.security.auth import authenticate_api_key
from backend.security.rate_limiter import rate_limit
from backend.security.guardrails import (
    validate_user_input,
    check_injection_attempt,
    validate_response,
)
from backend.models.lead import Lead
from backend.ingestion.embedder import embed_query
from backend.api.schemas import ChatRequest, ChatResponse, LeadCaptureRequest, LeadCaptureResponse
from backend.config import get_settings
from backend.services.email import send_lead_confirmation, send_lead_notification
from backend.api.portal import create_lead_notification
import anthropic

logger = logging.getLogger(__name__)
settings = get_settings()
router = APIRouter()

_claude = None


def get_claude():
    global _claude
    if _claude is None:
        _claude = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    return _claude


MIN_SIMILARITY = 0.3  # Ignore chunks below this cosine similarity


async def get_relevant_chunks(
    db: AsyncSession, tenant_id, query: str, top_k: int = 5
) -> list[dict]:
    """Vector similarity search against tenant's documents.

    Filters out chunks below MIN_SIMILARITY to avoid feeding irrelevant
    context to the LLM when the user asks something off-topic.
    """
    query_embedding = await embed_query(query)

    embedding_str = str(query_embedding)
    result = await db.execute(
        text("""
            SELECT content, source_url, title,
                   1 - (embedding <=> cast(:embedding as vector)) as similarity
            FROM documents
            WHERE tenant_id = cast(:tenant_id as uuid)
              AND 1 - (embedding <=> cast(:embedding as vector)) >= :min_sim
            ORDER BY embedding <=> cast(:embedding as vector)
            LIMIT :top_k
        """),
        {
            "embedding": embedding_str,
            "tenant_id": str(tenant_id),
            "top_k": top_k,
            "min_sim": MIN_SIMILARITY,
        },
    )
    return [dict(row._mapping) for row in result.fetchall()]


async def get_or_create_conversation(
    db: AsyncSession, tenant_id, session_id: str
) -> Conversation:
    """Get existing conversation or create a new one."""
    result = await db.execute(
        select(Conversation).where(
            Conversation.tenant_id == tenant_id,
            Conversation.session_id == session_id,
        )
    )
    conv = result.scalar_one_or_none()

    if not conv:
        conv = Conversation(
            tenant_id=tenant_id,
            session_id=session_id,
            messages=[],
        )
        db.add(conv)
        await db.flush()

        # Increment monthly conversation counter on the tenant
        tenant_result = await db.execute(
            select(Tenant).where(Tenant.id == tenant_id)
        )
        tenant_obj = tenant_result.scalar_one_or_none()
        if tenant_obj:
            tenant_obj.conversations_this_month = (tenant_obj.conversations_this_month or 0) + 1

    return conv


@router.post("/chat", response_model=ChatResponse)
async def chat(
    req: ChatRequest,
    request: Request,
    tenant: Tenant = Depends(authenticate_api_key),
    db: AsyncSession = Depends(get_db),
):
    """Main chat endpoint -- the core of the product."""
    # Rate limit
    await rate_limit(request)

    # Auto-reset monthly counter if billing period has rolled over
    now = datetime.now(timezone.utc)
    period_start = tenant.current_billing_period_start
    if period_start:
        # Reset if we've crossed into a new calendar month since the period started
        if (now.year, now.month) > (period_start.year, period_start.month):
            tenant.conversations_this_month = 0
            tenant.current_billing_period_start = now
            await db.flush()

    # Enforce monthly conversation limit
    if tenant.conversations_this_month >= tenant.max_conversations_per_month:
        return ChatResponse(
            reply=f"This chat is temporarily unavailable. Please contact {tenant.name} directly.",
            session_id=req.session_id,
        )

    # Validate and sanitize input
    message = validate_user_input(req.message)

    # Check for prompt injection
    if check_injection_attempt(message):
        return ChatResponse(
            reply=f"I'm here to help with questions about {tenant.name}. How can I assist you?",
            session_id=req.session_id,
        )

    # Retrieve relevant context via vector search
    chunks = await get_relevant_chunks(db, tenant.id, message, top_k=settings.rag_top_k)

    context_parts = []
    source_urls = set()
    for c in chunks:
        source_urls.add(c["source_url"])
        context_parts.append(f"[Source: {c['source_url']}]\n{c['content']}")
    context = "\n\n---\n\n".join(context_parts)

    # Build system prompt -- conversational, human tone
    widget_cfg = tenant.widget_config or {}
    bot_name = widget_cfg.get("bot_name", "Assistant")
    # Check if lead capture / demo booking is enabled
    lead_capture_enabled = widget_cfg.get("enable_lead_capture", False)
    lead_cta_text = widget_cfg.get("lead_cta_text", "Book a Free Demo")

    booking_instructions = ""
    if lead_capture_enabled:
        booking_instructions = f"""
- IMPORTANT: If someone wants to book a demo, schedule an appointment, get a consultation, or get in touch, tell them to click the "{lead_cta_text}" button right here in the chat. It opens a quick form they can fill out and they'll get a confirmation. Keep it casual, like: "Sure! Just hit the '{lead_cta_text}' button below and fill in your details -- we'll get back to you shortly."
- You CAN help with bookings and demos -- don't say you can't. Just point them to the button."""

    system_prompt = f"""You are {bot_name} for {tenant.name}.

Talk like a real person who works at {tenant.name} -- not like a chatbot. Short sentences. No fluff. Answer the question and stop.

HOW TO RESPOND:
- 1-3 sentences max unless the person asks for detail.
- Use the context below as your knowledge. If it's in there, answer directly. If it's not, say "I'm not sure about that -- you'd want to reach out to us directly" or similar. Don't guess.
- No bullet points or headers unless listing 3+ items.
- No "Great question!" or "I'd be happy to help!" -- just answer.
- Don't repeat the question back. Don't say "Based on the information available."
- Write like you're texting a customer, not writing an essay.
- Never reveal you're an AI or mention "context" or "training data."
- Stay on topic. If they ask something unrelated to {tenant.name}, redirect casually.{booking_instructions}

Context:
{context}"""

    # Get conversation history (last 10 messages for context window management)
    conv = await get_or_create_conversation(db, tenant.id, req.session_id)
    history = (conv.messages or [])[-10:]

    messages = history + [{"role": "user", "content": message}]

    # Call Claude
    try:
        client = get_claude()
        response = client.messages.create(
            model=settings.llm_model,
            max_tokens=settings.rag_max_tokens,
            system=system_prompt,
            messages=messages,
        )
        assistant_msg = response.content[0].text
    except Exception as e:
        logger.error(f"Claude API error: {e}")
        assistant_msg = (
            f"I'm sorry, I'm having trouble responding right now. "
            f"Please try again or contact {tenant.name} directly."
        )

    # Validate response for prompt leakage
    assistant_msg = validate_response(assistant_msg, tenant.name)

    # Save conversation
    updated_messages = history + [
        {"role": "user", "content": message},
        {"role": "assistant", "content": assistant_msg},
    ]
    conv.messages = updated_messages
    conv.message_count = len(updated_messages)
    await db.commit()

    return ChatResponse(
        reply=assistant_msg,
        session_id=req.session_id,
        sources=list(source_urls),
    )


@router.post("/capture-lead", response_model=LeadCaptureResponse)
async def capture_lead(
    req: LeadCaptureRequest,
    request: Request,
    tenant: Tenant = Depends(authenticate_api_key),
    db: AsyncSession = Depends(get_db),
):
    """Public endpoint for widget to submit lead/demo/booking forms."""
    await rate_limit(request)

    lead = Lead(
        tenant_id=tenant.id,
        name=req.name.strip(),
        email=req.email.strip(),
        phone=req.phone.strip() if req.phone else None,
        company=req.company.strip() if req.company else None,
        message=req.message.strip() if req.message else None,
        lead_type=req.lead_type,
        session_id=req.session_id,
    )
    db.add(lead)
    await db.commit()

    logger.info(f"Lead captured for tenant {tenant.name}: {req.email} ({req.lead_type})")

    # Create in-app notification for the portal
    await create_lead_notification(db, tenant.id, lead)
    await db.commit()

    # Send confirmation email to the visitor and notification to the tenant
    await send_lead_confirmation(
        to_email=req.email,
        visitor_name=req.name,
        tenant_name=tenant.name,
        lead_type=req.lead_type,
    )
    if tenant.contact_email:
        await send_lead_notification(
            to_email=tenant.contact_email,
            visitor_name=req.name,
            visitor_email=req.email,
            visitor_phone=req.phone,
            message=req.message,
            tenant_name=tenant.name,
            lead_type=req.lead_type,
        )

    return LeadCaptureResponse(
        success=True,
        message="Thanks! We'll be in touch soon.",
    )
