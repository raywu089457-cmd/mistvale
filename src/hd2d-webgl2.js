// hd2d-webgl2.js — Octopath-style HD-2D WebGL2 renderer for Mistvale (暮影村).
// Combines the VESPER WING fighter-jet 3D engine (per-pixel heightfield raymarching,
// max-height mipmap pyramid, baked long sunset shadows, 4x4 Bayer ordered dithering,
// 1px depth-crease cliff inking, banded animated 3D water with foam & sun glitter,
// twilight sun rays, cumulus clouds, and golden/lavender horizon mist) with
// upright camera-facing 2D pixel-art billboards & world-space 3D ground shadows.

import { WORLD, REGIONS, inWorld, biomeAt } from './overworld.js';   // 2026-11-27:環村道路(RING_ROAD/onRingRoad)已拿掉,這裡不再畫路面
import { VILLAGE_BOUNDS, EXITS, EXIT_GAP } from './village-grid.js';
import { tagPattern, parseColorForGL } from './gl-renderer.js';

const TAU = Math.PI * 2;
const WORLD_TO_LOGICAL = 9 * Math.SQRT2; // 1.0 3D world unit = 12.727922 Mistvale sprite logical px
const FOV_Y = (36 * Math.PI) / 180;      // Telephoto diorama vertical FOV (36 deg)
const TAN_HALF_FOV = Math.tan(FOV_Y * 0.5);

// 3D Heightfield domain: 512x512 covering 256x256 world units centered on village center
const VC_X = (VILLAGE_BOUNDS.minX + VILLAGE_BOUNDS.maxX) * 0.5;
const VC_Z = (VILLAGE_BOUNDS.minZ + VILLAGE_BOUNDS.maxZ) * 0.5;
const MAP_RES = 512;
const MAP_WORLD = 256.0;
const TEXEL_WORLD = MAP_WORLD / MAP_RES; // 0.5 world units per texel
const MAP_MIN_X = VC_X - MAP_WORLD * 0.5;
const MAP_MIN_Z = VC_Z - MAP_WORLD * 0.5;

const H_MIN = -14.0;
const H_MAX = 26.0;
const H_SPAN = H_MAX - H_MIN;
const MAX_VIEW_Z = 680.0;
const VILLAGE_H = 2.55;
const APRON_H = 1.25;   // 村莊石台下、圍欄外一圈的平地高度(以前是環村道路的路面;路拿掉後只留地形,魔物可走到門口)

// Warm evening sun direction: shines from ENE/top-right at default yaw (+45 deg),
// casting long twilight shadows to the WSW (left & slightly down on screen at default angle).
const SUN_DIR = (() => {
  const x = 0.44, y = 0.37, z = -0.818;
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
})();

export const DEFAULT_YAW = Math.PI * 0.25;  // +45 deg: camera at (+x, +y, +z) looking (-x, -z), matching Mistvale compass
export const DEFAULT_PITCH = 0.56;          // ~32.1 deg: classic HD-2D diorama tilt
export const PITCH_PRESETS = [0.56, 0.23, 0.94]; // Standard (32°), Sunset Horizon Vista (13°), High Tactical (54°)

// Deterministic integer hash & smooth value noise / FBM for 3D terrain sculpting
function hash2(ix, iz, seed) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function vnoise(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

function fbm(x, z, oct, seed) {
  let sum = 0, amp = 0.5, norm = 0, fx = x, fz = z;
  for (let i = 0; i < oct; i++) {
    sum += amp * vnoise(fx, fz, seed + i * 31);
    norm += amp;
    amp *= 0.5;
    fx = fx * 2.03 + 11.7;
    fz = fz * 2.03 - 7.3;
  }
  return sum / (norm || 1);
}

function ridgedFbm(x, z, oct, seed) {
  let sum = 0, amp = 0.5, weight = 1, norm = 0, fx = x, fz = z;
  for (let i = 0; i < oct; i++) {
    let n = 1 - Math.abs(vnoise(fx, fz, seed + i * 47) * 2 - 1);
    n = n * n * weight;
    weight = Math.max(0.15, Math.min(1, n * 1.8));
    sum += n * amp;
    norm += amp;
    amp *= 0.5;
    fx = fx * 2.07 - 5.1;
    fz = fz * 2.07 + 9.4;
  }
  return sum / (norm || 1);
}

function smoothstep(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0 || 1e-6)));
  return t * t * (3 - 2 * t);
}

function coastSignedDist(x, z) {
  const w = a => (Math.sin(a) + 1) * 0.5;
  const f = 0.45 * w(x * 0.185 + z * 0.115) + 0.30 * w(z * 0.365 - x * 0.225 + 1.4)
          + 0.15 * w((x + z) * 0.61 + 2.2) + 0.10 * w((x - z) * 1.13 + 0.7);
  const inset = 1.6 + f * (5.9 - 1.6);
  const depth = Math.min(x - (WORLD.minX + 1), (WORLD.maxX - 1) - x, z - (WORLD.minZ + 1), (WORLD.maxZ - 1) - z);
  return depth - inset;
}

