import {inVillageBounds,VILLAGE_BOUNDS} from './village-grid.js';
// One shared world contract for drawing, travel, spawning and saved coordinates.
// 2026-10-19:整場地圖縮小。村莊收攏成緊湊棋盤(30.1 × 26.9),野外面積砍一半(8046 → 4014,可走範圍 72 × 67);
// 七個狩獵區圍著村莊一圈(起始角依新的形狀重新切成每區面積相等)。
// 世界以「村莊中心」為中心:村界到四邊的距離幾乎相同,外圍七個野怪區的縱深才會一樣,
// 不會再出現「西邊只有 13 格、東邊有 31 格」那種一側被壓扁的環。
// 2026-11-18 使用者:怪物區域擴展兩倍大。村莊不動,世界 74×69 → 94×89(寬高的奇偶不變,地面格線對齊原本的位置),
// 七個狩獵區的陸地面積各 ×2(舊 2,951 → 新約 5,900 平方格);舊地圖的每一格陸地在新地圖上都還是陸地(舊座標全部有效)。
const VCMD={x:(VILLAGE_BOUNDS.minX+VILLAGE_BOUNDS.maxX)/2,z:(VILLAGE_BOUNDS.minZ+VILLAGE_BOUNDS.maxZ)/2};
export const WORLD={minX:VCMD.x-47,maxX:VCMD.x+47,minZ:VCMD.z-44.5,maxZ:VCMD.z+44.5,width:94,height:89,area:8366,seed:349180};
// ── 狩獵區:七個怪物地形從村莊右邊開始逆時針圍成一圈,依風險由低到高(向陽草原 → 鐵脊山麓)。
// 每區的範圍就是整片地形(生怪、閒晃、找怪都在區內);區與區的分界是從村莊中心射出的畫面角,
// 角度依「每區面積約相等」切分(2026-10-18),所以各區大小差不多、不會有一區只剩一條邊。
export const RING_ORDER=['meadow','birch','forest','taiga','desert','snow','mountain'];
const TAU=Math.PI*2;
const VC=VCMD;   // 扇形的圓心:村莊中心(世界也是以它為中心)
const isoX=(x,z)=>(x-z)*9,isoY=(x,z)=>(x+z)*4.5;   // 與畫面的等角投影一致(pixel-world 的 iso)
const mod=(a,m)=>((a%m)+m)%m;
// ── 海岸線:世界邊界不是直線。四面都用「低頻海灣＋中頻岬角＋一點毛邊」的弦波決定陸地從哪裡結束,
// 所以整張地圖是一圈不規則海岸的島,不會出現筆直的海岸線。
const COAST_MIN=1.6,COAST_MAX=5.9;   // 海岸內縮的範圍(格):至少 1.6(陸地不會貼在世界邊界上),最多 5.9(2026-11-18 從 6.4 微調,七區面積才剛好 ×2)
function coastInset(x,z){
 // 四個頻率的弦波都先轉成 0..1 再加權平均 → 一定是 0..1,不會因為正弦全部同向而出現「陸地貼到邊界」的直線段。
 const w=a=>(Math.sin(a)+1)/2;
 const f=.45*w(x*.185+z*.115)+.30*w(z*.365-x*.225+1.4)+.15*w((x+z)*.61+2.2)+.10*w((x-z)*1.13+.7);
 return COAST_MIN+f*(COAST_MAX-COAST_MIN);}
// 到四邊的距離(格):四面都是有海灣與岬角的不規則海岸。
function coastDepth(x,z){return Math.min(x-(WORLD.minX+1),(WORLD.maxX-1)-x,z-(WORLD.minZ+1),(WORLD.maxZ-1)-z);}
export function inWorld(x,z){
 if(!(Number.isFinite(x)&&Number.isFinite(z)))return false;
 if(x<WORLD.minX+1||x>WORLD.maxX-1||z<WORLD.minZ+1||z>WORLD.maxZ-1)return false;
 return coastDepth(x,z)>coastInset(x,z);}
