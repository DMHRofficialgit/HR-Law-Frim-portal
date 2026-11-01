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
- Empty states for future sections (cases, onboarding, payments, employees) until that part ships

## Build habit per section

1. Reuse shell layout components
2. Pull UI blocks via 21st (or prompt-kit) before hand-rolling
3. Wire real APIs; keep org isolation (`organisation_id` from token only)
4. Match existing tokens / CSS variables — do not invent a second palette mid-repo

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
