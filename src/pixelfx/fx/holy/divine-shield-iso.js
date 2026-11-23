// Divine shield for the game's 2:1 isometric camera: holy/divine-shield rewritten for the floor the game sees, not
// its picture squashed, stretched or scaled. The recipe is the source's: a bubble of gold light round the
// character, a bright rim and a thin gold film, meridians turning like a slow globe, a sheen sweeping across,
// sparkles winking on it, a seal where it meets the floor. What changed:
//   - the bubble is a sphere in the game's space, worked out per pixel: the floor cuts it, so its seal is a 2:1 ring
//     on the floor round the character's feet, its far half behind them and its near half (the film they show
//     through) in front;
//   - it has a life of its own: the seal lights on the floor and the bubble grows up out of it, a line of light
//     climbing to the top; it holds; then it bursts the way a bubble does, the film splitting at the top and running
//     down to the floor, shedding gold glitter that falls and goes out; the seal goes with it;
//   - cast over an area, the game starts one on each ally inside it, `delay` seconds after the cast as the spell
//     reaches them.
// The character is the game's own: pass it as `actor` and the bubble lights it. 1 px = 1 character sprite px.
import { Lights, P, Rng, fit, sparkle, cycle, clamp, smooth, ease, TAU, WHITE } from "../../core/index.js";
import { GOLD, oval, shapeOf } from "./_lib.js";
import { Fly3 } from "../_iso.js";

const CY = 22, FL = 0.5, N = 4, T = 2.4, FORM = 0.4, HOLD = 2.6, BURST = 0.32;

export const meta = {
  name: "Divine shield (iso)",
  desc: "holy/divine-shield on the 2:1 floor: a gold bubble grows up out of a seal round the character's feet, turns like a slow globe, then bursts from the top down in falling glitter.",
  tags: ["holy", "shield", "bubble", "barrier", "buff", "character", "one-shot", "iso", "top-down"],
  size: [96, 104],
  origin: [48, 76],
  duration: 0.5 + FORM + HOLD + BURST + 0.45,
  loop: false,
  fps: 30,
  bg: "ground",
  actor: 2,
  pixels: 1,
  options: { palette: GOLD, radius: 29, delay: 0, seed: 8 },
};

// the camera looks along (0, 1, 2) in (X across, Y up, Z toward us): what faces it, and how far round
const V = [0, 1 / Math.sqrt(5), 2 / Math.sqrt(5)];
// every pixel of the bubble's near and far film, once per radius: where the view ray through it meets the sphere
// (centre CY over the floor), its latitude and longitude, how squarely it faces us, how high it is
const films = new Map();
function filmOf(r) {
  let f = films.get(r);
  if (f) return f;
  const near = [], far = [];
  for (let y = Math.floor(-r * 1.12) - 1; y <= Math.ceil(r * 1.12) + 1; y++)
    for (let x = -Math.ceil(r) - 1; x <= Math.ceil(r) + 1; x++) {
      const X = x + 0.5, Yc = y + 0.5, disc = 4 * Yc * Yc - 20 * (X * X + Yc * Yc - r * r);
      if (disc < 0) continue;
      for (const s of [1, -1]) {
        const k = (2 * Yc + s * Math.sqrt(disc)) / 10, P3 = [X, -Yc + k, 2 * k], h = CY + P3[1];
        if (h < 0) continue;   // under the floor
        const n = P3.map((v) => v / r), face = n[1] * V[1] + n[2] * V[2];
        (s > 0 ? near : far).push({ x, y: y - CY, n, h, face: Math.abs(face), lat: Math.asin(clamp(n[1], -1, 1)), lon: Math.atan2(n[0], n[2]), d: Math.hypot(X / r, Yc / (r * 1.118)) });
      }
    }
  films.set(r, (f = { near, far }));
  return f;
}

