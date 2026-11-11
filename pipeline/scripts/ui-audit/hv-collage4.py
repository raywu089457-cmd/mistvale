"""hv-collage4.py — 獵魔村風格第四階段拼圖(改前/改後)。
用法: python pipeline/scripts/ui-audit/hv-collage4.py
  讀 output/ui-audit/hv-phase4-before/ 與 hv-phase4-after/(由 hv-shots.mjs 產生;panels: hunter,recruit,worldmap,mapregion),輸出
    output/ui-audit/hv-phase4.png  總寬 2600px:
      列 1  獵人詳情 1440x900            改前|改後(主按鈕不再整排寬)
      列 2  招募 1440x900                改前|改後
      列 3  手機 390x844:招募 改前|改後,獵人詳情小按鈕特寫 改前|改後
      列 4  世界地圖 1440x900            改前|改後(區域卡風景圖)
      列 5  地區詳情 1440x900            改前|改後
      列 6  手機 390x844:世界地圖 改前|改後,地區詳情 改前|改後
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[3]
B = ROOT / 'output/ui-audit/hv-phase4-before'
A = ROOT / 'output/ui-audit/hv-phase4-after'
OUT = ROOT / 'output/ui-audit/hv-phase4.png'
BG = (24, 21, 19)
FG = (244, 236, 214)
W = 2600
GAP = 20
LAB = 40


def font(n):
    for f in ('C:/Windows/Fonts/msjhbd.ttc', 'C:/Windows/Fonts/msjh.ttc', 'C:/Windows/Fonts/arial.ttf'):
        try:
            return ImageFont.truetype(f, n)
        except OSError:
            pass
    return ImageFont.load_default()


def load(path, crop=None):
    im = Image.open(path).convert('RGB')
    return im.crop(crop) if crop else im


def fit(im, w):
    return im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)


def row_desktop(name, fn):
    cw = (W - GAP * 3) // 2
    return name, [fit(load(B / fn), cw), fit(load(A / fn), cw)], cw, ['改前', '改後']


def row_phone(items):
    # items: (名稱, 檔名, 裁切框或 None);每項 改前|改後 並排
    n = len(items) * 2
    cw = (W - GAP * (n + 1)) // n
    ims, tags = [], []
    for name, fn, crop in items:
        ims += [fit(load(B / fn, crop), cw), fit(load(A / fn, crop), cw)]
        tags += [f'{name} · 改前', f'{name} · 改後']
    return None, ims, cw, tags


# 390x844、dsf 2 → 780x1688;小按鈕特寫裁「修煉主鈕」到最後一顆次要鈕(y 860..1340)
CLOSE = (0, 860, 780, 1340)
rows = [
    row_desktop('1440x900 · 獵人詳情', '1440x900-hunter.png'),
    row_desktop('1440x900 · 招募', '1440x900-recruit.png'),
    row_phone([('390x844 招募', '390x844-recruit.png', None), ('390 獵人詳情小按鈕特寫', '390x844-hunter.png', CLOSE)]),
    row_desktop('1440x900 · 世界地圖', '1440x900-worldmap.png'),
    row_desktop('1440x900 · 地區詳情', '1440x900-mapregion.png'),
    row_phone([('390x844 世界地圖', '390x844-worldmap.png', None), ('390x844 地區詳情', '390x844-mapregion.png', None)]),
]

f = font(24)
heights = [max(i.height for i in ims) + LAB + GAP for _, ims, _, _ in rows]
H = GAP + sum(heights)
sheet = Image.new('RGB', (W, H), BG)
d = ImageDraw.Draw(sheet)
y = GAP
for (name, ims, cw, tags), hh in zip(rows, heights):
    for j, (im, tag) in enumerate(zip(ims, tags)):
        x = GAP + j * (cw + GAP)
        d.text((x, y + 6), f'{name} · {tag}' if name else tag, fill=FG, font=f)
        sheet.paste(im, (x, y + LAB))
    y += hh
sheet.save(OUT)
print(OUT, sheet.size)
