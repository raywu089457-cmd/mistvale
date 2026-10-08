"""new_rig.py <ID> <name> <knee> <foot> <layers-json> <anchors-json> [anchorLayer-json] — 建立 rig.json(idle 曲線沿用聖騎士:身體/武器 [0,0,1,1,1,1,0,0])。
anims 以 hv3 檔名慣例自動填(walk 1 張、attack/death 2 張、hurt 1 張)。"""
import json, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[3]
cid, name, knee, foot, layers, anchors = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), json.loads(sys.argv[5]), json.loads(sys.argv[6])
al = json.loads(sys.argv[7]) if len(sys.argv) > 7 else {}
h = "output/l0veyou/hv3/%s-%s-v1.png"
two = lambda a: {"sheets": [{"sheet": h % (name, f"{a}-{t}"), "grid": [4, 1], "frames": 4} for t in "ab"], "frames": 8}
rig = {"id": cid, "version": "v01", "source": {"sheet": f"output/l0veyou/hv2/{name}-idle-v1.png", "grid": [4, 1], "frame": 0, "unfake": True},
       "knee": knee, "foot": foot, "layers": layers,
       "idle": {"frames": 8, "body": [0, 0, 1, 1, 1, 1, 0, 0], **{k: [0, 0, 1, 1, 1, 1, 0, 0] for k in layers}},
       "anchors": anchors, "anchorLayer": al,
       "anims": {"walk": {**two("walk"), "frameTime": .1, "loop": True},
                 "attack": {**two("attack"), "frameTime": .075, "loop": False, "release": 5, "impact": 6},
                 "hurt": {"sheet": h % (name, "hurt"), "grid": [4, 1], "frames": 4, "frameTime": .1, "loop": False},
                 "death": {**two("death"), "frameTime": .12, "loop": False}}}
d = ROOT / "sprites/characters" / cid; d.mkdir(parents=True, exist_ok=True)
(d / "rig.json").write_text(json.dumps(rig, ensure_ascii=False, indent=1), encoding="utf-8")
