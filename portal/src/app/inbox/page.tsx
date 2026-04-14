"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Sidebar from "@/components/sidebar";
import {
  listConversations,
  getConversation,
  type ConversationItem,
  type PaginatedResponse,
} from "@/lib/api";

export default function InboxPage() {
  const [data, setData] = useState<PaginatedResponse<ConversationItem> | null>(null);
  const [selected, setSelected] = useState<ConversationItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listConversations(page, 20, search || undefined);
      setData(result);
      if (result.items.length > 0 && !selected) {
        loadDetail(result.items[0].id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  async function loadDetail(id: string) {
    setDetailLoading(true);
    try {
      const conv = await getConversation(id);
      setSelected(conv);
    } catch (err) {
      console.error(err);
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 bg-white">
          <h2 className="text-xl font-bold text-gray-900">Conversation Inbox</h2>
          <p className="text-sm text-gray-500">All AI chatbot conversations from your website</p>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Conversation List */}
          <div className="w-96 border-r border-gray-200 bg-white flex flex-col">
            <div className="p-3 border-b border-gray-100">
              <input
                type="text"
                placeholder="Search conversations..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
                </div>
              ) : !data || data.items.length === 0 ? (
                <div className="p-6 text-center text-gray-400 text-sm">
                  No conversations yet
                </div>
              ) : (
                data.items.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => loadDetail(conv.id)}
                    className={`w-full text-left px-4 py-3.5 border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                      selected?.id === conv.id ? "bg-blue-50 border-l-2 border-l-blue-500" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-900 truncate">
                        {conv.lead ? conv.lead.name : `Session ${conv.session_id.slice(0, 8)}...`}
                      </span>
                      <span className="text-xs text-gray-400 flex-shrink-0 ml-2">
                        {new Date(conv.updated_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 truncate">
                      {conv.last_message || "No messages"}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-xs text-gray-400">{conv.message_count} messages</span>
                      {conv.lead && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700">
                          Lead captured
                        </span>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>

            {data && data.pages > 1 && (
              <div className="flex items-center justify-between px-4 py-2 border-t border-gray-100 text-xs">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="text-blue-600 disabled:text-gray-300"
                >
                  Prev
                </button>
                <span className="text-gray-400">{page} / {data.pages}</span>
                <button
                  onClick={() => setPage((p) => Math.min(data.pages, p + 1))}
                  disabled={page === data.pages}
                  className="text-blue-600 disabled:text-gray-300"
                >
                  Next
                </button>
              </div>
            )}
          </div>

          {/* Conversation Detail */}
          <div className="flex-1 flex flex-col bg-gray-50">
            {detailLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              </div>
            ) : !selected ? (
              <div className="flex-1 flex items-center justify-center text-gray-400">
                Select a conversation to view
              </div>
            ) : (
              <>
                {/* Detail Header */}
                <div className="px-6 py-4 bg-white border-b border-gray-200 flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900">
                      {selected.lead ? selected.lead.name : `Session ${selected.session_id.slice(0, 12)}`}
                    </h3>
                    {selected.lead && (
                      <p className="text-sm text-gray-500">
                        {selected.lead.email} &middot;{" "}
                        <span className="capitalize">{selected.lead.status}</span>
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400">
                      {selected.message_count} messages &middot;{" "}
                      {new Date(selected.created_at).toLocaleString()}
                    </span>
                    {selected.lead && (
                      <Link
                        href={`/leads/${selected.lead.id}`}
                        className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                      >
                        View Lead
                      </Link>
                    )}
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-6 space-y-3">
                  {(selected.messages || []).map((msg, i) => (
                    <div
                      key={i}
                      className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[70%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                          msg.role === "user"
                            ? "bg-blue-600 text-white rounded-br-md"
                            : "bg-white text-gray-800 rounded-bl-md border border-gray-200"
                        }`}
                      >
                        {msg.content}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
