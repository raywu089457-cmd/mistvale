// save-export-import.mjs — End-to-end browser verification for save export & import (desktop + phone).
// Usage: node tools/checks/save-export-import.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as L from './fix-a-lib.mjs';

const srv = await L.startServer();
const browser = await L.launch();
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mistvale-save-test-'));
const fails = [], oks = [];
const fix = m => fails.push(m);
const ok = m => oks.push(m);

const writeTmp = (name, text) => {
  const p = path.join(tmpDir, name);
  fs.writeFileSync(p, text, 'utf8');
  return p;
};

async function openSettings(page) {
  await L.act(page, 'settings');
  await page.waitForSelector('#modal[data-type=settings]', { timeout: 5000 });
  await page.waitForTimeout(250);
}

async function pickImportFile(page, filePath) {
  await page.evaluate(() => {
    document.querySelector('#modal-content [data-action=importSave]')?.scrollIntoView({ block: 'center' });
  });
  await page.waitForTimeout(120);
  const [fc] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 5000 }),
    page.click('#modal-content [data-action=importSave]'),
  ]);
  await fc.setFiles(filePath);
  await page.waitForTimeout(350);
}

async function readAlertOrToast(page) {
  return page.evaluate(() => {
    const tips = [...document.querySelectorAll('.z2d-tip')].map(e => e.textContent.trim());
    const toasts = [...document.querySelectorAll('#toasts .toast')].map(e => ({ kind: e.dataset.kind, text: e.querySelector('.toast-tx')?.textContent.trim() || e.textContent.trim() }));
    return { tips, toasts, allText: [...tips, ...toasts.map(t => t.text)].join(' | ') };
  });
}

