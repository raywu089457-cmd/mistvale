// T86: the shared bare body as a material for the vendored pixelfx rig (./core/rig.js).
//
// A material is an ordered list of layers, top first; each layer gets one pixel descriptor
// { x, y, part, bone, tone, mat, u, v, ... } from the rig and returns a colour number or null. The
// first non-null wins, and the bare body is the bottom layer, so equipment cards can push their
// layers in front of it without touching the rig.
//
// The body is bald (all head cells skin), wears plain shorts over the pelvis, the lower waist and
// the top of each thigh, and a plain chest wrap over the middle of the chest bone, in the same
// cloth colours, and has one ink eye on the face front at head mid-height. T90: the garments are
// picked by BONE and bone-local position, never by rest row: a rest-row rule scatters dark patches
// over the chest, belly and legs as soon as the figure turns. No chest mark, no weapon, no grey.
//
// T92: the colour comes from the l0veyou v1 turnaround, as measured bands plus one lighting rule,
// not as a per-pixel copy. l0v-texture.mjs measures, at the reference's own resolution, where the
// chest wrap and the shorts start and end (as fractions of the torso/thigh) and how far the shorts
// stick out backward in the side view, and writes l0v-cloth.json. The material draws the garments
// from those bands in bone-local coordinates (T90's approach), and shades every frame in one pass:
// light from the upper left, so in each bone's screen row the leftmost pixel is lit, the rightmost
// shaded and the middle the base tone; the far limbs are a darker two-tone, and the head/shoulder
// tops get a 1 px rim. The cloth is one region per garment (base, with the rightmost pixel of each
// screen row and the lowest pixel of each screen column dark), so bone seams don't draw a
// checkerboard through it. The side view paints no cloth on the far thigh: it is separated from the
// near shorts by the near leg and its ink edge, so it only ever produced detached shards. The rig's
// ink (outline, eyes, limb edges) is never repainted.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { hex } from './core/color.js';
import { BONE_LEN } from './core/rig.js';

export const PALETTE = {
  ink: hex('#1d1410'),
  // lit, base, shade, far-limb dark: the far limbs keep pixelfx's one-step dim, so their darkest
  // tone is the darker skin rather than another shade of the near tone
  skin: ['#f6c894', '#e4b78d', '#c88f5f', '#9a6440'].map(hex),
  // base, base, shade, shade: the cloth only has two tones
  cloth: ['#5b4b3e', '#5b4b3e', '#463a30', '#463a30'].map(hex),
};

/** T90: the shorts cover the top 40% of a thigh, measured along the thigh bone itself. */
export const SHORTS_THIGH = 0.4 * BONE_LEN.thigh;
/** T90: the chest wrap is the middle third of the chest bone's ellipsoid (centre v +0.9, r 4.2). */
export const WRAP_BAND = [-0.5, 2.3];
// one 1 px eye on the face front, at head mid-height (rest cell 15,4: the front-most head column)
export const EYE = { x: 15, y: 4 };
// T88: in the front view the rest cell (15,4) is shared by three screen pixels (a 2 px bar),
// so the two eyes are anchored to the head joint in screen space. The face is turned ~32 deg
// (core/rig.js headTurn), so both eyes sit left of the joint and clear of the face/head seam.
export const FRONT_EYE = { cx: 0, dx: 1, dy: 0 };

const isLeg = (bone) => bone === 'thighN' || bone === 'thighF';

/** The side-view eye (yaw 0 only: the front view has frontEyeLayer's pair instead). */
export const eyeLayer = ({ x, y, part, yaw }) =>
  (yaw ?? 0) === 0 && part === 'head' && x === EYE.x && y === EYE.y ? PALETTE.ink : null;
/** The front view's two eyes, either side of the face centre on the head joint's screen row. */
export const frontEyeLayer = ({ part, yaw, sx, sy, hx, hy }) =>
  part === 'head' && Math.abs(yaw - Math.PI / 2) < 0.01 && sy === Math.round(hy) + FRONT_EYE.dy &&
  (sx === Math.round(hx) + FRONT_EYE.cx - FRONT_EYE.dx || sx === Math.round(hx) + FRONT_EYE.cx + FRONT_EYE.dx)
    ? PALETTE.ink
    : null;
