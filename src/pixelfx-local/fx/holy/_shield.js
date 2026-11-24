// A divine-shield bubble that lasts as long as the game says, for effects that follow a unit (Mistvale-local).
// Not an effect (the leading _ keeps the tools away).
//
// The look is holy/divine-shield-iso's, the same recipe drawn the same way: a sphere in the game's space worked out
// per pixel, its floor seal a 2:1 ring round the feet (far half behind the character, near half in front), a thin
// gold film, meridians turning like a slow globe, a sheen sweeping across, sparkles winking, motes climbing.
// What changes is its life:
//   - it forms (the seal lights, the bubble grows up out of it), then HOLDS for as long as it has to: the game keeps
//     it on a unit while that unit's buff lasts, so the hold has no length of its own;
//   - the game ends it by setting `o.release` (the buff ran out or the unit fell): from that moment it bursts the
//     way the one-shot does, the film splitting at the top and running down to the floor in falling glitter;
//   - the game can re-strike it by changing `o.pulse` (the buff was cast again while it stood): the seal flares, the
//     rim goes white for a beat and a ring of stars jumps off it, so a re-cast reads without a new bubble.
// The source module stays untouched (src/pixelfx is synced from the pixelfx library and gets overwritten).
// 1 px = 1 character sprite px.
import { Lights, P, Rng, fit, sparkle, cycle, clamp, smooth, ease, TAU, WHITE } from "../../../pixelfx/core/index.js";
import { oval, shapeOf } from "../../../pixelfx/fx/holy/_lib.js";
import { Fly3 } from "../../../pixelfx/fx/_iso.js";

export const CY = 22, FL = 0.5, N = 4, T = 2.4, FORM = 0.4, BURST = 0.32, TAIL = 0.45;
/** How long after `release` the bubble is gone (the burst and its glitter): the game stops the effect after this. */
export const RELEASE_TIME = BURST + TAIL;

// the camera looks along (0, 1, 2) in (X across, Y up, Z toward us)
export const V = [0, 1 / Math.sqrt(5), 2 / Math.sqrt(5)];
const films = new Map();
/** Every pixel of the bubble's near and far film for radius r and centre height cy: where the view ray meets the sphere. */
export function filmOf(r, cy = CY) {
  const key = r + ":" + cy;
  let f = films.get(key);
  if (f) return f;
  const near = [], far = [];
  for (let y = Math.floor(-r * 1.12) - 1; y <= Math.ceil(r * 1.12) + 1; y++)
    for (let x = -Math.ceil(r) - 1; x <= Math.ceil(r) + 1; x++) {
      const X = x + 0.5, Yc = y + 0.5, disc = 4 * Yc * Yc - 20 * (X * X + Yc * Yc - r * r);
      if (disc < 0) continue;
      for (const s of [1, -1]) {
        const k = (2 * Yc + s * Math.sqrt(disc)) / 10, P3 = [X, -Yc + k, 2 * k], h = cy + P3[1];
        if (h < 0) continue;
        const n = P3.map((v) => v / r), face = n[1] * V[1] + n[2] * V[2];
        (s > 0 ? near : far).push({ x, y: y - cy, n, h, face: Math.abs(face), lat: Math.asin(clamp(n[1], -1, 1)), lon: Math.atan2(n[0], n[2]) });
      }
    }
  films.set(key, (f = { near, far }));
  return f;
}

/**
 * A 3-D point on/around the bubble (x across, h over the floor, z toward the viewer) as a painter point.
 * The game's floor is 2:1, so depth moves half as far down the screen as height moves up it.
 */
export const project = (x, h, z) => [x, z * FL - h];

/**
 * The bubble. o: the effect's options (palette, radius, seed, actor, delay, release, pulse) — the SAME object the
 * runtime hands back on every update, so the game can flip `release` / `pulse` on a live instance.
 * Returns { update(dt), back(p), front(p), ...state } for the module (or a module built on it) to draw.
 */
