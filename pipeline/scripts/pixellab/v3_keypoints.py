"""Per-frame skeletons of the AI bare body v3 (PixelLab estimate-skeleton, 0.1 generation per frame),
in the native 74x74 cell coordinates of output/pixellab-barebody/sheets-v3 (same crop as barebody_sheets.py).

    PIXELLAB_TOKEN=... python pipeline/scripts/pixellab/v3_keypoints.py [out_json]

Sources (2x): down = walk-skel/south frame-00..07 (160), up = walk-skel/north (160),
right = walk-v2/east frame-01..08 (148), idle = char-v2/rotation-{south,north,east}.png (128).
left = right mirrored in the cell with RIGHT/LEFT labels swapped (a mirrored right-facing body is a
left-facing body whose near side is its LEFT). Cached per image in <out_json>.raw.json, so re-runs are free.
Output: {cell: 74, foot: 63, directions: {down: {idle: [...], walk: [[...] x8]}, ...}}, joints {label, x, y}
in native pixels (x right, y down, continuous; pixel (i, j) covers [i, i+1) x [j, j+1)).
"""
import sys, json, importlib.util
import numpy as np
from pathlib import Path
from PIL import Image

spec = importlib.util.spec_from_file_location('pl', str(Path.home() / '.claude/skills/pixellab-assets/scripts/pixellab.py'))
pl = importlib.util.module_from_spec(spec); spec.loader.exec_module(pl)
B = Path('output/pixellab-barebody')
out = Path(sys.argv[1] if len(sys.argv) > 1 else B / 'v3-keypoints.json')
raw_path = Path(str(out) + '.raw.json')
raw = json.loads(raw_path.read_text()) if raw_path.exists() else {}
CELL, FOOT = 74, 63

def estimate(path):
    key = Path(path).as_posix()
    if key not in raw:
        r = pl.post('/estimate-skeleton', {'image': {'type': 'base64', 'base64': pl.b64(path)}})
        raw[key] = r['keypoints']
        raw_path.write_text(json.dumps(raw, indent=1))
    return raw[key]

def half_bbox_bottom(im):
    a = np.asarray(im.convert('RGBA'))[..., 3] > 0
    h, w = a.shape[0] // 2, a.shape[1] // 2
    blk = a[:h * 2, :w * 2].reshape(h, 2, w, 2).sum(axis=(1, 3)) >= 2     # same rule as the sheets' majority downsample
    ys, xs = np.where(blk)
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1

SRC = {'down': [B / f'walk-skel/south/frame-{i:02d}.png' for i in range(8)],
       'up': [B / f'walk-skel/north/frame-{i:02d}.png' for i in range(8)],
       'right': [B / f'walk-v2/east/frame-{i:02d}.png' for i in range(1, 9)]}
ROT = {'down': 'south', 'up': 'north', 'right': 'east'}
res = {'cell': CELL, 'foot': FOOT, 'source': 'PixelLab estimate-skeleton on the 2x frames', 'directions': {}}
for d, files in SRC.items():
    ims = [Image.open(f) for f in files]
    W, H = ims[0].size
    foot = max(half_bbox_bottom(im)[3] for im in ims)          # one past the lowest opaque native row
    x0, y0 = (W // 2) // 2 - CELL // 2, foot - 1 - FOOT
    walk = []
    for f in files:
        kp = estimate(f)
        walk.append([{'label': k['label'], 'x': round(k['x'] * W / 2 - x0, 2), 'y': round(k['y'] * H / 2 - y0, 2)} for k in kp])
    # idle: rotation (128, 2x) halved, cropped to its bbox, placed centred with the feet on FOOT (barebody_sheets.py)
    rp = B / f'char-v2/rotation-{ROT[d]}.png'
    rim = Image.open(rp); bx0, by0, bx1, by1 = half_bbox_bottom(rim)
    rw, rh = bx1 - bx0, by1 - by0
    ox, oy = (CELL - rw) // 2 - bx0, FOOT + 1 - rh - by0
    kp = estimate(rp)
    idle = [{'label': k['label'], 'x': round(k['x'] * 128 / 2 + ox, 2), 'y': round(k['y'] * 128 / 2 + oy, 2)} for k in kp]
    res['directions'][d] = {'idle': idle, 'walk': walk, 'crop': {'x0': int(x0), 'y0': int(y0), 'src_canvas': W}}
swap = lambda l: l.replace('RIGHT', '#').replace('LEFT', 'RIGHT').replace('#', 'LEFT')
mir = lambda fr: [{'label': swap(j['label']), 'x': round(CELL - j['x'], 2), 'y': j['y']} for j in fr]
r = res['directions']['right']
res['directions']['left'] = {'idle': mir(r['idle']), 'walk': [mir(f) for f in r['walk']], 'mirrored_from': 'right'}
out.write_text(json.dumps(res, indent=1))
print('wrote', out, {d: (len(v['idle']), len(v['walk'])) for d, v in res['directions'].items()})
