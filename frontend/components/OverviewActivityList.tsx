"use client";

import { useRouter } from "next/navigation";
import type { ReactElement } from "react";
import { ListSkeleton } from "./Skeleton";
import {
  formatRelativeTime,
  inferNotificationKind,
  notificationKindIcon,
  notificationKindLabel,
  type PortalNotification,
} from "../lib/notifications";

type OverviewActivityListProps = {
  items: PortalNotification[];
  loading?: boolean;
  emptyLabel?: string;
  limit?: number;
};

export const OverviewActivityList = ({
  items,
  loading = false,
  emptyLabel = "No recent activity yet.",
  limit = 8,
}: OverviewActivityListProps): ReactElement => {
  const router = useRouter();
  const shown = items.slice(0, limit);

  if (loading) {
    return <ListSkeleton rows={4} showAvatar={false} />;
  }

  if (shown.length === 0) {
    return (
      <p className="lead" style={{ margin: 0 }}>
        {emptyLabel}
      </p>
    );
  }

  return (
    <ul className="overview-activity-list">
      {shown.map((n) => {
        const kind = inferNotificationKind(n);
        const Icon = notificationKindIcon(kind);
        const clickable = Boolean(n.href);
        return (
          <li key={n.id}>
            <button
              type="button"
              className="overview-activity-row"
              disabled={!clickable}
              onClick={() => {
                if (n.href) router.push(n.href);
              }}
            >
              <span className="overview-activity-icon" aria-hidden>
                <Icon size={15} strokeWidth={1.75} />
              </span>
              <span className="overview-activity-body">
                <span className="overview-activity-title">{n.title}</span>
                <span className="overview-activity-meta">
                  {notificationKindLabel(kind)} · {formatRelativeTime(n.createdAt)}
                  {!n.readAt ? " · Unread" : ""}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
};
