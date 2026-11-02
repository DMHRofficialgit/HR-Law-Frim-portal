"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { Building2, Briefcase, FileText, Search, X } from "lucide-react";
import { apiFetch } from "../lib/api";
import { getToken } from "../lib/auth";
import type { NavItem } from "../lib/nav";
import { TooltipAnchor } from "./TooltipAnchor";

export type PortalSearchHit = {
  id: string;
  label: string;
  hint?: string;
  href: string;
  group: string;
  icon?: "nav" | "org" | "case" | "doc";
};

type PortalSearchProps = {
  /** shell = header trigger + palette; inline = embedded filter field */
  mode?: "shell" | "inline";
  nav: NavItem[];
  role: "admin" | "client";
  /** Extra static hits (page-specific). */
  extraHits?: PortalSearchHit[];
  /** Controlled query for inline filters. */
  value?: string;
  onQueryChange?: (q: string) => void;
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
};

type OrgHit = { id: string; name: string; ref: string | null };
type CaseHit = {
  id: string;
  ref: string;
  title: string;
  organisation?: { name: string };
};

function matchQuery(q: string, ...parts: Array<string | null | undefined>) {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return parts.some((p) => (p || "").toLowerCase().includes(needle));
}

function HitIcon({ kind }: { kind?: PortalSearchHit["icon"] }): ReactNode {
  const props = { size: 16, strokeWidth: 1.75, "aria-hidden": true as const };
  if (kind === "org") return <Building2 {...props} />;
  if (kind === "case") return <Briefcase {...props} />;
  if (kind === "doc") return <FileText {...props} />;
  return <Search {...props} />;
}

