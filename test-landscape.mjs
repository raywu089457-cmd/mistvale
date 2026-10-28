import assert from 'node:assert/strict';
import {createGame} from './src/pixel-game.js';
import {BUILDINGS,ART_LAYOUT_HISTORY} from './src/pixel-data.js';
import {getRoads,onPaved,roadGraph,doorStand,doorFoot,PALISADE,villagePonds,inPond,buildingSolid,statueSolid} from './src/landscape-layout.js';
import {walkable,inVillage,WORLD,regionContains} from './src/overworld.js';
import {VILLAGE_BOUNDS,STREET_X,STREET_Z,GRID,FENCE,EXITS,EXIT_GAP,TILE,GAP,BUILDING_SLOTS,blockCenter,blockAt} from './src/village-grid.js';

const game=createGame(),roads=getRoads(game.state.layout,game.state.buildings);
const projected=id=>{const p=game.state.layout[id];return{x:(p.x-p.z)*9,y:(p.x+p.z)*4.5};};
const plaza=(c=>({x:(c.x-c.z)*9,y:(c.x+c.z)*4.5}))(blockCenter(0,0)),hall=projected('hall');
assert.ok(Math.abs(hall.x-plaza.x)<10,'hall stays near the plaza axis');
assert.ok(hall.y<plaza.y-50,'hall stands behind the central plaza');
for(const id of ['forge','academy']){const p=projected(id);assert.ok(p.x>plaza.x&&p.y<plaza.y,`${id} occupies the upper-right quarter`);}
for(const id of ['trading','restaurant'])assert.ok(projected(id).x<plaza.x,`${id} remains on the market side`);
const tavern=projected('tavern');assert.ok(tavern.x<plaza.x&&tavern.y>plaza.y,'tavern occupies the lower-left quarter');
for(const id of ['house','bounty']){const p=projected(id);assert.ok(p.x>plaza.x&&p.y>plaza.y,`${id} occupies the lower-right quarter`);}
for(const previous of ART_LAYOUT_HISTORY){
 const snapshot=game.serialize();snapshot.layout=structuredClone(previous);
 const migrated=createGame(snapshot);
 assert.deepEqual(migrated.state.layout,game.state.layout,'known art preview layouts migrate to latest village');
 assert.deepEqual(createGame(migrated.serialize()).state.layout,game.state.layout,'migration stays stable after saving');
}
// 自訂位置:在新預設佈局上把委託所挪到村內別處,讀檔後原樣保留;落在村外的位置會被拉回村界內,地下城入口固定不動。
{const snapshot=game.serialize();snapshot.layout.bounty={x:GRID.cx+.7,z:GRID.cz+.6};
 assert.deepEqual(createGame(snapshot).state.layout,snapshot.layout,'custom village placement remains intact');
 snapshot.layout.bounty={x:2,z:20};snapshot.layout.dungeon={x:-9,z:2};const pulled=createGame(snapshot).state.layout;
 assert.ok(pulled.bounty.x<=VILLAGE_BOUNDS.maxX&&pulled.bounty.z<=VILLAGE_BOUNDS.maxZ,'a placement outside the village is pulled back inside');
 assert.deepEqual(pulled.dungeon,{x:blockCenter(1,1).x,z:blockCenter(1,1).z},'the dungeon entrance stays where it is');}
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
// 緊湊棋盤:每棟建築在街區正中,對齊成 4 欄 × 4 列;相鄰建築、最外圍建築到村界都至少隔 5 排地磚(GAP),而且沒有多留(收攏)。
{const hs=BUILDINGS.filter(b=>b.id!=='dungeon');
 assert.equal(GAP,5*TILE,'five tile rows');
 for(const b of hs){const slot=BUILDING_SLOTS[b.id],c=blockCenter(slot.i,slot.j);assert.ok(Math.abs(b.x-c.x)<1e-9&&Math.abs(b.z-c.z)<1e-9,`${b.name} is centered on its checkerboard block`);}
 assert.equal(new Set(hs.map(b=>b.x.toFixed(3))).size,GRID.cols.length,'buildings align to the grid columns');assert.equal(new Set(hs.map(b=>b.z.toFixed(3))).size,GRID.rows.length,'buildings align to the grid rows');
 const gap=(a,b)=>Math.max(Math.abs(a.x-b.x)-(a.w+b.w)/2,Math.abs(a.z-b.z)-(a.d+b.d)/2);let tightest=1e9;
 for(const a of hs)for(const b of hs)if(a.id<b.id){const g=gap(a,b);assert.ok(g>=GAP-1e-9,`${a.name} and ${b.name} are ${(g/TILE).toFixed(2)} tile rows apart (need 5)`);
  const sa=BUILDING_SLOTS[a.id],sb=BUILDING_SLOTS[b.id];if(Math.abs(sa.i-sb.i)+Math.abs(sa.j-sb.j)===1){tightest=Math.min(tightest,g);assert.ok(g<GAP+1.2,`neighbours ${a.name} / ${b.name} are gathered close (${(g/TILE).toFixed(1)} tile rows)`);}}
 // 最外圈的建築(最西欄、最東欄、最北列、最南列)離村界 5 排地磚(最大的地基剛好,小一點的最多多 0.8)。
 let outer=0;for(const a of hs){const s=BUILDING_SLOTS[a.id];
  const sides=[[GRID.cols[0],a.x-a.w/2-VILLAGE_BOUNDS.minX,s.i],[GRID.cols.at(-1),VILLAGE_BOUNDS.maxX-(a.x+a.w/2),s.i],[GRID.rows[0],a.z-a.d/2-VILLAGE_BOUNDS.minZ,s.j],[GRID.rows.at(-1),VILLAGE_BOUNDS.maxZ-(a.z+a.d/2),s.j]];
  for(const [edge,d,at] of sides)if(edge===at){outer++;assert.ok(d>=GAP-1e-9&&d<GAP+.8,`${a.name} keeps 5 tile rows from the village edge (${(d/TILE).toFixed(1)})`);}}
 assert.ok(outer>=12,`all outermost buildings were measured against the village edge (${outer})`);
 // 排版基準是最大的地基(城鎮大廳),所以最緊的那一對相鄰建築幾乎剛好 5 排地磚(差不到 0.2 排)。
 assert.ok(tightest>=GAP&&tightest-GAP<.1,`the tightest neighbouring pair is about 5 tile rows apart (${(tightest/TILE).toFixed(2)})`);
 const area=(VILLAGE_BOUNDS.maxX-VILLAGE_BOUNDS.minX)*(VILLAGE_BOUNDS.maxZ-VILLAGE_BOUNDS.minZ);assert.ok(area<900,`the village is compact (${area.toFixed(0)} square units)`);}
