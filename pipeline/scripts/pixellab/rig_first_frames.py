"""Put the AI bare body exactly on the pixelfx rig's idle silhouette, as PixelLab first frames.

    python pipeline/scripts/pixellab/rig_first_frames.py <rig_idle_4dir.png> <ai_snap_dir> <out_dir>

rig idle sheet: 76x76 cells, rows down/up/right/left. For down/up/right the AI sprite (south/north/east)
slides over the rig silhouette with the feet on the same row and keeps the x offset with the largest
overlap, then the 76 cell is doubled to 152 (PixelLab canvas, keypoints are fractions of 152).
Writes <out_dir>/{down,up,right}.png (152) and <out_dir>/{down,up,right}-cell.png (76, native).
"""
import sys
import numpy as np
from pathlib import Path
from PIL import Image

rig = Image.open(sys.argv[1]).convert('RGBA'); ai_dir = Path(sys.argv[2]); out = Path(sys.argv[3])
out.mkdir(parents=True, exist_ok=True)
for row, (d, n) in enumerate([('down', 'south'), ('up', 'north'), ('right', 'east')]):
    cell = rig.crop((0, row * 76, 76, row * 76 + 76))
    rm = np.asarray(cell)[..., 3] > 0
    ys, xs = np.where(rm); foot = ys.max()
    a = Image.open(ai_dir / f'{n}.png').convert('RGBA'); a = a.crop(a.getbbox())
    am = np.asarray(a)[..., 3] > 0
    best = None
    for x0 in range(0, 76 - a.width + 1):
        B = np.zeros((76, 76), bool); B[foot + 1 - a.height:foot + 1, x0:x0 + a.width] = am
        iou = (B & rm).sum() / max((B | rm).sum(), 1)
        if best is None or iou > best[0]: best = (iou, x0)
    iou, x0 = best
    c = Image.new('RGBA', (76, 76)); c.alpha_composite(a, (x0, foot + 1 - a.height))
    c.save(out / f'{d}-cell.png'); c.resize((152, 152), Image.NEAREST).save(out / f'{d}.png')
    print(d, 'IoU %.2f' % iou, 'x0', x0, 'foot row', foot, 'bbox', c.getbbox())
