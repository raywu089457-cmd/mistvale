"""place_layer_items.py — T30: place l0veyou item sprites on the hero per frame.

Two stages, both driven from T28's split layers:

  cut    run pipeline/scripts/l0veyou/sheet_to_atlas.py (5 columns) with its output redirected
         away from assets/ (nothing outside output/layer-demo may be written)
  items  first numbers for each item: bbox crop, nearest downscale to the measured target height
         from T28's split layers, 1 px dark outline, <= 16 colours, alpha-only transparency
  place  for every frame of every action, take the anchor of that slot from the split layer
         (bbox centre + bbox height; weapon: principal-axis angle and axis length), rotate / flip /
         paste the item into a sheet that uses the body sheet's grid, and log frames where the
         split is empty. Two guards keep the split's noise out of the result:
           - a frame whose slot bbox sits >12 px from the slot's median offset, or is <0.6x / >1.35x
             its median height, falls back to that median anchor (T28's darkknight walk row has no
             shield and keeps its cape at the feet; the walk row is the red-cloaked variant)
           - the item is scaled to the split bbox height for that frame (area-matching the split
             slot was tried first: it shrinks the items to ~0.6x and they float off the body)

T31 v2 (strict side-profile item sheets): `v2` replaces the median anchor with a per-frame fit.
  v2     for every frame: non-uniform nearest scale to that frame's split bbox (each axis clamped to
         0.8-1.2 x the slot's median scale), position by bbox centre, weapon rotated onto the
         split's principal axis, item hidden where the split slot is empty or < 20 px, and
         helmet/chest clipped to the hero's own silhouette (union of the six split layers for that
         frame) dilated by 2 px so a rigid plate can never float off the body. One extra guard:
         an axis may not be stretched past DEFORM_MAX (1.3x) relative to the other axis, otherwise an
         edge-on shield (7 px wide) is flattened into a front-facing plate by a 26 px wide split
         bbox - that would undo the side-profile art the whole card is about. Prints, per slot, the
         share of item pixels outside the dilated silhouette and the walk anchor jitter, and writes
         assets/l0v2-measure.json.
  darkknight v2 only draws on DK_HORNED rows (the rows drawn with the horned knight).

Usage:
  python pipeline/scripts/place_layer_items.py cut   <sheet.png> <prefix> <cols>x<rows> <id,id,...>
  python pipeline/scripts/place_layer_items.py items <set> <cls> <cropdir> <prefix> [--split-weapon]
  python pipeline/scripts/place_layer_items.py place <set> <cls> <ids...>
  python pipeline/scripts/place_layer_items.py all   (the two v1 sets in SETS)
  python pipeline/scripts/place_layer_items.py v2    (the two v2 sets in V2_SETS)
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
DEMO = ROOT / "output" / "layer-demo"
LAYERS = DEMO / "assets" / "layers"
ITEMS = DEMO / "assets" / "items"
RAW = DEMO / "assets" / "l0v-raw"

# measured from T28's split layers (median per-frame bbox height over every action)
TARGET_H = {
    "paladin": {"helmet": 19, "chest": 44, "cape": 41, "shield": 30, "weapon": 34},
    "darkknight": {"helmet": 30, "chest": 40, "cape": 32, "shield": 29, "weapon": 34},
}
SLOTS = ["helmet", "chest", "cape", "shield", "weapon"]
OUTLINE = (42, 28, 18)
SETS = [("paladin-l0v", "paladin"), ("darkknight-l0v", "darkknight")]

# T31 v2: strict side-profile item sheets, fitted per frame instead of median anchors.
# darkknight: T28's split only shows the horned knight in these rows. walk / idleUp / walkUp /
# walkLeft are the red-cloaked variant (38 % of the sprite is red cloth there vs 13-16 % on the
# other rows, and the helmet has no horns), so the l0veyou darkknight set is 不相容 on them.
DK_HORNED = {"idle", "attack", "skill", "hurt", "death", "victory", "idleDown", "walkDown", "idleLeft"}
V2_SETS = [("paladin-l0v2", "paladin", None), ("darkknight-l0v2", "darkknight", DK_HORNED)]
CLIP_SLOTS = ("helmet", "chest")   # these may never float off the hero's own silhouette
MIN_SPLIT_PX = 20                   # a split slot under this many pixels is noise: hide the item
SCALE_CLAMP = (0.8, 1.2)            # per-frame fit may not stray more than 20 % from the median
DEFORM_MAX = 1.3                    # ... and may not stretch one axis past 1.3x the other, otherwise
#                                     an edge-on shield (9 px wide) is flattened into a front-facing
#                                     plate by a split bbox that is 26 px wide. Reported in the result.


def cut(sheet: str, prefix: str, grid: str, ids: str, outdir: Path = RAW) -> int:
    """Run sheet_to_atlas.py's own keying + edge check, writing under outdir."""
    sys.path.insert(0, str(HERE / "l0veyou"))
    import sheet_to_atlas as atlas  # noqa: PLC0415

    outdir.mkdir(parents=True, exist_ok=True)
    atlas.ASSETS = outdir          # redirect: assets/ must stay untouched
    return atlas.main(["sheet_to_atlas.py", sheet, prefix, grid, ids])


