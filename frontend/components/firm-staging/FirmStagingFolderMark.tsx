"use client";

import type { ReactElement } from "react";

type FirmStagingFolderMarkProps = {
  label?: string;
  selected?: boolean;
  className?: string;
};

/** CSS adaptation of 21st.dev folder-components (blue glass) — no framer-motion. */
export const FirmStagingFolderMark = ({
  label,
  selected = false,
  className = "",
}: FirmStagingFolderMarkProps): ReactElement => {
  return (
    <div
      className={`firm-staging-mark${selected ? " is-selected" : ""}${className ? ` ${className}` : ""}`}
      aria-hidden
    >
      <div className="firm-staging-mark-papers">
        <span className="firm-staging-mark-paper firm-staging-mark-paper-back-r" />
        <span className="firm-staging-mark-paper firm-staging-mark-paper-back-l" />
        <span className="firm-staging-mark-paper firm-staging-mark-paper-front">
          <i />
          <i />
          <i />
        </span>
      </div>
      <div className="firm-staging-mark-flap">
        <span className="firm-staging-mark-tab-l" />
        <span className="firm-staging-mark-tab-r" />
        <span className="firm-staging-mark-flap-body" />
      </div>
      {label ? <span className="firm-staging-mark-label">{label}</span> : null}
    </div>
  );
};
