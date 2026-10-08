"""audit_pose_jump.py — 換姿勢時角色會不會「跳」:每個動作列的軀幹中心 x 跟待機第 1 格差幾 px
(換算成待機身高的比例,門檻 ≤ 12%)。軀幹中心:40–75% 高度的每一列取「最長連續不透明段」的中心,取中位數
(武器、手臂伸出去不會拉偏)。death(倒地)本來就會移,只報不判。
讀新規格素材(assets/heroes/*.json、assets/monsters3/*.json + 同名 png)。
用法:python pipeline/scripts/check/audit_pose_jump.py   (exit 1 = 有不合格)"""
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image
A = Path(__file__).resolve().parents[3] / "assets"


def torso_center(f):
    m = f[..., 3] > 127
    ys = np.nonzero(m.any(1))[0]
    if not len(ys):
        return None
    top, bot = ys.min(), ys.max()
    H = bot - top + 1
    xs = []
    for y in range(int(top + H * .4), int(top + H * .75)):
        row = m[y]
        best, cur, start, bs = 0, 0, 0, 0
        for x, v in enumerate(row):
            if v:
                cur += 1
                start = x if cur == 1 else start
            else:
                cur = 0
            if cur > best:
                best, bs = cur, start
        if best:
            xs.append(bs + best / 2)
    return float(np.median(xs)) if xs else None


def body_h(f):
    m = f[..., 3] > 127
    ys = np.nonzero(m.any(1))[0]
    return int(ys.max() - ys.min() + 1) if len(ys) else 1


bad, notes = [], []
for folder, label in ((A / "heroes", "hero"), (A / "monsters3", "monster")):
    for p in sorted(folder.glob("*.json")):
        if p.stem.endswith("-fx"):
            continue
        meta = json.loads(p.read_text(encoding="utf-8"))
        png = folder / f"{p.stem}.png"
        if not png.exists():
            continue
        img = np.asarray(Image.open(png).convert("RGBA"))
        acts = meta.get("actions", {})
        idle = acts.get("idle")
        if not idle:
            continue
        f0 = img[idle["y"]:idle["y"] + idle["cell"], 0:idle["cell"]]
        c0, h0 = torso_center(f0), body_h(f0)
        # 同面向才互比:正面/背面/左向的剪影天生就跟側面不同(idleDown0 會比側面待機偏 10–20%)
        def view(name):
            for suf in ("Down", "Up", "Left"):
                if name.endswith(suf) or name.startswith("idle" + suf) or name.startswith("walk" + suf):
                    return suf
            return ""
        base = {"": (c0, h0)}
        for name, a in acts.items():
            v = view(name)
            if v and v not in base:
                f = img[a["y"]:a["y"] + a["cell"], 0:a["cell"]]
                base[v] = (torso_center(f), body_h(f))
        for name, a in acts.items():
            cb, hb = base.get(view(name), (c0, h0))
            for i in range(a.get("frames", 0)):
                f = img[a["y"]:a["y"] + a["cell"], i * a["cell"]:(i + 1) * a["cell"]]
                c = torso_center(f)
                if c is None or cb is None:
                    continue
                d = abs(c - cb) / max(1, hb)
                if d > .12:
                    msg = f"{label} {p.stem} {name}{i}: torso x off {d*100:.0f}% (>12%)"
                    # death(倒地)與 attack/skill(前撲出手,ANIMATION_SPEC Ready→Impact 本來就會移)只報不判
                    (notes if name in ("death", "attack", "skill") else bad).append(msg)
print(f"issues {len(bad)} (death 另有 {len(notes)} 筆只報不判)")
for b in bad + notes:
    print("  " + b)
sys.exit(1 if bad else 0)
