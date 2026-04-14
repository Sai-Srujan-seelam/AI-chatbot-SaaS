"""Pydantic schemas for the client portal API."""

from pydantic import BaseModel, Field
from typing import Literal
from uuid import UUID
from datetime import datetime


# --- Auth ---

class PortalLogin(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=1, max_length=255)


class PortalLoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "PortalUserResponse"


class PortalUserResponse(BaseModel):
    id: UUID
    email: str
    full_name: str
    role: str
    tenant_id: UUID
    tenant_name: str | None = None
    notify_email: bool
    notify_sms: bool
    digest_frequency: str
    phone: str | None

    model_config = {"from_attributes": True}


# --- Leads ---

class LeadListItem(BaseModel):
    id: UUID
    name: str
    email: str
    phone: str | None
    company: str | None
    message: str | None
    lead_type: str
    status: str
    source: str | None = None  # derived from lead_type or session
    session_id: str | None
    created_at: datetime
    unread_count: int = 0


class LeadDetail(LeadListItem):
    conversation_messages: list["MessageResponse"] = []
    chatbot_conversation: list[dict] | None = None  # original chatbot convo


class LeadStatusUpdate(BaseModel):
    status: Literal["new", "contacted", "converted", "lost"]


# --- Messages (replies) ---

class MessageCreate(BaseModel):
    body: str = Field(..., min_length=1, max_length=5000)
    channel: Literal["email", "sms", "internal"] = "email"
    subject: str | None = Field(default=None, max_length=500)


class MessageResponse(BaseModel):
    id: UUID
    lead_id: UUID
    sender_type: str
    sender_name: str | None = None
    channel: str
    subject: str | None
    body: str
    is_read: bool
    created_at: datetime


# --- Notifications ---

class NotificationResponse(BaseModel):
    id: UUID
    type: str
    title: str
    body: str
    lead_id: UUID | None
    is_read: bool
    created_at: datetime


# --- Analytics ---

class PortalAnalytics(BaseModel):
    total_leads: int
    leads_this_month: int
    leads_this_week: int
    new_leads: int
    contacted_leads: int
    converted_leads: int
    lost_leads: int
    conversion_rate: float
    avg_response_time_hours: float | None
    leads_by_source: dict[str, int]
    leads_by_day: list[dict]  # [{date: "2024-01-15", count: 5}, ...]
    leads_by_month: list[dict]  # [{month: "2024-01", count: 25}, ...]


# --- Reply Templates ---

class ReplyTemplate(BaseModel):
    id: str
    name: str
    subject: str | None
    body: str


# --- Settings ---

class PortalSettingsUpdate(BaseModel):
    full_name: str | None = None
    phone: str | None = None
    notify_email: bool | None = None
    notify_sms: bool | None = None
    digest_frequency: Literal["none", "daily", "weekly"] | None = None


class PasswordChange(BaseModel):
    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=8, max_length=255)


# --- Admin: Create Portal User ---

class CreatePortalUser(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=8, max_length=255)
    full_name: str = Field(..., min_length=1, max_length=255)
    role: Literal["owner", "manager", "staff"] = "manager"
    phone: str | None = None
