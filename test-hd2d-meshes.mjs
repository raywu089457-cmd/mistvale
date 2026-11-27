// 真 3D 建築/地圖物件的幾何檢查(hd2d-meshes.js 是純 JS,不用瀏覽器)
import assert from 'node:assert/strict';
import { buildModel, bakeStatic, MESH_DECOR, BUILDING_KINDS, MeshBuilder, MAT_GLOW } from './src/hd2d-meshes.js';
import { BUILDINGS } from './src/pixel-data.js';

// 每一棟建築都要有自己的 3D 模型(空地用 plot)
for (const b of BUILDINGS) assert.ok(BUILDING_KINDS.has(b.id), `building ${b.id} has a 3D model`);
assert.ok(BUILDING_KINDS.has('plot'), 'level-0 plot model');

let verts = 0;
function checkModel(kind, m, { maxVerts, box }) {
  assert.ok(m && m.count > 0 && m.count % 3 === 0, `${kind}: has triangles`);
  assert.ok(m.count <= maxVerts, `${kind}: ${m.count} verts <= ${maxVerts}`);
  for (let i = 0; i < m.pos.length; i++) assert.ok(Number.isFinite(m.pos[i]), `${kind}: finite position`);
  for (let i = 0; i < m.count; i++) {
    const n = Math.hypot(m.nrm[i * 4], m.nrm[i * 4 + 1], m.nrm[i * 4 + 2]) / 127;
    assert.ok(n > 0.9 && n < 1.1, `${kind}: unit normal (${n.toFixed(2)})`);
  }
  // 法向量要朝外:每個三角形的繞序(由外看逆時針)要跟記錄的法向量同方向,否則背面剔除/gl_FrontFacing 會翻錯
  for (let t = 0; t < m.count; t += 3) {
    const p = k => [m.pos[(t + k) * 3], m.pos[(t + k) * 3 + 1], m.pos[(t + k) * 3 + 2]];
    const [a, b, c] = [p(0), p(1), p(2)];
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const d = cr[0] * m.nrm[t * 4] + cr[1] * m.nrm[t * 4 + 1] + cr[2] * m.nrm[t * 4 + 2];
    assert.ok(d >= -1e-6, `${kind}: triangle ${t / 3} winding matches its normal`);
  }
  if (box) {
    assert.ok(m.min[0] >= box[0] && m.max[0] <= box[1], `${kind}: x in [${box[0]},${box[1]}] (${m.min[0].toFixed(2)}..${m.max[0].toFixed(2)})`);
    assert.ok(m.min[2] >= box[2] && m.max[2] <= box[3], `${kind}: z in [${box[2]},${box[3]}] (${m.min[2].toFixed(2)}..${m.max[2].toFixed(2)})`);
    assert.ok(m.min[1] >= -0.5 && m.max[1] <= box[4], `${kind}: y in [-0.5,${box[4]}] (${m.min[1].toFixed(2)}..${m.max[1].toFixed(2)})`);
  }
  assert.ok(m.hull.length >= 24 && m.hull.length / 3 <= 480, `${kind}: outline sample points`);
  verts += m.count;
}
// 建築:落在 landscape-layout 的實心佔地(±2.3 × ±1.9)外加屋簷與門前小物;高度不超過鐘塔
for (const k of BUILDING_KINDS) {
  const m = buildModel(k);
  checkModel(k, m, { maxVerts: 16000, box: [-3.3, 3.0, -2.4, 3.3, 10.2] });
  // 門朝 +z:門前站位(landscape-layout doorFoot = z + d/2 + .55)附近、人物身高範圍內不能有模型(獵人要站在那裡)
  const d = BUILDINGS.find(b => b.id === k)?.d;
  if (d) for (let i = 0; i < m.count; i++) {
    const x = m.pos[i * 3], y = m.pos[i * 3 + 1], z = m.pos[i * 3 + 2], zf = d / 2 + 0.55;
    if (y > 0.4 && y < 2.0 && Math.abs(x) < 0.3 && Math.abs(z - zf) < 0.2) assert.fail(`${k}: blocks the door-front stand point (${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)})`);
  }
}
// 有煙囪的鐵匠鋪要給煙霧的錨點,而且在屋頂之上
const forge = buildModel('forge');
assert.ok(Array.isArray(forge.anchors.chimney) && forge.anchors.chimney[1] > 5, 'forge chimney anchor above the roof');
// 有窗戶燈光(自發光材質)
const inn = buildModel('inn');
let glow = 0;
for (let i = 0; i < inn.count; i++) if ((inn.col[i * 4 + 3] >> 5) === MAT_GLOW) glow++;
assert.ok(glow > 0, 'inn has glowing windows');

// 地圖物件
for (const t of MESH_DECOR) checkModel(t, buildModel(t, 1, 1), { maxVerts: 6000 });
for (const t of ['flowers', 'flowerBush', 'bush', 'ferns', 'signpost', 'npc']) assert.ok(!MESH_DECOR.has(t), `${t} stays a 2D billboard`);

// 合併成世界座標靜態網格:位移、旋轉、縮放正確
const baked = bakeStatic([{ kind: 'fenceRail', x: 10, y: 2, z: -5, yaw: Math.PI / 2, scale: 1, size: 1 }, { kind: 'oak', x: -3, y: 0, z: 4, yaw: 0.3, scale: 0.86, variant: 2 }]);
const fence = buildModel('fenceRail', 0, 1);
assert.equal(baked.count, fence.count + buildModel('oak', 2, 1).count);
assert.ok(Math.abs((baked.max[2] - baked.min[2]) - 0) > 0, 'baked bounds');
{ // 柵欄轉 90°:原本沿 x 的長邊變成沿 z
  let z0 = Infinity, z1 = -Infinity, x0 = Infinity, x1 = -Infinity;
  for (let i = 0; i < fence.count; i++) { const x = baked.pos[i * 3], z = baked.pos[i * 3 + 2]; z0 = Math.min(z0, z); z1 = Math.max(z1, z); x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
  assert.ok(z1 - z0 > 1.8 && x1 - x0 < 0.4, `rotated fence spans z (${(z1 - z0).toFixed(2)} x ${(x1 - x0).toFixed(2)})`);
  assert.ok(Math.abs((x0 + x1) / 2 - 10) < 0.05 && Math.abs((z0 + z1) / 2 + 5) < 0.05, 'fence translated to its spot');
}
// 建構器:poly 依 inside 點自動朝外
{ const m = new MeshBuilder(); m.box(-1, 0, -1, 1, 2, 1, '#808080', { bottom: true }); const r = m.finish(); assert.equal(r.count, 36); }

console.log(`PASS: 3D meshes — ${BUILDING_KINDS.size} building models (all ${BUILDINGS.length} buildings + plot), ${MESH_DECOR.size} map-object models, outward winding, door-front stand points clear, forge chimney anchor; ${verts} verts total.`);
