import assert from 'node:assert/strict';
import {createGame} from './src/pixel-game.js';
import {BUILDINGS,ART_LAYOUT_HISTORY} from './src/pixel-data.js';
import {ARENAS,SOLID_PROPS,getRoads,onRoad,arenaAt,arenaContains,keepTallDecoration,canopyObscures} from './src/landscape-layout.js';
import {walkable,WORLD} from './src/overworld.js';
import {VILLAGE_BOUNDS,STREET_X,STREET_Z,GRID} from './src/village-grid.js';

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
 if(a.id!=='dungeon')assert.ok(a.x-a.w/2>=VILLAGE_BOUNDS.minX&&a.x+a.w/2<=VILLAGE_BOUNDS.maxX&&a.z-a.d/2>=VILLAGE_BOUNDS.minZ&&a.z+a.d/2<=VILLAGE_BOUNDS.maxZ,`${a.name} remains inside village placement bounds`);
 // 棋盤格:每棟建築四邊都有石板街(左右兩條南北向、前後兩條東西向),而且建築不壓到街。
 if(a.id!=='dungeon'){const W=STREET_X.filter(x=>x<a.x-a.w/2),E=STREET_X.filter(x=>x>a.x+a.w/2),N=STREET_Z.filter(z=>z<a.z-a.d/2),S=STREET_Z.filter(z=>z>a.z+a.d/2);
  for(const [side,list] of [['west',W],['east',E],['north',N],['south',S]])assert.ok(list.length,`${a.name} has a street on its ${side} side`);
  const ring=[[Math.max(...W),a.z],[Math.min(...E),a.z],[a.x,Math.max(...N)],[a.x,Math.min(...S)]];
  for(const [x,z] of ring)assert.ok(roads.some(r=>r.kind==='stone'&&Math.hypot(...(()=>{const dx=r.b.x-r.a.x,dz=r.b.z-r.a.z,t=Math.max(0,Math.min(1,((x-r.a.x)*dx+(z-r.a.z)*dz)/(dx*dx+dz*dz||1)));return[x-r.a.x-t*dx,z-r.a.z-t*dz];})())<.2),`${a.name} is enclosed by stone streets (${x},${z})`);
  assert.ok(Math.max(...W)+GRID.street<a.x-a.w/2&&Math.min(...E)-GRID.street>a.x+a.w/2&&Math.max(...N)+GRID.street<a.z-a.d/2&&Math.min(...S)-GRID.street>a.z+a.d/2,`${a.name} does not sit on a street`);}
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
