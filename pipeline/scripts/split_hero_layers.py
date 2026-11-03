#!/usr/bin/env python
"""split_hero_layers.py -- T28: split an existing hero sheet into equipment layers, zero credits.

Every layer sheet keeps the exact size and grid of the source sheet, so frame `i` of a layer is
frame `i` of the body (the TMW "same frame index" trick). Each opaque source pixel is assigned to
exactly one layer, therefore:

    union(alpha of all layers) == alpha(source)      and      sum(alpha) has no double coverage

The split is a heuristic (colour clusters printed from a histogram + position relative to that
frame's head anchor); see --histogram for the colours the ranges below were picked from.

Layer ids: body, chest, helmet, cape, shield, weapon.

Usage
    python pipeline/scripts/split_hero_layers.py                     # split paladin + darkknight
    python pipeline/scripts/split_hero_layers.py --preview           # + output/t28scratch/preview.png
    python pipeline/scripts/split_hero_layers.py --histogram         # print the colour histogram
    python pipeline/scripts/split_hero_layers.py --classes paladin
"""

from __future__ import annotations

import argparse
import colorsys
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
HEROES = os.path.join(ROOT, "assets", "heroes")
OUT = os.path.join(ROOT, "output", "layer-demo", "assets", "layers")
SCRATCH = os.path.join(ROOT, "output", "t28scratch")

LAYERS = ["body", "chest", "helmet", "cape", "shield", "weapon"]
LID = {name: i + 1 for i, name in enumerate(LAYERS)}          # 0 = transparent

# default draw order, bottom -> top (what the demo starts with)
DEFAULT_ORDER = ["body", "cape", "chest", "weapon", "shield", "helmet"]


# --------------------------------------------------------------------------- colour helpers
def hsv_arrays(rgb: np.ndarray):
    """Vectorised HSV for an (N,3) uint8 array. H in degrees 0..360, S/V in 0..1."""
    a = rgb.astype(np.float32) / 255.0
    mx = a.max(axis=1)
    mn = a.min(axis=1)
    d = mx - mn
    h = np.zeros_like(mx)
    nz = d > 1e-6
    if nz.any():
        r, g, b = a[nz, 0], a[nz, 1], a[nz, 2]
        m = mx[nz]
        hh = np.where(m == r, (g - b) / d[nz] % 6.0,
                      np.where(m == g, (b - r) / d[nz] + 2.0, (r - g) / d[nz] + 4.0))
        h[nz] = hh * 60.0
    s = np.where(mx > 1e-6, d / np.maximum(mx, 1e-6), 0.0)
    return h, s, mx


def histogram(path: str) -> None:
    img = np.array(Image.open(path).convert("RGBA"))
    opaque = img[img[:, :, 3] > 0][:, :3]
    cols, counts = np.unique(opaque, axis=0, return_counts=True)
    order = np.argsort(-counts)
    print(f"{os.path.basename(path)}: {len(opaque)} opaque px, {len(cols)} unique colours")
    for i in order[:30]:
        r, g, b = (int(v) for v in cols[i])
        h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        print(f"  #{r:02x}{g:02x}{b:02x} n={counts[i]:6d}  h={h * 360:6.1f} s={s:.2f} v={v:.2f}")


# --------------------------------------------------------------------------- class profiles
# Ranges were read off `--histogram` for each sheet; the dark knight is nearly monochrome
# (16 colours, black armour + blood red), so it gets region help instead of pure hue rules.
def _paladin_metal(h, s, v):
    return (h >= 258) & (h <= 356) & (s <= 0.56) & (v >= 0.13) & (v <= 0.90)


def _paladin_cloth(h, s, v):
    # tan/beige cape: clearly warmer and a bit more saturated than the mauve steel
    return (h >= 8) & (h <= 42) & (s >= 0.18) & (s <= 0.48) & (v >= 0.60)


def _paladin_shield(h, s, v):
    return (h >= 5) & (h <= 34) & (s >= 0.32) & (v >= 0.35) & (v <= 0.95)


def _paladin_blade(h, s, v):
    # the blade is shaded steel: nearly desaturated, mid to high value
    steel = (s <= 0.14) & (v >= 0.62)
    gold = (h >= 28) & (h <= 50) & (s >= 0.35) & (v >= 0.85)
    return steel | gold


def _dk_metal(h, s, v):
    return (v > 0.12) & (v <= 0.42) & ~_dk_red(h, s, v)


def _dk_red(h, s, v):
    return ((h <= 25) | (h >= 330)) & (s >= 0.35) & (v >= 0.10)


def _dk_blade(h, s, v):
    return (v > 0.12) & (v <= 0.42)


