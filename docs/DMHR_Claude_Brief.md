# BRIEF FOR CLAUDE — DMHR Portal / Dave dispute (read first)

## Who’s who

- **Client:** David Matthews (“Dave”), DM.HR Group — UK HR/employment law firm.
- **Product:** DMHR Group Client Portal — multi-tenant admin + client portal (Next.js frontend, Express + Prisma backend). Holds orgs, users, documents, e-sign, onboarding, cases, employees, firm library, SMTP/settings.
- **Dev team:** Built this under a **tight budget**, phased delivery, with product decisions logged in `docs/DMHR_Decisions.md`.
- **You are helping the developers**, not Dave. We are preparing / refining a hard response doc: `docs/DMHR_Audit_Response.md`.

## What just happened

1. Team shipped recent work (email fixes, HTML invites, bulk actions, wider uploads, archive + 30-day purge) and sent Dave a normal update framing current work as **beta testing**.
2. Dave replied aggressively on WhatsApp (forwarded messages), calling the system a **“con”**, **“not viable”**, **“illegal in the UK”**, **“not compliant with UK GDPR”**, attacking the team’s competence (“400 servers and no idea what GDPR is”), saying he feels stupid, glad he didn’t give more money, and telling them to “read the fucking report.”
3. He attached: **`DMHR_Portal_Security_and_Code_Practice_Audit.pdf`** — a customer-facing static code/config review (dated 24 November 2026). Method: read-only. Explicitly **not** a pen test, **not** hosting review, **not** legal advice on GDPR/SRA.
4. Dave’s WhatsApp **overstated** the PDF. The PDF itself is calmer: solid foundation in places + gaps before treating as ready for sensitive live data. It even has **INFO 25** listing positives (hashed passwords, hashed invites, tenant scoping, etc.).
5. Developers verified PDF claims against the real codebase. Many HIGH/CRITICAL gaps are **technically fair**. Several WhatsApp claims are **false or mixed categories** (especially passwords).

## Dave’s misbehaviour / bad-faith framing (important)

- Abusive language and personal degradation after a paid build.
- Equating a **static audit + backlog items** with **“illegal” / “con”**.
- Ignoring the PDF’s own limitations and INFO positives.
- Acting as if MFA / full GDPR export should already exist when product decisions explicitly said **audit/export later, 2FA later**.
- Using fear language (“illegal”) without a lawyer opinion and without reviewing live hosting/DPA/retention alone.

**Tone note:** Dev team wants a **critical/firm** response doc (not soft corporate apology). Still keep facts accurate — don’t claim fixed things that aren’t fixed.

---

## Critical technical truth Claude must not get wrong

### Login passwords ARE hashed

- User passwords: **bcrypt** on create / login / change.
- Invite tokens: **SHA-256** hash stored; raw token not stored.
- PDF **INFO 25** already says passwords are hashed.
- Dave/GPT briefing fault: treated **SMTP mailbox password plain in DB** and/or **files not encrypted at rest** as “passwords aren’t hashed.”

### SMTP “encrypted” claim is a different issue

- Settings UI text says SMTP password is stored encrypted.
- Reality: SMTP password saved **plain in DB**; API correctly returns only `hasPassword`, never the secret again.
- Fix = encrypt SMTP secret + fix wording. **Do not** concede that user logins are unhashed.

### Upload size limits DO exist

- Default `maxUploadBytes` ≈ **25 MB** in upload settings.
- Case multer also has size caps.
- Product talk of “unlimited storage” = keep files/versions, **not** unlimited per-file size.
- PDF HIGH 08 DoS point is mainly **memory buffering** (`multer.memoryStorage()`), not “no size limit.”

### Multi-tenant isolation is real

- Client org scope comes from authenticated user.
- PDF acknowledges this as a strength.

---

## What we already built recently (context Dave may ignore)

Phase / feature work shipped around mid–late November 2026:

1. **Phase 1 email:** Stop bare `DM.HR` in outbound mail (mail clients treat `.hr` as Croatia TLD → fake links). Sanitize to DMHR / DMHR Group.
2. **Phase 2 S1:** HTML access emails with CTA button; template guard against `DM.HR`.
3. **Org CC notify emails** + case mailbox CC (`case@`) on client-visible case activity.
4. **Directory bulk:** orgs / users / employees / cases (actions differ by table).
5. **WP5:** Bulk resend pending invites.
6. **WP6 / uploads widen:** Documents, Firm Library, cases accept PDF + Word + images; **e-sign remains PDF-only**.
7. **Archive + 30-day purge** for orgs/employees/cases (Users stay Disable/Enable). Show archived + Restore. This was a product choice after discussion — PDF flags purge vs retention as MEDIUM 19.

