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
};

export const ChoiceToggle = <T extends string>({
  label,
  value,
  options,
  onChange,
  name,
}: ChoiceToggleProps<T>): ReactElement => {
  return (
    <div className="field field-full">
      <span className="field-label" id={name ? `${name}-label` : undefined}>
        {label}
      </span>
      <div
        className="choice-toggle"
        role="group"
        aria-labelledby={name ? `${name}-label` : undefined}
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
