"""audit_frames.py — 每個動作的動畫格數 vs 商業像素遊戲常見最低標準(Stardew/Moonlighter 等級):
走路 ≥4、待機 ≥2、攻擊 ≥3(蓄力/出手/收招)、受擊 ≥2、倒下 ≥2。格對應照 pixel-world.js 實際使用的 id。
用法:python pipeline/scripts/check/audit_frames.py   (exit 1 = 有動作不足)"""
import json, sys
from pathlib import Path
A = Path(__file__).resolve().parents[3] / "assets"
hp = set(json.loads((A / "heropose@4x.manifest.json").read_text(encoding="utf-8"))["cells"])
mo = set(json.loads((A / "monsters@2x.manifest.json").read_text(encoding="utf-8"))["cells"])
NEED = {"walk": 4, "idle": 2, "attack": 3, "hurt": 2, "death": 2}
HERO = {"walk": ["walk1", "walk2", "walk3", "walk4"], "idle": ["@idle", "idle2"], "attack": ["windup", "strike", "strike2"],
        "hurt": ["hurt", "hurt2"], "death": ["falling", "dead"]}
MON = {"walk": [3, 6, 10, 11], "idle": [0, 5], "attack": [1, 2, 7], "hurt": [4, 8], "death": [8, 9]}
bad = []
for cls in ["berserker", "ranger", "paladin", "sorcerer", "darkknight", "priest"]:
    for act, ids in HERO.items():
        n = sum(1 for i in ids if i == "@idle" or f"{cls}_{i}" in hp)
        if n < NEED[act]: bad.append(f"hero {cls} {act}: {n} < {NEED[act]}")
for t in ["slime", "wolf", "golem", "boss"]:
    for act, ids in MON.items():
        n = sum(1 for i in ids if f"{t}{i}" in mo)
        if n < NEED[act]: bad.append(f"monster {t} {act}: {n} < {NEED[act]}")
print(f"issues {len(bad)}"); [print("  " + b) for b in bad]; sys.exit(1 if bad else 0)
