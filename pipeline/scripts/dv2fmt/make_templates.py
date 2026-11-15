#!/usr/bin/env python3
"""make_templates.py — guide templates for mistvale's DV2-format hero art (spec: sprites/DV2_FORMAT_SPEC.md).

Writes, under output/dv2fmt/templates/:
    <kind>_1x.png    exact 1x sheet: cell grid, anchors, pose silhouettes (light grey) — the art agent paints over this
    <kind>_x8.png    same at 8x with cell labels / anchor crosshairs (AI image tools work better large)
for kind in body, hand, armor, head, hat, weapon_<type>, effect_slash.

Also (one-time / on request):
    --palettes          rebuild pipeline/scripts/dv2fmt/palettes.json from assets/heroes/<cls>.json palettes (read-only)
    --write-actions     (re)write pipeline/scripts/dv2fmt/actions.json, the authored action table, from our own placeholder poses
    --placeholder       re-cut the existing placeholder art (pipeline/scripts/build_paperdoll_placeholder.py) into the DV2 grid,
                        save it as fake "AI output" at 8x on a flat background (output/dv2fmt/placeholder_x8/) and run it through
                        import_sheet.py -> assets/paperdoll-dv2/src/. Proves template -> importer -> pack end to end before real art exists.

Usage:
    python pipeline/scripts/dv2fmt/make_templates.py                    # templates only
    python pipeline/scripts/dv2fmt/make_templates.py --placeholder      # + placeholder re-cut through the importer
    python pipeline/scripts/dv2fmt/build_pack.py                        # then build the pack
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import dv2fmt as F  # noqa: E402

K = 0.68           # placeholder logical px -> DV2 px (placeholder stands ~38 logical, DV2 chibi ~26)
PH = None          # placeholder generator module (lazy)


def ph():
    global PH
    if PH is None:
        import build_paperdoll_placeholder as G  # noqa: E402
        PH = G
    return PH


# ------------------------------------------------------------------ placeholder re-cut (1x DV2 sheets)
def shrink(img):
    n = round(img.width * K)
    return img.resize((n, n), Image.NEAREST)


def logical_to_cell(img, cell, anchor_logical, anchor_cell):
    """shrink a logical placeholder canvas and paste it so anchor_logical lands on anchor_cell"""
    s = shrink(img)
    out = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
    ax, ay = anchor_logical[0] * K, anchor_logical[1] * K
    dx, dy = round(anchor_cell[0] - ax), round(anchor_cell[1] - ay)
    out.paste(s, (dx, dy), s)
    return out


CELL_SOURCE = {   # body pose cell -> (placeholder action, slot)
    "walk0": ("walk", 0), "walk1": ("walk", 1), "walk2": ("walk", 2), "walk3": ("walk", 3),
    "stand0": ("idle", 0), "stand1": ("idle", 1),
    "windup": ("attack", 0), "strike0": ("attack", 1), "strike1": ("attack", 2), "hurt": ("hurt", 0),
    "cast0": ("skill", 1), "cast1": ("skill", 2), "aim0": ("attack.bow", 0), "aim1": ("attack.bow", 1),
    "kneel": ("death", 0), "victory0": ("victory", 0), "victory1": ("victory", 1), "thrust": ("attack.staff", 2),
    "lying": ("death", 2),
}


def src_pose(view, pose):
    G = ph()
    a, i = CELL_SOURCE[pose]
    return G.POSES["side" if pose == "lying" else view][a][i]


FOOT_L = (25, 46)     # placeholder logical foot


def recut_body(cls, layer):
    G = ph()
    c = G.PAL[cls]
    W, H = F.sheet_size("body")
    sheet = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    for view, pose, x, y in F.all_body_cells():
        v = "side" if pose == "lying" else view
        p = src_pose(view, pose)
        if layer == "body":
            img = G.blank()
            img.alpha_composite(G.draw_body(v, p, c))
            img.alpha_composite(G.draw_hand(v, p, c))
            cell = logical_to_cell(img, F.CELL, FOOT_L, F.FOOT)
        elif layer == "hand":     # the weapon fist only, drawn over the weapon grip
            cell = Image.new("RGBA", (F.CELL, F.CELL), (0, 0, 0, 0))
            hx, hy = F.FOOT[0] + round(p["wh"][0] * K), F.FOOT[1] + round(p["wh"][1] * K)
            d = ImageDraw.Draw(cell)
            d.rectangle([hx - 2, hy - 2, hx + 1, hy + 1], fill=G.hx(F.OUTLINE))
            d.rectangle([hx - 1, hy - 1, hx, hy], fill=G.hx(c["skin"]))
        else:                     # armor overlay: layer = armor kind
            cell = logical_to_cell(G.draw_armor(v, p, G.GEAR[layer]), F.CELL, FOOT_L, F.FOOT)
        sheet.alpha_composite(cell, (x, y))
    return sheet


HEAD_L = (25, 46 - 23)  # placeholder neck point (bottom of the head) in logical px


def recut_head(cls):
    G = ph()
    W, H = F.sheet_size("head")
    sheet = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    for row, view in ((0, "back"), (1, "frontQ")):
        cell = logical_to_cell(G.draw_head(view, G.PAL[cls], cls), F.HEAD_CELL, HEAD_L, F.HEAD_ANCHOR)
        for col in range(F.HEAD_COLS - 1):      # 'spare' column stays empty
            sheet.alpha_composite(cell, (col * F.HEAD_CELL, row * F.HEAD_CELL))
    return sheet


def recut_hat(name):
    G = ph()
    sheet = Image.new("RGBA", F.sheet_size("hat"), (0, 0, 0, 0))
    for i, view in enumerate(["back", "side", "front"]):
        sheet.alpha_composite(logical_to_cell(G.draw_helm(view), F.HAT_CELL, HEAD_L, F.HEAD_ANCHOR), (0, i * F.HAT_CELL))
    return sheet


def recut_weapon(name):
    G = ph()
    sheet = Image.new("RGBA", F.sheet_size("weapon"), (0, 0, 0, 0))
    base = name.replace("_fine", "")
    fine = name.endswith("_fine")
    grip = F.WEAPON_TYPES[base]["grip"]
    for col in range(F.WEAPON_COLS):
        if base == "shield":
            view = "front" if col == 0 else "side"
            oh = (0, -20) if col == 0 else (-1, -20)
            img = G.draw_shield(view, {"oh": oh})
            logical_grip = (25 + oh[0] + (1 if col else 0), 46 + oh[1])
            cell = logical_to_cell(img, F.WEAPON_CELL, logical_grip, grip)
        else:
            img = G.draw_weapon(base, fine, col)          # logical 40x40, grip (20, WEAPON_GRIP)
            cell = Image.new("RGBA", (F.WEAPON_CELL, F.WEAPON_CELL), (0, 0, 0, 0))
            s = shrink(img)
            gx, gy = 20 * K, G.WEAPON_GRIP[base] * K
            cell.paste(s, (round(grip[0] - gx), round(grip[1] - gy)), s)
        sheet.alpha_composite(cell, (col * F.WEAPON_CELL, 0))
    return sheet


def recut_effect(name):
    G = ph()
    sheet = Image.new("RGBA", F.sheet_size("effect"), (0, 0, 0, 0))
    for r in range(F.FX_ROWS):
        for c in range(F.FX_COLS):
            img = G.draw_slash(c, r).resize((F.FX_CELL, F.FX_CELL), Image.NEAREST)
            sheet.alpha_composite(img, (c * F.FX_CELL, r * F.FX_CELL))
    return sheet


def placeholder_sheets():
    """{(kind, name): 1x image} for the whole placeholder set"""
    out = {}
    for cls in F.CLASSES:
        out[("body", cls)] = recut_body(cls, "body")
        out[("hand", cls)] = recut_body(cls, "hand")
        out[("head", cls)] = recut_head(cls)
    for a in F.ARMORS:
        out[("armor", a)] = recut_body("paladin", a)
    out[("hat", "helm")] = recut_hat("helm")
    for w in F.WEAPON_TYPES:
        out[("weapon", w)] = recut_weapon(w)
        if w in F.FINE:
            out[("weapon", w + "_fine")] = recut_weapon(w + "_fine")
    for e in F.EFFECTS:
        out[("effect", e)] = recut_effect(e)
    return out


# ------------------------------------------------------------------ templates
GRID = (120, 140, 170, 255)
SIL = (205, 205, 210, 255)
BG = (250, 250, 247, 255)
FOOTC = (230, 40, 40, 255)
HEADC = (40, 120, 230, 255)
OFFC = (40, 160, 70, 255)


def cell_points():
    """(view, pose) -> (neck, weapon hand, off hand) in cell pixels, from the authored action table"""
    acts = json.loads(F.ACTIONS_JSON.read_text(encoding="utf-8"))
    out = {}
    for a in acts["actions"].values():
        for view, slots in a["views"].items():
            for sl in slots:
                key = ("side", "lying") if sl["cell"] == "lying" else (view, sl["cell"])
                if key not in out:
                    f = lambda v: (F.FOOT[0] + v[0], F.FOOT[1] + v[1])
                    out[key] = (f(sl["head"]), f(sl["wh"]), f(sl["oh"]))
    return out


def silhouette(img):
    a = img.getchannel("A").point(lambda v: 255 if v > 8 else 0)
    s = Image.new("RGBA", img.size, SIL)
    s.putalpha(a)
    return s


def template(kind, sample=None, name=""):
    W, H = F.sheet_size(kind)
    t1 = Image.new("RGBA", (W, H), BG)
    if sample is not None:
        t1.alpha_composite(silhouette(sample))
    d = ImageDraw.Draw(t1)
    cells = F.cells_of(kind)
    for label, x, y, w, h, anchor, _ in cells:
        d.rectangle([x, y, x + w - 1, y + h - 1], outline=GRID)
        if anchor:
            ax, ay = x + anchor[0], y + anchor[1] - 1      # anchor is a boundary; mark the pixel just above/left
            d.point((ax - 1, ay), fill=FOOTC if kind in ("body", "hand", "armor") else HEADC)
            d.point((ax, ay), fill=FOOTC if kind in ("body", "hand", "armor") else HEADC)
    if kind == "weapon":
        gx, gy = F.WEAPON_TYPES[name]["grip"]
        for c in range(F.WEAPON_COLS):
            d.point((c * F.WEAPON_CELL + gx - 1, gy - 1), fill=FOOTC)
    pts = cell_points() if kind in ("body", "hand", "armor") else {}
    for (view, pose), (neck, wh, oh) in pts.items():          # 1x: one pixel per anchor point
        x, y = F.body_cell_xy(view, pose)
        for (px, py), col in ((neck, HEADC), (wh, FOOTC), (oh, OFFC)):
            if 0 <= px < F.CELL and 0 <= py < F.CELL:
                d.point((x + px, y + py - 1), fill=col)
    t8 = t1.resize((W * F.UPSCALE, H * F.UPSCALE), Image.NEAREST)
    d8 = ImageDraw.Draw(t8)
    U = F.UPSCALE
    for (view, pose), (neck, wh, oh) in pts.items():          # 8x: head ghost (drawn by the HEAD layer, do not paint it here) + hand markers
        x, y = F.body_cell_xy(view, pose)
        nx, ny = (x + neck[0]) * U, (y + neck[1]) * U
        d8.ellipse([nx - 6.5 * U, ny - 13 * U, nx + 6.5 * U, ny], outline=HEADC, width=2)
        d8.text((nx - 20, ny - 7 * U), "HEAD layer", fill=HEADC)
        for (px, py), col, txt in ((wh, FOOTC, "W"), (oh, OFFC, "O")):
            cx, cy = (x + px) * U, (y + py) * U
            d8.ellipse([cx - 7, cy - 7, cx + 7, cy + 7], outline=col, width=2)
            d8.text((cx + 9, cy - 6), txt, fill=col)
    for label, x, y, w, h, anchor, _ in cells:
        d8.rectangle([x * U, y * U, (x + w) * U - 1, (y + h) * U - 1], outline=(60, 80, 120, 255), width=2)
        d8.text((x * U + 4, y * U + 3), label, fill=(30, 40, 70, 255))
        if anchor:
            ax, ay = (x + anchor[0]) * U, (y + anchor[1]) * U
            col = FOOTC if kind in ("body", "hand", "armor") else HEADC
            d8.line([ax - 10, ay, ax + 10, ay], fill=col, width=2)
            d8.line([ax, ay - 10, ax, ay + 3], fill=col, width=2)
    if kind == "weapon":
        gx, gy = F.WEAPON_TYPES[name]["grip"]
        for c in range(F.WEAPON_COLS):
            cx, cy = (c * F.WEAPON_CELL + gx) * U, gy * U
            d8.ellipse([cx - 6, cy - 6, cx + 6, cy + 6], outline=FOOTC, width=2)
            d8.text((cx + 8, cy - 6), "grip", fill=FOOTC)
    return t1, t8


def write_templates(samples):
    F.TEMPLATE_DIR.mkdir(parents=True, exist_ok=True)
    jobs = [("body", samples.get(("body", "paladin")), "body"),
            ("hand", samples.get(("hand", "paladin")), "hand"),
            ("armor", samples.get(("armor", "plate")), "armor"),
            ("head", samples.get(("head", "paladin")), "head"),
            ("hat", samples.get(("hat", "helm")), "hat")]
    jobs += [("weapon", samples.get(("weapon", w)), f"weapon_{w}") for w in F.WEAPON_TYPES]
    jobs += [("effect", samples.get(("effect", e)), f"effect_{e}") for e in F.EFFECTS]
    for kind, sample, fname in jobs:
        name = fname.split("_", 1)[1] if kind == "weapon" else ""
        t1, t8 = template(kind, sample, name)
        t1.save(F.TEMPLATE_DIR / f"{fname}_1x.png")
        t8.save(F.TEMPLATE_DIR / f"{fname}_x8.png")
        print(f"template {fname}: {t1.width}x{t1.height} (x8 {t8.width}x{t8.height})")


# ------------------------------------------------------------------ palettes + action table
def write_palettes():
    pal = {}
    for cls in F.CLASSES:
        m = json.loads((F.ROOT / "assets" / "heroes" / f"{cls}.json").read_text(encoding="utf-8"))
        m = m.get("meta", m)
        cols = [c.lower() for c in m.get("palette", [])]
        if F.OUTLINE not in cols:
            cols = [F.OUTLINE] + cols
        pal[cls] = cols[:16]
    # shared item palette (weapons / armor / effects): mistvale metals, wood, cloth, gold, white
    pal["items"] = [F.OUTLINE, "#cfd8e2", "#8e9aa8", "#5a6572", "#e8c46a", "#c8a24a", "#9a7430", "#745436", "#523a24",
                    "#7a4e30", "#7c2b31", "#4a1a1e", "#a894e0", "#7457b8", "#f2ece0", "#d4676c"]
    pal["effects"] = ["#f2ece0", "#e8c46a", "#a894e0", "#ffffff"]
    F.PALETTES_JSON.write_text(json.dumps(pal, indent=1) + "\n", encoding="utf-8")
    print("wrote", F.PALETTES_JSON.relative_to(F.ROOT))


CELL_FOR = {      # mistvale action slot -> body pose cell
    "idle": ["stand0", "stand1"],
    "walk": ["walk0", "walk1", "walk2", "walk3"],
    "attack": ["windup", "strike0", "strike1", "strike1"],
    "attack.bow": ["aim0", "aim1", "aim0", "stand0"],
    "attack.staff": ["windup", "thrust", "thrust", "stand0"],
    "skill": ["stand0", "cast0", "cast1", "cast1"],
    "hurt": ["hurt", "hurt"],
    "death": ["kneel", "kneel", "lying", "lying", "lying"],
    "victory": ["victory0", "victory1", "victory0", "victory1"],
}
HEAD_EXPR = {"idle": "normal", "walk": "normal", "attack": "shout", "attack.bow": "normal", "attack.staff": "shout",
             "skill": "shout", "hurt": "hurt", "death": "ko", "victory": "happy"}


def write_actions():
    """Authored action table. Numbers are mistvale's own (scaled from our placeholder poses), never DV2 data."""
    G = ph()
    sc = lambda v: [round(v[0] * K), round(v[1] * K)]
    acts = {}
    for a, (af, loop, impact, release) in G.ACTIONS.items():
        views = {}
        for view in F.VIEWS:
            slots = []
            for i, pose in enumerate(CELL_FOR[a]):
                cellsrc = src_pose(view, pose)
                own = G.POSES[view][a][i]
                hd = cellsrc["head"]
                slots.append({
                    "cell": pose,
                    "head": [round(hd[0] * K), -16 + round(hd[1] * K)],
                    "wh": sc(cellsrc["wh"]),
                    "oh": sc(cellsrc["oh"]),
                    "deg": int(cellsrc["deg"] if pose == "lying" else own["deg"]),
                    "sebF": int(own["sebF"]),
                    "fx": own["fx"],
                })
            views[view] = slots
        acts[a] = {"af": af, "loop": loop, "impactSlot": impact, "releaseSlot": release, "head": HEAD_EXPR[a], "views": views}
    data = {
        "version": 1,
        "note": "Authored mistvale action table for the DV2-format pack (units: 1x DV2 px, foot = (0,0)). "
                "head = neck point offset, wh = weapon grip, oh = off hand (shield grip), deg = weapon rotation (clockwise), "
                "sebF = weapon sheet column, fx = effect sebF or null. Initial numbers scaled from our placeholder poses; edit freely.",
        "fxOffset": {F.DIRS[d]: [round(v[0] * K), round(v[1] * K)] for d, v in ph().FX_OFF.items() if d < len(F.DIRS)},   # 4 directions since 2026-11-13
        "orders": {
            "back": ["weapon", "shield", "body", "armor", "hand", "head", "helmet", "effect"],
            "side": ["body", "armor", "shield", "head", "helmet", "weapon", "hand", "effect"],
            "front": ["body", "armor", "shield", "head", "helmet", "weapon", "hand", "effect"],
            "windup": ["weapon", "body", "armor", "shield", "head", "helmet", "hand", "effect"],
        },
        "actions": acts,
    }
    F.ACTIONS_JSON.write_text(json.dumps(data, indent=1) + "\n", encoding="utf-8")
    print("wrote", F.ACTIONS_JSON.relative_to(F.ROOT))


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--palettes", action="store_true")
    ap.add_argument("--write-actions", action="store_true")
    ap.add_argument("--placeholder", action="store_true")
    args = ap.parse_args(argv)
    if args.palettes or not F.PALETTES_JSON.exists():
        write_palettes()
    if args.write_actions or not F.ACTIONS_JSON.exists():
        write_actions()
    samples = placeholder_sheets()
    write_templates(samples)
    if args.placeholder:
        import import_sheet  # noqa: E402
        fake = F.OUT_DIR / "placeholder_x8"
        fake.mkdir(parents=True, exist_ok=True)
        bad = 0
        for (kind, name), im in samples.items():
            big = im.resize((im.width * F.UPSCALE, im.height * F.UPSCALE), Image.NEAREST)
            bg = Image.new("RGBA", big.size, (214, 240, 214, 255))     # flat background, as an AI tool would return
            bg.alpha_composite(big)
            path = fake / f"{kind}_{name}_x8.png"
            bg.convert("RGB").save(path)
            ok = import_sheet.import_one(kind, name, path, quiet=True)
            bad += 0 if ok else 1
        print(f"placeholder: {len(samples)} sheets through import_sheet -> {F.SRC_DIR.relative_to(F.ROOT)} ({bad} with problems)")
        return 1 if bad else 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
