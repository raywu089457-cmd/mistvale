import {BUILDINGS} from './pixel-data.js';
import {walkable} from './overworld.js';
import {STREET_X,STREET_Z,EXITS,EXIT_GAP,FENCE,GRID,VILLAGE_BOUNDS,BLOCKS,blockAt} from './village-grid.js';
export function distanceSegment(x,z,a,b){const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1)));return Math.hypot(x-a.x-t*dx,z-a.z-t*dz);}
// 各建築圖上「門腳/台階前」相對地基中心的位置(世界單位)。量法:建築圖上台階腳下那一點,換算成地面座標(含立面校正)。
// 跟建築圖綁在一起;圖或街區大小改了要重量。
// 2026-10-20:門口一律是「建築正面(+z 面)的正中央、台階外緣」—— 畫面上的門就畫在那裡,
// 所以獵人走到這裡看起來才是「站在門口」。以前每棟手調的偏移常常偏到建築側面(甚至隔壁棟前面),
// 實測後改成同一個規則;要微調就動這裡的 +.55(往門前多遠)。
export function doorFoot(b,p){return {x:p.x,z:p.z+(b.d||3.6)/2+.55};}
// ── 整個村莊地板鋪滿石板路:能走的鋪面 = 村界內整片(沒有草地與田地了)。畫面(buildVillageLayer)與村內尋路(village-nav)共用這一份。
export function pavedRings(){return [{minX:VILLAGE_BOUNDS.minX,maxX:VILLAGE_BOUNDS.maxX,minZ:VILLAGE_BOUNDS.minZ,maxZ:VILLAGE_BOUNDS.maxZ}];}
// 獵人站的門前位置:門腳,但台階若落在碰撞地基裡,就停在地基外緣(仍在鋪面上)。
export function doorStand(b,p){const f=doorFoot(b,p);return {x:f.x,z:Math.max(f.z,p.z+b.d/2+.4)};}
// ── 村界木柵欄:沿 FENCE 一圈,東、南各留一個出村口(缺口寬 2×EXIT_GAP)。每段是一個長方形(實心:村內導航與碰撞用,畫面用同一份擺柵欄)。
const FENCE_T=.3,palisade=[];{
 const side=(id,axis,at,lo,hi)=>{const gaps=EXITS.filter(e=>e.side===id).map(e=>axis==='x'?e.z:e.x).sort((a,b)=>a-b);let a=lo;
  for(const g of [...gaps,Infinity]){const b=Math.min(g-EXIT_GAP,hi);if(b>a)palisade.push(axis==='x'?{id:`palisade-${id}-${palisade.length}`,side:id,minX:at-FENCE_T,maxX:at+FENCE_T,minZ:a,maxZ:b}:{id:`palisade-${id}-${palisade.length}`,side:id,minX:a,maxX:b,minZ:at-FENCE_T,maxZ:at+FENCE_T});a=g+EXIT_GAP;}};
 side('north','z',FENCE.minZ,FENCE.minX-FENCE_T,FENCE.maxX+FENCE_T);side('south','z',FENCE.maxZ,FENCE.minX-FENCE_T,FENCE.maxX+FENCE_T);
 side('west','x',FENCE.minX,FENCE.minZ-FENCE_T,FENCE.maxZ+FENCE_T);side('east','x',FENCE.maxX,FENCE.minZ-FENCE_T,FENCE.maxZ+FENCE_T);}
export const PALISADE=palisade;
// ── 實心佔地(建築、雕像) ────────────────────────────────────────────────
// 畫面:所有建築都畫成同一個寬度(7.33 個世界單位,見 pixel-world.js 的 uniformBuildingWidth),
// 佔地(b.w/b.d)只有 3.5–4.4,所以以前角色會走進「看得見的牆」裡。
// 這裡用固定的一圈實心佔地蓋住牆面、只讓屋簷探出去;街道仍然留得下(街區間距 6.9×6.1,
// 實心 6.0×4.6 → 兩側各留 0.45/0.75 的走道)。導航、碰撞、畫面共用這一份。
// 建築碰撞(實心)範圍:對齊「畫面上的地基邊緣」,不是屋簷/整張圖。
// 建築統一畫成 7.33 單位寬(含屋簷外伸),地基約是它的 0.63 倍寬、0.52 倍深 → 4.6 × 3.8（不可小於建築自己的佔地 4.0 × 3.5）。
export const SOLID={x:2.3,z:1.9},STATUE={x:.95,z:.7};
export function buildingSolid(b,p){return {id:b.id,minX:p.x-SOLID.x,maxX:p.x+SOLID.x,minZ:p.z-SOLID.z,maxZ:p.z+SOLID.z};}
export function statueSolid(plaza){return {id:'statue',minX:plaza.x-STATUE.x,maxX:plaza.x+STATUE.x,minZ:plaza.z-STATUE.z,maxZ:plaza.z+STATUE.z};}
// ── 公園池塘:公園街區沒被建築佔用時,有一個池塘。畫面在地面層挖洞畫水,村內尋路把池塘當障礙(整個村莊都是鋪面,池塘不能踩)。
export function villagePonds(layout={},levels={}){
 const taken=blk=>BUILDINGS.some(b=>(b.id==='dungeon'||levels[b.id]!==0)&&blockAt((layout[b.id]||b).x,(layout[b.id]||b).z)===blk);   // 地下城入口固定佔用公園街區(還沒蓋時也是工地)→ 那個街區不會有池塘
 return BLOCKS.filter(blk=>blk.use==='park'&&!taken(blk)).map(blk=>({x:blk.x,z:blk.z+.4,rx:2.5,rz:1.9}));}
