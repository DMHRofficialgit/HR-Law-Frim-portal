# DMHR Group Client Portal
## Formal Response to “Security & Code Practice Audit”

**Date:** 24 November 2026  
**Re:** Customer-facing audit PDF + related WhatsApp claims (“illegal”, “not GDPR”, “con”, passwords not secured)  
**Source reviewed:** `DMHR_Portal_Security_and_Code_Practice_Audit.pdf` (static code review, 24 November 2026)

---

### 1. Purpose of this document

This is our point-by-point response to the audit PDF.

We accept **real technical gaps** and will close priority items on a **2-day hardening sprint**, with a clear Phase 2 for heavier work.

We **reject** misreadings and exaggerated conclusions that:

- pretend **login passwords are not hashed** (your own PDF says they are),
- collapse SMTP / file-storage issues into “no password security”,
- claim the system is **illegal under UK GDPR** based on a **static code review** that explicitly is **not legal advice** and **not a penetration test**,
- brand a paid, tight-budget build as a **“con”** while the same report lists a solid multi-tenant foundation.

---

### 2. Hard corrections (faults in interpretation / briefing)

| Claim made / implied | Reality |
|----------------------|---------|
| Passwords not hashed / “no idea what GDPR is” on credentials | **FALSE.** Login passwords use **bcrypt**. Invite tokens are **SHA-256 hashed**. Your PDF **INFO 25** states passwords are hashed. |
| System is “illegal in the UK” / “not GDPR compliant” as a blanket verdict | **OVERREACH.** The PDF says it is a **read-only source review**, not a pen test, not hosting review, **not legal advice**. Gaps ≠ court finding of illegality. |
| “No file size limit” / DoS as if uploads are unlimited | **MISLEADING.** Product max upload size exists (**default ~25 MB**). Case upload middleware also caps size. Memory buffering is a separate hardening item — not “no limits.” |
| SMTP plain text = user passwords unencrypted | **CATEGORY ERROR.** SMTP **mailbox** password ≠ **user login** password. Mixing these is the core GPT/briefing fault. |
| Build is a “con” | **BAD FAITH.** Same PDF credits tenant isolation, hashed passwords, hashed invites, SMTP not returned after save, escaped email HTML, secrets/uploads gitignored. |

**Bottom line:** Criticise missing hardening. Do **not** rewrite the report into “you never hashed passwords.”

---

### 3. What is already in place (your PDF agrees — INFO 25)

- User passwords **hashed** (bcrypt)
- Invite tokens **hashed** at rest
- Client organisation scope from **authenticated user**, not trusting request body for tenant
- SMTP password **never returned** by API after save (`hasPassword` only)
- Email HTML escaped / brand sanitised (DM.HR autolink fix)
- `.env` and upload storage **gitignored**
- No live cloud API keys / private keys in current working tree
- Upload **size limits** enforced in product settings

These are not optional footnotes. They are core controls already shipped.

---

### 4. Point-by-point on every audit finding

For each item: **Verdict** → **Your fault / overstatement (if any)** → **Our action**

#### CRITICAL 01 — DB dump in git history

**Verdict:** Real ops issue (dump was committed once; later gitignored). History can still hold it.  
**Overstatement:** Treating this as proof the live product is a fraud.  
**Action:** Restrict/purge history where we control remotes; rotate any credentials that may have been in that dump.

#### CRITICAL 02 — Documents not encrypted at rest

**Verdict:** True at application file layer.  
**Overstatement:** Ignoring that encryption-at-rest is often host/disk/backup level; also ignoring existing access controls.  
**Action:** Phase 2 — app encryption and/or mandatory encrypted volume + encrypted backups. **Not “whole security done in 2 days.”**

#### HIGH 03 — SMTP password plain / UI says “encrypted”

**Verdict:** Real **SMTP** wording/storage mismatch.  
**Fault:** Using this to say **login passwords aren’t hashed**.  
**Action (2-day sprint):** Encrypt SMTP secret in DB **and** correct Settings copy.

#### HIGH 04 — No login/reset rate limit

**Verdict:** True — missing throttle.  
**Overstatement:** MVP gap ≠ “con.”  
**Action (2-day sprint):** Rate-limit login, invite, password-set/reset.

#### HIGH 05 — Long-lived JWT in localStorage

**Verdict:** True — 7-day token; logout is client-side clear.  
**Overstatement:** As if sessions are nonexistent.  
**Action (2-day sprint):** Shorten lifetime; improve logout/revoke path. Full httpOnly cookie sessions = follow-up if needed.

#### HIGH 06 — Temp password / invite in admin API + sessionStorage

**Verdict:** True — deliberate fallback when SMTP fails so onboarding still works.  
**Fault:** Calling a budget/ops fallback “incompetence.”  
**Action (2-day sprint):** Stop persisting secrets in browser storage; one-time display / email-only preference.

#### HIGH 07 — Old invite links remain valid

**Verdict:** True until expiry (~72h).  
**Action (2-day sprint):** Issuing a new invite/reset invalidates previous unused links.

#### HIGH 08 — Uploads held in memory (DoS theme)

**Verdict:** Memory buffering true.  
**Fault:** Implying no size controls. **Size limits exist.**  
**Action:** Stream to disk + concurrency limits (sprint or immediate follow-up).

#### HIGH 09 — File-type checks bypassable

**Verdict:** True — currently extension **OR** MIME; no magic bytes.  
**Overstatement:** Allowlist already exists; this is harden, not “open vault.”  
**Action (2-day sprint):** Require extension **AND** MIME; magic-byte check next.

