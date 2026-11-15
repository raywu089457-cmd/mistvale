// dir4.js — 4-direction FACING rules (which of the 4 animation directions a character shows) shared by the renderer
// (src/pixel-world.js: hero / monster facing, sheet row choice) and the tests / checks. Pure functions, no side effects.
//
// History: 2026-11-13 (docs/DV2-ADOPTION-PLAN.md Phase 2) made movement 4-axis as well (stairStep below).
// 2026-11-15 the user reverted that: 「允許斜走，90度分界分四個象限，每個象限一個動畫方向」 — characters walk diagonally again
// (straight lines, src/pixel-game.js), and only the ANIMATION direction is one of 4. stairStep is kept for test-paperdoll.mjs but
// nothing in the game calls it any more.
//
// The 4 directions are SCREEN directions (up = back view, right = side, down = front, left = mirrored side) of the isometric
// projection the player sees: screen x = (dx - dz) * PX, screen y = (dx + dz) * PY. The facing is picked from the SCREEN-space
// vector (never the raw world dx/dz): the screen circle is cut into 4 quadrants of 90°, one animation direction per quadrant.
//
// Quadrant rule (QUADRANT_OFFSET_DEG = 0): the quadrants are centred on screen right / down / left / up and their boundaries are
// the screen diagonals — i.e. the facing is the dominant screen axis of the motion (or of the direction to the target).
// Near a boundary:
//   quantize4       (one-shot decisions: attack / hurt / skill direction) — within TIE (≈3°) of the diagonal keep `prev`.
//   quantize4Stable (continuous decisions: walking) — keep `prev` until the vector is more than FACING_HYSTERESIS_DEG past the
//                   boundary (prev's quadrant is widened to 45° + 10° on each side), so walking almost exactly diagonally never flickers.

/** isometric projection, must match pixel-world.js PX / PY */
export const ISO = Object.freeze({ PX: 9, PY: 4.5 });
export const DIR4 = Object.freeze(['up', 'right', 'down', 'left']);
/**
 * Quadrant orientation, in screen degrees (0° = screen right, 90° = screen down). 0 = quadrants centred on the screen axes,
 * boundaries on the screen diagonals (current rule). 45 = boundaries on the screen axes (DV2-style diagonal quadrants:
 * 'right' covers screen 0°..90° (down-right), 'down' 90°..180°, 'left' 180°..270°, 'up' 270°..360°). Change only this constant.
 */
export const QUADRANT_OFFSET_DEG = 0;
/** walking hysteresis: keep the previous direction until the motion is this many degrees past the quadrant boundary */
export const FACING_HYSTERESIS_DEG = 10;
/** one-shot tie band: |major - minor| <= TIE * major (≈ 3.0° either side of a boundary) keeps the previous direction */
export const TIE = 0.1;
const DEG = 180 / Math.PI;
const tieDeg = tie => 45 - Math.atan(Math.max(0, 1 - tie)) * DEG;
/** quadrant order in screen-angle order (screen y grows downward, so +90° is screen down) */
const QUAD = Object.freeze(['right', 'down', 'left', 'up']);
const wrap360 = a => ((a % 360) + 360) % 360;
/** |a - b| on the circle, 0..180 */
export const angDiff = (a, b) => Math.abs(wrap360(a - b + 180) - 180);
/** centre angle (screen degrees) of each direction's quadrant */
export const DIR4_CENTER_DEG = Object.freeze(Object.fromEntries(QUAD.map((n, i) => [n, wrap360(QUADRANT_OFFSET_DEG + 90 * i)])));

const R2 = Math.SQRT1_2;
/** world unit vector of each screen axis */
export const AXIS_VEC = Object.freeze({
  up: Object.freeze({ x: -R2, z: -R2 }), right: Object.freeze({ x: R2, z: -R2 }),
  down: Object.freeze({ x: R2, z: R2 }), left: Object.freeze({ x: -R2, z: R2 }),
});
export const AXES4 = Object.freeze(DIR4.map(d => Object.freeze({ dir: d, ...AXIS_VEC[d] })));

