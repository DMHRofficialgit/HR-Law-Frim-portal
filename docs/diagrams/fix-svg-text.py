"""Replace Mermaid foreignObject HTML labels with native SVG <text> so PNG export keeps wording."""
import html
import re
from pathlib import Path

DIR = Path(__file__).resolve().parent


def extract_label(fo_inner: str) -> str:
    # Prefer paragraph / span text
    texts = re.findall(r">([^<>]+)<", fo_inner)
    parts = []
    for t in texts:
        t = html.unescape(t).strip()
        if not t or t in {" ", "\n", "\xa0"}:
            continue
        parts.append(t)
    # join unique consecutive
    label = " ".join(parts)
    label = re.sub(r"\s+", " ", label).strip()
    return label


def wrap_text(label: str, max_chars: int, font_size: int, width: float, height: float) -> str:
    words = label.split(" ")
    lines = []
    cur = ""
    for w in words:
        trial = (cur + " " + w).strip()
        if len(trial) <= max_chars:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    if not lines:
        lines = [label]

    line_h = font_size * 1.25
    total_h = line_h * len(lines)
    start_y = (height - total_h) / 2 + font_size
    cx = width / 2

    if len(lines) == 1:
        return (
            f'<text x="{cx:.1f}" y="{height/2 + font_size*0.35:.1f}" '
            f'text-anchor="middle" fill="#333333" '
            f'font-family="Arial, Helvetica, sans-serif" font-size="{font_size}">'
            f"{html.escape(lines[0])}</text>"
        )

    tspans = []
    for i, line in enumerate(lines):
        y = start_y + i * line_h
        tspans.append(
            f'<tspan x="{cx:.1f}" y="{y:.1f}">{html.escape(line)}</tspan>'
        )
    return (
        f'<text text-anchor="middle" fill="#333333" '
        f'font-family="Arial, Helvetica, sans-serif" font-size="{font_size}">'
        + "".join(tspans)
        + "</text>"
    )


def convert_svg(svg: str) -> str:
    pattern = re.compile(r"<foreignObject([^>]*)>([\s\S]*?)</foreignObject>", re.I)

    def repl(m: re.Match) -> str:
        attrs = m.group(1)
        inner = m.group(2)
        label = extract_label(inner)
        if not label:
            return ""

        wm = re.search(r'\bwidth="([\d.]+)"', attrs)
        hm = re.search(r'\bheight="([\d.]+)"', attrs)
        width = float(wm.group(1)) if wm else 120.0
        height = float(hm.group(1)) if hm else 40.0

        # Font size from box size
        font_size = 14 if height >= 40 else 12
        if width >= 280:
            max_chars = 32
        elif width >= 180:
            max_chars = 24
        else:
            max_chars = 18
            font_size = min(font_size, 12)

        # Very tall thin? keep as is
        return wrap_text(label, max_chars, font_size, width, height)

    return pattern.sub(repl, svg)


def main():
    for path in sorted(DIR.glob("*.svg")):
        raw = path.read_text(encoding="utf-8")
        if "foreignObject" not in raw:
            print("skip (no FO)", path.name)
            continue
        fixed = convert_svg(raw)
        out = path  # overwrite
        out.write_text(fixed, encoding="utf-8")
        print(
            path.name,
            "FO left=",
            fixed.count("foreignObject"),
            "text=",
            fixed.count("<text"),
        )


if __name__ == "__main__":
    main()
