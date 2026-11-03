"use client";

import type { ReactElement } from "react";

type ChoiceOption<T extends string> = {
  value: T;
  label: string;
};

type ChoiceToggleProps<T extends string> = {
  label: string;
  value: T;
  options: readonly ChoiceOption<T>[];
  onChange: (value: T) => void;
  name?: string;
  /** Keep label for a11y but hide visually (compact segment controls). */
  hideLabel?: boolean;
};

export const ChoiceToggle = <T extends string>({
  label,
  value,
  options,
  onChange,
  name,
  hideLabel = false,
}: ChoiceToggleProps<T>): ReactElement => {
  const labelId = name ? `${name}-label` : undefined;
  return (
    <div className={`field field-full${hideLabel ? " choice-toggle-field-compact" : ""}`}>
      <span
        className={`field-label${hideLabel ? " sr-only" : ""}`}
        id={labelId}
      >
        {label}
      </span>
      <div
        className="choice-toggle"
        role="group"
        aria-labelledby={labelId}
        aria-label={hideLabel ? label : undefined}
      >
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              className={`choice-toggle-btn${active ? " active" : ""}`}
              aria-pressed={active}
              onClick={() => onChange(opt.value)}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};
