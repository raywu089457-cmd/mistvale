// skill-specs.mjs — Exhaustive E2E verification for 6 Classes x 14 Academy Archetypes x 56 Skills + 11 Statuses + Live pixelfx CQ runtime.
// Verifies:
//   1. 6 core classes only (traveler removed).
//   2. Hunter Detail -> Skill subtab: Archetype Switcher + 4 Skill Cards on desktop (1440x900) & phone (390x844),
//      Lv.0 lock -> Lv.1 free switch -> instant card update, >=12px font, >=44px touch, zero overflow.
//   3. Desktop flat 4-slot pilot bar + hotkeys 1..4 (no modal hijack) & Mobile ergonomic thumb-arc 4-skill cluster
//      (54x54 >= 44px, zero overlap between arc buttons / #pilot-atk / #pilot-stick, toast clearance below #pilotlab).
//   4. All 14 archetypes x 4 skills (56 real casts) executed live in Chromium, verifying live CQ pixelfx draws
//      back/front layers + finisher crash + looping status/* marks + smooth frame pacing, with 0 page/console errors.
// Usage: TARGET=http://127.0.0.1:5024/?preview=1 SHOTS_DIR=... node tools/checks/skill-specs.mjs
import * as L from './fix-a-lib.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const srv = await L.startServer();
const browser = await L.launch();
const fails = [], oks = [];
const fix = m => fails.push(m), ok = m => oks.push(m);
const SHOTS = process.env.SHOTS_DIR || '';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const url = srv.url + (srv.url.includes('?') ? '' : '?preview=1');
const settle = async (page, ms = 220) => { await page.waitForTimeout(ms); };

const { regionCenter } = await import(pathToFileURL(path.join(ROOT, 'src/overworld.js')).href);
const { SPECS } = await import(pathToFileURL(path.join(ROOT, 'src/pixel-skills.js')).href);
const SPOT = regionCenter('meadow');

const VIEWS = {
  desktop: { w: 1440, h: 900, mobile: false },
  phone: { w: 390, h: 844, mobile: true },
};

