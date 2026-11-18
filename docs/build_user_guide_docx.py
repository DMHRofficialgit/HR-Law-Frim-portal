"""Build DMHR_Portal_User_Guide.docx from guide content + screenshot PNGs."""
from __future__ import annotations

import struct
from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor

DOCS = Path(__file__).resolve().parent
ASSETS = DOCS / "user-guide-assets"
OUT = DOCS / "DMHR_Portal_User_Guide.docx"
OUT_ALT = DOCS / "DMHR_Portal_User_Guide_v1.1.docx"

NAVY = RGBColor(0x1C, 0x26, 0x34)
MUTED = RGBColor(0x5B, 0x6B, 0x7C)
ACCENT = RGBColor(0x1A, 0x56, 0xDB)


def png_size(path: Path) -> tuple[int, int]:
    with path.open("rb") as f:
        header = f.read(24)
    if header[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"Not a PNG: {path}")
    width, height = struct.unpack(">II", header[16:24])
    return width, height


def set_run_font(run, size=11, bold=False, color=None, italic=False):
    run.font.name = "Calibri"
    run._element.rPr.rFonts.set(qn("w:eastAsia"), "Calibri")
    run.font.size = Pt(size)
    run.bold = bold
    run.italic = italic
    if color is not None:
        run.font.color.rgb = color


def add_heading(doc, text, level=1):
    p = doc.add_heading(text, level=level)
    for run in p.runs:
        run.font.color.rgb = NAVY
    return p


def add_para(doc, text, bold=False, size=11, space_after=8, italic=False, color=None):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(space_after)
    run = p.add_run(text)
    set_run_font(run, size=size, bold=bold, italic=italic, color=color)
    return p


def add_rich(doc, text, size=11, space_after=8):
    """Support simple **bold** segments."""
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(space_after)
    parts = text.split("**")
    for i, part in enumerate(parts):
        if not part:
            continue
        run = p.add_run(part)
        set_run_font(run, size=size, bold=(i % 2 == 1))
    return p


def add_bullets(doc, items):
    for item in items:
        p = doc.add_paragraph(style="List Bullet")
        parts = item.split("**")
        for i, part in enumerate(parts):
            if not part:
                continue
            run = p.add_run(part)
            set_run_font(run, bold=(i % 2 == 1))


def add_numbered(doc, items):
    for item in items:
        p = doc.add_paragraph(style="List Number")
        parts = item.split("**")
        for i, part in enumerate(parts):
            if not part:
                continue
            run = p.add_run(part)
            set_run_font(run, bold=(i % 2 == 1))


def add_tip(doc, text):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(4)
    p.paragraph_format.space_after = Pt(10)
    label = p.add_run("Tip: ")
    set_run_font(label, bold=True, size=10, color=ACCENT)
    body = p.add_run(text)
    set_run_font(body, size=10, italic=True, color=MUTED)


def add_table(doc, headers, rows):
    table = doc.add_table(rows=1 + len(rows), cols=len(headers))
    table.style = "Table Grid"
    hdr = table.rows[0].cells
    for i, h in enumerate(headers):
        hdr[i].text = ""
        run = hdr[i].paragraphs[0].add_run(h)
        set_run_font(run, bold=True, size=10)
    for r_idx, row in enumerate(rows):
        cells = table.rows[r_idx + 1].cells
        for c_idx, val in enumerate(row):
            cells[c_idx].text = ""
            run = cells[c_idx].paragraphs[0].add_run(val)
            set_run_font(run, size=10)
    doc.add_paragraph()


def add_image(doc, filename, caption=None, max_width_in=6.0, max_height_in=4.2):
    path = ASSETS / filename
    if not path.exists():
        add_para(doc, f"[Screenshot pending: {filename}]", bold=True, size=10, color=MUTED)
        return False

    w_px, h_px = png_size(path)
    width_in = w_px / 96.0
    height_in = h_px / 96.0
    scale = min(max_width_in / width_in, max_height_in / height_in, 1.0)
    width_in *= scale

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(6)
    p.paragraph_format.space_after = Pt(2)
    run = p.add_run()
    run.add_picture(str(path), width=Inches(width_in))

    if caption:
        cap = doc.add_paragraph()
        cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
        cap.paragraph_format.space_after = Pt(14)
        run = cap.add_run(caption)
        set_run_font(run, size=9, italic=True, color=MUTED)
    return True


def section_what(doc, text):
    add_rich(doc, f"**What it is:** {text}")


