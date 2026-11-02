"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export type TooltipSide = "top" | "bottom" | "auto";

type TooltipAnchorProps = {
  label: string;
  children: ReactNode;
  side?: TooltipSide;
  className?: string;
};

type TipPos = {
  top: number;
  left: number;
  placed: "top" | "bottom";
};

const GAP = 8;

const placeTip = (anchor: DOMRect, prefer: TooltipSide): TipPos => {
  const spaceAbove = anchor.top;
  const spaceBelow = window.innerHeight - anchor.bottom;
  let placed: "top" | "bottom" = "top";
  if (prefer === "bottom") placed = "bottom";
  else if (prefer === "top") placed = "top";
  else placed = spaceAbove >= 36 || spaceAbove >= spaceBelow ? "top" : "bottom";

  if (placed === "top" && spaceAbove < 28 && spaceBelow > spaceAbove) placed = "bottom";
  if (placed === "bottom" && spaceBelow < 28 && spaceAbove > spaceBelow) placed = "top";

  return {
    top: placed === "top" ? anchor.top - GAP : anchor.bottom + GAP,
    left: anchor.left + anchor.width / 2,
    placed,
  };
};

/** Wraps any control and shows a portaled tooltip (escapes overflow:auto). */
export const TooltipAnchor = ({
  label,
  children,
  side = "auto",
  className = "",
}: TooltipAnchorProps): ReactElement => {
  const tipId = useId();
  const wrapRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<TipPos | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const dismiss = () => setOpen(false);
    window.addEventListener("dmhr:dismiss-tooltips", dismiss);
    return () => window.removeEventListener("dmhr:dismiss-tooltips", dismiss);
  }, []);

  const updatePos = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    setPos(placeTip(el.getBoundingClientRect(), side));
  }, [side]);

  const show = useCallback(() => {
    updatePos();
    setOpen(true);
  }, [updatePos]);

  const hide = useCallback(() => {
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onMove = () => updatePos();
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open, updatePos]);

  const onBlur = (e: FocusEvent<HTMLSpanElement>) => {
    const next = e.relatedTarget as Node | null;
    if (wrapRef.current?.contains(next)) return;
    hide();
  };

  return (
    <span
      ref={wrapRef}
      className={`ui-tooltip-anchor ${className}`.trim()}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={onBlur}
    >
      {children}
      {mounted && open && pos
        ? createPortal(
            <span
              id={tipId}
              role="tooltip"
              className={`ui-tooltip-portal${pos.placed === "bottom" ? " is-bottom" : ""}`}
              style={{ top: pos.top, left: pos.left }}
            >
              {label}
            </span>,
            document.body
          )
        : null}
    </span>
  );
};
