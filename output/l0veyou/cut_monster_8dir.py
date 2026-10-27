"""cut_monster_8dir.py — 下載資料夾的新魔物 8 方向旋轉表 → 每隻一個資料夾、每個方向一個檔案（放桌面）。

來源：PixelLab 網站 Rotate 匯出的 768×768（3×3、每格 256、8 格有內容、第 9 格空）。
格子順序（實測 5 隻怪物一致，跟牧師/英雄的 8 方向表相同）：**由正面起順時針**
    cell0 south / cell1 south-east / cell2 east / cell3 north-east
    cell4 north / cell5 north-west / cell6 west / cell7 south-west
驗證方式：cell2 的臉朝右（東）、cell6 朝左（西）、cell4 是背面；幻獸手上武器（冰棍、鐮刀、斧）位置也對得上。

怪物辨識：把每張表的 cell0（正面）跟 output/l0veyou/hv5/mon-front-<id>.png 比對
（去洋紅 → 等比縮進 72×72 → alpha IoU＋顏色差）。實測 21 張全部 IoU ≥ 0.98、色差 ≤ 0.4 → 對應確定。

用法：python output/l0veyou/cut_monster_8dir.py [輸出資料夾]
"""
import json, os, pathlib, shutil, sys
import numpy as np
from PIL import Image

SRC = pathlib.Path(os.path.expanduser("~/Downloads"))
CONCEPT = pathlib.Path("output/l0veyou/hv5")
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/Desktop"))
CELL, TILE = 256, 768

DIRS = [(1, "正面", "south"), (2, "右前", "south-east"), (3, "右側", "east"), (4, "右後", "north-east"),
        (5, "背面", "north"), (6, "左後", "north-west"), (7, "左側", "west"), (8, "左前", "south-west")]

# id → (中文名, 地形, gameSize, artSize, cell, 剪影關鍵)
ROSTER = {
    "sprout":     ("花芽妖",   "向陽草原", 22, 75, 144, "花苞頭＋葉子手臂"),
    "ram":        ("捲角羊",   "向陽草原", 24, 82, 144, "羊毛桶身＋兩支捲角"),
    "mole":       ("鼴鼠",     "向陽草原", 24, 82, 144, "矮胖絨毛＋兩隻大鏟爪"),
    "shroom":     ("蕈菇怪",   "橡木密林", 22, 75, 144, "紅斑菇帽＋胖菇柄"),
    "boar":       ("野豬",     "橡木密林", 26, 89, 144, "低矮楔形＋背脊鬃毛"),
    "vine":       ("藤鞭怪",   "橡木密林", 28, 96, 144, "藤蔓纏木樁＋拖地藤鞭"),
    "wolfman":    ("灰毛狼人", "霜杉林地", 29, 99, 144, "瘦高狼人＋大戰斧"),
    "moss":       ("苔蘚巨魔", "霜杉林地", 31, 106, 176, "寬厚駝背＋大木棒"),
    "snowhare":   ("雪兔",     "霜杉林地", 22, 75, 144, "圓球身＋兩支長耳"),
    "yeti":       ("霜雪怪",   "白霜雪原", 33, 113, 176, "巨大蓬毛＋冰塊棍"),
    "snowman":    ("雪人哨兵", "白霜雪原", 26, 89, 144, "三球堆疊＋樹枝手"),
    "icebeetle":  ("冰甲蟲",   "白霜雪原", 23, 79, 144, "低平冰殼＋六足"),
    "kobold":     ("礦穴地精", "鐵脊山麓", 23, 79, 144, "矮身手腳＋礦工帽"),
    "boulder":    ("岩塊怪",   "鐵脊山麓", 31, 106, 176, "寬方岩堆＋發光眼"),
    "goat":       ("鐵角羊",   "鐵脊山麓", 26, 89, 144, "厚捲巨角＋山羊鬍"),
    "mummy":      ("木乃伊",   "赤金沙地", 28, 96, 144, "細瘦繃帶＋彎刀"),
    "cactus":     ("仙人掌怪", "赤金沙地", 24, 82, 144, "稜狀桶身＋頭頂花"),
    "scorpion":   ("沙蠍",     "赤金沙地", 26, 89, 144, "扁身鉗子＋上鉤尾巴"),
    "floraspirit":("花妖精",   "白樺花原", 22, 75, 144, "花冠頭＋細葉身"),
    "birchling":  ("白樺樹精", "白樺花原", 27, 93, 144, "白樺細幹＋葉冠"),
    "stag":       ("白樺雄鹿", "白樺花原", 28, 96, 144, "桶狀胸＋大鹿角"),
}


