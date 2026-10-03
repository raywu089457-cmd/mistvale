import {EXIT_Z,inVillageBounds} from './village-grid.js';
// One shared world contract for drawing, travel, spawning and saved coordinates.
// The previous land rectangle was 58 × 52 world units. This is 87 × 104 = 3×.
// 2026-10-03:棋盤格村莊往西擴大,世界西界 -30 → -54(地圖只放大不縮小)。threeXArea 保留原本 3 倍地圖的面積當下限。
export const WORLD={minX:-54,maxX:57,minZ:-45,maxZ:59,oldWidth:58,oldHeight:52,width:111,height:104,area:11544,threeXArea:9048,oldArea:3016,seed:349180};
export const REGIONS=[
 {id:'village',name:'暮影村',subtitle:'平原聚落',x:-5,z:3,color:'#bcb79a',description:'石板路、農田與獵人歸來的家。',enemy:'slime',risk:0},
 {id:'meadow',name:'向陽草原',subtitle:'草原 · 初階狩獵',x:17,z:3,color:'#86ad5a',description:'野花與羊群之間，史萊姆正在草叢裡聚集。',enemy:'slime',risk:1},
 {id:'forest',name:'橡木密林',subtitle:'森林 · 木材與獸皮',x:43,z:2,color:'#4d8350',description:'茂密樹冠、蕈菇與溪流，狼群在林間巡行。',enemy:'wolf',risk:1.15},
 {id:'taiga',name:'霜杉林地',subtitle:'針葉林 · 北方荒野',x:15,z:-23,color:'#487d70',description:'針葉樹與苔石覆蓋的冷涼森林。',enemy:'wolf',risk:1.25},
 {id:'snow',name:'白霜雪原',subtitle:'雪地 · 冰河與松林',x:8,z:-36,color:'#cee4df',description:'積雪堆在杉樹上，冰晶映出淡藍色晨光。',enemy:'golem',risk:1.5},
 {id:'mountain',name:'鐵脊山麓',subtitle:'山地 · 礦脈與洞穴',x:45,z:-29,color:'#a7a8a1',description:'層疊岩壁、鐵礦與古老礦坑，石巨人在此守望。',enemy:'golem',risk:1.65},
 {id:'desert',name:'赤金沙地',subtitle:'沙漠 · 仙人掌與遺跡',x:45,z:40,color:'#d7b778',description:'仙人掌與砂岩遺跡點綴暖色沙丘。',enemy:'golem',risk:1.4},
 {id:'birch',name:'白樺花原',subtitle:'白樺林 · 藥草與花海',x:7,z:43,color:'#a9bd68',description:'白樺樹、花海與溪流環繞南方小徑。',enemy:'slime',risk:1.1}
];
export const BRIDGES=[-24,3,26,46];
export const VILLAGE_BRIDGES=EXIT_Z;  // 出村口三條街正對三座溪橋(src/village-grid.js)
export function creekX(z){return 11.5+Math.sin(z*.13)*.65;}
export function riverX(z){return 26+Math.sin(z*.095)*4.4;}
export function inWorld(x,z){return Number.isFinite(x)&&Number.isFinite(z)&&x>=WORLD.minX+1&&x<=WORLD.maxX-1&&z>=WORLD.minZ+1&&z<=WORLD.maxZ-1;}
export function inVillage(x,z){return inVillageBounds(x,z);}
export function isBridge(x,z){return (Math.abs(x-riverX(z))<4.3&&BRIDGES.some(b=>Math.abs(z-b)<1.7))||(z>-27&&z<27&&Math.abs(x-creekX(z))<3.3&&VILLAGE_BRIDGES.some(b=>Math.abs(z-b)<1.7));}
export function isWater(x,z){return !isBridge(x,z)&&(Math.abs(x-riverX(z))<1.75||(z>-27&&z<27&&Math.abs(x-creekX(z))<1.1));}
export function walkable(x,z){return inWorld(x,z)&&!isWater(x,z);}
export function biomeAt(x,z){
 if(!inWorld(x,z))return 'ocean';
 if(isBridge(x,z))return 'bridge';
 if(isWater(x,z))return z<-29?'ice':'river';
 if(inVillage(x,z))return 'village';
 if(x<7&&z>=-32&&z<=-24)return 'forest';
 // 生態域邊界加中頻起伏:原本只有低頻正弦,遠看是長直線(雪原三角、沙漠斜帶)。
 const nx=x+Math.sin(z*.15)*3.1+Math.sin(z*.49)*.7+Math.sin(z*.27+x*.19)*2.2+Math.sin(x*.61-z*.23)*.9,nz=z+Math.sin(x*.13)*3.8+Math.cos(x*.37)*.8+Math.sin(x*.29-z*.17+2)*2.4+Math.cos(z*.57+x*.21)*1;
 if(nz<-29)return nx>31?'mountain':'snow';
 if(nx>34&&nz<-13)return 'mountain';
 if(nz<-17)return 'taiga';
 if(nx>31&&nz>19)return 'desert';
 if(nz>29)return 'birch';
 if(nx>31||(nx<-20&&nz<20))return 'forest';
 return 'meadow';
}
export function regionAt(x,z){const candidates=REGIONS.filter(r=>r.id!=='village');return inVillage(x,z)?REGIONS[0]:candidates.reduce((best,r)=>Math.hypot(x-r.x,z-r.z)<Math.hypot(x-best.x,z-best.z)?r:best,candidates[0]);}
export const BIOME_PALETTE={village:'#719b55',meadow:'#8caf5d',forest:'#356b3d',taiga:'#527c68',snow:'#d9e8df',mountain:'#a09e91',desert:'#e0bb73',birch:'#9fbd67',river:'#3395bd',ice:'#94cbd3',bridge:'#a77b50',ocean:'#3d7488'};
