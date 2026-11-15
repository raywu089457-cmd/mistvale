"""pixellab_weapon.py <weapon name> <upright png> [--grip-from-bottom N] [--install]

One upright PixelLab weapon image (any size up to 40x40, transparent) -> DV2-format weapon sheet (160x40: the 4 baked tilt
columns 0 / +22 / +36 / -20 deg, docs/PAPERDOLL.md §22.5). The weapon is placed so its haft axis sits on the grip x and the
grip pixel (dv2fmt.WEAPON_TYPES[...]["grip"]) is N px above the haft's bottom end; the three tilted copies are baked with
output/dv2fmt/work/missing/gen_weapon_dirs.py's supersampled rotation, re-quantised to THIS weapon's own colours (not the
class palettes) and outline-repaired with its own darkest colour.
Writes output/dv2fmt/work/weapons/weapon_<name>.png (+ _x8 preview); --install copies into assets/paperdoll-dv2/src/.
"""
import shutil, sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(ROOT / "output/dv2fmt/work/missing"))
import dv2fmt as F  # noqa: E402
import gen_weapon_dirs as G  # noqa: E402


def nearest(im, pal):
    """nearest palette colour in int32 (gen_weapon_dirs.nearest_palette squares in int16 and overflows on bright colours)"""
    arr = np.asarray(im).copy()
    palo = np.array([p[:3] for p in pal], dtype=np.int32)
    flat = arr.reshape(-1, 4)
    idx = np.nonzero(flat[:, 3] > 0)[0]
    if len(idx):
        rgb = flat[idx, :3].astype(np.int32)
        d = ((rgb[:, None, :] - palo[None, :, :]) ** 2).sum(2)
        flat[idx, :3] = palo[d.argmin(1)]
        flat[idx, 3] = 255
    return Image.fromarray(flat.reshape(arr.shape), "RGBA")


def main():
    name, src = sys.argv[1], sys.argv[2]
    above = int(sys.argv[sys.argv.index("--grip-from-bottom") + 1]) if "--grip-from-bottom" in sys.argv else 5
    # --x2: the DV2 rig at 2x (rig2x.py, docs/PAPERDOLL.md §22.6): 80x80 cells, grip = DV2's handle (20, 29) x 2
    x2 = "--x2" in sys.argv
    C = F.WEAPON_CELL * (2 if x2 else 1)
    gx, gy = (40, 58) if x2 else F.WEAPON_TYPES[name.replace("_fine", "")]["grip"]
    im = Image.open(src).convert("RGBA")
    a = np.asarray(im)[..., 3] > 0
    ys, xs = np.nonzero(a)
    bottom = ys.max()
    low = a[max(ys.min(), bottom - 8):bottom + 1]                  # the haft: bottom 9 rows
    lx = np.nonzero(low.any(0))[0]
    axis = int(round((lx.min() + lx.max()) / 2))
    cell = Image.new("RGBA", (C, C), (0, 0, 0, 0))
    cell.alpha_composite(im, (gx - axis, gy + above - bottom))
    if np.asarray(cell)[..., 3].sum() // 255 < a.sum():
        raise SystemExit(f"{name}: weapon does not fit the {C}x{C} cell at that grip")
    cols = np.asarray(cell).reshape(-1, 4)
    pal = sorted({tuple(int(v) for v in p) for p in cols if p[3] > 0})
    outline = min(pal, key=lambda c: c[0] + c[1] + c[2])[:3]
    out = Image.new("RGBA", (C * len(G.THETA), C), (0, 0, 0, 0))
    for i, deg in enumerate(G.THETA):
        rot = G.rotate_cell(cell, deg, (gx, gy)) if deg else cell.copy()
        rot = nearest(rot, pal)
        rot = G.fix_outline(rot, outline) if deg else rot
        out.alpha_composite(rot, (i * C, 0))
    dst = ROOT / "output/dv2fmt/work/weapons" / ("x2" if x2 else "")
    dst.mkdir(parents=True, exist_ok=True)
    out.save(dst / f"weapon_{name}.png")
    prev = out.resize((out.width * 8, out.height * 8), Image.NEAREST)
    pa = np.asarray(prev).copy()
    for i in range(len(G.THETA)):                                  # mark the grip pixel
        x, y = (i * C + gx) * 8, gy * 8
        pa[y:y + 8, x:x + 8] = (255, 60, 60, 255)
    Image.fromarray(pa).save(dst / f"weapon_{name}_x8.png")
    print(f"weapon_{name}: haft axis x={axis}, bottom y={bottom} -> grip ({gx},{gy}); {len(pal)} colours -> {dst}")
    if "--install" in sys.argv:
        old = (F.SRC_DIR / "x2" if x2 else F.SRC_DIR) / f"weapon_{name}.png"
        old.parent.mkdir(parents=True, exist_ok=True)
        bak = ROOT / "output/dv2fmt/work/weapons/pre-pixellab"
        bak.mkdir(parents=True, exist_ok=True)
        if old.exists() and not (bak / old.name).exists():
            shutil.copy(old, bak / old.name)
        shutil.copy(dst / f"weapon_{name}.png", old)
        print("installed", old, "(old copy in", bak, ")")


if __name__ == "__main__":
    main()
