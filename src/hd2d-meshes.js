// hd2d-meshes.js — HD-2D 真 3D 低多邊形建築與地圖物件(2026-11-27 使用者:「把建築跟地圖物件也跟地圖一起做3D」)
// 純程式建模、不用任何外部貼圖或 3D 函式庫(白皮書 §5):每個面一個法向量(平面著色),顏色取樣自原本的 2D 建築/道具圖。
// 頂點格式(hd2d-webgl2.js 的 MESH_VS 讀):pos Float32×3、normal Int8×4(normalized)、color Uint8×4(rgb + 部件位元組)。
// 部件位元組 = (part & 31) | (mat << 5):part 給 BLIT 畫 1px 分件線,mat 0=受光 1=自發光(窗光/爐火) 2=水晶/冰(鏡面) 3=不受光。
// 本地座標:x 右、z 前(門朝 +z,跟 landscape-layout 的 doorFoot 一致)、y 上;建築佔地中心在原點,地面 y=0。
// 這個檔案只做幾何,不碰 WebGL —— node 測試(test-hd2d-meshes.mjs)可以直接驗證每個模型。

export const MAT_LIT = 0, MAT_GLOW = 1, MAT_GLASS = 2, MAT_FLAT = 3;
const TAU = Math.PI * 2;

const rgbCache = new Map();
export function rgb(h) {
  if (Array.isArray(h)) return h;
  let c = rgbCache.get(h);
  if (!c) { c = [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; rgbCache.set(h, c); }
  return c;
}
function hash1(i, seed = 0) {
  let h = (Math.imul(i | 0, 374761393) + Math.imul(seed | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ── 幾何建構器 ────────────────────────────────────────────────────────────
export class MeshBuilder {
  constructor() {
    this.P = []; this.N = []; this.C = [];
    this.T = { x: 0, y: 0, z: 0, a: 0, co: 1, si: 0, k: 1 };
    this.stack = [];
    this.part = 0; this.mat = MAT_LIT;
  }
  push(x = 0, y = 0, z = 0, a = 0, k = 1) {
    const T = this.T;
    this.stack.push(T);
    const na = T.a + a;
    this.T = { x: T.x + T.k * (x * T.co - z * T.si), y: T.y + T.k * y, z: T.z + T.k * (x * T.si + z * T.co), a: na, co: Math.cos(na), si: Math.sin(na), k: T.k * k };
    return this;
  }
  pop() { this.T = this.stack.pop(); return this; }
  with(part, mat, fn) { const p0 = this.part, m0 = this.mat; this.part = part; if (mat != null) this.mat = mat; fn(); this.part = p0; this.mat = m0; return this; }
  tx(p) { const T = this.T; return [T.x + T.k * (p[0] * T.co - p[2] * T.si), T.y + T.k * p[1], T.z + T.k * (p[0] * T.si + p[2] * T.co)]; }
  get count() { return this.P.length / 3; }

  // 凸多邊形(本地座標)。inside = 實體內部一點:自動把法向量轉成朝外(逆時針繞序 = 正面)。
  poly(pts, col, inside = null) {
    const W = pts.map(p => this.tx(p));
    const n = W.length;
    let nx = 0, ny = 0, nz = 0, cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < n; i++) {   // Newell 法向量:對微翹的四邊形也穩定
      const a = W[i], b = W[(i + 1) % n];
      nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]);
      cx += a[0]; cy += a[1]; cz += a[2];
    }
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-9) return this;
    nx /= l; ny /= l; nz /= l; cx /= n; cy /= n; cz /= n;
    if (inside) {
      const I = this.tx(inside);
      if (nx * (cx - I[0]) + ny * (cy - I[1]) + nz * (cz - I[2]) < 0) { W.reverse(); nx = -nx; ny = -ny; nz = -nz; }
    }
    const c = rgb(col), pb = (this.part & 31) | ((this.mat & 3) << 5);
    const ix = Math.round(nx * 127), iy = Math.round(ny * 127), iz = Math.round(nz * 127);
    for (let i = 1; i < n - 1; i++) {
      for (const v of [W[0], W[i], W[i + 1]]) {
        this.P.push(v[0], v[1], v[2]);
        this.N.push(ix, iy, iz, 0);
        this.C.push(c[0], c[1], c[2], pb);
      }
    }
    return this;
  }
  // 8 個角的六面體:Q[0..3] 是內側面(u0v0,u1v0,u1v1,u0v1),Q[4..7] 是外側面同順序。
  hexa(Q, col, o = {}) {
    const c = [0, 0, 0];
    for (const q of Q) { c[0] += q[0] / 8; c[1] += q[1] / 8; c[2] += q[2] / 8; }
    const side = o.side || col;
    if (!o.noBack) this.poly([Q[0], Q[1], Q[2], Q[3]], o.back || side, c);
    this.poly([Q[4], Q[5], Q[6], Q[7]], o.front || col, c);
    if (!o.noBottom) this.poly([Q[0], Q[1], Q[5], Q[4]], o.bottom || side, c);
    this.poly([Q[3], Q[2], Q[6], Q[7]], o.top || side, c);
    this.poly([Q[0], Q[3], Q[7], Q[4]], side, c);
    this.poly([Q[1], Q[2], Q[6], Q[5]], side, c);
    return this;
  }
  box(x0, y0, z0, x1, y1, z1, col, o = {}) {
    const c = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], side = o.side || col;
    if (!o.noTop) this.poly([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], o.top || col, c);
    if (o.bottom) this.poly([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], o.bottom === true ? side : o.bottom, c);
    if (!o.noPZ) this.poly([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], o.pz || side, c);
    if (!o.noNZ) this.poly([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], o.nz || side, c);
    if (!o.noPX) this.poly([[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], o.px || side, c);
    if (!o.noNX) this.poly([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], o.nx || side, c);
    return this;
  }
  // 兩點之間的方形木條(柱、梁、斜撐、欄杆)
  beam(a, b, w, col, o = {}) {
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(d[0], d[1], d[2]) || 1;
    const f = [d[0] / L, d[1] / L, d[2] / L];
    const ref = Math.abs(f[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    let u = [f[1] * ref[2] - f[2] * ref[1], f[2] * ref[0] - f[0] * ref[2], f[0] * ref[1] - f[1] * ref[0]];
    const ul = Math.hypot(u[0], u[1], u[2]); u = u.map(v => v / ul);
    const v = [f[1] * u[2] - f[2] * u[1], f[2] * u[0] - f[0] * u[2], f[0] * u[1] - f[1] * u[0]];
    const h = w / 2, h2 = (o.h ?? w) / 2;
    const at = (p, su, sv) => [p[0] + u[0] * su * h + v[0] * sv * h2, p[1] + u[1] * su * h + v[1] * sv * h2, p[2] + u[2] * su * h + v[2] * sv * h2];
    const Q = [at(a, -1, -1), at(a, 1, -1), at(a, 1, 1), at(a, -1, 1), at(b, -1, -1), at(b, 1, -1), at(b, 1, 1), at(b, -1, 1)];
    return this.hexa(Q, col, { side: col, front: o.end || col, back: o.end || col });
  }
  // 直立 n 角柱/錐台(r2 = 頂半徑,0 = 圓錐)
  cyl(cx, y0, cz, r, h, n, col, o = {}) {
    const r2 = o.r2 ?? r, ph = o.phase ?? 0, top = o.top || col, inside = [cx, y0 + h * 0.5, cz];
    const ring = (rr, y) => Array.from({ length: n }, (_, i) => { const a = ph + (i / n) * TAU; return [cx + Math.cos(a) * rr, y, cz + Math.sin(a) * rr]; });
    const A = ring(r, y0), B = ring(r2, y0 + h);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      if (r2 > 1e-4) this.poly([A[i], A[j], B[j], B[i]], col, inside);
      else this.poly([A[i], A[j], [cx, y0 + h, cz]], col, inside);
    }
    if (r2 > 1e-4 && o.cap !== false) this.poly(B.slice().reverse(), top, inside);
    if (o.bottom) this.poly(A, o.bottom === true ? col : o.bottom, inside);
    return this;
  }
  // 任意方向的 n 角柱(圓木、屋脊捲、軸)
  cylAxis(a, b, r, n, col, o = {}) {
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(d[0], d[1], d[2]) || 1;
    const f = [d[0] / L, d[1] / L, d[2] / L];
    const ref = Math.abs(f[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    let u = [f[1] * ref[2] - f[2] * ref[1], f[2] * ref[0] - f[0] * ref[2], f[0] * ref[1] - f[1] * ref[0]];
    const ul = Math.hypot(u[0], u[1], u[2]); u = u.map(q => q / ul);
    const v = [f[1] * u[2] - f[2] * u[1], f[2] * u[0] - f[0] * u[2], f[0] * u[1] - f[1] * u[0]];
    const ph = o.phase ?? Math.PI / n, r2 = o.r2 ?? r;
    const ring = (p, rr) => Array.from({ length: n }, (_, i) => { const t = ph + (i / n) * TAU, cu = Math.cos(t) * rr, sv = Math.sin(t) * rr; return [p[0] + u[0] * cu + v[0] * sv, p[1] + u[1] * cu + v[1] * sv, p[2] + u[2] * cu + v[2] * sv]; });
    const A = ring(a, r), B = ring(b, r2), mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; this.poly([A[i], A[j], B[j], B[i]], col, mid); }
    if (o.caps !== false) { this.poly(A, o.end || col, mid); this.poly(B, o.end || col, mid); }
    return this;
  }
  // 低多邊形團塊(樹冠、岩石、雪堆):二十面體 + 依 seed 的半徑擾動
  ico(cx, cy, cz, rx, ry, rz, col, o = {}) {
    const seed = o.seed ?? 1, jit = o.jit ?? 0.16, flat = o.flatBottom ?? -9;
    const V = ICO_V.map((p, i) => {
      const k = 1 + (hash1(i, seed) - 0.5) * 2 * jit;
      let y = p[1] * ry * k;
      if (y < flat * ry) y = flat * ry;
      return [cx + p[0] * rx * k, cy + y, cz + p[2] * rz * k];
    });
    const cols = o.cols;
    ICO_F.forEach((f, i) => {
      let c = col;
      if (cols) { const up = ICO_V[f[0]][1] + ICO_V[f[1]][1] + ICO_V[f[2]][1]; c = up > 1.2 ? cols[0] : up < -1.2 ? cols[2] : cols[1]; }
      this.poly([V[f[0]], V[f[1]], V[f[2]]], c, [cx, cy, cz]);
    });
    return this;
  }
  // 有厚度的屋頂板:top 四點(本地),往下 t 的底面、四個側邊(簷口)
  slab(top, t, colTop, colEdge, colUnder) {
    const bot = top.map(p => [p[0], p[1] - t, p[2]]);
    const c = [0, 0, 0];
    for (const p of [...top, ...bot]) { c[0] += p[0] / 8; c[1] += p[1] / 8; c[2] += p[2] / 8; }
    this.poly(top, colTop, c);
    this.poly(bot, colUnder, c);
    for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; this.poly([top[i], top[j], bot[j], bot[i]], colEdge, c); }
    return this;
  }
  finish() {
    const n = this.P.length / 3;
    const pos = new Float32Array(this.P), nrm = new Int8Array(this.N), col = new Uint8Array(this.C);
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { const v = pos[i * 3 + k]; if (v < mn[k]) mn[k] = v; if (v > mx[k]) mx[k] = v; }
    // 輪廓取樣點(給 CPU 投影算畫面上的範圍):去重後最多 480 點
    const seen = new Set(), hull = [];
    for (let i = 0; i < n; i++) {
      const k = `${Math.round(pos[i * 3] * 8)},${Math.round(pos[i * 3 + 1] * 8)},${Math.round(pos[i * 3 + 2] * 8)}`;
      if (seen.has(k)) continue; seen.add(k); hull.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
    }
    let H = hull;
    if (hull.length / 3 > 480) { const step = hull.length / 3 / 480; H = []; for (let i = 0; i < 480; i++) { const j = Math.floor(i * step) * 3; H.push(hull[j], hull[j + 1], hull[j + 2]); } }
    return { pos, nrm, col, count: n, min: mn, max: mx, hull: new Float32Array(H) };
  }
}

const PHI = (1 + Math.sqrt(5)) / 2;
const ICO_V = [[-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0], [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI], [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1]].map(p => { const l = Math.hypot(...p); return p.map(v => v / l); });
const ICO_F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];

