"""Re-pose the AI bare body into the pixelfx rig's walk, one PixelLab animate-with-skeleton-v3 call per direction.

    PIXELLAB_TOKEN=... python pipeline/scripts/pixellab/rig_repose.py <first_dir> <rig_keypoints.json> <out_dir> [dirs=down,up,right] [max_gens=10]

first_dir: {dir}.png (152x152, the AI body standing on the rig idle, 2x) and estimated-keypoints.json
(PixelLab's own skeleton of those images = first_frame_keypoints). The motion is the rig's walk
skeletons (pipeline/scripts/pixelfx/character/data/rig-keypoints.json, fractions of the same 152
canvas), so every returned frame stands in the rig's pose of that frame. Stops before a call that
would push the spend past max_gens (3 generations per 8-frame call).
"""
import sys, json, importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location('pl', str(Path.home() / '.claude/skills/pixellab-assets/scripts/pixellab.py'))
pl = importlib.util.module_from_spec(spec); spec.loader.exec_module(pl)

first, rigkp, out = Path(sys.argv[1]), json.loads(Path(sys.argv[2]).read_text()), Path(sys.argv[3])
dirs = (sys.argv[4] if len(sys.argv) > 4 else 'down,up,right').split(',')
cap = float(sys.argv[5]) if len(sys.argv) > 5 else 10
est = json.loads((first / 'estimated-keypoints.json').read_text())
FACING = {'down': 'south', 'up': 'north', 'right': 'east'}
DESC = 'bald tan-skinned base-body mannequin with two dark dot eyes, a dark brown cloth band across the chest and dark brown shorts'
start = pl.get('/balance')['subscription']['generations']
log = {'start_generations': start, 'dirs': {}}
for d in dirs:
    spent = start - pl.get('/balance')['subscription']['generations']
    if spent + 3 > cap + 1e-9:
        print(f'stop before {d}: spent {spent:.2f}, cap {cap}'); break
    kp = [[{'label': j['label'], 'x': j['x'], 'y': j['y'], 'depth': j['depth']} for j in frame] for frame in rigkp['directions'][d]['walk']]
    ff = [{'label': j['label'], 'x': j['x'], 'y': j['y']} for j in est[d]]
    payload = {'description': DESC, 'action': 'walk', 'direction': FACING[d], 'view': 'side', 'template_id': 'mannequin',
               'first_frame': {'type': 'base64', 'base64': pl.b64(first / f'{d}.png')}, 'first_frame_keypoints': ff,
               'keypoints': kp, 'seed': 7, 'no_background': True}
    r = pl.post('/animate-with-skeleton-v3', payload)
    job = r.get('background_job_id') or (r.get('background_job_ids') or [None])[0]
    done = pl.wait(job, d, every=15)
    lr = done.get('last_response') or {}
    n = pl.save_images(lr.get('images') or [], out / d) if done.get('status') == 'completed' else 0
    log['dirs'][d] = {'status': done.get('status'), 'frames': n, 'usage': lr.get('usage') or done.get('usage')}
    print(d, log['dirs'][d])
log['end_generations'] = pl.get('/balance')['subscription']['generations']
out.mkdir(parents=True, exist_ok=True)
(out / 'run.json').write_text(json.dumps(log, indent=1))
print('generations', start, '->', log['end_generations'])
