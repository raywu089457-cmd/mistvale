#!/usr/bin/env python3
"""import_sheet.py — large AI-generated sheet (painted on the x8 template) -> clean 1x DV2-format source sheet.

    python pipeline/scripts/dv2fmt/import_sheet.py <kind> <name> <image> [--bg #rrggbb] [--allow-edge]

    kind  body | hand | armor | cape | head | hat | weapon | effect
    name  class id for body/hand/head (archer, paladin, ...); item name otherwise (plate, helm, sword, sword_fine, shield, slash)

Steps (spec: sprites/DV2_FORMAT_SPEC.md §7):
  1. fit the image to exactly 8x the sheet size (nearest; warns if the aspect ratio is off by >2 %)
  2. background removal: real alpha if the image has any; else the most common border colour (+/- tolerance) is background
  3. 8x8 block -> 1 px: a block is opaque if >= 50 % of it is foreground; its colour = the most common palette colour
     among its foreground pixels (each pixel snapped to the nearest palette colour first)
  4. palette: the class palette for body/hand/head, the shared 'items' palette for armor/hat/weapon, 'effects' for effect
  5. per-cell checks: EDGE (art touches the cell's top/left/right border, or the bottom where the anchor is not the bottom),
     EMPTY (a used cell has nothing), RESERVED (art in a reserved cell), FLOAT (a standing body pose whose lowest pixel is
     more than 1 px above the foot line)
  6. writes assets/paperdoll-dv2/src/<file>.png and output/dv2fmt/reports/<file>.txt; exit 1 on EDGE/EMPTY unless --allow-edge
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import dv2fmt as F  # noqa: E402

TOL = 48


def hexrgb(h):
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def palette_for(kind, name):
    pals = F.palettes()
    if kind in ("body", "hand", "head"):
        return pals[name]
    if kind == "effect":
        return pals["effects"]
    if kind == "cape" and "cape" in pals:
        return pals["cape"]
    return pals["items"]


def downsample(img: Image.Image, size, pal_hex, bg_hex=None):
    W, H = size
    U = F.UPSCALE
    if img.size != (W * U, H * U):
        ra, rb = img.width / img.height, W / H
        if abs(ra - rb) / rb > 0.02:
            print(f"  warning: aspect {ra:.3f} differs from template {rb:.3f}; stretching to fit", file=sys.stderr)
        img = img.resize((W * U, H * U), Image.NEAREST)
    a = np.asarray(img.convert("RGBA")).astype(np.int32)
    rgb, alpha = a[..., :3], a[..., 3]
    if (alpha < 250).any():
        fg = alpha >= 128
    else:
        if bg_hex:
            bg = np.array(hexrgb(bg_hex))
        else:
            border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
            bg = np.array(Counter(map(tuple, border)).most_common(1)[0][0])
        fg = np.sqrt(((rgb - bg) ** 2).sum(-1)) > TOL
    P = np.array([hexrgb(h) for h in pal_hex])
    out = np.zeros((H, W, 4), np.uint8)
    for by in range(H):
        band = rgb[by * U:(by + 1) * U].reshape(U, W, U, 3).transpose(1, 0, 2, 3).reshape(W, U * U, 3)
        m = fg[by * U:(by + 1) * U].reshape(U, W, U).transpose(1, 0, 2).reshape(W, U * U)
        d = ((band[:, :, None, :] - P[None, None, :, :]) ** 2).sum(-1)     # W x 64 x n
        idx = d.argmin(-1)
        for bx in range(W):
            mk = m[bx]
            if mk.sum() * 2 < U * U:
                continue
            c = np.bincount(idx[bx][mk], minlength=len(P)).argmax()
            out[by, bx, :3] = P[c]
            out[by, bx, 3] = 255
    return Image.fromarray(out, "RGBA")


def reserved_boxes(kind):
    if kind not in ("body", "hand", "armor", "cape"):
        return []
    used = {(x, y) for _, _, x, y in F.all_body_cells()}
    return [(c * F.CELL, r * F.CELL) for r in range(F.BODY_ROWS) for c in range(F.BODY_COLS) if (c * F.CELL, r * F.CELL) not in used]


def check(kind, im: Image.Image, name=None):
    A = np.asarray(im)[..., 3] > 0
    rows, errors = [], 0
    for label, x, y, w, h, anchor, bottom_ok in F.cells_of(kind):
        cell = A[y:y + h, x:x + w]
        if not cell.any():
            # a hand overlay or a spare head column may legitimately be empty; weapons that only have their own
            # special cell 1 (bow drawn, shield edge-on) may leave cells 2..3 empty, every other weapon must fill all four
            ok_empty = (kind == "hand" or label.endswith(":spare")
                        or (kind == "weapon" and (label == "sebF1"
                                                  or (str(name or "").replace("_fine", "") in ("bow", "shield") and label != "sebF0"))))
            rows.append(f"{label:22s} {'empty' if ok_empty else 'EMPTY'}")
            errors += 0 if ok_empty else 1
            continue
        ys, xs = np.nonzero(cell)
        edge = []
        if ys.min() == 0:
            edge.append("top")
        if xs.min() == 0:
            edge.append("left")
        if xs.max() == w - 1:
            edge.append("right")
        if ys.max() == h - 1 and not bottom_ok:
            edge.append("bottom")
        status = "ok"
        if edge:
            status = "EDGE " + "/".join(edge)
            errors += 1
        elif kind == "body" and not any(k in label for k in ("lying", "victory", "kneel")) and ys.max() < (anchor[1] - 2):
            status = f"FLOAT lowest row {ys.max()} (foot line {anchor[1] - 1})"
        rows.append(f"{label:22s} {status:28s} bbox x{xs.min()}-{xs.max()} y{ys.min()}-{ys.max()}")
    for (x, y) in reserved_boxes(kind):
        if A[y:y + F.CELL, x:x + F.CELL].any():
            rows.append(f"reserved@{x // F.CELL},{y // F.CELL:<14} RESERVED cell has art (ignored by the pack)")
    return rows, errors


def import_one(kind, name, path, bg=None, allow_edge=False, quiet=False):
    size = F.sheet_size(kind)
    img = Image.open(path)
    out = downsample(img, size, palette_for(kind, name), bg)
    rows, errors = check(kind, out, name)
    F.SRC_DIR.mkdir(parents=True, exist_ok=True)
    fname = F.src_name(kind, name)
    rep_dir = F.OUT_DIR / "reports"
    rep_dir.mkdir(parents=True, exist_ok=True)
    head = f"{fname}: {size[0]}x{size[1]} from {Path(path).name} ({img.width}x{img.height}); {errors} problem(s)"
    (rep_dir / (fname[:-4] + ".txt")).write_text(head + "\n" + "\n".join(rows) + "\n", encoding="utf-8")
    if errors and not allow_edge:
        print("FAIL " + head)
        for r in rows:
            if "EDGE" in r or "EMPTY" in r:
                print("   " + r)
        return False
    out.save(F.SRC_DIR / fname)
    # provenance: which input produced each source sheet (build_pack lists the ones still from the placeholder re-cut)
    man = F.SRC_DIR / "sources.json"
    try:
        srcs = json.loads(man.read_text(encoding="utf-8"))
    except Exception:
        srcs = {}
    srcs[fname] = {"from": Path(path).name, "placeholder": "placeholder_x8" in str(Path(path).parent)}
    man.write_text(json.dumps(dict(sorted(srcs.items())), indent=1) + chr(10), encoding="utf-8")
    if not quiet:
        print("OK   " + head)
    return True


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("kind", choices=["body", "hand", "armor", "cape", "head", "hat", "weapon", "effect"])
    ap.add_argument("name")
    ap.add_argument("image")
    ap.add_argument("--bg", help="background colour #rrggbb (default: most common border colour, or real alpha)")
    ap.add_argument("--allow-edge", action="store_true", help="write the sheet even if cells touch their borders")
    a = ap.parse_args(argv)
    return 0 if import_one(a.kind, a.name, a.image, a.bg, a.allow_edge) else 1


if __name__ == "__main__":
    sys.exit(main())