/** Plain shorts: the pelvis, the lower half of the waist, and each thigh's top 40% by bone length.
 *  One connected region on every frame in every direction. */
export const shortsLayer = ({ bone, tone, u, v }) =>
  bone === 'pelvis' || (bone === 'waist' && v <= 0) || (isLeg(bone) && u <= SHORTS_THIGH)
    ? PALETTE.cloth[tone]
    : null;
/** The chest wrap: one band over the chest bone's middle third. */
export const wrapLayer = ({ bone, tone, v }) =>
  bone === 'chest' && v >= WRAP_BAND[0] && v <= WRAP_BAND[1] ? PALETTE.cloth[tone] : null;
const isSkinPart = (part) => part === 'head' || part === 'torso' || part === 'nearLimb' || part === 'farLimb';
/** T90: the swing (far) leg on a turned figure: clean two-tone skin (a light face and a dark
 *  face), so the narrow, angled leg never breaks into lone mid-tone pixels. */
const FAR_LEG = new Set(['thighF', 'kneeF', 'shinF', 'footF']);
/** Skin for everything the clothes and the eye don't cover; the far limbs already carry the dim tone. */
export const skinLayer = ({ part, tone, bone, yaw }) => {
  if (!isSkinPart(part)) return null;
  const t = (yaw ?? 0) !== 0 && FAR_LEG.has(bone) ? (tone >= 3 ? 3 : 1) : tone;
  return PALETTE.skin[t];
};

/** The T86-T91 plain body: no texture, the material every earlier card was accepted against. */
export const BARE_BODY_PLAIN = {
  id: 'barebody',
  ink: PALETTE.ink,
  seam: PALETTE.skin[3],
  mark: null, // no chest mark: #f53cd1 is gone
  fallback: PALETTE.skin[2],
  layers: [eyeLayer, skinLayer],
  // drawn after the seams: the front eyes and both garments must not be cut by a seam, so each of
  // shorts and wrap stays one region even where the rig put a soft seam through it
  overlay: (px) => frontEyeLayer(px) ?? shortsLayer(px) ?? wrapLayer(px),
};

// ── T92: the measured l0veyou garment bands and the row lighting
const CLOTH_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../output/pixelfx-character/barebody/l0v-cloth.json');
const INK_U = PALETTE.ink >>> 0;
const BRIGHT = PALETTE.skin[0] >>> 0, BASE = PALETTE.skin[1] >>> 0, SHADE = PALETTE.skin[2] >>> 0, FAR_DIM = PALETTE.skin[3] >>> 0;
const CLOTH_BASE = PALETTE.cloth[0] >>> 0, CLOTH_DARK = PALETTE.cloth[2] >>> 0;
const FAR_LIMBS = new Set(['upperF', 'elbowF', 'foreF', 'handF', 'thighF', 'kneeF', 'shinF', 'footF']);
const FAR_EXTREMITIES = new Set(['handF', 'footF']);

/** l0v-cloth.json: per direction the measured band edges (see l0v-texture.mjs). */
function loadCloth() {
  let data;
  try { data = JSON.parse(fs.readFileSync(CLOTH_FILE, 'utf8')); } catch { return null; }
  if (data?.version !== 1 || !data.dirs) return null;
  return data;
}
const CLOTH = loadCloth();

const dirOf = (yaw) => (Math.abs(yaw ?? 0) < 1e-6 ? 'right' : yaw > 0 ? 'down' : 'up');

/** The T92 garment rule: the measured wrap band on the chest (px below the chest joint), the
 *  measured shorts top on the waist, and the measured hem down each thigh; the side view also gets
 *  the shorts' measured backward protrusion on the far thigh. */