PROFILES = {
    "paladin": dict(
        neck_frac=0.30,          # neck line = frame top + 30 % of the sprite height
        hip_frac=0.72,
        torso_half=0.30,         # half width of the "body core" band, as a fraction of sprite width
        metal=_paladin_metal,
        cloth=_paladin_cloth,
        shield=_paladin_shield,
        red=None,
        blade=_paladin_blade,
        helmet_mode="metal",     # only armour-coloured pixels above the neck line are the helmet
        shield_grow=1,
        cape_grow=1,
    ),
    "darkknight": dict(
        neck_frac=0.42,       # the dark knight is mostly helmet + horns
        hip_frac=0.78,
        torso_half=0.30,
        metal=_dk_metal,
        cloth=None,
        shield=None,             # disc found from the bright red rim instead of a hue
        red=_dk_red,
        blade=_dk_blade,
        helmet_mode="zone",      # the whole head zone is helmet (black armour, no hue to go on)
        shield_grow=0,
        cape_grow=2,
    ),
}


# --------------------------------------------------------------------------- split
def frame_windows(meta, sheet_w, sheet_h):
    """Yield (action, frame_index, x, y, cell) for every frame in the action table."""
    for name, row in meta["actions"].items():
        cell = int(row["cell"])
        cols = int(row.get("cols") or max(1, sheet_w // cell))
        for i in range(int(row.get("frames", 1))):
            x = (i % cols) * cell
            y = int(row["y"]) + (i // cols) * cell
            if x + cell > sheet_w or y + cell > sheet_h:
                continue
            yield name, i, x, y, cell


def thin_weapon_mask(mask, cand, min_diag=15, max_thickness=5.0, min_area=12):
    """Pixels of `cand` that belong to long, thin components -> the blade / haft."""
    out = np.zeros_like(mask)
    lab, n = ndimage.label(cand)
    if not n:
        return out
    for sl, idx in zip(ndimage.find_objects(lab), range(1, n + 1)):
        if sl is None:
            continue
        comp = lab[sl] == idx
        area = int(comp.sum())
        if area < min_area:
            continue
        h = sl[0].stop - sl[0].start
        w = sl[1].stop - sl[1].start
        diag = (h * h + w * w) ** 0.5
        if diag < min_diag:
            continue
        if area / max(h, w) > max_thickness:      # too fat to be a blade
            continue
        out[sl] |= comp
    return out


def grow(seed, alpha, iterations=2, fill=False):
    """Grow a colour seed by a couple of pixels and stay inside the sprite.

    The shaded side of a part is painted in the same muted palette as the steel, so the seed
    has to be widened; `fill` additionally closes the interior (the shield's dark face).
    """
    m = seed.copy()
    for _ in range(max(0, iterations)):
        m = ndimage.binary_dilation(m, structure=np.ones((3, 3))) & alpha
    if fill:
        m = ndimage.binary_fill_holes(m) & alpha
    return m


def split_class(cls: str, outdir: str):
    prof = PROFILES[cls]
    png = os.path.join(HEROES, f"{cls}.png")
    meta = json.load(open(os.path.join(HEROES, f"{cls}.json"), encoding="utf-8"))
    img = np.array(Image.open(png).convert("RGBA"))
    sh, sw = img.shape[:2]
    labels = np.zeros((sh, sw), np.uint8)

    for action, fi, x, y, cell in frame_windows(meta, sw, sh):
        win = img[y:y + cell, x:x + cell]
        alpha = win[:, :, 3] > 0
        if not alpha.any():
            continue
        ys, xs = np.where(alpha)
        top, bot = int(ys.min()), int(ys.max())
        left, right = int(xs.min()), int(xs.max())
        height = bot - top + 1
        width = right - left + 1
        cx = (left + right) / 2.0
        row = meta["actions"][action]
        head = row.get("head") or []
        if fi < len(head) and head[fi]:
            cx_head = float(head[fi][0])
        else:
            cx_head = cx
        neck = top + int(round(prof["neck_frac"] * height))
        hip = top + int(round(prof["hip_frac"] * height))
        half = max(3.0, prof["torso_half"] * width)

        flat = win[:, :, :3].reshape(-1, 3)
        h, s, v = hsv_arrays(flat)
        h = h.reshape(cell, cell)
        s = s.reshape(cell, cell)
        v = v.reshape(cell, cell)

        yy, xx = np.mgrid[0:cell, 0:cell]
        lab = np.zeros((cell, cell), np.uint8)

        # --- 1. weapon: long thin components before anything positional (a raised sword
        #        crosses the neck line, so the neck rule cannot run first)
        blade_cand = alpha & prof["blade"](h, s, v)
        weapon = thin_weapon_mask(alpha, blade_cand)
        # do not eat horns / plumes that are thin, long and sit inside the head zone
        head_zone = (yy < neck) & (np.abs(xx - cx_head) < 0.34 * width)
        weapon &= ~(head_zone & (s > 0.40))          # keep red horns, drop dark spikes only for dk
        lab[weapon] = LID["weapon"]

        # --- 2. shield
        if prof["shield"] is not None:
            # paladin: the orange rim is the only unambiguous shield colour, so grow it out to
            # the wooden face and fill the boss
            seed = alpha & (yy > neck - 2) & prof["shield"](h, s, v)
            if seed.sum() >= 12:
                part = grow(seed, alpha, prof["shield_grow"], fill=True) & (lab == 0)
                lab[part] = LID["shield"]
        else:
            # dark knight: every red shape is outlined in black, so the shield's rim + disc + cross
            # form one red blob. Pick the blob holding the most bright red (the rim) below the neck.
            bright_red = alpha & (v >= 0.50) & (s >= 0.42) & ((h <= 25) | (h >= 330))
            red_all = alpha & prof["red"](h, s, v) & (yy > neck)
            lab_red, _n_red = ndimage.label(red_all)
            best = None
            for i, sl in enumerate(ndimage.find_objects(lab_red), 1):
                if sl is None:
                    continue
                comp = np.zeros_like(red_all)
                comp[sl] = lab_red[sl] == i
                area = int(comp.sum())
                if area < 40:
                    continue
                bh = sl[0].stop - sl[0].start
                bw = sl[1].stop - sl[1].start
                if bh < 9 or bw < 9 or bh / float(bw) < 0.6:
                    continue
                bright = int((comp & bright_red).sum())
                score = bright * 4 + area
                if best is None or score > best[0]:
                    best = (score, comp)
            if best:
                # the black interior of the disc is not "red", so close the ring
                disc = ndimage.binary_fill_holes(best[1]) & alpha & (lab == 0)
                lab[disc] = LID["shield"]

        # --- 3. cape: cloth hue (paladin) or red outside the body core (dark knight)
        outside_core = np.abs(xx - cx) > half
        if prof["cloth"] is not None:
            cloth = alpha & (lab == 0) & prof["cloth"](h, s, v) & (yy > neck - 4)
            if cloth.sum() >= 8:
                cape = grow(cloth, alpha, prof["cape_grow"]) & (lab == 0)
                lab[cape] = LID["cape"]
        if prof["red"] is not None:
            red = alpha & (lab == 0) & prof["red"](h, s, v) & (yy > neck)
            lab[red & (outside_core | (yy > hip))] = LID["cape"]
            lab[red & ~(outside_core | (yy > hip))] = LID["chest"]      # belt / harness

        # --- 4. helmet above the neck line, chest below it
        metal = alpha & (lab == 0) & prof["metal"](h, s, v)
        lab[metal & (yy < neck)] = LID["helmet"]
        lab[metal & (yy >= neck)] = LID["chest"]
        if prof["helmet_mode"] == "zone":
            lab[alpha & (lab == 0) & (yy < neck)] = LID["helmet"]

        # --- 5. everything else (skin, cloth, outline, shadow) is body
        lab[alpha & (lab == 0)] = LID["body"]
        labels[y:y + cell, x:x + cell] = lab

    # stray pixels outside every frame window (unlisted sheet rows) still have to land
    # somewhere, otherwise the union check would fail
    stray = (img[:, :, 3] > 0) & (labels == 0)
    stray_n = int(stray.sum())
    labels[stray] = LID["body"]

    # ---- write one RGBA sheet per layer, same size as the source
    os.makedirs(outdir, exist_ok=True)
    sheets = {}
    for name in LAYERS:
        keep = labels == LID[name]
        out = np.zeros_like(img)
        out[keep] = img[keep]
        sheets[name] = out
        Image.fromarray(out, "RGBA").save(os.path.join(outdir, f"{cls}-{name}.png"), optimize=True)

    # ---- self-check: union == source alpha, no pixel in two layers
    src_alpha = img[:, :, 3] > 0
    cover = np.zeros(labels.shape, np.uint8)
    for name in LAYERS:
        cover += sheets[name][:, :, 3] > 0
    overlap = int((cover > 1).sum())
    union_ok = bool(np.array_equal(cover > 0, src_alpha))
    missing = int((src_alpha & (cover == 0)).sum())
    extra = int((~src_alpha & (cover > 0)).sum())
    counts = {name: int((labels == LID[name]).sum()) for name in LAYERS}
    return dict(cls=cls, meta=meta, labels=labels, sheets=sheets, size=(sw, sh), stray=stray_n,
                union_ok=union_ok, overlap=overlap, missing=missing, extra=extra, counts=counts)


# --------------------------------------------------------------------------- main
def contact_sheet(results, path, picks={"paladin": ("attack", 1), "darkknight": ("attack", 2)}, zoom=5):
    """One row per class: the original frame, then every layer alone (real colours on a dark bg)."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    rows = []
    for res in results:
        cls = res["cls"]
        meta = res["meta"]
        img = np.array(Image.open(os.path.join(HEROES, f"{cls}.png")).convert("RGBA"))
        act, fi = picks.get(cls, ("attack", 0))
        row = meta["actions"].get(act) or meta["actions"][next(iter(meta["actions"]))]
        cell = int(row["cell"])
        cols = int(row.get("cols") or img.shape[1] // cell)
        x, y = (fi % cols) * cell, int(row["y"]) + (fi // cols) * cell
        sub = img[y:y + cell, x:x + cell]
        lab = res["labels"][y:y + cell, x:x + cell]
        tiles = [(f"{act}[{fi}] original", sub)]
        for name in LAYERS:
            t = np.zeros_like(sub)
            m = lab == LID[name]
            t[m] = sub[m]
            tiles.append((name, t))
        rows.append((f"{cls}", tiles, cell))

    pad = 8
    tile_w = max(cell for _, _, cell in rows) * zoom
    tile_h = tile_w
    W = pad + len(rows[0][1]) * (tile_w + pad)
    H = pad + len(rows) * (tile_h + pad)
    sheet = Image.new("RGBA", (W + len(rows[0][1]) * 90, H), (26, 22, 32, 255))
    for r, (_cls, tiles, cell) in enumerate(rows):
        for c, (_name, tile) in enumerate(tiles):
            img = Image.fromarray(tile).resize((cell * zoom, cell * zoom), Image.NEAREST)
            sheet.alpha_composite(img, (pad + c * (tile_w + pad + 90), pad + r * (tile_h + pad)))
    sheet.save(path)
    print(f"preview -> {os.path.relpath(path, ROOT)}  (rows: " + ", ".join(
        f"{c}: original, " + ", ".join(LAYERS) for c, _, _ in rows) + ")")


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--classes", default="paladin,darkknight")
    ap.add_argument("--out", default=OUT)
    ap.add_argument("--preview", action="store_true")
    ap.add_argument("--histogram", action="store_true")
    args = ap.parse_args(argv)

    classes = [c.strip() for c in args.classes.split(",") if c.strip()]
    if args.histogram:
        for c in classes:
            histogram(os.path.join(HEROES, f"{c}.png"))
        return 0

    results = []
    ok = True
    for cls in classes:
        res = split_class(cls, args.out)
        results.append(res)
        counts = ", ".join(f"{k} {v}" for k, v in res["counts"].items())
        status = "alpha union OK" if res["union_ok"] else f"alpha union MISMATCH (missing {res['missing']}, extra {res['extra']})"
        print(f"{cls}: {status}, overlap {res['overlap']}  [{counts}]")
        ok = ok and res["union_ok"] and res["overlap"] == 0
        # per-class description for the demo
        meta = res["meta"]
        desc = {
            "class": cls,
            "sheet": f"{cls}.png",
            "width": res["size"][0],
            "height": res["size"][1],
            "heroHeight": meta.get("heroHeight"),
            "footFromBottom": meta.get("footFromBottom"),
            "layers": [{"id": n, "file": f"{cls}-{n}.png", "pixels": res["counts"][n]} for n in LAYERS],
            "order": DEFAULT_ORDER,
            "actions": {
                a: {k: r.get(k) for k in ("cell", "cols", "frames", "y", "frameTime", "head") if r.get(k) is not None}
                for a, r in meta["actions"].items()
            },
            "note": "layers split from the source sheet with pipeline/scripts/split_hero_layers.py",
        }
        with open(os.path.join(args.out, f"{cls}-layers.json"), "w", encoding="utf-8") as fh:
            json.dump(desc, fh, ensure_ascii=False, indent=1)

    # cross-class mixing: only actions whose frame count AND cell size match
    if len(results) == 2:
        a, b = results
        same = sorted({
            act for act, ra in a["meta"]["actions"].items()
            if act in b["meta"]["actions"]
            and int(ra["cell"]) == int(b["meta"]["actions"][act]["cell"])
            and int(ra.get("frames", 1)) == int(b["meta"]["actions"][act].get("frames", 1))
        })
        print("mixing compatible actions (" + a["cls"] + " <-> " + b["cls"] + "): " + (", ".join(same) or "none"))
        for res in (a, b):
            path = os.path.join(args.out, f"{res['cls']}-layers.json")
            desc = json.load(open(path, encoding="utf-8"))
            desc["mixing"] = {"classes": [a["cls"], b["cls"]], "compatibleActions": same}
            with open(path, "w", encoding="utf-8") as fh:
                json.dump(desc, fh, ensure_ascii=False, indent=1)

    if args.preview:
        contact_sheet(results, os.path.join(SCRATCH, "preview.png"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