def _alpha_bbox(im: Image.Image) -> Image.Image:
    a = np.asarray(im)[..., 3] > 0
    ys, xs = np.nonzero(a)
    if not ys.size:
        raise SystemExit("empty item sprite")
    return im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))


def _crop_from_atlas(atlas_png: Path, manifest: Path, name: str) -> Image.Image:
    man = json.loads(manifest.read_text(encoding="utf-8"))
    c = man["cells"][name]
    sheet = Image.open(atlas_png).convert("RGBA")
    return sheet.crop((c["x"], c["y"], c["x"] + c["w"], c["y"] + c["h"]))


def _drop_magenta(im: Image.Image) -> Image.Image:
    a = np.asarray(im).astype(int).copy()
    r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    hit = (al > 0) & (r > 140) & (b > 120) & (g < 100) & (r - g > 90) & (b - g > 70)
    a[..., 3] = np.where(hit, 0, al)
    return Image.fromarray(a.astype(np.uint8), "RGBA")


def _outline(im: Image.Image) -> Image.Image:
    """1 px dark outline, only on edges that do not already have a dark line."""
    arr = np.asarray(im).astype(np.uint8).copy()
    h, w = arr.shape[:2]
    out = np.zeros((h + 2, w + 2, 4), np.uint8)
    out[1:-1, 1:-1] = arr
    a = out[..., 3] > 0
    lum = (0.299 * out[..., 0] + 0.587 * out[..., 1] + 0.114 * out[..., 2])
    bright = a & (lum >= 95)      # a neighbour that is already dark needs no outline
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        src = np.zeros_like(a)
        ys = slice(max(0, dy), out.shape[0] + min(0, dy))
        xs = slice(max(0, dx), out.shape[1] + min(0, dx))
        ys2 = slice(max(0, -dy), out.shape[0] + min(0, -dy))
        xs2 = slice(max(0, -dx), out.shape[1] + min(0, -dx))
        src[ys2, xs2] = bright[ys, xs]
        need = ~a & src
        out[need] = (*OUTLINE, 255)
    return Image.fromarray(out, "RGBA")


def _quantise(im: Image.Image, colors: int = 16) -> Image.Image:
    arr = np.asarray(im)
    rgb = Image.fromarray(arr[..., :3], "RGB")
    q = rgb.quantize(colors=colors, method=Image.MEDIANCUT, dither=Image.NONE).convert("RGB")
    out = np.dstack([np.asarray(q), np.where(arr[..., 3] > 0, 255, 0).astype(np.uint8)])
    return Image.fromarray(out, "RGBA")


def _scale_h(im: Image.Image, target_h: int) -> Image.Image:
    h = max(1, im.height)
    w = max(1, round(im.width * target_h / h))
    return im.resize((w, target_h), Image.NEAREST)


def _scale_axis(im: Image.Image, target_len: float) -> Image.Image:
    """uniform scale so the principal-axis length is target_len (keeps a sword thin)."""
    _, l0 = _pca(im)
    s = max(0.02, target_len / max(1.0, l0))
    return im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.NEAREST)


def split_weapon_axis(cls: str, allowed=None) -> float:
    """median principal-axis length of T28's split weapon = the length the hero actually carries."""
    meta = json.loads((LAYERS / f"{cls}-layers.json").read_text(encoding="utf-8"))
    sheet = Image.open(LAYERS / f"{cls}-weapon.png").convert("RGBA")
    arr = np.asarray(sheet)[..., 3] > 0
    lens = []
    for _act, _fi, sx, sy, cell in _frames(meta, allowed):
        sub = arr[sy:sy + cell, sx:sx + cell]
        b = _bbox(sub)
        if b is None or int(sub.sum()) < MIN_SPLIT_PX:
            continue
        lens.append(_pca(sheet.crop((sx + b[0], sy + b[1], sx + b[2], sy + b[3])))[1])
    return float(np.median(lens)) if lens else 32.0


