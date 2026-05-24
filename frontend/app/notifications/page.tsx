'use client';

import { useEffect, useState } from 'react';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  channel: string;
  delivered_via: string | null;
  status: string;
  is_read: boolean;
  created_at: string;
};

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadNotifications() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/notifications`, {
          cache: 'no-store',
          credentials: 'include'
        });
        if (!response.ok) {
          throw new Error('Unable to load notifications');
        }
        const json = await response.json();
        setNotifications(json.notifications ?? []);
      } catch (err: any) {
        setError(err?.message ?? 'Failed to load notifications');
      } finally {
        setLoading(false);
      }
    }

    loadNotifications();
  }, []);

  async function markRead(notificationId: string) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/notifications/${notificationId}/read`, {
        method: 'PATCH',
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error('Unable to update notification');
      }
      setNotifications((prev) => prev.map((item) => (item.id === notificationId ? { ...item, is_read: true } : item)));
    } catch (err) {
      // ignore; user can refresh later
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="space-y-4">
        <div className="rounded-[2rem] bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-900">Notifications</h1>
          <p className="mt-2 text-sm text-slate-600">Receive price alerts, marketplace updates, and system notices in one place.</p>
        </div>

        {loading ? (
          <div className="rounded-[2rem] bg-slate-50 p-6 text-slate-700">Loading notifications…</div>
        ) : error ? (
          <div className="rounded-[2rem] bg-rose-50 p-6 text-rose-800">{error}</div>
        ) : notifications.length === 0 ? (
          <div className="rounded-[2rem] bg-slate-50 p-6 text-slate-700">No notifications yet. Price alerts and order updates will appear here.</div>
        ) : (
          <div className="space-y-4">
            {notifications.map((notification) => (
              <article key={notification.id} className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-sm uppercase tracking-[0.2em] text-slate-500">{notification.type.replace(/_/g, ' ')}</p>
                    <h2 className="mt-2 text-lg font-semibold text-slate-900">{notification.title}</h2>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${notification.is_read ? 'bg-slate-100 text-slate-600' : 'bg-emerald-100 text-emerald-800'}`}>
                    {notification.is_read ? 'Read' : 'Unread'}
                  </span>
                </div>
                <p className="mt-4 text-slate-700 whitespace-pre-line">{notification.body}</p>
                <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-500">
                  <span>{new Date(notification.created_at).toLocaleString()}</span>
                  <span>Channel: {notification.channel}</span>
                  <span>Delivered by: {notification.delivered_via ?? 'pending'}</span>
                </div>
                {!notification.is_read ? (
                  <button
                    type="button"
                    onClick={() => markRead(notification.id)}
                    className="mt-4 inline-flex items-center rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
                  >
                    Mark as read
                  </button>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
