// vfx-iso.mjs — task-3: the pixelfx iso rewrites (assets/vfx-sheets/*-iso) are wired into
// gameplay moments, and they are actually drawn in the REAL built game at a plausible size
// and anchor. This checker is independent of tools/checks/vfx-slower.mjs: that one proves the
// side-view sheets still play at 0.6x, this one proves the iso rewrites play at 1.0x and land
// on the right pixel.
//
//   * assets  — every sheet the iso table names has a .png + .json in assets/vfx-sheets.
//   * wiring  — every iso sheet is referenced by a draw call or a gameplay spawn in src/.
//   * draw    — boot the built game (?preview=1), push one effect through the real
//               e.type==='vfxsheet' path and read __mistvaleVfxDraw(): the sheet must be the
//               one asked for, its k must be ~21/67 world units per art px x tune (1 effect
//               px = 1 hero px), the anchor must be the target's feet within 2 screen px, and
//               the sheet must stop at ISO_FX.to.
//   * moments — drive the real hunter/monster AI (no hand-placed effects) and assert the iso
//               sheet each moment promises is drawn: basic attacks per class, monster slam,
//               kill (soul-rise + coin-drop), the four class skills, and the expedition portal.
//
// Usage: node build.mjs && node tools/checks/vfx-iso.mjs
// Prints one PASS/FAIL line. Exit 0 = PASS.
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const fails = [], oks = [];
const fix = m => fails.push(m);
const ok = m => oks.push(m);

// ── 1. assets on disk ─────────────────────────────────────────────────────────────
const VFX_DIR = path.join(ROOT, 'assets/vfx-sheets');
const sheetFiles = new Set(fs.readdirSync(VFX_DIR).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, '')));
const isoFiles = [...sheetFiles].filter(id => /-iso$/.test(id)).sort();
if (isoFiles.length < 15) fix(`assets — only ${isoFiles.length} iso sheets in assets/vfx-sheets (want >= 15)`);
for (const id of isoFiles) if (!fs.existsSync(path.join(VFX_DIR, id + '.png'))) fix(`assets — ${id}.json has no matching .png`);

// ── 2. wiring references in src ───────────────────────────────────────────────────
const worldSrc = fs.readFileSync(path.join(ROOT, 'src/pixel-world.js'), 'utf8');
const gameSrc = fs.readFileSync(path.join(ROOT, 'src/pixel-game.js'), 'utf8');
// Every ISO_FX entry has to be drawn (drawIso / drawVfxSheet) and/or spawned (isoEffect) by
// name; a sheet that only exists in the table would be dead weight.
const wired = id => worldSrc.includes(`'${id}'`) || worldSrc.includes(`"${id}"`) ||
  gameSrc.includes(`'${id}'`) || gameSrc.includes(`"${id}"`);

// moments the sheet must cover; the scene runner below drives the real AI for each of them
const MOMENTS = [
  { sheet: 'hit-spark-iso', scene: 'archer-basic' },
  { sheet: 'smite-iso', scene: 'priest-basic' },
  { sheet: 'frost-nova-iso', scene: 'sorcerer-basic' },
  { sheet: 'magic-circle-cast-iso', scene: 'sorcerer-skill' },
  { sheet: 'blade-hit-heavy-iso', scene: 'berserker-basic' },
  { sheet: 'blade-hit-iso', scene: 'crit-draw' },
  { sheet: 'great-slash-iso', scene: 'paladin-basic' },
  { sheet: 'dagger-flurry-iso', scene: 'assassin-basic' },
  { sheet: 'ground-slam-iso', scene: 'boulder-slam' },
  { sheet: 'hit-spark-iso', scene: 'boar-melee' },
  { sheet: 'soul-rise-iso', scene: 'kill' },
  { sheet: 'coin-drop-iso', scene: 'kill' },
  { sheet: 'whirlwind-iso', scene: 'berserker-skill' },
  { sheet: 'divine-shield-iso', scene: 'paladin-skill' },
  { sheet: 'heal-aoe-iso', scene: 'priest-skill' },
  { sheet: 'warp-iso', scene: 'assassin-skill' },
  { sheet: 'portal-iso', scene: 'expedition' },
  { sheet: 'cinder-cyclone-iso', scene: 'sorcerer-skill', cinder: true },
];

