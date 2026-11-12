"""Front/back walk for the bare body from one 3D motion (PixelLab mode skeleton-v3), so the arms swing
in depth (towards/away from the camera) and never out to the sides.

    PIXELLAB_TOKEN=... python pipeline/scripts/pixellab/barebody_walk_skeleton.py <character_id> <out_dir> <dirs> [group_id]

dirs: comma list (south,north). group_id: reuse an existing skeleton-v3 animation so a later
direction moves the same way. Saves <out_dir>/<dir>/frame-NN.png and <out_dir>/run-<dirs>.json.
"""
import sys, json, importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location('pl', str(Path.home() / '.claude/skills/pixellab-assets/scripts/pixellab.py'))
pl = importlib.util.module_from_spec(spec); spec.loader.exec_module(pl)

cid, out, dirs = sys.argv[1], Path(sys.argv[2]), sys.argv[3].split(',')
group = sys.argv[4] if len(sys.argv) > 4 else None
ACTION = ('natural calm walk cycle in place that loops: the legs step alternately, heel then toe, with a slight up and down '
          'body bob; both arms hang close to the sides of the body and swing only forward and back, towards and away from '
          'the camera, opposite to the legs; the hands stay right beside the thighs and never move out to the left or right; '
          'torso upright, head steady')
before = pl.get('/balance')['subscription']['generations']
payload = {'character_id': cid, 'mode': 'skeleton-v3', 'action_description': ACTION, 'frame_count': 8, 'directions': dirs, 'seed': 7}
if group: payload['animation_group_id'] = group
r = pl.post('/characters/animations', payload)
gid = r.get('animation_group_id')
print('group:', gid, '| directions:', r.get('directions'))
res = {'group': gid, 'mode': 'skeleton-v3', 'action': ACTION, 'dirs': {}}
for job in r.get('background_job_ids') or []:
    done = pl.wait(job, job[:8], every=15)
    lr = done.get('last_response') or {}
    d = str(lr.get('direction') or 'dir')
    n = pl.save_images(lr.get('images') or [], out / d) if done.get('status') == 'completed' else 0
    res['dirs'][d] = {'status': done.get('status'), 'frames': n, 'usage': lr.get('billing_usage') or done.get('usage')}
    print(' ', d, res['dirs'][d])
res['generations_before'] = before
res['generations_after'] = pl.get('/balance')['subscription']['generations']
out.mkdir(parents=True, exist_ok=True)
(out / f'run-{"-".join(dirs)}.json').write_text(json.dumps(res, indent=1))
print('generations', before, '->', res['generations_after'])
