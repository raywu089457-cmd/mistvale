"""Phase-1 costume previews: design lineup + donor-vs-ours comparison.

Reads the exporter's per-class previews under output/pixelfx-heroes/costumes/<class>/ and the donor-look
renders under output/pixelfx-heroes/donor/<class>/, composites the body cell with its weapon part cell the
same way the runtime does (identical cell offset), and lays them out on grey.
"""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))
COST = os.path.join(ROOT, 'output', 'pixelfx-heroes', 'costumes')
DONOR = os.path.join(ROOT, 'output', 'pixelfx-heroes', 'donor')
OUT = os.path.join(ROOT, 'output', 'pixelfx-heroes', 'costumes')
os.makedirs(OUT, exist_ok=True)

CLASSES = [('berserker', '狂戰士'), ('paladin', '聖騎士'), ('sorcerer', '魔法師'),
           ('archer', '弓箭手'), ('assassin', '刺客'), ('priest', '祭司')]
POSES = [('idle', 0, '待機'), ('walk', 4, '行走'), ('attack', 6, '出擊')]
# down-facing rows: the front view is what the game shows while walking toward the camera, so the costume
# read (face, stole, mask, chest strap) has to be judged there too.
FRONT = [('idleDown', 0, '待機(正)'), ('attackDown', 6, '出擊(正)')]
GREY = (108, 114, 122, 255)
INK = (18, 16, 14, 255)
GOLD = (232, 196, 106, 255)


def font(size):
    for p in (r'C:\Windows\Fonts\msjh.ttc', r'C:\Windows\Fonts\msjhbd.ttc', r'C:\Windows\Fonts\mingliu.ttc'):
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return ImageFont.load_default()


def load(cls, base):
    png = os.path.join(base, cls, cls + '.png')
    js = os.path.join(base, cls, cls + '.json')
    meta = json.load(open(js, encoding='utf-8'))
    body = Image.open(png).convert('RGBA')
    parts = []
    for p in meta.get('parts') or []:
        pp = os.path.join(base, cls, p['sheet'] + '.png')
        if os.path.exists(pp):
            parts.append((Image.open(pp).convert('RGBA'), json.load(open(os.path.join(base, cls, p['sheet'] + '.json'), encoding='utf-8'))))
    return body, meta, parts


def cell(cls, body, meta, parts, act, i):
    a = meta['actions'][act]
    i = min(i, a['frames'] - 1)
    c = meta['cell']
    sx, sy = (i % a.get('cols', 9)) * c, a['y'] + (i // a.get('cols', 9)) * c
    out = body.crop((sx, sy, sx + c, sy + c))
    for img, pm in parts:
        pa = pm['actions'].get(act)
        if not pa:
            continue
        pi = min(i, pa['frames'] - 1)
        px = (pi % pa.get('cols', 9)) * pm['cell']
        py = pa['y'] + (pi // pa.get('cols', 9)) * pm['cell']
        off = (pa.get('offset') or [[0, 0]] * pa['frames'])[pi]
        tile = img.crop((px, py, px + pm['cell'], py + pm['cell'])).resize((c, c), Image.NEAREST)
        out.alpha_composite(tile, (int(off[0]), int(off[1])))
    return out


def bbox_union(tiles):
    box = None
    for t in tiles:
        b = t.getbbox()
        if not b:
            continue
        box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
    return box


def lineup():
    k = 3
    c = 100
    pad, top, cap = 10, 62, 22  # top leaves a dedicated caption band for the class names
    colw = c * k + pad
    rowh = c * k + pad
    w = pad + colw * len(CLASSES)
    fk = 1.5
    h = top + rowh * len(POSES) + 14 + c + 40 + int(c * fk) + 26
    canvas = Image.new('RGBA', (w, h), GREY)
    d = ImageDraw.Draw(canvas)
    f_title, f_cap, f_cls = font(20), font(17), font(19)
    d.text((pad, 6), 'Mistvale 職業造型設計稿（pixelfx stock rig 渲染）', font=f_title, fill=INK)
    for name, cn in CLASSES:
        body, meta, parts = load(name, COST)
        x0 = pad + [n for n, _ in CLASSES].index(name) * colw
        # class name goes in its own band ABOVE the column, never on the first pose label
        d.text((x0 + 4, top - 30), cn, font=f_cls, fill=GOLD)
        tiles = []
        for r, (act, i, label) in enumerate(POSES):
            t = cell(name, body, meta, parts, act, i)
            tiles.append(t)
            y = top + r * rowh + 18
            canvas.alpha_composite(t.resize((c * k, c * k), Image.NEAREST), (x0 + 4, y))
            d.text((x0 + 8, y - 16), label, font=f_cap, fill=INK)
        # 1x row at the bottom: idle + walk at game scale
        yy = top + rowh * len(POSES) + 16
        d.text((x0 + 4, yy - 16), '1x', font=f_cap, fill=INK)
        for j, t in enumerate(tiles[:2]):
            canvas.alpha_composite(t, (x0 + 6 + j * (c + 4), yy))
        # front-facing rows at 1.5x (three cells must fit inside the column), so the chest/face read can be
        # judged as well as the profile
        fy = yy + c + 26
        fs_ = int(c * fk)
        d.text((x0 + 4, fy - 16), '正面 1.5x', font=f_cap, fill=INK)
        for j, (act, i, _lab) in enumerate(FRONT):
            ft = cell(name, body, meta, parts, act, i).resize((fs_, fs_), Image.NEAREST)
            canvas.alpha_composite(ft, (x0 + 2 + j * (fs_ + 1), fy))
    p = os.path.join(OUT, 'design-lineup.png')
    canvas.convert('RGB').save(p)
    print('wrote', p, canvas.size)


def donor_vs_ours():
    k = 3
    c = 100
    pad, top = 8, 26
    pairw = (c * k + pad) * 2 + 18
    w = pad + pairw * 3
    h = top + (c * k + pad) * 2 + 24
    canvas = Image.new('RGBA', (w, h), GREY)
    d = ImageDraw.Draw(canvas)
    f = font(16)
    d.text((pad, 4), '左：pixelfx 原廠造型　右：本次自創職業造型（同一 rig、同一調色盤步階）', font=font(18), fill=INK)
    for n, (name, cn) in enumerate(CLASSES):
        col = n % 3
        row = n // 3
        x0 = pad + col * pairw
        y0 = top + row * (c * k + pad)
        d.text((x0, y0 - 15), cn, font=f, fill=GOLD)
        db, dm, dp = load(name, DONOR)
        cb, cm, cp = load(name, COST)
        a = cell(name, db, dm, dp, 'idle', 0).resize((c * k, c * k), Image.NEAREST)
        b = cell(name, cb, cm, cp, 'idle', 0).resize((c * k, c * k), Image.NEAREST)
        canvas.alpha_composite(a, (x0, y0))
        canvas.alpha_composite(b, (x0 + c * k + pad, y0))
    p = os.path.join(OUT, 'donor-vs-ours.png')
    canvas.convert('RGB').save(p)
    print('wrote', p, canvas.size)


if __name__ == '__main__':
    lineup()
    if os.path.isdir(DONOR):
        donor_vs_ours()
