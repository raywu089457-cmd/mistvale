"""make_idle.py — 依角色 rig.json 從一張關鍵姿勢做出分層 Idle(SPRITE_VISUAL_BIBLE / ANIMATION_SPEC)。

用法:python pipeline/scripts/sprites/make_idle.py sprites/characters/<ID>

為什麼不讓 AI 畫 8 格:模型每格都會重畫一次角色(臉、盔甲花紋、武器長度飄移),違反 CONSISTENCY 第一。
這裡只取「一張」核可的關鍵姿勢,把它拆成圖層(rig.json 的 layers 矩形 = Layer 02 頭髮、Layer 08 武器…),
再依 idle 曲線逐格位移:
  身體 = 膝蓋以上整塊剛性下沉 d(盾、頭盔、頭跟著走,裝備不變形),膝蓋帶(knee..foot)壓掉 d 列 = 膝蓋微彎,腳底列完全不動;
  武器層 / 頭髮層 = 各自的曲線(頭髮慢一格 = 跟隨動作)。
全部是整數列位移,沒有縮放或內插 → 邏輯像素維持 1:1,母版 = 邏輯 ×4 最近鄰放大(硬邊、無抗鋸齒)。

輸出(都在角色資料夾):
  idle/hero_<id>_idle_<ver>.png        母版 sheet 1600×800,4×2,每格 400×400,透明底
  idle/frames/..._f01..f08.png         母版單格
  layers/..._layerNN_<name>_<ver>.png  關鍵姿勢各圖層(母版尺寸)
  visual_reference/..._key_<ver>.png   關鍵姿勢
  export/hero_<id>_idle_<ver>.png/.json  遊戲匯入:母版 sheet + 每格 anchor(母版座標)+ 色盤
  export/game/..._1x.png               邏輯 1:1 sheet(100×100 一格)
"""
from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "pipeline" / "scripts" / "heroes"))
import build_hero as B  # noqa: E402  (cut / palette / pixelize / torso_x 共用,同一套去背與 16 色規則)
sys.path.insert(0, str(Path(__file__).resolve().parent))
import unfake  # noqa: E402

SCALE, LCELL, GROUND, AXIS = 4, 100, 92, 50   # 母版 = 邏輯 ×4;邏輯格 100;腳底下緣 y=92;軀幹中心 x=50
COLS, ROWS = 4, 2


def _rig_cell():   # 魔物美術較大:rig.json 的 "cell" 覆寫邏輯格(地線 = 格底上 8、軸 = 格中線);由命令列第一個參數(角色資料夾)決定
    try: return int(json.loads((Path(sys.argv[1]) / "rig.json").read_text(encoding="utf-8")).get("cell", 100))
    except (IndexError, OSError, ValueError): return 100


if _rig_cell() != 100: LCELL = _rig_cell(); GROUND, AXIS = LCELL - 8, LCELL // 2


def layer_mask(shape, L):
    """rects: [[x0,y0,x1,y1],…](右下不含);segment: [x0,y0,x1,y1,半寬] = 沿一條線段的帶狀(斜放的刀身);minY/maxY 再裁。"""
    m = np.zeros(shape, bool)
    for x0, y0, x1, y1 in L.get("rects", []): m[y0:y1, x0:x1] = True
    if "segment" in L:
        x0, y0, x1, y1, w = L["segment"]; yy, xx = np.mgrid[:shape[0], :shape[1]]
        vx, vy = x1 - x0, y1 - y0; t = np.clip(((xx - x0) * vx + (yy - y0) * vy) / (vx * vx + vy * vy), 0, 1)
        m |= np.hypot(xx - (x0 + t * vx), yy - (y0 + t * vy)) <= w
    if "minY" in L: m[:L["minY"]] = False
    if "maxY" in L: m[L["maxY"]:] = False
    return m


def shift(a, dy, dx=0):
    out = np.zeros_like(a); H, W = a.shape[:2]
    ys, yd = (slice(0, H - dy), slice(dy, H)) if dy >= 0 else (slice(-dy, H), slice(0, H + dy))
    xs, xd = (slice(0, W - dx), slice(dx, W)) if dx >= 0 else (slice(-dx, W), slice(0, W + dx))
    out[yd, xd] = a[ys, xs]
    return out