/** 4-direction name <-> pixel-world.js vdir name (side = right, sideLeft = left) */
export const DIR4_TO_VDIR = Object.freeze({ up: 'up', right: 'side', down: 'down', left: 'sideLeft' });
export const VDIR_TO_DIR4 = Object.freeze({ up: 'up', side: 'right', down: 'down', sideLeft: 'left', right: 'right', left: 'left',
  // legacy diagonal names (not produced any more), same table as paperdoll.js migrateDir: upRight->up, downRight/downLeft->down, upLeft->left
  upRight: 'up', downRight: 'down', downLeft: 'down', upLeft: 'left' });

export function toScreen(dx, dz) { return { sx: (dx - dz) * ISO.PX, sy: (dx + dz) * ISO.PY }; }
/** screen direction -> world vector (inverse of toScreen; same as pixel-world.js dirFromScreen) */
export function fromScreen(sx, sy) { return { x: (sx / ISO.PX + sy / ISO.PY) / 2, z: (sy / ISO.PY - sx / ISO.PX) / 2 }; }

/** screen angle in degrees (0 = screen right, 90 = screen down) of a world vector, or null for a (near) zero vector */
export function screenAngle(dx, dz) {
  const { sx, sy } = toScreen(dx || 0, dz || 0);
  return Math.hypot(sx, sy) > 1e-9 ? wrap360(Math.atan2(sy, sx) * DEG) : null;
}
/** the quadrant a screen angle falls in (no tie handling) and the neighbouring quadrant across the nearest boundary */
function quadrantOfAngle(a) {
  const i = ((Math.round((a - QUADRANT_OFFSET_DEG) / 90) % 4) + 4) % 4, name = QUAD[i];
  const off = wrap360(a - DIR4_CENTER_DEG[name] + 180) - 180;   // -45..45
  return { name, other: QUAD[(i + (off >= 0 ? 1 : 3)) % 4], toBoundary: 45 - Math.abs(off) };
}

/**
 * World vector -> 'up' | 'right' | 'down' | 'left': the quadrant of its SCREEN angle (QUADRANT_OFFSET_DEG). Within the tie band of
 * a boundary (TIE) `prev` is kept when it is one of the two quadrants meeting there, otherwise the horizontal one (right/left).
 * A (near) zero vector returns prev (or null when there is none).
 */
export function quantize4(dx, dz, prev = null, tie = TIE) {
  const a = screenAngle(dx, dz);
  if (a == null) return prev || null;
  const q = quadrantOfAngle(a);
  if (q.toBoundary <= tieDeg(tie)) {
    if (prev === q.name || prev === q.other) return prev;
    return q.name === 'right' || q.name === 'left' ? q.name : q.other === 'right' || q.other === 'left' ? q.other : q.name;
  }
  return q.name;
}

/**
 * quantize4 with hysteresis, for continuous decisions (walking): keep `prev` while the screen angle stays within
 * 45° + margin of prev's quadrant centre, i.e. until the motion is more than `margin` degrees past the boundary.
 */
export function quantize4Stable(dx, dz, prev = null, margin = FACING_HYSTERESIS_DEG) {
  const a = screenAngle(dx, dz);
  if (a == null) return prev || null;
  if (prev && prev in DIR4_CENTER_DEG && angDiff(a, DIR4_CENTER_DEG[prev]) <= 45 + margin) return prev;
  return quantize4(dx, dz, prev);
}

/**
 * Is `drawn` ('up' | 'right' | 'down' | 'left') an acceptable facing for this world vector? Exactly the quadrant -> true;
 * the neighbouring quadrant while within `margin` degrees of the shared boundary (hysteresis) -> true; anything else -> false.
 * For tests and pipeline/scripts/check/check_facing.mjs (which inlines the same math in the page).
 */
export function facingOk(dx, dz, drawn, margin = FACING_HYSTERESIS_DEG) {
  const a = screenAngle(dx, dz);
  if (a == null || !(drawn in DIR4_CENTER_DEG)) return a == null;
  return angDiff(a, DIR4_CENTER_DEG[drawn]) <= 45 + margin + 1e-9;
}

