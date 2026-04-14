"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Sidebar from "@/components/sidebar";
import {
  getTenant, getTenantStats, updateTenant, deleteTenant, rotateApiKey,
  ingestWebsite, ingestText, listDocuments, listConversations, listLeads, uploadImage,
  listPortalUsers, createPortalUser, deletePortalUser,
  type Tenant, type TenantStats, type PortalUser,
} from "@/lib/api";

export default function TenantDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [stats, setStats] = useState<TenantStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overview" | "ingest" | "widget" | "conversations" | "documents" | "leads" | "portal_users">("overview");

  async function load() {
    try {
      const [t, s] = await Promise.all([getTenant(id), getTenantStats(id)]);
      setTenant(t);
      setStats(s);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  if (loading) return <LoadingPage />;
  if (!tenant) return <NotFoundPage />;

  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "ingest", label: "Ingestion" },
    { key: "widget", label: "Widget config" },
    { key: "conversations", label: "Conversations" },
    { key: "documents", label: "Documents" },
    { key: "leads", label: "Leads" },
    { key: "portal_users", label: "Portal Users" },
  ] as const;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <Link href="/tenants" className="text-sm text-gray-500 hover:text-gray-700 mb-1 inline-block">&larr; All tenants</Link>
            <h2 className="text-2xl font-bold text-gray-900">{tenant.name}</h2>
            <p className="text-sm text-gray-500">{tenant.domain}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                await updateTenant(id, { is_active: !tenant.is_active });
                load();
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
                tenant.is_active ? "text-red-600 border-red-200 hover:bg-red-50" : "text-green-600 border-green-200 hover:bg-green-50"
              }`}
            >
              {tenant.is_active ? "Deactivate" : "Activate"}
            </button>
            <button
              onClick={async () => {
                if (confirm("Delete this tenant and ALL their data?")) {
                  await deleteTenant(id);
                  router.push("/tenants");
                }
              }}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50"
            >
              Delete
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="flex gap-6">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                  tab === t.key ? "border-gray-900 text-gray-900" : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab content */}
        {tab === "overview" && <OverviewTab tenant={tenant} stats={stats} onRefresh={load} />}
        {tab === "ingest" && <IngestTab tenantId={id} onRefresh={load} />}
        {tab === "widget" && <WidgetConfigTab tenant={tenant} onRefresh={load} />}
        {tab === "conversations" && <ConversationsTab tenantId={id} />}
        {tab === "documents" && <DocumentsTab tenantId={id} />}
        {tab === "leads" && <LeadsTab tenantId={id} />}
        {tab === "portal_users" && <PortalUsersTab tenantId={id} />}
      </main>
    </div>
  );
}

// --- Overview Tab ---
function OverviewTab({ tenant, stats, onRefresh }: { tenant: Tenant; stats: TenantStats | null; onRefresh: () => void }) {
  const [newKey, setNewKey] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  return (
    <div className="space-y-6">
      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MiniStat label="Conversations" value={stats.total_conversations} />
          <MiniStat label="Messages" value={stats.total_messages} />
          <MiniStat label="Document chunks" value={stats.document_chunks} />
          <MiniStat label="Usage this month" value={`${stats.usage_percent}%`} />
        </div>
      )}

      {/* Tenant info */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h3 className="font-semibold text-gray-900">Details</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div><span className="text-gray-500">Tier:</span> <span className="font-medium ml-2">{tenant.subscription_tier}</span></div>
          <div><span className="text-gray-500">Status:</span> <span className={`font-medium ml-2 ${tenant.is_active ? "text-green-600" : "text-red-500"}`}>{tenant.is_active ? "Active" : "Inactive"}</span></div>
          <div><span className="text-gray-500">Email:</span> <span className="font-medium ml-2">{tenant.contact_email || "-"}</span></div>
          <div><span className="text-gray-500">Limit:</span> <span className="font-medium ml-2">{tenant.conversations_this_month}/{tenant.max_conversations_per_month} convos/mo</span></div>
          <div><span className="text-gray-500">API key:</span> <span className="font-mono text-xs ml-2">{tenant.api_key_prefix}...</span></div>
          <div><span className="text-gray-500">Created:</span> <span className="font-medium ml-2">{new Date(tenant.created_at).toLocaleString()}</span></div>
        </div>
      </div>

      {/* API Key rotation */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-semibold text-gray-900 mb-3">API key</h3>
        {newKey ? (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm text-green-800 mb-1 font-medium">New key generated. Save it now -- it won&apos;t be shown again:</p>
            <code className="block p-2 bg-white rounded text-xs font-mono break-all border">{newKey}</code>
            <button onClick={() => setNewKey(null)} className="mt-2 text-xs text-green-700">Dismiss</button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <code className="px-3 py-1.5 bg-gray-100 rounded text-xs font-mono">{tenant.api_key_prefix}...</code>
            <button
              onClick={async () => {
                if (confirm("Rotate key? The old key will stop working immediately.")) {
                  const res = await rotateApiKey(tenant.id);
                  setNewKey(res.api_key);
                  onRefresh();
                }
              }}
              className="px-3 py-1.5 text-xs font-medium text-orange-600 border border-orange-200 rounded-lg hover:bg-orange-50"
            >
              Rotate key
            </button>
          </div>
        )}
      </div>

      {/* Edit tenant */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900">Edit settings</h3>
          <button onClick={() => setEditing(!editing)} className="text-xs text-blue-600 hover:text-blue-700">
            {editing ? "Cancel" : "Edit"}
          </button>
        </div>
        {editing && <EditForm tenant={tenant} onSaved={() => { setEditing(false); onRefresh(); }} />}
      </div>
    </div>
  );
}

function EditForm({ tenant, onSaved }: { tenant: Tenant; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    try {
      await updateTenant(tenant.id, {
        name: fd.get("name"),
        domain: fd.get("domain"),
        contact_email: fd.get("email") || null,
        subscription_tier: fd.get("tier"),
        max_conversations_per_month: parseInt(fd.get("limit") as string) || 500,
      });
      onSaved();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
      <Input label="Name" name="name" defaultValue={tenant.name} required />
      <Input label="Domain" name="domain" defaultValue={tenant.domain} required />
      <Input label="Contact email" name="email" type="email" defaultValue={tenant.contact_email || ""} />
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Tier</label>
        <select name="tier" defaultValue={tenant.subscription_tier} className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500">
          <option value="free">Free</option>
          <option value="starter">Starter</option>
          <option value="pro">Pro</option>
          <option value="enterprise">Enterprise</option>
        </select>
      </div>
      <Input label="Monthly conversation limit" name="limit" type="number" defaultValue={String(tenant.max_conversations_per_month)} />
      <div className="col-span-2">
        <button type="submit" disabled={saving} className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50">
          {saving ? "Saving..." : "Save changes"}
        </button>
      </div>
    </form>
  );
}

// --- Ingest Tab ---
function IngestTab({ tenantId, onRefresh }: { tenantId: string; onRefresh: () => void }) {
  const [url, setUrl] = useState("");
  const [maxPages, setMaxPages] = useState(50);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ pages_scraped: number; chunks_stored: number; error: string | null } | null>(null);

  async function handleIngest(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const res = await ingestWebsite(tenantId, url, maxPages);
      setResult(res);
      onRefresh();
    } catch (err) {
      setResult({ pages_scraped: 0, chunks_stored: 0, error: err instanceof Error ? err.message : "Ingestion failed" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-semibold text-gray-900 mb-4">Ingest website content</h3>
        <form onSubmit={handleIngest} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Website URL</label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              required
              className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Max pages to crawl</label>
            <input
              type="number"
              value={maxPages}
              onChange={(e) => setMaxPages(parseInt(e.target.value) || 50)}
              min={1}
              max={200}
              className="w-32 px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
          >
            {loading ? "Scraping... (this may take a minute)" : "Start ingestion"}
          </button>
        </form>

        {result && (
          <div className={`mt-4 p-4 rounded-lg border ${result.error ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"}`}>
            {result.error ? (
              <p className="text-sm text-red-700">{result.error}</p>
            ) : (
              <div className="text-sm text-green-700">
                <p>Scraped {result.pages_scraped} pages, stored {result.chunks_stored} chunks.</p>
              </div>
            )}
          </div>
        )}
      </div>

      <TextIngestForm tenantId={tenantId} onRefresh={onRefresh} />
    </div>
  );
}

