const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function getToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("wc_portal_token") || "";
}

export function setToken(token: string) {
  localStorage.setItem("wc_portal_token", token);
}

export function clearToken() {
  localStorage.removeItem("wc_portal_token");
  localStorage.removeItem("wc_portal_user");
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

export function getStoredUser(): PortalUser | null {
  if (typeof window === "undefined") return null;
  const s = localStorage.getItem("wc_portal_user");
  return s ? JSON.parse(s) : null;
}

export function setStoredUser(user: PortalUser) {
  localStorage.setItem("wc_portal_user", JSON.stringify(user));
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  const token = getToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401 || res.status === 403) {
    clearToken();
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
    throw new Error("Unauthorized");
  }

  if (res.status === 204) return null as T;

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = body.detail;
    const message =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail.map((e: { msg?: string }) => e.msg || JSON.stringify(e)).join("; ")
          : `Request failed: ${res.status}`;
    throw new Error(message);
  }

  return res.json();
}

// --- Types ---

export interface PortalUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
  tenant_id: string;
  tenant_name: string | null;
  notify_email: boolean;
  notify_sms: boolean;
  digest_frequency: string;
  phone: string | null;
}

export interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  message: string | null;
  lead_type: string;
  status: string;
  source: string | null;
  session_id: string | null;
  created_at: string;
  unread_count: number;
}

export interface LeadDetail extends Lead {
  conversation_messages: Message[];
  chatbot_conversation: { role: string; content: string }[] | null;
}

export interface Message {
  id: string;
  lead_id: string;
  sender_type: string;
  sender_name: string | null;
  channel: string;
  subject: string | null;
  body: string;
  is_read: boolean;
  created_at: string;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  lead_id: string | null;
  is_read: boolean;
  created_at: string;
}

export interface DashboardData {
  total_leads: number;
  leads_this_month: number;
  leads_this_week: number;
  new_leads: number;
  status_breakdown: Record<string, number>;
  conversion_rate: number;
  unread_notifications: number;
  recent_leads: { id: string; name: string; email: string; lead_type: string; status: string; created_at: string }[];
}

export interface Analytics {
  total_leads: number;
  leads_this_month: number;
  leads_this_week: number;
  new_leads: number;
  contacted_leads: number;
  converted_leads: number;
  lost_leads: number;
  conversion_rate: number;
  avg_response_time_hours: number | null;
  leads_by_source: Record<string, number>;
  leads_by_day: { date: string; count: number }[];
  leads_by_month: { month: string; count: number }[];
}

export interface ReplyTemplate {
  id: string;
  name: string;
  subject: string | null;
  body: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

// --- Auth ---

export async function login(email: string, password: string) {
  const res = await request<{ access_token: string; user: PortalUser }>(
    "/api/v1/portal/login",
    { method: "POST", body: JSON.stringify({ email, password }) }
  );
  setToken(res.access_token);
  setStoredUser(res.user);
  return res;
}

export const getProfile = () => request<PortalUser>("/api/v1/portal/me");

// --- Dashboard ---

export const getDashboard = () => request<DashboardData>("/api/v1/portal/dashboard");

// --- Leads ---

export function listLeads(params: {
  page?: number;
  page_size?: number;
  status?: string;
  source?: string;
  search?: string;
  date_from?: string;
  date_to?: string;
  sort_by?: string;
  sort_order?: string;
} = {}) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== "") q.set(k, String(v));
  });
  return request<PaginatedResponse<Lead>>(`/api/v1/portal/leads?${q}`);
}

export const getLeadDetail = (id: string) =>
  request<LeadDetail>(`/api/v1/portal/leads/${id}`);

export const updateLeadStatus = (id: string, status: string) =>
  request<{ id: string; status: string }>(`/api/v1/portal/leads/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });

export const replyToLead = (id: string, body: string, channel = "email", subject?: string) =>
  request<Message>(`/api/v1/portal/leads/${id}/reply`, {
    method: "POST",
    body: JSON.stringify({ body, channel, subject }),
  });

// --- Templates ---

export const getTemplates = () => request<ReplyTemplate[]>("/api/v1/portal/templates");

// --- Notifications ---

export function listNotifications(page = 1, unreadOnly = false) {
  return request<PaginatedResponse<Notification> & { unread_count: number }>(
    `/api/v1/portal/notifications?page=${page}&unread_only=${unreadOnly}`
  );
}

export const markNotificationRead = (id: string) =>
  request<{ id: string; is_read: boolean }>(`/api/v1/portal/notifications/${id}/read`, {
    method: "PATCH",
  });

export const markAllNotificationsRead = () =>
  request<{ success: boolean }>("/api/v1/portal/notifications/mark-all-read", {
    method: "POST",
  });

// --- Analytics ---

export const getAnalytics = (days = 30) =>
  request<Analytics>(`/api/v1/portal/analytics?days=${days}`);

// --- Conversation Analytics ---

export interface ConversationAnalytics {
  total_conversations: number;
  conversations_in_period: number;
  avg_messages_per_conversation: number;
  total_user_messages: number;
  conversations_by_day: { date: string; count: number }[];
  top_questions: { question: string; count: number }[];
  conversations_with_leads: number;
  conversation_to_lead_rate: number;
}

export interface EngagementAnalytics {
  leads_by_source: Record<string, number>;
  status_breakdown: Record<string, number>;
  total_leads_in_period: number;
  leads_with_replies: number;
  response_rate: number;
  response_time_distribution: Record<string, number>;
  avg_response_time_hours: number | null;
  weekly_trend: { week: string; count: number }[];
}

export const getConversationAnalytics = (days = 30) =>
  request<ConversationAnalytics>(`/api/v1/portal/analytics/conversations?days=${days}`);

export const getEngagementAnalytics = (days = 30) =>
  request<EngagementAnalytics>(`/api/v1/portal/analytics/engagement?days=${days}`);

// --- Conversations (Inbox) ---

export interface ConversationItem {
  id: string;
  session_id: string;
  message_count: number;
  last_message: string | null;
  first_message: string | null;
  messages: { role: string; content: string }[];
  lead: { id: string; name: string; email: string; status: string } | null;
  visitor_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export function listConversations(page = 1, pageSize = 20, search?: string) {
  const q = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  if (search) q.set("search", search);
  return request<PaginatedResponse<ConversationItem>>(`/api/v1/portal/conversations?${q}`);
}

export const getConversation = (id: string) =>
  request<ConversationItem>(`/api/v1/portal/conversations/${id}`);

// --- Chatbot Configuration ---

export interface ChatbotConfig {
  config: Record<string, unknown>;
  tenant_name: string;
  domain: string;
  knowledge_base: {
    total_chunks: number;
    unique_sources: number;
  };
}

export const getChatbotConfig = () =>
  request<ChatbotConfig>("/api/v1/portal/chatbot-config");

export const updateChatbotConfig = (data: Record<string, unknown>) =>
  request<{ success: boolean; config: Record<string, unknown> }>("/api/v1/portal/chatbot-config", {
    method: "PATCH",
    body: JSON.stringify(data),
  });

// --- Settings ---

export const updateSettings = (data: Record<string, unknown>) =>
  request<{ success: boolean }>("/api/v1/portal/settings", {
    method: "PATCH",
    body: JSON.stringify(data),
  });

export const changePassword = (currentPassword: string, newPassword: string) =>
  request<{ success: boolean }>("/api/v1/portal/change-password", {
    method: "POST",
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
