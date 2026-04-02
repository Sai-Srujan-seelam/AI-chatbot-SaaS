const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function getToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("wc_admin_token") || "";
}

export function setToken(token: string) {
  localStorage.setItem("wc_admin_token", token);
}

export function clearToken() {
  localStorage.removeItem("wc_admin_token");
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  const token = getToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

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
    throw new Error(body.detail || `Request failed: ${res.status}`);
  }

  return res.json();
}

// --- Health ---
export const health = () => request<{ status: string; version: string; database: string }>("/health");

// --- Tenants ---
export interface Tenant {
  id: string;
  name: string;
  domain: string;
  api_key_prefix: string;
  widget_config: Record<string, unknown>;
  is_active: boolean;
  max_conversations_per_month: number;
  subscription_tier: string;
  contact_email: string | null;
  conversations_this_month: number;
  created_at: string;
  updated_at: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export const listTenants = (page = 1, pageSize = 20) =>
  request<PaginatedResponse<Tenant>>(`/api/v1/admin/tenants?page=${page}&page_size=${pageSize}`);

export const getTenant = (id: string) =>
  request<Tenant>(`/api/v1/admin/tenants/${id}`);

export const createTenant = (data: {
  name: string;
  domain: string;
  widget_config?: Record<string, unknown>;
  max_conversations_per_month?: number;
  subscription_tier?: string;
  contact_email?: string;
}) =>
  request<{ tenant: Tenant; api_key: string }>("/api/v1/admin/tenants", {
    method: "POST",
    body: JSON.stringify(data),
  });

export const updateTenant = (id: string, data: Record<string, unknown>) =>
  request<Tenant>(`/api/v1/admin/tenants/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });

export const deleteTenant = (id: string) =>
  request<null>(`/api/v1/admin/tenants/${id}`, { method: "DELETE" });

export const rotateApiKey = (id: string) =>
  request<{ api_key: string; api_key_prefix: string; message: string }>(
    `/api/v1/admin/tenants/${id}/rotate-key`,
    { method: "POST" }
  );

// --- Ingestion ---
export const ingestWebsite = (tenantId: string, url: string, maxPages = 50) =>
  request<{
    status: string;
    pages_scraped: number;
    chunks_stored: number;
    sources: string[];
    error: string | null;
  }>(`/api/v1/admin/tenants/${tenantId}/ingest`, {
    method: "POST",
    body: JSON.stringify({ url, max_pages: maxPages, clear_existing: true }),
  });

// --- Documents ---
export const listDocuments = (tenantId: string, page = 1, pageSize = 50) =>
  request<PaginatedResponse<{
    id: string;
    source_url: string;
    title: string;
    chunk_index: number;
    created_at: string;
  }>>(`/api/v1/admin/tenants/${tenantId}/documents?page=${page}&page_size=${pageSize}`);

// --- Conversations ---
export const listConversations = (tenantId: string, page = 1, pageSize = 20) =>
  request<PaginatedResponse<{
    id: string;
    session_id: string;
    message_count: number;
    messages: { role: string; content: string }[];
    created_at: string;
    updated_at: string;
  }>>(`/api/v1/admin/tenants/${tenantId}/conversations?page=${page}&page_size=${pageSize}`);

// --- Stats ---
export interface TenantStats {
  tenant_id: string;
  tenant_name: string;
  document_chunks: number;
  total_conversations: number;
  total_messages: number;
  conversations_this_month: number;
  usage_percent: number;
}

export const getTenantStats = (tenantId: string) =>
  request<TenantStats>(`/api/v1/admin/tenants/${tenantId}/stats`);
