"""Create the shared bare-body PixelLab character from the snapped l0veyou turnaround.

    PIXELLAB_TOKEN=... python pipeline/scripts/pixellab/barebody_character.py <ref_dir> <out_json>

<ref_dir> holds south/north/east/west .png (128x128, 2x pixels, feet at y=116) made from
output/l0veyou/barebody/barebody-4dir-lowres-v1.png by snap_turnaround.py. South is the reference,
the other three are given as direction images, so PixelLab only generates the four diagonals.
"""
import sys, json, importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location('pl', str(Path.home() / '.claude/skills/pixellab-assets/scripts/pixellab.py'))
pl = importlib.util.module_from_spec(spec); spec.loader.exec_module(pl)

ref, out = Path(sys.argv[1]), Path(sys.argv[2])
before = pl.get('/balance')['subscription']['generations']
payload = {
    'name': 'barebody-base',
    'description': 'bald neutral base-body mannequin, warm tan skin, dark brown cloth band across the chest, dark brown shorts, no hair, no other clothing, no weapons',
    'n_directions': 8,
    'view': 'side',
    'template_id': 'mannequin',
    'seed': 7,
    'reference_image': {'type': 'base64', 'base64': pl.b64(ref / 'south.png')},
    'direction_images': {d: {'type': 'base64', 'base64': pl.b64(ref / f'{d}.png')} for d in ('north', 'east', 'west')},
}
r = pl.post('/create-character-v3', payload)
job = (r.get('background_job_ids') or [r.get('background_job_id')])[0]
done = pl.wait(job, 'create', every=10)
lr = done.get('last_response') or {}
after = pl.get('/balance')['subscription']['generations']
res = {'status': done.get('status'), 'character_id': lr.get('character_id'), 'usage': done.get('usage') or lr.get('billing_usage'),
       'generations_before': before, 'generations_after': after}
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(res, indent=1))
print(json.dumps(res))
