import {BUILDINGS} from './pixel-data.js';
import {REGIONS,walkable} from './overworld.js';
import {STREET_X,STREET_Z,EXITS,EXIT_GAP,FENCE,BUILDING_SLOTS,GRID} from './village-grid.js';
// 戰鬥空地 z 方向放大(6 → 7.5):魔物 28–33 世界像素寬,原本的空地站不開,戰鬥會疊成一團。
// 草原空地在 x=19、半徑 5.8:離村莊東柵欄與東門 4 格以上,戰鬥不會擠在門口。
export const ARENAS=REGIONS.filter(r=>r.id!=='village').map(r=>r.id==='meadow'?{...r,x:19,rx:5.8,rz:7.5}:({...r,rx:r.id==='taiga'?5.7:6.6,rz:7.5}));
// 實心障礙:中央噴水池、水井廣場的井、村莊四周木柵欄(東、南各留一個出村口)。
const WELL=BUILDING_SLOTS.well,T=.3;
const palisade=[];{
 // 一條邊 = 一段長方形;有出口的邊從出口切成兩段(口寬 2×EXIT_GAP)。
 const side=(id,axis,at,lo,hi)=>{const gaps=EXITS.filter(e=>e.side===id).map(e=>axis==='x'?e.z:e.x).sort((a,b)=>a-b);let a=lo;
  for(const g of [...gaps,Infinity]){const b=Math.min(g-EXIT_GAP,hi);if(b>a)palisade.push(axis==='x'?{id:`palisade-${id}-${palisade.length}`,side:id,minX:at-T,maxX:at+T,minZ:a,maxZ:b}:{id:`palisade-${id}-${palisade.length}`,side:id,minX:a,maxX:b,minZ:at-T,maxZ:at+T});a=g+EXIT_GAP;}};
 side('north','z',FENCE.minZ,FENCE.minX-T,FENCE.maxX+T);side('south','z',FENCE.maxZ,FENCE.minX-T,FENCE.maxX+T);
 side('west','x',FENCE.minX,FENCE.minZ-T,FENCE.maxZ+T);side('east','x',FENCE.maxX,FENCE.minZ-T,FENCE.maxZ+T);}
export const PALISADE=palisade;
export const SOLID_PROPS=[
 {id:'fountain',minX:-10,maxX:-6,minZ:0,maxZ:4},
 {id:'well',minX:WELL.x-.6,maxX:WELL.x+.6,minZ:WELL.z-.6,maxZ:WELL.z+.6},
 ...palisade
];
export function arenaAt(x,z,padding=0){return ARENAS.find(a=>((x-a.x)/(a.rx+padding))**2+((z-a.z)/(a.rz+padding))**2<=1)||null;}
export function arenaContains(id,x,z,padding=0){const a=ARENAS.find(a=>a.id===id);return !!a&&((x-a.x)/(a.rx+padding))**2+((z-a.z)/(a.rz+padding))**2<=1;}
export function distanceSegment(x,z,a,b){const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1)));return Math.hypot(x-a.x-t*dx,z-a.z-t*dz);}
export function getRoads(layout={},levels={}){
 const roads=[];const add=(points,width=1.15,kind='trail')=>{for(let i=1;i<points.length;i++){const a={x:points[i-1][0],z:points[i-1][1]},b={x:points[i][0],z:points[i][1]};roads.push({a,b,width,kind});}};
 // 棋盤格村莊:每條街區邊都是石板街(src/village-grid.js),中央廣場一圈環道+四條放射短街接到廣場四邊。
 const X0=STREET_X[0],X1=STREET_X.at(-1),Z0=STREET_Z[0],Z1=STREET_Z.at(-1);
 for(const x of STREET_X)add([[x,Z0],[x,Z1]],GRID.street,'stone');
 for(const z of STREET_Z)add([[X0,z],[X1,z]],GRID.street,'stone');
 const circle=Array.from({length:13},(_,i)=>[GRID.cx+Math.cos(i*Math.PI/6)*3.6,GRID.cz+Math.sin(i*Math.PI/6)*3.6]);add(circle,.6,'stone');
 const half=GRID.pitch/2;
 for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]])add([[GRID.cx+dx*3.6,GRID.cz+dz*3.6],[GRID.cx+dx*half,GRID.cz+dz*half]],.7,'stone');
 // 出村:兩條街穿過柵欄口,路只鋪到門外一點;村外沒有路,自由走。
 for(const e of EXITS)add([[e.street.x,e.street.z],[e.out.x,e.out.z]],GRID.street,'stone');
 const mainStreets=roads.filter(r=>r.kind==='stone');
 for(const b of BUILDINGS){
  if(b.id==='dungeon'||levels[b.id]===0)continue;
  const p=layout[b.id]||b,door={x:p.x,z:p.z+b.d/2+.6};
  let junction=null,nearest=Infinity;
  for(const r of mainStreets){
   const dx=r.b.x-r.a.x,dz=r.b.z-r.a.z;
   const t=Math.max(0,Math.min(1,((door.x-r.a.x)*dx+(door.z-r.a.z)*dz)/(dx*dx+dz*dz||1)));
   const q={x:r.a.x+t*dx,z:r.a.z+t*dz},distance=Math.hypot(q.x-door.x,q.z-door.z);
   if(distance<nearest){nearest=distance;junction=q;}
  }
  if(junction)add([[door.x,door.z],[junction.x,junction.z]],.58,'stone');
 }
 return fitRoads(roads,layout,levels);
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
export function roadStyle(x,z,roads){return roads.find(r=>distanceSegment(x,z,r.a,r.b)<=r.width)?.kind||null;}
export function roadNodes(roads){const map=new Map();for(const r of roads)for(const p of[r.a,r.b])map.set(`${p.x.toFixed(3)},${p.z.toFixed(3)}`,p);return [...map.values()].filter(p=>walkable(p.x,p.z));}
const iso=(x,z)=>({x:(x-z)*9,y:(x+z)*4.5});
export function canopyObscures(x,z,size,px,pz,extra=0){const t=iso(x,z),p=iso(px,pz);return Math.abs(t.x-p.x)<26*size+extra&&t.y+4*size>p.y-30-extra&&t.y-74*size<p.y+extra;}
export function keepTallDecoration(d,roads,layout={}){
 const size=d.size||1;
 if(onRoad(d.x,d.z,roads,2.1)||arenaAt(d.x,d.z,3))return false;
 // Exclude projected crowns too: a tree rooted outside an arena can still cover it.
 for(const a of ARENAS){for(let z=a.z-a.rz;z<=a.z+a.rz;z+=2)for(let x=a.x-a.rx;x<=a.x+a.rx;x+=2){if(arenaContains(a.id,x,z,1)&&canopyObscures(d.x,d.z,size,x,z,5))return false;}}
 for(const r of roads){const n=Math.ceil(Math.hypot(r.b.x-r.a.x,r.b.z-r.a.z)/1.5);for(let i=0;i<=n;i++){const u=i/(n||1);if(canopyObscures(d.x,d.z,size,r.a.x+(r.b.x-r.a.x)*u,r.a.z+(r.b.z-r.a.z)*u,9))return false;}}
 for(const b of BUILDINGS){const p=layout[b.id]||b;if(Math.abs(d.x-p.x)<4&&Math.abs(d.z-p.z)<5)return false;}
 return true;
}