export function create(o) {
  const C = fit(o.palette, 8), r = o.radius, R = new Rng(o.seed), D0 = o.delay, A = o.actor, END = meta.duration;
  const T0 = D0, T1 = T0 + FORM, T2 = T1 + HOLD, T3 = T2 + BURST, rf = Math.sqrt(r * r - CY * CY), TOP = CY + r;
  const { near: NEAR, far: FAR } = filmOf(r), fly = new Fly3({ rng: R, sparks: [WHITE, C[6], C[5], C[4]] }), lights = new Lights();
  const shape = A?.mask ? shapeOf(A) : null;
  let t = 0, formed = false, burst = false;
  // how high it has grown, and how far down it has burst (heights over the floor)
  const grown = () => TOP * ease.outCubic(clamp((t - T0) / FORM));
  const torn = () => (t < T2 ? TOP + 1 : TOP + 1 - (TOP + 2) * ease.inQuad(clamp((t - T2) / BURST)));
  const alive = (h) => t >= T0 && h <= grown() && h <= torn();
  const sheen = () => -1.7 + 3.4 * clamp((((t - T0) / T) % 1) / 0.55);
  const phi = () => ((t - T0) / T) * (Math.PI / N);

  return {
    update(dt) {
      t += dt;
      if (!formed && t >= T0) {
        formed = true;
        lights.add(0, 0, 30, C[5], 0.7, 0.3);
        for (let i = 0; i < 8; i++) {
          const g = R.range(0, TAU);
          fly.spawn(P.STAR, Math.cos(g) * rf, Math.sin(g) * rf, 1, 0, 0, R.range(10, 40), R.range(0.3, 0.6), R.pick([WHITE, C[6]]), R.range(0.6, 1.4));
        }
      }
      if (!burst && t >= T2) {
        burst = true;
        lights.add(0, -TOP, 30, WHITE, 0.6, 0.1);
      }
      // the film running down as it bursts sheds glitter off its torn edge, which falls to the floor and goes out
      if (t >= T2 && t < T3)
        for (let i = 0; i < 5; i++) {
          const g = R.range(0, TAU), h = torn(), rr = Math.sqrt(Math.max(0, r * r - (h - CY) ** 2));
          fly.spawn(R.chance(0.6) ? P.SPARK : P.STAR, Math.cos(g) * rr, Math.sin(g) * rr, Math.max(1, h), Math.cos(g) * R.range(10, 40), Math.sin(g) * R.range(10, 40), R.range(-20, 30), R.range(0.3, 0.6), R.pick([WHITE, C[6], C[5]]), R.range(0.6, 1.4));
        }
      fly.update(dt);
      lights.update(dt);
      fly.cap(Math.max(0.001, END - 0.05 - t));
    },
    drawBack(p) {
      if (t < T0) return;
      film(p, FAR, true);
      seal(p, false);
      if (t < T3) p.glow(0, -CY, r * 1.1, C[4], 0.14 * sealK());
      fly.draw(p, (q) => q.z < 0);
    },
    draw(p) {
      if (t >= T0) {
        // the bubble lights the character from all round while it stands
        const k = sealK();
        if (shape && k > 0) for (const [x, y] of shape.out) p.light(x, y, C[5], 0.3 * k);
        film(p, NEAR, false);
        globe(p);
        rim(p);
        seal(p, true);
        front(p);
      }
      fly.draw(p, (q) => q.z >= 0);
      lights.draw(p);
    },
  };

  // how lit the seal and the bubble's light are: on as it forms, out as it bursts
  function sealK() {
    return smooth(T0, T0 + 0.15, t) * (1 - smooth(T2 + BURST * 0.5, T3 + 0.1, t));
  }

  // the film: one smooth translucent field, no per-pixel dither — the light thickens where the sphere turns away
  // from us, and the sheen is a smooth band of brighter tint
  function film(p, list, back) {
    const sw = sheen(), g = grown(), tear = torn();
    for (const q of list) {
      if (!alive(q.h)) continue;
      const edge = (t < T1 && g - q.h < 1.5) || (t >= T2 && tear - q.h < 1.5);
      if (edge) {
        p.px(q.x, q.y, WHITE);
        continue;
      }
      const s = (q.x - q.y - CY) / (r * 1.414), hot = Math.max(0, 1 - Math.abs(s - sw) / 0.22), f = q.face;
      const a = (back ? 0.06 : 0.045) + 0.26 * Math.pow(1 - f, 3) + 0.18 * hot * (back ? 0.3 : 1);
      p.blend(q.x, q.y, hot > 0.5 && !back ? C[6] : C[5], a);
    }
  }

  // the globe's meridians and equator, drawn once as clean 2 px solid lines turning over the near face: a thick
  // pen, never a 1 px net (the net was the speckle)
  function globe(p) {
    const g = grown(), ph = phi(), sw = sheen(), step = Math.ceil(r * 1.5);
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
      if (Math.cos(lon) < 0.06) continue;   // the near face only
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

  // the outline: a 2 px band, bright where the light sits (top left) and where the sheen crosses it; only what has grown
  function rim(p) {
    const sw = sheen();
    for (let j = 0, n = Math.ceil(r * TAU * 1.1); j < n; j++) {
      const g = (j / n) * TAU, h = CY + r * Math.sin(-g) * (2 / Math.sqrt(5));
      if (h < 0 || !alive(h)) continue;
      const x = Math.cos(g) * r, y = -CY + Math.sin(g) * r * 1.118, s = (x - (y + CY)) / (r * 1.414), lit = Math.cos(g + 2.36);
      const c = Math.abs(s - sw) < 0.15 || lit > 0.75 ? WHITE : lit > -0.2 ? C[6] : C[5];
      const xi = Math.round(x), yi = Math.round(y);
      p.px(xi, yi, c); p.px(xi + 1, yi, c); p.px(xi, yi + 1, c); p.px(xi + 1, yi + 1, c);
    }
    if (t >= T1 && t < T2) p.glowRing(0, -CY, r, 6, C[4], 0.32);
  }

  // where it meets the floor: a bright seal, 2:1, two solid 1 px rings (a 2 px band), far half behind, near in front
  function seal(p, near) {
    const k = sealK();
    if (k <= 0) return;
    const keep = near ? (g) => Math.sin(g) >= 0 : (g) => Math.sin(g) < 0, hot = t - T0 < 0.1;
    const c = (g) => (hot || Math.sin(g) > 0.6 ? WHITE : C[6]);
    oval(p, 0, 0, rf, rf * FL, c, 1, keep);
    oval(p, 0, 0, rf + 1.1, (rf + 1.1) * FL, near ? C[5] : C[4], 1, keep);
    if (near) for (let i = -2; i <= 2; i++) p.glow(i * rf * 0.5, 0, 12, C[4], 0.18 * k);
  }

  // what plays on the bubble's near face while it stands: the glints at the crossings, the shine, sparkles, motes
  function front(p) {
    if (t < T1 || t >= T2) return;
    const ph = phi(), tt = t - T0;
    for (let k = 0; k < 2 * N; k++) {
      const lon = ph + (k * Math.PI) / N, n = [Math.sin(lon), 0, Math.cos(lon)], f = n[2] * V[2];
      if (f < 0.15) continue;
      const x = n[0] * r, y = n[2] * r * FL - CY;
      p.px(x, y, WHITE);
      if (f > 0.4) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) p.blend(x + dx, y + dy, C[6], 0.7);
      p.glow(x, y, 4, C[5], 0.3);
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
