"""round3-ux-sheet.py — 把資料夾裡的截圖排成一張接觸表(含格號)。
用法: python round3-ux-sheet.py out.png cols cellw file1 file2 ...   (每個檔可寫 path#標籤)"""
import sys
from PIL import Image, ImageDraw, ImageFont
out, cols, cw = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
items = sys.argv[4:]
try:
    font = ImageFont.truetype('C:/Windows/Fonts/msjh.ttc', 15)
except Exception:
    font = ImageFont.load_default()
tiles = []
for it in items:
    p, _, lab = it.partition('#')
    im = Image.open(p).convert('RGB')
    h = int(im.height * cw / im.width)
    tiles.append((im.resize((cw, h), Image.LANCZOS), lab or p.split('/')[-1]))
rows = [tiles[i:i + cols] for i in range(0, len(tiles), cols)]
rh = [max(t[0].height for t in r) + 22 for r in rows]
sheet = Image.new('RGB', (cols * (cw + 6) + 6, sum(rh) + 6), (30, 30, 34))
d = ImageDraw.Draw(sheet)
y = 4
for r, h in zip(rows, rh):
    for i, (im, lab) in enumerate(r):
        x = 6 + i * (cw + 6)
        sheet.paste(im, (x, y + 20))
        d.text((x + 2, y + 1), lab, fill=(255, 220, 120), font=font)
    y += h
sheet.save(out)
print(out, sheet.size)
