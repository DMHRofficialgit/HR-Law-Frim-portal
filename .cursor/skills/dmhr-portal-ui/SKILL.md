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
6. Prefer shared primitives (`PortalSearch`, `FilePreviewSheet`, `Skeleton` / `TableSkeleton` / `ListSkeleton` / `PanelSkeleton` / `MetricSkeleton`, btn tokens) over one-off UI per page. **Loading:** use skeletons on lists/tables/metrics/hubs — never bare “Loading…” text for those surfaces after load patterns exist. **Buttons:** soft-rect (~10px radius), compact — never capsule/`980px` pills on `.btn`. Use `btn-sm` in directories, hubs, dialogs, toolbars. Status pills may stay fully rounded.
7. **Organisations:** dense directory table (avatar, onboarding progress bar, status pills, `RowActionsMenu` ⋮) → compact **client profile hub** `/admin/organisations/[id]` (icon back, org title, ⋮ + onboarding CTA, icon identity meta, metric tiles, `ProfileActivityPanel` docs/cases, company users). **Add client = modal** (reset on open only). Soft deactivate only with `useConfirm` (no hard delete). Hub `?edit=1` once then clear. Open cases tile → Cases `?org=&open=1`. Start onboarding ≠ issue pack. Optional `regulatoryContext`. Eye preview via `FilePreviewSheet`. Reuse `.profile-hub-*` tokens — do not reintroduce large spaced hero layouts.
7b. **Documents:** keep folder rail + files panel. Compact Admin company toolbar. **PDF-only uploads** (matches e-sign). Dense rows with type chip, Eye + icon actions (Download / Rename / Request signature / Delete). **No Versions UI.** Rename via compact dialog; only when not signed. In-folder search + sort/multi-select (no type filter). Shared `DocumentsPanel`; reuse docs-hub CSS. Signed copies: prefer API `isSignedCopy` (DB); title pattern only as fallback. Show **Signed** pill; never Request signature or Rename on those rows. Deep links `?org=` (Admin) + `?folder=` (Admin+Client). Same-name upload versions unsigned only (toast). Use `PortalSelect` / `PortalMultiSelect` (e-sign CC) instead of native open menus. **Uploads portal-wide:** reuse `DocsDropzone` (not native file chrome) for Documents, Cases, Firm Library, profile PNG — `compact` / `multiple` props as needed.
7c. **Employees:** same chrome as Organisations — `org-directory` + `PortalSearch` toolbar + `org-table` (avatar, primary/secondary, Cases, status pill, `RowActionsMenu` ⋮). Modal `EmployeeFormDialog` (not inline form). Hub = profile-hub head (Edit + ⋮) + icon `profile-meta-grid` + related cases. Fields: name*, jobTitle*, ref (auto), department, startDate, status (`StatusLiquidToggle`), workEmail?, notes?. Soft deactivate; delete only if no cases. Not an HRIS.
7d. **RowActionsMenu:** optional Lucide `icon` on each item (14px / 1.75). Use portal-wide whenever ⋮ menus exist — View=`Eye`, Edit=`Pencil`, Deactivate=`Ban`, Activate=`CircleCheck`, Delete=`Trash2`, access=`KeyRound`, docs=`FolderOpen`. Labels remain primary; icons muted (danger items use danger color).
7e. **Cases:** same directory chrome as Orgs/Employees. KPIs (All / Received / Pending / Closed) sit **above** the register panel using Overview `metrics-row` / `metric-card` (icons + hints, clickable filter). Modal `CaseFormDialog` for Admin+Client create (Admin requires organisation). Category **Other → specify** (`categoryOther`); related employee **optional**. Hub: dense panels, sticky aside (status + latest private-note preview shortcut — same as Admin-only composer, not a separate notepad), collapsed empty overview rows + one Complete overview CTA, linked org/employee, shared `CaseTimeline` correspondence log (newest-first; day groups; relative time; actor + visibility pills; quiet system rows), overview/files/timeline grow-then-scroll caps, compact composer uncapped. Files: Eye · Download · Delete (Admin any; Client own uploads only; confirm). Private-note attachments never shown to clients. Soft-rect Create CTA (not mock mustard). Statuses enum-locked.
8. **Form controls:** 2 options → `ChoiceToggle` (segmented); 3+ → `<select>` (mock-aligned lists). Never datalist for categories. **Other** / **Other…** → reveal specify input; reuse helpers in `lib/organisations.ts`. Dialogs/edit forms use `.form-compact` density. **Org/user Active↔Inactive** → `StatusLiquidToggle` (green Active / red Inactive, 21st liquid-toggle). Inactive status pills use `--danger` red, not muted gray.
9. **Access credentials:** After Add client, show `AccessCredentialsBanner` on the org profile (sessionStorage). Invite/temp password auto-email via SMTP when configured. Primary client access action: **Resend invite** if no `passwordChangedAt`; **Send password reset** (confirm) after password set — same banner + toast.
10. **Toasts:** Use `useToast()` (`success` / `error` / `info`) for action outcomes portal-wide. Provider lives in root `AppProviders`. Do not invent one-off toast systems per page.
10b. **Confirms:** Use `useConfirm()` for delete / deactivate / password-reset (and similar). In-portal alert dialog — never `window.confirm` / `alert`. `tone: "danger"` for destructive. Provider in `AppProviders`.
11. **Skeletons:** Import from `components/Skeleton.tsx`. Tables → `TableSkeleton`; `org-list` / queues → `ListSkeleton`; metric rows → `MetricSkeleton`; profile/detail first paint → `PanelSkeleton`. Keep empty states only after load completes with zero rows.

## Anti-patterns

- Copying the Fiverr/old mockup **colours** / navy-gold chrome (structure/journeys are OK to follow)
- Inventing a different IA that fights the approved HTML journeys
- New visual language per feature
- Native browser `confirm` / `alert` / `prompt` dialogs
- Heavy 3D / dimensional effects on every surface
- Motion noise (constant bounce, parallax overload)
- Hardcoded random hex outside the shared token set

## Related

- Product decisions: `docs/DMHR_Decisions.md`
- Source links detail: [sources.md](sources.md)
