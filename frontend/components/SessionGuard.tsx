"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactElement } from "react";
import { refreshAccessSession } from "../lib/api";
import {
  accessTokenExpiresAtMs,
  forceSignOutToLogin,
  getRefreshToken,
  getSessionMeta,
  getToken,
} from "../lib/auth";

const WINDOW_ACTIVITY_EVENTS: Array<keyof WindowEventMap> = [
  "mousemove",
  "mousedown",
  "keydown",
  "scroll",
  "touchstart",
];

const WARN_BEFORE_IDLE_MS = 2 * 60 * 1000;
const PROACTIVE_REFRESH_LEAD_MS = 90 * 1000;

type SessionGuardProps = {
  enabled?: boolean;
};

/**
 * Enforces absolute 8h + idle 30m client-side, refreshes access JWT before expiry,
 * and shows a stay-signed-in warning near idle timeout.
 */
export const SessionGuard = ({ enabled = true }: SessionGuardProps): ReactElement | null => {
  const titleId = useId();
  const descId = useId();
  const [warningOpen, setWarningOpen] = useState(false);
  const lastActivityRef = useRef(Date.now());
  const warningShownRef = useRef(false);
  const endSessionRef = useRef<() => void>(() => undefined);

  const endSession = useCallback(() => {
    setWarningOpen(false);
    forceSignOutToLogin();
  }, []);

  endSessionRef.current = endSession;

  const markActivity = useCallback(() => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      return;
    }
    lastActivityRef.current = Date.now();
    if (warningShownRef.current) {
      warningShownRef.current = false;
      setWarningOpen(false);
    }
  }, []);

  const staySignedIn = useCallback(async () => {
    markActivity();
    const next = await refreshAccessSession();
    if (!next) {
      endSession();
    }
  }, [endSession, markActivity]);

  useEffect(() => {
    if (!enabled) return;

    for (const evt of WINDOW_ACTIVITY_EVENTS) {
      window.addEventListener(evt, markActivity, { passive: true });
    }
    document.addEventListener("visibilitychange", markActivity);

    const tick = window.setInterval(() => {
      if (!getToken() || !getRefreshToken()) return;

      const meta = getSessionMeta();
      const idleMinutes = meta?.idleMinutes ?? 30;
      const idleLimitMs = idleMinutes * 60 * 1000;
      const now = Date.now();

      if (meta?.absoluteExpiresAt) {
        const absoluteAt = Date.parse(meta.absoluteExpiresAt);
        if (!Number.isNaN(absoluteAt) && now >= absoluteAt) {
          endSessionRef.current();
          return;
        }
      }

      const idleFor = now - lastActivityRef.current;
      if (idleFor >= idleLimitMs) {
        endSessionRef.current();
        return;
      }

      if (!warningShownRef.current && idleFor >= idleLimitMs - WARN_BEFORE_IDLE_MS) {
        warningShownRef.current = true;
        setWarningOpen(true);
      }

      const expMs = accessTokenExpiresAtMs(getToken());
      if (expMs && expMs - now <= PROACTIVE_REFRESH_LEAD_MS) {
        void refreshAccessSession().then((token) => {
          if (!token) endSessionRef.current();
        });
      }
    }, 15_000);

    return () => {
      for (const evt of WINDOW_ACTIVITY_EVENTS) {
        window.removeEventListener(evt, markActivity);
      }
      document.removeEventListener("visibilitychange", markActivity);
      window.clearInterval(tick);
    };
  }, [enabled, markActivity]);

  if (!warningOpen) return null;

  return (
    <div
      className="org-dialog-root confirm-dialog-root"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) e.preventDefault();
      }}
    >
      <div
        className="org-dialog confirm-dialog-panel form-compact"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
      >
        <div className="confirm-dialog-body">
          <h2 id={titleId} className="confirm-dialog-title">
            Still there?
          </h2>
          <p id={descId} className="lead confirm-dialog-desc">
            Your session will end soon due to inactivity. Stay signed in to keep working.
          </p>
        </div>
        <div className="confirm-dialog-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={endSession}>
            Sign out
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void staySignedIn()}>
            Stay signed in
          </button>
        </div>
      </div>
    </div>
  );
};
