"""set_keysheet_rig.py <char_dir> <keysheetA.png> knee foot weapon_rects_json lfoot_x rfoot_x ground_y grip_x grip_y [extra_json]
把 rig.json 切換成 keysheet 模式(待機 = A 表第 1 格,攻擊關鍵 = 第 2–4 格,死亡程式化)。"""
import json, sys
from pathlib import Path
d = Path(sys.argv[1]); r = json.loads((d / "rig.json").read_text(encoding="utf-8"))
sheet, knee, foot, rects, lx, rx, gy, gx, gyy = sys.argv[2], *map(int, sys.argv[3:5]), json.loads(sys.argv[5]), *map(int, sys.argv[6:11])
extra = json.loads(sys.argv[11]) if len(sys.argv) > 11 else {}
cols = extra.pop("cols", 4); pz = extra.pop("pixelize", None)
r["source"] = {"sheet": sheet, "grid": [cols, 1], "frame": 0, "unfake": True, "keysheet": True, **({"pixelize": pz} if pz else {})}
r["knee"], r["foot"] = knee, foot
r["layers"] = {"weapon": {"rects": rects, "num": 8, "z": extra.pop("z", "front")}}
r["anchors"] = {**r.get("anchors", {}), "LEFT_FOOT": [lx, gy], "RIGHT_FOOT": [rx, gy], "WEAPON_GRIP": [gx, gyy]}
r["anims"] = {"attack": {"sheet": sheet, "grid": [cols, 1], "frames": cols, **({"pixelize": pz} if pz else {}), "frameTime": 0.075, "loop": False, "release": 5, "impact": 6}}
r["rigged"] = {"walk": {"stride": extra.pop("stride", 6)}, "attack": {"keys": {"wind": ["attack", 1], "max": ["attack", 2], "rec": ["attack", 3]}, "stripFlash": True, "dx": extra.pop("dx", {})}, "death": {"proc": True}}
r.update(extra)
(d / "rig.json").write_text(json.dumps(r, ensure_ascii=False, indent=1), encoding="utf-8")
