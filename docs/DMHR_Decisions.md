# DM.HR Group Client Portal — Decisions Log

**Purpose:** Single source of truth for client decisions. Other chats (build, design, API) should read this file first and treat items under **Decided** as locked — do not re-ask.

**Client:** David Matthews | DM.HR Group  
**Product:** Multi-tenant HR client portal (Admin + Client), Postgres, org isolation via `organisation_id`  
**Website / brand source:** https://www.dmhrgroup.com/  
**Scope of work:** `docs/DMHR_Group_Updated_Scope_of_Work.docx`  
**Open questions (for David):** `docs/DMHR_Clarification_Questions.md` / `.docx`

---

## How to use (requirements / clarification chat)

1. User pastes David’s answers (or Fiverr/client notes).
2. Move those items into **Decided** below (never ask again).
3. Remove them from the open short list in this file and in `DMHR_Clarification_Questions.*`.
4. Pull the next best 1–2 questions from the **Long bank** (prefer technical blockers first).
5. Keep the open list at about **8–10 questions** max (or fewer if most items are locked).
6. Update this file + clarification `.md` + regenerate `.docx` via `docs/build_clarification_questions_docx.py`.

---

## Decided

### Payments / Direct Debit
- Admin pastes Direct Debit and initial payment links manually in the portal.
- No payment API. No Xero replacement. Portal does not process cards.

### E-signature (locked target UX — Part 4.1)
- **In-portal only** — no third-party (no DocuSign etc.), no wet ink. Email/SMTP **notifies** only; the signing ceremony never leaves the portal.
- **Document-based:** Signing attaches to a **client org document** (e.g. Terms of Business), not to Cases. Matches new-client journey: Send Terms → client signs online → welcome pack → … → Admin marks onboarding complete.
- **Where in UI:**
  - **Start:** Admin **Documents** — select a file → Request signature / open e-sign builder.
  - **Ceremony:** Right **side sheet** (~DocuSign-lite): PDF preview + place/fill fields.
  - **Signatures nav:** **Queue / filter only** (awaiting, signed, revision) — not a second document library.
  - **Onboarding:** Can deep-link “Terms awaiting signature” into the same sheet (checklist still deferred).
- **Admin place fields:** Drag boxes on the PDF (pdf.js). Field types: `signature` | `initials` | `text` | `date` | `name`. Each field has an **assignee** (portal user). ≥1 field; every field needs type + assignee to **Mark Ready**.
- **Send:** Mark Ready → Send. Status → awaiting signature. In-app notify (+ SMTP if configured) to **assignees + CC**.
- **Fill (Part 4.2):** Logged-in user fills **only their** boxes (“Finish my part”). Unlocked after **Mark Ready** (fields frozen; matching email can sign immediately — typically admin). **Send** notifies remaining assignees (clients see the request only after Send). Ink: **Draw** | **Saved PNG** | **Type**. Text/date/name typed (date blank → today; name blank → audit name). Others’ boxes locked. **No “I agree” checkbox**. Timestamp + IP logged. “Edit fields again” from ready clears early ink and returns to draft.
- **CC:** Portal users only (v1); **notify only** — never fill. Not the same as assignee.
- **Completion:** Stay `awaiting_signature` until **all required assignees** done → then stamp once → `signed_returned`. Queue shows progress / “waiting on…”.
- **Admin after sign:** **Mark complete (Reviewed)** or **Request revision** (status → `revision_requested`; client can re-sign immediately — no second Admin Send). Optional manual re-upload of signed file remains backup only.
- **Client visibility:** Client list/get only after Send (`awaiting_signature` / `revision_requested` / `signed_returned` / `reviewed`). Drafts and `ready_for_send` are Admin-only.
- **One active request per source document** until Reviewed (re-open existing instead of duplicate drafts).
- **Stamp fail-hard:** If PDF stamp fails, status stays awaiting; never store unsigned bytes as “signed”.
- **On Reviewed → Documents library:** Publish the stamped signed PDF into the **same org folder** as the source document as a **new file** (do not replace/overwrite the unsigned original). Keep both. Filename/title must indicate signed status, signer name, and date (e.g. `Terms of Business — Signed — Emma Thompson — 31 Oct 2026.pdf`).
- **Profile:** Admin + Client can **draw or upload** PNG signatures (up to **5**). Tile grid with **X + confirm** to remove; one default for e-sign “use saved”. New saves append (do not replace) until the cap.
- **Store:** Signed copy + field images + audit on the organisation (and published Documents copy on Reviewed).
- **Statuses (locked):**
  1. `draft` — boxes being placed  
  2. `ready_for_send` — Mark Ready done  
  3. `awaiting_signature` — sent to client  
  4. `signed_returned` — all required assignees finished (PDF stamped)  
  5. `reviewed` — Admin complete  
  6. `revision_requested` — Admin rejected; client re-signs immediately (no second Send)  