function TextIngestForm({ tenantId, onRefresh }: { tenantId: string; onRefresh: () => void }) {
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [sourceLabel, setSourceLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ chunks_stored: number; error: string | null } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const res = await ingestText(tenantId, text, title || "Manual entry", sourceLabel || "manual");
      setResult(res);
      if (!res.error) setText("");
      onRefresh();
    } catch (err) {
      setResult({ chunks_stored: 0, error: err instanceof Error ? err.message : "Ingestion failed" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="font-semibold text-gray-900 mb-1">Paste text directly</h3>
      <p className="text-sm text-gray-500 mb-4">For FAQs, product info, policies, or anything not on a website.</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            required
            rows={8}
            placeholder={"Paste your text here. For example:\n\nOur hours are Mon-Fri 9am-5pm.\nWe offer free consultations.\nPricing starts at $99/month..."}
            className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 font-mono"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title (optional)</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. FAQ, Pricing, Hours"
              className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Source label (optional)</label>
            <input
              value={sourceLabel}
              onChange={(e) => setSourceLabel(e.target.value)}
              placeholder="e.g. faq, pricing-page"
              className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={loading || !text.trim()}
          className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
        >
          {loading ? "Processing..." : "Ingest text"}
        </button>
      </form>

      {result && (
        <div className={`mt-4 p-4 rounded-lg border ${result.error ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"}`}>
          {result.error ? (
            <p className="text-sm text-red-700">{result.error}</p>
          ) : (
            <p className="text-sm text-green-700">Stored {result.chunks_stored} chunks from text.</p>
          )}
        </div>
      )}
    </div>
  );
}

// --- Widget Config Tab ---
function WidgetConfigTab({ tenant, onRefresh }: { tenant: Tenant; onRefresh: () => void }) {
  const cfg = tenant.widget_config as Record<string, string | boolean | number>;
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const widgetConfig: Record<string, unknown> = {
      primary_color: fd.get("primary_color"),
      accent_color: fd.get("accent_color"),
      background_color: fd.get("background_color"),
      text_color: fd.get("text_color"),
      theme: fd.get("theme"),
      position: fd.get("position"),
      border_radius: fd.get("border_radius"),
      launcher_icon: fd.get("launcher_icon"),
      launcher_icon_url: fd.get("launcher_icon_url") || null,
      bot_name: fd.get("bot_name"),
      bot_avatar_url: fd.get("bot_avatar_url") || null,
      header_text: fd.get("header_text"),
      welcome_message: fd.get("welcome_message"),
      placeholder_text: fd.get("placeholder_text"),
      show_powered_by: fd.get("show_powered_by") === "on",
      auto_open: fd.get("auto_open") === "on",
      persist_conversations: fd.get("persist_conversations") === "on",
      show_sources: fd.get("show_sources") === "on",
      window_width: parseInt(fd.get("window_width") as string) || 380,
      window_height: parseInt(fd.get("window_height") as string) || 540,
      launcher_size: parseInt(fd.get("launcher_size") as string) || 60,
      max_message_length: parseInt(fd.get("max_message_length") as string) || 500,
      enable_lead_capture: fd.get("enable_lead_capture") === "on",
      lead_cta_text: fd.get("lead_cta_text") || "Book a Free Demo",
      lead_form_title: fd.get("lead_form_title") || "Get Your Free Demo",
      lead_form_subtitle: fd.get("lead_form_subtitle") || "",
      lead_success_message: fd.get("lead_success_message") || "Thanks! We'll be in touch soon.",
      suggested_questions: (fd.get("suggested_questions") as string || "").split("\n").map((s: string) => s.trim()).filter(Boolean),
    };
    try {
      await updateTenant(tenant.id, { widget_config: widgetConfig });
      onRefresh();
      alert("Widget config saved.");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="font-semibold text-gray-900 mb-4">Widget configuration</h3>
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Colors */}
        <fieldset>
          <legend className="text-sm font-medium text-gray-700 mb-3">Colors</legend>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <ColorInput label="Primary" name="primary_color" defaultValue={(cfg.primary_color as string) || "#2563eb"} />
            <ColorInput label="Accent" name="accent_color" defaultValue={(cfg.accent_color as string) || "#1e40af"} />
            <ColorInput label="Background" name="background_color" defaultValue={(cfg.background_color as string) || "#ffffff"} />
            <ColorInput label="Text" name="text_color" defaultValue={(cfg.text_color as string) || "#1a1a1a"} />
          </div>
        </fieldset>

        {/* Appearance */}
        <fieldset>
          <legend className="text-sm font-medium text-gray-700 mb-3">Appearance</legend>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <SelectInput label="Theme" name="theme" defaultValue={(cfg.theme as string) || "light"} options={["light", "dark", "auto"]} />
            <SelectInput label="Position" name="position" defaultValue={(cfg.position as string) || "bottom-right"} options={["bottom-right", "bottom-left", "top-right", "top-left"]} />
            <SelectInput label="Border radius" name="border_radius" defaultValue={(cfg.border_radius as string) || "large"} options={["none", "small", "medium", "large"]} />
            <SelectInput label="Launcher icon" name="launcher_icon" defaultValue={(cfg.launcher_icon as string) || "chat"} options={["chat", "question", "support", "custom"]} />
            <Input label="Launcher size (px)" name="launcher_size" type="number" defaultValue={String(cfg.launcher_size || 60)} />
          </div>
        </fieldset>

        {/* Window */}
        <fieldset>
          <legend className="text-sm font-medium text-gray-700 mb-3">Chat window</legend>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Input label="Width (px)" name="window_width" type="number" defaultValue={String(cfg.window_width || 380)} />
            <Input label="Height (px)" name="window_height" type="number" defaultValue={String(cfg.window_height || 540)} />
            <Input label="Max message length" name="max_message_length" type="number" defaultValue={String(cfg.max_message_length || 500)} />
          </div>
        </fieldset>

        {/* Branding */}
        <fieldset>
          <legend className="text-sm font-medium text-gray-700 mb-3">Branding</legend>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Bot name" name="bot_name" defaultValue={(cfg.bot_name as string) || "Assistant"} />
            <ImageUploadInput label="Bot avatar" name="bot_avatar_url" defaultValue={(cfg.bot_avatar_url as string) || ""} tenantId={tenant.id} />
            <Input label="Header text" name="header_text" defaultValue={(cfg.header_text as string) || "Chat with us"} />
            <Input label="Placeholder text" name="placeholder_text" defaultValue={(cfg.placeholder_text as string) || "Type a message..."} />
            <div className="col-span-2">
              <Input label="Welcome message" name="welcome_message" defaultValue={(cfg.welcome_message as string) || ""} />
            </div>
            <ImageUploadInput label="Custom launcher icon" name="launcher_icon_url" defaultValue={(cfg.launcher_icon_url as string) || ""} tenantId={tenant.id} />
          </div>
        </fieldset>

        {/* Lead capture */}
        <fieldset>
          <legend className="text-sm font-medium text-gray-700 mb-3">Lead capture / CTA</legend>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Toggle label="Enable lead capture (CTA button in chat)" name="enable_lead_capture" defaultChecked={cfg.enable_lead_capture !== false} />
            </div>
            <Input label="CTA button text" name="lead_cta_text" defaultValue={(cfg.lead_cta_text as string) || "Book a Free Demo"} />
            <Input label="Form title" name="lead_form_title" defaultValue={(cfg.lead_form_title as string) || "Get Your Free Demo"} />
            <div className="col-span-2">
              <Input label="Form subtitle" name="lead_form_subtitle" defaultValue={(cfg.lead_form_subtitle as string) || "Fill in your details and we'll get back to you shortly."} />
            </div>
            <div className="col-span-2">
              <Input label="Success message" name="lead_success_message" defaultValue={(cfg.lead_success_message as string) || "Thanks! We'll be in touch soon."} />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Suggested questions (one per line)</label>
              <textarea name="suggested_questions" defaultValue={Array.isArray(cfg.suggested_questions) ? (cfg.suggested_questions as string[]).join("\n") : ""} rows={3} placeholder={"What services do you offer?\nWhat are your hours?\nHow much does it cost?"} className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
        </fieldset>

        {/* Toggles */}
        <fieldset>
          <legend className="text-sm font-medium text-gray-700 mb-3">Behavior</legend>
          <div className="flex flex-wrap gap-6">
            <Toggle label="Show 'Powered by'" name="show_powered_by" defaultChecked={cfg.show_powered_by !== false} />
            <Toggle label="Auto-open" name="auto_open" defaultChecked={!!cfg.auto_open} />
            <Toggle label="Persist conversations" name="persist_conversations" defaultChecked={cfg.persist_conversations !== false} />
            <Toggle label="Show sources" name="show_sources" defaultChecked={!!cfg.show_sources} />
          </div>
        </fieldset>

        <button type="submit" disabled={saving} className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50">
          {saving ? "Saving..." : "Save widget config"}
        </button>
      </form>
    </div>
  );
}

