// foothills-edge.mjs — T68: the 鐵脊山麓 (mountain) / 向陽草原 (meadow) border on the right of the
// village must be a straight line from the ring-road corner at screen angle 0 to the right world edge,
// with meadow on the -z side and mountain on the +z side. Plain node, no browser.
// Usage: node tools/checks/foothills-edge.mjs   (exit 0 = the border holds, 1 = FIX line printed)
import {
  WORLD, REGIONS, RING_ROAD, ringRoadDistance, biomeAt, regionAt, regionContains, wildAt,
} from '../../src/overworld.js';
import { VILLAGE_BOUNDS } from '../../src/village-grid.js';

const VC = { x: (VILLAGE_BOUNDS.minX + VILLAGE_BOUNDS.maxX) / 2, z: (VILLAGE_BOUNDS.minZ + VILLAGE_BOUNDS.maxZ) / 2 };
// screen angle 0 = the old meadow/mountain ray (the direction the ring road corner sits on)
const DIR = { x: Math.SQRT1_2, z: -Math.SQRT1_2 };

// smallest positive ray/segment crossing of VC + t*DIR against the closed ring road
function rayRingT() {
  let best = Infinity;
  for (let i = 0; i < RING_ROAD.length; i++) {
    const a = RING_ROAD[i], b = RING_ROAD[(i + 1) % RING_ROAD.length];
    const ex = b.x - a.x, ez = b.z - a.z;
    const den = DIR.x * ez - DIR.z * ex;
    if (Math.abs(den) < 1e-12) continue;
    const qx = a.x - VC.x, qz = a.z - VC.z;
    const t = (qx * ez - qz * ex) / den;
    const u = (qx * DIR.z - qz * DIR.x) / den;
    if (t > 1e-9 && u >= -1e-9 && u <= 1 + 1e-9 && t < best) best = t;
  }
  return best;
}

let bad = 0;
const fix = (msg) => { bad++; console.log(`FIX ${msg}`); };

const t = rayRingT();
if (!Number.isFinite(t)) { fix('the screen-angle-0 ray never reaches the ring road'); process.exit(1); }
const C = { x: VC.x + DIR.x * t, z: VC.z + DIR.z * t };
const cornerDist = ringRoadDistance(C.x, C.z);
if (cornerDist >= 0.01) fix(`road corner is ${cornerDist.toFixed(3)} away from the ring road (want < 0.01) at ${C.x.toFixed(2)},${C.z.toFixed(2)}`);

const ABOVE = C.z - 0.4, BELOW = C.z + 0.4;   // -z = meadow side, +z = mountain side
const AGREE = (x, z, id) => {
  const ids = [biomeAt(x, z), regionAt(x, z).id, regionContains(id, x, z) ? id : `not-${id}`];
  const wrong = ids.find(v => v !== id);
  return wrong === undefined ? null : `biomeAt=${ids[0]} regionAt=${ids[1]} regionContains=${ids[2]}`;
};

let pairs = 0, lastX = -Infinity;
for (let x = C.x + 0.3; x <= WORLD.maxX; x += 0.7) {
  if (!wildAt(x, ABOVE) || !wildAt(x, BELOW)) continue;
  pairs++;
  lastX = x;
  const aboveErr = AGREE(x, ABOVE, 'meadow');
  const belowErr = AGREE(x, BELOW, 'mountain');
  if (aboveErr) { fix(`at x=${x.toFixed(2)} z=${ABOVE.toFixed(2)} expected meadow, got ${aboveErr}`); continue; }
  if (belowErr) { fix(`at x=${x.toFixed(2)} z=${BELOW.toFixed(2)} expected mountain, got ${belowErr}`); continue; }
  // the crossing must sit on z = C.z, not merely somewhere between the two probes
  let lo = ABOVE, hi = BELOW;   // lo = meadow, hi = mountain
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (regionAt(x, mid).id === 'meadow') lo = mid; else hi = mid;
  }
  const cross = (lo + hi) / 2;
  if (Math.abs(cross - C.z) > 0.05) fix(`at x=${x.toFixed(2)} the border crosses z=${cross.toFixed(3)}, expected ${C.z.toFixed(3)} (±0.05)`);
}
if (pairs < 18) fix(`only ${pairs} land pairs sampled along the new border (want at least 18)`);
if (!(lastX >= WORLD.maxX - 7)) fix(`last sampled pair is at x=${Number.isFinite(lastX) ? lastX.toFixed(2) : 'none'} (want >= ${(WORLD.maxX - 7).toFixed(2)})`);

// every other wild region keeps its own centre and the three membership calls agree there
for (const r of REGIONS.filter(q => !['village', 'meadow', 'mountain'].includes(q.id))) {
  const err = AGREE(r.x, r.z, r.id);
  if (err) fix(`${r.id} centre ${r.x.toFixed(2)},${r.z.toFixed(2)} no longer reports its own region: ${err}`);
}

if (bad) { console.log(`\n${bad} check(s) fail the foothills edge`); process.exit(1); }
console.log(`PASS: foothills/meadow border runs straight from the ring-road corner (${C.x.toFixed(2)},${C.z.toFixed(2)}) to x=${WORLD.maxX.toFixed(2)}; ${pairs} land pairs flip at z=${C.z.toFixed(2)}.`);
