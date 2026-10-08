"""build_hero.py — 一個英雄的全套動作生圖 → 128×128 一格的像素 sprite sheet(sprites/SPRITE_VISUAL_BIBLE.md 第 9 節規格)。

用法:python pipeline/scripts/heroes/build_hero.py archer
輸入:output/l0veyou/<hero>-<action>-v1.png(洋紅底,格線見 ACTIONS)
輸出:assets/heroes/<hero>.png(每列一個動作、每格 128×128、1:1 像素、透明底)、assets/heroes/<hero>.json(動作/格數/每格秒數/錨點/色盤)、
      assets/heroes/<hero>-fx.png/.json(技能特效格)

步驟:
 1. 去背(沿用 sheet_to_atlas.key_out)→ 依格線切成等大格 → 每格取主體(最大連通塊 + 靠近它的碎塊,例如箭、特效)。
 2. 每張表找一格「站姿基準格」,用它的高度把整張表縮到跟待機同一個倍率(模型每張表畫的大小不一樣)。
 3. 縮成真像素畫:待機高 = HERO_H 美術像素;整個英雄共用一份 ≤16 色色盤(從待機表取),不抖動;外圈淺色改深色描邊。
 4. 放進 128 格:軀幹中心 x = 64;腳底 y = 118 + (該格在原表裡離地的高度)— 跳躍格會往上。
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / "output" / "l0veyou"
OUT = ROOT / "assets" / "heroes"
sys.path.insert(0, str(ROOT / "pipeline" / "scripts" / "l0veyou"))
sys.path.insert(0, str(ROOT / "pipeline" / "scripts" / "xilurus"))
from sheet_to_atlas import key_out  # noqa: E402
from assemble import torso_x, normalize_outline  # noqa: E402

CELL, FOOT_Y, HERO_H, COLORS = 128, 118, 72, 16
# 動作:(格線 cols×rows, 實際格數, 站姿基準格 index, 每格秒數)
ACTIONS = {
    "idle": ((4, 1), 4, 0, .22),
    "walk": ((6, 1), 6, 2, .1),
    "attack": ((4, 2), 8, 0, .075),
    "skill": ((5, 2), 10, 9, .08),   # 基準格:最後的備戰站姿
    "hurt": ((3, 1), 3, 2, .1),
    "death": ((3, 2), 6, 0, .12),
    "victory": ((4, 1), 4, 3, .15),
}
# 背面 3/4(往右上走):一張 5x2 表 = 待機 4 + 走路 6。(來源檔後綴, 格線, 起始格, 格數, 基準格, 每格秒數)
# 四方向(上下左右):右 = 側面動作列;下 = 正面(面向鏡頭)、上 = 正背面,各一張 5x2(待機 4 + 走路 6,來源 dir-<名>-down/up);
# 左 = 右的鏡像,直接烘成 idleLeft/walkLeft 列(素材本身就有四個方向)。(來源後綴, 格線, 起始格, 格數, 基準格, 每格秒數)
BACK = {"idleDown": ("down", (5, 2), 0, 4, 0, .22), "walkDown": ("down", (5, 2), 4, 6, 2, .1),
        "idleUp": ("up", (5, 2), 0, 4, 0, .22), "walkUp": ("up", (5, 2), 4, 6, 2, .1)}
LEFT = ("idle", "walk")
# 魔物(同一套規格,動作少一點):來源檔 output/l0veyou/mon3-<魔物>-<動作>-v1.png。
# 美術大小跟英雄同一個像素密度:英雄 72 px = 遊戲 21 單位 → 魔物待機最長邊 = ENEMY_SIZE(遊戲單位)× 72/21。
MON_ACTIONS = {"idle": ((4, 1), 4, 0, .2), "walk": ((6, 1), 6, 0, .1), "attack": ((4, 2), 8, 7, .075), "hurt": ((3, 1), 3, 2, .1), "death": ((3, 2), 6, 0, .12)}
MON_SIZE = {"slime": 28, "wolf": 31, "golem": 33, "treant": 50}
# 攻擊/技能的關鍵格(遊戲對時間用):出手、命中
KEY = {"attack": {"release": 4, "impact": 5}, "skill": {"release": 4}}


def cut(path: Path, grid, keep_all=False):
    """去背 → 等分格 → 每格主體(含跟主體距離 ≤ 6% 格寬的碎塊)→ (RGBA crop, 主體底在格內的 y)。"""
    im = Image.open(path).convert("RGB")
    rgb, alpha = key_out(im)
    cols, rows = grid
    H, W = alpha.shape
    cw, ch = W / cols, H / rows
    fg = alpha > 0
    def cuts(occ, n, size):
        """模型不會剛好畫在等分格上:每條分界線在等分位置 ±40% 格寬內找「前景最少」的那一欄/列。"""
        out = [0]
        for i in range(1, n):
            lo, hi = int((i - .4) * size), int((i + .4) * size)
            w = occ[lo:hi]; m = np.nonzero(w == w.min())[0]   # 最少前景的欄可能是一整段空隙 → 取最寬那段的中間
            runs = np.split(m, np.nonzero(np.diff(m) > 1)[0] + 1); best = max(runs, key=len)
            out.append(lo + int(best[len(best) // 2]))
        return out + [len(occ)]
    ry = cuts(fg.sum(1), rows, ch)
    frames = []
    for r in range(rows):
        y0, y1 = ry[r], ry[r + 1]
        rx = cuts(fg[y0:y1].sum(0), cols, cw)
        for c in range(cols):
            x0, x1 = rx[c], rx[c + 1]
            a = alpha[y0:y1, x0:x1] > 0
            lab, n = ndimage.label(a)
            if not n:
                frames.append(None); continue
            sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
            main = int(np.argmax(sizes)) + 1
            near = ndimage.binary_dilation(lab == main, iterations=int(cw * .08))
            keep = np.isin(lab, [i + 1 for i in range(n) if sizes[i] >= 6 and (keep_all or (near & (lab == i + 1)).any())])
            ys, xs = np.nonzero(keep)
            if ys.min() == 0 or xs.min() == 0 or ys.max() == a.shape[0] - 1 or xs.max() == a.shape[1] - 1:
                print(f"  WARN {path.name} cell {r},{c}: subject touches the cell edge")
            crop = np.dstack([rgb[y0:y1, x0:x1], np.where(keep, 255, 0).astype(np.uint8)])[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
            frames.append((Image.fromarray(crop, "RGBA"), ys.max()))
    return frames


def body_h(im: Image.Image) -> float:
    m = np.asarray(im)[..., 3] > 127; w = m.shape[1]; t = torso_x(im); lo, hi = int(max(0, t - .12 * w)), int(min(w, t + .12 * w) + 1)
    ys = np.nonzero(m[:, lo:hi].any(1))[0]
    return float(ys.max() - ys.min() + 1)


IDLE_ACTS = ("idle", "idleDown", "idleUp")


# 呼吸/起伏的變形場(做法參考 aldegad/sprite-gen effects/breathe.py 的「envelope」,Apache-2.0,這裡是重寫):
# 不切開重貼(切一刀把上半身上移會在切口複製出一條線,例如魔像腰間黑縫變粗帶),而是每一列一個連續強度 g(y):
# 頭部(RIGID 以上)g=0 逐像素不變,往下經 TAPER 漸強,到腳底 FOOT 段再降回 0(腳不離地);
# 每列高 sy=1/(1+g)、寬 sx=1+g(面積守恆),全部整數列/欄對應,不內插 → 還是乾淨的像素畫。
RIGID = {"slime": 0.0, "wolf": .3, "golem": .3, "treant": .35}   # 英雄(Q 版頭大)預設 .42
TAPER, FOOT = .055, .18


def warp(im: Image.Image, sy, sx) -> Image.Image:
    """每列(來源)高 sy[y]、寬 sx[y](以軀幹軸為中心)→ 底部對齊的新圖;最近鄰整數對應。"""
    a = np.asarray(im); H, W = a.shape[:2]; sy = np.asarray(sy, float); sx = np.asarray(sx, float)
    edges = np.concatenate([[0], np.cumsum(sy[::-1])])            # 從底往上累積
    Ho = int(round(edges[-1])); pad = int(np.ceil(np.abs(sx - 1).max() * W / 2)) + 1
    out = np.zeros((Ho, W + 2 * pad, 4), np.uint8); ax = torso_x(im); oxs = np.arange(W + 2 * pad) + .5
    for j in range(Ho):                                            # j = 從底數第幾列
        r = H - 1 - min(H - 1, int(np.searchsorted(edges, j + .5) - 1))
        src = np.floor(ax + (oxs - pad - ax) / sx[r]).astype(int); ok = (src >= 0) & (src < W)
        out[Ho - 1 - j, ok] = a[r, src[ok]]
    ys, xs = np.nonzero(out[..., 3]);
    return Image.fromarray(out[:, xs.min():xs.max() + 1] if len(xs) else out, "RGBA")


def envelope(H: int, rigid: float) -> np.ndarray:
    u = (np.arange(H) + .5) / H
    return np.clip((u - rigid) / TAPER, 0, 1) * np.clip((1 - u) / FOOT, 0, 1)


def add_motion(act: str, pix, hop: bool, rigid: float = .42):
    """市面像素遊戲的基本律動:待機 4 格吸氣(軀幹變高變窄,頭不動)0→半→滿→半;正/背面走路在兩腳最靠攏的經過格小腿伸長 ~3%、跨步格貼地。"""
    h = max(p.height for p, _ in pix)
    if act in IDLE_ACTS:
        out = []
        for i, (p, lift) in enumerate(pix):
            g = -.065 * (0, .5, 1, .5)[i % 4] * envelope(p.height, rigid)
            out.append((warp(p, 1 / (1 + g), 1 + g) if g.any() else p, lift))
        return out
    if act in ("walkDown", "walkUp") and not hop:
        spread = []
        for p, _ in pix:
            m = np.asarray(p)[..., 3] > 0; low = m[int(m.shape[0] * .88):]; xs = np.nonzero(low.any(0))[0]
            spread.append(xs.max() - xs.min() if len(xs) else 0)
        lo, hi, D = min(spread), max(spread), max(1, round(h * .03))
        bob = [round(D * (hi - v) / (hi - lo)) for v in spread] if hi - lo >= 2 else [0, round(D / 2), D] * (len(pix) // 3) + [0] * (len(pix) % 3)
        out = []
        for i, (p, lift) in enumerate(pix):
            u = (np.arange(p.height) + .5) / p.height; band = (u > .58) & (u < .86)   # 大腿下段到小腿:伸長量平均分散,不複製單一列
            sy = np.where(band, 1 + bob[i] / max(1, band.sum()), 1.0)
            out.append((warp(p, sy, np.ones(p.height)) if bob[i] else p, lift))
        return out
    return pix


# 模型漏畫的身上花紋:{魔物: (有花紋的參考列, [要補的列])}。狼的走路表整列沒畫背上的紅色鬃毛,同一隻狼換動作就變另一隻。
MARKINGS = {"wolf": ("idle", ["walk"])}


def _is_mark(rgb):
    r, g, b = [rgb[..., i].astype(int) for i in range(3)]
    return (r - g > 38) & (r - b > 50)


def transfer_marking(ref: Image.Image, dst: Image.Image) -> Image.Image:
    """參考格每一欄(依外框左右比例對齊)從背上輪廓往下幾 px 是花紋 → 在目標格同比例的欄、同深度,把毛色依亮度換成花紋色。"""
    ra, da = np.asarray(ref), np.asarray(dst).copy()
    rm, dm = ra[..., 3] > 0, da[..., 3] > 0
    mark = _is_mark(ra[..., :3]) & rm
    if not mark.any(): return dst
    marks = ra[..., :3][mark]; lum = marks.sum(1)
    rx = np.nonzero(rm.any(0))[0]; dx = np.nonzero(dm.any(0))[0]
    for x in range(dx.min(), dx.max() + 1):
        u = (x - dx.min()) / max(1, dx.max() - dx.min()); xr = int(round(rx.min() + u * (rx.max() - rx.min())))
        col = mark[:, xr]; ys = np.nonzero(rm[:, xr])[0]
        if not col.any() or not len(ys): continue
        top = ys.min(); my = np.nonzero(col)[0]; d0, d1 = my.min() - top, my.max() - top
        dys = np.nonzero(dm[:, x])[0]
        if not len(dys): continue
        for y in range(dys.min() + max(1, d0), min(dys.min() + d1 + 1, da.shape[0])):
            if not dm[y, x]: continue
            px = da[y, x, :3].astype(int)
            if px.sum() < 120: continue   # 描邊/眼睛不改
            da[y, x, :3] = marks[np.argmin(np.abs(lum - px.sum()))]
    return Image.fromarray(da, "RGBA")


def palette(ims, n=COLORS):
    px = np.concatenate([np.asarray(i).reshape(-1, 4) for i in ims]); px = px[px[:, 3] > 127][:, :3]
    side = int(np.ceil(np.sqrt(len(px)))); buf = np.zeros((side * side, 3), np.uint8); buf[:len(px)] = px
    return Image.fromarray(buf.reshape(side, side, 3)).quantize(n, method=Image.Quantize.MEDIANCUT, kmeans=2)


def pixelize(im: Image.Image, s: float, pal) -> Image.Image:
    w, h = max(1, round(im.width * s)), max(1, round(im.height * s))
    a = np.asarray(im.resize((w, h), Image.LANCZOS)).copy()
    alpha = np.where(a[..., 3] >= 110, 255, 0).astype(np.uint8)
    rgb = np.asarray(Image.fromarray(a[..., :3]).quantize(palette=pal, dither=Image.Dither.NONE).convert("RGB"))
    out = Image.fromarray(np.dstack([rgb, alpha]), "RGBA")
    cols_ = np.asarray(pal.getpalette()[:COLORS * 3]).reshape(-1, 3)
    dark = tuple(int(v) for v in min(cols_, key=lambda c: c.sum()))
    out = normalize_outline(out, dark=dark, thr=105)
    # 描邊改完可能多出色盤外的顏色?不會:dark 本來就在色盤裡
    return out


# 模組化換色的材質組:16 色是整隻角色共用的,頭髮/皮膚/皮革都是暖棕色會共用同一個色票,自動分組不可靠。
# 每個職業只開放「色相獨佔」的兩組:outfit(職業代表色布料:色相 ± 容差、飽和度下限)與 metal(低飽和亮色:鎧甲、刀刃)。
SWAP = {"archer": (115, 30, .25), "berserker": (358, 12, .6), "ranger": (108, 25, .2), "paladin": (220, 25, .35), "sorcerer": (305, 35, .2), "priest": (50, 30, .3), "darkknight": (358, 12, .5)}


def material_groups(hero: str, cols) -> dict:
    import colorsys
    hue, tol, smin = SWAP[hero]; dark = int(np.argmin(np.asarray(cols).sum(1))); g = {"outfit": [], "metal": []}
    for i, c in enumerate(cols):
        h, l, s_ = colorsys.rgb_to_hls(*(np.asarray(c) / 255)); h *= 360
        if i == dark: continue
        if min(abs(h - hue), 360 - abs(h - hue)) <= tol and s_ >= smin and .08 < l < .92: g["outfit"].append(i)
        elif s_ < .14 and l > .3: g["metal"].append(i)
    return g


def build(hero: str, monster: bool = False):
    OUT.mkdir(parents=True, exist_ok=True)
    acts, src = (MON_ACTIONS, f"mon3-{hero}") if monster else (ACTIONS, hero)
    raw = {a: cut(SRC / f"{src}-{a}-v1.png", g) for a, (g, n, base, fps) in acts.items()}
    plan = [(a, g, n, base, fps, raw[a][:n]) for a, (g, n, base, fps) in acts.items()]
    dcache = {}
    for a, (d, g, st, n, base, fps) in BACK.items():
        f = SRC / f"dir-{hero}-{d}-v1.png"
        if not f.exists(): continue
        if d not in dcache: dcache[d] = cut(f, (5, 2))
        plan.append((a, g, n, base, fps, dcache[d][st:st + n]))
    idle0 = raw["idle"][0][0]
    s_idle = {'priest': 80, 'darkknight': 80}.get(hero, HERO_H) / idle0.height if not monster else MON_SIZE[hero] * 72 / 21 / max(idle0.size)
    pal = palette([f[0] for f in raw["idle"] if f])
    meta = {"hero": hero, "heroHeight": HERO_H, "footFromBottom": CELL - FOOT_Y, "actions": {}}
    rows, y_off = [], 0
    for act, grid, n, base, fps, fr in plan:
        if act in BACK and any(f is None for f in fr):  # 生圖偶爾少畫一格:拿前一格補
            fr = list(fr)
            for i, f in enumerate(fr):
                if f is None and i > 0 and fr[i - 1] is not None: fr[i] = fr[i - 1]
                elif f is None and any(g is not None for g in fr): fr[i] = next(g for g in fr if g is not None)
        if any(f is None for f in fr): sys.exit(f"{act}: empty cell")
        # 整張表同一個倍率(模型每張畫的大小不同):用「軀幹欄身高」(軀幹中心 ±12% 寬的欄,舉過頭的武器、伸出去的弓不算)對齊待機
        # 魔物(四足、矮胖):用外框最長邊對齊(軀幹欄身高對狼蹲低的格會量小、整列被放大 1.5 倍)
        # 正/背面的魔物用高度對齊(正面的狼比側面窄,最長邊會量小)
        # 正/背面:用整列高度的中位數(單一基準格可能剛好畫矮,例如法師背面走路第 3 格帽尖彎下 → 其他格全被放大 10px)
        if act == "idle": s = s_idle
        elif monster: s = s_idle * (idle0.height / float(np.median([f[0].height for f in fr])) if act in BACK else max(idle0.size) / max(fr[base][0].size))
        else: s = s_idle * body_h(idle0) / (float(np.median([body_h(f[0]) for f in fr])) if act in BACK else body_h(fr[base][0]))
        # 地面線:同一個格線列(row band)裡最低的腳 —— bottom 是相對該列上緣量的,不同列不能比
        cols_ = grid[0] if act not in BACK else n + 1   # 背面表:待機/走路各自一段,地面線不用分列(腳一律貼地)
        ground = {r: max(b for _, b in fr[r * cols_:(r + 1) * cols_]) for r in range(max(1, len(fr) // cols_ + 1)) if fr[r * cols_:(r + 1) * cols_]}
        # 走路/待機/受擊:腳一律貼地(模型把經過格整隻畫高 5–9px,會變成浮空滑步;身體起伏由腿長自然產生)。跳躍只留給技能/勝利。
        grounded = act in ("idle", "walk", "hurt", "attack", *BACK) and not (monster and hero == "slime" and act.startswith("walk"))   # 史萊姆走路是跳躍
        # 待機:模型常把其中一格整隻畫大 10–28px(播放時會「跳一下」)→ 每格各自縮到跟基準格同大,呼吸感改由 breathe() 統一做。
        if act in IDLE_ACTS:
            meas = (lambda im: im.height if act in BACK else max(im.size)) if monster else body_h
            scales = [s * meas(fr[base][0]) / meas(im) for im, _ in fr]
            # 姿勢不同的格(狼抬頭、史萊姆整隻拉高)縮放後高度還差 >6% → 換成基準格,不然一樣會跳
            href = fr[base][0].height * scales[base]
            swap = [abs(im.height * scales[i] - href) > .06 * href for i, (im, _) in enumerate(fr)]
            fr = [fr[base] if swap[i] else f for i, f in enumerate(fr)]
            scales = [scales[base] if swap[i] else scales[i] for i in range(len(fr))]
            if any(swap): print(f"  {act}: frame {[i for i, w in enumerate(swap) if w]} -> base frame (pose/size jump)")
        else: scales = [s * {('darkknight', 'hurt'): .94}.get((hero, act), 1)] * len(fr)
        pix = [(pixelize(im, scales[i], pal), 0 if grounded else round((ground[i // cols_] - bottom) * s)) for i, (im, bottom) in enumerate(fr)]
        pix = add_motion(act, pix, monster and hero == "slime", RIGID.get(hero, .42) if monster else .42)
        # 格大小:預設 128;這一列有格放不下(跳躍、技能特效、長弓)就整列用 160 —— 錨點(軀幹中心、腳底離格底 10px)不變,不裁切也不位移身體
        def fits(c):
            return all(round(c / 2 - torso_x(p)) >= 2 and round(c / 2 - torso_x(p)) + p.width <= c - 2 and c - (CELL - FOOT_Y) - p.height - lift >= 2 for p, lift in pix)
        cell = next((c for c in (CELL, 160, 192, 224, 256) if fits(c)), 256)
        rows.append((act, cell, y_off, pix)); meta["actions"][act] = {"y": y_off, "cell": cell, "frames": n, "frameTime": fps, **KEY.get(act, {})}
        y_off += cell
    if monster and hero in MARKINGS:
        src_act, targets = MARKINGS[hero]; ref = next(r for r in rows if r[0] == src_act)[3][0][0]
        for r in rows:
            if r[0] in targets: r[3][:] = [(transfer_marking(ref, p), lift) for p, lift in r[3]]
    # 走路一輪身體該前進多少美術像素(遊戲依實際移動距離推進走路格,腳才不會打滑):
    # 跨步格兩腳外緣距離 × 1.7(扣掉腳掌寬,一輪兩步);史萊姆是跳,一跳 ≈ 0.6 個身長。正/背面走路沿用側面的值。
    walk_pix = next(r for r in rows if r[0] == "walk")[3]
    spread = [int(np.ptp(np.nonzero(np.asarray(p)[-4:, :, 3].any(0))[0])) for p, _ in walk_pix]
    cycle = round(max(spread) * (.6 if monster and hero == "slime" else 1.7))
    for a in meta["actions"]:
        if a.startswith("walk"): meta["actions"][a]["cycle"] = cycle
    # 左:側面待機/走路的鏡像列(以格中線為軸,軀幹錨點不動)
    left_rows = []
    for act in LEFT:
        a0 = next(r for r in rows if r[0] == act); _, cell, y_src, pix = a0
        left_rows.append((act, cell, y_src, y_off, len(pix)))
        meta["actions"][act + "Left"] = {**meta["actions"][act], "y": y_off}; y_off += cell
    sheet = Image.new("RGBA", (max(c * len(p) for _, c, _, p in rows), y_off), (0, 0, 0, 0))
    for act, cell, y0, pix in rows:
        foot = cell - (CELL - FOOT_Y)
        for i, (px, lift) in enumerate(pix):
            x = round(cell / 2 - torso_x(px)); y = foot - px.height - lift
            if x < 2 or y < 2 or x + px.width > cell - 2: print(f"  WARN {act}{i}: does not fit {cell} cell")
            sheet.alpha_composite(px, (i * cell + max(0, x), y0 + max(0, y)))
        if cell != CELL: print(f"  {act}: cell {cell}")
    for act, cell, y_src, y_dst, n in left_rows:   # 左向列 = 右向那格整格鏡像(逐像素對稱)
        for i in range(n):
            sheet.paste(ImageOps.mirror(sheet.crop((i * cell, y_src, (i + 1) * cell, y_src + cell))), (i * cell, y_dst))
    # 模組化配件:每格的頭頂錨點(格內座標)= 軀幹中線 ±12% 欄裡最上面一列不透明像素的中心。倒地/技能翻滾這類頭不在上面的格記 null(不戴配件)。
    if not monster:
        arr = np.asarray(sheet)
        for act, cell, y0, pix in rows:
            heads = []
            for i in range(len(pix)):
                f = arr[y0:y0 + cell, i * cell:(i + 1) * cell, 3] > 0
                lo, hi = int(cell / 2 - .12 * cell), int(cell / 2 + .12 * cell)
                ys = np.nonzero(f[:, lo:hi].any(1))[0]
                if not len(ys): heads.append(None); continue
                top = int(ys.min()); xs = np.nonzero(f[top:top + 4, lo:hi].any(0))[0] + lo
                foot = cell - (CELL - FOOT_Y); upright = foot - top >= HERO_H * .8   # 頭頂離腳底至少 0.8 身高才算站著
                heads.append([round(float(xs.mean()), 1), top] if upright and act not in ("death", "skill") else None)
            meta["actions"][act]["head"] = heads
            if act in LEFT:   # 左向列是整格鏡像 → 錨點 x 也鏡像
                meta["actions"][act + "Left"]["head"] = [[round(cell - h[0], 1), h[1]] if h else None for h in heads]
    meta["palette"] = ["#%02x%02x%02x" % tuple(c) for c in np.asarray(pal.getpalette()[:COLORS * 3]).reshape(-1, 3)]
    if not monster: meta["groups"] = material_groups(hero, np.asarray(pal.getpalette()[:COLORS * 3]).reshape(-1, 3))
    else: meta["monster"] = True; meta["size"] = MON_SIZE[hero]; meta["artSize"] = round(max(rows[0][3][0][0].size))
    if "groups" in meta: print("  groups:", {k: len(v) for k, v in meta["groups"].items()})
    out = OUT if not monster else ROOT / "assets" / "monsters3"; out.mkdir(parents=True, exist_ok=True)
    sheet.save(out / f"{hero}.png", optimize=True)
    (out / f"{hero}.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{hero}: {sheet.size}, palette {len(meta['palette'])}, idle scale {s_idle:.3f}")
    fx = SRC / f"{hero}-fx-v1.png"
    if fx.exists() and not monster:
        fr = cut(fx, (4, 2)); fpal = palette([f[0] for f in fr if f], 12)
        FX = 64; fsheet = Image.new("RGBA", (FX * len(fr), FX), (0, 0, 0, 0))
        for i, (im, _) in enumerate(fr):
            s = (FX - 8) / max(im.size); p = pixelize(im, s, fpal)
            fsheet.alpha_composite(p, (i * FX + (FX - p.width) // 2, (FX - p.height) // 2))
        fsheet.save(OUT / f"{hero}-fx.png", optimize=True)
        (OUT / f"{hero}-fx.json").write_text(json.dumps({"cell": FX, "frames": len(fr)}, indent=1), encoding="utf-8")   # 每格用途見 make_heroes_v3.py fx_frames / pixel-world.js SKILL_FX
        print(f"{hero}-fx: {fsheet.size}")


def accessories():
    """頭部配件(模組化 Accessory 槽):acc-head-v1.png 4x2 → assets/heroes/accessories.png(每格 32,美術像素密度跟英雄一樣:寬 ≈ 頭寬)。"""
    names = ["crown", "laurel", "flowerCrown", "ribbon", "feather", "tiara", "halo", "horns"]
    fr = cut(SRC / "acc-head-v1.png", (4, 2), keep_all=True); C = 32; sheet = Image.new("RGBA", (C * len(names), C), (0, 0, 0, 0)); meta = {"cell": C, "items": {}}
    for i, (im, _) in enumerate(fr):
        s_ = 24 / max(im.size); p = pixelize(im, s_, palette([im], 12))
        x, y = (C - p.width) // 2, C - 2 - p.height; sheet.alpha_composite(p, (i * C + x, y))
        meta["items"][names[i]] = {"i": i, "w": p.width, "h": p.height}
    OUT.mkdir(parents=True, exist_ok=True); sheet.save(OUT / "accessories.png"); (OUT / "accessories.meta").write_text(json.dumps(meta, indent=1), encoding="utf-8")
    print("accessories:", list(meta["items"]))


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "accessories": accessories(); sys.exit()
    # python build_hero.py <hero>   或   python build_hero.py monster <slime|wolf|golem|treant>
    if len(sys.argv) > 2 and sys.argv[1] == "monster": build(sys.argv[2], monster=True)
    else: build(sys.argv[1] if len(sys.argv) > 1 else "archer")
