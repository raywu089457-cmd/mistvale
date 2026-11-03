"""split_dressed_layers.py — T34/T36/T41: split the PixelLab transfer-outfit-v2 frames by pixel OWNERSHIP.

T33 split the dressed frames by "pixels that differ from the input", which threw away everything the
restyle left unchanged (the sword!) and had nothing to say about pixels the restyle added outside the
T28 equipment masks. T34 instead gives every opaque dressed pixel to exactly one owner:

  body / helmet / chest / cape / shield / weapon

T36 adds the bare-body base (output/pixellab/layers/base/): the body layer is now the BASE sprite
(plain undershirt and trousers, bare head), and the equipment layers are the pixels where the dressed
frame differs from it — so removing a piece leaves the bare body underneath, not a hole.

  1. align the dressed frame to the frame that was sent (nearest-neighbour resize if the size differs,
     then the best integer shift within +-2 px by minimum absolute difference), and align the base
     frame the same way onto the dressed frame,
  2. changed = dressed pixels where the base differs noticeably (any channel by more than DIFF_PX, or
     the base has no pixel there). Only those pixels can be equipment,
  3. pixels inside a slot's T28 mask (dilated 2 px) belong to that slot. Where dilated masks overlap the
     UNDILATED mask wins; otherwise the order is weapon > shield > helmet > cape > chest,
  4. changed pixels the restyle put in no mask go to the nearest slot whose palette matches, but only
     within 6 px of that slot's bbox in the same frame; whatever is still unowned goes to CHEST, never
     to the body,
  5. a walk frame whose shield mask is missing or tiny (< 30 px) gets one built from the shield palette
     (the connected component of shield-palette pixels nearest the well-formed shield bbox),
  6. the body sheet is the base sprite: base colour where a slot owns the pixel (so hiding that layer
     shows the bare body) and the dressed pixel where the base already explains it. Body + the five
     layers stack back into the dressed frame with 0 differing pixels.

T41 changes the base-only picture:
  a. fill = hull (the default): a base hole is filled only when it is enclosed by the bare body's own
     silhouette, and then with the nearest BARE colour — never with the dressed pixel. Where the base is
     empty the body stays transparent, so "base only" cannot show a ghost cape or sword,
  b. the paid base frame is aligned with a scale candidate (attack f0-3,8 came back at ~1.3x), kept only
     when it lands inside the dressed silhouette better than the frame as it came,
  c. inside a slot's mask a DRESSED pixel that carries that slot's palette belongs to the slot, never to
     the body (that leak was the plate / cape showing in base only),
  d. a base pixel that is far from every colour the bare body wears, close to an equipment palette and
     bright like metal is a ghost: it goes to the nearest slot and the body stays transparent there. The
     seed is grown along the object (neutral, not a bare colour) so the whole held sword and its dark
     outline go, and inside a slot mask next to a ghost everything that is not exactly bare goes too.
     `ghost_px` / `ghost_any_px` count what the base-only sheet still shows; the target is <= 20.

Writes, into output/layer-demo/assets/layers/:
  paladin-pixellab-<slot>.png   one sheet per owner (body = the T36 base + 5 slots) on the body sheet grid
  paladin-pixellab-dressed.png  the full dressed frames, for the "PixelLab 原圖" comparison column
and into output/layer-demo/:
  assets/pixellab-measure.json  per-frame px per owner, armour-colour % left in the base, bbox jitter
  shot-pixellab-slots.png       walk frame 0 and attack frame 4, every owner alone, grey bg, zoom 3

Usage: python pipeline/scripts/split_dressed_layers.py [--write]
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parents[2]
LAYERS_DIR = ROOT / "output" / "layer-demo" / "assets" / "layers"
DEMO_DIR = ROOT / "output" / "layer-demo"
LEDGER = ROOT / "output" / "pixellab" / "layers" / "ledger.json"
INPUTS = ROOT / "output" / "pixellab" / "layers" / "inputs"
BASE_DIR = ROOT / "output" / "pixellab" / "layers" / "base"
BASE_SPEND = BASE_DIR / "spend.json"
META = LAYERS_DIR / "paladin-layers.json"
SLOTS = ["chest", "helmet", "cape", "shield", "weapon"]
OWNERS = ["body"] + SLOTS
# low -> high priority: painted in this order, so a later (higher) slot overwrites an earlier one
PRIORITY = {"chest": 0, "cape": 1, "helmet": 2, "shield": 3, "weapon": 4}
DILATE = 2
NEAR_BBOX = 6          # step 4: how far outside a slot bbox a changed pixel may be adopted
TINY_MASK = 30         # step 5: a shield mask under this many px is rebuilt from the palette
WELL_FORMED = 30       # a frame counts as a palette source when its mask has at least this many px
SHIELD_PALETTE_ACTIONS = ("idle", "attack")   # the dressed walk frames have no shield at all
DIFF_PX = 32           # T36 step 2: a dressed pixel is equipment when a channel differs from base by more
ARMOUR_TOL = 6         # T36 step 5: "the same colour" = within this per-channel of the T34 palette
GHOST_TOL = 18         # T41 step 2: "looks like that equipment" = within this of any equipment palette
GHOST_BARE_TOL = 12    # ... and farther than this from every colour the bare body itself wears
GHOST_LUM = 150        # ... and bright like a blade or a plate (skin in shadow is dark, cloth is dull)
GHOST_STUB_TOL = 6    # inside a slot mask next to a ghost, "not exactly bare" is close enough
GHOST_WARM = 40        # growth stops at warm colours: skin and boots are warm, steel and its outline are neutral
GHOST_GROW_LUM = 40    # ... and at near-black (hair, pupils)
FORCE_TOL = 0          # T41 step 2: palette membership of the DRESSED pixel is exact, like step 4a
BARE_PALETTE_ACTIONS = ("walk", "idle")   # T36 left these bare bases clean, so their colours are "bare"
SCALE_TOL = 0.06       # T41 step 1: a paid base frame comes back at another zoom -> rescale before aligning


def load_meta() -> dict:
    return json.loads(META.read_text(encoding="utf-8"))


def dressed_map(entries: dict) -> dict:
    """action -> ({input frame index: png path}, frame count), plus the duplicate fills for identical frames."""
    per_action: dict = {}
    for call in entries["calls"]:
        action, tag = call["action"], call["tag"]
        slots = per_action.setdefault(action, {})
        for i, fi in enumerate(call["frames"]):
            name = call["images"][i] if i < len(call["images"]) else None
            if not name:
                continue
            slots[fi] = LEDGER.parent / action / tag / name
    out = {}
    meta = load_meta()
    for action, slots in per_action.items():
        row = meta["actions"].get(action)
        frames = row["frames"] if row else max(slots) + 1
        filled = dict(slots)
        # identical input frames (attack 0=8, 2=3, 5=6) reuse one dressed frame instead of paying twice
        arr = {}
        for fi in range(frames):
            p = INPUTS / action / f"{action}-{fi:02d}.png"
            if not p.exists():
                continue
            arr[fi] = np.array(Image.open(p).convert("RGBA"))
        for fi in range(frames):
            if fi in filled:
                continue
            twin = next((j for j, a in arr.items() if j in filled and np.array_equal(a, arr.get(fi))), None)
            if twin is not None:
                filled[fi] = filled[twin]
        out[action] = (filled, frames)
    return out


def base_map() -> dict:
    """T36: action -> ({input frame index: bare-body png path}, frame count), from the base spend ledger.

    The base was paid per call just like the dressed frames, so the ledger is the only source of truth;
    identical input frames (attack 3=2, 6=5, 8=0) reuse one paid base frame, exactly as in T33."""
    if not BASE_SPEND.exists():
        return {}
    per_action: dict = {}
    for call in json.loads(BASE_SPEND.read_text(encoding="utf-8"))["calls"]:
        if call.get("kind") != "transfer-outfit-v2":
            continue
        action, tag = call["action"], call["tag"]
        slots = per_action.setdefault(action, {})
        for i, fi in enumerate(call.get("frames") or []):
            if i < len(call.get("images") or []):
                slots[fi] = BASE_DIR / action / tag / call["images"][i]
    meta = load_meta()
    out = {}
    for action, slots in per_action.items():
        row = meta["actions"].get(action)
        frames = row["frames"] if row else max(slots) + 1
        filled = dict(slots)
        arr = {}
        for fi in range(frames):
            p = INPUTS / action / f"{action}-{fi:02d}.png"
            if p.exists():
                arr[fi] = np.array(Image.open(p).convert("RGBA"))
        for fi in range(frames):
            if fi in filled:
                continue
            twin = next((j for j, a in arr.items() if j in filled and np.array_equal(a, arr.get(fi))), None)
            if twin is not None:
                filled[fi] = filled[twin]
        out[action] = (filled, frames)
    return out


def align(dressed: np.ndarray, inp: np.ndarray) -> tuple[np.ndarray, int, int, str]:
    """Return (aligned dressed, dx, dy, note). dy/dx are the pixel shift applied to the dressed frame."""
    h, w = inp.shape[:2]
    note = ""
    if dressed.shape[:2] != (h, w):
        img = Image.fromarray(dressed).resize((w, h), Image.NEAREST)
        dressed = np.array(img)
        note = f"resized {dressed.shape[1]}x{dressed.shape[0]}->{w}x{h}"
    best = (10 ** 9, 0, 0)
    for dy in range(-DILATE, DILATE + 1):
        for dx in range(-DILATE, DILATE + 1):
            moved = np.roll(np.roll(dressed, dy, axis=0), dx, axis=1)
            cost = np.abs(moved.astype(int) - inp.astype(int)).sum()
            if cost < best[0]:
                best = (cost, dx, dy)
    _, dx, dy = best
    if dx or dy:
        dressed = np.roll(np.roll(dressed, dy, axis=0), dx, axis=1)
    return dressed, dx, dy, note


def align_base(b_raw: np.ndarray, dressed: np.ndarray) -> tuple[np.ndarray, str]:
    """T41: put a paid base frame on the dressed frame. `align()` only shifts, which is enough when the
    model returns the bare body at the dressed scale (walk/idle/attack f4-7), but the one T41 attack call
    came back at ~1.3x with the foot line ~13 px high, so the scale candidates are: the frame as it came,
    and the frame rescaled by the silhouette-height ratio and re-seated on the dressed bbox (bottom +
    centre x). The candidate that lands inside the dressed silhouette better wins, then the shift is
    refined by silhouette overlap."""
    D = dressed[..., 3] > 0
    hb = silhouette_height(b_raw)
    hd = silhouette_height(dressed)
    s = hd / hb if hb else 1.0
    raw, _, _, n2 = align(b_raw, dressed)
    cands = [(overlap(raw, dressed), raw, n2)]
    if not abs(s - 1.0) <= SCALE_TOL and 0.4 < s < 2.0:
        w = max(1, int(round(b_raw.shape[1] * s)))
        h = max(1, int(round(b_raw.shape[0] * s)))
        small = np.array(Image.fromarray(b_raw).resize((w, h), Image.NEAREST))
        bb_s, bb_d = bbox(small[..., 3] > 0), bbox(dressed[..., 3] > 0)
        if bb_s and bb_d:
            placed = np.zeros_like(dressed)
            dx = int(round((bb_d[0] + bb_d[2]) / 2 - (bb_s[0] + bb_s[2]) / 2))
            dy = int(round(bb_d[3] - bb_s[3]))
            x0, y0 = max(0, dx), max(0, dy)
            cw = min(w, placed.shape[1] - x0)
            ch = min(h, placed.shape[0] - y0)
            placed[y0:y0 + ch, x0:x0 + cw] = small[:ch, :cw]
            cands.append((overlap(placed, dressed), placed,
                          f"base scaled x{s:.2f} (silhouette {hb}->{hd} px)"))
    # a scale guess has to earn its place: keep the candidate whose silhouette sits better on the dressed one
    _, b_raw, note = max(cands, key=lambda c: c[0])
    # refine by silhouette overlap only: the bare body and the dressed frame never agree pixel by pixel
    B0 = b_raw[..., 3] > 0
    best = (-1.0, 0, 0)
    for dy in range(-DILATE, DILATE + 1):
        for dx in range(-DILATE, DILATE + 1):
            B = np.roll(np.roll(B0, dy, axis=0), dx, axis=1)
            union = int((B | D).sum())
            iou = int((B & D).sum()) / union if union else 0.0
            if iou > best[0]:
                best = (iou, dx, dy)
    _, dx, dy = best
    if dx or dy:
        b_raw = np.roll(np.roll(b_raw, dy, axis=0), dx, axis=1)
    return b_raw, note


def overlap(base: np.ndarray, dressed: np.ndarray) -> float:
    """Share of the base silhouette that lands on the dressed silhouette (1.0 = fully inside)."""
    B = base[..., 3] > 0
    n = int(B.sum())
    return (int((B & (dressed[..., 3] > 0)).sum()) / n) if n else 0.0


def silhouette_height(arr: np.ndarray) -> int:
    bb = bbox(arr[..., 3] > 0)
    return (bb[3] - bb[1] + 1) if bb else 0


def palette_hit(arr: np.ndarray, colours, tol: int = GHOST_TOL) -> np.ndarray:
    """Pixels of `arr` within `tol` per channel of one of `colours`."""
    hit = np.zeros(arr.shape[:2], bool)
    if not colours:
        return hit
    cols = np.array(sorted(colours), dtype=np.int16)
    px = arr[..., :3].astype(np.int16)
    hit = (np.abs(px[:, :, None, :] - cols[None, None, :, :]).max(axis=3).min(axis=2) <= tol)
    return hit


def bare_palette(frames: list[dict]) -> set:
    """T41: the bare body's own colours = base pixels of the actions whose bare bases carry no equipment
    (walk / idle, T36). Used twice: an equipment colour is never one of these, and a ghost is a base
    pixel that is farther than GHOST_BARE_TOL from all of them."""
    cols = set()
    for f in frames:
        b = f.get("b")
        if b is None or f["action"] not in BARE_PALETTE_ACTIONS:
            continue
        m = np.zeros(b.shape[:2], bool)
        for s in SLOTS:
            m |= f["masks"][s]
        sel = (b[..., 3] > 0) & ~m
        for c in map(tuple, b[sel][:, :3]):
            cols.add(c)
    return cols


def palette_dist(arr: np.ndarray, colours) -> np.ndarray:
    """Per pixel, the smallest per-channel (max over RGB) distance to one of `colours`, +inf if empty."""
    out = np.full(arr.shape[:2], 1e9, np.float32)
    if not colours:
        return out
    cols = np.array(sorted(colours), dtype=np.int16)
    px = arr[..., :3].astype(np.int16)
    step = 64
    for i in range(0, len(cols), step):
        chunk = cols[i:i + step]
        d = np.abs(px[:, :, None, :] - chunk[None, None, :, :]).max(axis=3).min(axis=2)
        out = np.minimum(out, d)
    return out


def ghost_predicate(b: np.ndarray, colours: dict, bare: set) -> np.ndarray:
    """T41: far from every bare-body colour, close to an equipment palette, and bright like metal."""
    B = b[..., 3] > 0
    d_bare = palette_dist(b, bare)
    d_eq = np.minimum.reduce([palette_dist(b, colours[s]) for s in SLOTS])
    lum = 0.299 * b[..., 0].astype(np.float32) + 0.587 * b[..., 1] + 0.114 * b[..., 2]
    return B & (d_bare > GHOST_BARE_TOL) & (d_eq <= GHOST_TOL) & (lum > GHOST_LUM)


def shown_any(b: np.ndarray, pal: dict, bare: set) -> np.ndarray:
    """The same rule with no mask: every ghost-coloured pixel the sheet still shows."""
    colours = {s: {c for c in pal[s] if c not in bare} for s in SLOTS}
    return ghost_predicate(b, colours, bare)


def ghost_masks(b: np.ndarray | None, masks: dict, pal: dict, bare: set) -> dict:
    """T41 step 2: pixels of `b` that are ghosts of an equipment piece, per slot.

    The bare-body call re-paints the frame, so its leftovers never carry the exact dressed palette colours
    (attack f4-7 kept a sword whose blade sits 24-36 away from every bare-body colour and 3-8 from the
    cape / chest / helmet palettes). A ghost pixel is therefore: far from every colour the bare body
    wears, close to an equipment palette, and bright like metal. That seed is grown along the connected
    run of "not a bare-body colour and not dark", so the whole held sword goes - it reaches well past the
    T28 weapon mask - while skin in shadow (dark) and cloth (a bare colour) stop the growth. `b` is the
    bare base on a real frame, and the composited body sheet when the same rule measures what base-only
    still shows."""
    out = {s: np.zeros(b.shape[:2], bool) if b is not None else None for s in SLOTS}
    if b is None:
        return out
    B = b[..., 3] > 0
    colours = {s: {c for c in pal[s] if c not in bare} for s in SLOTS}
    seed = ghost_predicate(b, colours, bare)
    if not seed.any():
        return out
    d_bare = palette_dist(b, bare)
    lum = 0.299 * b[..., 0].astype(np.float32) + 0.587 * b[..., 1] + 0.114 * b[..., 2]
    warm = b[..., 0].astype(np.int16) - b[..., 2].astype(np.int16)
    grow = B & (d_bare > GHOST_BARE_TOL) & (warm < GHOST_WARM) & (lum > GHOST_GROW_LUM)
    lab, _ = ndi.label(ndi.binary_dilation(grow, np.ones((3, 3), bool)), np.ones((3, 3), bool))
    keep = [int(v) for v in np.unique(lab[seed]) if v]
    if not keep:
        return out
    dil = {s: ndi.binary_dilation(masks[s], np.ones((3, 3), bool)) for s in SLOTS}
    for l in keep:
        # +1 px around the object: its own dark outline is neither bright nor palette-close, but it reads
        # as the sword too, so the whole silhouette of the ghost goes, not just its lit interior
        comp = ndi.binary_dilation(grow & (lab == l), np.ones((3, 3), bool)) & B
        counts = {s: int((comp & dil[s]).sum()) for s in SLOTS}
        best = max(counts, key=lambda k: counts[k])
        if not counts[best]:
            # no mask anywhere near: give it to the closest slot so the body never keeps the ghost
            far = {s: float(ndi.distance_transform_edt(~masks[s])[comp].min()) for s in SLOTS}
            best = min(far, key=lambda k: far[k])
        out[best] |= comp
    # the hilt sits inside the T28 weapon mask and is painted in near-bare dark tones, so the colour rule
    # alone leaves a stub in the fist: inside a slot mask, next to a ghost, anything that is not exactly a
    # bare-body colour is part of that ghost too
    ghost_any = np.zeros(B.shape, bool)
    for v in out.values():
        ghost_any |= v
    near = ndi.binary_dilation(ghost_any, np.ones((5, 5), bool))
    for s in SLOTS:
        out[s] = out[s] | (B & masks[s] & near & (d_bare > GHOST_STUB_TOL))
    return out


def cut(arr: np.ndarray, y: int, col: int, cell: int) -> np.ndarray:
    return arr[y:y + cell, col:col + cell]


def t28_masks(cell: int, y: int, col: int) -> dict:
    """Undilated T28 mask per slot, straight out of the split sheets, for one frame."""
    out = {}
    for s in SLOTS:
        a = np.array(Image.open(LAYERS_DIR / f"paladin-{s}.png").convert("RGBA"))
        out[s] = cut(a, y, col, cell)[..., 3] > 0
    return out


def bbox(mask: np.ndarray):
    ys, xs = np.nonzero(mask)
    if not len(xs):
        return None
    return (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max()))


def bbox_distance(b, ys, xs) -> float:
    """Euclidean distance from a point to a bbox rectangle (0 inside)."""
    x0, y0, x1, y1 = b
    dx = max(x0 - xs, 0, xs - x1)
    dy = max(y0 - ys, 0, ys - y1)
    return float(np.hypot(dx, dy))


def load_frames() -> list[dict]:
    """Load + align every dressed frame, with its T28 masks, the input frame and the T36 base frame."""
    meta = load_meta()
    maps = dressed_map(json.loads(LEDGER.read_text(encoding="utf-8")))
    bmaps = base_map()
    frames = []
    for action, (paths, count) in maps.items():
        row = meta["actions"][action]
        cell, y = row["cell"], row["y"]
        bpaths = (bmaps.get(action) or ({}, 0))[0]
        for fi in range(count):
            path = paths.get(fi)
            if not path:
                frames.append({"action": action, "frame": fi, "cell": cell, "y": y, "col": fi * cell,
                               "missing": True})
                continue
            inp = np.array(Image.open(INPUTS / action / f"{action}-{fi:02d}.png").convert("RGBA"))
            dressed_raw = np.array(Image.open(path).convert("RGBA"))
            dressed, dx, dy, note = align(dressed_raw, inp)
            b, bpath = None, bpaths.get(fi)
            if bpath is not None and bpath.exists():
                b_raw = np.array(Image.open(bpath).convert("RGBA"))
                # the base frame was generated from this dressed frame: align it onto the dressed frame
                b, bnote = align_base(b_raw, dressed)
                note = (note + " " + bnote).strip()
            frames.append({
                "action": action, "frame": fi, "cell": cell, "y": y, "col": fi * cell,
                "source": str(path.relative_to(ROOT)).replace("\\", "/"), "dx": dx, "dy": dy, "note": note,
                "base_source": str(bpath.relative_to(ROOT)).replace("\\", "/") if bpath else None,
                "d": dressed, "b": b, "inp": inp, "masks": t28_masks(cell, y, fi * cell),
            })
    return frames


def build_palettes(frames: list[dict]) -> dict:
    """Step 3b: each slot's palette from the frames where that slot is well-formed."""
    pal = {}
    for s in SLOTS:
        cols = set()
        for f in frames:
            if f.get("missing"):
                continue
            if s == "shield" and f["action"] not in SHIELD_PALETTE_ACTIONS:
                continue
            m = f["masks"][s]
            if m.sum() < WELL_FORMED:
                continue
            sel = m & (f["d"][..., 3] > 0)
            for c in map(tuple, f["d"][sel][:, :3]):
                cols.add(c)
        pal[s] = cols
    return pal


