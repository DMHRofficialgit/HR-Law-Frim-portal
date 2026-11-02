"use client";

import { useId, type ReactElement } from "react";

type StatusLiquidToggleProps = {
  label: string;
  value: "active" | "inactive";
  onChange: (value: "active" | "inactive") => void;
  name?: string;
  /** When true, spans full form-grid row (default false for compact dialogs). */
  fullWidth?: boolean;
};

/** 21st liquid-toggle adapted: Active = green, Inactive = red. */
export const StatusLiquidToggle = ({
  label,
  value,
  onChange,
  name,
  fullWidth = false,
}: StatusLiquidToggleProps): ReactElement => {
  const reactId = useId();
  const filterId = `status-goo-${reactId.replace(/:/g, "")}`;
  const inputId = name ? `${name}-input` : `status-toggle-${reactId}`;
  const checked = value === "active";

  return (
    <div className={`field${fullWidth ? " field-full" : ""}`}>
      <span className="field-label" id={name ? `${name}-label` : undefined}>
        {label}
      </span>
      <div
        className="status-liquid"
        role="group"
        aria-labelledby={name ? `${name}-label` : undefined}
      >
        <span
          className={`status-liquid-caption${checked ? "" : " is-on"}`}
          aria-hidden
        >
          Inactive
        </span>
        <label className="status-liquid-switch" htmlFor={inputId}>
          <input
            id={inputId}
            type="checkbox"
            className="status-liquid-input"
            checked={checked}
            aria-label={checked ? "Active" : "Inactive"}
            onChange={(e) => onChange(e.target.checked ? "active" : "inactive")}
          />
          <svg viewBox="0 0 52 32" filter={`url(#${filterId})`} className="status-liquid-svg" aria-hidden>
            <circle
              className="status-liquid-blob"
              cx="16"
              cy="16"
              r="10"
              style={{
                transformOrigin: "16px 16px",
                transform: `translateX(${checked ? "12px" : "0px"}) scale(${checked ? "0" : "1"})`,
              }}
            />
            <circle
              className="status-liquid-blob"
              cx="36"
              cy="16"
              r="10"
              style={{
                transformOrigin: "36px 16px",
                transform: `translateX(${checked ? "0px" : "-12px"}) scale(${checked ? "1" : "0"})`,
              }}
            />
            {checked ? (
              <circle className="status-liquid-drop" cx="35" cy="-1" r="2.5" />
            ) : null}
          </svg>
          <svg className="status-liquid-filter" aria-hidden>
            <defs>
              <filter id={filterId}>
                <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
                <feColorMatrix
                  in="blur"
                  mode="matrix"
                  values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7"
                  result="goo"
                />
                <feComposite in="SourceGraphic" in2="goo" operator="atop" />
              </filter>
            </defs>
          </svg>
        </label>
        <span
          className={`status-liquid-caption${checked ? " is-on" : ""}`}
          aria-hidden
        >
          Active
        </span>
      </div>
    </div>
  );
};
