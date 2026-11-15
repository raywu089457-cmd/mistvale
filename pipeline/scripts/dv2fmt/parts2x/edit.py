"""python edit.py <src.png> <out.png> <seed> <description...>  -- PixelLab edit-image (async job), same canvas size, transparent"""
import base64, sys, time
from pathlib import Path
import requests
TOK = (Path.home() / '.pixellab-token').read_text().strip(); Hh = {'Authorization': f'Bearer {TOK}'}
src, out, seed, desc = sys.argv[1], sys.argv[2], int(sys.argv[3]), ' '.join(sys.argv[4:])
from PIL import Image
im = Image.open(src); W, H = im.size
for k in range(20):
    r = requests.post('https://api.pixellab.ai/v2/edit-image', headers=Hh, timeout=300, json={
        'image': {'type': 'base64', 'base64': base64.b64encode(Path(src).read_bytes()).decode()}, 'image_size': {'width': W, 'height': H},
        'description': desc, 'width': W, 'height': H, 'seed': seed, 'no_background': True, 'text_guidance_scale': 8})
    if r.status_code == 429: time.sleep(8); continue
    break
if r.status_code not in (200, 202): raise SystemExit(f'{r.status_code} {r.text[:300]}')
d = r.json(); job = d.get('background_job_id') or (d.get('background_job_ids') or [None])[0]
res = d
if job:
    while True:
        res = requests.get(f'https://api.pixellab.ai/v2/background-jobs/{job}', headers=Hh, timeout=60).json()
        if res.get('status') in ('completed', 'failed'): break
        time.sleep(5)
lr = res.get('last_response') or res
img = lr.get('image') or (lr.get('images') or [None])[0]
raw = base64.b64decode(img['base64'].split(',', 1)[-1]) if isinstance(img, dict) and img.get('base64') else requests.get(img['url'] if isinstance(img, dict) else img, timeout=60).content
Path(out).parent.mkdir(parents=True, exist_ok=True); Path(out).write_bytes(raw); print(out, res.get('status'), res.get('usage') or lr.get('usage'))
