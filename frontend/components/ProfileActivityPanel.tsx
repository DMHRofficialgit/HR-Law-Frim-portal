"use client";

import Link from "next/link";
import type { ReactElement, ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";

export type ProfileActivityRow = {
  id: string;
  title: string;
  meta: string;
  badge?: string;
  badgeTone?: "ok" | "progress" | "muted" | "warn";
  actions?: ReactNode;
};

type ProfileActivityPanelProps = {
  title: string;
  hrefAll: string;
  allLabel: string;
  empty: string;
  rows: ProfileActivityRow[];
};

export const ProfileActivityPanel = ({
  title,
  hrefAll,
  allLabel,
  empty,
  rows,
}: ProfileActivityPanelProps): ReactElement => {
  return (
    <section className="panel profile-activity">
      <div className="profile-activity-head">
        <h2>{title}</h2>
        <Link
          href={hrefAll}
          className="profile-icon-link"
          aria-label={allLabel}
          title={allLabel}
        >
          <ArrowUpRight size={15} strokeWidth={1.75} />
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="profile-activity-empty">{empty}</p>
      ) : (
        <div className="profile-activity-scroll dmhr-scroll">
          <table className="profile-activity-table">
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <span className="primary-cell">{row.title}</span>
                    <span className="secondary-cell">{row.meta}</span>
                  </td>
                  {row.badge ? (
                    <td className="profile-activity-badge-col">
                      <span
                        className={`status-pill status-pill-${row.badgeTone || "muted"}`}
                      >
                        {row.badge}
                      </span>
                    </td>
                  ) : (
                    <td className="profile-activity-badge-col" />
                  )}
                  <td className="profile-activity-actions-col">{row.actions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