try {
  // ── 1. Desktop E2E: Export -> Mutate -> Reject bad files -> Cancel -> Import -> Reload persistence -> Legacy v2 ──
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, acceptDownloads: true });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e).slice(0, 240)));

    await L.boot(page, srv.url);

    // Mutate rich game state covering all subsystems.
    const expected = await page.evaluate(() => {
      const g = globalThis.__mistvaleGame, s = g.state;
      s.paused = true;
      s.gold = 34567; s.gems = 234; s.wood = 789; s.ore = 456;
      s.time = 240 * 8 + 90; s.speed = 2; s.region = 'snow';   // 遊戲時間 33 分 30 秒(2026-11-26 起沒有「第 N 天」)
      s.buildings.hall = 4; s.buildings.forge = 3; s.buildings.house = 3; s.buildings.dungeon = 2; s.buildings.training = 2;
      s.stocks.food = 88;
      g.setCraftTarget('food', 50);
      g.setTradeRequest('ore', 95); g.setTradeStanding('ore', true);
      g.setAutoJunk('salvage');
      g.setRegionDensity('meadow', 1); g.setRegionDensity('snow', 3);
      g.setSetting('quality', 'low'); g.setSetting('fps', 60); g.setSetting('shadows', false); g.setSetting('shake', false); g.setSetting('uiScale', 1);
      s.gearStock.sword[3] = 4;
      s.gearStorage.push({ uid: 'e2e1', itemId: 'craft_chest', grade: 3 });
      s.codex = { sprout: 15, yeti: 4 };
      s.wanderKills = 77;
      s.counts.promoted = 2; s.counts.autoJunk = 11; s.counts.tradeGold = 1800;
      s.hunters[0].name = '匯出測試者'; s.hunters[0].gender = 'f'; s.hunters[0].level = 33; s.hunters[0].rebirths = 4;
      s.difficulty = 2;
      s.dungeon.bestFloor = 12; s.dungeon.startFloor = 9; s.dungeon.auto = true;
      s.dungeon.hunterIds = s.hunters.slice(0, 3).map(h => h.id);
      s.arena.wins = 14; s.arena.losses = 3;
      s.arena.hunterIds = s.hunters.slice(1, 4).map(h => h.id);
      g.setDispatchTeam(2, { ids: [s.hunters[0].id, s.hunters[1].id], region: 'snow' });
      return {
        gold: s.gold, gems: s.gems, time: s.time, speed: s.speed, region: s.region,
        hall: s.buildings.hall, forge: s.buildings.forge,
        craftFood: s.craftTargets.food, tradeStandingOre: s.tradeStanding.ore, autoJunk: s.autoJunk,
        densityMeadow: s.regionDensity.meadow, densitySnow: s.regionDensity.snow,
        settings: { ...s.settings }, gearStockW3: s.gearStock.sword[3],
        wanderKills: s.wanderKills, promoted: s.counts.promoted, autoJunkCount: s.counts.autoJunk,
        h0Name: s.hunters[0].name, h0Gender: s.hunters[0].gender, h0Level: s.hunters[0].level,
        difficulty: s.difficulty, bestFloor: s.dungeon.bestFloor, startFloor: s.dungeon.startFloor, dgAuto: s.dungeon.auto,
        dgIds: [...s.dungeon.hunterIds], arWins: s.arena.wins, arIds: [...s.arena.hunterIds],
        team2: { ids: [...s.dispatchTeams[2].ids], region: s.dispatchTeams[2].region },
      };
    });

    await openSettings(page);

    // Check export + import buttons exist and fit cleanly.
    const layout = await page.evaluate(() => {
      const c = document.querySelector('#modal-content');
      const exp = c.querySelector('[data-action=export]');
      const imp = c.querySelector('[data-action=importSave]');
      const er = exp?.getBoundingClientRect(), ir = imp?.getBoundingClientRect();
      return {
        hasExp: !!exp, hasImp: !!imp,
        expBox: er ? [Math.round(er.width), Math.round(er.height)] : null,
        impBox: ir ? [Math.round(ir.width), Math.round(ir.height)] : null,
        hscroll: c.scrollWidth - c.clientWidth,
      };
    });
    if (!layout.hasExp || !layout.hasImp) fix(`desktop settings missing buttons: ${JSON.stringify(layout)}`);
    else if (layout.hscroll > 1) fix(`desktop settings overflow ${layout.hscroll}px`);
    else ok(`desktop settings export(${layout.expBox}) + import(${layout.impBox}), no overflow`);

    // Real click on Export -> verify download event + file contents + toast.
    await page.evaluate(() => document.querySelector('#modal-content [data-action=export]')?.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(120);
    const [dl] = await Promise.all([
      page.waitForEvent('download', { timeout: 5000 }),
      page.click('#modal-content [data-action=export]'),
    ]);
    const suggested = dl.suggestedFilename();
    const exportedPath = path.join(tmpDir, 'exported.json');
    await dl.saveAs(exportedPath);
    await page.waitForTimeout(250);
    const expMsg = await readAlertOrToast(page);
    const exportedObj = JSON.parse(fs.readFileSync(exportedPath, 'utf8'));
    if (suggested !== '暮影村-像素存檔.json') fix(`export filename mismatch: ${suggested}`);
    else if (exportedObj.version !== 4 || exportedObj.gold !== expected.gold || !Number.isFinite(exportedObj.exportedAt) || !Number.isFinite(exportedObj.savedAt)) {
      fix(`exported JSON invalid payload: version=${exportedObj.version} gold=${exportedObj.gold} exportedAt=${exportedObj.exportedAt}`);
    } else if (!expMsg.allText.includes('已匯出存檔')) {
      fix(`export toast missing: ${expMsg.allText}`);
    } else {
      ok(`desktop export downloaded "${suggested}" (${fs.statSync(exportedPath).size} B) with toast`);
    }

    // Mutate current game to a totally different state + activate pilot mode to test full cleanup on import.
    await page.evaluate(() => {
      const g = globalThis.__mistvaleGame;
      g.reset();
      g.state.gold = 111;
      g.state.paused = true;
      g.pilotStart(g.state.hunters[0].id);
    });
    await openSettings(page);

    // Try 4 invalid files -> all rejected, gold remains 111.
    const badFiles = [
      ['empty', writeTmp('empty.json', '')],
      ['syntax', writeTmp('broken.json', '{not-json')],
      ['unrelated-v4', writeTmp('config.json', JSON.stringify({ version: 4, app: 'other' }))],
      ['v1-3d', writeTmp('v1.json', JSON.stringify({ version: 1, gold: 9999, buildings: { hall: 1 }, hunters: [{ classId: 'paladin' }] }))],
    ];
    let badPassed = 0;
    for (const [tag, fp] of badFiles) {
      await pickImportFile(page, fp);
      const st = await page.evaluate(() => ({
        gold: globalThis.__mistvaleGame.state.gold,
        modalType: document.querySelector('#modal')?.dataset.type || '',
      }));
      const msg = await readAlertOrToast(page);
      if (st.gold !== 111 || st.modalType === 'confirm') {
        fix(`desktop bad file (${tag}) was not rejected: ${JSON.stringify(st)}`);
      } else if (!msg.allText.includes('無法匯入')) {
        fix(`desktop bad file (${tag}) showed no error message: ${msg.allText}`);
      } else if (tag === 'v1-3d' && !msg.allText.includes('v1')) {
        fix(`desktop v1 file did not mention v1 incompatibility: ${msg.allText}`);
      } else {
        badPassed++;
      }
      await page.waitForTimeout(450);
    }
    if (badPassed === badFiles.length) ok(`desktop rejected all ${badPassed} invalid files with clear error feedback`);

    // Pick valid exported file -> verify confirm dialog preview -> click Cancel -> state stays 111 & back to settings.
    await pickImportFile(page, exportedPath);
    const conf = await page.evaluate(() => ({
      open: !document.querySelector('#modal-backdrop').classList.contains('hidden'),
      type: document.querySelector('#modal')?.dataset.type || '',
      kind: document.querySelector('#modal')?.dataset.kind || '',
      p: document.querySelector('#modal .hv-confirm p')?.textContent.trim() || '',
      ask: document.querySelector('#modal .z2b-ask')?.textContent.trim() || '',
    }));
    if (!conf.open || conf.type !== 'confirm' || !conf.p.includes('遊戲時間 33 分鐘') || !conf.p.includes('34,567') || !conf.ask.includes('確定要匯入')) {
      fix(`desktop import confirm preview unexpected: ${JSON.stringify(conf)}`);
    } else {
      ok(`desktop import confirm preview accurate ("${conf.p.slice(0, 48)}…")`);
    }
    await page.click('#modal-foot [data-action=confirmNo]');
    await page.waitForTimeout(300);
    const afterCancel = await page.evaluate(() => ({
      gold: globalThis.__mistvaleGame.state.gold,
      type: document.querySelector('#modal')?.dataset.type || '',
    }));
    if (afterCancel.gold !== 111 || afterCancel.type !== 'settings') {
      fix(`desktop cancel import misbehaved: ${JSON.stringify(afterCancel)}`);
    } else {
      ok('desktop cancel import returned to settings without modifying state');
    }

    // Re-pick the SAME file (tests input.value reset!) -> confirm import -> verify full restoration + cleanup + localStorage!
    await pickImportFile(page, exportedPath);
    await page.click('#modal-foot [data-action=confirmYes]');
    await page.waitForTimeout(600);
    const afterImp = await page.evaluate(() => {
      const s = globalThis.__mistvaleGame.state;
      const ls = JSON.parse(localStorage.getItem('mistvale-pixel-v2') || 'null');
      return {
        modalHidden: document.querySelector('#modal-backdrop').classList.contains('hidden'),
        modalType: document.querySelector('#modal')?.dataset.type || '',
        piloting: document.body.classList.contains('piloting'),
        gold: s.gold, gems: s.gems, time: s.time, speed: s.speed, region: s.region,
        hall: s.buildings.hall, forge: s.buildings.forge,
        craftFood: s.craftTargets.food, tradeStandingOre: s.tradeStanding.ore, autoJunk: s.autoJunk,
        densityMeadow: s.regionDensity.meadow, densitySnow: s.regionDensity.snow,
        settings: { ...s.settings }, gearStockW3: s.gearStock.sword[3],
        gearStorageLen: s.gearStorage.length, gearStorage0: s.gearStorage[0]?.grade || 1,
        wanderKills: s.wanderKills, promoted: s.counts.promoted, autoJunkCount: s.counts.autoJunk,
        h0Name: s.hunters[0].name, h0Gender: s.hunters[0].gender, h0Level: s.hunters[0].level,
        difficulty: s.difficulty, bestFloor: s.dungeon.bestFloor, startFloor: s.dungeon.startFloor, dgAuto: s.dungeon.auto,
        dgIds: [...s.dungeon.hunterIds], arWins: s.arena.wins, arIds: [...s.arena.hunterIds],
        team2: { ids: [...s.dispatchTeams[2].ids], region: s.dispatchTeams[2].region },
        lsGold: ls?.gold, lsHall: ls?.buildings?.hall, lsWanderKills: ls?.wanderKills,
        hudGold: document.querySelector('#gold')?.textContent.trim(),
        dayClock: !!document.querySelector('#day-clock'),
      };
    });
    const mismatches = [];
    if (!afterImp.modalHidden) mismatches.push(`modal still open (${afterImp.modalType})`);
    if (afterImp.piloting) mismatches.push('pilot mode not cleared');
    for (const k of ['gold', 'gems', 'time', 'speed', 'region', 'hall', 'forge', 'craftFood', 'tradeStandingOre', 'autoJunk', 'densityMeadow', 'densitySnow', 'gearStockW3', 'wanderKills', 'promoted', 'autoJunkCount', 'h0Name', 'h0Gender', 'h0Level', 'difficulty', 'bestFloor', 'startFloor', 'dgAuto', 'arWins']) {
      if (afterImp[k] !== expected[k]) mismatches.push(`${k}: got ${afterImp[k]}, want ${expected[k]}`);
    }
    if (JSON.stringify(afterImp.settings) !== JSON.stringify(expected.settings)) mismatches.push('settings mismatch');
    if (JSON.stringify(afterImp.dgIds) !== JSON.stringify(expected.dgIds)) mismatches.push('dgIds mismatch');
    if (JSON.stringify(afterImp.arIds) !== JSON.stringify(expected.arIds)) mismatches.push('arIds mismatch');
    if (JSON.stringify(afterImp.team2) !== JSON.stringify(expected.team2)) mismatches.push('team2 mismatch');
    if (afterImp.gearStorageLen !== 1 || afterImp.gearStorage0 !== 3) mismatches.push('gearStorage mismatch');
    if (afterImp.lsGold !== expected.gold || afterImp.lsHall !== expected.hall || afterImp.lsWanderKills !== expected.wanderKills) mismatches.push('localStorage not persisted');
    if (afterImp.hudGold !== '34,567' || afterImp.dayClock) mismatches.push(`HUD mismatch (${afterImp.hudGold}, day clock ${afterImp.dayClock})`);
    if (mismatches.length) fix(`desktop import state mismatches: ${mismatches.join('; ')}`);
    else ok('desktop import restored all state, cleared pilot, updated HUD & persisted to localStorage');

    // Reload page -> verify localStorage persists imported save across full reload!
    // Boot unpauses live simulation, so gold/wanderKills may tick forward slightly during settle.
    await L.boot(page, srv.url);
    const afterReload = await page.evaluate(() => {
      const s = globalThis.__mistvaleGame.state;
      return { gold: s.gold, time: s.time, hall: s.buildings.hall, h0Name: s.hunters[0].name, wanderKills: s.wanderKills, settingsQ: s.settings.quality, densitySnow: s.regionDensity.snow };
    });
    if (afterReload.gold < expected.gold || afterReload.time < expected.time || afterReload.hall !== expected.hall || afterReload.h0Name !== expected.h0Name || afterReload.wanderKills < expected.wanderKills || afterReload.settingsQ !== 'low' || afterReload.densitySnow !== 3) {
      fix(`desktop reload did not preserve imported save: ${JSON.stringify(afterReload)}`);
    } else {
      ok('desktop reload preserved imported save from localStorage');
    }

    // Legacy v2 save import via UI -> verify migration notice + clean upgrade.
    const v2Save = JSON.parse(fs.readFileSync(exportedPath, 'utf8'));
    v2Save.version = 2; v2Save.gold = 22222;
    v2Save.hunters[0].classId = 'ranger';
    v2Save.hunters[0].equipment = { weapon: true, armor: true };
    delete v2Save.hunters[0].gear;
    delete v2Save.gearStorage;
    const v2Path = writeTmp('legacy-v2.json', '\uFEFF' + JSON.stringify(v2Save));
    await openSettings(page);
    await pickImportFile(page, v2Path);
    const v2Text = await page.evaluate(() => document.querySelector('#modal .hv-confirm p')?.textContent || '');
    if (!v2Text.includes('舊版（v2）')) fix(`v2 confirm dialog missing upgrade notice: ${v2Text}`);
    await page.click('#modal-foot [data-action=confirmYes]');
    await page.waitForTimeout(500);
    const v2Res = await page.evaluate(() => {
      const s = globalThis.__mistvaleGame.state;
      return { version: s.version, gold: s.gold, cls0: s.hunters[0].classId, eqChest: s.hunters[0].gear?.chest?.itemId };
    });
    if (v2Res.version !== 4 || v2Res.gold !== 22222 || v2Res.cls0 !== 'archer' || v2Res.eqChest !== 'craft_chest') {
      fix(`desktop legacy v2 import failed: ${JSON.stringify(v2Res)}`);
    } else {
      ok('desktop legacy v2 save imported & migrated cleanly (BOM + ranger→archer + armor→craft)');
    }

    if (errs.length) fix(`desktop page errors: ${errs.join(' | ')}`);
    await ctx.close();
  }

  // ── 2. Phone E2E (390×844): touch targets, layout, export & import round-trip ──
  {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, acceptDownloads: true,
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
    });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e).slice(0, 240)));

    await L.boot(page, srv.url);
    await page.evaluate(() => { globalThis.__mistvaleGame.state.paused = true; globalThis.__mistvaleGame.state.gold = 19876; });
    await openSettings(page);

    const mLayout = await page.evaluate(() => {
      const c = document.querySelector('#modal-content');
      const exp = c.querySelector('[data-action=export]')?.getBoundingClientRect();
      const imp = c.querySelector('[data-action=importSave]')?.getBoundingClientRect();
      return {
        hscroll: c.scrollWidth - c.clientWidth,
        expH: exp ? Math.round(exp.height) : 0, expW: exp ? Math.round(exp.width) : 0,
        impH: imp ? Math.round(imp.height) : 0, impW: imp ? Math.round(imp.width) : 0,
      };
    });
    if (mLayout.hscroll > 1) fix(`phone settings horizontal overflow ${mLayout.hscroll}px`);
    else if (mLayout.expH < 40 || mLayout.impH < 40) fix(`phone buttons too small: ${JSON.stringify(mLayout)}`);
    else ok(`phone settings export(${mLayout.expW}x${mLayout.expH}) + import(${mLayout.impW}x${mLayout.impH}), no overflow`);

    await page.evaluate(() => document.querySelector('#modal-content [data-action=export]')?.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(150);
    const [dl] = await Promise.all([
      page.waitForEvent('download', { timeout: 5000 }),
      page.tap('#modal-content [data-action=export]'),
    ]);
    const phoneSave = path.join(tmpDir, 'phone-export.json');
    await dl.saveAs(phoneSave);
    await page.evaluate(() => { globalThis.__mistvaleGame.state.gold = 5; });

    await page.evaluate(() => document.querySelector('#modal-content [data-action=importSave]')?.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(150);
    const [fc] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 5000 }),
      page.tap('#modal-content [data-action=importSave]'),
    ]);
    await fc.setFiles(phoneSave);
    await page.waitForTimeout(350);
    await page.tap('#modal-foot [data-action=confirmYes]');
    await page.waitForTimeout(500);
    const phoneGold = await page.evaluate(() => globalThis.__mistvaleGame.state.gold);
    if (phoneGold !== 19876) fix(`phone import failed: gold=${phoneGold}, want 19876`);
    else ok('phone export + import round-trip succeeded (gold 5 → 19,876)');

    if (errs.length) fix(`phone page errors: ${errs.join(' | ')}`);
    await ctx.close();
  }
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  await browser.close();
  srv.stop();
}

for (const o of oks) console.log('ok  ' + o);
if (fails.length) {
  for (const f of fails) console.log('FIX ' + f);
  process.exit(1);
}
console.log(`PASS save-export-import: ${oks.length} checks passed across desktop & phone`);