// 村界木柵欄:沿村界一圈,四個方向的正中央各留一個出村口(缺口寬 2×EXIT_GAP);柵欄在村界上、不壓到建築、出村口的路穿得過去。
{const inRect=(r,x,z)=>x>r.minX&&x<r.maxX&&z>r.minZ&&z<r.maxZ;
 const alongZ=x=>x.side==='east'||x.side==='west';   // 東西兩側的柵欄沿 z 走,缺口也沿 z
 assert.equal(PALISADE.length,EXITS.length+4,'a fence runs along all four sides, with one gap per side');
 for(const r of PALISADE){assert.ok(r.minX>=VILLAGE_BOUNDS.minX-.1&&r.maxX<=VILLAGE_BOUNDS.maxX+.1&&r.minZ>=VILLAGE_BOUNDS.minZ-.1&&r.maxZ<=VILLAGE_BOUNDS.maxZ+.1,`${r.id} sits on the village edge`);
  for(const b of BUILDINGS.filter(b=>b.id!=='dungeon')){const p=game.state.layout[b.id];assert.ok(!(r.minX<p.x+b.w/2&&r.maxX>p.x-b.w/2&&r.minZ<p.z+b.d/2&&r.maxZ>p.z-b.d/2),`${r.id} does not touch ${b.name}`);}}
 for(const x of EXITS){
  for(const d of [-(EXIT_GAP-.05),0,EXIT_GAP-.05]){const px=alongZ(x)?x.x:x.x+d,pz=alongZ(x)?x.z+d:x.z;assert.ok(!PALISADE.some(r=>inRect(r,px,pz)),`${x.id} gate is open at offset ${d.toFixed(2)}`);}
  for(const d of [-(EXIT_GAP+.05),EXIT_GAP+.05]){const px=alongZ(x)?x.x:x.x+d,pz=alongZ(x)?x.z+d:x.z;assert.ok(PALISADE.some(r=>inRect(r,px,pz)),`${x.id} gate is only ${(2*EXIT_GAP).toFixed(1)} wide (fence resumes at offset ${d.toFixed(2)})`);}}
 // 沿村界走一圈,除了兩個缺口,每一個點都有柵欄。
 let open=0;for(const side of ['north','south','west','east']){const alongX=side==='north'||side==='south',at=side==='north'?FENCE.minZ:side==='south'?FENCE.maxZ:side==='west'?FENCE.minX:FENCE.maxX;
  for(let t=alongX?FENCE.minX:FENCE.minZ;t<=(alongX?FENCE.maxX:FENCE.maxZ);t+=.1){const x=alongX?t:at,z=alongX?at:t;if(!PALISADE.some(r=>inRect(r,x,z)))open++;}}
 assert.ok(Math.abs(open*.1-EXITS.length*2*EXIT_GAP)<.5,`the fence is closed except the exit gaps (open length ${(open*.1).toFixed(1)})`);}
