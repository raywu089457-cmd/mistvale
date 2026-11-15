// paperdoll-lab.js — 紙娃娃引擎的實驗面板。只在網址有 ?doll=1 時由 pixel-ui.js 掛上；
// 沒有這個參數時，這個模組不做任何事（沒有頂層副作用、不載圖、不 fetch）。
//
// 素材：assets/paperdoll/（pipeline/scripts/build_paperdoll_placeholder.py 產生的佔位圖），
// build.mjs 把它複製到 media/paperdoll/，這裡用 PIXEL_ASSETS.paperdollBase 找到它。
import { trackImage } from './asset-loading.js';
import {
  computeParts, drawParts, partCorners, lookFromHunter, actionTiming, getSlot, resolveAction,
  dirIndex, DIR_NAMES, GEAR_SLOTS, rideDepth, mountMotion, weaponFor, helmetSkin, RIG2X_SUFFIX,
} from './paperdoll.js';
import { dirSuffix, leftRow } from './dir4.js';

const CLASS_IDS = ['archer', 'sorcerer', 'priest', 'paladin', 'berserker', 'assassin'];
// death / victory：資料包沒有時，遊戲內是衍生的（hurt 末格倒下旋轉 / skill 舉起段循環，見 paperdoll-hero.js dollActionTick），實驗面板會顯示 row = 退回的動作
const ACTIONS = ['idle', 'walk', 'attack', 'skill', 'hurt', 'death', 'victory',
  // 騎乘（DV2 C1，docs/PAPERDOLL.md §20）：乗る_座る/立つ、乗る_攻撃_座る/立つ、乗る_攻撃2
  'ride_sit', 'ride_stand', 'ride_charge_sit', 'ride_charge_stand', 'ride_charge2',
  // 武器攻擊變體（§22）與 Phase 6 補齊的 DV2 動作組（docs/DV2-PHASE6.md G1，§23）
  'attack_h', 'attack_t', 'attack_v2', 'punch', 'punch2', 'shoot', 'guard', 'pose', 'jump_victory',
  'walk_unarmed', 'idle_unarmed', 'carry', 'carry_walk', 'cry', 'cry_sit', 'clap', 'give', 'handshake', 'petrify'];
const LAYER_COLOR = {
  body: '#ff5d5d', hand: '#ffb347', armor: '#c0ff6a', shield: '#5ad1ff', head: '#ffe36a',
  helmet: '#ff7ae0', weapon: '#7aa8ff', effect: '#ffffff', cape: '#b08cff',
};

