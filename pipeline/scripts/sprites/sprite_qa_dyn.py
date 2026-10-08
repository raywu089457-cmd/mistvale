"""sprite_qa_dyn.py — walk / attack / hurt / death 的 QA(idle 用 sprite_qa.py)。
用法:python pipeline/scripts/sprites/sprite_qa_dyn.py sprites/characters/<ID> [anim ...]   (預設四個全跑)
idle 專用的剛性檢查(腳/頭/武器逐像素不變、固定身高/比例/剪影 IoU)在姿勢會變的動作上沒有意義,這裡換成 ANIMATION_SPEC / PIPELINE 寫的版本:
格數、站姿身高 ±12%(vs idle)、ground line、attack release/impact、hurt knockback ≤2 px、walk 腳步交替、死亡最後一格貼地,
再加上共通項:硬邊/alpha/不出格、裝備色、色盤(≤16 且屬共用色盤)、描邊、朝向、連續性、剪影連通塊、洋紅污染、縮圖雜訊。
(人工項 13–17、H、V 仍要看放大圖;這裡只給代理指標。)"""
from __future__ import annotations
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage
sys.path.insert(0, str(Path(__file__).resolve().parent))
import sprite_qa as Q

SPEC = {"walk": 8, "attack": 8, "hurt": 4, "death": 8}


