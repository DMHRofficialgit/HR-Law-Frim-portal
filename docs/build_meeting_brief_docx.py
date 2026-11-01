"""Build DMHR_Meeting_Brief.docx from text + diagram PNGs."""
import struct
from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor

DOCS = Path(__file__).resolve().parent
DIAGRAMS = DOCS / "diagrams"
OUT = DOCS / "DMHR_Meeting_Brief.docx"
OUT_FALLBACK = DOCS / "DMHR_Meeting_Brief_with_text.docx"


def png_size(path: Path):
    with path.open("rb") as f:
        header = f.read(24)
    if header[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"Not a PNG: {path}")
    width, height = struct.unpack(">II", header[16:24])
    return width, height


def set_run_font(run, size=11, bold=False, color=None):
    run.font.name = "Calibri"
    run._element.rPr.rFonts.set(qn("w:eastAsia"), "Calibri")
    run.font.size = Pt(size)
    run.bold = bold
    if color is not None:
        run.font.color.rgb = color


def add_heading(doc, text, level=1):
    p = doc.add_heading(text, level=level)
    for run in p.runs:
        run.font.color.rgb = RGBColor(0x1C, 0x26, 0x34)
    return p


def add_para(doc, text, bold=False, size=11, space_after=8):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(space_after)
    run = p.add_run(text)
    set_run_font(run, size=size, bold=bold)
    return p


def add_bullets(doc, items):
    for item in items:
        p = doc.add_paragraph(style="List Bullet")
        # support simple **bold** segments
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


def add_image(doc, filename, caption=None, max_width_in=6.2, max_height_in=8.5):
    path = DIAGRAMS / filename
    if not path.exists():
        add_para(doc, f"[Missing diagram: {filename}]", bold=True)
        return

    w_px, h_px = png_size(path)

    # Assume ~96 dpi display; scale to fit page box
    width_in = w_px / 96.0
    height_in = h_px / 96.0
    scale = min(max_width_in / width_in, max_height_in / height_in, 1.0)
    width_in *= scale

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run()
    run.add_picture(str(path), width=Inches(width_in))

    if caption:
        cap = doc.add_paragraph()
        cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
        cap.paragraph_format.space_after = Pt(12)
        run = cap.add_run(caption)
        set_run_font(run, size=9, color=RGBColor(0x5B, 0x6B, 0x7C))


