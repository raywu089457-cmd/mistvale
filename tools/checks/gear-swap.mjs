// gear-swap.mjs — task-7 acceptance: equipment drives the hero sheet / weapon part sheet.
//
// Reads the live selection hook introduced for this task:
//   window.__mistvaleGear(hunter?) -> { bodySheet, weaponSheet, bodyBakesWeapon, equipped: { weapon, armor } }
// (defaults to the first hunter; computed fresh on every call).
//
// Asserts, in the real built game (throwaway server.mjs on the freshly built outputs/暮影村.html):
//   a) no equipment        -> body '<class>',          weapon '<class>-weapon'
//   b) equipment.weapon    -> weapon '<class>-weapon-fine', body unchanged
//   c) equipment.armor     -> body   '<class>-armor',  weapon '<class>-weapon-fine' (current contract:
//                             the armour sheet is a weaponless full-body re-render carrying meta.parts,
//                             so the weapon part keeps drawing through it; if the armour sheet instead
//                             bakes the weapon (older incarnation) the check expects weapon '' and
//                             bodyBakesWeapon true — both are asserted from the sheet's own meta)
//   d) armour only         -> body   '<class>-armor',  weapon '<class>-weapon'
//   e) all four sheets are embedded/loaded, the archer meta declares the weapon part
//   f) no page errors / console errors, no "missing equipment part sheet" warning while the
//      live game is left drawing a few frames with each combination
//
// Exit 0 = PASS, 1 = FAIL (FAIL lines first, then a one-line summary).
import * as L from './fix-a-lib.mjs';

const CLS = 'archer';
const fails = [];
const ok = (m) => console.log('ok  ' + m);
const fix = (m) => { fails.push(m); console.log('FIX ' + m); };
const armoured = (key) => key === 'armor' || key === 'armorOnly';

