"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactElement,
} from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react";

export type PortalDateRangeValue = {
  from: string;
  to: string;
};

type PortalDateRangeProps = {
  from: string;
  to: string;
  onChange: (next: PortalDateRangeValue) => void;
  "aria-label"?: string;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
};

type MenuCoords = {
  top: number;
  left: number;
  openUp: boolean;
  maxHeight: number;
};

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;

const pad2 = (n: number): string => String(n).padStart(2, "0");

const toIsoDate = (d: Date): string =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const parseIsoDate = (iso: string): Date | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, day] = iso.split("-").map(Number);
  const d = new Date(y, m - 1, day);
  if (d.getFullYear() !== y || d.getMonth() !== m - 1 || d.getDate() !== day) {
    return null;
  }
  return d;
};

const startOfMonth = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), 1);

const addMonths = (d: Date, delta: number): Date =>
  new Date(d.getFullYear(), d.getMonth() + delta, 1);

const sameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const formatShort = (iso: string): string => {
  const d = parseIsoDate(iso);
  if (!d) return iso;
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const formatMonthTitle = (d: Date): string =>
  d.toLocaleDateString(undefined, { month: "long", year: "numeric" });

const buildMonthCells = (month: Date): (Date | null)[] => {
  const first = startOfMonth(month);
  const startPad = first.getDay();
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startPad; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(first.getFullYear(), first.getMonth(), day));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
};