def key(im):
    a = np.asarray(im.convert("RGB")).astype(np.int16)
    mn = np.minimum(a[..., 0], a[..., 2])
    bg = (a[..., 1] * 100 < mn * 62) & (mn > 70)
    return Image.fromarray(np.dstack([a.astype(np.uint8), np.where(bg, 0, 255).astype(np.uint8)]), "RGBA")


def sig(im, size=72):
    a = np.asarray(im.convert("RGBA")); m = a[..., 3] > 0
    ys, xs = np.nonzero(m)
    c = im.convert("RGBA").crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    c.thumbnail((size, size), Image.LANCZOS)
    cv = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    cv.alpha_composite(c, ((size - c.width) // 2, (size - c.height) // 2))
    return np.asarray(cv).astype(np.float32)


def identify(cell0):
    v = sig(cell0); out = []
    for f in sorted(CONCEPT.glob("mon-front-*.png")):
        ref = sig(key(Image.open(f)))
        a1, a2 = v[..., 3] > 127, ref[..., 3] > 127
        iou = (a1 & a2).sum() / max(1, (a1 | a2).sum())
        both = a1 & a2
        cd = float(np.abs(v[..., :3][both] - ref[..., :3][both]).mean()) if both.any() else 255
        out.append((iou - cd / 255 * .05, iou, cd, f.stem[len("mon-front-"):]));
    out.sort(reverse=True)
    return out[0], out[1]


sheets = [p for p in sorted(SRC.glob("pixellab-*.png"), key=os.path.getmtime) if Image.open(p).size == (TILE, TILE)]
print(len(sheets), "sheets")
made = []
for p in sheets:
    im = Image.open(p).convert("RGBA")
    best, second = identify(im.crop((0, 0, CELL, CELL)))
    score, iou, cd, mid = best
    cn, region, gs, art, cell, shape = ROSTER[mid]
    if iou < .9:
        print(f"  ! {p.name} 對應信心不足 ({mid} iou={iou:.3f}) → 跳過")
        continue
    folder = OUT / f"{cn}-{mid}-8方向-256"
    folder.mkdir(parents=True, exist_ok=True)
    for k, (num, zh, en) in enumerate(DIRS):
        im.crop(((k % 3) * CELL, (k // 3) * CELL, (k % 3 + 1) * CELL, (k // 3 + 1) * CELL)).save(
            folder / f"{num}-{zh}-{en}.png")
    shutil.copy2(p, folder / "00-8方向總表.png")
    (folder / "00-說明.txt").write_text(
        f"{cn}（{mid}）\n"
        f"地形：{region}\n"
        f"剪影關鍵：{shape}\n"
        f"遊戲尺寸 gameSize {gs} → artSize {art}（= gameSize × 72/21）、cell {cell}\n\n"
        f"檔案：1-正面-south … 8-左前-south-west，每張 256×256 透明、第 9 格（右下）是空的。\n"
        f"方向順序：由正面起順時針（cell0 南、2 東、4 北、6 西）。\n\n"
        f"來源：{p.name}（768×768＝每格 256，PixelLab Rotate 匯出）\n"
        f"辨識：跟 output/l0veyou/hv5/mon-front-{mid}.png 比對 alpha IoU {iou:.3f}／色差 {cd:.1f}，"
        f"第二候選 {second[3]}（IoU {second[1]:.3f}）。\n",
        encoding="utf-8")
    made.append((cn, mid, folder.name, iou))
print(f"{len(made)} 隻 → {OUT}")
for cn, mid, name, iou in made:
    print(f"  {name:34s} iou={iou:.3f}")