export function createShield(o, { tint = 1 } = {}) {
  const C = fit(o.palette, 8), r = o.radius, R = new Rng(o.seed), A = o.actor;
  const T0 = o.delay || 0, T1 = T0 + FORM, rf = Math.sqrt(r * r - CY * CY), TOP = CY + r;
  const { near: NEAR, far: FAR } = filmOf(r), fly = new Fly3({ rng: R, sparks: [WHITE, C[6], C[5], C[4]] }), lights = new Lights();
  const shape = A?.mask ? shapeOf(A) : null;
  const S = { t: 0, T0, T1, T2: Infinity, T3: Infinity, r, rf, TOP, C, R, fly, lights, pulseT: -9 };
  let formed = false, burst = false, lastPulse = o.pulse;

  const grown = () => TOP * ease.outCubic(clamp((S.t - T0) / FORM));
  const torn = () => (S.t < S.T2 ? TOP + 1 : TOP + 1 - (TOP + 2) * ease.inQuad(clamp((S.t - S.T2) / BURST)));
  const alive = (h) => S.t >= T0 && h <= grown() && h <= torn();
  const sheen = () => -1.7 + 3.4 * clamp((((S.t - T0) / T) % 1) / 0.55);
  const phi = () => ((S.t - T0) / T) * (Math.PI / N);
  // how lit the seal and the bubble's light are: on as it forms, out as it bursts
  const sealK = () => smooth(T0, T0 + 0.15, S.t) * (1 - smooth(S.T2 + BURST * 0.5, S.T3 + 0.1, S.t));
  // a re-cast: 0..1, sharp at the strike and gone in half a second
  const pulseK = () => { const a = S.t - S.pulseT; return a < 0 || a > 0.5 ? 0 : 1 - a / 0.5; };
  Object.assign(S, { grown, torn, alive, sealK, pulseK });

  S.update = (dt) => {
    S.t += dt;
    const t = S.t;
    if (!formed && t >= T0) {
      formed = true;
      lights.add(0, 0, 30, C[5], 0.7, 0.3);
      for (let i = 0; i < 8; i++) {
        const g = R.range(0, TAU);
        fly.spawn(P.STAR, Math.cos(g) * rf, Math.sin(g) * rf, 1, 0, 0, R.range(10, 40), R.range(0.3, 0.6), R.pick([WHITE, C[6]]), R.range(0.6, 1.4));
      }
    }
    if (o.pulse !== lastPulse) {
      lastPulse = o.pulse;
      if (formed && !o.release) {
        S.pulseT = t;
        lights.add(0, -CY, 34, C[6], 0.6, 0.25);
        for (let i = 0; i < 10; i++) {
          const g = (i / 10) * TAU + R.range(-0.2, 0.2);
          fly.spawn(P.STAR, Math.cos(g) * rf, Math.sin(g) * rf, 1, Math.cos(g) * 30, Math.sin(g) * 30, R.range(20, 50), R.range(0.3, 0.55), R.pick([WHITE, C[6]]), R.range(0.7, 1.4));
        }
      }
    }
    if (o.release && S.T2 === Infinity) {
      // the buff is over: burst now (or as soon as it has formed, if it had only just started)
      S.T2 = Math.max(t, T0);
      S.T3 = S.T2 + BURST;
    }
    if (!burst && t >= S.T2) {
      burst = true;
      lights.add(0, -TOP, 30, WHITE, 0.6, 0.1);
    }
    if (t >= S.T2 && t < S.T3)
      for (let i = 0; i < 5; i++) {
        const g = R.range(0, TAU), h = torn(), rr = Math.sqrt(Math.max(0, r * r - (h - CY) ** 2));
        fly.spawn(R.chance(0.6) ? P.SPARK : P.STAR, Math.cos(g) * rr, Math.sin(g) * rr, Math.max(1, h), Math.cos(g) * R.range(10, 40), Math.sin(g) * R.range(10, 40), R.range(-20, 30), R.range(0.3, 0.6), R.pick([WHITE, C[6], C[5]]), R.range(0.6, 1.4));
      }
    fly.update(dt);
    lights.update(dt);
    if (S.T2 !== Infinity) fly.cap(Math.max(0.001, S.T3 + TAIL - 0.05 - t));
  };

  S.back = (p) => {
    if (S.t < T0) return;
    film(p, FAR, true);
    seal(p, false);
    if (S.t < S.T3) p.glow(0, -CY, r * 1.1, C[4], 0.14 * sealK() * tint);
    fly.draw(p, (q) => q.z < 0);
  };
  S.front = (p) => {
    if (S.t >= T0) {
      const k = sealK();
      if (shape && k > 0) for (const [x, y] of shape.out) p.light(x, y, C[5], 0.3 * k * tint);
      film(p, NEAR, false);
      globe(p);
      rim(p);
      seal(p, true);
      front(p);
    }
    fly.draw(p, (q) => q.z >= 0);
    lights.draw(p);
  };
  return S;

  function film(p, list, back) {
    const sw = sheen(), g = grown(), tear = torn(), t = S.t;
    for (const q of list) {
      if (!alive(q.h)) continue;
      const edge = (t < T1 && g - q.h < 1.5) || (t >= S.T2 && tear - q.h < 1.5);
      if (edge) {
        p.px(q.x, q.y, WHITE);
        continue;
      }
      const s = (q.x - q.y - CY) / (r * 1.414), hot = Math.max(0, 1 - Math.abs(s - sw) / 0.22), f = q.face;
      const a = ((back ? 0.06 : 0.045) + 0.26 * Math.pow(1 - f, 3) + 0.18 * hot * (back ? 0.3 : 1)) * tint;
      p.blend(q.x, q.y, hot > 0.5 && !back ? C[6] : C[5], a);
    }
  }

  function globe(p) {
    const ph = phi(), sw = sheen(), step = Math.ceil(r * 1.5);
    const pen = (x, y, c) => {
      const xi = Math.round(x), yi = Math.round(y);
      p.px(xi, yi, c); p.px(xi + 1, yi, c); p.px(xi, yi + 1, c); p.px(xi + 1, yi + 1, c);
    };
    const at = (lon, lat) => {
      const X = Math.cos(lat) * Math.sin(lon), Y = Math.sin(lat), Z = Math.cos(lat) * Math.cos(lon);
      return [r * X, -CY + r * (-Y + Z * 0.5), CY + r * Y, Z];
    };
    for (let k = 0; k < 2 * N; k++) {
      const lon = ph + (k * Math.PI) / N;
      if (Math.cos(lon) < 0.06) continue;
      for (let i = 0; i <= step; i++) {
        const [x, y, h] = at(lon, -1.45 + (2.9 * i) / step);
        if (h < 1 || !alive(h)) continue;
        pen(x, y, Math.abs((x - (y + CY)) / (r * 1.414) - sw) < 0.2 ? WHITE : Math.cos(lon) > 0.55 ? C[6] : C[5]);
      }
    }
    for (let i = 0; i <= step; i++) {
      const [x, y, h, Z] = at(ph + Math.PI * (i / step), 0);
      if (Z < 0.05 || h < 1 || !alive(h)) continue;
      pen(x, y, Math.abs((x - (y + CY)) / (r * 1.414) - sw) < 0.2 ? WHITE : C[5]);
    }
  }

  function rim(p) {
    const sw = sheen(), pk = pulseK();
    for (let j = 0, n = Math.ceil(r * TAU * 1.1); j < n; j++) {
      const g = (j / n) * TAU, h = CY + r * Math.sin(-g) * (2 / Math.sqrt(5));
      if (h < 0 || !alive(h)) continue;
      const x = Math.cos(g) * r, y = -CY + Math.sin(g) * r * 1.118, s = (x - (y + CY)) / (r * 1.414), lit = Math.cos(g + 2.36);
      const c = pk > 0.4 || Math.abs(s - sw) < 0.15 || lit > 0.75 ? WHITE : lit > -0.2 ? C[6] : C[5];
      const xi = Math.round(x), yi = Math.round(y);
      p.px(xi, yi, c); p.px(xi + 1, yi, c); p.px(xi, yi + 1, c); p.px(xi + 1, yi + 1, c);
    }
    if (S.t >= T1 && S.t < S.T2) p.glowRing(0, -CY, r, 6, C[4], 0.32 * tint + 0.3 * pk);
  }

  function seal(p, near) {
    const k = sealK();
    if (k <= 0) return;
    const keep = near ? (g) => Math.sin(g) >= 0 : (g) => Math.sin(g) < 0, hot = S.t - T0 < 0.1 || pulseK() > 0.5;
    const c = (g) => (hot || Math.sin(g) > 0.6 ? WHITE : C[6]);
    oval(p, 0, 0, rf, rf * FL, c, 1, keep);
    oval(p, 0, 0, rf + 1.1, (rf + 1.1) * FL, near ? C[5] : C[4], 1, keep);
    if (near) for (let i = -2; i <= 2; i++) p.glow(i * rf * 0.5, 0, 12, C[4], (0.18 + 0.25 * pulseK()) * k * tint);
  }

  function front(p) {
    const t = S.t;
    if (t < T1 || t >= S.T2) return;
    const ph = phi(), tt = t - T0;
    for (let k = 0; k < 2 * N; k++) {
      const lon = ph + (k * Math.PI) / N, n = [Math.sin(lon), 0, Math.cos(lon)], f = n[2] * V[2];
      if (f < 0.15) continue;
      const x = n[0] * r, y = n[2] * r * FL - CY;
      p.px(x, y, WHITE);
      if (f > 0.4) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) p.blend(x + dx, y + dy, C[6], 0.7);
      p.glow(x, y, 4, C[5], 0.3 * tint);
    }
    sparkle(p, 0, -CY - r * 0.894 * 1.118 + 2, 2 + Math.round(1.5 + 1.5 * Math.sin((tt / T) * TAU * 2)), WHITE, C[6], 0.45);
    for (const off of [0, Math.PI]) {
      const g = (tt / T) * TAU + off + 0.8, h = CY + r * Math.sin(-g) * 0.894;
      if (h > 1) sparkle(p, Math.cos(g) * r, -CY + Math.sin(g) * r * 1.118, 2, WHITE, C[6], 0.4);
    }
    for (let g = 3.55; g < 4.2; g += 0.04) {
      const xi = Math.round(Math.cos(g) * r * 0.74), yi = Math.round(-CY + Math.sin(g) * r * 0.8), c = g > 3.7 && g < 4.05 ? WHITE : C[6];
      p.px(xi, yi, c); p.px(xi + 1, yi, c);
    }
    p.px(Math.cos(3.4) * r * 0.62, -CY + Math.sin(3.4) * r * 0.68, WHITE);
    cycle(tt, T, 9, o.seed, (g) => g.range(0.35, 0.6), (age, life, Rr) => {
      const q = NEAR[Math.floor(Rr.next() * NEAR.length)], k = Math.sin((age / life) * Math.PI);
      if (q.face < 0.3) return;
      sparkle(p, q.x, q.y, 1 + 2.5 * k * Rr.range(0.6, 1), WHITE, C[6], 0.45 * k);
    });
    cycle(tt, T, 12, o.seed + 1, (g) => g.range(1.2, 2.2), (age, life, Rr) => {
      const x0 = Rr.range(-0.6, 0.6) * rf, u = age / life, x = x0 + Math.sin(u * 6 + Rr.range(0, 6)) * 2, y = -u * (TOP - 4);
      p.dot(x, y, u < 0.5 ? C[6] : C[5], 1);
      p.light(x, y, C[5], 0.4 * Math.sin(u * Math.PI));
    });
  }
}
