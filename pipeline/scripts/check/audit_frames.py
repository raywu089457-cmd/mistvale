"""audit_frames.py — 每個動作的動畫格數 vs 商業像素遊戲常見最低標準(Stardew/Moonlighter 等級):
走路 ≥4、待機 ≥2、攻擊 ≥3(蓄力/出手/收招)、受擊 ≥2、倒下 ≥2。
讀新規格素材(assets/heroes/*.json、assets/monsters3/*.json 的 actions.frames)。
用法:python pipeline/scripts/check/audit_frames.py   (exit 1 = 有動作不足)"""
import json, sys
from pathlib import Path
A = Path(__file__).resolve().parents[3] / "assets"
NEED = {"walk": 4, "idle": 2, "attack": 3, "hurt": 2, "death": 2}
bad = []
for folder, label in ((A / "heroes", "hero"), (A / "monsters3", "monster")):
    for p in sorted(folder.glob("*.json")):
        if p.stem.endswith("-fx") or p.parent.name == "_pre_newpipe":
            continue
        meta = json.loads(p.read_text(encoding="utf-8"))
        acts = meta.get("actions", {})
        for act, need in NEED.items():
            n = acts.get(act, {}).get("frames", 0)
            if n < need:
                bad.append(f"{label} {p.stem} {act}: {n} < {need}")
print(f"issues {len(bad)}")
for b in bad:
    print("  " + b)
sys.exit(1 if bad else 0)
