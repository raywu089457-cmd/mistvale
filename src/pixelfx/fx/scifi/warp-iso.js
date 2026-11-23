// Warp (a mage's blink) for the game's 2:1 isometric camera: scifi/warp-out and scifi/warp-in rewritten as one move
// for the floor the game sees, not their pictures squashed, stretched or scaled. The recipes are the sources': the
// caster's outline flickers on, he flashes white and breaks into light from the head down, streaming up a beam that
// lifts off the floor and pinches shut; the light crosses over, a beam slams down where he lands, rings run down it
// and a scanline paints him in from head to toe, white-hot pixels cooling to his own colors; the beam pinches shut.
// What changed is the world it happens in:
//   - it leaves from the origin and lands at `to` ([x, z] on the floor: x across, z into the floor toward us; on
//     screen x, z / 2), the light crossing between the two beams' tops through the air;
//   - the rings round the feet and down the beam are 2:1 on the floor and round the column; the sparks and the
//     vapour the slam throws fly every way round in 3D and land at their own depth;
//   - the caster is the game's own character: pass him as `actor` ({ x, y, w, h, mask, pixels }, feet at the
//     origin) and he is what breaks up and what is painted back in. `timing` says when he leaves (the game stops
//     drawing him at `gone`) and when he's whole again at `to` (the game draws him there from `back`).
// 1 px = 1 character sprite px (32 x 16 px tiles).
import { Lights, P, Rng, fit, band, sparkle, clamp, smooth, lerp, ease, rand, mix, TAU, WHITE } from "../../core/index.js";
import { floorLight } from "../fire/_lib.js";
import { Fly3 } from "../_iso.js";

export const meta = {
  name: "Warp (iso)",
  desc: "scifi/warp-out + warp-in as one blink on the 2:1 floor: the caster breaks into light up a beam, the light crosses over, and a beam slams down and paints him in where he lands.",
  tags: ["scifi", "arcane", "teleport", "blink", "warp", "beam", "move", "one-shot", "iso", "top-down"],
  size: [320, 300],
  origin: [160, 196],
  duration: 3.1,
  loop: false,
  fps: 30,
  bg: "ground",
  actor: 2,
  pixels: 1,
  options: { palette: ["#0b1030", "#152a63", "#1d4f9e", "#2582d2", "#36b9ee", "#8ae8ff", "#d4fbff", "#ffffff"], to: [84, 36], width: 13, seed: 3 },
};

const FL = 0.5, TOPH = 112;
const FLASH = 0.32, BREAK0 = 0.36, BREAK1 = 0.8, LIFT = 0.86, GONE = 1.06, CROSS0 = 0.98, SLAM = 1.16, OPEN = 1.3;
const SCAN0 = 1.36, SCAN1 = 1.95, COOL = 0.36, DONE = SCAN1 + COOL, CLOSE = 2.36, SNAP = 2.58, END = meta.duration;
/** When the game should stop drawing its character at the origin, and draw him whole at `to` again. */
export const timing = { gone: FLASH, back: DONE };
// the stand-in the tools draw at the origin is there until he flashes; at `to` he is the effect's until `back`
export const actorAlpha = (t) => (t < FLASH ? 1 : 0);