def shield_component(f: dict, pal: dict, centre) -> np.ndarray | None:
    """Step 4: rebuild a missing/tiny shield mask from the shield palette, as one connected component."""
    cols = pal["shield"]
    if not cols:
        return None
    d = f["d"]
    opaque = d[..., 3] > 0
    hit = np.zeros(opaque.shape, bool)
    ys, xs = np.nonzero(opaque)
    for y, x in zip(ys, xs):
        hit[y, x] = tuple(int(v) for v in d[y, x, :3]) in cols
    if not hit.any():
        return None
    lab, n = ndi.label(hit, np.ones((3, 3), bool))
    best, best_score = None, None
    for i in range(1, n + 1):
        m = lab == i
        if m.sum() < TINY_MASK:
            continue
        ys2, xs2 = np.nonzero(m)
        cx, cy = float(xs2.mean()), float(ys2.mean())
        score = (np.hypot(cx - centre[0], cy - centre[1]) if centre else 0.0) - m.sum() / 1000.0
        if best_score is None or score < best_score:
            best, best_score = m, score
    return best


def ownership(f: dict, pal: dict, shield_centre, bare: set | None = None) -> tuple[np.ndarray, dict]:
    """Step 2-4: one owner per dressed pixel. Returns (owner index array, notes)."""
    notes = {"shield_rebuilt": False, "adopted_px": 0, "changed_px": 0, "unowned_to_chest_px": 0,
             "ghost_px": 0, "forced_px": 0}
    d = f["d"]
    D = d[..., 3] > 0
    masks = {s: f["masks"][s].copy() for s in SLOTS}
    if masks["shield"].sum() < TINY_MASK:
        comp = shield_component(f, pal, shield_centre)
        if comp is not None:
            masks["shield"] = comp
            notes["shield_rebuilt"] = True
    dil = {s: ndi.binary_dilation(m, np.ones((2 * DILATE + 1, 2 * DILATE + 1), bool)) for s, m in masks.items()}

    owner = np.full(D.shape, -1, np.int32)
    # 3a: dilated masks first, undilated second -> an undilated mask always beats a dilated one,
    # and within each pass a higher-priority slot (painted later) beats a lower one.
    for s in sorted(SLOTS, key=lambda k: PRIORITY[k]):
        owner[dil[s]] = PRIORITY[s]
    for s in sorted(SLOTS, key=lambda k: PRIORITY[k]):
        owner[masks[s]] = PRIORITY[s]

    # 2: only pixels the base does NOT already explain can be equipment. A base hole counts as changed:
    # there is no base pixel to show, so the dressed pixel is the only source for that spot.
    b = f.get("b")
    if b is not None:
        B = b[..., 3] > 0
        diff = np.abs(d[..., :3].astype(np.int16) - b[..., :3].astype(np.int16)).max(axis=2)
        changed = (D & ~B) | (D & B & (diff > DIFF_PX))
        notes["base_hole_px"] = int((D & ~B).sum())
    else:
        changed = np.any(d != f["inp"], axis=2) & D
        notes["base_hole_px"] = 0
    notes["changed_px"] = int(changed.sum())

    # 4a: changed pixels in no mask -> nearest slot whose palette matches, within 6 px of its bbox
    covered = np.zeros(D.shape, bool)
    for s in SLOTS:
        covered |= dil[s]
    todo = changed & ~covered & (owner < 0) & D
    boxes = {s: bbox(masks[s]) for s in SLOTS}
    for y, x in zip(*np.nonzero(todo)):
        rgb = tuple(int(v) for v in d[y, x, :3])
        best = None
        for s in SLOTS:
            bb = boxes[s]
            if bb is None or rgb not in pal[s]:
                continue
            dist = bbox_distance(bb, x, y)
            if dist > NEAR_BBOX:
                continue
            key = (dist, -PRIORITY[s])
            if best is None or key < best[0]:
                best = (key, s)
        if best is not None:
            owner[y, x] = PRIORITY[best[1]]
            notes["adopted_px"] += 1

    # 4b: whatever changed pixel is still unowned goes to chest, never to the body
    rest = changed & (owner < 0) & D
    owner[rest] = PRIORITY["chest"]
    notes["unowned_to_chest_px"] = int(rest.sum())

    # pixels the base already explains keep the body
    owner[~changed] = -1

    # T41 step 2 (the card's rule): inside a slot's mask a dressed pixel whose colour is that slot's
    # palette belongs to that slot, never to the base — even when the base looks close enough to count as
    # "unchanged". That case was the ghost: body-owned pixels showing the dressed plate, cape, plume or
    # sword instead of the bare body underneath.
    forced = 0
    for s in sorted(SLOTS, key=lambda k: PRIORITY[k]):
        m = masks[s] & D & palette_hit(d, pal[s], FORCE_TOL)
        if m.any():
            owner[m] = PRIORITY[s]
            forced += int(m.sum())
    notes["forced_px"] = forced

    # T41 step 2: a base pixel that looks like a slot's own equipment and sits in that slot's mask is a
    # ghost of the gear the bare-body call kept (plume, cape edge, sword, shield). It belongs to that
    # slot, never to the body; the body then stays transparent there (ghost -> body is suppressed in
    # stack_cells, which still stacks back to 0 differing px because the slot paints the dressed pixel).
    ghost = ghost_masks(b, masks, pal, bare or set())
    for s in SLOTS:
        g = ghost.get(s)
        if g is not None and g.any():
            owner[g] = PRIORITY[s]
            notes["ghost_px"] += int(g.sum())
    notes["ghost_by_slot"] = {s: int(ghost[s].sum()) if s in ghost else 0 for s in SLOTS}
    return owner, notes


