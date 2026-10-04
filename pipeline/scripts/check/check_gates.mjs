// check_gates.mjs — 7 個狩獵區各跑 600 秒:獵人進出村一定經過兩個出村口(東=畫面右下、南=畫面左下),村裡每一刻都在道路中心線上。
// 用法:node pipeline/scripts/check/check_gates.mjs
import {createGame} from '../../../src/pixel-game.js';
import {getRoads,distanceSegment,SOLID_PROPS} from '../../../src/landscape-layout.js';
import {inVillage,REGIONS} from '../../../src/overworld.js';
import {FENCE,EXITS} from '../../../src/village-grid.js';
const inside=(x,z)=>x>FENCE.minX&&x<FENCE.maxX&&z>FENCE.minZ&&z<FENCE.maxZ;
let bad=0,crossings={east:0,south:0,other:0},samples=0,off=0;const t0=Date.now();
for(const region of REGIONS.slice(1)){
 const g=createGame();g.exploreRegion(region.id);const roads=()=>getRoads(g.state.layout,g.state.buildings);let R=roads();
 const prev=new Map();
 for(let i=0;i<6000;i++){g.tick(.1);
  for(const h of g.state.hunters){const p=prev.get(h.id);prev.set(h.id,{x:h.x,z:h.z});if(!p||h.hp<=0)continue;
   if(Math.hypot(h.x-p.x,h.z-p.z)>1.5)continue; // teleports (revive / service load)
   const a=inside(p.x,p.z),b=inside(h.x,h.z);
   if(a!==b){const m={x:(p.x+h.x)/2,z:(p.z+h.z)/2},e=EXITS.find(e=>Math.hypot(m.x-e.x,m.z-e.z)<1.7);if(e)crossings[e.id]++;else{crossings.other++;bad++;console.log('fence crossing',region.id,p,h.x,h.z);}}
   if(inVillage(h.x,h.z)){samples++;if(!R.some(r=>distanceSegment(h.x,h.z,r.a,r.b)<=.05)){off++;if(off<5)console.log('off road',h.status,h.x,h.z);}}
  }}
}
console.log({crossings,bad,samples,off,ms:Date.now()-t0});
if(crossings.other||off||!crossings.east||!crossings.south)process.exit(1);
