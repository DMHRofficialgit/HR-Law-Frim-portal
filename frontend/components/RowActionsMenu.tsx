"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";

export type RowActionItem = {
  id: string;
  label: string;
  onSelect: () => void;
  tone?: "default" | "danger";
  disabled?: boolean;
  separatorBefore?: boolean;
};

type RowActionsMenuProps = {
  label: string;
  items: RowActionItem[];
};

type MenuCoords = {
  top: number;
  left: number;
  openUp: boolean;
};

export const RowActionsMenu = ({ label, items }: RowActionsMenuProps): ReactElement => {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<MenuCoords | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const placeMenu = () => {
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const panelHeight = panel?.offsetHeight || items.length * 36 + 16;
    const panelWidth = panel?.offsetWidth || 168;
    const gap = 4;
    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const openUp = spaceBelow < panelHeight && rect.top > spaceBelow;
    const top = openUp ? rect.top - gap - panelHeight : rect.bottom + gap;
    let left = rect.right - panelWidth;
    left = Math.max(8, Math.min(left, window.innerWidth - panelWidth - 8));
    setCoords({
      top: Math.max(8, top),
      left,
      openUp,
    });
  };

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    placeMenu();
  }, [open, items.length]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onReposition() {
      placeMenu();
    }
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open, items.length]);

  const panelStyle: CSSProperties | undefined = coords
    ? {
        position: "fixed",
        top: coords.top,
        left: coords.left,
        right: "auto",
        zIndex: 200,
      }
    : { position: "fixed", visibility: "hidden", top: 0, left: 0 };

  return (
    <div className="row-menu" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="row-menu-trigger"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreHorizontal size={16} strokeWidth={1.75} />
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={panelRef}
              className={`row-menu-panel${coords?.openUp ? " opens-up" : ""}`}
              role="menu"
              id={menuId}
              style={panelStyle}
            >
              {items.map((item) => (
                <div key={item.id}>
                  {item.separatorBefore ? (
                    <div className="row-menu-sep" role="separator" />
                  ) : null}
                  <button
                    type="button"
                    role="menuitem"
                    className={`row-menu-item${item.tone === "danger" ? " danger" : ""}`}
                    disabled={item.disabled}
                    onClick={() => {
                      setOpen(false);
                      item.onSelect();
                    }}
                  >
                    {item.label}
                  </button>
                </div>
              ))}
            </div>,
            document.body
          )
        : null}
    </div>
  );
};