// ── 色票(取樣自 assets/heroloom-buildings 與道具圖集)──────────────────────
export const PAL = {
  thatch: '#e2b15a', thatchL: '#f0c66c', thatchD: '#a87a40', thatchE: '#8c6234', under: '#5a3c26',
  timber: '#704628', timberD: '#4a3024', timberL: '#8d5c34',
  stone: '#7b7c85', stoneL: '#a4a29c', stoneD: '#55555e', stoneW: '#9c9a9d', slate: '#4b5864', slateL: '#66788a',
  plInn: '#e6c189', plTav: '#f1d3a6', plWhite: '#ede7d6', plPink: '#e0a589', plHall: '#dba872', plSand: '#cfb48a',
  stained: '#7ab0ff', door: '#6c4226', doorD: '#4a2c1c', glow: '#ffd47c', glowD: '#f2aa4c', fire: '#ff8c34', fireL: '#ffdc6c',
  blue: '#33558f', blueD: '#223a68', red: '#cf3b33', white: '#f4efe2', gold: '#e8c25a', iron: '#4a4b56', ironL: '#7d808c',
  rope: '#c9a66a', dirt: '#8a6a44', dirtD: '#6e5236', paper: '#efe2bc', crystal: '#8fdcff', crystalD: '#4fa6e8',
  leaf: '#62953c', leafL: '#86b54c', leafD: '#40682e', autumn: '#d9822e', autumnL: '#efab48', autumnD: '#b2581f',
  birchLeaf: '#8cc052', birchLeafL: '#a9d466', birchLeafD: '#5f9640', bark: '#6a4428', barkD: '#4c3020', birchBark: '#ebe6d8',
  pine: '#3f6e3c', pineL: '#5b8f44', pineD: '#2c5032', snow: '#f4f6f4', snowB: '#d4e4ec',
  cactus: '#5e9a4a', cactusL: '#7fb45a', cactusD: '#3f7036', mushCap: '#cc4a3c', mushStem: '#efe0c4',
  rock: '#858a8c', rockL: '#a8aca8', rockD: '#5e6366', moss: '#6f9a44', mossD: '#4f7832', sand: '#c8b08a', sandD: '#a08a68',
  ice: '#a6dcf8', iceL: '#dff4ff', iceD: '#6cb2e6', ruin: '#b9ad8e', ruinD: '#8c8268', ruinL: '#d4c9a6',
  hay: '#e6c46a', hayD: '#b8923e', flowerR: '#e0605a', flowerY: '#f2d24c', flowerW: '#f4f0e6', flowerP: '#d46ab0',
};

// ── 建築共用零件 ───────────────────────────────────────────────────────────
// 佔地:landscape-layout 的 SOLID 是 ±2.3 × ±1.9(畫面地基);牆面內縮一點,屋簷再探出去。
export const FOOT = { hx: 2.3, hz: 1.9 };
const WALL = { x0: -2.05, x1: 2.05, z0: -1.62, z1: 1.62 };
const PLINTH_H = 0.32;

function faceMap(wb, side) {
  const cx = (wb.x0 + wb.x1) / 2, cz = (wb.z0 + wb.z1) / 2;
  switch (side) {
    case '+z': return { hw: (wb.x1 - wb.x0) / 2, f: (u, v, o) => [cx + u, v, wb.z1 + o] };
    case '-z': return { hw: (wb.x1 - wb.x0) / 2, f: (u, v, o) => [cx - u, v, wb.z0 - o] };
    case '+x': return { hw: (wb.z1 - wb.z0) / 2, f: (u, v, o) => [wb.x1 + o, v, cz - u] };
    default: return { hw: (wb.z1 - wb.z0) / 2, f: (u, v, o) => [wb.x0 - o, v, cz + u] };
  }
}
function faceBox(m, F, u0, v0, u1, v1, o0, o1, col, opt = {}) {
  const f = F.f;
  m.hexa([f(u0, v0, o0), f(u1, v0, o0), f(u1, v1, o0), f(u0, v1, o0), f(u0, v0, o1), f(u1, v0, o1), f(u1, v1, o1), f(u0, v1, o1)], col, { noBack: true, ...opt });
}
function plinth(m, col = PAL.stone, top = PAL.stoneL, hx = FOOT.hx, hz = FOOT.hz, h = PLINTH_H) {
  m.with(3, MAT_LIT, () => m.box(-hx, -0.45, -hz, hx, h, hz, col, { top }));
}
function walls(m, wb, y0, y1, col, part = 2) {
  m.with(part, MAT_LIT, () => m.box(wb.x0, y0, wb.z0, wb.x1, y1, wb.z1, col, { noTop: true }));
}
function windowOn(m, F, u, v, w, h, o = {}) {
  const fr = o.frame || PAL.timberD;
  m.with(4, MAT_LIT, () => {
    faceBox(m, F, u - w / 2 - 0.09, v - h / 2 - 0.09, u + w / 2 + 0.09, v + h / 2 + 0.09, 0, 0.06, fr);
    if (o.sill !== false) faceBox(m, F, u - w / 2 - 0.16, v - h / 2 - 0.2, u + w / 2 + 0.16, v - h / 2 - 0.08, 0, 0.16, o.sillCol || PAL.timber);
  });
  m.with(5, o.dark ? MAT_LIT : MAT_GLOW, () => {
    const g = o.glass || (o.dark ? PAL.doorD : PAL.glow);
    const p = [F.f(u - w / 2, v - h / 2, 0.065), F.f(u + w / 2, v - h / 2, 0.065), F.f(u + w / 2, v + h / 2, 0.065), F.f(u - w / 2, v + h / 2, 0.065)];
    m.poly(p, g, F.f(u, v, -1));
  });
  m.with(4, MAT_LIT, () => {
    faceBox(m, F, u - 0.045, v - h / 2, u + 0.045, v + h / 2, 0.06, 0.1, fr);
    faceBox(m, F, u - w / 2, v - 0.045, u + w / 2, v + 0.045, 0.06, 0.1, fr);
  });
  if (o.flowers) {
    m.with(6, MAT_LIT, () => {
      faceBox(m, F, u - w / 2 - 0.1, v - h / 2 - 0.42, u + w / 2 + 0.1, v - h / 2 - 0.18, 0, 0.26, PAL.timber);
      for (let i = 0; i < 4; i++) {
        const uu = u - w / 2 + (i + 0.5) * (w / 4), c = [PAL.flowerR, PAL.flowerY, PAL.flowerW, PAL.flowerP][i % 4];
        const p = F.f(uu, v - h / 2 - 0.12, 0.14);
        m.ico(p[0], p[1], p[2], 0.13, 0.11, 0.13, i % 2 ? PAL.leafL : c, { seed: i + 3, jit: 0.1 });
      }
    });
  }
}
function arch(m, F, u, v0, w, h, col, frame) {   // 拱形門窗(石砌)
  const r = w / 2, n = 5;
  m.with(4, MAT_LIT, () => {
    faceBox(m, F, u - r - 0.14, v0, u - r, v0 + h - r, 0, 0.1, frame);
    faceBox(m, F, u + r, v0, u + r + 0.14, v0 + h - r, 0, 0.1, frame);
    for (let i = 0; i < n; i++) {
      const a0 = Math.PI * (i / n), a1 = Math.PI * ((i + 1) / n), cy = v0 + h - r;
      const q = (a, rr, o) => F.f(u + Math.cos(a) * rr, cy + Math.sin(a) * rr, o);
      m.hexa([q(a0, r, 0), q(a1, r, 0), q(a1, r + 0.16, 0), q(a0, r + 0.16, 0), q(a0, r, 0.1), q(a1, r, 0.1), q(a1, r + 0.16, 0.1), q(a0, r + 0.16, 0.1)], frame, { noBack: true });
    }
  });
  m.with(5, (col === PAL.glow || col === PAL.stained) ? MAT_GLOW : MAT_LIT, () => {
    const cy = v0 + h - r;
    // 拱:左下 → 右下 → 半圓(右→左)
    const P = [F.f(u - r, v0, 0.05), F.f(u + r, v0, 0.05)];
    for (let i = 0; i <= 6; i++) { const a = (i / 6) * Math.PI; P.push(F.f(u + Math.cos(a) * r, cy + Math.sin(a) * r, 0.05)); }
    m.poly(P, col, F.f(u, v0 + h * 0.5, -1));
  });
}
function door(m, F, u, w, h, o = {}) {
  m.with(4, MAT_LIT, () => {
    faceBox(m, F, u - w / 2 - 0.12, PLINTH_H, u + w / 2 + 0.12, PLINTH_H + h + 0.12, 0, 0.07, o.frame || PAL.timberD);
  });
  m.with(5, MAT_LIT, () => {
    faceBox(m, F, u - w / 2, PLINTH_H, u + w / 2, PLINTH_H + h, 0.07, 0.11, o.col || PAL.door);
    faceBox(m, F, u - 0.03, PLINTH_H + 0.05, u + 0.03, PLINTH_H + h - 0.05, 0.11, 0.13, PAL.doorD);
    if (o.double) faceBox(m, F, u - w / 2, PLINTH_H + h * 0.5, u + w / 2, PLINTH_H + h * 0.5 + 0.07, 0.11, 0.13, PAL.doorD);
  });
  m.with(6, MAT_LIT, () => faceBox(m, F, u - w / 2 - 0.2, -0.1, u + w / 2 + 0.2, PLINTH_H - 0.02, 0, 0.42, o.step || PAL.stoneL));
}
// 木構架(半木造):轉角柱、樓層橫梁、斜撐
function timberFrame(m, wb, sides, y0, y1, floors = [], braces = true) {
  m.with(2, MAT_LIT, () => {
    for (const s of sides) {
      const F = faceMap(wb, s), hw = F.hw;
      faceBox(m, F, -hw - 0.04, y0, -hw + 0.16, y1, 0, 0.07, PAL.timber);
      faceBox(m, F, hw - 0.16, y0, hw + 0.04, y1, 0, 0.07, PAL.timber);
      for (const y of [y0 + 0.02, ...floors, y1 - 0.14]) faceBox(m, F, -hw, y, hw, y + 0.14, 0, 0.07, PAL.timber);
      if (braces) {
        const yb = floors.length ? floors[0] : y1 - 0.14;
        const q = (u, v, o) => F.f(u, v, o);
        const br = (ua, va, ub, vb) => m.beam(q(ua, va, 0.035), q(ub, vb, 0.035), 0.13, PAL.timber, { h: 0.07 });
        br(-hw + 0.1, y0 + 0.1, -hw + 0.85, yb);
        br(hw - 0.1, y0 + 0.1, hw - 0.85, yb);
      }
    }
  });
}
// 茅草山牆屋頂。axis 'x':屋脊沿 x(山牆在 ±x);'z':屋脊沿 z(山牆在 ±z)
// 屋坡上疊兩層茅草帶(不同部件 id → BLIT 在交界畫 1px 分件線,就算在暗面也看得出一排排茅草)
function thatchBands(m, E0, E1, R0, R1, o, ce, cu) {
  const L = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const u = [E1[0] - E0[0], E1[1] - E0[1], E1[2] - E0[2]], v = [R0[0] - E0[0], R0[1] - E0[1], R0[2] - E0[2]];
  let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const nl = Math.hypot(n[0], n[1], n[2]) || 1; n = n.map(q => q / nl); if (n[1] < 0) n = n.map(q => -q);
  const P = (a, k, lift) => { const q = L(L(E0, E1, a), L(R0, R1, a), k); return [q[0] + n[0] * lift, q[1] + n[1] * lift, q[2] + n[2] * lift]; };
  const bands = [[0, 0.36, 17, o.band || PAL.thatchL], [0.36, 0.7, 18, o.col || PAL.thatch]];
  for (const [k0, k1, part, col] of bands) {
    m.with(part, MAT_LIT, () => m.slab([P(-0.006, k0, 0.08), P(1.006, k0, 0.08), P(1.006, k1, 0.08), P(-0.006, k1, 0.08)], 0.09, col, ce, cu));
  }
}
function gableRoof(m, o) {
  const { x0, z0, x1, z1, yE, yR } = o, axis = o.axis || 'x', over = o.over ?? 0.42, t = o.t ?? 0.22;
  const ct = o.col || PAL.thatch, ce = o.edge || PAL.thatchE, cu = o.under || PAL.under, gableCol = o.gable;
  const sw = axis === 'x' ? (z1 - z0) / 2 : (x1 - x0) / 2, drop = over * (yR - yE) / sw;
  const ye = yE - drop;
  m.with(1, MAT_LIT, () => {
    if (axis === 'x') {
      const zm = (z0 + z1) / 2, X0 = x0 - over, X1 = x1 + over;
      m.slab([[X0, ye, z1 + over], [X1, ye, z1 + over], [X1, yR, zm], [X0, yR, zm]], t, ct, ce, cu);
      m.slab([[X1, ye, z0 - over], [X0, ye, z0 - over], [X0, yR, zm], [X1, yR, zm]], t, ct, ce, cu);
      if (o.bands !== false) {
        thatchBands(m, [X0, ye, z1 + over], [X1, ye, z1 + over], [X0, yR, zm], [X1, yR, zm], o, ce, cu);
        thatchBands(m, [X1, ye, z0 - over], [X0, ye, z0 - over], [X1, yR, zm], [X0, yR, zm], o, ce, cu);
      }
      if (o.cap !== false) m.cylAxis([X0 - 0.06, yR + 0.04, zm], [X1 + 0.06, yR + 0.04, zm], 0.2, 6, o.capCol || PAL.thatchL, { end: PAL.thatchD });
    } else {
      const xm = (x0 + x1) / 2, Z0 = z0 - over, Z1 = z1 + over;
      m.slab([[x1 + over, ye, Z1], [x1 + over, ye, Z0], [xm, yR, Z0], [xm, yR, Z1]], t, ct, ce, cu);
      m.slab([[x0 - over, ye, Z0], [x0 - over, ye, Z1], [xm, yR, Z1], [xm, yR, Z0]], t, ct, ce, cu);
      if (o.bands !== false) {
        thatchBands(m, [x1 + over, ye, Z1], [x1 + over, ye, Z0], [xm, yR, Z1], [xm, yR, Z0], o, ce, cu);
        thatchBands(m, [x0 - over, ye, Z0], [x0 - over, ye, Z1], [xm, yR, Z0], [xm, yR, Z1], o, ce, cu);
      }
      if (o.cap !== false) m.cylAxis([xm, yR + 0.04, Z0 - 0.06], [xm, yR + 0.04, Z1 + 0.06], 0.2, 6, o.capCol || PAL.thatchL, { end: PAL.thatchD });
    }
  });
  if (gableCol) {   // 山牆三角
    m.with(2, MAT_LIT, () => {
      const c = [(x0 + x1) / 2, yE - 0.5, (z0 + z1) / 2];
      if (axis === 'x') { const zm = (z0 + z1) / 2; m.poly([[x0, yE, z0], [x0, yE, z1], [x0, yR - t, zm]], gableCol, c); m.poly([[x1, yE, z0], [x1, yE, z1], [x1, yR - t, zm]], gableCol, c); }
      else { const xm = (x0 + x1) / 2; m.poly([[x0, yE, z0], [x1, yE, z0], [xm, yR - t, z0]], gableCol, c); m.poly([[x0, yE, z1], [x1, yE, z1], [xm, yR - t, z1]], gableCol, c); }
    });
  }
}
function chimney(m, x, z, y0, y1, w = 0.62, col = PAL.stone) {
  m.with(7, MAT_LIT, () => {
    m.box(x - w / 2, y0, z - w / 2, x + w / 2, y1, z + w / 2, col, { top: PAL.stoneD });
    m.box(x - w / 2 - 0.08, y1 - 0.22, z - w / 2 - 0.08, x + w / 2 + 0.08, y1, z + w / 2 + 0.08, PAL.stoneL, { top: '#2e2a30' });
    for (let i = 0; i < 3; i++) m.box(x - w / 2 - 0.02, y0 + 0.5 + i * 0.6, z - w / 2 - 0.02, x - w / 2 + 0.2, y0 + 0.7 + i * 0.6, z + w / 2 + 0.02, PAL.stoneD, { noNX: false });
  });
  return [x, y1 + 0.05, z];
}
function flag(m, x, z, y0, h, col = PAL.blue, dir = 1) {
  m.with(8, MAT_LIT, () => {
    m.cyl(x, y0, z, 0.06, h, 5, PAL.timberD);
    m.box(x, y0 + h - 0.62, z - 0.03, x + 0.75 * dir, y0 + h - 0.08, z + 0.03, col);
    m.cyl(x, y0 + h, z, 0.1, 0.12, 5, PAL.gold, { r2: 0 });
  });
}
function banner(m, F, u, v, w, h, col = PAL.blue, emblem = PAL.gold) {   // 牆上垂幅
  m.with(8, MAT_LIT, () => {
    faceBox(m, F, u - w / 2 - 0.06, v + h - 0.08, u + w / 2 + 0.06, v + h, 0, 0.12, PAL.timberD);
    faceBox(m, F, u - w / 2, v, u + w / 2, v + h - 0.08, 0.04, 0.08, col);
    faceBox(m, F, u - w * 0.18, v + h * 0.4, u + w * 0.18, v + h * 0.62, 0.08, 0.1, emblem);
    const tip = [F.f(u - w / 2, v, 0.06), F.f(u + w / 2, v, 0.06), F.f(u, v - 0.28, 0.06)];
    m.poly(tip, col, F.f(u, v, -1));
  });
}
function hangSign(m, F, u, v, w, h, board, icon) {   // 牆上伸出的吊牌
  m.with(6, MAT_LIT, () => {
    const a = F.f(u, v + h + 0.25, 0), b = F.f(u, v + h + 0.25, 0.95);
    m.beam(a, b, 0.1, PAL.timberD);
    const c0 = F.f(u, v + h + 0.2, 0.7);
    m.beam([c0[0], c0[1], c0[2]], [c0[0], c0[1] - 0.18, c0[2]], 0.04, PAL.iron);
    // 板子垂直於牆面(從側面看得到)
    const p = (du, dv, dt) => { const q = F.f(u + dt, v + dv, 0.7 + du); return q; };
    m.hexa([p(-w / 2, 0, -0.04), p(w / 2, 0, -0.04), p(w / 2, h, -0.04), p(-w / 2, h, -0.04), p(-w / 2, 0, 0.04), p(w / 2, 0, 0.04), p(w / 2, h, 0.04), p(-w / 2, h, 0.04)], board, { side: PAL.timberD });
    if (icon) icon(p);
  });
}
function lantern(m, x, y, z) {
  m.with(9, MAT_LIT, () => { m.box(x - 0.12, y, z - 0.12, x + 0.12, y + 0.06, z + 0.12, PAL.iron); m.cyl(x, y + 0.36, z, 0.17, 0.14, 4, PAL.iron, { r2: 0.02, phase: Math.PI / 4 }); });
  m.with(10, MAT_GLOW, () => m.box(x - 0.1, y + 0.06, z - 0.1, x + 0.1, y + 0.36, z + 0.1, PAL.glow));
}
function barrel(m, x, z, y = 0, r = 0.32, h = 0.72) {
  m.with(11, MAT_LIT, () => {
    m.cyl(x, y, z, r * 0.9, h * 0.5, 8, PAL.timberL, { r2: r, cap: false });
    m.cyl(x, y + h * 0.5, z, r, h * 0.5, 8, PAL.timberL, { r2: r * 0.9, top: PAL.timber });
    m.cyl(x, y + h * 0.18, z, r * 0.97, 0.07, 8, PAL.iron, { cap: false });
    m.cyl(x, y + h * 0.76, z, r * 0.97, 0.07, 8, PAL.iron, { cap: false });
  });
}
function crate(m, x, z, y = 0, s = 0.6, a = 0) {
  m.push(x, y, z, a);
  m.with(11, MAT_LIT, () => {
    m.box(-s / 2, 0, -s / 2, s / 2, s, s / 2, PAL.timberL, { top: '#a67444' });
    m.beam([-s / 2 - 0.01, 0.05, s / 2 + 0.01], [s / 2 + 0.01, s - 0.05, s / 2 + 0.01], 0.08, PAL.timberD, { h: 0.03 });
    m.beam([s / 2 + 0.01, 0.05, s / 2 + 0.01], [s / 2 + 0.01, s - 0.05, -s / 2 - 0.01], 0.08, PAL.timberD, { h: 0.03 });
  });
  m.pop();
}
function sack(m, x, z, y = 0, s = 0.36, seed = 1) {
  m.with(11, MAT_LIT, () => { m.ico(x, y + s * 0.75, z, s, s * 0.8, s, '#cdb48a', { seed, jit: 0.12, flatBottom: -0.75 }); m.cyl(x, y + s * 1.35, z, s * 0.28, s * 0.35, 5, '#b39a70', { r2: s * 0.12 }); });
}
function torch(m, x, z, y0 = 0, h = 1.5) {
  m.with(9, MAT_LIT, () => { m.cyl(x, y0, z, 0.08, h, 5, PAL.timberD); m.cyl(x, y0 + h, z, 0.16, 0.12, 5, PAL.iron, { r2: 0.2 }); });
  m.with(10, MAT_GLOW, () => { m.cyl(x, y0 + h + 0.12, z, 0.15, 0.34, 5, PAL.fire, { r2: 0.0 }); m.cyl(x, y0 + h + 0.12, z, 0.08, 0.22, 4, PAL.fireL, { r2: 0.0 }); });
}