- **PDF-first** for field placement; Word→PDF conversion later if needed.
- **Not in scope for e-sign:** Cases, external envelope providers (DocuSign etc.). Multi-assignee **in-portal** users are in scope for Part 4.2.
- **Shipped interim (Part 4):** Simple Level A request list without field placement — **superseded by Part 4.1** when built; do not treat the interim ceremony as final product UX.

### Users / logins (locked — multi-user)
- **Multiple logins allowed:**
  - **Admin (DM.HR):** several firm admins, each with their own email.
  - **Company (client org):** several company users on the same organisation, each with their own email.
- **User Management UI:** Admin “User Management”; Client “Company Users”.
- **Invite / auth:** invite link **or** temporary password (same as today).
- **Disable** user (soft) — blocked from login; keep history.
- **Org data access (v1):** all active company users share the same org workspace (documents/cases/employees). Fine-grained per-user ACLs later.
- **Build order:** User Management **before** E-sign Part 4.2 (per-user field assignees + CC).

### Password / invite flow
- Support **both**: email invite link to set password, **and** DM.HR temporary passwords.
- **Auto email (locked 2026-11-01):** On create client / create user / resend invite, send credentials via **SMTP Settings** when configured (`sent` / `skipped` / `failed`). Always also surface a **copyable invite link or temp password** panel for Admin (session banner on org profile after create). SMTP mailbox is dynamic — test with any provider (e.g. Gmail), later swap to client mailbox in Settings.
- **Org profile access link (locked 2026-11-01):** Admin directory ⋮ + profile button for primary active client login. If password **not** set yet (`passwordChangedAt` null) → **Resend invite**. If password **already set** → **Send password reset** (confirm) — same set-password link machinery, reset email copy. Shows copyable Client access banner + toast.

### Onboarding access
- Clients can use the portal **as soon as Admin adds the company** — no lock until onboarding is finished.
- **Who marks Complete:** **Admin only**.

### UX structure & user journeys (locked 2026-10-31)
- **Source of structure / IA / user flows:** `DMHR_Group_Portal_Signatures_and_Multiuser.html` (prototype).
- **Copy the same user-flow structure** (nav emphasis, overview hubs, document spaces, onboarding stages, case journey). Make it **functional** against real APIs.
- **Visual system:** **Apple-like** components (light shell, calm neutrals, 21st.dev first) — **do not** copy navy/gold mockup chrome.
- **E-signature:** Not implemented in the HTML mock — use **Part 4.1** in-portal side sheet (document-based). Wire onboarding “Terms of Business” into that real signature flow.
- **Do copy from HTML (now locked):** User Management / Company Users multi-login structure.
- **Do not copy from HTML:** navy/gold theme; fake e-sign modal statuses (use Part 4.1 / 4.2 real sheet).

### Onboarding journey (functional — approved)
- **Existing clients:** bypass full onboarding wizard; portal access immediately (`existing_skip` / already onboarded). Hide or empty **My Onboarding** for them.
- **New clients — stage structure** (match HTML; track real progress, not status-only page):
  1. **Terms of Business** — Admin issues from Firm Library into client **My Onboarding**; send for **online signature** (Part 4.1); client signs in portal.
  2. **Welcome pack** — issue / publish into client **My Onboarding**.
  3. **Compliance documents** — upload and issue into client **My Onboarding**.
  4. **Direct Debit setup link** — Admin pastes link (payments = paste links only).
  5. **Initial payment link** — Admin pastes link (same payments model).
  6. **Admin marks Complete** — Admin only; company becomes a full DM.HR client (“onboarding finished”).
