"""audit_hero_sheet.py — 新規格英雄 sprite sheet 對照 pipeline/ART_BIBLE.md 的可量測檢查(規格第 25 條自我檢查清單裡能量化的項目)。

用法:python pipeline/scripts/check/audit_hero_sheet.py [hero ...]   (預設 assets/heroes/ 全部;exit 1 = 有不合格)
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[3]
H = ROOT / "assets" / "heroes"
M = ROOT / "assets" / "monsters3"
SPEC = {"idle": (4, 6), "walk": (4, 6), "attack": (6, 10), "skill": (8, 16), "hurt": (2, 4), "death": (5, 8), "victory": (4, 8)}
STANDING = ("idle", "walk", "hurt", "idleDown", "walkDown", "idleUp", "walkUp")   # 勝利:舉弓過頭、跳起來是姿勢本身,不算比例改變


def frames(img, act):
    return [img[act["y"]:act["y"] + act["cell"], i * act["cell"]:(i + 1) * act["cell"]] for i in range(act["frames"])]


def body_h(f, cx):
    m = f[..., 3] > 0; lo, hi = int(cx - 10), int(cx + 10)   # 軀幹中線 ±10 px 的欄(弓、箭、特效不算)
    ys = np.nonzero(m[:, lo:hi].any(1))[0]
    return int(ys.max() - ys.min() + 1) if len(ys) else 0


MON_SPEC = {"idle": (4, 6), "walk": (4, 6), "attack": (6, 10), "hurt": (2, 4), "death": (5, 8)}


def four_dir(meta, img):
    """四方向(上下左右):Down/Up 各有待機 4、走路 6;Left 列存在且是右邊同一格的鏡像(逐像素相等)。"""
    out = []
    for name, n in (("idleDown", 4), ("walkDown", 6), ("idleUp", 4), ("walkUp", 6), ("idleLeft", 4), ("walkLeft", 6)):
        if meta["actions"].get(name, {}).get("frames") != n: out.append(f"{name}: expected {n} frames")
    for name in ("idle", "walk"):
        a, l = meta["actions"].get(name), meta["actions"].get(name + "Left")
        if not a or not l: continue
        for i, (fr, fl) in enumerate(zip(frames(img, a), frames(img, l))):
            if not np.array_equal(fr[:, ::-1], fl): out.append(f"{name}Left{i}: not a mirror of {name}{i}")
    return out


def audit(hero, d=H):
    meta = json.loads((d / f"{hero}.json").read_text(encoding="utf-8"))
    img = np.asarray(Image.open(d / f"{hero}.png").convert("RGBA"))
    mon = bool(meta.get("monster"))
    bad, info = [], {}
    # 1. 動作格數
    for a, (lo, hi) in (MON_SPEC if mon else SPEC).items():
        n = meta["actions"].get(a, {}).get("frames", 0)
        if not lo <= n <= hi: bad.append(f"{a}: {n} frames (spec {lo}-{hi})")
    # 2. 1:1 像素、無半透明(no anti-aliasing / blur)
    al = img[..., 3]; semi = int(((al > 0) & (al < 255)).sum())
    if semi: bad.append(f"{semi} semi-transparent pixels (anti-aliasing)")
    # 3. 色盤 ≤16(整張共用)
    cols = np.unique(img[al == 255][:, :3], axis=0); info["colors"] = len(cols)
    if len(cols) > 16: bad.append(f"{len(cols)} colors > 16")
    # 4. 不裁切:每格四邊留 ≥2 px
    for name, a in meta["actions"].items():
        for i, f in enumerate(frames(img, a)):
            m = f[..., 3] > 0
            if not m.any(): bad.append(f"{name}{i}: empty"); continue
            if m[:2].any() or m[-2:].any() or m[:, :2].any() or m[:, -2:].any(): bad.append(f"{name}{i}: touches cell edge")
    if mon:   # 魔物:對齊(腳底)、尺寸(美術最長邊 = 遊戲大小 × 72/21 ±10%)、描邊、材質層級;不比剪影/身高
        idle = meta["actions"]["idle"]; f0 = frames(img, idle)[0]; ys, xs = np.nonzero(f0[..., 3] > 0); size = max(np.ptp(xs), np.ptp(ys)) + 1
        want = meta["size"] * 72 / 21; info["size"] = int(size)
        if abs(size / want - 1) > .1: bad.append(f"art size {size} vs {want:.0f}")
        for name in ("idle", "attack", "hurt"):
            a = meta["actions"][name]
            for i, f in enumerate(frames(img, a)):
                yy = np.nonzero((f[..., 3] > 0).any(1))[0]; foot = a["cell"] - meta["footFromBottom"]
                if abs(yy.max() + 1 - foot) > 3: bad.append(f"{name}{i}: foot at {yy.max() + 1}, expected {foot}")
        m = f0[..., 3] > 0; edge = m & ~ndimage.binary_erosion(m); lum = (0.299 * f0[..., 0] + 0.587 * f0[..., 1] + 0.114 * f0[..., 2])[edge]; info["outline"] = round(float((lum < 95).mean()), 2)
        if info["outline"] < .55: bad.append(f"outline dark ratio {info['outline']}")
        bad += four_dir(meta, img)
        return bad, info
    # 5. 角色高 64–90(待機第 1 格,軀幹欄)、站姿類各格 ±12%
    idle = meta["actions"]["idle"]; c = idle["cell"]
    base = body_h(frames(img, idle)[0], c / 2); info["height"] = base
    if not 64 <= base <= 90: bad.append(f"idle height {base} px (spec 64-90)")
    for name in STANDING:
        if name not in meta["actions"]: bad.append(f"missing {name}"); continue
        a = meta["actions"][name]
        for i, f in enumerate(frames(img, a)):
            h = body_h(f, a["cell"] / 2)
            if abs(h / base - 1) > .12: bad.append(f"{name}{i}: body height {h} vs idle {base}")
    # 6. 對齊:站姿類與普攻每格腳底(最低不透明列)= 格底往上 footFromBottom ±3 px(跳躍只允許在技能/勝利)
    for name in STANDING + ("attack",):
        if name not in meta["actions"]: continue
        a = meta["actions"][name]
        for i, f in enumerate(frames(img, a)):
            ys = np.nonzero((f[..., 3] > 0).any(1))[0]; foot = a["cell"] - meta["footFromBottom"]
            if abs(ys.max() + 1 - foot) > 3: bad.append(f"{name}{i}: foot at {ys.max() + 1}, expected {foot}")
    # 4 方向:背面待機/走路格數(正面右/左 + 背面右/左,左邊鏡像)
    bad += four_dir(meta, img)
    # 模組化:至少要有一組可換色材質(outfit)
    if not meta.get("groups", {}).get("outfit"): bad.append("no swappable outfit color group")
    info["groups"] = {k: len(v) for k, v in meta.get("groups", {}).items()}
    # 9. 材質明暗層級(規格:每個主要材質 Dark/Mid/Light 3 層)。材質靠「位置」分:待機第 1 格裡,顏色屬於同一色族(色相 ±25°、飽和度 ±0.22,
    #    近灰另一族、描邊除外)且相連的區塊 = 一塊材質(頭髮、皮膚、皮革、布…)。佔身體 ≥3% 的區塊,裡面的顏色數要 2–5
    #    (1 = 平塗沒有立體;>5 = 漸層化/雜訊)。
    import colorsys
    f0 = frames(img, meta["actions"]["idle"])[0]; body = f0[..., 3] > 0
    cols_ = np.unique(f0[body][:, :3], axis=0); fam = {}; reps = []
    for c in cols_:
        h, l, s_ = colorsys.rgb_to_hls(*(c / 255))
        if l < .14: continue
        for k, (hh, ss, gray) in enumerate(reps):
            if (gray and s_ < .15) or (not gray and s_ >= .15 and min(abs(h - hh), 1 - abs(h - hh)) < 25 / 360 and abs(s_ - ss) < .22): fam[tuple(c)] = k; break
        else: fam[tuple(c)] = len(reps); reps.append((h, s_, s_ < .15))
    famimg = np.full(body.shape, -1)
    for c, k in fam.items(): famimg[np.all(f0[..., :3] == np.array(c), -1) & body] = k
    shades = []
    for k in range(len(reps)):
        lab, n = ndimage.label(famimg == k)
        for r in range(1, n + 1):
            reg = lab == r
            if reg.sum() < .03 * body.sum(): continue
            shades.append(len(np.unique(f0[reg][:, :3], axis=0)))
    # 只回報不判:16 色整隻共用,頭髮/皮膚/皮革同色族又相連時會被算成同一塊(實測 8–9 色其實是 3 材質 × 3 層),
    # 沒有逐像素材質標記就無法可靠判定。硬性門檻用「整隻 ≤16 色」(第 3 項)。
    info["materialShades"] = shades
    # 7. 描邊:剪影外圈暗色比例 ≥ 0.55(待機格)
    f = frames(img, idle)[0]; m = f[..., 3] > 0; edge = m & ~ndimage.binary_erosion(m)
    lum = (0.299 * f[..., 0] + 0.587 * f[..., 1] + 0.114 * f[..., 2])[edge]; info["outline"] = round(float((lum < 95).mean()), 2)
    if info["outline"] < .55: bad.append(f"outline dark ratio {info['outline']}")
    # 8. 縮小可讀性:待機剪影縮到 32 px 高,跟其他職業(新規格英雄 + 舊英雄圖集的其他職業)剪影的 IoU < 0.8
    def sil(a):
        m = a[..., 3] > 0; ys, xs = np.nonzero(m); m = m[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
        im = Image.fromarray((m * 255).astype(np.uint8)).resize((max(1, round(m.shape[1] * 32 / m.shape[0])), 32), Image.BOX)
        out = np.zeros((32, 40), bool); w = min(40, im.width); out[:, (40 - w) // 2:(40 - w) // 2 + w] = np.asarray(im)[:, :w] > 127; return out
    me = sil(f); old = json.loads((ROOT / "assets/hero@4x.manifest.json").read_text(encoding="utf-8"))["cells"]
    sheet = np.asarray(Image.open(ROOT / "assets/hero@4x.png").convert("RGBA")); ious = {}
    others = {}
    for k, cc in old.items():   # 舊英雄圖集(同職業的舊版不算 —— 本來就是同一個角色)
        if k != hero: others[k] = sil(sheet[cc["y"]:cc["y"] + cc["h"], cc["x"]:cc["x"] + cc["w"]])
    for p in H.glob("*.json"):   # 其他新規格英雄(用它們的待機第 1 格)
        k = p.stem
        if k.endswith("-fx") or k == hero: continue
        m2 = json.loads(p.read_text(encoding="utf-8")); i2 = np.asarray(Image.open(H / f"{k}.png").convert("RGBA")); others[k] = sil(frames(i2, m2["actions"]["idle"])[0])
    for k, o in others.items():
        ious[k] = round(float((me & o).sum() / max(1, (me | o).sum())), 2)
    info["silhouetteIoU"] = ious
    for k, v in ious.items():
        if v >= .8: bad.append(f"silhouette too similar to {k} at 32px (IoU {v})")
    return bad, info


if __name__ == "__main__":
    heroes = sys.argv[1:] or [p.stem for p in H.glob("*.json") if not p.stem.endswith("-fx")] + [f"monster:{p.stem}" for p in M.glob("*.json")]
    fail = 0
    for h in heroes:
        bad, info = audit(h.split(":")[1], M) if h.startswith("monster:") else audit(h)
        print(f"{h}: {'PASS' if not bad else 'FAIL'} {info}")
        for b in bad: print("  " + b)
        fail += len(bad)
    sys.exit(1 if fail else 0)