// 點(x,z)是否在池塘裡(pad = 往外多留的邊,池塘邊緣有一點起伏)。
export const inPond=(ponds,x,z,pad=0)=>ponds.some(p=>((x-p.x)/(p.rx+pad))**2+((z-p.z)/(p.rz+pad))**2<1);
export function getRoads(layout={},levels={}){
 const roads=[];const add=(points,width=1.15,kind='trail')=>{for(let i=1;i<points.length;i++){const a={x:points[i-1][0],z:points[i-1][1]},b={x:points[i][0],z:points[i][1]};roads.push({a,b,width,kind});}};
 // 棋盤格村莊:每條街區邊(建築之間通道的正中)都是石板街(src/village-grid.js)。整個村莊地板都鋪了石板,街道只是讓道路圖連通。
 const X0=STREET_X[0],X1=STREET_X.at(-1),Z0=STREET_Z[0],Z1=STREET_Z.at(-1);
 for(const x of STREET_X)add([[x,Z0],[x,Z1]],GRID.street,'stone');
 for(const z of STREET_Z)add([[X0,z],[X1,z]],GRID.street,'stone');
 // 出村:兩條街穿過出村口,路鋪到村界為止(切平、不圓頭);村外沒有路,自由走。
 for(const e of EXITS)roads.push({a:{x:e.street.x,z:e.street.z},b:{x:e.edge.x,z:e.edge.z},width:GRID.street,kind:'stone',cap:'butt'});
 const result=fitRoads(roads,layout,levels);result.paved=pavedRings(layout,levels);return result;
}
// 道路圖:把所有路段在交叉點/端點切開,變成「節點 + 邊」。村裡的獵人只沿這張圖走(不穿街區)。
export function roadGraph(roads){
 const segs=roads.map(r=>({a:r.a,b:r.b,ts:[0,1]}));
 const cross=(p,q,r,s2)=>{const d1x=q.x-p.x,d1z=q.z-p.z,d2x=s2.x-r.x,d2z=s2.z-r.z,den=d1x*d2z-d1z*d2x;if(Math.abs(den)<1e-9)return null;
  const t=((r.x-p.x)*d2z-(r.z-p.z)*d2x)/den,u=((r.x-p.x)*d1z-(r.z-p.z)*d1x)/den;return t>-1e-6&&t<1+1e-6&&u>-1e-6&&u<1+1e-6?[t,u]:null;};
 const onSeg=(p,s)=>{const dx=s.b.x-s.a.x,dz=s.b.z-s.a.z,l=dx*dx+dz*dz;if(!l)return null;const t=((p.x-s.a.x)*dx+(p.z-s.a.z)*dz)/l;return t>1e-6&&t<1-1e-6&&distanceSegment(p.x,p.z,s.a,s.b)<.02?t:null;};
 for(let i=0;i<segs.length;i++)for(let j=i+1;j<segs.length;j++){const A=segs[i],B=segs[j],c=cross(A.a,A.b,B.a,B.b);if(c){A.ts.push(c[0]);B.ts.push(c[1]);}
  for(const p of [B.a,B.b]){const t=onSeg(p,A);if(t!=null)A.ts.push(t);}for(const p of [A.a,A.b]){const t=onSeg(p,B);if(t!=null)B.ts.push(t);}}
 const nodes=[],index=new Map(),edges=[],key=p=>`${Math.round(p.x*50)},${Math.round(p.z*50)}`;
 const node=p=>{const k=key(p);let i=index.get(k);if(i==null){i=nodes.length;index.set(k,i);nodes.push({x:p.x,z:p.z});edges.push([]);}return i;};
 const links=[];
 for(const s of segs){const ts=[...new Set(s.ts.map(t=>Math.round(Math.max(0,Math.min(1,t))*1e6)/1e6))].sort((a,b)=>a-b);
  for(let k=1;k<ts.length;k++){const p=n=>({x:s.a.x+(s.b.x-s.a.x)*n,z:s.a.z+(s.b.z-s.a.z)*n}),i=node(p(ts[k-1])),j=node(p(ts[k]));if(i===j)continue;
   const d=Math.hypot(nodes[i].x-nodes[j].x,nodes[i].z-nodes[j].z);edges[i].push([j,d]);edges[j].push([i,d]);links.push([i,j]);}}
 return {nodes,edges,links};
}
export function onRoad(x,z,roads,extra=0){return roads.some(r=>distanceSegment(x,z,r.a,r.b)<=r.width+extra);}
// 能走的鋪面 = 街道 + 整個村莊地板(getRoads 附在陣列上的 .paved)。
export function onPaved(x,z,roads,extra=0){return onRoad(x,z,roads,extra)||(roads.paved||[]).some(r=>x>=r.minX-extra&&x<=r.maxX+extra&&z>=r.minZ-extra&&z<=r.maxZ+extra);}
export function roadStyle(x,z,roads){return roads.find(r=>distanceSegment(x,z,r.a,r.b)<=r.width)?.kind||null;}
export function roadNodes(roads){const map=new Map();for(const r of roads)for(const p of[r.a,r.b])map.set(`${p.x.toFixed(3)},${p.z.toFixed(3)}`,p);return [...map.values()].filter(p=>walkable(p.x,p.z));}
const iso=(x,z)=>({x:(x-z)*9,y:(x+z)*4.5});