def build():
    doc = Document()
    section = doc.sections[0]
    section.top_margin = Inches(0.7)
    section.bottom_margin = Inches(0.7)
    section.left_margin = Inches(0.75)
    section.right_margin = Inches(0.75)

    # Cover
    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    title.paragraph_format.space_before = Pt(48)
    run = title.add_run("DM.HR Group Client Portal")
    set_run_font(run, size=26, bold=True, color=NAVY)

    sub = doc.add_paragraph()
    sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = sub.add_run("User Guide")
    set_run_font(run, size=20, bold=True, color=ACCENT)

    meta = doc.add_paragraph()
    meta.alignment = WD_ALIGN_PARAGRAPH.CENTER
    meta.paragraph_format.space_before = Pt(18)
    run = meta.add_run(
        "Quick start for Admin (DM.HR) and Client users\n"
        "Portal: https://portal.dmhrgroup.com\n"
        "Version 1.0 · November 2026"
    )
    set_run_font(run, size=11, color=MUTED)

    conf = doc.add_paragraph()
    conf.alignment = WD_ALIGN_PARAGRAPH.CENTER
    conf.paragraph_format.space_before = Pt(24)
    run = conf.add_run(
        "Confidential — for DM.HR staff and authorised client organisations."
    )
    set_run_font(run, size=10, italic=True, color=MUTED)

    doc.add_page_break()

    # How to use
    add_heading(doc, "How to use this guide", 1)
    add_table(
        doc,
        ["Role", "Who", "Sections"],
        [
            ["Admin", "DM.HR Group staff", "Parts A + B + D + E"],
            ["Client", "People at a client organisation", "Parts A + C + D + E"],
        ],
    )
    add_bullets(
        doc,
        [
            "Use the live portal: **https://portal.dmhrgroup.com**",
            "Each feature follows: **What it is → Steps → Screenshot → Tip**",
            "Need help? Contact your DM.HR adviser or the person who invited you.",
        ],
    )

    # Part A
    add_heading(doc, "Part A — Getting started (everyone)", 1)

    add_heading(doc, "A1. Sign in", 2)
    section_what(doc, "Secure login to the DM.HR client portal.")
    add_para(doc, "Steps", bold=True, size=11, space_after=4)
    add_numbered(
        doc,
        [
            "Open https://portal.dmhrgroup.com",
            "Enter your **email** and **password**",
            "If you received an **invite link**, open it first to set your password, then sign in",
            "If you received a **temporary password**, sign in and change it when prompted",
        ],
    )
    add_image(doc, "02-login.png", "Figure A1 — Login page")
    add_tip(doc, "Bookmark portal.dmhrgroup.com. Prefer this URL over any older preview links.")

    add_heading(doc, "A2. Portal layout", 2)
    section_what(
        doc,
        "The same shell for Admin and Client — sidebar, main content, search, and notifications.",
    )
    add_table(
        doc,
        ["Area", "Purpose"],
        [
            ["Sidebar", "Main navigation"],
            ["Overview", "Home dashboard"],
            ["Search", "Find clients, cases, documents (where available)"],
            ["Bell", "In-app notifications"],
            ["Profile / Settings", "Account and email preferences"],
        ],
    )
    add_image(doc, "03-shell.png", "Figure A2 — Portal shell (sidebar, header, workspace)")

    # Part B Admin
    doc.add_page_break()
    add_heading(doc, "Part B — Admin guide (DM.HR)", 1)

    add_heading(doc, "B1. Overview", 2)
    section_what(
        doc,
        "At-a-glance view of active clients, open cases, onboarding in progress, and items needing follow-up.",
    )
    add_para(doc, "Steps", bold=True, size=11, space_after=4)
    add_numbered(
        doc,
        [
            "After login, open **Overview** (home)",
            "Use metric cards to jump into work that needs attention",
            "Open a case or activity item from the lists below",
        ],
    )
    add_image(doc, "A01-admin-overview.png", "Figure B1 — Admin Overview")

    add_heading(doc, "B2. Organisations (clients)", 2)
    section_what(
        doc,
        "Each organisation is a client company. Users, employees, cases, and documents sit under an organisation.",
    )
    add_para(doc, "Steps — add a client", bold=True, size=11, space_after=4)
    add_numbered(
        doc,
        [
            "Go to **Organisations**",
            "Click **Add client** (or equivalent)",
            "Enter company details and save",
            "Open the organisation to manage documents, cases, and related records",
        ],
    )
    add_image(doc, "A02-orgs-list.png", "Figure B2a — Organisations list")
    add_image(doc, "A03-add-org.png", "Figure B2b — Add organisation")
    add_image(doc, "A04-org-detail.png", "Figure B2c — Organisation detail")
    add_tip(doc, "Create the organisation first, then add users and employees for that client.")

    add_heading(doc, "B3. Users (multiple logins per client)", 2)
    section_what(
        doc,
        "A user is a person who can log in. One client organisation can have many users — not limited to one login per client.",
    )
    add_para(doc, "Steps — add a company user", bold=True, size=11, space_after=4)
    add_numbered(
        doc,
        [
            "Go to **Users**",
            "Add a user and select the **organisation (client)**",
            "Choose invite link **or** temporary password",
            "Send / confirm the email so they can access the portal",
        ],
    )
    add_image(doc, "A05-users-list.png", "Figure B3a — Users list")
    add_image(doc, "A06-add-user.png", "Figure B3b — Add user")
    add_tip(doc, "Employees are not logins. Users = access; Employees = HR records.")

    add_heading(doc, "B4. Employees", 2)
    section_what(
        doc,
        "Employee records for a client (name, role, dates). Used when opening cases. Employees do not automatically get portal logins.",
    )
    add_para(doc, "Steps", bold=True, size=11, space_after=4)
    add_numbered(
        doc,
        [
            "Go to **Employees**",
            "Add an employee and select the client organisation",
            "Save — you can link this person when creating a case",
        ],
    )
    add_image(doc, "A07-employees.png", "Figure B4a — Employees list")
    add_image(doc, "A08-add-employee.png", "Figure B4b — Add employee")

    add_heading(doc, "B5. Cases", 2)
    section_what(
        doc,
        "Employment matters (grievance, disciplinary, advice, etc.) linked to a client and optionally an employee.",
    )
    add_para(doc, "Steps — open a case (Admin)", bold=True, size=11, space_after=4)
    add_numbered(
        doc,
        [
            "Go to **Cases** → create / add case",
            "Select **client**, **category**, **title**, and details",
            "Optionally link an **employee**",
            "Save",
        ],
    )
    add_rich(
        doc,
        "**Emails when Admin opens a case:** client users for that organisation get a notification; "
        "the admin who opened the case gets a confirmation email (ref, title, client, time, link).",
    )
    add_image(doc, "A09-cases-list.png", "Figure B5a — Cases list")
    add_image(doc, "A10-create-case.png", "Figure B5b — Create case")
    add_image(doc, "A11-case-detail.png", "Figure B5c — Case detail")
    add_tip(
        doc,
        "If a client submits a case themselves, admins receive the “new case submitted” email instead.",
    )

    add_heading(doc, "B6. Documents", 2)
    section_what(doc, "Files held for each client organisation (folders, uploads, signed copies).")
    add_para(doc, "Steps", bold=True, size=11, space_after=4)
    add_numbered(
        doc,
        [
            "Open **Documents** (or the organisation’s documents area)",
            "Choose the client / folder",
            "Upload or open a file to preview / download",
        ],
    )
    add_image(doc, "A12-documents.png", "Figure B6 — Documents for a client")

    add_heading(doc, "B7. Firm Library and signatures (e-sign)", 2)
    section_what(
        doc,
        "Firm Library holds templates. Day-to-day sends usually start from a client PDF in **Documents**. "
        "The **e-sign builder** lets you pick recipients, place fields, add CC (notify only), then Mark Ready and send.",
    )
    add_para(doc, "Steps — select a document and open the builder", bold=True, size=11, space_after=4)
    add_numbered(
        doc,
        [
            "Open **Documents**, choose the **company**, then a folder (e.g. Contracts)",
            "On a PDF row, click **Request signature** (pen-on-document icon)",
            "Or reopen a draft later from **Signatures → Prepare**",
        ],
    )
    add_image(doc, "A20-request-signature-docs.png", "Figure B7a — Documents: Request signature on a PDF")
    add_image(doc, "A13-firm-library.png", "Figure B7b — Firm Library (templates)")
    add_image(doc, "A14-signatures.png", "Figure B7c — Signatures queue")

    add_para(doc, "Steps — place fields for each signer", bold=True, size=11, space_after=4)
    add_numbered(
        doc,
        [
            "In the builder (status **Draft — place fields**), select a **recipient** in the rail",
            "Under **Add field**, click **Signature**, **Initials**, **Text**, **Date**, or **Name**",
            "Drag the box on the PDF to the right place; repeat for each signer",
            "Click **Save fields** as you go",
        ],
    )
    add_image(doc, "A21-esign-place-fields.png", "Figure B7d — Place fields (Signature / Initials / Text / Date)")
    add_image(doc, "A15-esign-sheet.png", "Figure B7e — Builder after placing a signature field")

    add_para(doc, "Steps — CC (notify only) and send", bold=True, size=11, space_after=4)
    add_numbered(
        doc,
        [
            "Open **CC (notify only)** and add people who should get email/updates but **cannot fill boxes**",
            "When the layout is final, click **Mark Ready**",
            "When status is ready, click **Send to assignees** (Signatures queue also shows **Ready to send**)",
            "Track progress under **Signatures**; finished signed PDFs appear in the client’s documents",
        ],
    )
    add_image(doc, "A22-esign-cc.png", "Figure B7f — CC (notify only) in the e-sign builder")
    add_tip(
        doc,
        "Signers fill boxes; CC recipients are notified only. Draft = place fields; after Mark Ready + Send, clients see the signing UI.",
    )

    add_heading(doc, "B8. Onboarding", 2)
    section_what(
        doc,
        "Structured journey for a new client: welcome email → pack documents to sign → mark complete when finished.",
    )
    add_para(doc, "Steps", bold=True, size=11, space_after=4)
    add_numbered(
        doc,
        [
            "Go to **Onboarding**",
            "Start onboarding for the organisation",
            "Send the **welcome** email",
            "Issue the onboarding **pack** (each pack item can open the e-sign builder)",
            "When everything is done, **complete** onboarding so they become a full client",
        ],
    )
    add_image(doc, "A16-onboarding-list.png", "Figure B8a — Onboarding list")
    add_image(doc, "A17-onboarding-detail.png", "Figure B8b — Onboarding run detail")

    add_heading(doc, "B9. Settings (Admin)", 2)
    section_what(
        doc,
        "Account preferences, notification email toggles, SMTP (so the portal can send email), and email templates.",
    )
    add_para(doc, "Steps", bold=True, size=11, space_after=4)
    add_numbered(
        doc,
        [
            "Open **Settings**",
            "Confirm **SMTP** is configured if invites and notifications must send",
            "Adjust your own email notification preferences if needed",
            "Optionally review **Email templates**",
        ],
    )
    add_image(doc, "A18-settings.png", "Figure B9 — Admin Settings")
    add_tip(doc, "Without working SMTP, in-app notifications still appear, but emails will not leave the portal.")

    add_heading(doc, "B10. Notifications (Admin)", 2)
    section_what(
        doc,
        "In-app alert history (bell). Email is separate and controlled by preferences + SMTP.",
    )
    add_image(doc, "A19-notifications.png", "Figure B10 — Notifications")

    # Part C Client
    doc.add_page_break()
    add_heading(doc, "Part C — Client guide", 1)

    add_heading(doc, "C1. Overview", 2)
    section_what(
        doc,
        "Your home page — cases needing attention, onboarding status, and recent activity.",
    )
    add_image(doc, "C01-client-overview.png", "Figure C1 — Client Overview")

    add_heading(doc, "C2. Onboarding", 2)
    section_what(
        doc,
        "Your new-client pack. Complete items and sign documents when DM.HR issues them. "
        "Existing clients may see a short status and a link to documents instead of a pack.",
    )
    add_para(doc, "Steps", bold=True, size=11, space_after=4)
    add_numbered(
        doc,
        [
            "Open **Onboarding**",
            "Follow the checklist (or open documents if already set up)",
            "Complete any item that needs a signature",
        ],
    )
    add_image(doc, "C02-onboarding.png", "Figure C2 — Client onboarding")

    add_heading(doc, "C3. Documents", 2)
    section_what(
        doc,
        "Your organisation’s files across six folders, including signed copies after e-sign is finished.",
    )
    add_para(doc, "Steps", bold=True, size=11, space_after=4)
    add_numbered(
        doc,
        [
            "Open **Documents**",
            "Choose a folder (Policies, Handbook, Contracts, etc.)",
            "Upload a PDF or open a file to preview / download",
        ],
    )
    add_image(doc, "C03-documents.png", "Figure C3 — Client documents")

    add_heading(doc, "C4. Signatures", 2)
    section_what(
        doc,
        "Save drawn or uploaded PNG signatures, and open documents waiting for your e-sign.",
    )
    add_para(doc, "Steps", bold=True, size=11, space_after=4)
    add_numbered(
        doc,
        [
            "Open **Signatures**",
            "Draw or upload a PNG signature (optional, up to 5)",
            "Click **Sign** on a request that needs you",
            "Fill your fields (draw, saved, or type), then **Finish my part**",
        ],
    )
    add_image(doc, "C12-signatures.png", "Figure C4a — Client signatures list")
    add_image(doc, "C06-sign-ui.png", "Figure C4b — Signing screen (fill your boxes)")

    add_heading(doc, "C5. Cases", 2)
    section_what(
        doc,
        "Employment cases for your organisation. You can submit new cases and reply when DM.HR asks for information.",
    )
    add_para(doc, "Steps — submit a case", bold=True, size=11, space_after=4)
    add_numbered(
        doc,
        [
            "Open **Cases** → **Create case**",
            "Fill category, title, details; link an employee if relevant",
            "Attach PDF files if needed and submit",
            "Open a case to follow the **Updates & timeline** thread and post replies",
        ],
    )
    add_image(doc, "C07-cases.png", "Figure C5a — Client cases")
    add_image(doc, "C08-submit-case.png", "Figure C5b — Submit case form")
    add_image(doc, "C09-case-thread.png", "Figure C5c — Case conversation / timeline")
    add_tip(
        doc,
        "When you submit a case, DM.HR admins are notified and you also get a confirmation email (when SMTP is working).",
    )

    add_heading(doc, "C6. Employees", 2)
    section_what(
        doc,
        "Your organisation’s employee directory (records for cases — not the same as Company Users).",
    )
    add_image(doc, "C10-employees.png", "Figure C6 — Client employees")

    add_heading(doc, "C7. Company Users", 2)
    section_what(
        doc,
        "Extra logins for colleagues at your organisation. You can have more than one user.",
    )
    add_para(doc, "Steps", bold=True, size=11, space_after=4)
    add_numbered(
        doc,
        [
            "Open **Company Users**",
            "Invite a colleague with their email",
            "They set a password and sign in with their own account",
        ],
    )
    add_image(doc, "C11-company-users.png", "Figure C7 — Company users")

    add_heading(doc, "C8. Settings", 2)
    section_what(
        doc,
        "Organisation summary (read-only), your profile, password, and email notification preferences.",
    )
    add_image(doc, "C13-settings.png", "Figure C8 — Client Settings")

    # Part D
    doc.add_page_break()
    add_heading(doc, "Part D — Emails you may receive", 1)
    add_para(
        doc,
        "Emails only send when SMTP is configured by DM.HR. Check spam/junk if something is missing.",
        size=11,
    )
    add_table(
        doc,
        ["Event", "Admin", "Client"],
        [
            ["Invite / temporary password / password reset", "—", "Yes"],
            [
                "Admin opens a case",
                "Confirmation to the admin who opened it",
                "Yes — case opened",
            ],
            [
                "Client submits a case",
                "Yes — case submitted",
                "Confirmation to the client who submitted it",
            ],
            ["Case status / update / client reply", "As applicable", "As applicable"],
            ["Document available / client upload", "As applicable", "As applicable"],
            ["E-sign ready / fully signed / revision", "As applicable", "As applicable"],
            ["Onboarding started / pack / complete", "As applicable", "Yes"],
        ],
    )
    add_rich(
        doc,
        "You can turn email groups on or off under **Settings → Notifications** (in-app alerts continue).",
    )

    # Part E
    add_heading(doc, "Part E — FAQ", 1)

    add_para(doc, "Is there only one login per client?", bold=True, size=11, space_after=2)
    add_para(
        doc,
        "No. Multiple users can belong to the same client organisation, each with their own email and password.",
        space_after=10,
    )

    add_para(doc, "What is the difference between a User and an Employee?", bold=True, size=11, space_after=2)
    add_bullets(
        doc,
        [
            "**User** = can sign in to the portal",
            "**Employee** = HR record (often linked to a case); does not automatically get a login",
        ],
    )

    add_para(doc, "I did not get an email", bold=True, size=11, space_after=2)
    add_numbered(
        doc,
        [
            "Check spam/junk",
            "Ask DM.HR to confirm SMTP is set up",
            "Check **Settings → Notifications** email toggles",
        ],
    )

    add_para(doc, "What URL should we use?", bold=True, size=11, space_after=2)
    add_para(doc, "https://portal.dmhrgroup.com", space_after=10)

    add_para(doc, "Payments?", bold=True, size=11, space_after=2)
    add_para(
        doc,
        "Marked as coming soon in the portal — not covered in this guide.",
        space_after=14,
    )

    add_heading(doc, "Contact", 2)
    add_bullets(
        doc,
        [
            "Website: https://www.dmhrgroup.com",
            "Portal: https://portal.dmhrgroup.com",
        ],
    )
    add_para(
        doc,
        "— End of user guide (v1.0)",
        italic=True,
        color=MUTED,
        space_after=0,
    )

    try:
        doc.save(OUT)
        print(f"Wrote {OUT}")
    except PermissionError:
        doc.save(OUT_ALT)
        print(f"Wrote {OUT_ALT} (original DOCX was locked/open)")


if __name__ == "__main__":
    build()
