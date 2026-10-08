"""assemble.py — Xilurus 風格全套美術 → 遊戲用的圖集/圖檔(檔名、cell id 跟舊版一樣,pixel-world.js 不用改 id)。

來源:output/l0veyou/<表>-v1.png(l0veyou GPT Image 2 生的洋紅/綠底表,prompt 在 output/l0veyou/prompts/)。
步驟:
  1. 每張表用 sheet_to_atlas.py 切成暫存圖集 zx-*(id 直接用遊戲要的名字;朝左的表先整張鏡像、id 反序)。
  2. 依舊版圖集名合併(details/props/cold/woods/flora/yard/town/town2/vfx/icons/monsters/monsteratk),@1x/@2x 都做。
  3. 英雄:每職業一張 5x2 表 → hero@1x/2x/4x + heropose@1x/2x/4x(同 make_sd_heroes 的 LOD 與 foot)。
  4. 建築/廣場雕像:各存一張去背 PNG 到 assets/xilurus/(build.mjs 以 alphaAssets 載入)。
  5. 地面材質:1024² 生圖 → 縮回原生像素 → 無縫化(半格位移+抖動遮罩,不糊) → terrain-atlas、plaza、road、concept-*。
  6. 標題圖:title.png。
用法:python pipeline/scripts/xilurus/assemble.py [atlases|heroes|buildings|textures|tones|title|all]
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[3]
A = ROOT / "assets"
SRC = ROOT / "output" / "l0veyou"
XD = A / "xilurus"
CUT = ROOT / "pipeline" / "scripts" / "l0veyou" / "sheet_to_atlas.py"
sys.path.insert(0, str(ROOT / "pipeline" / "scripts" / "align"))


def cut(sheet: str, prefix: str, grid: str, ids: list[str], mirror=False, env=None):
    """切一張表 → assets/<prefix>@1x/@2x。mirror=True:整張左右翻(朝左的表),id 也跟著反序。"""
    src = SRC / sheet
    if mirror:
        cols, rows = map(int, grid.split("x"))
        m = SRC / (src.stem + "-mirror.png")
        ImageOps.mirror(Image.open(src)).save(m)
        ids = [ids[r * cols + (cols - 1 - c)] for r in range(rows) for c in range(cols)]
        src = m
    r = subprocess.run([sys.executable, str(CUT), str(src), prefix, grid, ",".join(ids)], capture_output=True, text=True, encoding="utf-8",
                       env={**os.environ, "PYTHONIOENCODING": "utf-8", **(env or {})})
    if r.returncode:
        print(r.stdout, r.stderr)
        raise SystemExit(f"cut failed: {sheet}")
    line = [ln for ln in r.stdout.splitlines() if "@2x" in ln]
    print(f"  {sheet} → {prefix}: {line[0] if line else r.stdout.strip()[:120]}")


def load_atlas(prefix: str, lod: str):
    man = json.loads((A / f"{prefix}@{lod}.manifest.json").read_text(encoding="utf-8"))
    im = Image.open(A / f"{prefix}@{lod}.png").convert("RGBA")
    cells = man["cells"] if isinstance(man["cells"], dict) else {c["id"]: c for c in man["cells"]}
    return im, cells, man


# 方向跟遊戲約定相反的單格:柵欄段遊戲約定「沿 z 走＝往右上升」(沿 x 的段再翻面),生成的是往右下 → 鏡像。
MIRROR_CELLS = {"fenceRail"}


def resize_sprite(im: Image.Image, f: float) -> Image.Image:
    """等比縮放去背圖:LANCZOS 後 alpha 二值化(≥128 不透明),邊緣不會出現半透明髒邊。"""
    w, h = max(1, round(im.width * f)), max(1, round(im.height * f))
    a = np.asarray(im.resize((w, h), Image.LANCZOS)).copy()
    a[..., 3] = np.where(a[..., 3] >= 128, 255, 0)
    return Image.fromarray(a)


# ── 道具像素密度(audit_density.py):道具原圖 250px 左右,但畫面上只畫 8–30 邏輯單位 → 美術像素比英雄細 3 倍。
# 每個道具依「遊戲畫它的外框」縮成真像素畫(0.62 邏輯單位/美術像素,跟英雄一樣),圖集裡存最近鄰放大版(2x ×4、1x ×2)。
ART_DENSITY = 0.62
EXTRA_BOX = {"boulders": (10, 8), "signpost": (13, 16), "lamppost": (7, 15), "plot": (52, 40), "well": (50, 51), "flowerYellow": (9, 7), "flowerPink": (9, 7),
             "flowerBlue": (9, 7), "flowerWhite": (9, 7), "wheat": (9, 9), "cabbage": (10, 7), "cave": (55, 60), "ruin": (46, 46), "outcrop": (42, 40), "sheep": (10, 8.5), "goat": (9.5, 10),
             "pine": (42.5, 61), "oak": (42.5, 61), "birch": (42.5, 61), "snowpine": (42.5, 61), "autumnOak": (42.5, 61)}
# 特效:fxSprite 以最長邊 = size 畫(drawSlash 20–34、fxHit 8–24、fxSparkle 14–30、fxOrb 11、箭 13),取典型大小
EXTRA_BOX.update({"fxSlash": (26, 26), "fxOrb": (11, 11), "fxHeal": (14, 14), "fxStar": (12, 12), "fxHit": (12, 12), "fxSparkle": (18, 18), "arrowFx": (13, 13)})
# UI 圖示:48px 圖示框(46px 內容),像素化成 24 美術像素 → 畫面上 ×≈2 的整齊像素(跟世界一樣是像素畫,不是高解析縮圖)
ICON_ART = 24
MONSTER_SIZE = {"slime": 28, "wolf": 31, "golem": 33, "boss": 50}   # pixel-world.js ENEMY_SIZE(以待機格最長邊為準)


def prop_boxes():
    import re
    src = (ROOT / "src" / "pixel-world.js").read_text(encoding="utf-8"); i = src.index("const PROP_ATLAS=")
    box = {k: (float(w), float(h)) for k, w, h in re.findall(r"(\w+):\['\w+',([\d.]+),([\d.]+),[\d.]+\]", src[i:i + 4000])}
    box.update(EXTRA_BOX)
    return box


def pixelize_prop(crop: Image.Image, bw: float, bh: float, n: int, k: float | None = None, pal=None) -> Image.Image:
    k = k or min(bw / crop.width, bh / crop.height)     # 原圖 px → 邏輯單位
    s = k / ART_DENSITY                                  # 原圖 px → 美術像素
    if s >= .8: return crop                              # 已經夠粗(大物件),不動
    art = pixelize(crop, s, pal or palette_of([crop], 32), thr=105)   # 小道具外緣淺色多,描邊門檻放低一點(專案風格:每個物件都有深色描邊)
    return art.resize((art.width * n, art.height * n), Image.NEAREST)


def merge(name: str, parts: list[tuple[str, list[str] | None]]):
    """把多個暫存圖集(只取指定 id,None=全部)合併成 assets/<name>@1x/@2x(shelf packing,manifest 契約同 sheet_to_atlas)。"""
    for lod in ("1x", "2x"):
        pieces, base = {}, None
        for prefix, keep in parts:
            im, cells, man = load_atlas(prefix, lod)
            base = base or man
            for k, c in cells.items():
                if keep is not None and k not in keep:
                    continue
                crop = im.crop((c["x"], c["y"], c["x"] + c["w"], c["y"] + c["h"]))
                if name == "monsters":   # 同一種魔物所有格用待機格的倍率(遊戲也是以待機格為準縮放),像素化後格與格不會忽大忽小
                    t = k.rstrip("0123456789"); i2, c2, _ = load_atlas(prefix, "2x"); cc = c2[k]
                    src2 = i2.crop((cc["x"], cc["y"], cc["x"] + cc["w"], cc["y"] + cc["h"]))
                    ia, ca, _ = load_atlas(f"zx-{t}", "2x"); c0 = ca[f"{t}0"]; idle = ia.crop((c0["x"], c0["y"], c0["x"] + c0["w"], c0["y"] + c0["h"]))
                    kk = MONSTER_SIZE[t] / max(idle.width, idle.height) * SCALE.get(prefix, 1)
                    crop = pixelize_prop(src2, 0, 0, 4 if lod == "2x" else 2, k=kk, pal=MON_PAL.setdefault(t, palette_of([idle], 40)))
                    c = {**c, "x": 0, "y": 0, "w": crop.width, "h": crop.height, **({"anchor": [crop.width / 2, crop.height]} if "anchor" in c else {})}
                    pieces[k] = (crop, c); continue
                if name == "icons" or k == "iconLeather":
                    i2, c2, _ = load_atlas(prefix, "2x"); cc = c2[k]
                    src2 = i2.crop((cc["x"], cc["y"], cc["x"] + cc["w"], cc["y"] + cc["h"]))
                    crop = pixelize_prop(src2, ICON_ART * ART_DENSITY, ICON_ART * ART_DENSITY, 4 if lod == "2x" else 2)
                    c = {**c, "x": 0, "y": 0, "w": crop.width, "h": crop.height, **({"anchor": [crop.width / 2, crop.height]} if "anchor" in c else {})}
                    pieces[k] = (crop, c); continue
                if k in BOXES and name not in ("monsters", "icons"):
                    i2, c2, _ = load_atlas(prefix, "2x"); cc = c2[k]
                    src2 = i2.crop((cc["x"], cc["y"], cc["x"] + cc["w"], cc["y"] + cc["h"]))
                    if k in MIRROR_CELLS: src2 = ImageOps.mirror(src2)
                    crop = pixelize_prop(src2, *BOXES[k], 4 if lod == "2x" else 2)
                    if k in MIRROR_CELLS: crop = ImageOps.mirror(crop)   # 下面會再鏡像一次
                    c = {**c, "x": 0, "y": 0, "w": crop.width, "h": crop.height, **({"anchor": [crop.width / 2, crop.height]} if "anchor" in c else {})}
                f = SCALE.get(prefix, 1)
                if f != 1:   # 第二張表縮到跟第一張同尺寸(錨點跟著縮)
                    crop = resize_sprite(crop, f)
                    c = {**c, "x": 0, "y": 0, "w": crop.width, "h": crop.height, **({"anchor": [crop.width / 2, crop.height]} if "anchor" in c else {})}
                pieces[k] = (ImageOps.mirror(crop) if k in MIRROR_CELLS else crop, c)
        pad, x, y, shelf, W = 2, 0, 0, 0, 0
        row_w = max(1024 if lod == "2x" else 512, max(p.width for p, _ in pieces.values()) + 4)
        places = {}
        for k, (p, _) in sorted(pieces.items(), key=lambda kv: -kv[1][0].height):
            if x and x + p.width > row_w:
                x, y, shelf = 0, y + shelf + pad, 0
            places[k] = (x, y)
            x += p.width + pad
            shelf = max(shelf, p.height)
            W = max(W, x)
        sheet = Image.new("RGBA", (W, y + shelf), (0, 0, 0, 0))
        cells = {}
        for k, (p, c) in pieces.items():
            px, py = places[k]
            sheet.alpha_composite(p, (px, py))
            cell = {"x": px, "y": py, "w": p.width, "h": p.height}
            if "anchor" in c:  # anchor 是來源圖集座標 → 換成新位置
                cell["anchor"] = [px + c["anchor"][0] - c["x"], py + c["anchor"][1] - c["y"]]
            cells[k] = cell
        sheet.save(A / f"{name}@{lod}.png", optimize=True)
        out = {"version": 1, "kind": f"mistvale-xilurus-{name}-atlas", "image": f"{name}@{lod}.png", "sheetWidth": sheet.width, "sheetHeight": sheet.height,
               "packing": "shelf", "generator": "l0veyou.com GPT Image 2(Xilurus 風格)→ pipeline/scripts/xilurus/assemble.py", "cells": cells}
        if "scale" in base:
            out["scale"] = base["scale"]
        (A / f"{name}@{lod}.manifest.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{name}: {len(cells)} cells")


def drop(prefix: str):
    for f in A.glob(f"{prefix}@*"):
        f.unlink()


# ── 1+2. 道具/地貌/魔物/特效/圖示 ───────────────────────────────────────
WALK_MIRROR: set = set()   # 生出來朝左的走路表(看過原圖後填)
SHEETS = [  # (表, 暫存 prefix, grid, ids, mirror)
    ("trees-iso-v1.png", "zx-trees", "4x2", ["autumnOak", "oak", "pine", "-", "bush", "stump", "-", "flowerBush"], False),
    ("nature-iso-v2-v1.png", "zx-nature", "4x2", ["snowpine", "birch", "cactus", "boulders", "mossRock", "iceRocks", "outcrop", "wildflowers"], False),
    ("props-iso-v1.png", "zx-props1", "4x2", ["crates", "barrels", "firewood", "fenceRail", "lantern", "signpost", "tent", "hayBale"], False),
    ("props-iso-v2-v1.png", "zx-props2", "4x2", ["stall", "fruitStand", "handCart", "bench", "anvilStump", "weaponRack", "dummy", "archeryTarget"], False),
    ("bld-iso-houses-v1.png", "zx-well", "4x1", ["-", "-", "-", "well"], False),
    ("bld-iso-game-d-v1.png", "zx-gate", "4x1", ["-", "-", "-", "gate"], False),
    ("misc-iso-v1-v1.png", "zx-misc", "4x2", ["cave", "ruin", "sheep", "goat", "garden", "mushroom", "villageBanner", "arenaFlag"], False),
    ("wild-iso-v1-v1.png", "zx-wild", "4x2", ["snowDrift", "frozenPond", "cliffLedge", "fallenLog", "ferns", "flowerYellow", "flowerPink", "flowerBlue"], False),
    ("farm-iso-v1-v1.png", "zx-farm", "4x2", ["flowerWhite", "wheat", "cabbage", "chest", "trough", "scarecrow", "wheelbarrow", "tableSet"], False),
    ("yard-iso-v1-v1.png", "zx-yard", "4x2", ["flowerBox", "purpleBanner", "sacks", "barrel", "bucket", "lamppost", "plot", "campfire"], False),
    ("props-fix-v1.png", "zx-fix", "4x2", ["hayBale", "archeryTarget", "handCart", "chest", "fruitStand", "barrel", "bucket", "snowDrift"], False),   # 2026-10-06 角度修正:8 個偏弱道具重畫成 2:1 等角 3/4
    ("animals-hv-v1.png", "zx-animals", "4x1", ["sheep", "goat", "-", "-"], False),   # 2026-10-06 獵魔村風格(REF = hv2/styleref)
    ("vfx-iso-v1-v1.png", "zx-vfx", "4x2", ["fxSlash", "fxOrb", "fxHeal", "fxStar", "fxHit", "fxSparkle", "iconLeather", "arrowFx"], False),
    ("icons-iso-a-v1.png", "zx-icons-a", "4x4", ["gold", "gems", "wood", "ore", "herb", "drink", "bed", "heal", "cloth", "food", "armor", "swords", "hammer", "anvil", "bag", "skull"], False),
    ("icons-iso-b-v1.png", "zx-icons-b", "4x4", ["hunter", "hall", "scroll", "map", "up", "boss", "trade", "horn", "gear", "arrow", "star", "heart", "shield", "crown", "hourglass", "potion"], False),
]
# 第二張表的縮放基準:(第二張 prefix, 第二張的基準 id, 第一張 prefix, 第一張的基準 id)
NORM: list = []  # 舊 monsters@ 已移除,魔物走 assets/monsters3
SCALE: dict[str, float] = {}
WALK_SCALE: dict = {}
# 舊圖集名 → 內容。舊名保留,build.mjs / pixel-world.js 的載入清單不用改。
MERGES = {
    "details": [("zx-trees", ["oak", "pine", "autumnOak"]), ("zx-nature", ["snowpine", "birch", "boulders", "outcrop"]), ("zx-misc", ["cave", "ruin"]),
                ("zx-props1", ["signpost", "fenceRail"]), ("zx-well", None), ("zx-yard", ["lamppost"])],
    "props": [("zx-animals", ["sheep", "goat"]), ("zx-misc", ["garden", "mushroom", "villageBanner", "arenaFlag"]), ("zx-trees", ["bush"]), ("zx-nature", ["cactus"]),
              ("zx-gate", None), ("zx-props2", ["stall"]), ("zx-props1", ["barrels"])],
    "cold": [("zx-wild", ["frozenPond", "cliffLedge"]), ("zx-fix", ["snowDrift"]), ("zx-nature", ["iceRocks"])],
    "woods": [("zx-wild", ["fallenLog", "ferns"]), ("zx-trees", ["stump"]), ("zx-nature", ["mossRock"])],
    "flora": [("zx-wild", ["flowerYellow", "flowerPink", "flowerBlue"]), ("zx-farm", ["flowerWhite", "wheat", "cabbage"])],
    "yard": [("zx-farm", ["trough", "scarecrow", "wheelbarrow"]), ("zx-props1", ["crates", "firewood", "lantern"]), ("zx-fix", ["chest", "hayBale"])],
    "town": [("zx-props2", ["dummy", "weaponRack", "anvilStump", "bench"]), ("zx-fix", ["archeryTarget", "handCart"]), ("zx-farm", ["tableSet"]), ("zx-yard", ["flowerBox"])],
    "town2": [("zx-yard", ["purpleBanner", "sacks"]), ("zx-fix", ["fruitStand", "barrel", "bucket"]), ("zx-trees", ["flowerBush"])],
    "vfx": [("zx-vfx", ["fxSlash", "fxOrb", "fxHeal", "fxStar", "fxHit", "fxSparkle", "iconLeather", "arrowFx"]), ("zx-yard", ["plot"])],
    "icons": [("zx-icons-a", None), ("zx-icons-b", None)],
}


BOXES: dict = {}
MON_PAL: dict = {}


def atlases():
    BOXES.update(prop_boxes())
    for sheet, prefix, grid, ids, mirror in SHEETS:
        env = {"HUE_TOL": "16"} if prefix in ("zx-wild", "zx-farm", "zx-misc", "zx-yard") else None   # 粉花/紫旗:色鍵收窄
        if prefix == "zx-vfx":
            env = {"HUE_TOL": "12", "NO_SHADOW": "1", "NO_HOLES": "1"}   # 紫法球(HANDOFF:紫色主體一律這組)
        cut(sheet, prefix, grid, ids, mirror, env=env)
    for b_prefix, b_id, a_prefix, a_id in NORM:
        for lod in ("2x",):
            _, cb, _ = load_atlas(b_prefix, lod)
            _, ca, _ = load_atlas(a_prefix, lod)
            SCALE[b_prefix] = ca[a_id]["h"] / cb[b_id]["h"]
    for wp, t in WALK_SCALE.items():
        _, cw, _ = load_atlas(wp, "2x"); _, ca, _ = load_atlas(f"zx-{t}", "2x"); _, cb, _ = load_atlas(f"zx-{t}-b", "2x")
        old = [max(ca[f"{t}3"]["w"], ca[f"{t}3"]["h"]), max(cb[f"{t}6"]["w"], cb[f"{t}6"]["h"]) * SCALE[f"zx-{t}-b"]]
        new = [max(c["w"], c["h"]) for c in cw.values()]
        SCALE[wp] = float(np.median(old) / np.median(new))
    print("second-sheet scale:", {k: round(v, 3) for k, v in SCALE.items()})
    for name, parts in MERGES.items():
        merge(name, parts)
    for prefix in {p for _, p, *_ in SHEETS}:
        drop(prefix)



# ── 3. 英雄 ─────────────────────────────────────────────────────────────
CLASSES = ["berserker", "ranger", "paladin", "sorcerer", "darkknight", "priest"]
POSES = ["walk1", "walk2", "walk3", "walk4", "windup", "strike", "hurt", "rest"]
# 生成瑕疵修正:黑騎士 walk4(經過姿勢)手上沒有大劍 → 用同為經過姿勢的 walk2,走路時劍不會閃掉。
POSE_FIX = {"darkknight_walk4": "darkknight_walk2"}
# 第四批:每職業第二張 5x2 表(以第一張的待機圖當 REF)。依「idle2 高度 = 待機高度」縮放到同一個大小。
POSES_B = ["idle2", "strike2", "dead", "victory", "eat", "drink", "sleep", "bandaged", "trade", "train"]
# 第七批:每職業第三張 4x1(受擊第二格、倒下過程、起身、眨眼),以 blink 身高對齊待機
POSES_C = ["hurt2", "falling", "getup", "blink"]


def normalize_outline(im: Image.Image, dark=(43, 27, 18), thr=118) -> Image.Image:
    """描邊一致性:剪影外緣的亮色邊(白/淺灰)統一改成風格的深棕描邊。

    l0veyou 生的聖騎士/祭司是白銀/白袍+淺色輪廓,outline 比例 0.28–0.51,
    其他職業/魔物都是深色描邊(0.6–0.95),同一場景裡看起來像兩套風格。
    只改最外圈的亮像素(內縮不動),其他顏色不受影響。"""
    a = np.array(im.convert("RGBA"))
    al = a[..., 3] > 40
    inner = np.zeros_like(al)
    inner[1:-1, 1:-1] = al[1:-1, 1:-1] & al[:-2, 1:-1] & al[2:, 1:-1] & al[1:-1, :-2] & al[1:-1, 2:]
    edge = al & ~inner
    lum = 0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]
    fix = edge & (lum > thr)
    a[fix, 0], a[fix, 1], a[fix, 2] = dark
    return Image.fromarray(a, "RGBA")


def torso_x(im: Image.Image) -> float:
    """軀幹中心 x:40–75% 高度每列取最長連續不透明段的中心,取中位數(武器、盾、伸出去的手不會拉偏)。
    所有姿勢(含待機)都用它當對齊錨點 → 換姿勢時身體不會左右跳(check/audit_pose_jump.py 驗)。"""
    m = np.asarray(im)[..., 3] > 127
    ys = np.nonzero(m.any(1))[0]
    top, bot = ys.min(), ys.max(); H = bot - top + 1; xs = []
    for y in range(int(top + H * .4), int(top + H * .75)):
        row = m[y].astype(np.int8)
        d = np.diff(np.concatenate([[0], row, [0]]))
        st, en = np.nonzero(d == 1)[0], np.nonzero(d == -1)[0]
        if len(st):
            i = int(np.argmax(en - st)); xs.append((st[i] + en[i]) / 2)
    return float(np.median(xs))


STANDING_B = ("idle2", "drink", "trade")


def palette_of(ims, n=40):
    """職業色盤:幾張代表姿勢的不透明像素做 median-cut n 色。"""
    px = np.concatenate([np.asarray(im.convert("RGBA")).reshape(-1, 4) for im in ims]); px = px[px[:, 3] > 127][:, :3]
    side = int(np.ceil(np.sqrt(len(px)))); buf = np.zeros((side * side, 3), np.uint8); buf[:len(px)] = px
    return Image.fromarray(buf.reshape(side, side, 3)).quantize(n, method=Image.Quantize.MEDIANCUT)


def pixelize(im: Image.Image, s: float, pal: Image.Image, thr=118) -> Image.Image:
    """高解析生圖 → 真像素畫:LANCZOS 縮 s 倍、alpha 二值化、套職業色盤(不抖動)、最外圈亮色改深棕描邊。"""
    w, h = max(1, round(im.width * s)), max(1, round(im.height * s))
    a = np.asarray(normalize_outline(im).resize((w, h), Image.LANCZOS)).copy()
    alpha = np.where(a[..., 3] >= 110, 255, 0).astype(np.uint8)
    rgb = Image.fromarray(a[..., :3]).quantize(palette=pal, dither=Image.Dither.NONE).convert("RGB")
    out = np.dstack([np.asarray(rgb), alpha])
    return normalize_outline(Image.fromarray(out, "RGBA"), thr=thr)


def body_h(im: Image.Image) -> int:
    m = np.asarray(im)[..., 3] > 127; w = m.shape[1]; t = torso_x(im)
    lo, hi = int(max(0, t - .15 * w)), int(min(w, t + .15 * w) + 1)
    ys = np.nonzero(m[:, lo:hi].any(1))[0]
    return int(ys.max() - ys.min() + 1)


def heroes():
    from make_sd_heroes import LODS, pack, shrink, foot_x  # 同一套 LOD 高度與打包格式
    got = {}
    for cls in CLASSES:
        ids = [cls] + [f"{cls}_{p}" for p in POSES] + ["-"]
        cut(f"hero-{cls}-iso-v1.png", "zx-hero", "5x2", ids, env={"HUE_TOL": "16"})
        im, cells, _ = load_atlas("zx-hero", "2x")
        got[cls] = {k: im.crop((c["x"], c["y"], c["x"] + c["w"], c["y"] + c["h"])) for k, c in cells.items()}
        for dst, src in POSE_FIX.items():
            if dst in got[cls]:
                got[cls][dst] = got[cls][src].copy()
        cc = SRC / f"hero-{cls}-iso-c-v1.png"
        if cc.exists():
            cut(cc.name, "zx-hero", "4x1", [f"{cls}_{p}" for p in POSES_C], env={"HUE_TOL": "16"})
            im, cells, _ = load_atlas("zx-hero", "2x"); drop("zx-hero")
            cs = {k: im.crop((c["x"], c["y"], c["x"] + c["w"], c["y"] + c["h"])) for k, c in cells.items()}
            fc = body_h(got[cls][cls]) / body_h(cs[f"{cls}_blink"])
            got[cls].update({k: resize_sprite(v, fc) for k, v in cs.items()})
        cut(f"hero-{cls}-iso-b-v1.png", "zx-hero", "5x2", [f"{cls}_{p}" for p in POSES_B], env={"HUE_TOL": "16"})
        im, cells, _ = load_atlas("zx-hero", "2x")
        bb = {k: im.crop((c["x"], c["y"], c["x"] + c["w"], c["y"] + c["h"])) for k, c in cells.items()}
        f = got[cls][cls].height / bb[f"{cls}_idle2"].height
        got[cls].update({k: resize_sprite(v, f) for k, v in bb.items()})
        # 同一張表裡模型每格畫的大小不一定一樣(黑騎士/法師的飲用、交易小了 13–18%):
        # 站姿類逐格再校一次,讓「軀幹錨點 ±15% 寬欄位的身高」等於待機(audit_art.py 同一個量法)。
        bh = body_h(got[cls][cls])
        for p in STANDING_B:
            k = f"{cls}_{p}"; r = bh / body_h(got[cls][k])
            if abs(r - 1) > .04: got[cls][k] = resize_sprite(got[cls][k], r)
        drop("zx-hero")
        drop("zx-hero")
    # 像素密度一致(audit_density.py):英雄美術像素＝1x 圖集像素(待機高 34 美術像素、畫 21 邏輯單位 → 0.62 單位/美術像素,
    # 跟建築/魔物/地面同一級)。先縮成 1x 真像素畫(縮小 + 職業色盤 + 深色描邊),2x/4x 是它的整數倍最近鄰放大,不再各自平滑縮放。
    art = {}
    for cls in CLASSES:
        g = got[cls]; s1 = LODS["1x"][0] / g[cls].height
        pal = palette_of([g[cls]] + [g[f"{cls}_{p}"] for p in ("walk1", "strike", "hurt")])
        art[cls] = {k: pixelize(v, s1, pal) for k, v in g.items()}
    for tag, (h, sc) in LODS.items():
        hero, pose, extra = {}, {}, {}
        n = h // LODS["1x"][0]
        for cls in CLASSES:
            g = art[cls]
            up = lambda im: im.resize((im.width * n, im.height * n), Image.NEAREST)
            hero[cls] = up(g[cls])
            for p in POSES + POSES_B + POSES_C:
                key = f"{cls}_{p}"
                if key not in g: continue
                q = up(g[key])
                pose[key] = q
                extra[key] = {"foot": round(foot_x(q), 1)}
        for cls in CLASSES:   # 錨點一律用軀幹中心(待機也是),不用腳底(腳底會被落地的斧頭、盾、法杖拉偏)
            for key in [f"{cls}_{p}" for p in POSES + POSES_B + POSES_C if f"{cls}_{p}" in pose]:
                extra[key] = {"foot": round(torso_x(pose[key]), 1)}
        hero_extra = {cls: {"foot": round(torso_x(hero[cls]), 1)} for cls in CLASSES}
        pack(hero, f"hero@{tag}", sc, hero_extra)
        pack(pose, f"heropose@{tag}", sc, extra)
        for name in (f"hero@{tag}", f"heropose@{tag}"):
            mp = A / f"{name}.manifest.json"
            m = json.loads(mp.read_text(encoding="utf-8"))
            m["generator"] = "l0veyou.com GPT Image 2(Xilurus 風格 Q 版英雄,每職業一張 5x2 表)→ pipeline/scripts/xilurus/assemble.py heroes"
            mp.write_text(json.dumps(m, ensure_ascii=False, indent=1), encoding="utf-8")


# ── 4. 建築與廣場雕像 ───────────────────────────────────────────────────
BUILDING_SHEETS = [("bld-iso-game-a-v1.png", ["hall", "trading", "restaurant", "inn"]), ("bld-iso-game-b-v1.png", ["tavern", "clinic", "forge", "academy"]),
                   ("bld-iso-game-c-v1.png", ["training", "sanctuary", "house", "bounty"]), ("bld-iso-game-d-v1.png", ["enhancement", "dungeon", "monument", "-"])]


def buildings():
    """建築:第六批單張高細節重繪(bldhd-<id>,以第一批建築圖當 REF)→ 去背 → 像素化到跟英雄同一個美術像素密度
    (畫寬 ≈ conceptBuildingWidth×0.85 邏輯單位,0.62 單位/美術像素),存 ×4 最近鄰。沒有 bldhd 的退回第一批 4x1 表。"""
    import re
    XD.mkdir(exist_ok=True)
    src = (ROOT / "src" / "pixel-world.js").read_text(encoding="utf-8")
    CW = {k: float(v) for k, v in re.findall(r"(\w+):(\d+)", re.search(r"conceptBuildingWidth=id=>\(\{([^}]*)\}", src).group(1))}
    widths = {}
    for sheet, ids in BUILDING_SHEETS:
        for k in ids:
            if k == "-": continue
            hd = SRC / f"bldhd-{k}-v1.png"
            if not (hd.exists() or hd.with_suffix(".jpg").exists()):
                continue
            cut(hd.name if hd.exists() else hd.with_suffix(".jpg").name, "zx-bld", "1x1", [k])
            im, cells, _ = load_atlas("zx-bld", "2x"); c = cells[k]
            crop = im.crop((c["x"], c["y"], c["x"] + c["w"], c["y"] + c["h"])); drop("zx-bld")
            art_w = CW.get(k, 106) * .85 / ART_DENSITY
            art = pixelize(crop, art_w / crop.width, palette_of([crop], 48))
            out = art.resize((art.width * 4, art.height * 4), Image.NEAREST)
            out.save(XD / f"{k}.png", optimize=True); widths[k] = out.width
            print(f"  {k}: {crop.width}px → art {art.width}×{art.height}")
    (XD / "buildings.json").write_text(json.dumps(widths, indent=1), encoding="utf-8")


# ── 5. 地面材質 ─────────────────────────────────────────────────────────
def native(path: Path, n=256, k=64):
    """生圖是放大的像素畫(1024² 約 16px 一格,但格線不規則):裁掉外圈 5%(暗角/框),BOX 縮到 k×k 原生像素,
    回傳 (原生圖, 放大倍數 n//k);之後無縫化再最近鄰放大到 n×n。generate.mjs 會把副檔名改成 .png/.jpg,兩種都找。"""
    if not path.exists():
        path = next(q for q in [path.with_suffix(".jpg"), path.with_suffix(".png")] if q.exists())
    im = Image.open(path).convert("RGB")
    w, h = im.size
    m = int(min(w, h) * .05)
    return im.crop((m, m, w - m, h - m)).resize((k, k), Image.BOX), n // k


def seamless(im: Image.Image, seed=7):
    """半格位移後,中央用原圖、邊緣用位移圖;交界用有機的抖動遮罩切換(不做透明混色,像素保持銳利)。"""
    a = np.asarray(im).astype(np.uint8)
    n = a.shape[0]
    rolled = np.roll(np.roll(a, n // 2, 0), n // 2, 1)
    yy, xx = np.mgrid[0:n, 0:n] / (n - 1)
    edge = np.minimum(np.minimum(xx, 1 - xx), np.minimum(yy, 1 - yy)) * 2   # 0 邊緣 → 1 中心
    rng = np.random.default_rng(seed)
    noise = np.asarray(Image.fromarray((rng.random((n // 16, n // 16)) * 255).astype(np.uint8)).resize((n, n), Image.BICUBIC)) / 255
    use_orig = (edge * 1.6 + (noise - .5) * .55) > .62
    out = np.where(use_orig[..., None], a, rolled)
    return Image.fromarray(out)


TEXTURES = {"grass": "tex-grass", "meadow": "tex-meadow", "forest": "tex-forest", "taiga": "tex-taiga", "snow": "tex-snow", "mountain": "tex-mountain",
            "desert": "tex-desert", "water": "tex-water", "ice": "tex-ice", "dirt": "tex-dirt", "stone": "tex-stone", "soil": "tex-soil"}
# 有方向性的材質(沙紋、浪、田壟)不能旋轉,第二層改用位移。
DIRECTIONAL = {"desert", "water", "soil"}
MACRO = 512   # 圖集一格 = 512 原生像素(高細節材質原生 256,組成 2×2 不重複大格)


def periodic_noise(n, cells, seed):
    """n×n、週期 n 的平滑雜訊(0..1):cells×cells 隨機格,環狀雙線性內插。"""
    rng = np.random.default_rng(seed)
    g = rng.random((cells, cells))
    u = np.arange(n) * cells / n
    i0 = np.floor(u).astype(int) % cells
    i1 = (i0 + 1) % cells
    f = u - np.floor(u)
    f = f * f * (3 - 2 * f)
    a = g[np.ix_(i0, i0)] * (1 - f)[:, None] * (1 - f)[None, :] + g[np.ix_(i1, i0)] * f[:, None] * (1 - f)[None, :]         + g[np.ix_(i0, i1)] * (1 - f)[:, None] * f[None, :] + g[np.ix_(i1, i1)] * f[:, None] * f[None, :]
    return a


def macro(tile: Image.Image, key: str, seed: int) -> Image.Image:
    """256 無縫磚 → 512 大格:底層 2×2 平鋪,第二層(旋轉 90°/有方向的用位移)依週期雜訊遮罩逐像素切換,
    像素不混色(保持銳利),而且 512 一個週期 → 畫面上看不出 256 的重複。"""
    a = np.asarray(tile.convert("RGB"))
    base = np.tile(a, (2, 2, 1))
    if key in DIRECTIONAL:
        b = np.roll(np.roll(base, 173, 1), 97, 0)
    else:
        b = np.tile(np.rot90(a, 1 + seed % 3), (2, 2, 1))
        b = np.roll(np.roll(b, 131, 0), 59, 1)
    n = periodic_noise(MACRO, 6, seed) * .75 + periodic_noise(MACRO, 23, seed + 1) * .25
    rng = np.random.default_rng(seed + 2)
    m = (n + (rng.random(n.shape) - .5) * .12) > .5   # 交界一點抖動,邊不會是平滑曲線
    return Image.fromarray(np.where(m[..., None], b, base).astype(np.uint8))


def textures():
    """高細節材質(tex2-*,256 原生像素)→ 512 大格。沒有 tex2 的退回第一版低細節材質(64 原生 ×4)。"""
    XD.mkdir(exist_ok=True)
    tex = {}
    for i, (key, name) in enumerate(TEXTURES.items()):
        hi = SRC / f"tex2-{key}-v1.png"
        if hi.exists() or hi.with_suffix(".jpg").exists():
            small, _ = native(hi, k=256)
            ref, _ = native(SRC / f"{name}-v1.png")   # 色調以第一版(已確認的 Xilurus 色票)為準:逐通道配平均,對比取兩者之間
            a, r = np.asarray(small).astype(float), np.asarray(ref).astype(float).reshape(-1, 3)
            am, asd, rm, rsd = a.reshape(-1, 3).mean(0), a.reshape(-1, 3).std(0) + 1e-6, r.mean(0), r.std(0)
            small = Image.fromarray(np.clip((a - am) / asd * (asd * .5 + rsd * .5) + rm, 0, 255).astype(np.uint8))
            t = macro(seamless(small, seed=len(key) * 31), key, seed=11 + i * 7)
        else:
            small, up = native(SRC / f"{name}-v1.png")
            t = seamless(small, seed=len(key) * 31).resize((MACRO, MACRO), Image.NEAREST)
        if key == "water":   # 海往 Xilurus 色票的柔和青藍拉
            arr = np.asarray(t).astype(float)
            t = Image.fromarray(np.clip(arr * .55 + np.array([48, 128, 150]) * .45, 0, 255).astype(np.uint8))
        # 像素密度一致:512 大格縮成 256(1 原生像素 = 0.5 邏輯單位,跟英雄 0.62、建築同一級;audit_density.py),
        # BOX 縮小後減到 48 色,不留半色調糊邊。
        t = t.resize((MACRO // 2, MACRO // 2), Image.BOX).quantize(48, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert("RGB")
        t.save(XD / f"tex-{key}.png")
        tex[key] = t
        print(f"  {key}: {'tex2 256→512' if hi.exists() or hi.with_suffix('.jpg').exists() else 'v1 64×8'}")
    layout = [["village", "meadow", "birch", "forest"], ["taiga", "snow", "mountain", "desert"], ["river", "ocean", "ice", "bridge"]]
    source = {"village": "grass", "meadow": "meadow", "birch": "meadow", "forest": "forest", "taiga": "taiga", "snow": "snow", "mountain": "mountain",
              "desert": "desert", "river": "water", "ocean": "water", "ice": "ice", "bridge": "dirt"}
    birchify = lambda arr: np.clip(arr * [1.03, 1.02, .9] + [8, 4, 0], 0, 255)
    T = MACRO // 2
    sheet = Image.new("RGB", (4 * T, 3 * T))
    cells = {}
    for r, row in enumerate(layout):
        for c, b in enumerate(row):
            t = tex[source[b]]
            if b == "birch":   # 白樺花原:比向陽草原亮一階、偏黃綠
                t = Image.fromarray(birchify(np.asarray(t).astype(float)).astype(np.uint8))
            sheet.paste(t, (c * T, r * T))
            cells[b] = {"x": c * T, "y": r * T, "w": T, "h": T}
    sheet.save(A / "terrain-atlas.png", optimize=True)
    (A / "terrain-atlas.manifest.json").write_text(json.dumps({"version": 1, "kind": "mistvale-terrain-atlas", "image": "terrain-atlas.png", "sheetWidth": sheet.width,
        "sheetHeight": sheet.height, "tile": T, "generator": "l0veyou GPT Image 2(Xilurus 風格,高細節材質)→ pipeline/scripts/xilurus/assemble.py textures", "cells": cells}, indent=1), encoding="utf-8")
    wood, up = native(SRC / "tex-woodui-v1.png")   # UI 木紋
    seamless(wood, seed=3).resize((256, 256), Image.NEAREST).save(A / "woodui.png")
    tex["stone"].save(A / "plaza.png")
    tex["dirt"].save(A / "road.png")
    for key, src in [("stone", "stone"), ("earth", "dirt"), ("grass", "grass")]:   # 村莊地面層(畫的時候 1 原生像素 = 0.5 邏輯單位)
        tex[src].save(A / f"concept-{key}.png")
    stats = {}
    for b, s_ in source.items():
        arr = np.asarray(tex[s_]).reshape(-1, 3).astype(float)
        if b == "birch":
            arr = birchify(arr)
        stats[b] = {"mean": [round(v) for v in arr.mean(0)], "sd": [round(v) for v in arr.std(0)]}
    (XD / "ground-tones.json").write_text(json.dumps(stats, indent=1), encoding="utf-8")
    print("textures:", {k: v["mean"] for k, v in stats.items()})


def tones():
    """把 assets/xilurus/ground-tones.json(新材質的生態域平均色/標準差)寫進 pixel-world.js 的 GRASS_TONE 與 MAP_ACCENT。
    舊值是對齊舊概念圖(title.png)量的;新基準是 Xilurus 材質本身。"""
    import re
    st = json.loads((XD / "ground-tones.json").read_text(encoding="utf-8"))
    pw = ROOT / "src" / "pixel-world.js"
    s = pw.read_text(encoding="utf-8")
    keys = ["village", "meadow", "birch", "forest", "taiga", "snow", "mountain", "desert", "river", "ocean", "ice"]
    body = ",".join(f"{k}:{{mean:{st[k]['mean']},sd:{st[k]['sd']}}}" for k in keys).replace(" ", "")
    line = f"const GRASS_TONE={{{body}}};  // Xilurus 材質量測(pipeline/scripts/xilurus/assemble.py tones)"
    s, n = re.subn(r"const GRASS_TONE=\{.*?\n(?=const groundBase)", line + "\n", s, count=1, flags=re.S)
    assert n == 1, "GRASS_TONE not found"
    hexc = lambda rgb, k=1: "#" + "".join(f"{max(0, min(255, round(v * k))):02x}" for v in rgb)
    acc = (f"export const MAP_ACCENT={{grass:'{hexc(st['meadow']['mean'], 1.12)}',snow:'{hexc(st['snow']['mean'], 1.03)}',desert:'{hexc(st['desert']['mean'], 1.08)}',"
           f"mountain:'{hexc(st['mountain']['mean'], 1.12)}',road:'{hexc(st['bridge']['mean'])}',sea:'{hexc(st['ocean']['mean'], .85)}'}};")
    s, n = re.subn(r"export const MAP_ACCENT=\{[^}]*\};", acc, s, count=1)
    assert n == 1, "MAP_ACCENT not found"
    pw.write_text(s, encoding="utf-8", newline="\n")
    print("GRASS_TONE / MAP_ACCENT updated")


if __name__ == "__main__":
    what = sys.argv[1] if len(sys.argv) > 1 else "all"
    for step in ["atlases", "buildings", "textures", "tones", "title"]:
        if what in (step, "all"):
            print(f"== {step}")
            globals()[step]()
