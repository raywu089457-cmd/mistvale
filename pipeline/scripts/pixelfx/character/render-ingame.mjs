// Headless capture of the real game for the rig-hero archer slice.
//
//   node pipeline/scripts/pixelfx/character/render-ingame.mjs --tag new [--out DIR]
//
// Writes PNGs into <out>/shot-<tag>/ (default output/pixelfx-heroes):
//   pose-<act><i>.png      the game's own sheet preview (__mistvalePoseLab) at 1x cell
//   village-idle.png       in-world archer standing in the village
//   hunt-attack.png        in-world archer fighting a boar in the hunt zone
//   meta.json              what was captured (classId, heroHeight, scale, boxes)
//
// The script starts `server.mjs` on a free port, opens it with Playwright at
// deviceScaleFactor 3 (crisp pixels) and clips every shot to a small region so the
// montage composer (render-montage.py) can lay the old and new builds side by side.
// --tag old  is meant to be run with the legacy archer sheet installed in assets/.

import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..', '..');
const args = process.argv.slice(2);
const argOf = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const TAG = argOf('tag', 'new');
const OUT = path.resolve(ROOT, argOf('out', 'output/pixelfx-heroes'));
const CLASS_ID = argOf('class', 'archer');
const SHOT_DIR = path.join(OUT, 'shot-' + TAG);
const DSF = 3;
const VIEW = { width: 960, height: 600 };
const POSES = [['idle', 0], ['idleDown', 0], ['idleUp', 0], ['walk', 0], ['walk', 4],
  ['attack', 5], ['attack', 6], ['attackDown', 5], ['hurt', 1], ['death', 5], ['victory', 0]];

fs.mkdirSync(SHOT_DIR, { recursive: true });

async function freePort() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.unref();
    s.on('error', rej);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
  });
}

