"""Build DMHR_Clarification_Questions.docx — short remaining blockers for David."""
from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.shared import Pt, RGBColor, Inches

DOCS = Path(__file__).resolve().parent
OUT = DOCS / "DMHR_Clarification_Questions.docx"


def set_run(run, size=11, bold=False, color=None):
    run.font.name = "Calibri"
    run._element.rPr.rFonts.set(qn("w:eastAsia"), "Calibri")
    run.font.size = Pt(size)
    run.bold = bold
    if color is not None:
        run.font.color.rgb = color


def add_para(doc, text, bold=False, size=11, space_after=8, color=None):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(space_after)
    run = p.add_run(text)
    set_run(run, size=size, bold=bold, color=color)
    return p


def add_question(doc, number, title, body):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(10)
    p.paragraph_format.space_after = Pt(2)
    run = p.add_run(f"{number}. {title}")
    set_run(run, size=12, bold=True, color=RGBColor(0x1C, 0x26, 0x34))

    p2 = doc.add_paragraph()
    p2.paragraph_format.space_after = Pt(4)
    run = p2.add_run(body)
    set_run(run, size=11)

    p3 = doc.add_paragraph()
    p3.paragraph_format.space_after = Pt(8)
    run = p3.add_run("Answer: _______________________________________________")
    set_run(run, size=10, color=RGBColor(0x5B, 0x6B, 0x7C))


def build():
    doc = Document()
    section = doc.sections[0]
    section.top_margin = Inches(0.75)
    section.bottom_margin = Inches(0.75)
    section.left_margin = Inches(0.85)
    section.right_margin = Inches(0.85)

    title = doc.add_paragraph()
    run = title.add_run("DM.HR Portal — Quick decisions needed")
    set_run(run, size=20, bold=True, color=RGBColor(0x1C, 0x26, 0x34))

    add_para(doc, "To: David Matthews | DM.HR Group", bold=True, size=11)
    add_para(
        doc,
        "We’re building from the approved Scope of Work. "
        "Please answer when you can — short answers are fine. "
        "Most technical choices are already locked; only a few items remain.",
        size=11,
    )

    add_para(doc, "Already decided (for your info — no reply needed)", bold=True, size=12, space_after=4)
    decided = [
        "• E-signature: In-portal only. Statuses Sent → Awaiting Signature → Signed/Returned → Reviewed. "
        "No third-party e-sign. No wet ink.",
        "• Payments / Direct Debit: Admin pastes Direct Debit and initial payment links manually.",
        "• Users: One login per client company. Both email invite and temporary passwords.",
        "• Onboarding: Portal usable as soon as Admin adds the company. Admin only marks Complete. "
        "Folders/files now; checklist later if needed.",
        "• Email: Microsoft 365–ready via SMTP Settings in the portal.",
        "• Files / folders: Configurable types/size. Six folders confirmed. Unlimited storage. "
        "Keep versions simply. Keep until someone removes.",
        "• Private Space: One Admin sees all. Admin-only private notes stay Admin-only.",
        "• Cases: Agreed statuses/categories (+ custom in Settings). Client can reply; Admin can "
        "request response. Notify both ways.",
        "• Employees: Profiles in phase 1 (Admin + Client edit). No employee self-login.",
        "• Branding / UI: Logo from dmhrgroup.com. Clean modern Apple-like UI (not old mockup).",
    ]
    for i, line in enumerate(decided):
        add_para(doc, line, size=10, space_after=2 if i < len(decided) - 1 else 8)

    add_question(
        doc,
        1,
        "Email “from” display name",
        "What should appear as the sender name on portal emails?\n"
        "Suggested default: DM.HR Group\n"
        "(Alternatively a person’s name — mailbox itself is set in Settings.)",
    )
    add_question(
        doc,
        2,
        "Rough go-live month (optional)",
        "Month is enough if you have a target.",
    )
    add_question(
        doc,
        3,
        "Confirm out of scope",
        "Please confirm we are not building in this phase: full card payments, payroll, "
        "bulk Dropbox/email migration, automated legal advice, employee self-login.",
    )

    add_para(
        doc,
        "Thank you — once these are confirmed we can treat requirements as fully locked for build.",
        size=11,
        space_after=4,
    )

    footer = doc.add_paragraph()
    footer.alignment = WD_ALIGN_PARAGRAPH.LEFT
    run = footer.add_run(
        "Prepared for DM.HR Group · Related: UPDATED SCOPE OF WORK · Meeting Brief · DMHR_Decisions.md"
    )
    set_run(run, size=9, color=RGBColor(0x5B, 0x6B, 0x7C))

    try:
        doc.save(OUT)
        print(f"Wrote {OUT} ({OUT.stat().st_size} bytes)")
    except PermissionError:
        fallback = DOCS / "DMHR_Clarification_Questions_updated.docx"
        doc.save(fallback)
        print(f"Original locked; wrote {fallback} ({fallback.stat().st_size} bytes)")


if __name__ == "__main__":
    build()
