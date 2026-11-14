// dir4.js — 4-direction (screen-axis) rules shared by the simulation (src/pixel-game.js: input, movement, kiting, projectiles)
// and the renderer (src/pixel-world.js: facing, sheet row choice for heroes and monsters). Pure functions, no side effects.
//
// 2026-11-13 (docs/DV2-ADOPTION-PLAN.md Phase 2, decision "open question 4"): the game is 4-directional, movement included.
// The 4 directions are SCREEN axes (up = back view, right = side, down = front, left = mirrored side), i.e. the world diagonals
// of the isometric grid: screen x = (dx - dz) * PX, screen y = (dx + dz) * PY.
//
// Quantization rule (plan §7 residual question 2, decided by the user): the major screen axis wins; on a tie keep the previous
// direction (no jitter). "Tie" is a band of TIE (10%) around the exact diagonal so a thumbstick held near 45° does not flicker.

/** isometric projection, must match pixel-world.js PX / PY */
export const ISO = Object.freeze({ PX: 9, PY: 4.5 });
export const DIR4 = Object.freeze(['up', 'right', 'down', 'left']);
/** |major - minor| <= TIE * major counts as a tie (keep the previous direction) */
export const TIE = 0.1;

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

/**
 * World vector -> 'up' | 'right' | 'down' | 'left'. Major screen axis wins; a tie (within TIE) keeps `prev` when prev is one of
 * the two candidate axes, otherwise the horizontal one. A (near) zero vector returns prev (or null when there is none).
 */
export function quantize4(dx, dz, prev = null, tie = TIE) {
  const { sx, sy } = toScreen(dx || 0, dz || 0), ax = Math.abs(sx), ay = Math.abs(sy), m = Math.max(ax, ay);
  if (!(m > 1e-9)) return prev || null;
  const h = sx >= 0 ? 'right' : 'left', v = sy >= 0 ? 'down' : 'up';
  if (Math.abs(ax - ay) <= tie * m) return prev === h || prev === v ? prev : h;
  return ax > ay ? h : v;
}

const CENTER = { right: 0, down: 90, left: 180, up: -90 };
/**
 * Like quantize4 but with hysteresis for drawing: keep `prev` while the screen angle stays within 45° + margin of prev's axis
 * (the renderer's old moveDirStable used the same 8° margin around 8 sectors).
 */
export function quantize4Stable(dx, dz, prev = null, margin = 8) {
  const { sx, sy } = toScreen(dx || 0, dz || 0);
  if (!(Math.hypot(sx, sy) > 1e-9)) return prev || null;
  if (prev && prev in CENTER) {
    const a = Math.atan2(sy, sx) * 180 / Math.PI, diff = Math.abs(((a - CENTER[prev] + 540) % 360) - 180);
    if (diff <= 45 + margin) return prev;
  }
  return quantize4(dx, dz, prev);
}

/** quantize4 in pixel-world vdir names ('side' / 'down' / 'sideLeft' / 'up') */
export function vdir4(dx, dz, prevVdir = 'side', stable = false) {
  const prev = VDIR_TO_DIR4[prevVdir] || null;
  const d = (stable ? quantize4Stable : quantize4)(dx, dz, prev);
  return d ? DIR4_TO_VDIR[d] : (prevVdir || 'side');
}

/* ------------------------------------------------------------------ stair-step movement */

/**
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
