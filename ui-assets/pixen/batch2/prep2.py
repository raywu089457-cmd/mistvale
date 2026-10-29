# prep2.py — 把帳號 2 生的 Pixen 表切成遊戲用零件，寫到 out2/game/（確認後再複製進 assets/ui/）
#   px-ic-<名>.png   32×32 圖示（整格保留透明邊，background-size:contain 時大小一致）
#   px-em-<名>.png   64×64 徽章（區域徽章套圓形遮罩，去掉沒去乾淨的背景）
#   px-loading-bg / px-banner-dungeon / px-banner-arena：大圖，另存無損 WebP（build 會優先用 .webp）
import pathlib, sys
from PIL import Image, ImageDraw
sys.stdout.reconfigure(encoding='utf-8')
HERE = pathlib.Path(__file__).parent; S = HERE / 'out2'; G = S / 'game'; G.mkdir(exist_ok=True)
GRIDS = {
    'icons1': ['hammer', None, None, 'anvil', 'dungeon', 'swords', 'scroll', 'map', 'gold', 'gems', 'wood', 'ore', 'gear', 'skull', 'horn', 'hall'],
    'icons2': ['herb', 'cloth', 'flour', 'leather', 'food', 'drink', 'bed', 'bandage', 'heal', 'star', 'up', 'plus', 'close', 'arrow', 'boss', 'bag'],
    'icons3': ['hunter', 'trade', 'pouch', 'population', 'board', 'trophy', 'potion', 'lock', 'check', 'help', 'flag', 'gift', 'compass', 'torch', 'chest', 'search'],
    'status': ['diff-0', 'diff-1', 'diff-2', 'diff-3', 'diff-4', 'hp', 'satiety', 'stamina', 'mood', 'atk', 'def', 'rebirth', 'upgrade', 'quest', 'crown', 'time'],
}
EMB = ['village', 'meadow', 'birch', 'forest', 'taiga', 'desert', 'snow', 'mountain',
       'berserker', 'paladin', 'sorcerer', 'archer', 'assassin', 'priest', 'dungeon', 'arena']
warn = []
for sheet, names in GRIDS.items():
    im = Image.open(S / f'{sheet}.png').convert('RGBA'); c = im.width // 4
    for k, n in enumerate(names):
        if not n: continue
        x, y = (k % 4) * c, (k // 4) * c; cell = im.crop((x, y, x + c, y + c))
        a = cell.getchannel('A'); ring = sum(1 for i in range(c) for (px, py) in [(i, 0), (i, c - 1), (0, i), (c - 1, i)] if a.getpixel((px, py)) > 8)
        if ring > 2: warn.append(f'{sheet}:{n} touches cell edge ({ring} px)')
        cell.save(G / f'px-ic-{n}.png')
em = Image.open(S / 'emblems.png').convert('RGBA'); c = em.width // 4
for k, n in enumerate(EMB):
    x, y = (k % 4) * c, (k // 4) * c; cell = em.crop((x, y, x + c, y + c))
    if k < 8:   # 區域徽章：圓形遮罩（半徑量的是黃銅外圈）
        bb = cell.getchannel('A').getbbox(); m = Image.new('L', cell.size, 0)
        r = {'taiga': 27.5, 'snow': 26.5}.get(n, 29.5); cx = cy = c / 2   # 這兩張的黃銅框比較小，外面還留著沒去乾淨的背景
        ImageDraw.Draw(m).ellipse((cx - r, cy - r, cx + r, cy + r), fill=255)
        cell.putalpha(Image.composite(cell.getchannel('A'), Image.new('L', cell.size, 0), m))
    cell.save(G / f'px-em-{n}.png')
for n in ['loading-bg', 'banner-dungeon', 'banner-arena']:
    im = Image.open(S / f'{n}.png').convert('RGB'); im.save(G / f'px-{n}.png'); im.save(G / f'px-{n}.webp', lossless=True, method=6)
    print(n, im.size, (G / f'px-{n}.png').stat().st_size // 1024, 'KB png', (G / f'px-{n}.webp').stat().st_size // 1024, 'KB webp')
print(len(list(G.glob('px-ic-*.png'))), 'icons', len(list(G.glob('px-em-*.png'))), 'emblems')
print('\n'.join(warn) or 'no edge warnings')
