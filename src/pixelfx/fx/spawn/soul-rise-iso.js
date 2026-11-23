// Soul rise for the game's 2:1 isometric camera: spawn/soul-rise rewritten for the floor the game sees and timed to
// the character's own death, not its picture squashed, stretched or scaled. The recipe is the source's: the body's
// outline flares, a pale glowing copy of it lifts out, its legs melt into a rippling wisp, it sheds motes and thins
// into light. What changed:
//   - it follows the death: the game's character falls (`side`: -1 to the left of the screen, 1 to the right, 0 he
//     stays where he is) and lands at `land` seconds; the outline flares on the body where it lies, and its light
//     streams up out of it, every pixel of the body sending its own mote to its own place in the soul, which gathers
//     upright over the body (a soul is not a picture of the corpse turned on its side);
//   - nothing is stretched or squeezed: the soul lifts as it is, its legs melt as their pixels drift in to a wavering
//     wisp and go out, and it thins from the feet up grain by grain;
//   - the light it gives lies on the floor as a 2:1 pool, the ring it tears loose with is 2:1 on the floor, and the
//     body takes its light while it is near.
// The character is the game's: pass it as `actor` ({ x, y, w, h, mask, pixels }, upright, feet at the origin): the
// effect draws no stand-in. If its death draws the body lying in a pose of its own, pass that too as `fallen` (the
// last frame of the death, same format): the outline flares on it and the motes leave it from its own pixels, head
// from head, feet from feet; without it the body is taken to lie as the upright one turned onto its side. 1 px = 1 character sprite px (32 x 16 px tiles).
import { Lights, P, Rng, fit, band, clamp, smooth, ease, rand, lerp, WHITE, luma, TAU } from "../../core/index.js";
import { bodyOf, rimOf } from "./_lib.js";
import { floorLight } from "../fire/_lib.js";
import { Fly3 } from "../_iso.js";

export const meta = {
  name: "Soul rise (iso)",
  desc: "spawn/soul-rise on the 2:1 floor, timed to a death: the fallen body's outline flares, its light streams up into a pale soul over it that rises, melts into a wisp and thins away.",
  tags: ["spawn", "death", "soul", "ghost", "spirit", "rise", "light", "one-shot", "iso", "top-down"],
  size: [136, 176],
  origin: [68, 146],
  duration: 3.7,
  loop: false,
  fps: 30,
  bg: "ground",
  actor: 2,
  pixels: 1,
  over: true,
  options: {
    palette: ["#101a33", "#1f3563", "#35609e", "#5c96d4", "#94c8f0", "#d2f0ff", "#ffffff"],
    height: 50,
    side: 0,
    land: 0.3,
    seed: 27,
  },
};

const FL = 0.5;

