# DM.HR Group Client Portal — User Guide

**Subtitle:** Quick start for Admin (DM.HR) and Client users  
**Portal URL:** https://portal.dmhrgroup.com  
**Version:** 1.0  
**Date:** November 2026  

> Confidential — for DM.HR staff and authorised client organisations.  
> Illustrated Word export: `docs/DMHR_Portal_User_Guide.docx` (built via `docs/build_user_guide_docx.py` + `docs/user-guide-assets/`).

---

## How to use this guide

| Role | Who | Sections |
|------|-----|----------|
| **Admin** | DM.HR Group staff | Parts A + B + D + E |
| **Client** | People at a client organisation | Parts A + C + D + E |

- Use the live portal: **https://portal.dmhrgroup.com**
- Each feature follows: **What it is → Steps → Screenshot → Tip**
- Need help? Contact your DM.HR adviser or the person who invited you.

---

# Part A — Getting started (everyone)

## A1. Sign in

**What it is:** Secure login to the DM.HR client portal.

**Steps**
1. Open https://portal.dmhrgroup.com
2. Enter your **email** and **password**
3. If you received an **invite link**, open it first to set your password, then sign in
4. If you received a **temporary password**, sign in and change it when prompted

**[SS: 02-login]** — Login page

> **Tip:** Bookmark the portal URL. The old Vercel link may still work as a backup; prefer `portal.dmhrgroup.com`.

---

## A2. Portal layout

**What it is:** The same shell for Admin and Client — sidebar, main content, search, and notifications.

| Area | Purpose |
|------|---------|
| **Sidebar** | Main navigation |
| **Overview** | Home dashboard |
| **Search** | Find clients, cases, documents (where available) |
| **Bell** | In-app notifications |
| **Profile / Settings** | Account and email preferences |

**[SS: 03-shell]** — Portal shell with sidebar, header, and bell annotated

---

# Part B — Admin guide (DM.HR)

## B1. Overview

**What it is:** At-a-glance view of active clients, open cases, onboarding in progress, and items needing follow-up.

**Steps**
1. After login, open **Overview** (home)
2. Use metric cards to jump into work that needs attention
3. Open a case or activity item from the lists below

**[SS: A01-admin-overview]** — Admin Overview

---

## B2. Organisations (clients)

**What it is:** Each **organisation** is a client company. Almost everything (users, employees, cases, documents) sits under an organisation.

**Steps — add a client**
1. Go to **Organisations**
2. Click **Add client** (or equivalent)
3. Enter company details and save
4. Open the organisation to manage documents, cases, and related records

**[SS: A02-orgs-list]** — Organisations list  
**[SS: A03-add-org]** — Add organisation form  
**[SS: A04-org-detail]** — Organisation detail

> **Tip:** Create the organisation first, then add users and employees for that client.

---

## B3. Users (multiple logins per client)

**What it is:** A **user** is a person who can **log in**. One client organisation can have **many users** — it is **not** limited to one login per client.

**Steps — add a company user**
1. Go to **Users**
2. Add a user and select the **organisation (client)**
3. Choose invite link **or** temporary password
4. Send / confirm the email so they can access the portal

**[SS: A05-users-list]** — Users list (show more than one user on one client if possible)  
**[SS: A06-add-user]** — Add user form with organisation selected

> **Tip:** Employees (next section) are **not** logins. Users = access; Employees = HR records.

---

## B4. Employees

**What it is:** Employee records for a client (name, role, dates, etc.). Used when opening cases. Employees do **not** automatically get portal logins.

**Steps**
1. Go to **Employees**
2. Add an employee and select the client organisation
3. Save — you can link this person when creating a case

**[SS: A07-employees]** — Employees list  
**[SS: A08-add-employee]** — Add employee

---

## B5. Cases

**What it is:** Employment matters (grievance, disciplinary, advice, etc.) linked to a client and optionally an employee.

**Steps — open a case (Admin)**
1. Go to **Cases** → create / add case
2. Select **client**, **category**, **title**, and details
3. Optionally link an **employee**
4. Save

**Emails when Admin opens a case**
- The **client users** for that organisation get a notification email
- The **admin who opened the case** gets a **confirmation email** (ref, title, client, time, link)

**[SS: A09-cases-list]** — Cases list  
**[SS: A10-create-case]** — Create case form  
**[SS: A11-case-detail]** — Case detail / thread

> **Tip:** If a client submits a case themselves, **admins** receive the “new case submitted” email instead.

---

## B6. Documents

**What it is:** Files held for each client organisation (folders, uploads, signed copies).

**Steps**
1. Open **Documents** (or the organisation’s documents area)
2. Choose the client / folder
3. Upload or open a file to preview / download

**[SS: A12-documents]** — Documents for a client

---

## B7. Firm Library and signatures (e-sign)

**What it is:** Firm Library holds templates. Day-to-day sends usually start from a client PDF in **Documents**. The **e-sign builder** lets you pick recipients, place fields, add **CC (notify only)**, then Mark Ready and send.

**Steps — select a document**
1. Open **Documents**, choose the **company**, then a folder
2. On a PDF row, click **Request signature**
3. Or reopen a draft from **Signatures → Prepare**

**Steps — place fields**
1. Select a **recipient** in the rail
2. Add **Signature / Initials / Text / Date / Name** and drag boxes on the PDF
3. **Save fields** as you go

**Steps — CC and send**
1. Open **CC (notify only)** for people who should be notified but cannot fill boxes
2. **Mark Ready** when the layout is final
3. **Send to assignees** (queue also shows **Ready to send**)
4. Track under **Signatures**; signed copies land in the client’s documents

