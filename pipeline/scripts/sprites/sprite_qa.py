"""sprite_qa.py — SPRITE_QA_CHECKLIST.md 的自動檢查(Animation Consistency 18 項 + Silhouette / Thumbnail test)。

用法:python pipeline/scripts/sprites/sprite_qa.py sprites/characters/<ID> idle
讀 export/<id>_<anim>_<ver>.json + 母版 sheet,寫 qa/<anim>_qa.json、qa/<anim>_silhouette.png、qa/<anim>_thumbs.png。
有任何 FAIL → exit 1(規格:不准直接宣告完成)。

每一項都是量得到的數字;量不到的(「多出手臂」這類語意判斷)用代理指標並標成 proxy,報告裡也照實寫。
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[3]
TOL = {"height": 2, "axis": 1, "head": 2, "weapon": 1, "continuity": .22, "silhouette_iou": .85, "palette_max": 16, "outline": .55, "class_iou": .8}


def cells(sheet, meta):
    C, cols = meta["cell"], meta["layout"]["columns"]
    return [np.asarray(sheet.crop(((k % cols) * C, (k // cols) * C, (k % cols + 1) * C, (k // cols + 1) * C))) for k in range(meta["frames"])]


def bbox(m):
    ys, xs = np.nonzero(m); return (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1) if len(xs) else None


def iou(a, b):
    u = (a | b).sum(); return float((a & b).sum() / u) if u else 1.0


def logical(a, s):
    return a[s // 2::s, s // 2::s]


def run(char_dir: Path, anim: str):
    exp = sorted((char_dir / "export").glob(f"*_{anim}_v*.json"))[-1]
    meta = json.loads(exp.read_text(encoding="utf-8")); sheet = Image.open(exp.with_suffix(".png")).convert("RGBA")
    S = meta["logicalScale"]; F = cells(sheet, meta); n = len(F)
    L = [logical(f, S) for f in F]; M = [l[..., 3] > 0 for l in L]
    res, fail = {}, []
    rigj = json.loads((char_dir / "rig.json").read_text(encoding="utf-8"))
    WM = rigj.get("weaponMetalMin", 150)   # 黑色武器(暗鋼)用較低的亮度門檻
    armed = "weapon" in rigj.get("layers", {})   # 魔物沒有武器:06/07 不適用

    def check(name, ok, value, note=""):
        res[name] = {"pass": bool(ok), "value": value, **({"note": note} if note else {})}
        if not ok: fail.append(name)

    # 0. 硬邊:母版必須是邏輯格 ×S 的整數放大(每個 S×S 區塊單色)、alpha 只有 0/255、沒有碰格邊
    blocky = all((f == np.kron(logical(f, S), np.ones((S, S, 1), np.uint8))).all() for f in F)
    alpha_vals = sorted({int(v) for f in F for v in np.unique(f[..., 3])})
    margin = min(min(b[0], b[1], f.shape[1] - b[2], f.shape[0] - b[3]) for f in F for b in [bbox(f[..., 3] > 0)])
    check("hard_pixel_edges", blocky, f"{S}x{S} blocks uniform={blocky}")
    check("alpha_binary", alpha_vals in ([0, 255], [255], [0]), alpha_vals)
    check("inside_cell", margin >= 8, f"min margin {margin}px")
    B = [bbox(m) for m in M]
    hs = [b[3] - b[1] for b in B]
    check("01_character_scale", max(hs) - min(hs) <= TOL["height"], hs, f"height range ≤{TOL['height']} logical px")
    ax = [float(np.nonzero(m)[1].mean()) for m in M]
    check("02_character_position", max(ax) - min(ax) <= TOL["axis"], [round(a, 2) for a in ax], "silhouette x-centroid drift")
    bots = [b[3] for b in B]; ground = meta["groundY"] // S
    check("03_ground_line", len(set(bots)) == 1 and bots[0] == ground, bots, f"feet bottom == ground {ground}")
    def feet(k):   # 兩隻腳 anchor 左右各 6 px、底部 6 列(武器尖端可能也在最底下,不算)
        return [L[k][ground - 6:ground, a[0] // S - 6:a[0] // S + 7] for nm, a in meta["anchors"][k].items() if nm.endswith("_FOOT")]
    fd = [int(sum((x != y).any(2).sum() for x, y in zip(feet(k), feet(0)))) for k in range(n)]
    check("03b_feet_planted", max(fd) == 0, fd, "pixels changed in the foot boxes vs frame 1 (no foot drift)")
    tops = [b[1] for b in B]
    check("04_head_position", max(tops) - min(tops) <= TOL["head"], tops)
    hb = meta["anchors"][0]["HEAD"]; hx, hy = hb[0] // S, hb[1] // S; r = 6   # 只框頭/頭盔本體;羽飾、頭髮是慢一格的副圖層
    heads = [L[k][max(0, meta["anchors"][k]["HEAD"][1] // S - r):meta["anchors"][k]["HEAD"][1] // S + r, hx - r:hx + r] for k in range(n)]
    check("04b_head_identity", all(h.shape == heads[0].shape and (h == heads[0]).all() for h in heads), "12x12 head crop bit-identical (rigid)")
    wr = [b[2] - b[0] for b in B]
    ratio = [round(h / w, 3) for h, w in zip(hs, wr)]
    check("05_body_proportion", max(ratio) - min(ratio) <= .05, ratio, "height/width")
    # 6–7 武器:WEAPON_GRIP anchor 附近的武器色(低飽和亮金屬)外框
    def weapon_box(k):
        g = meta["anchors"][k]["WEAPON_GRIP"]; gx, gy = g[0] // S, g[1] // S
        l = L[k]; rgb = l[..., :3].astype(int); sat = rgb.max(2) - rgb.min(2)
        metal = (l[..., 3] > 0) & (sat < 30) & (rgb.mean(2) > WM)
        reg = np.zeros_like(metal); reg[gy - 2:, gx:] = True
        lab, _ = ndimage.label(metal & reg); ids = [i for i in np.unique(lab) if i]
        if not ids: return None
        big = max(ids, key=lambda i: (lab == i).sum()); b = bbox(lab == big)
        return (int(b[0] - gx), int(b[1] - gy), int(b[2] - b[0]), int(b[3] - b[1]))
    if armed:
        wb = [weapon_box(k) for k in range(n)]
        check("06_weapon_position", None not in wb and len({w[:2] for w in wb}) == 1, [w[:2] if w else None for w in wb], "blade bbox offset from grip")
        check("07_weapon_size", None not in wb and max(abs(w[2] - wb[0][2]) + abs(w[3] - wb[0][3]) for w in wb) <= TOL["weapon"], [w[2:] if w else None for w in wb])
    if rigj.get("monster"):
        aw = [int(max(b[2] - b[0], b[3] - b[1])) for b in B]
        check("B3_monster_art_size", abs(aw[0] / rigj["artSize"] - 1) <= .10, aw[0], f"BIBLE: 美術最長邊 = 遊戲尺寸×72/21 = {rigj['artSize']} ±10%")
    cols = [{tuple(p[:3]) for p in l.reshape(-1, 4) if p[3]} for l in L]
    allc = sorted(set().union(*cols))
    def chist(l):
        v = l[l[..., 3] > 0][:, :3].astype(np.int64) @ [65536, 256, 1]; key = np.array([int(c[0]) * 65536 + int(c[1]) * 256 + int(c[2]) for c in allc])
        h = np.array([(v == c).sum() for c in key], float); return h / h.sum()
    hd = [float(np.abs(chist(L[k]) - chist(L[0])).sum()) for k in range(n)]
    check("08_equipment_consistency", max(hd) <= .08, [round(x, 3) for x in hd], "colour-histogram L1 vs frame 1")
    check("09_palette_consistency", len(allc) <= TOL["palette_max"] and len(set(map(frozenset, cols))) == 1, f"{len(allc)} colours, same set every frame")
    def outline_ratio(l):
        m = l[..., 3] > 0; edge = m & ~ndimage.binary_erosion(m); lum = l[..., :3].astype(int).sum(2)
        return float((lum[edge] < 300).mean())
    orr = [round(outline_ratio(l), 3) for l in L]
    check("10_outline_consistency", min(orr) >= TOL["outline"] and max(orr) - min(orr) <= .05, orr, "dark share of silhouette edge")
    face = [iou(M[k], M[0]) > iou(M[k], M[0][:, ::-1]) for k in range(n)]
    check("11_facing_direction", all(face) and meta.get("facing") == "right", f"facing={meta.get('facing')}, all frames match frame-1 orientation={all(face)}")
    cont = [round(1 - iou(M[k], M[(k + 1) % n]), 3) for k in range(n)]
    check("12_frame_continuity", max(cont) <= TOL["continuity"], cont, "silhouette change incl. wrap 8→1")
    comps = [ndimage.label(m)[1] for m in M]
    check("13_14_limb_count_proxy", len(set(comps)) == 1, comps, "proxy: connected silhouette components stable (extra/missing limb → component change)")
    sil = [round(iou(M[k], M[0]), 3) for k in range(n)]
    check("15_16_17_silhouette_stability", min(sil) >= TOL["silhouette_iou"], sil, "proxy: no duplicated weapon / floating gear / broken silhouette")
    mag = sum(int(((l[..., 0] > 200) & (l[..., 2] > 200) & (l[..., 1] < 90) & (l[..., 3] > 0)).sum()) for l in L)
    check("18_background_contamination", mag == 0, f"{mag} magenta-ish pixels")

    # Silhouette test:純黑剪影 + 跟其他職業(遊戲現有英雄待機格)32px 剪影 IoU
    qa = char_dir / "qa"; qa.mkdir(exist_ok=True)
    sil_img = Image.new("RGB", (meta["cell"] * 2, meta["cell"]), "white")
    for i, k in enumerate((0, n // 2)):
        sil_img.paste(Image.fromarray(np.where(F[k][..., 3:4] > 0, 0, 255).repeat(3, 2).astype(np.uint8)), (i * meta["cell"], 0))
    sil_img.save(qa / f"{anim}_silhouette.png")
    def sil32(m):
        b = bbox(m); c = Image.fromarray((m[b[1]:b[3], b[0]:b[2]] * 255).astype(np.uint8)); s = 32 / max(c.size)
        c = c.resize((max(1, round(c.width * s)), max(1, round(c.height * s))), Image.BILINEAR); o = np.zeros((32, 32), bool)
        a = np.asarray(c) > 127; o[32 - a.shape[0]:, (32 - a.shape[1]) // 2:(32 - a.shape[1]) // 2 + a.shape[1]] = a; return o
    me = sil32(M[0]); others = {}
    for j in sorted((ROOT / "assets" / "heroes").glob("*.json")):
        if j.stem.endswith("-fx") or j.stem == meta["id"].split("_")[1].lower(): continue   # 自己這個職業的上線版不算「別的職業」
        mm = json.loads(j.read_text(encoding="utf-8"))["actions"]["idle"]; c = mm["cell"]
        a = np.asarray(Image.open(j.with_suffix(".png")).convert("RGBA").crop((0, mm["y"], c, mm["y"] + c)))[..., 3] > 0
        others[j.stem] = round(iou(me, sil32(a)), 3)
    check("silhouette_test_class_distinct", max(others.values()) < TOL["class_iou"], others, "32px silhouette IoU vs every other class < 0.8")
    # Thumbnail test:64 / 32 px,算孤立單像素(雜訊)比例
    thumbs = Image.new("RGBA", (64 + 32 + 24, 72), (110, 130, 100, 255)); noise = {}
    for x0, size in ((4, 64), (76, 32)):
        b = bbox(F[0][..., 3] > 0); crop = Image.fromarray(F[0]).crop(b); s = size / max(crop.size)
        t = crop.resize((max(1, round(crop.width * s)), max(1, round(crop.height * s))), Image.BOX)
        ta = np.asarray(t); m = ta[..., 3] > 127; iso = m & (ndimage.convolve(m.astype(int), np.ones((3, 3)), mode="constant") <= 1)
        noise[size] = round(float(iso.sum() / max(1, m.sum())), 4); thumbs.alpha_composite(t, (x0, 72 - t.height - 4))
    thumbs.resize((thumbs.width * 4, thumbs.height * 4), Image.NEAREST).save(qa / f"{anim}_thumbs.png")
    check("thumbnail_test_noise", max(noise.values()) <= .01, noise, "isolated single-pixel share at 64/32 px")

    out = {"character": meta["id"], "animation": anim, "version": meta["version"], "frames": n, "sheet": meta["sheet"], "cell": meta["cell"],
           "layout": meta["layout"], "palette": len(allc), "result": "PASS" if not fail else "FAIL", "failed": fail, "checks": res}
    (qa / f"{anim}_qa.json").write_text(json.dumps(out, ensure_ascii=False, indent=1, default=lambda o: o.item() if hasattr(o, "item") else str(o)), encoding="utf-8")
    for k, v in res.items(): print(f"  {'PASS' if v['pass'] else 'FAIL'}  {k}: {v['value']}")
    print(f"{meta['id']} {anim} {meta['version']}: {out['result']}" + (f" {fail}" if fail else ""))
    return not fail


if __name__ == "__main__":
    sys.exit(0 if run(Path(sys.argv[1]), sys.argv[2] if len(sys.argv) > 2 else "idle") else 1)
