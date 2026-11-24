#!/usr/bin/env python3
"""Compare the paladin (full outfit: helmet, armor, pants, boots, buckler, cape) holding the sword vs the hammer.

Composites with the same layer order / exact-colour swap as the HeroLoom bake (docs/HEROLOOM.md 2.6), at 3x on a
dark background. Writes output/hammer-weapon/compare.png (+ grip-check.png: hand anchor and angle overlay).
Look = src/heroloom.js CLASS_LOOK.paladin (read-only reference, hard-coded here).
"""
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[3]
PACK = ROOT / "assets" / "heroloom"
OUT = ROOT / "output" / "hammer-weapon"
Z = 3
import sys
spec = json.loads((PACK / "character.json").read_text(encoding="utf-8"))
CW, CH = spec["cell"]

PALADIN = {"hair": "short", "hat": "helmet", "top": "armor", "bottom": "pants", "shoes": "boots",
           "shield": "buckler", "cape": "cape"}
COLORS = {"skin": "light", "hair": "blonde", "cloth": "blue", "leather": "white", "eye": "blue"}
hexrgb = lambda h: tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))
_cache = {}


def load(rel, ramp):
    key = (rel, ramp)
    if key in _cache:
        return _cache[key]
    a = np.array(Image.open(PACK / rel).convert("RGBA"))
    if ramp:
        pal = spec["palettes"][ramp]
        base = [hexrgb(h) for h in pal["base"]]
        var = [hexrgb(h) for h in pal["variants"][COLORS[ramp]]]
        out = a.copy()
        for b, v in zip(base, var):
            m = (a[..., 0] == b[0]) & (a[..., 1] == b[1]) & (a[..., 2] == b[2]) & (a[..., 3] > 0)
            out[m, :3] = v
        a = out
    _cache[key] = a
    return a


def bake(weapon):
    parts = dict(PALADIN)
    if weapon:
        parts["weapon"] = weapon
    parts["body"] = "base"
    parts["face"] = "eyes"
    sheet = np.zeros((448, 512, 4), np.uint8)
    img = Image.fromarray(sheet, "RGBA")
    for L in spec["layers"]:
        slot, layer = L["slot"], L["layer"]
        part = parts.get(slot)
        if not part:
            continue
        s = spec["slots"][slot]
        pd = s["parts"][part]
        if slot == "hair" and layer == "main" and parts.get("hat") and s["parts"][part] and \
                spec["slots"]["hat"]["parts"][parts["hat"]].get("coversHair"):
            layer = "under"
        rel = pd["layers"].get(layer)
        if not rel:
            continue
        ramp = pd.get("colorFrom") or s.get("color")
        img.alpha_composite(Image.fromarray(load(rel, ramp), "RGBA"))
    return img


def frame(img, act, i):
    a = spec["actions"][act]
    return img.crop((i * CW, a["row"] * CH, (i + 1) * CW, (a["row"] + 1) * CH))


def compare(sw, hm, z, fname):
    acts = ["idle", "walk", "attack", "hurt"]
    BG = (34, 32, 44, 255)
    cols = max(spec["actions"][a]["frames"] for a in acts)
    pad, lab = max(2, z), 22 if z >= 2 else 0
    cellw, cellh = CW * z, CH * z
    rows = [(a, n, im) for a in acts for n, im in (("sword", sw), ("hammer", hm))]
    W = lab * 4 + cols * (cellw + pad) + pad
    Hh = len(rows) * (cellh + pad) + pad
    canvas = Image.new("RGBA", (W, Hh), BG)
    d = ImageDraw.Draw(canvas)
    for ri, (a, name, img) in enumerate(rows):
        y = pad + ri * (cellh + pad)
        if lab:
            d.text((4, y + 4), f"{a} {name}", fill=(220, 220, 230, 255))
        for i in range(spec["actions"][a]["frames"]):
            f = frame(img, a, i)
            cell = Image.new("RGBA", f.size, (24, 22, 32, 255))
            cell.alpha_composite(f)
            canvas.paste(cell.resize((cellw, cellh), Image.NEAREST), (lab * 4 + i * (cellw + pad), y))
    canvas.save(OUT / fname)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    sw, hm = bake("sword"), bake("hammer")
    compare(sw, hm, 3, "compare.png")
    compare(sw, hm, 2, "compare-2x.png")
    compare(sw, hm, 1, "compare-1x.png")
    cellw, cellh, pad = CW * Z, CH * Z, 4
    BG = (34, 32, 44, 255)
    import math
    allacts = list(spec["actions"])
    cols2 = max(spec["actions"][a]["frames"] for a in allacts)
    g = Image.new("RGBA", (cols2 * (cellw + pad) + pad, len(allacts) * (cellh + pad) + pad), BG)
    for ri, a in enumerate(allacts):
        for i in range(spec["actions"][a]["frames"]):
            an = spec["anchors"][a][i]
            f = frame(hm, a, i)
            cell = Image.new("RGBA", f.size, (24, 22, 32, 255))
            cell.alpha_composite(f)
            big = cell.resize((cellw, cellh), Image.NEAREST)
            dd = ImageDraw.Draw(big)
            hx, hy = (an["hand"][0] + .5) * Z, (an["hand"][1] + .5) * Z
            t = math.radians(an["weaponAngle"])
            dd.line((hx, hy, hx + math.cos(t) * 60, hy + math.sin(t) * 60), fill=(0, 255, 255, 255))
            dd.line((hx - 4, hy, hx + 4, hy), fill=(255, 40, 40, 255))
            dd.line((hx, hy - 4, hx, hy + 4), fill=(255, 40, 40, 255))
            g.paste(big, (pad + i * (cellw + pad), pad + ri * (cellh + pad)))
    g.save(OUT / "grip-check.png")
    print("wrote compare.png / compare-2x.png / compare-1x.png / grip-check.png in", OUT)


if __name__ == "__main__":
    main()
