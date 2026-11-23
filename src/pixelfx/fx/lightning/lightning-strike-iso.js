// Lightning strike for the game's 2:1 isometric camera: lightning/lightning-strike rewritten for the floor the game
// sees, not its picture squashed, stretched or scaled. The recipe is the source's: a sigil charges on the floor with
// static rising off it, the scene darkens, a stepped leader feels down from the sky and a streamer climbs to meet it,
// a thick bolt slams in and flickers through three strokes (a dart running down the channel before each), arcs race out
// along the cracks it splits in the floor, sparks, grit and dust fly, and the spent channel cools and crumbles from the
// top down to a scorch. What changed is the world it happens in:
//   - the sigil is a 2:1 ring lying on the floor round the spot, its far arc behind, its near arc in front;
//   - the cracks are a Lichtenberg figure on the floor: branches running out every way from the strike over the floor
//     (2:1), forking as they go, white while the arcs race along them, glowing with heat, cooling to soot that goes
//     patch by patch;
//   - what flies (sparks, hot sparks, grit) flies in 3D every way round and lands at its own depth; the dust rolls out
//     over the floor every way; the scorch is a 2:1 spot;
//   - the bolt, the leader, the streamer and the channel stand in the air, as tall as in the side view; it is light, so
//     meta.over says it is drawn over the character it strikes (its floor goes under).
// 1 px = 1 character sprite px (32 x 16 px tiles).
// The stepped leader, the stroke flicker, the cooling channel and the scorch follow Sprite Fusion's open-source
// lightning (https://www.spritefusion.com/pixel-art-vfx/lightning), MIT License, Copyright (c) 2026 Hugo Duprez.
import { Particles, Lights, P, Rng, fit, sparkle, clamp, smooth, ease, rand, rng, TAU, WHITE, hex, mix, GRAVITY } from "../../core/index.js";
import { VOLT, PLASMA, SOOT, SOOT2, zigzag, bend, stroke, crackle, trace, spark, heat } from "./_lib.js";

export const meta = {
  name: "Lightning strike (iso)",
  desc: "lightning/lightning-strike on the 2:1 floor: a sigil charges, a bolt slams down, arcs race out along cracks that branch over the floor every way, sparks and grit land all round.",
  tags: ["lightning", "electric", "strike", "spell", "target", "impact", "ground", "one-shot", "iso", "top-down"],
  size: [248, 300],
  origin: [124, 232],
  duration: 3,
  loop: false,
  fps: 30,
  bg: "ground",
  pixels: 1,
  over: true,
  options: { palette: VOLT, sparks: PLASMA, seed: 5 },
};

const FL = 0.5;
const W = 124, TOP = -224, RX = 28, REACH = 52, LEAD0 = 0.48, STEPS = 9, MEET = -30;
const STROKES = [{ t: 0.76, k: 1 }, { t: 1.04, k: 0.8 }, { t: 1.26, k: 0.55 }];
const FLICK = [1, 0.72, 0.3, 0.95, 0.5, 0.8, 0.22];
const level = (a) => (a < 0 ? 0 : FLICK[Math.floor(a * 30 + 1e-4)] ?? 0);
const NIGHT = hex("#04030a"), DUST = hex("#6e6382"), ASH = hex("#5b5566"), STONE = ["#655b7a", "#4a4263", "#342d45"].map(hex);
const S1 = STROKES[0].t;
const GONE = [2.3, 2.95]; // the soot of the cracks and the scorch goes, patch by patch

// the cracks the strike splits in the floor: a Lichtenberg figure, branches wandering out every way over the floor
// from the strike and forking; each point carries its distance along its branch from the strike
function cracks(R) {
  const out = [];
  const grow = (x, z, a, len, w, d, depth) => {
    const pts = [[x, z, d]];
    for (let s = 0; s < len; s += 1.5) {
      a += R.range(-0.32, 0.32);
      x += Math.cos(a) * 1.5;
      z += Math.sin(a) * 1.5;
      d += 1.5;
      pts.push([x, z, d]);
      if (depth < 2 && s > 3 && R.chance(0.09)) grow(x, z, a + R.sign() * R.range(0.5, 1.2), (len - s) * R.range(0.3, 0.6), w * 0.6, d, depth + 1);
    }
    out.push({ pts, w });
  };
  for (let i = 0; i < 8; i++) grow(R.range(-1, 1), R.range(-1, 1), (i / 8) * TAU + R.range(-0.3, 0.3), REACH * R.range(0.55, 1), 1, 0, 0);
  return out;
}