def build_items(set_name: str, cls: str, cropdir: Path, prefix: str, fit_weapon: bool = False) -> dict:
    ITEMS.mkdir(parents=True, exist_ok=True)
    out = {}
    for slot in SLOTS:
        im = _crop_from_atlas(cropdir / f"{prefix}@2x.png",
                              cropdir / f"{prefix}@2x.manifest.json", slot)
        im = _alpha_bbox(_drop_magenta(im))
        if fit_weapon and slot == "weapon":
            # a side-profile sword sheet is ~4x the length the hero carries; match the split axis
            im = _scale_axis(im, split_weapon_axis(cls, DK_HORNED if cls == "darkknight" else None))
        else:
            im = _scale_h(im, TARGET_H[cls][slot])
        im = _outline(im)
        im = _quantise(im)
        dst = ITEMS / f"{set_name}-{slot}.png"
        im.save(dst)
        out[slot] = [im.width, im.height]
        print(f"  item {dst.name}: {im.width}x{im.height}")
    return out


def _mask_bbox(im: Image.Image):
    a = np.asarray(im)[..., 3] > 0
    ys, xs = np.nonzero(a)
    if not ys.size:
        return None
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def _pca(im: Image.Image):
    """principal axis: (angle in degrees, y-down atan2, length along the axis)"""
    a = np.asarray(im)[..., 3] > 0
    ys, xs = np.nonzero(a)
    pts = np.stack([xs - xs.mean(), ys - ys.mean()], 1).astype(np.float64)
    cov = pts.T @ pts / max(1, len(pts))
    vals, vecs = np.linalg.eigh(cov)
    v = vecs[:, int(np.argmax(vals))]
    if v[0] < 0:
        v = -v
    proj = pts @ v
    return np.degrees(np.arctan2(v[1], v[0])), proj.max() - proj.min()


def _rotated(im: Image.Image, deg: float) -> Image.Image:
    return im.rotate(deg, resample=Image.NEAREST, expand=True, fillcolor=(0, 0, 0, 0))


def _fit_rotated(item: Image.Image, target_angle: float, target_len: float) -> Image.Image:
    """rotate so the item's principal axis lies on target_angle, then scale to target_len."""
    a0, l0 = _pca(item)
    best = None
    for theta in (a0 - target_angle, -(a0 - target_angle)):
        cand = _rotated(item, theta)
        a1, l1 = _pca(cand)
        err = abs(((a1 - target_angle + 90) % 180) - 90)
        if best is None or err < best[0]:
            best = (err, cand, l1)
    _, cand, l1 = best
    s = max(0.05, target_len / max(1.0, l1))
    w = max(1, round(cand.width * s))
    h = max(1, round(cand.height * s))
    return cand.resize((w, h), Image.NEAREST)


