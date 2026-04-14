"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Sidebar from "@/components/sidebar";
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type Notification,
  type PaginatedResponse,
} from "@/lib/api";

const TYPE_ICONS: Record<string, { bg: string; icon: string }> = {
  new_lead: {
    bg: "bg-blue-100 text-blue-600",
    icon: "M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z",
  },
  lead_reply: {
    bg: "bg-green-100 text-green-600",
    icon: "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",
  },
  system: {
    bg: "bg-gray-100 text-gray-600",
    icon: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  },
};

export default function NotificationsPage() {
  const [data, setData] = useState<(PaginatedResponse<Notification> & { unread_count: number }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setLoading(true);
    listNotifications(page)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page]);

  async function handleMarkRead(id: string) {
    await markNotificationRead(id);
    setData((prev) =>
      prev
        ? {
            ...prev,
            unread_count: Math.max(0, prev.unread_count - 1),
            items: prev.items.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
          }
        : prev
    );
  }

  async function handleMarkAllRead() {
    await markAllNotificationsRead();
    setData((prev) =>
      prev
        ? {
            ...prev,
            unread_count: 0,
            items: prev.items.map((n) => ({ ...n, is_read: true })),
          }
        : prev
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Notifications</h2>
            <p className="text-sm text-gray-500 mt-1">
              {data ? `${data.unread_count} unread` : "Loading..."}
            </p>
          </div>
          {data && data.unread_count > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="px-4 py-2 text-sm text-blue-600 hover:text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
            >
              Mark all as read
            </button>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : !data || data.items.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              <p>No notifications yet</p>
            </div>
          ) : (
            <>
              <div className="divide-y divide-gray-50">
                {data.items.map((notif) => {
                  const typeStyle = TYPE_ICONS[notif.type] || TYPE_ICONS.system;
                  return (
                    <div
                      key={notif.id}
                      className={`flex items-start gap-4 px-6 py-4 transition-colors ${
                        notif.is_read ? "bg-white" : "bg-blue-50/30"
                      } hover:bg-gray-50`}
                    >
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${typeStyle.bg}`}>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={typeStyle.icon} />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className={`text-sm ${notif.is_read ? "text-gray-700" : "text-gray-900 font-medium"}`}>
                              {notif.title}
                            </p>
                            <p className="text-sm text-gray-500 mt-0.5">{notif.body}</p>
                          </div>
                          <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">
                            {new Date(notif.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-2">
                          {notif.lead_id && (
                            <Link
                              href={`/leads/${notif.lead_id}`}
                              className="text-xs text-blue-600 hover:text-blue-700"
                            >
                              View lead
                            </Link>
                          )}
                          {!notif.is_read && (
                            <button
                              onClick={() => handleMarkRead(notif.id)}
                              className="text-xs text-gray-400 hover:text-gray-600"
                            >
                              Mark as read
                            </button>
                          )}
                        </div>
                      </div>
                      {!notif.is_read && (
                        <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-2" />
                      )}
                    </div>
                  );
                })}
              </div>

              {data.pages > 1 && (
                <div className="flex items-center justify-between px-6 py-3 border-t border-gray-100">
                  <p className="text-sm text-gray-500">
                    Page {data.page} of {data.pages}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setPage((p) => Math.min(data.pages, p + 1))}
                      disabled={page === data.pages}
                      className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50"
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
