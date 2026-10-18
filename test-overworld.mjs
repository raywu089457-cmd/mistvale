import assert from 'node:assert/strict';
import {WORLD,REGIONS,RING_ORDER,walkable,biomeAt,regionAt,regionCenter,inVillage} from './src/overworld.js';
import {VILLAGE_BOUNDS} from './src/village-grid.js';
import {createGame} from './src/pixel-game.js';
assert.equal(WORLD.width*WORLD.height,WORLD.area);
assert.equal(new Set(REGIONS.map(r=>r.id)).size,8);
// 七個怪物地形從村莊右邊開始逆時針圍成一圈,依風險由低到高;每區面積約相等,區的中心就在自己的地形上。
const VC={x:(VILLAGE_BOUNDS.minX+VILLAGE_BOUNDS.maxX)/2,z:(VILLAGE_BOUNDS.minZ+VILLAGE_BOUNDS.maxZ)/2};
const iso=(x,z)=>({x:(x-z)*9,y:(x+z)*4.5});
const angleOf=(x,z)=>{const a=iso(x,z),b=iso(VC.x,VC.z);return (Math.atan2(-(a.y-b.y),a.x-b.x)*180/Math.PI+360)%360;};
const ring=RING_ORDER.map(id=>{const c=regionCenter(id);return {id,a:angleOf(c.x,c.z)};});
assert.equal(ring[0].id,'meadow','the ring starts with the easiest region');
assert.ok(ring[0].a<60||ring[0].a>300,`meadow sits on the right side of the village (${ring[0].a.toFixed(0)}°)`);
for(let i=1;i<=ring.length;i++){const prev=ring[i-1],cur=ring[i%ring.length],d=(cur.a-prev.a+360)%360;assert.ok(d>0&&d<180,`${cur.id} follows ${prev.id} counter-clockwise on screen`);}
const risks=RING_ORDER.map(id=>REGIONS.find(r=>r.id===id).risk);
assert.deepEqual(risks,[...risks].sort((a,b)=>a-b),'the ring runs from easy to hard');
const cnt=Object.fromEntries(RING_ORDER.map(id=>[id,0]));let wild=0;
for(let z=WORLD.minZ+1;z<=WORLD.maxZ-1;z+=.5)for(let x=WORLD.minX+1;x<=WORLD.maxX-1;x+=.5){if(inVillage(x,z))continue;cnt[biomeAt(x,z)]++;wild++;}
// 野外(世界可走範圍扣掉村莊)面積:上一版是 8046,這一版砍一半。
const OLD_WILD_AREA=8046,wildArea=wild*.25;
assert.ok(Math.abs(wildArea/OLD_WILD_AREA-.5)<.02,`wild land is half of the previous ${OLD_WILD_AREA} (${wildArea.toFixed(0)})`);
for(const id of RING_ORDER){const share=cnt[id]/wild;assert.ok(share>.1&&share<.2,`${id} covers ${(share*100).toFixed(1)}% of the wild land (rings stay balanced)`);}
for(const r of REGIONS.slice(1)){assert.equal(biomeAt(r.x,r.z),r.id,`${r.name} center is its own terrain`);assert.equal(regionAt(r.x,r.z).id,r.id,`${r.name} center belongs to its region`);}
// 沒有河流/小溪/橋:世界內每一格都是實地。
for(let z=WORLD.minZ+1;z<=WORLD.maxZ-1;z+=.5)for(let x=WORLD.minX+1;x<=WORLD.maxX-1;x+=.5){assert.ok(walkable(x,z),`solid ground at ${x},${z}`);assert.ok(!['river','ice','bridge'].includes(biomeAt(x,z)),`no water/bridge biome at ${x},${z}`);}
for(const region of REGIONS.slice(1)){
 const game=createGame();assert.equal(game.exploreRegion(region.id).ok,true);assert.equal(game.state.region,region.id);
 assert.ok(game.state.visitedRegions.includes(region.id));assert.equal(game.state.enemies.filter(e=>e.regionId===region.id).length,6);
 // 魔物生在整個地形上,不是擠在中心:6 隻之間最遠的兩隻要隔得開。
 const pts=game.state.enemies.filter(e=>e.regionId===region.id).map(e=>[e.x,e.z]);let spread=0;
 for(const a of pts)for(const b of pts)spread=Math.max(spread,Math.hypot(a[0]-b[0],a[1]-b[1]));
 assert.ok(spread>6,`${region.name} monsters are spread across the terrain (${spread.toFixed(1)})`);
 let entered=false,killed=false;
 // 派遣後先走到區的邊緣,進區後自動搜尋;只要有人進了區、打得到魔物就算數。
 for(let step=0;step<3000;step++){
  game.tick(.1);
  for(const h of game.state.hunters){assert.ok(walkable(h.x,h.z),`${region.id}: hunter never leaves the world (${h.x},${h.z})`);if(!inVillage(h.x,h.z)&&regionAt(h.x,h.z).id===region.id)entered=true;}
  if(game.state.totalKills>0)killed=true;
  if(entered&&killed)break;
 }
 assert.ok(entered,`${region.name}: hunters walk to the edge and then enter the region`);
 assert.ok(killed,`${region.name} has real combat`);
 const saved=game.serialize(),restored=createGame(saved);
 assert.equal(restored.state.region,region.id);assert.ok(restored.state.visitedRegions.includes(region.id));
 assert.ok(restored.state.hunters.every(h=>walkable(h.x,h.z)));
 console.log(`PASS ${region.name}: entered the region; ${game.state.totalKills} kills; save restored`);
}
const g=createGame();assert.equal(g.exploreRegion('__proto__').ok,false);assert.equal(g.exploreRegion('missing').ok,false);assert.equal(g.setRally(VC.x,VC.z).ok,false,'rally point must be outside the village');assert.equal(g.setRally(999,999).ok,false);
const old=g.serialize();delete old.worldRevision;delete old.region;delete old.visitedRegions;assert.equal(createGame(old).state.region,'meadow','old pixel saves migrate safely');
// 每個狩獵區都會自己定時補怪,強度照該區 risk。
// 沒人在打的區上限 3、補怪間隔 8 秒,流浪英雄會打掉其中一部分,所以不看某一刻的數量,看 60 秒內「出現過」的不同魔物:開局 2 隻 + 至少補 1 隻。
{const g2=createGame(),seen=Object.fromEntries(REGIONS.slice(1).map(r=>[r.id,new Set(g2.state.enemies.filter(e=>e.regionId===r.id).map(e=>e.id))]));
 for(let i=0;i<300;i++){g2.tick(.2);for(const e of g2.state.enemies)if(e.type!=='boss')seen[e.regionId]?.add(e.id);}
 for(const r of REGIONS.slice(1))assert.ok(seen[r.id].size>=3,`${r.name} keeps spawning monsters (${seen[r.id].size} different monsters in 60 s)`);
 const mt=g2.state.enemies.find(e=>e.regionId==='mountain'&&e.type==='golem'),me=g2.state.enemies.find(e=>e.regionId==='meadow'&&e.type==='golem');if(mt&&me)assert.ok(mt.maxHp>me.maxHp,'harder regions spawn stronger monsters');}
console.log('PASS: wild land halved, 8 regions on a counter-clockwise ring, balanced terrain, all-solid ground, region search and combat, old-save compatibility.');
