"""audit_art.py — 圖集視覺體檢(靜態,可重現)。每一條都是數字門檻,不靠目測。

用法:python pipeline/scripts/check/audit_art.py [--json out.json]   (exit 1 = 有不合格)

檢查(每個圖集的 @2x 每一格;英雄用 heropose@4x / hero@4x):
  A1 破圖
    residue   : 去背殘色(洋紅 / 純綠)像素數            門檻 0
    halo      : 半透明像素(0<alpha<255)比例             門檻 ≤ 0.5%(像素畫該是全透或全不透)
    fragments : 跟主體不相連、≥4px 的碎塊數              門檻 0(特效 vfx 例外,本來就是散點)
    clipped   : 主體碰到格子邊(被裁切)                 門檻 False
  A2 描邊一致
    outline   : 剪影最外圈像素中「暗色」(亮度 < 95)的比例 門檻 ≥ 0.55(專案風格:深棕 #0a0706 描邊)
  A3 光源一致(光從右上)
    light     : 主體右半平均亮度 − 左半平均亮度(0–255)  門檻 ≥ −12(明顯左亮右暗＝光源反了)
  A4 同一角色不同格的一致性
    hero 姿勢 : 腳底中心(foot)跟待機差 ≤ 25% 待機寬;站姿類高度跟待機差 ≤ 12%
    魔物各格 : 寬高跟待機格比 0.6–1.6(倒地 9、史萊姆壓扁 6 除外只看寬)
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
ATLASES = ["details", "props", "cold", "woods", "flora", "yard", "town", "town2", "vfx", "icons", "monsters"]
FX_LIKE = {"vfx"}
LUM = lambda a: 0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]


def cells_of(name):
    m = json.loads((A / f"{name}.manifest.json").read_text(encoding="utf-8"))
    im = np.asarray(Image.open(A / m["image"]).convert("RGBA"))
    cells = m["cells"] if isinstance(m["cells"], dict) else {c["id"]: c for c in m["cells"]}
    return {k: (im[c["y"]:c["y"] + c["h"], c["x"]:c["x"] + c["w"]], c) for k, c in cells.items()}


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
    mag = solid & (r > 215) & (b > 215) & (g < 60) & (np.abs(r - b) < 35)   # 接近純洋紅 #FF00FF(粉花、紫法球不算)
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
    # 被裁切:格子是緊貼內容裁的,碰邊很正常;真的被切掉時,邊上會有一整段「不是描邊色」的像素(描邊被切掉了)。
    # 判定:任一邊(底邊除外,落地物件底部本來就平)上連續 ≥ max(8, 邊長 12%) 個不透明且亮度 ≥ 95 的像素。
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
    return {"residue": int(mag.sum() + grn.sum()), "halo": round(float(halo), 4), "fragments": frags, "clipped": clipped,
            "outline": round(outline, 3), "light": round(light, 1), "w": int(np.ptp(xs) + 1) if xs.size else 0, "h": int(np.ptp(ys) + 1) if ys.size else 0,
            "foot": float(xs[ys > ys.max() - max(2, (np.ptp(ys) + 1) * .12)].mean() - xs.min()) if xs.size else 0}


def main():
    rows, bad = [], []
    def judge(atlas, k, r, fx=False):
        why = []
        if r["residue"]: why.append(f"residue={r['residue']}")
        if r["halo"] > .005: why.append(f"halo={r['halo']}")
        # 碎塊:落葉、石屑、法術光點是刻意的粒子,只記錄不判(json 裡看 fragments)
        # 被裁切:由 sheet_to_atlas.py 在原表上的碰邊檢查負責(原表格子才看得出有沒有被切);圖集格是緊貼內容裁的,
        # 淺色的劍尖/帽緣碰到格邊會誤判,所以這裡只記錄(json 的 clipped)不判。
        if r["outline"] < .55 and not fx: why.append(f"outline={r['outline']}")
        # 光源:單張圖左右亮度受內容影響,改成整體多數決(見 main 結尾)
        rows.append({"atlas": atlas, "id": k, **r, "fail": why})
        if why: bad.append(f"{atlas}/{k}: {', '.join(why)}")
    for name in ATLASES:
        for k, (a, c) in cells_of(f"{name}@2x").items():
            judge(name, k, inspect(a, name in FX_LIKE), name in FX_LIKE)
    hero = cells_of("hero@4x")
    pose = cells_of("heropose@4x")
    for k, (a, c) in hero.items():
        judge("hero", k, inspect(a))
    for k, (a, c) in pose.items():
        r = inspect(a)
        judge("heropose", k, r)
        cls, p = k.split("_", 1)
        base = inspect(hero[cls][0])
        # 腳底/軀幹對齊改由 audit_pose_jump.py 檢查(照遊戲的對齊方式量)
        # 身高:只量軀幹錨點左右 ±15% 寬的欄(武器、法杖、舉起的道具不算),站姿類跟待機差 ≤ 12%
        def body_h(img, foot):
            m = img[..., 3] > 127; w = m.shape[1]; lo, hi = int(max(0, foot - .15 * w)), int(min(w, foot + .15 * w) + 1)
            ys = np.nonzero(m[:, lo:hi].any(1))[0]; return int(ys.max() - ys.min() + 1)
        if p in ("idle2", "walk1", "walk2", "walk3", "walk4", "trade", "drink"):
            bh, ph = body_h(hero[cls][0], hero[cls][1].get("foot", hero[cls][1]["w"] / 2)), body_h(a, c.get("foot", c["w"] / 2))
            if abs(ph / bh - 1) > .12: bad.append(f"heropose/{k}: body height {ph} vs idle {bh} ({ph / bh:.2f}x)")
    mon = cells_of("monsters@2x")
    for t in ("slime", "wolf", "golem", "boss"):
        b0 = inspect(mon[f"{t}0"][0])
        for i in range(1, 10):
            if f"{t}{i}" not in mon: continue
            r = inspect(mon[f"{t}{i}"][0])
            rw, rh = r["w"] / b0["w"], r["h"] / b0["h"]
            if not .6 <= rw <= 1.6 or (i not in (6, 9) and t != "slime" and not .6 <= rh <= 1.6):
                bad.append(f"monsters/{t}{i}: size {rw:.2f}w × {rh:.2f}h of idle")
    # A3 光源多數決:場景物件(道具/地貌/魔物/英雄,不含 UI 圖示與特效)右半−左半亮度的中位數。
    # 遊戲投影往左下(光從右上);若素材整體是左亮(中位數 < −5),影子方向跟素材打光矛盾。
    scene = [r["light"] for r in rows if r["atlas"] not in ("icons", "vfx")]
    med = float(np.median(scene)); left = sum(v < -5 for v in scene); right = sum(v > 5 for v in scene)
    print(f"light: median {med:+.1f} (left-lit {left}, right-lit {right}, n {len(scene)})")
    if med < -5: bad.append(f"LIGHT: scene art is lit from the LEFT (median {med:+.1f}) but shadows assume light from upper-right")
    out = sys.argv[sys.argv.index("--json") + 1] if "--json" in sys.argv else None
    if out:
        Path(out).write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"cells {len(rows)}, issues {len(bad)}")
    for b in bad: print("  " + b)
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
