// Floor projections: take any effect authored for a side view and lay its picture on the ground a 2:1
// isometric camera sees. This is a projection, not a redraw and not a second recipe: the source effect is
// rendered exactly as authored, into its own frame, and that picture is squashed about the feet and written
// back out. So it works on any effect, the source keeps its quality, palette, options and timing, and if the
// source changes the projection follows.
//
//   import { createFrame, clearFrame, createFx, composite, projectEffect } from "pixelfx";
//   import * as meteor from "pixelfx/fx/fire/meteor";
//   const fx = createFx(projectEffect(meteor, { flat: 0.5 }), { x: 160, y: 120 });
//
// `flat` is the projection angle: 0.5 is the floor's 2:1 squash, 1 leaves the picture upright (a billboard),
// in between tilts it. It is the one knob, and it can also be set per instance: { flat: 0.7 }.
//
// A projection also has to enter the scene the way a real thing would, and it must never do it by scaling: a
// picture that grows out of the floor line as the squash unwinds reads as a stretched sprite. The entrance and the
// exit are therefore move-only (a column falls in and lifts off), gate-only (a floor burst opens from its centre
// and closes again) or opacity-only (a plain fade). Which one an effect uses is up to it, and can be forced with
// `enter`; the no-scale rule below is the only thing that is not negotiable.
import { createFrame, clearFrame, createFx } from "./fx.js";
import { clamp } from "./math.js";
import { hex } from "./color.js";

// The one general rule: a projection is drawn at 1 px = 1 px of the character sprites. Our floor is made of
// 32 x 16 px tiles and every actor, prop and effect on it is authored at that same density, so an effect that is
// scaled to look bigger immediately reads as a different, coarser game. projectLayer therefore never resamples
// horizontally and never upscales; to cover more ground, author the source bigger (or draw more of it), and never
// scale it at spawn. TILE is the only place that size is written down.
export const TILE = [32, 16];

const TAU = Math.PI * 2;
const LUMA = (c) => ((c & 255) * 299 + ((c >>> 8) & 255) * 587 + ((c >>> 16) & 255) * 114) / 1000;
const EASE = (x) => x * x * (3 - 2 * x);                       // no jolt at either end
const HASH = (i) => { const s = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s); };
const DUST = hex("#6f5a45"), DUST2 = hex("#8d7d68"), DUST3 = hex("#b0a08a");

/** The projected length of a description, without running past what the catalog likes. */
const DESC_MAX = 178;

/**
 * How an effect should enter, from what it is. This is only a default: any style can be forced on any effect, and
 * the only rule is that nothing may be scaled. Things that stand up (columns, beams, storms) fall in from above
 * and lift off again — a tall picture that appears in place is exactly the "it grew out of the floor" look.
 * Everything else dissolves: a reveal front would cut a picture that already blooms in its own frames in half,
 * while a fade never touches the geometry.
 */
export function enterStyle(tags = [], size = null) {
  const s = (Array.isArray(tags) ? tags.join(" ") : String(tags ?? "")).toLowerCase();
  if (/(tornado|vortex|whirl|cyclone|column|plume|beam|lightning|bolt|meteor|comet|storm|cloud)/.test(s)) return "drop";
  if (size && size[1] >= size[0] * 1.15) return "drop";
  return "fade";
}

/**
 * Lay one rendered layer on the floor. Destination rows are gathered: when the squash packs several source rows
 * into one, the strongest pixel is kept (highest alpha, then the brightest), so sparks and hot cores survive the
 * minification instead of averaging into mud. Light keeps its strongest value, and translucent pixels carry
 * their own alpha into the frame instead of being forced solid.
 *
 * `o` is the entrance transform: `dy` shifts the picture by whole rows (a thing in the air), `reveal(x, y)` is
 * asked about each destination pixel in world units — returning false leaves it unwritten, which is how a picture
 * rises out of the floor or spreads out along it without ever being resampled — and `alpha` dissolves it in or out
 * without touching its geometry.
 */
