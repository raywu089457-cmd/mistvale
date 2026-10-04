#!/usr/bin/env python
# lint_sprites.py — 圖集視覺體檢（可複現量測，不用目測）。
# 用法: python pipeline/scripts/check/lint_sprites.py [assets目錄=assets]
# 檢查每個 cell：
#   clip     非透明像素碰到格子邊 = 可能被切到（破圖）
#   frags    跟主體不相連的小碎塊（碎裂/殘渣）
#   holes    被主體包住的透明洞（去背沒去乾淨的洞）
#   residue  洋紅/綠底/藍底殘留像素
#   outline  剪影外緣像素中「暗色描邊」的比例（描邊一致性）
#   light    光源方向：剪影左半/右半、上半/下半平均亮度差（正＝左/上較亮）
# 輸出總表 + 每項超標的 cell 清單。
import sys, os, json, glob, math
from collections import deque
from PIL import Image

root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
adir = sys.argv[1] if len(sys.argv) > 1 else os.path.join(root, 'assets')

def load_manifest(png):
    m = png.replace('.png', '.manifest.json')
    if os.path.exists(m):
        with open(m, encoding='utf-8') as f:
            return json.load(f).get('cells', {})
    return None

def components(mask, w, h):
    seen = bytearray(w * h)
    comps = []
    for sy in range(h):
        for sx in range(w):
            i = sy * w + sx
            if not mask[i] or seen[i]:
                continue
            q = deque([(sx, sy)]); seen[i] = 1; cells = []
            while q:
                x, y = q.popleft(); cells.append((x, y))
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h:
                        j = ny * w + nx
                        if mask[j] and not seen[j]:
                            seen[j] = 1; q.append((nx, ny))
            comps.append(cells)
    return comps

def analyze(im, rect=None, name=''):
    if rect:
        im = im.crop((rect['x'], rect['y'], rect['x'] + rect['w'], rect['y'] + rect['h']))
    im = im.convert('RGBA')
    w, h = im.size
    px = im.load()
    alpha = [[px[x, y][3] > 8 for x in range(w)] for y in range(h)]
    flat = [alpha[y][x] for y in range(h) for x in range(w)]
    out = {'name': name, 'w': w, 'h': h, 'opaque': sum(flat)}
    if out['opaque'] < 4:
        out['empty'] = True
        return out
    # clip: 剪影被格子切斷 → 有一整邊大半是不透明（緊密打包的 bbox 本來就碰邊，看比例）
    sides = [sum(alpha[0][x] for x in range(w)) / w, sum(alpha[h - 1][x] for x in range(w)) / w,
             sum(alpha[y][0] for y in range(h)) / h, sum(alpha[y][w - 1] for y in range(h)) / h]
    out['clip'] = round(max(sides), 2)
    out['clipSides'] = [round(s, 2) for s in sides]
    # 主體/碎塊
    comps = components(flat, w, h)
    comps.sort(key=len, reverse=True)
    out['frags'] = sum(len(c) for c in comps[1:]) if len(comps) > 1 else 0
    out['fragCount'] = max(0, len(comps) - 1)
    # 洞：透明且不碰邊的連通區
    tmask = [not v for v in flat]
    holes = 0
    for c in components(tmask, w, h):
        if any(x in (0, w - 1) or y in (0, h - 1) for x, y in c):
            continue
        holes += len(c)
    out['holes'] = holes
    # 底色殘留（洋紅/純綠/純藍）
    res = 0
    for y in range(h):
        for x in range(w):
            if not alpha[y][x]:
                continue
            r, g, b, a = px[x, y]
            if (r > 180 and b > 180 and g < 110) or (g > 170 and r < 110 and b < 130) or (b > 170 and r < 110 and g < 140):
                res += 1
    out['residue'] = res
    # 描邊：剪影外緣的暗像素比例
    edge_px = []
    for y in range(h):
        for x in range(w):
            if not alpha[y][x]:
                continue
            if x in (0, w - 1) or y in (0, h - 1) or not alpha[y][x - 1] or not alpha[y][x + 1] or not alpha[y - 1][x] or not alpha[y + 1][x]:
                r, g, b, a = px[x, y]
                edge_px.append((r * 299 + g * 587 + b * 114) // 1000)
    out['outline'] = round(sum(1 for L in edge_px if L < 80) / max(1, len(edge_px)), 3)
    out['edgeN'] = len(edge_px)
    # 光源：主體亮度的左右/上下差（只算夠亮的主體像素）
    Lx = Lr = Ln = Ll = Lt = Lb = 0.0
    for y in range(h):
        for x in range(w):
            if not alpha[y][x]:
                continue
            r, g, b, a = px[x, y]
            L = (r * 299 + g * 587 + b * 114) / 1000
            if L < 40:
                continue
            Ln += 1; Lx += L * (1 if x < w / 2 else -1); Lr += L * (1 if y < h / 2 else -1)
            if x < w / 2: Ll += L
            else: Lr2 = L
    out['lightL'] = round(Lx / max(1, Ln), 1)   # 正＝左半較亮
    out['lightT'] = round(Lr / max(1, Ln), 1)   # 正＝上半較亮
    return out

TEXTURE = ('road.png', 'plaza.png', 'woodui.png', 'terrain-atlas.png', 'title.png', 'concept-grass.png', 'concept-earth.png', 'concept-stone.png')

def main():
    files = sorted(glob.glob(os.path.join(adir, '*.png')))
    rows = []
    for f in files:
        if '@2x' in f or '@4x' in f:
            continue
        im = Image.open(f)
        cells = load_manifest(f)
        base = os.path.basename(f)
        tex = base in TEXTURE
        if cells:
            for cid, rect in cells.items():
                r = analyze(im, rect, cid); r['tex'] = tex; rows.append((base + ':' + cid, r))
        else:
            r = analyze(im, None, base); r['tex'] = tex; rows.append((base, r))
    bad = []
    print(f'{"cell":44s} {"clip":>5s} {"frags":>6s} {"holes":>6s} {"resid":>6s} {"outl":>5s} {"lightL":>7s} {"lightT":>7s}')
    for name, r in rows:
        if r.get('empty'):
            continue
        flag = []
        if not r['tex'] and r['clip'] > 0.55: flag.append('CLIP')
        if r['frags'] > max(6, r['opaque'] * 0.01): flag.append('FRAG')
        if not r['tex'] and r['residue'] > 3: flag.append('RESIDUE')
        if r['holes'] > r['opaque'] * 0.06: flag.append('HOLES')
        if not r['tex'] and r['outline'] < 0.55: flag.append('NOOUTLINE')
        if abs(r['lightL']) > 12 and abs(r['lightT']) > 12:
            pass
        if flag: bad.append((name, flag, r))
        print(f'{name:44s} {r["clip"]:5.2f} {r["frags"]:6d} {r["holes"]:6d} {r["residue"]:6d} {r["outline"]:5.2f} {r["lightL"]:7.1f} {r["lightT"]:7.1f}  {" ".join(flag)}')
    print('\n== cells with issues ==')
    for name, flag, r in bad:
        print(f'{name:44s} {" ".join(flag)}')
    print(f'\ntotal cells {len(rows)}, flagged {len(bad)}')

main()
