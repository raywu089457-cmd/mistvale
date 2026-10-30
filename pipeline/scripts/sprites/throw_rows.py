"""throw_rows.py — 把遠程魔物（MONSTER_RANGED 那 7 隻）的 8 個 attack 列改成「投擲」動作，直接改 assets/monsters3 的上線 sheet。

    python pipeline/scripts/sprites/throw_rows.py            # 只出預覽 output/l0veyou/mon8_preview/<id>-throw.png
    python pipeline/scripts/sprites/throw_rows.py --write    # 寫回 assets/monsters3/<id>.png/.json（原檔先備份到 _prevthrow/）

為什麼不用原本的 attack：build_monster_8dir.py 的 attack 是「後仰 → 前衝揮擊」，引擎又會疊執行期前衝（MOTION.attack.fx），
遠程魔物站定丟東西時看起來像衝上去揮手。這裡改成原地投擲（腳不動、不前衝）：
- biped：上半身後仰＋挺高（蓄力舉起）→ 停一格 → 甩向前（出手 = 第 5 格，release 4）→ 跟隨前傾下沉 → 回待機
- blob：壓扁蓄力 → 拉高 → 往前一吐（出手）→ 回彈
上／下方向不做水平傾斜（跟引擎 motionOf 一樣），只用挺高／下沉。
來源只用 sheet 本身的 idle 格（= build_monster_8dir 的 key 幀），所以色盤、大小、格子都不變。
列的 meta 加 bakedMotion:true → 引擎不再疊執行期前衝。
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_monster_8dir import DIRS, MONS, Mon, clamp  # noqa: E402

ROOT = Path(__file__).resolve().parents[3]
SHEETS = ROOT / "assets/monsters3"
RANGED = ["sprout", "shroom", "moss", "snowman", "kobold", "cactus", "floraspirit"]

# (lean, rise, sink)：都是 art 的比例；rise = 膝蓋以上挺高（body_frame d<0），sink = 下沉（d>0）
BIPED = [(0, 0, 0), (-.03, .015, 0), (-.07, .03, 0), (-.08, .035, 0),
         (.06, 0, .02), (.08, 0, .03), (.03, 0, .01), (0, 0, 0)]
BLOB = [(0, 0, 0), (0, 0, .04), (-.02, 0, .07), (-.03, .03, 0),
        (.06, .04, 0), (.07, .02, .02), (.02, 0, .03), (0, 0, 0)]


def throw(M: Mon, spec, side: bool):
    a = M.a
    out = []
    for lean, rise, sink in spec:
        d = round(sink * a) - round(rise * a)
        out.append(M.compose(d, lean_=(lean * a if side else 0)))
    return out


def run(mid: str, write: bool) -> None:
    png, js = SHEETS / f"{mid}.png", SHEETS / f"{mid}.json"
    meta = json.loads(js.read_text(encoding="utf-8"))
    sheet = np.asarray(Image.open(png).convert("RGBA")).copy()
    acts = meta["actions"]
    spec = BLOB if MONS[mid][3] == "blob" else BIPED
    for d, suffix, atk in DIRS:
        idle = acts["idle" + suffix]
        c = idle["cell"]
        key = sheet[idle["y"]:idle["y"] + c, 0:c].copy()
        M = Mon(key, meta["artSize"])
        frames = [clamp(f) for f in throw(M, spec, side=d not in ("north", "south"))]
        row = acts[atk]
        assert row["cell"] == c and row["frames"] == 8, (mid, atk, row["cell"], row["frames"])
        sheet[row["y"]:row["y"] + c, :] = 0
        head = []
        for i, f in enumerate(frames):
            sheet[row["y"]:row["y"] + c, i * c:(i + 1) * c] = f
            al = f[..., 3] > 0
            ys = np.nonzero(al[:, int(c / 2 - .12 * c):int(c / 2 + .12 * c)].any(1))[0]
            head.append([c / 2, int(ys.min())] if len(ys) else None)
        row.update({"release": 4, "impact": 5, "head": head, "bakedMotion": True, "throw": True})
    meta["source"] = meta["source"].split(";throw")[0] + ";throw 列 = throw_rows.py 程式化投擲"
    out = Image.fromarray(sheet, "RGBA")
    print(f"{mid:12s} {MONS[mid][3]:5s} cell={acts['idle']['cell']}")
    if write:
        bak = SHEETS / "_prevthrow"
        bak.mkdir(exist_ok=True)
        for p in (png, js):
            if not (bak / p.name).exists():
                shutil.copy2(p, bak / p.name)
        out.save(png)
        js.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
        webp = png.with_suffix(".webp")
        if webp.exists():
            if not (bak / webp.name).exists():
                shutil.copy2(webp, bak / webp.name)
            out.save(webp, lossless=True)
    else:
        prev = ROOT / "output/l0veyou/mon8_preview"
        prev.mkdir(parents=True, exist_ok=True)
        c = acts["idle"]["cell"]
        rows = [acts[a]["y"] for _, _, a in DIRS]
        strip = Image.new("RGBA", (c * 8, c * 8), (70, 96, 70, 255))
        for r, y in enumerate(rows):
            strip.alpha_composite(out.crop((0, y, c * 8, y + c)), (0, r * c))
        strip.save(prev / f"{mid}-throw.png")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("ids", nargs="*", default=RANGED)
    ap.add_argument("--write", action="store_true")
    a = ap.parse_args()
    for mid in a.ids or RANGED:
        run(mid, a.write)