export function projectLayer(p, f, flat, ox, oy, o = {}) {
  const [W, H] = [f.w, f.h];
  const dst = new Int32Array(H);
  let lo = Infinity, hi = -Infinity;
  for (let sy = 0; sy < H; sy++) {
    const r = Math.round(flat * (sy + 0.5 - oy));
    dst[sy] = r;
    if (r < lo) lo = r;
    if (r > hi) hi = r;
  }
  // 1:1 horizontally, rows only gather under the squash: nothing is ever resampled up or down
  const rows = hi - lo + 1;
  if (!isFinite(rows) || rows <= 0 || rows > H + 2) return;
  const plane = new Array(rows * W).fill(0), glow = new Array(rows * W).fill(0);
  for (let sy = 0; sy < H; sy++) {
    const base = (dst[sy] - lo) * W;
    for (let sx = 0; sx < W; sx++) {
      const i = base + sx;
      const c = f.color[sy * W + sx], l = f.light[sy * W + sx] & 0xffffff;
      if (l && LUMA(l) > LUMA(glow[i])) glow[i] = l;
      if (!c) continue;
      const a = c >>> 24, old = plane[i];
      if (!old || a > (old >>> 24) || (a === (old >>> 24) && LUMA(c) > LUMA(old))) plane[i] = c;
    }
  }
  const dy = o.dy | 0, reveal = o.reveal, al = o.alpha == null ? 1 : Math.max(0, Math.min(1, o.alpha));
  // rows are measured from the feet (which is where the painter's origin sits), and a canvas may carry headroom
  // above that origin so a dropped picture has sky to fall through; the clip is given in the same feet-relative
  // rows so the reveal gates and the picture never disagree about where the floor is
  const minRow = o.minRow ?? 0, maxRow = o.maxRow ?? H - 1;
  for (let r = 0; r < rows; r++) {
    const ly = lo + r + dy;
    for (let sx = 0; sx < W; sx++) {
      const i = r * W + sx, c = plane[i], l = glow[i];
      if (!c && !l) continue;
      const x = sx - ox;
      if (ly < minRow || ly > maxRow) continue; // a picture lifted off the floor leaves the frame, it does not paint outside it
      if (reveal && !reveal(x, ly)) continue;
      if (c) p.px(x, ly, al >= 1 ? c : ((c & 0xffffff) | (Math.round(((c >>> 24) & 255) * al) << 24)));
      if (l) p.light(x, ly, l, al);
    }
  }
}

/**
 * Wrap an effect module as its own floor projection: returns a module-like { meta, create } that `createFx`
 * accepts. The meta is the source's, with an "(iso)" name, a line about the projection, `projection: true` and
 * a `flat` option; the canvas and pivot are untouched, so it drops in wherever the source did.
 *
 * `enter` and `exit` say how it arrives and leaves: "drop", "rise", "spread", "fade", "none", or "auto". They are
 * normally written by tools/iso.mjs from the source's own frames (see tools/lib/motion.mjs) rather than guessed
 * from tags, because the physical design belongs to the effect: a column climbs, a burst opens, a torch is already
 * burning. `exit` may also be "same", which reverses the entrance. Neither ever scales the picture — only its
 * position, its opacity or its footprint gate.
 */
