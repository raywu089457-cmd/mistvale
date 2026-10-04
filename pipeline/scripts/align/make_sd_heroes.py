"""make_sd_heroes.py — Q 版（約 2 頭身）英雄表 → hero@1x/2x/4x + heropose@1x/2x/4x。

待機表決定每個職業的倍率：待機高度縮到 34／68／136 px（1x／2x／4x，遊戲裡英雄畫 21 世界像素高）。
姿勢表（走路 A/B、蓄力、出手、受擊、休息）用「同職業待機圖的倍率 × 待機表寬 / 姿勢表寬」縮放，
所以換姿勢時人不會忽大忽小；每格記 foot（腳底中心 x），遊戲用它對齊。
manifest 的 scale：1x 0.14、2x 0.28、4x 0.56（pixel-world.js 依此分 LOD）。
用法：NO_SHADOW=1 HUE_TOL=16 python pipeline/scripts/align/make_sd_heroes.py idle.png walkA=… walkB=… strike=… windup=… hurt=… rest=…
"""
import json, os, subprocess, sys
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]; A = ROOT / "assets"
IDS = ["berserker", "ranger", "paladin", "sorcerer", "darkknight", "priest"]
LODS = {"1x": (34, .14), "2x": (68, .28), "4x": (136, .56)}


def regreen(src):
    """紫水晶跟洋紅底色幾乎同色，色鍵分不開。先用「跟圖邊連通」的洪水填色找出真正的背景（深色描邊擋住水晶），
    被包住、且很純的洋紅小洞也算背景；背景改成純綠，再交給 sheet_to_atlas 去背。"""
    from scipy import ndimage
    rgb = np.asarray(Image.open(src).convert("RGB")).astype(int); bgc = np.median(np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]]), 0)
    d = np.sqrt(((rgb - bgc) ** 2).sum(2)); near = d < 48
    lab, n = ndimage.label(near); border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(border))
    for i in range(1, n + 1):
        if i in border: continue
        sl = ndimage.find_objects((lab == i).astype(int))[0]; sl = tuple(slice(max(0, a.start - 2), a.stop + 2) for a in sl)
        m = lab[sl] == i; ring = ndimage.binary_dilation(m) & ~m
        # 被包住的底色洞(弓弦內、法杖輪輻間、手臂與身體間):周圍一圈大多不是洋紅系 → 是洞;
        # 周圍也是洋紅系(紫水晶裡的亮點) → 是水晶的一部分,留著。
        if ring.any() and (d[sl][ring] < 100).mean() < .5: bg[sl] |= m
    # 跟底色幾乎一模一樣、且成片(≥25px)的被包住區域一定是底色洞——即使它碰到紫水晶(水晶是漸層,不會有這麼純的一大片)。
    pl, pn = ndimage.label(d < 16); ps = ndimage.sum(np.ones_like(pl), pl, range(1, pn + 1))
    bg |= np.isin(pl, [i + 1 for i, v in enumerate(ps) if v >= 25])
    for _ in range(2):   # 邊緣混色(描邊與底色之間的半洋紅像素):貼著背景、又偏洋紅的去掉
        edge = ndimage.binary_dilation(bg) & ~bg; bg |= edge & (d < 115)
    out = rgb.copy(); out[bg] = [0, 255, 0]
    path = Path(src).with_name(Path(src).stem + "-greenbg.png"); Image.fromarray(out.astype(np.uint8)).save(path); return str(path)