export function mountPaperdollLab(opts = {}) {
  if (typeof document === 'undefined' || document.getElementById('paperdoll-lab')) return null;
  // 2026-11-13:跟遊戲同一包(DV2 格式原創包 assets/paperdoll-dv2),沒有才退回第 1 期的佔位包。
  const base = opts.base || globalThis.PIXEL_ASSETS?.paperdollDv2Base || globalThis.PIXEL_ASSETS?.paperdollBase || 'media/paperdoll/';   // 同遊戲:DV2 格式包優先,不讀 pixelfx 包
  const st = {
    cls: 'paladin', action: 'attack', dir: 'right', facing: 1,
    weapon: false, weaponLevel: 0, hideWeapon: false,
    gl_helm: false, gl_chest: false, gl_belt: false, gl_legs: false, gl_boots: false, gl_gloves: false,
    debug: false, playing: true, tick: 0, globalTick: 0,
    pick_helmet: '', pick_weapon: '', pick_armor: '',   // '' = 照 lookFromHunter(獵人裝備);其他 = 直接指定資料包裡的外觀(換帽/換武器/換甲截圖用)
    mount: '', mountWalk: true,   // 騎乘預覽：坐騎物種（'' = 不騎）；坐騎在騎乘待機時播走路
    gender: 'm', stone: false,    // Phase 6：性別（女性頭 head_f_*，沒有就是男性頭）、任何動作都套石化色調
  };
  let data = null, images = {}, acc = 0, last = 0, raf = 0;

  const root = document.createElement('div');
  root.id = 'paperdoll-lab';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Paperdoll lab');
  root.innerHTML = `
<style>
#paperdoll-lab{position:fixed;left:8px;top:8px;z-index:2147483000;background:#15131cf2;color:#e8e4f0;
  font:12px/1.4 ui-monospace,Consolas,monospace;border:1px solid #4a4560;border-radius:6px;padding:8px;
  max-width:calc(100vw - 16px);max-height:calc(100vh - 16px);overflow:auto;box-sizing:border-box;width:760px}
#paperdoll-lab header{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px}
#paperdoll-lab header b{font-size:13px}
#paperdoll-lab .pd-row{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:4px 0}
#paperdoll-lab canvas{image-rendering:pixelated;background:#3d4250;border:1px solid #2a2838;max-width:100%}
#paperdoll-lab .pd-thumbs canvas{cursor:pointer;width:120px;height:140px}
#paperdoll-lab .pd-thumbs canvas.on{outline:2px solid #e8c46a}
#paperdoll-lab .pd-main{display:flex;flex-wrap:wrap;gap:8px}
#paperdoll-lab button,#paperdoll-lab select,#paperdoll-lab input[type=number]{font:inherit;background:#2a2838;color:#e8e4f0;
  border:1px solid #4a4560;border-radius:4px;padding:3px 6px;min-height:28px}
#paperdoll-lab button.on{background:#5b4a1e;border-color:#e8c46a}
#paperdoll-lab .pd-dirs{display:grid;grid-template-columns:repeat(3,40px);gap:3px}
#paperdoll-lab .pd-dirs span{display:block}
#paperdoll-lab .pd-info{white-space:pre-wrap;color:#b8b2cc;min-width:220px;flex:1}
#paperdoll-lab label{display:inline-flex;gap:4px;align-items:center}
</style>
<header><b data-x="title">Paperdoll lab</b><button data-x="close" aria-label="close">✕</button></header>
<div class="pd-row pd-thumbs"></div>
<div class="pd-main">
  <canvas class="pd-big" width="360" height="420"></canvas>
  <div style="flex:1;min-width:260px">
    <div class="pd-row"><label>action <select data-x="action"></select></label>
      <label>class <select data-x="cls"></select></label></div>
    <div class="pd-row"><label>helmet <select data-x="pick_helmet"></select></label>
      <label>weapon <select data-x="pick_weapon"></select></label>
      <label>armor <select data-x="pick_armor"></select></label></div>
    <div class="pd-row"><label>gender <select data-x="gender"><option value="m">m</option><option value="f">f</option></select></label>
      <label><input type="checkbox" data-x="stone"> stone tint (petrify)</label><span data-x="riginfo"></span></div>
    <div class="pd-row"><label>mount <select data-x="mount"></select></label>
      <label><input type="checkbox" data-x="mountWalk"> mount walks</label><span data-x="mountinfo"></span></div>
    <div class="pd-row"><div class="pd-dirs"></div><span data-x="dirinfo"></span></div>
    <div class="pd-row">
      <label><input type="checkbox" data-x="weapon"> fine weapon</label>
      <label><input type="checkbox" data-x="gl_helm"> 頭</label>
      <label><input type="checkbox" data-x="gl_chest"> 胸</label>
      <label><input type="checkbox" data-x="gl_belt"> 腰</label>
      <label><input type="checkbox" data-x="gl_legs"> 腿</label>
      <label><input type="checkbox" data-x="gl_boots"> 靴</label>
      <label><input type="checkbox" data-x="gl_gloves"> 手</label>
      <label><input type="checkbox" data-x="hideWeapon"> hide weapon</label>
      <label>weaponLv <input type="number" min="0" max="10" value="0" data-x="weaponLevel" style="width:48px"></label>
    </div>
    <div class="pd-row">
      <button data-x="play">⏸ pause</button><button data-x="back">◀ tick</button><button data-x="fwd">tick ▶</button>
      <button data-x="restart">⟲ 0</button>
      <label><input type="checkbox" data-x="debug"> debug (layer boxes + pivot)</label>
    </div>
    <div class="pd-info" data-x="info">loading…</div>
  </div>
</div>
<div class="pd-row" style="margin-top:6px">every slot × 4 directions (rows: up, right, down, left) — current action, class and equipment</div>
<canvas class="pd-strip" width="480" height="560"></canvas>`;
  document.body.appendChild(root);
  const $ = sel => root.querySelector(`[data-x="${sel}"]`);
  const big = root.querySelector('.pd-big');
  const strip = root.querySelector('.pd-strip');
  const thumbsEl = root.querySelector('.pd-thumbs');
  $('title').textContent = 'Paperdoll lab · ' + (/paperdoll-dv2/.test(base) ? 'DV2 格式原創包' : 'placeholder art');

  // ---- controls
  for (const a of ACTIONS) $('action').add(new Option(a, a));
  for (const c of CLASS_IDS) $('cls').add(new Option(c, c));
  $('action').value = st.action; $('cls').value = st.cls;
  const thumbs = CLASS_IDS.map(c => {
    const cv = document.createElement('canvas');
    cv.width = 120; cv.height = 140; cv.title = c;
    cv.addEventListener('click', () => { st.cls = c; $('cls').value = c; });
    thumbsEl.appendChild(cv);
    return cv;
  });
  // 十字方向鍵（4 方向，2026-11-13 起沒有斜向）：上 / 左 右 / 下
  const grid = [null, 'up', null, 'left', null, 'right', null, 'down', null];
  const arrows = { up: '↑', left: '←', right: '→', down: '↓' };
  const dirBtns = {};
  for (const d of grid) {
    const b = document.createElement(d ? 'button' : 'span');
    if (d) { b.textContent = arrows[d]; b.title = d; b.addEventListener('click', () => { st.dir = d; }); dirBtns[d] = b; }
    root.querySelector('.pd-dirs').appendChild(b);
  }
  $('action').addEventListener('change', e => { st.action = e.target.value; st.tick = 0; });
  $('cls').addEventListener('change', e => { st.cls = e.target.value; });
  for (const k of ['pick_helmet', 'pick_weapon', 'pick_armor', 'gender']) $(k).addEventListener('change', e => { st[k] = e.target.value; });
  // 坐騎清單：assets/mounts.json（build 內嵌成 PIXEL_ASSETS.mounts）；圖用遊戲同一份 monsters3 sheet
  const MOUNTS = () => globalThis.PIXEL_ASSETS?.mounts?.mounts || {};
  $('mount').add(new Option('(none)', ''));
  for (const [sp, m] of Object.entries(MOUNTS())) if (m.rideable !== false) $('mount').add(new Option(`${sp} (${m.seat})`, sp));
  $('mount').addEventListener('change', e => {
    st.mount = e.target.value;
    // 選了坐騎、目前不是騎乘動作 → 換成這隻坐騎的騎乘待機（坐/站）
    if (st.mount && !st.action.startsWith('ride_')) { st.action = `ride_${MOUNTS()[st.mount]?.seat === 'stand' ? 'stand' : 'sit'}`; $('action').value = st.action; st.tick = 0; }
  });
  $('mountWalk').addEventListener('change', e => { st.mountWalk = e.target.checked; });
  const monImg = {};
  function mountSheet(sp) {
    const v = globalThis.PIXEL_ASSETS?.monsterSheets?.[sp];
    if (!v) return null;
    if (!monImg[sp]) { const im = trackImage(new Image()); im.src = v.img; monImg[sp] = im; }
    return monImg[sp].complete && monImg[sp].naturalWidth ? { img: monImg[sp], meta: v.meta } : null;
  }
  /** 坐騎：畫在腳底 origin、騎乘者往鞍點抬；回 { lift:[dx,dy] 畫面 px, draw(ctx), depth } 或 null */
  function mountFor(cls, dir, actKey, tick, origin, scale) {
    if (!st.mount || !data) return null;
    const ms = mountSheet(st.mount); if (!ms) return null;
    const A = ms.meta.actions, VD = ['up', 'side', 'down', 'sideLeft'][dir], flip = dir === 3;
    const mm = mountMotion(data, actKey, tick, st.mountWalk);
    const kind = mm.seb === 'walk' ? 'walk' : mm.seb === 'stand' ? 'idle' : 'attack';
    let act = kind + dirSuffix(A, kind, VD); const row0 = A[act] || A[kind];
    let f = 0;
    if (kind === 'walk' || kind === 'idle') f = Math.floor(st.globalTick / Math.max(1, Math.round(row0.frameTime * (data.tickRate || 20)))) % row0.frames;
    else { const rel = Number.isFinite(row0.release) ? row0.release : 4; f = mm.seb === 'charge' ? Math.max(0, Math.min(rel - 1, Math.floor(mm.k * rel))) : Math.min(row0.frames - 1, rel + Math.floor(mm.k * (row0.frames - rel))); }
    const [act2, fl] = leftRow(ms.meta, act, flip ? -1 : 1), row = A[act2] || row0, c = row.cell;
    // 怪物美術 72 px = 英雄 heroHeight px（遊戲：怪物 21/72、英雄 HERO_H/站高）→ 1 怪物 px = scale × 站高 / 72
    const hh = data.meta?.heroHeights?.[cls] || data.meta?.heroHeight || 28, km = scale * hh / 72;
    // 鞍點 = 坐騎背線（怪物 px，乘 km）；騎乘者的腳在背線下 hip 個騎乘者美術 px（乘騎乘者自己的 scale）
    const MT = globalThis.PIXEL_ASSETS?.mounts, seat = MT?.mounts?.[st.mount]?.seat === 'stand' ? 'stand' : 'sit', hip = MT?.hip?.[seat] ?? (seat === 'sit' ? 5 : 1);
    const sad = MT?.mounts?.[st.mount]?.saddle?.[dir] || [0, -60], hd = row.head, bob = hd && hd[f] && hd[0] ? hd[f][1] - hd[0][1] : 0;
    const dw = c * km, x0 = origin.x - (c / 2) * km, y0 = origin.y - (c - ms.meta.footFromBottom) * km;
    return {
      act: act2, f, depth: rideDepth(dir), lift: [Math.round(sad[0] * km), Math.round((sad[1] + bob) * km + hip * scale)],
      draw(ctx) {
        ctx.save(); ctx.imageSmoothingEnabled = false;
        if (fl) { ctx.translate(x0 + dw, y0); ctx.scale(-1, 1); ctx.drawImage(ms.img, f * c, row.y, c, c, 0, 0, dw, dw); }
        else ctx.drawImage(ms.img, f * c, row.y, c, c, x0, y0, dw, dw);
        ctx.restore();
      },
    };
  }
  // 資料載好後:列出資料包裡每一頂帽子、每一把武器、每一套護甲(含 <套>.<職業>)
  function fillPickers() {
    const fill = (k, names, autoLabel) => { const el = $(k); el.innerHTML = ''; el.add(new Option(autoLabel, '')); for (const n of names) el.add(new Option(n, n)); el.value = st[k]; };
    // 帽子/武器：只列基本名（2x 版 `<名>@2x[.<職業>]` 由 helmetSkin / weaponFor 依職業的 rig 自動換）
    const baseName = n => n.split(RIG2X_SUFFIX)[0];
    fill('pick_helmet', ['none', ...new Set(Object.keys(data.skins?.helmet || {}).map(baseName))], 'auto (gear)');
    fill('pick_weapon', [...new Set(Object.keys(data.weapons || {}).filter(n => data.weapons[n].type !== 'shield').map(baseName))], 'auto (class)');
    fill('pick_armor', ['none', ...Object.keys(data.skins?.armor || {})], 'auto (gear)');
  }
  for (const k of ['weapon', 'gl_helm', 'gl_chest', 'gl_belt', 'gl_legs', 'gl_boots', 'gl_gloves', 'hideWeapon', 'debug', 'stone']) $(k).addEventListener('change', e => { st[k] = e.target.checked; });
  $('weaponLevel').addEventListener('input', e => { st.weaponLevel = Math.max(0, Math.min(10, +e.target.value || 0)); });
  $('play').addEventListener('click', () => { st.playing = !st.playing; });
  $('back').addEventListener('click', () => { st.playing = false; st.tick--; st.globalTick--; });
  $('fwd').addEventListener('click', () => { st.playing = false; st.tick++; st.globalTick++; });
  $('restart').addEventListener('click', () => { st.tick = 0; });
  $('close').addEventListener('click', () => unmount());

  // ---- load data + images (only now, only in lab mode)
  fetch(base + 'paperdoll.json').then(r => {
    if (!r.ok) throw new Error(`paperdoll.json ${r.status}`);
    return r.json();
  }).then(d => {
    data = d;
    fillPickers();
    const jobs = Object.entries(d.images || {}).map(([key, file]) => new Promise(res => {
      const im = trackImage(new Image());
      im.onload = () => { images[key] = im; res(); };
      im.onerror = () => { console.warn('[paperdoll-lab] image failed', file); res(); };
      im.src = base + file;
    }));
    return Promise.all(jobs);
  }).catch(e => {
    $('info').textContent = 'paperdoll lab: could not load data — ' + e.message;
    console.warn('[paperdoll-lab]', e);
  });

  // ---- render
  function hunter(cls) {
    const gear = {};
    for (const s of GEAR_SLOTS) gear[s] = !!st['gl_' + s];
    return { classId: cls, gender: st.gender, equipment: { weapon: st.weapon, ...gear }, weaponLevel: st.weaponLevel };
  }
  function dollState(cls, over = {}) {
    const look = lookFromHunter(hunter(cls), data);
    // 2x rig 職業（look.rig = 2）：帽子 → `<名>@2x.<職業>` / `<名>@2x`、武器 → `<id>@2x`；1x 職業拿不到只有 2x 的美術帽（畫不出來 → 不畫）
    if (st.pick_helmet) look.helmet = st.pick_helmet === 'none' ? null
      : look.rig === 2 ? helmetSkin(data, st.pick_helmet, cls, 2) : (data.skins?.helmet?.[st.pick_helmet] ? st.pick_helmet : null);
    if (st.pick_armor && look.rig !== 2) look.armor = st.pick_armor === 'none' ? null : st.pick_armor;
    if (st.pick_weapon && data.weapons?.[st.pick_weapon]) { look.weapon = weaponFor(data, st.pick_weapon, look.rig); look.weaponType = data.weapons[st.pick_weapon].type; }
    return {
      action: st.action, dir: st.dir, facing: st.facing, tick: st.tick, globalTick: st.globalTick, ...over,
      look, hideWeapon: st.hideWeapon, tint: st.stone ? 'stone' : null,
    };
  }
  function bg(ctx, cv) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    const ck = 10;
    for (let y = 0; y < cv.height; y += ck) for (let x = 0; x < cv.width; x += ck) {
      ctx.fillStyle = ((x + y) / ck) & 1 ? '#4a5162' : '#454b5b';
      ctx.fillRect(x, y, ck, ck);
    }
  }
  function drawDoll(cv, cls, origin, scale, debug, over, keep) {
    const ctx = cv.getContext('2d');
    if (!keep) bg(ctx, cv);
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.beginPath(); ctx.ellipse(origin.x, origin.y, 18 * scale, 5 * scale, 0, 0, Math.PI * 2); ctx.fill();
    const s = dollState(cls, over);
    const parts = computeParts(data, s);
    // 騎乘：坐騎在腳底，騎乘者抬到鞍點；DV2 深度規則 rideDepth（+1 騎乘者在前 → 先畫坐騎）
    const mt = mountFor(cls, parts.dir ?? 1, parts.action, s.tick, origin, scale);
    const o2 = mt ? { x: origin.x + mt.lift[0], y: origin.y + mt.lift[1] } : origin;
    if (mt && mt.depth > 0) mt.draw(ctx);
    drawParts(ctx, parts, images, o2, scale);
    if (mt && mt.depth <= 0) mt.draw(ctx);
    if (debug) drawDebug(ctx, parts, o2, scale);
    return { s, parts, mt };
  }
  function drawDebug(ctx, parts, origin, scale) {
    ctx.save();
    ctx.lineWidth = 1;
    ctx.font = '10px monospace';
    parts.forEach((p, i) => {
      const c = partCorners(p).map(([x, y]) => [origin.x + x * scale, origin.y + y * scale]);
      ctx.strokeStyle = LAYER_COLOR[p.layer] || '#fff';
      ctx.beginPath(); c.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.stroke();
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fillText(`${i}:${p.layer}`, 4, 12 + i * 11);
      if (p.kind === 'weapon') {
        const px = origin.x + p.x * scale, py = origin.y + p.y * scale;
        ctx.strokeStyle = '#ff2fd0'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(px - 6, py); ctx.lineTo(px + 6, py); ctx.moveTo(px, py - 6); ctx.lineTo(px, py + 6); ctx.stroke();
        ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.stroke();
        ctx.lineWidth = 1;
      }
    });
    // 腳底原點
    ctx.strokeStyle = '#00ffa0';
    ctx.beginPath(); ctx.moveTo(origin.x - 8, origin.y); ctx.lineTo(origin.x + 8, origin.y); ctx.stroke();
    ctx.restore();
  }
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!root.isConnected) return;
    const dt = last ? Math.min(0.25, (now - last) / 1000) : 0;
    last = now;
    if (st.playing && data) {
      acc += dt * (data.tickRate || 20);
      const n = Math.floor(acc);
      if (n) { st.tick += n; st.globalTick += n; acc -= n; }
    }
    render();
  }
  function render() {
    $('play').textContent = st.playing ? '⏸ pause' : '▶ play';
    for (const [d, b] of Object.entries(dirBtns)) b.classList.toggle('on', d === st.dir);
    for (const k of ['weapon', 'gl_helm', 'gl_chest', 'gl_belt', 'gl_legs', 'gl_boots', 'gl_gloves', 'hideWeapon', 'debug', 'mountWalk', 'stone']) $(k).checked = !!st[k];
    $('gender').value = st.gender;
    if (!data) return;
    CLASS_IDS.forEach((c, i) => {
      thumbs[i].classList.toggle('on', c === st.cls);
      drawDoll(thumbs[i], c, { x: 60, y: 120 }, 1, false);
    });
    const { s, parts, mt } = drawDoll(big, st.cls, { x: 180, y: 360 }, 3, st.debug);
    $('mountinfo').textContent = st.mount ? (mt ? `mount ${mt.act}[${mt.f}] depth ${mt.depth > 0 ? '+1 (rider in front)' : '−1 (rider behind)'}` : 'mount loading…') : '';
    const t = actionTiming(data, s.action, s.look.weaponType, s.look.rig);
    $('riginfo').textContent = `rig ${s.look.rig || 1}x${parts.tint ? '  tint ' + parts.tint : ''}${s.look.head !== st.cls ? '  head ' + s.look.head : ''}`;
    // 全部 slot × 4 方向（每格 120×140、腳底在 (60,120)）
    strip.width = Math.max(120, t.slots * 120); strip.height = 4 * 140;
    bg(strip.getContext('2d'), strip);
    const startOf = i => (i ? data.actions[t.key].af[i - 1] : 0);
    for (let d = 0; d < 4; d++) for (let i = 0; i < t.slots; i++) {
      drawDoll(strip, st.cls, { x: i * 120 + 60, y: d * 140 + 120 }, 1, false, { dir: d, tick: startOf(i) }, true);
    }
    const a = data.actions[t.key];
    const slot = getSlot(a.af, st.tick);
    const d4 = parts.dir ?? dirIndex(st.dir, st.facing);
    $('dirinfo').textContent = `${DIR_NAMES[d4]} (dir ${d4}${parts.wantDir !== parts.dir ? ', fallback' : ''})`;
    const w = parts.find(p => p.layer === 'weapon');
    $('info').textContent = [
      `class ${st.cls}  row ${t.key}[${DIR_NAMES[d4]}]  (resolveAction '${s.action}', ${s.look.weaponType})`,
      `tick ${st.tick}  global ${st.globalTick}  slot ${slot + 1}/${t.slots}  af [${a.af.join(',')}]  ${t.seconds.toFixed(2)}s`,
      `release slot ${t.releaseSlot ?? '-'}  impact slot ${t.impactSlot ?? '-'}${t.impactSec != null ? ` @${t.impactSec.toFixed(2)}s` : ''}`,
      `look body=${s.look.body} head=${s.look.head} (${s.look.gender}) armor=${s.look.armor ?? '-'} helmet=${s.look.helmet ?? '-'} shield=${s.look.shield ?? '-'} weapon=${s.look.weapon ?? '-'} lv${s.look.weaponLevel}`,
      `order ${parts.map(p => p.layer).join(' > ')}`,
      w ? `weapon seb ${w.seb} frame ${w.frame} deg ${w.deg} base (${w.x},${w.y}) pivot (${w.pivot.join(',')})` : 'weapon hidden',
    ].join('\n');
  }
  raf = requestAnimationFrame(frame);

  function unmount() {
    cancelAnimationFrame(raf);
    root.remove();
  }
  const api = { root, state: st, unmount, render, get data() { return data; }, resolveAction: (n, wt, rig) => resolveAction(data, n, wt, rig), DIRS: DIR_NAMES, ACTIONS };
  globalThis.__mistvalePaperdollLab = api;
  return api;
}
