import {inVillageBounds,VILLAGE_BOUNDS} from './village-grid.js';
// One shared world contract for drawing, travel, spawning and saved coordinates.
// 2026-10-19:整場地圖縮小。村莊收攏成緊湊棋盤(30.1 × 26.9),野外面積砍一半(8046 → 4014,可走範圍 72 × 67);
// 世界 74 × 69,村莊靠西,七個狩獵區圍著村莊一圈(起始角依新的形狀重新切成每區面積相等)。
export const WORLD={minX:-38,maxX:36,minZ:-32,maxZ:37,width:74,height:69,area:5106,seed:349180};
// ── 狩獵區:七個怪物地形從村莊右邊開始逆時針圍成一圈,依風險由低到高(向陽草原 → 鐵脊山麓)。
// 每區的範圍就是整片地形(生怪、閒晃、找怪都在區內);區與區的分界是從村莊中心射出的畫面角,
// 角度依「每區面積約相等」切分(2026-10-18),所以各區大小差不多、不會有一區只剩一條邊。
export const RING_ORDER=['meadow','birch','forest','taiga','desert','snow','mountain'];
const RING_START=[0,35.7,146.5,193.3,257.1,312.2,344.5].map(d=>d*Math.PI/180);   // 各區起始畫面角(弧度,逆時針;0 = 畫面右邊)
const TAU=Math.PI*2;
const VC={x:(VILLAGE_BOUNDS.minX+VILLAGE_BOUNDS.maxX)/2,z:(VILLAGE_BOUNDS.minZ+VILLAGE_BOUNDS.maxZ)/2};   // 扇形的圓心:村莊中心
const isoX=(x,z)=>(x-z)*9,isoY=(x,z)=>(x+z)*4.5;   // 與畫面的等角投影一致(pixel-world 的 iso)
const mod=(a,m)=>((a%m)+m)%m;
// 世界點 → 畫面角(逆時針,0 = 右邊);加一點中頻起伏,讓區界不是從村莊射出的直線。
function ringPhi(x,z){
 const vx=isoX(x,z)-isoX(VC.x,VC.z),vy=isoY(x,z)-isoY(VC.x,VC.z),r=Math.hypot(x-VC.x,z-VC.z);
 let phi=Math.atan2(-vy,vx);
 phi+=.045*Math.sin(r*.085+phi*3)+.03*Math.sin(r*.23-phi*5);
 return mod(phi,TAU);}
function ringIndex(x,z){const phi=ringPhi(x,z);let k=RING_START.length-1;while(k>0&&phi<RING_START[k])k--;return k;}
// 從村莊中心沿畫面角 phi 射出的單位世界方向(等角投影是線性的,方向的畫面角不受單位長度影響)
function ringDir(phi){const vx=Math.cos(phi),vy=-Math.sin(phi);const x=(vx/9+vy/4.5)/2,z=(vy/4.5-vx/9)/2,n=Math.hypot(x,z);return {x:x/n,z:z/n};}
function rayExit(d,pred){let t=0;while(pred(VC.x+d.x*t,VC.z+d.z*t)&&t<400)t+=.05;return t;}
// 區的幾何:區界中點的射線上,村莊外 2.2 格是「區的邊緣」(派遣到這裡),世界邊界與村莊之間的中點是「區的中心」。
const geometryCache=new Map();
function regionGeometry(id){
 if(geometryCache.has(id))return geometryCache.get(id);
 const k=RING_ORDER.indexOf(id);if(k<0)return null;
 const a=RING_START[k],b=k+1<RING_START.length?RING_START[k+1]:RING_START[0]+TAU,d=ringDir((a+b)/2);
 const tv=rayExit(d,(x,z)=>inVillageBounds(x,z)),tw=rayExit(d,(x,z)=>inWorld(x,z));
 const g={edge:{x:VC.x+d.x*(tv+2.2),z:VC.z+d.z*(tv+2.2)},center:{x:VC.x+d.x*((tv+tw)/2),z:VC.z+d.z*((tv+tw)/2)}};
 geometryCache.set(id,g);return g;}