export function PortalSearch({
  mode = "shell",
  nav,
  role,
  extraHits = [],
  value,
  onQueryChange,
  placeholder,
  className,
  "aria-label": ariaLabel,
}: PortalSearchProps) {
  const router = useRouter();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value || "");
  const [active, setActive] = useState(0);
  const [orgs, setOrgs] = useState<OrgHit[]>([]);
  const [cases, setCases] = useState<CaseHit[]>([]);
  const [loadingExtra, setLoadingExtra] = useState(false);

  const isInline = mode === "inline";
  const effectiveQuery = value !== undefined ? value : query;

  const setQ = useCallback(
    (next: string) => {
      if (value === undefined) setQuery(next);
      onQueryChange?.(next);
    },
    [onQueryChange, value]
  );

  const loadHits = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setLoadingExtra(true);
    try {
      if (role === "admin") {
        const [orgRes, caseRes] = await Promise.all([
          apiFetch<{ organisations: OrgHit[] }>("/admin/organisations", { token }),
          apiFetch<{ cases: CaseHit[] }>("/admin/cases", { token }),
        ]);
        if (orgRes.success) setOrgs(orgRes.data.organisations);
        if (caseRes.success) setCases(caseRes.data.cases.slice(0, 40));
      } else {
        const caseRes = await apiFetch<{ cases: CaseHit[] }>("/client/cases", { token });
        if (caseRes.success) setCases(caseRes.data.cases.slice(0, 40));
      }
    } finally {
      setLoadingExtra(false);
    }
  }, [role]);

  useEffect(() => {
    if (!open || isInline) return;
    loadHits();
    const t = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [open, isInline, loadHits]);

  useEffect(() => {
    if (isInline) return;
    function onKey(e: globalThis.KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isInline]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const hits = useMemo(() => {
    const q = effectiveQuery;
    const navHits: PortalSearchHit[] = nav
      .filter((n) => !n.soon && matchQuery(q, n.label, n.href))
      .map((n) => ({
        id: `nav-${n.href}`,
        label: n.label,
        hint: "Go to page",
        href: n.href,
        group: "Pages",
        icon: "nav" as const,
      }));

    const orgHits: PortalSearchHit[] =
      role === "admin"
        ? orgs
            .filter((o) => matchQuery(q, o.name, o.ref))
            .slice(0, 8)
            .map((o) => ({
              id: `org-${o.id}`,
              label: o.name,
              hint: o.ref || "Organisation",
              href: `/admin/documents?org=${encodeURIComponent(o.id)}`,
              group: "Organisations",
              icon: "org" as const,
            }))
        : [];

    const caseHits: PortalSearchHit[] = cases
      .filter((c) => matchQuery(q, c.ref, c.title, c.organisation?.name))
      .slice(0, 8)
      .map((c) => ({
        id: `case-${c.id}`,
        label: c.ref,
        hint: `${c.title}${c.organisation?.name ? ` · ${c.organisation.name}` : ""}`,
        href: role === "admin" ? `/admin/cases/${c.id}` : `/portal/cases/${c.id}`,
        group: "Cases",
        icon: "case" as const,
      }));

    const extras = extraHits.filter((h) => matchQuery(q, h.label, h.hint, h.href));

    return [...navHits, ...orgHits, ...caseHits, ...extras];
  }, [effectiveQuery, nav, orgs, cases, role, extraHits]);

  const grouped = useMemo(() => {
    const map = new Map<string, PortalSearchHit[]>();
    for (const hit of hits) {
      const list = map.get(hit.group) || [];
      list.push(hit);
      map.set(hit.group, list);
    }
    return [...map.entries()];
  }, [hits]);

  useEffect(() => {
    setActive(0);
  }, [effectiveQuery, open]);

  function go(hit: PortalSearchHit) {
    setOpen(false);
    setQ("");
    router.push(hit.href);
  }

  function onInputKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!hits.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % hits.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + hits.length) % hits.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = hits[active];
      if (hit) go(hit);
    }
  }

  const [modKey, setModKey] = useState("Ctrl");
  useEffect(() => {
    const mac = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);
    setModKey(mac ? "⌘" : "Ctrl");
  }, []);

  if (isInline) {
    return (
      <label className={`portal-search portal-search-inline ${className || ""}`.trim()}>
        <Search className="portal-search-ico" size={16} strokeWidth={1.75} aria-hidden />
        <input
          ref={inputRef}
          type="search"
          value={effectiveQuery}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder || "Search…"}
          aria-label={ariaLabel || "Search"}
        />
        {effectiveQuery ? (
          <button
            type="button"
            className="portal-search-clear"
            aria-label="Clear search"
            onClick={() => setQ("")}
          >
            <X size={14} strokeWidth={1.75} />
          </button>
        ) : null}
      </label>
    );
  }

  return (
    <>
      <button
        type="button"
        className={`portal-search-trigger ${className || ""}`.trim()}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel || "Search portal"}
      >
        <Search size={16} strokeWidth={1.75} aria-hidden />
        <span className="portal-search-trigger-label">
          {placeholder || "Search portal…"}
        </span>
        <kbd className="portal-search-kbd">
          {modKey}K
        </kbd>
      </button>

      {open ? (
        <div
          className="portal-search-root"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <button
            type="button"
            className="portal-search-backdrop"
            aria-label="Close search"
            onClick={() => setOpen(false)}
          />
          <div
            className="portal-search-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Portal search"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="portal-search-field">
              <Search className="portal-search-ico" size={18} strokeWidth={1.75} aria-hidden />
              <input
                ref={inputRef}
                type="search"
                value={effectiveQuery}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onInputKeyDown}
                placeholder={placeholder || "Search pages, clients, cases…"}
                aria-controls={listId}
                aria-autocomplete="list"
              />
              <div className="portal-search-field-actions">
                <kbd className="portal-search-kbd muted">Esc</kbd>
                <TooltipAnchor label="Close">
                  <button
                    type="button"
                    className="portal-search-close"
                    aria-label="Close search"
                    onClick={() => setOpen(false)}
                  >
                    <X size={16} strokeWidth={1.75} aria-hidden />
                  </button>
                </TooltipAnchor>
              </div>
            </div>
            <div id={listId} className="portal-search-results" role="listbox">
              {loadingExtra && !hits.length ? (
                <p className="portal-search-empty">Searching…</p>
              ) : null}
              {!hits.length && !loadingExtra ? (
                <p className="portal-search-empty">No matches. Try a company, case ref, or page.</p>
              ) : null}
              {grouped.map(([group, items]) => (
                <div key={group} className="portal-search-group">
                  <div className="portal-search-group-label">{group}</div>
                  {items.map((hit) => {
                    const index = hits.findIndex((h) => h.id === hit.id);
                    const isActive = index === active;
                    return (
                      <button
                        key={hit.id}
                        type="button"
                        role="option"
                        aria-selected={isActive}
                        className={`portal-search-hit${isActive ? " active" : ""}`}
                        onMouseEnter={() => setActive(index)}
                        onClick={() => go(hit)}
                      >
                        <span className="portal-search-hit-ico">
                          <HitIcon kind={hit.icon} />
                        </span>
                        <span className="portal-search-hit-text">
                          <strong>{hit.label}</strong>
                          {hit.hint ? <em>{hit.hint}</em> : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
