// T105 程序化音效：全部用 WebAudio 即時合成，不載入任何音檔（repo 裡沒有音效素材）。
// 原則：
//  * 只有第一次使用者手勢後才建立 AudioContext（瀏覽器自動播放政策）。
//  * 每個音都很短（30–450ms）、峰值小（0.05–0.13），疊在一起不會爆音。
//  * 同一個音 18ms 內重複就丟掉，避免一群怪同時被打時變成機關槍。
//  * 任何環境問題（沒有 AudioContext、被擋、node 測試）都靜靜跳過，不影響遊戲。
const KINDS = ['ui', 'tick', 'error', 'coin', 'hit', 'crit', 'aoe', 'heal', 'quest', 'level', 'place', 'open', 'close'];
let ctx = null, master = null, noiseBuf = null, muted = false, volume = 0.55, voices = 0, lastAt = Object.create(null), failCount = 0;
const log = [];   // 驗收用：最近 120 個音，{kind, t}

const hasWindow = typeof window !== 'undefined' && typeof document !== 'undefined';
const reduced = () => hasWindow && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function sfxMuted(v) {
  if (v === undefined) return muted;
  muted = !!v;
  if (master) { try { master.gain.value = muted ? 0 : volume; } catch { } }
  // T108：靜音也要把環境音收掉，不然關掉音效還會聽到風聲。
  if (muted) { villageStop(); rainStop(); if (bed && ctx) killBed(ctx); }
  else if (lastRegion && ctx) { bedName = ''; ambientSet(lastRegion, lastPhase, lastBuildings); ambientRain(rainWant); }
  return muted;
}
export function sfxVolume(v) {
  if (v === undefined) return volume;
  volume = Math.max(0, Math.min(1, Number(v) || 0));
  if (master) { try { master.gain.value = muted ? 0 : volume; } catch { } }
  return volume;
}
export function sfxLog(n = 24) { return log.slice(-n); }
export function sfxKinds() { return KINDS.slice(); }   // 有實作的音色
export function sfxState() { return ctx ? ctx.state : 'none'; }

function ac() {
  if (!hasWindow) return null;
  if (ctx) { if (ctx.state === 'suspended') { try { ctx.resume(); } catch { } } return ctx; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : volume;
    master.connect(ctx.destination);
    // 一段 0.6 秒的白色雜訊，撞擊/爆炸類都用它過濾波，比單一正弦真實得多。
    noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.6), ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    if (ctx.state === 'suspended') { try { ctx.resume(); } catch { } }
    return ctx;
  } catch { failCount++; return null; }
}

function guard() {
  if (muted) return null;
  if (voices > 10) return null;
  return ac();   // 注意：currentTime 剛建立時就是 0，不能拿它當「沒有 context」的哨兵
}

/** 一段帶包絡的振盪器。f0→f1 滑音，dur 秒，peak 線性增益。 */
function tone(c, when, o) {
  const { type = 'triangle', f0 = 440, f1 = f0, dur = 0.08, peak = 0.08, attack = 0.004 } = o;
  const osc = c.createOscillator(), g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(Math.max(20, f0), when);
  if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), when + dur);
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(peak, when + attack);
  g.gain.exponentialRampToValueAtTime(0.0006, when + dur);
  osc.connect(g); g.connect(master);
  osc.start(when); osc.stop(when + dur + 0.02);
  voices++;
  osc.onended = () => { voices = Math.max(0, voices - 1); };
}

/** 一段帶濾波器的雜訊爆。f0→f1 掃頻，q 是帶通寬度。 */
function noise(c, when, o) {
  const { dur = 0.12, peak = 0.09, f0 = 1200, f1 = 200, type = 'bandpass', q = 1, attack = 0.003 } = o;
  const src = c.createBufferSource(), flt = c.createBiquadFilter(), g = c.createGain();
  src.buffer = noiseBuf; src.loop = true;
  flt.type = type; flt.Q.value = q;
  flt.frequency.setValueAtTime(Math.max(30, f0), when);
  flt.frequency.exponentialRampToValueAtTime(Math.max(30, f1), when + dur);
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(peak, when + attack);
  g.gain.exponentialRampToValueAtTime(0.0005, when + dur);
  src.connect(flt); flt.connect(g); g.connect(master);
  src.start(when); src.stop(when + dur + 0.02);
  voices++;
  src.onended = () => { voices = Math.max(0, voices - 1); };
}