// 世界點 → 畫面角(逆時針,0 = 右邊);加一點中頻起伏,讓區界不是從村莊射出的直線。
function ringPhi(x,z){
 const vx=isoX(x,z)-isoX(VC.x,VC.z),vy=isoY(x,z)-isoY(VC.x,VC.z),r=Math.hypot(x-VC.x,z-VC.z);
 let phi=Math.atan2(-vy,vx);
 // 三個頻率的起伏 = 地形交界彎彎曲曲(像 Minecraft 的生態域邊界):低頻造成一整條凸出/凹入,
 // 中頻讓邊界不要平滑、高頻加一點毛邊。振幅上限約 0.16 rad(9°),遠小於區與區的間隔(最小約 32°),
 // 所以區的「逆時針順序」不會被打亂,只有邊界形狀改變。
 phi+=.088*Math.sin(phi*3+r*.055+1.3)+.05*Math.sin(phi*7-r*.115)+.026*Math.sin(phi*13+r*.23+2.1);
 return mod(phi,TAU);}
// ── 村界外的兩圈「圍村線」(只是幾何,不畫、不是道路) ─────────────────────────
// 2026-11-26 使用者:「移除環村道路,怪物可以自由漫遊到村莊出入口攻擊玩家」。以前圍籬外 3.4 格有一條環村道路,
// 是魔物進不去、也不會鎖定路上獵物的安全走廊;現在道路、安全走廊都拿掉了,地面一路是旁邊那一區的地形直到圍籬。
// 留下兩圈純幾何的線:
//  - PERIMETER(離村界 3.4 格 = 舊環路的中心線,點完全相同):只拿來定區界(下面草原/山麓的直線交界 FOOTHILLS_EDGE
//    就是從它的角落出發),所以拿掉道路後七個狩獵區的形狀、存檔裡的座標與 regionId 全部不變。
//  - VILLAGE_LOOP(離村界 2 格):英雄出村/回村時沿圍籬繞到目的地的導航線(pixel-game 的 travelPlan),
//    路上會經過別的狩獵區 —— 沒有安全走廊了,所以 travelPlan 會挑「比目的地危險的區」走最少的那一側。
function loopAround(o) {
  // 矩形外擴 o,四角用「半徑 o 的四分之一圓」收邊:整圈每個點都離村界 o 格。
  const b = VILLAGE_BOUNDS;
  const x0 = b.minX - o, x1 = b.maxX + o, z0 = b.minZ - o, z1 = b.maxZ + o;
  const arc = (cx, cz, a0) => {
    const pts = [];
    for (let k = 0; k <= 8; k++) {
      const a = a0 + (Math.PI / 2) * (k / 8);
      pts.push({ x: cx + o * Math.cos(a), z: cz + o * Math.sin(a) });
    }
    return pts;
  };
  const edge = (ax, az, bx, bz) => {
    const len = Math.hypot(bx - ax, bz - az), steps = Math.max(1, Math.round(len / 2));
    const pts = [];
    for (let k = 0; k < steps; k++) pts.push({ x: ax + (bx - ax) * k / steps, z: az + (bz - az) * k / steps });
    return pts;
  };
  const pts = [];
  // 上邊(z0)由左往右 → 右上圓角 → 右邊 → 右下 → 下邊 → 左下 → 左邊 → 左上
  pts.push(...edge(b.minX, z0, b.maxX, z0), ...arc(b.maxX, b.minZ, -Math.PI / 2));
  pts.push(...edge(x1, b.minZ, x1, b.maxZ), ...arc(b.maxX, b.maxZ, 0));
  pts.push(...edge(b.maxX, z1, b.minX, z1), ...arc(b.minX, b.maxZ, Math.PI / 2));
  pts.push(...edge(x0, b.maxZ, x0, b.minZ), ...arc(b.minX, b.minZ, Math.PI));
  return pts;
}
export const PERIMETER_OFFSET = 3.4;
export const PERIMETER = loopAround(PERIMETER_OFFSET);
export const VILLAGE_LOOP_OFFSET = 2;
export const VILLAGE_LOOP = loopAround(VILLAGE_LOOP_OFFSET);
// T68: straight meadow/mountain border on the right. Its west end is the first PERIMETER point hit by
// the screen-angle-0 ray from the village centre (the same direction that used to be the border).
const FOOTHILLS_EDGE=(()=>{
 const d=ringDir(0);   // 草原的起始畫面角固定是 0
 let best=Infinity;
 for(let i=0;i<PERIMETER.length;i++){
  const a=PERIMETER[i],b=PERIMETER[(i+1)%PERIMETER.length];
  const ex=b.x-a.x,ez=b.z-a.z,den=d.x*ez-d.z*ex;
  if(Math.abs(den)<1e-12)continue;
  const qx=a.x-VC.x,qz=a.z-VC.z;
  const t=(qx*ez-qz*ex)/den,u=(qx*d.z-qz*d.x)/den;
  if(t>1e-9&&u>=-1e-9&&u<=1+1e-9&&t<best)best=t;
 }
 return {x:VC.x+d.x*best,z:VC.z+d.z*best,endX:WORLD.maxX};
})();
// 各區陸地面積的比例 = 2026-11-18 擴張前實測的面積(平方格),所以擴張後「每一區」都是自己的兩倍,不只是總和兩倍。
const REGION_AREA_SHARE={meadow:449,birch:420.3,forest:424.8,taiga:420.6,desert:420.3,snow:421.8,mountain:394.1};
// 各區起始畫面角(弧度,逆時針;0 = 畫面右邊)。不寫死角度:掃描整片陸地、依 ringPhi 的分位數切,
// 這樣「海岸線吃掉邊角」之後每一區的陸地面積還是照上面的比例。
// 草原／山麓在村莊東邊的交界是一條直線(FOOTHILLS_EDGE),直線以北那塊楔形照角度算是山麓、實際歸草原,
// 地圖越大楔形越大:切角度時把楔形先扣掉,兩區的面積才會對。
const RING_START=(()=>{
 const phis=[];let wedge=0;
 for(let z=WORLD.minZ;z<WORLD.maxZ;z+=.5)for(let x=WORLD.minX;x<WORLD.maxX;x+=.5){
  if(!inWorld(x,z)||inVillageBounds(x,z))continue;
  const phi=ringPhi(x,z);phis.push(phi);
  if(x>=FOOTHILLS_EDGE.x){if(z<=FOOTHILLS_EDGE.z&&phi>Math.PI)wedge++;else if(z>FOOTHILLS_EDGE.z&&phi<Math.PI)wedge--;}}   // 起伏會讓交界附近幾格落在另一側,兩個方向都要算
 phis.sort((p,q)=>p-q);
 const unit=phis.length/RING_ORDER.reduce((n,id)=>n+REGION_AREA_SHARE[id],0);
 const starts=[0];let at=REGION_AREA_SHARE[RING_ORDER[0]]*unit-wedge;
 for(let k=1;k<RING_ORDER.length;k++){starts.push(phis[Math.max(0,Math.min(phis.length-1,Math.floor(at)))]||0);at+=REGION_AREA_SHARE[RING_ORDER[k]]*unit;}
 return starts;})();