def nearest_base_colour(b: np.ndarray, target: np.ndarray) -> np.ndarray:
    """T41 hull fill: give every target pixel the colour of the nearest BARE-BODY pixel, so a filled hole
    can never paint a ghost of the equipment (which is what the dressed pixel would be there)."""
    B = b[..., 3] > 0
    if not B.any():
        return np.zeros((int(target.sum()), b.shape[2]), b.dtype)
    ind = ndi.distance_transform_edt(~B, return_distances=False, return_indices=True)
    return b[ind[0][target], ind[1][target]]


def stack_cells(d: np.ndarray, owner: np.ndarray, b: np.ndarray | None = None,
                fill: str = "hull", ghost: dict | None = None) -> tuple[np.ndarray, dict]:
    """Composite body + the five layers exactly like the demo does (source-over, all alpha 0/255).

    The body is the T36 base sprite: base colour wherever a slot owns the pixel (so hiding that layer
    reveals the bare body), the dressed pixel everywhere else (the base already matches there, which is
    what makes body + layers reproduce the dressed frame exactly).

    `fill` decides what the body does where the BASE has no pixel but the dressed frame does:
      all   every such pixel with the DRESSED pixel (the T36 rule). The base has no cape / shield /
            sword / plume, so the body then also carries those pixels; hiding one of those layers leaves
            a copy of it instead of nothing (see output/pi-results/T36.md)
      hull  (T41 default) only the holes enclosed by the bare body's own silhouette, and those are
            filled with the nearest BARE-BODY colour, never with the dressed pixel: the base must show
            no ghost equipment, and where the base is empty it stays transparent
      none  never
    The 0-differing-px check holds in every mode, because a pixel the base lacks is always owned by a slot."""
    D = d[..., 3] > 0
    owned = owner >= 0
    ghost_any = np.zeros(D.shape, bool)
    for g in (ghost or {}).values():
        ghost_any |= g
    cells = {}
    body = np.zeros_like(d)
    if b is not None:
        B = b[..., 3] > 0
        hole = D & ~B
        if fill == "all":
            filled = hole
        elif fill == "hull":
            filled = hole & ndi.binary_fill_holes(B)
        else:
            filled = np.zeros_like(D)
        # T41: a ghost base pixel is the equipment the bare-body call kept, so the body must not show it
        from_base = D & B & owned & ~ghost_any
        body[from_base] = b[from_base]
        from_dressed = D & ~owned
        body[from_dressed] = d[from_dressed]
        if fill == "all":
            body[filled] = d[filled]
        elif filled.any():
            body[filled] = nearest_base_colour(b, filled)
    else:
        m = D & (owner < 0)
        body[m] = d[m]
    cells["body"] = body
    for s in SLOTS:
        arr = np.zeros_like(d)
        m = owner == PRIORITY[s]
        arr[m] = d[m]
        cells[s] = arr
    stack = Image.new("RGBA", (d.shape[1], d.shape[0]), (0, 0, 0, 0))
    for s in OWNERS:
        stack.alpha_composite(Image.fromarray(cells[s]))
    return np.array(stack), cells


