#!/usr/bin/env python3
"""Re-draw the darkknight body/hand/head in the DV2 format.

`sources.json` still marks darkknight_body/hand/head as `placeholder: true`
because that class was never painted: it is the legacy, non-recruitable id and
build_pack keeps the placeholder re-cuts. Every class shares the same BODY
silhouette anyway -- the per-class palette is what tells them apart -- so the
darkknight art is the shared BODY art, darkened (a dark knight is a dark
version of the same body) and palette-snapped to the darkknight ramp by the
importer, exactly the way a freshly painted sheet is.

Usage:
  python pipeline/scripts/dv2fmt/gen_darkknight.py [--shade 0.62]
"""

from __future__ import annotations

import argparse
import sys

from PIL import Image

import dv2fmt as F
import import_sheet as I

WORK = F.OUT_DIR / "work" / "missing"
CLASS = "darkknight"
SOURCES = {"body": "paladin_body.png", "hand": "paladin_hand.png", "head": "paladin_head.png"}


def darken(im, shade):
    """Scale RGB towards the outline colour; alpha untouched."""
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if not a:
                continue
            px[x, y] = (int(r * shade), int(g * shade), int(b * shade), a)
    return im


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--shade", type=float, default=0.62)
    args = ap.parse_args()
    WORK.mkdir(parents=True, exist_ok=True)
    todo = []
    for kind, src_name in SOURCES.items():
        src = F.SRC_DIR / src_name
        if not src.exists():
            print(f"skip {kind}: no {src_name}")
            continue
        im = darken(Image.open(src).convert("RGBA"), args.shade)
        big = im.resize((im.width * F.UPSCALE, im.height * F.UPSCALE), Image.NEAREST)
        out = WORK / f"{CLASS}_{kind}_x8.png"
        big.save(out)
        todo.append((kind, out))
    fails = 0
    for kind, path in todo:
        ok = I.import_one(kind, CLASS, str(path), bg=None, allow_edge=False, quiet=False)
        print(f"import {kind}: {'OK' if ok else 'FAIL'}")
        fails += 0 if ok else 1
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