**[SS: A20-request-signature-docs]** — Documents: Request signature  
**[SS: A13-firm-library]** — Firm Library  
**[SS: A14-signatures]** — Signatures list  
**[SS: A21-esign-place-fields]** — Place fields (field types)  
**[SS: A15-esign-sheet]** — E-sign builder after placing a field  
**[SS: A22-esign-cc]** — CC (notify only)

---

## B8. Onboarding

**What it is:** Structured journey for a **new client**: welcome email → pack documents to sign → mark complete when finished.

**Steps**
1. Go to **Onboarding**
2. Start onboarding for the organisation
3. Send the **welcome** email
4. Issue the onboarding **pack**
5. When everything is done, **complete** onboarding so they become a full client

**[SS: A16-onboarding-list]** — Onboarding list  
**[SS: A17-onboarding-detail]** — Onboarding run detail (stages + pack)

---

## B9. Settings (Admin)

**What it is:** Account preferences, notification email toggles, SMTP (so the portal can send email), and email templates.

**Steps**
1. Open **Settings**
2. Confirm **SMTP** is configured if invites and notifications must send
3. Adjust your own email notification preferences if needed
4. Optionally review **Email templates** (wording for invites, cases, e-sign, etc.)

**[SS: A18-settings]** — Settings (SMTP or notifications tab)

> **Tip:** Without working SMTP, in-app notifications still appear, but emails will not leave the portal.

---

## B10. Notifications (Admin)

**What it is:** In-app alert history (bell). Email is separate and controlled by preferences + SMTP.

**[SS: A19-notifications]** — Notifications list

---

# Part C — Client guide

## C1. Overview

**What it is:** Your home page — cases needing attention, onboarding status, and recent activity.

**[SS: C01-client-overview]** — Client Overview

---

## C2. Onboarding

**What it is:** Your new-client pack. Complete items and sign documents when DM.HR issues them.

**Steps**
1. Open **Onboarding**
2. Follow the checklist
3. Open any item that needs a signature and complete it

**[SS: C02-onboarding]** — Client onboarding

---

## C3. Documents

**What it is:** Your organisation’s files, including signed copies after e-sign is finished.

**Steps**
1. Open **Documents**
2. Browse folders and open a file to preview or download

**[SS: C03-documents]** — Client documents  
**[SS: C04-doc-preview]** — Document preview

---

## C4. Signatures

**What it is:** Documents waiting for you (or colleagues) to sign.

**Steps**
1. Open **Signatures**
2. Open a request marked ready for you
3. Add signature / initials as required and submit

**[SS: C12-signatures]** — Client signatures list  
**[SS: C06-sign-ui]** — Signing screen (fill your boxes)

---

## C5. Cases

**What it is:** Employment cases for your organisation. You can submit new cases and reply when DM.HR asks for information.

**Steps — submit a case**
1. Open **Cases** → create / submit
2. Fill category, title, details; link an employee if relevant
3. Attach files if needed and submit

**[SS: C07-cases]** — Client cases list  
**[SS: C08-submit-case]** — Submit case  
**[SS: C09-case-thread]** — Case conversation / timeline

> **Tip:** When you submit a case, DM.HR admins are notified and you also get a confirmation email (when SMTP is working).

---

## C6. Employees

**What it is:** Your organisation’s employee directory (records for cases — not the same as Company Users).

**[SS: C10-employees]** — Client employees

---

## C7. Company Users

**What it is:** Extra logins for colleagues at your organisation. You can have **more than one** user.

**Steps**
1. Open **Company Users**
2. Invite a colleague with their email
3. They set a password and sign in with their own account

**[SS: C11-company-users]** — Company users

---

## C8. Settings — email preferences

**What it is:** Choose which alerts also send email (cases, documents, signatures, onboarding). In-app bell notifications stay available.

**[SS: C12-settings-notifications]** — Client notification preferences

---

# Part D — Emails you may receive

Emails only send when **SMTP is configured** by DM.HR. Check spam/junk if something is missing.

| Event | Admin | Client |
|--------|-------|--------|
| Invite / temporary password / password reset | — | Yes |
| Admin opens a case | Confirmation to the admin who opened it | Yes — “case opened” |
| Client submits a case | Yes — “case submitted” | Confirmation to the client who submitted it |
| Case status / update / client reply | As applicable | As applicable |
| Document available / client upload | As applicable | As applicable |
| E-sign ready / fully signed / revision | As applicable | As applicable |
| Onboarding started / pack / complete | As applicable | Yes |

You can turn email groups on or off under **Settings → Notifications** (in-app alerts continue).

---

# Part E — FAQ

**Is there only one login per client?**  
No. Multiple **users** can belong to the same client organisation, each with their own email and password.

**What is the difference between a User and an Employee?**  
- **User** = can sign in to the portal  
- **Employee** = HR record (often linked to a case); does not automatically get a login  

**I did not get an email**  
1. Check spam/junk  
2. Ask DM.HR to confirm SMTP is set up  
3. Check **Settings → Notifications** email toggles  

**What URL should we use?**  
https://portal.dmhrgroup.com  

**Payments?**  
Marked as coming soon in the portal — not covered in this guide.

---

## Contact

- Website: [www.dmhrgroup.com](https://www.dmhrgroup.com)  
- Portal: [portal.dmhrgroup.com](https://portal.dmhrgroup.com)  

*— End of user guide (v1.0)*

---

## Appendix — Screenshot insert checklist

Use with `docs/DMHR_Portal_User_Guide_Screenshots.md`. Replace each `[SS: …]` before PDF export.