/** quantize4 in pixel-world vdir names ('side' / 'down' / 'sideLeft' / 'up') */
export function vdir4(dx, dz, prevVdir = 'side', stable = false) {
  const prev = VDIR_TO_DIR4[prevVdir] || null;
  const d = (stable ? quantize4Stable : quantize4)(dx, dz, prev);
  return d ? DIR4_TO_VDIR[d] : (prevVdir || 'side');
}

/* ------------------------------------------------------------------ stair-step movement (unused by the game since 2026-11-15) */

/**
 * NOT USED BY THE GAME since 2026-11-15 (diagonal walking is back; src/pixel-game.js walks straight lines). Kept because
 * test-paperdoll.mjs still covers it and a future 4-axis mode could reuse it.
 * Move from p toward t along screen axes only (4-axis movement for AI routes, chases and wandering).
 * The path is a staircase that stays within `delta` (world units) of the straight segment start -> target, so it never strays
 * into walls the straight route was checked against by more than delta; per sub-move `ok(q)` (optional) may veto a point, then the
 * other axis is tried. Both blocked -> stuck (the caller decides; pixel-game falls back to a straight step for routes).
 *
 * mem      per-unit memory object (segment start, target, held axis); keep it per unit, not in the save
 * budget   how far to go this call. With euclid=true it is measured along the straight segment (so a staircase takes exactly as long
 *          as the old straight walk: the step is scaled by (|du|+|dv|)/|d|); otherwise it is path length along the stairs.
 * opts     { delta = 0.35, ok = null, euclid = true, retarget = 1e-6 }  retarget: target moves farther than this -> new segment
 * returns  { x, z, used (same unit as budget), arrived, stuck, dir ('up'|'right'|'down'|'left' of the last sub-move or null) }
 */
export function stairStep(mem, p, t, budget, opts = {}) {
  const delta = opts.delta ?? 0.35, ok = opts.ok || null, euclid = opts.euclid !== false, retarget = opts.retarget ?? 1e-6;
  const U = (x, z) => (x - z) * R2, V = (x, z) => (x + z) * R2;
  let pu = U(p.x, p.z), pv = V(p.x, p.z);
  const tu = U(t.x, t.z), tv = V(t.x, t.z);
  if (!mem.seg || Math.hypot(tu - mem.seg.tu, tv - mem.seg.tv) > retarget) mem.seg = { su: pu, sv: pv, tu, tv, axis: null };
  const seg = mem.seg; seg.tu = tu; seg.tv = tv;
  const Lu = tu - seg.su, Lv = tv - seg.sv, Ll = Math.hypot(Lu, Lv);
  // stair length per unit of straight-segment length (1 for an axis-aligned segment, up to sqrt(2) for a diagonal one)
  const f = euclid && Ll > 1e-9 ? (Math.abs(Lu) + Math.abs(Lv)) / Ll : 1;
  let left = budget * f, dir = null, stuck = false, switches = 0;
  const EPS = 1e-7;
  for (let guard = 0; guard < 12 && left > 1e-9; guard++) {
    const Ru = tu - pu, Rv = tv - pv, au = Math.abs(Ru) > EPS, av = Math.abs(Rv) > EPS;
    if (!au && !av) break;
    let axis = seg.axis;
    if (!(axis === 'u' ? au : axis === 'v' ? av : false)) {
      if (au !== av) axis = au ? 'u' : 'v';
      else {   // both left: major screen axis, tie -> keep the last one (no jitter)
        const wu = Math.abs(Ru) * ISO.PX, wv = Math.abs(Rv) * ISO.PY;
        axis = Math.abs(wu - wv) <= TIE * Math.max(wu, wv) ? (seg.last || 'u') : wu > wv ? 'u' : 'v';
      }
      seg.axis = axis;
    }
    const sg = axis === 'u' ? Math.sign(Ru) : Math.sign(Rv), rem = Math.abs(axis === 'u' ? Ru : Rv);
    let s = Math.min(rem, left), hitBound = false;
    const otherLeft = axis === 'u' ? av : au;
    if (otherLeft && Ll > 1e-9 && switches < 2) {
      // lateral error from the straight segment; moving along this axis changes it at rate k per unit
      const e0 = (Lu * (pv - seg.sv) - Lv * (pu - seg.su)) / Ll, k = (axis === 'u' ? -Lv * sg : Lu * sg) / Ll;
      if (Math.abs(k) > 1e-12) {
        const sl = k > 0 ? (delta - e0) / k : (-delta - e0) / k;
        if (sl <= 1e-9) { seg.axis = axis === 'u' ? 'v' : 'u'; switches++; continue; }
        if (sl < s) { s = sl; hitBound = true; }
      }
    }
    const nu = axis === 'u' ? pu + sg * s : pu, nv = axis === 'v' ? pv + sg * s : pv;
    const q = { x: (nu + nv) * R2, z: (nv - nu) * R2 };
    if (ok && !ok(q)) {
      if (switches < 2 && otherLeft) { seg.axis = axis === 'u' ? 'v' : 'u'; switches++; continue; }
      stuck = true; break;
    }
    pu = nu; pv = nv; left -= s; switches = 0; seg.last = axis;
    dir = axis === 'u' ? (sg > 0 ? 'right' : 'left') : (sg > 0 ? 'down' : 'up');
    if (hitBound || s >= rem - 1e-12) seg.axis = axis === 'u' ? 'v' : 'u';
  }
  const arrived = Math.abs(tu - pu) <= EPS && Math.abs(tv - pv) <= EPS;
  const used = (budget * f - Math.max(0, left)) / f;
  const out = arrived ? { x: t.x, z: t.z } : { x: (pu + pv) * R2, z: (pv - pu) * R2 };
  return { ...out, used: Math.max(0, Math.min(budget, used)), arrived, stuck: stuck && !arrived, dir };
}

