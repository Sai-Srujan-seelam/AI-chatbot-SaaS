"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Sidebar from "@/components/sidebar";
import {
  getLeadDetail,
  updateLeadStatus,
  replyToLead,
  getTemplates,
  type LeadDetail,
  type ReplyTemplate,
} from "@/lib/api";

const STATUS_COLORS: Record<string, string> = {
  new: "bg-blue-100 text-blue-700",
  contacted: "bg-yellow-100 text-yellow-700",
  converted: "bg-green-100 text-green-700",
  lost: "bg-red-100 text-red-700",
};

export default function LeadDetailPage() {
  const params = useParams();
  const router = useRouter();
  const leadId = params.id as string;

  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [templates, setTemplates] = useState<ReplyTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyBody, setReplyBody] = useState("");
  const [replySubject, setReplySubject] = useState("");
  const [replyChannel, setReplyChannel] = useState<"email" | "sms" | "internal">("email");
  const [sending, setSending] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);

  useEffect(() => {
    Promise.all([getLeadDetail(leadId), getTemplates()])
      .then(([leadData, tmpl]) => {
        setLead(leadData);
        setTemplates(tmpl);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [leadId]);

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (!replyBody.trim()) return;
    setSending(true);
    try {
      const msg = await replyToLead(leadId, replyBody, replyChannel, replySubject || undefined);
      setLead((prev) =>
        prev
          ? {
              ...prev,
              conversation_messages: [...prev.conversation_messages, msg],
              status: prev.status === "new" ? "contacted" : prev.status,
            }
          : prev
      );
      setReplyBody("");
      setReplySubject("");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to send reply");
    } finally {
      setSending(false);
    }
  }

  async function handleStatusChange(status: string) {
    setStatusUpdating(true);
    try {
      await updateLeadStatus(leadId, status);
      setLead((prev) => (prev ? { ...prev, status } : prev));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setStatusUpdating(false);
    }
  }

  function applyTemplate(tmpl: ReplyTemplate) {
    const body = tmpl.body.replace(/\{name\}/g, lead?.name || "");
    setReplyBody(body);
    if (tmpl.subject) setReplySubject(tmpl.subject);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </main>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 p-8">
          <p className="text-gray-500">Lead not found.</p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <button
              onClick={() => router.back()}
              className="text-sm text-gray-500 hover:text-gray-700 mb-2 flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to leads
            </button>
            <h2 className="text-2xl font-bold text-gray-900">{lead.name}</h2>
            <p className="text-sm text-gray-500 mt-1">{lead.email} {lead.phone ? `| ${lead.phone}` : ""}</p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={lead.status}
              onChange={(e) => handleStatusChange(e.target.value)}
              disabled={statusUpdating}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="new">New</option>
              <option value="contacted">Contacted</option>
              <option value="converted">Converted</option>
              <option value="lost">Lost</option>
            </select>
            <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[lead.status]}`}>
              {lead.status}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Conversation */}
          <div className="lg:col-span-2 space-y-6">
            {/* Original Chatbot Conversation */}
            {lead.chatbot_conversation && lead.chatbot_conversation.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200">
                <div className="px-6 py-4 border-b border-gray-100">
                  <h3 className="font-semibold text-gray-900">Chatbot Conversation</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Original conversation from the website widget</p>
                </div>
                <div className="p-4 space-y-3 max-h-80 overflow-y-auto">
                  {lead.chatbot_conversation.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm ${
                          msg.role === "user"
                            ? "bg-blue-600 text-white rounded-br-md"
                            : "bg-gray-100 text-gray-800 rounded-bl-md"
                        }`}
                      >
                        {msg.content}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Reply Thread */}
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-100">
                <h3 className="font-semibold text-gray-900">Conversation</h3>
              </div>

              {lead.conversation_messages.length === 0 ? (
                <div className="p-6 text-center text-gray-400 text-sm">
                  No messages yet. Send a reply below.
                </div>
              ) : (
                <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
                  {lead.conversation_messages.map((msg) => (
                    <div key={msg.id} className="px-6 py-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${
                              msg.sender_type === "client"
                                ? "bg-blue-100 text-blue-700"
                                : "bg-gray-100 text-gray-700"
                            }`}
                          >
                            {(msg.sender_name || "?").charAt(0).toUpperCase()}
                          </div>
                          <span className="text-sm font-medium text-gray-900">
                            {msg.sender_name || (msg.sender_type === "client" ? "You" : lead.name)}
                          </span>
                          <span className="text-xs text-gray-400 capitalize">via {msg.channel}</span>
                        </div>
                        <span className="text-xs text-gray-400">
                          {new Date(msg.created_at).toLocaleString()}
                        </span>
                      </div>
                      {msg.subject && (
                        <p className="text-xs text-gray-500 mb-1 font-medium">{msg.subject}</p>
                      )}
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{msg.body}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Reply Composer */}
              <div className="border-t border-gray-100 p-4">
                <form onSubmit={handleReply}>
                  <div className="flex items-center gap-3 mb-3">
                    <select
                      value={replyChannel}
                      onChange={(e) => setReplyChannel(e.target.value as "email" | "sms" | "internal")}
                      className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm outline-none"
                    >
                      <option value="email">Email</option>
                      <option value="sms" disabled={!lead.phone}>
                        SMS {!lead.phone ? "(no phone)" : ""}
                      </option>
                      <option value="internal">Internal Note</option>
                    </select>
                    {templates.length > 0 && (
                      <select
                        onChange={(e) => {
                          const tmpl = templates.find((t) => t.id === e.target.value);
                          if (tmpl) applyTemplate(tmpl);
                          e.target.value = "";
                        }}
                        className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm outline-none text-gray-500"
                        defaultValue=""
                      >
                        <option value="" disabled>
                          Use template...
                        </option>
                        {templates.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {replyChannel === "email" && (
                    <input
                      type="text"
                      value={replySubject}
                      onChange={(e) => setReplySubject(e.target.value)}
                      placeholder="Subject (optional)"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-2 outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  )}

                  <textarea
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    placeholder={
                      replyChannel === "internal"
                        ? "Add an internal note..."
                        : `Write a reply to ${lead.name}...`
                    }
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />

                  <div className="flex items-center justify-between mt-3">
                    <p className="text-xs text-gray-400">
                      {replyChannel === "email"
                        ? `Will be sent to ${lead.email}`
                        : replyChannel === "sms"
                          ? `Will be sent to ${lead.phone}`
                          : "Internal note (not sent to lead)"}
                    </p>
                    <button
                      type="submit"
                      disabled={sending || !replyBody.trim()}
                      className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                      {sending ? "Sending..." : replyChannel === "internal" ? "Save Note" : "Send Reply"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>

          {/* Right: Lead Info */}
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Lead Details</h3>
              <div className="space-y-3">
                <InfoRow label="Name" value={lead.name} />
                <InfoRow label="Email" value={lead.email} />
                <InfoRow label="Phone" value={lead.phone || "Not provided"} />
                <InfoRow label="Company" value={lead.company || "Not provided"} />
                <InfoRow label="Type" value={lead.lead_type} />
                <InfoRow label="Submitted" value={new Date(lead.created_at).toLocaleString()} />
              </div>
            </div>

            {lead.message && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="font-semibold text-gray-900 mb-3">Original Message</h3>
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{lead.message}</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-900 font-medium text-right">{value}</span>
    </div>
  );
}
