# hv-gap-sheet.py — 把 output/ui-audit/hv-gap/shots/<視窗>/ 的截圖拼成編號拼圖: python hv-gap-sheet.py <視窗> <cols> <cellW> <start> <count> <out.png> [names,...]
import sys, os
from PIL import Image, ImageDraw, ImageFont
tag, cols, cw, start, count, out = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5]), sys.argv[6]
base = os.path.join('output/ui-audit/hv-gap/shots', tag)
names = sys.argv[7].split(',') if len(sys.argv) > 7 else sorted(f[:-4] for f in os.listdir(base) if f.endswith('.png'))
names = names[start:start+count]
ims = []
for n in names:
    im = Image.open(os.path.join(base, n + '.png')).convert('RGB'); s = cw / im.width
    ims.append((n, im.resize((cw, int(im.height * s)), Image.LANCZOS)))
ch = max(i.height for _, i in ims) + 22
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (cols * cw, rows * ch), (40, 40, 40)); d = ImageDraw.Draw(sheet)
try: f = ImageFont.truetype('C:/Windows/Fonts/msjh.ttc', 15)
except Exception: f = ImageFont.load_default()
for k, (n, im) in enumerate(ims):
    x, y = (k % cols) * cw, (k // cols) * ch
    d.text((x + 4, y + 2), n, fill=(255, 230, 120), font=f); sheet.paste(im, (x, y + 22))
sheet.save(out); print(out, sheet.size)