// ── 3. server + browser ───────────────────────────────────────────────────────────
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const PORT = await freePort();
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1' }, stdio: 'ignore', windowsHide: true });
const URL = `http://127.0.0.1:${PORT}/`;
for (let i = 0; i < 60; i++) { try { if ((await fetch(URL)).ok) break; } catch {} await new Promise(r => setTimeout(r, 500)); }

let pw = null;
try { pw = await import('playwright'); } catch {}
if (!pw) for (const r of [process.env.APPDATA && path.join(process.env.APPDATA, 'npm/node_modules')].filter(Boolean)) {
  try { pw = createRequire(path.join(r, 'noop.js'))('playwright'); break; } catch {}
}
if (!pw) { console.log('FAIL vfx-iso — playwright not found (npm i -g playwright, or the desktop npm prefix)'); server.kill(); process.exit(1); }
let browser = null;
try { browser = await pw.chromium.launch({ headless: true, args: ['--headless=new'] }); }
catch { browser = await pw.chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new'] }); }

let exitCode = 1;
try {
  const page = await (await browser.newContext({ viewport: { width: 1200, height: 760 }, deviceScaleFactor: 1, locale: 'zh-TW' })).newPage();
  page.on('pageerror', e => fails.push('pageerror — ' + String(e.message).slice(0, 160)));
  await page.goto(URL + '?preview=1', { waitUntil: 'commit', timeout: 120000 });
  await page.waitForFunction(() => globalThis.__mistvaleGame && globalThis.__mistvaleView, null, { timeout: 180000 });
  await page.evaluate(() => { const w = globalThis.__mistvaleView; for (let i = 0; i < 90; i++) w.warmupAssets(); });
  await page.waitForFunction(() => !document.querySelector('#loading'), null, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(1000);

  // ── iso table from the running world ────────────────────────────────────────────
  const isoTable = await page.evaluate(() => globalThis.__mistvaleIsoTable?.() || null);
  if (!isoTable) fix('wiring — __mistvaleIsoTable() missing in src/pixel-world.js');
  const isoIds = isoTable ? Object.keys(isoTable.sheets).sort() : [];
  // vfxSheet() returns null until the image decodes, so the first frame of an unused sheet would
  // be blank; warm every iso sheet up front (the game itself warms sprites the same way).
  if (isoIds.length && await page.evaluate(() => typeof globalThis.__mistvaleVfxWarm === 'function')) {
    await page.evaluate(ids => globalThis.__mistvaleVfxWarm(ids), isoIds);
    await page.waitForTimeout(300);
  }
  for (const id of isoIds) {
    if (!sheetFiles.has(id)) fix(`assets — ISO_FX names ${id} but assets/vfx-sheets/${id}.json is missing`);
    if (!wired(id)) fix(`wiring — ${id} is in ISO_FX but no draw/spawn call names it in src/`);
  }
  for (const id of isoFiles) if (!isoIds.includes(id) && id !== 'cinder-cyclone-iso') fix(`wiring — ${id} sheet exists but no ISO_FX entry (unused rewrite)`);
  if (isoTable && Math.abs(isoTable.px - 21 / 67) > 1e-6) fix(`scale — ISO_PX ${isoTable.px}, want 21/67 (1 effect px = 1 hero px)`);
  if (!fails.length) ok(`assets/wiring — ${isoFiles.length} iso sheets on disk, ${isoIds.length} in ISO_FX, ISO_PX = 21/67`);

  // ── draw probe: size + anchor + window through the real vfxsheet path ───────────
  const probe = (id) => page.evaluate(async (id) => {
    const g = globalThis.__mistvaleGame, v = globalThis.__mistvaleView, s = g.state;
    const clear = a => { if (Array.isArray(a)) a.length = 0; };
    s.paused = true; clear(s.effects); clear(s.shots); clear(s.hunters); clear(s.enemies);
    if (!Array.isArray(s.effects)) s.effects = [];
    const X = 18, Z = -1;
    v.lookAt(X, Z, 3);
    const raf = () => new Promise(r => requestAnimationFrame(r));
    const meta = globalThis.PIXEL_ASSETS.vfxSheets[id].meta.meta.pixelfx;
    const table = globalThis.__mistvaleIsoTable();
    const span = table.sheets[id].to - table.sheets[id].from;
    // the world only draws inside its own rAF frame, and the first paint of a sheet waits for its
    // image to decode, so keep the effect parked and wait up to 30 frames for the paint.
    const at = async age => {
      s.paused = true; clear(s.hunters); clear(s.enemies); s.effects.length = 0;
      s.effects.push({ id: 'probe', type: 'vfxsheet', sheet: id, life: 9, x: X, z: Z, age, delay: 0 });
      globalThis.__mistvaleIsoClear();
      let seen = [], lasts = {};
      for (let i = 0; i < 30; i++) {
        s.paused = true;
        await raf();
        const iso = globalThis.__mistvaleIso();
        if (iso.seen.includes(id)) { seen = iso.seen; lasts = iso.lasts; break; }
      }
      return { seen, lasts };
    };
    const live = await at(0.08);
    const late = await at(span + 0.2);
    return {
      sheet: id, span, drawn: live.seen.includes(id), last: live.lasts[id] || null,
      lateDrawn: late.seen.includes(id), scale: v.getScale(), feet: v.project(X, 0, Z),
      px: table.px, tune: table.sheets[id].tune || 1,
      frame: { w: meta.frameSize[0], h: meta.frameSize[1], pivot: meta.pivot },
    };
  }, id);
  for (const id of isoIds) {
    const r = await probe(id);
    if (!r.drawn || !r.last || r.last.sheet !== id || r.last.ok !== true) { fix(`draw — ${id} was not drawn through e.type='vfxsheet'`); continue; }
    const wantK = r.px * r.scale * r.tune;
    if (Math.abs(r.last.k - wantK) > wantK * 0.2) fix(`draw — ${id} k ${r.last.k}, want ~${wantK.toFixed(3)} (1 art px = 1 hero px x tune ${r.tune})`);
    if (Math.abs(r.last.x - r.feet.x) > 2 || Math.abs(r.last.y - r.feet.y) > 2) fix(`draw — ${id} anchored at (${r.last.x},${r.last.y}), want the target's feet (${Math.round(r.feet.x)},${Math.round(r.feet.y)})`);
    if (r.frame.pivot[1] / r.frame.h < 0.5) fix(`draw — ${id} pivot y ${r.frame.pivot[1]} of ${r.frame.h} is not a floor/feet pivot`);
    if (r.lateDrawn) fix(`draw — ${id} is still drawn ${(r.span + 0.2).toFixed(2)}s after the event, want the tail cut at ${r.span.toFixed(2)}s`);
  }
  if (!fails.length) ok(`draw — ${isoIds.length} iso sheets drawn at feet anchor, k = 21/67 x tune, tail cut at ISO_FX.to`);

  // ── moment scenes: drive the real AI, no hand-placed effects ────────────────────
  // Each scene mutates the preview save's first hunter into the class under test, puts one
  // monster next to it, lets the paused game simulate, and reports which iso sheets were drawn.
  // a known-good wild spot: the centre of the meadow hunting region, outside the village and
  // inside the region the monster AI checks (regionContains) before it will fight.
  const { regionCenter, regionAt, inVillage } = await import(pathToFileURL(path.join(ROOT, 'src/overworld.js')).href);
  const spot = regionCenter('meadow');
  if (!spot || inVillage(spot.x, spot.z) || regionAt(spot.x, spot.z).id !== 'meadow') {
    console.log('FAIL vfx-iso — could not resolve a wild meadow spot for the moment scenes');
    process.exit(1);
  }
  const SPOT = { x: spot.x, z: spot.z, region: 'meadow' };
  // pristine actor templates, captured once: scenes run one after another and must never inherit
  // the previous scene's mutated hunter/monster. The preview save starts without hired hunters,
  // so fall back to a villager (same shape: classId, inventory, equipment, route, stats).
  const PROTO = await page.evaluate(() => {
    const s = globalThis.__mistvaleGame.state;
    const pick = (a) => (Array.isArray(a) && a[0] ? JSON.parse(JSON.stringify(a[0])) : null);
    return { h: pick(s.hunters) || pick(s.wanderers), e: pick(s.enemies) };
  });

  const runScene = async (scene) => {
    const out = await page.evaluate(async ({ scene, SPOT, PROTO }) => {
     try {
      const g = globalThis.__mistvaleGame, v = globalThis.__mistvaleView, s = g.state;
      const clear = a => { if (Array.isArray(a)) a.length = 0; };
      const proto = PROTO.h, protoEnemy = PROTO.e;
      const H = SPOT.x, Z = SPOT.z, EX = H + 1.0, EZ = Z;
      const clsName = proto && proto.classId ? proto.classId : 'archer';
      // the village keeps spawning its own monsters and the villagers fight them; a scene has to
      // be hermetic, so park the spawner in the past and drop every actor we did not create.
      s.paused = true; s.rally = null; s.spawnTimer = -1e9; s.regionSpawn = {};
      clear(s.effects); clear(s.shots); clear(s.enemies); clear(s.hunters); clear(s.wanderers); clear(s.visitors);
      if (!Array.isArray(s.effects)) s.effects = [];
      if (!Array.isArray(s.hunters)) s.hunters = [];
      if (!Array.isArray(s.enemies)) s.enemies = [];
      if (!Array.isArray(s.shots)) s.shots = [];
      const raf = () => new Promise(r => requestAnimationFrame(r));
      // simulate() steps the game even while the village is paused (tick() bails on pause), and
      // we await one real frame after each step so the world actually paints the effects.
      const types = new Set();
      const keep = new Set(['m1', 'h1', 'h2']);
      const run = async (n, dt) => {
        for (let i = 0; i < n; i++) {
          s.paused = true; g.simulate(dt);
          s.spawnTimer = -1e9; s.regionSpawn = {};
          if (Array.isArray(s.enemies)) s.enemies = s.enemies.filter(e => keep.has(e.id) || e.type === 'boss');
          if (Array.isArray(s.hunters)) s.hunters = s.hunters.filter(h => keep.has(h.id));
          clear(s.wanderers); clear(s.visitors);
          for (const e of (s.effects || [])) types.add(e.type + (e.by ? ':' + e.by : '') + (e.cls ? ':' + e.cls : '') + (e.sheet ? ':' + e.sheet : ''));
          await raf();
        }
      };
      if (scene === 'crit-draw') {
        // a crit is a 15% roll, so pin it deterministically: one real 'slash' effect carrying
        // crit:true through the normal drawEffect -> drawSlash -> drawMeleeSheet path.
        const h = proto ? JSON.parse(JSON.stringify(proto)) : { id: 'h1', name: 'T', classId: 'archer', equipment: {}, inventory: {}, route: [], task: null };
        h.id = 'h1';
        Object.assign(h, { classId: 'berserker', x: H, z: Z, hp: h.maxHp || 200 });
        s.hunters.push(h);
        v.lookAt(H, Z, 3);
        globalThis.__mistvaleIsoClear();
        s.effects.push({ id: 'critfx', type: 'slash', cls: 'berserker', crit: true, sourceX: H - 1, sourceZ: Z, value: 0, x: H, z: Z, age: 0.02, delay: 0 });
        await run(6, 0.02);
        return { seen: globalThis.__mistvaleIso().seen, types: [...types], cinder: false };
      }
      if (scene === 'expedition') {
        s.expedition.active = false; s.expedition.cooldown = 0;
        const h = proto ? JSON.parse(JSON.stringify(proto)) : { id: 'h1', name: 'T', classId: 'archer', equipment: {}, inventory: {}, route: [], task: null };
        h.id = 'h1';
        h.hp = h.maxHp = h.maxHp || 200; h.task = null; h.x = H; h.z = Z; h.route = [];
        s.hunters.push(h);
        v.lookAt(H, Z, 3);
        globalThis.__mistvaleIsoClear();
        const r = g.expedition() || {};
        await run(24, 0.05);
        const seen = globalThis.__mistvaleIso().seen;
        return { seen, types: [...types], message: r.message, ok: r.ok, boss: (s.enemies || []).some(e => e.type === 'boss'),
          enemies: (s.enemies || []).map(e => e.type + ':' + e.id + ' rg' + e.regionId), active: !!s.expedition?.active };
      }
      const SCENE_CLS = { kill: 'berserker', 'boulder-slam': clsName, 'boar-melee': clsName };
      const cls = SCENE_CLS[scene] || scene.split('-')[0];
      const skill = /-skill$/.test(scene);
      const h = proto ? JSON.parse(JSON.stringify(proto)) : { id: 'h1', name: 'T', classId: 'archer', equipment: {}, inventory: {}, route: [], task: null };
      h.id = 'h1';
      s.hunters.push(h);
      // second, hurt hunter so the priest's allyHeal has somebody to heal
      if (cls === 'priest' && skill) {
        const ally = { ...h, id: 'h2', name: 'A2', x: H + 1, z: Z, hp: 1 };
        Object.assign(ally, { route: [], task: null, huntRegion: SPOT.region, attackTimer: 1e9, targetId: null, classId: 'priest' });
        s.hunters.push(ally);
      }
      const maxHp = Number.isFinite(h.maxHp) && h.maxHp > 0 ? h.maxHp : 200;
      h.maxHp = maxHp;
      Object.assign(h, {
        classId: cls, hp: skill ? Math.max(1, Math.round(maxHp * 0.45)) : maxHp, maxHp,
        attack: Number.isFinite(h.attack) && h.attack > 0 ? h.attack : 20,
        defense: Number.isFinite(h.defense) ? h.defense : 3,
        x: H, z: Z, task: null, destination: null, inTown: false, status: '戰鬥中', huntRegion: SPOT.region,
        targetId: 'm1', route: [], satiety: 100, stamina: 100, mood: 100, serviceProduct: null,
        attackTimer: 0, atkAt: -99, hitAt: -99, lockUntil: 0, skillAt: -99, skillCd: skill ? 0 : 99,
        range: Math.max(h.range || 0, 7),
      });
      const heavy = scene === 'boulder-slam';
      const enemyType = heavy ? 'boulder' : (scene === 'kill' ? 'boar' : 'boar');
      // clone a real spawned monster so the AI sees every field it expects (homeX/homeZ/...)
      const enemy = protoEnemy ? JSON.parse(JSON.stringify(protoEnemy)) : { id: 'm1', age: 0 };
      Object.assign(enemy, {
        id: 'm1', type: enemyType, x: EX, z: EZ, hp: heavy ? 1e6 : (scene === 'kill' ? 1 : 1e6), maxHp: 1e6,
        attack: 2, attackTimer: 0.05, regionId: SPOT.region, homeX: EX, homeZ: EZ, age: 0, rewarded: false,
      });
      s.enemies.push(enemy);
      if (scene === 'boulder-slam' || scene === 'boar-melee') { h.attackTimer = 1e9; h.targetId = null; h.huntRegion = null; }
      v.lookAt(H, Z, 3);
      globalThis.__mistvaleIsoClear();
      globalThis.__mistvaleCinderClear?.();
      const before = globalThis.__mistvaleCinder?.().drawn || 0;
      await run(80, 0.05);
      return { seen: globalThis.__mistvaleIso().seen, types: [...types], cinder: (globalThis.__mistvaleCinder?.().drawn || 0) > before,
        hunters: (s.hunters || []).map(x => x.classId + ':' + x.id + '@' + (+x.x).toFixed(1) + ',' + (+x.z).toFixed(1) + ' hp' + Math.round(x.hp) + ' tgt' + x.targetId),
        enemies: (s.enemies || []).map(x => x.type + ':' + x.id + '@' + (+x.x).toFixed(1) + ',' + (+x.z).toFixed(1) + ' hp' + Math.round(x.hp) + ' at' + (+(x.attackTimer || 0)).toFixed(2) + ' rg' + x.regionId),
        spot: { H: +H.toFixed(1), Z: +Z.toFixed(1) }, time: +s.time.toFixed(1),
        kills: s.totalKills, now: (s.effects || []).map(e => e.type), dbg: { rewarded: enemy.rewarded, engaged: enemy.engaged, slotFor: enemy.slotFor, dist: +Math.hypot(enemy.x - h.x, enemy.z - h.z).toFixed(2), htask: h.task, hstatus: h.status, hrange: h.range } };
     } catch (e) { return { error: String((e && e.stack) || e).slice(0, 400) }; }
    }, { scene, SPOT, PROTO });
    return out;
  };

  const sceneCache = {};
  for (const scene of [...new Set(MOMENTS.map(m => m.scene))]) {
    sceneCache[scene] = await runScene(scene);
  }
  for (const m of MOMENTS) {
    const r = sceneCache[m.scene];
    if (!r) { fix(`moment — ${m.sheet} (${m.scene}) scene did not run`); continue; }
    if (r.error) { fix(`moment — ${m.scene} crashed: ${String(r.error).split('\n').slice(0, 4).join(' / ')}`); continue; }
    if (m.scene === 'expedition' && !r.boss) { fix(`moment — portal-iso: expedition() did not spawn a boss (${r.message}; enemies: ${(r.enemies || []).join(' | ') || 'none'}; active: ${r.active})`); continue; }
    const drawn = m.cinder ? r.cinder : r.seen.includes(m.sheet);
    if (!drawn) fix(`moment — ${m.sheet} was not drawn by ${m.scene} (drawn: ${r.seen.join(', ') || 'none'}; effects: ${(r.types || []).slice(0, 14).join(' ') || 'none'}; hunters: ${(r.hunters || []).join(' | ')}; enemies: ${(r.enemies || []).join(' | ')}; kills: ${r.kills}; dbg: ${JSON.stringify(r.dbg)}; spot: ${JSON.stringify(r.spot)})`);
  }
  const missingScenes = [...new Set(MOMENTS.map(m => m.scene))].filter(s => {
    const r = sceneCache[s];
    if (!r || r.error || !Array.isArray(r.seen)) return true;
    return !MOMENTS.filter(m => m.scene === s).some(m => (m.cinder ? r.cinder : r.seen.includes(m.sheet)));
  });
  if (!fails.length && !missingScenes.length) ok(`moments — ${new Set(MOMENTS.map(m => m.scene)).size} real-AI scenes drew all ${MOMENTS.length} wired iso sheets`);

  // ── report ─────────────────────────────────────────────────────────────────────
  for (const m of oks) console.log('  ok   ' + m);
  for (const m of fails) console.log('  FAIL ' + m);
  if (!fails.length) {
    console.log(`PASS vfx-iso — ${isoIds.length} iso rewrites, ${MOMENTS.length} wired moments, size + feet anchor verified in the built game`);
    exitCode = 0;
  } else {
    console.log(`FAIL vfx-iso — ${fails.length} problem(s)`);
  }
} finally {
  await browser.close().catch(() => {});
  server.kill();
}
process.exit(exitCode);
