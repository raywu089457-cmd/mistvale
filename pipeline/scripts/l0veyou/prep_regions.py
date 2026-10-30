# prep_regions.py — 世界地圖區域卡的插圖條:l0veyou 原圖(16:9)→ assets/ui/px-region-<id>.png/.webp。2026-10-30。
# 用法: python -X utf8 pipeline/scripts/l0veyou/prep_regions.py <id> [<id> ...]   原圖在 output/l0veyou/region-<id>-v1.png
import pathlib, sys
from PIL import Image
sys.stdout.reconfigure(encoding='utf-8')
ROOT = pathlib.Path(__file__).resolve().parents[3]; SRC = ROOT / 'output/l0veyou'; G = ROOT / 'assets/ui'
for n in sys.argv[1:]:
    im = Image.open(SRC / f'region-{n}-v1.png').convert('RGB')
    w, h = im.size; band = int(w / 3.2); y0 = max(0, (h - band) // 2)
    im = im.crop((0, y0, w, y0 + band)).resize((640, 200), Image.LANCZOS)
    im.save(G / f'px-region-{n}.png'); im.save(G / f'px-region-{n}.webp', quality=86, method=6)
    print(n, im.size, (G / f'px-region-{n}.webp').stat().st_size // 1024, 'KB webp')
