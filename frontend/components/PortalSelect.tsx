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
import { Check, ChevronDown } from "lucide-react";

export type PortalSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type PortalSelectProps = {
  value: string;
  options: PortalSelectOption[];
  onChange: (value: string) => void;
  id?: string;
  "aria-label"?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Show search when many options (default: auto if > 8) */
  searchable?: boolean;
  className?: string;
  /** Compact toolbar control */
  size?: "md" | "sm";
  name?: string;
  required?: boolean;
};

type MenuCoords = {
  top: number;
  left: number;
  width: number;
  openUp: boolean;
  maxHeight: number;
};

export const PortalSelect = ({
  value,
  options,
  onChange,
  id,
  "aria-label": ariaLabel,
  placeholder = "Select…",
  disabled = false,
  searchable,
  className = "",
  size = "md",
  name,
  required = false,
}: PortalSelectProps): ReactElement => {
  const listId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<MenuCoords | null>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [mounted, setMounted] = useState(false);

  const showSearch = searchable ?? options.length > 8;

  const selected = useMemo(
    () => options.find((o) => o.value === value) || null,
    [options, value]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const place = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const gap = 6;
    const preferDown = 280;
    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    const openUp = spaceBelow < 160 && spaceAbove > spaceBelow;
    const maxHeight = Math.min(280, openUp ? spaceAbove : spaceBelow);
    setCoords({
      top: openUp ? rect.top - gap : rect.bottom + gap,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8)),
      width: Math.max(rect.width, 180),
      openUp,
      maxHeight: Math.max(120, maxHeight),
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    place();
    const t = window.setTimeout(() => searchRef.current?.focus(), 10);
    return () => window.clearTimeout(t);
  }, [open, place]);

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
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setOpen(false);
      setQuery("");
    }
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        setQuery("");
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const idx = filtered.findIndex((o) => o.value === value && !o.disabled);
    setActiveIndex(idx >= 0 ? idx : filtered.findIndex((o) => !o.disabled));
  }, [open, filtered, value]);

  const pick = (next: string) => {
    onChange(next);
    setOpen(false);
    setQuery("");
    triggerRef.current?.focus();
  };

  const moveActive = (delta: number) => {
    if (!filtered.length) return;
    let i = activeIndex;
    for (let n = 0; n < filtered.length; n += 1) {
      i = (i + delta + filtered.length) % filtered.length;
      if (!filtered[i]?.disabled) {
        setActiveIndex(i);
        return;
      }
    }
  };

  const onTriggerKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen(true);
    }
  };

  const onListKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveActive(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveActive(-1);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIndex(filtered.findIndex((o) => !o.disabled));
    } else if (e.key === "End") {
      e.preventDefault();
      for (let i = filtered.length - 1; i >= 0; i -= 1) {
        if (!filtered[i]?.disabled) {
          setActiveIndex(i);
          break;
        }
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = filtered[activeIndex];
      if (opt && !opt.disabled) pick(opt.value);
    }
  };

  const panelStyle: CSSProperties = coords
    ? {
        position: "fixed",
        top: coords.openUp ? undefined : coords.top,
        bottom: coords.openUp ? window.innerHeight - coords.top : undefined,
        left: coords.left,
        width: coords.width,
        maxHeight: coords.maxHeight,
        zIndex: 4200,
      }
    : { position: "fixed", visibility: "hidden", top: 0, left: 0 };

  return (
    <div className={`portal-select${size === "sm" ? " is-sm" : ""} ${className}`.trim()}>
      {name ? (
        <input type="hidden" name={name} value={value} required={required} />
      ) : null}
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className={`portal-select-trigger${open ? " is-open" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
          if (open) setQuery("");
        }}
        onKeyDown={onTriggerKeyDown}
      >
        <span className={`portal-select-value${selected ? "" : " is-placeholder"}`}>
          {selected?.label || placeholder}
        </span>
        <ChevronDown size={16} strokeWidth={1.75} className="portal-select-chevron" aria-hidden />
      </button>

      {mounted && open
        ? createPortal(
            <div
              ref={panelRef}
              className={`portal-select-panel${coords?.openUp ? " opens-up" : ""}`}
              style={panelStyle}
              onKeyDown={onListKeyDown}
            >
              {showSearch ? (
                <div className="portal-select-search">
                  <input
                    ref={searchRef}
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search…"
                    aria-label="Search options"
                    autoComplete="off"
                  />
                </div>
              ) : null}
              <ul
                id={listId}
                className="portal-select-list dmhr-scroll"
                role="listbox"
                aria-label={ariaLabel || "Options"}
              >
                {filtered.length === 0 ? (
                  <li className="portal-select-empty">No matches</li>
                ) : (
                  filtered.map((opt, i) => {
                    const active = i === activeIndex;
                    const isSelected = opt.value === value;
                    return (
                      <li key={`${opt.value}-${i}`} role="presentation">
                        <button
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          disabled={opt.disabled}
                          className={`portal-select-option${active ? " is-active" : ""}${
                            isSelected ? " is-selected" : ""
                          }`}
                          onMouseEnter={() => setActiveIndex(i)}
                          onClick={() => {
                            if (!opt.disabled) pick(opt.value);
                          }}
                        >
                          <span>{opt.label}</span>
                          {isSelected ? (
                            <Check size={14} strokeWidth={2} aria-hidden />
                          ) : null}
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>,
            document.body
          )
        : null}
    </div>
  );
};
