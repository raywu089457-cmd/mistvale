"""make_prompts_dir.py name... — 正面/背面關鍵姿勢表提示詞(2x1:1 正面待機、2 背面待機;同一張圖 → 同一像素密度)。
name = priest … / slime …(魔物不加 mon3- 前綴);來源 output/l0veyou/prompts_hv/dir-<name>-down/up.txt,輸出 prompts_keys/<name>-dir.txt。
正面/背面的 idle、walk 由這兩個關鍵姿勢圖層位移產生(make_dir.py),不另外生逐格圖。"""
import re, sys
from pathlib import Path
L = Path(__file__).resolve().parents[3] / "output/l0veyou"
for name in sys.argv[1:]:
    dn = (L / f"prompts_hv/dir-{name}-down.txt").read_text(encoding="utf-8")
    up = (L / f"prompts_hv/dir-{name}-up.txt").read_text(encoding="utf-8")
    mon = "monster" in dn.split(".")[0]
    who = "monster" if mon else "character"
    fdir = re.search(r"FRONT VIEW: ([^.]*)\.", dn).group(1); bdir = re.search(r"BACK VIEW: ([^.]*)\.", up).group(1)
    out = dn.replace("EXACTLY 10 frames in a 5x2 grid (5 columns x 2 rows): frames 1-4 idle, frames 5-10 a walk cycle.",
                     "EXACTLY 2 frames in a 2x1 grid (2 columns x 1 row): frame 1 the FRONT view, frame 2 the BACK view.")
    out = out.replace("but show it from a different direction", "but show it from the front and from the back")
    out = re.sub(r"FRONT VIEW: [^.]*\. Same direction in every frame\.", "", out)
    out = re.sub(r"Frames: .*", f"Frames: (1) FRONT VIEW idle stance: {fdir}; (2) BACK VIEW idle stance: {bdir}.", out, count=1)
    out = re.sub(r"Every frame is the SAME",
                 f"Both frames show the SAME {who} at exactly the same size, the same height from the top of the head to the feet and the same pixel size as the reference image; "
                 f"only the facing direction changes. Each {who} is drawn LARGE, filling about 80% of the cell height, standing still with both feet on the same ground line. Every frame is the SAME", out, count=1)
    (L / f"prompts_keys/{name}-dir.txt").write_text(out, encoding="utf-8")
    print(name, "ok")