// Fit paving around the actual saved footprints. Junction endpoints are shared
// before detouring, so a moved house never leaves its front-door path stranded.
function fitRoads(roads,layout,levels){
 const rects=BUILDINGS.filter(b=>levels[b.id]!==0).map(b=>{const p=layout[b.id]||b;return {minX:p.x-b.w/2-.45,maxX:p.x+b.w/2+.45,minZ:p.z-b.d/2-.45,maxZ:p.z+b.d/2+.45};});
 const blocked=p=>rects.some(r=>p.x>r.minX&&p.x<r.maxX&&p.z>r.minZ&&p.z<r.maxZ);
 const clear=(a,b)=>!rects.some(r=>{let near=0,far=1;for(const [key,lo,hi]of [['x',r.minX,r.maxX],['z',r.minZ,r.maxZ]]){const d=b[key]-a[key];if(Math.abs(d)<1e-8){if(a[key]<=lo||a[key]>=hi)return false;}else{let t0=(lo-a[key])/d,t1=(hi-a[key])/d;if(t0>t1)[t0,t1]=[t1,t0];near=Math.max(near,t0);far=Math.min(far,t1);if(near>=far)return false;}}return far>1e-7&&near<1-1e-7;});
 const corners=[];for(const r of rects)for(const x of[r.minX-.05,r.maxX+.05])for(const z of[r.minZ-.05,r.maxZ+.05])if(!blocked({x,z})&&walkable(x,z))corners.push({x,z});
 const baseEdges=corners.map(()=>[]);for(let i=0;i<corners.length;i++)for(let j=i+1;j<corners.length;j++)if(clear(corners[i],corners[j])){const d=Math.hypot(corners[i].x-corners[j].x,corners[i].z-corners[j].z);baseEdges[i].push([j,d]);baseEdges[j].push([i,d]);}
 const path=(a,b)=>{if(clear(a,b))return[a,b];if(blocked(a)||blocked(b))return[a,b];const n=corners.length,points=[...corners,a,b],edges=baseEdges.map(e=>e.slice());edges.push([],[]);for(let i=0;i<n;i++)for(const end of[n,n+1])if(clear(points[i],points[end])){const d=Math.hypot(points[i].x-points[end].x,points[i].z-points[end].z);edges[i].push([end,d]);edges[end].push([i,d]);}const cost=points.map(()=>Infinity),prev=points.map(()=>-1),seen=new Set();cost[n]=0;for(let i=0;i<points.length;i++){let k=-1;for(let j=0;j<points.length;j++)if(!seen.has(j)&&(k<0||cost[j]<cost[k]))k=j;if(k<0||!Number.isFinite(cost[k])||k===n+1)break;seen.add(k);for(const[j,d]of edges[k])if(cost[k]+d<cost[j]){cost[j]=cost[k]+d;prev[j]=k;}}if(prev[n+1]<0)return[a,b];const route=[];for(let i=n+1;i!==n;i=prev[i])route.unshift(points[i]);return[a,...route];};
 const endpoints=roads.flatMap(r=>[r.a,r.b]),result=[];
 for(const road of roads){const dx=road.b.x-road.a.x,dz=road.b.z-road.a.z,len=dx*dx+dz*dz;if(!len)continue;const cuts=[{t:0,p:road.a},{t:1,p:road.b}];for(const p of endpoints){const t=((p.x-road.a.x)*dx+(p.z-road.a.z)*dz)/len;if(t>1e-5&&t<.99999&&distanceSegment(p.x,p.z,road.a,road.b)<.01)cuts.push({t,p});}cuts.sort((a,b)=>a.t-b.t);for(let i=1;i<cuts.length;i++){if(cuts[i].t-cuts[i-1].t<1e-5)continue;const route=path(cuts[i-1].p,cuts[i].p);for(let j=1;j<route.length;j++)result.push({...road,a:route[j-1],b:route[j]});}}
 return result;
}
