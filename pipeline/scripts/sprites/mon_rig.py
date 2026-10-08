"""mon_rig.py <type> <size> <cell> [extra_json] — 魔物 rig.json(sprites/characters/MONSTER_<TYPE>_001):側面關鍵表 hv4/mon3-<type>-keysA.png(待機+攻擊 3 格)。
美術最長邊 = 遊戲尺寸 × 72/21(Visual Bible 第 1 節)→ pixelize 目標高;腳(最低 4 列)、膝帶、左右腳 anchor 由待機格自動量。
魔物沒有武器層;extra_json 合併進 rig(例如 {"rigged":{"walk":{"mode":"hop"}}})。"""
import json, sys
from pathlib import Path
import numpy as np
ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(Path(__file__).resolve().parent)); sys.path.insert(0, str(ROOT / "pipeline/scripts/heroes"))
import build_hero as B, make_anim as MA, unfake


def merge(a, b):
    for k, v in b.items(): a[k] = merge(a.get(k, {}), v) if isinstance(v, dict) and isinstance(a.get(k), dict) else v
    return a


typ, size, cell = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]); extra = json.loads(sys.argv[4]) if len(sys.argv) > 4 else {}
sheet = f"output/l0veyou/hv4/mon3-{typ}-keysA.png"; art = round(size * 72 / 21)
im0 = B.cut(ROOT / sheet, (4, 1))[0][0]; H = round(art * im0.height / max(im0.size))
us, _ = MA.sheet_frames({"sheet": sheet, "grid": [4, 1], "frames": 4, "pixelize": H})
d = ROOT / f"sprites/characters/MONSTER_{typ.upper()}_001"; d.mkdir(parents=True, exist_ok=True)
pal = unfake.limit_palette(us); (d / "palette.json").write_text(json.dumps(pal.tolist()), encoding="utf-8")
a = np.asarray(unfake.apply_palette(us[0], pal)); al = a[..., 3] > 0; h, w = al.shape
bot = int(h - 1); xs = np.nonzero(al[bot - 1:].any(0))[0]
runs = np.split(xs, np.nonzero(np.diff(xs) > 1)[0] + 1); lf, rf = int(runs[0].mean()), int(runs[-1].mean())
if len(runs) == 1: lf, rf = int(xs.min() + .25 * np.ptp(xs)), int(xs.min() + .75 * np.ptp(xs))
foot = h - 4; knee = foot - max(4, round(h * .1))
top = int(np.nonzero(al.any(1))[0].min()); cx = int(np.nonzero(al[top:top + max(6, h // 5)].any(0))[0].mean())
rig = {"id": f"MONSTER_{typ.upper()}_001", "version": "v01", "monster": True, "cell": cell, "artSize": art, "gameSize": size,
       "source": {"sheet": sheet, "grid": [4, 1], "frame": 0, "unfake": True, "keysheet": True, "pixelize": H},
       "knee": knee, "foot": foot, "layers": {},
       "idle": {"frames": 8, "body": [0, 0, 1, 1, 1, 1, 0, 0]},
       "anchors": {"HEAD": [cx, top + 8], "BODY": [w // 2, h // 2], "LEFT_FOOT": [lf, bot], "RIGHT_FOOT": [rf, bot]},
       "anchorLayer": {"LEFT_FOOT": "feet", "RIGHT_FOOT": "feet"},
       "anims": {"attack": {"sheet": sheet, "grid": [4, 1], "frames": 4, "pixelize": H, "frameTime": 0.075, "loop": False, "release": 5, "impact": 6}},
       "rigged": {"walk": {"stride": max(3, (rf - lf) // 6)}, "attack": {"keys": {"wind": ["attack", 1], "max": ["attack", 2], "rec": ["attack", 3]}, "stripFlash": True, "dx": {}},
                  "death": {"proc": True, "wk": 0}, "hurt": {"lean": [-2, -1, -1], "wdx": [0, 0, 0], "dx": [-1, -1, -1], "wdy": [0, 0, 0]}},
       "outlineTarget": .75, "keyDespeck": 10}
merge(rig, extra)
(d / "rig.json").write_text(json.dumps(rig, ensure_ascii=False, indent=1), encoding="utf-8")
print(rig["id"], "key", (w, h), "art", art, "pixelize", H, "knee", knee, "foot", foot, "feet", lf, rf)