def spread(src, n):
    """一排 n 個角色、彼此碰到(斧頭碰到下一格)時:在每兩格之間「最少前景像素」的欄切開,插入 80px 底色間隔。"""
    rgb = np.asarray(Image.open(src).convert("RGB")).astype(int); bgc = np.median(np.concatenate([rgb[0], rgb[-1]]), 0)
    fg = np.sqrt(((rgb - bgc) ** 2).sum(2)) > 60; cols = fg.sum(0); xs = np.nonzero(cols)[0]; x0, x1 = xs.min(), xs.max()
    cuts = []
    for i in range(1, n):
        c = int(x0 + (x1 - x0) * i / n); lo, hi = max(x0, c - 70), min(x1, c + 70); cuts.append(lo + int(np.argmin(cols[lo:hi])))
    parts, prev = [], 0
    for c in cuts + [rgb.shape[1]]: parts.append(rgb[:, prev:c]); prev = c
    gap = np.tile(bgc.astype(int), (rgb.shape[0], 80, 1))
    out = np.concatenate(sum([[pp, gap] for pp in parts[:-1]], []) + [parts[-1]], 1)
    path = Path(src).with_name(Path(src).stem + "-spread.png"); Image.fromarray(out.astype(np.uint8)).save(path); return str(path)


def cut(src, prefix, grid="3x2", ids=IDS, green=False):
    src = src if green else regreen(src)
    r = subprocess.run([sys.executable, str(ROOT / "pipeline/scripts/l0veyou/sheet_to_atlas.py"), src, prefix, grid, ",".join(ids)],
                       capture_output=True, text=True, encoding="utf-8", env={**os.environ, "PYTHONIOENCODING": "utf-8"})
    print(((r.stdout or r.stderr).strip().splitlines() or ["?"])[0])
    if r.returncode: print(r.stdout, r.stderr); raise SystemExit(r.returncode)
    sheet = Image.open(A / f"{prefix}@2x.png").convert("RGBA"); man = json.loads((A / f"{prefix}@2x.manifest.json").read_text(encoding="utf-8"))
    out = {k: (lambda im: im if green else clean(im))(sheet.crop((c["x"], c["y"], c["x"] + c["w"], c["y"] + c["h"]))) for k, c in man["cells"].items()}
    for f in A.glob(f"{prefix}@*"): f.unlink()
    if not green: Path(src).unlink()
    return out


def clean(piece):
    """洋紅底表(法師以外)裡沒有真正的洋紅色:所有偏洋紅的像素都是去背殘留。
    外緣的變透明;被包在圖裡的(弓弦內、斧頭缺口)改成周圍非洋紅像素的顏色。法師用綠底表,不經過這裡。"""
    from scipy import ndimage
    a = np.asarray(piece).copy()
    for _ in range(12):
        r, g, b = [a[..., i].astype(int) for i in range(3)]; al = a[..., 3] > 0
        mag = al & (r > 60) & (b > 60) & (g < 120) & (r - g > 60) & (b - g > 50) & (np.abs(r - b) < 80)
        if not mag.any(): break
        rim = al & ndimage.binary_dilation(~al)
        a[..., 3] = np.where(mag & rim, 0, a[..., 3])
        a[mag & ~rim, :3] = (44, 28, 24)   # 被包在縫裡的殘色 → 描邊暗褐色(這些縫本來就在描邊之間)
    return Image.fromarray(a)


def shrink(piece, s, cleanup=True):
    w, h = max(1, round(piece.width * s)), max(1, round(piece.height * s))
    a = np.asarray(piece.resize((w, h), Image.LANCZOS)).copy(); a[..., 3] = np.where(a[..., 3] >= 128, 255, 0)
    return clean(Image.fromarray(a)) if cleanup else Image.fromarray(a)   # 縮放後再清一次:LANCZOS 會在邊緣混出新的洋紅像素


def foot_x(piece):
    a = np.asarray(piece)[..., 3] > 0; ys, xs = np.nonzero(a[int(a.shape[0] * .86):])
    return float(xs.mean()) if len(xs) else piece.width / 2