// 公園池塘:公園街區沒被占用時有池塘;建築搬進公園,池塘就沒了。池塘在街區裡,不碰鄰近的建築。
// 公園池塘:地下城入口現在就放在公園街區(2026-10-20),所以那個街區沒有池塘;
// 機制仍保留:把地下城移走(模擬沒有地下城的版面)池塘就會回來,建築搬進公園池塘就消失。
{const g=createGame(),pk=blockCenter(1,1);
 assert.equal(villagePonds(g.state.layout,g.state.buildings).length,0,'the dungeon entrance took the park block (no pond)');
 assert.deepEqual(g.state.layout.dungeon,{x:pk.x,z:pk.z},'the dungeon entrance sits on the park block');
 const moved={...g.state.layout,dungeon:{x:blockCenter(0,0).x,z:blockCenter(0,0).z}},ponds=villagePonds(moved,g.state.buildings);   // 地下城不在公園街區時,池塘回來
 assert.equal(ponds.length,1,'the free park block has a pond again when the dungeon sits elsewhere');assert.equal(blockAt(ponds[0].x,ponds[0].z).use,'park','the pond sits in the park block');
 for(const b of BUILDINGS.filter(b=>b.id!=='dungeon')){const p=g.state.layout[b.id];assert.ok(!(ponds[0].x+ponds[0].rx>p.x-b.w/2&&ponds[0].x-ponds[0].rx<p.x+b.w/2&&ponds[0].z+ponds[0].rz>p.z-b.d/2&&ponds[0].z-ponds[0].rz<p.z+b.d/2),`the pond does not touch ${b.name}`);}
 assert.equal(inPond(ponds,ponds[0].x,ponds[0].z),true);assert.equal(inPond(ponds,ponds[0].x+ponds[0].rx+.5,ponds[0].z),false);}
