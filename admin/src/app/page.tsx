"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Sidebar from "@/components/sidebar";
import { listTenants, getTenantStats, health, type Tenant, type TenantStats } from "@/lib/api";

export default function DashboardPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [stats, setStats] = useState<TenantStats[]>([]);
  const [serverStatus, setServerStatus] = useState<{ status: string; database: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [healthRes, tenantsRes] = await Promise.all([health(), listTenants(1, 100)]);
        setServerStatus(healthRes);
        setTenants(tenantsRes.items);

        const statsResults = await Promise.all(
          tenantsRes.items.map((t) => getTenantStats(t.id).catch(() => null))
        );
        setStats(statsResults.filter((s): s is TenantStats => s !== null));
      } catch (err) {
        console.error("Failed to load dashboard:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const totalConversations = stats.reduce((sum, s) => sum + s.total_conversations, 0);
  const totalMessages = stats.reduce((sum, s) => sum + s.total_messages, 0);
  const totalChunks = stats.reduce((sum, s) => sum + s.document_chunks, 0);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
          <p className="text-sm text-gray-500 mt-1">Overview of your WonderChat platform</p>
        </div>

        <div className="mb-6 flex items-center gap-2 text-sm">
          <span className={`w-2 h-2 rounded-full ${serverStatus?.database === "connected" ? "bg-green-500" : "bg-red-500"}`} />
          <span className="text-gray-600">
            Server {serverStatus?.status === "ok" ? "running" : "unreachable"}
            {serverStatus?.database && ` / DB ${serverStatus.database}`}
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
              <StatCard label="Tenants" value={tenants.length} />
              <StatCard label="Total conversations" value={totalConversations} />
              <StatCard label="Total messages" value={totalMessages} />
              <StatCard label="Document chunks" value={totalChunks} />
            </div>

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">Tenants</h3>
                <Link href="/tenants" className="text-sm text-blue-600 hover:text-blue-700">
                  View all
                </Link>
              </div>

              {tenants.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <p>No tenants yet.</p>
                  <Link href="/tenants" className="text-blue-600 hover:text-blue-700 text-sm mt-2 inline-block">
                    Create your first tenant
                  </Link>
                </div>
              ) : (
                <table className="w-full">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                    <tr>
                      <th className="px-6 py-3 text-left">Name</th>
                      <th className="px-6 py-3 text-left">Domain</th>
                      <th className="px-6 py-3 text-left">Tier</th>
                      <th className="px-6 py-3 text-left">Status</th>
                      <th className="px-6 py-3 text-right">Usage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {tenants.slice(0, 10).map((t) => {
                      const s = stats.find((st) => st.tenant_id === t.id);
                      return (
                        <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-3">
                            <Link href={`/tenants/${t.id}`} className="font-medium text-gray-900 hover:text-blue-600">
                              {t.name}
                            </Link>
                          </td>
                          <td className="px-6 py-3 text-sm text-gray-500">{t.domain}</td>
                          <td className="px-6 py-3">
                            <TierBadge tier={t.subscription_tier} />
                          </td>
                          <td className="px-6 py-3">
                            <span className={`inline-flex items-center gap-1 text-xs ${t.is_active ? "text-green-600" : "text-red-500"}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${t.is_active ? "bg-green-500" : "bg-red-500"}`} />
                              {t.is_active ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-right text-sm text-gray-500">
                            {s ? `${s.conversations_this_month}/${t.max_conversations_per_month}` : "-"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value.toLocaleString()}</p>
    </div>
  );
}

function TierBadge({ tier }: { tier: string }) {
  const colors: Record<string, string> = {
    enterprise: "bg-purple-100 text-purple-700",
    pro: "bg-blue-100 text-blue-700",
    starter: "bg-green-100 text-green-700",
    free: "bg-gray-100 text-gray-700",
  };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${colors[tier] || colors.free}`}>
      {tier}
    </span>
  );
}
