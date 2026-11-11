"""hv-collage3.py — 獵魔村風格第三階段拼圖(改前/改後)。
用法: python pipeline/scripts/ui-audit/hv-collage3.py
  讀 output/ui-audit/hv-phase3-before/ 與 hv-phase3-after/(由 hv-phase3-shots.mjs 產生),輸出
    output/ui-audit/hv-phase3.png  總寬 2600px:
      列 1  獵人詳情 1440x900  改前|改後
      列 2  獵人狀態底色 1440x900  改前|改後(改後多一位待機的測試獵人湊滿七種狀態)
      列 3  手機 390x844:獵人詳情、派遣面板捲到底   各 改前|改後
      列 4  手機 390x844:獵人狀態底色、暫停標籤＋資訊小卡   各 改前|改後
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[3]
B = ROOT / 'output/ui-audit/hv-phase3-before'
A = ROOT / 'output/ui-audit/hv-phase3-after'
OUT = ROOT / 'output/ui-audit/hv-phase3.png'
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


def fit(path, w):
    im = Image.open(path).convert('RGB')
    return im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)


def row_desktop(name, fn):
    cw = (W - GAP * 3) // 2
    ims = [fit(B / fn, cw), fit(A / fn, cw)]
    return name, ims, cw, ['改前', '改後']


def row_phone(items):
    # 4 張手機圖(2 組 改前|改後)排一列
    n = len(items) * 2
    cw = (W - GAP * (n + 1)) // n
    ims, tags = [], []
    for name, fn in items:
        ims += [fit(B / fn, cw), fit(A / fn, cw)]
        tags += [f'{name} · 改前', f'{name} · 改後']
    return None, ims, cw, tags


rows = [
    row_desktop('1440x900 · 獵人詳情', 'hunter-1440.png'),
    row_desktop('1440x900 · 獵人狀態底色', 'states-1440.png'),
    row_phone([('390x844 獵人詳情', 'hunter-390.png'), ('390x844 派遣面板捲到底', 'dispatch-390.png')]),
    row_phone([('390x844 獵人狀態底色', 'states-390.png'), ('390x844 暫停標籤＋資訊小卡', 'pause-390.png')]),
]

f = font(24)
heights = []
for name, ims, cw, tags in rows:
    heights.append(max(i.height for i in ims) + LAB + GAP)
H = GAP + sum(heights)
sheet = Image.new('RGB', (W, H), BG)
d = ImageDraw.Draw(sheet)
y = GAP
for (name, ims, cw, tags), hh in zip(rows, heights):
    for j, (im, tag) in enumerate(zip(ims, tags)):
        x = GAP + j * (cw + GAP)
        label = f'{name} · {tag}' if name else tag
        d.text((x, y + 6), label, fill=FG, font=f)
        sheet.paste(im, (x, y + LAB))
    y += hh
sheet.save(OUT)
print(OUT, sheet.size)
