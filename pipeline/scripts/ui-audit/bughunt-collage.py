"""bughunt-collage.py — 把 report.md 的重點 bug 截圖拼成 output/ui-audit/bughunt/bugs.png
用法: python pipeline/scripts/ui-audit/bughunt-collage.py
  編號對應 report.md(B1..B12);來源是 output/ui-audit/bughunt/shots/ 內由 bughunt-main.mjs / bughunt-extra.mjs 產生的截圖。
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[3]
S = ROOT / 'output/ui-audit/bughunt/shots'
OUT = ROOT / 'output/ui-audit/bughunt/bugs.png'
CELLS = [  # (編號, 檔名, 標題, 裁切區域(相對 0..1,可 None))
    ('B1', 'phone-x-dungeon-hud.png', '手機 390x844 · 地下城出征中:小隊HUD與顧問卡/通知互蓋,「撤退」被行動徽章壓住', (0, 0.05, 1, 0.45)),
    ('B2', 'phone-world-placement.png', '手機 · 移動建築「取消」鈕無效;提示寫「ESC 取消」;面板蓋住縮放鈕', (0, 0.62, 1, 0.95)),
    ('B3', 'phone-pilot-pick.png', '手機 · 手動操控選角清單蓋住整個頂欄與行動徽章', (0, 0, 1, 0.45)),
    ('B4', 'phone-x-unitcard-overlap.png', '手機 · 獵人小卡蓋住縮放鈕(＋/−),關閉 X 只有 26px', (0, 0.60, 1, 0.95)),
    ('B5', 'desktop-01-title.png', '桌機 1440x900 · 全新玩家的標題畫面顯示「繼續遊戲／重新開始」(遊戲已在背後跑)', None),
    ('B6', 'land-tab-build.png', '橫向 844x390 · 建設卡「i」44px 熱區下半被成本列蓋住(點中心點到礦石圖示)', None),
    ('B7', 'tablet-long-offline.png', '平板 1024x768 · 離線戰報「收下」在視窗外,要捲到最底', None),
    ('B8', 'phone-tab-inventory.png', '手機 · 倉庫材料「來源／用途」被截成一行', (0, 0.12, 1, 0.75)),
    ('B9', 'land-x-dungeon-hud.png', '橫向 · 小隊HUD壓住左側通知文字,按鈕只有 20px 高', None),
    ('B10', 'phone-tab-dungeon.png', '手機 · toast 蓋在視窗內容上;地下城選滿 3 人後點第 4 位無任何提示', (0, 0.1, 1, 0.55)),
]
CW = 640   # 每格內圖寬
CH = 560   # 每格內圖高(上限)
LAB = 64
GAP = 14
COLS = 3
BG = (24, 21, 19)
FG = (244, 236, 214)
RED = (200, 70, 55)


def font(n):
    for f in ('C:/Windows/Fonts/msjhbd.ttc', 'C:/Windows/Fonts/msjh.ttc', 'C:/Windows/Fonts/arial.ttf'):
        try:
            return ImageFont.truetype(f, n)
        except OSError:
            pass
    return ImageFont.load_default()


def wrap(d, text, f, width):
    lines, cur = [], ''
    for ch in text:
        if d.textlength(cur + ch, font=f) > width:
            lines.append(cur)
            cur = ch
        else:
            cur += ch
    if cur:
        lines.append(cur)
    return lines


cells = []
for n, fn, title, crop in CELLS:
    im = Image.open(S / fn).convert('RGB')
    if crop:
        w, h = im.size
        im = im.crop((int(crop[0] * w), int(crop[1] * h), int(crop[2] * w), int(crop[3] * h)))
    sc = min(CW / im.width, CH / im.height)
    im = im.resize((max(1, int(im.width * sc)), max(1, int(im.height * sc))), Image.LANCZOS)
    cells.append((n, title, im))

rows = (len(cells) + COLS - 1) // COLS
rowh = [max(c[2].height for c in cells[r * COLS:(r + 1) * COLS]) + LAB for r in range(rows)]
W = COLS * (CW + GAP) + GAP
H = sum(rowh) + (rows + 1) * GAP
out = Image.new('RGB', (W, H), BG)
d = ImageDraw.Draw(out)
fb, fs = font(28), font(18)
y = GAP
for r in range(rows):
    for c in range(COLS):
        i = r * COLS + c
        if i >= len(cells):
            continue
        n, title, im = cells[i]
        x = GAP + c * (CW + GAP)
        d.rectangle((x, y, x + CW, y + rowh[r] - 1), fill=(38, 33, 30))
        d.text((x + 8, y + 6), n, font=fb, fill=RED)
        tx = x + 8 + d.textlength(n, font=fb) + 10
        for k, line in enumerate(wrap(d, title, fs, CW - (tx - x) - 8)[:3]):
            d.text((tx, y + 6 + k * 20), line, font=fs, fill=FG)
        out.paste(im, (x + (CW - im.width) // 2, y + LAB))
    y += rowh[r] + GAP
out.save(OUT)
print(OUT, out.size)