def slots_shot(sheets: dict, rows: list[tuple[str, int]], meta: dict, path: Path, zoom: int = 3) -> None:
    """Every owner alone on a grey background, walk frame 0 and attack frame 4, zoom 3."""
    grey = (104, 104, 112)
    cols = OWNERS + ["stack"]
    pad, label = 8, 16
    cellsz = [meta["actions"][a]["cell"] * zoom for a, _ in rows]
    w = max(cellsz)
    h = max(cellsz)
    W = pad + len(cols) * (w + pad)
    H = label + pad + len(rows) * (h + label + pad)
    out = Image.new("RGB", (W, H), (36, 32, 42))
    g = ImageDraw.Draw(out)
    g.text((pad, 3), "T36 PixelLab base + equipment layers, one owner per layer, zoom 3", fill=(224, 181, 103))
    for r, (act, fi) in enumerate(rows):
        row = meta["actions"][act]
        cell, y = row["cell"], row["y"]
        col = fi * cell
        y0 = label + pad + r * (h + label + pad)
        for c, name in enumerate(cols):
            x0 = pad + c * (w + pad)
            g.text((x0, y0), f"{act} f{fi} · {name}", fill=(184, 173, 196))
            if name == "stack":
                img = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
                for s in OWNERS:
                    img.alpha_composite(sheets[s].crop((col, y, col + cell, y + cell)))
            else:
                img = sheets[name].crop((col, y, col + cell, y + cell))
            big = img.resize((cell * zoom, cell * zoom), Image.NEAREST)
            bg = Image.new("RGBA", big.size, grey + (255,))
            bg.alpha_composite(big)
            out.paste(bg.convert("RGB"), (x0, y0 + label))
    out.save(path)


