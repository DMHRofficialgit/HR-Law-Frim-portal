import json
import pathlib
import sys

src = pathlib.Path(sys.argv[1])
out = pathlib.Path(sys.argv[2])
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
    payload = json.loads(payload)

if not payload.get("ok"):
    raise SystemExit("no svg")

svg = payload["svg"]
if "xmlns=" not in svg[:160]:
    svg = svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"', 1)
out.write_text(svg, encoding="utf-8")
print("wrote", out, out.stat().st_size)
