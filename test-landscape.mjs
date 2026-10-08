import assert from 'node:assert/strict';
import {createGame} from './src/pixel-game.js';
import {BUILDINGS,ART_LAYOUT_HISTORY} from './src/pixel-data.js';
import {ARENAS,SOLID_PROPS,PALISADE,getRoads,onRoad,arenaAt,arenaContains,keepTallDecoration,canopyObscures,roadGraph,distanceSegment,doorStand,doorFoot} from './src/landscape-layout.js';
import {walkable,inVillage,WORLD} from './src/overworld.js';
import {VILLAGE_BOUNDS,STREET_X,STREET_Z,GRID,FENCE,EXITS} from './src/village-grid.js';

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
 const p=game.state.layout[b.id];{const s=doorStand(b,p),f=doorFoot(b,p);assert.ok(onRoad(s.x,s.z,roads),`${b.name} has a road to its entrance`);assert.ok(onRoad(f.x,f.z,roads),`${b.name} door path starts at its steps`);}
}
// 村莊四周木柵欄只有兩個出村口:畫面右下(東)與左下(南);道路只到出村口,村外沒有路。
{const side=(x,z)=>Math.abs(x-FENCE.maxX)<.5?'east':Math.abs(z-FENCE.maxZ)<.5?'south':Math.abs(x-FENCE.minX)<.5?'west':Math.abs(z-FENCE.minZ)<.5?'north':null;
 const solid=(x,z)=>SOLID_PROPS.some(p=>x>p.minX&&x<p.maxX&&z>p.minZ&&z<p.maxZ);
 const openings={east:[],south:[],west:[],north:[]};
 for(let t=0;t<=1;t+=.002){for(const [x,z] of [[FENCE.minX+(FENCE.maxX-FENCE.minX)*t,FENCE.minZ],[FENCE.minX+(FENCE.maxX-FENCE.minX)*t,FENCE.maxZ],[FENCE.minX,FENCE.minZ+(FENCE.maxZ-FENCE.minZ)*t],[FENCE.maxX,FENCE.minZ+(FENCE.maxZ-FENCE.minZ)*t]])if(!solid(x,z))openings[side(x,z)].push([x,z]);}
 assert.equal(openings.north.length+openings.west.length,0,'north and west fences are closed');
 assert.ok(openings.east.length&&openings.south.length,'east (lower-right) and south (lower-left) fences each have a gate');
 for(const k of ['east','south']){const v=openings[k].map(([x,z])=>k==='east'?z:x);assert.ok(Math.max(...v)-Math.min(...v)<4,`${k} fence has exactly one narrow gate`);}
 const iso=(x,z)=>({x:(x-z)*9,y:(x+z)*4.5}),c=iso((FENCE.minX+FENCE.maxX)/2,(FENCE.minZ+FENCE.maxZ)/2);
 const e=iso(EXITS.find(e=>e.side==='east').x,EXITS.find(e=>e.side==='east').z),s=iso(EXITS.find(e=>e.side==='south').x,EXITS.find(e=>e.side==='south').z);
 assert.ok(e.x>c.x&&e.y>c.y,'east gate is on the lower-right of the screen');assert.ok(s.x<c.x&&s.y>c.y,'south gate is on the lower-left of the screen');
 for(const r of roads)for(const p of [r.a,r.b])assert.ok(inVillage(p.x,p.z)||EXITS.some(e=>Math.hypot(p.x-e.out.x,p.z-e.out.z)<.01),`road (${p.x},${p.z}) stays inside the village or ends at a gate`);
 const g=roadGraph(roads),seen=new Set([0]),stack=[0];while(stack.length){const i=stack.pop();for(const [j] of g.edges[i])if(!seen.has(j)){seen.add(j);stack.push(j);}}
 assert.equal(seen.size,g.nodes.length,'village road network is connected');}
for(const a of ARENAS){
 assert.equal(keepTallDecoration({x:a.x,z:a.z,type:'tree',size:.8},roads),false,'no trees in arena centers');
 // Test projected overhangs, not just trunk distance to a clearing.
 for(let x=a.x-13;x<a.x+13;x+=1.3)for(let z=a.z-13;z<a.z+13;z+=1.3){
  const d={x,z,size:.88};if(!keepTallDecoration(d,roads))continue;
  for(let i=0;i<24;i++){const t=i*Math.PI/12,px=a.x+Math.cos(t)*a.rx*.9,pz=a.z+Math.sin(t)*a.rz*.9;
   assert.ok(!canopyObscures(x,z,d.size,px,pz),`${a.name} remains visible behind foreground crowns`);
  }
 }
}
let travel=0,roadTravel=0;const offRoad=[];
for(let i=0;i<1800;i++){
 game.tick(.1);
 for(const h of game.state.hunters){
  assert.ok(walkable(h.x,h.z));
  for(const p of SOLID_PROPS)assert.ok(!(h.x>p.minX&&h.x<p.maxX&&h.z>p.minZ&&h.z<p.maxZ),`hunter crosses solid ${p.id}`);
  if(inVillage(h.x,h.z)){travel++;if(roads.some(r=>distanceSegment(h.x,h.z,r.a,r.b)<=.05))roadTravel++;else offRoad.push([h.status,h.x.toFixed(2),h.z.toFixed(2)]);}
 }
 for(const e of game.state.enemies)assert.ok(arenaContains(e.regionId,e.x,e.z,.25),'monsters stay within cleared combat spaces');
}
assert.ok(travel>500);assert.equal(roadTravel,travel,`inside the village, hunters walk only on the road centerlines (${roadTravel}/${travel}) ${JSON.stringify(offRoad.slice(0,5))}`);
const moved=createGame();assert.equal(moved.moveBuilding('bounty',5,17).ok,true);const updated=getRoads(moved.state.layout,moved.state.buildings);{const q=moved.state.layout.bounty,b=BUILDINGS.find(v=>v.id==='bounty');{const s=doorStand(b,q);assert.ok(onRoad(s.x,s.z,updated),'moving a facility rebuilds its entrance path');}}
// 搬家吸附到街區正中;搬到別棟建築的街區就互換;廣場不能蓋;大小可調
{const g=createGame(),hall={...g.state.layout.hall},forge={...g.state.layout.forge};assert.equal(g.moveBuilding('hall',forge.x+1,forge.z-1).ok,true);
 assert.deepEqual([g.state.layout.hall.x,g.state.layout.hall.z],[forge.x,forge.z],'move snaps to the block center');assert.deepEqual([g.state.layout.forge.x,g.state.layout.forge.z],[hall.x,hall.z],'occupied block swaps buildings');
 assert.equal(g.moveBuilding('inn',-8,2).ok,false,'plaza stays open');
 assert.equal(g.scaleBuilding('inn',1.2).ok,true);assert.equal(g.state.layout.inn.s,1.2);assert.equal(createGame(g.serialize()).state.layout.inn.s,1.2,'size survives save');
 assert.equal(g.scaleBuilding('inn',.1).ok,true);assert.equal(g.state.layout.inn.s,.6);}
const saved=createGame(game.serialize());assert.equal(saved.state.gold,game.state.gold);assert.deepEqual(saved.state.layout,game.state.layout);
console.log(`PASS: fence with 2 gates (lower-right/lower-left), roads end at gates, all facility entrances connected, projected canopy clearance, fountain/well/fence collision, monster leash, moved-building paths; ${(roadTravel/travel*100).toFixed(1)}% of in-village hunter samples on road centerlines.`);