export function isClothPixel(px, p) {
  const off = px.cy - px.sy; // screen px below the chest joint, positive down
  const b = px.bone;
  if (b === 'chest') return off >= p.wrap[0] && off <= p.wrap[1];
  if (b === 'pelvis') return true;
  if (b === 'waist') return off >= p.shortsTop;
  if (b === 'thighN') return px.u <= p.hem;
  // the side view's far thigh is separated from the near shorts by the near leg and the ink edge,
  // so cloth there only ever showed as detached shards; the measured backward protrusion is kept
  // in the json but the side shorts are drawn on the pelvis/waist/near thigh only
  if (b === 'thighF') return dirOf(px.yaw) !== 'right' && px.u <= p.hem;
  return false;
}

/** The colour a body pixel starts from, before the shade pass. The far limbs start at the far-dim
 *  tone, so the pinhole fill and the loose-ink repair (both read `bodyColour`) stay inside the
 *  far two-tone instead of inventing a third tone. */
export const shadeBase = ({ part, bone, tone }) => {
  if (!isSkinPart(part)) return null;
  if (FAR_LIMBS.has(bone)) return PALETTE.skin[3];
  return PALETTE.skin[tone];
};

/** T92: one pass over the whole frame. Light from the upper left: per bone and screen row, the
 *  leftmost skin pixel is lit, the rightmost shaded, the rest base; the far limbs are a darker
 *  two-tone (their far hands and feet all far-dim); the head and chest top rows get a 1 px rim.
 *  Cloth is the measured band, the rightmost 1 px of each row and the bottom 1 px of each column
 *  shaded. Walk frames are then despeckled: an isolated pixel takes a neighbour's colour from the
 *  same material class (and the far two-tone), so no frame shows a lone pixel. Ink is never
 *  touched, so the rig's outline, eyes and limb edges survive. */
