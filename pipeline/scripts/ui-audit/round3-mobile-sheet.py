"""round3-mobile-sheet.py <scene> [port|land|all] -> output/ui-audit/round3-mobile/sheets/<scene>-<grp>.png (各尺寸同一場景並排)"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
ROOT = Path(__file__).resolve().parents[3]
S = ROOT / 'output/ui-audit/round3-mobile/gap/shots'
PORT = ['360x640', '375x667', '360x780', '390x844', '412x915', '430x932', '768x1024']
LAND = ['667x375', '740x360', '844x390', '932x430', '1024x768']
def font(n):
    for f in ('C:/Windows/Fonts/msjhbd.ttc', 'C:/Windows/Fonts/arial.ttf'):
        try: return ImageFont.truetype(f, n)
        except OSError: pass
    return ImageFont.load_default()
def sheet(scene, grp, H):
    tags = PORT if grp == 'port' else LAND
    ims = []
    for t in tags:
        p = S / t / f'{scene}.png'
        if not p.exists(): continue
        im = Image.open(p).convert('RGB'); k = H / im.height; im = im.resize((int(im.width * k), H)); ims.append((t, im))
    if not ims: return None
    W = sum(i.width for _, i in ims) + 8 * (len(ims) + 1)
    out = Image.new('RGB', (W, H + 40), (24, 21, 19)); d = ImageDraw.Draw(out); x = 8
    for t, im in ims:
        out.paste(im, (x, 36)); d.text((x + 4, 6), t, fill=(244, 236, 214), font=font(22)); x += im.width + 8
    return out
if __name__ == '__main__':
    sc = sys.argv[1]; grps = [sys.argv[2]] if len(sys.argv) > 2 and sys.argv[2] != 'all' else ['port', 'land']
    (ROOT / 'output/ui-audit/round3-mobile/sheets').mkdir(parents=True, exist_ok=True)
    for g in grps:
        o = sheet(sc, g, 760 if g == 'port' else 380)
        if o: o.save(ROOT / f'output/ui-audit/round3-mobile/sheets/{sc}-{g}.png'); print('saved', sc, g, o.size)
