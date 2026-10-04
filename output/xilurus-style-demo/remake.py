# -*- coding: utf-8 -*-
"""remake.py — 不用我們任何原圖，純工具（程式）remake 出 Xilurus 的樣子。v2

v2 加的工程（目標追上他手工像素的精緻度）：
  1. 有機紋理 —— value noise + fBm，取代規則 Bayer 棋盤。地面／屋頂／樹冠都用它
  2. 葉團演算法 —— 半徑用 noise 擾動的「有機輪廓」，加上右上高光、下緣暗部、葉簇
  3. 建築細節庫 —— 多面茅草頂＋草紋筆觸＋屋簷陰影、木樑、窗框十字、門板、石造基座、煙囪石紋

原理不變：2:1 等角磚 + 他的 16 色盤 + 暗描邊。全部純 PIL，沒有任何輸入圖片。
"""
import os
import math
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.abspath(os.path.join(HERE, '..', 'asset-compare', 'raw'))

# ── 他的 16 色盤（從預覽圖量化）──────────────────────────────────────
OUT, OUT2 = (48, 20, 18), (85, 33, 32)                        # 描邊用暖深棕（他的不是純黑）
D1, D2, D3 = (85, 33, 32), (100, 39, 38), (152, 87, 80)      # 深棕系
R1, R2 = (145, 54, 39), (169, 93, 44)                        # 紅棕／木
T1, T2, T3 = (187, 134, 61), (196, 148, 89), (212, 166, 144) # 土黃／茅草
S1, S2, S3 = (141, 164, 171), (205, 215, 215), (226, 233, 233)
W1, W2 = (39, 54, 84), (91, 94, 110)                         # 深藍／灰藍
G1, G2, G3 = (36, 77, 22), (56, 100, 34), (92, 130, 52)     # 綠
WATER, WTR_L = (125, 199, 214), (168, 216, 226)
PINK, PINK_D = (212, 166, 144), (152, 87, 80)

BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]


def bayer(x, y):
    return (BAYER[y % 4][x % 4] + 0.5) / 16


# ── 1. 有機紋理：value noise + fBm ─────────────────────────────────
def _hash2(ix, iy, seed):
    n = (ix * 374761393 + iy * 668265263 + seed * 1442695041) & 0xFFFFFFFF
    n = (n ^ (n >> 13)) * 1274126177 & 0xFFFFFFFF
    return ((n ^ (n >> 16)) & 0xFFFFFFFF) / 0xFFFFFFFF


def vnoise(x, y, seed=0):
    xi, yi = math.floor(x), math.floor(y)
    xf, yf = x - xi, y - yi
    u, v = xf * xf * (3 - 2 * xf), yf * yf * (3 - 2 * yf)
    a, b = _hash2(xi, yi, seed), _hash2(xi + 1, yi, seed)
    c, d = _hash2(xi, yi + 1, seed), _hash2(xi + 1, yi + 1, seed)
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v


def fbm(x, y, octaves=4, seed=0):
    v, amp, freq, norm = 0.0, 1.0, 1.0, 0.0
    for o in range(octaves):
        v += amp * vnoise(x * freq, y * freq, seed + o * 17)
        norm += amp
        amp *= 0.5
        freq *= 2.0
    return v / norm


def pick(pal, t):
    """t in 0..1 → 色盤中的顏色。"""
    return pal[max(0, min(len(pal) - 1, int(t * len(pal))))]


# ── 2. 等角基礎 ───────────────────────────────────────────────────
TW, TH = 48, 24
OX, OY = 380, 58
GW = 13


