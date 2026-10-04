import assert from 'node:assert/strict';
import {WORLD,REGIONS,walkable,biomeAt} from './src/overworld.js';
import {createGame} from './src/pixel-game.js';
assert.ok(WORLD.area>=WORLD.oldArea*3,'land area is at least 3x the previous rectangle (map only grows)');
assert.equal(WORLD.width*WORLD.height,WORLD.area);
assert.equal(new Set(REGIONS.map(r=>r.id)).size,8);
assert.equal(biomeAt(-8,-28),'forest','woodland separates village from the cold northern biomes');
assert.equal(biomeAt(8,-36),'snow','snow hunting region remains snowy');
assert.equal(biomeAt(15,-23),'taiga','taiga hunting region remains intact');
// 沒有河流/小溪/橋:世界內每一格都是實地。
for(let z=WORLD.minZ+1;z<=WORLD.maxZ-1;z+=.5)for(let x=WORLD.minX+1;x<=WORLD.maxX-1;x+=.5){assert.ok(walkable(x,z),`solid ground at ${x},${z}`);assert.ok(!['river','ice','bridge'].includes(biomeAt(x,z)),`no water/bridge biome at ${x},${z}`);}
for(const region of REGIONS.slice(1)){
 const game=createGame();assert.equal(game.exploreRegion(region.id).ok,true);assert.equal(game.state.region,region.id);
 assert.ok(game.state.visitedRegions.includes(region.id));assert.equal(game.state.enemies.filter(e=>e.regionId===region.id).length,6);
 let nearest=Infinity,reached=false,killed=false;
 // Village placement changes service travel time; require actual arrival and
 // combat within a bounded five-minute expedition instead of a fixed snapshot.
 for(let step=0;step<3000;step++){
  game.tick(.1);
  for(const h of game.state.hunters){
   assert.ok(walkable(h.x,h.z),`${region.id}: hunter never leaves the world (${h.x},${h.z})`);
   nearest=Math.min(nearest,Math.hypot(h.x-region.x,h.z-region.z));if(nearest<6)reached=true;
  }
  if(game.state.totalKills>0)killed=true;
  if(reached&&killed)break;
 }
 assert.ok(reached,`${region.name} must be reachable; nearest=${nearest}`);
 assert.ok(killed,`${region.name} has real combat`);
 const saved=game.serialize(),restored=createGame(saved);
 assert.equal(restored.state.region,region.id);assert.ok(restored.state.visitedRegions.includes(region.id));
 assert.ok(restored.state.hunters.every(h=>walkable(h.x,h.z)));
 console.log(`PASS ${region.name}: reached ${nearest.toFixed(2)} units; ${game.state.totalKills} kills; save restored`);
}
const g=createGame();assert.equal(g.exploreRegion('__proto__').ok,false);assert.equal(g.exploreRegion('missing').ok,false);assert.equal(g.setRally(-8,2).ok,false,'rally point must be outside the village');assert.equal(g.setRally(999,999).ok,false);
const old=g.serialize();delete old.worldRevision;delete old.region;delete old.visitedRegions;assert.equal(createGame(old).state.region,'meadow','old pixel saves migrate safely');
// 每個狩獵區都會自己定時補怪,強度照該區 risk。
{const g2=createGame();for(let i=0;i<300;i++)g2.tick(.2);const {ARENAS}=await import('./src/landscape-layout.js');
 for(const a of ARENAS){const list=g2.state.enemies.filter(e=>e.regionId===a.id&&e.type!=='boss');assert.ok(list.length>=2,`${a.name} keeps spawning monsters (${list.length})`);}
 const mt=g2.state.enemies.find(e=>e.regionId==='mountain'&&e.type==='golem'),me=g2.state.enemies.find(e=>e.regionId==='meadow'&&e.type==='golem');if(mt&&me)assert.ok(mt.maxHp>me.maxHp,'harder regions spawn stronger monsters');}
console.log('PASS: >=3x map, 8 regions, all-solid ground, all remote destinations, combat and old-save compatibility.');
