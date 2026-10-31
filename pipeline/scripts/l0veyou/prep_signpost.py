# prep_signpost.py — l0veyou(GPT Image 2)生的地區立牌木牌 → assets/ui/px-signpost.png。2026-10-31。
# 原圖(1024²,洋紅底)在 output/l0veyou/signpost-region-v1.jpg,提示詞在 output/l0veyou/prompts/signpost-region.txt。
# 流程:洋紅去背(硬邊,含邊緣去色)→ 裁到內容 → 縮成寬 112(遊戲裡畫 22 世界單位寬,約 2x 供放大用)。
import pathlib, sys
from PIL import Image
sys.stdout.reconfigure(encoding='utf-8')
ROOT = pathlib.Path(__file__).resolve().parents[3]
SRC = ROOT / 'output/l0veyou/signpost-region-v1.jpg'
OUT = ROOT / 'assets/ui/px-signpost.png'
KEY = (255, 0, 255)
TOL = 90            # 洋紅距離門檻(JPEG 邊緣會有雜訊,門檻放寬一點)
WIDTH = 112

im = Image.open(SRC).convert('RGB')
px = im.load()
w, h = im.size
out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
op = out.load()
for y in range(h):
    for x in range(w):
        r, g, b = px[x, y]
        d = ((r - KEY[0]) ** 2 + (g - KEY[1]) ** 2 + (b - KEY[2]) ** 2) ** 0.5
        if d < TOL:
            continue
        # 邊緣去色:洋紅會滲進像素,把 R/B 拉回跟 G 一致,避免紫邊
        if d < TOL * 2.2:
            avg = (r + b) // 2
            r = min(r, avg); b = min(b, avg)
        op[x, y] = (r, g, b, 255)

# 去紫邊:洋紅會讓暗部偏紫,把「R、B 都高於 G」的多出來的部分壓回去
for y in range(h):
    for x in range(w):
        r, g, b, a = op[x, y]
        if not a:
            continue
        k = (r + b) / 2 - g
        if k > 0:
            r = max(0, int(r - k * 0.55)); b = max(0, int(b - k * 0.55))
            op[x, y] = (r, g, b, a)

bbox = out.getbbox()
out = out.crop(bbox)
scale = WIDTH / out.width
out = out.resize((WIDTH, max(1, round(out.height * scale))), Image.LANCZOS)
OUT.parent.mkdir(parents=True, exist_ok=True)
out.save(OUT)
print('saved', OUT, out.size)

# 奶油色板面範圍(羅馬數字要畫在這裡):只掃上半部,避免底部草/蘑菇的淺色
fw, fh = out.size
p2 = out.load()
xs, ys = [], []
for y in range(int(fh * 0.7)):
    for x in range(fw):
        r, g, b, a = p2[x, y]
        if a > 200 and r > 205 and g > 190 and b > 150:
            xs.append(x); ys.append(y)
if xs:
    print('face rel', round(min(xs)/fw,4), round(min(ys)/fh,4), round((max(xs)+1)/fw,4), round((max(ys)+1)/fh,4))
