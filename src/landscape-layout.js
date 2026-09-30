import {BUILDINGS} from './pixel-data.js';
import {REGIONS,BRIDGES,riverX,walkable,inVillage} from './overworld.js';
export const ARENAS=REGIONS.filter(r=>r.id!=='village').map(r=>({...r,rx:r.id==='taiga'?5.7:6.6,rz:6.0}));
export const SOLID_PROPS=[
 {id:'fountain',minX:-9.2,maxX:-6.8,minZ:.8,maxZ:3.2},
 {id:'well',minX:-10.1,maxX:-8.9,minZ:17.2,maxZ:18.4},
 {id:'palisade-north',minX:8.7,maxX:9.3,minZ:-23.2,maxZ:-1.1},
 {id:'palisade-south',minX:8.7,maxX:9.3,minZ:5.1,maxZ:16.0},
 {id:'palisade-tail',minX:8.7,maxX:9.3,minZ:20,maxZ:25.2}
];
export function arenaAt(x,z,padding=0){return ARENAS.find(a=>((x-a.x)/(a.rx+padding))**2+((z-a.z)/(a.rz+padding))**2<=1)||null;}
export function arenaContains(id,x,z,padding=0){const a=ARENAS.find(a=>a.id===id);return !!a&&((x-a.x)/(a.rx+padding))**2+((z-a.z)/(a.rz+padding))**2<=1;}
export function distanceSegment(x,z,a,b){const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1)));return Math.hypot(x-a.x-t*dx,z-a.z-t*dz);}
export function getRoads(layout={},levels={}){
 const roads=[];const add=(points,width=1.15,kind='trail')=>{for(let i=1;i<points.length;i++){const a={x:points[i-1][0],z:points[i-1][1]},b={x:points[i][0],z:points[i][1]};roads.push({a,b,width,kind});}};
 // A continuous village street grid and one gate, with front-door connections.
 add([[-27,5.5],[-18.5,5.5],[-8,5.5],[-6,5.5],[2.5,5.5],[8,3],[17,3]],1.05,'stone');
 add([[2.5,-22],[6,-24],[16,-24]],.9);add([[2.5,18],[8,18],[16,18]],.9,'stone');
 const circle=Array.from({length:13},(_,i)=>[-8+Math.cos(i*Math.PI/6)*2.6,2+Math.sin(i*Math.PI/6)*2.6]);add(circle,.6,'stone');add([[-8,4.6],[-8,5.5]],.6,'stone');
 for(const x of [-25,-18.5,-6,2.5])add([[x,-22],[x,5.5],[x,24]],.7,'stone');
 add([[-25,-22],[-18.5,-22],[-6,-22],[2.5,-22]],.7,'stone');add([[-18.5,24],[-6,24],[2.5,24]],.7,'stone');
 // Main routes meet every bridge rather than stopping at a riverbank.
 add([[17,3],[16,-10],[16,-24],[15,-23],[8,-36]],1.15);
 add([[17,3],[16,18],[16,26],[16,36],[7,43],[16,46]],1.15);
 add([[36,-29],[36,-24],[36,-10],[36,3],[36,26],[36,40],[36,46]],1.15);
 for(const z of BRIDGES)add([[16,z],[riverX(z)-4,z],[riverX(z),z],[riverX(z)+4,z],[36,z]],1.25);
 add([[36,3],[43,2]],1.25);add([[36,-29],[45,-29]],1.25);add([[36,40],[45,40]],1.25);
 // Dungeon entrance is reached along the east bank after crossing an actual bridge.
 add([[36,-10],[29,-10],[26.6,-11]],.9);
 for(const b of BUILDINGS){if(b.id==='dungeon'||levels[b.id]===0)continue;const p=layout[b.id]||b,door={x:p.x,z:p.z+b.d/2+.6};const axis=[-25,-18.5,-6,2.5].sort((a,b)=>Math.abs(a-door.x)-Math.abs(b-door.x))[0];add([[door.x,door.z],[axis,door.z]],.58,'stone');}
 return fitRoads(roads,layout,levels);
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