export function regionEdge(id){const g=regionGeometry(id);return g?{x:g.edge.x,z:g.edge.z}:null;}
export function regionCenter(id){const g=regionGeometry(id);return g?{x:g.center.x,z:g.center.z}:null;}
const REGION_BASE=[
 {id:'village',name:'暮影村',subtitle:'平原聚落',x:VC.x,z:VC.z,color:'#bcb79a',description:'整片石板地與獵人歸來的家。',enemy:'slime',risk:0},
 {id:'meadow',name:'向陽草原',subtitle:'草原 · 初階狩獵',color:'#86ad5a',description:'野花與羊群之間，史萊姆正在草叢裡聚集。',enemy:'slime',risk:1},
 {id:'forest',name:'橡木密林',subtitle:'森林 · 木材與獸皮',color:'#4d8350',description:'茂密樹冠與蕈菇，狼群在林間巡行。',enemy:'wolf',risk:1.15},
 {id:'taiga',name:'霜杉林地',subtitle:'針葉林 · 北方荒野',color:'#487d70',description:'針葉樹與苔石覆蓋的冷涼森林。',enemy:'wolf',risk:1.25},
 {id:'snow',name:'白霜雪原',subtitle:'雪地 · 冰河與松林',color:'#cee4df',description:'積雪堆在杉樹上，冰晶映出淡藍色晨光。',enemy:'golem',risk:1.5},
 {id:'mountain',name:'鐵脊山麓',subtitle:'山地 · 礦脈與洞穴',color:'#a7a8a1',description:'層疊岩壁、鐵礦與古老礦坑，石巨人在此守望。',enemy:'golem',risk:1.65},
 {id:'desert',name:'赤金沙地',subtitle:'沙漠 · 仙人掌與遺跡',color:'#d7b778',description:'仙人掌與砂岩遺跡點綴暖色沙丘。',enemy:'golem',risk:1.4},
 {id:'birch',name:'白樺花原',subtitle:'白樺林 · 藥草與花海',color:'#a9bd68',description:'白樺樹與花海環繞南方原野。',enemy:'slime',risk:1.1}
];
// 每個狩獵區的 x,z = 區的中心(由扇形算出),村莊維持原位。
export const REGIONS=REGION_BASE.map(r=>r.id==='village'?r:{...r,...regionCenter(r.id)});
// 2026-10-04:拿掉河流、小溪與所有橋:世界內全部是實地(只有世界外圍是海)。
export function inWorld(x,z){return Number.isFinite(x)&&Number.isFinite(z)&&x>=WORLD.minX+1&&x<=WORLD.maxX-1&&z>=WORLD.minZ+1&&z<=WORLD.maxZ-1;}
export function inVillage(x,z){return inVillageBounds(x,z);}
export function walkable(x,z){return inWorld(x,z);}
// 村外的狩獵地:世界以內、村莊以外的所有地方(整片都是怪物地形)。
export function wildAt(x,z){return inWorld(x,z)&&!inVillage(x,z);}
export function biomeAt(x,z){
 if(!inWorld(x,z))return 'ocean';
 if(inVillage(x,z))return 'village';
 return RING_ORDER[ringIndex(x,z)];
}
export function regionAt(x,z){return inVillage(x,z)?REGIONS[0]:REGIONS.find(r=>r.id===RING_ORDER[ringIndex(x,z)])||REGIONS[1];}
// 點是否在某個狩獵區的地形內(村內、世界外不算)。
export function regionContains(id,x,z){return wildAt(x,z)&&RING_ORDER[ringIndex(x,z)]===id;}
// 區內隨機一點(離村莊的圍籬至少 1.2 格、在世界以內)。隨機數由呼叫者給(遊戲用自己的亂數,方便重現)。
export function randomRegionPoint(id,rnd=Math.random){
 for(let i=0;i<400;i++){
  const x=WORLD.minX+1+rnd()*(WORLD.maxX-WORLD.minX-2),z=WORLD.minZ+1+rnd()*(WORLD.maxZ-WORLD.minZ-2);
  const nearVillage=x>VILLAGE_BOUNDS.minX-1.2&&x<VILLAGE_BOUNDS.maxX+1.2&&z>VILLAGE_BOUNDS.minZ-1.2&&z<VILLAGE_BOUNDS.maxZ+1.2;
  if(!nearVillage&&regionContains(id,x,z))return {x,z};}
 return regionCenter(id);}
export const BIOME_PALETTE={village:'#719b55',meadow:'#8caf5d',forest:'#356b3d',taiga:'#527c68',snow:'#d9e8df',mountain:'#a09e91',desert:'#e0bb73',birch:'#9fbd67',river:'#3395bd',ice:'#94cbd3',bridge:'#a77b50',ocean:'#3d7488'};
