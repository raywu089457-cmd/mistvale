"""make_prompts_hv3.py — 由 prompts_hv/<name>-<anim>.txt 派生新聖經張數的提示詞(walk 8、attack 8→2×4、hurt 4、death 8→2×4)。
用法:python make_prompts_hv3.py name [name...]   name = darkknight … 或 mon3-wolf …"""
import re, sys
from pathlib import Path
L = Path(__file__).resolve().parents[3] / "output/l0veyou"
SAME = "Same character, same proportions, same equipment, same weapon, same camera, same scale, same pixel density, continuous animation. "
WALK = "(1) contact: right foot forward, arms swinging opposite; (2) down: body lowest; (3) passing: right leg passing, body mid; (4) up: body highest, pushing off; (5) contact: left foot forward; (6) down: body lowest; (7) passing: left leg passing; (8) up: body highest, pushing off. A smooth walk cycle where frame 8 flows into frame 1."
HURT = "(1) normal ready stance; (2) hit from the right, head snapping back, eyes squeezed shut; (3) knocked back a little, staggering; (4) returning to the ready stance, facing right."
DEATH_H = ["struck, body jolting back", "staggering back", "dropping to one knee, weapon lowered", "both knees down", "collapsing forward", "lying face down on the ground", "lying still, eyes closed (x x)", "the same final lying pose, held"]
DEATH_M = ["struck hard, jolting back", "staggering, losing balance", "collapsing", "falling down", "lying defeated on the ground, eyes as x x", "the same lying pose, held", "the body starting to break into a few pixel puffs", "a few last pixel puffs over the small remains"]
def derive(name, anim):
    t = (L / f"prompts_hv/{name}-{anim}.txt").read_text(encoding="utf-8")
    t = re.sub(r"Every frame is the SAME", SAME + "Every frame is the SAME", t, 1)
    def mk(n, cols, rows, frames):
        s = re.sub(r"EXACTLY \d+ frames in a \d+x\d+ grid \(\d+ columns x \d+ rows?\)", f"EXACTLY {n} frames in a {cols}x{rows} grid ({cols} columns x {rows} row{'s' if rows > 1 else ''})", t, 1)
        return re.sub(r"Frames: .*", lambda m: "Frames: " + frames, s, 1)
    out = {}
    if anim == "walk":
        items = [x.strip().rstrip('.') for x in re.findall(r"\(\d\) ([^;]+?)(?:;|\. A smooth)", WALK)]
        for tag, sub in (("a", items[:4]), ("b", items[4:])): out[f"walk-{tag}"] = mk(4, 4, 1, "; ".join(f"({i + 1}) {x}" for i, x in enumerate(sub)) + ". A smooth walk cycle" + (" that continues into frame 1 of the next sheet." if tag == "a" else " where frame 4 flows back into the first frame."))
    elif anim == "hurt": out[anim] = mk(4, 4, 1, HURT)
    elif anim == "attack":
        items = [x.strip().rstrip('.') for x in re.findall(r"\(\d\) ([^;]+)", re.search(r"Frames: (.*)", t).group(1))]
        for tag, sub in (("a", items[:4]), ("b", items[4:])):
            out[f"{anim}-{tag}"] = mk(4, 4, 1, "; ".join(f"({i + 1}) {x}" for i, x in enumerate(sub)) + ".")
    elif anim == "death":
        d = DEATH_M if name.startswith("mon3-") else DEATH_H
        for tag, sub in (("a", d[:4]), ("b", d[4:])):
            out[f"{anim}-{tag}"] = mk(4, 4, 1, "; ".join(f"({i + 1}) {x}" for i, x in enumerate(sub)) + ".")
    return out
for name in sys.argv[1:]:
    for anim in ("walk", "attack", "hurt", "death"):
        for k, v in derive(name, anim).items(): (L / f"prompts_hv3/{name}-{k}.txt").write_text(v, encoding="utf-8")