def place(set_name: str, cls: str) -> dict:
    meta = json.loads((LAYERS / f"{cls}-layers.json").read_text(encoding="utf-8"))
    W, H = meta["width"], meta["height"]
    split = {s: Image.open(LAYERS / f"{cls}-{s}.png").convert("RGBA") for s in SLOTS}
    body = Image.open(LAYERS / f"{cls}-body.png").convert("RGBA")
    items = {s: Image.open(ITEMS / f"{set_name}-{s}.png").convert("RGBA") for s in SLOTS}
    sheets = {s: Image.new("RGBA", (W, H), (0, 0, 0, 0)) for s in SLOTS}
    split_arr = {s: np.asarray(split[s])[..., 3] > 0 for s in SLOTS}
    body_arr = np.asarray(body)[..., 3] > 0
    empty, snapped, jitter = [], [], {}

    # pass 1: what does this slot look like, relative to the body's bbox centre, over every frame
    stat = {}
    for slot in SLOTS:
        obs = []
        for act, row in meta["actions"].items():
            cell, cols = row["cell"], row.get("cols", 0)
            for fi in range(row.get("frames", 1)):
                sx = (fi % cols if cols else fi) * cell
                sy = row["y"] + (fi // cols if cols else 0) * cell
                bys, bxs = np.nonzero(body_arr[sy:sy + cell, sx:sx + cell])
                if not bys.size:
                    continue
                bcx = (bxs.min() + bxs.max() + 1) / 2
                bcy = (bys.min() + bys.max() + 1) / 2
                ys, xs = np.nonzero(split_arr[slot][sy:sy + cell, sx:sx + cell])
                if not ys.size:
                    continue
                obs.append((((xs.min() + xs.max() + 1) / 2) - bcx,
                            ((ys.min() + ys.max() + 1) / 2) - bcy,
                            ys.max() - ys.min() + 1, len(ys)))
        a = np.array(obs, dtype=np.float64)
        stat[slot] = {"dx": float(np.median(a[:, 0])), "dy": float(np.median(a[:, 1])),
                      "h": float(np.median(a[:, 2])), "area": float(np.median(a[:, 3]))}

    for act, row in meta["actions"].items():
        cell, n = row["cell"], row.get("frames", 1)
        cols = row.get("cols", 0)
        offs = {s: [] for s in SLOTS}
        for fi in range(n):
            sx = (fi % cols if cols else fi) * cell
            sy = row["y"] + (fi // cols if cols else 0) * cell
            body_sub = body_arr[sy:sy + cell, sx:sx + cell]
            bys, bxs = np.nonzero(body_sub)
            bcx = (bxs.min() + bxs.max() + 1) / 2 if bys.size else cell / 2
            bcy = (bys.min() + bys.max() + 1) / 2 if bys.size else cell / 2
            for slot in SLOTS:
                sub = split_arr[slot][sy:sy + cell, sx:sx + cell]
                ys, xs = np.nonzero(sub)
                st = stat[slot]
                if not ys.size:
                    empty.append(f"{act}#{fi}:{slot}")
                    if slot == "weapon":
                        continue
                    # nothing to anchor to: keep the item hidden rather than guessing a pose
                    continue
                x0, x1 = xs.min(), xs.max() + 1
                y0, y1 = ys.min(), ys.max() + 1
                cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
                hh, area = y1 - y0, len(ys)
                rdx, rdy = cx - bcx, cy - bcy
                if slot != "weapon" and (abs(rdy - st["dy"]) > 12 or hh > 1.35 * st["h"] or hh < 0.6 * st["h"]):
                    # split is noisy for this frame (T28's darkknight walk row has no shield/cape):
                    # fall back to the slot's median anchor instead of dragging the item to the feet
                    snapped.append(f"{act}#{fi}:{slot}")
                    cx, cy, hh = bcx + st["dx"], bcy + st["dy"], st["h"]
                    area = st["area"]
                item = items[slot]
                if "Left" in act:
                    item = item.transpose(Image.FLIP_LEFT_RIGHT)
                if slot == "weapon":
                    sub_im = split[slot].crop((sx + x0, sy + y0, sx + x1, sy + y1))
                    ang, ln = _pca(sub_im)
                    item = _fit_rotated(item, ang, ln)
                else:
                    # size: the split bbox height for this frame (the card's anchor height).
                    # an area/bbox-width cap only ever made the items ~0.6x too small and float.
                    s = hh / max(1, item.height)
                    item = item.resize((max(1, round(item.width * s)), max(1, round(item.height * s))), Image.NEAREST)
                px = int(round(cx - item.width / 2))
                py = int(round(cy - item.height / 2))
                sheets[slot].alpha_composite(item, (sx + max(0, px), sy + max(0, py)))
                offs[slot].append((cx - bcx, cy - bcy))
        if act.startswith("walk"):
            for slot in SLOTS:
                if len(offs[slot]) > 2:
                    a = np.array(offs[slot])
                    jitter[slot] = [round(float(a[:, 0].std()), 2), round(float(a[:, 1].std()), 2)]

    for slot in SLOTS:
        dst = LAYERS / f"{set_name}-{slot}.png"
        sheets[slot].save(dst, optimize=True)
        print(f"  sheet {dst.name}: {W}x{H}")

    print(f"  empty frames ({len(empty)}): " + (", ".join(empty[:20]) + (" ..." if len(empty) > 20 else "") or "none"))
    print(f"  snapped to median anchor ({len(snapped)}): " + (", ".join(snapped[:20]) + (" ..." if len(snapped) > 20 else "") or "none"))
    print("  walk anchor jitter px (std x, std y) per slot: " + json.dumps(jitter))
    return {"empty": empty, "snapped": snapped, "jitter": jitter, "stat": stat}


def _bbox(mask):
    ys, xs = np.nonzero(mask)
    if not ys.size:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def _rotate_to(item: Image.Image, target_angle: float) -> Image.Image:
    """rotate (nearest) so the item's principal axis lies on target_angle; no scaling."""
    a0, _ = _pca(item)
    best = None
    for theta in (a0 - target_angle, -(a0 - target_angle)):
        cand = _rotated(item, theta)
        a1, _ = _pca(cand)
        err = abs(((a1 - target_angle + 90) % 180) - 90)
        if best is None or err < best[0]:
            best = (err, cand)
    return best[1]


def _frames(meta: dict, allowed):
    """(action, frame index, cell x, cell y, cell size) for every frame we may draw on."""
    for act, row in meta["actions"].items():
        if allowed is not None and act not in allowed:
            continue
        cell, n, cols = row["cell"], row.get("frames", 1), row.get("cols", 0)
        for fi in range(n):
            sx = (fi % cols if cols else fi) * cell
            sy = row["y"] + (fi // cols if cols else 0) * cell
            yield act, fi, sx, sy, cell


def _cell_with_item(item: Image.Image, px: int, py: int, cell: int) -> Image.Image:
    """draw the item into one cell-sized canvas, clipping whatever falls outside the cell."""
    pad = max(0, -px, -py, px + item.width - cell, py + item.height - cell) + 1
    big = Image.new("RGBA", (cell + 2 * pad, cell + 2 * pad), (0, 0, 0, 0))
    big.paste(item, (px + pad, py + pad), item)
    return big.crop((pad, pad, pad + cell, pad + cell))


def place_v2(set_name: str, cls: str, allowed=None) -> dict:
    """T31: fit every item to that frame's own T28 split bbox (centre + width/height).

    - scale is non-uniform and nearest-neighbour, clamped to 0.8-1.2 x the slot's median scale
    - position is the split bbox centre; the weapon is first rotated onto the split's principal axis
    - a frame whose split slot is empty or < 20 px hides that item (no guessing)
    - helmet/chest are clipped to the hero's own silhouette (union of the six split layers for
      that frame) dilated by 2 px, so a rigid plate can never float off the body
    """
    meta = json.loads((LAYERS / f"{cls}-layers.json").read_text(encoding="utf-8"))
    W, H = meta["width"], meta["height"]
    split = {s: Image.open(LAYERS / f"{cls}-{s}.png").convert("RGBA") for s in SLOTS + ["body"]}
    split_arr = {s: np.asarray(split[s])[..., 3] > 0 for s in SLOTS + ["body"]}
    items = {s: Image.open(ITEMS / f"{set_name}-{s}.png").convert("RGBA") for s in SLOTS}

    hero = np.zeros_like(split_arr["body"])
    for s in SLOTS + ["body"]:
        hero |= split_arr[s]
    hero_dil = ndimage.binary_dilation(hero, structure=np.ones((5, 5), bool))   # 2 px

    # pass 1: per frame, the split bbox and the item as it will be drawn (weapon already rotated)
    plan = []
    for act, fi, sx, sy, cell in _frames(meta, allowed):
        entry = {}
        for slot in SLOTS:
            m = split_arr[slot][sy:sy + cell, sx:sx + cell]
            b = _bbox(m)
            if b is None or int(m.sum()) < MIN_SPLIT_PX:
                entry[slot] = None
                continue
            item = items[slot]
            if slot == "weapon":
                ang, _ = _pca(split[slot].crop((sx + b[0], sy + b[1], sx + b[2], sy + b[3])))
                item = _rotate_to(item, ang)
            entry[slot] = {"b": b, "item": item}
        plan.append((act, fi, sx, sy, cell, entry))

    # median scale per slot (item px -> split px), used as the clamp centre
    med = {}
    for slot in SLOTS:
        vals = []
        for *_, entry in plan:
            e = entry.get(slot)
            if e:
                b = e["b"]
                vals.append(((b[2] - b[0]) / e["item"].width, (b[3] - b[1]) / e["item"].height))
        a = np.array(vals, dtype=np.float64) if vals else np.array([[1.0, 1.0]])
        med[slot] = (float(np.median(a[:, 0])), float(np.median(a[:, 1])))

    # pass 2: place
    sheets = {s: Image.new("RGBA", (W, H), (0, 0, 0, 0)) for s in SLOTS}
    hidden, jitter, outside = [], {}, {s: [0, 0] for s in SLOTS}   # outside[slot] = [outside, total]
    for act, fi, sx, sy, cell, entry in plan:
        hero_cell = hero_dil[sy:sy + cell, sx:sx + cell]
        bys, bxs = np.nonzero(split_arr["body"][sy:sy + cell, sx:sx + cell])
        bcx = (bxs.min() + bxs.max() + 1) / 2 if bys.size else cell / 2
        bcy = (bys.min() + bys.max() + 1) / 2 if bys.size else cell / 2
        for slot in SLOTS:
            e = entry.get(slot)
            if e is None:
                hidden.append(f"{act}#{fi}:{slot}")
                continue
            b, item = e["b"], e["item"]
            w, h = b[2] - b[0], b[3] - b[1]
            kx = float(np.clip(w / item.width, SCALE_CLAMP[0] * med[slot][0], SCALE_CLAMP[1] * med[slot][0]))
            ky = float(np.clip(h / item.height, SCALE_CLAMP[0] * med[slot][1], SCALE_CLAMP[1] * med[slot][1]))
            r = kx / ky
            if r > DEFORM_MAX:
                kx = DEFORM_MAX * ky
            elif r < 1.0 / DEFORM_MAX:
                ky = kx / (1.0 / DEFORM_MAX)
            sized = item.resize((max(1, round(item.width * kx)), max(1, round(item.height * ky))), Image.NEAREST)
            cx, cy = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2
            px = int(round(cx - sized.width / 2))
            py = int(round(cy - sized.height / 2))
            cellimg = _cell_with_item(sized, px, py, cell)
            arr = np.asarray(cellimg).copy()
            alpha = arr[..., 3] > 0
            if slot in CLIP_SLOTS:
                arr[..., 3] = np.where(hero_cell, arr[..., 3], 0)
                alpha = arr[..., 3] > 0
            outside[slot][0] += int((alpha & ~hero_cell).sum())
            outside[slot][1] += int(alpha.sum())
            sheets[slot].alpha_composite(Image.fromarray(arr, "RGBA"), (sx, sy))
            if act.startswith("walk"):
                jitter.setdefault(slot, []).append((cx - bcx, cy - bcy))

    for slot in SLOTS:
        dst = LAYERS / f"{set_name}-{slot}.png"
        sheets[slot].save(dst, optimize=True)

    jit = {}
    for slot, offs in jitter.items():
        if len(offs) > 2:
            a = np.array(offs, dtype=np.float64)
            jit[slot] = [round(float(a[:, 0].std()), 2), round(float(a[:, 1].std()), 2)]
    out_pct = {s: round(100.0 * v[0] / max(1, v[1]), 2) for s, v in outside.items()}

    print(f"  {set_name}: {len(plan)} frames, {len(hidden)} hidden slot-frames")
    print("  median scale (x, y): " + json.dumps({s: [round(v[0], 3), round(v[1], 3)] for s, v in med.items()}))
    print("  outside dilated silhouette %: " + json.dumps(out_pct))
    print("  walk anchor jitter px (std x, std y): " + json.dumps(jit))
    print("  hidden: " + (", ".join(hidden[:16]) + (" ..." if len(hidden) > 16 else "") or "none"))
    return {"set": set_name, "class": cls, "frames": len(plan), "hidden": hidden,
            "median_scale": {s: list(v) for s, v in med.items()},
            "outside_pct": out_pct, "jitter": jit}


def main(argv: list[str]) -> int:
    stage = argv[1]
    if stage == "cut":
        return cut(argv[2], argv[3], argv[4], argv[5])
    if stage == "items":
        build_items(argv[2], argv[3], Path(argv[4]), argv[5], "--split-weapon" in argv)
        return 0
    if stage == "place":
        place(argv[2], argv[3])
        return 0
    if stage == "all":
        for pref, cls in SETS:
            print(f"== {cls}: place")
            r = place(f"{pref}", cls)
            (DEMO / "assets" / f"{pref}-place.json").write_text(
                json.dumps({"set": pref, "class": cls, **r}, ensure_ascii=False, indent=1), encoding="utf-8")
        return 0
    if stage == "v2":
        report = {}
        for pref, cls, allowed in V2_SETS:
            print(f"== {cls}: place v2")
            report[pref] = place_v2(pref, cls, allowed)
            (DEMO / "assets" / f"{pref}-place.json").write_text(
                json.dumps(report[pref], ensure_ascii=False, indent=1), encoding="utf-8")
        (DEMO / "assets" / "l0v2-measure.json").write_text(
            json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
        return 0
    raise SystemExit(__doc__)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
