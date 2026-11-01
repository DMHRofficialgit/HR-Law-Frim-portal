# DMHR Group — Client Portal

Multi-tenant HR client portal (Admin + Client organisations).

**Stack:** Express + Prisma + PostgreSQL · Next.js frontend  
**Decisions:** read `docs/DMHR_Decisions.md` before changing product behaviour.  
**UI:** `.cursor/skills/dmhr-portal-ui/SKILL.md`

## Publish with GitHub Desktop

Local git is ready with **no remote** — use Desktop to create the new GitHub repo:

1. Delete the old repo on github.com (if you still have one).  
2. Open **GitHub Desktop** → sign in to the account you want.  
3. **File → Add Local Repository** → choose this folder (`HR Law Frim portal`).  
4. Click **Publish repository** (keep it **private** if you want).  
5. Confirm the commit list does **not** include `.env`, `node_modules`, or `backend/storage` uploads.

Never commit real secrets. Copy env templates instead:

- `backend/.env.example` → `backend/.env`
- `frontend/.env.example` → `frontend/.env.local`

## Part 0 — Foundation

DB + health check. See `backend/README.md` / `docs/PART0_DB_SETUP.md`.

## Part 1 — Auth + multi-tenant wall

JWT Bearer auth, org isolation, invite **or** temporary password, Apple-style auth screens.

## Part 2 — Portal shell + Documents

- Shared Admin/Client shell with DMHR logo and nav stubs for later sections
- Six folders per org (auto-created on company create + seed backfill)
- Upload / download / version history / **manual delete**
- Configurable upload types + max size (Admin Settings)
- Private Space: Admin can open any client’s folders; clients only their own org
- Local file storage under `backend/storage` (`STORAGE_ROOT`)

## Part 3 — Cases + employees + notify

- Slim **Employees** (name, job title, department, start date, notes — no NI)
- **Cases** with locked statuses/categories; create needs related employee + optional attachments
- Client replies freely (any status); Admin client-visible updates + **admin-only notes**
- Custom case categories in Settings
- In-app **Notifications** (+ mail queued when SMTP configured later)

## Part 4 — Onboarding + e-sign + SMTP

- Create org: **Needs onboarding** or **Already onboarded** (`existing_skip` hides My Onboarding for clients)
- Admin **Firm Library** templates → issue pack into client **My Onboarding**
- Admin **Onboarding** list/detail (HTML journey): welcome email → pack → e-sign → DD + payment links → gated **Complete**
- Client **My Onboarding** journey + 7th folder; Sign via Part 4.1 sheet
- Profile **signatures** (draw or upload PNG, up to 5) for Admin + Client
- Admin Settings **SMTP**; welcome email and notifies send when configured

## Part 4.1 — E-sign field UI

Document-based DocuSign-lite **inside the portal**:
- Admin **Documents** → **Request signature** (PDF only) → side sheet → drag boxes → **Mark Ready** → **Send**
- Client **Signatures** queue (sent requests only) → open sheet → name + per-box **Draw | Saved | Type** → Submit (no Agree checkbox)
- Admin **Review** or **Request revision** (client re-signs immediately)
- On **Reviewed**: stamped signed PDF is published into the same Documents folder as a **new file** (name includes Signed + signer + date); unsigned original is kept
- Guards: one active request per source doc; stamp failure does not mark signed; Signatures queue Active/Completed filter

See `docs/DMHR_Decisions.md` § E-signature.

## Part 5 — User Management (multi-user)

- **Admin → User Management:** create DM.HR admins or company users (invite link or temp password); enable/disable; resend invite
- **Client → Company Users:** invite colleagues into the same organisation
- Each person logs in with their own email (foundation for E-sign Part 4.2 per-box assignees + CC)
- Soft-disable blocks login; cannot disable yourself / last admin

## Part 4.2 — Multi-assignee e-sign

- Field types: **signature | initials | text | date | name**
- Each box has an **assignee** (admin or company user); Mark Ready requires assignees
- **CC** = portal users notified only (cannot fill)
- Send notifies assignees + CC; each user **Finish my part** on their boxes only
- Request stays awaiting until all required fields done → stamp once → signed → Admin review
- Queues show `done/total` and “waiting on…”

## Firm Library + My Onboarding

Admin-only **Firm Library**: upload templates, **prepare boxes once** (Client / Admin roles), **sign Admin ink forever**. **Issue pack** copies into **My Onboarding**, clones layout + Admin ink, client signs their boxes. Ad-hoc Documents → Request signature remains for one-offs. See `docs/DMHR_Decisions.md`.

### Quick start

1. Create database `dmhr_portal` in pgAdmin  
2. Configure `backend/.env` from `backend/.env.example`  
3. Backend:

```bash
cd backend
npm install
npx prisma migrate dev
npm run db:seed
npm run dev
```

4. Frontend:

```bash
cd frontend
npm install
npm run dev
```

- API: http://localhost:4000  
- App: http://localhost:3000/login  

### Seed accounts

| Role   | Email                 | Password    |
|--------|-----------------------|-------------|
| Admin  | admin@dmhr.local      | Admin123!   |
| Client | client.a@example.test | Client123!  |
| Client | client.b@example.test | Client123!  |

### Useful Part 2 routes

| Method | Path | Notes |
|--------|------|--------|
| GET | `/client/folders` | Client folders |
| POST | `/client/folders/:folderId/documents` | multipart `file` |
| GET | `/client/documents/:id/download` | optional `?version=` |
| DELETE | `/client/documents/:id` | delete all versions |
| GET | `/admin/organisations/:orgId/folders` | Admin for any org |
| GET/PATCH | `/admin/upload-settings` | Allowed types + max size |

## Docs

- `docs/DMHR_Decisions.md` — locked product decisions  
- `docs/DMHR_Group_Updated_Scope_of_Work.docx` — scope  
- `docs/DMHR_Meeting_Brief.docx` — meeting brief  
- `docs/DMHR_Clarification_Questions.docx` — open client questions  
