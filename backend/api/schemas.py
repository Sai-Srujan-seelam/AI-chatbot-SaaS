from pydantic import BaseModel, Field, HttpUrl
from uuid import UUID
from datetime import datetime


# --- Chat ---

class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=500)
    session_id: str = Field(..., min_length=1, max_length=64)


class ChatResponse(BaseModel):
    reply: str
    session_id: str
    sources: list[str] = []


# --- Tenant / Admin ---

class TenantCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    domain: str = Field(..., min_length=1, max_length=255)
    widget_config: dict = {}
    max_conversations_per_month: int = 500


class TenantResponse(BaseModel):
    id: UUID
    name: str
    domain: str
    api_key_prefix: str
    widget_config: dict
    is_active: bool
    max_conversations_per_month: int
    created_at: datetime

    model_config = {"from_attributes": True}


class TenantCreateResponse(BaseModel):
    tenant: TenantResponse
    api_key: str  # Only returned on creation


class TenantUpdate(BaseModel):
    name: str | None = None
    domain: str | None = None
    widget_config: dict | None = None
    is_active: bool | None = None
    max_conversations_per_month: int | None = None


# --- Ingestion ---

class IngestRequest(BaseModel):
    url: str = Field(..., min_length=1)
    max_pages: int = Field(default=50, ge=1, le=200)
    clear_existing: bool = True


class IngestResponse(BaseModel):
    status: str
    pages_scraped: int
    chunks_stored: int
    sources: list[str] = []
    error: str | None = None


# --- Widget Config ---

class WidgetConfigResponse(BaseModel):
    tenant_name: str
    primary_color: str
    position: str
    welcome_message: str
    bot_name: str
    header_text: str
