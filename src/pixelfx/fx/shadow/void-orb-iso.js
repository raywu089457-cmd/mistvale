// Void orb for the game's 2:1 isometric camera: shadow/void-orb rewritten as an object floating over the floor the
// camera looks down on. The source's recipe is kept: a black sphere with a pale crawling rim, a lensed band of light
// lying across it, violet flame spat from it, a dark ring turning under it, a burst at the end. What changed:
//   - it hangs at chest height (h = 22 px, the hero is 38 px) above a floor point a little ahead along `aim`
//     (radians on the floor: 0 right, pi/2 down, pi left, -pi/2 up), so it reads as hovering over the caster's world;
//   - its shadow is a 2:1 ellipse under it and the ring of darkness it turns on the floor is drawn in the floor plane,
//     with solid violet wedges of light thrown down between the black arms of the ring;
//   - the black body is never lit: the disc is drawn over every glow and its cells have their light taken away;
//   - the rim is broken into a few arcs and a crescent glint rather than a ring, the way a black sphere catches a
//     little light, and the lensed band is thin so the body still reads as a solid black sphere;
//   - the burst splits in two, a flare at the orb and a ring racing out over the floor below it.
// Every fill is solid flat pixel art: no dithered alpha, no translucent dark wash, so at 1x the shapes read as clean
// masses (the same rule the rest of the shadow school follows). Glows and wisps may still be soft.
// 1 px = 1 character sprite px (32 x 16 px tiles).
import { fit, Rng, hash, smooth, seg, ease, TAU, WHITE, flare } from "../../core/index.js";
import { VOID, unlight } from "./_lib.js";
import { FLOOR } from "../_iso.js";

const D = 1.4;            // seconds
const ADV = 21;           // the aim point, this far ahead of the caster's feet
const H = 22;             // the orb floats at chest height
const R0 = 12.5;          // its radius
const BURST = 1.12;       // it comes apart here
const BURST_END = 1.36;

export const meta = {
  name: "Void Orb (iso)",
  desc: "shadow/void-orb as a map object: a black orb pulsing at chest height over the 2:1 floor, spitting violet wisps over a turning ring of darkness, then bursting.",
  tags: ["shadow", "void", "orb", "floating", "dark", "burst", "ground", "one-shot", "iso", "top-down"],
  size: [152, 114],
  origin: [76, 60],
  duration: D,
  loop: false,
  fps: 30,
  bg: "ground",
  pixels: 1,
  options: { palette: VOID, aim: 0, seed: 5 },
};

