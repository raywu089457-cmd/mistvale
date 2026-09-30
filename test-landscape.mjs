import assert from 'node:assert/strict';
import {createGame} from './src/pixel-game.js';
import {BUILDINGS} from './src/pixel-data.js';
import {ARENAS,SOLID_PROPS,getRoads,onRoad,arenaAt,arenaContains,keepTallDecoration,canopyObscures} from './src/landscape-layout.js';
import {walkable,WORLD} from './src/overworld.js';

const game=createGame(),roads=getRoads(game.state.layout,game.state.buildings);
for(const b of BUILDINGS.filter(b=>game.state.buildings[b.id]&&b.id!=='dungeon')){
 const p=game.state.layout[b.id];assert.ok(onRoad(p.x,p.z+b.d/2+.6,roads),`${b.name} has a road to its entrance`);
}
for(const a of ARENAS){
 assert.ok(onRoad(a.x,a.z,roads,.8),`${a.name} is connected to the travel network`);
 assert.equal(keepTallDecoration({x:a.x,z:a.z,type:'tree',size:.8},roads),false,'no trees in arena centers');
 // Test projected overhangs, not just trunk distance to a clearing.
 for(let x=a.x-13;x<a.x+13;x+=1.3)for(let z=a.z-13;z<a.z+13;z+=1.3){
  const d={x,z,size:.88};if(!keepTallDecoration(d,roads))continue;
  for(let i=0;i<24;i++){const t=i*Math.PI/12,px=a.x+Math.cos(t)*a.rx*.9,pz=a.z+Math.sin(t)*a.rz*.9;
   assert.ok(!canopyObscures(x,z,d.size,px,pz),`${a.name} remains visible behind foreground crowns`);
  }
 }
}
let travel=0,roadTravel=0;
for(let i=0;i<1800;i++){
 game.tick(.1);
 for(const h of game.state.hunters){
  assert.ok(walkable(h.x,h.z));
  for(const p of SOLID_PROPS)assert.ok(!(h.x>p.minX&&h.x<p.maxX&&h.z>p.minZ&&h.z<p.maxZ),`hunter crosses solid ${p.id}`);
  if(['出征中','返村中'].includes(h.status)&&!arenaAt(h.x,h.z,1.2)){travel++;if(onRoad(h.x,h.z,roads,.6))roadTravel++;}
 }
 for(const e of game.state.enemies)assert.ok(arenaContains(e.regionId,e.x,e.z,.25),'monsters stay within cleared combat spaces');
}
assert.ok(travel>500);assert.ok(roadTravel/travel>.9,`outside combat, hunters should use streets (${roadTravel}/${travel})`);
const moved=createGame();assert.equal(moved.moveBuilding('bounty',5,17).ok,true);const updated=getRoads(moved.state.layout,moved.state.buildings);assert.ok(onRoad(5,19.1,updated),'moving a facility rebuilds its entrance path');
const saved=createGame(game.serialize());assert.equal(saved.state.gold,game.state.gold);assert.deepEqual(saved.state.layout,game.state.layout);
console.log(`PASS: all facility entrances and 7 arenas connected, projected canopy clearance, fountain/well/fence collision, monster leash, moved-building paths; ${(roadTravel/travel*100).toFixed(1)}% of sampled noncombat travel on roads.`);
