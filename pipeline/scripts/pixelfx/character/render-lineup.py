"""Compose output/pixelfx-heroes/lineup.png: all six rig heroes side by side.

Each class shows (in order) idle, walk-mid, attack strike and one earlier attack frame, at 3x with a
Traditional Chinese caption, plus the same row at 1x on a grass strip so the Lead can judge the class read at
game scale. The body sheets are paperdoll bodies (no weapon), so each cell is composited with its
`<class>-weapon` part sheet at the identical cell offset and pivot (the same thing pixel-world.js does).

Usage: python pipeline/scripts/pixelfx/character/render-lineup.py [--out output/pixelfx-heroes/lineup.png]
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[4]
HERO = ROOT / "assets" / "heroes"
OUT = ROOT / "output" / "pixelfx-heroes"

CLASSES = [
    ("berserker", "狂戰士"),
    ("paladin", "聖騎士"),
    ("sorcerer", "魔法師"),
    ("assassin", "刺客"),
    ("priest", "祭司"),
    ("archer", "弓箭手"),
]
SHOTS = [("idle", 0), ("walk", 4), ("attack", 6), ("attack", 5)]
SHOT_LABELS = ["待機", "行走", "出擊", "預備"]

BG_GRASS = (110, 154, 74)
BG_GRASS_LIGHT = (124, 168, 86)
BG_PANEL = (28, 26, 32)
INK = (238, 234, 226)
DIM = (168, 164, 156)
GOLD = (226, 196, 92)


def load_font(size):
    for name in ("msjh.ttc", "msyh.ttc", "mingliu.ttc", "simhei.ttf"):
        try:
            return ImageFont.truetype(str(Path("C:/Windows/Fonts") / name), size)
        except OSError:
            continue
    return ImageFont.load_default()


def cell_of(img, meta, act, idx):
    a = meta["actions"][act]
    cols = a.get("cols") or 1
    cell = a.get("cell", meta.get("cell", 100))
    sx = (idx % cols) * cell
    sy = a["y"] + (idx // cols) * cell
    return img.crop((sx, sy, sx + cell, sy + cell))


def hero_cell(cls, act, idx):
    body = Image.open(HERO / f"{cls}.png").convert("RGBA")
    bmeta = json.loads((HERO / f"{cls}.json").read_text(encoding="utf-8"))
    out = cell_of(body, bmeta, act, idx)
    parts = bmeta.get("parts") or []
    for part in parts:
        png = HERO / f"{part['sheet']}.png"
        if not png.exists():
            continue
        pmeta = json.loads((HERO / f"{part['sheet']}.json").read_text(encoding="utf-8"))
        if act not in pmeta["actions"]:
            continue
        out.alpha_composite(cell_of(Image.open(png).convert("RGBA"), pmeta, act, idx))
    return out


def grass(w, h, seed=7):
    img = Image.new("RGBA", (w, h), BG_GRASS + (255,))
    px = img.load()
    # cheap deterministic grass texture: two-tone checker + a few blades, so 1x silhouettes are judged
    # against something with real value variation instead of a flat swatch.
    for y in range(h):
        for x in range(w):
            t = ((x // 6) + (y // 6) + seed) % 2
            if t:
                px[x, y] = BG_GRASS_LIGHT + (255,)
    d = ImageDraw.Draw(img)
    for i in range(0, w * 3, 37):
        x = (i * 13 + seed * 17) % max(1, w)
        y = (i * 29 + seed * 11) % max(1, h)
        d.line([(x, y), (x, max(0, y - 3))], fill=(94, 136, 62, 255))
    return img


def main():
    out = OUT / "lineup.png"
    args = sys.argv[1:]
    if "--out" in args:
        out = Path(args[args.index("--out") + 1])

    big_k, small_k = 3, 1
    cell_big, cell_small = 100 * big_k, 100 * small_k
    label_h = 26
    pad = 14
    title_h = 44
    cols = len(SHOTS)

    row_w = cols * cell_big + 8 * (cols - 1)
    sec_h = label_h + cell_big
    width = pad * 2 + row_w + 210  # left gutter for the class name at 3x
    height = title_h + pad * 2 + len(CLASSES) * sec_h + len(CLASSES) * (cell_small + 18) + 60

    img = Image.new("RGBA", (width, height), BG_PANEL + (255,))
    d = ImageDraw.Draw(img)
    f_title = load_font(24)
    f_name = load_font(22)
    f_shot = load_font(15)
    f_small = load_font(14)

    d.text((pad, 10), "暮影村 rig 英雄圖鑑 · 六職業 · 3x 與 1x(草地背景)", font=f_title, fill=INK)
    d.text((pad, 36), f"紙娃娃:身體 + 武器零件疊合 · cell 100 · footFromBottom 8 · 900x2800",
           font=f_small, fill=DIM)

    y = title_h + pad
    for cls, zh in CLASSES:
        # 3x block on the dark panel
        d.text((pad, y + 4), zh, font=f_name, fill=GOLD)
        d.text((pad, y + 30), cls, font=f_small, fill=DIM)
        x = width - pad - row_w
        for i, (act, idx) in enumerate(SHOTS):
            cx = x + i * (cell_big + 8)
            tint = grass(cell_big, cell_big, seed=idx + 3)
            img.alpha_composite(tint, (cx, y + label_h))
            img.alpha_composite(hero_cell(cls, act, idx).resize((cell_big, cell_big), Image.NEAREST),
                                (cx, y + label_h))
            d.text((cx + 3, y + 2), SHOT_LABELS[i], font=f_shot, fill=DIM)
        y += sec_h + 6

        # 1x strip
        strip = grass(row_w, cell_small, seed=11)
        img.alpha_composite(strip, (width - pad - row_w, y))
        for i, (act, idx) in enumerate(SHOTS):
            img.alpha_composite(hero_cell(cls, act, idx), (width - pad - row_w + i * (cell_small + 8), y))
        d.text((pad, y + 36), "1x", font=f_small, fill=DIM)
        y += cell_small + 22

    d.text((pad, height - 26), "來源:pipeline/scripts/pixelfx/character/export-heroes.mjs(rig) · 舊 AI 原圖備份於 assets/heroes/legacy/",
           font=f_small, fill=DIM)
    out.parent.mkdir(parents=True, exist_ok=True)
    img.convert("RGB").save(out)
    print(f"wrote {out} ({img.width}x{img.height})")


main()
