"""Wire the PixelLab character into mistvale's rig schema (4x master, bbox-derived joints)."""

import json
from pathlib import Path

from PIL import Image

ROOT = Path(r"C:\Users\ray\Documents\Codex\2026-09-29\new-chat\work\mistvale")
SRC = ROOT / "output/pixellab/frostwarden/Idle/rotations/east.png"
SHEET = ROOT / "output/l0veyou/hv2/icewarden-idle-v1.png"
CID = "HERO_ICEWARDEN_001"
DIR = ROOT / "sprites/characters" / CID

im = Image.open(SRC).convert("RGBA")
bbox = im.getbbox()
x0, y0, x1, y1 = bbox
h = y1 - y0
cx = (x0 + x1) // 2
print(f"source {im.size} bbox={bbox} h={h} cx={cx}")

# 4x nearest upscale -> unfake detects pitch 4 and recovers 128px native
big = im.resize((im.width * 4, im.height * 4), Image.NEAREST)
cell = big.size[0]
sheet = Image.new("RGBA", (cell * 4, cell), (0, 0, 0, 0))
sheet.paste(big, (0, 0))
SHEET.parent.mkdir(parents=True, exist_ok=True)
sheet.save(SHEET)
print(f"sheet {sheet.size} -> {SHEET}")

feet = y1 - 1
knee = int(feet - h * 0.22)
foot = int(feet - h * 0.02)

rig = {
    "id": CID,
    "version": "v01",
    "source": {"sheet": str(SHEET.relative_to(ROOT)).replace("\\", "/"),
               "grid": [4, 1], "frame": 0, "unfake": True},
    "knee": knee,
    "foot": foot,
    "layers": {},
    "idle": {"frames": 8, "body": [0, 0, 1, 1, 1, 1, 0, 0]},
    "anchors": {
        "HEAD": [cx, int(y0 + h * 0.22)],
        "BODY": [cx, int(y0 + h * 0.55)],
        "LEFT_HAND": [int(cx - h * 0.18), int(y0 + h * 0.70)],
        "RIGHT_HAND": [int(cx + h * 0.24), int(y0 + h * 0.72)],
        "LEFT_FOOT": [int(cx - h * 0.10), feet],
        "RIGHT_FOOT": [int(cx + h * 0.10), feet],
        "WEAPON_GRIP": [int(cx + h * 0.22), int(y0 + h * 0.72)],
    },
    "anchorLayer": {},
    "anims": {
        "walk": {"sheet": str(SHEET.relative_to(ROOT)).replace("\\", "/"),
                 "grid": [4, 1], "frames": 8, "frameTime": 0.1, "loop": True},
        "hurt": {"sheet": str(SHEET.relative_to(ROOT)).replace("\\", "/"),
                 "grid": [4, 1], "frames": 4, "frameTime": 0.1, "loop": False},
    },
    "rigged": {"walk": {"stride": 8}, "hurt": {}},
}

DIR.mkdir(parents=True, exist_ok=True)
(DIR / "rig.json").write_text(json.dumps(rig, ensure_ascii=False, indent=1), encoding="utf-8")
print(f"knee={knee} foot={foot} -> {DIR / 'rig.json'}")