def pack(pieces, name, sc, extra):
    pad, x, y, shelf, W = 3, 2, 2, 0, 0; row_w = max(512, max(p.width for p in pieces.values()) + 4); places = {}
    for k, p in pieces.items():
        if x > 2 and x + p.width + pad > row_w: x, y, shelf = 2, y + shelf, 0
        places[k] = (x, y); x += p.width + pad; shelf = max(shelf, p.height + pad); W = max(W, x)
    sheet = Image.new("RGBA", (W + 2, y + shelf + 2), (0, 0, 0, 0)); cells = {}
    for k, p in pieces.items():
        px, py = places[k]; sheet.alpha_composite(p, (px, py))
        cells[k] = {"x": px, "y": py, "w": p.width, "h": p.height, "anchor": [px + p.width / 2, py + p.height], **extra.get(k, {})}
    sheet.save(A / f"{name}.png", optimize=True)
    (A / f"{name}.manifest.json").write_text(json.dumps({"version": 1, "kind": "mistvale-hero-atlas", "image": f"{name}.png", "sheetWidth": sheet.width,
        "sheetHeight": sheet.height, "packing": "shelf", "scale": sc, "generator": "l0veyou.com GPT Image 2（Q 版 2 頭身英雄）", "cells": cells}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(name, sheet.size, len(cells), "cells")


POSES = ["idle", "walkA", "walkB", "windup", "strike", "hurt", "rest"]


def main(idle_src, *specs):
    # solo=<職業>:<4x2 綠底表>：某職業的 7 個姿勢改用單獨一張綠底表(紫水晶跟洋紅底同色時用),順序 = POSES,第 8 格空白。
    solo = {}
    for sp in [x for x in specs if x.startswith("solo=")]:
        cls, path = sp[5:].split(":", 1)
        got = cut(path, "zzsolo", "4x2", [f"{cls}_{p}" for p in POSES] + ["-"], green=True)
        got[f"{cls}_strike"] = got[f"{cls}_strike"].transpose(Image.FLIP_LEFT_RIGHT)   # 生成時朝左,遊戲統一朝右
        solo[cls] = got
    # walk4=<職業>:<綠底 1×4 走路表>：四格走路循環(左腳著地、經過、右腳著地、經過),倍率＝四格高度中位數對齊待機高度。
    walk4 = {}
    for sp in [x for x in specs if x.startswith("walk4=")]:
        cls, path = sp[6:].split(":", 1); sp4 = spread(path, 4); walk4[cls] = cut(sp4, "zzwalk4", "4x1", [f"{cls}_walk{i}" for i in range(1, 5)], green=True); Path(sp4).unlink()
    specs = [x for x in specs if not x.startswith(("solo=", "walk4="))]
    idle = cut(idle_src, "zzsdidle"); iw = Image.open(idle_src).width
    poses = [(p, cut(f, "zzsdpose"), Image.open(f).width) for p, f in (s.split("=", 1) for s in specs)]
    for tag, (h, sc) in LODS.items():
        hero, pose, extra = {}, {}, {}
        for k, frames in walk4.items():
            mh = sorted(f.height for f in frames.values())[1:3]; s4 = h / (sum(mh) / 2)
            for key, f in frames.items(): p = shrink(f, s4, False); pose[key] = p; extra[key] = {"foot": round(foot_x(p), 1)}
        for k in IDS:
            if k in solo:
                g = solo[k]; s = h / g[f"{k}_idle"].height; hero[k] = shrink(g[f"{k}_idle"], s, False)
                for name in POSES[1:]:
                    key = f"{k}_{name}"; p = shrink(g[key], s, False); pose[key] = p; extra[key] = {"foot": round(foot_x(p), 1)}
                continue
            s = h / idle[k].height; hero[k] = shrink(idle[k], s)
            for name, got, pw in poses:
                key = f"{k}_{name}"; p = shrink(got[k], s * iw / pw); pose[key] = p; extra[key] = {"foot": round(foot_x(p), 1)}
        pack(hero, f"hero@{tag}", sc, {}); pack(pose, f"heropose@{tag}", sc, extra)


if __name__ == "__main__":
    main(*sys.argv[1:])