def inpaint(cell, footprint):
    """圖層移開後露出的 1 px 縫(原本被刀身/披風擋住的盔甲)→ 用四鄰最多的顏色補;只補在關鍵姿勢佔過的範圍內,剪影外緣不長肉。"""
    for _ in range(2):
        a = cell[..., 3] > 0; hole = footprint & ~a
        if not hole.any(): break
        for y, x in zip(*np.nonzero(hole)):
            ok = lambda yy, xx: 0 <= yy < cell.shape[0] and 0 <= xx < cell.shape[1] and a[yy, xx]
            nbs = ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)); nb = [tuple(cell[q][:3]) for q in nbs if ok(*q)]
            bridge = (ok(y, x - 1) and ok(y, x + 1)) or (ok(y - 1, x) and ok(y + 1, x))   # 1 px 直縫/橫縫(披風左移後跟身體之間)
            if len(nb) >= 3 or bridge: cell[y, x, :3] = max(set(nb), key=nb.count); cell[y, x, 3] = 255
    return cell


def curve_of(curve, name, k):
    c = curve.get(name, 0)
    if isinstance(c, list): return c[k], 0
    if isinstance(c, dict): return c.get("dy", [0] * curve["frames"])[k], c.get("dx", [0] * curve["frames"])[k]
    return 0, 0


def body_frame(a, d, knee, foot):
    """膝蓋以上剛性下沉 d;膝蓋帶 [knee, foot) 均勻刪 d 列;腳 [foot, H) 不動。"""
    if d == 0: return a.copy()
    out = np.zeros_like(a)
    out[d:knee + d] = a[:knee]
    band = a[knee:foot]; keep = np.round(np.linspace(0, len(band) - 1, len(band) - d)).astype(int)
    out[knee + d:foot] = band[keep]
    out[foot:] = a[foot:]
    return out


def bridge(a, maxd):
    """與主體分離的大塊(飄開的袖子、帽子等)用最近點連線補成一體。"""
    from scipy import ndimage
    lab, k_ = ndimage.label(a[..., 3] > 0, structure=np.ones((3, 3)))
    if k_ > 1:
        sz = ndimage.sum(np.ones_like(lab), lab, range(1, k_ + 1)); main = int(np.argmax(sz)) + 1
        my, mx = np.nonzero(lab == main)
        for i_ in range(1, k_ + 1):
            if i_ == main: continue
            oy, ox = np.nonzero(lab == i_)
            d = (oy[:, None] - my[None]) ** 2 + (ox[:, None] - mx[None]) ** 2; a_, b_ = np.unravel_index(d.argmin(), d.shape)
            if d[a_, b_] > maxd ** 2: continue
            n_ = int(np.sqrt(d[a_, b_])) * 2 + 1; col_ = a[my[b_], mx[b_]].copy()
            for t_ in np.linspace(0, 1, n_):
                yy, xx = int(round(oy[a_] + (my[b_] - oy[a_]) * t_)), int(round(ox[a_] + (mx[b_] - ox[a_]) * t_))
                if a[yy, xx, 3] == 0: a[yy, xx] = col_
    return a


def clean_key(key, rig):
    if rig.get("keyDespeck"):   # 關鍵姿勢裡孤立的細碎像素(弓弦、特效殘屑)清掉,避免被當成多餘肢體
        from scipy import ndimage
        lab, k_ = ndimage.label(key[..., 3] > 0, structure=np.ones((3, 3)))
        for i_ in range(1, k_ + 1):
            if (lab == i_).sum() < rig["keyDespeck"]: key[lab == i_] = 0
        if rig.get("keyBridge"): key = bridge(key, rig["keyBridge"])
    return key