// ── 各建築(門朝 +z)─────────────────────────────────────────────────────────
// 回傳 anchors(本地座標):chimney 煙囪口(給煙霧)、light 爐火/燈籠(給點光源)
const BUILDERS = {
  inn(m) {   // 旅館:兩層半木造、杏色灰泥、茅草山牆(屋脊沿 x)、床鋪吊牌、窗台花箱
    const wb = WALL, y1 = 4.35;
    plinth(m);
    walls(m, wb, PLINTH_H, y1, PAL.plInn);
    timberFrame(m, wb, ['+z', '+x', '-z', '-x'], PLINTH_H, y1, [2.25]);
    const Fz = faceMap(wb, '+z'), Fx = faceMap(wb, '+x');
    door(m, Fz, 0.55, 0.85, 1.55);
    windowOn(m, Fz, -1.1, 1.35, 0.6, 0.62);
    windowOn(m, Fz, -0.95, 3.2, 0.6, 0.62, { flowers: true });
    windowOn(m, Fz, 0.95, 3.2, 0.6, 0.62, { flowers: true });
    windowOn(m, Fx, -0.6, 1.35, 0.55, 0.6);
    windowOn(m, Fx, 0.6, 1.35, 0.55, 0.6);
    windowOn(m, Fx, 0, 3.2, 0.6, 0.62, { flowers: true });
    hangSign(m, faceMap(wb, '-x'), 1.15, 2.05, 0.8, 0.5, PAL.plTav, p => { m.with(6, MAT_LIT, () => m.hexa([p(-0.25, 0.14, -0.06), p(0.25, 0.14, -0.06), p(0.25, 0.3, -0.06), p(-0.25, 0.3, -0.06), p(-0.25, 0.14, 0.06), p(0.25, 0.14, 0.06), p(0.25, 0.3, 0.06), p(-0.25, 0.3, 0.06)], PAL.blue)); });
    gableRoof(m, { x0: wb.x0, z0: wb.z0, x1: wb.x1, z1: wb.z1, yE: y1, yR: y1 + 2.0, axis: 'x', gable: PAL.plInn });
    const ch = chimney(m, 1.35, -0.85, y1 - 0.5, y1 + 2.45);
    lantern(m, 1.25, 1.95, wb.z1 + 0.18);
    return { chimney: ch, light: [0.55, 1.4, 2.4] };
  },
  restaurant(m) {   // 餐廳:粉色灰泥兩層、山牆朝前(屋脊沿 z)、木百葉、蝴蝶餅吊牌、門前小圓桌
    const wb = WALL, y1 = 4.2;
    plinth(m);
    walls(m, wb, PLINTH_H, y1, PAL.plPink);
    timberFrame(m, wb, ['+z', '+x', '-z', '-x'], PLINTH_H, y1, [2.2], false);
    const Fz = faceMap(wb, '+z'), Fx = faceMap(wb, '+x');
    door(m, Fz, 0.75, 0.85, 1.55);
    const shut = (F, u, v) => { windowOn(m, F, u, v, 0.55, 0.62); m.with(4, MAT_LIT, () => { faceBox(m, F, u - 0.6, v - 0.34, u - 0.38, v + 0.34, 0, 0.08, '#4f7a4a'); faceBox(m, F, u + 0.38, v - 0.34, u + 0.6, v + 0.34, 0, 0.08, '#4f7a4a'); }); };
    shut(Fz, -0.95, 1.4); shut(Fz, -0.75, 3.15); shut(Fz, 0.85, 3.15);
    shut(Fx, -0.55, 1.4); shut(Fx, 0.65, 1.4); shut(Fx, 0, 3.15);
    hangSign(m, Fz, -0.3, 2.4, 0.62, 0.62, PAL.timber, p => { m.with(6, MAT_LIT, () => m.cylAxis(p(0, 0.31, -0.07), p(0, 0.31, 0.07), 0.2, 6, '#c8843c')); });
    gableRoof(m, { x0: wb.x0, z0: wb.z0, x1: wb.x1, z1: wb.z1, yE: y1, yR: y1 + 2.15, axis: 'z', gable: PAL.plPink });
    const ch = chimney(m, -1.25, -0.9, y1 - 0.5, y1 + 2.55);
    // 門前小圓桌 + 兩張凳子
    m.with(11, MAT_LIT, () => {
      m.cyl(-1.55, 0, 2.55, 0.07, 0.68, 5, PAL.timberD); m.cyl(-1.55, 0.68, 2.55, 0.42, 0.08, 8, PAL.timberL, { top: '#a8784a' });
      m.cyl(-2.15, 0, 2.6, 0.17, 0.42, 6, PAL.timber, { top: PAL.timberL }); m.cyl(-1.0, 0, 2.95, 0.17, 0.42, 6, PAL.timber, { top: PAL.timberL });
    });
    return { chimney: ch, light: [0.75, 1.4, 2.4] };
  },
  trading(m) {   // 交易所:開放式市集攤位(木柱+茅草屋頂)、櫃台、貨物(麻袋、箱子、麵包)、天秤吊牌、藍旗
    plinth(m, PAL.stone, PAL.stoneL);
    const y1 = 2.85;
    m.with(2, MAT_LIT, () => {
      for (const [x, z] of [[-2.0, -1.55], [2.0, -1.55], [-2.0, 1.55], [2.0, 1.55]]) m.box(x - 0.14, PLINTH_H, z - 0.14, x + 0.14, y1 + 0.1, z + 0.14, PAL.timber);
      m.box(-2.05, y1 - 0.12, -1.6, 2.05, y1 + 0.1, -1.42, PAL.timberD); m.box(-2.05, y1 - 0.12, 1.42, 2.05, y1 + 0.1, 1.6, PAL.timberD);
      m.box(-2.05, PLINTH_H, -1.6, 2.05, 1.9, -1.45, PAL.timberL, { top: PAL.timber });   // 後牆板
    });
    m.with(6, MAT_LIT, () => {   // 前櫃台
      m.box(-1.85, PLINTH_H, 0.85, 1.85, 1.15, 1.35, PAL.timberL, { top: '#b2804c' });
      m.box(-1.85, 1.15, 0.8, 1.85, 1.24, 1.42, PAL.timber);
    });
    m.with(11, MAT_LIT, () => {
      for (let i = 0; i < 5; i++) m.box(-1.5 + i * 0.62, 1.24, 0.95, -1.18 + i * 0.62, 1.42, 1.22, i % 2 ? '#d8a050' : '#c88a3e');   // 麵包
      sack(m, -1.2, -0.6, PLINTH_H, 0.4, 2); sack(m, -0.5, -0.8, PLINTH_H, 0.34, 4); sack(m, 0.4, -0.7, PLINTH_H, 0.38, 6);
    });
    crate(m, 1.3, -0.6, PLINTH_H, 0.62, 0.2); crate(m, 1.35, -0.6, PLINTH_H + 0.62, 0.5, -0.3); crate(m, 2.55, 1.6, 0, 0.6, 0.4); crate(m, 2.5, 2.4, 0, 0.5, -0.2);
    gableRoof(m, { x0: -2.05, z0: -1.6, x1: 2.05, z1: 1.6, yE: y1 + 0.1, yR: y1 + 2.05, axis: 'x', over: 0.5 });
    hangSign(m, faceMap({ x0: -2.05, x1: 2.05, z0: -1.6, z1: 1.6 }, '-x'), 1.0, 1.75, 0.7, 0.55, PAL.timberL, p => {
      m.with(6, MAT_LIT, () => { m.hexa([p(-0.22, 0.38, -0.06), p(0.22, 0.38, -0.06), p(0.22, 0.43, -0.06), p(-0.22, 0.43, -0.06), p(-0.22, 0.38, 0.06), p(0.22, 0.38, 0.06), p(0.22, 0.43, 0.06), p(-0.22, 0.43, 0.06)], PAL.gold); });
    });
    flag(m, 1.6, -0.2, y1 + 1.3, 1.6);
    lantern(m, 2.0, 2.35, 1.82);
    return { light: [0, 1.6, 2.2] };
  },
  tavern(m) {   // 酒館:米白半木造、山牆朝前、老虎窗、啤酒杯吊牌、門邊酒桶
    const wb = WALL, y1 = 3.55;
    plinth(m);
    walls(m, wb, PLINTH_H, y1, PAL.plTav);
    timberFrame(m, wb, ['+z', '+x', '-z', '-x'], PLINTH_H, y1, [2.05]);
    const Fz = faceMap(wb, '+z'), Fx = faceMap(wb, '+x');
    door(m, Fz, -0.6, 0.85, 1.5);
    windowOn(m, Fz, 0.9, 1.35, 0.62, 0.6);
    windowOn(m, Fz, 0, 2.85, 0.7, 0.55);
    windowOn(m, Fx, -0.55, 1.35, 0.55, 0.6); windowOn(m, Fx, 0.6, 1.35, 0.55, 0.6); windowOn(m, Fx, 0, 2.85, 0.55, 0.5);
    hangSign(m, faceMap(wb, '-x'), 1.0, 1.95, 0.62, 0.62, PAL.timberL, p => {
      m.with(6, MAT_LIT, () => { m.hexa([p(-0.15, 0.12, -0.06), p(0.12, 0.12, -0.06), p(0.12, 0.45, -0.06), p(-0.15, 0.45, -0.06), p(-0.15, 0.12, 0.06), p(0.12, 0.12, 0.06), p(0.12, 0.45, 0.06), p(-0.15, 0.45, 0.06)], PAL.gold, { top: PAL.white }); });
    });
    gableRoof(m, { x0: wb.x0, z0: wb.z0, x1: wb.x1, z1: wb.z1, yE: y1, yR: y1 + 2.3, axis: 'z', gable: PAL.plTav });
    // 老虎窗(在 +x 屋坡)
    m.push(1.15, y1 + 0.55, 0.15);
    m.with(2, MAT_LIT, () => m.box(-0.45, 0, -0.55, 0.55, 0.95, 0.55, PAL.plTav, { noTop: true }));
    windowOn(m, faceMap({ x0: -0.45, x1: 0.55, z0: -0.55, z1: 0.55 }, '+x'), 0, 0.5, 0.45, 0.45, { sill: false });
    gableRoof(m, { x0: -0.45, z0: -0.55, x1: 0.55, z1: 0.55, yE: 0.95, yR: 1.55, axis: 'x', over: 0.2, t: 0.14, bands: false, gable: PAL.plTav, cap: false });
    m.pop();
    const ch = chimney(m, -1.3, -0.95, y1 - 0.4, y1 + 2.8);
    barrel(m, 2.45, 1.85, 0); barrel(m, 2.6, 1.15, 0); barrel(m, 2.5, 1.5, 0.72, 0.28, 0.6);
    m.with(11, MAT_LIT, () => m.cylAxis([1.55, 0.3, 2.55], [2.25, 0.3, 2.65], 0.3, 8, PAL.timberL, { end: PAL.timber }));
    lantern(m, -1.45, 1.9, wb.z1 + 0.18);
    return { chimney: ch, light: [-0.6, 1.4, 2.4] };
  },
  hall(m) {   // 城鎮大廳:兩層重木構、十字山牆、屋頂鐘樓、錨紋藍垂幅、雙開門
    const wb = { x0: -2.15, x1: 2.15, z0: -1.65, z1: 1.65 }, y1 = 4.45;
    plinth(m, PAL.stone, PAL.stoneL, 2.35, 1.95, 0.42);
    walls(m, wb, 0.42, y1, PAL.plHall);
    timberFrame(m, wb, ['+z', '+x', '-z', '-x'], 0.42, y1, [2.4]);
    const Fz = faceMap(wb, '+z'), Fx = faceMap(wb, '+x');
    m.with(4, MAT_LIT, () => faceBox(m, Fz, -0.75, 0.42, 0.75, 2.4, 0, 0.12, PAL.timberD));
    door(m, Fz, 0, 1.15, 1.75, { double: true });
    banner(m, Fz, -1.35, 0.95, 0.5, 1.25); banner(m, Fz, 1.35, 0.95, 0.5, 1.25);
    for (const u of [-1.4, -0.45, 0.45, 1.4]) windowOn(m, Fz, u, 3.35, 0.48, 0.62);
    for (const u of [-0.95, 0, 0.95]) { windowOn(m, Fx, u, 1.5, 0.48, 0.6); windowOn(m, Fx, u, 3.35, 0.48, 0.62); }
    gableRoof(m, { x0: wb.x0, z0: wb.z0, x1: wb.x1, z1: wb.z1, yE: y1, yR: y1 + 2.0, axis: 'x', gable: PAL.plHall });
    // 前面的十字山牆(小翼)
    m.push(0, 0, 0);
    m.with(2, MAT_LIT, () => m.box(-1.0, y1 - 0.9, 0.6, 1.0, y1, 1.95, PAL.plHall, { noTop: true, noNZ: true }));
    gableRoof(m, { x0: -1.0, z0: 0.6, x1: 1.0, z1: 1.95, yE: y1, yR: y1 + 1.55, axis: 'z', over: 0.3, gable: PAL.plHall });
    windowOn(m, faceMap({ x0: -1.0, x1: 1.0, z0: 0.6, z1: 1.95 }, '+z'), 0, y1 + 0.45, 0.5, 0.55, { sill: false });
    m.pop();
    // 屋頂鐘樓
    const ty = y1 + 1.45;
    m.with(12, MAT_LIT, () => {
      m.box(-0.62, ty, -0.62, 0.62, ty + 1.45, 0.62, PAL.plHall);
      for (const [x, z] of [[-0.62, -0.62], [0.62, -0.62], [-0.62, 0.62], [0.62, 0.62]]) m.box(x - 0.09, ty, z - 0.09, x + 0.09, ty + 1.5, z + 0.09, PAL.timber);
    });
    // 鐘面:四面白色圓盤 + 指針
    for (const side of ['+z', '+x', '-z', '-x']) {
      const F = faceMap({ x0: -0.62, x1: 0.62, z0: -0.62, z1: 0.62 }, side);
      m.with(13, MAT_LIT, () => {
        const P = []; for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + Math.PI / 8; P.push(F.f(Math.cos(a) * 0.38, ty + 0.78 + Math.sin(a) * 0.38, 0.04)); }
        m.poly(P, PAL.white, F.f(0, ty + 0.78, -1));
        faceBox(m, F, -0.035, ty + 0.78, 0.035, ty + 1.08, 0.04, 0.07, PAL.timberD);
        faceBox(m, F, -0.035, ty + 0.745, 0.22, ty + 0.815, 0.04, 0.07, PAL.timberD);
      });
    }
    m.with(14, MAT_LIT, () => {
      m.box(-0.8, ty + 1.45, -0.8, 0.8, ty + 1.6, 0.8, PAL.timberD);
      m.cyl(0, ty + 1.6, 0, 1.08, 1.35, 4, PAL.thatch, { r2: 0, phase: Math.PI / 4 });
      m.cyl(0, ty + 2.95, 0, 0.06, 0.55, 4, PAL.gold, { r2: 0 });
    });
    lantern(m, -0.95, 2.2, 2.0); lantern(m, 0.95, 2.2, 2.0);
    return { light: [0, 1.6, 2.6] };
  },
  clinic(m) {   // 治療所:白灰泥半木造、茅草屋頂與老虎窗、紅十字吊牌、門前花盆與花台
    const wb = WALL, y1 = 3.6;
    plinth(m);
    walls(m, wb, PLINTH_H, y1, PAL.plWhite);
    timberFrame(m, wb, ['+z', '+x', '-z', '-x'], PLINTH_H, y1, [2.1], false);
    const Fz = faceMap(wb, '+z'), Fx = faceMap(wb, '+x');
    door(m, Fz, -0.35, 0.85, 1.6);
    windowOn(m, Fz, 1.05, 1.35, 0.62, 0.62, { flowers: true });
    windowOn(m, Fz, -1.3, 2.85, 0.5, 0.5);
    windowOn(m, Fx, -0.6, 1.35, 0.55, 0.6); windowOn(m, Fx, 0.65, 1.35, 0.55, 0.6, { flowers: true }); windowOn(m, Fx, 0, 2.85, 0.5, 0.5);
    gableRoof(m, { x0: wb.x0, z0: wb.z0, x1: wb.x1, z1: wb.z1, yE: y1, yR: y1 + 2.2, axis: 'x', gable: PAL.plWhite });
    // 前屋坡老虎窗
    m.push(0.7, y1 + 0.35, 0.95);
    m.with(2, MAT_LIT, () => m.box(-0.5, 0, -0.5, 0.5, 0.9, 0.55, PAL.plWhite, { noTop: true }));
    windowOn(m, faceMap({ x0: -0.5, x1: 0.5, z0: -0.5, z1: 0.55 }, '+z'), 0, 0.48, 0.42, 0.42, { sill: false });
    gableRoof(m, { x0: -0.5, z0: -0.5, x1: 0.5, z1: 0.55, yE: 0.9, yR: 1.5, axis: 'z', over: 0.2, t: 0.14, bands: false, gable: PAL.plWhite, cap: false });
    m.pop();
    const ch = chimney(m, 1.3, -0.8, y1 - 0.4, y1 + 2.55);
    // 紅十字吊牌(從 -x 角伸出)
    hangSign(m, faceMap(wb, '-x'), 1.15, 2.0, 0.78, 0.78, PAL.white, p => {
      m.with(6, MAT_LIT, () => {
        const bar = (a0, b0, a1, b1) => m.hexa([p(a0, b0, -0.07), p(a1, b0, -0.07), p(a1, b1, -0.07), p(a0, b1, -0.07), p(a0, b0, 0.07), p(a1, b0, 0.07), p(a1, b1, 0.07), p(a0, b1, 0.07)], PAL.red);
        bar(-0.27, 0.3, 0.27, 0.48); bar(-0.09, 0.12, 0.09, 0.66);
      });
    });
    m.with(11, MAT_LIT, () => {
      for (const [x, z, c] of [[-1.2, 2.25, PAL.flowerR], [0.85, 2.3, PAL.flowerY]]) { m.cyl(x, 0, z, 0.22, 0.36, 6, '#b8683c', { r2: 0.27, top: PAL.dirtD }); m.ico(x, 0.55, z, 0.26, 0.22, 0.26, PAL.leafL, { seed: 7 }); m.ico(x + 0.05, 0.68, z + 0.08, 0.12, 0.1, 0.12, c, { seed: 9 }); }
      m.box(1.35, 0, 2.15, 2.45, 0.5, 2.6, PAL.timberL, { top: PAL.timber });
      for (let i = 0; i < 4; i++) m.ico(1.5 + i * 0.3, 0.62, 2.38, 0.16, 0.13, 0.16, [PAL.flowerW, PAL.leafL, PAL.flowerY, PAL.leafL][i], { seed: i + 11 });
    });
    lantern(m, 0.4, 1.95, wb.z1 + 0.18);
    return { chimney: ch, light: [-0.35, 1.4, 2.4] };
  },
  forge(m) {   // 鐵匠鋪:灰石牆、茅草屋頂、高大石煙囪、側面爐口(火光)、鐵砧與武器架
    const wb = WALL, y1 = 3.35;
    plinth(m, PAL.stoneD, PAL.stone);
    walls(m, wb, PLINTH_H, y1, PAL.stone);
    m.with(2, MAT_LIT, () => {   // 石塊紋
      for (const side of ['+z', '+x', '-z', '-x']) {
        const F = faceMap(wb, side);
        for (let r = 0; r < 5; r++) for (let c = 0; c < 4; c++) {
          const h = hash1(r * 7 + c, side.charCodeAt(1)); if (h < 0.45) continue;
          const u = -F.hw + 0.35 + c * (F.hw * 2 - 0.7) / 3 + (r % 2) * 0.3, v = PLINTH_H + 0.3 + r * 0.6;
          faceBox(m, F, u - 0.32, v, u + 0.18, v + 0.42, 0, 0.05, h > 0.75 ? PAL.stoneL : PAL.stoneD);
        }
      }
    });
    const Fz = faceMap(wb, '+z'), Fx = faceMap(wb, '+x');
    arch(m, Fz, -0.6, PLINTH_H, 0.95, 1.75, PAL.door, PAL.stoneL);
    // 爐口:+z 右側石拱,裡面火光
    m.with(4, MAT_LIT, () => faceBox(m, Fz, 0.55, PLINTH_H + 0.2, 1.75, PLINTH_H + 1.55, 0, 0.12, PAL.stoneL));
    m.with(15, MAT_GLOW, () => { m.poly([Fz.f(0.72, PLINTH_H + 0.3, 0.13), Fz.f(1.58, PLINTH_H + 0.3, 0.13), Fz.f(1.58, PLINTH_H + 1.05, 0.13), Fz.f(1.15, PLINTH_H + 1.38, 0.13), Fz.f(0.72, PLINTH_H + 1.05, 0.13)], PAL.fire, Fz.f(1.1, 1, -1)); });
    m.with(15, MAT_GLOW, () => { m.poly([Fz.f(0.9, PLINTH_H + 0.3, 0.14), Fz.f(1.4, PLINTH_H + 0.3, 0.14), Fz.f(1.15, PLINTH_H + 0.95, 0.14)], PAL.fireL, Fz.f(1.1, 1, -1)); });
    windowOn(m, Fx, 0.2, 1.6, 0.55, 0.55);
    hangSign(m, faceMap(wb, '-x'), 1.1, 1.95, 0.7, 0.5, PAL.timberL, p => { m.with(6, MAT_LIT, () => m.hexa([p(-0.22, 0.15, -0.06), p(0.22, 0.15, -0.06), p(0.16, 0.33, -0.06), p(-0.2, 0.33, -0.06), p(-0.22, 0.15, 0.06), p(0.22, 0.15, 0.06), p(0.16, 0.33, 0.06), p(-0.2, 0.33, 0.06)], PAL.iron)); });
    gableRoof(m, { x0: wb.x0, z0: wb.z0, x1: wb.x1, z1: wb.z1, yE: y1, yR: y1 + 2.15, axis: 'z', over: 0.26, gable: PAL.stone });   // 簷口收短:北邊圍籬外的白樺區立牌就在旁邊
    const ch = chimney(m, 1.45, -1.05, PLINTH_H, y1 + 3.3, 0.95);
    // 鐵砧(樹墩上)+ 武器架
    m.with(11, MAT_LIT, () => {
      m.cyl(1.2, 0, 2.6, 0.36, 0.5, 7, PAL.timber, { top: '#b0844e' });
      m.box(0.92, 0.5, 2.45, 1.48, 0.62, 2.75, PAL.iron); m.box(1.05, 0.62, 2.5, 1.35, 0.78, 2.7, PAL.iron);
      m.box(0.82, 0.78, 2.44, 1.62, 0.95, 2.76, PAL.ironL, { top: '#9aa0ab' });
      m.box(2.3, 0, 0.0, 2.42, 1.4, 0.12, PAL.timberD); m.box(2.3, 0, 1.4, 2.42, 1.4, 1.52, PAL.timberD); m.box(2.3, 1.1, 0.0, 2.42, 1.22, 1.52, PAL.timberD);
      for (let i = 0; i < 3; i++) m.box(2.26, 0.15, 0.3 + i * 0.4, 2.36, 1.45, 0.38 + i * 0.4, PAL.ironL);
    });
    return { chimney: ch, light: [1.15, 1.2, 2.3] };
  },
  academy(m) {   // 學院:藍灰石牆、茅草屋頂與老虎窗、後方高石鐘塔(石板尖頂+藍旗)、拱窗
    const wb = WALL, y1 = 3.45;
    plinth(m, PAL.slate, PAL.stone);
    walls(m, wb, PLINTH_H, y1, PAL.stone);
    m.with(2, MAT_LIT, () => { for (const side of ['+z', '+x']) { const F = faceMap(wb, side); faceBox(m, F, -F.hw, PLINTH_H, F.hw, PLINTH_H + 0.55, 0, 0.06, PAL.slate); } });
    const Fz = faceMap(wb, '+z'), Fx = faceMap(wb, '+x');
    arch(m, Fz, -0.25, PLINTH_H, 0.9, 1.8, PAL.door, PAL.stoneL);
    for (const u of [0.85, 1.55]) arch(m, Fz, u, PLINTH_H + 0.9, 0.42, 0.95, PAL.glow, PAL.stoneL);
    for (const u of [-0.9, 0, 0.9]) arch(m, Fx, u, PLINTH_H + 0.9, 0.42, 0.95, PAL.glow, PAL.stoneL);
    gableRoof(m, { x0: wb.x0, z0: wb.z0, x1: wb.x1, z1: wb.z1, yE: y1, yR: y1 + 2.1, axis: 'x', gable: PAL.stone });
    m.push(0.6, y1 + 0.3, 0.95);
    m.with(2, MAT_LIT, () => m.box(-0.45, 0, -0.5, 0.45, 0.85, 0.55, PAL.stone, { noTop: true }));
    windowOn(m, faceMap({ x0: -0.45, x1: 0.45, z0: -0.5, z1: 0.55 }, '+z'), 0, 0.45, 0.38, 0.4, { sill: false });
    gableRoof(m, { x0: -0.45, z0: -0.5, x1: 0.45, z1: 0.55, yE: 0.85, yR: 1.4, axis: 'z', over: 0.18, t: 0.14, bands: false, gable: PAL.stone, cap: false });
    m.pop();
    // 鐘塔(後左)
    const tx = -1.45, tz = -0.95, tw = 0.72, top = 6.2;
    m.with(12, MAT_LIT, () => {
      m.box(tx - tw, PLINTH_H, tz - tw, tx + tw, top, tz + tw, PAL.stone, { top: PAL.stoneD });
      m.box(tx - tw - 0.1, top - 1.55, tz - tw - 0.1, tx + tw + 0.1, top - 1.4, tz + tw + 0.1, PAL.stoneL);
      m.box(tx - tw - 0.1, top - 0.12, tz - tw - 0.1, tx + tw + 0.1, top, tz + tw + 0.1, PAL.stoneL);
    });
    const T = { x0: tx - tw, x1: tx + tw, z0: tz - tw, z1: tz + tw };
    for (const side of ['+z', '+x', '-z', '-x']) { const F = faceMap(T, side); arch(m, F, 0, top - 1.3, 0.5, 1.0, '#2a2230', PAL.stoneL); }
    arch(m, faceMap(T, '+z'), 0, 3.75, 0.36, 0.7, PAL.glow, PAL.stoneL);
    m.with(14, MAT_LIT, () => {
      m.cyl(tx, top, tz, tw * 1.42 + 0.12, 2.4, 4, PAL.slate, { r2: 0, phase: Math.PI / 4 });
      m.cyl(tx, top + 2.4, tz, 0.05, 0.4, 4, PAL.gold, { r2: 0.05 });
    });
    flag(m, tx, tz, top + 2.25, 1.25);
    hangSign(m, faceMap(wb, '-x'), 0.95, 1.9, 0.72, 0.5, PAL.timberL, p => { m.with(6, MAT_LIT, () => m.hexa([p(-0.2, 0.12, -0.06), p(0.2, 0.12, -0.06), p(0.2, 0.36, -0.06), p(-0.2, 0.36, -0.06), p(-0.2, 0.12, 0.06), p(0.2, 0.12, 0.06), p(0.2, 0.36, 0.06), p(-0.2, 0.36, 0.06)], PAL.paper, { side: PAL.blue })); });
    lantern(m, 0.55, 1.95, wb.z1 + 0.18);
    return { light: [-0.25, 1.4, 2.4] };
  },
  training(m) {   // 修煉地:石台上的開放木亭、茅草屋頂、稻草人、武器架、梯子
    m.with(3, MAT_LIT, () => {
      m.box(-2.3, -0.45, -1.9, 2.3, 0.4, 1.9, PAL.stoneW, { top: '#b4b2ac' });
      m.box(-0.7, -0.45, 1.9, 0.7, 0.22, 2.35, PAL.stoneL, { top: PAL.stoneL });
      for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) if (hash1(i * 3 + j, 5) > 0.55) m.box(-2.0 + i * 1.05, 0.4, -1.5 + j * 1.05, -1.2 + i * 1.05, 0.43, -0.75 + j * 1.05, PAL.stoneL);
    });
    const y1 = 3.0;
    m.with(2, MAT_LIT, () => {
      for (const [x, z] of [[-1.95, -1.55], [1.95, -1.55], [-1.95, 1.55], [1.95, 1.55]]) { m.box(x - 0.17, 0.4, z - 0.17, x + 0.17, y1 + 0.1, z + 0.17, PAL.timber); m.box(x - 0.24, 0.4, z - 0.24, x + 0.24, 0.62, z + 0.24, PAL.stoneD); }
      m.box(-2.05, y1 - 0.15, -1.62, 2.05, y1 + 0.1, -1.45, PAL.timberD); m.box(-2.05, y1 - 0.15, 1.45, 2.05, y1 + 0.1, 1.62, PAL.timberD);
      m.box(-2.05, y1 - 0.15, -1.62, -1.85, y1 + 0.1, 1.62, PAL.timberD); m.box(1.85, y1 - 0.15, -1.62, 2.05, y1 + 0.1, 1.62, PAL.timberD);
      m.beam([-1.9, 2.0, 1.55], [-1.3, y1 - 0.1, 1.55], 0.14, PAL.timber); m.beam([1.9, 2.0, 1.55], [1.3, y1 - 0.1, 1.55], 0.14, PAL.timber);
    });
    m.with(11, MAT_LIT, () => {   // 稻草人
      m.cyl(-0.15, 0.4, 0.2, 0.07, 1.9, 5, PAL.timberD);
      m.cyl(-0.15, 0.95, 0.2, 0.28, 0.85, 7, PAL.hay, { r2: 0.24, top: PAL.hayD });
      m.ico(-0.15, 2.05, 0.2, 0.24, 0.26, 0.24, PAL.hay, { seed: 4, jit: 0.08 });
      m.beam([-0.85, 1.6, 0.2], [0.55, 1.6, 0.2], 0.12, PAL.hayD);
      m.box(-0.42, 1.25, 0.12, 0.12, 1.33, 0.3, '#8a4a34');
    });
    m.with(11, MAT_LIT, () => {   // 後方武器架(藍刃)
      m.box(0.65, 0.4, -1.45, 0.75, 1.75, -1.35, PAL.timberD); m.box(1.75, 0.4, -1.45, 1.85, 1.75, -1.35, PAL.timberD); m.box(0.65, 1.45, -1.45, 1.85, 1.55, -1.35, PAL.timberD);
      for (let i = 0; i < 4; i++) { m.box(0.85 + i * 0.26, 0.55, -1.42, 0.93 + i * 0.26, 1.95, -1.36, i % 2 ? '#5a7ab8' : PAL.ironL); }
      for (let i = 0; i < 5; i++) m.box(-1.95, 0.6 + i * 0.42, 0.35, -1.8, 0.68 + i * 0.42, 1.15, PAL.timberL);   // 梯子橫檔
      m.box(-1.95, 0.4, 0.3, -1.8, 2.7, 0.38, PAL.timber); m.box(-1.95, 0.4, 1.12, -1.8, 2.7, 1.2, PAL.timber);
    });
    banner(m, faceMap({ x0: -2.05, x1: 2.05, z0: -1.62, z1: 1.45 }, '+z'), 1.0, 1.75, 0.45, 1.0);
    gableRoof(m, { x0: -2.05, z0: -1.62, x1: 2.05, z1: 1.62, yE: y1 + 0.1, yR: y1 + 2.1, axis: 'x', over: 0.48 });
    return { light: [0, 1.4, 2.2] };
  },
  sanctuary(m) {   // 復活聖所:灰石小教堂、山牆朝前、石十字、拱門、門前藍色水晶、蠟燭、藍旗
    const wb = WALL, y1 = 3.4;
    plinth(m, PAL.stoneD, PAL.stone);
    walls(m, wb, PLINTH_H, y1, PAL.stone);
    m.with(2, MAT_LIT, () => {
      for (const side of ['+z', '+x', '-z', '-x']) {
        const F = faceMap(wb, side);
        for (let r = 0; r < 5; r++) for (let c = 0; c < 4; c++) { const h = hash1(r * 5 + c, side.charCodeAt(1) + 9); if (h < 0.5) continue; const u = -F.hw + 0.4 + c * (F.hw * 2 - 0.8) / 3 + (r % 2) * 0.25, v = PLINTH_H + 0.3 + r * 0.58; faceBox(m, F, u - 0.3, v, u + 0.2, v + 0.4, 0, 0.05, h > 0.8 ? PAL.stoneL : PAL.stoneD); }
      }
    });
    const Fz = faceMap(wb, '+z'), Fx = faceMap(wb, '+x');
    arch(m, Fz, -0.2, PLINTH_H, 1.0, 2.0, PAL.door, PAL.stoneL);
    m.with(4, MAT_LIT, () => faceBox(m, Fz, -0.85, PLINTH_H + 2.15, 0.45, PLINTH_H + 2.35, 0, 0.14, PAL.stoneL));
    for (const u of [-0.8, 0.8]) arch(m, Fx, u, PLINTH_H + 0.85, 0.42, 1.1, PAL.stained, PAL.stoneL);
    // 山牆上的十字窗
    m.with(5, MAT_GLOW, () => { faceBox(m, Fz, -0.32, y1 + 0.55, -0.08, y1 + 1.25, 0.02, 0.06, PAL.glow); faceBox(m, Fz, -0.5, y1 + 0.8, 0.1, y1 + 1.0, 0.02, 0.06, PAL.glow); });
    gableRoof(m, { x0: wb.x0, z0: wb.z0, x1: wb.x1, z1: wb.z1, yE: y1, yR: y1 + 2.2, axis: 'z', gable: PAL.stone });
    m.with(12, MAT_LIT, () => { m.box(-0.13, y1 + 2.2, 1.85, 0.13, y1 + 3.25, 2.1, PAL.stoneL); m.box(-0.42, y1 + 2.65, 1.85, 0.42, y1 + 2.9, 2.1, PAL.stoneL); });
    // 水晶(門前右側台座)
    m.with(3, MAT_LIT, () => { m.box(0.95, 0, 2.15, 1.75, 0.35, 2.85, PAL.stoneL, { top: PAL.stone }); m.box(1.05, 0.35, 2.25, 1.65, 0.5, 2.75, PAL.stone); });
    m.with(16, MAT_GLASS, () => {
      m.push(1.35, 0.5, 2.5, 0.4);
      m.cyl(0, 0, 0, 0.3, 0.55, 6, PAL.crystal, { r2: 0.36 }); m.cyl(0, 0.55, 0, 0.36, 0.7, 6, PAL.crystal, { r2: 0 });
      m.cyl(0.32, 0, 0.1, 0.13, 0.3, 5, PAL.crystalD, { r2: 0 }); m.cyl(-0.3, 0, -0.08, 0.12, 0.42, 5, PAL.crystalD, { r2: 0 });
      m.pop();
    });
    m.with(10, MAT_GLOW, () => { for (const [x, z] of [[-1.55, 2.3], [-1.25, 2.5]]) { m.cyl(x, 0, z, 0.08, 0.3, 5, PAL.white); m.cyl(x, 0.3, z, 0.05, 0.12, 4, PAL.fireL, { r2: 0 }); } });
    flag(m, -2.35, 1.6, 0, 3.2, PAL.blue, -1);
    return { light: [1.35, 1.2, 2.5] };
  },
  house(m) {   // 獵人小屋:原木屋(橫木層疊)、茅草屋頂、石煙囪、門上鹿角、晾皮、柴堆
    const wb = { x0: -2.0, x1: 2.0, z0: -1.55, z1: 1.55 }, y1 = 3.0;
    plinth(m, PAL.stoneD, PAL.stone);
    m.with(2, MAT_LIT, () => {
      for (let i = 0; i < 7; i++) {
        const y = PLINTH_H + i * 0.4, c = i % 2 ? PAL.timber : PAL.timberL;
        m.cylAxis([wb.x0 - 0.22, y + 0.2, wb.z1], [wb.x1 + 0.22, y + 0.2, wb.z1], 0.2, 6, c, { end: '#b08454' });
        m.cylAxis([wb.x0 - 0.22, y + 0.2, wb.z0], [wb.x1 + 0.22, y + 0.2, wb.z0], 0.2, 6, c, { end: '#b08454' });
        m.cylAxis([wb.x1, y + 0.4, wb.z0 - 0.22], [wb.x1, y + 0.4, wb.z1 + 0.22], 0.2, 6, c === PAL.timber ? PAL.timberL : PAL.timber, { end: '#b08454' });
        m.cylAxis([wb.x0, y + 0.4, wb.z0 - 0.22], [wb.x0, y + 0.4, wb.z1 + 0.22], 0.2, 6, c === PAL.timber ? PAL.timberL : PAL.timber, { end: '#b08454' });
      }
      m.box(wb.x0 + 0.05, PLINTH_H, wb.z0 + 0.05, wb.x1 - 0.05, y1, wb.z1 - 0.05, PAL.timberD, { noTop: true });
    });
    const Fz = faceMap({ ...wb, z1: wb.z1 + 0.18, x1: wb.x1 + 0.18 }, '+z'), Fx = faceMap({ ...wb, z1: wb.z1 + 0.18, x1: wb.x1 + 0.18 }, '+x');
    door(m, Fz, -0.55, 0.9, 1.6);
    windowOn(m, Fz, 0.95, 1.45, 0.55, 0.55);
    windowOn(m, Fx, 0, 1.45, 0.55, 0.55);
    gableRoof(m, { x0: wb.x0 - 0.1, z0: wb.z0 - 0.1, x1: wb.x1 + 0.1, z1: wb.z1 + 0.1, yE: y1, yR: y1 + 2.0, axis: 'x', gable: PAL.timber });
    const ch = chimney(m, 1.3, -0.75, y1 - 0.4, y1 + 2.35);
    m.with(6, MAT_LIT, () => {   // 鹿角
      const c = Fz.f(-0.55, PLINTH_H + 2.05, 0.1);
      m.box(c[0] - 0.14, c[1], c[2], c[0] + 0.14, c[1] + 0.2, c[2] + 0.12, PAL.timberD);
      for (const s of [-1, 1]) { m.beam([c[0] + s * 0.1, c[1] + 0.15, c[2] + 0.06], [c[0] + s * 0.5, c[1] + 0.6, c[2] + 0.1], 0.07, '#e9dcc0'); m.beam([c[0] + s * 0.3, c[1] + 0.38, c[2] + 0.08], [c[0] + s * 0.28, c[1] + 0.7, c[2] + 0.1], 0.06, '#e9dcc0'); }
    });
    m.with(11, MAT_LIT, () => {   // 晾皮架 + 柴堆
      m.box(2.35, 0, 0.1, 2.45, 2.0, 0.2, PAL.timberD); m.box(2.35, 0, 1.35, 2.45, 2.0, 1.45, PAL.timberD); m.box(2.35, 1.85, 0.1, 2.45, 1.95, 1.45, PAL.timberD);
      m.poly([[2.48, 0.75, 0.3], [2.48, 0.6, 1.25], [2.48, 1.8, 1.3], [2.48, 1.8, 0.25]], '#d9b878', [2.3, 1.2, 0.8]);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3 - i; j++) m.cylAxis([1.0 + j * 0.34 + i * 0.17, 0.17 + i * 0.3, 2.3], [1.0 + j * 0.34 + i * 0.17, 0.17 + i * 0.3, 3.0], 0.16, 6, PAL.timberL, { end: '#c69a62' });
    });
    return { chimney: ch, light: [-0.55, 1.4, 2.4] };
  },
  bounty(m) {   // 委託所:大型告示板(兩根粗柱 + 布告紙)、小茅草頂、石柱腳、木箱、燈籠、藍旗
    m.with(3, MAT_LIT, () => { for (const x of [-1.85, 1.85]) m.box(x - 0.42, -0.4, -0.45, x + 0.42, 0.55, 0.45, PAL.stone, { top: PAL.stoneL }); m.box(-2.3, -0.4, -1.0, 2.3, 0.12, 1.0, PAL.stoneD, { top: PAL.stone }); });
    m.with(2, MAT_LIT, () => {
      for (const x of [-1.85, 1.85]) m.box(x - 0.22, 0.55, -0.22, x + 0.22, 3.6, 0.22, PAL.timber);
      m.box(-1.75, 0.95, -0.12, 1.75, 3.05, 0.12, PAL.timberD, { pz: PAL.timber });
      m.box(-2.2, 3.05, -0.25, 2.2, 3.3, 0.25, PAL.timberD); m.box(-2.2, 0.85, -0.2, 2.2, 1.05, 0.2, PAL.timberD);
    });
    m.with(6, MAT_LIT, () => {   // 布告紙
      for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) {
        const x = -1.35 + c * 0.9, y = 1.25 + r * 0.92, w = 0.32 + hash1(r * 4 + c, 3) * 0.08;
        m.box(x - w, y, 0.12, x + w, y + 0.7, 0.16, hash1(r * 4 + c, 8) > 0.7 ? '#e8d29a' : PAL.paper);
        m.box(x - 0.05, y + 0.58, 0.16, x + 0.05, y + 0.66, 0.19, PAL.red);
      }
    });
    gableRoof(m, { x0: -2.0, z0: -0.45, x1: 2.0, z1: 0.45, yE: 3.35, yR: 4.25, axis: 'x', over: 0.38, t: 0.2 });
    crate(m, -1.2, 1.15, 0.12, 0.62, 0.15); crate(m, -0.55, 1.4, 0.12, 0.5, -0.2);
    m.with(9, MAT_LIT, () => m.box(2.07, 2.6, -0.06, 2.6, 2.7, 0.06, PAL.timberD));
    lantern(m, 2.5, 2.05, 0);
    flag(m, 1.85, -0.0, 3.6, 1.55);
    return { light: [0, 1.6, 1.4] };
  },
  enhancement(m) {   // 強化精煉所:石砌下半 + 木構上半、茅草屋頂、煙囪、爐口火光、磨刀輪、酒桶、錘紋藍垂幅
    const wb = WALL, y1 = 3.5;
    plinth(m, PAL.stoneD, PAL.stone);
    walls(m, wb, PLINTH_H, 1.7, PAL.stone, 2);
    walls(m, wb, 1.7, y1, PAL.plSand, 2);
    timberFrame(m, wb, ['+z', '+x', '-z', '-x'], 1.7, y1, [], true);
    const Fz = faceMap(wb, '+z'), Fx = faceMap(wb, '+x');
    door(m, Fz, 1.2, 0.8, 1.55);
    m.with(4, MAT_LIT, () => faceBox(m, Fz, -1.25, PLINTH_H + 0.15, 0.15, PLINTH_H + 1.45, 0, 0.12, PAL.stoneL));
    m.with(15, MAT_GLOW, () => { m.poly([Fz.f(-1.1, PLINTH_H + 0.25, 0.13), Fz.f(0.0, PLINTH_H + 0.25, 0.13), Fz.f(0.0, PLINTH_H + 1.0, 0.13), Fz.f(-0.55, PLINTH_H + 1.3, 0.13), Fz.f(-1.1, PLINTH_H + 1.0, 0.13)], PAL.fire, Fz.f(-0.5, 1, -1)); m.poly([Fz.f(-0.8, PLINTH_H + 0.25, 0.14), Fz.f(-0.3, PLINTH_H + 0.25, 0.14), Fz.f(-0.55, PLINTH_H + 0.85, 0.14)], PAL.fireL, Fz.f(-0.5, 1, -1)); });
    windowOn(m, Fz, -0.55, 2.6, 0.6, 0.55); windowOn(m, Fx, 0, 2.6, 0.6, 0.55);
    banner(m, Fx, -0.95, 0.75, 0.45, 1.0);
    gableRoof(m, { x0: wb.x0, z0: wb.z0, x1: wb.x1, z1: wb.z1, yE: y1, yR: y1 + 2.1, axis: 'x', gable: PAL.plSand });
    const ch = chimney(m, 1.35, -0.9, y1 - 0.4, y1 + 2.5);
    m.with(11, MAT_LIT, () => {   // 磨刀輪
      m.box(-2.55, 0, 2.05, -1.35, 0.55, 2.6, PAL.timber, { top: PAL.timberL });
      m.cylAxis([-2.05, 1.05, 2.15], [-2.05, 1.05, 2.5], 0.52, 10, '#c9c4b8', { end: '#e6e2d8' });
      m.cylAxis([-2.05, 1.05, 2.0], [-2.05, 1.05, 2.65], 0.07, 5, PAL.iron);
    });
    barrel(m, 2.55, 2.0, 0);
    return { chimney: ch, light: [-0.55, 1.0, 2.3] };
  },
  dungeon(m) {   // 地下城入口:岩石小丘中的石拱洞口(向下的台階)、頂上一小片茅草、兩側火把、藍幡
    m.with(3, MAT_LIT, () => {
      m.ico(0, 0.6, -0.4, 2.35, 1.9, 1.75, PAL.stone, { seed: 21, jit: 0.14, flatBottom: -0.35 });
      m.ico(-1.55, 0.5, 0.55, 1.05, 1.15, 1.0, PAL.stoneD, { seed: 22, jit: 0.2, flatBottom: -0.4 });
      m.ico(1.55, 0.45, 0.6, 1.0, 1.05, 0.95, PAL.stone, { seed: 23, jit: 0.2, flatBottom: -0.4 });
      m.ico(2.1, 0.2, 1.55, 0.45, 0.35, 0.42, PAL.stoneL, { seed: 24 }); m.ico(-2.15, 0.2, 1.45, 0.4, 0.32, 0.38, PAL.stoneL, { seed: 25 });
    });
    // 石拱門面
    m.with(4, MAT_LIT, () => {
      m.box(-1.25, 0, 0.75, 1.25, 2.55, 1.45, PAL.stoneL, { pz: PAL.stone });
      m.box(-1.4, 2.4, 0.7, 1.4, 2.75, 1.55, PAL.stoneL);
    });
    m.with(5, MAT_FLAT, () => {   // 洞口(黑)
      const P = [[-0.72, 0.12, 1.47], [0.72, 0.12, 1.47]];
      for (let i = 0; i <= 6; i++) { const a = (i / 6) * Math.PI; P.push([Math.cos(a) * 0.72, 1.45 + Math.sin(a) * 0.72, 1.47]); }
      m.poly(P, '#16111c', [0, 1, 0]);
    });
    m.with(6, MAT_LIT, () => { for (let i = 0; i < 4; i++) m.box(-0.95, -0.2, 1.5 + i * 0.32, 0.95, 0.42 - i * 0.14, 1.82 + i * 0.32, i % 2 ? PAL.stone : PAL.stoneL); });
    gableRoof(m, { x0: -1.3, z0: -0.7, x1: 1.3, z1: 1.0, yE: 2.75, yR: 3.75, axis: 'x', over: 0.32, t: 0.18 });
    torch(m, -1.55, 1.75, 0, 1.5); torch(m, 1.55, 1.75, 0, 1.5);
    m.with(8, MAT_LIT, () => {
      m.cyl(-1.95, 0, 0.25, 0.07, 3.6, 5, PAL.timberD);
      m.beam([-1.95, 3.45, 0.25], [-1.15, 3.6, 0.25], 0.08, PAL.timberD);
      m.box(-1.85, 1.95, 0.21, -1.25, 3.4, 0.29, PAL.blue); m.box(-1.66, 2.55, 0.29, -1.44, 2.85, 0.31, PAL.gold);
    });
    return { light: [0, 1.0, 2.0] };
  },
  plot(m) {   // 空地(尚未建造):整平的泥土地基、四角木樁、繩子、木板堆、石塊
    m.with(3, MAT_LIT, () => {
      m.box(-2.1, -0.3, -1.7, 2.1, 0.08, 1.7, PAL.dirt, { top: '#9c7a50' });
      for (const [x, z] of [[-2.1, -1.7], [2.1, -1.7], [-2.1, 1.7], [2.1, 1.7]]) m.box(x - 0.11, 0, z - 0.11, x + 0.11, 0.95, z + 0.11, PAL.timber, { top: PAL.timberL });
    });
    m.with(11, MAT_LIT, () => {
      const r = (a, b) => m.beam(a, b, 0.05, PAL.rope);
      r([-2.1, 0.78, -1.7], [2.1, 0.78, -1.7]); r([-2.1, 0.78, 1.7], [2.1, 0.78, 1.7]); r([-2.1, 0.78, -1.7], [-2.1, 0.78, 1.7]); r([2.1, 0.78, -1.7], [2.1, 0.78, 1.7]);
      for (let i = 0; i < 4; i++) m.box(-1.3 + (i % 2) * 0.08, 0.08 + i * 0.1, -0.3 - (i % 2) * 0.06, 0.4 + (i % 2) * 0.08, 0.18 + i * 0.1, 0.05 - (i % 2) * 0.06, i % 2 ? PAL.timberL : '#b08454');
      m.ico(1.1, 0.25, 0.7, 0.34, 0.26, 0.3, PAL.stoneL, { seed: 31, flatBottom: -0.6 }); m.ico(1.5, 0.2, 0.35, 0.24, 0.2, 0.22, PAL.stone, { seed: 32, flatBottom: -0.6 });
    });
    return {};
  },
};

