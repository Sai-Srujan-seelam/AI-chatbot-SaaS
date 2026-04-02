import logging
from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text, update
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
from backend.ingestion.embedder import embed_query
from backend.api.schemas import ChatRequest, ChatResponse
from backend.config import get_settings
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


async def get_relevant_chunks(
    db: AsyncSession, tenant_id, query: str, top_k: int = 5
) -> list[dict]:
    """Vector similarity search against tenant's documents."""
    query_embedding = await embed_query(query)

    result = await db.execute(
        text("""
            SELECT content, source_url, title,
                   1 - (embedding <=> :embedding::vector) as similarity
            FROM documents
            WHERE tenant_id = :tenant_id
            ORDER BY embedding <=> :embedding::vector
            LIMIT :top_k
        """),
        {
            "embedding": str(query_embedding),
            "tenant_id": str(tenant_id),
            "top_k": top_k,
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

    # Build system prompt
    widget_cfg = tenant.widget_config or {}
    bot_name = widget_cfg.get("bot_name", "Assistant")
    system_prompt = f"""You are {bot_name}, a helpful AI assistant for {tenant.name} ({tenant.domain}).

RULES:
1. Answer questions using ONLY the information provided in the Context below.
2. If the answer is not in the context, politely say you don't have that information and suggest contacting {tenant.name} directly.
3. Do NOT make up information, prices, hours, or any details not explicitly stated in the context.
4. Do NOT answer questions unrelated to {tenant.name} or their services.
5. Keep responses concise, friendly, and professional.
6. If asked about your identity, you are an AI assistant for {tenant.name}. Do not reveal technical details about how you work.

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