def iso(x, y):
    return (OX + (x - y) * (TW // 2), OY + (x + y) * (TH // 2))


def diamond(d, cx, cy, w, h, fill=None, outline=None, width=1):
    d.polygon([(cx, cy - h // 2), (cx + w // 2, cy), (cx, cy + h // 2), (cx - w // 2, cy)],
              fill=fill, outline=outline, width=width)


def in_diamond(px_, py_, cx, cy, w, h):
    return abs(px_ - cx) / (w / 2) + abs(py_ - cy) / (h / 2) <= 1


def _in_poly(x, y, poly):
    n = len(poly); inside = False
    for i in range(n):
        x1, y1 = poly[i]; x2, y2 = poly[(i + 1) % n]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


def fbm_fill(img, poly, pal, scale=26.0, seed=1, light=0.0):
    """在多邊形內用 fBm 選色 —— 有機紋理，取代規則棋盤。light>0 偏亮（右上光源）。"""
    d = ImageDraw.Draw(img)
    xs = [p[0] for p in poly]; ys = [p[1] for p in poly]
    x0, x1 = int(min(xs)), int(max(xs)) + 1
    y0, y1 = int(min(ys)), int(max(ys)) + 1
    for y in range(y0, y1):
        for x in range(x0, x1):
            if not _in_poly(x, y, poly):
                continue
            n = fbm(x / scale, y / scale, 4, seed)
            t = min(1.0, max(0.0, n + light))
            d.point((x, y), fill=pick(pal, t))


def ground_tile(img, cx, cy, w, h, shades, seed=1, edge=None):
    """地面磚：fBm 有機紋理，不畫側面、不畫格線 —— 地面要是連續的。"""
    d = ImageDraw.Draw(img)
    diamond(d, cx, cy, w, h, fill=shades[0])
    poly = [(cx, cy - h // 2), (cx + w // 2, cy), (cx, cy + h // 2), (cx - w // 2, cy)]
    fbm_fill(img, poly, shades, scale=22.0, seed=seed)
    if edge:
        d.polygon(poly, fill=None, outline=edge)


def block(img, cx, cy, w, h, H, top_c, left_c, right_c, tex=None, tex_r=0.4, outline=True):
    """等角方塊：頂面菱形 + 左右兩個側面。"""
    d = ImageDraw.Draw(img)
    ty = cy - H
    d.polygon([(cx - w // 2, ty), (cx, ty + h // 2), (cx, ty + h), (cx - w // 2, ty + h // 2)], fill=left_c)
    d.polygon([(cx, ty + h // 2), (cx + w // 2, ty), (cx + w // 2, ty + h // 2), (cx, ty + h)], fill=right_c)
    diamond(d, cx, ty + h // 2, w, h, fill=top_c)
    if tex:
        fbm_fill(img, [(cx, ty - h // 2), (cx + w // 2, ty + h // 2), (cx, ty + h), (cx - w // 2, ty + h // 2)],
                 [top_c, tex], scale=18.0, seed=7)
    if outline:
        d.polygon([(cx - w // 2, ty), (cx, ty - h // 2), (cx + w // 2, ty)], fill=None, outline=OUT, width=2)
        d.line([(cx - w // 2, ty), (cx - w // 2, ty + h // 2), (cx, ty + h), (cx + w // 2, ty + h // 2),
                (cx + w // 2, ty)], fill=OUT, width=2)
        if H > 12:
            d.line([(cx, ty + h // 2), (cx, ty + h)], fill=OUT, width=2)


# ── 3. 葉團演算法：noise 擾動輪廓 + 高光 + 葉簇 ─────────────────────
def canopy(img, cx, cy, R, pal, hi, seed=3, squash=1.12):
    """有機樹冠：半徑 r(θ)=R(1+0.3*fbm)，右上高光、下緣暗部、邊緣葉簇。"""
    d = ImageDraw.Draw(img)
    span = int(R * 1.5) + 4
    mask = {}
    for y in range(cy - span, cy + span):
        for x in range(cx - span, cx + span):
            dx, dy = x - cx, y - cy
            ang = math.atan2(dy * squash, dx)
            rr = math.hypot(dx, dy * squash)
            edge_r = R * (1.0 + 0.30 * (fbm(math.cos(ang) * 1.7 + 5, math.sin(ang) * 1.7 + 5, 3, seed) - 0.5) * 2)
            if rr <= edge_r:
                mask[(x, y)] = (rr, edge_r, ang)
                # 明暗：右上亮、左下暗，靠邊緣再暗一階
                lit = (dx * 0.72 - dy * 0.7) / R
                shade = 0.5 + 0.5 * lit - 0.85 * (rr / edge_r) ** 2.4
                shade += 0.22 * (fbm(x / 11.0, y / 11.0, 3, seed + 40) - 0.5) * 2
                d.point((x, y), fill=pick(pal, max(0.0, min(0.999, shade))))
    for (x, y), (rr, edge_r, ang) in mask.items():          # 描邊一圈
        if (x + 1, y) not in mask or (x - 1, y) not in mask or (x, y + 1) not in mask or (x, y - 1) not in mask:
            d.point((x, y), fill=OUT)
    for k in range(3):                                       # 邊緣葉簇（葉子的顆粒感）
        ang = k * 2.1 + seed * 0.7
        hx = cx + int(math.cos(ang) * R * 0.72)
        hy = cy + int(math.sin(ang) * R * 0.72 / squash)
        for y in range(hy - 5, hy + 6):
            for x in range(hx - 5, hx + 6):
                if (x - hx) ** 2 + (y - hy) ** 2 <= 20:
                    t = 0.55 + 0.35 * (1 - ((x - hx) ** 2 + (y - hy) ** 2) / 20)
                    d.point((x, y), fill=pick(pal, max(0.0, min(0.999, t))))
    hR = int(R * 0.42)                                       # 右上高光斑
    for y in range(cy - int(R * 0.82), cy - int(R * 0.82) + hR):
        for x in range(cx + int(R * 0.12), cx + int(R * 0.12) + hR):
            if (x - (cx + int(R * 0.32))) ** 2 + (y - (cy - int(R * 0.62))) ** 2 <= (hR * 0.72) ** 2:
                d.point((x, y), fill=hi)


def tree(img, cx, cy, autumn=False):
    d = ImageDraw.Draw(img)
    if autumn:
        pal, hi, bark = [D2, R2, T1, T2, T3], (238, 205, 150), D2
    else:
        pal, hi, bark = [G1, G1, G2, G3, (122, 158, 74)], (150, 184, 96), D2
    d.polygon([(cx - 4, cy - 4), (cx - 5, cy - 42), (cx + 3, cy - 46), (cx + 5, cy - 4)], fill=bark)  # 樹幹（微彎）
    d.line([(cx - 4, cy - 4), (cx - 5, cy - 42)], fill=OUT, width=2)
    d.line([(cx + 5, cy - 4), (cx + 3, cy - 46)], fill=OUT, width=2)
    for yy in range(cy - 40, cy):                            # 樹幹明暗
        for xx in range(cx - 5, cx + 6):
            if abs(xx - cx) <= 3 and bayer(xx, yy) < .3:
                d.point((xx, yy), fill=D3)
    canopy(img, cx - 2, cy - 62, 26, pal, hi, seed=3)        # 主冠
    canopy(img, cx + 15, cy - 46, 18, pal, hi, seed=11)      # 側冠
    canopy(img, cx - 17, cy - 44, 16, pal, hi, seed=19)
    for yy in range(cy - 26, cy + 14):                       # 落影往左下
        for xx in range(cx - 44, cx - 2):
            if (xx - (cx - 20)) ** 2 * 0.7 + (yy - (cy + 4)) ** 2 * 2.4 <= 420 and bayer(xx, yy) < .42:
                d.point((xx, yy), fill=G1 if not autumn else D2)


def rock(img, cx, cy):
    d = ImageDraw.Draw(img)
    poly = [(cx - 15, cy + 2), (cx - 9, cy - 12), (cx + 2, cy - 17), (cx + 13, cy - 11),
            (cx + 16, cy + 2), (cx + 4, cy + 7), (cx - 7, cy + 6)]
    fbm_fill(img, poly, [S1, S1, S2, S2, S3], scale=10.0, seed=23, light=.12)
    d.polygon(poly, fill=None, outline=OUT, width=2)
    d.line([(cx - 9, cy - 12), (cx - 3, cy - 1), (cx + 13, cy - 11)], fill=S1, width=1)   # 稜線
    for x in range(cx - 8, cx + 9):                        # 底部暗部
        for y in range(cy + 1, cy + 7):
            if bayer(x, y) < .5:
                d.point((x, y), fill=S1)


def crate(img, cx, cy):
    d = ImageDraw.Draw(img)
    block(img, cx, cy, 28, 14, 18, T1, D3, D2, tex=D2, tex_r=.35)
    for k in (0, 1):                                       # 木板縫
        d.line([(cx - 14 + k * 9, cy - 16 + k * 4), (cx + 2 + k * 9, cy - 9 + k * 4)], fill=OUT, width=1)
    d.line([(cx - 14, cy - 8), (cx, cy - 1), (cx + 14, cy - 8)], fill=OUT, width=1)


def fence(img, cx, cy):
    d = ImageDraw.Draw(img)
    for dx in (-18, -2, 14):
        d.rectangle([cx + dx - 3, cy - 24, cx + dx + 3, cy], fill=R2, outline=OUT, width=2)
        d.line([(cx + dx - 1, cy - 22), (cx + dx - 1, cy - 2)], fill=T2, width=1)
    d.rectangle([cx - 18, cy - 21, cx + 17, cy - 16], fill=R2, outline=OUT, width=2)
    d.rectangle([cx - 18, cy - 11, cx + 17, cy - 6], fill=R2, outline=OUT, width=2)


# ── 4. 建築細節庫 ─────────────────────────────────────────────────
def gable_roof(img, cx, cy, w, h, Ht, rh, dark, mid, lit):
    """人字形茅草頂：兩斜面 + 兩端山形牆 + 草紋筆觸 + 屋簷陰影。"""
    d = ImageDraw.Draw(img)
    ty = cy - Ht
    A, B, C, D = (cx, ty - h // 2), (cx + w // 2, ty), (cx, ty + h // 2), (cx - w // 2, ty)
    R1 = (cx - w // 4, ty - h // 4 - rh)
    R2 = (cx + w // 4, ty + h // 4 - rh)
    d.polygon([D, C, R2, R1], fill=dark)                    # 前左斜面（暗）
    d.polygon([A, B, R2, R1], fill=lit)                     # 後右斜面（亮）
    d.polygon([A, D, R1], fill=mid)                         # 後端山形牆
    d.polygon([B, C, R2], fill=mid)                         # 前端山形牆
    fbm_fill(img, [D, C, R2, R1], [dark, dark, mid, mid], scale=15.0, seed=31, light=-.06)
    fbm_fill(img, [A, B, R2, R1], [mid, mid, lit, lit], scale=15.0, seed=37, light=.10)
    fbm_fill(img, [A, D, R1], [mid, mid, lit], scale=13.0, seed=41, light=.02)
    fbm_fill(img, [B, C, R2], [mid, mid, lit], scale=13.0, seed=43, light=.02)
    for k in range(7):                                      # 草紋筆觸：沿斜面方向
        t = .08 + k * .13
        for slope, (P, Q), col in ((0, (D, R1), dark), (0, (C, R2), dark), (1, (A, R1), lit), (1, (B, R2), lit)):
            x0 = P[0] + (Q[0] - P[0]) * t
            y0 = P[1] + (Q[1] - P[1]) * t
            x1 = P[0] + (Q[0] - P[0]) * (t + .07)
            y1 = P[1] + (Q[1] - P[1]) * (t + .07)
            d.line([(x0, y0), (x1, y1)], fill=col, width=1)
    d.line([R1, R2], fill=lit, width=3)                     # 屋脊高光
    d.line([(D[0], D[1] + 2), (C[0], C[1] + 2)], fill=OUT, width=3)   # 屋簷陰影
    d.line([(A[0], A[1] + 2), (B[0], B[1] + 2)], fill=OUT, width=3)
    for poly in ([D, C, R2, R1], [A, B, R2, R1], [A, D, R1], [B, C, R2]):
        d.polygon(poly, fill=None, outline=OUT, width=2)


def building(img, cx, cy, roof_dark, roof_mid, roof_lit, h_wall=58, w=74):
    d = ImageDraw.Draw(img)
    hw, hh = w // 2, w // 4
    # 石造基座
    base = [(cx - hw, cy - 10), (cx, cy + hh - 10), (cx + hw, cy - 10), (cx, cy - hh - 10)]
    fbm_fill(img, base, [S1, S2, S3], scale=11.0, seed=53, light=.08)
    d.polygon(base, fill=None, outline=OUT, width=2)
    # 牆
    block(img, cx, cy, w, hh * 2, h_wall, PINK, PINK_D, (183, 136, 89), tex=D3, tex_r=.22)
    fbm_fill(img, [(cx - hw, cy - h_wall), (cx, cy + hh - h_wall), (cx + hw, cy - h_wall), (cx, cy - hh - h_wall)],
             [PINK_D, PINK, PINK, (226, 190, 172)], scale=17.0, seed=59, light=.06)
    for k in range(3):                                      # 垂直木樑
        d.line([(cx - hw + 8 + k * (w - 16) // 2, cy - h_wall + 4), (cx - hw + 8 + k * (w - 16) // 2, cy - 8)],
               fill=D2, width=3)
    d.line([(cx - hw + 3, cy - 22), (cx + hw - 3, cy - 22)], fill=D2, width=3)   # 橫樑
    # 門
    d.rectangle([cx - 15, cy - 30, cx - 1, cy - 2], fill=D1, outline=OUT, width=2)
    d.line([(cx - 10, cy - 29), (cx - 10, cy - 3)], fill=D2, width=1)
    d.point((cx - 4, cy - 16), fill=T3)
    # 窗（框＋十字＋玻璃）
    for wx in (cx + 8,):
        d.rectangle([wx, cy - 36, wx + 17, cy - 21], fill=W1, outline=OUT, width=2)
        d.rectangle([wx + 2, cy - 34, wx + 15, cy - 23], fill=S2)
        d.line([(wx + 8, cy - 34), (wx + 8, cy - 23)], fill=OUT, width=1)
        d.line([(wx + 2, cy - 28), (wx + 15, cy - 28)], fill=OUT, width=1)
    # 屋頂
    gable_roof(img, cx, cy, w + 30, (w + 30) // 2, h_wall, 32, roof_dark, roof_mid, roof_lit)
    # 煙囪（石紋）
    ch_x, ch_y = cx + w // 2 - 18, cy - h_wall - 44
    d.rectangle([ch_x, ch_y, ch_x + 14, cy - h_wall + 4], fill=W2, outline=OUT, width=2)
    fbm_fill(img, [(ch_x, ch_y), (ch_x + 14, ch_y), (ch_x + 14, cy - h_wall + 4), (ch_x, cy - h_wall + 4)],
             [W1, W2, S1], scale=8.0, seed=61, light=.10)
    d.rectangle([ch_x - 3, ch_y - 5, ch_x + 17, ch_y + 1], fill=W1, outline=OUT, width=2)


# ── 5. 場景 ───────────────────────────────────────────────────────
W_IMG, H_IMG = 760, 388
img = Image.new('RGB', (W_IMG, H_IMG), (131, 211, 227))
d = ImageDraw.Draw(img)

water = {(x, y) for x in range(GW) for y in range(GW) if 8 <= x - y <= 10 and x + y > 8}
grass = {(x, y) for x in range(GW) for y in range(GW) if x + y > 15 or x < 3}
stone = {(x, y) for x in range(GW) for y in range(GW) if abs(x - y - 2) <= 1 and x + y < 16}

for s in range(2 * GW):
    for x in range(GW):
        y = s - x
        if not (0 <= y < GW):
            continue
        cx, cy = iso(x, y)
        sd = x * 71 + y * 131
        if (x, y) in water:
            ground_tile(img, cx, cy, TW, TH, [(72, 132, 168), (96, 168, 196), WATER, WTR_L], seed=sd)
        elif (x, y) in grass:
            ground_tile(img, cx, cy, TW, TH, [G1, G2, G2, G3], seed=sd)
        elif (x, y) in stone:
            ground_tile(img, cx, cy, TW, TH, [S1, S1, S2, S3], seed=sd)
        else:
            ground_tile(img, cx, cy, TW, TH, [(160, 116, 70), T1, T1, T2, T3], seed=sd)

objs = [(3, 2, 'house', (D3, R1, R2)), (9, 2, 'house', (D2, T1, T2)),
        (2, 9, 'house', (D3, R2, T3)), (6, 6, 'tree', True), (11, 7, 'tree', False),
        (0, 5, 'tree', False), (7, 11, 'tree', True), (4, 12, 'rock', None),
        (10, 11, 'crate', None), (5, 3, 'fence', None), (12, 3, 'rock', None),
        (1, 12, 'crate', None), (8, 9, 'fence', None), (11, 12, 'tree', False),
        (6, 1, 'tree', True), (0, 9, 'rock', None), (4, 6, 'crate', None),
        (12, 8, 'fence', None), (2, 5, 'fence', None), (9, 12, 'rock', None),
        (5, 10, 'tree', True), (12, 12, 'tree', False), (0, 12, 'crate', None),
        (7, 4, 'crate', None), (1, 7, 'rock', None), (10, 5, 'fence', None),
        (3, 12, 'tree', False), (8, 1, 'crate', None), (6, 12, 'rock', None),
        (11, 9, 'tree', True), (2, 2, 'fence', None), (5, 7, 'crate', None),
        (9, 8, 'rock', None), (12, 5, 'tree', False), (4, 3, 'crate', None),
        (0, 3, 'tree', True), (7, 8, 'fence', None), (10, 2, 'crate', None)]
for x, y, kind, arg in sorted(objs, key=lambda o: o[0] + o[1]):
    gx, gy = iso(x, y)
    if kind == 'house':
        building(img, gx, gy, *arg)
    elif kind == 'tree':
        tree(img, gx, gy, autumn=arg)
    elif kind == 'rock':
        rock(img, gx, gy)
    elif kind == 'crate':
        crate(img, gx, gy)
    elif kind == 'fence':
        fence(img, gx, gy)

scene = img.resize((W_IMG * 2, H_IMG * 2), Image.NEAREST)
scene.save(os.path.join(HERE, 'remake-iso-scene.png'))
print('remake-iso-scene.png', scene.size)

# ── 6. 圖磚表（4x3 密排）─────────────────────────────────────────
TW2, TH2 = 142, 71
cell_w, cell_h = 172, 132
sheet_w, sheet_h = cell_w * 4, cell_h * 3
sheet = Image.new('RGB', (sheet_w, sheet_h), (131, 211, 227))
ft = ImageFont.truetype(r'C:\Windows\Fonts\msyh.ttc', 20)
tiles = [('泥土', [(160, 116, 70), T1, T1, T2, T3]), ('草地', [G1, G2, G2, G3]),
         ('水面', [(72, 132, 168), (96, 168, 196), WATER, WTR_L]), ('石板', [S1, S1, S2, S3]),
         ('茅草', [T1, T1, T2, T2, T3]), ('紅牆', [PINK_D, PINK, PINK, (226, 190, 172)])]
for i, (name, shades) in enumerate(tiles):
    cx = cell_w * (i % 4) + cell_w // 2
    cy = cell_h * (i // 4) + cell_h // 2 - 4
    ground_tile(sheet, cx, cy, TW2, TH2, shades, seed=100 + i * 13, edge=OUT)
    ImageDraw.Draw(sheet).text((cx - 20, cy + 52), name, font=ft, fill=(20, 30, 40))
for j, kind in enumerate(['tree', 'tree', 'rock', 'crate', 'house', 'fence']):
    i = 6 + j
    cx = cell_w * (i % 4) + cell_w // 2
    gy = cell_h * (i // 4) + cell_h - 26
    if kind == 'tree':
        tree(sheet, cx, gy, autumn=(j % 2 == 0))
    elif kind == 'rock':
        rock(sheet, cx, gy)
    elif kind == 'crate':
        crate(sheet, cx, gy)
    elif kind == 'fence':
        fence(sheet, cx, gy)
    else:
        building(sheet, cx, gy, D3, R1, R2, h_wall=52, w=64)
    ImageDraw.Draw(sheet).text((cx - 22, gy + 12), {'tree': '樹', 'rock': '石', 'crate': '木箱',
                                                    'house': '茅草屋', 'fence': '柵欄'}[kind],
                               font=ft, fill=(20, 30, 40))
sheet = sheet.resize((sheet_w * 2, sheet_h * 2), Image.NEAREST)
sheet.save(os.path.join(HERE, 'remake-tiles.png'))
print('remake-tiles.png', sheet.size)

# ── 7. 對比照 ─────────────────────────────────────────────────────
CW, CH, GAP, PAD, HEAD = 700, 520, 20, 20, 132
f_t = ImageFont.truetype(r'C:\Windows\Fonts\msyhbd.ttc', 40)
f_n = ImageFont.truetype(r'C:\Windows\Fonts\msyhbd.ttc', 23)
f_s = ImageFont.truetype(r'C:\Windows\Fonts\msyh.ttc', 17)
panels = [
    (Image.open(os.path.join(RAW, 'cand', 'xilurus_c.png')), '① Xilurus 原圖（目標）', '他的成品：等角村莊場景', (240, 200, 90)),
    (scene, '② 我們 remake 的場景 v2', 'fBm 有機紋理＋葉團演算法＋建築細節', (86, 200, 130)),
    (Image.open(os.path.join(RAW, 'cand', 'xilurus_b.png')), '③ Xilurus 建築（目標）', '他的成品：茅草屋＋石塔＋木料', (240, 200, 90)),
    (sheet, '④ 我們 remake 的圖磚 v2', '同色盤，紋理改成 noise 生成', (86, 200, 130)),
]
Wf = PAD * 2 + 2 * CW + GAP
Hf = HEAD + 2 * CH + GAP + 70
out = Image.new('RGB', (Wf, Hf), (18, 24, 36))
ds = ImageDraw.Draw(out)
ds.text((PAD, 28), 'remake v2：有機紋理＋葉團＋建築細節', font=f_t, fill=(240, 244, 250))
ds.text((PAD, 80), '純 PIL，沒有任何輸入圖片。地面／屋頂／樹冠改用 value noise + fBm，取代規則棋盤。',
        font=f_s, fill=(168, 180, 198))
for i, (p, name, sub, badge) in enumerate(panels):
    cx = PAD + (i % 2) * (CW + GAP)
    cy = HEAD + (i // 2) * (CH + GAP)
    im = p.convert('RGB')
    sc = min(CW / im.width, CH / im.height)
    im = im.resize((int(im.width * sc), int(im.height * sc)), Image.LANCZOS)
    l, t = (CW - im.width) // 2, (CH - im.height) // 2
    out.paste(im, (cx + l, cy + t))
    ds.rectangle([cx, cy + CH, cx + CW, cy + CH + 70], fill=(31, 41, 58))
    ds.line([cx, cy + CH, cx + CW, cy + CH], fill=(58, 74, 99), width=2)
    ds.text((cx + 12, cy + CH + 8), name, font=f_n, fill=(240, 244, 250))
    ds.text((cx + 12, cy + CH + 40), sub, font=f_s, fill=badge)
out.save(os.path.join(HERE, 'compare-remake.png'))
print('compare-remake.png', out.size)
