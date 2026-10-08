"""make_dir.py sprites/characters/<ID> — 正面(Down)/背面(Up)的 idle 8 格、walk 8 格。
來源:output/l0veyou/hv4/<name>-dir.png(2x1:1 正面待機、2 背面待機;make_prompts_dir.py / gen_dir.sh)。
- 同一張表兩格用同一縮放比:正面待機的高 = 側面待機第 1 格的高(同一角色同一像素密度),套角色共用色盤 palette.json。
- 動畫全是圖層位移(ANIMATION_SPEC 預設「關鍵姿勢 + 圖層位移」):
  idle = 膝帶以上整塊剛性下沉 [0,0,1,1,1,1,0,0](呼吸);
  walk = 腳底帶以軸線分左右,兩腳輪流抬起 1–2 px,落地格身體下沉 1;史萊姆(rig walk.mode=hop)= 整體跳起 ≤3 px。
- 腳底 = ground line、剪影中心 = 軸;輸出格式同其他動作(make_anim.write),動作名 idleDown/walkDown/idleUp/walkUp。
最後印出簡易 QA(格數、硬邊 alpha、地線、色盤 ⊆ 共用色盤、站姿身高 vs 側面 ±12%、描邊比例、相鄰格連續性)。"""
from __future__ import annotations
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage
sys.path.insert(0, str(Path(__file__).resolve().parent))
import make_idle as MI, make_anim as MA, make_rigged as MR, unfake  # noqa: E402
B = MI.B
ROOT, LCELL, GROUND, AXIS = MI.ROOT, MI.LCELL, MI.GROUND, MI.AXIS
IDLE = [0, 0, 1, 1, 1, 1, 0, 0]
LIFT_L = [0, 1, 2, 1, 0, 0, 0, 0]; LIFT_R = [0, 0, 0, 0, 0, 1, 2, 1]; SINK = [1, 0, 0, 0, 1, 0, 0, 0]
HOP = list(zip([2, 1, 0, 0, 0, 0, 1, 2], [0, 1, 2, 3, 3, 2, 1, 0]))


def body_frame(a, d, knee, foot):
    """膝帶(knee..foot)壓掉 d 列,膝蓋以上整塊下沉 d;腳底列不動(同 make_rigged.body_frame,無縮放)。"""
    if d == 0: return a.copy()
    out = np.zeros_like(a); band = a[knee:foot]; n = len(band)
    out[d:knee + d] = a[:knee]; keep = np.round(np.linspace(0, n - 1, n - d)).astype(int); out[knee + d:foot] = band[keep]
    out[foot:] = a[foot:]
    return out


def place(a):
    """真像素圖 → LCELL 格:腳底 = GROUND、剪影水平中心 = AXIS(正/背面左右對稱)。"""
    al = a[..., 3] > 0; ys = np.nonzero(al.any(1))[0]; xs = np.nonzero(al.any(0))[0]
    crop = a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]; h, w = crop.shape[:2]
    cell = np.zeros((LCELL, LCELL, 4), np.uint8); x0 = AXIS - w // 2; y0 = GROUND - h
    if x0 < 2 or y0 < 2 or x0 + w > LCELL - 2: sys.exit(f"dir pose {w}x{h} does not fit the {LCELL} cell")
    cell[y0:y0 + h, x0:x0 + w] = crop
    return cell


def frames_for(key, hop):
    """key = 已放進格子的待機格。回傳 (idle 8 格, walk 8 格)。"""
    al = key[..., 3] > 0; ys = np.nonzero(al.any(1))[0]; h = ys.max() - ys.min() + 1
    foot = GROUND - 3; knee = foot - max(4, round(h * .1))
    idle = [body_frame(key, d, knee, foot) for d in IDLE]
    if hop:
        return idle, [MI.shift(body_frame(key, d, knee, foot), -lift) for d, lift in HOP]
    walk = []
    for k in range(8):
        b = body_frame(key, SINK[k], knee, foot)
        up, lo = b[:foot], b[foot:].copy(); L = lo.copy(); R = lo.copy(); cols = np.arange(LCELL)
        L[:, cols >= AXIS] = 0; R[:, cols < AXIS] = 0
        f = np.zeros_like(b); f[:foot] = up
        for part, lift in ((L, LIFT_L[k]), (R, LIFT_R[k])):
            p = np.zeros_like(b); p[foot:] = part; p = MI.shift(p, -lift); m = p[..., 3] > 0; f[m] = p[m]
        walk.append(f)
    return idle, walk


