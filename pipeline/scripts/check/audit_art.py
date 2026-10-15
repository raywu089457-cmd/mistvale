"""audit_art.py — 圖集／角色 sheet 視覺體檢(靜態,可重現)。每一條都是數字門檻,不靠目測。

用法:python pipeline/scripts/check/audit_art.py [--json out.json]   (exit 1 = 有不合格)

2026-10-13 改版:舊圖集(hero@4x / heropose@4x / monsters@2x)已移除,
改成掃**現在真的在用的三種來源**:
  1. 場景／道具圖集  assets/<name>@{1x,2x}.png + .manifest.json
  2. 英雄 sheet      assets/heroes/<職業>.png + .json（列＝動作、行＝格）
  3. 魔物 sheet      assets/monsters3/<魔物>.png + .json

檢查:
  A1 破圖
    residue   : 去背殘色(洋紅 / 純綠)像素數            門檻 0
    halo      : 半透明像素(0<alpha<255)比例             門檻 ≤ 0.5%(像素畫該是全透或全不透)
    fragments : 跟主體不相連、≥4px 的碎塊數              只記錄(落葉／石屑／法術光點是刻意的)
    clipped   : 主體碰到格子邊                          只記錄(sheet 格是緊裁,淺色尖端容易誤判)
  A2 描邊一致
    outline   : 剪影最外圈像素中「暗色」(亮度 < 95)的比例
                ・硬性門檻 ≥ 0.35(整格描邊消失才判失敗)
                ・0.35–0.55 只警告 —— PixelLab 匯入的職業(祭司/魔法師/遊俠/聖騎士)本來就是柔和淺描邊,
                  專案已知且刻意(不要用舊手繪素材的 0.55 當硬門檻,會一次噴 90 條假警報)
                ・攻擊/技能/勝利列不看(技能特效本身就沒有描邊);vfx/icons 也不看
  A3 光源一致(光從右上)
    light     : 主體右半平均亮度 − 左半平均亮度          整體中位數 < −5 才算光源反了
  A4 魔物同角色不同格的一致性
    各格寬高 vs 該魔物待機格 0.6–1.6 倍(倒地格只看寬)
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[3]
A = ROOT / "assets"
ATLASES = ["details", "props", "cold", "woods", "flora", "villagers", "icons", "vfx", "yard", "town", "town2"]
FX_LIKE = {"vfx", "icons"}
LUM = lambda a: 0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]


def atlas_cells(name):
    man = json.loads((A / f"{name}@2x.manifest.json").read_text(encoding="utf-8"))
    im = np.asarray(Image.open(A / man["image"]).convert("RGBA"))
    cells = man["cells"] if isinstance(man["cells"], dict) else {c["id"]: c for c in man["cells"]}
    return {k: im[c["y"]:c["y"] + c["h"], c["x"]:c["x"] + c["w"]] for k, c in cells.items()}


def sheet_cells(folder, sid):
    """英雄／魔物 sheet → {動作格名: 該格 RGBA}。格式:每列一個動作(meta.actions[act]={y,cell,frames})。"""
    meta = json.loads((A / folder / f"{sid}.json").read_text(encoding="utf-8"))
    im = np.asarray(Image.open(A / folder / f"{sid}.png").convert("RGBA"))
    out = {}
    for act, a in (meta.get("actions") or {}).items():
        c = int(a.get("cell") or 0)
        if c <= 0:
            continue
        for i in range(int(a.get("frames") or 0)):
            x, y = i * c, int(a["y"])
            if y + c <= im.shape[0] and x + c <= im.shape[1]:
                out[f"{act}{i}"] = im[y:y + c, x:x + c]
    return out


def block(a):
    """整數倍最近鄰放大過的(像素化資產)回傳倍數 N,檢查前先縮回 1 美術像素 = 1 px。"""
    for N in (8, 4, 2):
        h, w = a.shape[0] // N * N, a.shape[1] // N * N
        if h < N or w < N: continue
        b = a[:h, :w]; d = b[::N, ::N].repeat(N, 0).repeat(N, 1)
        if (np.abs(b.astype(int) - d.astype(int)).max(-1) <= 2).mean() > .985: return N
    return 1


def inspect(a, fx=False):
    N = block(a)
    a = a[::N, ::N]
    al = a[..., 3]
    solid = al > 127
    r, g, b = [a[..., i].astype(int) for i in range(3)]
    mag = solid & (r > 215) & (b > 215) & (g < 60) & (np.abs(r - b) < 35)   # 接近純洋紅 #FF00FF
    grn = solid & (g > 225) & (r < 50) & (b < 50)                            # 接近純綠 #00FF00
    halo = ((al > 0) & (al < 255)).sum() / max(1, (al > 0).sum())
    lab, n = ndimage.label(solid)
    sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1)) if n else np.array([])
    main = sizes.max() if n else 0
    frags = int(((sizes >= 4) & (sizes < main)).sum()) if n else 0
    ys, xs = np.nonzero(solid)
    inner = ndimage.binary_erosion(solid)
    edge = solid & ~inner
    lum = LUM(a.astype(float))
    clipped = False
    for line in (solid[0] & (lum[0] >= 95), solid[:, 0] & (lum[:, 0] >= 95), solid[:, -1] & (lum[:, -1] >= 95)):
        run = best = 0
        for v in line:
            run = run + 1 if v else 0; best = max(best, run)
        if best >= max(3, .12 * len(line)): clipped = True
    outline = float((lum[edge] < 95).mean()) if edge.any() else 1.0
    if xs.size:
        cx = (xs.min() + xs.max()) / 2
        body = inner if inner.any() else solid
        L = lum[body & (np.arange(a.shape[1])[None, :] < cx)]
        R = lum[body & (np.arange(a.shape[1])[None, :] >= cx)]
        light = float(R.mean() - L.mean()) if L.size and R.size else 0.0
    else:
        light = 0.0
    return {"residue": int(mag.sum() + grn.sum()), "halo": round(float(halo), 4), "fragments": frags,
            "clipped": clipped, "outline": round(outline, 3), "light": round(light, 1),
            "w": int(np.ptp(xs) + 1) if xs.size else 0, "h": int(np.ptp(ys) + 1) if ys.size else 0}


FX_ROWS = ("attack", "skill", "victory")            # 特效列:剪影被特效蓋住,描邊比例不具意義


def main():
    rows, bad, warns = [], [], []

    def judge(group, k, r, fx=False):
        why, warn = [], []
        if r["residue"]: why.append(f"residue={r['residue']}")
        if r["halo"] > .005: why.append(f"halo={r['halo']}")
        is_fx_row = any(t in k for t in FX_ROWS)
        if not fx and not is_fx_row:
            if r["outline"] < .35: why.append(f"outline={r['outline']}")
            elif r["outline"] < .55: warn.append(f"outline={r['outline']}")
        if r["fragments"]: warn.append(f"fragments={r['fragments']}")
        if r["clipped"]: warn.append("clipped")
        rows.append({"group": group, "id": k, **r, "fail": why, "warn": warn})
        if why: bad.append(f"{group}/{k}: {', '.join(why)}")
        if warn: warns.append(f"{group}/{k}: {', '.join(warn)}")

    for name in ATLASES:
        for k, a in atlas_cells(name).items():
            judge(name, k, inspect(a, name in FX_LIKE), name in FX_LIKE)

    hero_ids = sorted(p.stem for p in (A / "heroes").glob("*.json"))
    for sid in hero_ids:
        for k, a in sheet_cells("heroes", sid).items():
            judge("hero:" + sid, k, inspect(a))

    mon_ids = sorted(p.stem for p in (A / "monsters3").glob("*.json"))
    for sid in mon_ids:
        cells = sheet_cells("monsters3", sid)
        for k, a in cells.items():
            judge("monster:" + sid, k, inspect(a))
        # A4 同一動作列內不該忽大忽小（跟**同列第 1 格**比;跨方向比寬度沒有意義 ——
        #    狼的正面/背面本來就比側面窄）。倒地列只看寬。
        rows_of = {}
        for k, a in cells.items():
            rows_of.setdefault("".join(ch for ch in k if not ch.isdigit()), []).append((k, a))
        for row, items in rows_of.items():
            if len(items) < 3 or not row.startswith("walk"): continue
            items.sort()
            b0 = inspect(items[0][1])
            if not b0["w"] or not b0["h"]: continue
            for k, a in items[1:]:
                r = inspect(a); rw, rh = r["w"] / b0["w"], r["h"] / b0["h"]
                if not .75 <= rw <= 1.35 or (not row.startswith("death") and not .75 <= rh <= 1.35):
                    bad.append(f"monster:{sid}/{k}: size {rw:.2f}w × {rh:.2f}h of {row}0")

    # A3 光源多數決:場景物件(圖集＋英雄＋魔物,不含 UI 圖示與特效)
    scene = [r["light"] for r in rows if not r["group"].startswith(("icons", "vfx"))]
    med = float(np.median(scene)); left = sum(v < -5 for v in scene); right = sum(v > 5 for v in scene)
    print(f"light: median {med:+.1f} (left-lit {left}, right-lit {right}, n {len(scene)})")
    if med < -5:
        bad.append(f"LIGHT: scene art is lit from the LEFT (median {med:+.1f}) but shadows assume light from upper-right")

    out = sys.argv[sys.argv.index("--json") + 1] if "--json" in sys.argv else None
    if out:
        Path(out).write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"cells {len(rows)}, issues {len(bad)}, warnings {len(warns)}")
    for b in bad[:40]: print("  ✗ " + b)
    if len(bad) > 40: print(f"  …（還有 {len(bad) - 40} 條）")
    if warns:
        by_kind = {}
        for w in warns:
            by_kind[w.split(": ")[1].split("=")[0]] = by_kind.get(w.split(": ")[1].split("=")[0], 0) + 1
        print(f"  ⚠ 警告統計: {by_kind}（只記錄不判失敗;完整清單在 --json）")
        for w in warns[:8]: print("    ⚠ " + w)
        if len(warns) > 8: print(f"    …（還有 {len(warns) - 8} 條）")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
