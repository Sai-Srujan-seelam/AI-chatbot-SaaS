"use client";

import { useEffect, useState } from "react";
import Sidebar from "@/components/sidebar";
import {
  getAnalytics,
  getConversationAnalytics,
  getEngagementAnalytics,
  type Analytics,
  type ConversationAnalytics,
  type EngagementAnalytics,
} from "@/lib/api";

export default function AnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [convoData, setConvoData] = useState<ConversationAnalytics | null>(null);
  const [engageData, setEngageData] = useState<EngagementAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [tab, setTab] = useState<"overview" | "conversations" | "engagement">("overview");

  useEffect(() => {
    setLoading(true);
    Promise.all([getAnalytics(days), getConversationAnalytics(days), getEngagementAnalytics(days)])
      .then(([a, c, e]) => { setData(a); setConvoData(c); setEngageData(e); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [days]);

  const tabs = [
    { key: "overview", label: "Lead Overview" },
    { key: "conversations", label: "Chatbot Metrics" },
    { key: "engagement", label: "Engagement & ROI" },
  ] as const;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Analytics & Reporting</h2>
            <p className="text-sm text-gray-500 mt-1">Performance metrics and insights</p>
          </div>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none">
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={180}>Last 6 months</option>
            <option value={365}>Last year</option>
          </select>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
          {tabs.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                tab === t.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}>{t.label}</button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : (
          <>
            {/* ========== OVERVIEW TAB ========== */}
            {tab === "overview" && data && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                  <KPICard label="Total Leads" value={data.total_leads} />
                  <KPICard label="This Month" value={data.leads_this_month} />
                  <KPICard label="This Week" value={data.leads_this_week} />
                  <KPICard label="Conversion Rate" value={`${data.conversion_rate}%`} highlight />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                  <div className="bg-white rounded-xl border border-gray-200 p-6">
                    <h3 className="font-semibold text-gray-900 mb-4">Lead Funnel</h3>
                    <div className="space-y-3">
                      <FunnelBar label="New" count={data.new_leads} total={data.total_leads} color="bg-blue-500" />
                      <FunnelBar label="Contacted" count={data.contacted_leads} total={data.total_leads} color="bg-yellow-500" />
                      <FunnelBar label="Converted" count={data.converted_leads} total={data.total_leads} color="bg-green-500" />
                      <FunnelBar label="Lost" count={data.lost_leads} total={data.total_leads} color="bg-red-400" />
                    </div>
                  </div>

                  <div className="bg-white rounded-xl border border-gray-200 p-6">
                    <h3 className="font-semibold text-gray-900 mb-4">Leads by Source</h3>
                    {Object.keys(data.leads_by_source).length === 0 ? (
                      <p className="text-sm text-gray-400">No data yet</p>
                    ) : (
                      <div className="space-y-3">
                        {Object.entries(data.leads_by_source).map(([source, count]) => (
                          <div key={source} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="w-3 h-3 rounded-full bg-blue-500" />
                              <span className="text-sm text-gray-700 capitalize">{source}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-semibold text-gray-900">{count}</span>
                              <span className="text-xs text-gray-400">
                                ({data.total_leads > 0 ? Math.round((count / data.total_leads) * 100) : 0}%)
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {data.avg_response_time_hours !== null && (
                      <div className="mt-6 pt-4 border-t border-gray-100">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-500">Avg. Response Time</span>
                          <span className="text-sm font-semibold text-gray-900">
                            {data.avg_response_time_hours < 1
                              ? `${Math.round(data.avg_response_time_hours * 60)} min`
                              : `${data.avg_response_time_hours} hrs`}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Leads Over Time */}
                <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
                  <h3 className="font-semibold text-gray-900 mb-4">Leads Over Time</h3>
                  <BarChart data={data.leads_by_day.map((d) => ({ label: d.date, value: d.count }))} color="bg-blue-500" />
                </div>

                {data.leads_by_month.length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-200 p-6">
                    <h3 className="font-semibold text-gray-900 mb-4">Monthly Trend</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                      {data.leads_by_month.map((m) => (
                        <div key={m.month} className="text-center p-3 bg-gray-50 rounded-lg">
                          <p className="text-xs text-gray-400">{m.month}</p>
                          <p className="text-lg font-bold text-gray-900 mt-1">{m.count}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ========== CONVERSATIONS TAB ========== */}
            {tab === "conversations" && convoData && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                  <KPICard label="Total Conversations" value={convoData.total_conversations} />
                  <KPICard label={`Last ${days} Days`} value={convoData.conversations_in_period} />
                  <KPICard label="Avg Messages/Chat" value={convoData.avg_messages_per_conversation} />
                  <KPICard label="Chat → Lead Rate" value={`${convoData.conversation_to_lead_rate}%`} highlight />
                </div>

                {/* Conversations Over Time */}
                <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
                  <h3 className="font-semibold text-gray-900 mb-4">Chat Volume Over Time</h3>
                  <BarChart data={convoData.conversations_by_day.map((d) => ({ label: d.date, value: d.count }))} color="bg-indigo-500" />
                </div>

                {/* Top Questions */}
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <h3 className="font-semibold text-gray-900 mb-1">Common Questions</h3>
                  <p className="text-xs text-gray-400 mb-4">Most frequently asked questions by visitors</p>
                  {convoData.top_questions.length === 0 ? (
                    <p className="text-sm text-gray-400">No data yet</p>
                  ) : (
                    <div className="space-y-2">
                      {convoData.top_questions.map((q, i) => (
                        <div key={i} className="flex items-center gap-3 px-3 py-2.5 bg-gray-50 rounded-lg">
                          <span className="text-xs text-gray-400 w-6 text-right">#{i + 1}</span>
                          <span className="flex-1 text-sm text-gray-700 truncate">&ldquo;{q.question}&rdquo;</span>
                          <span className="text-xs font-medium text-gray-500 bg-white px-2 py-0.5 rounded">
                            {q.count}x
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ========== ENGAGEMENT TAB ========== */}
            {tab === "engagement" && engageData && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                  <KPICard label="Leads in Period" value={engageData.total_leads_in_period} />
                  <KPICard label="Replied To" value={engageData.leads_with_replies} />
                  <KPICard label="Response Rate" value={`${engageData.response_rate}%`} highlight />
                  <KPICard label="Avg Response Time"
                    value={engageData.avg_response_time_hours != null
                      ? engageData.avg_response_time_hours < 1
                        ? `${Math.round(engageData.avg_response_time_hours * 60)}m`
                        : `${engageData.avg_response_time_hours}h`
                      : "N/A"} />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                  {/* Response Time Distribution */}
                  <div className="bg-white rounded-xl border border-gray-200 p-6">
                    <h3 className="font-semibold text-gray-900 mb-4">Response Time Distribution</h3>
                    <div className="space-y-3">
                      <FunnelBar label="Under 1 hour" count={engageData.response_time_distribution.under_1h || 0}
                        total={engageData.leads_with_replies || 1} color="bg-green-500" />
                      <FunnelBar label="1-4 hours" count={engageData.response_time_distribution["1h_to_4h"] || 0}
                        total={engageData.leads_with_replies || 1} color="bg-yellow-500" />
                      <FunnelBar label="4-24 hours" count={engageData.response_time_distribution["4h_to_24h"] || 0}
                        total={engageData.leads_with_replies || 1} color="bg-orange-500" />
                      <FunnelBar label="Over 24 hours" count={engageData.response_time_distribution.over_24h || 0}
                        total={engageData.leads_with_replies || 1} color="bg-red-500" />
                    </div>
                  </div>

                  {/* Lead Status Breakdown */}
                  <div className="bg-white rounded-xl border border-gray-200 p-6">
                    <h3 className="font-semibold text-gray-900 mb-4">Lead Quality</h3>
                    <div className="space-y-3">
                      {Object.entries(engageData.status_breakdown).map(([status, count]) => (
                        <FunnelBar key={status} label={status.charAt(0).toUpperCase() + status.slice(1)}
                          count={count} total={engageData.total_leads_in_period || 1}
                          color={
                            status === "converted" ? "bg-green-500" :
                            status === "contacted" ? "bg-yellow-500" :
                            status === "lost" ? "bg-red-400" : "bg-blue-500"
                          } />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Weekly Trend */}
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <h3 className="font-semibold text-gray-900 mb-4">Weekly Lead Trend</h3>
                  <BarChart data={engageData.weekly_trend.map((w) => ({ label: w.week, value: w.count }))} color="bg-purple-500" />
                </div>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function KPICard({ label, value, highlight }: { label: string; value: number | string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border p-5 ${highlight ? "bg-blue-50 border-blue-200" : "bg-white border-gray-200"}`}>
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${highlight ? "text-blue-700" : "text-gray-900"}`}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
    </div>
  );
}

function FunnelBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm text-gray-700">{label}</span>
        <span className="text-sm font-medium text-gray-900">
          {count} <span className="text-gray-400 text-xs">({Math.round(pct)}%)</span>
        </span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function BarChart({ data, color }: { data: { label: string; value: number }[]; color: string }) {
  if (data.length === 0) return <p className="text-sm text-gray-400">No data for this period</p>;
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex items-end gap-1 h-40">
      {data.map((d) => (
        <div key={d.label} className="flex-1 group relative" title={`${d.label}: ${d.value}`}>
          <div
            className={`${color} rounded-t-sm mx-auto transition-all hover:opacity-80`}
            style={{
              height: `${Math.max((d.value / max) * 100, 2)}%`,
              minHeight: d.value > 0 ? "4px" : "1px",
              maxWidth: "20px",
            }}
          />
          <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap z-10">
            {d.label}: {d.value}
          </div>
        </div>
      ))}
    </div>
  );
}