- **Where sign/pack files live (locked):** All one-time onboarding files that must be signed or completed arrive in client **My Onboarding** (not scattered across My Documents / Policies / etc.).
- **Sign path:** Client opens file from **My Onboarding** / journey CTA → **Signatures** queue → sign sheet → on Reviewed, signed PDF stays in **My Onboarding** (same folder as source; keep unsigned + signed).
- **Gate:** Required pack items signed/complete **and** Admin sets Complete → full DM.HR client. Admin Complete remains the final switch.
- **Admin UX:** Onboarding list with metrics; detail with stage rows + progress; start onboarding from client profile / organisations; issue pack from Firm Library → **My Onboarding**.
- **Client UX:** **My Onboarding** folder + journey page with progress + CTAs (Sign → Signatures; open pack files in My Onboarding).
- Stages are **functional** (e-sign, My Onboarding files, payment links) — not a dead checklist mock.

### Welcome pack / compliance tracking
- Delivered into **My Onboarding** + stage status (Issued / Awaiting / Done style).
- Ongoing HR library after onboard remains the **six operational folders** below.
- Full free-form checklist editor can still expand later; the **six-stage journey above is in scope now**.

### Onboarding ops (locked with build)
- **Create org:** choose **Needs onboarding** (`in_progress`) or **Already onboarded** (`existing_skip`).
- **Welcome email:** required before Complete; Admin edits subject/body then sends via SMTP.
- **Firm Library:** N templates; default **requires signature**. **Place signature boxes once** (Client or Admin role). **Admin boxes: sign ink once on the template (forever)**; Client boxes stay empty until each company signs.
- **Issue pack:** Admin multi-selects library docs → copy into **My Onboarding** → clone boxes → apply saved Admin ink (issuer as signer for audit) → assign Client boxes to **primary client login** → Mark Ready + Send (client only needs to sign).
- **Ad-hoc e-sign:** Documents → Request signature still available for one-off / non-pack docs (manual place + assignee).
- **Sign UX:** Draw | Saved | Type (no “I agree”); Part 4.1/4.2 sheet.
- **Payments:** paste Direct Debit + initial payment URLs; both required to Complete.
- **Complete gate:** welcome sent + pack issued + required signatures reviewed + both payment links.

### File upload rules
- Keep types and max size **dynamic/configurable**.
- Must support Word and PDF at minimum (and allow configuring size).

### Document folders (final names)
**Operational (ongoing client library — 6):**
1. My Documents  
2. My Policies  
3. My Handbook  
4. My Contracts  
5. My Useful Documents  
6. My Private Space  

**Onboarding (one-time — locked):**
7. **My Onboarding** — receive area for Firm Library pack (Terms, welcome pack, compliance, and any other docs that must be signed/completed at the start). Not a substitute for the six ongoing folders. Do **not** dump the onboarding pack only into My Documents.

### My Private Space visibility
- **One Admin for now** — that Admin sees every client’s Private Space files.
- No multi-admin permission model required yet.
- Admin also sees client **My Onboarding** (to issue and track pack).

### DMHR Firm Library (planned — prioritize with onboarding)
- **Yes — we will build this** (with / just before functional onboarding issue flow).
- **What it is:** Admin-only **firm library** for templates + staging (Terms of Business, Welcome Pack, Compliance pack, reusable policies, drafts).
- **What it is not:** Admin “My Private Space” / personal Dropbox; not mixed with any client org’s folders.
- **Transfer (onboarding):** Controlled **copy/send** from Firm Library → that client’s **My Onboarding** (default for pack). Later also allow copy into other client folders / case attach when needed.
- **Ownership:** Firm-scoped storage (not tied to a client `organisation_id`). Clients never see the library; they only see files after copy into their org.
- **Why:** Same pack every new client; one-time at beginning; after sign + Admin Complete they are a DM.HR client.

