"""fix_fists2x.py -- 2026-11-15 coordination audit (docs/PAPERDOLL.md §23.1): the installed 2x fists (src/x2/<class>/fist_*.png) are
8-12 px wide on bodies ~13 px wide with 3-4 px arms -- boxing gloves next to the face in cry/clap/punch and at both hips in idle.
Shrunk to FIST_SCALE with the same outline-keeping area-mode downscale the art agent used for the parts (parts2x/phase6.downscale),
content centred in the same 16x16 canvas. Originals: output/dv2fmt/audit/art_backup/fists/<class>/ (the script always starts from
them, so re-running it is idempotent).
usage: python pipeline/scripts/dv2fmt/fix_fists2x.py [--install]
"""
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / "parts2x"))
import dv2fmt as F  # noqa: E402
from phase6 import downscale  # noqa: E402

BACKUP = ROOT / "output/dv2fmt/audit/art_backup/fists"
CLASSES = ["archer", "sorcerer", "priest", "paladin", "berserker", "assassin"]
FIST_SCALE = 0.72


def main():
    install = "--install" in sys.argv
    for cls in CLASSES:
        for v in ("side", "front"):
            src = F.SRC_DIR / "x2" / cls / f"fist_{v}.png"
            bak = BACKUP / cls / src.name
            if not bak.exists():
                bak.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy(src, bak)
            im = Image.open(bak).convert("RGBA")
            small = np.asarray(downscale(im, FIST_SCALE))
            out = np.zeros((im.height, im.width, 4), np.uint8)
            h, w = small.shape[:2]
            y0, x0 = (im.height - h) // 2, (im.width - w) // 2
            out[y0:y0 + h, x0:x0 + w] = small
            print(cls, v, im.getbbox(), "->", (w, h))
            if install:
                Image.fromarray(out, "RGBA").save(src)


if __name__ == "__main__":
    main()