// --- Conversations Tab ---
function ConversationsTab({ tenantId }: { tenantId: string }) {
  const [convos, setConvos] = useState<{ id: string; session_id: string; message_count: number; messages: { role: string; content: string }[]; updated_at: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    listConversations(tenantId, 1, 50)
      .then((res) => setConvos(res.items))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [tenantId]);

  if (loading) return <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900 mx-auto mt-8" />;

  return (
    <div className="space-y-3">
      {convos.length === 0 ? (
        <p className="text-gray-500 text-sm">No conversations yet.</p>
      ) : (
        convos.map((c) => (
          <div key={c.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <button
              onClick={() => setExpanded(expanded === c.id ? null : c.id)}
              className="w-full px-5 py-3 flex items-center justify-between text-left hover:bg-gray-50"
            >
              <div>
                <span className="text-sm font-medium text-gray-900">{c.message_count} messages</span>
                <span className="text-xs text-gray-400 ml-3">Session: {c.session_id.slice(0, 8)}...</span>
              </div>
              <span className="text-xs text-gray-400">{new Date(c.updated_at).toLocaleString()}</span>
            </button>
            {expanded === c.id && (
              <div className="px-5 pb-4 space-y-2 border-t border-gray-100 pt-3">
                {c.messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] px-3 py-2 rounded-lg text-sm ${
                      m.role === "user" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-800"
                    }`}>
                      {m.content}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

// --- Documents Tab ---
function DocumentsTab({ tenantId }: { tenantId: string }) {
  const [docs, setDocs] = useState<{ id: string; source_url: string; title: string; chunk_index: number; created_at: string }[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listDocuments(tenantId, 1, 100)
      .then((res) => { setDocs(res.items); setTotal(res.total); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [tenantId]);

  if (loading) return <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900 mx-auto mt-8" />;

  // Group by source URL
  const grouped: Record<string, typeof docs> = {};
  docs.forEach((d) => {
    if (!grouped[d.source_url]) grouped[d.source_url] = [];
    grouped[d.source_url].push(d);
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">{total} total chunks across {Object.keys(grouped).length} pages</p>
      {Object.entries(grouped).map(([url, chunks]) => (
        <div key={url} className="bg-white rounded-xl border border-gray-200 p-4">
          <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-blue-600 hover:text-blue-700 break-all">
            {url}
          </a>
          <p className="text-xs text-gray-400 mt-1">{chunks.length} chunks / {chunks[0]?.title || "Untitled"}</p>
        </div>
      ))}
      {docs.length === 0 && <p className="text-gray-500 text-sm">No documents ingested yet. Use the Ingestion tab to scrape a website.</p>}
    </div>
  );
}

// --- Leads Tab ---
function LeadsTab({ tenantId }: { tenantId: string }) {
  const [leads, setLeads] = useState<{ id: string; name: string; email: string; phone: string | null; company: string | null; message: string | null; lead_type: string; status: string; created_at: string }[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listLeads(tenantId, 1, 50)
      .then((res) => { setLeads(res.items); setTotal(res.total); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [tenantId]);

  if (loading) return <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900 mx-auto mt-8" />;

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">{total} total leads captured</p>
      {leads.length === 0 ? (
        <p className="text-gray-500 text-sm">No leads captured yet. Leads are collected when visitors fill out the demo/booking form in the chat widget.</p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-medium text-gray-700">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Email</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Phone</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Type</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Date</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{l.name}</td>
                  <td className="px-4 py-3"><a href={`mailto:${l.email}`} className="text-blue-600 hover:text-blue-700">{l.email}</a></td>
                  <td className="px-4 py-3 text-gray-600">{l.phone || "-"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                      l.lead_type === "demo" ? "bg-purple-100 text-purple-700" :
                      l.lead_type === "booking" ? "bg-blue-100 text-blue-700" :
                      "bg-gray-100 text-gray-700"
                    }`}>{l.lead_type}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                      l.status === "new" ? "bg-green-100 text-green-700" :
                      l.status === "contacted" ? "bg-yellow-100 text-yellow-700" :
                      l.status === "converted" ? "bg-blue-100 text-blue-700" :
                      "bg-gray-100 text-gray-700"
                    }`}>{l.status}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{new Date(l.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {leads.length > 0 && leads.some(l => l.message) && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-gray-700">Messages</h4>
          {leads.filter(l => l.message).map(l => (
            <div key={l.id + "-msg"} className="bg-white rounded-lg border border-gray-200 p-4">
              <p className="text-sm font-medium text-gray-900">{l.name} <span className="text-gray-400 font-normal">({l.email})</span></p>
              <p className="text-sm text-gray-600 mt-1">{l.message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Image Upload Input ---
function ImageUploadInput({ label, name, defaultValue, tenantId }: { label: string; name: string; defaultValue: string; tenantId: string }) {
  const [url, setUrl] = useState(defaultValue);
  const [uploading, setUploading] = useState(false);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const result = await uploadImage(tenantId, file);
      setUrl(result.url);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      <div className="flex items-center gap-2">
        {url && <img src={url} alt="" className="w-8 h-8 rounded-full object-cover border" />}
        <input type="hidden" name={name} value={url} />
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="URL or upload an image"
          className="flex-1 px-3 py-2 border rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500"
        />
        <label className={`px-3 py-2 text-xs font-medium rounded-lg cursor-pointer border ${uploading ? "opacity-50" : "hover:bg-gray-50"}`}>
          {uploading ? "..." : "Upload"}
          <input type="file" accept="image/*" onChange={handleUpload} className="hidden" />
        </label>
      </div>
    </div>
  );
}

// --- Shared components ---

function Input({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      <input {...props} className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
    </div>
  );
}

function SelectInput({ label, name, defaultValue, options }: { label: string; name: string; defaultValue: string; options: string[] }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      <select name={name} defaultValue={defaultValue} className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500">
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function ColorInput({ label, name, defaultValue }: { label: string; name: string; defaultValue: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <input type="color" name={name} defaultValue={defaultValue} className="w-8 h-8 rounded border cursor-pointer" />
        <input type="text" defaultValue={defaultValue} className="flex-1 px-3 py-2 border rounded-lg text-xs font-mono outline-none" readOnly />
      </div>
    </div>
  );
}

function Toggle({ label, name, defaultChecked }: { label: string; name: string; defaultChecked: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
      {label}
    </label>
  );
}

function MiniStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-xl font-bold text-gray-900 mt-1">{typeof value === "number" ? value.toLocaleString() : value}</p>
    </div>
  );
}

function LoadingPage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    </div>
  );
}

// --- Portal Users Tab ---
function PortalUsersTab({ tenantId }: { tenantId: string }) {
  const [users, setUsers] = useState<PortalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("manager");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    try {
      const res = await listPortalUsers(tenantId);
      setUsers(res.items);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [tenantId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError("");
    try {
      await createPortalUser(tenantId, { email, password, full_name: fullName, role });
      setEmail(""); setPassword(""); setFullName(""); setRole("manager");
      setShowForm(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(userId: string) {
    if (!confirm("Delete this portal user?")) return;
    await deletePortalUser(userId);
    load();
  }

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Portal Users</h3>
          <p className="text-sm text-gray-500">Client staff who can log into the lead management portal</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
        >
          {showForm ? "Cancel" : "+ Add User"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
              <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
              <select value={role} onChange={(e) => setRole(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500">
                <option value="owner">Owner</option>
                <option value="manager">Manager</option>
                <option value="staff">Staff</option>
              </select>
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={creating}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {creating ? "Creating..." : "Create User"}
          </button>
        </form>
      )}

      {users.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">
          <p>No portal users yet. Create one to give this client access to their lead dashboard.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-6 py-3 text-left">Name</th>
                <th className="px-6 py-3 text-left">Email</th>
                <th className="px-6 py-3 text-left">Role</th>
                <th className="px-6 py-3 text-left">Created</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 text-sm font-medium text-gray-900">{u.full_name}</td>
                  <td className="px-6 py-3 text-sm text-gray-600">{u.email}</td>
                  <td className="px-6 py-3">
                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 capitalize">
                      {u.role}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-sm text-gray-500">{new Date(u.created_at).toLocaleDateString()}</td>
                  <td className="px-6 py-3 text-right">
                    <button onClick={() => handleDelete(u.id)} className="text-xs text-red-600 hover:text-red-700">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}


function NotFoundPage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex items-center justify-center">
        <p className="text-gray-500">Tenant not found.</p>
      </div>
    </div>
  );
}
