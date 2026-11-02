"use client";

import type { ReactElement } from "react";
import type { OnboardingRun } from "../lib/onboarding";
import { journeyStages } from "../lib/onboarding";

type OnboardingStageListProps = {
  run: OnboardingRun;
  className?: string;
};

export const OnboardingStageList = ({
  run,
  className = "",
}: OnboardingStageListProps): ReactElement => {
  const stages = journeyStages(run);
  const doneCount = stages.filter((s) => s.done).length;
  const percent = stages.length ? Math.round((doneCount / stages.length) * 100) : 0;

  return (
    <div className={`onb-stage-block ${className}`.trim()}>
      <div className="row-top onb-stage-progress-meta">
        <strong>Overall progress</strong>
        <strong>
          {doneCount} of {stages.length} stages · {percent}%
        </strong>
      </div>
      <div
        className="progress-track"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Onboarding ${percent} percent complete`}
      >
        <div className="progress-fill" style={{ width: `${percent}%` }} />
      </div>
      <ul className="stage-list">
        {stages.map((s) => (
          <li key={s.key} className={s.done ? "done" : ""}>
            <strong>{s.name}</strong>
            <span>{s.status}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};
