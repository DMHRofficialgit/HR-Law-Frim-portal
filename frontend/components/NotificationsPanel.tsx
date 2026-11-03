"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Check, Loader2 } from "lucide-react";
import { ChoiceToggle } from "./ChoiceToggle";
import { ListSkeleton } from "./Skeleton";
import { TooltipAnchor } from "./TooltipAnchor";
import { apiFetch } from "../lib/api";
import { getToken } from "../lib/auth";
import {
  countUnread,
  formatRelativeTime,
  inferNotificationKind,
  notificationKindIcon,
  notificationKindLabel,
  type NotificationFilter,
  type PortalNotification,
} from "../lib/notifications";

export function NotificationsPanel() {
  const router = useRouter();
  const [items, setItems] = useState<PortalNotification[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const didInitFilter = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await apiFetch<{ notifications: PortalNotification[] }>(
      "/notifications",
      { token: getToken() }
    );
    if (result.success) {
      setItems(result.data.notifications);
      setError("");
      if (!didInitFilter.current) {
        didInitFilter.current = true;
        setFilter(countUnread(result.data.notifications) > 0 ? "unread" : "all");
      }
    } else {
      setError(result.error.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function bumpBadge() {
    window.dispatchEvent(new Event("dmhr:notifications-changed"));
  }

  const unreadCount = useMemo(() => countUnread(items), [items]);

  const filtered = useMemo(() => {
    if (filter === "unread") return items.filter((n) => !n.readAt);
    return items;
  }, [items, filter]);

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

  async function openNotification(n: PortalNotification) {
    if (!n.href) return;
    setOpeningId(n.id);
    try {
      if (!n.readAt) {
        await apiFetch(`/notifications/${n.id}/read`, {
          method: "POST",
          token: getToken(),
        });
        bumpBadge();
      }
      router.push(n.href);
    } finally {
      setOpeningId(null);
    }
  }

  const unreadLabel =
    unreadCount > 0 ? `Unread · ${unreadCount}` : "Unread";

  return (
    <>
      {error ? <div className="error-banner">{error}</div> : null}

      <section className="panel org-directory notify-panel">
        <div className="org-directory-head">
          <div>
            <h2>Notifications</h2>
            <p className="lead">
              In-app alerts for cases, e-sign, onboarding, and documents
              {unreadCount > 0 ? ` · ${unreadCount} unread` : ""}. Email sends when SMTP is
              configured.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={markAll}
            disabled={unreadCount === 0 || loading}
          >
            Mark all read
          </button>
        </div>

        <div className="notify-toolbar">
          <ChoiceToggle
            name="notify-filter"
            label="Show"
            hideLabel
            value={filter}
            options={[
              { value: "unread", label: unreadLabel },
              { value: "all", label: "All" },
            ]}
            onChange={setFilter}
          />
        </div>

        {loading ? (
          <ListSkeleton rows={6} showAvatar />
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <p>
              {filter === "unread" && items.length > 0
                ? "You’re all caught up."
                : "No notifications yet."}
            </p>
            <p className="lead">
              {filter === "unread" && items.length > 0
                ? "Switch to All to see earlier alerts."
                : "Activity from cases, signatures, and onboarding will show here."}
            </p>
            {filter === "unread" && items.length > 0 ? (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setFilter("all")}
              >
                Show all
              </button>
            ) : null}
          </div>
        ) : (
          <ul className="notify-feed notify-feed-scroll">
            {filtered.map((n) => {
              const kind = inferNotificationKind(n);
              const Icon = notificationKindIcon(kind);
              const unread = !n.readAt;
              const isOpening = openingId === n.id;
              return (
                <li
                  key={n.id}
                  className={`notify-row${unread ? " is-unread" : ""}`}
                >
                  <div className="notify-icon" aria-hidden>
                    <Icon size={16} strokeWidth={1.75} />
                  </div>
                  <div className="notify-main">
                    <div className="notify-title-row">
                      <span className="notify-title">
                        {n.title}
                        {unread ? (
                          <span className="notify-dot" aria-label="Unread" />
                        ) : null}
                      </span>
                      <span className="notify-kind-pill">
                        {notificationKindLabel(kind)}
                      </span>
                      <span className="notify-time">
                        {formatRelativeTime(n.createdAt)}
                      </span>
                    </div>
                    <p className="notify-body">{n.body}</p>
                  </div>
                  <div className="notify-actions">
                    {n.href ? (
                      <TooltipAnchor label={isOpening ? "Opening…" : "View"}>
                        <button
                          type="button"
                          className="notify-icon-btn notify-icon-btn-primary"
                          disabled={isOpening}
                          onClick={() => openNotification(n)}
                          aria-label={isOpening ? "Opening" : "View"}
                        >
                          {isOpening ? (
                            <Loader2 size={15} strokeWidth={2} className="notify-spin" />
                          ) : (
                            <ArrowUpRight size={15} strokeWidth={2} />
                          )}
                        </button>
                      </TooltipAnchor>
                    ) : null}
                    {unread ? (
                      <TooltipAnchor label="Mark read">
                        <button
                          type="button"
                          className="notify-icon-btn"
                          onClick={() => markOne(n.id)}
                          aria-label="Mark read"
                        >
                          <Check size={15} strokeWidth={2} />
                        </button>
                      </TooltipAnchor>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