export function create(o) {
  const C = fit(o.palette, 7), R = new Rng(o.seed), s = Math.sign(o.side || 0), LAND = o.land, END = meta.duration;
  const FLARE = LAND + 0.3, GATHER = LAND + 0.25, LEAVE = LAND + 0.8, TOP = LEAVE + 1.25, GONE = TOP + 0.45;
  const body = bodyOf(o.actor, C), rim = rimOf(body), W = body.w, Hh = body.h, waist = Math.round(Hh * 0.6);
  // where a pixel of the upright body lies once he has fallen: turned over onto his side about his feet, resting on
  // the floor
  const lift = s ? Math.max(...body.list.map((b) => s * (b.x + 0.5))) : 0;
  const lying = (x, y) => (s ? [-s * (y + 0.5), s * (x + 0.5) - lift] : [x + 0.5, y + 0.5]);
  const F = o.fallen?.mask ? bodyOf(o.fallen, C) : null;
  let cx = s ? lying(0, body.y + Hh / 2)[0] : 0;   // the middle of the body where it lies
  if (F) cx = F.list.reduce((a, b) => a + b.x, 0) / F.list.length;
  // the soul: the body's own picture in pale light (each pixel's brightness picks a step of the ramp), upright over
  // where the body lies; every pixel gets there from its own place in the body, and goes out from the feet up
  const soul = body.list.map((b, i) => {
    const [lx, ly] = lying(b.x, b.y), my = b.my;
    return {
      lx, ly, gx: b.x + 0.5, gy: b.y + 0.5, my, edge: b.edge,
      tone: b.edge ? 6 : 3 + Math.min(2, Math.floor(luma(b.c) * 3.6)),
      at: GATHER + 0.08 + 0.32 * (1 - my / Hh) * 0.6 + rand(o.seed, i, 3) * 0.16,
      arc: R.range(8, 18) * (R.chance(0.5) ? 1 : -1) * 0.4,
      out: (1 - my / (Hh + 8)) * 0.85 + 0.15 * rand(o.seed, i, 7),
    };
  });
  let lyingRim = rim.map((c) => lying(c.x, c.y));
  if (F) {
    // pair the soul's pixels, head first, with the fallen body's, head end first (the head lies on the side it fell)
    const up = [...soul].sort((a, b) => a.gy - b.gy), down = [...F.list].sort((a, b) => (s || -1) * (b.x - a.x));
    up.forEach((q, i) => {
      const f = down[Math.min(down.length - 1, Math.floor((i * down.length) / up.length))];
      q.lx = f.x + 0.5;
      q.ly = f.y + 0.5;
    });
    lyingRim = rimOf(F).map((c) => [c.x + 0.5, c.y + 0.5]);
  }
  const fly = new Fly3({ rng: R, sparks: [WHITE, C[5], C[4], C[3]] }), lights = new Lights();
  let t = 0, tore = false;

  const rise = () => o.height * ease.inOutSine(clamp((t - LEAVE) / (TOP - LEAVE)));
  const sway = (row) => Math.sin(t * 3 - row * 0.12) * 2.2 * smooth(LEAVE, LEAVE + 0.5, t);
  const melt = () => smooth(LEAVE + 0.1, LEAVE + 0.9, t);
  const thin = () => smooth(TOP - 0.3, GONE, t);
  // where a pixel of the soul is now (its feet hover just over the body)
  const ghostAt = (q) => {
    const m = melt(), k = q.my >= waist ? (q.my - waist + 1) / (Hh - waist) : 0;
    const spine = sway(q.my) + Math.sin(q.my * 0.7 - t * 8) * 2 * k * m;
    // below the waist the legs drift in to the wisp's spine
    const x = cx + spine + q.gx * (1 - k * m * 0.85), y = q.gy - 3 - rise();
    return [x, y];
  };

  return {
    update(dt) {
      t += dt;
      if (!tore && t >= FLARE) {
        tore = true;
        lights.add(cx, -10, 50, C[4], 0.85, 0.55);
        lights.add(cx, -10, 24, WHITE, 0.8, 0.12);
        for (let i = 0; i < 10; i++) {
          const [x, y] = R.pick(lyingRim);
          fly.spawn(P.STAR, x, 0, -y, R.range(-20, 20), R.range(-8, 8), R.range(20, 60), R.range(0.4, 0.8), R.pick([WHITE, C[5]]), R.range(0.8, 1.8));
        }
      }
      // motes come off its edges as it rises, and pour off it as it goes out from the feet up
      if (t > LEAVE && t < GONE) {
        const th = thin();
        for (let n = 0; n < (th > 0 ? 3 : 1); n++) {
          if (!R.chance(th > 0 ? 0.9 : 0.45)) continue;
          const q = R.pick(soul);
          if (th > 0 && q.out < 1 - th * 1.2 - 0.05) continue;
          const [x, y] = ghostAt(q), life = Math.min(R.range(0.5, 1.1), END - 0.1 - t);
          if (life > 0.1) fly.spawn(R.chance(0.7) ? P.MOTE : P.STAR, x, 0, -y, R.range(-12, 12), R.range(-6, 6), R.range(25, 60), life, R.pick([WHITE, C[5], C[5], C[4]]), R.range(0.5, 1));
        }
      }
      fly.update(dt);
      lights.update(dt);
      fly.cap(Math.max(0.001, END - 0.05 - t));
    },
    drawBack(p) {
      // a pale pool on the floor round the body while the soul is near it, a ring across the floor as it tears loose
      const k = smooth(LAND, FLARE, t) * (1 - smooth(LEAVE + 0.3, TOP, t)), rx = s ? Hh * 0.6 + 6 : 16;
      if (k > 0) floorLight(p, cx, 0, rx, Math.max(6, rx * 0.4), C[4], 0.35 * k);
      ring(p, false);
    },
    draw(p) {
      // the body where it lies: its outline flares as the soul tears loose; it takes the soul's light while it's near
      if (t > LAND - 0.05 && t < FLARE + 0.3) {
        const k = t < FLARE ? (t - LAND + 0.05) / (FLARE - LAND + 0.05) : 1 - (t - FLARE) / 0.3;
        for (const [x, y] of lyingRim) if (rand(Math.floor(x), Math.floor(y), Math.floor(t * 30)) < 0.25 + 0.7 * k) p.px(x, y, k > 0.7 ? WHITE : C[5]);
        p.glow(cx, s ? -5 : -19, 26, C[4], 0.45 * k);
      }
      const lit = smooth(LAND, FLARE, t) * (1 - smooth(LEAVE, TOP - 0.2, t));
      if (lit > 0) for (const q of soul) if ((q.my & 1) === 0) p.light(q.lx, q.ly, C[4], 0.22 * lit);
      ring(p, true);
      motes(p);
      ghost(p);
      fly.draw(p);
      lights.draw(p);
    },
  };

  // the ring of light across the floor as it tears loose: far half behind the body, near half in front
  function ring(p, near) {
    const k = (t - FLARE) / 0.5;
    if (k > 0 && k < 1) band(p, cx, 0, 6 + 26 * ease.outCubic(k), FL, Math.max(1, 3 * (1 - k)), 1.15 - k, C, (g) => Math.sin(g) >= 0 === near, k < 0.12);
  }

  // the body's light streaming up out of it: each pixel's mote on an arc from where it lies to its place in the soul
  function motes(p) {
    if (t < GATHER || t > GATHER + 0.75) return;
    for (const q of soul) {
      const u = (t - (q.at - 0.3)) / 0.3;
      if (u < 0 || u >= 1) continue;
      const e = ease.inOutSine(u), [gx, gy] = ghostAt(q), x = lerp(q.lx, gx, e) + Math.sin(Math.PI * u) * q.arc, y = lerp(q.ly, gy, e) - Math.sin(Math.PI * u) * 6;
      p.dot(x, y, u > 0.7 ? WHITE : q.edge ? C[5] : C[4], 0.5 + 0.5 * u);
    }
  }

  // the soul: see-through, its rim solid; white as each pixel arrives; the legs gone to a wisp; going out from the feet
  function ghost(p) {
    if (t < GATHER || t > GONE + 0.1) return;
    const th = thin(), m = melt();
    for (const q of soul) {
      if (t < q.at) continue;
      if (th > 0 && q.out < th * 1.15 - 0.1 + 0.1 * rand(q.my, q.gx * 7, 5)) continue;
      const [x, y] = ghostAt(q), k = q.my >= waist ? (q.my - waist + 1) / (Hh - waist) : 0, a = 1 - k * 0.45 * m;
      if (t < q.at + 0.07) p.px(x, y, q.tone >= 6 ? C[5] : WHITE);
      else if (q.tone >= 5) p.dot(x, y, q.tone >= 6 ? WHITE : C[5], Math.min(1, a * 1.3) * (k > 0.5 && m > 0.5 && q.tone < 6 ? 0.7 : 1));
      else p.blend(x, y, C[q.tone], a * 0.7);
    }
    // the wisp under it: a thin trail that tapers to nothing, rippling
    const tail = Math.round(12 * m);
    if (tail > 1) {
      const base = Hh - 3 - rise() + body.y;
      for (let j = 0; j < tail; j++) {
        const u = j / tail, row = Hh + j, w = (1 - u) * 2.6 * m, x0 = cx + sway(row) + Math.sin(row * 0.7 - t * 8) * 2, y = base + j;
        if (th > 0.22 - 0.2 * u) continue;   // the wisp goes out with the feet, its tip first
        for (let d = -w; d <= w; d += 1) p.dot(x0 + d, y, Math.abs(d) > w - 1 ? C[5] : C[4], 0.8 - u * 0.5);
      }
    }
    const top = body.y - 3 - rise(), fade = smooth(GATHER, GATHER + 0.5, t) * (1 - th);
    p.glow(cx + sway(10), top + Hh * 0.45, 30, C[4], 0.42 * fade);
    p.glow(cx + sway(10), top + Hh * 0.45 - 6, 14, C[5], 0.3 * fade);
  }
}

export const actorAlpha = () => 1;