function ringIndex(x,z){
 const phi=ringPhi(x,z);let k=RING_START.length-1;while(k>0&&phi<RING_START[k])k--;
 // T68: the meadow/mountain border east of the village is a straight line, not the noisy ray.
 // It starts at the PERIMETER corner on the screen-angle-0 side and runs east to the world edge;
 // meadow stays on the -z side, mountain on the +z side.
 if((k===0||k===6)&&x>=FOOTHILLS_EDGE.x)return z>FOOTHILLS_EDGE.z?6:0;
 return k;}
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
 {id:'village',name:'暮影村',subtitle:'平原聚落',x:VC.x,z:VC.z,color:'#bcb79a',description:'整片石板地與獵人歸來的家。',enemy:'sprout',risk:0},
 {id:'meadow',name:'向陽草原',subtitle:'草原 · 初階狩獵',color:'#86ad5a',description:'野花與羊群之間，花芽妖和捲角羊正在草叢裡聚集。',enemy:'sprout',risk:1},
 {id:'forest',name:'橡木密林',subtitle:'森林 · 木材與獸皮',color:'#4d8350',description:'茂密樹冠與蕈菇，野豬在藤蔓間橫衝直撞。',enemy:'boar',risk:1.15},
 {id:'taiga',name:'霜杉林地',subtitle:'針葉林 · 北方荒野',color:'#487d70',description:'針葉樹與苔石覆蓋的冷涼森林，灰毛狼人成群出沒。',enemy:'wolfman',risk:1.25},
 {id:'snow',name:'白霜雪原',subtitle:'雪地 · 冰河與松林',color:'#cee4df',description:'積雪堆在杉樹上，霜雪怪踏雪而來、冰甲蟲在冰河邊爬行。',enemy:'snowman',risk:1.5},
 {id:'mountain',name:'鐵脊山麓',subtitle:'山地 · 礦脈與洞穴',color:'#a7a8a1',description:'層疊岩壁、鐵礦與古老礦坑，礦穴地精與岩塊怪在此盤據。',enemy:'goat',risk:1.65},
 {id:'desert',name:'赤金沙地',subtitle:'沙漠 · 仙人掌與遺跡',color:'#d7b778',description:'仙人掌與砂岩遺跡點綴暖色沙丘，木乃伊在遺跡裡醒著。',enemy:'scorpion',risk:1.4},
 {id:'birch',name:'白樺花原',subtitle:'白樺林 · 藥草與花海',color:'#a9bd68',description:'白樺樹與花海環繞南方原野，白樺雄鹿在花間巡守。',enemy:'stag',risk:1.1}
];
// 每個狩獵區的 x,z = 區的中心(由扇形算出),村莊維持原位。
export const REGIONS=REGION_BASE.map(r=>r.id==='village'?r:{...r,...regionCenter(r.id)});
// 2026-10-04:拿掉河流、小溪與所有橋:世界內全部是實地(只有世界外圍是海)。

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
// 區內隨機一點(離村界至少 pad 格、在世界以內)。隨機數由呼叫者給(遊戲用自己的亂數,方便重現)。
// pad 預設 3.4:生怪、獵人搜尋點不要貼著村界(玩家一走出門就撞到剛生出來的怪)。
// 2026-11-26 拿掉環村道路:魔物閒晃用較小的 pad(pixel-game 的 WANDER_PAD),會自己晃到圍籬邊與出村口。
export function randomRegionPoint(id,rnd=Math.random,pad=3.4){
 const PAD=pad;
 const CLEAR=1.3; // 取樣點四周留一點實地,不要卡在只有一格寬的海岸邊角(走不出去)
 for(let i=0;i<400;i++){
  const x=WORLD.minX+1+rnd()*(WORLD.maxX-WORLD.minX-2),z=WORLD.minZ+1+rnd()*(WORLD.maxZ-WORLD.minZ-2);
  const nearVillage=x>VILLAGE_BOUNDS.minX-PAD&&x<VILLAGE_BOUNDS.maxX+PAD&&z>VILLAGE_BOUNDS.minZ-PAD&&z<VILLAGE_BOUNDS.maxZ+PAD;
  const clear=walkable(x-CLEAR,z)&&walkable(x+CLEAR,z)&&walkable(x,z-CLEAR)&&walkable(x,z+CLEAR);
  if(!nearVillage&&clear&&regionContains(id,x,z))return {x,z};}
 return regionCenter(id);}
