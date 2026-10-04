"""audit_pose_jump.py — 換姿勢時角色會不會「跳」:照遊戲的對齊方式(manifest foot 對到畫布中線),
量每個姿勢的軀幹中心 x 跟待機差幾 px(換算成待機寬的比例)。門檻 ≤ 12%;坐/躺類姿勢(rest/eat/sleep/bandaged/dead)本來就會移,只報不判。
軀幹中心:40–75% 高度的每一列取「最長連續不透明段」的中心,取中位數(武器、手臂伸出去不會拉偏)。
用法:python pipeline/scripts/check/audit_pose_jump.py   (exit 1 = 有不合格)"""
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image
A = Path(__file__).resolve().parents[3] / "assets"
def load(n):
    m = json.loads((A / f"{n}.manifest.json").read_text(encoding="utf-8")); im = np.asarray(Image.open(A / m["image"]).convert("RGBA"))
    return {k: (im[c["y"]:c["y"] + c["h"], c["x"]:c["x"] + c["w"], 3] > 127, c) for k, c in m["cells"].items()}
def torso(mask, foot):
    ys = np.nonzero(mask.any(1))[0]; top, bot = ys.min(), ys.max(); H = bot - top + 1; xs = []
    for y in range(int(top + H * .4), int(top + H * .75)):
        row = mask[y]; best, cur, start, bs = 0, 0, 0, 0
        for x, v in enumerate(row):
            if v: cur += 1; start = x if cur == 1 else start
            else: cur = 0
            if cur > best: best, bs = cur, start
        if best: xs.append(bs + best / 2)
    return float(np.median(xs)) - foot
hero, pose = load("hero@4x"), load("heropose@4x")
SIT = {"rest", "eat", "sleep", "bandaged", "dead"}
bad = []
for k, (m, c) in pose.items():
    cls, p = k.split("_", 1); bm, bc = hero[cls]
    base = torso(bm, bc.get("foot", bc["w"] / 2))  # 遊戲對齊:有 foot 用 foot,沒有就置中
    t = torso(m, c["foot"]); d = (t - base) / bm.shape[1]
    tag = "info" if p in SIT else ("FAIL" if abs(d) > .12 else "ok")
    if tag != "ok": print(f"{tag} {k}: torso {t - base:+.0f}px ({d:+.0%} of idle width)")
    if tag == "FAIL": bad.append(k)
print("fail", len(bad)); sys.exit(1 if bad else 0)
