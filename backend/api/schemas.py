import re
from pydantic import BaseModel, Field, field_validator
from typing import Literal
from uuid import UUID
from datetime import datetime


# --- Validators ---

HEX_COLOR_RE = re.compile(r"^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")


def validate_hex_color(v: str) -> str:
    if not HEX_COLOR_RE.match(v):
        raise ValueError(f"Invalid hex color: {v}")
    return v


# --- Widget config (structured, not a loose dict) ---

class WidgetConfig(BaseModel):
    # Appearance
    primary_color: str = "#2563eb"
    accent_color: str = "#1e40af"
    background_color: str = "#ffffff"
    text_color: str = "#1a1a1a"
    font_family: str = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    border_radius: Literal["none", "small", "medium", "large"] = "large"
    theme: Literal["light", "dark", "auto"] = "light"
    position: Literal["bottom-right", "bottom-left", "top-right", "top-left"] = "bottom-right"

    # Launcher button
    launcher_icon: Literal["chat", "question", "support", "custom"] = "chat"
    launcher_icon_url: str | None = None  # used when launcher_icon is "custom"
    launcher_size: int = Field(default=60, ge=40, le=80)

    # Chat window
    window_width: int = Field(default=380, ge=300, le=500)
    window_height: int = Field(default=540, ge=400, le=700)

    # Branding
    bot_name: str = "Assistant"
    bot_avatar_url: str | None = None
    header_text: str = "Chat with us"
    welcome_message: str = ""
    placeholder_text: str = "Type a message..."
    show_powered_by: bool = True

    # Behavior
    auto_open: bool = False
    auto_open_delay_ms: int = Field(default=3000, ge=0, le=30000)
    persist_conversations: bool = True
    show_sources: bool = False
    max_message_length: int = Field(default=500, ge=100, le=2000)

    # Lead capture / CTA
    enable_lead_capture: bool = True
    lead_cta_text: str = "Book a Free Demo"
    lead_form_title: str = "Get Your Free Demo"
    lead_form_subtitle: str = "Fill in your details and we'll get back to you shortly."
    lead_form_fields: list[str] = ["name", "email", "phone", "message"]  # which fields to show
    lead_success_message: str = "Thanks! We'll be in touch soon."
    suggested_questions: list[str] = []  # e.g. ["What services do you offer?", "What are your hours?"]

    @field_validator("primary_color", "accent_color", "background_color", "text_color")
    @classmethod
    def check_hex_color(cls, v: str) -> str:
        return validate_hex_color(v)


# --- Chat ---

class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    session_id: str = Field(..., min_length=1, max_length=64)


class ChatResponse(BaseModel):
    reply: str
    session_id: str
    sources: list[str] = []


# --- Tenant / Admin ---

class TenantCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    domain: str = Field(..., min_length=1, max_length=255)
    widget_config: WidgetConfig = WidgetConfig()
    max_conversations_per_month: int = Field(default=500, ge=0)
    subscription_tier: Literal["free", "starter", "pro", "enterprise"] = "free"
    contact_email: str | None = None


class TenantResponse(BaseModel):
    id: UUID
    name: str
    domain: str
    api_key_prefix: str
    widget_config: dict
    is_active: bool
    max_conversations_per_month: int
    subscription_tier: str
    contact_email: str | None
    conversations_this_month: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TenantCreateResponse(BaseModel):
    tenant: TenantResponse
    api_key: str  # Only returned on creation


class TenantUpdate(BaseModel):
    name: str | None = None
    domain: str | None = None
    widget_config: WidgetConfig | None = None
    is_active: bool | None = None
    max_conversations_per_month: int | None = None
    subscription_tier: Literal["free", "starter", "pro", "enterprise"] | None = None
    contact_email: str | None = None


# --- API Key management ---

class ApiKeyRotateResponse(BaseModel):
    api_key: str
    api_key_prefix: str
    message: str = "Old key is now invalid. Save this new key -- it won't be shown again."


# --- Ingestion ---

class IngestRequest(BaseModel):
    url: str = Field(..., min_length=1)
    max_pages: int = Field(default=50, ge=1, le=200)
    clear_existing: bool = True


class IngestTextRequest(BaseModel):
    """Ingest raw text directly instead of scraping a URL."""
    text: str = Field(..., min_length=1, max_length=500000)
    title: str = Field(default="Manual entry", max_length=512)
    source_label: str = Field(default="manual", max_length=255)
    clear_existing: bool = False


class IngestResponse(BaseModel):
    status: str
    pages_scraped: int
    chunks_stored: int
    sources: list[str] = []
    error: str | None = None


# --- Analytics ---

class TenantStats(BaseModel):
    tenant_id: str
    tenant_name: str
    document_chunks: int
    total_conversations: int
    total_messages: int
    conversations_this_month: int
    usage_percent: float  # conversations_this_month / max * 100


# --- Widget Config (public endpoint response) ---

class WidgetConfigResponse(BaseModel):
    tenant_name: str
    # Appearance
    primary_color: str
    accent_color: str
    background_color: str
    text_color: str
    font_family: str
    border_radius: str
    theme: str
    position: str
    # Launcher
    launcher_icon: str
    launcher_icon_url: str | None
    launcher_size: int
    # Window
    window_width: int
    window_height: int
    # Branding
    bot_name: str
    bot_avatar_url: str | None
    header_text: str
    welcome_message: str
    placeholder_text: str
    show_powered_by: bool
    # Behavior
    auto_open: bool
    auto_open_delay_ms: int
    persist_conversations: bool
    show_sources: bool
    max_message_length: int
    # Lead capture
    enable_lead_capture: bool
    lead_cta_text: str
    lead_form_title: str
    lead_form_subtitle: str
    lead_form_fields: list[str]
    lead_success_message: str
    suggested_questions: list[str]


# --- Pagination ---

class PaginatedResponse(BaseModel):
    items: list
    total: int
    page: int
    page_size: int
    pages: int


# --- Lead Capture ---

class LeadCaptureRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    email: str = Field(..., min_length=3, max_length=255)
    phone: str | None = Field(default=None, max_length=50)
    company: str | None = Field(default=None, max_length=255)
    message: str | None = Field(default=None, max_length=2000)
    lead_type: Literal["demo", "booking", "contact"] = "demo"
    session_id: str | None = Field(default=None, max_length=64)


class LeadCaptureResponse(BaseModel):
    success: bool
    message: str


# --- Error ---

class ErrorResponse(BaseModel):
    detail: str
    code: str | None = None
