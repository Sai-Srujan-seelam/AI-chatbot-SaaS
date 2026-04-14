"use client";

import { useEffect, useState } from "react";
import Sidebar from "@/components/sidebar";
import { getChatbotConfig, updateChatbotConfig, type ChatbotConfig } from "@/lib/api";

export default function ChatbotConfigPage() {
  const [data, setData] = useState<ChatbotConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState<"appearance" | "behavior" | "lead_capture" | "knowledge">("appearance");

  // Config state
  const [config, setConfig] = useState<Record<string, unknown>>({});

  useEffect(() => {
    getChatbotConfig()
      .then((res) => {
        setData(res);
        setConfig(res.config);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  function updateField(key: string, value: unknown) {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setMessage("");
    try {
      const result = await updateChatbotConfig(config);
      setConfig(result.config);
      setMessage("Configuration saved!");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const tabs = [
    { key: "appearance", label: "Appearance" },
    { key: "behavior", label: "Behavior" },
    { key: "lead_capture", label: "Lead Capture" },
    { key: "knowledge", label: "Knowledge Base" },
  ] as const;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Chatbot Configuration</h2>
            <p className="text-sm text-gray-500 mt-1">
              Customize your AI chatbot&apos;s appearance and behavior
            </p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>

        {message && (
          <div className={`mb-4 px-4 py-2 rounded-lg text-sm ${
            message.includes("saved") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
          }`}>
            {message}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    tab === t.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="max-w-3xl">
              {tab === "appearance" && (
                <div className="space-y-6">
                  {/* Colors */}
                  <Section title="Colors">
                    <div className="grid grid-cols-2 gap-4">
                      <ColorField label="Primary Color" value={String(config.primary_color || "#2563eb")}
                        onChange={(v) => updateField("primary_color", v)} />
                      <ColorField label="Accent Color" value={String(config.accent_color || "#1e40af")}
                        onChange={(v) => updateField("accent_color", v)} />
                      <ColorField label="Background" value={String(config.background_color || "#ffffff")}
                        onChange={(v) => updateField("background_color", v)} />
                      <ColorField label="Text Color" value={String(config.text_color || "#1a1a1a")}
                        onChange={(v) => updateField("text_color", v)} />
                    </div>
                  </Section>

                  {/* Layout */}
                  <Section title="Layout">
                    <div className="grid grid-cols-2 gap-4">
                      <SelectField label="Theme" value={String(config.theme || "light")}
                        options={[{ v: "light", l: "Light" }, { v: "dark", l: "Dark" }, { v: "auto", l: "Auto" }]}
                        onChange={(v) => updateField("theme", v)} />
                      <SelectField label="Position" value={String(config.position || "bottom-right")}
                        options={[
                          { v: "bottom-right", l: "Bottom Right" }, { v: "bottom-left", l: "Bottom Left" },
                          { v: "top-right", l: "Top Right" }, { v: "top-left", l: "Top Left" },
                        ]}
                        onChange={(v) => updateField("position", v)} />
                      <SelectField label="Border Radius" value={String(config.border_radius || "large")}
                        options={[
                          { v: "none", l: "None" }, { v: "small", l: "Small" },
                          { v: "medium", l: "Medium" }, { v: "large", l: "Large" },
                        ]}
                        onChange={(v) => updateField("border_radius", v)} />
                      <SelectField label="Launcher Icon" value={String(config.launcher_icon || "chat")}
                        options={[
                          { v: "chat", l: "Chat Bubble" }, { v: "question", l: "Question Mark" },
                          { v: "support", l: "Support" }, { v: "custom", l: "Custom" },
                        ]}
                        onChange={(v) => updateField("launcher_icon", v)} />
                    </div>
                  </Section>

                  {/* Branding */}
                  <Section title="Branding">
                    <div className="space-y-4">
                      <TextField label="Bot Name" value={String(config.bot_name || "Assistant")}
                        onChange={(v) => updateField("bot_name", v)} />
                      <TextField label="Header Text" value={String(config.header_text || "Chat with us")}
                        onChange={(v) => updateField("header_text", v)} />
                      <TextField label="Welcome Message" value={String(config.welcome_message || "")}
                        onChange={(v) => updateField("welcome_message", v)}
                        placeholder="Hi! How can I help you today?" />
                      <TextField label="Placeholder Text" value={String(config.placeholder_text || "Type a message...")}
                        onChange={(v) => updateField("placeholder_text", v)} />
                      <TextField label="Bot Avatar URL" value={String(config.bot_avatar_url || "")}
                        onChange={(v) => updateField("bot_avatar_url", v)}
                        placeholder="https://..." />
                    </div>
                  </Section>
                </div>
              )}

              {tab === "behavior" && (
                <div className="space-y-6">
                  <Section title="Auto-open">
                    <div className="space-y-4">
                      <ToggleField label="Auto-open chat widget" description="Automatically open the chat after a delay"
                        checked={Boolean(config.auto_open)}
                        onChange={(v) => updateField("auto_open", v)} />
                      {Boolean(config.auto_open) && (
                        <NumberField label="Auto-open delay (ms)" value={Number(config.auto_open_delay_ms || 3000)}
                          onChange={(v) => updateField("auto_open_delay_ms", v)} min={0} max={30000} />
                      )}
                    </div>
                  </Section>

                  <Section title="Chat Behavior">
                    <div className="space-y-4">
                      <ToggleField label="Persist conversations" description="Remember conversations across page visits"
                        checked={Boolean(config.persist_conversations ?? true)}
                        onChange={(v) => updateField("persist_conversations", v)} />
                      <ToggleField label="Show sources" description="Show source URLs in bot responses"
                        checked={Boolean(config.show_sources)}
                        onChange={(v) => updateField("show_sources", v)} />
                      <ToggleField label="Show 'Powered by' badge" description="Display WonderAvenues branding"
                        checked={Boolean(config.show_powered_by ?? true)}
                        onChange={(v) => updateField("show_powered_by", v)} />
                      <NumberField label="Max message length" value={Number(config.max_message_length || 500)}
                        onChange={(v) => updateField("max_message_length", v)} min={100} max={2000} />
                    </div>
                  </Section>

                  <Section title="Suggested Questions">
                    <SuggestedQuestions
                      questions={Array.isArray(config.suggested_questions) ? config.suggested_questions as string[] : []}
                      onChange={(v) => updateField("suggested_questions", v)}
                    />
                  </Section>
                </div>
              )}

              {tab === "lead_capture" && (
                <div className="space-y-6">
                  <Section title="Lead Capture Form">
                    <div className="space-y-4">
                      <ToggleField label="Enable lead capture" description="Show a CTA button for demo/booking requests"
                        checked={Boolean(config.enable_lead_capture ?? true)}
                        onChange={(v) => updateField("enable_lead_capture", v)} />
                      <TextField label="CTA Button Text" value={String(config.lead_cta_text || "Book a Free Demo")}
                        onChange={(v) => updateField("lead_cta_text", v)} />
                      <TextField label="Form Title" value={String(config.lead_form_title || "Get Your Free Demo")}
                        onChange={(v) => updateField("lead_form_title", v)} />
                      <TextField label="Form Subtitle" value={String(config.lead_form_subtitle || "Fill in your details and we'll get back to you shortly.")}
                        onChange={(v) => updateField("lead_form_subtitle", v)} />
                      <TextField label="Success Message" value={String(config.lead_success_message || "Thanks! We'll be in touch soon.")}
                        onChange={(v) => updateField("lead_success_message", v)} />
                    </div>
                  </Section>
                </div>
              )}

              {tab === "knowledge" && (
                <div className="space-y-6">
                  <Section title="Knowledge Base">
                    <div className="bg-gray-50 rounded-lg p-6">
                      <div className="grid grid-cols-2 gap-6">
                        <div>
                          <p className="text-sm text-gray-500">Total Knowledge Chunks</p>
                          <p className="text-2xl font-bold text-gray-900 mt-1">
                            {data?.knowledge_base.total_chunks || 0}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Unique Sources</p>
                          <p className="text-2xl font-bold text-gray-900 mt-1">
                            {data?.knowledge_base.unique_sources || 0}
                          </p>
                        </div>
                      </div>
                      <p className="text-xs text-gray-400 mt-4">
                        Your chatbot&apos;s knowledge is powered by content scraped from your website.
                        Contact your WonderAvenues manager to update the knowledge base.
                      </p>
                    </div>
                  </Section>

                  <Section title="Connected Domain">
                    <div className="bg-gray-50 rounded-lg p-4 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{data?.domain}</p>
                        <p className="text-xs text-gray-400">Chatbot is active on this domain</p>
                      </div>
                      <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full">Active</span>
                    </div>
                  </Section>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="font-semibold text-gray-900 mb-4">{title}</h3>
      {children}
    </div>
  );
}

function TextField({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
    </div>
  );
}

function NumberField({ label, value, onChange, min, max }: {
  label: string; value: number; onChange: (v: number) => void; min?: number; max?: number;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} min={min} max={max}
        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
    </div>
  );
}

function ColorField({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)}
          className="w-10 h-10 rounded border border-gray-300 cursor-pointer" />
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
          className="flex-1 px-3 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 font-mono" />
      </div>
    </div>
  );
}

function SelectField({ label, value, options, onChange }: {
  label: string; value: string; options: { v: string; l: string }[]; onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500">
        {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </div>
  );
}

function ToggleField({ label, description, checked, onChange }: {
  label: string; description: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between cursor-pointer">
      <div>
        <p className="text-sm font-medium text-gray-700">{label}</p>
        <p className="text-xs text-gray-400">{description}</p>
      </div>
      <button type="button" onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          checked ? "bg-blue-600" : "bg-gray-200"
        }`}>
        <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`} />
      </button>
    </label>
  );
}

function SuggestedQuestions({ questions, onChange }: {
  questions: string[]; onChange: (v: string[]) => void;
}) {
  const [newQ, setNewQ] = useState("");

  function add() {
    if (newQ.trim()) {
      onChange([...questions, newQ.trim()]);
      setNewQ("");
    }
  }

  function remove(i: number) {
    onChange(questions.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-400">Quick-reply buttons shown to visitors when the chat opens</p>
      {questions.map((q, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="flex-1 text-sm text-gray-700 bg-gray-50 px-3 py-2 rounded-lg">{q}</span>
          <button onClick={() => remove(i)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
        </div>
      ))}
      <div className="flex gap-2">
        <input type="text" value={newQ} onChange={(e) => setNewQ(e.target.value)} placeholder="e.g., What are your hours?"
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
        <button onClick={add} className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200">Add</button>
      </div>
    </div>
  );
}