### Storage & versioning
- Storage expectation: **unlimited** (confirmed by David).
- Versioning: **keep** old versions / history; keep UX simple — not a blocker.
- David will delete files as and when needed once timelines have expired (manual delete; no auto-purge).

### Retention
- Keep completed cases and documents **until someone removes them** (David deletes when timelines expire). No auto-purge.

### Case statuses (phase 1)
1. Submitted  
2. Allocated  
3. In progress  
4. Information required  
5. Final stages  
6. Closed  

### Case categories (phase 1)
1. Grievance  
2. Disciplinary  
3. Occupational Health  
4. Absence Management  
5. Request for document  
6. Other  

- Admin **Settings** should allow adding **custom categories**.

### Add a Case — required fields
- **Fine as is** (David): **title, category, description, related employee, attachments**.

### Case replies
- Client can **reply and attach after submit** freely.
- **Does not need Admin approval or a “request response” gate** (David).
- Status **Information required** may still exist as a label only — it must not block client replies.

### Notifications
- **Bidirectional:** Admin update → notify client; client upload / e-sign / case activity → notify Admin.
- Case alerts intended for David’s ops mailbox preference: **`case@dmhrgroup.com`** (configured via SMTP Settings — not hard-coded).
- **Internal / personal Admin notes:** Admin-only — never shown on client screens or in client emails.

### Email / mail sending
- **Product (locked):** Provider-agnostic **SMTP Settings** in Admin — host, port, TLS/SSL, username, password/app password, from address, from display name. Compatible with Outlook/M365, Google, Hostinger, or any SMTP. **Do not hard-code a provider or mailbox in code.** Stored in DB. Settings UI: **Save**, **Test form** (current fields + verify + send), **Test saved** (DB). Test recipient field required for product verification.
- **David’s current preference (defaults / docs only):** Outlook; portal/case mail from **`case@dmhrgroup.com`**. Prefill or document as suggested defaults; Admin can change anytime in Settings.
- Source: David Matthews direct answers (2026-10-30), reconciled with build preference to keep SMTP generalised.

### Existing clients
- **David/Admin will add** clients **one-by-one** for now (no spreadsheet import in this phase).

### Employee records
- **Yes in phase 1:** employee record / profile is maintained in the portal.
- **No employee self-login portal**.
- **Fields:** name, job title, start date, department, notes (and any other mockup/SOW fields) — **remove NI number** (David).
- **Who edits:** **both** Admin and Client.

### Hosting region
- No hard preference; client is UK → prefer UK-friendly hosting when easy.

### Branding & UI
- **Logo:** from live site https://www.dmhrgroup.com/  
  Asset: `https://www.dmhrgroup.com/wp-content/uploads/2025/06/DMHR-LOGO-LARGE.jpg`  
  Prefer local: `frontend/public/logo/dmhr_transparent_logo.png` / `dmhr_logo.png`.
- **Display name:** DMHR Group / DM.HR Group.
- **Structure / journeys:** match HTML prototype IA (see **UX structure & user journeys**).
- **Look:** **clean Apple-like UI** — do **not** copy navy/gold mockup colours or dense chrome.
- Prefer **21st.dev MCP** components where useful.
- Site reference (footer/contact optional): phone `07493 392481`, email `dave@dmhrgroup.com`, Falcon Point, Park Plaza, Heath Hayes, Cannock, WS12 2DE.