async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* fall through */ }
  const req = createRequire(path.join(process.env.APPDATA || '', 'npm', 'node_modules', 'noop.js'));
  return req('playwright');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const PORT = await freePort();
  const URL = `http://127.0.0.1:${PORT}/`;
  const server = spawn(process.execPath, ['server.mjs'], {
    cwd: ROOT, env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1' }, stdio: 'ignore', windowsHide: true,
  });
  let browser = null;
  const meta = { tag: TAG, classId: CLASS_ID, shots: {} };
  try {
    for (let i = 0; i < 80; i++) {
      try { const r = await fetch(URL); if (r.ok) break; } catch { /* not up yet */ }
      await sleep(400);
    }
    const pw = await loadPlaywright();
    try {
      browser = await pw.chromium.launch({ headless: true, args: ['--headless=new'] });
    } catch {
      browser = await pw.chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
    }
    const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: DSF });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('  pageerror:', e.message));
    await page.goto(URL + '?preview=1', { waitUntil: 'commit', timeout: 120000 });
    await page.waitForFunction(() => globalThis.__mistvaleGame && globalThis.__mistvaleView, null, { timeout: 120000 });
    await page.evaluate(() => { const w = globalThis.__mistvaleView; for (let i = 0; i < 120; i++) w.warmupAssets(); });
    await page.waitForFunction(() => !document.getElementById('loading') || getComputedStyle(document.getElementById('loading')).display === 'none', null, { timeout: 120000 }).catch(() => {});
    await sleep(600);

    // ---- game state: exactly one archer, no other hunters, no visitors ----
    const setup = await page.evaluate(({ classId }) => {
      const g = globalThis.__mistvaleGame, v = globalThis.__mistvaleView, s = g.state;
      s.paused = true;
      const proto = (s.hunters || []).find((h) => h && h.id) || null;
      const h = proto ? { ...proto } : {
        id: 'h1', name: 'Archer', classId, rarity: 'normal', trait: 'brave', level: 5, xp: 0, rebirths: 0,
        skillLevel: 0, weaponLevel: 0, equipment: { weapon: false, armor: false }, gold: 100, inventory: {},
        satiety: 90, mood: 90, stamina: 90, x: 0, z: 0, hp: 160, maxHp: 160, status: '\u5f85\u6a5f',
        targetId: null, attackTimer: 0, route: [], task: null, serviceProduct: null, actionTimer: 0,
        trainCooldown: 0, reviveTimer: 0, lastTownVisit: s.time || 0, tradedVisit: false, shoppedVisit: false,
        servedVisit: [], inTown: true, huntRegion: null,
      };
      h.id = 'h1'; h.classId = classId; h.name = 'Archer'; h.level = 5;
      h.hp = 160; h.maxHp = 160; h.equipment = { weapon: false, armor: false };
      h.reviveTimer = 0; h.status = '\u5f85\u6a5f'; h.targetId = null; h.task = null; h.route = [];
      s.hunters = [h];
      s.visitors = []; s.enemies = [];
      const hv = globalThis.__mistvaleView;
      hv.setDpr(3);
      return { hunterId: h.id, cls: h.classId, sheet: !!globalThis.PIXEL_ASSETS || true };
    }, { classId: CLASS_ID });
    meta.setup = setup;

    const shot = async (name, clip) => {
      const p = path.join(SHOT_DIR, name + '.png');
      await page.screenshot({ path: p, clip: Object.fromEntries(Object.entries(clip).map(([k, v]) => [k, Math.round(v)])) });
      meta.shots[name] = { clip: Object.fromEntries(Object.entries(clip).map(([k, v]) => [k, Math.round(v)])), file: p };
      console.log('  shot', name, JSON.stringify(meta.shots[name].clip));
    };

    // ---- 1. sheet pose preview (the game's own draw path, same box for old and new) ----
    for (const [act, i] of POSES) {
      const box = await page.evaluate(({ act, i, classId }) => {
        const v = globalThis.__mistvaleView;
        globalThis.__mistvalePoseLab.set({ classId, act, i, facing: 1 });
        const scale = v.getScale(), size = Math.round(190 * scale * 0.62);
        const px = Math.round(innerWidth / 2 - size / 2), py = Math.round(Math.min(innerHeight * 0.62, innerHeight - 170) - size);
        return { x: px - 6, y: py - 6, width: size + 12, height: size + 12, size, scale };
      }, { act, i, classId: CLASS_ID });
      await page.waitForTimeout(40);
      await shot(`pose-${act}${i}`, box);
      meta.poseBox = { size: box.size, scale: box.scale };
    }
    await page.evaluate(() => globalThis.__mistvalePoseLab.set(null));

    // ---- 2. village, in world ----
    await page.evaluate(({ classId }) => {
      const g = globalThis.__mistvaleGame, v = globalThis.__mistvaleView, s = g.state;
      const h = s.hunters[0];
      h.classId = classId; h.x = 0.35; h.z = 0.65; h.hp = h.maxHp; h.status = '\u5f85\u6a5f'; h.reviveTimer = 0;
      h.inTown = true; h.huntRegion = null; h.attackTimer = 0; h.targetId = null;
      s.enemies = []; s.time = (s.time || 0) + 0.001;
      v.lookAt(h.x, h.z, 2.6);
      for (let i = 0; i < 14; i++) g.simulate(0.07);
    }, { classId: CLASS_ID });
    await page.waitForTimeout(120);
    {
      const box = await page.evaluate(() => {
        const g = globalThis.__mistvaleGame, v = globalThis.__mistvaleView, h = g.state.hunters[0];
        const p = v.project(h.x, 0, h.z);
        const cur = globalThis.__mistvaleFacing()[h.id] || {};
        return { x: p.x - 62, y: p.y - 92, width: 124, height: 124, proj: { x: p.x, y: p.y }, facing: cur };
      });
      meta.village = box;
      await shot('village-idle', { x: box.x, y: box.y, width: box.width, height: box.height });
      await page.evaluate(({ x, z }) => {
        const g = globalThis.__mistvaleGame, v = globalThis.__mistvaleView, h = g.state.hunters[0];
        h.x = x; h.z = z; v.lookAt(x, z, 2.6);
        for (let i = 0; i < 10; i++) { h.x += 0.02; g.simulate(0.05); }
      }, { x: 0.35, z: 0.65 });
      await page.waitForTimeout(80);
      const box2 = await page.evaluate(() => {
        const g = globalThis.__mistvaleGame, v = globalThis.__mistvaleView, h = g.state.hunters[0];
        const p = v.project(h.x, 0, h.z);
        return { x: p.x - 62, y: p.y - 92, width: 124, height: 124, facing: (globalThis.__mistvaleFacing()[h.id] || {}) };
      });
      meta.villageWalk = box2;
      await shot('village-walk', { x: box2.x, y: box2.y, width: box2.width, height: box2.height });
    }

    // ---- 3. hunt zone, fighting a boar (walk in, then a strike frame) ----
    const HUNT = { x: 18, z: -1 };
    await page.evaluate(({ x, z, classId }) => {
      const g = globalThis.__mistvaleGame, v = globalThis.__mistvaleView, s = g.state;
      const h = s.hunters[0];
      h.classId = classId; h.x = x - 1.6; h.z = z + 0.4; h.hp = h.maxHp; h.status = '\u7375\u7375';
      h.inTown = false; h.huntRegion = 'meadow'; h.reviveTimer = 0; h.attackTimer = 0.4; h.route = []; h.task = null;
      h.lockUntil = 1e9; h.skillCd = 99;
      s.enemies = [{ id: 'm1', type: 'boar', x: x, z: z, hp: 400, maxHp: 400, attack: 0, attackTimer: 99, speed: 0, regionId: 'meadow', engaged: true, slotFor: h.id, age: 0 }];
      h.targetId = 'm1'; h.atkX = x; h.atkZ = z;
      v.lookAt(x - 0.8, z, 2.6);
    }, { ...HUNT, classId: CLASS_ID });
    let attackShot = null;
    for (let step = 0; step < 60 && !attackShot; step++) {
      const info = await page.evaluate(() => {
        const g = globalThis.__mistvaleGame, h = g.state.hunters[0];
        g.simulate(0.05);
        const f = globalThis.__mistvaleFacing()[h.id] || {};
        return { act: f.act || null, f: f.f ?? null };
      });
      if (info.act && /attack/i.test(info.act)) {
        await page.waitForTimeout(40);
        const box = await page.evaluate(() => {
          const g = globalThis.__mistvaleGame, v = globalThis.__mistvaleView, h = g.state.hunters[0];
          const p = v.project(h.x, 0, h.z);
          return { x: p.x - 78, y: p.y - 96, width: 156, height: 140, facing: (globalThis.__mistvaleFacing()[h.id] || {}) };
        });
        await shot('hunt-attack', { x: box.x, y: box.y, width: box.width, height: box.height });
        attackShot = { ...info, box };
      }
    }
    meta.hunt = { at: HUNT, attackShot };

    // ---- 4. real hurt and death states (village, camera parked on the hunter) ----
    const stateShot = async (name, setup) => {
      await page.evaluate(setup, { classId: CLASS_ID, x: 0.35, z: 0.65 });
      let acts = [];
      for (let step = 0; step < 24; step++) {
        const info = await page.evaluate(() => {
          const g = globalThis.__mistvaleGame, h = g.state.hunters[0];
          g.simulate(0.06);
          const f = globalThis.__mistvaleFacing()[h.id] || {};
          return { act: f.act || null };
        });
        acts.push(info.act);
        if (info.act && info.act.toLowerCase().startsWith(name)) break;
      }
      await page.waitForTimeout(30);
      const box = await page.evaluate(() => {
        const g = globalThis.__mistvaleGame, v = globalThis.__mistvaleView, h = g.state.hunters[0];
        const p = v.project(h.x, 0, h.z);
        return { x: p.x - 62, y: p.y - 80, width: 124, height: 116 };
      });
      await shot(name, { x: box.x, y: box.y, width: box.width, height: box.height });
      meta[name] = { acts, act: acts[acts.length - 1] };
    };
    await stateShot('death', ({ classId, x, z }) => {
      const g = globalThis.__mistvaleGame, v = globalThis.__mistvaleView, s = g.state, h = s.hunters[0];
      s.enemies = []; h.classId = classId; h.x = x; h.z = z; h.hp = 0; h.maxHp = 160; h.reviveTimer = 7.5;
      h.status = '\u5fa9\u6d3b\u4e2d'; h.targetId = null; h.huntRegion = null; h.inTown = true; h.lockUntil = 0;
      v.lookAt(h.x, h.z, 2.6);
    });
    await stateShot('hurt', ({ classId, x, z }) => {
      const g = globalThis.__mistvaleGame, v = globalThis.__mistvaleView, s = g.state, h = s.hunters[0];
      s.enemies = []; h.classId = classId; h.x = x; h.z = z; h.hp = 120; h.maxHp = 160; h.reviveTimer = 0;
      h.status = '\u5f85\u6a5f'; h.targetId = null; h.inTown = true;
      h.hitAt = s.time + 0.05; h.hitFromX = x + 0.6; h.hitFromZ = z;
      v.lookAt(h.x, h.z, 2.6);
    });

    // ---- 4. all six classes in the village, one camera pose, one crop per class (--six) ----
    // One hunter at a time at the same village spot with the same lookAt(): the game keeps nudging its own
    // follow camera, so a wide six-hunter frame drifts between the setup evaluate and the screenshot, and the
    // projected crops landed off-target. Single-hunter clips (the pattern used for village-idle) stay exact.
    if (args.includes('--six')) {
      const CLASSES = ['archer', 'berserker', 'paladin', 'sorcerer', 'assassin', 'priest'];
      const CROP = { x: 46, y: 86, w: 92, h: 96 }; // CSS px around the projected feet
      // fresh session: earlier sections leave preview overlays (pose lab, equipment preview) and a damaged
      // hunter behind, and the game's own follow camera keeps drifting - a reload gives one clean village
      await page.reload({ waitUntil: 'commit', timeout: 120000 });
      await page.waitForFunction(() => globalThis.__mistvaleGame && globalThis.__mistvaleView, null, { timeout: 120000 });
      await page.evaluate(() => { const w = globalThis.__mistvaleView; for (let i = 0; i < 120; i++) w.warmupAssets(); });
      await page.waitForFunction(() => !document.getElementById('loading') || getComputedStyle(document.getElementById('loading')).display === 'none', null, { timeout: 120000 }).catch(() => {});
      await sleep(700);
      await page.evaluate(({ classId }) => {
        const g = globalThis.__mistvaleGame, s = g.state;
        s.paused = true;
        const proto = (s.hunters || []).find((h) => h && h.id) || null;
        const h = proto ? { ...proto } : { id: 'h1', name: 'Archer', classId, level: 5, x: 0, z: 0, hp: 160, maxHp: 160 };
        h.id = 'h1'; h.classId = classId; h.hp = 160; h.maxHp = 160;
        h.equipment = { weapon: false, armor: false }; h.reviveTimer = 0; h.status = '\u5f85\u6a5f';
        h.targetId = null; h.task = null; h.route = []; h.hitAt = -99; h.atkAt = -99;
        h.hitFromX = null; h.hitFromZ = null; h.lockUntil = 0; h.skillCd = 0; h.inTown = true;
        h.huntRegion = null; h.attackTimer = 0;
        s.hunters = [h]; s.visitors = []; s.enemies = [];
        globalThis.__mistvaleView.setDpr(3);
        if (globalThis.__mistvalePoseLab) globalThis.__mistvalePoseLab.set(null);
      }, { classId: CLASSES[0] });
      meta.six = { classes: CLASSES, crops: [] };
      for (const cid of CLASSES) {
        await page.evaluate(({ classId }) => {
          const g = globalThis.__mistvaleGame, v = globalThis.__mistvaleView, s = g.state;
          const h = s.hunters[0];
          h.classId = classId; h.x = 0.35; h.z = 0.65; h.hp = h.maxHp; h.status = '\u5f85\u6a5f';
          h.reviveTimer = 0; h.inTown = true; h.huntRegion = null; h.attackTimer = 0;
          h.targetId = null; h.hitAt = -99; h.atkAt = -99; h.lockUntil = 0; h.skillCd = 0; h.route = []; h.task = null;
          // the hurt shot earlier leaves a hit direction behind; combatPose() keeps tinting the sprite white for
          // as long as hitFromX is set and the hit timestamp lands in the first .14 s. The cloned proto hunter
          // also carries equipment, which makes the runtime swap in the steel <class>-armor sheet.
          h.hitFromX = null; h.hitFromZ = null;
          h.equipment = { weapon: null, armor: null };
          s.enemies = []; s.time = (s.time || 0) + 0.001;
          v.lookAt(0.35, 0.65, 2.6);
          for (let i = 0; i < 14; i++) g.simulate(0.07);
        }, { classId: cid });
        await page.waitForTimeout(110);
        const clipOf = () => page.evaluate(({ c }) => {
          const g = globalThis.__mistvaleGame, v = globalThis.__mistvaleView, h = g.state.hunters[0];
          const p = v.project(h.x, 0, h.z);
          return {
            x: Math.round(p.x - c.x), y: Math.round(p.y - c.y), width: c.w, height: c.h,
            act: (globalThis.__mistvaleFacing()[h.id] || {}).act,
            gear: globalThis.__mistvaleGear ? globalThis.__mistvaleGear(h) : null,
            equip: h.equipment ? { ...h.equipment } : null,
          };
        }, { c: CROP });
        const idle = await clipOf();
        await page.screenshot({ path: path.join(SHOT_DIR, `six-${cid}-idle.png`),
          clip: { x: idle.x, y: idle.y, width: idle.width, height: idle.height } });
        await page.evaluate(() => {
          const g = globalThis.__mistvaleGame, v = globalThis.__mistvaleView, h = g.state.hunters[0];
          for (let i = 0; i < 12; i++) { h.x += 0.018; g.simulate(0.05); }
          v.lookAt(0.35, 0.65, 2.6);
        });
        await page.waitForTimeout(110);
        const walk = await clipOf();
        await page.screenshot({ path: path.join(SHOT_DIR, `six-${cid}-walk.png`),
          clip: { x: walk.x, y: walk.y, width: walk.width, height: walk.height } });
        meta.six.crops.push({ classId: cid, dpr: 3, idle, walk,
          files: [`six-${cid}-idle.png`, `six-${cid}-walk.png`] });
      }
      console.log('  shot six village crops');
    }

    fs.writeFileSync(path.join(SHOT_DIR, 'meta.json'), JSON.stringify(meta, null, 2));
    console.log('wrote', SHOT_DIR);
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.kill();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
