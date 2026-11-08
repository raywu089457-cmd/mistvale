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

// 測試/除錯用鉤子（與 __mistvaleShake、__mistvalePerf 同一個慣例）。
if (hasWindow) {
  globalThis.__mistvaleSfx = {
    play: (k, o) => sfx(k, o),
    kinds: sfxKinds,
    log: (n) => sfxLog(n),
    state: () => sfxState(),
    muted: sfxMuted,
    volume: sfxVolume,
    voices: () => voices,
    reduced: reduced,
  };
}