#### HIGH 10 — HTTPS / security headers

**Verdict:** Largely deploy/runtime.  
**Fault:** Blaming app code for TLS that belongs on the host.  
**Action (2-day sprint):** Add security headers; document HTTPS-only production.

#### MEDIUM 11 — Demo seed passwords

**Verdict:** Dev seed only.  
**Fault:** Equating seed scripts with production credentials.  
**Action:** Block seeding in production environments.

#### MEDIUM 12 — Short JWT secret allowed

**Verdict:** Config hygiene.  
**Action:** Enforce long random production secret; reject known examples when live.

#### MEDIUM 13 — Password policy / no MFA

**Verdict:** Min 8 chars; MFA was **explicitly later** in product decisions.  
**Fault:** Demanding MFA as if it was in the paid Phase 1 scope.  
**Action:** Tighten password rules in sprint; **MFA = Phase 2**.

#### MEDIUM 14 — Clients can delete signed copies

**Verdict:** Rename locked; delete still allowed — fair gap.  
**Action (2-day sprint):** Block client deletion of signed copies.

#### MEDIUM 15 — Sign before formal Send

**Verdict:** Edge-case process gap.  
**Action:** Enforce sent/visible rules on sign/download endpoints.

#### MEDIUM 16 — Any company user can invite peers

**Verdict:** Current product model.  
**Fault:** Calling agreed multi-user behaviour a “hole” without requesting company roles.  
**Action:** Company admin vs standard user — **Phase 2 feature**.

#### MEDIUM 17 — Raw errors on some routes

**Verdict:** Minor.  
**Action (2-day sprint):** Generic client-facing errors; detail in server logs only.

#### MEDIUM 18 — PDF helper from public CDN

**Verdict:** True.  
**Action:** Self-host PDF viewer assets.

#### MEDIUM 19 — 30-day archive purge vs retention

**Verdict:** Built as **product behaviour** (archive → restore → purge).  
**Fault:** Reframing an agreed archive model as unlawful destruction without a written retention policy from you.  
**Action:** Disable/configure purge to match **your** legal-hold / retention instruction.

#### MEDIUM 20 — GDPR export / full access audit not built

**Verdict:** True — logged as later in Decisions (audit + basic export yes; 2FA later).  
**Fault:** Treating backlog as “you shipped an illegal finished product.”  
**Action:** Phase 2 — access auditing for sensitive actions + controlled org export. **Not completable as “whole GDPR” in 2 days.**

#### MEDIUM 21 — Dependency advisories (DoS language)

**Verdict:** Hygiene item.  
**Fault:** “DoS” scare without demonstrated live exploit.  
**Action:** Upgrade Prisma/tooling chain and rescan.

#### LOW 22 — Forwarded IP spoofable

**Verdict:** Proxy trust config.  
**Action:** Configure trusted proxies on deploy.

#### LOW 23 — Destructive maintenance script

**Verdict:** Ops caution.  
**Action:** Extra environment guards / confirmations.

#### LOW 24 — No automated tests / CI in repo

**Verdict:** True for this budget phase.  
**Fault:** Using absence of CI as proof of fraud.  
**Action:** Add critical security tests over time — not a full suite in 2 days.

#### INFO 25 — Positive controls

**Verdict:** Your report already lists our strengths.  
**Fault:** Ignoring INFO 25 in the attack messages while weaponising HIGH/CRITICAL headlines.

---

### 5. What we will complete in ~2 days (priority hardening sprint)

1. Encrypt SMTP mailbox password + fix Settings wording  
2. Rate limits on login / invite / reset  
3. Invalidate old unused invite/reset links when new ones issue  
4. Stop persisting temporary passwords in browser storage  
5. Upload allowlist: extension **AND** MIME  
6. Block client delete of signed document copies  
7. Security headers + shorter access-token lifetime  
8. Production guards: seed blocked; stronger JWT secret rules  
9. Written ops steps for historical dump (access restrict / rotate)

**Deliverable after sprint:** written checklist of closed items vs remaining Phase 2.

---

### 6. Phase 2 (required for “full security protocol” — not 2 days)

- Encryption at rest for documents + encrypted backups  
- Full session revocation / safer cookie sessions  
- MFA (at least Admin)  
- Full sensitive-action audit trail + organisation data export  
- Stream uploads to disk + magic-byte verification  
- Company-level roles  
- Retention / legal-hold policy locked with you  
- Broader automated security tests + dependency cadence  

---

### 7. Our position

We built a multi-tenant HR/client portal under a **tight budget**, with explicit phasing (including MFA / GDPR export later).

We will **fix real gaps**.

We will **not** accept:

- false claims that login passwords are unhashed,
- “illegal / con” language that the PDF itself does not establish,
- moving goalposts from beta hardening into moral condemnation.

If the requirement is now **regulated go-live hardening**, say so clearly — we will execute the sprint and Phase 2 as scoped work.  
If the requirement is abuse and accusations that contradict the report’s own INFO section, that is a commercial/relationship problem, not an engineering one.

---

### 8. Next step we expect from you

1. Confirm the **2-day sprint** scope above.  
2. Confirm whether live/staging credentials may have existed in the historical dump (so rotation is complete).  
3. Confirm retention preference for archive purge (keep 30 days / extend / admin-only delete).  
4. Stop restating disproven claims about unhashed login passwords.

---

**End of document**