for(const b of BUILDINGS.filter(b=>game.state.buildings[b.id]&&b.id!=='dungeon')){
 const p=game.state.layout[b.id];{const s=doorStand(b,p),f=doorFoot(b,p);assert.ok(onPaved(s.x,s.z,roads),`${b.name} has paved ground at its entrance`);assert.ok(onPaved(f.x,f.z,roads),`${b.name} door path starts at its steps`);}
}
// 村界上是木柵欄,四個方向各一個出村口(在該側正中央);道路只到出村口,村外沒有路。
{const iso=(x,z)=>({x:(x-z)*9,y:(x+z)*4.5}),c=iso((FENCE.minX+FENCE.maxX)/2,(FENCE.minZ+FENCE.maxZ)/2);
 const at=side=>EXITS.find(e=>e.side===side);
 const n=at('north'),e=at('east'),so=at('south'),w=at('west');
 // 等角投影:北側(右上邊)在畫面右上方、東側(右下邊)在右下方、南側在左下方、西側在左上方。
 const sc=g=>iso(g.x,g.z);
 assert.ok(sc(n).x>c.x&&sc(n).y<c.y,'north gate is on the upper-right edge on screen');
 assert.ok(sc(e).x>c.x&&sc(e).y>c.y,'east gate is on the lower-right edge on screen');
 assert.ok(sc(so).x<c.x&&sc(so).y>c.y,'south gate is on the lower-left edge on screen');
 assert.ok(sc(w).x<c.x&&sc(w).y<c.y,'west gate is on the upper-left edge on screen');
 // 每個出村口都在該側柵欄的正中央(南北沿 x 取中點、東西沿 z 取中點)
 const midX=(FENCE.minX+FENCE.maxX)/2,midZ=(FENCE.minZ+FENCE.maxZ)/2;
 assert.ok(Math.abs(n.x-midX)<1e-6&&Math.abs(n.z-FENCE.minZ)<1e-6,'north gate sits in the middle of the north fence');
 assert.ok(Math.abs(so.x-midX)<1e-6&&Math.abs(so.z-FENCE.maxZ)<1e-6,'south gate sits in the middle of the south fence');
 assert.ok(Math.abs(e.z-midZ)<1e-6&&Math.abs(e.x-FENCE.maxX)<1e-6,'east gate sits in the middle of the east fence');
 assert.ok(Math.abs(w.z-midZ)<1e-6&&Math.abs(w.x-FENCE.minX)<1e-6,'west gate sits in the middle of the west fence');
 // 村內道路:兩端一定要在村內或在出村口;環村道路(kind:'ring')在圍籬外,另外驗。
 for(const r of roads.filter(r=>r.kind!=='ring'))for(const p of [r.a,r.b])assert.ok(inVillage(p.x,p.z)||EXITS.some(e=>Math.hypot(p.x-e.edge.x,p.z-e.edge.z)<.01),`road (${p.x},${p.z}) stays inside the village or ends on the village edge at an exit`);
 // 2026-10-28:環村道路 = 圍籬外一圈的封閉道路(離村界 2.1 格),四個出村口都有引道接上去。
 {const ring=roads.filter(r=>r.kind==='ring');
  assert.ok(ring.length>40,'the ring road around the village exists');
  for(const r of ring)for(const p of [r.a,r.b]){
   assert.ok(walkable(p.x,p.z),`ring road point (${p.x.toFixed(1)},${p.z.toFixed(1)}) is on walkable land`);
   const dx=Math.max(VILLAGE_BOUNDS.minX-p.x,0,p.x-VILLAGE_BOUNDS.maxX),dz=Math.max(VILLAGE_BOUNDS.minZ-p.z,0,p.z-VILLAGE_BOUNDS.maxZ);
   assert.ok(Math.hypot(dx,dz)>=0.7&&Math.hypot(dx,dz)<=6.0,`ring road stays just outside the fence (${Math.hypot(dx,dz).toFixed(2)})`);}
  // 封閉:每個端點都被兩段以上連到(環 + 引道)
  const count=new Map();for(const r of ring)for(const p of [r.a,r.b]){const k=`${p.x.toFixed(2)},${p.z.toFixed(2)}`;count.set(k,(count.get(k)||0)+1);}
  assert.ok([...count.values()].filter(v=>v>=2).length>40,'the ring road is a closed loop');
  // 四個出村口都有引道接到環上(村內 → 環 → 野外)
  for(const e of EXITS)assert.ok(ring.some(r=>Math.hypot(r.a.x-e.out.x,r.a.z-e.out.z)<.02),`${e.id} gate has a spur onto the ring road`);}
 for(const x of EXITS)assert.ok(roads.some(r=>r.cap==='butt'&&Math.hypot(r.b.x-x.edge.x,r.b.z-x.edge.z)<.01),`${x.id} exit road is cut flat on the village edge`);
 const g=roadGraph(roads.filter(r=>r.kind!=='ring')),seen=new Set([0]),stack=[0];while(stack.length){const i=stack.pop();for(const [j] of g.edges[i])if(!seen.has(j)){seen.add(j);stack.push(j);}}
 assert.equal(seen.size,g.nodes.length,'village road network is connected');}