/* ------------------------------------------------------------------ sheet rows (heroes ?doll=off and monsters3) */

// Row suffix per vdir (picked by NAME, never by row index). The game only asks for these 4; assets/monsters3 ships exactly these
// (its 4 diagonal row groups were trimmed in plan 2.8), hero sheets (?doll=off) still carry unused diagonal rows:
// right = the plain row, down = <act>Down, up = <act>Up, left = the plain row mirrored, or the baked <act>Left (attack rows).
export const DIR_ACT = Object.freeze({ side: '', down: 'Down', sideLeft: '', up: 'Up' });
export const ATTACK_ACT = Object.freeze({ side: '', down: 'Down', sideLeft: 'Left', up: 'Up' });

/** which row suffix this sheet has for vdir; a missing up/down/left row falls back to the plain (side) row */
export function dirSuffix(m, kind, vdir) {
  const attack = kind === 'attack' || kind === 'skill';
  const want = (attack ? ATTACK_ACT : DIR_ACT)[VDIR_TO_DIR4[vdir] ? DIR4_TO_VDIR[VDIR_TO_DIR4[vdir]] : vdir] ?? '';
  if (!want) return '';
  return m && m[kind + want] ? want : '';
}

/**
 * Left-facing rows: a baked <act>Left row is used as is (not mirrored again); otherwise the right row is mirrored.
 * Up/down rows (attackUp, walkDown …) have no left variant of their own. Returns [row name, mirror?].
 */
export function leftRow(meta, act, facing) {
  if (act && act.endsWith('Left')) return [act, false];
  if (facing < 0 && !/(Up|Down)$/.test(act || '') && meta?.actions?.[act + 'Left']) return [act + 'Left', false];
  return [act, facing < 0];
}

/** every row a 4-direction game can pick for `kind` on this sheet (for tests / asset audits) */
export function rows4(m, kind) {
  const out = new Set();
  for (const vdir of ['side', 'down', 'sideLeft', 'up']) {
    const act = kind + dirSuffix(m, kind, vdir);
    const [row] = leftRow({ actions: m }, act, vdir === 'sideLeft' ? -1 : 1);
    out.add(m[row] ? row : act);
  }
  return out;
}
