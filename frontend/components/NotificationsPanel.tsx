"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "../lib/api";
import { getToken } from "../lib/auth";

type Notification = {
  id: string;
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

export function NotificationsPanel() {
  const router = useRouter();
  const [items, setItems] = useState<Notification[]>([]);
  const [error, setError] = useState("");
  const [openingId, setOpeningId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await apiFetch<{ notifications: Notification[] }>("/notifications", {
      token: getToken(),
    });
    if (result.success) setItems(result.data.notifications);
    else setError(result.error.message);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function bumpBadge() {
    window.dispatchEvent(new Event("dmhr:notifications-changed"));
  }

  async function markAll() {
    await apiFetch("/notifications/read-all", { method: "POST", token: getToken() });
    await load();
    bumpBadge();
  }

  async function markOne(id: string) {
    await apiFetch(`/notifications/${id}/read`, { method: "POST", token: getToken() });
    await load();
    bumpBadge();
  }

  async function openNotification(n: Notification) {
    if (!n.href) return;
    setOpeningId(n.id);
    try {
      if (!n.readAt) {
        await apiFetch(`/notifications/${n.id}/read`, { method: "POST", token: getToken() });
        bumpBadge();
      }
      router.push(n.href);
    } finally {
      setOpeningId(null);
    }
  }

  return (
    <>
      {error ? <div className="error-banner">{error}</div> : null}
      <div style={{ marginBottom: 16 }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={markAll}>
          Mark all read
        </button>
      </div>
      <section className="panel">
        <h2>Notifications</h2>
        <p className="lead">In-app alerts for case activity. Email sends when SMTP is configured.</p>
        <ul className="org-list">
          {items.map((n) => (
            <li key={n.id}>
              <div>
                <div className="org-name">
                  {n.title}
                  {!n.readAt ? " · New" : ""}
                </div>
                <div className="org-meta">
                  {n.body} · {new Date(n.createdAt).toLocaleString()}
                </div>
              </div>
              <div className="file-actions">
                {n.href ? (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={openingId === n.id}
                    onClick={() => openNotification(n)}
                  >
                    {openingId === n.id ? "Opening…" : "Open"}
                  </button>
                ) : null}
                {!n.readAt ? (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => markOne(n.id)}>
                    Mark read
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
        {items.length === 0 ? (
          <div className="empty-state">
            <p>No notifications</p>
          </div>
        ) : null}
      </section>
    </>
  );
}
