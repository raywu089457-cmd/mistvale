// Assembles the three.js scene from the model. Merged meshes are built once; playback, explode, pour and formwork
// are GPU-driven from data textures (see materials.js); bar visibility is a sorted-index draw range.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GeomBuilder, W } from './geomBuilder.js';
import { makeMaterials, ribNormalTexture, noiseTexture, plywoodTexture, patchMaterial, depthMaterialFor } from './materials.js';
import { buildTerrain, buildScaffold, buildStores, buildCrane, buildOperator, collisionFromModel, boxW } from './context.js';
import { GROUP_NAMES, groupIndex, explodeTables, storeyOffset, memberOffset, barGroupOffset, groupOffset } from '../model/explode.js';
import { memberProgress } from '../model/schedule.js';
import { COUPLER, BAR_SIZES } from '../standards.js';

const KIND_LAYER = { COL: 'column', BEAM: 'beam', SLAB: 'slab', GB: 'gb' };
const GRADE_RGB = {};
for (const [k, v] of Object.entries(COUPLER.grades)) {
  const c = new THREE.Color(v.color);
  GRADE_RGB[k] = [c.r, c.g, c.b];
}
const REBAR_RGB = [0.45, 0.45, 0.46];

export function buildScene(model, { renderer }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d1116);

  // ---------------------------------------------------------------- environment & lights
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.035).texture;
  pmrem.dispose();
  const hemi = new THREE.HemisphereLight(0xdde7f2, 0x3a342b, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
  sun.position.set(-26, 38, 22);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 2, far: 160 });
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.02;
  sun.target.position.set(0, 2, 0);
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0x9fb8d6, 0.35);
  fill.position.set(30, 14, -30);
  scene.add(fill);

  // ---------------------------------------------------------------- textures & materials
  const textures = {
    rib: ribNormalTexture(),
    concrete: noiseTexture({ size: 512, base: [168, 166, 160], spread: 26, seed: 11, repeat: 3 }),
    concreteSmall: noiseTexture({ size: 128, base: [196, 192, 184], spread: 18, seed: 5, repeat: 1 }),
    ply: plywoodTexture(),
    yard: noiseTexture({ size: 512, base: [128, 126, 120], spread: 34, seed: 23, repeat: 14 }),
    soil: noiseTexture({ size: 512, base: [104, 88, 66], spread: 40, seed: 31, repeat: 4 }),
  };
  const M = makeMaterials(textures);
  const nM = model.members.length;
  const nG = GROUP_NAMES.length;

  // ---------------------------------------------------------------- shared GPU state
  const tMemData = new Float32Array(nM * 3 * 4);
  const tGrpData = new Float32Array(nG * nM * 4);
  const tables = explodeTables(model.members);
  for (let m = 0; m < nM; m++) {
    const s = toW(tables.memberVec.subarray(m * 6, m * 6 + 3));
    const o = toW(tables.memberVec.subarray(m * 6 + 3, m * 6 + 6));
    tMemData.set(s, (0 * nM + m) * 4);
    tMemData.set(o, (1 * nM + m) * 4);
    const base = model.members[m].box.min[2];
    tMemData[(2 * nM + m) * 4 + 2] = base;
  }
  for (let m = 0; m < nM; m++) for (let g = 0; g < nG; g++) {
    const v = toW(tables.groupVec.subarray((m * nG + g) * 3, (m * nG + g) * 3 + 3));
    tGrpData.set(v, (m * nG + g) * 4);
  }
  const tMem = new THREE.DataTexture(tMemData, nM, 3, THREE.RGBAFormat, THREE.FloatType);
  tMem.minFilter = tMem.magFilter = THREE.NearestFilter; tMem.generateMipmaps = false; tMem.needsUpdate = true;
  const tGrp = new THREE.DataTexture(tGrpData, nG, nM, THREE.RGBAFormat, THREE.FloatType);
  tGrp.minFilter = tGrp.magFilter = THREE.NearestFilter; tGrp.generateMipmaps = false; tGrp.needsUpdate = true;
  const state = {
    tMem, tGrp,
    uniforms: {
      tMem: { value: tMem }, tGrp: { value: tGrp },
      uStage: { value: new THREE.Vector3(0, 0, 0) },
      uTime: { value: 0 }, uHL: { value: 1.0 },
    },
  };
  state.uStage = state.uniforms.uStage.value;
  // patch shared materials
  patchMaterial(M.rebar, state, 'rebar', { highlight: true });
  M.rebar.side = THREE.DoubleSide;
  patchMaterial(M.couplerSteel, state, 'rebar');
  patchMaterial(M.couplerRubber, state, 'rebar');
  patchMaterial(M.spacer, state, 'rebar');
  patchMaterial(M.concrete, state, 'member-pour');
  patchMaterial(M.plywood, state, 'member-form');
  patchMaterial(M.steel, state, 'member-form');

  // unanimated copies for site context (must never receive member displacement)
  const S = {
    concrete: new THREE.MeshStandardMaterial({ name: 'siteConcrete', color: 0xa9a7a1, roughness: 0.9, map: textures.concrete }),
    plywood: new THREE.MeshStandardMaterial({ name: 'sitePly', color: 0xffffff, roughness: 0.78, map: textures.ply }),
    steel: new THREE.MeshStandardMaterial({ name: 'siteSteel', color: 0xb7bec6, roughness: 0.36, metalness: 0.86 }),
  };
  const rootRebar = new THREE.Group(); rootRebar.name = 'rebar';
  const rootMembers = new THREE.Group(); rootMembers.name = 'members';
  const rootContext = new THREE.Group(); rootContext.name = 'context';
  scene.add(rootRebar, rootMembers, rootContext);

  const meshes = [];           // all meshes with userData {layer, kind, band}
  const timed = [];            // {mesh, t0s: Float64Array, i1s: Uint32Array} for draw-range updates
  const add = (group, mesh, ud) => {
    mesh.userData = { ...ud };
    mesh.castShadow = ud.cast !== false;
    mesh.receiveShadow = true;
    group.add(mesh);
    meshes.push(mesh);
    return mesh;
  };
  const timedMesh = (builder, material, depthMode, ud, group) => {
    const geo = builder.build();
    const mesh = new THREE.Mesh(geo, material);
    mesh.customDepthMaterial = depthMaterialFor(state, depthMode);
    add(group, mesh, ud);
    const rs = builder.ranges.slice().sort((a, b) => a.t0 - b.t0 || a.i1 - b.i1);
    timed.push({ mesh, t0s: Float64Array.from(rs.map((r) => r.t0)), i1s: Uint32Array.from(rs.map((r) => r.i1)) });
    return mesh;
  };

  // ---------------------------------------------------------------- rebar (layer x band), tied in time order
  const rebarBuckets = new Map();
  const bars = model.bars.slice().sort((a, b) => a.t0 - b.t0 || a.id - b.id);
  for (const b of bars) {
    const key = `${b.layer}|${b.band}`;
    if (!rebarBuckets.has(key)) rebarBuckets.set(key, []);
    rebarBuckets.get(key).push(b);
  }
  for (const [key, list] of rebarBuckets) {
    const [layer, band] = key.split('|');
    const gb = new GeomBuilder();
    for (const b of list) {
      const path = b.path.map(W);
      const tint = REBAR_RGB;
      gb.addTube(path, b.dia / 2, { mem: b.member, grp: groupIndex(b.kind), t0: b.t0, color: tint, rs: 6, key: b.id });
    }
    const mesh = timedMesh(gb, M.rebar, 'rebar', { layer, band: +band, kind: null, cast: true }, rootRebar);
    mesh.name = `rebar-${layer}-${band}`;
  }

  // ---------------------------------------------------------------- couplers (steel sleeve + rubber end caps)
  for (let band = 0; band < 3; band++) {
    const steelB = new GeomBuilder(), rubB = new GeomBuilder();
    const list = model.couplers.filter((c) => c.band === band).sort((a, b) => a.t0 - b.t0);
    for (const c of list) {
      const L = c.size, R = c.od / 2;
      const [E, N, U] = c.pos;
      const p0 = W([E, N, U - L / 2]), p1 = W([E, N, U + L / 2]);
      steelB.addCylinder(p0, p1, R, { seg: 14, mem: c.member, grp: groupIndex('coupler'), t0: c.t0, color: GRADE_RGB[c.grade] || [0.6, 0.6, 0.6] });
      const capL = 0.012;
      rubB.addCylinder(W([E, N, U - L / 2 - capL]), W([E, N, U - L / 2]), R * 0.93, { seg: 14, mem: c.member, grp: groupIndex('coupler'), t0: c.t0, color: [0.1, 0.1, 0.1] });
      rubB.addCylinder(W([E, N, U + L / 2]), W([E, N, U + L / 2 + capL]), R * 0.93, { seg: 14, mem: c.member, grp: groupIndex('coupler'), t0: c.t0, color: [0.1, 0.1, 0.1] });
    }
    if (list.length) {
      timedMesh(steelB, M.couplerSteel, 'rebar', { layer: 'coupler', band, kind: null }, rootRebar).name = `couplers-${band}`;
      timedMesh(rubB, M.couplerRubber, 'rebar', { layer: 'coupler', band, kind: null }, rootRebar).name = `coupler-caps-${band}`;
    }
  }

  // ---------------------------------------------------------------- spacers (concrete blocks, timed)
  for (let band = 0; band < 3; band++) {
    const gb = new GeomBuilder();
    const list = model.spacers.filter((s) => s.band === band).sort((a, b) => a.t0 - b.t0);
    for (const s of list) {
      const [E, N, U] = s.centre, [sx, sy, sz] = s.size;
      const [a, b] = boxW(E - sx / 2, E + sx / 2, N - sz / 2, N + sz / 2, U - sy / 2, U + sy / 2);
      gb.addBox(a, b, { mem: s.member, grp: groupIndex('spacer'), t0: s.t0, color: [0.9, 0.88, 0.85] });
    }
    if (list.length) timedMesh(gb, M.spacer, 'rebar', { layer: 'spacer', band, kind: null }, rootRebar).name = `spacers-${band}`;
  }

  // ---------------------------------------------------------------- concrete and formwork per member kind x band
  const memberBuckets = new Map();
  for (const m of model.members) {
    const key = `${m.kind}|${m.band}`;
    if (!memberBuckets.has(key)) memberBuckets.set(key, []);
    memberBuckets.get(key).push(m);
  }
  for (const [key, list] of memberBuckets) {
    const [kind, band] = key.split('|');
    const layer = KIND_LAYER[kind];
    const conc = new GeomBuilder(), ply = new GeomBuilder(), steelB = new GeomBuilder();
    for (const m of list) {
      const { min, max } = m.box;
      const [a, b] = boxW(min[0], max[0], min[1], max[1], min[2], max[2]);
      conc.addBox(a, b, { mem: m.id, grp: 0, t0: 0, color: [0.97, 0.96, 0.94] });
      for (const f of m.formwork) {
        if (f.type === 'box') {
          const [fa, fb] = boxW(f.min[0], f.max[0], f.min[1], f.max[1], f.min[2], f.max[2]);
          ply.addBox(fa, fb, { mem: m.id, grp: 0, t0: 0, color: [1, 1, 1] });
        } else if (f.type === 'prop') {
          steelB.addCylinder(W([f.x, f.y, f.z0]), W([f.x, f.y, f.z1]), f.r, { seg: 8, mem: m.id, grp: 0, t0: 0, color: [0.8, 0.82, 0.85] });
        }
      }
    }
    const cKey = { layer: 'concrete', band: +band, kind };
    if (conc.v) {
      const mc = new THREE.Mesh(conc.build(), M.concrete);
      mc.customDepthMaterial = depthMaterialFor(state, 'member-pour');
      add(rootMembers, mc, { ...cKey, layer: 'concrete', cast: true, mode: 'pour' });
    }
    if (ply.v) {
      const mp = new THREE.Mesh(ply.build(), M.plywood);
      mp.customDepthMaterial = depthMaterialFor(state, 'member-form');
      add(rootMembers, mp, { layer: 'formwork', band: +band, kind, cast: true, mode: 'form' });
    }
    if (steelB.v) {
      const ms = new THREE.Mesh(steelB.build(), M.steel);
      ms.customDepthMaterial = depthMaterialFor(state, 'member-form');
      add(rootMembers, ms, { layer: 'formwork', band: +band, kind, cast: true, mode: 'form' });
    }
    void layer;
  }

  // ---------------------------------------------------------------- site context (static)
  const terrain = buildTerrain();
  add(rootContext, new THREE.Mesh(terrain.yard, M.ground), { layer: 'context', band: -1, kind: null, cast: false }).receiveShadow = true;
  add(rootContext, new THREE.Mesh(terrain.soil, M.soil), { layer: 'context', band: -1, kind: null, cast: false });
  const scaffSteel = new GeomBuilder(), scaffPlank = new GeomBuilder();
  buildScaffold({ steel: scaffSteel, plank: scaffPlank });
  add(rootContext, new THREE.Mesh(scaffSteel.build(), M.scaffold), { layer: 'context', band: -1, kind: null });
  add(rootContext, new THREE.Mesh(scaffPlank.build(), M.scaffoldPlank), { layer: 'context', band: -1, kind: null });
  const ply2 = new GeomBuilder(), timber = new GeomBuilder(), bundles = new GeomBuilder();
  buildStores({ ply: ply2, timber, bars: bundles });
  add(rootContext, new THREE.Mesh(ply2.build(), S.plywood), { layer: 'context', band: -1, kind: null });
  add(rootContext, new THREE.Mesh(timber.build(), M.bearer), { layer: 'context', band: -1, kind: null });
  add(rootContext, new THREE.Mesh(bundles.build(), S.steel), { layer: 'context', band: -1, kind: null });
  const craneC = new GeomBuilder(), craneS = new GeomBuilder();
  const crane = buildCrane({ concrete: craneC, steel: craneS });
  add(rootContext, new THREE.Mesh(craneC.build(), S.concrete), { layer: 'context', band: -1, kind: null });
  add(rootContext, new THREE.Mesh(craneS.build(), M.crane), { layer: 'context', band: -1, kind: null });
  const operator = buildOperator(M);
  operator.position.set(-10.8, 0, W([0, -6.4, 0])[2]);
  operator.rotation.y = Math.PI / 2;
  operator.name = 'operator';
  rootContext.add(operator);
  operator.traverse((o) => {
    if (o.isMesh) { o.userData = { layer: 'context', band: -1, kind: null, operator: true }; o.castShadow = true; o.receiveShadow = true; meshes.push(o); }
  });
  const collision = [...collisionFromModel(model), ...terrain.walkBlocks.filter((c) => c.trench), ...scaffoldBlocks(), ...stores(), crane.footprint];

  // ---------------------------------------------------------------- live state
  const api = {
    scene, state, textures, materials: M, meshes, collision, terrain, crane, operator,
    layers: null,
    bandsVisible: [true, true, true],
    cutaway: false,
    selectedMember: -1,
    _lastT: NaN,
    _lastE: NaN,
  };
  return Object.assign(api, {
    setStage(e) {
      const sA = clamp(e, 0, 1), sB = clamp(e - 1, 0, 1), sC = clamp(e - 2, 0, 1);
      state.uStage.set(sA, sB, sC);
    },
    update(t, explodeE, selectedMember = -1) {
      state.uniforms.uTime.value = t;
      if (explodeE !== api._lastE) { api.setStage(explodeE); api._lastE = explodeE; }
      // per-member progress texels
      let dirty = false;
      for (let m = 0; m < nM; m++) {
        const mem = model.members[m];
        const p = memberProgress(mem, t);
        const o = (2 * nM + m) * 4;
        const sel = m === selectedMember ? 1 : 0;
        if (tMemData[o] !== p.pour || tMemData[o + 1] !== p.form || tMemData[o + 3] !== sel) {
          tMemData[o] = p.pour; tMemData[o + 1] = p.form; tMemData[o + 3] = sel;
          dirty = true;
        }
      }
      if (dirty) tMem.needsUpdate = true;
      // timed draw ranges (prefix of the time-sorted index)
      for (const tm of timed) {
        const n = upperBound(tm.t0s, t);
        const count = n ? tm.i1s[n - 1] : 0;
        tm.mesh.geometry.setDrawRange(0, count);
      }
    },
    setLayers(L, bands) {
      api.layers = L;
      api.bandsVisible = bands;
      for (const mesh of meshes) {
        const ud = mesh.userData;
        let vis = true;
        if (ud.band >= 0 && !bands[ud.band]) vis = false;
        if (ud.layer === 'context') vis = vis && L.context;
        else if (ud.layer === 'concrete') vis = vis && L.concrete && L[KIND_LAYER[ud.kind]];
        else if (ud.layer === 'formwork') vis = vis && L.formwork && L[KIND_LAYER[ud.kind]];
        else if (ud.layer === 'coupler' || ud.layer === 'spacer' || ud.layer === 'joint') vis = vis && L[ud.layer];
        else vis = vis && L[ud.layer];
        mesh.visible = vis;
      }
    },
    setCutaway(on) {
      api.cutaway = on;
      for (const mat of [M.concrete, M.plywood, M.steel]) {
        mat.transparent = on;
        mat.opacity = on ? 0.2 : 1;
        mat.depthWrite = !on;
        mat.needsUpdate = false;
      }
      M.plywood.color.setScalar(on ? 0.9 : 1);
    },
    dispose() {
      for (const mesh of meshes) mesh.geometry.dispose();
      for (const k of Object.keys(M)) M[k].dispose();
      for (const k of Object.keys(S)) S[k].dispose();
      for (const k of Object.keys(textures)) textures[k].dispose();
      tMem.dispose(); tGrp.dispose();
      scene.clear();
    },
    stats() {
      let tris = 0, verts = 0, draws = 0;
      for (const mesh of meshes) {
        if (!mesh.visible) continue;
        draws++;
        const g = mesh.geometry;
        verts += g.attributes.position.count;
        tris += (g.drawRange.count === Infinity ? (g.index ? g.index.count : g.attributes.position.count) : g.drawRange.count) / 3;
      }
      return { meshes: meshes.length, visible: draws, verts, tris: Math.round(tris) };
    },
    sizes: { bars: model.bars.length, couplers: model.couplers.length, spacers: model.spacers.length },
  });
}

function scaffoldBlocks() {
  return [{ min: [-14.6, -9.8], max: [14.6, -8.1] }];
}
function stores() {
  return [{ min: [-19.7, -3.1], max: [-16.9, 2.4] }, { min: [-19.4, 4.9], max: [-16.3, 6.7] }];
}

function toW(v) {
  return [v[0], v[2], -v[1]];
}
function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
function upperBound(arr, x) {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] <= x) lo = mid + 1; else hi = mid;
  }
  return lo;
}

export { BAR_SIZES };