### Client / Admin IA to mirror (from HTML — functional)
- **Client:** Overview/home with document-space tiles (**6 operational + My Onboarding** for new clients); strong **Add / Check a Case** path; Employees; Onboarding journey; Signatures queue; Notifications; Account/settings as needed.
- **Admin:** Overview metrics + attention lists; Clients/Organisations with **client profile hub**; Documents; Firm Library; Employees; Cases; Onboarding journey; Signatures queue; Notifications; Settings (incl. SMTP).
- **Routes (locked 2026-11-01):** Admin **Overview** = `/admin` (dashboard only). **Organisations / clients directory + add** = `/admin/organisations` — never conflate the two. Client home = `/portal`.
- **Sidebar groups:** Admin `home` (Overview) → `Clients` (Organisations) → `Workspace` (Documents, Firm Library, Employees, Cases, Onboarding, Signatures) → `System` (Users, Notifications, Settings, Payments). Client: Overview → Workspace → System. Collapsed rail shows thin dividers between groups.
- **Organisations journey:** Directory (search/filters/table + **Open profile**) → **Client profile hub** `/admin/organisations/[id]`. Mock = journey ideas; we own data flow + components (Apple shell). No fake “view as client”.
- **Client profile hub (locked 2026-11-02):** Compact density — icon **Back** + org name as page title + status pill + **Start/Open onboarding** CTA + **⋮** (Edit / Resend invite|password reset / Open documents / Deactivate|Activate). Identity row: avatar + icon meta (contact, email, phone, login) + pencil edit. Four metric tiles (docs / employees / open cases / onboarding + pack bar) deep-link. Scrollable **Documents** + **Recent cases** panels (`ProfileActivityPanel` + Eye preview). Compact **Company users** list. Shared tokens `.profile-hub-*`.
- **Org directory table (locked 2026-11-01):** Dense containerized table (avatar + company/ref, contact, type, **regulatory**, onboarding **progress bar + short text**, open cases, status pill). Filters: search + status + type + **regulatory context**. Row **⋮** menu (portal + flip up when near bottom): Open / Edit / Resend invite|password reset / Deactivate|Activate. No hard delete — soft inactive only.
- **Org chrome rule:** Sidebar + top bar = general only. Section CTAs (Add organisation, Open documents, Start/Open onboarding) sit **inside the page** beside that section’s heading — never in shell `actions` for org-specific work.
- **Add organisation:** Modal/dialog (not a form buried under the directory). Create = folders + client login only; does **not** auto-start onboarding or issue pack.
- **Onboarding CTA:** Needs onboarding + no run → **Start onboarding** (creates run). Active run → **Open onboarding**. Pack docs only after Admin issues from Firm Library on the run page.
- **Org fields:** name, ref, contact, email, phone, type, optional **regulatoryContext** (CQC/Ofsted…), status, onboardingStatus.
- **Form control rules (locked 2026-11-01):** Exactly **2** mutually exclusive options → **segmented toggle** (`ChoiceToggle`), not a dropdown (e.g. Client type New/Existing, Access method Invite/Temp password, Active/Inactive). **3+** options → **select**. No datalist for category fields (avoids browser autofill menus).
- **Other → specify (portal-wide):** If a select includes **Other** / **Other…**, choosing it reveals an inline text field; store the typed value. Apply on org type, regulatory, and later case categories etc.
- **Org select lists (mock-aligned):** Type = Adult Social Care / Children's Residential Care / Other Care Provider / Other Business. Regulatory = To Be Confirmed / CQC / Ofsted / Both / Not Applicable / Other.
- **Form density:** Dialogs and admin edit forms use compact field tokens (`.form-compact`) — tighter than auth screens.
- **Portal toasts (locked 2026-11-01):** Shared bottom-right toast (`useToast` / `ToastProvider`) for success / error / info across Admin + Client — SMTP, create client, saves, and any future action. Not email-only. Page banners may remain for form context; toast is default quick feedback.

### Portal section standards (apply as each area is built)
Before calling a section done, check what this product needs (not generic SaaS clutter):

| Standard | Apply when |
|----------|------------|
| List + search/filters | Directories (orgs, docs, cases, employees, signatures, users) |
| Detail / hub | Entities with related activity (org profile, case, employee, onboarding run) |
| Create | Admin/Client must add records |
| Edit / update | Fields that change after create (org contact, employee, case status…) |
| Delete / archive / disable | With confirm; prefer `active`/`inactive` for orgs/users where hard delete is risky |
| **Preview (eye)** | Files/PDFs/images — docs, Firm Library, attachments, pack/signed PDFs — shared component |
| Download | Same file surfaces (always, even if preview N/A for Word etc.) |
| Versions | Documents |
| Status badges | Onboarding, cases, signatures, org, user |
| Empty states | Every list + one clear CTA |
| Confirm destructive | Delete, Complete onboarding, void/cancel where added |
| Deep links from hubs | Profile → docs / employees / cases / onboarding |
| Permissions | Admin vs client; Private Space; admin-only notes |
| Notify | Creates/updates clients or admins should hear about |
| Loading / errors | No silent failures |
| Shell fit | Tokens, btn primary/secondary, PortalSearch where lists grow |