def main(char_dir: Path):
    rig = json.loads((char_dir / "rig.json").read_text(encoding="utf-8"))
    cid, ver = rig["id"].lower(), rig["version"]
    src = rig["source"]; fr = B.cut(ROOT / src["sheet"], tuple(src["grid"]))
    im = fr[src["frame"]][0]
    if src.get("unfake"):   # AI 假像素畫 → 偵測原生格距取樣(角色高 = 原生高),色盤保留重點色、排除洋紅滲色
        if src.get("keysheet"):
            import make_anim as MA
            us, hint = MA.sheet_frames({"sheet": src["sheet"], "grid": src["grid"], "frames": src["grid"][0] * src["grid"][1], "pixelize": src.get("pixelize")}); u, grid = us[src["frame"]], hint
        else: u, grid = unfake.unfake(im)
        pj = char_dir / "palette.json"   # 所有動畫共用的色盤(make_anim.py 產生);沒有就只用待機
        pal16 = np.array(json.loads(pj.read_text()), np.uint8) if pj.exists() else unfake.limit_palette([u]); key = np.asarray(unfake.apply_palette(u, pal16)).copy()
        print(f"  unfake: pitch {grid}, native {u.size}")
    else:
        pal = B.palette([f[0] for f in fr if f])
        key = np.asarray(B.pixelize(im, rig["logicalHeight"] / im.height, pal)).copy()
    key = clean_key(key, rig)
    H, W = key.shape[:2]
    opaque = key[..., 3] > 0
    light = key[..., :3].astype(int).mean(2) > 110   # 亮灰金屬(劍柄、刀刃)
    layer_masks = {n: layer_mask((H, W), L) & opaque & (~light if L.get("excludeLight") else True) for n, L in rig["layers"].items()}
    body = key.copy()
    for m in layer_masks.values(): body[m] = 0
    layers = {n: np.where(m[..., None], key, 0).astype(np.uint8) for n, m in layer_masks.items()}

    ox = AXIS - int(round(B.torso_x(Image.fromarray(key, "RGBA")))); oy = GROUND - H
    if ox < 2 or ox + W > LCELL - 2 or oy < 2: sys.exit(f"key pose does not fit the {LCELL} logical cell")
    curve = rig["idle"]; n = curve["frames"]
    frames, anchors = [], []
    for k in range(n):
        d = curve["body"][k]
        cell = np.zeros((LCELL, LCELL, 4), np.uint8)
        back = [(n_, layers[n_]) for n_, L in rig["layers"].items() if L.get("z") == "back"]
        front = [(n_, layers[n_]) for n_, L in rig["layers"].items() if L.get("z") != "back"]
        region = cell[oy:oy + H, ox:ox + W]
        for name, a in [*back, ("body", body), *front]:
            if name == "body": f = body_frame(a, d, rig["knee"], rig["foot"])
            else: dy, dx = curve_of(curve, name, k); f = shift(a, dy, dx)
            m = f[..., 3] > 0; region[m] = f[m]
        foot = np.zeros((LCELL, LCELL), bool); foot[oy:oy + H, ox:ox + W] = opaque | (body_frame(key, d, rig["knee"], rig["foot"])[..., 3] > 0)
        inpaint(cell, foot)
        frames.append(cell)
        an = {}
        for nm, (x, y) in rig["anchors"].items():
            lay = rig.get("anchorLayer", {}).get(nm, "body")
            dy = 0 if lay == "feet" or (lay == "body" and y >= rig["foot"]) else curve_of(curve, lay, k)[0] if lay in curve else d
            an[nm] = [(ox + x) * SCALE + SCALE // 2, (oy + y + dy) * SCALE + SCALE // 2]
        an["GROUND"] = [AXIS * SCALE, GROUND * SCALE]
        anchors.append(an)

    up = lambda a: Image.fromarray(a, "RGBA").resize((a.shape[1] * SCALE, a.shape[0] * SCALE), Image.NEAREST)
    C = LCELL * SCALE
    sheet = Image.new("RGBA", (C * COLS, C * ROWS), (0, 0, 0, 0)); sheet1 = Image.new("RGBA", (LCELL * COLS, LCELL * ROWS), (0, 0, 0, 0))
    (char_dir / "idle" / "frames").mkdir(parents=True, exist_ok=True)
    for k, f in enumerate(frames):
        x, y = (k % COLS), (k // COLS)
        sheet.alpha_composite(up(f), (x * C, y * C)); sheet1.alpha_composite(Image.fromarray(f, "RGBA"), (x * LCELL, y * LCELL))
        up(f).save(char_dir / "idle" / "frames" / f"{cid}_idle_{ver}_f{k + 1:02d}.png")
    base = f"{cid}_idle_{ver}"
    sheet.save(char_dir / "idle" / f"{base}.png")
    for d_ in ("layers", "visual_reference", "export/game"): (char_dir / d_).mkdir(parents=True, exist_ok=True)
    for i, (nm, a) in enumerate([("body", body), *layers.items()]):
        num = 1 if nm == "body" else rig["layers"][nm].get("num", 10 + i)
        up(a).save(char_dir / "layers" / f"{cid}_layer{num:02d}_{nm}_{ver}.png")
    up(key).save(char_dir / "visual_reference" / f"{cid}_key_{ver}.png")
    shutil.copy(char_dir / "idle" / f"{base}.png", char_dir / "export" / f"{base}.png")
    sheet1.save(char_dir / "export" / "game" / f"{base}_1x.png")
    palette = sorted({"#%02x%02x%02x" % tuple(p[:3]) for f in frames for p in f.reshape(-1, 4) if p[3]})
    meta = {"id": rig["id"], "version": ver, "animation": "idle", "frames": n, "layout": {"columns": COLS, "rows": ROWS},
            "cell": C, "sheet": [C * COLS, C * ROWS], "logicalScale": SCALE, "logicalCell": LCELL, "frameTime": 0.16, "loop": True,
            "facing": "right", "groundY": GROUND * SCALE, "axisX": AXIS * SCALE, "characterHeight": H * SCALE,
            "anchors": anchors, "palette": palette, "source": src, "rig": "rig.json"}
    (char_dir / "export" / f"{base}.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{rig['id']} idle {ver}: {n} frames, sheet {sheet.size}, character {H * SCALE}px, palette {len(palette)}")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