export function create(o) {
  const C = fit(o.palette, 8), R = new Rng(o.seed), A = o.actor, W = o.width, [BXw, BZw] = o.to;
  const BX = BXw, BY = BZw * FL, bNear = BZw >= 0;
  const fly = new Fly3({ rng: R, sparks: [WHITE, C[6], C[5], C[4]], haze: C[5] }), lights = new Lights();
  const on = (x, y) => x >= 0 && y >= 0 && x < A.w && y < A.h && A.mask.data[y * A.w + x];

  // the body, pixel by pixel: where it breaks free (head first) as it leaves, when the scan paints it as it lands
  const bits = [], edge = [], body = [], rows = new Map();
  const scanT = (y) => SCAN0 + ((SCAN1 - SCAN0) * Math.acos(1 - 2 * clamp((y + 0.5 - (A.y - 2)) / (3 - A.y)))) / Math.PI;
  for (let my = -1; my <= A.h; my++)
    for (let mx = -1; mx <= A.w; mx++) {
      const x = A.x + mx, y = A.y + my;
      if (on(mx, my)) {
        const rim = !on(mx - 1, my) || !on(mx + 1, my) || !on(mx, my - 1) || !on(mx, my + 1), c = A.pixels[my * A.w + mx] || C[3];
        bits.push({ x, y, y0: y, vx: 0, vy: 0, tr: BREAK0 + (my / A.h) * (BREAK1 - BREAK0 - 0.12) + R.range(0, 0.12), c, free: false, j: R.next(), rim });
        body.push({ x, y, c, edge: rim, ts: scanT(y), j: rand(o.seed, mx, my) });
        const r = rows.get(y) ?? [x, x];
        rows.set(y, [Math.min(r[0], x), Math.max(r[1], x)]);
      } else if (on(mx - 1, my) || on(mx + 1, my) || on(mx, my - 1) || on(mx, my + 1)) edge.push([x, y]);
    }
  const rings = [];
  let t = 0, flashed = false, lifted = false, slammed = false, snapped = false, nextRing = SLAM + 0.08;

  // the beam he leaves by: it opens as he breaks up, lifts off the floor and pinches shut
  const wOut = () => (t < BREAK0 ? 0 : t < LIFT ? 2 + 7 * ease.outCubic(clamp((t - BREAK0) / 0.35)) : lerp(9, 0.6, ease.inCubic(clamp((t - LIFT) / (GONE - LIFT)))));
  const footOut = () => (t < LIFT ? 0 : lerp(0, -TOPH, ease.inQuad(clamp((t - LIFT) / (GONE - LIFT)))));
  // the beam he lands by
  const wIn = () => {
    if (t < SLAM) return 0;
    if (t < CLOSE) return W * (1 + 0.45 * Math.exp(-(t - SLAM) * 14) + 0.03 * Math.sin(t * 31));
    return lerp(W, 0.7, ease.outCubic(clamp((t - CLOSE) / (SNAP - CLOSE))));
  };

  return {
    update(dt) {
      t += dt;
      // gathering: streaks in to his chest from all round; then, as the light crosses, in to where he'll land
      const gather = (cx, cz, h0, n) => {
        for (let i = 0; i < n; i++) {
          if (!R.chance(0.7)) continue;
          const a = R.range(0, TAU), el = R.range(-0.3, 0.9), c = Math.sqrt(1 - el * el), D = R.range(26, 52), T = R.range(0.16, 0.26), v = (D * 3) / (Math.exp(3 * T) - 1);
          const ux = Math.cos(a) * c, uz = Math.sin(a) * c, h = Math.max(1, h0 + el * D);
          fly.spawn(P.STREAK, cx + ux * D, cz + uz * D, h, -ux * v, -uz * v, ((h0 - h) / D) * v, T, R.chance(0.5) ? C[6] : C[5]);
        }
      };
      if (t < FLASH - 0.05) gather(0, 0, 19, 1);
      if (t > CROSS0 - 0.2 && t < SLAM - 0.04) gather(BXw, BZw, 4, 1);
      if (t >= FLASH && !flashed) {
        flashed = true;
        lights.add(0, -20, 80, C[4], 0.9, 0.5);
        lights.add(0, -20, 30, WHITE, 0.8, 0.12);
        for (let i = 0; i < 14; i++) fly.spawn(P.STAR, R.range(-14, 14), R.range(-8, 8), R.range(2, 40), R.range(-20, 20), R.range(-12, 12), R.range(10, 40), R.range(0.3, 0.6), R.chance(0.5) ? WHITE : C[6], R.range(0.8, 1.8));
      }
      // the body breaks into light from the head down, each bit drawn up into the beam and up it
      for (let i = bits.length - 1; i >= 0; i--) {
        const b = bits[i];
        if (t < b.tr) continue;
        if (!b.free) {
          b.free = true;
          b.vx = (b.x + 0.5) * R.range(1.5, 4) + R.range(-10, 10);
          b.vy = (b.y + 19) * R.range(0.5, 1.5) - R.range(10, 40);
        }
        b.vy -= 560 * dt;
        b.vx += (-(b.x + 0.5) * 14 - b.vx * 3) * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (b.y < -TOPH + 2) bits.splice(i, 1);
      }
      if (t >= LIFT && !lifted) {
        lifted = true;
        // the beam lets go of the floor: sparks thrown every way round, stars hanging in the air
        lights.add(0, -2, 40, C[4], 0.7, 0.3);
        for (let i = 0; i < 22; i++) {
          const a = R.range(0, TAU), sp = R.range(50, 150), up = R.range(0.3, 1.2);
          fly.spawn(P.SPARK, R.range(-3, 3), R.range(-2, 2), 1, Math.cos(a) * sp, Math.sin(a) * sp, up * sp, R.range(0.2, 0.55));
        }
        for (let i = 0; i < 12; i++) fly.spawn(P.STAR, R.range(-8, 8), R.range(-5, 5), R.range(4, 70), R.range(-6, 6), R.range(-4, 4), R.range(10, 30), R.range(0.5, 0.95), R.chance(0.4) ? WHITE : C[6], R.range(0.6, 1.6), { delay: R.range(0, 0.3) });
      }
      if (t >= SLAM && !slammed) {
        slammed = true;
        // the beam slams down where he lands: a flare of light, sparks and vapour thrown out every way round
        lights.add(BX, BY - 40, 120, C[4], 1, 0.55);
        lights.add(BX, BY - 10, 44, WHITE, 0.9, 0.14);
        for (let i = 0; i < 34; i++) {
          const a = R.range(0, TAU), sp = R.range(70, 170), up = R.range(0.4, 1.6);
          fly.spawn(P.SPARK, BXw + Math.cos(a) * W * 0.5, BZw + Math.sin(a) * W * 0.5, 1, Math.cos(a) * sp, Math.sin(a) * sp, up * sp, R.range(0.25, 0.75));
        }
        for (let i = 0; i < 20; i++) {
          const a = R.range(0, TAU), sp = R.range(40, 130), d = R.range(4, 16);
          fly.spawn(P.VAPOUR, BXw + Math.cos(a) * d, BZw + Math.sin(a) * d, R.range(0, 4), Math.cos(a) * sp, Math.sin(a) * sp, R.range(2, 18), R.range(0.5, 0.95), R.chance(0.6) ? C[6] : C[5], R.range(3, 6));
        }
        for (let i = 0; i < 10; i++) fly.spawn(P.STAR, BXw + R.range(-W, W) * 1.3, BZw + R.range(-6, 6), R.range(2, 40), R.range(-20, 20), R.range(-10, 10), R.range(10, 40), R.range(0.4, 0.8), R.chance(0.5) ? WHITE : C[6], R.range(1, 2.2));
      }
      if (slammed && t < CLOSE) {
        if (t >= nextRing && nextRing < CLOSE - 0.3) rings.push({ t0: nextRing }), (nextRing += 0.17);
        const w = wIn();
        if (R.chance(0.5)) fly.spawn(P.STREAK, BXw + R.range(-0.8, 0.8) * w, BZw, TOPH - R.range(9, 36), 0, 0, -R.range(60, 110), R.range(0.3, 0.45), R.chance(0.5) ? WHITE : C[6]);
        if (R.chance(0.18)) {
          const a = R.range(0, TAU);
          fly.spawn(P.STAR, BXw + Math.cos(a) * w * R.range(0.8, 1.3), BZw + Math.sin(a) * w, R.range(4, 70), 0, 0, R.range(5, 20), R.range(0.3, 0.6), C[6], R.range(0.6, 1.8));
        }
        if (R.chance(0.1)) {
          const a = R.range(0, TAU), d = R.range(8, 16);
          fly.spawn(P.VAPOUR, BXw + Math.cos(a) * d, BZw + Math.sin(a) * d, R.range(0, 3), Math.cos(a) * R.range(20, 50), Math.sin(a) * R.range(20, 50), R.range(2, 8), R.range(0.5, 0.8), C[5], R.range(2.5, 4));
        }
      }
      if (t >= SNAP && !snapped) {
        snapped = true;
        lights.add(BX, BY - 30, 50, C[5], 0.7, 0.25);
        for (let i = 0; i < 14; i++) fly.spawn(P.STAR, BXw + R.range(-4, 4), BZw + R.range(-3, 3), R.range(10, 100), R.range(-12, 12), R.range(-6, 6), R.range(-10, 10), R.range(0.3, 0.6), R.chance(0.5) ? WHITE : C[6], R.range(0.6, 1.6));
      }
      fly.update(dt);
      lights.update(dt);
      fly.cap(Math.max(0.001, END - 0.05 - t));
    },
    drawBack(p) {
      // the floor: the ring tightening round his feet as he gathers, the pools of light under the beams
      const k = clamp(t / FLASH), stay = 1 - smooth(LIFT, LIFT + 0.4, t);
      if (stay > 0) band(p, 0, 0, lerp(26, 13, ease.outCubic(k)), FL, 1.5, (0.4 + 0.6 * k) * stay, [C[3], C[4], C[5], C[6]], (g) => Math.sin(g) < 0);
      if (t > BREAK0 && t < GONE) floorLight(p, 0, 0, 22, 11, C[4], 0.35 * (1 - smooth(LIFT, GONE, t)));
      floorIn(p, false);
      if (!bNear) landing(p);
      fly.draw(p, (q) => q.z < Math.min(0, BZw) - 4);
    },
    draw(p) {
      const k = clamp(t / FLASH), stay = 1 - smooth(LIFT, LIFT + 0.4, t);
      if (stay > 0) band(p, 0, 0, lerp(26, 13, ease.outCubic(k)), FL, 1.5, (0.4 + 0.6 * k) * stay, [C[3], C[5], C[6], WHITE], (g) => Math.sin(g) >= 0);
      leaving(p);
      cross(p);
      floorIn(p, true);
      if (bNear) landing(p);
      fly.draw(p, (q) => q.z >= Math.min(0, BZw) - 4);
      lights.draw(p);
    },
  };

  // where he leaves: the outline flickering on, the white flash, the body breaking up the beam, the beam lifting off
  function leaving(p) {
    const k = clamp(t / FLASH), w = wOut(), f = footOut();
    if (w > 0.3 && t < GONE)
      for (let y = -TOPH; y < f; y++) {
        for (let x = Math.floor(-w) - 1; x <= Math.ceil(w); x++) {
          const q = Math.abs(x + 0.5) / w;
          if (q > 1 + 1 / w) continue;
          if (w < 2.2) p.px(x, y, q < 0.7 ? WHITE : C[6]);
          else if (q > 1) p.dot(x, y, C[4], 0.5);
          else if (q > 1 - 1.2 / w) p.px(x, y, C[6]);
          else p.blend(x + 0.5, y + 0.5, C[5], 0.12 + 0.25 * q * q);
        }
        if ((y & 7) === 0) p.glow(0, y, Math.min(w * 2.5 + 6, y + TOPH + 2), C[4], 0.28);
      }
    if (t < FLASH) {
      const fr = Math.floor(t * 24);
      for (const [x, y] of edge) if (rand(x, y, fr) < 0.25 + 0.7 * k) p.px(x, y, k > 0.7 && rand(x, y, fr, 1) < 0.5 ? WHITE : C[5]);
      p.glow(0, -20, 26, C[4], 0.4 * k);
      return;
    }
    for (const b of bits) {
      if (b.free) continue;
      const a = t - FLASH, scan = ((b.y + Math.floor(t * 40)) % 4 + 4) % 4 === 0;
      const c = a < 0.07 ? WHITE : a < 0.16 ? C[6] : b.rim ? C[6] : mix(b.c, scan ? C[6] : C[5], scan ? 0.6 : 0.45);
      p.px(b.x, b.y, b.tr - t < 0.06 ? WHITE : c);
    }
    for (const b of bits) {
      if (!b.free) continue;
      const sp = Math.abs(b.vy), L = Math.min(8, sp * 0.02), u = clamp((b.y + TOPH) / (b.y0 + TOPH));
      const head = u > 0.75 ? WHITE : u > 0.4 ? C[6] : C[5];
      if (L >= 1 && b.j < 0.33) p.line(b.x, b.y, b.x - b.vx * 0.01, b.y + L, (s) => (s < 0.25 ? head : s < 0.6 ? C[5] : C[3]));
      else if (b.j < 0.75 || u > 0.6) p.px(b.x, b.y, b.j > 0.9 ? WHITE : head);
    }
    if (t < FLASH + 0.12) sparkle(p, 0, -20, 10 * (1 - (t - FLASH) / 0.12), C[6], C[5], 0.6);
  }

  // the light crossing over, high up, from the top of one beam to the top of the other
  function cross(p) {
    const u = (t - CROSS0) / (SLAM - CROSS0);
    if (u < 0 || u > 1.15) return;
    const at = (v) => {
      const s = ease.inOutSine(clamp(v));
      return [BX * s, lerp(-TOPH, BY - TOPH, s) - Math.sin(Math.PI * clamp(v)) * 10];
    };
    for (let d = 0; d < 14; d++) {
      const v = u - d * 0.03;
      if (v < 0 || v > 1) continue;
      const [x, y] = at(v);
      p.dot(x, y, d < 2 ? WHITE : d < 6 ? C[6] : C[5], 1 - d / 14);
    }
    if (u <= 1) {
      const [x, y] = at(u);
      p.glow(x, y, 12, C[5], 0.6);
    }
  }

  // where he lands: the column (bands of the ramp across it, strands, pulses scrolling down), the rings running down
  // it, the scanline and the body it paints in
  function landing(p) {
    column(p);
    ringsIn(p, false);
    hero(p);
    scanline(p);
    ringsIn(p, true);
  }
  function column(p) {
    const w = wIn();
    if (w <= 0.05 || t > SNAP + 0.14) return;
    const bottom = t - SLAM < 0.06 ? lerp(-TOPH, 0, ease.inCubic(clamp((t - SLAM) / 0.06) * 0.5 + 0.5)) : t > SNAP ? lerp(0, -TOPH, ease.outExpo((t - SNAP) / 0.14)) : 0;
    const hot = t - SLAM < 0.07, hollow = 0.78 * smooth(OPEN - 0.16, OPEN, t), thin = 1 - clamp((w - 1.5) / (W - 1.5));
    for (let y = -TOPH; y < bottom; y++) {
      const pulse = ((((y + TOPH) * 0.028 - t * 2.6) % 1) + 1) % 1 < 0.09 ? 1 : 0, Y = BY + y;
      for (let x = Math.floor(-w * 1.35); x <= Math.ceil(w * 1.35); x++) {
        const q = Math.abs(x + 0.5) / w, X = BX + x;
        if (q > 1.35) continue;
        if (hot) {
          p.dot(X, Y, q < 0.55 ? WHITE : q < 0.8 ? C[6] : q < 1 ? C[5] : C[4], q < 1 ? 1 : (1.35 - q) / 0.35);
          continue;
        }
        if (w < 2.4) {
          p.dot(X, Y, q < 0.7 ? WHITE : C[6], q < 1 ? 1 : (1.35 - q) / 0.35);
          continue;
        }
        let strand = 0;
        for (let s = 0; s < 5; s++) if (Math.abs((x + 0.5) / w - (rand(o.seed, s) - 0.5) * 1.3 - 0.06 * Math.sin(t * (1.5 + s) + s * 2)) < 0.05) strand = 1;
        if (q < hollow) p.blend(X + 0.5, Y + 0.5, strand || pulse ? C[6] : C[5], clamp(0.12 + 0.3 * q * q + 0.3 * strand + 0.25 * pulse + 0.7 * thin));
        else if (q < 0.78) {
          const lvl = Math.max(0, (q < 0.22 ? 0 : q < 0.45 ? 1 : 2) - pulse - strand);
          p.px(X, Y, lvl === 0 ? WHITE : C[7 - lvl]);
        } else if (q < 0.96) p.px(X, Y, q > 0.86 && q < 0.93 ? WHITE : C[6]);
        else p.dot(X, Y, q < 1.1 ? C[5] : C[4], (1.35 - q) / 0.39);
      }
      if ((y & 7) === 0) {
        const r = Math.min(w + 8, y + TOPH + 2);
        if (hollow < 0.4) p.glow(BX, Y, Math.min(w * 2.6 + 6, y + TOPH + 2), C[4], hot ? 0.55 : 0.32);
        else for (const s of [-1, 1]) p.glow(BX + s * (w + 3), Y, r, C[4], 0.24);
      }
    }
  }
  // the rings riding down the column: 2:1 round it, far half behind it, near half in front
  function ringsIn(p, near) {
    const w = wIn();
    for (const r of rings) {
      const k = (t - r.t0) / 0.5;
      if (k < 0 || k >= 1) continue;
      const y = lerp(-TOPH + 6, -1, ease.inQuad(k)), rx = w * 1.18 + 1, c = k < 0.25 ? WHITE : C[6];
      band(p, BX, BY + y, rx, FL, 1.5, 1, [C[3], C[5], c, WHITE], (g) => Math.sin(g) >= 0 === near);
      if (near) p.glow(BX, BY + y, rx + 6, C[5], 0.25);
    }
  }
  // the floor where he lands: a pool of light, the rings landing and spreading over it, the shocks of the slam and
  // the snap racing out over it, far halves behind, near halves in front
  function floorIn(p, near) {
    const keep = (g) => Math.sin(g) >= 0 === near;
    const lit = t < SLAM ? smooth(CROSS0 - 0.2, SLAM, t) * 0.5 : 1 - smooth(SNAP, SNAP + 0.5, t);
    if (!near && lit > 0.01) {
      const rx = W * 1.9 + (t < SLAM ? 0 : 2 * Math.sin(t * 6));
      floorLight(p, BX, BY, rx, rx * FL, C[6], 0.55 * lit);
      floorLight(p, BX, BY, rx * 1.6, rx * 1.6 * FL, C[4], 0.3 * lit);
    }
    for (const r of rings) {
      const k = (t - r.t0 - 0.5) / 0.35;
      if (k >= 0 && k < 1) band(p, BX, BY, W * (1.2 + 1.3 * ease.outCubic(k)), FL, 1.5, 1 - k, [C[3], C[4], C[5], C[6]], keep);
    }
    for (const [d, s] of [[0, 1], [0.08, 0.65]]) {
      const k = (t - SLAM - d) / 0.55;
      if (k >= 0 && k < 1) band(p, BX, BY + 0.5, 56 * s * ease.outCubic(k), FL, Math.max(1, 5 * (1 - k)), 1.15 - k, [C[3], C[5], C[6], WHITE], keep, k < 0.25);
    }
    const k = (t - SNAP) / 0.45;
    if (k >= 0 && k < 1) band(p, BX, BY, 10 + 26 * ease.outCubic(k), FL, 2 * (1 - k) + 0.5, 1.1 - k, [C[4], C[5], C[6], WHITE], keep, k < 0.3);
  }
  // the body painted in from head to toe: white-hot as the scan passes, cooling to his own colors
  function hero(p) {
    if (t >= DONE || t < SCAN0 - 0.2) return;
    const blink = Math.floor(t * 24);
    for (const b of body) {
      const a = t - b.ts;
      if (a < 0) {
        if (b.edge && rand(b.x, b.y, blink) < 0.6) p.dot(BX + b.x, BY + b.y, C[1], 0.8 * smooth(SCAN0 - 0.25, SCAN0 - 0.05, t));
        continue;
      }
      const k = a / COOL, dx = a < 0.06 && b.j < 0.3 ? (b.j < 0.15 ? -1 : 1) : 0;
      p.px(BX + b.x + dx, BY + b.y, k < 0.18 ? WHITE : k < 0.45 ? mix(b.c, C[6], 0.72) : k < 0.75 ? mix(b.c, C[5], 0.38) : b.c);
      if (k < 0.5) p.light(BX + b.x + dx, BY + b.y, C[5], 0.22 * (1 - k / 0.5));
    }
  }
  function scanline(p) {
    if (t < SCAN0 || t > SCAN1) return;
    const y = Math.floor(lerp(A.y - 2, 1, ease.inOutSine(clamp((t - SCAN0) / (SCAN1 - SCAN0))))), w = wIn() * 1.5, r = rows.get(y);
    for (let x = Math.floor(-w); x <= Math.ceil(w); x++) {
      const inside = r && x >= r[0] && x <= r[1];
      p.dot(BX + x, BY + y, inside ? WHITE : C[6], inside ? 1 : 1 - Math.abs(x + 0.5) / (w + 1));
    }
    p.glowLine(BX - w, BY + y, BX + w, BY + y, 5, C[5], 0.5);
    if (r) for (const x of r) sparkle(p, BX + x + 0.5, BY + y, 2, C[6], C[5], 0.3);
  }
}
