// Live procedural pixelfx runtime for Mistvale (Phase 2A+).
// Mirrors sprites.html#playground: CQ FX look single-pass repaint (compositeCq),
// dirty-rect blitBox rendering, dual back/front layering, real unit actor silhouettes,
// directional ahead-offset compensation, and 3-tier priority capping.
import { core, CQ_LOOK, compositeCq, LIVE_FX_MODS } from './pixelfx/registry.js';

export const ISO_PX = 21 / 67;   // 1 pixelfx art px = 21/67 Mistvale world units (67px hero = 21u)
export const LIVE_FX_IDS = Object.freeze(Object.keys(LIVE_FX_MODS));

// Per-effect scale tune so thin slashes/sparks read crisply on bright grass/snow while big AoEs stay balanced.
const LIVE_TUNE = Object.freeze({
  'impacts/hit-spark-iso': 1.55,
  'impacts/blade-hit-iso': 1.6,
  'impacts/void-hit-iso': 1.45,
  'impacts/nature-hit-iso': 1.45,
  'impacts/finisher-crash-iso': 1.15,
  'impacts/ground-slam-iso': 1.1,
  'melee/sword-slash-iso': 1.45,
  'melee/whirlwind-iso': 1.35,
  'melee/heavy-cleave-iso': 1.4,
  'melee/thrust-iso': 1.45,
  'melee/claw-swipe-iso': 1.45,
  'melee/double-slash-iso': 1.45,
  'melee/uppercut-iso': 1.45,
  'melee/dagger-flurry-iso': 1.5,
  'melee/spear-sweep-iso': 1.4,
  'melee/whip-crack-iso': 1.35,
  'melee/hammer-smash-iso': 1.25,
  'melee/scythe-reap-iso': 1.4,
  'ice/ice-spikes-iso': 1.15,
  'nature/earth-spike-iso': 1.15,
  'nature/leaf-storm-iso': 1.25,
  'nature/tornado-iso': 1.15,
  'scifi/warp-iso': 1.15,
  'holy/divine-shield-iso': 1.15,
  'holy/heal-aoe-iso': 1.15,
  'holy/holy-pillar-iso': 1.15,
  'holy/smite-iso': 1.35,
  'holy/resurrection-iso': 1.2,
  'arcane/magic-circle-cast-iso': 1.15,
  'fire/cinder-cyclone-iso': 1.05,
  'spawn/soul-rise-iso': 1.3,
});

export function liveTuneOf(fxId) {
  return LIVE_TUNE[fxId] || 1;
}

// Convert a Mistvale world delta (dx, dz) to pixelfx 2:1 floor space (fx, fz, aim, dir).
// Mistvale iso: ix = (dx - dz) * 9, iy = (dx + dz) * 4.5. Pixelfx floor projects (fx, fz) -> (fx, fz * 0.5).
// Dividing by (ISO_PX * tune) guarantees screen-pixel exact target/warp alignment at any tune!
export function worldToFxRel(dx, dz, tune = 1) {
  const k = 9 / (ISO_PX * (tune || 1));
  const x = (dx - dz) * k;
  const z = (dx + dz) * k;
  const aim = (dx === 0 && dz === 0) ? 0 : Math.atan2(z, x);
  const dir = ((Math.round(aim / (Math.PI / 4)) % 8) + 8) % 8;
  return { x, z, aim, dir };
}

// Built-in forward floor offset (art px along `aim`) for target-anchored effects whose module places
// the impact ADV/REACH px ahead of its own origin. Shifting the blit origin backward by this amount
// lands the visual impact dead-center on the target at ANY cast range!
const AHEAD_PX = Object.freeze({
  'nature/boulder-iso': 92,
  'shadow/life-steal-iso': 64,
  'shadow/dark-explosion-iso': 54,
  'shadow/soul-drain-iso': 52,
  'shadow/shadow-flames-iso': 50,
  'shadow/eclipse-iso': 30,
  'shadow/black-hole-iso': 26,
  'shadow/void-orb-iso': 21,
  'shadow/hex-sigil-iso': 18,
  'shadow/grasping-hands-iso': 18,
  'shadow/shadow-tendrils-iso': 18,
  'shadow/necro-skulls-iso': 15,
});

// Effects whose art always lashes to +x regardless of o.aim; mirror horizontally when aiming left.
const FLIP_BY_AIM = new Set(['nature/vine-whip-iso']);