Also earlier: e-sign, onboarding, firm library, documents, cases, employees, settings/SMTP/templates, etc.

---

## PDF findings — verified against code (cheat sheet)

### Already solid / PDF agrees

- bcrypt passwords, hashed invites, tenant scoping, SMTP not returned after save, email escaping, gitignore secrets/uploads, upload size limits.

### Real gaps (don’t deny)

| ID | Issue | Notes |
|----|--------|------|
| C01 | DB dump once in git history (`dmhr_local_to_render.dump`, later gitignored) | Ops/incident-style; rotate if dump had real creds |
| C02 | Docs not app-encrypted at rest | Plain `writeStoredFile` |
| H03 | SMTP plain + UI says encrypted | Wording/storage mismatch |
| H04 | No login/invite rate limit | Missing |
| H05 | 7d JWT in localStorage; no server revoke | True |
| H06 | Temp password/invite in API + sessionStorage | Deliberate SMTP-fail fallback |
| H07 | Old invite links not invalidated | True until ~72h expiry |
| H08 | Uploads in memory | DoS risk; size limits still exist |
| H09 | Upload allow = ext **OR** mime | No magic bytes |
| H10 | Security headers / HTTPS defaults | Mostly deploy |
| M11–M24 | Seed demos, weak JWT min length, no MFA, signed-copy delete, sign-before-send edge, company roles, errors, CDN PDF, archive purge vs retention, no full GDPR audit/export, deps, IP spoof, cleanup script, no CI | Mix of MVP backlog + product scope |
| I25 | Positives | Dave ignored this |

### Intentionally later (Decisions) — Dave flagged as if missing = illegal

- Full audit log + basic org export (GDPR phase 1 planned later)
- 2FA/MFA later
- Company admin vs user roles not built

---

## Commercial / process context

- Tight budget MVP → beta.
- Security hardening for “law-firm live privileged data at scale” was **not** sold as already finished.
- Archive purge was productised; retention policy may need Dave’s legal preference.
- Team offered/planned a **~2-day priority hardening sprint** (SMTP encrypt + wording, rate limits, invalidate invites, stop sessionStorage secrets, upload AND check, block signed-copy client delete, headers + shorter JWT, prod seed/JWT guards, dump ops steps).
- **Full** “security protocol” (encryption at rest, MFA, full audit/export, stream uploads, cookie sessions, roles) is **Phase 2**, not 2 days.

---

## What we need from Claude

When helping on this thread:

1. Treat `docs/DMHR_Audit_Response.md` as the developer position paper to Dave.
2. Keep **factual**: don’t invent that Critical encryption-at-rest is already done.
3. Keep **firm**: correct Dave/GPT misreads (especially unhashed passwords, illegal/con, no size limit).
4. If asked to soften/harden language, follow the user’s tone preference (they currently want critical/firm).
5. If asked for implementation, use the 2-day sprint list first; park true Phase 2 items.
6. Do **not** give Dave-side “how to sue the developers” framing unless asked; this is a vendor response / remediation planning context.

## Files to know

- Response doc: `docs/DMHR_Audit_Response.md`
- Product locks: `docs/DMHR_Decisions.md`
- Audit PDF (attached in chat / attachments): Security & Code Practice Audit
- Backend auth/tokens: `backend/src/routes/auth.ts`, `backend/src/lib/tokens.ts`
- SMTP: `backend/src/routes/adminSmtp.ts`, `backend/src/lib/mail.ts`; Settings UI claims encrypted
- Uploads: `backend/src/lib/uploadSettings.ts` (ext OR mime; max size)
- Storage (no encrypt): `backend/src/lib/storage.ts`
- Frontend token: `frontend/lib/auth.ts` (localStorage)
- Access creds banner: `frontend/lib/access-credentials.ts` (sessionStorage)

## One-line summary for Claude

**Dave used a partly fair static security audit to make unfair “illegal/con/unhashed passwords” accusations; we verified the code, wrote a point-by-point rebuttal + 2-day fix plan, and need help staying accurate while pushing back hard.**

---

**Related docs to share with Claude together:** `docs/DMHR_Claude_Brief.md` (this file) + `docs/DMHR_Audit_Response.md` + the audit PDF if available.