const srv = await L.startServer();
const browser = await L.launch();
try {
  const ctx = await L.newCtx(browser, L.VIEWS.desktop);
  const page = await ctx.newPage();
  const errors = [], partWarns = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e.message).split('\n')[0].slice(0, 160)));
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' && !/favicon/i.test(t)) errors.push('console.error: ' + t.slice(0, 160));
    if (m.type() === 'warning' && /missing equipment part sheet/.test(t)) partWarns.push(t.slice(0, 160));
  });

  await L.boot(page, srv.url);

  const r = await page.evaluate(async (cls) => {
    const hook = globalThis.__mistvaleGear;
    const g = globalThis.__mistvaleGame;
    if (typeof hook !== 'function') return { hook: false };
    const h = (g?.state?.hunters || [])[0];
    if (!h) return { hook: true, hunter: false };
    const orig = { classId: h.classId, equipment: { ...(h.equipment || {}) } };
    h.classId = cls;
    const set = (weapon, armor) => { h.equipment = { weapon: !!weapon, armor: !!armor }; return hook(); };
    const out = {};
    out.none = set(false, false);
    // let the live renderer paint with each combination (drawSheetHero runs from RAF)
    await new Promise((r) => setTimeout(r, 220));
    out.weapon = set(true, false);
    await new Promise((r) => setTimeout(r, 220));
    out.armor = set(true, true);
    await new Promise((r) => setTimeout(r, 220));
    out.armorOnly = set(false, true);
    await new Promise((r) => setTimeout(r, 220));
    out.restored = set(false, false);
    await new Promise((r) => setTimeout(r, 120));
    h.classId = orig.classId;
    h.equipment = orig.equipment;
    const loaded = Object.keys(globalThis.__mistvaleHeroSheets?.() || {});
    const base = globalThis.PIXEL_ASSETS?.heroSheets?.[cls]?.meta;
    const ids = [cls, cls + '-weapon', cls + '-weapon-fine', cls + '-armor'];
    // does the body sheet paint the weapon itself (no weapon part) or does it carry meta.parts?
    const bakes = {};
    const partsOf = {};
    for (const id of ids) {
      const meta = globalThis.PIXEL_ASSETS?.heroSheets?.[id]?.meta;
      const parts = (meta?.parts || []).map((p) => ({ id: p.id, sheet: p.sheet }));
      partsOf[id] = parts;
      bakes[id] = !parts.some((p) => p.id === 'weapon');
    }
    return {
      hook: true,
      hunter: true,
      out,
      loaded,
      bakes,
      partsOf,
      parts: (base?.parts || []).map((p) => ({ id: p.id, sheet: p.sheet })),
    };
  }, CLS);

  if (!r.hook) fix('no window.__mistvaleGear hook (implementation not applied or not built)');
  else if (!r.hunter) fix('game state has no hunters to inspect');
  else {
    // The armour sheet may bake the weapon (older incarnation) or be a weaponless body carrying
    // meta.parts (current). Both are legal: derive the weapon expectation from the sheet's own meta.
    const want = [
      ['none', CLS, CLS + '-weapon'],
      ['weapon', CLS, CLS + '-weapon-fine'],
      ['armor', CLS + '-armor', CLS + '-weapon-fine'],
      ['armorOnly', CLS + '-armor', CLS + '-weapon'],
      ['restored', CLS, CLS + '-weapon'],
    ];
    for (const [key, body, weaponPart] of want) {
      const g = r.out?.[key] || {};
      const bakes = r.bakes?.[body] === true;
      const weapon = bakes ? '' : weaponPart;
      if (g.bodySheet !== body) fix(`${key}: body sheet ${JSON.stringify(g.bodySheet)} != ${body}`);
      if (g.weaponSheet !== weapon) fix(`${key}: weapon sheet ${JSON.stringify(g.weaponSheet)} != ${JSON.stringify(weapon)}${bakes ? ' (body bakes the weapon)' : ''}`);
      if (!!g.bodyBakesWeapon !== bakes) fix(`${key}: bodyBakesWeapon ${g.bodyBakesWeapon}, expected ${bakes}`);
      const eq = g.equipped || {};
      if (key === 'weapon' && (!eq.weapon || eq.armor)) fix(`weapon: equipped flags ${JSON.stringify(eq)} (want weapon only)`);
      if (key === 'armor' && (!eq.weapon || !eq.armor)) fix(`armor: equipped flags ${JSON.stringify(eq)} (want both)`);
      if (key === 'armorOnly' && (eq.weapon || !eq.armor)) fix(`armorOnly: equipped flags ${JSON.stringify(eq)} (want armour only)`);
      if (!armoured(key) && key !== 'weapon' && (eq.weapon || eq.armor)) fix(`${key}: equipped flags ${JSON.stringify(eq)} (want none)`);
    }
    if (!fails.length) {
      const baked = r.bakes?.[CLS + '-armor'] === true;
      ok(`selection: unequipped ${CLS}/${CLS}-weapon, weapon->-weapon-fine, armour->${CLS}-armor ${baked ? '(weapon baked)' : '(weapon part draws through)'}, restored`);
    }

    const need = [CLS, CLS + '-weapon', CLS + '-weapon-fine', CLS + '-armor'];
    const missing = need.filter((id) => !r.loaded.includes(id));
    if (missing.length) fix(`sheets not embedded/loaded: ${missing.join(', ')}`);
    else ok(`all four sheets embedded: ${need.join(', ')}`);

    const wp = (r.parts || []).find((p) => p.id === 'weapon');
    if (!wp) fix(`${CLS} meta.parts has no weapon part (body sheet still bakes the weapon?)`);
    else if (wp.sheet !== CLS + '-weapon') fix(`${CLS} meta.parts weapon points at ${wp.sheet}, expected ${CLS}-weapon`);
    else ok(`${CLS} meta.parts weapon -> ${wp.sheet}`);

    if (r.bakes?.[CLS + '-armor'] === false) {
      const awp = (r.partsOf?.[CLS + '-armor'] || []).find((p) => p.id === 'weapon');
      if (!awp || awp.sheet !== CLS + '-weapon') fix(`${CLS}-armor meta.parts weapon -> ${awp?.sheet}, expected ${CLS}-weapon`);
      else ok(`${CLS}-armor is weaponless and declares weapon part -> ${awp.sheet} (fine variant draws through)`);
    }
  }

  if (partWarns.length) fix(`"missing equipment part sheet" warnings: ${partWarns.slice(0, 3).join(' | ')}`);
  if (errors.length) fix(`page errors: ${errors.slice(0, 4).join(' | ')}`);
  else ok('no page errors');
  await ctx.close();
} finally {
  await browser.close().catch(() => {});
  srv.stop();
}

if (fails.length) {
  console.log(fails.map((f) => 'FAIL ' + f).join('\n'));
  console.log(`FAIL gear-swap: ${fails.length} problem(s)`);
  process.exit(1);
}
console.log('PASS gear-swap: equipment.weapon -> <class>-weapon-fine part, equipment.armor -> <class>-armor body (weaponless, weapon part draws through), fallbacks clean, no page errors');