// 整個村莊地板鋪滿石板:每棟建築的四邊都貼著鋪面。
{const paved=roads.paved||[];
 assert.equal(paved.length,1,'the whole village floor is one paved area');assert.ok(onPaved(VILLAGE_BOUNDS.minX+.1,VILLAGE_BOUNDS.minZ+.1,roads)&&onPaved(VILLAGE_BOUNDS.maxX-.1,VILLAGE_BOUNDS.maxZ-.1,roads),'the village corners are paved');
 for(const b of BUILDINGS.filter(b=>b.id!=='dungeon'&&game.state.buildings[b.id]>0)){const p=game.state.layout[b.id];
  for(const [x,z] of [[p.x-b.w/2,p.z],[p.x+b.w/2,p.z],[p.x,p.z-b.d/2],[p.x,p.z+b.d/2],[p.x-b.w/2,p.z-b.d/2],[p.x+b.w/2,p.z+b.d/2]])assert.ok(paved.some(r=>x>=r.minX&&x<=r.maxX&&z>=r.minZ&&z<=r.maxZ),`${b.name} sits on paved ground up to its walls (${x.toFixed(1)},${z.toFixed(1)})`);}
 // 沒蓋的建築也鋪(整個村莊地板都是石板)
 const empty=createGame();empty.state.buildings.forge=0;const er=getRoads(empty.state.layout,empty.state.buildings);assert.deepEqual(er.paved,roads.paved,'an unbuilt plot is paved too');}
// 村內尋路:鋪面上自由走(8 個方向),只走在鋪面、不穿建築與擺設。
// 實心佔地 = 遊戲真正拿來擋人的那一份(landscape-layout.js 的 SOLID:蓋住看得見的牆),不是 b.w/b.d。
const footprints=BUILDINGS.filter(b=>game.state.buildings[b.id]>0).map(b=>buildingSolid(b,game.state.layout[b.id]));
footprints.push(statueSolid(blockCenter(0,0)));
const ponds=villagePonds(game.state.layout,game.state.buildings);
let travel=0,pavedTravel=0,segs=0,diagonal=0,straight=0,offPaved=[];
for(let i=0;i<1800;i++){
 game.tick(.1);
 for(const h of game.state.hunters){
  assert.ok(walkable(h.x,h.z));
  if(inVillage(h.x,h.z)){travel++;
   assert.ok(!inPond(ponds,h.x,h.z),`hunter wades into the pond (${h.x.toFixed(2)},${h.z.toFixed(2)})`);
   assert.ok(!PALISADE.some(r=>h.x>r.minX&&h.x<r.maxX&&h.z>r.minZ&&h.z<r.maxZ),`hunter walks through the fence (${h.x.toFixed(2)},${h.z.toFixed(2)})`);
   for(const f of footprints)assert.ok(!(h.x>f.minX&&h.x<f.maxX&&h.z>f.minZ&&h.z<f.maxZ),`hunter walks through ${f.id}`);
   if(onPaved(h.x,h.z,roads,.1))pavedTravel++;else offPaved.push([h.status,h.x.toFixed(2),h.z.toFixed(2)]);
   // 路徑折線的每一段(長度 > 0.6,排除起訖接格的短銜接)都是 8 個方向之一
   for(let k=0;k+1<h.route.length;k++){const a=h.route[k],b=h.route[k+1];if(!inVillage(a.x,a.z)||!inVillage(b.x,b.z))continue;const len=Math.hypot(b.x-a.x,b.z-a.z);if(len<.6)continue;
    const ang=Math.atan2(b.z-a.z,b.x-a.x)/(Math.PI/4);assert.ok(Math.abs(ang-Math.round(ang))<1e-6,`village route segment is not one of the 8 directions (${(ang*45).toFixed(1)}°)`);segs++;if(Math.abs(Math.round(ang))%2)diagonal++;else straight++;}}
 }
 for(const e of game.state.enemies)assert.ok(regionContains(e.regionId,e.x,e.z),'monsters stay within their hunting region');
}
assert.ok(travel>500);assert.equal(pavedTravel,travel,`inside the village, hunters stay on paved ground (${pavedTravel}/${travel}) ${JSON.stringify(offPaved.slice(0,5))}`);
assert.ok(segs>30&&diagonal>0&&straight>0,`hunters use both straight and diagonal 8-direction segments (${segs} segments, ${diagonal} diagonal, ${straight} straight)`);
// 村內尋路的可走格就是鋪面扣掉建築地基(邊外加 0.32),鋪面上沒有看不見的障礙(街燈、花圃、門口小物都已拿掉)。
{const nav=game.villageNav(),{W,H,isOpenCell,cellCenter}=nav,ringed=(x,z)=>footprints.some(f=>x>f.minX&&x<f.maxX&&z>f.minZ&&z<f.maxZ)||PALISADE.some(r=>x>r.minX&&x<r.maxX&&z>r.minZ&&z<r.maxZ)||inPond(ponds,x,z,.35);
 let open=0,mismatch=0;
 for(let j=0;j<H;j++)for(let i=0;i<W;i++){const {x,z}=cellCenter(i,j);if(!inVillage(x,z))continue;
  let paved=true;for(let a=-.25;a<=.251&&paved;a+=.125)for(let b=-.25;b<=.251&&paved;b+=.125)if(!onPaved(x+a,z+b,roads))paved=false;
  const want=paved&&!ringed(x,z),have=isOpenCell(i,j);if(have)open++;if(want!==have)mismatch++;}
 assert.equal(mismatch,0,'village walkable cells are exactly the paved cells off the buildings, the fence and the pond');assert.ok(open>500,`village has a walkable street network (${open} cells)`);}
