#!/usr/bin/env node
// T160 gear-classes: the idle sheet for a gear set, written in exactly the shape export-actor.mjs
// writes (<class>/<class>-idle.png + .json), because export-actor's compare montage hard-codes the
// walk indices (0,2,4,6) and crashes before its file writes for any single-frame move. This script
// only fills that one gap: same material composition, same gear pass, same cell/pivot rules, same
// JSON layout. Once export-actor handles a one-frame move, its own `--move idle` output is identical
// and will simply overwrite these files.
//
//   node pipeline/scripts/pixelfx/character/gear/sheet-idle.mjs --gear berserker,paladin,...
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { actBounds, actTiming, posed, STAND } from '../core/act.js';
import { setMaterial, setGearPass } from '../core/rig.js';
import { BARE_BODY_PLAIN } from '../barebody.js';
import { encodePNG } from '../png-io.mjs';
import * as idleMove from '../idle.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../../..');
const PAD = 6;
const MOVES = ['berserker', 'paladin', 'sorcerer', 'assassin', 'priest'];

const argv = process.argv.slice(2);
const opt = { gears: MOVES, move: 'idle' };
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--gear') opt.gears = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
  else { console.error(`unknown argument ${argv[i]}`); process.exit(2); }
}

// the material the exporter builds for a gear export: the gear layers in front of the plain body's,
// the last gear's seam, and no overlay (so equipment, not skin, covers the body)
function buildMaterial(names, gears) {
  return {
    ...BARE_BODY_PLAIN,
    id: `${BARE_BODY_PLAIN.id}+${names.join('+')}`,
    seam: gears[gears.length - 1].seam ?? BARE_BODY_PLAIN.seam,
    layers: [...gears.flatMap((g) => g.layers ?? []), ...BARE_BODY_PLAIN.layers],
    overlay: null,
  };
}

for (const name of opt.gears) {
  const mod = await import(new URL(`./${name}.js`, import.meta.url).href);
  const gears = [mod];
  const material = buildMaterial([name], gears);
  const gearPose = Object.assign({}, ...gears.map((g) => g.pose ?? {}));
  const recolour = new Map(gears.flatMap((g) => [...(g.recolour ?? new Map())]));
  const gearPass = (ctx) => gears.forEach((g) => g.drawGear?.(ctx));

  const move = idleMove;
  const shown = { ...move, act: { ...move.act, poses: move.act.poses.map(([t, p]) => [t, { ...p, ...gearPose }]) } };
  const b = actBounds(shown);
  const cellW = b.x1 - b.x0 + 2 * PAD, cellH = b.y1 - b.y0 + 2 * PAD;
  const px = PAD - b.x0, py = PAD - b.y0;
  const fps = move.meta.fps;
  const sheetName = `${name}-${opt.move}`;

  setMaterial(material);
  setGearPass(gearPass);
  const pose = { ...STAND, ...gearPose };
  const r = posed(pose, material);
  const rgba = new Uint8ClampedArray(cellW * cellH * 4);
  for (let i = 0; i < r.n; i++) {
    const x = px + r.xs[i], y = py + r.ys[i];
    if (x < 0 || y < 0 || x >= cellW || y >= cellH) continue;
    const c0 = r.color[i], c = recolour.get(c0) ?? c0, o = (y * cellW + x) * 4;
    rgba[o] = c & 255; rgba[o + 1] = (c >>> 8) & 255; rgba[o + 2] = (c >>> 16) & 255; rgba[o + 3] = (c >>> 24) & 255;
  }
  setGearPass(null);
  setMaterial(null);

  const json = {
    frames: [{
      filename: `${sheetName} 0`, frame: { x: 0, y: 0, w: cellW, h: cellH }, rotated: false, trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: cellW, h: cellH }, sourceSize: { w: cellW, h: cellH },
      duration: Math.round(1000 / fps),
    }],
    meta: {
      app: 'https://github.com/patch-gg/pixelfx', version: '1', image: `${sheetName}.png`, format: 'RGBA8888',
      size: { w: cellW, h: cellH }, scale: '1',
      frameTags: [{ name: sheetName, from: 0, to: 0, direction: 'forward' }],
      pixelfx: {
        id: `character/${sheetName}`, name: mod.name ?? move.meta.name,
        fps, loop: move.meta.loop, frames: 1,
        frameSize: [cellW, cellH], pivot: [px, py], columns: 1,
        act: actTiming(shown),
        actor: { body: 'barebody', gear: [name], move: opt.move },
      },
    },
  };

  const outDir = path.join(ROOT, 'output/pixelfx-character', name);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, `${sheetName}.png`), encodePNG(cellW, cellH, rgba));
  fs.writeFileSync(path.join(outDir, `${sheetName}.json`), JSON.stringify(json, null, 1));
  console.log(`${name} idle -> output/pixelfx-character/${name}/${sheetName}.{png,json}  ${cellW}x${cellH}, pivot [${px},${py}]`);
}