export function projectEffect(mod, opts = {}) {
  const SRC = mod.meta;
  if (!SRC) throw new Error("projectEffect: the effect has no meta");
  // the rule is not negotiable: a projection is never scaled, so there is no scale to pass
  for (const k of ["scale", "zoom", "pixelScale"]) if (opts[k] != null && opts[k] !== 1) throw new Error(`projectEffect: ${k} is not allowed — a projection is 1:1 with the character sprites; author the source bigger instead`);
  const W = SRC.size[0], H = SRC.size[1], OX = SRC.origin[0], OY = SRC.origin[1];
  const flat0 = clamp(opts.flat ?? 0.5, 0.05, 1);
  const enter0 = opts.enter ?? "auto", exit0 = opts.exit ?? "auto";
  const STYLES = ["drop", "rise", "spread", "fade", "none"], EXITS = [...STYLES, "same"];
  if (enter0 !== "auto" && !STYLES.includes(enter0)) throw new Error(`projectEffect: enter "${enter0}" is not one of auto, drop, rise, spread, fade, none`);
  if (exit0 !== "auto" && !EXITS.includes(exit0)) throw new Error(`projectEffect: exit "${exit0}" is not one of auto, same, drop, rise, spread, fade, none`);
  // a thing that falls in needs sky to fall through: the canvas keeps headroom above the floor for it, and the
  // pivot moves down with the picture so it still stands on the same tile
  const style0 = enter0 !== "auto" ? enter0 : enterStyle(SRC.tags, SRC.size);
  const exitStyle0 = exit0 === "auto" ? (style0 === "none" ? "none" : "same") : exit0;
  const falls = style0 === "drop" || exitStyle0 === "drop" || (exitStyle0 === "same" && style0 === "drop");
  const PAD = falls ? Math.round(H * 0.5) + 8 : 0;
  const desc = `${SRC.desc ?? ""} Projected onto a 2:1 isometric floor.`;
  return {
    meta: {
      ...SRC,
      name: `${SRC.name} (iso)`,
      desc: desc.length <= DESC_MAX ? desc : `${(SRC.desc ?? "").slice(0, DESC_MAX - 40).trim()}. Projected onto a 2:1 isometric floor.`,
      tags: [...new Set([...(SRC.tags ?? []), "iso", "top-down"])],
      size: [W, H + PAD],
      origin: [OX, OY + PAD],
      projection: true,
      pixels: 1,                                    // 1 px = 1 sprite px, always
      tiles: [+(SRC.size[0] / TILE[0]).toFixed(1), +((SRC.size[1] + PAD) / TILE[1]).toFixed(1)],   // how much floor it covers
      options: { ...(SRC.options ?? {}), flat: flat0, enter: enter0, exit: exit0 },
    },
    create(o = {}) {
      const flat = clamp(o.flat ?? flat0, 0.05, 1);
      const style = o.enter && o.enter !== "auto" ? o.enter : style0;
      const exitChosen = o.exit ?? exit0;
      const exitStyle = exitChosen === "auto" ? exitStyle0 : exitChosen;
      const inst = createFx(mod, { ...o, x: OX, y: OY });
      const back = createFrame(W, H), front = createFrame(W, H);
      const dur = SRC.duration, tin = Math.min(0.55, Math.max(0.24, dur * 0.3)), tout = Math.min(0.5, Math.max(0.22, dur * 0.28));
      const DROP = PAD;                                                 // as far above the floor as the canvas allows
      const RISE = Math.round(H * flat + 18);
      const SPREAD = Math.round(W * 0.62) + 4;
      let stamped = -1;
      // the source is rendered once per tick into its own frames; both layers are projected from those
      const stamp = () => {
        if (stamped === inst.t) return;
        stamped = inst.t;
        clearFrame(back);
        clearFrame(front);
        inst.draw(back, "back");
        inst.draw(front, "front");
      };
      // the entrance and the exit are the same physical move: a column falls in and later lifts off, a floor
      // burst opens from its centre and later closes, everything else rises out of the ground and settles back
      const phase = (t) => {
        let dy = 0, reveal = null, dust = 0, alpha = 1;
        const k = clamp(t / tin), out = clamp((t - (dur - tout)) / tout);
        if (style === "drop") {
          if (k < 1) dy = -Math.round(DROP * (1 - k * k));              // gravity: slow start, fast landing
          if (t >= tin) dust = Math.min(1, (t - tin) / 0.42);
        } else if (style === "rise") {
          if (k < 1) { const top = 10 - RISE * EASE(k); reveal = (x, y) => y >= top + 6 * Math.sin(x * 0.17 + 1.3) + 3 * Math.sin(x * 0.43); }
          dust = Math.min(1, t / 0.38);
        } else if (style === "spread") {
          if (k < 1) { const R = SPREAD * EASE(k); reveal = (x, y) => Math.hypot(x, y * 2) <= R; }
          dust = Math.min(1, t / 0.38);
        } else if (style === "fade") {
          alpha = EASE(k); dust = Math.min(1, t / 0.38);
        }
        if (out > 0 && exitStyle !== "none") {
          const m = EASE(out), es = exitStyle === "same" ? style : exitStyle;
          if (es === "drop") dy = -Math.round(DROP * 0.85 * m);         // it lifts off the way it came
          else if (es === "rise") { const top = 10 - RISE * (1 - m); const r0 = reveal; reveal = (x, y) => (!r0 || r0(x, y)) && y >= top + 6 * Math.sin(x * 0.17 + 1.3) + 3 * Math.sin(x * 0.43); }
          else if (es === "spread") { const R = SPREAD * (1 - m); const r0 = reveal; reveal = (x, y) => (!r0 || r0(x, y)) && Math.hypot(x, y * 2) <= R + 2; }
          else if (es === "fade") alpha = Math.min(alpha, 1 - m);
          dust = Math.max(dust, m);
        }
        return { dy, reveal, dust, alpha };
      };
      // dust is drawn, not faded in: it is thrown up where the thing meets the floor, so it belongs to the ground
      const dust = (p, d) => {
        if (d <= 0 || d >= 1) return;
        const a = (1 - d) * (1 - d), R = 10 + 44 * d;
        for (let i = 0; i < 46; i++) {
          const th = (i / 46) * TAU + i * 0.61, rr = R * (0.45 + 0.55 * HASH(i + 3));
          const x = Math.cos(th) * rr, y = Math.sin(th) * rr * 0.5 - 1 - 5 * d;
          p.dot(x, y, i % 3 ? DUST : DUST2, a * (0.28 + 0.5 * HASH(i + 11)));
        }
        for (let i = 0; i < 4; i++) p.blend((i - 1.5) * 8 * d, -3 - 2 * d, i ? DUST2 : DUST3, a * 0.16);
      };
      return {
        update(dt) {
          inst.update(dt);
        },
        drawBack(p) {
          stamp();
          const ph = phase(inst.t);
          dust(p, ph.dust);
          projectLayer(p, back, flat, OX, OY, { ...ph, minRow: -(OY + PAD), maxRow: H - OY - 1 });
        },
        draw(p) {
          stamp();
          projectLayer(p, front, flat, OX, OY, { ...phase(inst.t), minRow: -(OY + PAD), maxRow: H - OY - 1 });
        },
      };
    },
  };
}
