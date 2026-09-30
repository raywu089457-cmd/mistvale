import assert from 'node:assert/strict';
import {WORLD,REGIONS,BRIDGES,riverX,walkable,biomeAt} from './src/overworld.js';
import {createGame} from './src/pixel-game.js';
assert.equal(WORLD.area,WORLD.oldArea*3,'land area is exactly 3x the previous rectangle');
assert.equal(WORLD.width*WORLD.height,WORLD.area);
assert.equal(new Set(REGIONS.map(r=>r.id)).size,8);
for(const z of BRIDGES)assert.ok(walkable(riverX(z),z),'bridges cross the river');
assert.ok(!walkable(riverX(13),13),'river is not a walkable shortcut');
for(const region of REGIONS.slice(1)){
 const game=createGame();assert.equal(game.exploreRegion(region.id).ok,true);assert.equal(game.state.region,region.id);
 assert.ok(game.state.visitedRegions.includes(region.id));assert.equal(game.state.enemies.length,6);
 let nearest=Infinity,reached=false,killed=false;
 for(let step=0;step<1500;step++){
  game.tick(.1);
  for(const h of game.state.hunters){
   assert.ok(walkable(h.x,h.z),`${region.id}: hunter never crosses unbridged water or world edge (${h.x},${h.z})`);
   nearest=Math.min(nearest,Math.hypot(h.x-region.x,h.z-region.z));if(nearest<6)reached=true;
  }
  if(game.state.totalKills>0)killed=true;
 }
 assert.ok(reached,`${region.name} must be reachable; nearest=${nearest}`);
 assert.ok(killed,`${region.name} has real combat`);
 const saved=game.serialize(),restored=createGame(saved);
 assert.equal(restored.state.region,region.id);assert.ok(restored.state.visitedRegions.includes(region.id));
 assert.ok(restored.state.hunters.every(h=>walkable(h.x,h.z)));
 console.log(`PASS ${region.name}: reached ${nearest.toFixed(2)} units; ${game.state.totalKills} kills; save restored`);
}
const g=createGame();assert.equal(g.exploreRegion('__proto__').ok,false);assert.equal(g.exploreRegion('missing').ok,false);assert.equal(g.setRally(riverX(13),13).ok,false);assert.equal(g.setRally(999,999).ok,false);
const old=g.serialize();delete old.worldRevision;delete old.region;delete old.visitedRegions;assert.equal(createGame(old).state.region,'meadow','old pixel saves migrate safely');
console.log('PASS: exact 3x map, 8 regions, walkable bridges, all remote destinations, combat and old-save compatibility.');
