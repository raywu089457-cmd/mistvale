from pathlib import Path
import re

p=Path('src/pixel-data.js');s=p.read_text(encoding='utf-8')
old={};new={'hall':(-15,-8),'trading':(-21,1),'restaurant':(-18,8),'inn':(-12,11),'tavern':(-3,20),'clinic':(-1.5,-3.5),'forge':(-9,-11),'academy':(-3,-9),'training':(-24,-5),'sanctuary':(-14,-19),'house':(6,7),'bounty':(1,2),'enhancement':(5.5,20)}
for k,(x,z) in new.items():
 pat=r"(id:'"+k+r"',name:'[^']+',x:)([-\d.]+)(,z:)([-\d.]+)"
 m=re.search(pat,s);assert m,k;old[k]=(float(m[2]),float(m[4]));s=re.sub(pat,lambda m:m[1]+str(x)+m[3]+str(z),s,count=1)
old['dungeon']=(24,-11)
import json
s+='\nexport const LEGACY_LAYOUT_V14='+json.dumps({k:{'x':v[0],'z':v[1]} for k,v in old.items()})+';\n'
s=s.replace("export const CAMP={x:0,z:3};","export const CAMP={x:-8,z:5.5};")
p.write_text(s,encoding='utf-8')

p=Path('src/overworld.js');s=p.read_text(encoding='utf-8')
s=s.replace("export const BRIDGES=[-24,3,26,46];","export const BRIDGES=[-24,3,26,46];\nexport const VILLAGE_BRIDGES=[-24,3,18];\nexport function creekX(z){return 11.5+Math.sin(z*.13)*.65;}")
s=s.replace("return x<9&&x>-20&&z>-19&&z<21;","return x<9&&x>-28&&z>-24&&z<26;")
s=s.replace("return Math.abs(x-riverX(z))<4.3&&BRIDGES.some(b=>Math.abs(z-b)<1.7);", "return (Math.abs(x-riverX(z))<4.3&&BRIDGES.some(b=>Math.abs(z-b)<1.7))||(z>-27&&z<27&&Math.abs(x-creekX(z))<3.3&&VILLAGE_BRIDGES.some(b=>Math.abs(z-b)<1.7));")
s=s.replace("return !isBridge(x,z)&&Math.abs(x-riverX(z))<1.75;", "return !isBridge(x,z)&&(Math.abs(x-riverX(z))<1.75||(z>-27&&z<27&&Math.abs(x-creekX(z))<1.1));")
p.write_text(s,encoding='utf-8')

p=Path('src/landscape-layout.js');s=p.read_text(encoding='utf-8')
s=s.replace("minX:-2.8,maxX:-1.0,minZ:2.3,maxZ:4.1", "minX:-9.2,maxX:-6.8,minZ:.8,maxZ:3.2")
s=s.replace("minZ:-17.2,maxZ:-1.1", "minZ:-23.2,maxZ:-1.1").replace("minZ:5.1,maxZ:19.2", "minZ:5.1,maxZ:16.0")
s=s.replace("{id:'palisade-south',minX:8.7,maxX:9.3,minZ:5.1,maxZ:16.0}","{id:'palisade-south',minX:8.7,maxX:9.3,minZ:5.1,maxZ:16.0},\n {id:'palisade-tail',minX:8.7,maxX:9.3,minZ:20,maxZ:25.2}")
s=s.replace("add([[-17,3],[-8,3],[-3.5,3],[-3.5,4.5],[-.3,4.5],[0,3],[8,3],[17,3]],.9,'stone');", "add([[-27,5.5],[-18.5,5.5],[-8,5.5],[-6,5.5],[2.5,5.5],[8,3],[17,3]],1.05,'stone');\n add([[2.5,-22],[6,-24],[16,-24]],.9);add([[2.5,18],[8,18],[16,18]],.9,'stone');\n const circle=Array.from({length:13},(_,i)=>[-8+Math.cos(i*Math.PI/6)*2.6,2+Math.sin(i*Math.PI/6)*2.6]);add(circle,.6,'stone');add([[-8,4.6],[-8,5.5]],.6,'stone');")
s=s.replace("for(const x of [-8,0,8])add([[x,-17],[x,3],[x,19]],.7,'stone');", "for(const x of [-25,-18.5,-6,2.5])add([[x,-22],[x,5.5],[x,24]],.7,'stone');\n add([[-25,-22],[-18.5,-22],[-6,-22],[2.5,-22]],.7,'stone');add([[-18.5,24],[-6,24],[2.5,24]],.7,'stone');")
s=s.replace("const axis=[-8,0,8]", "const axis=[-25,-18.5,-6,2.5]")
s=s.replace(" return roads;", " return fitRoads(roads,layout,levels);")
s+='''
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
'''
p.write_text(s,encoding='utf-8')

p=Path('src/pixel-game.js');s=p.read_text(encoding='utf-8')
s=s.replace('CAMP, HUNT_ZONE }','CAMP, HUNT_ZONE, LEGACY_LAYOUT_V14 }')
s=s.replace('const GATE = { x: 8, z: 0 };','const GATE = { x: 8, z: 3 };')
s=s.replace("version: 2, worldRevision: 3", "version: 2, layoutRevision: 2, worldRevision: 3")
s=s.replace("{ x: i * 0.7 - 1.4, z: 3 + i * 0.25 }", "{x:CAMP.x+i*.6-1.2,z:CAMP.z+i*.2}")
s=s.replace("x - b.w / 2 < -18 || x + b.w / 2 > 8 || z - b.d / 2 < -18 || z + b.d / 2 > 19", "x - b.w / 2 < -28 || x + b.w / 2 > 8 || z - b.d / 2 < -23 || z + b.d / 2 > 25")
s=s.replace("h.x < 8 ?", "h.x < 8 ?")
s=s.replace("route(h, inVillage(h.x,h.z) ? [GATE, target] : [target]);", "route(h,[target]);")
s=s.replace("route(h, !inVillage(h.x,h.z) && buildingId !== 'dungeon' ? [GATE, door(buildingId)] : [door(buildingId)]);", "route(h,[door(buildingId)]);")
s=s.replace("route(h,inVillage(h.x,h.z)?[GATE,state.rally]:[state.rally]);", "route(h,[state.rally]);").replace("route(h, inVillage(h.x,h.z) ? [GATE, state.rally] : [state.rally]);", "route(h,[state.rally]);")
needle="    const layout = Object.fromEntries(BUILDINGS.map"
s=s.replace(needle, "    const migrateDefault=source.layoutRevision!==2&&BUILDINGS.every(b=>{const p=source.layout?.[b.id],old=LEGACY_LAYOUT_V14[b.id];return !p||(p.x===old.x&&p.z===old.z);});\n    const inputLayout=migrateDefault?Object.fromEntries(BUILDINGS.map(b=>[b.id,{x:b.x,z:b.z}])):source.layout;\n"+needle)
s=s.replace("source.layout?.[b.id]?.x, b.x, -20, 28", "inputLayout?.[b.id]?.x, b.x, -28, 28").replace("source.layout?.[b.id]?.z, b.z, -20, 22", "inputLayout?.[b.id]?.z, b.z, -23, 27")
p.write_text(s,encoding='utf-8')
print('Concept composition authored; old standard layouts migrate and custom saved placements are retained.')