export const PortalDateRange = ({
  from,
  to,
  onChange,
  "aria-label": ariaLabel = "Date range",
  className = "",
  disabled = false,
  placeholder = "Any dates",
}: PortalDateRangeProps): ReactElement => {
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<MenuCoords | null>(null);
  const [mounted, setMounted] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()));
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);
  const [picking, setPicking] = useState<"from" | "to">("from");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setDraftFrom(from);
    setDraftTo(to);
    setPicking(from && !to ? "to" : "from");
    const anchor = parseIsoDate(from) || parseIsoDate(to) || new Date();
    setViewMonth(startOfMonth(anchor));
  }, [open, from, to]);

  const place = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const gap = 6;
    const panelW = 292;
    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    const openUp = spaceBelow < 320 && spaceAbove > spaceBelow;
    const maxHeight = Math.min(360, openUp ? spaceAbove : spaceBelow);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - panelW - 8));
    setCoords({
      top: openUp ? rect.top - gap : rect.bottom + gap,
      left,
      openUp,
      maxHeight: Math.max(260, maxHeight),
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    place();
  }, [open, place, viewMonth]);

  useEffect(() => {
    if (!open) return;
    const onScroll = () => place();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const cells = useMemo(() => buildMonthCells(viewMonth), [viewMonth]);
  const today = useMemo(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  }, []);

  const draftFromDate = parseIsoDate(draftFrom);
  const draftToDate = parseIsoDate(draftTo);

  const label = useMemo(() => {
    if (from && to) return `${formatShort(from)} – ${formatShort(to)}`;
    if (from) return `From ${formatShort(from)}`;
    if (to) return `Until ${formatShort(to)}`;
    return placeholder;
  }, [from, to, placeholder]);

  const commit = (nextFrom: string, nextTo: string) => {
    onChange({ from: nextFrom, to: nextTo });
  };

  const pickDay = (day: Date) => {
    const iso = toIsoDate(day);
    if (picking === "from" || !draftFrom || (draftFrom && draftTo)) {
      setDraftFrom(iso);
      setDraftTo("");
      setPicking("to");
      commit(iso, "");
      return;
    }
    const start = parseIsoDate(draftFrom);
    if (!start) {
      setDraftFrom(iso);
      setPicking("to");
      commit(iso, "");
      return;
    }
    if (day.getTime() < start.getTime()) {
      setDraftFrom(iso);
      setDraftTo(toIsoDate(start));
      setPicking("from");
      commit(iso, toIsoDate(start));
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    setDraftTo(iso);
    setPicking("from");
    commit(draftFrom, iso);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const clearRange = () => {
    setDraftFrom("");
    setDraftTo("");
    setPicking("from");
    commit("", "");
  };

  const goToday = () => {
    const iso = toIsoDate(today);
    setViewMonth(startOfMonth(today));
    setDraftFrom(iso);
    setDraftTo(iso);
    setPicking("from");
    commit(iso, iso);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onTriggerKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!disabled) setOpen(true);
    }
  };

  const inRange = (day: Date): boolean => {
    if (!draftFromDate || !draftToDate) return false;
    const t = day.getTime();
    return t > draftFromDate.getTime() && t < draftToDate.getTime();
  };

  const panelStyle: CSSProperties = coords
    ? {
        position: "fixed",
        top: coords.openUp ? undefined : coords.top,
        bottom: coords.openUp ? window.innerHeight - coords.top : undefined,
        left: coords.left,
        width: 292,
        maxHeight: coords.maxHeight,
        zIndex: 4200,
      }
    : { position: "fixed", visibility: "hidden", top: 0, left: 0 };

  const hasValue = Boolean(from || to);

  return (
    <div className={`portal-date-range ${className}`.trim()}>
      <div className="portal-date-range-control">
        <button
          ref={triggerRef}
          type="button"
          className={`portal-date-range-trigger${open ? " is-open" : ""}${
            hasValue ? "" : " is-placeholder"
          }`}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          aria-label={ariaLabel}
          disabled={disabled}
          onClick={() => {
            if (!disabled) setOpen((v) => !v);
          }}
          onKeyDown={onTriggerKeyDown}
        >
          <Calendar size={14} strokeWidth={1.75} aria-hidden />
          <span className="portal-date-range-label">{label}</span>
        </button>
        {hasValue ? (
          <button
            type="button"
            className="portal-date-range-clear"
            aria-label="Clear dates"
            disabled={disabled}
            onClick={clearRange}
          >
            <X size={14} strokeWidth={1.75} />
          </button>
        ) : null}
      </div>

      {mounted && open
        ? createPortal(
            <div
              ref={panelRef}
              id={panelId}
              className={`portal-date-range-panel${coords?.openUp ? " opens-up" : ""}`}
              style={panelStyle}
              role="dialog"
              aria-label={ariaLabel}
            >
              <div className="portal-date-range-head">
                <button
                  type="button"
                  className="shell-icon-btn"
                  aria-label="Previous month"
                  onClick={() => setViewMonth((m) => addMonths(m, -1))}
                >
                  <ChevronLeft size={16} strokeWidth={1.75} />
                </button>
                <div className="portal-date-range-month">{formatMonthTitle(viewMonth)}</div>
                <button
                  type="button"
                  className="shell-icon-btn"
                  aria-label="Next month"
                  onClick={() => setViewMonth((m) => addMonths(m, 1))}
                >
                  <ChevronRight size={16} strokeWidth={1.75} />
                </button>
              </div>

              <p className="portal-date-range-hint">
                {picking === "to" ? "Select end date" : "Select start date"}
              </p>

              <div className="portal-date-range-weekdays" aria-hidden>
                {WEEKDAYS.map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </div>

              <div className="portal-date-range-grid" role="grid" aria-label={formatMonthTitle(viewMonth)}>
                {cells.map((day, i) => {
                  if (!day) {
                    return <span key={`e-${i}`} className="portal-date-range-cell is-empty" />;
                  }
                  const iso = toIsoDate(day);
                  const isStart = draftFromDate ? sameDay(day, draftFromDate) : false;
                  const isEnd = draftToDate ? sameDay(day, draftToDate) : false;
                  const isToday = sameDay(day, today);
                  const mid = inRange(day);
                  return (
                    <button
                      key={iso}
                      type="button"
                      className={`portal-date-range-cell${isStart || isEnd ? " is-selected" : ""}${
                        mid ? " is-in-range" : ""
                      }${isToday ? " is-today" : ""}`}
                      aria-label={formatShort(iso)}
                      aria-pressed={isStart || isEnd}
                      onClick={() => pickDay(day)}
                    >
                      {day.getDate()}
                    </button>
                  );
                })}
              </div>

              <div className="portal-date-range-foot">
                <button type="button" className="btn btn-ghost btn-sm" onClick={clearRange}>
                  Clear
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={goToday}>
                  Today
                </button>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
};
