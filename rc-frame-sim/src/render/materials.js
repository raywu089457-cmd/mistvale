// Procedural textures, physically based materials, and GPU-side animation hooks.
// All per-member and per-group animation (explode, formwork erection, pour, selection) is read in the vertex
// shader from small data textures, so merged meshes are built once and never rebuilt during playback.
import * as THREE from 'three';
import { RIB_PITCH } from '../standards.js';

// ---------------------------------------------------------------- canvas helpers
function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Helical rib normal map. One rib per tile in the helix direction; texture u = around the bar, v = along, scaled
// so that one tile equals one rib pitch (1.5 cm) along the bar's real length.
export function ribNormalTexture() {
  const N = 256;
  const c = canvas(N, N);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(N, N);
  const H = new Float32Array(N * N);
  const ridge = (x) => {
    const a = smooth(0.30, 0.40, x), b = 1 - smooth(0.60, 0.70, x);
    return Math.min(a, b);
  };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N;
    H[y * N + x] = ridge(((v - u) % 1 + 1) % 1);
  }
  const s = 3.0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const xl = (x - 1 + N) % N, xr = (x + 1) % N, yu = (y - 1 + N) % N, yd = (y + 1) % N;
    const dhdx = (H[y * N + xr] - H[y * N + xl]) * s;
    const dhdy = (H[yd * N + x] - H[yu * N + x]) * s;
    let nx = -dhdx, ny = dhdy, nz = 1;
    const l = Math.hypot(nx, ny, nz);
    nx /= l; ny /= l; nz /= l;
    const i = (y * N + x) * 4;
    img.data[i] = (nx * 0.5 + 0.5) * 255;
    img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
    img.data[i + 2] = (nz * 0.5 + 0.5) * 255;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.colorSpace = THREE.NoColorSpace;
  tex.userData.pitch = RIB_PITCH;
  return tex;
}
function smooth(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// Noise-based colour texture (concrete, soil, yard gravel). Seeded, deterministic.
export function noiseTexture({ size = 512, base = [160, 158, 152], spread = 22, speck = 0.02, seed = 7, repeat = 4 } = {}) {
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const R = rng(seed);
  // value noise grid
  const g = 32, grid = new Float32Array(g * g);
  for (let i = 0; i < grid.length; i++) grid[i] = R();
  const sampleN = (x, y) => {
    const xf = (x / size) * g, yf = (y / size) * g;
    const x0 = Math.floor(xf) % g, y0 = Math.floor(yf) % g;
    const x1 = (x0 + 1) % g, y1 = (y0 + 1) % g;
    const tx = smooth(0, 1, xf - Math.floor(xf)), ty = smooth(0, 1, yf - Math.floor(yf));
    const a = grid[y0 * g + x0], b = grid[y0 * g + x1], cc = grid[y1 * g + x0], d = grid[y1 * g + x1];
    return (a + (b - a) * tx) * (1 - ty) + (cc + (d - cc) * tx) * ty;
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const n = 0.6 * sampleN(x, y) + 0.3 * sampleN((x * 2) % size, (y * 2) % size) + 0.1 * R();
    const k = (n - 0.5) * spread + (R() < speck ? -35 : 0);
    const i = (y * size + x) * 4;
    img.data[i] = clamp255(base[0] + k);
    img.data[i + 1] = clamp255(base[1] + k);
    img.data[i + 2] = clamp255(base[2] + k * 0.9);
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const clamp255 = (v) => Math.max(0, Math.min(255, v));

// Plywood: lamination lines and grain, warm birch tone.
export function plywoodTexture() {
  const size = 512;
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const R = rng(91);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const grain = Math.sin((x * 0.09 + Math.sin(y * 0.013) * 6)) * 6 + (R() - 0.5) * 9;
      const ply = (y % 64 < 2 ? -18 : 0) + (x % 128 < 1 ? -10 : 0);
      const i = (y * size + x) * 4;
      img.data[i] = clamp255(214 + grain + ply);
      img.data[i + 1] = clamp255(186 + grain * 0.85 + ply);
      img.data[i + 2] = clamp255(140 + grain * 0.6 + ply * 0.6);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------------------------------------------------------------- materials
export function makeMaterials(textures) {
  const M = {};
  M.rebar = new THREE.MeshStandardMaterial({
    name: 'rebar', vertexColors: true, color: 0xffffff, metalness: 0.62, roughness: 0.46,
    normalMap: textures.rib, normalScale: new THREE.Vector2(0.85, 0.85), envMapIntensity: 1.15,
  });
  M.couplerSteel = new THREE.MeshStandardMaterial({ name: 'couplerSteel', vertexColors: true, metalness: 0.9, roughness: 0.28, envMapIntensity: 1.2 });
  M.couplerRubber = new THREE.MeshStandardMaterial({ name: 'couplerRubber', color: 0x161616, roughness: 0.88, metalness: 0.0 });
  M.spacer = new THREE.MeshStandardMaterial({ name: 'spacer', color: 0xcdc8bc, roughness: 0.95, metalness: 0.0, map: textures.concreteSmall });
  M.concrete = new THREE.MeshStandardMaterial({ name: 'concrete', color: 0xffffff, roughness: 0.9, metalness: 0.0, map: textures.concrete });
  M.plywood = new THREE.MeshStandardMaterial({ name: 'plywood', color: 0xffffff, roughness: 0.78, metalness: 0.0, map: textures.ply });
  M.steel = new THREE.MeshStandardMaterial({ name: 'steel', color: 0xb7bec6, roughness: 0.36, metalness: 0.86 });
  M.scaffold = new THREE.MeshStandardMaterial({ name: 'scaffold', color: 0x9aa4ad, roughness: 0.4, metalness: 0.8 });
  M.scaffoldPlank = new THREE.MeshStandardMaterial({ name: 'plank', color: 0xa6896a, roughness: 0.85, metalness: 0.0, map: textures.ply });
  M.ground = new THREE.MeshStandardMaterial({ name: 'ground', color: 0xffffff, roughness: 1.0, metalness: 0.0, map: textures.yard });
  M.soil = new THREE.MeshStandardMaterial({ name: 'soil', color: 0xffffff, roughness: 1.0, metalness: 0.0, map: textures.soil });
  M.bearer = new THREE.MeshStandardMaterial({ name: 'bearer', color: 0x9c7a4f, roughness: 0.9, metalness: 0.0 });
  M.skin = new THREE.MeshStandardMaterial({ name: 'skin', color: 0xd7a886, roughness: 0.7 });
  M.vest = new THREE.MeshStandardMaterial({ name: 'vest', color: 0xff6a13, roughness: 0.55, emissive: 0x220800 });
  M.reflect = new THREE.MeshStandardMaterial({ name: 'reflect', color: 0xe8e8e0, roughness: 0.3, metalness: 0.2 });
  M.hat = new THREE.MeshStandardMaterial({ name: 'hat', color: 0xf2c200, roughness: 0.45, metalness: 0.0 });
  M.trousers = new THREE.MeshStandardMaterial({ name: 'trousers', color: 0x2d3a4a, roughness: 0.8 });
  M.boot = new THREE.MeshStandardMaterial({ name: 'boot', color: 0x1b1b1b, roughness: 0.7 });
  M.crane = new THREE.MeshStandardMaterial({ name: 'crane', color: 0xe6a700, roughness: 0.5, metalness: 0.3 });
  M.bolt = new THREE.MeshStandardMaterial({ name: 'bolt', color: 0x8a8f96, roughness: 0.35, metalness: 0.9 });
  return M;
}

// ---------------------------------------------------------------- GPU animation patch
// Uniform/attribute names shared by every patched material.
//   tMem (RGBA float, width nM, height 3): row0 storey offset, row1 member offset, row2 (pourK, formK, baseY, selected)
//   tGrp (RGBA float, width nG, height nM): group offset per member and group
//   uStage (vec3): explode stage factors (storey, member, group)
//   uTime: timeline seconds (drives the tie highlight)
//   aMember, aGroup, aT0 (per vertex)
// mode: 'rebar' (group offsets + tie highlight), 'member-form' (storey/member offsets, form erection),
//       'member-pour' (storey/member offsets, pour rise), 'member-static' (storey/member offsets only)
export function sharedUniforms(state) {
  return state.uniforms;   // one shared set of uniform objects; every material references the same instances
}

const DECL = `
uniform sampler2D tMem;
uniform sampler2D tGrp;
uniform vec3 uStage;
uniform float uTime;
uniform float uHL;
attribute float aMember;
attribute float aGroup;
attribute float aT0;
varying float vHL;
varying float vSel;
`;

function vertexChunk(mode) {
  const common = `
  int mi = int(aMember + 0.5);
  vec3 offS = texelFetch(tMem, ivec2(mi, 0), 0).xyz;
  vec3 offM = texelFetch(tMem, ivec2(mi, 1), 0).xyz;
  vec4 mrow2 = texelFetch(tMem, ivec2(mi, 2), 0);
  vSel = mrow2.w;
  `;
  if (mode === 'rebar') {
    return `
  ${common}
  vec3 offG = texelFetch(tGrp, ivec2(int(aGroup + 0.5), mi), 0).xyz;
  transformed += uStage.x * offS + uStage.y * offM + uStage.z * offG;
  float age = uTime - aT0;
  vHL = step(0.0, age) * exp(-max(age, 0.0) * 2.2);
  `;
  }
  if (mode === 'member-pour') {
    return `
  ${common}
  float k = mrow2.x;
  transformed.y = mrow2.z + (transformed.y - mrow2.z) * k;
  transformed += uStage.x * offS + uStage.y * offM;
  vHL = 0.0;
  `;
  }
  if (mode === 'member-form') {
    return `
  ${common}
  float k = mrow2.y;
  transformed.y = mrow2.z + (transformed.y - mrow2.z) * k;
  transformed += uStage.x * offS + uStage.y * offM;
  vHL = 0.0;
  `;
  }
  // member-static
  return `
  ${common}
  transformed += uStage.x * offS + uStage.y * offM;
  vHL = 0.0;
  `;
}

const FRAG_DECL = `
varying float vHL;
varying float vSel;
uniform float uHL;
`;
const FRAG_CHUNK = `
  totalEmissiveRadiance += vec3(0.42, 0.30, 0.12) * vHL * uHL;
  totalEmissiveRadiance += vec3(0.10, 0.22, 0.34) * vSel * 0.9;
`;

// Patch a MeshStandardMaterial (or MeshDepthMaterial) for GPU animation.
export function patchMaterial(material, state, mode, { highlight = false, depth = false } = {}) {
  const chunk = vertexChunk(mode);
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, sharedUniforms(state));   // same uniform objects everywhere
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${DECL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${chunk}`);
    if (!depth) {
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${FRAG_DECL}`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${highlight ? FRAG_CHUNK : `totalEmissiveRadiance += vec3(0.10, 0.22, 0.34) * vSel * 0.9;`}`);
    }
  };
  material.customProgramCacheKey = () => `${mode}-${highlight ? 1 : 0}-${depth ? 'd' : 's'}`;
  material.needsUpdate = true;
  return material;
}

// Depth material for shadows that carries the same displacement (no fragment changes needed).
export function depthMaterialFor(state, mode) {
  const dm = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  patchMaterial(dm, state, mode, { depth: true });
  return dm;
}