// Valid humanoid fallback silhouette (18x34, feet at (0,0)) so actor-based FX never crash or collapse to floor.
const DEFAULT_ACTOR = (() => {
  const w = 18, h = 34;
  const data = new Uint8Array(w * h);
  const pixels = new Uint32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const head = Math.hypot((x - w / 2 + 0.5) / 5.2, (y - 7) / 6.2) <= 1;
      const torso = Math.hypot((x - w / 2 + 0.5) / 6.8, (y - 22) / 12.2) <= 1 && y >= 11;
      if (head || torso) {
        data[y * w + x] = 1;
        pixels[y * w + x] = 0xff78869a;
      }
    }
  }
  return Object.freeze({ x: -Math.round(w / 2), y: -h, w, h, mask: Object.freeze({ w, h, data }), pixels });
})();

const LOOK_FULL = Object.freeze({ ...CQ_LOOK, block: 1 });
const LOOK_FAST = Object.freeze({ ...CQ_LOOK, block: 1, clean: 0 });
const LOOK_RAW  = Object.freeze({ style: false });

// Effects whose pixelfx source expects an actor silhouette (mask + pixels, feet at origin).
const NEEDS_ACTOR = new Set([
  'scifi/warp-iso', 'ice/freeze-iso', 'holy/divine-shield-iso', 'holy/holy-pillar-iso', 'holy/smite-iso',
  'holy/resurrection-iso', 'spawn/soul-rise-iso', 'lightning/charge-up-iso', 'nature/healing-bloom-iso',
  'nature/leaf-storm-iso', 'nature/root-snare-iso',
  'status/bleeding', 'status/burning', 'status/charmed', 'status/confused', 'status/cursed',
  'status/frozen', 'status/petrified', 'status/poisoned', 'status/sleep', 'status/slowed', 'status/stunned',
]);

// Looping effects get an explicit fade-out duration when cast as one-shot skills.
const DEFAULT_LIFE = Object.freeze({
  'nature/leaf-storm-iso': 2.2,
  'nature/poison-cloud-iso': 3.8,
  'nature/tornado-iso': 2.0,
  'nature/toxic-puddle-iso': 3.8,
  'scifi/force-field-iso': 3.6,
});

export function hasLiveFx(id) {
  return !!LIVE_FX_MODS[id];
}

