import assert from 'node:assert/strict';
import {createGame} from './src/pixel-game.js';
import {BUILDINGS,ART_LAYOUT_HISTORY} from './src/pixel-data.js';
import {ARENAS,SOLID_PROPS,getRoads,onRoad,arenaAt,arenaContains,keepTallDecoration,canopyObscures} from './src/landscape-layout.js';
import {walkable,WORLD} from './src/overworld.js';

const game=createGame(),roads=getRoads(game.state.layout,game.state.buildings);
const projected=id=>{const p=game.state.layout[id];return{x:(p.x-p.z)*9,y:(p.x+p.z)*4.5};};
const plaza={x:-90,y:-27},hall=projected('hall');
assert.ok(Math.abs(hall.x-plaza.x)<1,'hall stays on the monument axis');
assert.ok(hall.y<plaza.y-50,'hall stands behind the central monument');
for(const id of ['forge','academy']){const p=projected(id);assert.ok(p.x>plaza.x&&p.y<plaza.y,`${id} occupies the upper-right quarter`);}
for(const id of ['trading','restaurant'])assert.ok(projected(id).x<plaza.x,`${id} remains on the market side`);
const tavern=projected('tavern');assert.ok(tavern.x<plaza.x&&tavern.y>plaza.y,'tavern occupies the lower-left quarter');
for(const id of ['house','bounty']){const p=projected(id);assert.ok(p.x>plaza.x&&p.y>plaza.y,`${id} occupies the lower-right quarter`);}
for(const previous of ART_LAYOUT_HISTORY){
 const snapshot=game.serialize();snapshot.layout=structuredClone(previous);
 const migrated=createGame(snapshot);
 assert.deepEqual(migrated.state.layout,game.state.layout,'known art preview layouts migrate to latest village');
 assert.deepEqual(createGame(migrated.serialize()).state.layout,game.state.layout,'migration stays stable after saving');
 snapshot.layout.bounty={x:2,z:20};
 assert.deepEqual(createGame(snapshot).state.layout,snapshot.layout,'custom village placement remains intact');
}
for(let i=0;i<BUILDINGS.length;i++){
 const a=BUILDINGS[i];
 assert.ok(walkable(a.x,a.z),`${a.name} default placement is on land`);
 if(a.id!=='dungeon')assert.ok(a.x-a.w/2>=-28&&a.x+a.w/2<=8&&a.z-a.d/2>=-23&&a.z+a.d/2<=25,`${a.name} remains inside village placement bounds`);
 for(let j=i+1;j<BUILDINGS.length;j++){
  const b=BUILDINGS[j];
  assert.ok(Math.abs(a.x-b.x)>=(a.w+b.w)/2+1.05||Math.abs(a.z-b.z)>=(a.d+b.d)/2+1.05,`${a.name} and ${b.name} retain an entrance corridor`);
 }
}
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
