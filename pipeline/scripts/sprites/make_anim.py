"""make_anim.py — walk / attack / hurt / death(以及其他非 idle 動畫):AI 逐格動畫表 → unfake 真像素 → 共用色盤 → 母版 sheet。

用法:python pipeline/scripts/sprites/make_anim.py sprites/characters/<ID> [anim ...]   (預設 rig.json 裡 anims 全部)

為什麼跟 idle 不一樣:idle 微幅位移可以由一張關鍵姿勢 + 圖層位移做出(make_idle.py,頭/武器逐像素不變)。
walk/attack/hurt/death 的姿勢差太大,圖層位移做不出來,所以這幾個動作讓 AI 畫「連續 N 格」(提示詞照 Pipeline 第 17 節),
這裡負責把它們變成跟 idle 同規格的真像素:
  1. 每張表先量一次原生格距(同一張表格距相同),每格只在 ±4% 內找相位 → unfake 取樣(不縮放)。
  2. idle + 所有動畫的所有格一起選 ≤16 色 → palette.json(同一角色所有動畫共用一份),idle 之後要用 make_idle.py 重跑套同一份色盤。
  3. 對位:腳底 = ground line(取軀幹欄 ±30% 寬內最低的像素,武器尖端不算),軀幹中心 = 軸 x。
  4. 輸出跟 idle 同格式:母版 = 邏輯 ×4,4 欄 × ceil(n/4) 列;export json 的 anchors 只有 GROUND/HEAD/BODY(HEAD/BODY 為頂部/軀幹的近似值,
     腳/武器握把 anchor 與逐像素剛性檢查只對 idle 有意義,sprite_qa.py 對非 idle 動畫略過)。
rig.json 的 anims:{ "walk": {"sheet","grid":[c,r],"frames":n,"frameTime":s,"loop":bool,"release":i,"impact":i} }(release/impact 為 1 起算的格號)。
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "pipeline" / "scripts" / "heroes"))
import build_hero as B  # noqa: E402
sys.path.insert(0, str(Path(__file__).resolve().parent))
import unfake  # noqa: E402
import make_idle as MI  # noqa: E402

SCALE, LCELL, GROUND, AXIS, COLS = MI.SCALE, MI.LCELL, MI.GROUND, MI.AXIS, MI.COLS


def sheet_frames(spec):
    parts = spec.get("sheets") or [{"sheet": spec["sheet"], "grid": spec["grid"], "frames": spec["frames"]}]
    fr = [f for q in parts for f in B.cut(ROOT / q["sheet"], tuple(q["grid"]))[:q["frames"]]]
    if len(fr) < spec["frames"] or any(f is None for f in fr): sys.exit(f"{spec['sheet']}: expected {spec['frames']} frames, got {len(fr)} / empty cell")
    ims = [f[0] for f in fr]
    if spec.get("pixelize"):   # 原生格距太粗、角色太矮時:全表同一縮放比(由待機格決定)+同一份 16 色,取樣成目標身高
        k = spec["pixelize"] / ims[0].height; pal = B.palette(ims)
        return [B.pixelize(im, k, pal) for im in ims], 5.0
    ps = []
    for im in ims:
        g = unfake.detect_grid(np.asarray(im.convert("RGBA"))); p = (g[0][0] + g[1][0]) / 2
        ps.append(p / 2 if p > 8 else p)   # 偵測器偶爾抓到 2× 倍數
    hint = float(np.median(ps))
    out = [unfake.unfake(im, hint)[0] for im in ims]
    return out, hint


def place(u):
    """把一格真像素圖放進 LCELL 邏輯格:腳底對 ground、軀幹中心對軸。回傳 (cell, 軀幹中心 x 偏移, 頂 y)。"""
    a = np.asarray(u); H, W = a.shape[:2]; al = a[..., 3] > 0
    tx = B.torso_x(u); lo, hi = int(max(0, tx - .3 * W)), int(min(W, tx + .3 * W) + 1)
    rows = np.nonzero(al[:, lo:hi].any(1))[0]; bot = rows.max() + 1   # 軀幹欄內最低列(不含 +1 的 exclusive)
    ox = AXIS - int(round(tx)); oy = GROUND - bot
    cell = np.zeros((LCELL, LCELL, 4), np.uint8)
    ys0, xs0 = max(0, -oy), max(0, -ox); ys1, xs1 = min(H, LCELL - oy), min(W, LCELL - ox)
    if ys1 <= ys0 or xs1 <= xs0: sys.exit("frame does not fit the cell")
    clipped = (oy < 0 or ox < 0 or oy + H > LCELL or ox + W > LCELL)
    cell[oy + ys0:oy + ys1, ox + xs0:ox + xs1] = a[ys0:ys1, xs0:xs1]
    return cell, tx + ox, int(np.nonzero(al.any(1))[0].min() + oy), clipped


def write(char_dir, rig, anim, cells, tops, spec, hint, clips, extra_src=None):
    cid, ver = rig["id"].lower(), rig["version"]
    up = lambda a: Image.fromarray(a, "RGBA").resize((a.shape[1] * SCALE, a.shape[0] * SCALE), Image.NEAREST)
    C = LCELL * SCALE
    n = len(cells); rows = -(-n // COLS)
    sheet = Image.new("RGBA", (C * COLS, C * rows), (0, 0, 0, 0)); sheet1 = Image.new("RGBA", (LCELL * COLS, LCELL * rows), (0, 0, 0, 0))
    d = char_dir / anim; (d / "frames").mkdir(parents=True, exist_ok=True)
    base = f"{cid}_{anim}_{ver}"
    for k, c in enumerate(cells):
        x, y = k % COLS, k // COLS
        sheet.alpha_composite(up(c), (x * C, y * C)); sheet1.alpha_composite(Image.fromarray(c, "RGBA"), (x * LCELL, y * LCELL))
        up(c).save(d / "frames" / f"{base}_f{k + 1:02d}.png")
    sheet.save(d / f"{base}.png")
    (char_dir / "export" / "game").mkdir(parents=True, exist_ok=True)
    sheet.save(char_dir / "export" / f"{base}.png"); sheet1.save(char_dir / "export" / "game" / f"{base}_1x.png")
    anchors = []
    for k, c in enumerate(cells):
        al = c[..., 3] > 0; xs = np.nonzero(al.any(0))[0]
        anchors.append({"GROUND": [AXIS * SCALE, GROUND * SCALE], "BODY": [AXIS * SCALE + SCALE // 2, (tops[k] + (GROUND - tops[k]) // 2) * SCALE],
                        "HEAD": [AXIS * SCALE + SCALE // 2, (tops[k] + 8) * SCALE]})
    palette = sorted({"#%02x%02x%02x" % tuple(p[:3]) for c in cells for p in c.reshape(-1, 4) if p[3]})
    meta = {"id": rig["id"], "version": ver, "animation": anim, "frames": n, "layout": {"columns": COLS, "rows": rows}, "cell": C, "sheet": list(sheet.size),
            "logicalScale": SCALE, "logicalCell": LCELL, "frameTime": spec["frameTime"], "loop": spec.get("loop", False), "facing": "right",
            "groundY": GROUND * SCALE, "axisX": AXIS * SCALE, "characterHeight": (GROUND - min(tops)) * SCALE, "anchors": anchors, "palette": palette,
            "source": {"sheets": spec.get("sheets") or [{"sheet": spec["sheet"], "grid": spec["grid"]}], "unfake": True, "pitch": round(hint, 2)}, "rig": "rig.json", "anchorsApprox": True}
    for kk in ("release", "impact"):
        if kk in spec: meta[kk] = spec[kk]; meta["keyFrameBase"] = 1
    (char_dir / "export" / f"{base}.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{rig['id']} {anim}: {n} frames, sheet {sheet.size}, pitch {hint:.2f}" + (f", CLIPPED frames {[i + 1 for i, c in enumerate(clips) if c]}" if any(clips) else ""))



def main(char_dir: Path, only=None):
    rig = json.loads((char_dir / "rig.json").read_text(encoding="utf-8")); cid, ver = rig["id"].lower(), rig["version"]
    anims = {k: v for k, v in rig["anims"].items() if not only or k in only}
    # 1 unfake 全部
    allf = {k: sheet_frames(v) for k, v in rig["anims"].items()}
    idle_u = unfake.unfake(B.cut(ROOT / rig["source"]["sheet"], tuple(rig["source"]["grid"]))[rig["source"]["frame"]][0])[0]
    # 2 共用色盤(idle 關鍵姿勢 + 所有動畫的所有格)
    pal = unfake.limit_palette([idle_u] + [u for us, _ in allf.values() for u in us])
    (char_dir / "palette.json").write_text(json.dumps(pal.tolist()), encoding="utf-8")
    print(f"shared palette: {len(pal)} colours")
    idle_pitch = unfake.detect_grid(np.asarray(idle_u.convert("RGBA")))
    up = lambda a: Image.fromarray(a, "RGBA").resize((a.shape[1] * SCALE, a.shape[0] * SCALE), Image.NEAREST)
    C = LCELL * SCALE
    for anim, spec in anims.items():
        us, hint = allf[anim]
        if abs(hint / 5.0 - 1) > .15: print(f"  WARN {anim}: native pitch {hint:.2f} differs from the idle key pose (像素大小不一致)")
        cells, tops, clips = [], [], []
        for u in us:
            c, _, top, clip = place(unfake.apply_palette(u, pal)); cells.append(np.asarray(c)); tops.append(top); clips.append(clip)
        write(char_dir, rig, anim, cells, tops, spec, hint, clips)


if __name__ == "__main__":
    main(Path(sys.argv[1]), sys.argv[2:] or None)