function segDistXZ(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  const t = l2 > 1e-9 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0;
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

const BIOME_CODE = {
  ocean: 0, village: 1, meadow: 2, birch: 3, forest: 4,
  taiga: 5, desert: 6, snow: 7, mountain: 8, pond: 9, outer: 10,
};

function evalRawBiomeHeight(wx, wz, bName) {
  const n1 = fbm(wx * 0.055, wz * 0.055, 4, 307);
  const n2 = fbm(wx * 0.13 + 9.1, wz * 0.13 - 4.7, 3, 521);
  const rd = ridgedFbm(wx * 0.068, wz * 0.068, 4, 733);
  switch (bName) {
    case 'meadow': {
      const raw = 0.85 + n1 * 2.1 + (n2 - 0.5) * 0.55;
      const ter = Math.floor(raw / 0.85) * 0.85 + (raw % 0.85) * 0.72;
      return raw * 0.75 + ter * 0.25;
    }
    case 'birch': {
      const raw = 1.05 + n1 * 2.75 + rd * 0.85;
      const ter = Math.floor(raw / 1.05) * 1.05 + (raw % 1.05) * 0.65;
      return raw * 0.68 + ter * 0.32;
    }
    case 'forest':
      return 1.15 + n1 * 3.4 + rd * 1.35 + (n2 - 0.5) * 0.7;
    case 'taiga': {
      const raw = 1.35 + n1 * 2.6 + Math.pow(rd, 1.2) * 3.9;
      const ter = Math.floor(raw / 1.4) * 1.4 + (raw % 1.4) * 0.68;
      return raw * 0.72 + ter * 0.28;
    }
    case 'desert': {
      // Wind-sculpted asymmetric sand dunes + flat-topped sandstone mesas
      const phase = wx * 0.21 + wz * 0.11 + n1 * 3.4;
      const s = Math.sin(phase);
      const dune = Math.pow(Math.abs(s), 0.75) * 2.35;
      const mesaMask = smoothstep(0.66, 0.80, n2);
      return 0.78 + dune + n1 * 1.2 + mesaMask * 2.9;
    }
    case 'snow': {
      const alp = Math.pow(rd, 1.25) * 3.8 + n1 * 1.6;
      const ter = Math.floor(alp / 1.35) * 1.35 + (alp % 1.35) * 0.42;
      return 1.35 + alp * 0.45 + ter * 0.55;
    }
    case 'mountain': {
      const crag = Math.pow(rd, 1.25) * 5.6 + n1 * 1.9;
      const ter = Math.floor(crag / 1.65) * 1.65 + (crag % 1.65) * 0.36;
      return 1.60 + crag * 0.40 + ter * 0.60;
    }
    default:
      return 1.2;
  }
}

function buildWorldData(ponds = []) {
  const total = MAP_RES * MAP_RES;
  const heights = new Float32Array(total);
  const codes = new Uint8Array(total);
  const terrainRGBA = new Uint8Array(total * 4);
  const detailRGBA = new Uint8Array(total * 4);

  const VB = VILLAGE_BOUNDS;
  const regionCenters = REGIONS.filter(r => r.id !== 'village');

  // Step 1: Base un-smoothed biome heights (we'll smooth across biome borders in Step 1b!)
  const rawH = new Float32Array(total);
  const landMask = new Float32Array(total);

  for (let iz = 0; iz < MAP_RES; iz++) {
    const wz = MAP_MIN_Z + (iz + 0.5) * TEXEL_WORLD;
    for (let ix = 0; ix < MAP_RES; ix++) {
      const idx = iz * MAP_RES + ix;
      const wx = MAP_MIN_X + (ix + 0.5) * TEXEL_WORLD;

      // Multi-scale procedural detail channels for the shader
      const u = ix / MAP_RES, v = iz / MAP_RES;
      detailRGBA[idx * 4 + 0] = Math.round(fbm(wx * 0.28, wz * 0.28, 3, 911) * 255);
      detailRGBA[idx * 4 + 1] = Math.round(ridgedFbm(wx * 0.42, wz * 0.42, 3, 1031) * 255);
      detailRGBA[idx * 4 + 2] = Math.round(fbm(u * 18, v * 18, 3, 1153) * 255);
      detailRGBA[idx * 4 + 3] = Math.round(hash2(ix, iz, 1297) * 255);

      const cDist = coastSignedDist(wx, wz);
      const insideIsland = inWorld(wx, wz);

      if (!insideIsland) {
        // Ocean basin + scenic outer archipelago mountains near horizon (r > 102 from village, safely beyond camera orbit radius)
        const rFromVC = Math.hypot(wx - VC_X, wz - VC_Z);
        const archWave = ridgedFbm(wx * 0.032 + 3.7, wz * 0.032 - 2.1, 4, 1451);
        const archGate = smoothstep(102.0, 120.0, rFromVC) * smoothstep(0.54, 0.86, archWave);
        if (archGate > 0.02) {
          const peakH = archGate * (19.5 * Math.pow(archWave, 1.3) + 3.0);
          rawH[idx] = peakH;
          codes[idx] = BIOME_CODE.outer;
          landMask[idx] = 1;
        } else {
          const seaDepth = Math.min(1.0, Math.max(0.0, -cDist / 16.5));
          const seaFloor = -0.35 - Math.pow(seaDepth, 1.18) * 10.8 - fbm(wx * 0.14, wz * 0.14, 2, 1597) * 1.4;
          rawH[idx] = Math.max(H_MIN + 0.5, seaFloor);
          codes[idx] = BIOME_CODE.ocean;
          landMask[idx] = 0;
        }
        continue;
      }

      landMask[idx] = 1;
      const inVil = wx >= VB.minX && wx <= VB.maxX && wz >= VB.minZ && wz <= VB.maxZ;
      if (inVil) {
        let h = VILLAGE_H;
        let code = BIOME_CODE.village;
        for (const p of ponds) {
          const dx = (wx - p.x) / (p.rx || 2.2), dz = (wz - p.z) / (p.rz || 1.8);
          const d = Math.hypot(dx, dz);
          if (d < 1.08) {
            const bowl = smoothstep(1.08, 0.45, d);
            h = VILLAGE_H - bowl * (VILLAGE_H + 1.15);
            if (h <= 0.05) code = BIOME_CODE.pond;
          }
        }
        rawH[idx] = h;
        codes[idx] = code;
        continue;
      }

      const b = biomeAt(wx, wz);
      codes[idx] = BIOME_CODE[b] ?? BIOME_CODE.meadow;
      let bh = evalRawBiomeHeight(wx, wz, b);

      // Gentle clearing around each hunting region's center (the main monster field; region signs now stand by the village fence,
      // on the flat apron below) so fights sit on readable plateaus
      let clearBlend = 1.0;
      for (const rc of regionCenters) {
        const dr = Math.hypot(wx - rc.x, wz - rc.z);
        if (dr < 10.5) clearBlend = Math.min(clearBlend, smoothstep(3.2, 10.5, dr));
      }
      const centerBase = b === 'mountain' ? 2.45 : b === 'snow' ? 2.05 : 1.40;
      bh = centerBase + (bh - centerBase) * (0.18 + 0.82 * clearBlend);

      // Outer rim mountain amplification near mountain/snow/taiga edges before coastal drop
      const dVilBox = Math.hypot(
        Math.max(VB.minX - wx, 0, wx - VB.maxX),
        Math.max(VB.minZ - wz, 0, wz - VB.maxZ)
      );
      if ((b === 'mountain' || b === 'snow' || b === 'taiga') && dVilBox > 20) {
        const rim = smoothstep(20, 38, dVilBox) * smoothstep(1.2, 6.5, cDist);
        bh += rim * (b === 'mountain' ? 2.4 : b === 'snow' ? 1.8 : 1.2);
      }

      // Coastal slope down to beach/shoreline
      const coastRamp = b === 'mountain' ? smoothstep(0.0, 1.9, cDist) : smoothstep(0.0, 4.6, cDist);
      bh = 0.14 + bh * coastRamp;

      // Smooth transition around the Village Bastion: flat grass apron outside the fence (no road surface) + 4 exit causeway ramps
      if (dVilBox < 8.5) {
        const ringBlend = smoothstep(3.6, 8.5, dVilBox);
        bh = APRON_H + (bh - APRON_H) * ringBlend;

        if (dVilBox < 3.6) {
          // Check proximity to the 4 village exits (ramps only; the old dirt spurs are gone)
          let exitFactor = 0.0;
          for (const ex of EXITS) {
            const sd = segDistXZ(wx, wz, ex.edge.x, ex.edge.z, ex.out.x, ex.out.z);
            exitFactor = Math.max(exitFactor, smoothstep(EXIT_GAP + 1.35, EXIT_GAP * 0.55, sd));
          }
          // Causeway ramp glides smoothly from VILLAGE_H (d=0) to APRON_H (d=3.4)
          const rampT = 1.0 - smoothstep(0.0, 3.4, dVilBox);
          const rampH = APRON_H + (VILLAGE_H - APRON_H) * rampT;
          // Stone retaining bastion wall drops sharply between d=0.1 and d=1.15
          const wallT = 1.0 - smoothstep(0.08, 1.15, dVilBox);
          const wallH = APRON_H + (VILLAGE_H - APRON_H) * wallT;
          const nearVilH = wallH + (rampH - wallH) * exitFactor;
          const kNear = 1.0 - smoothstep(2.4, 3.6, dVilBox);
          bh = bh + (nearVilH - bh) * kNear;
        }
      }

      rawH[idx] = Math.max(0.08, Math.min(H_MAX - 1.0, bh));
    }
  }

  // Step 1b: Subtle 3x3 cross-biome smoothing on wild land (preserving crisp village bastion walls & coastline!)
  for (let iz = 0; iz < MAP_RES; iz++) {
    for (let ix = 0; ix < MAP_RES; ix++) {
      const idx = iz * MAP_RES + ix;
      const c = codes[idx];
      if (c === BIOME_CODE.ocean || c === BIOME_CODE.village || c === BIOME_CODE.pond || c === BIOME_CODE.outer) {
        heights[idx] = rawH[idx];
        continue;
      }
      const wx = MAP_MIN_X + (ix + 0.5) * TEXEL_WORLD;
      const wz = MAP_MIN_Z + (iz + 0.5) * TEXEL_WORLD;
      const dVil = Math.hypot(Math.max(VB.minX - wx, 0, wx - VB.maxX), Math.max(VB.minZ - wz, 0, wz - VB.maxZ));
      if (dVil < 2.2) { heights[idx] = rawH[idx]; continue; }
      let sum = rawH[idx] * 2.0, w = 2.0;
      for (let oz = -2; oz <= 2; oz += 2) {
        for (let ox = -2; ox <= 2; ox += 2) {
          if (ox === 0 && oz === 0) continue;
          const nx = Math.max(0, Math.min(MAP_RES - 1, ix + ox));
          const nz = Math.max(0, Math.min(MAP_RES - 1, iz + oz));
          const ni = nz * MAP_RES + nx;
          if (landMask[ni] > 0.5 && codes[ni] !== BIOME_CODE.village) {
            sum += rawH[ni];
            w += 1.0;
          }
        }
      }
      heights[idx] = rawH[idx] * 0.45 + (sum / w) * 0.55;
    }
  }

  // Step 2: Bake long directional sunset shadows across the 3D heightfield
  const sunHoriz = Math.hypot(SUN_DIR[0], SUN_DIR[2]);
  const stepDirX = (SUN_DIR[0] / sunHoriz) / TEXEL_WORLD;
  const stepDirZ = (SUN_DIR[2] / sunHoriz) / TEXEL_WORLD;
  const slopeSun = SUN_DIR[1] / sunHoriz;

  for (let iz = 0; iz < MAP_RES; iz++) {
    for (let ix = 0; ix < MAP_RES; ix++) {
      const idx = iz * MAP_RES + ix;
      const h0 = Math.max(0.0, heights[idx]);
      let lit = 1.0;
      let dist = 0.75, step = 0.75;
      const maxDist = (H_MAX - h0) / slopeSun + 2.0;
      while (dist < maxDist) {
        const sx = Math.round(ix + stepDirX * dist * TEXEL_WORLD);
        const sz = Math.round(iz + stepDirZ * dist * TEXEL_WORLD);
        if (sx < 0 || sx >= MAP_RES || sz < 0 || sz >= MAP_RES) break;
        const sh = heights[sz * MAP_RES + sx];
        const rayH = h0 + dist * slopeSun;
        if (sh > rayH) {
          const pen = (sh - rayH) / Math.max(0.35, dist * 0.055);
          lit = Math.min(lit, Math.max(0.0, 1.0 - pen));
          if (lit <= 0.02) { lit = 0.0; break; }
        }
        dist += step;
        step = Math.min(4.0, step * 1.09);
      }
      const normH = Math.max(0, Math.min(1, (heights[idx] - H_MIN) / H_SPAN));
      const u16 = Math.round(normH * 65535);
      const tBase = idx * 4;
      terrainRGBA[tBase + 0] = (u16 >>> 8) & 255;
      terrainRGBA[tBase + 1] = u16 & 255;
      terrainRGBA[tBase + 2] = Math.round(lit * 255);
      terrainRGBA[tBase + 3] = codes[idx];
    }
  }

  // Step 3: Max-Height Mipmap Acceleration Pyramid (512 -> 1)
  const mipLevels = [];
  const mip0 = new Uint8Array(total);
  for (let iz = 0; iz < MAP_RES; iz++) {
    const zp = Math.min(MAP_RES - 1, iz + 1);
    for (let ix = 0; ix < MAP_RES; ix++) {
      const xp = Math.min(MAP_RES - 1, ix + 1);
      const maxFoot = Math.max(
        0.0,
        heights[iz * MAP_RES + ix],
        heights[iz * MAP_RES + xp],
        heights[zp * MAP_RES + ix],
        heights[zp * MAP_RES + xp]
      );
      const norm = Math.max(0, Math.min(1, (maxFoot - H_MIN) / H_SPAN));
      mip0[iz * MAP_RES + ix] = Math.min(255, Math.ceil(norm * 254) + 1);
    }
  }
  mipLevels.push(mip0);
  let prevRes = MAP_RES, prevMip = mip0;
  while (prevRes > 1) {
    const nextRes = prevRes >>> 1;
    const nextMip = new Uint8Array(nextRes * nextRes);
    for (let y = 0; y < nextRes; y++) {
      const y2 = y << 1;
      for (let x = 0; x < nextRes; x++) {
        const x2 = x << 1;
        nextMip[y * nextRes + x] = Math.max(
          prevMip[y2 * prevRes + x2],
          prevMip[y2 * prevRes + x2 + 1],
          prevMip[(y2 + 1) * prevRes + x2],
          prevMip[(y2 + 1) * prevRes + x2 + 1]
        );
      }
    }
    mipLevels.push(nextMip);
    prevRes = nextRes;
    prevMip = nextMip;
  }

  // Step 4: Seamless 256x256 Puffy Cumulus Cloud Texture (for sky clouds & drifting cloud shadows)
  const CLOUD_RES = 256, cMask = CLOUD_RES - 1;
  const cloudH = new Float32Array(CLOUD_RES * CLOUD_RES);
  const cloudRGBA = new Uint8Array(CLOUD_RES * CLOUD_RES * 4);
  for (let y = 0; y < CLOUD_RES; y++) {
    for (let x = 0; x < CLOUD_RES; x++) {
      // Seamless periodic noise via 4-corner wrap
      const u = x / CLOUD_RES, v = y / CLOUD_RES;
      const a0 = Math.sin(u * TAU) * 3.4, a1 = Math.cos(u * TAU) * 3.4;
      const b0 = Math.sin(v * TAU) * 3.4, b1 = Math.cos(v * TAU) * 3.4;
      const n = fbm(a0 + b1 + 5.1, a1 - b0 + 3.7, 4, 1701);
      const n2 = fbm(a0 * 2.3 - b0 + 1.9, a1 * 2.3 + b1 - 4.2, 3, 1823);
      const raw = n * 0.66 + n2 * 0.44 - 0.49;
      const cov = Math.max(0, Math.min(1, raw * 3.1));
      cloudH[y * CLOUD_RES + x] = cov > 0.01 ? Math.pow(cov, 0.72) : 0;
    }
  }
  const cDx = Math.round((SUN_DIR[0] / sunHoriz) * 3);
  const cDz = Math.round((SUN_DIR[2] / sunHoriz) * 3);
  for (let y = 0; y < CLOUD_RES; y++) {
    for (let x = 0; x < CLOUD_RES; x++) {
      const i = y * CLOUD_RES + x;
      const h = cloudH[i];
      const hSun = cloudH[((y + cDz) & cMask) * CLOUD_RES + ((x + cDx) & cMask)];
      const hBack = cloudH[((y - cDz) & cMask) * CLOUD_RES + ((x - cDx) & cMask)];
      const sunGrad = Math.max(0, Math.min(1, 0.52 + (hBack - hSun) * 1.85 + h * 0.25));
      cloudRGBA[i * 4 + 0] = Math.round(h * 255);
      cloudRGBA[i * 4 + 1] = Math.round(sunGrad * 255);
      cloudRGBA[i * 4 + 2] = Math.round(Math.min(1, h * 1.35) * 255);
      cloudRGBA[i * 4 + 3] = 255;
    }
  }

  return { heights, codes, terrainRGBA, detailRGBA, mipLevels, cloudRGBA, CLOUD_RES };
}

// ============================================================================
// SHADERS: FIGHTER-JET 3D RAYMARCHED WORLD + MISTVALE HD-2D FUSION
// ============================================================================
const QUAD_VS = `#version 300 es
out vec2 vUV;
void main() {
  vec2 p = vec2((gl_VertexID == 1) ? 3.0 : -1.0, (gl_VertexID == 2) ? 3.0 : -1.0);
  vUV = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const TERRAIN_FS = `#version 300 es
precision highp float;

in vec2 vUV;
layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 fragMeta;

uniform sampler2D uTerrainTex;
uniform sampler2D uDetailTex;
uniform sampler2D uMaxMipTex;
uniform sampler2D uCloudTex;
uniform sampler2D uGroundTex;
uniform sampler2D uVillageTex;

uniform vec3 uCamPos;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform vec3 uCamBack;
uniform vec2 uFullSize;
uniform vec2 uPrincipal;
uniform float uFocalPx;
uniform float uTime;
uniform vec3 uSunDir;
uniform vec4 uGroundBox;   // (GX0, GY0, GW_logical, GH_logical)
uniform vec4 uVillageBox;  // (VBOX.x0, VBOX.y0, VBOX.w, VBOX.h)
uniform float uHasGround;
uniform float uHasVillage;
uniform int uPointCount;
uniform vec4 uPointPos[12]; // (wx, wy, wz, radius)
uniform vec3 uPointCol[12]; // RGB radiance

const float MAP_MIN_X = ${MAP_MIN_X.toFixed(4)};
const float MAP_MIN_Z = ${MAP_MIN_Z.toFixed(4)};
const float MAP_WORLD = ${MAP_WORLD.toFixed(4)};
const float TEXEL_WORLD = ${TEXEL_WORLD.toFixed(4)};
const float H_MIN = ${H_MIN.toFixed(4)};
const float H_MAX = ${H_MAX.toFixed(4)};
const float H_SPAN = ${H_SPAN.toFixed(4)};
const float MAX_VIEW_Z = ${MAX_VIEW_Z.toFixed(4)};
const float MAX_DIST = 640.0;
const float CLOUD_BOT = 24.0;
const float CLOUD_TOP = 38.0;

float bayer4x4(ivec2 p) {
  int x = p.x & 3;
  int y = p.y & 3;
  int idx = (y << 2) | x;
  const float b[16] = float[16](
     0.5/16.0,  8.5/16.0,  2.5/16.0, 10.5/16.0,
    12.5/16.0,  4.5/16.0, 14.5/16.0,  6.5/16.0,
     3.5/16.0, 11.5/16.0,  1.5/16.0,  9.5/16.0,
    15.5/16.0,  7.5/16.0, 13.5/16.0,  5.5/16.0
  );
  return b[idx];
}

vec3 ditherStep2(vec3 a, vec3 b, float t, float bayer) {
  return (clamp(t, 0.0, 1.0) > bayer) ? b : a;
}

bool inHeightMap(vec2 xz) {
  return xz.x >= MAP_MIN_X && xz.x < MAP_MIN_X + MAP_WORLD &&
         xz.y >= MAP_MIN_Z && xz.y < MAP_MIN_Z + MAP_WORLD;
}

// Returns vec3(height, bakedShadow, codeByte)
vec3 sampleTerrain(vec2 xz) {
  if (!inHeightMap(xz)) return vec3(-9.5, 1.0, 0.0);
  vec2 tc = (xz - vec2(MAP_MIN_X, MAP_MIN_Z)) / TEXEL_WORLD - 0.5;
  ivec2 i0 = clamp(ivec2(floor(tc)), ivec2(0), ivec2(511));
  ivec2 i1 = clamp(i0 + 1, ivec2(0), ivec2(511));
  vec2 f = clamp(tc - vec2(i0), 0.0, 1.0);

  vec4 t00 = texelFetch(uTerrainTex, i0, 0);
  vec4 t10 = texelFetch(uTerrainTex, ivec2(i1.x, i0.y), 0);
  vec4 t01 = texelFetch(uTerrainTex, ivec2(i0.x, i1.y), 0);
  vec4 t11 = texelFetch(uTerrainTex, i1, 0);

  float h00 = H_MIN + ((t00.r * 255.0 * 256.0 + t00.g * 255.0) / 65535.0) * H_SPAN;
  float h10 = H_MIN + ((t10.r * 255.0 * 256.0 + t10.g * 255.0) / 65535.0) * H_SPAN;
  float h01 = H_MIN + ((t01.r * 255.0 * 256.0 + t01.g * 255.0) / 65535.0) * H_SPAN;
  float h11 = H_MIN + ((t11.r * 255.0 * 256.0 + t11.g * 255.0) / 65535.0) * H_SPAN;

  float h = mix(mix(h00, h10, f.x), mix(h01, h11, f.x), f.y);
  float sh = mix(mix(t00.b, t10.b, f.x), mix(t01.b, t11.b, f.x), f.y);
  ivec2 nearIdx = clamp(ivec2(round(tc)), ivec2(0), ivec2(511));
  float code = floor(texelFetch(uTerrainTex, nearIdx, 0).a * 255.0 + 0.5);
  return vec3(h, sh, code);
}

vec3 computeNormal(vec2 xz, float eps) {
  float hx1 = sampleTerrain(xz + vec2(eps, 0.0)).x;
  float hx0 = sampleTerrain(xz - vec2(eps, 0.0)).x;
  float hz1 = sampleTerrain(xz + vec2(0.0, eps)).x;
  float hz0 = sampleTerrain(xz - vec2(0.0, eps)).x;
  return normalize(vec3(hx0 - hx1, 2.0 * eps, hz0 - hz1));
}

vec4 sampleCloud(vec2 xz) {
  vec2 uv = fract((xz + vec2(uTime * 0.75, -uTime * 0.35)) / 180.0);
  vec2 tc = uv * 256.0 - 0.5;
  ivec2 i0 = ivec2(floor(tc)) & 255;
  ivec2 i1 = (i0 + 1) & 255;
  vec2 f = fract(tc);
  vec4 c00 = texelFetch(uCloudTex, i0, 0);
  vec4 c10 = texelFetch(uCloudTex, ivec2(i1.x, i0.y), 0);
  vec4 c01 = texelFetch(uCloudTex, ivec2(i0.x, i1.y), 0);
  vec4 c11 = texelFetch(uCloudTex, i1, 0);
  return mix(mix(c00, c10, f.x), mix(c01, c11, f.x), f.y);
}

float cloudShadowAt(vec3 wp) {
  float dy = max(0.0, 46.0 - wp.y);
  vec2 proj = wp.xz + (uSunDir.xz / max(0.12, uSunDir.y)) * dy;
  return sampleCloud(proj).b > 0.42 ? 0.55 : 1.0;
}

vec3 evalSky(vec3 rd, float bayer) {
  const vec3 skyPal[7] = vec3[7](
    vec3(0.133, 0.125, 0.271),
    vec3(0.224, 0.180, 0.376),
    vec3(0.365, 0.255, 0.455),
    vec3(0.557, 0.353, 0.498),
    vec3(0.784, 0.486, 0.502),
    vec3(0.945, 0.671, 0.490),
    vec3(0.996, 0.855, 0.616)
  );
  vec2 hDir = length(rd.xz) > 1e-4 ? normalize(rd.xz) : vec2(1.0, 0.0);
  vec2 sDir = normalize(uSunDir.xz);
  float sunAzAlign = dot(hDir, sDir) * 0.5 + 0.5;

  float elev = clamp(rd.y, -0.05, 1.0);
  float hFactor = pow(1.0 - clamp(elev, 0.0, 1.0), 2.1);
  float maxBand = mix(4.15, 6.0, pow(sunAzAlign, 1.35));
  float tSky = clamp(hFactor * maxBand, 0.0, 5.999);
  int idx0 = int(floor(tSky));
  int idx1 = min(idx0 + 1, 6);
  vec3 col = (fract(tSky) > bayer) ? skyPal[idx1] : skyPal[idx0];

  if (elev < 0.25 && sunAzAlign < 0.48) {
    float lavAmt = (1.0 - elev / 0.25) * (1.0 - sunAzAlign / 0.48) * 0.70;
    col = ditherStep2(col, vec3(0.620, 0.514, 0.745), lavAmt, bayer);
  }

  vec3 skySun = normalize(vec3(uSunDir.x, 0.095, uSunDir.z));
  vec3 sunRight = normalize(cross(vec3(0.0, 1.0, 0.0), skySun));
  vec3 sunUp = cross(skySun, sunRight);
  vec2 sunPlane = vec2(dot(rd, sunRight), dot(rd, sunUp));
  float ang = atan(sunPlane.y, sunPlane.x);
  float sunDist = acos(clamp(dot(rd, skySun), -1.0, 1.0));

  float spoke1 = sin(ang * 17.0 + uTime * 0.08) * 0.5 + 0.5;
  float spoke2 = sin(ang * 29.0 - uTime * 0.05) * 0.5 + 0.5;
  float rayBeam = pow(spoke1 * 0.65 + spoke2 * 0.35, 3.8);
  float rayFalloff = smoothstep(0.76, 0.05, sunDist) * smoothstep(-0.04, 0.03, rd.y);
  float rayStrength = rayBeam * rayFalloff * 0.88;
  if (rayStrength > bayer * 0.55 + 0.08) {
    vec3 rayCol = (sunDist < 0.22) ? vec3(1.000, 0.914, 0.702) : vec3(0.984, 0.761, 0.537);
    col = ditherStep2(col, rayCol, min(1.0, rayStrength * 1.45), bayer);
  }
  if (sunDist < 0.17) {
    col = ditherStep2(col, vec3(1.000, 0.871, 0.612), ((0.17 - sunDist) / 0.17) * 0.88, bayer);
  }
  if (sunDist < 0.076) {
    col = (sunDist < 0.054) ? vec3(1.000, 0.980, 0.867) : vec3(1.000, 0.890, 0.624);
  }
  return col;
}

vec3 evalMistColor(vec3 rd, float bayer) {
  vec2 hDir = length(rd.xz) > 1e-4 ? normalize(rd.xz) : vec2(1.0, 0.0);
  float align = dot(hDir, normalize(uSunDir.xz)) * 0.5 + 0.5;
  const vec3 mistPal[5] = vec3[5](
    vec3(0.588, 0.494, 0.733),
    vec3(0.702, 0.561, 0.737),
    vec3(0.843, 0.624, 0.647),
    vec3(0.957, 0.729, 0.537),
    vec3(1.000, 0.859, 0.596)
  );
  float t = clamp(pow(align, 1.25) * 4.0, 0.0, 3.999);
  int i0 = int(floor(t));
  int i1 = min(i0 + 1, 4);
  return (fract(t) > bayer) ? mistPal[i1] : mistPal[i0];
}

vec3 applySteppedMist(vec3 baseCol, vec3 rd, float dist, float worldY, float bayer) {
  float heightAtten = clamp(1.0 - max(0.0, worldY) / 36.0, 0.30, 1.0);
  float startDist = 92.0;
  float d = max(0.0, dist - startDist);
  float rawMist = clamp((1.0 - exp(-d * 0.0052 * heightAtten)) * 1.06, 0.0, 1.0);
  float qMist = floor(rawMist * 5.0 + bayer) / 5.0;
  if (qMist <= 0.001) return baseCol;
  vec3 mistCol = evalMistColor(rd, bayer);
  return mix(baseCol, mistCol, qMist);
}

bool raymarchClouds(vec3 ro, vec3 rd, float maxT, float bayer, out float cloudT, out vec3 cloudCol) {
  if (rd.y <= 0.012) return false;
  float t0 = max(0.5, (CLOUD_BOT - ro.y) / rd.y);
  float t1 = min(maxT, (CLOUD_TOP - ro.y) / rd.y);
  if (t0 >= t1 || t0 > 820.0) return false;
  t1 = min(t1, t0 + 220.0);

  const int STEPS = 10;
  float dt = (t1 - t0) / float(STEPS);
  float t = t0 + dt * (bayer * 0.45);
  for (int i = 0; i < STEPS; i++) {
    if (t >= maxT) break;
    vec3 p = ro + rd * t;
    vec4 cf = sampleCloud(p.xz);
    float cov = cf.r;
    if (cov > 0.06) {
      float yBase = CLOUD_BOT + 1.5 + (1.0 - cov) * 2.0;
      float yTop = yBase + cov * 12.5;
      if (p.y >= yBase && p.y <= yTop) {
        cloudT = t;
        float hFrac = clamp((p.y - CLOUD_BOT) / (CLOUD_TOP - CLOUD_BOT), 0.0, 1.0);
        float lit = cf.g * 0.62 + hFrac * 0.50;
        const vec3 cPal[4] = vec3[4](
          vec3(0.345, 0.243, 0.431),
          vec3(0.678, 0.408, 0.502),
          vec3(0.980, 0.659, 0.529),
          vec3(1.000, 0.886, 0.706)
        );
        float ct = clamp(lit * 3.1 - 0.12, 0.0, 2.999);
        int ci0 = int(floor(ct)), ci1 = min(ci0 + 1, 3);
        cloudCol = (fract(ct) > bayer) ? cPal[ci1] : cPal[ci0];
        cloudCol = applySteppedMist(cloudCol, rd, cloudT, p.y, bayer);
        return true;
      }
    }
    t += dt;
  }
  return false;
}

bool raymarchSurface(vec3 ro, vec3 rd, out float hitT, out bool hitWater) {
  float tMin = 0.25;
  float tMax = MAX_DIST;
  float topBound = H_MAX + 0.5;

  if (ro.y > topBound) {
    if (rd.y >= -1e-5) return false;
    tMin = max(tMin, (topBound - ro.y) / rd.y);
  }
  if (tMin >= tMax) return false;

  float tWaterPlane = (rd.y < -1e-5) ? (-ro.y / rd.y) : -1.0;

  // Intersect ray XZ with heightmap bounding box [MAP_MIN, MAP_MIN + MAP_WORLD]
  vec2 bMin = vec2(MAP_MIN_X, MAP_MIN_Z);
  vec2 bMax = bMin + vec2(MAP_WORLD);
  vec2 invRd = vec2(
    abs(rd.x) > 1e-6 ? 1.0 / rd.x : 1e8,
    abs(rd.z) > 1e-6 ? 1.0 / rd.z : 1e8
  );
  vec2 tA = (bMin - ro.xz) * invRd;
  vec2 tB = (bMax - ro.xz) * invRd;
  vec2 tNear2 = min(tA, tB);
  vec2 tFar2 = max(tA, tB);
  float boxEnter = max(tMin, max(tNear2.x, tNear2.y));
  float boxExit = min(tMax, min(tFar2.x, tFar2.y));

  if (boxEnter < boxExit) {
    float t = boxEnter, prevT = boxEnter;
    int lod = 5;
    for (int iter = 0; iter < 128; iter++) {
      if (t > boxExit) break;
      vec3 p = ro + rd * t;
      if (p.y > topBound && rd.y >= 0.0) break;

      float cellWorld = TEXEL_WORLD * float(1 << lod);
      vec2 rel = p.xz - bMin;
      vec2 cellF = floor(rel / cellWorld);
      int maxIdx = (512 >> lod) - 1;
      ivec2 tc = clamp(ivec2(cellF), ivec2(0), ivec2(maxIdx));

      float normMax = texelFetch(uMaxMipTex, tc, lod).r;
      float cellMaxH = H_MIN + normMax * H_SPAN;

      if (p.y <= cellMaxH) {
        if (lod > 0) { lod--; continue; }
        vec3 ts = sampleTerrain(p.xz);
        float surfH = max(0.0, ts.x);
        if (p.y <= surfH + 0.012) {
          float a = prevT, b = t;
          for (int r = 0; r < 5; r++) {
            float mid = 0.5 * (a + b);
            vec3 mp = ro + rd * mid;
            if (mp.y <= max(0.0, sampleTerrain(mp.xz).x)) b = mid; else a = mid;
          }
          hitT = 0.5 * (a + b);
          vec3 hp = ro + rd * hitT;
          vec3 fts = sampleTerrain(hp.xz);
          hitWater = (fts.x <= 0.025 && hp.y <= 0.08) || (fts.z > 8.5 && fts.z < 9.5);
          if (hitWater && fts.x <= 0.025 && tWaterPlane > 0.1 && tWaterPlane <= MAX_DIST) {
            hitT = tWaterPlane;
          }
          return true;
        }
        prevT = t;
        t += min(max(0.08, (p.y - surfH) * 0.55), TEXEL_WORLD * 0.65);
      } else {
        vec2 nextBound = bMin + (cellF + step(vec2(0.0), rd.xz)) * cellWorld;
        vec2 tExit2 = (nextBound - p.xz) * invRd;
        float tCell = min(max(0.0, tExit2.x), max(0.0, tExit2.y));
        float tPlane = (rd.y < -1e-5) ? ((cellMaxH - p.y) / rd.y) : 1e8;
        float dt = min(tCell + 0.02, tPlane);
        prevT = t;
        t += max(0.08, dt);
        if (tCell < tPlane && lod < 6) lod++;
      }
    }
  }

  // Infinite outer ocean plane beyond the 256x256 heightmap
  if (tWaterPlane > 0.2 && tWaterPlane <= MAX_DIST) {
    hitT = tWaterPlane;
    hitWater = true;
    return true;
  }
  return false;
}

vec3 sampleMistvaleAlbedo(vec2 xz, int code, float detA, float detB) {
  vec2 isoP = vec2((xz.x - xz.y) * 9.0, (xz.x + xz.y) * 4.5);
  // Village high-res stone/earth/grass texture
  if (uHasVillage > 0.5) {
    vec2 vuv = (isoP - uVillageBox.xy) / uVillageBox.zw;
    if (vuv.x >= 0.0 && vuv.x <= 1.0 && vuv.y >= 0.0 && vuv.y <= 1.0) {
      vec4 vt = texture(uVillageTex, vuv);
      if (vt.a > 0.5) return vt.rgb / max(0.001, vt.a);
    }
  }
  // Overworld baked pixel ground texture (pixel-world's 2D ground canvas: 7 biomes + beaches; no ring road since 2026-11-27)
  if (uHasGround > 0.5) {
    vec2 guv = (isoP - uGroundBox.xy) / uGroundBox.zw;
    if (guv.x >= 0.01 && guv.x <= 0.99 && guv.y >= 0.01 && guv.y <= 0.99) {
      return texture(uGroundTex, guv).rgb;
    }
  }
  // Procedural fallback / outer archipelago colors
  if (code == 7) return vec3(0.84, 0.88, 0.95);
  if (code == 6) return vec3(0.90, 0.70, 0.36);
  if (code == 8) return vec3(0.45, 0.41, 0.42);
  if (code == 10) return (detA > 0.48) ? vec3(0.32, 0.44, 0.38) : vec3(0.44, 0.40, 0.50);
  return (detB > 0.5) ? vec3(0.42, 0.62, 0.28) : vec3(0.36, 0.55, 0.25);
}

vec3 shadeLand(vec3 hp, vec3 rd, float hitT, float bayer, out float isCliff) {
  vec3 ts = sampleTerrain(hp.xz);
  float h = ts.x, bakedSh = ts.y;
  int code = int(ts.z + 0.5);
  vec3 N = computeNormal(hp.xz, max(0.38, hitT * 0.002));

  ivec2 dtc = ivec2(floor(mod(hp.xz - vec2(MAP_MIN_X, MAP_MIN_Z), MAP_WORLD) / TEXEL_WORLD)) & 511;
  vec4 det = texelFetch(uDetailTex, dtc, 0);

  vec3 baseCol = sampleMistvaleAlbedo(hp.xz, code, det.r, det.g);

  // Chiseled 3D Cliff & Terrace Rock Strata on steep 3D slopes (N.y < 0.80)
  isCliff = 0.0;
  if (N.y < 0.81) {
    float cliffAmt = clamp((0.81 - N.y) / 0.24, 0.0, 1.0);
    float strata = fract(h * 0.85 + det.r * 0.22);
    vec3 rockA, rockB;
    if (code == 1) {
      // Carved village bastion masonry blocks
      float blockGrid = step(0.14, fract(hp.y * 1.45)) * step(0.08, fract((hp.x + hp.z) * 0.65 + floor(hp.y * 1.45) * 0.5));
      rockA = vec3(0.545, 0.506, 0.455);
      rockB = (blockGrid > 0.5) ? vec3(0.447, 0.408, 0.376) : vec3(0.325, 0.294, 0.286);
    } else if (code == 6) {
      // Red-gold desert sandstone strata
      rockA = vec3(0.796, 0.549, 0.345);
      rockB = vec3(0.627, 0.404, 0.278);
    } else if (code == 7) {
      // Glacial slate & ice cliff
      rockA = vec3(0.580, 0.655, 0.788);
      rockB = vec3(0.416, 0.478, 0.635);
    } else {
      // Fighter-jet purple-slate & warm iron rock strata
      rockA = vec3(0.533, 0.478, 0.576);
      rockB = vec3(0.396, 0.349, 0.467);
    }
    vec3 cliffCol = (strata > 0.52) ? rockA : rockB;
    baseCol = ditherStep2(baseCol, cliffCol, cliffAmt, bayer);
    if (cliffAmt > 0.55) isCliff = 1.0;
  }

  // High-altitude snowcaps on mountain & outer peaks
  float snowLine = (code == 7) ? 5.2 : 9.8 + (det.b - 0.5) * 2.2;
  if ((code == 8 || code == 7 || code == 10) && h > snowLine && N.y > 0.54) {
    float sn = clamp((h - snowLine) / 2.2, 0.0, 1.0);
    baseCol = ditherStep2(baseCol, vec3(0.976, 0.945, 0.918), sn, bayer);
  }

  // Stepped 3-tone directional sun lighting + baked heightfield shadows + 4x4 Bayer dithering
  float ndl = max(0.0, dot(N, uSunDir));
  float cSh = cloudShadowAt(hp);
  float shMask = min(bakedSh > 0.45 ? 1.0 : bakedSh * 1.65, cSh);

  // Preserve readability on flat village plaza while giving 3D hills/cliffs rich contrast
  vec3 shCol = baseCol * vec3(0.56, 0.53, 0.72);
  vec3 warmLit = min(vec3(1.0), baseCol * vec3(1.12, 1.05, 0.95));

  vec3 col;
  if (shMask < 0.46 || ndl < 0.14) {
    col = shCol;
  } else {
    float shadeT = clamp((ndl - 0.14) / 0.62, 0.0, 1.0) * shMask;
    float stepVal = floor(shadeT * 2.0 + bayer * 0.75) / 2.0;
    if (stepVal < 0.25) col = mix(shCol, baseCol, 0.58);
    else if (stepVal < 0.75) col = baseCol;
    else col = warmLit;
  }

  // Octopath-style 3D Warm Lantern / Furnace / Sanctuary Crystal Point-Light Pools (Bayer-stepped!)
  for (int i = 0; i < 12; i++) {
    if (i >= uPointCount) break;
    vec3 toL = uPointPos[i].xyz - hp;
    float rad = uPointPos[i].w;
    float d2 = dot(toL, toL);
    if (d2 < rad * rad) {
      float dL = sqrt(d2);
      float att = pow(1.0 - dL / rad, 1.55);
      float ndlP = max(0.30, dot(N, toL / max(0.01, dL)));
      float qGlow = floor(att * ndlP * 3.2 + bayer * 0.85) / 3.0;
      if (qGlow > 0.01) {
        col = min(vec3(1.0), col + baseCol * uPointCol[i] * qGlow * 0.82 + uPointCol[i] * qGlow * 0.16);
      }
    }
  }

  return applySteppedMist(col, rd, hitT, hp.y, bayer);
}

vec3 shadeWater(vec3 hp, vec3 rd, float hitT, float bayer) {
  vec3 ts = sampleTerrain(hp.xz);
  float depth = (ts.z > 8.5 && ts.z < 9.5) ? max(0.45, 2.55 - ts.x) : max(0.1, -ts.x);
  bool inSun = (ts.y > 0.45 && cloudShadowAt(hp) > 0.6);

  const vec3 wLit[5] = vec3[5](
    vec3(0.427, 0.847, 0.808),
    vec3(0.212, 0.651, 0.698),
    vec3(0.145, 0.467, 0.616),
    vec3(0.125, 0.306, 0.518),
    vec3(0.102, 0.192, 0.380)
  );
  const vec3 wShad[5] = vec3[5](
    vec3(0.255, 0.451, 0.561),
    vec3(0.180, 0.349, 0.498),
    vec3(0.145, 0.259, 0.439),
    vec3(0.125, 0.188, 0.376),
    vec3(0.102, 0.137, 0.302)
  );

  float dBand;
  if (depth < 0.8) dBand = depth / 0.8;
  else if (depth < 2.4) dBand = 1.0 + (depth - 0.8) / 1.6;
  else if (depth < 5.2) dBand = 2.0 + (depth - 2.4) / 2.8;
  else if (depth < 8.8) dBand = 3.0 + (depth - 5.2) / 3.6;
  else dBand = min(3.999, 3.35 + (depth - 8.8) / 6.0);

  int wi0 = int(floor(dBand)), wi1 = min(wi0 + 1, 4);
  vec3 col = inSun
    ? ((fract(dBand) > bayer) ? wLit[wi1] : wLit[wi0])
    : ((fract(dBand) > bayer) ? wShad[wi1] : wShad[wi0]);

  vec2 wp = floor(hp.xz * 3.0) / 3.0;
  float w1 = sin(wp.x * 1.35 + wp.y * 0.82 + uTime * 2.1);
  float w2 = sin(wp.x * -0.95 + wp.y * 1.55 - uTime * 1.65);
  vec3 wNorm = normalize(vec3((w1 + w2 * 0.7) * 0.05, 1.0, (w2 - w1 * 0.5) * 0.05));

  // Low-angle sky reflection
  float fresnel = pow(1.0 - clamp(abs(rd.y), 0.0, 1.0), 3.4);
  if (fresnel > 0.12) {
    vec3 reflDir = reflect(rd, wNorm);
    reflDir.y = abs(reflDir.y) + 0.02;
    vec3 reflCol = evalSky(normalize(reflDir), bayer);
    if (!inSun) reflCol *= vec3(0.68, 0.62, 0.80);
    float reflStep = floor(clamp(fresnel * 0.80, 0.0, 1.0) * 3.0 + bayer) / 3.0;
    col = mix(col, reflCol, reflStep);
  }

  // Dynamic shoreline foam
  if (depth < 1.35 && inHeightMap(hp.xz)) {
    ivec2 dtc = ivec2(floor((hp.xz - vec2(MAP_MIN_X, MAP_MIN_Z)) / TEXEL_WORLD)) & 511;
    float jitter = texelFetch(uDetailTex, dtc, 0).a;
    float waveLap = sin(depth * 9.5 - uTime * 2.7 + jitter * 2.4);
    float shoreProx = 1.0 - depth / 1.35;
    if (depth < 0.26 || (waveLap > 0.48 - shoreProx * 0.36 && shoreProx > 0.16)) {
      col = inSun ? vec3(0.961, 0.941, 0.910) : vec3(0.682, 0.667, 0.804);
    }
  }

  // Sun glitter path & transient white sparkles
  if (inSun && hitT < 420.0) {
    vec3 refl = reflect(rd, wNorm);
    float spec = max(0.0, dot(normalize(refl), uSunDir));
    if (spec > 0.968) {
      col = (spec > 0.991) ? vec3(1.000, 0.973, 0.867) : vec3(1.000, 0.808, 0.498);
    } else {
      vec2 cell = floor(hp.xz * 2.1);
      float h1 = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
      float h2 = fract(sin(dot(cell, vec2(269.5, 183.3)) + floor(uTime * 5.0) * 1.73) * 24634.6345);
      vec2 camToP = length(hp.xz - uCamPos.xz) > 1e-3 ? normalize(hp.xz - uCamPos.xz) : vec2(0.0, 1.0);
      float sunRoad = pow(max(0.0, dot(camToP, normalize(uSunDir.xz))), 3.0);
      float thresh = 0.991 - sunRoad * 0.048;
      if (h1 > 0.56 && h2 > thresh) {
        col = (h2 > thresh + 0.004) ? vec3(1.0, 1.0, 1.0) : vec3(1.0, 0.86, 0.58);
      }
    }
  }

  return applySteppedMist(col, rd, hitT, 0.0, bayer);
}

void main() {
  ivec2 pix = ivec2(gl_FragCoord.xy);
  float bayer = bayer4x4(pix);

  // Map low-res FBO pixel center to exact CSS screen pixel (px, py) with top-left origin
  vec2 cssPos = vec2(vUV.x * uFullSize.x, (1.0 - vUV.y) * uFullSize.y);
  float ndcX = (cssPos.x - uPrincipal.x) / uFocalPx;
  float ndcY = (uPrincipal.y - cssPos.y) / uFocalPx;
  vec3 rd = normalize(-uCamBack + uCamRight * ndcX + uCamUp * ndcY);

  float hitT = MAX_DIST;
  bool hitWater = false;
  bool hitSurf = raymarchSurface(uCamPos, rd, hitT, hitWater);

  float cloudT = 920.0;
  vec3 cloudCol = vec3(0.0);
  bool hitCloud = raymarchClouds(uCamPos, rd, hitSurf ? hitT : 920.0, bayer, cloudT, cloudCol);

  vec3 col;
  float viewZ = MAX_VIEW_Z;
  float matClass = 0.0; // 0 = sky, 0.25 = water, 0.60 = land, 0.95 = cliff
  float hBand = 0.0;

  if (hitCloud && (!hitSurf || cloudT < hitT)) {
    col = cloudCol;
    viewZ = min(MAX_VIEW_Z, cloudT * dot(rd, -uCamBack));
    matClass = 0.0;
  } else if (hitSurf) {
    vec3 hp = uCamPos + rd * hitT;
    viewZ = min(MAX_VIEW_Z, hitT * dot(rd, -uCamBack));
    if (hitWater) {
      col = shadeWater(hp, rd, hitT, bayer);
      matClass = 0.25;
      hBand = 0.0;
    } else {
      float isCliff = 0.0;
      col = shadeLand(hp, rd, hitT, bayer, isCliff);
      matClass = isCliff > 0.5 ? 0.95 : 0.60;
      hBand = clamp((hp.y - H_MIN) / H_SPAN, 0.0, 1.0);
    }
  } else {
    col = evalSky(rd, bayer);
    matClass = 0.0;
  }

  float normZ = clamp(viewZ / MAX_VIEW_Z, 0.0, 1.0);
  float u16 = floor(normZ * 65535.0 + 0.5);
  float zHi = floor(u16 / 256.0) / 255.0;
  float zLo = mod(u16, 256.0) / 255.0;

  fragColor = vec4(col, 1.0);
  fragMeta = vec4(zHi, zLo, matClass, hBand);
}`;

// Blit Pass into Composite MRT: NEAREST upscale + Fighter-Jet 1px Depth-Crease Cliff Inking + 16-bit Depth Forward
const BLIT_FS = `#version 300 es
precision highp float;
in vec2 vUV;
layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outDepth;

uniform sampler2D uSceneColor;
uniform sampler2D uSceneMeta;
uniform vec2 uSceneTexel;

float unpackZ(vec4 m) {
  return (m.r * 255.0 * 256.0 + m.g * 255.0) / 65535.0 * ${MAX_VIEW_Z.toFixed(4)};
}

void main() {
  vec3 col = texture(uSceneColor, vUV).rgb;
  vec4 mC = texture(uSceneMeta, vUV);
  float zC = unpackZ(mC);

  // 1px dark silhouette & cliff-ridge crease inking (from VESPER WING BLIT_FRAG)
  if (mC.b > 0.1) {
    vec4 mL = texture(uSceneMeta, vUV - vec2(uSceneTexel.x, 0.0));
    vec4 mR = texture(uSceneMeta, vUV + vec2(uSceneTexel.x, 0.0));
    vec4 mU = texture(uSceneMeta, vUV + vec2(0.0, uSceneTexel.y));
    vec4 mD = texture(uSceneMeta, vUV - vec2(0.0, uSceneTexel.y));
    float maxJump = max(
      max(unpackZ(mL) - zC, unpackZ(mR) - zC),
      max(unpackZ(mU) - zC, unpackZ(mD) - zC)
    );
    bool skyEdge = (mL.b < 0.05 || mR.b < 0.05 || mU.b < 0.05 || mD.b < 0.05);
    float thresh = max(1.8, zC * 0.055);
    if (skyEdge || maxJump > thresh) {
      col *= vec3(0.46, 0.40, 0.54);
    } else if (mC.b > 0.85 && maxJump > thresh * 0.45) {
      col *= vec3(0.74, 0.70, 0.80);
    }
  }

  outColor = vec4(col, 1.0);
  outDepth = vec4(mC.r, mC.g, 0.0, 1.0);
}`;

// Final Octopath Traveler HD-2D Post-Process Pass:
// Unified 3D+2D Depth Tilt-Shift Bokeh + Warm Golden Sunlight Bloom + Diagonal Sunbeam Veil + Rich Vignette
const POST_FS = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 outColor;

uniform sampler2D uCompColor;
uniform sampler2D uCompDepth;
uniform vec2 uInvRes;
uniform float uFocusZ;
uniform float uDpr;
uniform float uPitch;
uniform float uPostFx;
uniform vec2 uSunCorner; // screen UV corner where warm sun shafts enter

float unpackZ(vec4 d) {
  return (d.r * 255.0 * 256.0 + d.g * 255.0) / 65535.0 * ${MAX_VIEW_Z.toFixed(4)};
}

float calcCoC(vec4 d, vec2 uv, float deadZone) {
  if (d.b > 0.5) return 0.0; // 2D UI overlay (HP bars, rings): always 100% sharp!
  float z = unpackZ(d);
  float rel = (z > uFocusZ)
    ? (z - uFocusZ) / max(14.0, uFocusZ * 1.15)
    : (uFocusZ - z) / max(10.0, uFocusZ * 0.62);
  float zCoc = clamp((rel - deadZone) / 0.72, 0.0, 1.0);
  // Subtle miniature diorama top/bottom tilt-shift band (stronger at low horizon pitch, gentle at standard pitch)
  float edgeTilt = max(
    smoothstep(0.89, 1.00, uv.y) * 0.42,
    smoothstep(0.08, 0.00, uv.y) * 0.34
  );
  return clamp(max(zCoc, edgeTilt), 0.0, 1.0);
}

void main() {
  ivec2 ip = ivec2(gl_FragCoord.xy);
  vec3 baseCol = texelFetch(uCompColor, ip, 0).rgb;
  if (uPostFx < 0.5) {
    vec2 dv = vUV - 0.5;
    float vg0 = clamp(1.0 - dot(dv, dv) * 0.38, 0.78, 1.0);
    outColor = vec4(baseCol * mix(vec3(0.86, 0.80, 0.90), vec3(1.0), vg0), 1.0);
    return;
  }

  vec4 dC = texelFetch(uCompDepth, ip, 0);
  float zC = unpackZ(dC);
  float deadZone = mix(0.18, 0.36, clamp((uPitch - 0.22) / 0.42, 0.0, 1.0));
  float coc = calcCoC(dC, vUV, deadZone);

  vec3 col = baseCol;
  if (coc > 0.025) {
    // 12-tap Golden-Angle Vogel Disc Depth-Aware Bokeh
    float maxRad = coc * 4.4 * uDpr;
    vec3 acc = baseCol * 1.35;
    float wSum = 1.35;
    const vec2 dirs[12] = vec2[12](
      vec2( 0.2887,  0.0000), vec2(-0.3015,  0.2756), vec2( 0.0563, -0.4968),
      vec2( 0.4408,  0.3712), vec2(-0.6295, -0.0725), vec2( 0.4534, -0.5318),
      vec2( 0.0672,  0.7521), vec2(-0.6693,  0.4618), vec2( 0.8421, -0.1942),
      vec2(-0.3211, -0.8562), vec2(-0.7945, -0.5410), vec2( 0.7618,  0.6478)
    );
    for (int i = 0; i < 12; i++) {
      vec2 sUV = clamp(vUV + dirs[i] * maxRad * uInvRes, vec2(0.001), vec2(0.999));
      vec4 dS = texture(uCompDepth, sUV);
      float cocS = calcCoC(dS, sUV, deadZone);
      float zS = unpackZ(dS);
      // Reject sharp foreground sprites from bleeding into blurred background
      float fgLeak = (zS + 2.0 < zC && cocS < coc * 0.45) ? 0.12 : 1.0;
      float w = (0.45 + 0.55 * max(coc, cocS)) * fgLeak;
      vec3 cS = texture(uCompColor, sUV).rgb;
      // Boost bright bokeh highlights slightly (classic Octopath specular orb feel!)
      float lumS = dot(cS, vec3(0.299, 0.587, 0.114));
      w *= 1.0 + smoothstep(0.72, 0.98, lumS) * 0.65;
      acc += cS * w;
      wSum += w;
    }
    col = acc / wSum;
  }

  // Warm Golden Sunlight & Crystal Highlights Bloom (2-ring 8-tap wide soft glow)
  if (dC.b < 0.5) {
    vec3 bloom = vec3(0.0);
    const vec2 bOff[8] = vec2[8](
      vec2( 1.0,  0.0), vec2(-1.0,  0.0), vec2( 0.0,  1.0), vec2( 0.0, -1.0),
      vec2( 0.707,  0.707), vec2(-0.707,  0.707), vec2( 0.707, -0.707), vec2(-0.707, -0.707)
    );
    vec2 r1 = 6.5 * uDpr * uInvRes;
    vec2 r2 = 15.0 * uDpr * uInvRes;
    for (int i = 0; i < 8; i++) {
      vec3 c1 = texture(uCompColor, clamp(vUV + bOff[i] * r1, vec2(0.001), vec2(0.999))).rgb;
      vec3 c2 = texture(uCompColor, clamp(vUV + bOff[i] * r2, vec2(0.001), vec2(0.999))).rgb;
      float l1 = max(max(c1.r, c1.g), c1.b);
      float l2 = max(max(c2.r, c2.g), c2.b);
      bloom += c1 * smoothstep(0.76, 1.02, l1) * 0.085;
      bloom += c2 * smoothstep(0.80, 1.04, l2) * 0.055;
    }
    col = min(vec3(1.0), col + bloom * vec3(1.06, 0.90, 0.68) * 0.42);
  }

  // Subtle Diagonal Golden Sunset Shaft Wash from sun corner + Cinematic Vignette
  float sunCornerDist = length((vUV - uSunCorner) * vec2(1.0, 0.85));
  float sunVeil = pow(clamp(1.0 - sunCornerDist * 0.92, 0.0, 1.0), 2.4) * 0.095;
  col = min(vec3(1.0), col + vec3(1.0, 0.78, 0.46) * sunVeil);

  vec2 d = vUV - 0.5;
  float vig = clamp(1.0 - dot(d, d) * 0.58, 0.68, 1.0);
  col *= mix(vec3(0.76, 0.68, 0.84), vec3(1.0), vig);

  outColor = vec4(col, 1.0);
}`;

// World-Space 3D Projected Sprite Silhouette Shadow Shader
// Each instance supplies 4 world-space 3D corners on the terrain + sprite UV!
const SHADOW3D_VS = `#version 300 es
layout(location = 0) in vec3 aP0;
layout(location = 1) in vec3 aP1;
layout(location = 2) in vec3 aP2;
layout(location = 3) in vec3 aP3;
layout(location = 4) in vec4 aUV;
layout(location = 5) in vec2 aMeta; // x = texSlot, y = alphaWeight

uniform vec3 uCamPos;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform vec3 uCamBack;
uniform vec2 uFullSize;
uniform vec2 uPrincipal;
uniform float uFocalPx;
uniform float uDpr;

out vec2 vUV;
out float vFade;
out float vViewZ;
flat out int vSlot;

void main() {
  int vid = gl_VertexID; // 0:(0,0) top-left, 1:(1,0) top-right, 2:(0,1) bot-left, 3:(1,1) bot-right
  vec2 q = vec2(float(vid & 1), float(vid >> 1));
  vec3 wp = (vid == 0) ? aP0 : (vid == 1) ? aP1 : (vid == 2) ? aP2 : aP3;

  vec3 d = wp - uCamPos;
  float vx = dot(d, uCamRight);
  float vy = dot(d, uCamUp);
  float vz = max(0.25, -dot(d, uCamBack));

  float sx = (uPrincipal.x + (vx / vz) * uFocalPx) * uDpr;
  float sy = (uPrincipal.y - (vy / vz) * uFocalPx) * uDpr;
  vec2 devSize = uFullSize * uDpr;

  gl_Position = vec4(sx / devSize.x * 2.0 - 1.0, 1.0 - sy / devSize.y * 2.0, 0.0, 1.0);
  vUV = mix(aUV.xy, aUV.zw, q);
  vFade = aMeta.y * mix(0.32, 1.0, q.y); // softer near crown/roof tip, crisp at feet
  vViewZ = vz;
  vSlot = int(aMeta.x + 0.5);
}`;

const SHADOW3D_FS = n => `#version 300 es
precision highp float;
uniform sampler2D uT[${n}];
uniform sampler2D uSceneMeta;
uniform vec2 uDevSize;

in vec2 vUV;
in float vFade;
in float vViewZ;
flat in int vSlot;
out vec4 outColor;

vec4 tx(int i, vec2 uv) {
  switch (i) {
    ${Array.from({ length: n }, (_, i) => `case ${i}: return texture(uT[${i}], uv);`).join('\n    ')}
  }
  return vec4(0.0);
}

void main() {
  vec4 t = tx(vSlot, vUV);
  if (t.a < 0.16) discard;
  vec2 suv = gl_FragCoord.xy / uDevSize;
  vec4 m = texture(uSceneMeta, suv);
  if (m.b < 0.05) discard; // never cast ground shadow onto sky
  float terrainZ = (m.r * 255.0 * 256.0 + m.g * 255.0) / 65535.0 * ${MAX_VIEW_Z.toFixed(4)};
  if (vViewZ > terrainZ + 1.35) discard; // occluded by foreground 3D ridge
  float a = clamp(vFade, 0.0, 1.0);
  outColor = vec4(0.133 * a, 0.102 * a, 0.227 * a, a);
}`;

// Upright 2D Pixel-Art Billboard & Overlay Batch Shader (with 3D Terrain Depth Occlusion & Horizon Mist!)
const SPRITE_VS = `#version 300 es
layout(location = 0) in vec4 aM;
layout(location = 1) in vec4 aT;
layout(location = 2) in vec4 aUV;
layout(location = 3) in vec4 aC;
layout(location = 4) in vec4 aF;
layout(location = 5) in vec4 aD; // x = viewZ, y = depthTol, z = isWorld (1=3D depth-tested, 0=2D overlay), w = mistFactor

uniform vec2 uView;
out vec2 vUV;
out vec4 vC;
out vec4 vF;
out vec4 vD;
flat out int vU;

void main() {
  vec2 q = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1));
  if (aT.z > 0.5 && q.x > 0.5 && q.y > 0.5) q.x = 0.0;
  vec2 p = aT.xy + aM.xy * q.x + aM.zw * q.y;
  gl_Position = vec4(p.x / uView.x * 2.0 - 1.0, 1.0 - p.y / uView.y * 2.0, 0.0, 1.0);
  vUV = mix(aUV.xy, aUV.zw, q);
  vC = aC;
  vF = aF;
  vD = aD;
  vU = int(aT.w + 0.5);
}`;

const SPRITE_FS = n => `#version 300 es
precision highp float;
uniform sampler2D uT[${n}];
uniform sampler2D uSceneMeta;
uniform vec2 uView;
uniform vec3 uMistTint;

in vec2 vUV;
in vec4 vC;
in vec4 vF;
in vec4 vD;
flat in int vU;
layout(location = 0) out vec4 o;
layout(location = 1) out vec4 oDepth;

vec4 tx(int i, vec2 uv) {
  switch (i) {
    ${Array.from({ length: n }, (_, i) => `case ${i}: return texture(uT[${i}], uv);`).join('\n    ')}
  }
  return vec4(0.0);
}

float bayer4(ivec2 p) {
  int idx = ((p.y & 3) << 2) | (p.x & 3);
  const float b[16] = float[16](
     0.5/16.0,  8.5/16.0,  2.5/16.0, 10.5/16.0,
    12.5/16.0,  4.5/16.0, 14.5/16.0,  6.5/16.0,
     3.5/16.0, 11.5/16.0,  1.5/16.0,  9.5/16.0,
    15.5/16.0,  7.5/16.0, 13.5/16.0,  5.5/16.0
  );
  return b[idx];
}

void main() {
  vec4 t = tx(vU, vUV);
  if (t.a * vC.a < 0.008) discard;

  if (vD.z > 0.5) {
    vec2 suv = gl_FragCoord.xy / uView;
    vec4 m = texture(uSceneMeta, suv);
    if (m.b > 0.05) {
      float terrainZ = (m.r * 255.0 * 256.0 + m.g * 255.0) / 65535.0 * ${MAX_VIEW_Z.toFixed(4)};
      if (vD.x > terrainZ + vD.y) discard;
    }
    if (vD.w > 0.01) {
      float b = bayer4(ivec2(gl_FragCoord.xy));
      float qm = floor(vD.w * 4.0 + b) / 4.0;
      t.rgb = mix(t.rgb, uMistTint * t.a, qm * 0.45);
    }
  }

  t.rgb = mix(t.rgb, vF.rgb * t.a, vF.a);
  vec4 outC = t * vC;
  o = outC;
  if (outC.a >= 0.48) {
    if (vD.z > 0.5) {
      float normZ = clamp(vD.x / ${MAX_VIEW_Z.toFixed(4)}, 0.0, 1.0);
      float u16 = floor(normZ * 65535.0 + 0.5);
      oDepth = vec4(floor(u16 / 256.0) / 255.0, mod(u16, 256.0) / 255.0, 0.0, 1.0);
    } else {
      oDepth = vec4(0.0, 0.0, 1.0, 1.0);
    }
  } else {
    oDepth = vec4(0.0);
  }
}`;

const SPRITE_FL = 24;   // 6 vec4 attributes per sprite instance
const SHADOW_FL = 18;   // 18 floats per 3D ground shadow instance

export function createHD2DRenderer(canvas, { onLost = () => {}, onRestored = () => {}, budgetMB = 256 } = {}) {
  let gl = null;
  try {
    gl = canvas.getContext('webgl2', {
      alpha: false, antialias: false, depth: false, stencil: false,
      premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: 'high-performance',
    });
  } catch { gl = null; }
  if (!gl) return null;

  // Build initial 3D heightfield, baked sunset shadows, max-mip pyramid & cloud map
  let worldData = buildWorldData([]);
  let pondSig = '';

  // Bilinear CPU height lookup matching GPU sampleTerrain(xz).x
  function terrainHeight(wx, wz) {
    if (!Number.isFinite(wx) || !Number.isFinite(wz)) return VILLAGE_H;
    const tx = (wx - MAP_MIN_X) / TEXEL_WORLD - 0.5;
    const tz = (wz - MAP_MIN_Z) / TEXEL_WORLD - 0.5;
    if (tx < 0 || tx >= MAP_RES - 1 || tz < 0 || tz >= MAP_RES - 1) return 0.0;
    const i0 = tx | 0, j0 = tz | 0;
    const fx = tx - i0, fz = tz - j0;
    const H = worldData.heights;
    const h00 = H[j0 * MAP_RES + i0], h10 = H[j0 * MAP_RES + i0 + 1];
    const h01 = H[(j0 + 1) * MAP_RES + i0], h11 = H[(j0 + 1) * MAP_RES + i0 + 1];
    const h = (h00 + (h10 - h00) * fx) * (1 - fz) + (h01 + (h11 - h01) * fx) * fz;
    return Math.max(0.0, h);
  }

  // 3D Camera state (smoothly interpolated in stepCamera)
  let targetX = VC_X, targetZ = VC_Z, targetLiftY = 0;
  let camX = VC_X, camZ = VC_Z, camLiftY = 0;
  let camYaw = DEFAULT_YAW, targetYaw = DEFAULT_YAW;
  let camPitch = DEFAULT_PITCH, targetPitch = DEFAULT_PITCH;
  let presetIdx = 0;

  let cssW = 800, cssH = 500, dpr = 1, W = 800, H = 500;
  let curScale = 1.5, shakeX = 0, shakeY = 0, elapsed = 0, qualityHigh = true;

  // Derived per-frame 3D camera basis
  let camPos = [0, 30, 0], camRight = [1, 0, 0], camUp = [0, 1, 0], camBack = [0, 0, 1];
  let camDist = 60, focalPx = 700, prinX = 400, prinY = 276;
  // Unshaken basis for accurate pointer unprojection
  let uPrinX = 400, uPrinY = 276;

  function updateCameraBasis(scale, w, h, sx = 0, sy = 0) {
    cssW = Math.max(1, w);
    cssH = Math.max(1, h);
    curScale = Math.max(0.2, scale || 1);
    shakeX = sx;
    shakeY = sy;

    focalPx = (cssH * 0.5) / TAN_HALF_FOV;
    camDist = focalPx / (WORLD_TO_LOGICAL * curScale);

    const cb = Math.cos(camYaw), sb = Math.sin(camYaw);
    const cp = Math.cos(camPitch), sp = Math.sin(camPitch);

    const baseH = terrainHeight(camX, camZ);
    const ty = baseH + camLiftY;

    let px = camX + cb * cp * camDist;
    let py = ty + sp * camDist;
    let pz = camZ + sb * cp * camDist;

    // Prevent camera arm from clipping into foreground 3D crags at low horizon pitch
    let reqPy = py;
    for (const u of [0.38, 0.68, 1.0]) {
      const sx2 = camX + (px - camX) * u;
      const sz2 = camZ + (pz - camZ) * u;
      const clearance = terrainHeight(sx2, sz2) + (u < 0.99 ? 2.4 : 3.2);
      const wantAtEnd = ty + (clearance - ty) / u;
      if (wantAtEnd > reqPy) reqPy = wantAtEnd;
    }
    py = reqPy;

    const dx = px - camX, dy = py - ty, dz = pz - camZ;
    const dl = Math.hypot(dx, dy, dz) || 1;
    camPos = [px, py, pz];
    camBack = [dx / dl, dy / dl, dz / dl];
    // Keep right strictly horizontal so 2D billboards never Dutch-roll
    camRight = [sb, 0, -cb];
    camUp = [
      camBack[1] * camRight[2] - camBack[2] * camRight[1],
      camBack[2] * camRight[0] - camBack[0] * camRight[2],
      camBack[0] * camRight[1] - camBack[1] * camRight[0],
    ];
    const ul = Math.hypot(camUp[0], camUp[1], camUp[2]) || 1;
    camUp[0] /= ul; camUp[1] /= ul; camUp[2] /= ul;

    // Architectural off-axis lens shift at low horizon tilts so sunset sky & clouds open up above the village
    const lowTilt = Math.max(0, Math.min(1, (0.50 - camPitch) / 0.30));
    uPrinX = cssW * 0.5;
    uPrinY = cssH * 0.5 + 24 + lowTilt * cssH * 0.13;
    prinX = uPrinX + shakeX;
    prinY = uPrinY + shakeY;
  }

  function isOccluded3D(wx, wz, liftWorld = 1.6, graceDist = 2.8) {
    const ty = terrainHeight(wx, wz) + liftWorld;
    const dx = wx - camPos[0], dy = ty - camPos[1], dz = wz - camPos[2];
    const dist = Math.hypot(dx, dy, dz);
    if (dist <= graceDist + 1.5) return false;
    const endT = (dist - graceDist) / dist;
    const startT = Math.min(endT * 0.5, 1.5 / dist);
    const STEPS = 34;
    for (let i = 1; i <= STEPS; i++) {
      const u = startT + ((endT - startT) * i) / STEPS;
      const rx = camPos[0] + dx * u;
      const ry = camPos[1] + dy * u;
      const rz = camPos[2] + dz * u;
      if (terrainHeight(rx, rz) > ry + 0.30) return true;
    }
    return false;
  }

  function project3D(wx, wy, wz, withShake = true) {
    const dx = wx - camPos[0], dy = wy - camPos[1], dz = wz - camPos[2];
    const vx = dx * camRight[0] + dy * camRight[1] + dz * camRight[2];
    const vy = dx * camUp[0] + dy * camUp[1] + dz * camUp[2];
    const rawVz = -(dx * camBack[0] + dy * camBack[1] + dz * camBack[2]);
    const behind = rawVz <= 0.35;
    const vz = behind ? 0.35 : rawVz;
    const px = (withShake ? prinX : uPrinX) + (vx / vz) * focalPx;
    const py = (withShake ? prinY : uPrinY) - (vy / vz) * focalPx;
    const pScale = curScale * Math.max(0.24, Math.min(2.35, camDist / vz));
    return { x: px, y: py, vz: rawVz, s: pScale, behind };
  }

  function screenPoint(wx, wz, liftLogical = 0) {
    const wy = terrainHeight(wx, wz) + (liftLogical * 8) / WORLD_TO_LOGICAL;
    return project3D(wx, wy, wz, true);
  }

  function unproject(sx, sy) {
    const ndcX = (sx - uPrinX) / focalPx;
    const ndcY = (uPrinY - sy) / focalPx;
    let rx = -camBack[0] + camRight[0] * ndcX + camUp[0] * ndcY;
    let ry = -camBack[1] + camRight[1] * ndcX + camUp[1] * ndcY;
    let rz = -camBack[2] + camRight[2] * ndcX + camUp[2] * ndcY;
    const rl = Math.hypot(rx, ry, rz) || 1;
    rx /= rl; ry /= rl; rz /= rl;

    // Raycast against CPU 3D heightfield
    if (ry < -0.008) {
      let tMin = Math.max(0.2, camPos[1] > H_MAX ? (H_MAX - camPos[1]) / ry : 0.2);
      let tMax = Math.min(480, -camPos[1] / ry + 6.0);
      if (tMax < tMin) tMax = tMin + 120;
      const STEPS = 56;
      const dt = (tMax - tMin) / STEPS;
      let prevT = tMin;
      for (let i = 1; i <= STEPS; i++) {
        const t = tMin + dt * i;
        const px = camPos[0] + rx * t, py = camPos[1] + ry * t, pz = camPos[2] + rz * t;
        const th = terrainHeight(px, pz);
        if (py <= th) {
          let a = prevT, b = t;
          for (let k = 0; k < 5; k++) {
            const m = 0.5 * (a + b);
            if (camPos[1] + ry * m <= terrainHeight(camPos[0] + rx * m, camPos[2] + rz * m)) b = m;
            else a = m;
          }
          const ht = 0.5 * (a + b);
          return { x: camPos[0] + rx * ht, z: camPos[2] + rz * ht, sx, sy };
        }
        prevT = t;
      }
    }
    // Fallback if clicking high in the sky: project onto target elevation plane along horizontal ray
    const refY = terrainHeight(camX, camZ);
    const tFallback = ry < -1e-4 ? Math.min(220, (refY - camPos[1]) / ry) : 140;
    return { x: camPos[0] + rx * tFallback, z: camPos[2] + rz * tFallback, sx, sy };
  }

  // Camera controls
  function clampTarget() {
    const pad = 10;
    targetX = Math.max(WORLD.minX - pad, Math.min(WORLD.maxX + pad, targetX));
    targetZ = Math.max(WORLD.minZ - pad, Math.min(WORLD.maxZ + pad, targetZ));
  }

  function panByScreen(dxCss, dyCss) {
    const cb = Math.cos(camYaw), sb = Math.sin(camYaw);
    const invW = 1 / (WORLD_TO_LOGICAL * curScale);
    const invH = invW / Math.max(0.28, Math.sin(camPitch));
    // Screen right = [sb, -cb]; Screen down = [cb, sb]
    targetX -= dxCss * invW * sb + dyCss * invH * cb;
    targetZ -= -dxCss * invW * cb + dyCss * invH * sb;
    clampTarget();
    camX = targetX;
    camZ = targetZ;
  }

  function shiftTarget(dWx, dWz) {
    if (!Number.isFinite(dWx) || !Number.isFinite(dWz)) return;
    targetX += dWx;
    targetZ += dWz;
    clampTarget();
    camX = targetX;
    camZ = targetZ;
  }

  function setTarget(wx, wz, liftY = 0, snap = false) {
    targetX = wx;
    targetZ = wz;
    targetLiftY = liftY;
    clampTarget();
    if (snap) {
      camX = targetX;
      camZ = targetZ;
      camLiftY = targetLiftY;
    }
  }

  function stepCamera(dt) {
    const k = 1 - Math.exp(-Math.max(0.016, dt || 0.016) * 8.5);
    camX += (targetX - camX) * k;
    camZ += (targetZ - camZ) * k;
    camLiftY += (targetLiftY - camLiftY) * k;
    // Shortest-arc yaw interpolation
    let dYaw = ((targetYaw - camYaw + Math.PI) % TAU + TAU) % TAU - Math.PI;
    camYaw += dYaw * Math.min(1, k * 1.25);
    camPitch += (targetPitch - camPitch) * Math.min(1, k * 1.25);
  }

  function orbitBy(dYaw, dPitch = 0, snap = false) {
    targetYaw += dYaw;
    targetPitch = Math.max(0.23, Math.min(1.18, targetPitch + dPitch));
    if (snap) {
      camYaw = targetYaw;
      camPitch = targetPitch;
    }
  }

  function cycleTilt() {
    presetIdx = (presetIdx + 1) % PITCH_PRESETS.length;
    targetPitch = PITCH_PRESETS[presetIdx];
    return Math.round((targetPitch * 180) / Math.PI);
  }

  function resetAngle() {
    targetYaw = DEFAULT_YAW;
    targetPitch = DEFAULT_PITCH;
    presetIdx = 0;
  }

  // Rotate a world (dx, dz) into equivalent default-iso (dx', dz') so dir4.js & pixelfx work at ANY 360° yaw!
  function rotDir(dx, dz) {
    const cb = Math.cos(camYaw), sb = Math.sin(camYaw);
    const ur = dx * sb - dz * cb; // along screen right
    const ud = dx * cb + dz * sb; // along screen down
    const s = Math.SQRT1_2;
    return { x: (ur + ud) * s, z: (ud - ur) * s, right: ur, down: ud };
  }

  function dirFromScreen(sx, sy) {
    const cb = Math.cos(camYaw), sb = Math.sin(camYaw);
    const ux = sx / 9, uy = sy / 4.5;
    return { x: ux * sb + uy * cb, z: -ux * cb + uy * sb };
  }

  function screenVec(dx, dz) {
    const cb = Math.cos(camYaw), sb = Math.sin(camYaw);
    const sx = (dx * sb - dz * cb) * 9;
    const sy = (dx * cb + dz * sb) * 9 * Math.max(0.25, Math.sin(camPitch));
    const l = Math.hypot(sx, sy) || 1;
    return { x: sx / l, y: sy / l };
  }

  // ============================================================================
  // WEBGL2 RESOURCES & PIPELINES
  // ============================================================================
  let MAXU = 14, MAXT = 4096, lost = false;
  let terrainProg, blitProg, postProg, shadowProg, spriteProg;
  let emptyVao, spriteVao, spriteBuf, shadowVao, shadowBuf;
  let terrainTex, detailTex, maxMipTex, cloudTex, groundTex = null, villageTex = null;
  let hasGroundTex = false, hasVillageTex = false;
  let groundBox = [0, 0, 1, 1], villageBox = [0, 0, 1, 1];
  let sceneFbo = null, sceneColorTex = null, sceneMetaTex = null, sceneW = 0, sceneH = 0;
  let shadowFbo = null, shadowFboTex = null, shadowW = 0, shadowH = 0, shadowFboEntry = null;
  let compFbo = null, compColorTex = null, compDepthTex = null, compW = 0, compH = 0;
  let postFxOn = true;
  const pointPosArr = new Float32Array(12 * 4);
  const pointColArr = new Float32Array(12 * 3);
  let pointLightCount = 0;
  let white = null;

  function setPointLights(lights) {
    const n = Math.min(12, Array.isArray(lights) ? lights.length : 0);
    pointLightCount = n;
    for (let i = 0; i < n; i++) {
      const L = lights[i];
      const wy = terrainHeight(L.x, L.z) + (L.lift ?? 1.45);
      pointPosArr[i * 4 + 0] = L.x;
      pointPosArr[i * 4 + 1] = wy;
      pointPosArr[i * 4 + 2] = L.z;
      pointPosArr[i * 4 + 3] = L.r || 6.0;
      pointColArr[i * 3 + 0] = L.cr ?? 1.0;
      pointColArr[i * 3 + 1] = L.cg ?? 0.78;
      pointColArr[i * 3 + 2] = L.cb ?? 0.42;
    }
  }

  let texMap = new WeakMap();
  const reg = new Set();
  let bytes = 0, frame = 0, uploads = 0, draws = 0, inst = 0;
  const BUDGET = budgetMB * 1048576, uns = {};
  const miss = k => { uns[k] = (uns[k] || 0) + 1; };

  function compileProgram(vsSrc, fsSrc) {
    const sh = (t, s) => {
      const o = gl.createShader(t);
      gl.shaderSource(o, s);
      gl.compileShader(o);
      if (!gl.getShaderParameter(o, gl.COMPILE_STATUS) && !gl.isContextLost()) {
        throw new Error('HD2D shader error: ' + gl.getShaderInfoLog(o));
      }
      return o;
    };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fsSrc));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) {
      throw new Error('HD2D link error: ' + gl.getProgramInfoLog(p));
    }
    return p;
  }

  function uploadWorldTextures() {
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

    if (!terrainTex) terrainTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, terrainTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, MAP_RES, MAP_RES, 0, gl.RGBA, gl.UNSIGNED_BYTE, worldData.terrainRGBA);

    if (!detailTex) detailTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, detailTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, MAP_RES, MAP_RES, 0, gl.RGBA, gl.UNSIGNED_BYTE, worldData.detailRGBA);

    if (maxMipTex) gl.deleteTexture(maxMipTex);
    maxMipTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, maxMipTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_BASE_LEVEL, 0);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, worldData.mipLevels.length - 1);
    for (let lvl = 0; lvl < worldData.mipLevels.length; lvl++) {
      const r = MAP_RES >>> lvl;
      gl.texImage2D(gl.TEXTURE_2D, lvl, gl.R8, r, r, 0, gl.RED, gl.UNSIGNED_BYTE, worldData.mipLevels[lvl]);
    }

    if (!cloudTex) cloudTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, cloudTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, worldData.CLOUD_RES, worldData.CLOUD_RES, 0, gl.RGBA, gl.UNSIGNED_BYTE, worldData.cloudRGBA);

    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  }

  function syncGroundCanvases(groundCanvas, gBox, villageCanvas, vBox, ponds = []) {
    if (lost) return;
    const pSig = JSON.stringify(ponds || []);
    if (pSig !== pondSig) {
      pondSig = pSig;
      worldData = buildWorldData(ponds);
      uploadWorldTextures();
    }
    groundBox = gBox;
    villageBox = vBox;

    if (groundCanvas && groundCanvas.width > 0 && groundCanvas.height > 0) {
      const cap = Math.min(MAXT, 4096);
      let src = groundCanvas;
      if (src.width > cap || src.height > cap) {
        const sc = Math.min(cap / src.width, cap / src.height);
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(src.width * sc));
        c.height = Math.max(1, Math.round(src.height * sc));
        const cx = c.getContext('2d');
        cx.imageSmoothingEnabled = true;
        cx.drawImage(src, 0, 0, c.width, c.height);
        src = c;
      }
      if (!groundTex) groundTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, groundTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      if (src !== groundCanvas) src.width = src.height = 0;
      hasGroundTex = true;
    }

    if (villageCanvas && villageCanvas.width > 0 && villageCanvas.height > 0) {
      if (!villageTex) villageTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, villageTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, villageCanvas);
      hasVillageTex = true;
    }
  }

  function mkTex(src, x, y, w, h, fw, fh, repeat) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    const wrap = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    if (src instanceof Uint8Array) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, src);
    } else if (x || y || w !== fw || h !== fh) {
      let ok = false;
      try {
        gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, x);
        gl.pixelStorei(gl.UNPACK_SKIP_ROWS, y);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, src);
        ok = gl.getError() === gl.NO_ERROR;
      } catch { ok = false; }
      gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
      gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
      if (!ok) {
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(src, x, y, w, h, 0, 0, w, h);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
        c.width = c.height = 0;
      }
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    }
    uploads++;
    return t;
  }

  const srcSize = s => [s.naturalWidth ?? s.width ?? 0, s.naturalHeight ?? s.height ?? 0];

  function entry(src, repeat = false) {
    if (!src || lost) return null;
    if (src.complete === false) return null;
    const [w, h] = srcSize(src);
    if (!(w > 0 && h > 0)) return null;
    let r = texMap.get(src);
    if (!r) { r = {}; texMap.set(src, r); }
    const k = repeat ? 'rep' : 'clamp';
    let e = r[k];
    if (e && !e.dead && e.w === w && e.h === h) { e.used = frame; return e; }
    if (e) free(e);
    e = { w, h, used: frame, bytes: w * h * 4, tex: null, tiles: null, dead: false };
    try {
      if (w <= MAXT && h <= MAXT) {
        e.tex = mkTex(src, 0, 0, w, h, w, h, repeat);
      } else {
        if (repeat) { miss('repeatTooBig'); return null; }
        e.tiles = [];
        const TS = Math.min(MAXT, 4096);
        for (let y = 0; y < h; y += TS) {
          for (let x = 0; x < w; x += TS) {
            const tw = Math.min(TS, w - x), th = Math.min(TS, h - y);
            e.tiles.push({ x, y, w: tw, h: th, used: frame, tex: mkTex(src, x, y, tw, th, w, h, false) });
          }
        }
      }
    } catch (err) { miss('upload:' + (err?.name || 'error')); return null; }
    r[k] = e;
    reg.add(e);
    bytes += e.bytes;
    return e;
  }

  function free(e) {
    if (e.dead) return;
    e.dead = true;
    if (e.tex) gl.deleteTexture(e.tex);
    if (e.tiles) for (const t of e.tiles) gl.deleteTexture(t.tex);
    reg.delete(e);
    bytes -= e.bytes;
  }

  function release(src) {
    const r = src && texMap.get(src);
    if (!r) return;
    if (r.clamp) free(r.clamp);
    if (r.rep) free(r.rep);
    texMap.delete(src);
  }

  function evict() {
    if (bytes <= BUDGET || frame % 30) return;
    const old = [...reg].filter(e => frame - e.used > 90).sort((a, b) => a.used - b.used);
    for (const e of old) { if (bytes <= BUDGET * 0.8) break; free(e); }
  }

  function init() {
    const totalUnits = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS) | 0;
    MAXU = Math.max(2, Math.min(14, totalUnits - 2)); // reserve 1 unit for uSceneMeta
    MAXT = Math.max(1024, gl.getParameter(gl.MAX_TEXTURE_SIZE) | 0);

    terrainProg = compileProgram(QUAD_VS, TERRAIN_FS);
    blitProg = compileProgram(QUAD_VS, BLIT_FS);
    postProg = compileProgram(QUAD_VS, POST_FS);
    shadowProg = compileProgram(SHADOW3D_VS, SHADOW3D_FS(MAXU));
    spriteProg = compileProgram(SPRITE_VS, SPRITE_FS(MAXU));

    emptyVao = gl.createVertexArray();

    // Sprite batch VAO
    spriteVao = gl.createVertexArray();
    gl.bindVertexArray(spriteVao);
    spriteBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, spriteBuf);
    for (let i = 0; i < 6; i++) {
      gl.enableVertexAttribArray(i);
      gl.vertexAttribDivisor(i, 1);
    }

    // 3D Shadow batch VAO
    shadowVao = gl.createVertexArray();
    gl.bindVertexArray(shadowVao);
    shadowBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, shadowBuf);
    const shOffsets = [0, 12, 24, 36, 48, 64];
    const shSizes = [3, 3, 3, 3, 4, 2];
    for (let i = 0; i < 6; i++) {
      gl.enableVertexAttribArray(i);
      gl.vertexAttribPointer(i, shSizes[i], gl.FLOAT, false, SHADOW_FL * 4, shOffsets[i]);
      gl.vertexAttribDivisor(i, 1);
    }
    gl.bindVertexArray(null);

    // Bind static texture slot arrays
    const unitArr = Int32Array.from({ length: MAXU }, (_, i) => i);
    gl.useProgram(spriteProg);
    gl.uniform1iv(gl.getUniformLocation(spriteProg, 'uT'), unitArr);
    gl.uniform1i(gl.getUniformLocation(spriteProg, 'uSceneMeta'), MAXU);

    gl.useProgram(shadowProg);
    gl.uniform1iv(gl.getUniformLocation(shadowProg, 'uT'), unitArr);
    gl.uniform1i(gl.getUniformLocation(shadowProg, 'uSceneMeta'), MAXU);

    gl.useProgram(terrainProg);
    gl.uniform1i(gl.getUniformLocation(terrainProg, 'uTerrainTex'), 0);
    gl.uniform1i(gl.getUniformLocation(terrainProg, 'uDetailTex'), 1);
    gl.uniform1i(gl.getUniformLocation(terrainProg, 'uMaxMipTex'), 2);
    gl.uniform1i(gl.getUniformLocation(terrainProg, 'uCloudTex'), 3);
    gl.uniform1i(gl.getUniformLocation(terrainProg, 'uGroundTex'), 4);
    gl.uniform1i(gl.getUniformLocation(terrainProg, 'uVillageTex'), 5);

    gl.useProgram(blitProg);
    gl.uniform1i(gl.getUniformLocation(blitProg, 'uSceneColor'), 0);
    gl.uniform1i(gl.getUniformLocation(blitProg, 'uSceneMeta'), 1);

    gl.useProgram(postProg);
    gl.uniform1i(gl.getUniformLocation(postProg, 'uCompColor'), 0);
    gl.uniform1i(gl.getUniformLocation(postProg, 'uCompDepth'), 1);

    uploadWorldTextures();
    white = { tex: mkTex(new Uint8Array([255, 255, 255, 255]), 0, 0, 1, 1, 1, 1, false), w: 1, h: 1, used: 0, bytes: 4 };
    sceneFbo = gl.createFramebuffer();
    shadowFbo = gl.createFramebuffer();
    compFbo = gl.createFramebuffer();
    sceneW = sceneH = shadowW = shadowH = compW = compH = 0;

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
  }

  const isCoarseDevice = !!(globalThis.matchMedia?.('(pointer:coarse)')?.matches);
  function ensureSceneFbo() {
    const targetH = qualityHigh ? (isCoarseDevice ? 320 : 400) : 260;
    const sw = Math.max(160, Math.round(targetH * (W / Math.max(1, H))));
    const sh = Math.max(120, targetH);
    if (sceneColorTex && sceneW === sw && sceneH === sh) return;
    if (sceneColorTex) gl.deleteTexture(sceneColorTex);
    if (sceneMetaTex) gl.deleteTexture(sceneMetaTex);

    sceneColorTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, sceneColorTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, sw, sh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

    sceneMetaTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, sceneMetaTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, sw, sh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sceneColorTex, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, sceneMetaTex, 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    sceneW = sw;
    sceneH = sh;
  }

  function ensureShadowFbo() {
    if (shadowFboTex && shadowW === W && shadowH === H) return;
    if (shadowFboTex) gl.deleteTexture(shadowFboTex);
    shadowFboTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, shadowFboTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, shadowFboTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    shadowW = W;
    shadowH = H;
    shadowFboEntry = { tex: shadowFboTex, w: W, h: H, used: 0 };
  }

  function ensureCompFbo() {
    if (compColorTex && compW === W && compH === H) return;
    if (compColorTex) gl.deleteTexture(compColorTex);
    if (compDepthTex) gl.deleteTexture(compDepthTex);

    compColorTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, compColorTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

    compDepthTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, compDepthTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

    gl.bindFramebuffer(gl.FRAMEBUFFER, compFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, compColorTex, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, compDepthTex, 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    compW = W;
    compH = H;
  }

  // ============================================================================
  // BATCH LISTS: SPRITES (2D BILLBOARDS & OVERLAYS) + 3D WORLD SHADOWS
  // ============================================================================
  const mainList = { f: new Float32Array(SPRITE_FL * 2048), t: [], n: 0 };
  const shadow3DList = { f: new Float32Array(SHADOW_FL * 1024), t: [], n: 0 };
  let wantShadow = false, shadowAlpha = 0.56;

  // Current 3D depth state tagged onto emitted sprite quads
  let curViewZ = 0, curDepthTol = 1.2, curIsWorld = 0, curMist = 0;
  let curAnchorX = 0, curAnchorY = 0, curAnchorZ = 0;

  function setEntity3D(wx, wz, liftLogical = 0, depthTol = 0.85) {
    const wy = terrainHeight(wx, wz) + (liftLogical * 8) / WORLD_TO_LOGICAL;
    const pr = project3D(wx, wy, wz, true);
    curAnchorX = wx; curAnchorY = wy; curAnchorZ = wz;
    curViewZ = Math.max(0.1, pr.vz);
    curDepthTol = depthTol;
    curIsWorld = 1;
    curMist = Math.max(0, Math.min(1, (curViewZ - 105) / 145));
    return pr;
  }

  function setOverlay2D() {
    curIsWorld = 0;
    curMist = 0;
  }

  function getDepthTag() {
    return { vz: curViewZ, tol: curDepthTol, w: curIsWorld, m: curMist, ax: curAnchorX, ay: curAnchorY, az: curAnchorZ };
  }

  function restoreDepthTag(tag) {
    if (!tag) return;
    curViewZ = tag.vz; curDepthTol = tag.tol; curIsWorld = tag.w; curMist = tag.m;
    curAnchorX = tag.ax; curAnchorY = tag.ay; curAnchorZ = tag.az;
  }

  function putSprite(L, t, a, b, c, d, e, f, u0, v0, u1, v1, cr, cg, cb, ca, mode = 0) {
    if ((L.n + 1) * SPRITE_FL > L.f.length) {
      const nf = new Float32Array(L.f.length * 2);
      nf.set(L.f);
      L.f = nf;
    }
    const i = L.n * SPRITE_FL;
    L.t[L.n++] = t;
    const F = L.f;
    F[i] = a; F[i + 1] = b; F[i + 2] = c; F[i + 3] = d;
    F[i + 4] = e; F[i + 5] = f; F[i + 6] = mode; F[i + 7] = 0;
    F[i + 8] = u0; F[i + 9] = v0; F[i + 10] = u1; F[i + 11] = v1;
    F[i + 12] = cr; F[i + 13] = cg; F[i + 14] = cb; F[i + 15] = ca;
    F[i + 16] = 0; F[i + 17] = 0; F[i + 18] = 0; F[i + 19] = 0;
    F[i + 20] = curViewZ; F[i + 21] = curDepthTol; F[i + 22] = curIsWorld; F[i + 23] = curMist;
  }

  // Emit a true 3D ground-projected sprite silhouette shadow along -SUN_DIR!
  const sunScaleX = -SUN_DIR[0] / Math.max(0.22, SUN_DIR[1]);
  const sunScaleZ = -SUN_DIR[2] / Math.max(0.22, SUN_DIR[1]);

  function castShadow3D(img, sx, sy, sw, sh, dwCss, dhCss, localScale, flip = false, kind = 'prop') {
    if (!img || lost || !curIsWorld || sw < 2 || sh < 2 || dwCss < 2 || dhCss < 2) return;
    const e = entry(img, false);
    if (!e || e.tiles) return;

    const sc = Math.max(0.2, localScale || curScale);
    const wWorld = (dwCss / sc) / WORLD_TO_LOGICAL;
    const hCap = kind === 'building' ? 0.58 : kind === 'char' ? 0.85 : 0.78;
    const hWorld = Math.min(kind === 'building' ? 4.8 : 6.2, ((dhCss / sc) / WORLD_TO_LOGICAL) * hCap);

    const rx = camRight[0] * wWorld * 0.5;
    const rz = camRight[2] * wWorld * 0.5;
    const tipDx = sunScaleX * hWorld;
    const tipDz = sunScaleZ * hWorld;

    // 4 world-space ground corners: 0=top-left, 1=top-right, 2=bot-left(foot), 3=bot-right(foot)
    const x2 = curAnchorX - rx, z2 = curAnchorZ - rz;
    const x3 = curAnchorX + rx, z3 = curAnchorZ + rz;
    const x0 = x2 + tipDx, z0 = z2 + tipDz;
    const x1 = x3 + tipDx, z1 = z3 + tipDz;

    const y0 = terrainHeight(x0, z0) + 0.03;
    const y1 = terrainHeight(x1, z1) + 0.03;
    const y2 = terrainHeight(x2, z2) + 0.03;
    const y3 = terrainHeight(x3, z3) + 0.03;

    let u0 = Math.max(0, sx) / e.w, v0 = Math.max(0, sy) / e.h;
    let u1 = Math.min(e.w, sx + sw) / e.w, v1 = Math.min(e.h, sy + sh) / e.h;
    if (flip) { const tmp = u0; u0 = u1; u1 = tmp; }

    const L = shadow3DList;
    if ((L.n + 1) * SHADOW_FL > L.f.length) {
      const nf = new Float32Array(L.f.length * 2);
      nf.set(L.f);
      L.f = nf;
    }
    const i = L.n * SHADOW_FL;
    L.t[L.n++] = e;
    const F = L.f;
    F[i] = x0; F[i + 1] = y0; F[i + 2] = z0;
    F[i + 3] = x1; F[i + 4] = y1; F[i + 5] = z1;
    F[i + 6] = x2; F[i + 7] = y2; F[i + 8] = z2;
    F[i + 9] = x3; F[i + 10] = y3; F[i + 11] = z3;
    F[i + 12] = u0; F[i + 13] = v0; F[i + 14] = u1; F[i + 15] = v1;
    F[i + 16] = 0; F[i + 17] = kind === 'building' ? 0.88 : 0.96;
    wantShadow = true;
  }

  function drawShadow3DBatch() {
    const L = shadow3DList;
    if (!L.n) return;
    const F = L.f, T = L.t, batches = [];
    let start = 0, units = [], used = new Map();
    for (let i = 0; i < L.n; i++) {
      const t = T[i];
      let u = used.get(t);
      if (u === undefined) {
        if (units.length === MAXU) {
          batches.push([start, i, units]);
          start = i; units = []; used = new Map();
        }
        u = units.length;
        units.push(t);
        used.set(t, u);
      }
      F[i * SHADOW_FL + 16] = u;
    }
    batches.push([start, L.n, units]);

    gl.useProgram(shadowProg);
    gl.bindVertexArray(shadowVao);
    gl.uniform3fv(gl.getUniformLocation(shadowProg, 'uCamPos'), camPos);
    gl.uniform3fv(gl.getUniformLocation(shadowProg, 'uCamRight'), camRight);
    gl.uniform3fv(gl.getUniformLocation(shadowProg, 'uCamUp'), camUp);
    gl.uniform3fv(gl.getUniformLocation(shadowProg, 'uCamBack'), camBack);
    gl.uniform2f(gl.getUniformLocation(shadowProg, 'uFullSize'), cssW, cssH);
    gl.uniform2f(gl.getUniformLocation(shadowProg, 'uPrincipal'), prinX, prinY);
    gl.uniform1f(gl.getUniformLocation(shadowProg, 'uFocalPx'), focalPx);
    gl.uniform1f(gl.getUniformLocation(shadowProg, 'uDpr'), dpr);
    gl.uniform2f(gl.getUniformLocation(shadowProg, 'uDevSize'), W, H);

    gl.activeTexture(gl.TEXTURE0 + MAXU);
    gl.bindTexture(gl.TEXTURE_2D, sceneMetaTex);

    gl.bindBuffer(gl.ARRAY_BUFFER, shadowBuf);
    gl.bufferData(gl.ARRAY_BUFFER, F.subarray(0, L.n * SHADOW_FL), gl.STREAM_DRAW);
    const shOffsets = [0, 12, 24, 36, 48, 64];
    const shSizes = [3, 3, 3, 3, 4, 2];
    for (const [s, e, us] of batches) {
      for (let k = 0; k < us.length; k++) {
        gl.activeTexture(gl.TEXTURE0 + k);
        gl.bindTexture(gl.TEXTURE_2D, us[k].tex);
      }
      const o = s * SHADOW_FL * 4;
      for (let a = 0; a < 6; a++) {
        gl.vertexAttribPointer(a, shSizes[a], gl.FLOAT, false, SHADOW_FL * 4, o + shOffsets[a]);
      }
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, e - s);
      draws++;
    }
    inst += L.n;
  }

  function drawSpriteBatch(L) {
    if (!L.n) return;
    const F = L.f, T = L.t, batches = [];
    let start = 0, units = [], used = new Map();
    for (let i = 0; i < L.n; i++) {
      const t = T[i];
      let u = used.get(t);
      if (u === undefined) {
        if (units.length === MAXU) {
          batches.push([start, i, units]);
          start = i; units = []; used = new Map();
        }
        u = units.length;
        units.push(t);
        used.set(t, u);
      }
      F[i * SPRITE_FL + 7] = u;
    }
    batches.push([start, L.n, units]);

    gl.useProgram(spriteProg);
    gl.bindVertexArray(spriteVao);
    gl.uniform2f(gl.getUniformLocation(spriteProg, 'uView'), W, H);

    // Mist tint follows camera look azimuth relative to sun
    const lookX = -camBack[0], lookZ = -camBack[2], ll = Math.hypot(lookX, lookZ) || 1;
    const sl = Math.hypot(SUN_DIR[0], SUN_DIR[2]) || 1;
    const align = ((lookX / ll) * (SUN_DIR[0] / sl) + (lookZ / ll) * (SUN_DIR[2] / sl)) * 0.5 + 0.5;
    gl.uniform3f(
      gl.getUniformLocation(spriteProg, 'uMistTint'),
      0.62 + align * 0.34,
      0.52 + align * 0.24,
      0.74 - align * 0.16
    );

    gl.activeTexture(gl.TEXTURE0 + MAXU);
    gl.bindTexture(gl.TEXTURE_2D, sceneMetaTex);

    gl.bindBuffer(gl.ARRAY_BUFFER, spriteBuf);
    gl.bufferData(gl.ARRAY_BUFFER, F.subarray(0, L.n * SPRITE_FL), gl.STREAM_DRAW);
    for (const [s, e, us] of batches) {
      for (let k = 0; k < us.length; k++) {
        gl.activeTexture(gl.TEXTURE0 + k);
        gl.bindTexture(gl.TEXTURE_2D, us[k].tex);
      }
      const o = s * SPRITE_FL * 4;
      for (let a = 0; a < 6; a++) {
        gl.vertexAttribPointer(a, 4, gl.FLOAT, false, SPRITE_FL * 4, o + a * 16);
      }
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, e - s);
      draws++;
    }
    inst += L.n;
  }

  function begin(w, h, nextElapsed = 0, highQ = true) {
    W = Math.max(1, w | 0);
    H = Math.max(1, h | 0);
    dpr = cssW > 0 ? W / cssW : 1;
    elapsed = nextElapsed;
    qualityHigh = highQ;
    if (canvas.width !== W) canvas.width = W;
    if (canvas.height !== H) canvas.height = H;
    mainList.n = 0; mainList.t.length = 0;
    shadow3DList.n = 0; shadow3DList.t.length = 0;
    frame++; draws = inst = 0;
    wantShadow = false;
    curIsWorld = 0; curMist = 0;
    if (!lost) {
      ensureSceneFbo();
      ensureShadowFbo();
      ensureCompFbo();
    }
  }

  function composite(alpha) {
    if (lost) return;
    shadowAlpha = alpha;
    const prevWorld = curIsWorld, prevMist = curMist;
    curIsWorld = 0; curMist = 0;
    putSprite(mainList, shadowFboEntry, W, 0, 0, H, 0, 0, 0, 1, 1, 0, alpha, alpha, alpha, alpha);
    curIsWorld = prevWorld; curMist = prevMist;
  }

  function present() {
    if (lost || gl.isContextLost()) return;

    // Pass 1: Raymarch 3D Terrain, Cliffs, Ocean, Sky, Clouds & Horizon Mist into low-res pixel FBO
    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFbo);
    gl.viewport(0, 0, sceneW, sceneH);
    gl.disable(gl.BLEND);
    gl.useProgram(terrainProg);
    gl.bindVertexArray(emptyVao);
    gl.uniform3fv(gl.getUniformLocation(terrainProg, 'uCamPos'), camPos);
    gl.uniform3fv(gl.getUniformLocation(terrainProg, 'uCamRight'), camRight);
    gl.uniform3fv(gl.getUniformLocation(terrainProg, 'uCamUp'), camUp);
    gl.uniform3fv(gl.getUniformLocation(terrainProg, 'uCamBack'), camBack);
    gl.uniform2f(gl.getUniformLocation(terrainProg, 'uFullSize'), cssW, cssH);
    gl.uniform2f(gl.getUniformLocation(terrainProg, 'uPrincipal'), prinX, prinY);
    gl.uniform1f(gl.getUniformLocation(terrainProg, 'uFocalPx'), focalPx);
    gl.uniform1f(gl.getUniformLocation(terrainProg, 'uTime'), elapsed);
    gl.uniform3fv(gl.getUniformLocation(terrainProg, 'uSunDir'), SUN_DIR);
    gl.uniform4fv(gl.getUniformLocation(terrainProg, 'uGroundBox'), groundBox);
    gl.uniform4fv(gl.getUniformLocation(terrainProg, 'uVillageBox'), villageBox);
    gl.uniform1f(gl.getUniformLocation(terrainProg, 'uHasGround'), hasGroundTex ? 1 : 0);
    gl.uniform1f(gl.getUniformLocation(terrainProg, 'uHasVillage'), hasVillageTex ? 1 : 0);
    gl.uniform1i(gl.getUniformLocation(terrainProg, 'uPointCount'), pointLightCount);
    if (pointLightCount > 0) {
      gl.uniform4fv(gl.getUniformLocation(terrainProg, 'uPointPos'), pointPosArr);
      gl.uniform3fv(gl.getUniformLocation(terrainProg, 'uPointCol'), pointColArr);
    }

    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, terrainTex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, detailTex);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, maxMipTex);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, cloudTex);
    gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, groundTex || white.tex);
    gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, villageTex || white.tex);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    draws++;

    // Pass 2: Render 3D World-Space Sprite Silhouettes into Shadow FBO (if any)
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    if (wantShadow && shadow3DList.n > 0) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFbo);
      gl.viewport(0, 0, W, H);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      drawShadow3DBatch();
    } else if (wantShadow) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFbo);
      gl.viewport(0, 0, W, H);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }

    // Pass 3: Blit 3D Scene into Unified Composite MRT (Color + 16-bit ViewZ) with 1px Cliff Crease Outlines
    gl.bindFramebuffer(gl.FRAMEBUFFER, compFbo);
    gl.viewport(0, 0, W, H);
    gl.disable(gl.BLEND);
    gl.useProgram(blitProg);
    gl.bindVertexArray(emptyVao);
    gl.uniform2f(gl.getUniformLocation(blitProg, 'uSceneTexel'), 1 / sceneW, 1 / sceneH);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, sceneColorTex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, sceneMetaTex);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    draws++;

    // Pass 4: Composite 3D Ground Shadows + Depth-Tested Upright 2D Pixel Billboards & VFX into compFbo
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    drawSpriteBatch(mainList);

    // Pass 5: Octopath Traveler HD-2D Post-Process (Unified 3D+2D Depth Tilt-Shift Bokeh + Golden Bloom + Sunveil + Vignette)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.disable(gl.BLEND);
    gl.useProgram(postProg);
    gl.bindVertexArray(emptyVao);
    gl.uniform2f(gl.getUniformLocation(postProg, 'uInvRes'), 1 / W, 1 / H);
    gl.uniform1f(gl.getUniformLocation(postProg, 'uFocusZ'), camDist);
    gl.uniform1f(gl.getUniformLocation(postProg, 'uDpr'), dpr);
    gl.uniform1f(gl.getUniformLocation(postProg, 'uPitch'), camPitch);
    gl.uniform1f(gl.getUniformLocation(postProg, 'uPostFx'), postFxOn && qualityHigh ? 1.0 : 0.0);
    const sunScreenX = SUN_DIR[0] * camRight[0] + SUN_DIR[2] * camRight[2];
    gl.uniform2f(gl.getUniformLocation(postProg, 'uSunCorner'), 0.5 + sunScreenX * 0.48, 0.92);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, compColorTex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, compDepthTex);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    draws++;

    for (let k = 0; k <= MAXU; k++) {
      gl.activeTexture(gl.TEXTURE0 + k);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }
    evict();
  }

  // ============================================================================
  // CANVAS2D-COMPATIBLE ADAPTER FOR UPRIGHT 2D BILLBOARDS & SHAPE PRIMITIVES
  // ============================================================================
  function ctx(name) {
    if (name === 'shadow') {
      // No-op 2D shadow ctx (shadows in HD-2D are cast in 3D world space via castShadow3D!)
      return {
        save() {}, restore() {}, setTransform() {}, resetTransform() {}, translate() {}, scale() {}, rotate() {}, transform() {},
        drawImage() {}, fillRect() {}, clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {},
        rect() {}, ellipse() {}, arc() {}, fill() {}, stroke() {}, setLineDash() {}, getLineDash() { return []; },
        canvas: { width: 1, height: 1 }, globalAlpha: 1, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, imageSmoothingEnabled: false,
      };
    }
    const L = mainList;
    let s = {
      a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, alpha: 1,
      fill: '#000000', fillC: [0, 0, 0, 1], fillP: null,
      stroke: '#000000', strokeC: [0, 0, 0, 1], lw: 1, dash: [], dashOff: 0,
      op: 'source-over', smooth: false,
    };
    const stack = [];
    let path = [], cur = null;
    const ok = (...v) => v.every(Number.isFinite);
    const X = (x, y) => s.a * x + s.c * y + s.e;
    const Y = (x, y) => s.b * x + s.d * y + s.f;

    function quad(t, dx, dy, dw, dh, u0, v0, u1, v1, cr, cg, cb, ca) {
      putSprite(L, t, s.a * dw, s.b * dw, s.c * dh, s.d * dh, s.a * dx + s.c * dy + s.e, s.b * dx + s.d * dy + s.f, u0, v0, u1, v1, cr, cg, cb, ca);
    }
    function image(img, sx, sy, sw, sh, dx, dy, dw, dh) {
      if (!ok(sx, sy, sw, sh, dx, dy, dw, dh)) return;
      if (sw < 0) { sx += sw; sw = -sw; }
      if (sh < 0) { sy += sh; sh = -sh; }
      if (dw < 0) { dx += dw; dw = -dw; }
      if (dh < 0) { dy += dh; dh = -dh; }
      if (!sw || !sh || !dw || !dh) return;
      const e = entry(img);
      if (!e) return;
      const kx = dw / sw, ky = dh / sh, al = s.alpha;
      if (al <= 0) return;
      const x0 = Math.max(sx, 0), y0 = Math.max(sy, 0), x1 = Math.min(sx + sw, e.w), y1 = Math.min(sy + sh, e.h);
      if (x1 <= x0 || y1 <= y0) return;
      if (!e.tiles) {
        quad(e, dx + (x0 - sx) * kx, dy + (y0 - sy) * ky, (x1 - x0) * kx, (y1 - y0) * ky, x0 / e.w, y0 / e.h, x1 / e.w, y1 / e.h, al, al, al, al);
        return;
      }
      for (const t of e.tiles) {
        const a0 = Math.max(x0, t.x), b0 = Math.max(y0, t.y), a1 = Math.min(x1, t.x + t.w), b1 = Math.min(y1, t.y + t.h);
        if (a1 <= a0 || b1 <= b0) continue;
        quad(t, dx + (a0 - sx) * kx, dy + (b0 - sy) * ky, (a1 - a0) * kx, (b1 - b0) * ky, (a0 - t.x) / t.w, (b0 - t.y) / t.h, (a1 - t.x) / t.w, (b1 - t.y) / t.h, al, al, al, al);
      }
    }
    const solid = c => { const a = c[3] * s.alpha; return a > 0 ? [c[0] * a, c[1] * a, c[2] * a, a] : null; };
    function tri(c, x0, y0, x1, y1, x2, y2) {
      putSprite(L, white, x1 - x0, y1 - y0, x2 - x0, y2 - y0, x0, y0, 0.5, 0.5, 0.5, 0.5, c[0], c[1], c[2], c[3], 1);
    }
    function seg(c, x0, y0, x1, y1, w) {
      const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy);
      if (!l) return;
      const nx = (-dy / l) * w * 0.5, ny = (dx / l) * w * 0.5;
      putSprite(L, white, dx, dy, 2 * nx, 2 * ny, x0 - nx, y0 - ny, 0.5, 0.5, 0.5, 0.5, c[0], c[1], c[2], c[3]);
    }
    function fillPoly(c, p) {
      let n = p.length / 2;
      if (n > 2 && p[0] === p[2 * n - 2] && p[1] === p[2 * n - 1]) n--;
      if (n < 3) return;
      for (let i = 1; i < n - 1; i++) tri(c, p[0], p[1], p[2 * i], p[2 * i + 1], p[2 * i + 2], p[2 * i + 3]);
    }
    function newSub(x, y) { cur = { p: [x, y], closed: false }; path.push(cur); }

    const g = {
      get canvas() { return { width: W, height: H }; },
      get globalAlpha() { return s.alpha; }, set globalAlpha(v) { v = +v; if (v >= 0 && v <= 1) s.alpha = v; },
      get fillStyle() { return s.fill; },
      set fillStyle(v) {
        if (typeof v === 'string') { const c = parseColorForGL(v); if (c) { s.fill = v; s.fillC = c; s.fillP = null; } }
        else if (v && typeof v === 'object') { s.fill = v; s.fillP = v; }
      },
      get strokeStyle() { return s.stroke; },
      set strokeStyle(v) { if (typeof v === 'string') { const c = parseColorForGL(v); if (c) { s.stroke = v; s.strokeC = c; } } },
      get lineWidth() { return s.lw; }, set lineWidth(v) { v = +v; if (v > 0 && Number.isFinite(v)) s.lw = v; },
      get lineDashOffset() { return s.dashOff; }, set lineDashOffset(v) { v = +v; if (Number.isFinite(v)) s.dashOff = v; },
      get globalCompositeOperation() { return s.op; }, set globalCompositeOperation(v) { s.op = String(v); },
      get imageSmoothingEnabled() { return s.smooth; }, set imageSmoothingEnabled(v) { s.smooth = !!v; },
      save() { stack.push({ ...s, dash: s.dash.slice() }); },
      restore() { if (stack.length) s = stack.pop(); },
      setTransform(a, b, c, d, e, f) {
        if (a && typeof a === 'object') ({ a, b, c, d, e, f } = a);
        else if (a === undefined) { a = d = 1; b = c = e = f = 0; }
        if (!ok(a, b, c, d, e, f)) return;
        s.a = a; s.b = b; s.c = c; s.d = d; s.e = e; s.f = f;
      },
      resetTransform() { s.a = s.d = 1; s.b = s.c = s.e = s.f = 0; },
      getTransform() { return new DOMMatrix([s.a, s.b, s.c, s.d, s.e, s.f]); },
      translate(x, y) { if (!ok(x, y)) return; s.e += s.a * x + s.c * y; s.f += s.b * x + s.d * y; },
      scale(x, y) { if (!ok(x, y)) return; s.a *= x; s.b *= x; s.c *= y; s.d *= y; },
      rotate(r) {
        if (!ok(r)) return;
        const co = Math.cos(r), si = Math.sin(r), { a, b, c, d } = s;
        s.a = a * co + c * si; s.b = b * co + d * si; s.c = c * co - a * si; s.d = d * co - b * si;
      },
      transform(A, B, C, D, E, F) {
        if (!ok(A, B, C, D, E, F)) return;
        const { a, b, c, d, e, f } = s;
        s.a = a * A + c * B; s.b = b * A + d * B; s.c = a * C + c * D; s.d = b * C + d * D;
        s.e = a * E + c * F + e; s.f = b * E + d * F + f;
      },
      drawImage(img, a1, a2, a3, a4, a5, a6, a7, a8) {
        const n = arguments.length, [iw, ih] = img ? srcSize(img) : [0, 0];
        if (n === 3) image(img, 0, 0, iw, ih, a1, a2, iw, ih);
        else if (n === 5) image(img, 0, 0, iw, ih, a1, a2, a3, a4);
        else if (n === 9) image(img, a1, a2, a3, a4, a5, a6, a7, a8);
      },
      fillRect(x, y, w, h) {
        if (!ok(x, y, w, h) || !w || !h) return;
        if (w < 0) { x += w; w = -w; }
        if (h < 0) { y += h; h = -h; }
        const c = solid(s.fillC);
        if (c) quad(white, x, y, w, h, 0.5, 0.5, 0.5, 0.5, c[0], c[1], c[2], c[3]);
      },
      clearRect() {},
      beginPath() { path = []; cur = null; },
      moveTo(x, y) { if (ok(x, y)) newSub(X(x, y), Y(x, y)); },
      lineTo(x, y) { if (!ok(x, y)) return; if (!cur) newSub(X(x, y), Y(x, y)); else cur.p.push(X(x, y), Y(x, y)); },
      closePath() { if (cur && cur.p.length) { cur.closed = true; newSub(cur.p[0], cur.p[1]); } },
      rect(x, y, w, h) {
        if (!ok(x, y, w, h)) return;
        newSub(X(x, y), Y(x, y));
        cur.p.push(X(x + w, y), Y(x + w, y), X(x + w, y + h), Y(x + w, y + h), X(x, y + h), Y(x, y + h));
        cur.closed = true; newSub(X(x, y), Y(x, y));
      },
      ellipse(x, y, rx, ry, rot, a0, a1, ccw = false) {
        if (!ok(x, y, rx, ry, rot, a0, a1) || rx < 0 || ry < 0) return;
        let sw = a1 - a0;
        if (!ccw) { if (sw >= TAU) sw = TAU; else { sw %= TAU; if (sw < 0) sw += TAU; } }
        else { if (-sw >= TAU) sw = -TAU; else { sw %= TAU; if (sw > 0) sw -= TAU; } }
        const r = Math.max(rx, ry) * Math.sqrt(Math.abs(s.a * s.d - s.b * s.c));
        const n = Math.max(4, Math.ceil((Math.abs(sw) / TAU) * Math.max(12, Math.min(72, r * 1.1))));
        const co = Math.cos(rot), si = Math.sin(rot);
        for (let i = 0; i <= n; i++) {
          const t = a0 + (sw * i) / n, ex = rx * Math.cos(t), ey = ry * Math.sin(t);
          const px = x + co * ex - si * ey, py = y + si * ex + co * ey;
          if (i === 0 && !(cur && cur.p.length)) newSub(X(px, py), Y(px, py));
          else cur.p.push(X(px, py), Y(px, py));
        }
      },
      arc(x, y, r, a0, a1, ccw = false) { g.ellipse(x, y, r, r, 0, a0, a1, ccw); },
      fill() { const c = solid(s.fillC); if (!c) return; for (const sp of path) if (sp.p.length >= 6) fillPoly(c, sp.p); },
      stroke() {
        const c = solid(s.strokeC); if (!c) return;
        const k = Math.sqrt(Math.abs(s.a * s.d - s.b * s.c)), w = s.lw * k;
        const dash = s.dash.length ? s.dash.map(v => v * k) : null;
        const dl = dash ? dash.reduce((q, v) => q + v, 0) : 0;
        for (const sp of path) {
          const p = sp.p.slice();
          if (sp.closed && p.length >= 4) p.push(p[0], p[1]);
          if (p.length < 4) continue;
          if (!dash || !(dl > 0)) {
            for (let i = 0; i + 3 < p.length; i += 2) seg(c, p[i], p[i + 1], p[i + 2], p[i + 3], w);
            continue;
          }
          let di = 0, left = dash[0], on = true, off = ((s.dashOff * k) % dl + dl) % dl;
          while (off > 0) { if (off >= left) { off -= left; di = (di + 1) % dash.length; left = dash[di]; on = !on; } else { left -= off; off = 0; } }
          for (let i = 0; i + 3 < p.length; i += 2) {
            let x0 = p[i], y0 = p[i + 1]; const x1 = p[i + 2], y1 = p[i + 3];
            let L0 = Math.hypot(x1 - x0, y1 - y0); if (!L0) continue;
            const ux = (x1 - x0) / L0, uy = (y1 - y0) / L0;
            while (L0 > 0) {
              const st = Math.min(left, L0), nx = x0 + ux * st, ny = y0 + uy * st;
              if (on) seg(c, x0, y0, nx, ny, w);
              x0 = nx; y0 = ny; L0 -= st; left -= st;
              if (left <= 1e-6) { di = (di + 1) % dash.length; left = dash[di]; on = !on; }
            }
          }
        }
      },
      setLineDash(a) { if (Array.isArray(a)) s.dash = a.length % 2 ? [...a, ...a] : a.slice(); },
      getLineDash() { return s.dash.slice(); },
      clip() {}, fillText() {}, strokeText() {}, measureText() { return { width: 0 }; },
    };
    return g;
  }

  canvas.addEventListener('webglcontextlost', e => {
    e.preventDefault(); lost = true; hasGroundTex = false; hasVillageTex = false;
    try { onLost(); } catch (err) { console.error(err); }
  });
  canvas.addEventListener('webglcontextrestored', () => {
    texMap = new WeakMap(); reg.clear(); bytes = 0;
    groundTex = villageTex = sceneColorTex = sceneMetaTex = shadowFboTex = compColorTex = compDepthTex = terrainTex = detailTex = maxMipTex = cloudTex = null;
    try { init(); lost = false; onRestored(); } catch (err) { console.error(err); }
  });

  try { init(); } catch (err) { console.error('[hd2d-webgl2]', err); return null; }

  return {
    isHD2D: true,
    gl, canvas, ctx, begin, composite, present, release, invalidate: release,
    get lost() { return lost || gl.isContextLost(); },
    // 3D World & Camera API
    terrainHeight,
    syncGroundCanvases,
    updateCameraBasis,
    stepCamera,
    project3D,
    isOccluded3D,
    screenPoint,
    unproject,
    panByScreen,
    shiftTarget,
    setTarget,
    orbitBy,
    cycleTilt,
    resetAngle,
    rotDir,
    dirFromScreen,
    screenVec,
    setEntity3D,
    setOverlay2D,
    getDepthTag,
    restoreDepthTag,
    castShadow3D,
    setPointLights,
    togglePostFx: () => { postFxOn = !postFxOn; return postFxOn; },
    isPostFxOn: () => postFxOn,
    targetXZ: () => ({ x: camX, z: camZ }),
    camForwardXZ: () => {
      const cb = Math.cos(camYaw), sb = Math.sin(camYaw);
      return { x: -cb, z: -sb, toCamX: cb, toCamZ: sb };
    },
    yaw: () => camYaw,
    pitch: () => camPitch,
    angleState: () => ({
      yawDeg: Math.round((((camYaw * 180) / Math.PI) % 360 + 360) % 360),
      pitchDeg: Math.round((camPitch * 180) / Math.PI),
      target: [+(camX.toFixed(2)), +(camZ.toFixed(2))],
      sceneRes: [sceneW, sceneH],
    }),
    stats: () => ({
      mode: 'hd2d-webgl2', lost, draws, instances: inst, shadows3D: shadow3DList.n,
      textures: reg.size, mb: +(bytes / 1048576).toFixed(1), uploads,
      sceneRes: [sceneW, sceneH], yawDeg: Math.round((camYaw * 180) / Math.PI),
      pitchDeg: Math.round((camPitch * 180) / Math.PI),
      renderer: gl.getParameter(gl.RENDERER),
    }),
    resetStats() { for (const k in uns) delete uns[k]; uploads = 0; },
  };
}
