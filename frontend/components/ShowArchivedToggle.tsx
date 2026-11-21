"use client";

import { useId, type ReactElement } from "react";

type ShowArchivedToggleProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
};

export const ShowArchivedToggle = ({
  checked,
  onChange,
  disabled = false,
}: ShowArchivedToggleProps): ReactElement => {
  const id = useId();

  return (
    <label
      className={`show-archived-toggle${checked ? " is-on" : ""}${
        disabled ? " is-disabled" : ""
      }`}
      htmlFor={id}
    >
      <span className="show-archived-toggle-label">Show archived</span>
      <span className="show-archived-toggle-control" aria-hidden>
        <input
          id={id}
          type="checkbox"
          className="show-archived-toggle-input"
          role="switch"
          checked={checked}
          disabled={disabled}
          aria-label="Show archived"
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="show-archived-toggle-track">
          <span className="show-archived-toggle-thumb" />
        </span>
      </span>
    </label>
  );
};