// the sigil on the floor: a 2:1 ring of dashes turning slowly, crosshair ticks, an inner ring and a heart; drawn in from
// the front, charging brighter; near picks the near (in front) or far (behind) arc
function sigil(p, t, C, k, near) {
  const reveal = clamp(t / 0.22), spin = t * 0.8, burnt = t > S1 ? t - S1 : -1;
  if (burnt > 0.45) return;
  const a0 = burnt < 0 ? 1 : burnt < 0.07 ? 1 : 1 - (burnt - 0.07) / 0.38, hot = burnt >= 0 && burnt < 0.07;
  const on = (a) => Math.sin(a) >= 0 === near;
  const from = (a) => Math.abs((((a - Math.PI / 2) % TAU) + TAU + Math.PI) % TAU - Math.PI) / Math.PI;
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * TAU + spin;
    if (!on(a) || from(a) > reveal) continue;
    for (const da of [0, 0.06, 0.12]) {
      const x = Math.cos(a + da) * RX, y = Math.sin(a + da) * RX * FL;
      p.dot(x, y, hot ? WHITE : near ? (k > 0.7 ? C[6] : C[5]) : k > 0.7 ? C[4] : C[3], a0);
      if (near) p.dot(x, y + 1, hot ? C[6] : C[2], a0);
    }
    if (i % 3 === 0) p.glow(Math.cos(a) * RX, Math.sin(a) * RX * FL, 5, C[4], 0.3 * k * a0);
  }
  for (let j = 0; j < 4; j++) {
    const a = spin * -0.5 + (j * TAU) / 4 + Math.PI / 4;
    if (!on(a) || reveal < 1) continue;
    p.line(Math.cos(a) * (RX - 5), Math.sin(a) * (RX - 5) * FL, Math.cos(a) * (RX + 5), Math.sin(a) * (RX + 5) * FL, hot ? WHITE : near ? C[6] : C[4], a0);
  }
  if (t > 0.3)
    for (let a = 0; a < TAU; a += 0.07) {
      if (!on(a)) continue;
      p.dot(Math.cos(a) * 14, Math.sin(a) * 14 * FL, hot ? WHITE : near ? C[4] : C[2], a0 * clamp((t - 0.3) / 0.12));
    }
  if (near && burnt < 0) {
    const pulse = 0.6 + 0.4 * Math.sin(t * (10 + 30 * k));
    p.px(0, 0, k > 0.5 ? WHITE : C[6]);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1]]) p.px(dx, dy, C[5]);
    p.glow(0, -1, 10 + 10 * k, C[5], 0.3 + 0.4 * k * pulse);
  }
}

// keep the bolt's forks on the canvas and in the air
function keep(b) {
  const paths = [];
  for (const q of b.paths) {
    const pts = [];
    for (const pt of q.pts) {
      if (Math.abs(pt[0]) > W - 5 || pt[1] > -3 || pt[1] < TOP + 6) break;
      pts.push(pt);
    }
    if (q.w >= 1 || pts.length > 3) paths.push({ w: q.w, pts: q.w >= 1 ? q.pts : pts });
  }
  return { paths };
}