const detune = (s = 0.03) => 1 + (Math.random() * 2 - 1) * s;

/**
 * 播放一個音效。kind 見 sfxKinds()；未知的當 'ui'。
 * opts.gain 可再乘一個 0.3–1.5 的係數（例：王打中獵人更重）。
 */
export function sfx(kind, opts = {}) {
  const k = KINDS.includes(kind) ? kind : 'ui';
  const now = hasWindow ? performance.now() : 0;
  if (now && lastAt[k] && now - lastAt[k] < 18) return false;
  if (now) lastAt[k] = now;
  const gain = Math.max(0.3, Math.min(1.5, opts.gain || 1));
  const c = guard();
  if (!c) return false;
  const t = c.currentTime + 0.005;
  const d = detune();
  try {
    switch (k) {
      case 'ui': tone(c, t, { type: 'triangle', f0: 660 * d, f1: 880 * d, dur: 0.05, peak: 0.07 * gain }); break;
      case 'tick': tone(c, t, { type: 'square', f0: 520 * d, f1: 540 * d, dur: 0.03, peak: 0.045 * gain }); break;
      case 'error': tone(c, t, { type: 'sawtooth', f0: 200, f1: 120, dur: 0.16, peak: 0.075 * gain }); tone(c, t, { type: 'sine', f0: 150, f1: 95, dur: 0.17, peak: 0.05 * gain }); break;
      case 'coin': tone(c, t, { type: 'sine', f0: 1480 * d, f1: 1480 * d, dur: 0.055, peak: 0.06 * gain }); tone(c, t + 0.055, { type: 'sine', f0: 1980 * d, f1: 1980 * d, dur: 0.09, peak: 0.05 * gain }); break;
      case 'hit': noise(c, t, { dur: 0.09, peak: 0.085 * gain, f0: 1500, f1: 320, type: 'bandpass', q: 1.1 }); tone(c, t, { type: 'sine', f0: 220, f1: 92, dur: 0.10, peak: 0.08 * gain }); break;
      case 'crit': noise(c, t, { dur: 0.13, peak: 0.10 * gain, f0: 2400, f1: 420, type: 'bandpass', q: 1.3 }); tone(c, t, { type: 'sine', f0: 300, f1: 110, dur: 0.14, peak: 0.09 * gain }); tone(c, t, { type: 'triangle', f0: 1560 * d, f1: 900, dur: 0.08, peak: 0.04 * gain }); break;
      case 'aoe': noise(c, t, { dur: 0.42, peak: 0.11 * gain, f0: 1300, f1: 110, type: 'lowpass', q: 0.9 }); tone(c, t, { type: 'sine', f0: 115, f1: 42, dur: 0.45, peak: 0.09 * gain }); break;
      case 'heal': tone(c, t + 0.00, { type: 'sine', f0: 620 * d, f1: 940, dur: 0.18, peak: 0.055 * gain }); tone(c, t + 0.08, { type: 'sine', f0: 940, f1: 1320, dur: 0.16, peak: 0.04 * gain }); break;
      case 'quest': [523, 659, 784, 1046].forEach((f, i) => tone(c, t + i * 0.065, { type: 'triangle', f0: f, f1: f, dur: 0.12, peak: 0.055 * gain })); break;
      case 'level': [659, 784, 988, 1175, 1568].forEach((f, i) => tone(c, t + i * 0.055, { type: 'triangle', f0: f, f1: f, dur: 0.13, peak: 0.05 * gain })); break;
      case 'place': noise(c, t, { dur: 0.1, peak: 0.08 * gain, f0: 700, f1: 90, type: 'lowpass', q: 1 }); tone(c, t, { type: 'sine', f0: 165, f1: 62, dur: 0.12, peak: 0.07 * gain }); break;
      case 'open': tone(c, t, { type: 'triangle', f0: 380 * d, f1: 530 * d, dur: 0.09, peak: 0.05 * gain }); break;
      case 'close': tone(c, t, { type: 'triangle', f0: 520 * d, f1: 340 * d, dur: 0.09, peak: 0.045 * gain }); break;
    }
  } catch { failCount++; return false; }
  log.push({ kind: k, t: Math.round(now) });
  if (log.length > 120) log.splice(0, log.length - 120);
  return true;
}