// Fit paving around the actual saved footprints. Junction endpoints are shared
// before detouring, so a moved house never leaves its front-door path stranded.
function fitRoads(roads,layout,levels){
 const rects=BUILDINGS.filter(b=>levels[b.id]!==0).map(b=>{const p=layout[b.id]||b;return {minX:p.x-b.w/2-.45,maxX:p.x+b.w/2+.45,minZ:p.z-b.d/2-.45,maxZ:p.z+b.d/2+.45};}).concat(SOLID_PROPS);
 const blocked=p=>rects.some(r=>p.x>r.minX&&p.x<r.maxX&&p.z>r.minZ&&p.z<r.maxZ);
 const clear=(a,b)=>!rects.some(r=>{let near=0,far=1;for(const [key,lo,hi]of [['x',r.minX,r.maxX],['z',r.minZ,r.maxZ]]){const d=b[key]-a[key];if(Math.abs(d)<1e-8){if(a[key]<=lo||a[key]>=hi)return false;}else{let t0=(lo-a[key])/d,t1=(hi-a[key])/d;if(t0>t1)[t0,t1]=[t1,t0];near=Math.max(near,t0);far=Math.min(far,t1);if(near>=far)return false;}}return far>1e-7&&near<1-1e-7;});
 const corners=[];for(const r of rects)for(const x of[r.minX-.05,r.maxX+.05])for(const z of[r.minZ-.05,r.maxZ+.05])if(!blocked({x,z})&&walkable(x,z))corners.push({x,z});
 const baseEdges=corners.map(()=>[]);for(let i=0;i<corners.length;i++)for(let j=i+1;j<corners.length;j++)if(clear(corners[i],corners[j])){const d=Math.hypot(corners[i].x-corners[j].x,corners[i].z-corners[j].z);baseEdges[i].push([j,d]);baseEdges[j].push([i,d]);}
 const path=(a,b)=>{if(clear(a,b))return[a,b];if(blocked(a)||blocked(b))return[a,b];const n=corners.length,points=[...corners,a,b],edges=baseEdges.map(e=>e.slice());edges.push([],[]);for(let i=0;i<n;i++)for(const end of[n,n+1])if(clear(points[i],points[end])){const d=Math.hypot(points[i].x-points[end].x,points[i].z-points[end].z);edges[i].push([end,d]);edges[end].push([i,d]);}const cost=points.map(()=>Infinity),prev=points.map(()=>-1),seen=new Set();cost[n]=0;for(let i=0;i<points.length;i++){let k=-1;for(let j=0;j<points.length;j++)if(!seen.has(j)&&(k<0||cost[j]<cost[k]))k=j;if(k<0||!Number.isFinite(cost[k])||k===n+1)break;seen.add(k);for(const[j,d]of edges[k])if(cost[k]+d<cost[j]){cost[j]=cost[k]+d;prev[j]=k;}}if(prev[n+1]<0)return[a,b];const route=[];for(let i=n+1;i!==n;i=prev[i])route.unshift(points[i]);return[a,...route];};
 const endpoints=roads.flatMap(r=>[r.a,r.b]),result=[];
 for(const road of roads){const dx=road.b.x-road.a.x,dz=road.b.z-road.a.z,len=dx*dx+dz*dz;if(!len)continue;const cuts=[{t:0,p:road.a},{t:1,p:road.b}];for(const p of endpoints){const t=((p.x-road.a.x)*dx+(p.z-road.a.z)*dz)/len;if(t>1e-5&&t<.99999&&distanceSegment(p.x,p.z,road.a,road.b)<.01)cuts.push({t,p});}cuts.sort((a,b)=>a.t-b.t);for(let i=1;i<cuts.length;i++){if(cuts[i].t-cuts[i-1].t<1e-5)continue;const route=path(cuts[i-1].p,cuts[i].p);for(let j=1;j<route.length;j++)result.push({...road,a:route[j-1],b:route[j]});}}
 return result;
}