// ── 地圖物件 ───────────────────────────────────────────────────────────────
// 每個物件:本地座標原點 = 落地點;回傳的模型再依 size/variant 旋轉縮放、貼到地形高度。
function treeTrunk(m, h, r, col, seed, roots = 3) {
  m.with(1, MAT_LIT, () => {
    m.cyl(0, -0.4, 0, r * 1.15, h + 0.4, 6, col, { r2: r * 0.7, phase: seed });
    for (let i = 0; i < roots; i++) { const a = seed * 3 + (i / roots) * TAU; m.beam([Math.cos(a) * r * 0.5, 0.35, Math.sin(a) * r * 0.5], [Math.cos(a) * r * 1.9, -0.05, Math.sin(a) * r * 1.9], r * 0.55, col); }
  });
}
const PROPS = {
  oak(m, v, size, pal = [PAL.leaf, PAL.leafL, PAL.leafD]) {
    treeTrunk(m, 1.6, 0.26, PAL.bark, v);
    m.with(2, MAT_LIT, () => {
      m.beam([0, 1.3, 0], [0.55, 2.2, 0.1], 0.18, PAL.bark); m.beam([0, 1.3, 0], [-0.5, 2.1, -0.2], 0.16, PAL.bark);
      const B = [[0, 2.85, 0, 1.25, 1.0], [0.85, 2.45, 0.3, 0.85, 0.75], [-0.85, 2.5, -0.15, 0.85, 0.75], [0.1, 2.35, 0.85, 0.85, 0.7], [-0.15, 2.4, -0.85, 0.8, 0.7], [0.15, 3.55, 0.05, 0.75, 0.6]];
      B.forEach(([x, y, z, r, ry], i) => m.ico(x, y, z, r, ry, r, pal[i % 3 === 2 ? 2 : i === 5 ? 1 : 0], { seed: v * 7 + i, jit: 0.18 }));
    });
    return { h: 4.2 };
  },
  autumnOak(m, v) { return PROPS.oak(m, v, 1, [PAL.autumn, PAL.autumnL, PAL.autumnD]); },
  birch(m, v) {
    m.with(1, MAT_LIT, () => {
      m.cyl(0, -0.4, 0, 0.2, 3.1, 6, PAL.birchBark, { r2: 0.14, phase: v });
      for (let i = 0; i < 5; i++) { const a = v + i * 2.1, y = 0.4 + i * 0.5; m.box(Math.cos(a) * 0.17 - 0.06, y, Math.sin(a) * 0.17 - 0.06, Math.cos(a) * 0.17 + 0.06, y + 0.1, Math.sin(a) * 0.17 + 0.06, '#3a3430'); }
      m.beam([0, 2.0, 0], [0.45, 2.7, 0.1], 0.1, PAL.birchBark); m.beam([0, 2.2, 0], [-0.4, 2.8, -0.15], 0.09, PAL.birchBark);
    });
    m.with(2, MAT_LIT, () => {
      const B = [[0, 3.35, 0, 0.85, 1.1], [0.55, 2.85, 0.2, 0.62, 0.7], [-0.5, 2.9, -0.15, 0.6, 0.7], [0.05, 4.1, 0, 0.5, 0.55], [0.1, 2.75, -0.55, 0.55, 0.6]];
      B.forEach(([x, y, z, r, ry], i) => m.ico(x, y, z, r, ry, r, [PAL.birchLeaf, PAL.birchLeafL, PAL.birchLeafD][i % 3], { seed: v * 5 + i, jit: 0.2 }));
    });
    return { h: 4.6 };
  },
  pine(m, v, size, snow = false) {
    m.with(1, MAT_LIT, () => m.cyl(0, -0.4, 0, 0.22, 1.4, 5, PAL.bark, { r2: 0.16, phase: v }));
    m.with(2, MAT_LIT, () => {
      const tiers = [[0.75, 1.25, 1.55], [1.55, 1.05, 1.4], [2.35, 0.82, 1.25], [3.1, 0.58, 1.1]];
      tiers.forEach(([y, r, h], i) => {
        const ph = v + i * 0.7;
        m.cyl(0, y, 0, r, h, 7, i % 2 ? PAL.pine : PAL.pineL, { r2: 0, phase: ph, bottom: PAL.pineD });
        if (snow) m.cyl(0, y + h * 0.42, 0, r * 0.62, h * 0.6, 7, PAL.snow, { r2: 0, phase: ph + 0.2, bottom: PAL.snowB });
      });
    });
    return { h: 4.3 };
  },
  snowpine(m, v) { return PROPS.pine(m, v, 1, true); },
  cactus(m, v) {
    m.with(1, MAT_LIT, () => {
      m.cyl(0, -0.3, 0, 0.32, 2.4, 8, PAL.cactus, { r2: 0.3, phase: 0.2 }); m.cyl(0, 2.1, 0, 0.3, 0.3, 8, PAL.cactusL, { r2: 0.12, phase: 0.2 });
      m.cylAxis([0.2, 1.0, 0], [0.7, 1.0, 0], 0.17, 6, PAL.cactus); m.cyl(0.72, 0.85, 0, 0.18, 0.95, 6, PAL.cactus, { r2: 0.16 }); m.cyl(0.72, 1.8, 0, 0.16, 0.15, 6, PAL.cactusL, { r2: 0.06 });
      m.cylAxis([-0.2, 1.45, 0], [-0.62, 1.45, 0], 0.15, 6, PAL.cactusD); m.cyl(-0.64, 1.32, 0, 0.16, 0.7, 6, PAL.cactusD, { r2: 0.14 }); m.cyl(-0.64, 2.02, 0, 0.14, 0.12, 6, PAL.cactusL, { r2: 0.05 });
      m.ico(0.05, 2.45, 0.05, 0.12, 0.08, 0.12, PAL.flowerP, { seed: 3 });
    });
    return { h: 2.5 };
  },
  mushroom(m, v) {
    const one = (x, z, s, i) => m.with(1, MAT_LIT, () => {
      m.cyl(x, -0.1, z, 0.09 * s, 0.45 * s, 6, PAL.mushStem, { r2: 0.07 * s });
      m.cyl(x, 0.35 * s, z, 0.32 * s, 0.24 * s, 7, PAL.mushCap, { r2: 0.0, bottom: '#e8cfb0', phase: i });
      for (let k = 0; k < 3; k++) { const a = i + k * 2.1; m.box(x + Math.cos(a) * 0.14 * s - 0.04 * s, 0.42 * s, z + Math.sin(a) * 0.14 * s - 0.04 * s, x + Math.cos(a) * 0.14 * s + 0.04 * s, 0.47 * s, z + Math.sin(a) * 0.14 * s + 0.04 * s, PAL.white); }
    });
    one(0, 0, 1.15, v); one(0.38, 0.22, 0.75, v + 1); one(-0.32, 0.25, 0.6, v + 2);
    return { h: 0.7 };
  },
  boulders(m, v) {
    m.with(1, MAT_LIT, () => { m.ico(0, 0.35, 0, 0.62, 0.48, 0.55, PAL.rock, { seed: v * 3 + 1, jit: 0.22, flatBottom: -0.5 }); m.ico(0.55, 0.2, 0.35, 0.38, 0.3, 0.34, PAL.rockL, { seed: v * 3 + 2, jit: 0.22, flatBottom: -0.5 }); });
    return { h: 0.8 };
  },
  outcrop(m, v) {
    m.with(1, MAT_LIT, () => {
      const C = [[0, 0, 0.62, 2.4], [0.62, -0.35, 0.5, 1.7], [-0.55, 0.3, 0.52, 1.5], [0.35, 0.55, 0.42, 1.05], [-0.2, -0.65, 0.4, 1.2]];
      C.forEach(([x, z, r, h], i) => {
        m.cyl(x, -0.3, z, r, h + 0.3, 5, i % 2 ? PAL.rock : PAL.rockD, { r2: r * 0.86, phase: v + i, top: PAL.rockL });
        m.cyl(x, h, z, r * 0.8, 0.16, 5, PAL.moss, { r2: r * 0.5, phase: v + i + 0.3 });
      });
    });
    return { h: 2.6 };
  },
  mossRock(m, v) {
    m.with(1, MAT_LIT, () => { m.ico(0, 0.55, 0, 0.85, 0.72, 0.78, PAL.rock, { seed: v * 5 + 3, jit: 0.15, flatBottom: -0.55 }); m.ico(0.05, 1.05, 0.0, 0.62, 0.3, 0.58, PAL.moss, { seed: v * 5 + 4, jit: 0.15 }); });
    return { h: 1.3 };
  },
  iceRocks(m, v) {
    m.with(1, MAT_GLASS, () => {
      const C = [[0, 0, 0.32, 1.7, 0.0], [0.42, 0.18, 0.24, 1.1, 0.25], [-0.38, 0.12, 0.25, 1.25, -0.22], [0.12, -0.38, 0.2, 0.85, 0.15], [-0.15, 0.42, 0.18, 0.7, -0.1]];
      C.forEach(([x, z, r, h, tilt], i) => { m.push(x, -0.15, z, v + i); m.cyl(0, 0, 0, r, h * 0.7, 6, i % 2 ? PAL.ice : PAL.iceL, { r2: r * 1.05 }); m.cyl(0, h * 0.7, 0, r * 1.05, h * 0.35, 6, PAL.iceL, { r2: 0 }); m.pop(); });
    });
    m.with(2, MAT_LIT, () => m.ico(0, 0.05, 0, 0.75, 0.18, 0.7, PAL.snowB, { seed: 4, flatBottom: -0.2 }));
    return { h: 1.6 };
  },
  ruins(m, v) {
    m.with(1, MAT_LIT, () => {
      // 立柱
      m.box(-1.3, -0.2, -0.3, -0.8, 0.25, 0.2, PAL.ruinD, { top: PAL.ruin });
      m.box(-1.22, 0.25, -0.22, -0.88, 2.4, 0.12, PAL.ruin);
      m.box(-1.35, 2.4, -0.35, -0.75, 2.65, 0.25, PAL.ruinL);
      // 拱門(兩腳 + 半圓拱)
      const ax = 0.65, r = 0.75;
      m.box(ax - r - 0.32, -0.2, -0.22, ax - r, 1.3, 0.22, PAL.ruin); m.box(ax + r, -0.2, -0.22, ax + r + 0.32, 1.1, 0.22, PAL.ruin);
      for (let i = 0; i < 6; i++) {
        if (i === 4) continue;   // 拱頂缺一塊(破損)
        const a0 = Math.PI * (i / 6), a1 = Math.PI * ((i + 1) / 6), cy = 1.3;
        const q = (a, rr, z) => [ax - Math.cos(a) * rr, cy + Math.sin(a) * rr, z];
        m.hexa([q(a0, r, -0.22), q(a1, r, -0.22), q(a1, r + 0.32, -0.22), q(a0, r + 0.32, -0.22), q(a0, r, 0.22), q(a1, r, 0.22), q(a1, r + 0.32, 0.22), q(a0, r + 0.32, 0.22)], i % 2 ? PAL.ruinL : PAL.ruin);
      }
      // 倒下的石塊
      m.push(0.2, 0, 0.75, 0.4); m.box(-0.35, -0.1, -0.2, 0.35, 0.28, 0.2, PAL.ruinD, { top: PAL.ruin }); m.pop();
      m.push(1.45, 0, 0.6, -0.3); m.box(-0.25, -0.1, -0.2, 0.25, 0.22, 0.2, PAL.ruin, { top: PAL.ruinL }); m.pop();
      m.push(-0.35, 0, 0.55, 0.9); m.box(-0.2, -0.1, -0.15, 0.2, 0.18, 0.15, PAL.ruinL); m.pop();
    });
    m.with(2, MAT_LIT, () => { m.box(-1.3, 2.62, -0.3, -1.0, 2.7, 0.05, PAL.moss); m.ico(ax0(), 0.05, 0.4, 0.3, 0.12, 0.25, PAL.moss, { seed: 9 }); });
    return { h: 2.7 };
  },
  stump(m, v) {
    m.with(1, MAT_LIT, () => {
      m.cyl(0, -0.3, 0, 0.5, 0.85, 7, PAL.bark, { r2: 0.44, top: '#c89a64', phase: v });
      m.cyl(0, 0.55, 0, 0.24, 0.02, 7, '#a87a48', { phase: v });
      for (let i = 0; i < 4; i++) { const a = v + (i / 4) * TAU; m.beam([Math.cos(a) * 0.25, 0.3, Math.sin(a) * 0.25], [Math.cos(a) * 0.8, -0.05, Math.sin(a) * 0.8], 0.22, PAL.barkD); }
    });
    return { h: 0.6 };
  },
  fallenLog(m, v) {
    m.with(1, MAT_LIT, () => {
      m.cylAxis([-1.2, 0.32, 0], [1.2, 0.32, 0], 0.38, 7, PAL.bark, { end: '#c69a62' });
      m.cylAxis([-0.5, 0.45, 0.02], [0.8, 0.45, 0.02], 0.36, 7, PAL.moss, { caps: false, phase: 0.2 });
      m.beam([0.6, 0.45, 0.1], [0.95, 0.95, 0.35], 0.1, PAL.bark);
      m.ico(-0.6, 0.06, 0.45, 0.4, 0.1, 0.25, PAL.mossD, { seed: 6 });
    });
    return { h: 0.8 };
  },
  fenceRail(m, v, size) {   // 柵欄一段:長 2*size,沿本地 x
    const L = Math.max(0.6, 2 * size), h = 1.35;
    m.with(1, MAT_LIT, () => {
      for (const x of [-L / 2 + 0.12, L / 2 - 0.12]) { m.box(x - 0.13, -0.4, -0.13, x + 0.13, h, 0.13, PAL.timberL, { top: '#d6b07a' }); }
      m.box(-L / 2, 0.45, -0.07, L / 2, 0.68, 0.07, PAL.timber, { top: PAL.timberL });
      m.box(-L / 2, 0.95, -0.07, L / 2, 1.18, 0.07, PAL.timber, { top: PAL.timberL });
    });
    return { h: 1.4 };
  },
  snowDrift(m, v) {
    m.with(1, MAT_LIT, () => { m.ico(0, 0.1, 0, 1.25, 0.6, 0.95, PAL.snow, { seed: v * 3 + 1, jit: 0.12, flatBottom: -0.15 }); m.ico(0.85, 0.05, 0.4, 0.7, 0.4, 0.6, PAL.snowB, { seed: v * 3 + 2, jit: 0.15, flatBottom: -0.1 }); m.ico(-0.75, 0.05, -0.3, 0.6, 0.35, 0.5, PAL.snow, { seed: v * 3 + 3, flatBottom: -0.1 }); });
    return { h: 0.7 };
  },
  cliffLedge(m, v) {
    m.with(1, MAT_LIT, () => {
      m.ico(0, 0.4, 0, 2.2, 1.0, 1.25, PAL.rockD, { seed: v * 4 + 1, jit: 0.12, flatBottom: -0.4 });
      m.ico(-0.3, 1.1, -0.2, 1.7, 0.6, 1.0, PAL.rock, { seed: v * 4 + 2, jit: 0.14 });
      m.ico(-0.3, 1.55, -0.25, 1.3, 0.22, 0.8, PAL.snow, { seed: v * 4 + 3, jit: 0.1 });
    });
    return { h: 1.8 };
  },
  cave(m, v) {
    m.with(1, MAT_LIT, () => {
      m.ico(0, 0.7, -0.35, 1.7, 1.75, 1.35, PAL.rock, { seed: v * 6 + 1, jit: 0.16, flatBottom: -0.4 });
      m.ico(-1.05, 0.45, 0.35, 0.8, 0.9, 0.75, PAL.rockD, { seed: v * 6 + 2, jit: 0.2, flatBottom: -0.5 });
      m.ico(1.05, 0.45, 0.3, 0.8, 0.95, 0.75, PAL.rockD, { seed: v * 6 + 3, jit: 0.2, flatBottom: -0.5 });
      m.ico(0.2, 2.15, -0.45, 0.65, 0.5, 0.6, PAL.rockL, { seed: v * 6 + 4 });
      m.ico(-0.6, 1.6, 0.1, 0.4, 0.18, 0.35, PAL.moss, { seed: v * 6 + 5 });
    });
    m.with(3, MAT_FLAT, () => {
      const P = [[-0.55, 0.0, 0.92], [0.55, 0.0, 0.92]];
      for (let i = 0; i <= 6; i++) { const a = (i / 6) * Math.PI; P.push([Math.cos(a) * 0.55, 0.55 + Math.sin(a) * 0.62, 0.92]); }
      m.poly(P, '#16111c', [0, 0.5, 0]);
    });
    m.with(4, MAT_LIT, () => m.box(-0.5, -0.2, 0.9, 0.5, 0.04, 1.6, PAL.sandD, { top: '#a08664' }));
    return { h: 2.6 };
  },
  monument(m) {   // 廣場雕像:兩層石台 + 四面藍垂幅 + 騎士像 + 木柱茅草亭 + 一圈花
    m.with(3, MAT_LIT, () => { m.box(-1.25, -0.3, -1.0, 1.25, 0.25, 1.0, PAL.stone, { top: PAL.stoneL }); m.box(-0.75, 0.25, -0.6, 0.75, 1.55, 0.6, PAL.stone, { top: PAL.stoneL }); m.box(-0.85, 1.45, -0.7, 0.85, 1.62, 0.7, PAL.stoneL); });
    for (const side of ['+z', '+x', '-z', '-x']) { const F = faceMap({ x0: -0.75, x1: 0.75, z0: -0.6, z1: 0.6 }, side); banner(m, F, 0, 0.5, 0.42, 0.85); }
    m.with(12, MAT_LIT, () => {   // 騎士
      m.box(-0.22, 1.62, -0.14, -0.04, 2.2, 0.12, PAL.ironL); m.box(0.04, 1.62, -0.14, 0.22, 2.2, 0.12, PAL.ironL);
      m.box(-0.28, 2.2, -0.18, 0.28, 2.85, 0.18, '#9aa0ac'); m.box(-0.18, 2.85, -0.15, 0.18, 3.18, 0.15, '#aab0bb');
      m.cyl(0, 3.18, 0, 0.17, 0.12, 4, '#aab0bb', { r2: 0.05 });
      m.beam([0.36, 2.25, 0.1], [0.42, 3.4, 0.25], 0.07, '#d8dde6'); m.box(0.28, 2.3, 0.03, 0.52, 2.38, 0.27, PAL.gold);
      m.box(-0.5, 2.25, -0.08, -0.3, 2.85, 0.24, PAL.blue);
    });
    m.with(2, MAT_LIT, () => { for (const [x, z] of [[-1.1, -0.85], [1.1, -0.85], [-1.1, 0.85], [1.1, 0.85]]) m.box(x - 0.1, 0.25, z - 0.1, x + 0.1, 3.55, z + 0.1, PAL.timber); });
    gableRoof(m, { x0: -1.1, z0: -0.85, x1: 1.1, z1: 0.85, yE: 3.55, yR: 4.55, axis: 'x', over: 0.3, t: 0.18, bands: false });
    m.with(6, MAT_LIT, () => { for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU, x = Math.cos(a) * 1.15, z = Math.sin(a) * 0.92; m.ico(x, 0.35, z, 0.16, 0.12, 0.16, [PAL.flowerR, PAL.leafL, PAL.flowerY, PAL.leafL, PAL.flowerW, PAL.flowerP][i % 6], { seed: i + 40 }); } });
    return { h: 4.6 };
  },
  // 村莊道具(目前地圖上沒有擺放,模型備好;有擺就自動走 3D)
  barrels(m) { barrel(m, -0.3, 0, 0); barrel(m, 0.35, 0.15, 0, 0.3, 0.68); return { h: 0.8 }; },
  barrel(m) { barrel(m, 0, 0, 0, 0.3, 0.7); return { h: 0.75 }; },
  crates(m) { crate(m, 0, 0, 0, 0.62, 0.1); crate(m, 0.05, 0.05, 0.62, 0.48, -0.25); return { h: 1.1 }; },
  well(m) {
    m.with(1, MAT_LIT, () => { m.cyl(0, -0.2, 0, 0.85, 1.0, 10, PAL.stone, { top: '#2a3a4a' }); m.cyl(0, 0.8, 0, 0.92, 0.12, 10, PAL.stoneL); });
    m.with(2, MAT_LIT, () => { m.box(-0.85, 0.8, -0.08, -0.7, 2.3, 0.08, '#8a3a2c'); m.box(0.7, 0.8, -0.08, 0.85, 2.3, 0.08, '#8a3a2c'); m.cylAxis([-0.75, 1.7, 0], [0.75, 1.7, 0], 0.08, 5, PAL.timberD); m.box(-0.05, 1.05, -0.12, 0.2, 1.3, 0.12, PAL.timberL); });
    gableRoof(m, { x0: -0.85, z0: -0.55, x1: 0.85, z1: 0.55, yE: 2.3, yR: 2.95, axis: 'x', over: 0.25, t: 0.14, bands: false });
    return { h: 3.0 };
  },
  lantern(m) {
    m.with(1, MAT_LIT, () => { m.box(-0.08, -0.2, -0.08, 0.08, 2.0, 0.08, PAL.timberD); m.box(-0.08, 1.85, -0.08, 0.55, 1.97, 0.08, PAL.timberD); });
    lantern(m, 0.5, 1.35, 0);
    return { h: 2.0 };
  },
};
function ax0() { return -0.95; }

