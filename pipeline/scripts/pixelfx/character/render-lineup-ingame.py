"""Compose output/pixelfx-heroes/lineup-ingame.png: the six rig classes in the village, one column each.

Reads the per-class village clips written by render-ingame.mjs --six (six-<class>-idle.png /
six-<class>-walk.png, clipped at deviceScaleFactor 3 around the projected feet) and lays them out as a 1x row
(idle, true game size) and a 2x row (walking) so the Lead can judge value contrast against the real ground
and against the other classes in one camera. Captions in Traditional Chinese.

Usage: python pipeline/scripts/pixelfx/character/render-lineup-ingame.py [--tag new] [--out FILE]
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[4]
SHOTS = ROOT / "output" / "pixelfx-heroes"
OUT = ROOT / "output" / "pixelfx-heroes" / "lineup-ingame.png"
DPR = 3

BG_PANEL = (26, 24, 30)
INK = (238, 234, 226)
DIM = (168, 164, 156)
GOLD = (226, 196, 92)

NAMES = {
    "archer": "\u5f13\u7bad\u624b",
    "berserker": "\u72c2\u6230\u58eb",
    "paladin": "\u8056\u9a0e\u58eb",
    "sorcerer": "\u9b54\u6cd5\u5e2b",
    "assassin": "\u523a\u5ba2",
    "priest": "\u796d\u53f8",
}


def load_font(size):
    for name in ("msjh.ttc", "msyh.ttc", "mingliu.ttc", "simhei.ttf"):
        try:
            return ImageFont.truetype(str(Path("C:/Windows/Fonts") / name), size)
        except OSError:
            continue
    return ImageFont.load_default()


def at(img, k):
    return img.resize((max(1, round(img.width * k / DPR)), max(1, round(img.height * k / DPR))), Image.NEAREST)


def main():
    args = sys.argv[1:]
    tag = args[args.index("--tag") + 1] if "--tag" in args else "new"
    out = Path(args[args.index("--out") + 1]) if "--out" in args else OUT
    shot_dir = SHOTS / f"shot-{tag}"
    meta = json.loads((shot_dir / "meta.json").read_text(encoding="utf-8"))
    crops = meta["six"]["crops"]

    pad, gap, title_h, name_h, label_h = 14, 12, 54, 42, 20
    cols = []
    for c in crops:
        idle = Image.open(shot_dir / c["files"][0]).convert("RGBA")
        walk = Image.open(shot_dir / c["files"][1]).convert("RGBA")
        cols.append((c["classId"], at(idle, 1), at(walk, 2)))

    cell_w = max(max(i.width for _, i, _ in cols), max(w.width for _, _, w in cols))
    row1_h = max(i.height for _, i, _ in cols)
    row2_h = max(w.height for _, _, w in cols)
    y_row1 = title_h + label_h + 8 + name_h
    y_row2 = y_row1 + row1_h + 22 + label_h + 8 + name_h
    width = pad * 2 + len(cols) * cell_w + (len(cols) - 1) * gap
    height = y_row2 + row2_h + pad
    img = Image.new("RGBA", (width, height), BG_PANEL + (255,))
    d = ImageDraw.Draw(img)
    f_title, f_label, f_name = load_font(22), load_font(15), load_font(14)
    d.text((pad, 8), "\u66ae\u5f71\u6751 \u00b7 \u516d\u8077\u696d rig \u82f1\u96c4\u5728\u6751\u838a\u88e1 \u00b7 1x \u8207 2x",
           font=f_title, fill=INK)
    d.text((pad, 32), "\u540c\u4e00\u93e1\u982d\u3001\u540c\u4e00\u6751\u838a\u5730\u9ede \u00b7 \u8eab\u9ad4 + meta.parts \u6b66\u5668\u5c64 \u00b7 \u5de6\u81f3\u53f3\uff1a\u5f13\u7bad\u624b\u3001\u72c2\u6230\u58eb\u3001\u8056\u9a0e\u58eb\u3001\u9b54\u6cd5\u5e2b\u3001\u523a\u5ba2\u3001\u796d\u53f8",
           font=f_label, fill=DIM)

    y_row1 = title_h + label_h + 8 + name_h
    y_row2 = y_row1 + row1_h + 22 + label_h + 8 + name_h
    d.text((pad, y_row1 - name_h - label_h - 8), "\u5f85\u6a5f \u00b7 1x \u904a\u6232\u5c3a\u5bf8", font=f_label, fill=GOLD)
    d.text((pad, y_row2 - name_h - label_h - 8), "\u884c\u8d70 \u00b7 2x", font=f_label, fill=GOLD)
    for i, (cid, c1, c2) in enumerate(cols):
        x = pad + i * (cell_w + gap)
        d.text((x, y_row1 - name_h), NAMES.get(cid, cid), font=f_name, fill=GOLD)
        d.text((x, y_row1 - name_h + 20), cid, font=f_label, fill=DIM)
        d.text((x, y_row2 - name_h), NAMES.get(cid, cid), font=f_name, fill=GOLD)
        img.alpha_composite(c1, (x + (cell_w - c1.width) // 2, y_row1))
        img.alpha_composite(c2, (x + (cell_w - c2.width) // 2, y_row2))

    out.parent.mkdir(parents=True, exist_ok=True)
    img.convert("RGB").save(out)
    print(f"wrote {out} ({img.width}x{img.height}) from {shot_dir}")


main()