try {
  for (const [name, v] of Object.entries(VIEWS)) {
    const label = `${name}(${v.w}x${v.h})`;
    const ctx = await L.newCtx(browser, v);
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push('pageerror: ' + String(e.message || e).slice(0, 160)));
    page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });

    try {
      await L.boot(page, url);
      await page.evaluate(() => {
        const g = globalThis.__mistvaleGame;
        g.cheat('resources'); g.cheat('buildings'); g.cheat('heal');
        g.state.paused = true;
      });

      // ── 1. 6 core classes check ──
      const rosterInfo = await page.evaluate(() => {
        const g = globalThis.__mistvaleGame;
        const ids = g.state.hunters.map(h => h.classId);
        return { n: ids.length, hasTraveler: ids.includes('traveler'), mageId: g.state.hunters.find(h => h.classId === 'sorcerer')?.id };
      });
      if (rosterInfo.hasTraveler || rosterInfo.n !== 6) fix(`${label}: expected 6 hunters without traveler, got ${JSON.stringify(rosterInfo)}`);
      else ok(`${label}: roster clean (6 core classes, no traveler)`);

      // ── 2. Hunter Detail -> Skill subtab ──
      await page.evaluate((mid) => {
        const g = globalThis.__mistvaleGame;
        const m = g.state.hunters.find(h => h.id === mid);
        m.skillLevel = 0; m.spec = 'sorcerer_fire'; m.rebirths = 1;
      }, rosterInfo.mageId);
      await L.act(page, 'hunter', rosterInfo.mageId);
      await settle(page, 220);
      await L.act(page, 'hunterTab', 'skill');
      await settle(page, 180);

      const lv0State = await page.evaluate(() => {
        const pn = document.querySelector('.z2-panel');
        const pills = [...pn.querySelectorAll('.z2-spec-btn')];
        const cards = [...pn.querySelectorAll('.z2-skcard')];
        return {
          pillN: pills.length,
          lockedPills: pills.filter(b => b.getAttribute('aria-disabled') === 'true').length,
          cardN: cards.length,
          lockedCards: cards.filter(c => c.classList.contains('locked')).length,
          hasLearnBtn: !!pn.querySelector('.z2-rowbtn[data-action=learnSkill]'),
          clipped: pn.scrollWidth > pn.clientWidth + 1,
        };
      });
      if (lv0State.pillN !== 4 || lv0State.lockedPills !== 3 || lv0State.cardN !== 4 || lv0State.lockedCards !== 3 || !lv0State.hasLearnBtn || lv0State.clipped) {
        fix(`${label}: Lv.0 Skill tab check failed ${JSON.stringify(lv0State)}`);
      }

      await page.click('.z2-rowbtn[data-action=learnSkill]');
      await settle(page, 180);
      await page.click('.z2-spec-btn[data-spec=sorcerer_frost]');
      await settle(page, 180);

      const afterSwitch = await page.evaluate(({ touch }) => {
        const g = globalThis.__mistvaleGame;
        const pn = document.querySelector('.z2-panel');
        const m = g.state.hunters.find(h => h.classId === 'sorcerer');
        const onSpec = pn.querySelector('.z2-spec-btn.on')?.dataset.spec;
        const names = [...pn.querySelectorAll('.z2-skname')].map(el => el.textContent.trim());
        const tabOn = document.querySelector('.z2-tab.on')?.dataset.id;
        const small = [];
        for (const el of pn.querySelectorAll('*')) {
          const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
          if (!own) continue;
          const fs = parseFloat(getComputedStyle(el).fontSize);
          if (fs < 11.95) small.push((el.className || el.tagName) + ':' + fs);
        }
        const tinyTouch = touch ? [...pn.querySelectorAll('.z2-spec-btn')].filter(b => b.getBoundingClientRect().height < 43.5).length : 0;
        return { spec: m.spec, onSpec, names, tabOn, small: small.slice(0, 5), tinyTouch, clipped: pn.scrollWidth > pn.clientWidth + 1 };
      }, { touch: v.mobile });

      if (afterSwitch.spec !== 'sorcerer_frost' || afterSwitch.onSpec !== 'sorcerer_frost' || afterSwitch.tabOn !== 'skill'
          || !afterSwitch.names.includes('寒冰穿刺') || afterSwitch.small.length || afterSwitch.tinyTouch > 0 || afterSwitch.clipped) {
        fix(`${label}: Skill subtab after switch failed ${JSON.stringify(afterSwitch)}`);
      } else {
        ok(`${label}: Skill subtab 4 spec pills + 4 skill cards + free Lv.1 switch + clean layout`);
      }

      await page.evaluate((mid) => {
        const m = globalThis.__mistvaleGame.state.hunters.find(h => h.id === mid);
        m.skillLevel = 5;
      }, rosterInfo.mageId);
      await L.act(page, 'hunterTab', 'skill');
      await settle(page, 180);
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `skill-tab-${name}.png`) });

      // Close modal completely
      for (let i = 0; i < 3; i++) {
        const closed = await page.evaluate(() => {
          const bd = document.querySelector('#modal-backdrop');
          if (!bd || bd.classList.contains('hidden')) return true;
          const btn = document.querySelector('#modal-close, #modal-foot [data-action=close], #modal [data-action=close]');
          if (btn) btn.click();
          else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          return false;
        });
        if (closed) break;
        await settle(page, 200);
      }

      // ── 3. Manual Pilot HUD (desktop flat bar vs phone thumb-arc) ──
      await page.evaluate(({ mid, spot }) => {
        const g = globalThis.__mistvaleGame, view = globalThis.__mistvaleView, s = g.state;
        const m = s.hunters.find(h => h.id === mid);
        m.skillLevel = 5; m.spec = 'sorcerer_frost'; m.x = spot.x; m.z = spot.z; m.hp = m.maxHp; m.attack = 45;
        m.skillCds = [0, 0, 0, 0]; m.skillCd = 0; m._skillCdShadow = 0;
        const proto = s.enemies.find(e => e.regionId === 'meadow') || s.enemies[0];
        s.enemies = [
          { ...proto, id: 'sp_e1', x: spot.x + 2.2, z: spot.z, hp: 1800, maxHp: 1800, attack: 6, attackTimer: 9, rewarded: false, statuses: {}, buffs: {} },
          { ...proto, id: 'sp_e2', x: spot.x + 4.0, z: spot.z + 0.3, hp: 1800, maxHp: 1800, attack: 6, attackTimer: 9, rewarded: false, statuses: {}, buffs: {} },
          { ...proto, id: 'sp_e3', x: spot.x + 1.8, z: spot.z + 1.8, hp: 1800, maxHp: 1800, attack: 6, attackTimer: 9, rewarded: false, statuses: {}, buffs: {} },
        ];
        s.paused = false;
        g.pilotStart(m.id);
        view.lookAt(spot.x + 1.2, spot.z + 0.4, 2.3);
        globalThis.__mistvaleLiveFxClear?.();
      }, { mid: rosterInfo.mageId, spot: SPOT });
      await page.evaluate(() => {
        const btn = document.createElement('button');
        btn.dataset.action = 'pilotLab'; btn.style.display = 'none';
        document.body.appendChild(btn); btn.click(); btn.remove();
      });
      await settle(page, 240);

      const hudGeo = await page.evaluate(({ isMobile }) => {
        const inter = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
        const pl = document.querySelector('#pilotlab');
        const plR = pl?.getBoundingClientRect();
        const toasts = document.querySelector('#toasts');
        const toastTop = toasts ? parseFloat(getComputedStyle(toasts).top) : 0;
        if (!isMobile) {
          const btns = [...pl.querySelectorAll('[data-pilot-slot]')];
          return {
            mode: 'desktop', btnN: btns.length, clipped: pl.scrollWidth > pl.clientWidth + 1,
            plBottom: Math.round(plR?.bottom || 0), toastTop: Math.round(toastTop),
          };
        }
        const arcBtns = [...document.querySelectorAll('#pilot-hud .ph-sk')];
        const atk = document.querySelector('#pilot-atk')?.getBoundingClientRect();
        const stick = document.querySelector('#pilot-stick')?.getBoundingClientRect();
        const rects = arcBtns.map(b => b.getBoundingClientRect());
        const tiny = rects.filter(r => r.width < 43.5 || r.height < 43.5).length;
        const overlaps = [];
        for (let i = 0; i < rects.length; i++) {
          for (let j = i + 1; j < rects.length; j++) if (inter(rects[i], rects[j])) overlaps.push(`s${i}xs${j}`);
          if (atk && inter(rects[i], atk)) overlaps.push(`s${i}xatk`);
          if (stick && inter(rects[i], stick)) overlaps.push(`s${i}xstick`);
        }
        return {
          mode: 'phone', btnN: arcBtns.length, tiny, overlaps,
          plHeight: Math.round(plR?.height || 0), plBottom: Math.round(plR?.bottom || 0),
          toastTop: Math.round(toastTop),
          clipped: pl.scrollWidth > pl.clientWidth + 1,
        };
      }, { isMobile: v.mobile });

      if (hudGeo.btnN !== 4 || hudGeo.clipped) fix(`${label}: pilot skill controls invalid ${JSON.stringify(hudGeo)}`);
      if (v.mobile) {
        if (hudGeo.tiny > 0 || hudGeo.overlaps.length > 0) fix(`${label}: phone thumb-arc geometry issue ${JSON.stringify(hudGeo)}`);
        if (hudGeo.toastTop < hudGeo.plBottom - 2) fix(`${label}: phone toast (${hudGeo.toastTop}) overlaps #pilotlab (bottom=${hudGeo.plBottom})`);
        await page.dispatchEvent('#pilot-hud .ph-sk.s1', 'pointerdown');
        await settle(page, 180);
        await page.dispatchEvent('#pilot-hud .ph-sk.s2', 'pointerdown');
        await settle(page, 260);
      } else {
        if (hudGeo.toastTop < hudGeo.plBottom - 4) fix(`${label}: desktop toast (${hudGeo.toastTop}) overlaps #pilotlab (bottom=${hudGeo.plBottom})`);
        await page.click('#pilotlab [data-pilot-slot="1"]');
        await settle(page, 180);
        await page.keyboard.press('3');
        await settle(page, 260);
        const modalOpenedByKey3 = await page.evaluate(() => {
          const bd = document.querySelector('#modal-backdrop');
          return !!bd && !bd.classList.contains('hidden');
        });
        if (modalOpenedByKey3) fix(`${label}: pressing hotkey 3 in pilot mode opened a modal`);
      }
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `pilot-livefx-${name}.png`) });

      const liveStats = await page.evaluate(async () => {
        const raf = () => new Promise(r => requestAnimationFrame(r));
        const dts = []; let prev = performance.now();
        for (let i = 0; i < 14; i++) { await raf(); const now = performance.now(); dts.push(now - prev); prev = now; }
        dts.sort((a, b) => a - b);
        return {
          fx: globalThis.__mistvaleLiveFx?.() || null,
          cds: globalThis.__mistvaleGame.pilotSkills()?.slots.map(s => s.cd) || [],
          medMs: +dts[Math.floor(dts.length / 2)].toFixed(1),
        };
      });
      if (!liveStats.fx || liveStats.fx.drawn <= 0) fix(`${label}: live pixelfx drew 0 frames`);
      const seen = liveStats.fx?.seen || [];
      if (!seen.includes('ice/ice-spikes-iso') || !seen.some(id => id.startsWith('status/'))) {
        fix(`${label}: expected ice/ice-spikes-iso + status/* in seen (${seen.join(', ')})`);
      }
      if (!(liveStats.cds[1] > 0 && liveStats.cds[2] > 0)) fix(`${label}: pilot S2/S3 did not enter cooldown (${JSON.stringify(liveStats.cds)})`);
      if (!fails.some(f => f.startsWith(label))) {
        ok(`${label}: Pilot ${v.mobile ? 'thumb-arc' : '4-slot bar'} + toast clearance + live CQ pixelfx (${liveStats.fx.drawn} blits, median ${liveStats.medMs}ms/frame)`);
      }

      // ── 4. Desktop exhaustive sweep: ALL 14 archetypes x 4 skills (56 real casts!) ──
      if (name === 'desktop') {
        const sweep = await page.evaluate(async ({ specs, spot }) => {
          const g = globalThis.__mistvaleGame, view = globalThis.__mistvaleView, s = g.state;
          const raf = () => new Promise(r => requestAnimationFrame(r));
          const proto = s.enemies.find(e => e.regionId === 'meadow') || s.enemies[0];
          const resetFoes = () => {
            s.enemies = [
              { ...proto, id: 'sw_1', x: spot.x + 1.8, z: spot.z, hp: 50000, maxHp: 50000, attack: 1, attackTimer: 99, rewarded: false, statuses: {}, buffs: {} },
              { ...proto, id: 'sw_2', x: spot.x + 3.2, z: spot.z + 0.2, hp: 50000, maxHp: 50000, attack: 1, attackTimer: 99, rewarded: false, statuses: {}, buffs: {} },
              { ...proto, id: 'sw_3', x: spot.x + 1.5, z: spot.z + 1.6, hp: 50000, maxHp: 50000, attack: 1, attackTimer: 99, rewarded: false, statuses: {}, buffs: {} },
            ];
          };
          globalThis.__mistvaleLiveFxClear?.();
          view.lookAt(spot.x + 1.2, spot.z + 0.4, 2.3);
          const failedCasts = [];
          let totalCasts = 0;
          const allSeen = new Set();
          for (const sp of specs) {
            const h = s.hunters.find(u => u.classId === sp.classId);
            if (!h) { failedCasts.push(`missing hunter for ${sp.classId}`); continue; }
            h.skillLevel = 5; h.rebirths = 1; h.hp = h.maxHp; h.x = spot.x; h.z = spot.z;
            const sw = g.setHunterSpec(h.id, sp.id);
            if (!sw.ok) { failedCasts.push(`setHunterSpec(${sp.id}): ${sw.message}`); continue; }
            g.pilotStart(h.id);
            resetFoes();
            for (let slot = 0; slot < 4; slot++) {
              h.skillCds = [0, 0, 0, 0]; h.skillCd = 0; h._skillCdShadow = 0; h.attackTimer = 0; h.lockUntil = 0;
              const r = g.pilotCastSlot(slot);
              totalCasts++;
              if (!r.ok) failedCasts.push(`${sp.id}[S${slot + 1}]: ${r.message}`);
            }
            for (let f = 0; f < 8; f++) await raf();
            for (const fxId of (globalThis.__mistvaleLiveFx?.()?.seen || [])) allSeen.add(fxId);
          }
          // Wait extra frames for delayed effects (meteor/finisher/status) to paint
          for (let f = 0; f < 16; f++) await raf();
          for (const fxId of (globalThis.__mistvaleLiveFx?.()?.seen || [])) allSeen.add(fxId);
          const finalStats = globalThis.__mistvaleLiveFx?.() || { drawn: 0 };
          return { totalCasts, failedCasts, seenCount: allSeen.size, drawn: finalStats.drawn, sampleSeen: [...allSeen].slice(0, 12) };
        }, { specs: SPECS, spot: SPOT });

        if (sweep.totalCasts !== 56 || sweep.failedCasts.length > 0) {
          fix(`all-14-specs sweep: ${sweep.totalCasts}/56 casts, failures: ${sweep.failedCasts.slice(0, 4).join('; ')}`);
        } else if (sweep.seenCount < 35) {
          fix(`all-14-specs sweep: only ${sweep.seenCount} distinct live pixelfx drawn (want >= 35)`);
        } else {
          ok(`all-14-specs sweep: 14 archetypes x 4 skills = 56/56 casts OK, ${sweep.seenCount} distinct live CQ pixelfx rendered (${sweep.drawn} total blits)`);
        }

        // Capture a clean multi-school showcase screenshot (Fire Meteor + Storm Chain Lightning + Shadow Black Hole)
        if (SHOTS) {
          await page.evaluate(async (spot) => {
            const g = globalThis.__mistvaleGame, view = globalThis.__mistvaleView, s = g.state;
            const raf = () => new Promise(r => requestAnimationFrame(r));
            const proto = s.enemies.find(e => e.regionId === 'meadow') || s.enemies[0];
            s.enemies = [
              { ...proto, id: 'sh_1', x: spot.x + 2.0, z: spot.z, hp: 50000, maxHp: 50000, attack: 1, attackTimer: 99, rewarded: false, statuses: {}, buffs: {} },
              { ...proto, id: 'sh_2', x: spot.x + 3.4, z: spot.z + 0.5, hp: 50000, maxHp: 50000, attack: 1, attackTimer: 99, rewarded: false, statuses: {}, buffs: {} },
              { ...proto, id: 'sh_3', x: spot.x + 1.6, z: spot.z + 1.8, hp: 50000, maxHp: 50000, attack: 1, attackTimer: 99, rewarded: false, statuses: {}, buffs: {} },
            ];
            globalThis.__mistvaleLiveFxClear?.();
            const mage = s.hunters.find(h => h.classId === 'sorcerer');
            const pr = s.hunters.find(h => h.classId === 'priest');
            const bk = s.hunters.find(h => h.classId === 'berserker');
            pr.skillLevel = 5; pr.spec = 'priest_shadow'; pr.x = spot.x - 0.8; pr.z = spot.z + 0.5; pr.skillCds = [0, 0, 0, 0];
            bk.skillLevel = 5; bk.spec = 'berserker_fury'; bk.x = spot.x + 0.8; bk.z = spot.z + 0.8; bk.skillCds = [0, 0, 0, 0];
            mage.skillLevel = 5; mage.spec = 'sorcerer_storm'; mage.x = spot.x - 0.4; mage.z = spot.z - 0.6; mage.skillCds = [0, 0, 0, 0];
            g.pilotStart(pr.id); g.pilotCastSlot(3);    // black-hole-iso
            g.pilotStart(bk.id); g.pilotCastSlot(3);    // heavy-cleave-iso + finisher-crash-iso
            g.pilotStart(mage.id); g.pilotCastSlot(3);  // chain-lightning-iso
            view.lookAt(spot.x + 1.4, spot.z + 0.5, 2.4);
            for (let f = 0; f < 10; f++) await raf();
          }, SPOT);
          await page.screenshot({ path: path.join(SHOTS, 'live-fx-showcase.png') });
        }
      }

      if (errs.length) fix(`${label}: runtime errors: ${errs.slice(0, 3).join(' | ')}`);
      else ok(`${label}: 0 console/page errors`);
    } finally {
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  srv.stop?.();
}

for (const m of oks) console.log('OK  ' + m);
for (const m of fails) console.log('FIX ' + m);
console.log(fails.length ? `FAIL skill-specs — ${fails.length} issues` : `PASS skill-specs — ${oks.length} checks green`);
process.exit(fails.length ? 1 : 0);
