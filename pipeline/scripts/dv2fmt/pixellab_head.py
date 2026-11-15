"""pixellab_head.py <class> [--install]

PixelLab expression states -> DV2-format HEAD sheet (140x60: row 0 back, row 1 side face looking screen-right, row 2 front face;
columns = dv2fmt.EXPRESSIONS). docs/PAPERDOLL.md §22.4.

The expressions are PixelLab's own edits of the character (`create-character-state`, "both eyes closed", "shouting" ...), so face,
hair and size stay identical; this script only places each head in its 20x20 cell. map.json "head_states" = {expression: folder
with rotation-<south|east|north>.png} (relative to output/dv2fmt/work/<class>/pixellab/). The crop window is the same one
pixellab_body.py uses for the neck: head rows end at the narrowest row under the face, cell bottom row = that neck row, cell
centre = the head's bbox centre -> head and body line up exactly.
"""
import json, shutil, sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import dv2fmt as F  # noqa: E402
from pixellab_body import head_template  # noqa: E402

ROOT = Path(__file__).resolve().parents[3]
ROW_DIR = {"back": "north", "face": "east", "front": "south"}


def main():
    cls = sys.argv[1]
    PL = ROOT / "output/dv2fmt/work" / cls / "pixellab"
    M = json.loads((PL / "map.json").read_text(encoding="utf-8"))
    states = M["head_states"]
    C = F.HEAD_CELL
    sheet = Image.new("RGBA", F.sheet_size("head"), (0, 0, 0, 0))
    for row, d in ROW_DIR.items():
        base = np.asarray(Image.open(PL / states["normal"] / f"rotation-{d}.png").convert("RGBA"))
        t = head_template(base)
        cx = int(round(t["cx_edge"]))
        box = (cx - C // 2, t["neck"] - (C - 1), cx + C // 2, t["neck"] + 1)
        for col, expr in enumerate(F.EXPRESSIONS):
            src = states.get(expr if row != "back" else "normal")      # the back of the head shows no expression
            if not src:
                continue
            im = Image.open(PL / src / f"rotation-{d}.png").convert("RGBA").crop(box)
            a = np.asarray(im).copy()
            a[C - 1:, :, :] = np.where(a[C - 1:, :, 3:4] > 0, a[C - 1:], 0)   # (neck row kept: it covers the body's first row)
            sheet.alpha_composite(Image.fromarray(a), (col * C, F.HEAD_ROW[row] * C))
    out = PL / "out"
    out.mkdir(parents=True, exist_ok=True)
    sheet.save(out / f"{cls}_head.png")
    sheet.resize((sheet.width * 8, sheet.height * 8), Image.NEAREST).save(out / f"{cls}_head_x8.png")
    print("wrote", out / f"{cls}_head.png")
    if "--install" in sys.argv:
        shutil.copy(out / f"{cls}_head.png", F.SRC_DIR / f"{cls}_head.png")
        print("installed", F.SRC_DIR / f"{cls}_head.png")


if __name__ == "__main__":
    main()