export function create(o) {
  const C = fit(o.palette, 8), S = o.seed | 0, aim = o.aim ?? 0;
  // the aim point on the floor and the orb above it
  const AX = Math.cos(aim) * ADV, AY = Math.sin(aim) * ADV * FLOOR;
  const BX = AX, BY = AY - H;
  const R = new Rng(hash(S, 29));
  // the wisps it spits: a direction, a reach and a wobble fixed at birth, so a frame is a closed-form function
  // of the clock; some are timed to the two gulps
  const W = Array.from({ length: 30 }, () => ({
    birth: R.chance(0.35) ? R.pick([0.44, 0.48, 0.52, 0.9, 0.94, 0.98]) : R.range(0.04, 1.06),
    life: R.range(0.26, 0.5),
    a: R.range(0, TAU),
    len: R.range(13, 30),
    ph: R.range(0, TAU),
    big: R.chance(0.3),
  }));
  let t = 0;
  const gulp = () =>
    Math.exp(-(((t - 0.5) / 0.07) ** 2)) + 0.9 * Math.exp(-(((t - 0.95) / 0.07) ** 2));
  const openK = () => 1 - ease.inCubic(seg(t, 1.05, 1.17));
  const pulse = () => 1 + 0.09 * Math.sin(t * TAU * 2.6) + 0.2 * gulp();

  return {
    update(dt) {
      t = Math.min(D, t + dt);
    },

    drawBack(p) {
      if (t >= D - 1e-6) return;
      const k = openK(), spin = t * 2.1, sc = 0.4 + 0.6 * k;
      // what it lays on the floor: the ring of darkness as two flat opaque 2:1 bands — a dark violet band round a
      // black heart. Solid edges and palette steps, because a translucent dark wash dithers into grain at 1x.
      const band = (r, c, edge) => p.ellipse(AX, AY, r * sc, r * FLOOR * sc, c, (d) => (d < edge ? 1 : 0));
      band(31, C[1], 0.94);
      band(16, C[0], 0.92);
      p.each(AX - 29, AY - 15, AX + 29, AY + 15, (x, y) => {
        const u = (x - AX) / 28, v = (y - AY) / 14, r = Math.hypot(u, v);
        if (r > 1.2) return;
        const th = Math.atan2(v, u);
        // the arms of the ring: solid violet wedges at three fixed steps, turning with the orb's light; they stay
        // narrow, so the ring still reads as darkness lit from above rather than a bright donut
        const arm = 0.5 + 0.5 * Math.cos(2 * (th + spin) - r * 6);
        const arm2 = 0.5 + 0.5 * Math.cos(5 * (th + spin * 1.4) + r * 3 + 1.2);
        const f = arm * (0.55 + 0.45 * arm2) * smooth(0.45, 0.68, r) * (1 - smooth(1.02, 1.14, r));
        if (k > 0.3 && f > 0.5) {
          p.px(x, y, f > 0.76 ? C[4] : f > 0.62 ? C[3] : C[2]);
          p.light(x, y, C[5], 0.17 * f * k);
        }
        // the ring's outer lip: one clean arc where the light catches, not a dotted band
        if (Math.abs(r - 0.95) * 28 < 1.15) {
          const q = 0.5 + 0.5 * Math.cos(2 * (th + spin) - 3.4);
          if (q > 0.62) p.px(x, y, q > 0.9 ? C[6] : q > 0.76 ? C[5] : C[4]);
        }
      });
      // the gulps shove a thin ring out across the floor: a smooth violet edge racing over the stone
      for (const t0 of [0.5, 0.95]) {
        const a = t - t0;
        if (a <= 0 || a > 0.3) continue;
        const q = a / 0.3, rr = 5 + 21 * ease.outCubic(q);
        const ra = 0.6 * (1 - q) * (1 - q) * k;
        p.each(AX - rr - 2, AY - (rr + 2) * FLOOR, AX + rr + 2, AY + (rr + 2) * FLOOR, (x, y) => {
          const e = Math.abs(Math.hypot(x - AX, (y - AY) / FLOOR) - rr);
          if (e > 1.1) return;
          p.blend(x, y, e < 0.5 ? C[6] : C[4], ra * (1 - e / 1.1));
        });
      }
    },

    draw(p) {
      if (t >= D - 1e-6) return;
      const k = openK(), Rr = R0 * pulse() * k;
      // the wisps: violet flame spat off the orb, each with a tail dragged back toward it
      if (k > 0.25) {
        for (const w of W) {
          const q = (t - w.birth) / w.life;
          if (q < 0 || q >= 1) continue;
          const e = ease.outCubic(q), fade = Math.min(1, q * 7) * (1 - smooth(0.6, 1, q)) * k;
          if (fade <= 0.03) continue;
          const rad = Rr * 0.85 + (w.len - Rr * 0.85) * e;
          const x = BX + Math.cos(w.a) * rad + Math.sin(q * 4 + w.ph) * 2.5 * e;
          let y = BY + Math.sin(w.a) * rad - 6 * e * e;
          if (Math.sin(w.a) > 0.35 && y > AY - 1) y = AY - 1;
          // the tail points home, so the speck reads as spat out rather than dropped there
          const dx = BX - x, dy = BY - y, d = Math.hypot(dx, dy) || 1;
          const big = w.big ? 1 : 0;
          p.blend(x, y, C[4], 0.5 * fade);
          p.px(x - (dx / d) * 1.6, y - (dy / d) * 1.6, q < 0.5 ? C[5] : C[4]);
          p.px(x - (dx / d) * 3.2, y - (dy / d) * 3.2, C[3]);
          p.px(x, y, q < 0.35 ? C[7] : C[6]);
          if (big) { p.px(x + 1, y, C[6]); p.px(x, y - 1, C[6]); p.px(x - (dx / d) * 4.6, y - (dy / d) * 4.6, C[4]); }
          p.glow(x, y, 3, C[5], 0.12 * fade);
        }
      }
      // the body: violet light around it, then the black orb over that, unlit, with the lensed band and a broken rim
      if (Rr > 0.5) {
        p.glow(BX, BY, 22, C[4], 0.26 * k);
        p.glow(BX, BY, 11, C[5], 0.2 * k);
        p.disc(BX, BY, Rr, C[0], 1);
        unlight(
          p, BX - Rr - 1, BY - Rr - 1, BX + Rr + 1, BY + Rr + 1,
          (x, y) => (x - BX) ** 2 + (y - BY) ** 2 < Rr * Rr * 1.02,
          0.02,
        );
        // the event-horizon band: a thin lensed arc of light lying across the lower part of the black. Solid core
        // line, a smooth fall-off into the dark either side, so it reads as a line of light rather than a dither band
        p.each(BX - Rr * 0.95, BY + Rr * 0.26 - Rr * 0.2, BX + Rr * 0.95, BY + Rr * 0.26 + Rr * 0.2, (x, y) => {
          const d = Math.hypot((x - BX) / (Rr * 0.9), (y - BY - Rr * 0.26) / (Rr * 0.16));
          if (d > 1) return;
          if (d > 0.82) p.px(x, y, C[6]);
          else p.blend(x, y, d > 0.5 ? C[5] : C[4], d > 0.5 ? 0.5 : 0.26);
        });
        // the ring's light caught on the underside of the sphere, so it reads round rather than flat black
        p.each(BX - Rr * 0.55, BY + Rr * 0.44, BX + Rr * 0.55, BY + Rr * 0.84, (x, y) => {
          const d = Math.hypot((x - BX) / (Rr * 0.5), (y - BY - Rr * 0.64) / (Rr * 0.18));
          if (d < 1) p.blend(x, y, C[2], 0.45 * (1 - smooth(0.4, 1, d)));
        });
        p.px(BX - Rr * 0.86, BY + Rr * 0.3, WHITE);
        p.px(BX + Rr * 0.86, BY + Rr * 0.3, C[6]);
        // a crescent glint on the upper-left, the side the light comes from
        p.each(BX - Rr - 2, BY - Rr - 2, BX + Rr + 2, BY + Rr + 2, (x, y) => {
          const dx = x - BX, dy = y - BY, d = Math.hypot(dx, dy);
          if (d < Rr - 0.4 || d > Rr + 1.1) return;
          const an = Math.atan2(dy, dx);
          const g = smooth(-2.95, -2.45, an) * (1 - smooth(-1.95, -1.45, an));
          if (g <= 0.05) return;
          p.px(x, y, g > 0.85 ? WHITE : g > 0.5 ? C[7] : C[6]);
          // thicker where the light lands square on the sphere, so the crescent has body
          if (g > 0.55) p.px(BX + Math.cos(an) * (Rr - 1.4), BY + Math.sin(an) * (Rr - 1.4), C[6]);
        });
        // the rest of the rim: solid short arcs, mostly violet, only the high notes pale
        p.each(BX - Rr - 2, BY - Rr - 2, BX + Rr + 2, BY + Rr + 2, (x, y) => {
          const dx = x - BX, dy = y - BY, d = Math.hypot(dx, dy);
          if (d < Rr - 0.2 || d > Rr + 0.9) return;
          const an = Math.atan2(dy, dx);
          if (an > -3.0 && an < -1.4) return; // the glint owns the upper-left
          const h = 0.5 + 0.5 * Math.cos(3 * an + t * 5 + 0.7), h2 = 0.5 + 0.5 * Math.cos(5 * an - t * 3.5);
          const q = 0.55 * h + 0.45 * h2;
          if (q < 0.7) return;
          p.px(x, y, q > 0.94 ? C[7] : q > 0.86 ? C[6] : C[5]);
        });
      }
      // the burst: it comes apart into a flare at the orb and a ring racing out over the floor below
      const bt = seg(t, BURST, BURST_END);
      if (bt > 0 && bt < 1) {
        const fade = Math.pow(1 - bt, 1.4), out = ease.outCubic(bt);
        const core = 1 - smooth(0, 0.34, bt); // the white heart of the burst
        if (core > 0.02) p.disc(BX, BY, 1 + 9 * (1 - core), (d) => (d < 0.55 ? WHITE : C[7]), 1);
        flare(p, BX, BY, 8 + 30 * out, 0.95 * fade, C);
        p.glow(BX, BY, 10 + 28 * out, C[5], 0.6 * fade);
        p.glow(BX, BY, 5 + 10 * out, C[7], 0.55 * fade);
        // the floor ring: three solid steps of colour in a clean band, so it reads as one ring of light
        const rr = 6 + 30 * out, wd = 1.8 + 2 * (1 - bt) + 1.2;
        p.each(AX - rr - wd, AY - (rr + wd) * FLOOR, AX + rr + wd, AY + (rr + wd) * FLOOR, (x, y) => {
          const q = (Math.hypot(x - AX, (y - AY) / FLOOR) - (rr - wd)) / (2 * wd);
          if (q < 0 || q > 1) return;
          p.px(x, y, q < 0.24 ? WHITE : q < 0.52 ? C[7] : q < 0.8 ? C[6] : C[5]);
        });
        // sparks thrown down onto the floor
        for (let i = 0; i < 20; i++) {
          const a = (i / 20) * TAU + 0.3, d = 4 + 22 * out * (0.5 + 0.5 * Math.sin(i * 1.9));
          const px = AX + Math.cos(a) * d, py = AY + Math.sin(a) * d * FLOOR;
          p.px(px, py, i % 3 ? C[6] : WHITE);
          p.blend(px, py - 1, C[4], 0.5 * fade);
        }
      }
    },
  };
}
