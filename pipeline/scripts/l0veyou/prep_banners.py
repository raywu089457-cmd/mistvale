# prep_banners.py — l0veyou(GPT Image 2,以 assets/ui/px-banner-dungeon.png 當風格參考)生的彈窗橫幅 → assets/ui/px-banner-<名>.png/.webp。2026-10-30。
# 原圖 16:9(1536×864)在 output/l0veyou/banner-<名>-v1.png,提示詞在 output/l0veyou/prompts/banner-<名>.txt。
# 裁出主體所在的橫帶再縮一半;CSS 的 background-position 再微調(pixel-style.css「UI/UX 精修(一)」)。
import pathlib, sys
from PIL import Image
sys.stdout.reconfigure(encoding='utf-8')
ROOT = pathlib.Path(__file__).resolve().parents[3]; SRC = ROOT / 'output/l0veyou'; G = ROOT / 'assets/ui'
CROPS = {'boss': (40, 600), 'recruit': (100, 660), 'trade': (120, 680), 'quests': (120, 680), 'craft': (152, 712), 'inventory': (152, 712), 'build': (152, 712), 'hunters': (152, 712), 'difficulty': (152, 712), 'help': (152, 712), 'settings': (152, 712), 'dispatch': (152, 712)}   # 原圖的 y 範圍
for n, (y0, y1) in CROPS.items():
    src = Image.open(SRC / f'banner-{n}-v1.png').convert('RGB'); k = src.height / 864   # 有些圖是 1360×768,不是 1536×864:依實際高度等比例換算裁切範圍
    im = src.crop((0, round(y0 * k), src.width, round(y1 * k))).resize((768, (y1 - y0) // 2), Image.LANCZOS)
    im.save(G / f'px-banner-{n}.png'); im.save(G / f'px-banner-{n}.webp', quality=88, method=6)
    print(n, im.size, (G / f'px-banner-{n}.webp').stat().st_size // 1024, 'KB webp')
