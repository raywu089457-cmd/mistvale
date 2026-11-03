"""Create HERO_FROSTWARDEN_001: a frost recolour of the paladin, wired into the
project's own rig schema so make_idle / make_rigged can regenerate every sheet.
"""

import colorsys
import json
import os
import shutil
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(r"C:\Users\ray\Documents\Codex\2026-09-29\new-chat\work\mistvale")
SRC_ID = "HERO_PALADIN_001"
NEW_ID = "HERO_FROSTWARDEN_001"
SRC_DIR = ROOT / "sprites" / "characters" / SRC_ID
NEW_DIR = ROOT / "sprites" / "characters" / NEW_ID
FROST_OUT = ROOT / "output" / "l0veyou" / "frost"

# frost palette target
TARGET_HUE = 0.56      # cyan-blue
HueKeep = 0.5          # blend toward target
SAT_SCALE = 0.86
VALUE_FLOOR = 0.05     # keep dark outlines untouched


def recolor(path: Path, out: Path) -> None:
    im = Image.open(path).convert("RGBA")
    arr = np.array(im).astype(np.float32) / 255.0
    rgb, alpha = arr[..., :3], arr[..., 3]
    flat = rgb.reshape(-1, 3)
    out_rgb = np.zeros_like(flat)

    hsv = np.array([colorsys.rgb_to_hsv(*px) for px in flat], dtype=np.float32)
    h, s, v = hsv[:, 0], hsv[:, 1], hsv[:, 2]

    # only tint pixels that actually carry colour and are not near-black
    tint = (s > 0.10) & (v > VALUE_FLOOR)
    nh = h.copy()
    nh[tint] = h[tint] * (1 - HueKeep) + TARGET_HUE * HueKeep
    ns = np.clip(s * SAT_SCALE, 0, 1)

    back = np.array(
        [colorsys.hsv_to_rgb(a, b, c) for a, b, c in zip(nh, ns, v)],
        dtype=np.float32,
    )
    out_rgb = back
    out_rgb = np.clip(out_rgb, 0, 1)

    out_arr = np.concatenate([out_rgb.reshape(rgb.shape), alpha[..., None]], axis=2)
    Image.fromarray((out_arr * 255).round().astype(np.uint8), "RGBA").save(out)


def main() -> None:
    FROST_OUT.mkdir(parents=True, exist_ok=True)
    rig = json.loads((SRC_DIR / "rig.json").read_text(encoding="utf-8"))

    # collect every source sheet the rig references
    paths = set()
    paths.add(rig["source"]["sheet"])
    for spec in rig.get("anims", {}).values():
        if "sheet" in spec:
            paths.add(spec["sheet"])
        for s in spec.get("sheets", []):
            paths.add(s["sheet"])

    mapping = {}
    for rel in sorted(paths):
        src = ROOT / rel
        if not src.exists():
            print(f"  skip (missing): {rel}")
            continue
        dst = FROST_OUT / Path(rel).name
        recolor(src, dst)
        mapping[rel] = str(dst.relative_to(ROOT)).replace("\\", "/")
        print(f"  recoloured {Path(rel).name} -> {dst.name}")

    # rewrite paths
    rig["id"] = NEW_ID
    rig["version"] = "v01"
    rig["source"]["sheet"] = mapping[rig["source"]["sheet"]]
    for spec in rig.get("anims", {}).values():
        if "sheet" in spec and spec["sheet"] in mapping:
            spec["sheet"] = mapping[spec["sheet"]]
        for s in spec.get("sheets", []):
            if s["sheet"] in mapping:
                s["sheet"] = mapping[s["sheet"]]

    NEW_DIR.mkdir(parents=True, exist_ok=True)
    (NEW_DIR / "rig.json").write_text(
        json.dumps(rig, ensure_ascii=False, indent=1), encoding="utf-8"
    )

    if (SRC_DIR / "palette.json").exists():
        shutil.copy2(SRC_DIR / "palette.json", NEW_DIR / "palette.json")

    print(f"\ncreated {NEW_DIR}")
    print("next: make_idle.py then make_rigged.py")


if __name__ == "__main__":
    main()
