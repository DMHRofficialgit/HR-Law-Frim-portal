"use client";

import type { CSSProperties, ReactElement } from "react";

type SkeletonProps = {
  className?: string;
  width?: string | number;
  height?: string | number;
  radius?: string | number;
  style?: CSSProperties;
  "aria-hidden"?: boolean;
};

export const Skeleton = ({
  className = "",
  width,
  height,
  radius,
  style,
  "aria-hidden": ariaHidden = true,
}: SkeletonProps): ReactElement => {
  return (
    <span
      className={`ui-skeleton ${className}`.trim()}
      aria-hidden={ariaHidden}
      style={{
        width,
        height,
        borderRadius: radius,
        ...style,
      }}
    />
  );
};

type TableSkeletonProps = {
  rows?: number;
  cols?: number;
  className?: string;
};

export const TableSkeleton = ({
  rows = 6,
  cols = 5,
  className = "",
}: TableSkeletonProps): ReactElement => {
  return (
    <div className={`table-wrap skeleton-table-wrap ${className}`.trim()} aria-busy="true" aria-live="polite">
      <table className="data-table skeleton-table">
        <thead>
          <tr>
            {Array.from({ length: cols }).map((_, i) => (
              <th key={`h-${i}`}>
                <Skeleton className="ui-skeleton-line" height={10} width={i === 0 ? "70%" : "48%"} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={`r-${r}`}>
              {Array.from({ length: cols }).map((_, c) => (
                <td key={`c-${r}-${c}`}>
                  <div className="skeleton-cell">
                    {c === 0 ? (
                      <>
                        <Skeleton className="ui-skeleton-avatar" />
                        <div className="skeleton-cell-text">
                          <Skeleton className="ui-skeleton-line" height={11} width="72%" />
                          <Skeleton className="ui-skeleton-line" height={9} width="44%" />
                        </div>
                      </>
                    ) : (
                      <Skeleton
                        className="ui-skeleton-line"
                        height={10}
                        width={c === cols - 1 ? 28 : `${40 + ((r + c) % 3) * 12}%`}
                      />
                    )}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <span className="sr-only">Loading…</span>
    </div>
  );
};

type ListSkeletonProps = {
  rows?: number;
  className?: string;
  showAvatar?: boolean;
};

export const ListSkeleton = ({
  rows = 5,
  className = "",
  showAvatar = true,
}: ListSkeletonProps): ReactElement => {
  return (
    <ul className={`skeleton-list ${className}`.trim()} aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="skeleton-list-row">
          {showAvatar ? <Skeleton className="ui-skeleton-chip" /> : null}
          <div className="skeleton-list-main">
            <Skeleton className="ui-skeleton-line" height={12} width={`${58 + (i % 3) * 10}%`} />
            <Skeleton className="ui-skeleton-line" height={9} width={`${36 + (i % 4) * 8}%`} />
          </div>
          <div className="skeleton-list-actions">
            <Skeleton className="ui-skeleton-icon" />
            <Skeleton className="ui-skeleton-icon" />
          </div>
        </li>
      ))}
      <span className="sr-only">Loading…</span>
    </ul>
  );
};

type PanelSkeletonProps = {
  lines?: number;
  className?: string;
};

export const PanelSkeleton = ({
  lines = 4,
  className = "",
}: PanelSkeletonProps): ReactElement => {
  return (
    <div className={`skeleton-panel ${className}`.trim()} aria-busy="true" aria-live="polite">
      <Skeleton className="ui-skeleton-line" height={14} width="36%" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className="ui-skeleton-line"
          height={10}
          width={`${70 - i * 8}%`}
        />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
};

type MetricSkeletonProps = {
  count?: number;
  className?: string;
};

export const MetricSkeleton = ({
  count = 4,
  className = "",
}: MetricSkeletonProps): ReactElement => {
  return (
    <div className={`skeleton-metrics ${className}`.trim()} aria-busy="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton-metric">
          <Skeleton className="ui-skeleton-line" height={18} width="40%" />
          <Skeleton className="ui-skeleton-line" height={10} width="55%" />
        </div>
      ))}
    </div>
  );
};