def build():
    doc = Document()

    section = doc.sections[0]
    section.top_margin = Inches(0.7)
    section.bottom_margin = Inches(0.7)
    section.left_margin = Inches(0.8)
    section.right_margin = Inches(0.8)

    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.LEFT
    run = title.add_run("DM.HR Group — Meeting Brief")
    set_run_font(run, size=22, bold=True, color=RGBColor(0x1C, 0x26, 0x34))

    add_para(doc, "Client Portal & Case Management Platform", bold=True, size=12)
    add_para(
        doc,
        "Sources: Scope of Work · David’s requirements message · HTML mockup (UI reference)",
        size=10,
    )
    add_para(
        doc,
        "Use this document to brief the project in meetings. Diagrams are embedded below.",
        size=10,
    )

    # 1
    add_heading(doc, "1. What is this portal?", 1)
    add_para(
        doc,
        "DM.HR Group helps care companies with HR and employment issues.",
    )
    add_para(
        doc,
        "Today that work is messy (email, Dropbox, paperwork). This portal is one private website where:",
    )
    add_bullets(
        doc,
        [
            "**DM.HR** manages their clients",
            "**Each client company** only sees **their own** stuff",
            "Documents live in clear folders",
            "Problems become **cases** you can track",
            "**New** clients get guided online onboarding",
            "**Old** clients skip that and just use the portal",
        ],
    )
    add_para(
        doc,
        "Think: shared office online between DM.HR and each company — not a public website.",
        bold=True,
    )

    # 2
    add_heading(doc, "2. Actors (who uses it)", 1)
    add_table(
        doc,
        ["Actor", "Who", "Simple job"],
        [
            [
                "Admin / HR team",
                "People at DM.HR",
                "Add clients, upload docs, run onboarding, handle cases",
            ],
            [
                "Client user",
                "Person at the care company (manager / contact)",
                "Login, get docs, open cases, upload private files",
            ],
            [
                "(later) Employee",
                "Staff of the care company",
                "Not a main login in this foundation — employees are mostly records",
            ],
        ],
    )
    add_para(doc, "For v1 foundation: 2 real sides — Admin and Client.", bold=True)

    # 3
    add_heading(doc, "3. Two sides of the portal", 1)
    add_image(doc, "00-two-sides.png", "Figure: Admin side vs Client side")
    add_para(doc, "Same system. Different menu after login.")

    # 4
    add_heading(doc, "4. What we are achieving", 1)
    add_numbered(
        doc,
        [
            "Each company has **its own locked room** (no peeking at other companies).",
            "Docs are organised (not lost in email).",
            "Cases have a clear thread (open → update → close).",
            "New clients can onboard online; old ones jump straight in.",
            "DM.HR looks professional and organised.",
        ],
    )
    add_para(
        doc,
        "One line: Admin side = control room for all clients. Client side = that company’s private folder + cases. Goal = stop chasing HR work in email.",
        bold=True,
    )

    # 5
    add_heading(doc, "5. Actors & use case diagram", 1)
    add_para(
        doc,
        "Actors connect to their use-case groups (Admin first, then Client). Boxes inside a group are capabilities, not ordered steps.",
    )
    add_image(doc, "01-use-cases.png", "Figure: Use case diagram (vertical)", max_height_in=9.0)

    # 6
    add_heading(doc, "6. High-level system context", 1)
    add_image(doc, "02-system-context.png", "Figure: System context")
    add_para(
        doc,
        "Rule: Portal stores payment/DD links + status. It does not process money or replace Xero.",
        bold=True,
    )

    # 7
    add_heading(doc, "7. User workflows / journeys", 1)

    add_heading(doc, "A) Existing client (already with DM.HR)", 2)
    add_numbered(
        doc,
        [
            "Admin creates/imports company + login",
            "Marks them **Already onboarded**",
            "Client logs in → **dashboard** (no onboarding)",
            "Uses docs + cases + private space",
        ],
    )
    add_image(doc, "03a-journey-existing-client.png", "Figure: Existing client journey")

    add_heading(doc, "B) New client", 2)
    add_numbered(
        doc,
        [
            "Admin adds company",
            "Send Terms → client **signs online**",
            "Send welcome pack",
            "Issue compliance docs",
            "Send Direct Debit + first payment **links**",
            "Admin marks onboarding **complete**",
            "Client uses normal portal (same as existing)",
        ],
    )
    add_image(doc, "03b-journey-new-client.png", "Figure: New client onboarding")

    add_heading(doc, "C) Documents", 2)
    add_numbered(
        doc,
        [
            "Admin opens Client X → picks folder (Documents / Policies / Handbook / Contracts / Useful / Private)",
            "Uploads file",
            "Client logs in → opens that folder → **downloads**",
            "In **Private Space**, client can also **upload** their own files; admin can see those too",
        ],
    )
    add_image(doc, "03c-journey-documents.png", "Figure: Documents flow")

    add_heading(doc, "D) Case", 2)
    add_numbered(
        doc,
        [
            "Client clicks **Add a case** → fills form → maybe attaches file",
            "DM.HR sees it → replies / asks for more / updates status",
            "Client clicks **Check a case** → sees status + client-visible updates",
            "Email can notify when something important updates",
            "Internal HR notes stay **hidden** from the client",
        ],
    )
    add_image(doc, "03d-journey-case.png", "Figure: Case flow")

    # 8
    add_heading(doc, "8. Portal sides & navigation map (sitemap)", 1)
    add_image(doc, "04-sitemap.png", "Figure: Sitemap / navigation")
    add_para(
        doc,
        "Client document areas (6): My Documents · My Policies · My Handbook · My Contracts · My Useful Documents · My Private Space",
        bold=True,
    )

    # 9
    add_heading(doc, "9. Data model (ER diagram)", 1)
    add_image(doc, "05-er-diagram.png", "Figure: Data model (ER)", max_height_in=8.0)
    add_para(doc, "Key rules", bold=True)
    add_table(
        doc,
        ["Field", "Values"],
        [
            ["onboarding_status", "existing_skip · in_progress · completed"],
            [
                "documents.area",
                "documents · policies · handbook · contracts · useful · private",
            ],
            ["users.role", "admin · client"],
            [
                "Case updates",
                "Client-visible updates vs internal notes (never emailed to client)",
            ],
        ],
    )
    add_para(
        doc,
        "Everything business-critical hangs off organisation_id (Company A never sees Company B).",
        bold=True,
    )

    # 10
    add_heading(doc, "10. Finished foundation product — what we will have", 1)
    add_table(
        doc,
        ["You have", "Meaning"],
        [
            ["Login", "Admin and client accounts, secure"],
            ["Clients list", "Add companies; tag Existing vs New"],
            ["Onboarding for new only", "Steps + status; existing skip it"],
            [
                "6 document areas per client",
                "Admin upload; client download; Private Space both ways",
            ],
            ["Cases", "Create, track, update, close; emails for updates"],
            ["Separation", "Company A never sees Company B"],
            ["Admin dashboard", "Who needs attention (onboarding / cases)"],
        ],
    )
    add_para(
        doc,
        "Not in this foundation (unless agreed later): full payments system, payroll, bulk Dropbox migration, employee self-login filling 30 forms.",
        bold=True,
    )

    # 11
    add_heading(doc, "11. Source alignment (quick)", 1)
    add_table(
        doc,
        ["Source", "Role"],
        [
            ["SOW + David’s message", "Truth for build"],
            ["HTML mockup", "UI feel (older: 3 doc folders; product uses 6)"],
            [
                "Early call understanding",
                "Rough — right on clients/docs; overstated “30 employees fill forms”",
            ],
        ],
    )

    add_heading(doc, "Diagram index", 1)
    add_table(
        doc,
        ["File", "Diagram"],
        [
            ["00-two-sides.png", "Admin vs Client"],
            ["01-use-cases.png", "Actors & use cases"],
            ["02-system-context.png", "System context"],
            ["03a-journey-existing-client.png", "Existing client journey"],
            ["03b-journey-new-client.png", "New client onboarding"],
            ["03c-journey-documents.png", "Documents flow"],
            ["03d-journey-case.png", "Case flow"],
            ["04-sitemap.png", "Navigation map"],
            ["05-er-diagram.png", "Data model"],
        ],
    )

    try:
        doc.save(OUT)
        target = OUT
    except PermissionError:
        doc.save(OUT_FALLBACK)
        target = OUT_FALLBACK
        print(f"Original locked; wrote fallback instead.")
    print(f"Wrote {target} ({target.stat().st_size} bytes)")


if __name__ == "__main__":
    build()
