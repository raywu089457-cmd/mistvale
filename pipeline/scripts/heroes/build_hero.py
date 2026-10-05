"""build_hero.py — 一個英雄的全套動作生圖 → 128×128 一格的像素 sprite sheet(ART_BIBLE.md 規格)。

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
# 四個斜角方向(等角):右下 = 動作名本身(3/4 正面)、右上 = <動作>Up(3/4 背面),來源 d4-<名>-<動作>-<dr|ur>-v1.png;
# 左下 <動作>Left、左上 <動作>UpLeft = 右邊同一格整格鏡像(烘進 sheet)。
BACK = {}
LEFT = None   # 每個動作(含 Up)都鏡像一份左向
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
SWAP = {"archer": (185, 30, .25), "berserker": (358, 12, .6), "ranger": (68, 25, .3), "paladin": (220, 25, .35), "sorcerer": (305, 35, .2)}


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
    acts = MON_ACTIONS if monster else ACTIONS
    raw = {a: cut(SRC / f"d4-{hero}-{a}-dr-v1.png", g) for a, (g, n, base, fps) in acts.items()}
    plan = [(a, g, n, base, fps, raw[a][:n]) for a, (g, n, base, fps) in acts.items()]
    plan += [(a + "Up", g, n, base, fps, cut(SRC / f"d4-{hero}-{a}-ur-v1.png", g)[:n]) for a, (g, n, base, fps) in acts.items()]
    dcache = {}
    for a, (d, g, st, n, base, fps) in BACK.items():
        f = SRC / f"dir-{hero}-{d}-v1.png"
        if not f.exists(): continue
        if d not in dcache: dcache[d] = cut(f, (5, 2))
        plan.append((a, g, n, base, fps, dcache[d][st:st + n]))
    idle0 = raw["idle"][0][0]
    s_idle = HERO_H / idle0.height if not monster else MON_SIZE[hero] * 72 / 21 / max(idle0.size)
    pal = palette([f[0] for f in raw["idle"] if f])
    meta = {"hero": hero, "heroHeight": HERO_H, "footFromBottom": CELL - FOOT_Y, "actions": {}}
    rows, y_off = [], 0
    for act, grid, n, base, fps, fr in plan:
        if any(f is None for f in fr): sys.exit(f"{act}: empty cell")
        # 整張表同一個倍率(模型每張畫的大小不同):用「軀幹欄身高」(軀幹中心 ±12% 寬的欄,舉過頭的武器、伸出去的弓不算)對齊待機
        # 魔物(四足、矮胖):用外框最長邊對齊(軀幹欄身高對狼蹲低的格會量小、整列被放大 1.5 倍)
        # 正/背面的魔物用高度對齊(正面的狼比側面窄,最長邊會量小)
        s = s_idle * ((max(idle0.size) / max(fr[base][0].size)) if monster else body_h(idle0) / body_h(fr[base][0])) if act != "idle" else s_idle
        # 地面線:同一個格線列(row band)裡最低的腳 —— bottom 是相對該列上緣量的,不同列不能比
        cols_ = grid[0] if act not in BACK else n + 1   # 背面表:待機/走路各自一段,地面線不用分列(腳一律貼地)
        ground = {r: max(b for _, b in fr[r * cols_:(r + 1) * cols_]) for r in range(max(1, len(fr) // cols_ + 1)) if fr[r * cols_:(r + 1) * cols_]}
        # 走路/待機/受擊:腳一律貼地(模型把經過格整隻畫高 5–9px,會變成浮空滑步;身體起伏由腿長自然產生)。跳躍只留給技能/勝利。
        base_act = act[:-2] if act.endswith("Up") else act
        grounded = base_act in ("idle", "walk", "hurt", "attack") and not (monster and hero == "slime" and base_act == "walk")   # 史萊姆走路是跳躍
        # 走路:模型常把「踩低」那兩格整隻畫小 12–15%(不是蹲低,是縮小)→ 跟整列中位數差超過 8% 的格單獨縮放回中位數高(英雄才做;魔物走路姿勢本來就會變矮)
        fs = [s] * len(fr)
        if base_act == "walk" and not monster:
            bh = float(np.median([body_h(im) for im, _ in fr]))   # 中位數當基準(基準格自己也可能畫歪)
            fs = [s * (bh / body_h(im) if abs(body_h(im) / bh - 1) > .08 else 1) for im, _ in fr]
        pix = [(pixelize(im, fs[i], pal), 0 if grounded else round((ground[i // cols_] - bottom) * fs[i])) for i, (im, bottom) in enumerate(fr)]
        if base_act == "walk" and not monster:   # 原圖量的軀幹欄會被弓/斗篷干擾 → 縮完再用跟 audit 一樣的量法(軀幹中心 ±10 px)校一次
            def h10(p):
                m = np.asarray(p)[..., 3] > 0; c = int(round(torso_x(p))); ys = np.nonzero(m[:, max(0, c - 10):c + 10].any(1))[0]; return len(ys) and ys.max() - ys.min() + 1
            hs = [h10(p) for p, _ in pix]; med = float(np.median(hs))
            pix = [(pixelize(im, fs[i] * med / hs[i], pal), 0) if abs(hs[i] / med - 1) > .06 else pix[i] for i, (im, _) in enumerate(fr)]
        # 格大小:預設 128;這一列有格放不下(跳躍、技能特效、長弓)就整列用 160 —— 錨點(軀幹中心、腳底離格底 10px)不變,不裁切也不位移身體
        def fits(c):
            return all(round(c / 2 - torso_x(p)) >= 2 and round(c / 2 - torso_x(p)) + p.width <= c - 2 and c - (CELL - FOOT_Y) - p.height - lift >= 2 for p, lift in pix)
        cell = next((c for c in (CELL, 160, 192, 224, 256, 288, 320, 384) if fits(c)), 384)
        rows.append((act, cell, y_off, pix)); meta["actions"][act] = {"y": y_off, "cell": cell, "frames": n, "frameTime": fps, **KEY.get(act, {})}
        y_off += cell
    # 左下 / 左上:每個右向動作列(含 Up)整格鏡像(以格中線為軸,軀幹錨點不動)
    left_rows = []
    for act in [r[0] for r in rows]:
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
                heads.append([round(float(xs.mean()), 1), top] if upright and not act.startswith(("death", "skill")) else None)
            meta["actions"][act]["head"] = heads
            if act + "Left" in meta["actions"]:   # 左向列是整格鏡像 → 錨點 x 也鏡像
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
