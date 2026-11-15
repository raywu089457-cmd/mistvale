"""rs2x.py: hv-parts px/ (32 px canvases, the user's PixelLab parts) -> one-step PixelLab /resize to the 2x-DV2 sizes -> hv-parts/x2/"""
import base64, io, os, sys, json
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import requests
from PIL import Image
TOK = (Path.home() / '.pixellab-token').read_text().strip()
HV = Path('C:/Users/ray/Documents/Codex/2026-09-29/new-chat/work/mistvale/output/hv-parts')
OUT = HV / 'x2'
T = {'head': 25, 'hat': 25, 'body': 21}
def rs(im, t):
    b = io.BytesIO(); im.save(b, 'PNG')
    r = requests.post('https://api.pixellab.ai/v2/resize', headers={'Authorization': f'Bearer {TOK}'}, timeout=300, json={
        'description': 'pixel art chibi game sprite part', 'reference_image': {'type': 'base64', 'base64': base64.b64encode(b.getvalue()).decode()},
        'reference_image_size': {'width': im.width, 'height': im.height}, 'target_size': {'width': t, 'height': t},
        'no_background': True, 'view': 'low top-down', 'seed': 7})
    if r.status_code != 200: raise RuntimeError(f'{r.status_code} {r.text[:200]}')
    d = r.json(); img = d.get('image') or (d.get('images') or [None])[0]
    raw = base64.b64decode(img['base64']) if isinstance(img, dict) and img.get('base64') else requests.get(img['url'] if isinstance(img, dict) else img, timeout=60).content
    return Image.open(io.BytesIO(raw)).convert('RGBA')
jobs = []
for n in sorted(os.listdir(HV / 'px')):
    for f in os.listdir(HV / 'px' / n):
        jobs.append((HV / 'px' / n / f, OUT / n / f, T[n.split('_')[0]]))
for n, v in (('fist_side', 'east'), ('fist_front', 'south')):
    jobs.append((HV / 'raw' / n / 'image-0.png', OUT / n / f'{v}.png', None))
def run(j):
    src, dst, t = j
    im = Image.open(src).convert('RGBA')
    if t is None:                          # fist: crop to the fist, pad square, aim for ~10 px
        bb = im.getbbox(); c = im.crop(bb); s = max(c.size) + 2
        sq = Image.new('RGBA', (s, s)); sq.alpha_composite(c, ((s - c.width) // 2, (s - c.height) // 2)); im = sq
        t = max(16, round(s * 10 / max(c.size)))
    if dst.exists():
        return f'skip {dst.relative_to(HV)}'
    import time
    for attempt in range(12):
        try:
            out = rs(im, t); break
        except Exception as e:
            if '429' in str(e):
                time.sleep(10 + 5 * attempt); continue
            return f'FAIL {src} {e}'
    else:
        return f'FAIL {src} still 429'
    dst.parent.mkdir(parents=True, exist_ok=True); out.save(dst)
    return f'{dst.relative_to(HV)} {im.size}->{out.size} bbox {out.getbbox()}'
with ThreadPoolExecutor(2) as ex:
    for line in ex.map(run, jobs): print(line)