**Project-specific:** e-sign + onboarding are **workflows** (not only CRUD forms). Payments = paste links only. Folders = fixed set. GDPR audit/export later. Impersonation out of scope.

### Recommended defaults (locked for build unless David objects)
- **Key doc placeholders:** Terms of Business, Welcome Pack, Compliance pack — Admin uploads when ready.
- **Email wording:** ship short professional templates (invite, case update, e-sign request, onboarding complete); editable later if Settings supports it.
- **GDPR phase 1:** audit log **yes**; basic org data export **yes**; **2FA later**.
- **Go-live order:** 1) Clients + docs 2) Cases + replies/notify 3) **Firm Library + My Onboarding folder + onboarding stages + e-sign** 4) Payment links 5) Employee profiles polish.
- **UAT contact default:** David / the single Admin account.
- **Out of scope (still):** full card payments, payroll, bulk Dropbox/email migration, automated legal advice, employee self-login fill-forms.

---

## Still open (short list to send David)

1. **Email “from” display name** — Visible From name next to the SMTP from-address (David prefers `case@dmhrgroup.com`): **“DM.HR Group”**, **“DM.HR Cases”**, or a person’s name?  
   *(Suggested default: DM.HR Group — address stays configurable in SMTP Settings.)*  
   **Answer:** _______________________________________________

2. **Rough go-live month** (optional)  
   **Answer:** _______________________________________________

3. **Confirm out of scope** — Still OK that we are **not** building: full card payments, payroll, Dropbox migration, auto legal advice, employee login?  
   **Answer:** _______________________________________________

---

## Long bank (remaining / optional later)

### B. Branding & content
- *(Logo/UI decided. Remaining: From display name — on short list.)*
- Approved email wording edits after templates ship

### H. Onboarding
- **Six-stage journey approved** — build functional UX (see Onboarding journey). Expandable free-form checklist items later if needed.

### Documents — Firm Library + My Onboarding
- **Firm Library** + default transfer into client **My Onboarding** for the one-time pack — **built** with functional onboarding (Admin Firm Library + Onboarding list/detail + client My Onboarding journey).

### Documents — E-sign Part 4.1
- Field-on-PDF sheet UX locked under **E-signature**. HTML mock had no real signing — portal e-sign is the functional implementation.

### I. Notifications
- From display name *(on short list)*
- Mailbox preference noted: `case@dmhrgroup.com` via generic SMTP

### J. Security
- 2FA — later unless requested
- Fine-grained retention rules — later (current: keep until David deletes)

### K. Out of scope confirm
- *(on short list)*

### L. Launch
- Go-live month *(on short list)*
- Rank priority already set as recommended default

---

## Note for build chat

**UX:** Copy **HTML prototype user-flow structure / IA**; render with **Apple-like** components (not navy/gold). Make journeys **functional**.

**Onboarding:** Six-stage new-client journey. Pack files land in client **My Onboarding** (not My Documents). Firm Library → copy/send into My Onboarding. Sign via **Signatures** / Part 4.1. Admin Complete = full DM.HR client. Existing clients skip.

Assume also: **multi-user (admin + company)**, **invite + temp password**, **portal open when company added**, **generic SMTP Settings**, **6 operational folders + My Onboarding**, **unlimited storage + keep versions**, **Firm Library with onboarding**, **e-sign Part 4.1 now / 4.2 after users**, **case statuses/categories as listed**, **free client replies**, **bidirectional notify**, **Admin-only private notes**, **employees both-edit / no NI**, **payments = paste links**, **audit log + basic export**, **2FA later**.

