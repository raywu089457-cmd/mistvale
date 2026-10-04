# overview_batch2.py — 第二批 Xilurus 風格圖集總覽(每個圖集一列,格子依 manifest 裁出、標 id)。
# 用法:python output/l0veyou/prompts/overview_batch2.py <輸出.png> prefix1 prefix2 ...
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[3]
out, prefixes = sys.argv[1], sys.argv[2:]
try:
    font = ImageFont.truetype("msjh.ttc", 18)
    big = ImageFont.truetype("msjh.ttc", 26)
except OSError:
    font = big = ImageFont.load_default()
rows = []
for pre in prefixes:
    man = ROOT / "assets" / f"{pre}@2x.manifest.json"
    if not man.exists():
        continue
    m = json.loads(man.read_text(encoding="utf-8"))
    cells = m["cells"] if isinstance(m["cells"], dict) else {c["id"]: c for c in m["cells"]}
    im = Image.open(ROOT / "assets" / f"{pre}@2x.png").convert("RGBA")
    crops = []
    for k, v in cells.items():
        c = im.crop((v["x"], v["y"], v["x"] + v["w"], v["y"] + v["h"]))
        k2 = 230 / max(c.width, c.height)
        if k2 < 1:
            c = c.resize((max(1, round(c.width * k2)), max(1, round(c.height * k2))), Image.LANCZOS)
        crops.append((k, c))
    rows.append((pre, crops))
W = 40 + max(sum(c.width + 24 for _, c in cr) for _, cr in rows)
H = 80 + sum(max(c.height for _, c in cr) + 70 for _, cr in rows)
o = Image.new("RGBA", (W, H), (22, 27, 36, 255))
d = ImageDraw.Draw(o)
d.text((20, 20), "Xilurus 風格第二批(l0veyou GPT Image 2 → sheet_to_atlas)", fill=(240, 240, 240), font=big)
y = 80
for pre, crops in rows:
    d.text((20, y), pre, fill=(140, 200, 160), font=font)
    x, h = 20, max(c.height for _, c in crops)
    for k, c in crops:
        d.rectangle((x - 4, y + 26, x + c.width + 4, y + 30 + h + 4), fill=(48, 58, 52))
        o.alpha_composite(c, (x, y + 30 + h - c.height))
        d.text((x, y + 36 + h), k, fill=(200, 200, 200), font=font)
        x += c.width + 24
    y += h + 70
o.convert("RGB").save(out)
print(out, o.size)