export function createLiveFxPool({ mobile = false, onDirty = null, onRelease = null } = {}) {
  const blasts = [];
  const statusAnchors = new Map();   // unitKey -> { b, fxId, seenTick, stamp, doneOnce }
  const BLAST_CAP = mobile ? 8 : 12;
  const SPARK_CAP = mobile ? 3 : 5;
  const STATUS_CAP = mobile ? 6 : 10;
  const MAIN_CAP = mobile ? 6 : 10;

  let frameParity = 0;
  let quality = mobile ? 1 : 0;   // 0=CQ full, 1=CQ fast, 2=staggered CQ fast, 3=raw composite
  let lookOn = true;
  let drawnCount = 0;
  let lastDraw = null;
  const seenIds = new Set();

  const rankOf = b => (b.rank ?? (b.spark ? 0 : b.isStatus ? 1 : 2));
  const dropAt = idx => {
    const rem = blasts.splice(idx, 1)[0];
    if (!rem) return null;
    if (rem.unitKey) {
      const entry = statusAnchors.get(rem.unitKey);
      if (entry && entry.b === rem) {
        if (!rem.loop) entry.b = null, entry.doneOnce = true;
        else statusAnchors.delete(rem.unitKey);
      }
    }
    if (onRelease) { onRelease(rem.cvB); onRelease(rem.cvF); }
    return rem;
  };

  function blit(fr, data) {
    if (!lookOn || quality >= 3) return compositeCq(fr, data, LOOK_RAW);
    return compositeCq(fr, data, quality === 0 ? LOOK_FULL : LOOK_FAST);
  }

  function trim() {
    let sp = 0, st = 0;
    for (const b of blasts) { if (b.spark) sp++; else if (b.isStatus) st++; }
    while (sp > SPARK_CAP) {
      const i = blasts.findIndex(b => b.spark); if (i < 0) break;
      dropAt(i); sp--;
    }
    while (st > STATUS_CAP) {
      const i = blasts.findIndex(b => b.isStatus); if (i < 0) break;
      dropAt(i); st--;
    }
    while (blasts.length > BLAST_CAP + STATUS_CAP) {
      const i = blasts.findIndex(b => rankOf(b) < 2); if (i < 0) break;
      dropAt(i);
    }
    let mains = 0;
    for (const b of blasts) if (rankOf(b) === 2) mains++;
    while (mains > MAIN_CAP) {
      const i = blasts.findIndex(b => rankOf(b) === 2); if (i < 0) break;
      dropAt(i); mains--;
    }
  }

  function spawn(fxId, x, z, opts = {}) {
    if (typeof document === 'undefined') return null;
    const mod = LIVE_FX_MODS[fxId];
    if (!mod?.meta) return null;
    const [w, h] = mod.meta.size, [ox, oy] = mod.meta.origin;
    const cvF = document.createElement('canvas'), cvB = document.createElement('canvas');
    cvF.width = cvB.width = w; cvF.height = cvB.height = h;
    const cF = cvF.getContext('2d'), cB = cvB.getContext('2d');
    if (!cF || !cB) return null;

    const actorObj = opts.actor || (NEEDS_ACTOR.has(fxId) ? DEFAULT_ACTOR : undefined);
    const fxOpts = {
      x: ox, y: oy,
      seed: opts.seed ?? (1 + (Math.abs(Math.round(x * 13 + z * 7)) % 11)),
      ...(actorObj ? { actor: actorObj } : {}),
      ...(opts.fxOpts || {}),
    };
    let fx;
    try { fx = core.createFx(mod, fxOpts); } catch { return null; }

    const isStatus = fxId.startsWith('status/') || !!opts.isStatus;
    const life = opts.life ?? (isStatus ? Infinity : (DEFAULT_LIFE[fxId] ?? 0));
    const aim = typeof fxOpts.aim === 'number' ? fxOpts.aim : 0;
    const aheadPx = opts.aheadPx ?? (opts.casterAnchored ? 0 : (AHEAD_PX[fxId] || 0));
    const flipX = opts.flipX ?? (FLIP_BY_AIM.has(fxId) && Math.cos(aim) < 0);
    const b = {
      id: fxId, x, z, ox, oy, w, h,
      cvF, cF, frameF: core.createFrame(w, h), dataF: cF.createImageData(w, h), bbF: null,
      cvB, cB, frameB: core.createFrame(w, h), dataB: cB.createImageData(w, h), bbB: null,
      fx, delay: Math.max(0, opts.delay || 0), until: life || Infinity,
      spark: !!opts.spark, isStatus, loop: !!mod.meta.loop,
      rank: opts.rank ?? (opts.spark ? 0 : isStatus ? 1 : 2),
      tune: (LIVE_TUNE[fxId] || 1) * (opts.tune || 1),
      dy: opts.dy || 0, over: !!mod.meta.over,
      aim, aheadPx, flipX,
      splitPart: fxId === 'fire/cinder-cyclone-iso',
      unitKey: opts.unitKey || null,
      seenFrame: frameParity,
    };
    blasts.push(b);
    trim();
    return b;
  }

  // Keep status/* marks synced on active units without respawning every frame.
  // Non-looping statuses (e.g. status/petrified) play once per `stamp` and do not restart mid-buff.
  let syncTick = 0;
  function syncUnitStatus(unitKey, statusId, x, z, opts = {}) {
    const fxId = `status/${statusId}`;
    const mod = LIVE_FX_MODS[fxId];
    if (!mod) return;
    const key = `${unitKey}:${statusId}`;
    const stamp = opts.stamp ?? 0;
    const existing = statusAnchors.get(key);
    if (existing) {
      if (existing.b && blasts.includes(existing.b)) {
        existing.b.x = x; existing.b.z = z; existing.seenTick = syncTick;
        return;
      }
      if (existing.doneOnce && existing.stamp === stamp) {
        existing.seenTick = syncTick;
        return;
      }
    }
    const b = spawn(fxId, x, z, {
      isStatus: true, rank: 1,
      tune: opts.tune || 1.45,
      dy: opts.dy ?? 0,
      actor: opts.actor || DEFAULT_ACTOR,
      unitKey: key,
    });
    if (b) statusAnchors.set(key, { b, fxId, seenTick: syncTick, stamp, doneOnce: false });
  }

  function beginStatusSync() { syncTick++; }
  function endStatusSync() {
    for (const [key, entry] of statusAnchors) {
      if (entry.seenTick !== syncTick) {
        if (entry.b && blasts.includes(entry.b)) {
          entry.b.fx.stop();
          entry.b.until = Math.min(entry.b.until, entry.b.fx.t + 0.15);
        }
        statusAnchors.delete(key);
      }
    }
  }

  function step(dt) {
    if (!blasts.length) return;
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    frameParity ^= 1;
    const cDt = Math.min(0.05, Math.max(0.001, dt || 1 / 30));
    let bi = 0;
    for (let i = blasts.length - 1; i >= 0; i--) {
      const b = blasts[i];
      if (b.delay > 0) { b.delay -= cDt; continue; }
      try { b.fx.update(cDt); } catch { dropAt(i); continue; }
      if (b.until !== Infinity && b.fx.t > b.until) b.fx.stop();
      if (b.fx.done()) {
        dropAt(i);
        continue;
      }
      const stagger = (mobile || quality >= 2) && b.fx.t > 1 / 30 && ((bi + frameParity) & 1) === 1;
      bi++;
      if (stagger) continue;
      core.clearFrame(b.frameB);
      core.clearFrame(b.frameF);
      try {
        if (b.splitPart) {
          const prev = b.fx.options.part;
          b.fx.options.part = 'floor'; b.fx.draw(b.frameB, 'front');
          b.fx.options.part = 'air';   b.fx.draw(b.frameF, 'front');
          b.fx.options.part = prev;
        } else {
          b.fx.draw(b.frameB, 'back');
          b.fx.draw(b.frameF, 'front');
        }
      } catch {
        dropAt(i);
        continue;
      }
      b.bbB = blit(b.frameB, b.dataB.data);
      if (b.bbB) { b.cB.putImageData(b.dataB, 0, 0); if (onDirty) onDirty(b.cvB); }
      b.bbF = blit(b.frameF, b.dataF.data);
      if (b.bbF) { b.cF.putImageData(b.dataF, 0, 0); if (onDirty) onDirty(b.cvF); }
    }
    if (t0) {
      const ms = performance.now() - t0;
      if (ms > 14 && quality < 3) quality++;
      else if (ms < 5 && quality > (mobile ? 1 : 0)) quality--;
    }
  }

  function blitLayer(ctx, b, back, p, scale) {
    const bb = back ? b.bbB : b.bbF;
    if (!bb) return false;
    const cvs = back ? b.cvB : b.cvF;
    const k = ISO_PX * scale * b.tune;
    const shiftX = b.aheadPx ? -Math.cos(b.aim) * b.aheadPx * k : 0;
    const shiftY = b.aheadPx ? -Math.sin(b.aim) * 0.5 * b.aheadPx * k : 0;
    const ax = Math.round(p.x + shiftX);
    const ay = Math.round(p.y - b.dy * scale + shiftY);
    const bw = bb.x1 - bb.x0 + 1, bh = bb.y1 - bb.y0 + 1;
    if (b.flipX) {
      ctx.save();
      ctx.translate(ax, ay);
      ctx.scale(-1, 1);
      ctx.drawImage(cvs, bb.x0, bb.y0, bw, bh, (bb.x0 - b.ox) * k, (bb.y0 - b.oy) * k, bw * k, bh * k);
      ctx.restore();
    } else {
      ctx.drawImage(cvs, bb.x0, bb.y0, bw, bh, ax + (bb.x0 - b.ox) * k, ay + (bb.y0 - b.oy) * k, bw * k, bh * k);
    }
    return true;
  }

  function drawBack(ctx, worldToScreen, scale) {
    if (!blasts.length) return;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    for (const b of blasts) {
      if (b.delay > 0 || !b.bbB) continue;
      const p = worldToScreen(b.x, b.z);
      if (blitLayer(ctx, b, true, p, scale)) {
        drawnCount++; seenIds.add(b.id);
        lastDraw = { id: b.id, layer: 'back', x: Math.round(p.x), y: Math.round(p.y), t: +b.fx.t.toFixed(2) };
      }
    }
    ctx.restore();
  }

  function drawFront(ctx, worldToScreen, scale) {
    if (!blasts.length) return;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    // Depth sort front layers by world depth (x + z), with `over` effects always on top.
    const sorted = blasts.filter(b => b.delay <= 0 && b.bbF).sort((a, b) => (a.over - b.over) || ((a.x + a.z) - (b.x + b.z)));
    for (const b of sorted) {
      const p = worldToScreen(b.x, b.z);
      if (blitLayer(ctx, b, false, p, scale)) {
        drawnCount++; seenIds.add(b.id);
        lastDraw = { id: b.id, layer: 'front', x: Math.round(p.x), y: Math.round(p.y), t: +b.fx.t.toFixed(2) };
      }
    }
    ctx.restore();
  }

  function clear() {
    while (blasts.length) dropAt(blasts.length - 1);
    statusAnchors.clear();
  }

  return {
    spawn, step, drawBack, drawFront, clear,
    beginStatusSync, syncUnitStatus, endStatusSync,
    hasBack: () => blasts.some(b => b.delay <= 0 && b.bbB),
    hasAny: () => blasts.length > 0,
    setLook(on) { lookOn = !!on; },
    stats: () => ({ active: blasts.length, drawn: drawnCount, quality, seen: [...seenIds], last: lastDraw }),
    clearStats: () => { drawnCount = 0; lastDraw = null; seenIds.clear(); },
  };
}
