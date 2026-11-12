"""Turn the PixelLab bare-body walks (2x pixels) into native 74x74 strips.

    python pipeline/scripts/pixellab/barebody_sheets.py <char_dir> <out_dir> down=<dir>[:skip] up=<dir>[:skip] right=<dir>[:skip]

Each <dir> holds frame-NN.png; ":skip" drops that many leading frames (v3 walks store the rotation
as frame 00, skeleton-v3 walks do not). The sources may have different canvases (v3 148px,
skeleton-v3 160px): every frame is halved (majority colour of each 2x2 block, transparent when 2+ of
the 4 are transparent), then cut into a 74x74 cell centred on the canvas with the direction's foot
line at y=FOOT, so all directions stand on the same line. left = mirrored right.
Writes barebody-walk-{down,up,right,left}.png (8 frames in a row), walk-4dir.png (rows down/up/
right/left) and barebody-idle-4dir.png (the 128px rotations, same foot line).
"""
import sys
import numpy as np
from pathlib import Path
from PIL import Image, ImageOps

CELL, FOOT = 74, 63
char, out = Path(sys.argv[1]), Path(sys.argv[2])
src = {}
for arg in sys.argv[3:]:
    name, spec = arg.split('=', 1)
    path, _, skip = spec.partition(':')
    src[name] = (Path(path), int(skip or 0))
out.mkdir(parents=True, exist_ok=True)


def half(im):
    a = np.asarray(im.convert('RGBA'))
    h, w = a.shape[0] // 2, a.shape[1] // 2
    blk = a[:h * 2, :w * 2].reshape(h, 2, w, 2, 4).transpose(0, 2, 1, 3, 4).reshape(h, w, 4, 4)
    res = np.zeros((h, w, 4), np.uint8)
    for y in range(h):
        for x in range(w):
            op = blk[y, x][blk[y, x][:, 3] > 0]
            if len(op) < 2:
                continue
            keys = [tuple(p) for p in op]
            res[y, x] = max(set(keys), key=keys.count)
    return Image.fromarray(res)


def cells(frames):
    """Cut halved frames into CELL x CELL, canvas-centred, with the shared foot line at FOOT."""
    foot = max(f.getbbox()[3] for f in frames)              # one past the lowest opaque row
    x0 = frames[0].width // 2 - CELL // 2
    y0 = foot - 1 - FOOT
    return [f.crop((x0, y0, x0 + CELL, y0 + CELL)) for f in frames]


strips = {}
for name in ('down', 'up', 'right'):
    d, skip = src[name]
    files = sorted(d.glob('frame-*.png'))[skip:skip + 8]
    assert len(files) == 8, f'{name}: {len(files)} frames in {d}'
    fr = cells([half(Image.open(f)) for f in files])
    s = Image.new('RGBA', (CELL * 8, CELL))
    for i, f in enumerate(fr):
        s.paste(f, (i * CELL, 0))
    strips[name] = s
strips['left'] = Image.new('RGBA', strips['right'].size)
for i in range(8):
    strips['left'].paste(ImageOps.mirror(strips['right'].crop((i * CELL, 0, (i + 1) * CELL, CELL))), (i * CELL, 0))
order = ['down', 'up', 'right', 'left']
for n in order:
    strips[n].save(out / f'barebody-walk-{n}.png')
sheet = Image.new('RGBA', (CELL * 8, CELL * 4))
for j, n in enumerate(order):
    sheet.paste(strips[n], (0, j * CELL))
sheet.save(out / 'walk-4dir.png')

rot = {'down': 'south', 'up': 'north', 'right': 'east', 'left': 'west'}
idle = Image.new('RGBA', (CELL * 4, CELL))
for i, n in enumerate(order):
    r = half(Image.open(char / f'rotation-{rot[n]}.png'))
    bb = r.getbbox()
    r = r.crop(bb)
    idle.paste(r, (i * CELL + (CELL - r.width) // 2, FOOT + 1 - r.height), r)
idle.save(out / 'barebody-idle-4dir.png')
feet = {n: max(strips[n].crop((i * CELL, 0, (i + 1) * CELL, CELL)).getbbox()[3] for i in range(8)) - 1 for n in order}
print('cell', CELL, '| foot line per direction', feet, '| idle', idle.size)