const moved=createGame();{const mk=blockCenter(-2,0);assert.equal(moved.moveBuilding('bounty',mk.x,mk.z).ok,true);}const updated=getRoads(moved.state.layout,moved.state.buildings);{const q=moved.state.layout.bounty,b=BUILDINGS.find(v=>v.id==='bounty');{const s=doorStand(b,q);assert.ok(onPaved(s.x,s.z,updated),'moving a facility rebuilds its entrance path');}}
// 搬家吸附到街區正中;搬到別棟建築的街區就互換;廣場不能蓋;大小可調
{const g=createGame(),hall={...g.state.layout.hall},forge={...g.state.layout.forge};assert.equal(g.moveBuilding('hall',forge.x+1,forge.z-1).ok,true);
 assert.deepEqual([g.state.layout.hall.x,g.state.layout.hall.z],[forge.x,forge.z],'move snaps to the block center');assert.deepEqual([g.state.layout.forge.x,g.state.layout.forge.z],[hall.x,hall.z],'occupied block swaps buildings');
 {const pz=blockCenter(0,0);assert.equal(g.moveBuilding('inn',pz.x,pz.z).ok,false,'plaza stays open');}
 assert.equal(g.scaleBuilding('inn',1.2).ok,true);assert.equal(g.state.layout.inn.s,1.2);assert.equal(createGame(g.serialize()).state.layout.inn.s,1.2,'size survives save');
 assert.equal(g.scaleBuilding('inn',.1).ok,true);assert.equal(g.state.layout.inn.s,.6);}
const saved=createGame(game.serialize());assert.equal(saved.state.gold,game.state.gold);assert.deepEqual(saved.state.layout,game.state.layout);
console.log(`PASS: compact checkerboard (5 tile rows between buildings and to the edge), fence with 4 gate gaps (middle of each side), pond block used by the dungeon, roads end at gates, ring road outside the fence, the whole village floor paved, all facility entrances connected, monster leash, moved-building paths; ${(pavedTravel/travel*100).toFixed(1)}% of in-village hunter samples on paved ground, ${segs} village route segments (${diagonal} diagonal / ${straight} straight) all in the 8 directions.`);
