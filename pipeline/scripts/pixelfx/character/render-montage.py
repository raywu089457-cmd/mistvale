# Compose the rig-hero montages from the exporter sheet + headless game captures.
#
#   python pipeline/scripts/pixelfx/character/render-montage.py
#
# Inputs (defaults):
#   output/pixelfx-heroes/shot-old/  capture of the legacy AI-sheet build   (render-ingame.mjs --tag old)
#   output/pixelfx-heroes/shot-new/  capture of the rig-sheet build         (render-ingame.mjs --tag new)
#   assets/heroes/legacy/archer.png/.json          old sheet
#   output/pixelfx-heroes/archer/archer.png/.json  new sheet
# Outputs:
#   output/pixelfx-heroes/compare.png  OLD vs NEW: sheet cells at 1x and 3x, in-game at 1x and 2x
#   output/pixelfx-heroes/ingame.png   NEW build in the village and the hunt zone at 3x
#
# Captured game shots are deviceScaleFactor 3, so they are divided by 3 first: the
# panels show real game pixels (1x) and a nearest-neighbour blow-up.

import argparse
import json
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))


def font(size):
    for p in ('C:/Windows/Fonts/arialbd.ttf', 'C:/Windows/Fonts/arial.ttf', 'C:/Windows/Fonts/consola.ttf'):
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except OSError:
                pass
    return ImageFont.load_default()


def load_sheet(png, meta_path):
    meta = json.load(open(meta_path, encoding='utf-8'))
    return Image.open(png).convert('RGBA'), meta


