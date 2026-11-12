"""Snap a generated pixel-art turnaround (several figures in a row on a flat background) back to native pixels.

    python pipeline/scripts/l0veyou/snap_turnaround.py <image> <out_dir> [names=south,north,east,west] [colors=12] [period_lo period_hi]

period_lo/hi bound the grid search (default 9-15); pass the reference's period +-1 when flat areas
(a robe) make a harmonic win.

Per figure: estimate its own grid period/offset from colour edges (GPT images drift between figures),
map pixels to a shared k-means palette, take the majority colour of each cell's centre, and save a
transparent native-resolution PNG per figure plus <out_dir>/snap-preview.png (8x, side by side).
"""
import sys, json
import numpy as np
from pathlib import Path
from PIL import Image

src, out = Path(sys.argv[1]), Path(sys.argv[2])
names = (sys.argv[3] if len(sys.argv) > 3 else 'south,north,east,west').split(',')
ncol = int(sys.argv[4]) if len(sys.argv) > 4 else 12
PLO, PHI = (float(sys.argv[5]), float(sys.argv[6])) if len(sys.argv) > 6 else (9.0, 15.0)
out.mkdir(parents=True, exist_ok=True)
a = np.asarray(Image.open(src).convert('RGB')).astype(np.int32)
H, W, _ = a.shape
flat = a.reshape(-1, 3)
vals, counts = np.unique(flat // 4, axis=0, return_counts=True)
bg = vals[counts.argmax()] * 4 + 2
mask = np.abs(a - bg).sum(axis=2) > 36

# figures = runs of columns that contain foreground
cols = mask.sum(axis=0) > 2
runs, x = [], 0
while x < W:
    if cols[x]:
        s = x
        while x < W and cols[x]: x += 1
        if x - s > 4: runs.append((s, x))
    x += 1
# a held weapon can stand a few pixels away from the body: merge runs closer than 48 px
merged = []
for r in runs:
    if merged and r[0] - merged[-1][1] < 48: merged[-1] = (merged[-1][0], r[1])
    else: merged.append(r)
runs = [r for r in merged if r[1] - r[0] > 20]
assert len(runs) == len(names), f'found {len(runs)} figures, expected {len(names)}'

# shared palette: k-means over foreground pixels
rng = np.random.default_rng(0)
fg = a[mask].astype(float)
cent = fg[rng.choice(len(fg), ncol, replace=False)]
for _ in range(25):
    lab = ((fg[:, None, :] - cent[None]) ** 2).sum(2).argmin(1)
    cent = np.array([fg[lab == k].mean(0) if (lab == k).any() else cent[k] for k in range(ncol)])
pal = np.round(cent).astype(int)

def period(prof, lo=None, hi=None):
    lo, hi = lo or PLO, hi or PHI
    best = (0, None, None)
    for p in (np.arange(lo, hi, 0.05) if hi - lo >= 0.05 else [lo]):   # lo == hi: fixed period (match another image)
        for o in np.arange(0, p, 0.25):
            idx = np.floor(np.arange(o, len(prof) - 1, p)).astype(int)
            lift = prof[idx].sum() / max(prof.sum(), 1) * p
            if lift > best[0]: best = (lift, p, o)
    return best

report, sprites = {}, []
for name, (x0, x1) in zip(names, runs):
    ys = np.where(mask[:, x0:x1].any(axis=1))[0]
    y0, y1 = ys.min(), ys.max() + 1
    m = 6
    cx0, cx1, cy0, cy1 = max(0, x0 - m), min(W, x1 + m), max(0, y0 - m), min(H, y1 + m)
    c = a[cy0:cy1, cx0:cx1]
    dx = (np.abs(np.diff(c, axis=1)).sum(2) > 40).sum(0).astype(float)
    dy = (np.abs(np.diff(c, axis=0)).sum(2) > 40).sum(1).astype(float)
    lx, px, ox = period(dx)
    ly, py, oy = period(dy)
    p = PLO if PHI - PLO < 0.05 else ((px + py) / 2 if abs(px - py) < 1.0 else (px if lx > ly else py))   # square pixels: share one period
    # re-fit offsets for the shared period
    ox = max(np.arange(0, p, 0.25), key=lambda o: dx[np.floor(np.arange(o, len(dx) - 1, p)).astype(int)].sum())
    oy = max(np.arange(0, p, 0.25), key=lambda o: dy[np.floor(np.arange(o, len(dy) - 1, p)).astype(int)].sum())
    nx, ny = int((c.shape[1] - ox) // p), int((c.shape[0] - oy) // p)
    img = np.zeros((ny, nx, 4), np.uint8)
    for j in range(ny):
        for i in range(nx):
            xa, xb = int(ox + 1 + (i + 0.25) * p), int(ox + 1 + (i + 0.75) * p)
            ya, yb = int(oy + 1 + (j + 0.25) * p), int(oy + 1 + (j + 0.75) * p)
            cell = c[ya:yb, xa:xb].reshape(-1, 3)
            cm = mask[cy0 + ya:cy0 + yb, cx0 + xa:cx0 + xb].reshape(-1)
            if cm.mean() < 0.5: continue
            lab = ((cell[cm][:, None, :] - pal[None]) ** 2).sum(2).argmin(1)
            k = np.bincount(lab, minlength=ncol).argmax()
            img[j, i, :3] = pal[k]; img[j, i, 3] = 255
    g = img[..., :3].astype(int); sat = g.max(2) - g.min(2)
    img[(img[..., 3] > 0) & (sat < 28) & (g.mean(2) > 120), 3] = 0          # light grey = background leftovers
    im = Image.fromarray(img)
    bb = im.getbbox(); im = im.crop(bb)
    im.save(out / f'{name}.png')
    sprites.append(im)
    report[name] = {'period': round(float(p), 2), 'lift': [round(float(lx), 2), round(float(ly), 2)], 'size': im.size}
    print(name, report[name])

Z = 8
pw = sum(s.width for s in sprites) * Z + 40 * (len(sprites) + 1)
ph = max(s.height for s in sprites) * Z + 80
prev = Image.new('RGB', (pw, ph), (200, 200, 200))
x = 40
for s in sprites:
    prev.paste(s.resize((s.width * Z, s.height * Z), Image.NEAREST), (x, ph - 40 - s.height * Z), s.resize((s.width * Z, s.height * Z), Image.NEAREST))
    x += s.width * Z + 40
prev.save(out / 'snap-preview.png')
json.dump({'source': str(src), 'palette': ['#%02x%02x%02x' % tuple(c) for c in pal], 'figures': report}, open(out / 'snap.json', 'w'), indent=1)
