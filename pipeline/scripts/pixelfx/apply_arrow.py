#!/usr/bin/env python3
"""Replace the arrowFx cell in assets/vfx@1x.png and @2x.png with the code-drawn arrow."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
SRC1 = ROOT / "output" / "pixelfx-arrow" / "arrow-64.png"
SRC2 = ROOT / "output" / "pixelfx-arrow" / "arrow-128.png"
A1 = ROOT / "assets" / "vfx@1x.png"
A2 = ROOT / "assets" / "vfx@2x.png"
BOX1 = (72, 188, 136, 252)      # arrowFx in the 1x manifest
BOX2 = (144, 376, 272, 504)     # same cell at 2x

OUT = ROOT / "output" / "pixelfx-arrow"


def replace(atlas_path, box, src_path, name):
    atlas = Image.open(atlas_path).convert("RGBA")
    old = atlas.crop(box)
    old.save(OUT / f"old-{name}.png")
    new = Image.open(src_path).convert("RGBA")
    if new.size != (box[2] - box[0], box[3] - box[1]):
        raise SystemExit(f"{src_path}: {new.size} does not match cell {box}")
    atlas.paste(new, box[:2])
    atlas.save(atlas_path)
    print(f"{atlas_path.name}: replaced {name}, atlas {atlas.size}")


replace(A1, BOX1, SRC1, "arrow-64")
replace(A2, BOX2, SRC2, "arrow-128")
