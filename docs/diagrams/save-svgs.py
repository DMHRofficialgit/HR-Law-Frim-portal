import json
import pathlib

src = pathlib.Path(
    r"C:\Users\lenovo\.cursor\browser-logs\cdp-response-Runtime.evaluate-2026-10-28T23-28-23-657Z.json"
)
out_dir = pathlib.Path(__file__).resolve().parent
data = json.loads(src.read_text(encoding="utf-8"))

payload = data
if isinstance(data, dict):
    if "result" in data and isinstance(data["result"], dict):
        inner = data["result"]
        if "result" in inner and isinstance(inner["result"], dict):
            payload = inner["result"].get("value")
        else:
            payload = inner.get("value")
    elif "value" in data:
        payload = data["value"]

if isinstance(payload, str):
    items = json.loads(payload)
else:
    items = payload

name_map = {
    "d00": "00-two-sides",
    "d01": "01-use-cases",
    "d02": "02-system-context",
    "d03a": "03a-journey-existing-client",
    "d03b": "03b-journey-new-client",
    "d03c": "03c-journey-documents",
    "d03d": "03d-journey-case",
    "d04": "04-sitemap",
    "d05": "05-er-diagram",
}

for it in items:
    name = name_map.get(it.get("id"), it.get("name") or it.get("id"))
    svg = it.get("svg")
    if not svg:
        print("NO SVG", name)
        continue
    if "xmlns=" not in svg[:160]:
        svg = svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"', 1)
    path = out_dir / f"{name}.svg"
    path.write_text(svg, encoding="utf-8")
    print("wrote", path.name, path.stat().st_size)