// T108 環境音層：一層風聲底噪 + 稀疏點綴（白天鳥叫、晚上蟲鳴），隨區域與日夜換。
// 全部即時合成（跟事件音一樣沒有音檔）。原則：
//  * 音量壓得比事件音更小（0.05–0.07），只當背景，不搶命中聲。
//  * 換區域 0.9 秒淡入、舊的 0.7 秒淡出，不會有接縫。
//  * 分頁被切到背景就收掉，回來再長回來（不要在背景一直吃 CPU／電）。
//  * 鳥叫／蟲鳴用隨機間隔（4–10 秒）稀疏地補，聽起來才不像罐頭循環。
const BEDS = {
  village: { cut: 380, q: .7, gain: .052, chirp: 2150, birds: 1.0, night: 'cricket' },
  meadow: { cut: 620, q: .8, gain: .058, chirp: 2450, birds: 1.5, night: 'cricket' },
  forest: { cut: 820, q: 1.0, gain: .055, chirp: 1900, birds: 1.0, night: 'owl' },
  taiga: { cut: 1050, q: 1.1, gain: .060, chirp: 2000, birds: .4, night: 'cricket' },
  snow: { cut: 1350, q: 1.2, gain: .064, chirp: 2600, birds: .12, night: null },
  mountain: { cut: 1150, q: 1.1, gain: .060, chirp: 2400, birds: .15, night: null },
  desert: { cut: 900, q: .9, gain: .058, chirp: 2300, birds: .2, night: 'cricket' },
};
let bed = null, bedName = '', bedNight = false, bedCount = 0, sporadic = 0, lastRegion = '', lastPhase = .15, chirpCount = 0;
// T108：環境音是背景播放，不能在使用者手勢前就自己建 AudioContext（自動播放政策），
// 所以要等第一個手勢才「上膛」。事件音本來就由手勢觸發，不受影響。
let armed = false, lastBuildings = {}, lastInVillage = true;
if (hasWindow) {
  const arm = () => {
    armed = true;
    try { villageSet(lastBuildings, lastInVillage && !!bed); } catch { }
    if (ctx && ctx.state === 'suspended') { try { ctx.resume(); } catch { } }
  };
  for (const ev of ['pointerdown', 'keydown', 'touchstart', 'click']) window.addEventListener(ev, arm, { passive: true, once: true });
}

function killBed(c) {
  const old = bed;
  bed = null;
  if (!old) return;
  try {
    const t = c.currentTime;
    old.g.gain.cancelScheduledValues(t);
    old.g.gain.setValueAtTime(Math.max(0.0001, old.g.gain.value), t);
    old.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    old.src.stop(t + 0.8);
    old.lfo.stop(t + 0.8);
  } catch { }
}

function makeBed(c, name, night) {
  const cfg = BEDS[name] || BEDS.village;
  const src = c.createBufferSource();
  src.buffer = noiseBuf; src.loop = true;
  const flt = c.createBiquadFilter();
  flt.type = 'lowpass'; flt.frequency.value = cfg.cut; flt.Q.value = cfg.q;
  const g = c.createGain(); g.gain.value = 0.0001;
  // 慢速 LFO 掃濾波器 → 風一陣一陣的，不是一條死板的嘶聲。
  const lfo = c.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.06 + Math.random() * 0.05;
  const lfoGain = c.createGain(); lfoGain.gain.value = cfg.cut * 0.35;
  lfo.connect(lfoGain); lfoGain.connect(flt.frequency);
  src.connect(flt); flt.connect(g); g.connect(master);
  const t = c.currentTime;
  g.gain.exponentialRampToValueAtTime(cfg.gain * (night ? 0.85 : 1), t + 0.9);
  src.start(t); lfo.start(t);
  bed = { src, flt, g, lfo };
  bedName = name; bedNight = night; bedCount++;
  return bed;
}