// 地圖物件類型 → 是否有 3D 模型(其餘維持 2D 立牌:花、草叢、蕨類、區域立牌)
export const MESH_DECOR = new Set(Object.keys(PROPS));
export const BUILDING_KINDS = new Set(Object.keys(BUILDERS));

// 單一模型(本地座標)。cache:同 kind+variant 只建一次
const protoCache = new Map();
export function buildModel(kind, variant = 0, size = 1) {
  const key = `${kind}|${variant}|${kind === 'fenceRail' ? size.toFixed(2) : ''}`;
  let r = protoCache.get(key);
  if (r) return r;
  const m = new MeshBuilder();
  let meta = {};
  if (BUILDERS[kind]) meta = BUILDERS[kind](m, variant) || {};
  else if (PROPS[kind]) meta = PROPS[kind](m, variant, size) || {};
  else return null;
  r = { ...m.finish(), anchors: meta, kind };
  protoCache.set(key, r);
  return r;
}

// 把很多物件合併成一個世界座標的靜態網格(一次 draw call)。items: [{kind,x,y,z,yaw,scale,variant,size}]
export function bakeStatic(items) {
  let total = 0;
  const parts = [];
  for (const it of items) {
    const p = buildModel(it.kind, it.variant ?? 0, it.size ?? 1);
    if (!p || !p.count) continue;
    parts.push([p, it]);
    total += p.count;
  }
  const pos = new Float32Array(total * 3), nrm = new Int8Array(total * 4), col = new Uint8Array(total * 4);
  let o = 0;
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const [p, it] of parts) {
    const co = Math.cos(it.yaw || 0), si = Math.sin(it.yaw || 0), k = it.scale || 1;
    for (let i = 0; i < p.count; i++) {
      const x = p.pos[i * 3] * k, y = p.pos[i * 3 + 1] * k, z = p.pos[i * 3 + 2] * k;
      const X = x * co - z * si + it.x, Y = y + it.y, Z = x * si + z * co + it.z;
      pos[(o + i) * 3] = X; pos[(o + i) * 3 + 1] = Y; pos[(o + i) * 3 + 2] = Z;
      if (X < mn[0]) mn[0] = X; if (Y < mn[1]) mn[1] = Y; if (Z < mn[2]) mn[2] = Z;
      if (X > mx[0]) mx[0] = X; if (Y > mx[1]) mx[1] = Y; if (Z > mx[2]) mx[2] = Z;
      const nx = p.nrm[i * 4], ny = p.nrm[i * 4 + 1], nz = p.nrm[i * 4 + 2];
      nrm[(o + i) * 4] = Math.round(nx * co - nz * si); nrm[(o + i) * 4 + 1] = ny; nrm[(o + i) * 4 + 2] = Math.round(nx * si + nz * co);
    }
    col.set(p.col, o * 4);
    o += p.count;
  }
  return { pos, nrm, col, count: total, min: mn, max: mx, n: parts.length };
}

// 合併多個本地模型成一個 VBO 區段表(建築原型):回傳 {pos,nrm,col,count, ranges:{key:{first,count,...}}}
export function packPrototypes(keys) {
  const list = [];
  let total = 0;
  for (const [key, kind, variant] of keys) { const p = buildModel(kind, variant); if (p) { list.push([key, p]); total += p.count; } }
  const pos = new Float32Array(total * 3), nrm = new Int8Array(total * 4), col = new Uint8Array(total * 4), ranges = {};
  let o = 0;
  for (const [key, p] of list) {
    pos.set(p.pos, o * 3); nrm.set(p.nrm, o * 4); col.set(p.col, o * 4);
    ranges[key] = { first: o, count: p.count, min: p.min, max: p.max, hull: p.hull, anchors: p.anchors };
    o += p.count;
  }
  return { pos, nrm, col, count: total, ranges };
}