def cell(img, meta, act, i):
    a = meta['actions'][act]
    cols = a.get('cols', 1)
    c = a.get('cell', meta.get('cell', 100))
    x = (i % cols) * c
    y = a['y'] + (i // cols) * c
    return img.crop((x, y, x + c, y + c))


def shot(dirpath, name, k=3):
    im = Image.open(os.path.join(dirpath, name + '.png')).convert('RGBA')
    return im.resize((im.width // k, im.height // k), Image.NEAREST)


def zoom(im, k):
    return im.resize((im.width * k, im.height * k), Image.NEAREST)


class Board:
    def __init__(self, w, h, bg=(20, 18, 24, 255)):
        self.img = Image.new('RGBA', (w, h), bg)
        self.d = ImageDraw.Draw(self.img)

    def label(self, xy, s, size=14, fill=(236, 232, 244, 255), bg=(34, 30, 42, 255)):
        f = font(size)
        x, y = xy
        w = int(self.d.textlength(s, font=f))
        self.d.rectangle((x - 2, y - 2, x + w + 2, y + size + 3), fill=bg)
        self.d.text((x, y), s, font=f, fill=fill)

    def heading(self, xy, s, fill=(255, 208, 130, 255)):
        self.d.text(xy, s, font=font(18), fill=fill)

    def put(self, im, xy):
        self.img.alpha_composite(im, xy)


POSES = [('idle', 0), ('walk', 0), ('walk', 4), ('attack', 5), ('attack', 6),
         ('attackDown', 5), ('hurt', 1), ('death', 5), ('victory', 0)]
INGAME = [('village-idle', 'village: idle'), ('village-walk', 'village: walking'), ('hunt-attack', 'hunt zone: attack')]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--root', default=ROOT)
    ap.add_argument('--out-compare', default=None)
    ap.add_argument('--out-ingame', default=None)
    o = ap.parse_args()
    root = o.root
    px = os.path.join(root, 'output', 'pixelfx-heroes')
    oi, om = load_sheet(os.path.join(root, 'assets/heroes/legacy/archer.png'), os.path.join(root, 'assets/heroes/legacy/archer.json'))
    ni, nm = load_sheet(os.path.join(px, 'archer/archer.png'), os.path.join(px, 'archer/archer.json'))
    shot_old, shot_new = os.path.join(px, 'shot-old'), os.path.join(px, 'shot-new')
    out_compare = o.out_compare or os.path.join(px, 'compare.png')
    out_ingame = o.out_ingame or os.path.join(px, 'ingame.png')

    pad, lab, head = 8, 22, 34
    per_row = 3                       # pose pairs per row
    cw = 100
    pair1, pair3 = cw * 2 + pad, cw * 6 + pad

    rows = [POSES[i:i + per_row] for i in range(0, len(POSES), per_row)]
    a_h = len(rows) * (lab + cw + pad)
    b_h = len(rows) * (lab + cw * 3 + pad)
    ing = [(shot(shot_old, n), shot(shot_new, n), t) for n, t in INGAME]
    c_h = sum(max(a.height, b.height) + lab + pad for a, b, _ in ing)
    d_h = max(max(a.height, b.height) for a, b, _ in ing) * 2 + lab + pad
    W = pad + per_row * pair3 + pad
    H = pad + head + head + a_h + head + b_h + head + c_h + head + d_h + pad
    b = Board(W, H)

    y = pad
    b.heading((pad, y), 'Mistvale archer - OLD AI sheet vs NEW pixelfx rig sheet')
    y += head - 8
    b.label((pad, y), 'each pair: OLD (left)  NEW (right) - same cell, same pivot, same camera', 14)
    y += 26

    def cell_row(y, k):
        x = pad
        for act, i in rows_flat:
            o_c, n_c = cell(oi, om, act, i), cell(ni, nm, act, i)
            if k > 1:
                o_c, n_c = zoom(o_c, k), zoom(n_c, k)
            b.put(o_c, (x, y + lab))
            x += cw * k + 4
            b.put(n_c, (x, y + lab))
            b.label((x - cw * k - 4, y), '%s[%d]' % (act, i), 13)
            x += cw * k + pad * 2
        return y + lab + cw * k + pad

    b.heading((pad, y), 'A. sheet cells at 1x - the game draws the hero 21 world units tall (cell 100px)')
    y += 22
    for r in rows:
        rows_flat = r
        y = cell_row(y, 1)

    b.heading((pad, y + 4), 'B. same cells at 3x - outline / palette / anatomy')
    y += 26
    for r in rows:
        rows_flat = r
        y = cell_row(y, 3)

    b.heading((pad, y + 4), 'C. in the real game, identical camera and zoom (1x game pixels)')
    y += 26
    for a, c, t in ing:
        h = max(a.height, c.height)
        b.put(a, (pad, y + lab))
        b.label((pad, y), 'OLD - ' + t, 13)
        b.put(c, (pad + a.width + pad * 2, y + lab))
        b.label((pad + a.width + pad * 2, y), 'NEW - ' + t, 13)
        y += lab + h + pad

    b.heading((pad, y + 4), 'D. in the real game at 2x')
    y += 26
    x = pad
    for a, c, t in ing:
        b.put(zoom(a, 2), (x, y + lab))
        b.label((x, y), 'OLD', 13)
        x += a.width * 2 + pad
        b.put(zoom(c, 2), (x, y + lab))
        b.label((x, y), 'NEW', 13)
        x += c.width * 2 + pad * 3

    b.img.crop((0, 0, W, min(H, y + max(max(a.height, c.height) for a, c, _ in ing) * 2 + lab + pad))).save(out_compare)
    print('wrote', out_compare)

    # ---- ingame.png: the rig build in the game, at 3x ----
    tiles = [(shot(shot_new, n), t) for n, t in INGAME]
    tw = pad + sum(t.width * 3 + pad for t, _ in tiles)
    th = 30 + lab + max(t.height for t, _ in tiles) * 3 + pad
    g = Board(tw, th)
    g.heading((pad, pad), 'Mistvale archer (pixelfx rig sheet) in the real game - headless Chromium capture at 3x')
    x = pad
    for t, name in tiles:
        g.put(zoom(t, 3), (x, pad + 30 + lab))
        g.label((x, pad + 30), name, 14)
        x += t.width * 3 + pad
    g.img.save(out_ingame)
    print('wrote', out_ingame)


if __name__ == '__main__':
    main()