export function shade({ cols, idx, px, ink, q }) {
  if (!CLOTH || !px.length) return;
  const dir = dirOf(px[0].yaw ?? 0);
  const p = CLOTH.dirs[dir];
  if (!p) return;
  const items = [];
  for (let k = 0; k < px.length; k++) {
    const i = idx[k];
    if ((cols[i] >>> 0) === ink) continue;
    const e = px[k];
    items.push({ i, px: e, cloth: isClothPixel(e, p), far: FAR_LIMBS.has(e.bone), ext: FAR_EXTREMITIES.has(e.bone) });
  }
  const at = new Map();
  for (const it of items) at.set(`${it.px.sx},${it.px.sy}`, it);
  const nbOf = (it) => {
    const out = [];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = at.get(`${it.px.sx + dx},${it.px.sy + dy}`);
      if (n) out.push(n);
    }
    return out;
  };
  // per bone and row: the skin pixels left to right, and the top row of head/chest
  const rows = new Map(), topOf = new Map();
  for (const it of items) {
    if (it.cloth) continue;
    const k = `${it.px.bone}|${it.px.sy}`;
    let g = rows.get(k);
    if (!g) rows.set(k, (g = []));
    g.push(it);
    if ((it.px.bone === 'head' || it.px.bone === 'chest') && (!topOf.has(it.px.bone) || it.px.sy > topOf.get(it.px.bone))) topOf.set(it.px.bone, it.px.sy);
  }
  for (const [, g] of rows) {
    g.sort((a, b) => a.px.sx - b.px.sx);
    const w = g.length, bone = g[0].px.bone;
    const top = (bone === 'head' || bone === 'chest') && g[0].px.sy === topOf.get(bone);
    for (let k = 0; k < w; k++) {
      const it = g[k];
      if (top) { cols[it.i] = BRIGHT; continue; }
      if (it.ext || it.far) { cols[it.i] = FAR_DIM; continue; }
      if (w >= 3) cols[it.i] = k === 0 ? BRIGHT : k === w - 1 ? SHADE : BASE;
      else if (w === 2) cols[it.i] = k === 0 ? BASE : SHADE;
      else cols[it.i] = BASE;
    }
  }
  // cloth: the base tone over the whole shorts region and over the whole wrap band (not per bone,
  // or every bone seam would draw its own dark edge through the garment), then the rightmost pixel
  // of each screen row and the lowest pixel of each screen column dark
  const clothItems = items.filter((it) => it.cloth);
  for (const it of clothItems) cols[it.i] = CLOTH_BASE;
  const regions = [
    ['wrap', clothItems.filter((it) => it.px.bone === 'chest')],
    ['shorts', clothItems.filter((it) => it.px.bone !== 'chest')],
  ];
  for (const [, region] of regions) {
    if (!region.length) continue;
    const byRow = new Map(), byCol = new Map();
    for (const it of region) {
      let g = byRow.get(it.px.sy);
      if (!g) byRow.set(it.px.sy, (g = []));
      g.push(it);
      let c = byCol.get(it.px.sx);
      if (!c) byCol.set(it.px.sx, (c = []));
      c.push(it);
    }
    for (const [, g] of byRow) {
      const maxX = Math.max(...g.map((it) => it.px.sx));
      for (const it of g) if (it.px.sx === maxX) cols[it.i] = CLOTH_DARK;
    }
    for (const [, c] of byCol) {
      const minSy = Math.min(...c.map((it) => it.px.sy)); // sy is up-positive: the lowest pixel
      for (const it of c) if (it.px.sy === minSy) cols[it.i] = CLOTH_DARK;
    }
  }
  // the idle checker's line where a hand touches a thigh: the T90 body had it in the darkest skin
  // tone, so both sides of the contact take that tone here
  for (const it of items) {
    if (it.px.bone !== 'handN' && it.px.bone !== 'handF') continue;
    for (const n of nbOf(it)) {
      if (n.px.bone !== 'thighN' && n.px.bone !== 'thighF') continue;
      cols[it.i] = FAR_DIM; cols[n.i] = FAR_DIM;
    }
  }
  // walk frames: no isolated single pixel
  if (!q || q.walk !== true) return;
  const farLeg = (b) => b === 'thighF' || b === 'kneeF' || b === 'shinF' || b === 'footF';
  for (let pass = 0; pass < 5; pass++) {
    let changed = 0;
    for (const it of items) {
      const c = cols[it.i] >>> 0;
      const nb = nbOf(it);
      if (nb.some((n) => (cols[n.i] >>> 0) === c)) continue;
      const preferred = it.cloth ? [CLOTH_BASE, CLOTH_DARK]
        : it.far ? [FAR_DIM, SHADE]
          : [BRIGHT, BASE, SHADE, FAR_DIM];
      const votes = new Map();
      for (const n of nb) {
        const nc = cols[n.i] >>> 0;
        if (!preferred.includes(nc)) continue;
        votes.set(nc, (votes.get(nc) || 0) + 1);
      }
      let best = 0, bc = 0;
      for (const [v, n] of votes) if (n > bc) { bc = n; best = v; }
      if (!best) {
        // A body pixel whose 4 neighbours are all the rig's ink is a 1 px hole in the outline
        // (the mask keeps a single island between two limbs). Close it with the outline ink; it is
        // not a colour speckle on the body, and leaving a lone cloth/skin dot there looks worse.
        if (nb.length === 0) best = INK_U;
        else if (nb.every((n) => (cols[n.i] >>> 0) === INK_U)) best = INK_U;
        else if (it.cloth || !farLeg(it.px.bone)) {
          const any = new Map();
          for (const n of nb) {
            const nc = cols[n.i] >>> 0;
            if (nc === INK_U) continue;
            any.set(nc, (any.get(nc) || 0) + 1);
          }
          let bn = 0;
          for (const [v, n] of any) if (n > bn) { bn = n; best = v; }
        }
      }
      if (best) { cols[it.i] = best; changed++; }
    }
    if (!changed) break;
  }
}

/** The shaded body is a second material id, so the rig's cache never mixes it with the plain one
 *  (a gear export, the archer included, uses BARE_BODY_PLAIN). Without l0v-cloth.json it is the
 *  plain body. */
export const BARE_BODY = CLOTH
  ? {
    ...BARE_BODY_PLAIN,
    id: 'barebody-l0v',
    layers: [eyeLayer, shadeBase],
    overlay: (px) => frontEyeLayer(px),
    shade,
    mark: null,
  }
  : BARE_BODY_PLAIN;

export default BARE_BODY;