export const BIOME_PALETTE={village:'#719b55',meadow:'#8caf5d',forest:'#356b3d',taiga:'#527c68',snow:'#d9e8df',mountain:'#a09e91',desert:'#e0bb73',birch:'#9fbd67',river:'#3395bd',ice:'#94cbd3',bridge:'#a77b50',ocean:'#3d7488'};

function segDist(x, z, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, len = dx * dx + dz * dz;
  const t = len ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len)) : 0;
  return Math.hypot(x - a.x - t * dx, z - a.z - t * dz);
}
// 到 PERIMETER(區界用的那一圈)的距離(格);tools/checks/foothills-edge.mjs 用來驗草原/山麓交界的起點。
export function perimeterDistance(x, z) {
  let best = Infinity;
  for (let i = 0; i < PERIMETER.length; i++) {
    const d = segDist(x, z, PERIMETER[i], PERIMETER[(i + 1) % PERIMETER.length]);
    if (d < best) best = d;
  }
  return best;
}
// 圍村導航線上離 (x,z) 最近的一點(回傳小數索引與距離,之後沿索引走)
export function nearestLoop(x, z) {
  let best = Infinity, index = 0;
  for (let i = 0; i < VILLAGE_LOOP.length; i++) {
    const a = VILLAGE_LOOP[i], b = VILLAGE_LOOP[(i + 1) % VILLAGE_LOOP.length];
    const dx = b.x - a.x, dz = b.z - a.z, len = dx * dx + dz * dz;
    const t = len ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len)) : 0;
    const px = a.x + t * dx, pz = a.z + t * dz, d = Math.hypot(x - px, z - pz);
    if (d < best) { best = d; index = i + t; }
  }
  return { index, distance: best };
}
// 導航線上第 index 個點(自動取整與繞回)
export function loopPointAt(index) { const n = VILLAGE_LOOP.length; return { ...VILLAGE_LOOP[mod(Math.round(index), n)] }; }
// 從索引 a 沿導航線往 dir(+1 / -1)走到索引 b 的路徑點(不含起點,含終點)
export function loopPath(a, b, dir) {
  const n = VILLAGE_LOOP.length, ia = mod(Math.round(a), n), ib = mod(Math.round(b), n);
  const steps = dir > 0 ? mod(ib - ia, n) : mod(ia - ib, n), out = [];
  for (let k = 1; k <= steps; k++) out.push({ ...VILLAGE_LOOP[mod(ia + dir * k, n)] });
  return out;
}
// ── 地區立牌的位置(2026-11-26 使用者:「怪物區域立牌移動到該區域圍欄旁邊」) ──────────────────────
// 以前立在每區正中央(擠在魔物群裡,點不到、看不清)。現在立在村莊圍籬外 SIGN_OFFSET 格、這一區貼著村莊的那一段的正中間:
// 沿村界四邊每 0.25 格取樣,只留「屬於這一區」、離出村口(該邊正中央)至少 SIGN_GATE_CLEAR 格、離村莊四角至少 SIGN_CORNER_CLEAR 格的點,
// 取最長的一段連續點的中點。結果是固定的(不看存檔),畫面(pixel-world)與檢查(tools/checks/region-signs.mjs)共用這一份。
// SIGN_OFFSET 2.6:1.8 的時候南邊的赤金沙地立牌會往上疊到旅館門口、北邊的會被建築屋頂蓋住(遊玩縮放 2.2 實測)。
// SIGN_PREFER:中點會被前排建築擋住的區,改取「靠出村口那一端往內 0.5 格」—— 白樺花原那一段正好在強化工坊與鐵匠鋪的屋頂後面
// (output/no-ringroad/probe-signs.mjs 掃過整段:只有兩端看得到)。
export const SIGN_OFFSET = 2.6, SIGN_GATE_CLEAR = 4.5, SIGN_CORNER_CLEAR = 1.5;
const SIGN_PREFER = { birch: 'gate' };
const signCache = new Map();
export function regionSignSpot(id) {
  if (signCache.has(id)) return signCache.get(id);
  const b = VILLAGE_BOUNDS, o = SIGN_OFFSET, midX = (b.minX + b.maxX) / 2, midZ = (b.minZ + b.maxZ) / 2;
  // 四邊:沿邊的座標範圍、出村口在沿邊座標上的位置、沿邊座標 → 世界點
  const sides = [
    { side: 'north', lo: b.minX, hi: b.maxX, gate: midX, pt: u => ({ x: u, z: b.minZ - o }) },
    { side: 'east', lo: b.minZ, hi: b.maxZ, gate: midZ, pt: u => ({ x: b.maxX + o, z: u }) },
    { side: 'south', lo: b.minX, hi: b.maxX, gate: midX, pt: u => ({ x: u, z: b.maxZ + o }) },
    { side: 'west', lo: b.minZ, hi: b.maxZ, gate: midZ, pt: u => ({ x: b.minX - o, z: u }) },
  ];
  let best = null;
  for (const s of sides) {
    let run = null;
    const close = () => { if (run && (!best || run.len > best.len)) best = run; run = null; };
    for (let u = s.lo + SIGN_CORNER_CLEAR; u <= s.hi - SIGN_CORNER_CLEAR + 1e-9; u += 0.25) {
      const p = s.pt(u);
      if (Math.abs(u - s.gate) >= SIGN_GATE_CLEAR && regionContains(id, p.x, p.z)) {
        if (!run) run = { a: u, b: u, len: 0, s };
        run.b = u; run.len = run.b - run.a;
      } else close();
    }
    close();
  }
  let u = best ? (best.a + best.b) / 2 : 0;
  if (best && SIGN_PREFER[id] === 'gate') u = Math.abs(best.a - best.s.gate) < Math.abs(best.b - best.s.gate) ? Math.min(best.b, best.a + 0.5) : Math.max(best.a, best.b - 0.5);
  const spot = best ? { ...best.s.pt(u), side: best.s.side } : null;
  signCache.set(id, spot);
  return spot;
}
