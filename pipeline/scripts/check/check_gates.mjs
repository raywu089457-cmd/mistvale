// check_gates.mjs — 7 個狩獵區各跑 600 秒:獵人進出村一定經過「柵欄上的出村口」(四個方向各一個,位置在該側正中央),村裡每一刻都在鋪面上(村內尋路只走鋪面)。
// 用法:node pipeline/scripts/check/check_gates.mjs
import {createGame} from '../../../src/pixel-game.js';
import {getRoads,onPaved} from '../../../src/landscape-layout.js';
import {inVillage,REGIONS} from '../../../src/overworld.js';
import {EXITS} from '../../../src/village-grid.js';
const inside=inVillage;   // 村界(VILLAGE_BOUNDS):進出村只能從兩個出口的村界點過
let bad=0,crossings={east:0,west:0,north:0,south:0,other:0},samples=0,off=0;const t0=Date.now();
for(const region of REGIONS.slice(1)){
 const g=createGame();g.exploreRegion(region.id);const roads=()=>getRoads(g.state.layout,g.state.buildings);let R=roads();
 const prev=new Map();
 for(let i=0;i<6000;i++){g.tick(.1);
  for(const h of g.state.hunters){const p=prev.get(h.id);prev.set(h.id,{x:h.x,z:h.z});if(!p||h.hp<=0)continue;
   if(Math.hypot(h.x-p.x,h.z-p.z)>1.5)continue; // teleports (revive / service load)
   const a=inside(p.x,p.z),b=inside(h.x,h.z);
   if(a!==b){const m={x:(p.x+h.x)/2,z:(p.z+h.z)/2},e=EXITS.find(e=>Math.hypot(m.x-e.edge.x,m.z-e.edge.z)<1.7);if(e)crossings[e.id]++;else{crossings.other++;bad++;console.log('village edge crossing',region.id,p,h.x,h.z);}}
   if(inVillage(h.x,h.z)){samples++;if(!onPaved(h.x,h.z,R,.1)){off++;if(off<5)console.log('off paved',h.status,h.x,h.z);}}
  }}
}
console.log({crossings,bad,samples,off,ms:Date.now()-t0});
const used=Object.entries(crossings).filter(([k,v])=>k!=='other'&&v>0).length;
if(crossings.other||off||used<2)process.exit(1);   // 每次跨村界都要在出村口上;而且實際會用到不只一個門