function chirp(c, night, cfg) {
  chirpCount++;
  const t = c.currentTime + 0.02;
  if (!night) {
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const f = (cfg.chirp || 2100) * (0.9 + Math.random() * 0.3);
      tone(c, t + i * 0.09, { type: 'sine', f0: f, f1: f * 1.28, dur: 0.05, peak: 0.012, attack: 0.006 });
    }
  } else if (cfg.night === 'owl') {
    const f = 340 + Math.random() * 40;
    tone(c, t, { type: 'sine', f0: f, f1: f * 0.82, dur: 0.28, peak: 0.010, attack: 0.03 });
    tone(c, t + 0.42, { type: 'sine', f0: f * 0.98, f1: f * 0.8, dur: 0.22, peak: 0.008, attack: 0.03 });
  } else {
    const n = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) tone(c, t + i * 0.055, { type: 'square', f0: 4200 + Math.random() * 500, f1: 4000, dur: 0.018, peak: 0.006, attack: 0.002 });
  }
}

function scheduleSporadic() {
  clearTimeout(sporadic);
  const cfg = BEDS[bedName];
  if (!cfg) return;
  const wait = (4200 + Math.random() * 6000) / (cfg.birds || 1);
  sporadic = setTimeout(() => {
    if (!bed) return;
    const c = muted ? null : ac();
    if (c) { try { chirp(c, bedNight, cfg); } catch { } }
    scheduleSporadic();
  }, wait);
}

// ── 村莊裡「有來源」的聲音：鐵匠鋪打鐵、酒館人聲、交易所零錢、大廳鐘聲 ──
// 依建築等級決定間隔（等級越高越忙），沒有這棟建築就沒有聲音。只在村莊區域響。
const VILLAGE = {
  forge:   { every: lv => Math.max(1400, 3600 - 400 * (lv - 1)), gain: 0.045 },
  tavern:  { every: lv => Math.max(3000, 9000 - 1000 * (lv - 1)), gain: 0.016 },
  trading: { every: lv => Math.max(3000, 10000 - 1200 * (lv - 1)), gain: 0.014 },
  hall:    { every: lv => Math.max(12000, 42000 - 4000 * (lv - 1)), gain: 0.018, minLv: 3 },
};
let villageLevels = {}, villageTimers = {}, villageFired = { forge: 0, tavern: 0, trading: 0, hall: 0 };

