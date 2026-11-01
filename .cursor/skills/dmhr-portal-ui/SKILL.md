---
name: dmhr-portal-ui
description: >-
  DMHR Group client portal UI: Apple-like shell, site logo branding, 21st.dev
  MCP first, then prompt-kit, motion-primitives, and light dimensional depth.
  Use when building or refining DMHR/DM.HR portal frontend, login, admin/client
  shells, documents, cases, onboarding, or any Part 2+ UI section.
---

# DMHR portal UI

Read `docs/DMHR_Decisions.md` for product locks. This skill covers **visual system only**.

## Brand (locked)

- **Name:** DMHR Group / DM.HR Group
- **Logo (prefer local):**
  - `frontend/public/logo/dmhr_transparent_logo.png` — light chrome / headers
  - `frontend/public/logo/dmhr_logo.png` — solid / dark or dense backgrounds
- **Remote fallback only:** `https://www.dmhrgroup.com/wp-content/uploads/2025/06/DMHR-LOGO-LARGE.jpg`
- **Look:** Ignore the old HTML mockup **chrome** (navy/gold) — Apple-like only
- **Structure / journeys:** Match `DMHR_Group_Portal_Signatures_and_Multiuser.html` IA and user flows (see `docs/DMHR_Decisions.md`). Make flows functional; e-sign uses Part 4.1 (not in the mock)
- **My Onboarding:** dedicated client folder for one-time pack to sign; not My Documents; Firm Library templates hold signature boxes (Client/Admin roles) once; issue pack auto-wires + sends; Admin Complete = full client
- Site phone / email / Cannock address: footer or contact reference only — not mandatory in every chrome

## Direction

- Clean, modern, **Apple-like** product UI (portal/dashboard — not a marketing landing)
- **Same user-flow structure as the HTML prototype**; better Apple-style components
- One coherent **shell** (nav, header, content frame); **extend** with new sections per part — do not redesign from scratch each feature
- Calm neutrals, clear hierarchy, generous spacing, rounded controls, soft separation
- Avoid: purple/indigo AI cliché, cream+terracotta editorial cliché, broadsheet newspaper layout, card soup, neon glow stacks
- Avoid: copying navy/gold mockup theme; copying HTML multi-user

## Component stack (priority order)

1. **21st.dev MCP** (`user-21st`) — primary. Search → pick → `get_component`. Prefer sidebar, header, table, dialog, button, input, empty state, tabs.
2. **prompt-kit** — https://www.prompt-kit.com/docs/installation — polished React primitives when 21st lacks a fit (forms, panels, structured blocks).
3. **motion-primitives** — https://github.com/ibelick/motion-primitives — 2–3 intentional motions max (route enter, list stagger, sheet). Respect `prefers-reduced-motion`.
4. **dimensional-drawing** — https://github.com/enesozturk/dimensional-drawing — light depth/layering on panels only; do not dominate the shell.

Do not install every library blindly. Add a dependency only when a concrete component needs it.

## Shell rules

- Brand mark visible in authenticated chrome (logo + short name)
- Admin and Client share the same design language; role differs by nav items and data, not by a different theme
- Auth screens (login / set-password / change-password): centered composition, logo hero-level, one job
- Authenticated app: sticky or fixed header / sidebar, content max-width readable, no dense enterprise clutter
- **Shell v2 (locked 2026-11-01):** icon rail default (expand on hover, pin to lock open); top breadcrumbs page map + theme toggle + notify + avatar; mobile drawer; optional `actions` slot
- **Shell motion / chrome:** delayed hover expand; soft cubic width transition; nav item hover scale/slide; pin row + avatar stacked in foot (collapsed = centered icons only)
- **Scrollbars (portal-wide):** thin translucent thumb with blue hover highlight via global webkit + `scrollbar-color` — reuse on page/body and overflowing panels (`.shell-nav`, sheets, lists)
- **IA / nav groups:** Overview ≠ Organisations. Admin `/admin` = metrics hub; `/admin/organisations` = client directory + add. Sidebar headings: Clients / Workspace / System (from `lib/nav.ts` `NAV_GROUP_*`) — visible whenever rail is expanded
- **Buttons:** Primary = blue bg + white text (both themes). Secondary = `var(--surface)` + blue text/border — never hardcoded `#f0f0f2`
- **Portal search:** `components/PortalSearch.tsx` — shell header trigger + ⌘/Ctrl+K palette (pages / orgs / cases); use `mode="inline"` for section filters. Inspired by 21st command-palette patterns; no extra deps
- **Themes:** light + dark via `data-theme` / `lib/theme.ts`; dark uses charcoal + blue highlights (`--blue` / `--blue-soft`) — not purple, not navy-gold
- Empty states for future sections until that part ships
- 21st.dev refs: hover rail + mature dashboard header patterns; adapt into `AppShell` — do not require full shadcn install for chrome

## Build habit per section

1. Reuse shell layout components
2. Pull UI blocks via 21st (or prompt-kit) before hand-rolling
3. Wire real APIs; keep org isolation (`organisation_id` from token only)
4. Match existing tokens / CSS variables — do not invent a second palette mid-repo
5. **Section standards** (see `docs/DMHR_Decisions.md` — Portal section standards): for each area, add what this product needs — list/filter, detail hub, create/edit/archive, **Eye preview** + download for files, badges, empty states, confirms, deep links, permissions, notify, loading/errors. Workflows (e-sign, onboarding) stay action/status-led, not form-only CRUD.
6. Prefer shared primitives (`PortalSearch`, `FilePreviewSheet`, btn tokens) over one-off UI per page
7. **Organisations:** dense directory table (avatar, onboarding progress bar, status pills, `RowActionsMenu` ⋮) → compact **client profile hub** `/admin/organisations/[id]` (icon back, org title, ⋮ + onboarding CTA, icon identity meta, metric tiles, `ProfileActivityPanel` docs/cases, company users). **Add client = modal**. Soft deactivate only (no hard delete). Start onboarding ≠ issue pack. Optional `regulatoryContext`. Eye preview via `FilePreviewSheet`. Reuse `.profile-hub-*` tokens — do not reintroduce large spaced hero layouts.
8. **Form controls:** 2 options → `ChoiceToggle` (segmented); 3+ → `<select>` (mock-aligned lists). Never datalist for categories. **Other** / **Other…** → reveal specify input; reuse helpers in `lib/organisations.ts`. Dialogs/edit forms use `.form-compact` density. **Org/user Active↔Inactive** → `StatusLiquidToggle` (green Active / red Inactive, 21st liquid-toggle). Inactive status pills use `--danger` red, not muted gray.
9. **Access credentials:** After Add client, show `AccessCredentialsBanner` on the org profile (sessionStorage). Invite/temp password auto-email via SMTP when configured. Primary client access action: **Resend invite** if no `passwordChangedAt`; **Send password reset** (confirm) after password set — same banner + toast.
10. **Toasts:** Use `useToast()` (`success` / `error` / `info`) for action outcomes portal-wide. Provider lives in root `AppProviders`. Do not invent one-off toast systems per page.

## Anti-patterns

- Copying the Fiverr/old mockup **colours** / navy-gold chrome (structure/journeys are OK to follow)
- Inventing a different IA that fights the approved HTML journeys
- New visual language per feature
- Heavy 3D / dimensional effects on every surface
- Motion noise (constant bounce, parallax overload)
- Hardcoded random hex outside the shared token set

## Related

- Product decisions: `docs/DMHR_Decisions.md`
- Source links detail: [sources.md](sources.md)
