"""make_prompts_keys.py name... — 產生「關鍵姿勢表」提示詞(4x2 = 8 個關鍵姿勢,同一張圖 → 同一像素密度)。
name = darkknight … 或 mon3-wolf …;輸出 output/l0veyou/prompts_keys/<name>-keys.txt
格: 1 待機站姿(= 參考圖)  2 攻擊 wind-up  3 攻擊最大出手(release)  4 攻擊 recovery  5 死亡受擊  6 倒下(跪)  7 倒地  8 最終倒地。
walk / hurt / 其餘過渡格不生圖,由待機關鍵姿勢圖層位移產生(ANIMATION_SPEC「製作方式」)。"""
import re, sys
from pathlib import Path
L = Path(__file__).resolve().parents[3] / "output/l0veyou"
DEATH_H = ["struck hard, body jolting back and tilting", "dropping to both knees, weapon lowered", "lying defeated flat on the ground, face down", "lying still on the ground, eyes closed (x x), the final pose"]
DEATH_M = ["struck hard, jolting back", "collapsing, losing balance", "lying defeated on the ground, eyes as x x", "the same lying pose, completely still"]
SAME = "Same character, same proportions, same equipment, same weapon, same camera, same scale, same pixel density in every cell. "
SIZE = "Draw every standing or kneeling pose at exactly the same size and the same pixel size as the character in the reference image (about the same height as the reference in every cell); only the pose changes. Each standing character is drawn LARGE, filling about 85% of the cell height from the top of the head to the feet, with fine small pixels. "
for name in sys.argv[1:]:
    t = (L / f"prompts_hv/{name}-attack.txt").read_text(encoding="utf-8")
    items = [x.strip().rstrip('.') for x in re.findall(r"\(\d\) ([^;]+)", re.search(r"Frames: (.*)", t).group(1))]
    d = DEATH_M if name.startswith("mon3-") else DEATH_H
    idle = (L / f"prompts_hv/{name}-idle.txt").read_text(encoding="utf-8")
    ready = re.findall(r"\(1\) ([^;]+)", re.search(r"Frames: (.*)", idle).group(1))[0].strip().rstrip('.')
    sel = [f"the idle ready stance exactly as in the reference image ({ready})", f"ATTACK wind-up: {items[2]}", f"ATTACK full strike (maximum extension): {items[4]}", f"ATTACK recovery: {items[6]}"] + [f"DEATH {i + 1}: {x}" for i, x in enumerate(d)]
    (L / "prompts_keys").mkdir(exist_ok=True)
    for tag, pick in (("A", sel[0:4]), ("B", [sel[0]] + sel[4:7]), ("C", sel[0:3]), ("D", sel[0:4])):
        n = len(pick)
        out = re.sub(r"EXACTLY 8 frames in a 4x2 grid \(4 columns x 2 rows\)", f"EXACTLY {n} frames in a {n}x1 grid ({n} columns x 1 row)", t)
        if tag == "C": out = out.replace("the arrow flies off to the right, ", "the arrow is just leaving the bow, ").replace("with plenty of empty space around it", "with only a small margin around it")
        if tag == "C": out = re.sub(r"Every frame is the SAME", "Each cell is tall and wide enough for the character at large size; no flying projectiles or effects outside the character silhouette. Every frame is the SAME", out, count=1)
        out = re.sub(r"Frames: .*", lambda m: "Frames: " + "; ".join(f"({i + 1}) {x}" for i, x in enumerate(pick)) + ".", out, count=1)
        out = re.sub(r"Every frame is the SAME", SAME + SIZE + "Every frame is the SAME", out, count=1)
        if tag == "C":
            out = re.sub(r"(the arrow|a purple magic orb|[a-z ]*orb) (flies|shoots) off to the right", lambda m: (m.group(1) + " is just leaving the weapon") if "arrow" in m.group(1) else "the magic orb is just forming at the staff tip", out).replace("with plenty of empty space around it", "with only a small margin around it")
        if tag == "D": out = out.replace("with fine small pixels.", "with fine small pixels: HIGH-RESOLUTION pixel art, the sprite is built from about 80 pixel rows from head to feet, every single pixel tiny (about 1/80 of the character height), rich detail, never chunky or blocky, never 2x2 pixel blocks.")
        if tag == "C": out = out.replace("filling about 85% of the cell height", "filling about 65% of the cell height")
        (L / f"prompts_keys/{name}-keys{tag}.txt").write_text(out, encoding="utf-8")
    print(name, "ok")