def run(cd: Path, anim: str):
    meta = json.loads(sorted((cd / "export").glob(f"*_{anim}_v*.json"))[-1].read_text(encoding="utf-8"))
    sheet = Image.open(cd / "export" / f"{meta['id'].lower()}_{anim}_{meta['version']}.png").convert("RGBA")
    S = meta["logicalScale"]; F = Q.cells(sheet, meta); n = len(F); L = [Q.logical(f, S) for f in F]; M = [l[..., 3] > 0 for l in L]
    ref = json.loads(sorted((cd / "export").glob("*_idle_v*.json"))[-1].read_text(encoding="utf-8"))["characterHeight"] // S
    pal = {tuple(c[:3]) for c in json.loads((cd / "palette.json").read_text())}
    res, fail = {}, []
    def check(name, ok, value, note=""):
        res[name] = {"pass": bool(ok), "value": value, **({"note": note} if note else {})}
        if not ok: fail.append(name)
    B = [Q.bbox(m) for m in M]; hs = [b[3] - b[1] for b in B]; ground = meta["groundY"] // S
    check("0a_hard_pixel_edges", all((f == np.kron(Q.logical(f, S), np.ones((S, S, 1), np.uint8))).all() for f in F), "4x4 blocks uniform")
    check("0b_alpha_binary", sorted({int(v) for f in F for v in np.unique(f[..., 3])}) in ([0, 255], [255], [0]), "0/255")
    LC = meta.get("logicalCell", 100); mg = min(min(b[0], b[1], LC - b[2], LC - b[3]) for b in B)
    rigj = json.loads((cd / "rig.json").read_text(encoding="utf-8")); mon = rigj.get("monster", False)
    check("0c_inside_cell_ge2px", mg >= 2, f"min margin {mg} logical px")
    check("A_frame_count", n == SPEC[anim] or (anim == "attack" and 8 <= n <= 10), n, f"spec {SPEC[anim]}")
    if anim in ("walk", "hurt") and not mon:   # BIBLE:魔物豁免站姿身高 ±12%
        check("B_standing_height_pm12pct", all(abs(h - ref) / ref <= .12 for h in hs), hs, f"vs idle frame 1 = {ref}")
    if mon:
        aw = [int(max(b[2] - b[0], b[3] - b[1])) for b in B]
        cap = 1.6 if anim == "attack" else 1.35   # 出拳/撲咬會伸長
        check("B3_monster_art_size", max(aw) <= rigj["artSize"] * cap, aw, f"BIBLE: 魔物美術最長邊 = 遊戲尺寸×72/21 = {rigj['artSize']};動作中 ≤ ×{cap}")
    else: check("B2_height_cap_80",max(hs) <= (92 if anim in ("attack", "death") else 80), hs, "BIBLE: hero height 70–80 (weapon excluded, so soft)")
    bots = [b[3] for b in B]
    gtol = 3 if mon else (1 if anim == "walk" else 0)   # BIBLE:魔物腳底貼地 ±3 px
    check("03_ground_line", (bots[-1] == ground) if anim == "death" else (max(bots) == ground and min(bots) >= ground - gtol), bots, f"lowest row == {ground}, others ≥ ground-{gtol}" + (" at hold frame" if anim == "death" else ""))
    if anim == "attack": check("C_release_impact", "release" in meta and "impact" in meta and meta["release"] < meta["impact"] <= n, [meta.get("release"), meta.get("impact")])
    if anim == "hurt":
        cx = [float(np.nonzero(m)[1].mean()) for m in M]; kb = max(abs(c - cx[0]) for c in cx); check("D_knockback_le_2px", kb <= 2.5, round(kb, 2), "silhouette centroid shift")
    if anim == "walk" and rigj.get("rigged", {}).get("walk", {}).get("mode") == "hop":
        check("E_hop_cycle", len(set(bots)) >= 3, bots, "跳躍走路:腳底高度要有起伏(不是同一格複製)")
    elif anim == "walk":
        fx = [int(np.nonzero(m[ground - 3:ground].any(0))[0].min()) for m in M]; check("E_feet_alternate", len(set(fx)) >= 3, fx, "not one copied pose")
    allc = sorted(set().union(*[{tuple(p[:3]) for p in l.reshape(-1, 4) if p[3]} for l in L]))
    check("09_palette_shared", len(allc) <= 16 and set(allc) <= pal, f"{len(allc)} colours, subset of shared palette={set(allc) <= pal}")
    cont = [round(1 - Q.iou(M[k], M[(k + 1) % n]), 3) for k in range(n - (0 if meta.get("loop") else 1))]
    CT = {"walk": .30, "hurt": .40, "attack": .65, "death": .66}[anim]
    CT = json.loads((cd / "rig.json").read_text(encoding="utf-8")).get("qaOverride", {}).get(f"{anim}_continuity", CT)
    check("12_frame_continuity", max(cont) <= CT, cont, f"adjacent silhouette change ≤{CT} (動態版;idle ≤{Q.TOL['continuity']})" + (" incl. wrap" if meta.get("loop") else " (no wrap)"))
    def orat(l):
        m = l[..., 3] > 0; e = m & ~ndimage.binary_erosion(m); return float((l[..., :3].astype(int).sum(2)[e] < 300).mean())
    o = [round(orat(l), 3) for l in L]; check("10_outline", min(o) >= Q.TOL["outline"] and max(o) - min(o) <= .15, o)
    face = [Q.iou(M[k], M[0]) > Q.iou(M[k], M[0][:, ::-1]) for k in range(n)]
    check("11_facing", (all(face) if anim in ("walk", "hurt") else True) and meta.get("facing") == "right", f"all match frame 1 = {all(face)}" + ("" if anim in ("walk", "hurt") else " (attack/death 姿勢差大,改人工看)"))
    comps = [ndimage.label(m, structure=np.ones((3, 3)))[1] for m in M]; check("13_14_components_proxy", max(comps) <= 2, comps, "connected blobs per frame (>2 = floating pieces / extra limb suspect)")
    mag = sum(int(((l[..., 0] > 200) & (l[..., 2] > 200) & (l[..., 1] < 90) & (l[..., 3] > 0)).sum()) for l in L); check("18_background", mag == 0, mag)
    noise = {}
    for size in (64, 32):
        w = []
        for f in F:
            b = Q.bbox(f[..., 3] > 0); c = Image.fromarray(f).crop(b); s = size / max(c.size); t = np.asarray(c.resize((max(1, round(c.width * s)), max(1, round(c.height * s))), Image.BOX))[..., 3] > 127
            iso = t & (ndimage.convolve(t.astype(int), np.ones((3, 3)), mode="constant") <= 1); w.append(iso.sum() / max(1, t.sum()))
        noise[size] = round(float(max(w)), 4)
    check("T_thumbnail_noise", max(noise.values()) <= .01, noise, "worst frame isolated-pixel share")
    qa = cd / "qa"; qa.mkdir(exist_ok=True)
    out = {"character": meta["id"], "animation": anim, "result": "PASS" if not fail else "FAIL", "failed": fail, "checks": res}
    (qa / f"{anim}_qa.json").write_text(json.dumps(out, ensure_ascii=False, indent=1, default=lambda x: x.item() if hasattr(x, "item") else str(x)), encoding="utf-8")
    print(f"{meta['id']} {anim}: {out['result']}" + (f" {fail}" if fail else ""))
    for k in fail: print(f"    {k}: {res[k]['value']}")
    return not fail


if __name__ == "__main__":
    ok = all([run(Path(sys.argv[1]), a) for a in (sys.argv[2:] or list(SPEC))]); sys.exit(0 if ok else 1)