export function create(o) {
  const C = fit(o.palette, 8), R = new Rng(o.seed), S0 = o.seed * 23;
  const ps = new Particles({ rng: R, ground: () => Infinity, sparks: o.sparks }), lights = new Lights(), flying = [];
  const X0 = R.range(8, 18) * (R.chance(0.5) ? 1 : -1);
  const main = keep(zigzag(R, X0, TOP, 0, -1, 0.17, 0.5)), trunk = main.paths[0].pts;
  const drift = (dx) => (x, y) => [x + dx * Math.sin((Math.PI * y) / TOP), y];
  const bolts = [main, bend({ paths: [{ pts: trunk, w: 1 }] }, drift(1.5)), bend({ paths: [{ pts: trunk, w: 1 }] }, drift(3))];
  const chan = (i) => bolts[i].paths[0].pts, last = STROKES[STROKES.length - 1], end = chan(STROKES.length - 1);
  const tree = cracks(R);
  // the spent channel breaks up from the top down, each piece at its own moment
  const gone = end.map(([, y], i) => last.t + 0.25 + 0.75 * (0.55 * rand(o.seed, i, 5) + 0.45 * (1 - y / TOP)));
  let t = 0, struck = -1;
  const now = () => {
    for (let i = STROKES.length - 1; i >= 0; i--) if (t >= STROKES[i].t) return { i, s: STROKES[i], a: t - STROKES[i].t, k: level(t - STROKES[i].t) * STROKES[i].k };
    return null;
  };
  const charge = () => clamp(t / S1) ** 1.5;
  const heatAt = () => (struck < 0 ? 0 : Math.max(...STROKES.slice(0, struck + 1).map((s) => s.k * Math.pow(clamp(1 - (t - s.t) / 1.6), 1.4))));
  // something thrown off the strike in 3D: a spark (kind 0), a hot spark that falls and cools (1), a grain of grit (2)
  const throwUp = (kind, sp, dev, life, extra = {}) => {
    const az = R.range(0, TAU), up = Math.cos(dev), out = Math.sin(dev);
    flying.push({ kind, x: R.range(-1.5, 1.5), z: R.range(-1.5, 1.5), h: 1.5, vx: Math.cos(az) * out * sp, vz: Math.sin(az) * out * sp, vh: up * sp, life, max: life, ...extra });
  };

  return {
    update(dt) {
      t += dt;
      for (const [i, s] of STROKES.entries()) {
        if (struck >= i || t < s.t) continue;
        struck = i;
        const k = s.k;
        lights.add(0, -50, 120, C[4], 0.55 * k, 0.4);
        lights.add(0, -3, 24, WHITE, 0.5 * k, 0.1);
        // thrown up and out every way round: sparks, hot sparks, grit; dust rolled out over the floor; smoke
        for (let j = 0; j < Math.round(44 * k); j++) throwUp(0, R.range(110, 320) * (0.65 + 0.35 * k), R.range(0, 1.3), R.range(0.2, 0.55));
        for (let j = 0; j < Math.round(12 * k); j++) throwUp(1, R.range(70, 220), R.range(0, 1.2), R.range(0.5, 1));
        for (let j = 0; j < Math.round(5 * k); j++) ps.spawn(P.EMBER, R.range(-4, 4), -2, R.range(-25, 25), -R.range(30, 80), R.range(0.8, 1.5), C[3]);
        for (let j = 0; j < Math.round(18 * k); j++) throwUp(2, R.range(50, 190), R.range(0, 1.1), R.range(1.2, 2.2), { c: R.pick(STONE), s: R.chance(0.35) ? 2 : 1 });
        for (let j = 0; j < 8; j++) {
          const a = R.range(0, TAU), v = R.range(30, 110);
          ps.spawn(P.DUST, Math.cos(a) * 3, Math.sin(a) * 1.5 - 1, Math.cos(a) * v, Math.sin(a) * v * FL - R.range(4, 24), R.range(0.4, 0.8), DUST, R.range(1.5, 3));
        }
        for (let j = 0; j < Math.round(4 * k); j++) ps.spawn(P.SMOKE, R.range(-8, 8), R.range(-2, 2) - 4, R.range(-10, 10), -R.range(10, 25), R.range(1.1, 1.6), mix(ASH, C[2], 0.3), R.range(3, 6), R.range(0.05, 0.25));
      }
      if (struck >= 0 && t < 1.7 && R.chance(6 * dt)) ps.spawn(P.SMOKE, R.range(-8, 8), R.range(-2, 2) - 2, R.range(-4, 4), -R.range(9, 17), R.range(1, 1.3), 0, R.range(2, 3.5));
      for (let i = 0; i < gone.length - 1; i++)
        if (gone[i] <= t && gone[i] > t - dt && rand(o.seed, i, 6) < 0.5) {
          const [x, y] = end[i];
          ps.spawn(P.MOTE, x, y, R.range(-8, 8), R.range(6, 22), R.range(0.4, 0.8), R.chance(0.5) ? C[5] : C[4], R.range(0.5, 0.9));
        }
      // what flies: slowed by the air, falling, bouncing on the floor at its own depth; grit comes to rest and lies
      for (let i = flying.length - 1; i >= 0; i--) {
        const b = flying[i];
        if ((b.life -= dt) <= 0) { flying.splice(i, 1); continue; }
        if (b.rest) continue;
        const drag = b.kind === 2 ? 0.8 : 2.2, k = Math.exp(-drag * dt);
        b.vx *= k; b.vz *= k; b.vh = b.vh * k - GRAVITY * (b.kind === 2 ? 1 : 0.45) * dt;
        b.x += b.vx * dt; b.z += b.vz * dt; b.h += b.vh * dt;
        if (b.h > 0) continue;
        b.h = 0;
        if (b.kind === 2 && -b.vh < 130) (b.rest = true), (b.vx = b.vz = b.vh = 0);
        else (b.vh = -b.vh * (b.kind === 2 ? 0.25 : 0.45)), (b.vx *= 0.7), (b.vz *= 0.7);
      }
      ps.update(dt);
      lights.update(dt);
      const left = Math.max(0.001, meta.duration - 0.05 - t);
      for (const q of ps.list) if (q.life > left) q.life = left;
      for (const b of flying) if (b.life > left) b.life = left;
    },
    drawBack(p) {
      // the scene darkens a beat before the strike: a soft veil, deepest round the bolt's path, gone at the flash
      const dark = 0.5 * smooth(0.46, 0.66, t) * (1 - smooth(S1 - 0.01, S1 + 0.02, t));
      if (dark > 0.01)
        for (let y = -228; y < 64; y++)
          for (let x = -W; x < W; x++) {
            const d = Math.hypot(x / W, (y + 90) / 150), a = dark * (1 - smooth(0.55, 1, d));
            if (a > 0.01) p.blend(x + 0.5, y + 0.5, NIGHT, a);
          }
      sigil(p, t, C, charge(), false);
      // the cracks: arcs race out along them white, they glow with heat, cool to soot, and the soot goes patch by patch
      if (struck >= 0) {
        const s = now(), front = REACH * ease.outCubic(clamp((t - S1) / 0.35)), T0 = heatAt(), go = smooth(GONE[0], GONE[1], t);
        const elec = s.a < 0.14 ? s.s.k * (1 - s.a / 0.14) : 0;
        for (const br of tree)
          for (const [x, z, d] of br.pts) {
            if (d > front) break;
            const y = z * FL, q = d / REACH, n = rand(Math.round(x * 2), Math.round(z * 2), 9), fresh = d > front - 6 && front < REACH;
            if (0.7 * q + 0.3 * n < go * 1.05) continue;   // the outer soot goes first, then in toward the strike
            const T = T0 * (1.15 - q) * (br.w < 1 ? 0.8 : 1) - n * 0.25, c = fresh || (elec > 0.3 && n < 0.85) ? (q < 0.5 ? WHITE : C[6]) : heat(T) || SOOT2;
            p.px(x, y + 1, SOOT);
            p.px(x, y, c);
            if (br.w >= 1 && d < 9) p.px(x + 1, y, SOOT);
            if ((fresh || elec > 0.3) && (Math.round(d) & 3) === 0) p.glow(x, y, 7, C[5], 0.4);
            else if (T > 0.2 && (Math.round(d) & 3) === 0) p.glow(x, y, 5, c, 0.2 * T);
          }
        scorch(p, 0, 0, 12, T0, go, S0);
        if (T0 > 0) p.glow(0, -2, 34, heat(0.55), 0.3 * T0);
      }
      drawFlying(p, false);
      ps.draw(p, "back");
    },
    draw(p) {
      const s = now(), f = Math.floor(t * 30 + 1e-4), k = charge();
      sigil(p, t, C, k, true);
      // static rising off the charging sigil, more and more of it, all round the ring
      if (t > 0.15 && t < S1) {
        const r = rng(o.seed, 61, f);
        for (let i = 0; i < Math.round(1 + 4 * k); i++) {
          const a = r.range(0, TAU), x = Math.cos(a) * RX, y = Math.sin(a) * RX * FL;
          crackle(p, zigzag(r, x, y, x + r.range(-2.5, 2.5), y - r.range(4, 9) * (0.6 + k), 0.45, 0.3), 0.45 + 0.4 * k, C, 0.3);
        }
        p.glow(0, -2, 36, C[4], 0.12 + 0.3 * k);
      }
      // the stepped leader feels down from above; a streamer climbs out of the sigil to meet it
      if (t >= LEAD0 && t < S1) {
        const u = clamp((t - LEAD0) / (S1 - LEAD0)), st = Math.min(STEPS, Math.floor(u * STEPS) + 1), fresh = 1 - ((u * STEPS) % 1);
        const reach = TOP + (MEET - TOP) * Math.pow(st / STEPS, 1.2), prev = TOP + (MEET - TOP) * Math.pow((st - 1) / STEPS, 1.2);
        for (const q of main.paths) {
          const tk = q.w >= 1;
          for (let i = 0; i < q.pts.length - 1; i++) {
            const [ax, ay] = q.pts[i], [bx, by] = q.pts[i + 1];
            if (by > reach) {
              if (ay <= reach && i > 0) (p.px(ax, ay, WHITE), p.glow(ax, ay, 7, C[5], 0.5 * fresh + 0.15));
              break;
            }
            const young = by > prev;
            p.line(ax, ay, bx, by, young ? (fresh > 0.4 ? (tk ? C[6] : C[5]) : C[4]) : tk ? C[3] : C[2]);
            if (i % 4 === 0 && ay > TOP + 14) p.glow(ax, ay, young ? 8 : 5, C[4], young ? 0.3 * fresh + 0.1 : 0.12);
          }
        }
        if (t > 0.62) {
          const h = -MEET * ease.outQuad((t - 0.62) / (S1 - 0.62)), r = rng(o.seed, 77, f);
          const b = zigzag(r, 0, -1, r.range(-2, 2), -Math.max(3, h), 0.3, 0.3), tip = b.paths[0].pts.at(-1);
          crackle(p, b, 0.85, C, 0.45);
          p.px(tip[0], tip[1], WHITE);
          p.glow(tip[0], tip[1], 9, C[5], 0.5);
        }
      }
      // the strokes, the dart that runs down the channel before each flicker, the channel cooling and crumbling
      const next = STROKES.find((q) => q.t > t);
      if (next && next !== STROKES[0] && t > next.t - 0.06) {
        const tr = chan(STROKES.indexOf(next)), u = (t - (next.t - 0.06)) / 0.06, i1 = Math.floor(u * tr.length);
        trace(p, tr, C[3], 1);
        trace(p, tr, C[6], 1, i1 - 18, i1);
        for (let i = Math.max(0, i1 - 18); i < Math.min(tr.length, i1); i += 4) if (tr[i][1] > TOP + 14) p.glow(tr[i][0], tr[i][1], 9, C[4], 0.35);
      } else if (s && s.k > 0) {
        const hero = s.i === 0 && s.a < 1 / 30;
        stroke(p, bolts[s.i], s.k, C, s.i === 0 ? 1.5 : 1.2, { hero, core: s.k > 0.6 ? (hero ? 1.2 : 0.8) : 0, minY: TOP + 14 });
        const r = 4.5 * s.k;
        p.circle(0, -1, r + 1.5, C[2]);
        p.circle(0, -1, r + 0.5, C[5]);
        p.circle(0, -1, r * 0.65, WHITE);
        if (s.a < 0.07) sparkle(p, 0, -2, Math.round(12 * s.k * (1 - s.a / 0.07)), C[6], C[4], 0.25);
        p.glow(0, -16, 96, C[3], 0.42 * s.k);
        p.glow(0, -3, 22, C[5], 0.3 * s.k);
        if (hero) p.glow(X0 * 0.5, -110, 170, C[3], 0.3);
      } else if (s) {
        const crumble = s.i === STROKES.length - 1, cool = clamp((s.a - 0.23) / 0.45), tr = chan(s.i);
        for (let i = 0; i < tr.length - 1; i++) {
          if (crumble && t >= gone[i]) continue;
          const h = crumble ? 1 - clamp((t - last.t - 0.23) / (gone[i] - last.t - 0.23)) : 1 - cool;
          p.line(tr[i][0], tr[i][1], tr[i + 1][0], tr[i + 1][1], h > 0.7 ? C[5] : h > 0.4 ? C[4] : h > 0.15 ? C[3] : C[2]);
          if (i % 6 === 0 && h > 0.3 && tr[i][1] > TOP + 14) p.glow(tr[i][0], tr[i][1], 6, C[4], 0.15 * h);
        }
      }
      // arcs crawl out along the cracks as they split, and again with every flicker, just over the floor
      if (s && s.a < 0.4) {
        const r = rng(o.seed, 91, f), run = s.i === 0 ? REACH * ease.outCubic(clamp(s.a / 0.35)) : REACH * clamp(s.a / 0.22);
        for (const br of tree) {
          if (br.w < 1 || r.next() < 0.3) continue;
          const i1 = br.pts.findIndex(([, , d]) => d > run), j1 = i1 < 0 ? br.pts.length : i1, j0 = Math.max(0, j1 - r.int(7, 13));
          const pts = br.pts.slice(j0, j1).map(([x, z]) => [x + r.range(-0.6, 0.6), z * FL - 1.5 - r.range(0, 2.5)]);
          if (pts.length > 1) crackle(p, { paths: [{ pts, w: 1 }] }, 0.9 * (1 - s.a / 0.4) + 0.1, C, 0.35);
        }
      }
      drawFlying(p, true);
      ps.draw(p, "front");
      lights.draw(p);
    },
  };

  // what flies, behind the strike (z < 0) or in front: sparks (a streak stretched by speed), hot sparks (a bead
  // cooling from white as it falls), grit (a chip of stone; it lies where it lands, sinking into the soot at the end)
  function drawFlying(p, near) {
    const go = smooth(GONE[0], GONE[1], t);
    for (const b of flying) {
      if (b.z >= 0 !== near) continue;
      const x = b.x, y = b.z * FL - b.h, k = b.life / b.max;
      if (b.kind === 0) spark(p, x, y, b.vx, b.vz * FL - b.vh, k, o.sparks);
      else if (b.kind === 1) {
        p.px(x, y, k > 0.6 ? WHITE : k > 0.3 ? heat(0.7) || C[6] : heat(0.3) || C[4]);
        p.glow(x, y, 3, C[5], 0.35 * k);
      } else {
        if (b.rest && rand(Math.round(x), Math.round(b.z), S0 + 3) < go) continue;
        p.px(x, y, b.c);
        if (b.s > 1) p.px(x + 1, y, b.c);
      }
    }
  }
}

// heat left on the floor where the bolt struck: a 2:1 spot, white-hot in its middle cooling through the fire ramp to
// soot; the soot then goes patch by patch (gone 0..1), never a fade
function scorch(p, cx, cy, rx, T0, gone, seed) {
  const ry = rx * FL;
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, d = Math.sqrt(dx * dx + dy * dy);
      if (d > 1) continue;
      const n = rand(x, y, seed), T = T0 * (1.25 - d) - n * 0.35;
      if (T > 0.06) {
        const c = heat(T);
        p.px(x, y, c);
        if ((x & 3) === 0) p.glow(x + 0.5, y, 6, c, 0.18 * T);
      } else if (rand(x + 7, y + 3, seed + 1) * 0.6 + (1 - d) * 0.4 > gone) p.dot(x, y, d < 0.5 ? SOOT : SOOT2, d < 0.95 - n * 0.3 ? 1 : 1 - d);
    }
}