def main(char_dir: Path):
    rig = json.loads((char_dir / "rig.json").read_text(encoding="utf-8")); cid = rig["id"]
    name = cid.split("_")[1].lower(); sheet = ROOT / f"output/l0veyou/hv4/{name}-dir.png"
    side = json.loads(sorted((char_dir / "export").glob("*_idle_v*.json"))[-1].read_text(encoding="utf-8"))
    side_h = side["characterHeight"] // side["logicalScale"]
    fr = B.cut(sheet, (2, 1)); ims = [f[0] for f in fr]
    k = side_h / ims[0].height; pal_dir = B.palette(ims)
    pal = np.array(json.loads((char_dir / "palette.json").read_text()), np.uint8)
    hop = rig.get("rigged", {}).get("walk", {}).get("mode") == "hop"
    report = {}
    for im, view in zip(ims, ("Down", "Up")):
        u = unfake.apply_palette(B.pixelize(im, k, pal_dir), pal)
        if view == "Up" and rig.get("dirMirrorUp"): u = u.transpose(Image.FLIP_LEFT_RIGHT)   # 模型把背面裝備畫在跟正面同一側(換手)時鏡像回來
        a = MI.clean_key(np.asarray(u).copy(), {**rig, "keyDespeck": rig.get("keyDespeck", 10)})
        key = MR.outline_fix(place(a), rig.get("outlineTarget", .62))
        idle, walk = frames_for(key, hop)
        for anim, cells, ft in ((f"idle{view}", idle, .16), (f"walk{view}", walk, .1)):
            cells = [MR.despeck(c.copy(), 8) for c in cells]
            spec = {"sheets": [{"sheet": str(sheet.relative_to(ROOT)).replace("\\", "/"), "grid": [2, 1]}], "frameTime": ft, "loop": True}
            if anim.startswith("walk"): spec["cycle"] = 85
            MA.write(char_dir, rig, anim, cells, [MR.cell_top(c) for c in cells], spec, 5.0, [False] * 8)
            report[anim] = qa(cells, pal, side_h, rig.get("monster", False), anim.startswith("walk") and hop)
    ok = all(not v for v in report.values())
    for anim, fails in report.items(): print(f"{cid} {anim}: {'PASS' if not fails else 'FAIL ' + str(fails)}")
    (char_dir / "qa").mkdir(exist_ok=True)
    for anim, fails in report.items():
        (char_dir / "qa" / f"{anim}_qa.json").write_text(json.dumps({"character": cid, "animation": anim, "result": "FAIL" if fails else "PASS", "failed": fails,
            "checks": {"frame_count/alpha/ground/palette_shared/height_vs_side/outline/continuity/inside_cell": "make_dir.qa"}}, ensure_ascii=False, indent=1), encoding="utf-8")
    return ok


def qa(cells, pal, side_h, mon, hop):
    fails = []; M = [c[..., 3] > 0 for c in cells]
    B_ = [(np.nonzero(m.any(0))[0], np.nonzero(m.any(1))[0]) for m in M]
    hs = [int(ys.max() - ys.min() + 1) for xs, ys in B_]; bots = [int(ys.max() + 1) for xs, ys in B_]
    if len(cells) != 8: fails.append("frame_count")
    if any(set(np.unique(c[..., 3])) - {0, 255} for c in cells): fails.append("alpha_binary")
    tol = 3 if (mon or hop) else 1
    if max(bots) != GROUND or min(bots) < GROUND - tol: fails.append(f"ground {bots}")
    pset = {tuple(p) for p in pal[:, :3].tolist()}
    if not all({tuple(p[:3]) for p in c[c[..., 3] > 0].tolist()} <= pset for c in cells): fails.append("palette_not_shared")
    if not mon and not all(abs(h / side_h - 1) <= .12 for h in hs): fails.append(f"height_vs_side {hs} side {side_h}")
    def orat(c):
        m = c[..., 3] > 0; e = m & ~ndimage.binary_erosion(m); return float((c[..., :3].astype(int).sum(2)[e] < 300).mean())
    if min(orat(c) for c in cells) < .55: fails.append(f"outline {[round(orat(c), 2) for c in cells]}")
    cont = [1 - (M[i] & M[(i + 1) % 8]).sum() / (M[i] | M[(i + 1) % 8]).sum() for i in range(8)]
    if max(cont) > .30: fails.append(f"continuity {[round(x, 2) for x in cont]}")
    xs0 = [int(xs.min()) for xs, ys in B_]; xs1 = [int(xs.max()) for xs, ys in B_]
    if min(xs0) < 2 or max(xs1) > LCELL - 3 or min(int(ys.min()) for xs, ys in B_) < 2: fails.append("inside_cell")
    return fails


if __name__ == "__main__":
    sys.exit(0 if main(Path(sys.argv[1])) else 1)