function villageActive(id) {
  const d = VILLAGE[id];
  return !!d && (villageLevels[id] || 0) >= (d.minLv || 1);
}
// 驗收用：目前實際會響的來源與它的間隔
function villageSources() {
  return Object.keys(VILLAGE).filter(villageActive).map(id => ({
    id, lv: villageLevels[id], everyMs: Math.round(VILLAGE[id].every(villageLevels[id])), gain: VILLAGE[id].gain,
  }));
}
function villageStop() {
  for (const k of Object.keys(villageTimers)) { clearTimeout(villageTimers[k]); delete villageTimers[k]; }
}
function villagePlay(id, g) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime;
  if (id === 'forge') {
    // 打鐵：金屬噪音爆 + 一下短促的鐵砧音；三成機率補第二下
    noise(c, t, { f0: 2400, f1: 700, q: 1.1, dur: 0.07, peak: g, type: 'bandpass' });
    tone(c, t, { type: 'triangle', f0: 1380, f1: 1180, dur: 0.05, peak: g * 0.35 });
    if (Math.random() < 0.35) {
      noise(c, t + 0.09, { f0: 2200, f1: 640, q: 1.1, dur: 0.06, peak: g * 0.8, type: 'bandpass' });
      tone(c, t + 0.09, { type: 'triangle', f0: 1300, f1: 1120, dur: 0.045, peak: g * 0.28 });
    }
  } else if (id === 'tavern') {
    // 酒館：一小段低頻人聲嗡嗡 + 杯碰一下
    noise(c, t, { f0: 520, f1: 300, q: 0.7, dur: 1.1, peak: g * 0.55, type: 'bandpass' });
    tone(c, t + 0.25, { type: 'sine', f0: 2500, f1: 2380, dur: 0.035, peak: g * 0.5 });
  } else if (id === 'trading') {
    // 交易所：零錢兩下
    tone(c, t, { type: 'sine', f0: 1620, f1: 1520, dur: 0.05, peak: g * 0.6 });
    tone(c, t + 0.07, { type: 'sine', f0: 2160, f1: 2060, dur: 0.05, peak: g * 0.45 });
  } else if (id === 'hall') {
    // 大廳鐘聲：低頻長尾 + 泛音
    tone(c, t, { type: 'sine', f0: 780, f1: 520, dur: 1.4, peak: g });
    tone(c, t, { type: 'sine', f0: 1560, f1: 1040, dur: 1.1, peak: g * 0.3 });
  }
}
function villageSchedule(id) {
  if (!villageActive(id) || !armed || muted || !bed || document.hidden) return;
  const d = VILLAGE[id];
  const wait = Math.max(400, d.every(villageLevels[id]) * (0.75 + Math.random() * 0.5));
  villageTimers[id] = setTimeout(() => {
    delete villageTimers[id];
    if (!armed || muted || !bed || document.hidden || !villageActive(id)) return;
    try { villagePlay(id, d.gain); } catch { }
    villageFired[id] = (villageFired[id] || 0) + 1;
    villageSchedule(id);
  }, wait);
}
function villageSet(levels, inVillage) {
  villageLevels = levels || {};
  if (!inVillage) { villageStop(); return; }
  for (const id of Object.keys(VILLAGE)) {
    if (villageActive(id)) { if (!villageTimers[id]) villageSchedule(id); }
    else if (villageTimers[id]) { clearTimeout(villageTimers[id]); delete villageTimers[id]; }
  }
}
function villageState() {
  return { active: villageSources(), fired: { ...villageFired }, timers: Object.keys(villageTimers).length, levels: { ...villageLevels } };
}

// ── T136 雨聲：下雨時多一層高頻雨幕 + 稀疏滴水 ──
// 跟風聲底噪是兩層獨立的 bed（風聲是區域的、雨聲是天氣的），可以同時存在。
const RAIN = { cut: 2600, q: .6, gain: .05 };
let rainBed = null, rainWant = false, rainCount = 0, dripCount = 0, dripTimer = 0;

function makeRain(c) {
  const src = c.createBufferSource();
  src.buffer = noiseBuf; src.loop = true;
  const flt = c.createBiquadFilter();
  flt.type = 'bandpass'; flt.frequency.value = RAIN.cut; flt.Q.value = RAIN.q;
  const g = c.createGain(); g.gain.value = 0.0001;
  // 慢速 LFO 讓「雨量」一陣大一時小，不會是一條死板的嘶聲
  const lfo = c.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.09 + Math.random() * 0.05;
  const lfoGain = c.createGain(); lfoGain.gain.value = 900;
  lfo.connect(lfoGain); lfoGain.connect(flt.frequency);
  src.connect(flt); flt.connect(g); g.connect(master);
  const t = c.currentTime;
  g.gain.exponentialRampToValueAtTime(RAIN.gain, t + 1.2);
  src.start(t); lfo.start(t);
  rainBed = { src, flt, g, lfo };
  rainCount++;
  scheduleDrips();
  return rainBed;
}

function rainStop() {
  const old = rainBed;
  rainBed = null;
  clearTimeout(dripTimer); dripTimer = 0;
  if (!old || !ctx) return;
  try {
    const t = ctx.currentTime;
    old.g.gain.cancelScheduledValues(t);
    old.g.gain.setValueAtTime(Math.max(0.0001, old.g.gain.value), t);
    old.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
    old.src.stop(t + 0.9); old.lfo.stop(t + 0.9);
  } catch { }
}

