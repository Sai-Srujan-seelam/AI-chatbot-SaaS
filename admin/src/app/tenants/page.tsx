"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Sidebar from "@/components/sidebar";
import { listTenants, createTenant, deleteTenant, type Tenant, type PaginatedResponse } from "@/lib/api";

export default function TenantsPage() {
  const [data, setData] = useState<PaginatedResponse<Tenant> | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);

  async function load(p: number) {
    setLoading(true);
    try {
      const res = await listTenants(p, 20);
      setData(res);
      setPage(p);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(1); }, []);

  async function handleCreate(formData: FormData) {
    const name = formData.get("name") as string;
    const domain = formData.get("domain") as string;
    const email = formData.get("email") as string;
    const tier = formData.get("tier") as string;

    try {
      const res = await createTenant({
        name,
        domain,
        contact_email: email || undefined,
        subscription_tier: tier || "free",
      });
      setNewKey(res.api_key);
      setShowCreate(false);
      load(1);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create tenant");
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}" and all their data? This cannot be undone.`)) return;
    try {
      await deleteTenant(id);
      load(page);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Tenants</h2>
            <p className="text-sm text-gray-500 mt-1">{data?.total || 0} total</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            + New tenant
          </button>
        </div>

        {/* API key flash */}
        {newKey && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm font-medium text-green-800 mb-1">Tenant created. Save this API key -- it won&apos;t be shown again:</p>
            <code className="block p-2 bg-white rounded text-xs font-mono break-all border">{newKey}</code>
            <button onClick={() => setNewKey(null)} className="mt-2 text-xs text-green-700 hover:text-green-900">Dismiss</button>
          </div>
        )}

        {/* Create modal */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <form
              action={handleCreate}
              className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md space-y-4"
            >
              <h3 className="text-lg font-semibold text-gray-900">Create tenant</h3>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Business name</label>
                <input name="name" required className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Domain</label>
                <input name="domain" required placeholder="example.com" className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contact email</label>
                <input name="email" type="email" className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subscription tier</label>
                <select name="tier" className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="free">Free</option>
                  <option value="starter">Starter</option>
                  <option value="pro">Pro</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="flex-1 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800">
                  Create
                </button>
                <button type="button" onClick={() => setShowCreate(false)} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900" />
            </div>
          ) : (
            <>
              <table className="w-full">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="px-6 py-3 text-left">Name</th>
                    <th className="px-6 py-3 text-left">Domain</th>
                    <th className="px-6 py-3 text-left">API key</th>
                    <th className="px-6 py-3 text-left">Tier</th>
                    <th className="px-6 py-3 text-left">Created</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data?.items.map((t) => (
                    <tr key={t.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3">
                        <Link href={`/tenants/${t.id}`} className="font-medium text-gray-900 hover:text-blue-600">
                          {t.name}
                        </Link>
                      </td>
                      <td className="px-6 py-3 text-sm text-gray-500">{t.domain}</td>
                      <td className="px-6 py-3 text-xs font-mono text-gray-400">{t.api_key_prefix}...</td>
                      <td className="px-6 py-3 text-xs">{t.subscription_tier}</td>
                      <td className="px-6 py-3 text-sm text-gray-500">{new Date(t.created_at).toLocaleDateString()}</td>
                      <td className="px-6 py-3 text-right">
                        <button
                          onClick={() => handleDelete(t.id, t.name)}
                          className="text-xs text-red-500 hover:text-red-700"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Pagination */}
              {data && data.pages > 1 && (
                <div className="px-6 py-3 border-t border-gray-200 flex items-center justify-between text-sm text-gray-500">
                  <span>Page {data.page} of {data.pages}</span>
                  <div className="flex gap-2">
                    <button
                      disabled={page <= 1}
                      onClick={() => load(page - 1)}
                      className="px-3 py-1 border rounded text-xs disabled:opacity-50 hover:bg-gray-50"
                    >
                      Previous
                    </button>
                    <button
                      disabled={page >= data.pages}
                      onClick={() => load(page + 1)}
                      className="px-3 py-1 border rounded text-xs disabled:opacity-50 hover:bg-gray-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
