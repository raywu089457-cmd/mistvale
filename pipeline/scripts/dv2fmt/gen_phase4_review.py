#!/usr/bin/env python3
"""gen_phase4_review.py <hats|weapons|effects> -- 4x review images in output/dv2fmt/review/phase4_<kind>.png (read-only on the art)."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from PIL import Image, ImageDraw
import numpy as np
import dv2fmt as F

SRC = F.SRC_DIR
REV = F.OUT_DIR / "review"
BG = (58, 62, 80, 255)
S = 4


def load(name):
    return Image.open(SRC / name).convert("RGBA")


def cellimg(img, cx, cy, w, h):
    return img.crop((cx * w, cy * h, cx * w + w, cy * h + h))


def hats(names):
    cls = F.CLASSES
    pad = 2
    cw = 20 + pad
    W = len(cls) * (3 * cw + 4) + 4
    H = (1 + len(names)) * (20 + pad) + 4
    sheet = Image.new("RGBA", (W, H), BG)
    for j, c in enumerate(cls):
        head = load(f"{c}_head.png")
        for k, (row, hrow) in enumerate((("back", 0), ("side", 1), ("front", 1))):
            hc = cellimg(head, 0, hrow, 20, 20)
            x = 4 + j * (3 * cw + 4) + k * cw
            sheet.alpha_composite(hc, (x, 2))
            for i, n in enumerate(names):
                hat = load(f"hat_{n}.png")
                tile = Image.new("RGBA", (20, 20), (0, 0, 0, 0))
                tile.alpha_composite(hc)
                tile.alpha_composite(cellimg(hat, 0, k, 20, 20))
                sheet.alpha_composite(tile, (x, 2 + (i + 1) * (20 + pad)))
    return sheet.resize((W * S, H * S), Image.NEAREST)


ACTS = json.loads(F.ACTIONS_JSON.read_text(encoding="utf-8"))["actions"]
KIT = {"sword": "paladin", "axe": "berserker", "staff": "sorcerer"}   # weapon type -> the class that carries it
GRIPS = {t: F.WEAPON_TYPES[t]["grip"] for t in KIT}


def weapon_cell(name, col=0):
    return load(f"weapon_{name}.png").crop((col * 40, 0, col * 40 + 40, 40))


def pose(cls, wtype, wname, action, slot, back_weapon=False, S_=(84, 100)):
    """facing right (side view): body + head + weapon rotated around its grip + hand, composited on a 60x60 canvas, foot at (30,48)"""
    spec = ACTS[f"{action}.{wtype}"]
    sl = spec["views"]["side"][slot]
    dl = spec["dirs"]["right"]["slots"][slot]
    order = spec["dirs"]["right"]["order"]
    fx, fy = S_[0] // 2, S_[1] - 12
    cv = Image.new("RGBA", S_, (0, 0, 0, 0))
    bx, by = F.body_cell_xy("side", sl["cell"])
    body = load(f"{cls}_body.png").crop((bx, by, bx + 30, by + 30))
    hand = load(f"{cls}_hand.png").crop((bx, by, bx + 30, by + 30))
    head = load(f"{cls}_head.png").crop((0, 20, 20, 40))
    wp = weapon_cell(wname, dl.get("sebF", 0))
    gx, gy = GRIPS[wtype]
    big = Image.new("RGBA", (80, 80), (0, 0, 0, 0))
    big.alpha_composite(wp, (40 - gx, 40 - gy))                       # grip at (40,40)
    big = big.rotate(-dl["deg"], resample=Image.NEAREST, center=(40, 40))
    wx, wy = fx + sl["wh"][0], fy + sl["wh"][1]
    layers = {
        "body": lambda: cv.alpha_composite(body, (fx - 15, fy - 30)),
        "head": lambda: cv.alpha_composite(head, (fx + sl["head"][0] - 10, fy + sl["head"][1] - 20)),
        "hand": lambda: cv.alpha_composite(hand, (fx - 15, fy - 30)),
        "weapon": lambda: cv.alpha_composite(big, (wx - 40, wy - 40)),
    }
    for name in order:
        if name in layers:
            layers[name]()
    return cv


def sprite_tile(name, mark=None):
    t = Image.new("RGBA", (40, 40), BG)
    t.alpha_composite(weapon_cell(name))
    if mark:
        px = t.load()
        px[mark[0], mark[1]] = (255, 60, 60, 255) if px[mark[0], mark[1]][:3] == BG[:3] else px[mark[0], mark[1]]
    return t


def weapons(entries):
    """entries: [(wtype, new_name)]"""
    cols = 4 + 4                       # base, base_fine, new, new_fine | stand/strike with base | stand/strike with new
    rows = []
    for wtype, new in entries:
        base = wtype
        cls = KIT[wtype]
        row = Image.new("RGBA", (40 * 4 + 90 * 4 + 6 * 8 + 8, 104), (30, 32, 44, 255))
        x = 4
        for n in (base, base + "_fine", new, new + "_fine"):
            t = sprite_tile(n, GRIPS[wtype])
            row.alpha_composite(t.crop((0, 0, 40, 40)), (x, 2))
            x += 46
        for wn in (base, new):
            for action, slot in (("idle", 0), ("attack", 2)):
                p = pose(cls, wtype, wn, action, slot)
                bg = Image.new("RGBA", p.size, BG)
                bg.alpha_composite(p)
                row.alpha_composite(bg, (x, 2))
                x += 90
        rows.append(row)
    W = max(r.width for r in rows)
    sheet = Image.new("RGBA", (W, sum(r.height for r in rows)), (30, 32, 44, 255))
    y = 0
    for r in rows:
        sheet.alpha_composite(r, (0, y))
        y += r.height
    return sheet.resize((sheet.width * S, sheet.height * S), Image.NEAREST)


def effects(names, ref="slash"):
    """each effect: 4 directions x 2 rows at 4x on a slate background; the existing slash is appended below as a size / style reference"""
    tiles = []
    for n in names + [ref]:
        im = load(f"effect_{n}.png")
        bg = Image.new("RGBA", im.size, BG)
        bg.alpha_composite(im)
        d = ImageDraw.Draw(bg)
        for k in range(1, 4):                       # faint cell dividers
            d.line([(k * 30 - 1, 0), (k * 30 - 1, 59)], fill=(80, 84, 104, 255))
        d.line([(0, 29), (119, 29)], fill=(80, 84, 104, 255))
        tiles.append(bg)
    W = 120 + 8
    H = sum(t.height + 8 for t in tiles)
    sheet = Image.new("RGBA", (W, H), (30, 32, 44, 255))
    y = 4
    for t in tiles:
        sheet.alpha_composite(t, (4, y))
        y += t.height + 8
    return sheet.resize((sheet.width * S, sheet.height * S), Image.NEAREST)


if __name__ == "__main__":
    REV.mkdir(parents=True, exist_ok=True)
    kind = sys.argv[1]
    if kind == "hats":
        hats(["cap", "horned", "circlet"]).save(REV / "phase4_hats.png")
    elif kind == "effects":
        effects(["hslash", "thrust"]).save(REV / "phase4_effects.png")
    elif kind == "weapons":
        weapons([("sword", "sword_long"), ("axe", "axe_double"), ("staff", "staff_crystal")]).save(REV / "phase4_weapons.png")
