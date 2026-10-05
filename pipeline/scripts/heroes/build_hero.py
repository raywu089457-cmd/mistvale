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
from PIL import Image
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
# 攻擊/技能的關鍵格(遊戲對時間用):出手、命中
KEY = {"attack": {"release": 4, "impact": 5}, "skill": {"release": 4}}


def cut(path: Path, grid):
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
            keep = np.isin(lab, [i + 1 for i in range(n) if sizes[i] >= 6 and (near & (lab == i + 1)).any()])
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


def build(hero: str):
    OUT.mkdir(parents=True, exist_ok=True)
    raw = {a: cut(SRC / f"{hero}-{a}-v1.png", g) for a, (g, n, base, fps) in ACTIONS.items()}
    idle0 = raw["idle"][0][0]
    s_idle = HERO_H / idle0.height
    pal = palette([f[0] for f in raw["idle"] if f])
    meta = {"hero": hero, "heroHeight": HERO_H, "footFromBottom": CELL - FOOT_Y, "actions": {}}
    rows, y_off = [], 0
    for act, (grid, n, base, fps) in ACTIONS.items():
        fr = raw[act][:n]
        if any(f is None for f in fr): sys.exit(f"{act}: empty cell")
        # 整張表同一個倍率(模型每張畫的大小不同):用「軀幹欄身高」(軀幹中心 ±12% 寬的欄,舉過頭的武器、伸出去的弓不算)對齊待機
        s = s_idle * body_h(idle0) / body_h(fr[base][0]) if act != "idle" else s_idle
        # 地面線:同一個格線列(row band)裡最低的腳 —— bottom 是相對該列上緣量的,不同列不能比
        cols_ = grid[0]
        ground = {r: max(b for _, b in fr[r * cols_:(r + 1) * cols_]) for r in range(grid[1]) if fr[r * cols_:(r + 1) * cols_]}
        # 走路/待機/受擊:腳一律貼地(模型把經過格整隻畫高 5–9px,會變成浮空滑步;身體起伏由腿長自然產生)。跳躍只留給技能/勝利。
        grounded = act in ("idle", "walk", "hurt", "attack")
        pix = [(pixelize(im, s, pal), 0 if grounded else round((ground[i // cols_] - bottom) * s)) for i, (im, bottom) in enumerate(fr)]
        # 格大小:預設 128;這一列有格放不下(跳躍、技能特效、長弓)就整列用 160 —— 錨點(軀幹中心、腳底離格底 10px)不變,不裁切也不位移身體
        def fits(c):
            return all(round(c / 2 - torso_x(p)) >= 2 and round(c / 2 - torso_x(p)) + p.width <= c - 2 and c - (CELL - FOOT_Y) - p.height - lift >= 2 for p, lift in pix)
        cell = next((c for c in (CELL, 160, 192) if fits(c)), 192)
        rows.append((act, cell, y_off, pix)); meta["actions"][act] = {"y": y_off, "cell": cell, "frames": n, "frameTime": fps, **KEY.get(act, {})}
        y_off += cell
    sheet = Image.new("RGBA", (max(c * len(p) for _, c, _, p in rows), y_off), (0, 0, 0, 0))
    for act, cell, y0, pix in rows:
        foot = cell - (CELL - FOOT_Y)
        for i, (px, lift) in enumerate(pix):
            x = round(cell / 2 - torso_x(px)); y = foot - px.height - lift
            if x < 2 or y < 2 or x + px.width > cell - 2: print(f"  WARN {act}{i}: does not fit {cell} cell")
            sheet.alpha_composite(px, (i * cell + max(0, x), y0 + max(0, y)))
        if cell != CELL: print(f"  {act}: cell {cell}")
    meta["palette"] = ["#%02x%02x%02x" % tuple(c) for c in np.asarray(pal.getpalette()[:COLORS * 3]).reshape(-1, 3)]
    sheet.save(OUT / f"{hero}.png", optimize=True)
    (OUT / f"{hero}.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{hero}: {sheet.size}, palette {len(meta['palette'])}, idle scale {s_idle:.3f}")
    fx = SRC / f"{hero}-fx-v1.png"
    if fx.exists():
        fr = cut(fx, (4, 2)); fpal = palette([f[0] for f in fr if f], 12)
        FX = 64; fsheet = Image.new("RGBA", (FX * len(fr), FX), (0, 0, 0, 0))
        for i, (im, _) in enumerate(fr):
            s = (FX - 8) / max(im.size); p = pixelize(im, s, fpal)
            fsheet.alpha_composite(p, (i * FX + (FX - p.width) // 2, (FX - p.height) // 2))
        fsheet.save(OUT / f"{hero}-fx.png", optimize=True)
        (OUT / f"{hero}-fx.json").write_text(json.dumps({"cell": FX, "frames": len(fr)}, indent=1), encoding="utf-8")   # 每格用途見 make_heroes_v3.py fx_frames / pixel-world.js SKILL_FX
        print(f"{hero}-fx: {fsheet.size}")


if __name__ == "__main__":
    build(sys.argv[1] if len(sys.argv) > 1 else "archer")