David’s direct answers (2026-10-30) are authoritative for product rules where not superseded; HTML is authoritative for **journey structure**; **My Onboarding folder** is the locked receive area for the one-time pack.

---

## Change log

| Date | What changed |
|------|----------------|
| 2026-10-29 | Created file. Locked payments, e-sign, users, invite, onboarding access, files, Private Space, case statuses/categories, employees, hosting. |
| 2026-10-30 | Locked M365/SMTP Settings, one-by-one clients, case fields/replies/alerts, folders, unlimited storage, versioning, employee both-edit, Admin-only onboarding Complete, folders-now/checklist-later, e-sign statuses, Admin-only notes, keep-until-deleted, branding from dmhrgroup.com + Apple-like UI / 21st.dev, recommended GDPR/go-live defaults. Short list reduced to From name, go-live month, out-of-scope confirm. |
| 2026-10-30 | David direct: Outlook preference + `case@dmhrgroup.com` as default (not hard-coded); free client replies (no request gate); remove NI; unlimited; keep until he deletes; fields/folders/both-edit confirmed. Reconciled: keep provider-agnostic SMTP Settings. |
| 2026-10-30 | Locked **DMHR Firm Library** as planned later work: Admin firm templates/staging + controlled copy/send into client folders (not Admin personal/Private Space). Added to go-live order step 6. |
| 2026-10-30 | Part 4 built: onboarding status UI, in-portal e-sign (Level A), profile signature PNG, real SMTP Settings + mail send when configured. |
| 2026-10-31 | Locked **e-sign target UX (Part 4.1):** document-based; Documents start; side sheet + drag signature boxes; Mark Ready → send → client fill (agree/name/draw/saved PNG); Reviewed or revision; Signatures nav = queue only; no DocuSign; interim Part 4 ceremony superseded when 4.1 ships. |
| 2026-10-31 | Part 4.1 implemented: `SignatureField` + statuses, EsignSheet + pdf.js, Documents Request signature, queue pages, revision API. |
| 2026-10-31 | On **Reviewed**: publish stamped signed PDF into same Documents folder as a new file (keep unsigned); name includes Signed + signer + date. |
| 2026-10-31 | E-sign remediation: client cannot see drafts; revision → `revision_requested` (immediate re-sign); stamp fail-hard; one active request per source doc; PDF-only Request signature; Active/Completed queue filter. |
| 2026-10-31 | Profile signatures: multi PNG (max 5), draw + upload, X+confirm delete, default picker in e-sign sheet. |
| 2026-10-31 | Client sign UX: Draw \| Saved \| Type toggles per box; drop I agree; audit name + optional profile save; typed ink can be name/initials. |
| 2026-10-31 | **UX locked:** HTML prototype = structure/IA/journeys (functional). Apple-like visuals. Onboarding six-stage journey in scope (was “folders only”). E-sign = Part 4.1 (not in mock). No multi-user from HTML. |
| 2026-10-31 | **Re-locked multi-user:** Admin + Company Users by email; User Management before E-sign 4.2 (assignee + CC + field types). Dropped 1-login-per-company. |
| 2026-10-31 | **E-sign Part 4.2:** field types (signature/initials/text/date/name); per-field assignee; CC notify-only; Finish my part; stamp when all required done; queue waiting-on. |
| 2026-10-31 | **E-sign DocuSign-lite UX:** recipients + field palette + selected-field inspector; stage chip; queue Prepare/Send/Sign/Review + Needs you. |
| 2026-10-31 | **Mark Ready → Finish my part:** fill unlocked at `ready_for_send` for matching assignee; fields frozen; Send still for others; reopen clears early ink. |
| 2026-10-31 | **E-sign notify hold:** no re-ping on each Finish my part; Send skips already-done assignees; Mark complete notifies clients only (correct href). |
| 2026-10-31 | **My Onboarding folder locked:** one-time pack (Terms/welcome/compliance to sign) arrives in client **My Onboarding**; Firm Library transfers there by default; Signatures = ceremony; Admin Complete = full DM.HR client. Six operational folders stay for ongoing docs. |
| 2026-10-31 | **Functional onboarding shipped:** Firm Library + Onboarding runs (welcome email, dynamic pack issue → My Onboarding, e-sign sync, DD/payment links, gated Complete); create-org Needs vs Already onboarded; client journey matches HTML IA. |
| 2026-10-31 | **Firm Library template fields:** place boxes once with Client/Admin roles; issue pack auto-clones layout, assigns primary client + issuing admin, Mark Ready + Send. |
| 2026-10-31 | **Firm Library Admin ink:** sign Admin boxes once on template (Draw/Saved/Type); issue pack auto-applies that ink so Admin does not re-sign every client. |
| 2026-11-01 | **Shared portal shell (UI phase):** compact Apple-like chrome; lucide icons + short labels; icon notify/account; mobile drawer; Admin/Client same theme; HTML IA for nav. |
| 2026-11-01 | **Shell v2:** icon rail (hover expand + pin); top breadcrumbs page map; light/dark theme (`data-theme`) with blue highlights; refs 21st andrewlu0 rail + arunjdass mature header. |
| 2026-11-01 | **Shell polish:** portal-wide translucent/blur scrollbar (blue hover highlight); delayed hover-open rail (~160ms in / ~220ms out) + cubic expand; nav tab hover motion; pin + avatar foot stacked cleanly (no overlap). |
| 2026-11-01 | **IA fix:** `/admin` = real Overview dashboard; organisations list/add moved to `/admin/organisations`; sidebar separator headings (Clients / Workspace / System); client `/portal` Overview hub. |
| 2026-11-01 | **Buttons + search:** `btn-primary` = brand blue + white text (both themes); `btn-secondary` = theme surface + blue accent (no hardcoded light gray). Shared `PortalSearch` in shell header (⌘/Ctrl+K palette) reusable as `mode="inline"` in section filters. |
| 2026-11-01 | **Portal section standards locked:** list/detail/CRUD-where-needed, eye preview, download, badges, empty states, confirms, hub deep-links — apply section-by-section. Orgs = directory + profile hub (mock structure). |
| 2026-11-01 | **Organisations hub shipped:** directory table + filters + Open profile; `/admin/organisations/[id]` profile (edit, metrics, recent docs/cases); GET/PATCH org APIs; shared `FilePreviewSheet` + Eye on Documents. |
| 2026-11-01 | **Org rebuild:** Add client modal; page-local CTAs (not shell actions); regulatoryContext; Start≠issue pack clarified; table + profile polish. |
| 2026-11-01 | **Org form UX:** compact density; ChoiceToggle for binary fields; real selects (mock lists); Other→specify; no datalist. |
| 2026-11-01 | **Access email:** auto-send invite/temp-password via SMTP on org/user create + resend; copyable credentials banner on profile. |
| 2026-11-01 | **SMTP Settings UX:** Mitiesoft-style form; test-to field; Test form vs Test saved; verify+send with clearer errors. |
| 2026-11-01 | **Portal toasts:** shared `useToast` success/error/info; wired Settings + Organisations create/edit. |
| 2026-11-01 | **Org profile Resend invite:** primary client login; SMTP + credentials banner + toast. |
| 2026-11-01 | **Org directory sleek table:** dense rows, onboarding progress, status pills, ⋮ menu (Open/Edit/Resend/Deactivate). |
| 2026-11-01 | **Invite vs reset:** Resend invite only before password set; after set → Send password reset (confirm + reset email). |
| 2026-11-01 | **Org directory polish:** separate Regulatory column; status/type/context filters; ⋮ menu portals + flips up on last rows. |
| 2026-11-02 | **Client profile hub redesign:** compact header (icon back, org title, ⋮ + onboarding CTA); icon identity meta; metric tiles; scrollable docs/cases panels; compact company users; `.profile-hub-*` + `ProfileActivityPanel`. |
| 2026-11-02 | **Status colours:** Active = green, Inactive = red (table pills + `StatusLiquidToggle` from 21st liquid-toggle). Binary non-status fields still use `ChoiceToggle`. |
