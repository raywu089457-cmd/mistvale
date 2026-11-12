"""Place snapped outfit sprites exactly where the bare body stands, as first frames for animate-with-skeleton-v3.

    python pipeline/scripts/pixellab/outfit_first_frames.py <bare_snap_dir> <outfit_snap_dir> <out_dir>

For south/north/east: slide the outfit sprite over the bare sprite (feet on the same row) and keep the
x offset with the largest silhouette overlap (a bow or staff must not pull the body off-centre), then
scale 2x and put it where the bare rotation sits in its walk canvas: south/north 160px (rotation +16),
east 148px (rotation +10). Feet line: 2x rotation y=116 -> 132 / 126.
"""
import sys
import numpy as np
from pathlib import Path
from PIL import Image

bare_dir, outfit_dir, out = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
out.mkdir(parents=True, exist_ok=True)
CANVAS = {'south': (160, 16), 'north': (160, 16), 'east': (148, 10)}
bare_name = {'south': 'south-clean', 'north': 'north-clean', 'east': 'east-fixed'}
for d, (size, pad) in CANVAS.items():
    b = Image.open(bare_dir / f'{bare_name[d]}.png').convert('RGBA'); b = b.crop(b.getbbox())
    o = Image.open(outfit_dir / f'{d}.png').convert('RGBA'); o = o.crop(o.getbbox())
    bm = np.asarray(b)[..., 3] > 0
    om = np.asarray(o)[..., 3] > 0
    H = max(bm.shape[0], om.shape[0])
    best = None
    for dx in range(-om.shape[1], bm.shape[1] + 1):
        # feet rows aligned: bottom of both at row H-1
        W = bm.shape[1] + 2 * om.shape[1]
        A = np.zeros((H, W), bool); B = np.zeros((H, W), bool)
        A[H - bm.shape[0]:, om.shape[1]:om.shape[1] + bm.shape[1]] = bm
        x0 = om.shape[1] + dx
        if x0 < 0 or x0 + om.shape[1] > W: continue
        B[H - om.shape[0]:, x0:x0 + om.shape[1]] = om
        iou = (A & B).sum() / max((A | B).sum(), 1)
        if best is None or iou > best[0]: best = (iou, dx)
    iou, dx = best
    # bare sprite placement in the 128 rotation canvas: centred, feet at y=116 (2x)
    bx = (128 - b.width * 2) // 2
    big = o.resize((o.width * 2, o.height * 2), Image.NEAREST)
    can = Image.new('RGBA', (size, size))
    can.alpha_composite(big, (pad + bx + dx * 2, pad + 116 - big.height))
    can.save(out / f'{d}.png')
    print(d, 'overlap IoU %.2f' % iou, 'dx', dx, 'canvas', size, 'bbox', can.getbbox())