def armour_palette(pal: dict) -> np.ndarray:
    """T36 step 5: the plate-armour / helmet colours, i.e. the T34 chest + helmet palettes."""
    cols = sorted(pal["chest"] | pal["helmet"])
    return np.array(cols, dtype=np.int16) if cols else np.zeros((0, 3), np.int16)


def armour_px(base: np.ndarray, colours: np.ndarray, mask: np.ndarray | None = None) -> int:
    """Base pixels (optionally only inside `mask`) within ARMOUR_TOL of a chest/helmet palette colour."""
    B = base[..., 3] > 0
    if mask is not None:
        B = B & mask
    if not len(colours) or not B.any():
        return 0
    px = base[B][:, :3].astype(np.int16)
    dist = np.abs(px[:, None, :] - colours[None, :, :]).max(axis=2)
    return int((dist.min(axis=1) <= ARMOUR_TOL).sum())


def bbox_jitter(per_frame: list[dict], slot: str) -> dict:
    """Spread of a slot's per-frame bbox inside one action: max - min of the centre x/y and of w/h."""
    boxes = [p["slot_bbox"][slot] for p in per_frame if p.get("slot_bbox", {}).get(slot)]
    if not boxes:
        return {"frames": 0}
    cx = [(b[0] + b[2]) / 2 for b in boxes]
    cy = [(b[1] + b[3]) / 2 for b in boxes]
    ws = [b[2] - b[0] + 1 for b in boxes]
    hs = [b[3] - b[1] + 1 for b in boxes]
    return {"frames": len(boxes), "cx": round(max(cx) - min(cx), 1), "cy": round(max(cy) - min(cy), 1),
            "w": max(ws) - min(ws), "h": max(hs) - min(hs)}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true", help="write the sheets (default: measure only)")
    ap.add_argument("--fill-holes", choices=("all", "hull", "none"), default="hull",
                    help="what the body sheet shows where the bare base has no pixel (see stack_cells); "
                         "T41 rule = \"hull\": no ghost equipment in the base, transparent where it is empty")
    args = ap.parse_args()

    meta = load_meta()
    W, H = meta["width"], meta["height"]
    frames = load_frames()
    pal = build_palettes(frames)
    bare = bare_palette(frames)
    # T41 step 2: every equipment colour the bare body never wears, per slot (used for the ghost measure)
    equip_cols = {s: {c for c in pal[s] if c not in bare} for s in SLOTS}

    # the well-formed shield centre, used to pick the right palette component when a mask is rebuilt
    centres = [((b[0] + b[2]) / 2, (b[1] + b[3]) / 2) for f in frames if not f.get("missing")
               and f["action"] in SHIELD_PALETTE_ACTIONS and (b := bbox(f["masks"]["shield"])) is not None]
    shield_centre = (float(np.mean([c[0] for c in centres])), float(np.mean([c[1] for c in centres]))) if centres else None

    sheets = {s: Image.new("RGBA", (W, H), (0, 0, 0, 0)) for s in OWNERS}
    dressed_sheet = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    report = {"class": "paladin", "owners": OWNERS, "slots": SLOTS, "dilate_px": DILATE,
              "nearest_bbox_px": NEAR_BBOX, "diff_px": DIFF_PX, "armour_tol": ARMOUR_TOL,
              "fill_holes": args.fill_holes, "actions": {},
              "source": "PixelLab transfer-outfit-v2 (T33 dressed frames + T36 bare-body base, split by ownership)",
              "note": "the body sheet is the T36 bare-body base (base colour wherever a slot owns the pixel, "
                      "the dressed pixel in a base hole); every equipment pixel is a dressed pixel that differs "
                      "from the base by more than diff_px"}
    checks = {"stack_diff_max": 0, "weapon_ok": True, "walk_shield_ratio": {}, "walk_shield_ok": True,
              "armour_pct": {}, "armour_max_pct": 0.0,
              "ghost_px": {}, "ghost_any_px": {}, "ghost_max_px": 0, "suppressed_px": 0,
              "ghost_target_px": 20}
    armour_cols = armour_palette(pal)

    for action in dict.fromkeys(f["action"] for f in frames):
        row = meta["actions"][action]
        per_frame = []
        for f in [x for x in frames if x["action"] == action]:
            if f.get("missing"):
                per_frame.append({"frame": f["frame"], "status": "missing"})
                continue
            d = f["d"]
            b = f.get("b")
            D = d[..., 3] > 0
            owner, notes = ownership(f, pal, shield_centre, bare)
            ghost = ghost_masks(b, f["masks"], pal, bare)
            stack, cells = stack_cells(d, owner, b, args.fill_holes, ghost)
            diff_px = int((np.any(stack[..., :4] != d[..., :4], axis=2) & D).sum())
            checks["stack_diff_max"] = max(checks["stack_diff_max"], diff_px)
            slot_px = {s: int(((owner == PRIORITY[s]) & D).sum()) for s in SLOTS}
            body_px = int((D & (owner < 0)).sum())
            slot_bbox = {s: bbox(owner == PRIORITY[s]) for s in SLOTS}
            base_px = int((b[..., 3] > 0).sum()) if b is not None else 0
            # base pixels that also exist in the dressed frame = what the body sheet must show
            base_in_dressed_px = int((D & (b[..., 3] > 0)).sum()) if b is not None else 0
            arm_px = armour_px(b, armour_cols) if b is not None else 0
            arm_pct = round(100.0 * arm_px / base_px, 2) if base_px else 0.0
            armour_zone = f["masks"]["chest"] | f["masks"]["helmet"]
            zone_px = int((armour_zone & (b[..., 3] > 0)).sum()) if b is not None else 0
            zone_arm = armour_px(b, armour_cols, armour_zone) if b is not None else 0
            zone_pct = round(100.0 * zone_arm / zone_px, 2) if zone_px else 0.0
            # T41 step 2: ghost px left in the base only = body-sheet pixels that wear an equipment colour.
            # in-mask counts what the card names (must be 0: a ghost is given to its slot); ghost_any_px
            # also counts equipment colours outside every mask, i.e. the honest number for the report.
            body = cells["body"]
            Bm = body[..., 3] > 0
            shown = ghost_masks(body, f["masks"], pal, bare)
            ghost_in_mask = int(sum(int(v.sum()) for v in shown.values()))
            ghost_any = int(shown_any(body, pal, bare).sum())
            checks["ghost_px"][f"{action}-f{f['frame']}"] = ghost_in_mask
            checks["ghost_any_px"][f"{action}-f{f['frame']}"] = ghost_any
            checks["ghost_max_px"] = max(checks["ghost_max_px"], ghost_any)
            checks["suppressed_px"] += notes["ghost_px"]
            checks["armour_pct"][f"{action}-f{f['frame']}"] = arm_pct
            checks["armour_max_pct"] = max(checks["armour_max_pct"], arm_pct)
            checks["armour_zone_max_pct"] = max(checks.get("armour_zone_max_pct", 0.0), zone_pct)
            for s in OWNERS:
                sheets[s].alpha_composite(Image.fromarray(cells[s]), (f["col"], f["y"]))
            dressed_sheet.alpha_composite(Image.fromarray(d), (f["col"], f["y"]))
            per_frame.append({
                "frame": f["frame"], "source": f["source"], "base_source": f.get("base_source"),
                "dx": f["dx"], "dy": f["dy"], "note": f["note"],
                "dressed_px": int(D.sum()), "base_px": base_px, "base_in_dressed_px": base_in_dressed_px,
                "base_hole_px": notes["base_hole_px"],
                "changed_px": notes["changed_px"], "forced_px": notes["forced_px"],
                "adopted_px": notes["adopted_px"], "unowned_to_chest_px": notes["unowned_to_chest_px"],
                "shield_rebuilt": notes["shield_rebuilt"],
                "t28_weapon_px": int(f["masks"]["weapon"].sum()),
                "armour_px": arm_px, "armour_pct": arm_pct,
                "armour_zone_px": zone_px, "armour_zone_pct": zone_pct,
                "body_px": body_px, "slot_px": slot_px, "slot_bbox": slot_bbox, "stack_diff_px": diff_px,
                "ghost_px": ghost_in_mask, "ghost_any_px": ghost_any, "ghost_suppressed_px": notes["ghost_px"],
                "ghost_by_slot": notes["ghost_by_slot"], "body_sheet_px": int(Bm.sum()),
            })
        report["actions"][action] = {"frames": row["frames"], "cell": row["cell"], "y": row["y"],
                                     "per_frame": per_frame}
        print(f"{action}: {len([p for p in per_frame if 'slot_px' in p])}/{row['frames']} frames")
        for p in per_frame:
            if "slot_px" not in p:
                continue
            print(f"   f{p['frame']}: body {p['body_px']:4d} " + " ".join(f"{s} {p['slot_px'][s]:4d}" for s in SLOTS)
                  + f" | base {p['base_px']:4d} hole {p['base_hole_px']:3d} armour {p['armour_pct']:5.2f}%"
                  + f" (chest/helmet zone {p['armour_zone_pct']:5.1f}%)"
                  + f" changed {p['changed_px']:4d} adopted {p['adopted_px']:3d} toChest {p['unowned_to_chest_px']:3d}"
                  + f" ghost {p['ghost_px']:3d}/{p['ghost_any_px']:3d}"
                  + f" suppressed {p['ghost_suppressed_px']:3d}"
                  + f" stack_diff {p['stack_diff_px']}")

    # step 3 self-check: weapon present wherever T28 has a weapon layer, walk shield vs idle shield
    idle_px = next((p["slot_px"]["shield"] for p in report["actions"]["idle"]["per_frame"] if "slot_px" in p), None)
    for action, row in report["actions"].items():
        for p in row["per_frame"]:
            if "slot_px" not in p:
                continue
            if p["t28_weapon_px"] > 0 and p["slot_px"]["weapon"] == 0:
                checks["weapon_ok"] = False
            if action == "walk" and idle_px:
                ratio = round(p["slot_px"]["shield"] / idle_px, 3)
                checks["walk_shield_ratio"][p["frame"]] = ratio
                if not 0.5 <= ratio <= 1.5:
                    checks["walk_shield_ok"] = False
    checks["idle_shield_px"] = idle_px
    # T36 step 5: walk bbox jitter per slot
    walk = report["actions"].get("walk", {}).get("per_frame", [])
    report["walk_bbox_jitter"] = {s: bbox_jitter(walk, s) for s in SLOTS}
    report["palette_px"] = {s: len(pal[s]) for s in SLOTS}
    report["armour_palette_px"] = int(len(armour_cols))
    report["self_check"] = checks
    print("\nself-check:")
    print(f"  body + layers == dressed, max differing px per frame: {checks['stack_diff_max']}")
    print(f"  weapon > 0 wherever the T28 weapon layer is non-empty: {checks['weapon_ok']}")
    print(f"  idle shield px {idle_px}; walk shield ratio " +
          " ".join(f"f{k} {v:.2f}" for k, v in checks["walk_shield_ratio"].items())
          + f" -> within 50-150 %: {checks['walk_shield_ok']}")
    print(f"  armour-colour px left in the base: max {checks['armour_max_pct']:.2f}% of base px"
          f" (T34 chest+helmet palette, {len(armour_cols)} colours, tol {ARMOUR_TOL}) -> under 10 %: "
          f"{checks['armour_max_pct'] < 10}")
    print("  walk bbox jitter px (cx/cy/w/h): " +
          " ".join(f"{s} {j['cx']}/{j['cy']}/{j['w']}/{j['h']}" for s, j in report["walk_bbox_jitter"].items()
                   if j.get("frames")))
    print("  palette px per slot: " + " ".join(f"{s} {report['palette_px'][s]}" for s in SLOTS))
    print(f"  T41 ghost px left in the base only: in-mask max {max(checks['ghost_px'].values()) if checks['ghost_px'] else 0}"
          f", anywhere max {checks['ghost_max_px']} (target <= {checks['ghost_target_px']}) ->"
          f" {'PASS' if checks['ghost_max_px'] <= checks['ghost_target_px'] else 'FAIL'}"

          f"; {checks['suppressed_px']} ghost base px handed to their slot")

    if args.write:
        for s in OWNERS:
            sheets[s].save(LAYERS_DIR / f"paladin-pixellab-{s}.png")
        dressed_sheet.save(LAYERS_DIR / "paladin-pixellab-dressed.png")
        (DEMO_DIR / "assets" / "pixellab-measure.json").write_text(json.dumps(report, indent=1), encoding="utf-8")
        slots_shot(sheets, [("walk", 0), ("attack", 4)], meta, DEMO_DIR / "shot-pixellab-slots.png")
        print("wrote paladin-pixellab-{body,chest,helmet,cape,shield,weapon,dressed}.png, "
              "assets/pixellab-measure.json, shot-pixellab-slots.png")
    else:
        print("(measure only; pass --write to save the sheets)")


if __name__ == "__main__":
    main()
