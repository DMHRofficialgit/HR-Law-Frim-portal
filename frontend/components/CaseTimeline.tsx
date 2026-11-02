"use client";

import { useEffect, useState, type ReactElement } from "react";
import { Lock, MessageSquare, RefreshCw } from "lucide-react";
import {
  caseMessageKind,
  caseMessageTitle,
  formatCaseDateTime,
  formatCaseRelativeTime,
  groupCaseMessagesByDay,
  type CaseMessage,
} from "../lib/cases";

type CaseTimelineProps = {
  messages: CaseMessage[];
  role: "admin" | "client";
  title?: string;
  lead?: string;
  emptyText?: string;
};

const KindIcon = ({ kind }: { kind: "system" | "private" | "client" }): ReactElement => {
  const size = 10;
  const stroke = 1.75;
  if (kind === "private") return <Lock size={size} strokeWidth={stroke} aria-hidden />;
  if (kind === "system") return <RefreshCw size={size} strokeWidth={stroke} aria-hidden />;
  return <MessageSquare size={size} strokeWidth={stroke} aria-hidden />;
};

/** Re-render on an interval so relative times ("7m ago") stay fresh. */
const useRelativeClock = (intervalMs = 30000): number => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") setNow(Date.now());
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs]);
  return now;
};

export const CaseTimeline = ({
  messages,
  role,
  title = "Updates & timeline",
  lead,
  emptyText = "No updates yet.",
}: CaseTimelineProps): ReactElement => {
  const now = useRelativeClock(30000);
  const groups = groupCaseMessagesByDay(messages);
  const count = messages.length;
  const defaultLead =
    role === "admin"
      ? "Client-visible updates appear in the portal. Internal notes remain private."
      : "Updates from DM.HR Group and your replies.";

  return (
    <section className="panel case-hub-panel case-hub-panel--timeline">
      <div className="case-hub-panel-head case-timeline-head">
        <div>
          <h2>{title}</h2>
          <p className="lead">{lead || defaultLead}</p>
        </div>
        {count > 0 ? (
          <span className="case-timeline-count">
            {count} {count === 1 ? "update" : "updates"}
          </span>
        ) : null}
      </div>

      <div className="case-hub-panel-scroll">
        {count === 0 ? (
          <p className="lead" style={{ margin: 0 }}>
            {emptyText}
          </p>
        ) : (
          <div className="case-timeline-groups">
            {groups.map((group) => (
              <div key={group.key} className="case-timeline-day">
                <div className="case-timeline-day-head">
                  <span className="case-timeline-day-label">{group.label}</span>
                  <span className="case-timeline-day-count">
                    {group.items.length}{" "}
                    {group.items.length === 1 ? "update" : "updates"}
                  </span>
                </div>
                <ul className="case-timeline">
                  {group.items.map((m) => {
                    const kind = caseMessageKind(m);
                    const rowTitle = caseMessageTitle(m, role);
                    const actor = m.author?.name || "System";
                    const absolute = formatCaseDateTime(m.createdAt);
                    return (
                      <li
                        key={m.id}
                        className={`case-timeline-item is-${kind}`}
                      >
                        <div className="case-timeline-icon" aria-hidden>
                          <KindIcon kind={kind} />
                        </div>
                        <div className="case-timeline-body">
                          <div className="case-timeline-top">
                            <div className="case-timeline-title">{rowTitle}</div>
                            <time
                              className="case-timeline-time"
                              dateTime={m.createdAt}
                              title={absolute}
                            >
                              {formatCaseRelativeTime(m.createdAt, now)}
                            </time>
                          </div>
                          {kind !== "system" ? (
                            <p className="case-timeline-text">{m.body}</p>
                          ) : null}
                          <div className="case-timeline-foot">
                            <span className="case-timeline-actor">{actor}</span>
                            {kind === "private" ? (
                              <span className="case-timeline-badge">Private</span>
                            ) : null}
                            {kind === "client" ? (
                              <span className="case-timeline-badge is-client">
                                Visible to client
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
