# montage.py — T63: labeled contact sheet of every UI screen (2026-11-05).
# Reads output/ui-audit/uiux-1105/manifest.json (written by shots-uixx.mjs) and writes
# montage-desktop.png / montage-phone.png, each at most 3000 px on its long side.
# Layout: hud/worldmap as a 2-up full-tile row on top, the other screens in N columns below;
# every tile has its screen name printed above it. N is picked (2..8) for the largest scale.
# Note: 21 full-height phone tiles under a 3000 px cap cap the scale near 0.53, so modal text
# lands around 5-6 px; the card's ~10 px target would need a bigger cap or split files.
import json
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', 'output', 'ui-audit', 'uiux-1105'))
MANIFEST = os.path.join(ROOT, 'manifest.json')
CAP = 3000
PAD = 18
GAP = 10
LABEL_H = 20
FONT_PATH = 'C:/Windows/Fonts/arialbd.ttf'
FONT = ImageFont.truetype(FONT_PATH, 14)


def label_width(text):
    box = ImageDraw.Draw(Image.new('RGB', (1, 1))).textbbox((0, 0), text, font=FONT)
    return box[2] - box[0]


def load(tiles):
    out = []
    for t in tiles:
        with Image.open(os.path.join(ROOT, t['file'])) as im:
            out.append(dict(t, w=im.width, h=im.height))
    return out


def layout(full, mods, n):
    """Return (scale, width, height, rows, cellw) for this column count."""
    def measure(s):
        cellw = max(max(t['w'] * s for t in mods), max(label_width(t['label']) + 6 for t in mods)) if mods else 0
        bandw = sum(t['w'] * s for t in full) + GAP * max(0, len(full) - 1)
        bandh = max((t['h'] * s for t in full), default=0)
        rows = []
        for i in range(0, len(mods), n):
            row = mods[i:i + n]
            rows.append(max(t['h'] * s for t in row))
        gridw = n * cellw + GAP * max(0, n - 1)
        gridh = sum(h + LABEL_H + GAP for h in rows)
        W = PAD * 2 + max(bandw, gridw)
        H = PAD * 2 + (LABEL_H + bandh + GAP + 8 if full else 0) + gridh
        return W, H, rows, cellw

    lo, hi = 0.02, 1.0
    if measure(hi)[0] <= CAP and measure(hi)[1] <= CAP:
        s = hi
    else:
        for _ in range(40):
            mid = (lo + hi) / 2
            W, H, _, _ = measure(mid)
            if W <= CAP and H <= CAP:
                lo = mid
            else:
                hi = mid
        s = lo
    W, H, rows, cellw = measure(s)
    return s, W, H, rows, cellw


def build(mode, tiles):
    tiles = load(tiles)
    full = [t for t in tiles if t['kind'] == 'full']
    mods = [t for t in tiles if t['kind'] != 'full']
    candidates = []
    for n in range(2, 9):
        s, W, H, rows, cellw = layout(full, mods, n)
        candidates.append((s, n, W, H, rows, cellw))
        print(f'  {mode} N={n}: scale={s:.3f} -> {int(round(W))}x{int(round(H))}')
    s, n, W, H, rows, cellw = max(candidates, key=lambda c: (c[0], -c[3]))
    W, H = int(round(W)), int(round(H))
    canvas = Image.new('RGB', (W, H), (26, 21, 18))
    draw = ImageDraw.Draw(canvas)

    def put(t, x, y, sw, sh):
        im = Image.open(os.path.join(ROOT, t['file'])).convert('RGB').resize((sw, sh), Image.LANCZOS)
        draw.text((x, y + 3), t['label'], font=FONT, fill=(238, 220, 178))
        y += LABEL_H
        canvas.paste(im, (x, y))
        draw.rectangle([x, y, x + sw - 1, y + sh - 1], outline=(92, 74, 52))
        return y + sh

    # 2-up full-tile row
    y = PAD
    if full:
        x = PAD
        for t in full:
            sw, sh = round(t['w'] * s), round(t['h'] * s)
            put(t, x, y, sw, sh)
            x += sw + GAP
        y += LABEL_H + round(max(t['h'] for t in full) * s) + GAP + 8
    # modal grid
    cellw = round(cellw)
    for r in range(0, len(mods), n):
        row = mods[r:r + n]
        rh = max(t['h'] for t in row)
        for i, t in enumerate(row):
            sw, sh = round(t['w'] * s), round(t['h'] * s)
            put(t, PAD + i * (cellw + GAP), y, sw, sh)
        y += LABEL_H + round(rh * s) + GAP
    out = os.path.join(ROOT, f'montage-{mode}.png')
    canvas.save(out, optimize=True)
    print(f'{mode}: s={s:.3f} N={n} {W}x{H} (long side {max(W, H)}), '
          f'smallest modal text ~{11 * s:.1f}px (11px CSS base), labels 14px -> {out}')


manifest = json.load(open(MANIFEST, encoding='utf-8'))
for mode in ('desktop', 'phone'):
    if mode not in manifest['modes']:
        print(f'missing mode {mode}')
        continue
    build(mode, manifest['modes'][mode]['tiles'])