// 雨滴：雨幕之上偶爾一兩聲很輕的「滴」，讓雨聽起來是在打東西而不是純噪音
function scheduleDrips() {
  clearTimeout(dripTimer); dripTimer = 0;
  if (!rainBed) return;
  dripTimer = setTimeout(() => {
    if (!rainBed || muted || !ctx) return;
    try {
      const n = 1 + Math.floor(Math.random() * 2);
      for (let i = 0; i < n; i++) {
        const f = 1500 + Math.random() * 900;
        tone(ctx, ctx.currentTime + 0.01 + i * 0.12, { type: 'sine', f0: f, f1: f * 0.86, dur: 0.05, peak: 0.007, attack: 0.004 });
      }
      dripCount += n;
    } catch { }
    scheduleDrips();
  }, 700 + Math.random() * 1500);
}

/** 下雨時開一層雨聲（跟區域無關，跟天氣走）。重複呼叫同一狀態不會重建。 */
export function ambientRain(on) {
  const want = !!on;
  rainWant = want;
  if (!armed || muted || !ctx) return ambientState();
  if (want && !rainBed) { try { makeRain(ctx); } catch { } }
  else if (!want && rainBed) rainStop();
  return ambientState();
}

/** 換環境音（區域 id + 一天中的相位 0–1；0.15 下午、0.7 半夜）。同一個區域／時段重複呼叫不會重做。
 *  buildings 是村莊建築等級表（T113：鐵匠鋪打鐵、酒館人聲、交易所零錢、大廳鐘聲依等級決定）。 */

export function ambientSet(regionId, phase, buildings, inVillage) {
  const want = BEDS[regionId] ? regionId : 'village';
  const ph = typeof phase === 'number' && isFinite(phase) ? phase : .15;
  const night = ph > .55 && ph < .95;
  lastRegion = want; lastPhase = ph; lastBuildings = buildings || lastBuildings; lastInVillage = inVillage !== false;
  villageSet(lastBuildings, armed && !muted && (inVillage !== false) && !!bed);
  if (!armed) return ambientState();   // 還沒手勢：先記下想要的區域，等上膛後再長出來
  if (want === bedName && night === bedNight && bed) return ambientState();
  if (muted) { bedName = ''; return ambientState(); }
  const c = ac();
  if (!c) return ambientState();
  killBed(c);
  makeBed(c, want, night);
  scheduleSporadic();
  return ambientState();
}

export function ambientState() {
  let gain = 0;
  try { gain = bed ? Math.round(bed.g.gain.value * 1000) / 1000 : 0; } catch { }
  const cfg = BEDS[bedName];
  const target = bed && cfg ? Math.round(cfg.gain * (bedNight ? 0.85 : 1) * 1000) / 1000 : 0;
  let rainGain = 0;
  try { rainGain = rainBed ? Math.round(rainBed.g.gain.value * 1000) / 1000 : 0; } catch { }
  return { bed: bedName, night: bedNight, playing: !!bed, gain, target, count: bedCount, sporadic: !!sporadic, chirps: chirpCount, armed, village: villageSources().length,
    rain: !!rainBed, rainGain, rainTarget: rainBed ? RAIN.gain : 0, rainBuilds: rainCount, drips: dripCount };
}

// 分頁切到背景時把環境音收掉（背景不該一直播風聲），回來再長回來。
if (hasWindow && typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) { villageStop(); rainStop(); killBed(ctx); bedName = ''; }
    else if (lastRegion && !muted) { bedName = ''; ambientSet(lastRegion, lastPhase, lastBuildings); ambientRain(rainWant); }
  });
}

// 測試/除錯用鉤子（與 __mistvaleShake、__mistvalePerf 同一個慣例）。
if (hasWindow) {
  globalThis.__mistvaleAmbient = {
    set: ambientSet,
    state: ambientState,
    beds: () => Object.keys(BEDS),
    village: villageState,
    villagePlay: (id) => { try { villagePlay(id, (VILLAGE[id] || {}).gain || 0.04); villageFired[id] = (villageFired[id] || 0) + 1; } catch { } },
    rain: ambientRain,
  };
  globalThis.__mistvaleSfx = {
    play: (k, o) => sfx(k, o),
    kinds: sfxKinds,
    log: (n) => sfxLog(n),
    state: () => sfxState(),
    muted: sfxMuted,
    volume: sfxVolume,
    voices: () => voices,
    reduced: reduced,
    ambient: ambientState,
  };
}
