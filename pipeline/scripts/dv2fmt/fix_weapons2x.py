"""fix_weapons2x.py -- 2026-11-15 coordination audit (docs/PAPERDOLL.md §23.1): two 2x weapon sheets did not fit the 2x heroes.

  * dagger / dagger_fine: the art agent's upright dagger was ~40 px tall, as tall as the hero (~35 px) and as long as the sword.
    Shrunk (area-mode downscale, outline kept: parts2x/phase6.downscale) to DAGGER_H and re-baked with pixellab_weapon.py --x2
    (same grip (40,58), same tilt columns).
  * bow / bow_fine: the sheet had the four TILT columns of an upright bow, but bow rows use DV2's bow columns (0 rest, 1 drawn with
    an arrow, 2 released; see the 1x bow sheet), so the "drawn" frames showed a bow rotated by 22/36 deg around a grip far below it.
    Rebuilt from the same upright art: shrunk to BOW_H (the bow was ~46 px, taller than the archer), mirrored so the wood bulges
    toward the target like DV2's bow (string on the archer's side), BOW_HOLD rows below the bow's middle on the grip (40,58) -- so rig2x.py no longer
    needs BOW_LIFT for art bows --, column 1 = string pulled back + arrow (drawn here, 1 px lines in the bow's own colours),
    columns 0/2/3 = rest.
Sources are the sheets as installed before this script (backup: output/dv2fmt/audit/art_backup/), column 0 = the upright art.
usage: python pipeline/scripts/dv2fmt/fix_weapons2x.py [--install]
"""
import subprocess
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

BACKUP = ROOT / "output/dv2fmt/audit/art_backup"
WORK = ROOT / "output/dv2fmt/audit/art_work"
C, GX, GY = 80, 40, 58
DAGGER_H = 22
BOW_H = 24
BOW_HOLD = 2      # the hand holds the bow this many rows below its middle (more bow above the fist: an idle hand at the hip
                  # would otherwise push the lower limb through the ground)


def col0(name):
    return Image.open(BACKUP / f"weapon_{name}.png").convert("RGBA").crop((0, 0, C, C))


def dagger(name):
    up = downscale(col0(name), DAGGER_H / 40.0)
    WORK.mkdir(parents=True, exist_ok=True)
    p = WORK / f"{name}_upright.png"
    up.save(p)
    args = [sys.executable, str(HERE / "pixellab_weapon.py"), name, str(p), "--grip-from-bottom", "2", "--x2"]
    subprocess.run(args, check=True)
    return ROOT / "output/dv2fmt/work/weapons/x2" / f"weapon_{name}.png"


def line(a, p0, p1, col):
    (x0, y0), (x1, y1) = p0, p1
    n = max(abs(x1 - x0), abs(y1 - y0), 1)
    for t in range(n + 1):
        x, y = round(x0 + (x1 - x0) * t / n), round(y0 + (y1 - y0) * t / n)
        if 0 <= x < C and 0 <= y < C:
            a[y, x] = (*col, 255)


def bow(name):
    a = np.asarray(col0(name)).copy()
    m = a[..., 3] > 0
    # the string: the long 1-px vertical run right of the wood
    counts = m.sum(0)
    sx = int(np.argmax(np.where(np.arange(C) > GX, counts, 0)))
    string_col = tuple(int(v) for v in a[np.nonzero(m[:, sx])[0][len(np.nonzero(m[:, sx])[0]) // 2], sx, :3])
    wood = a.copy()
    run = np.nonzero(m[:, sx])[0]
    for y in run:                                           # drop the string column where it is a lone pixel (keep the tips)
        if not m[y, sx - 1]:
            wood[y, sx] = 0
    wim = Image.fromarray(wood, "RGBA")
    ys = np.nonzero((wood[..., 3] > 0).any(1))[0]
    small = np.asarray(downscale(wim, BOW_H / (ys.max() - ys.min() + 1)))[:, ::-1]   # mirrored: wood bulges right (DV2 bow)
    h, w = small.shape[:2]
    sm = small[..., 3] > 0
    mid = h // 2 + BOW_HOLD
    xs = np.nonzero(sm[mid])[0]
    gx = (xs.min() + xs.max()) // 2                         # the wood at the hold row = the grip
    cell = np.zeros((C, C, 4), np.uint8)
    ox, oy = GX - gx, GY - mid
    cell[oy:oy + h, ox:ox + w][sm] = small[sm]
    cm = cell[..., 3] > 0
    rows = np.nonzero(cm.any(1))[0]
    top, bot = rows.min(), rows.max()
    tip_t = (int(np.nonzero(cm[top])[0].min()), int(top))   # the limb tips' string side (left after the mirror)
    tip_b = (int(np.nonzero(cm[bot])[0].min()), int(bot))
    pal = sorted({tuple(int(v) for v in p[:3]) for p in cell[cm]}, key=sum)
    dark, midc, light = pal[0], pal[len(pal) // 2], pal[-1]
    rest = cell.copy()
    line(rest, (min(tip_t[0], tip_b[0]), tip_t[1] + 1), (min(tip_t[0], tip_b[0]), tip_b[1] - 1), string_col)
    drawn = cell.copy()
    nock = (GX - 8, GY)
    line(drawn, (tip_t[0], tip_t[1] + 1), nock, string_col)
    line(drawn, nock, (tip_b[0], tip_b[1] - 1), string_col)
    line(drawn, (nock[0] + 1, GY), (GX + 7, GY), midc)          # arrow shaft
    drawn[GY - 1:GY + 2, GX + 7] = (*dark, 255)                  # head
    drawn[GY, GX + 8] = (*light, 255)
    drawn[GY - 1, nock[0] + 1] = (*light, 255)                   # fletching
    drawn[GY + 1, nock[0] + 1] = (*light, 255)
    out = np.concatenate([rest, drawn, rest, rest], 1)
    WORK.mkdir(parents=True, exist_ok=True)
    p = WORK / f"weapon_{name}.png"
    Image.fromarray(out, "RGBA").save(p)
    Image.fromarray(out, "RGBA").resize((out.shape[1] * 6, C * 6), Image.NEAREST).save(WORK / f"weapon_{name}_x6.png")
    return p


def main():
    if not BACKUP.exists():
        raise SystemExit(f"need the original sheets in {BACKUP}")
    made = {n: dagger(n) for n in ("dagger", "dagger_fine")}
    made.update({n: bow(n) for n in ("bow", "bow_fine")})
    for n, p in made.items():
        print(n, "->", p)
        if "--install" in sys.argv:
            shutil.copy(p, F.SRC_DIR / "x2" / f"weapon_{n}.png")
            print("installed", F.SRC_DIR / "x2" / f"weapon_{n}.png")


if __name__ == "__main__":
    main()
