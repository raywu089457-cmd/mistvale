// 村莊棋盤格(單一來源):建築預設位置、石板街道、村界、柵欄、出入口、街區用途都從這裡來。
// 2026-10-19 整個村子收攏成緊湊的棋盤:建築之間、最外圍建築到村界,都是 5 排地磚(GAP)。
// 街區中心的間距 = 最大的建築地基(城鎮大廳 4.4×3.6)+ GAP,所以每一對相鄰建築至少隔 5 排地磚。
// 欄 i=-2..1(西→東)、列 j=-2..1(北→南),i=j=0 是廣場(空的石板地)。
export const TILE=.5;                 // 一片地磚(石板)的邊長,世界單位;石板貼圖的一格 = 一片地磚
export const GAP=5*TILE;              // 五排地磚
export const CELL={w:4.4,d:3.6};      // 排版用的基準地基:所有建築裡最大的(城鎮大廳)
export const GRID={cx:-6.5,cz:5,pitchX:CELL.w+GAP,pitchZ:CELL.d+GAP,street:.8,cols:[-2,-1,0,1],rows:[-2,-1,0,1]};
export const blockCenter=(i,j)=>({x:GRID.cx+GRID.pitchX*i,z:GRID.cz+GRID.pitchZ*j});
// 街道中心線:每個街區的四邊(建築之間通道的正中)。
export const STREET_X=[...GRID.cols.map(i=>GRID.cx+GRID.pitchX*(i-.5)),GRID.cx+GRID.pitchX*(GRID.cols.at(-1)+.5)];
export const STREET_Z=[...GRID.rows.map(j=>GRID.cz+GRID.pitchZ*(j-.5)),GRID.cz+GRID.pitchZ*(GRID.rows.at(-1)+.5)];
// 村界 = 最外圈建築的地基再外推 GAP(5 排地磚)。村界上放木柵欄(FENCE,往內縮 .25),兩個出村口是柵欄的缺口。
const EDGE={minX:GRID.cx+GRID.pitchX*GRID.cols[0]-CELL.w/2,maxX:GRID.cx+GRID.pitchX*GRID.cols.at(-1)+CELL.w/2,
  minZ:GRID.cz+GRID.pitchZ*GRID.rows[0]-CELL.d/2,maxZ:GRID.cz+GRID.pitchZ*GRID.rows.at(-1)+CELL.d/2};
export const VILLAGE_BOUNDS={minX:EDGE.minX-GAP,maxX:EDGE.maxX+GAP,minZ:EDGE.minZ-GAP,maxZ:EDGE.maxZ+GAP};
export const FENCE={minX:VILLAGE_BOUNDS.minX+.25,maxX:VILLAGE_BOUNDS.maxX-.25,minZ:VILLAGE_BOUNDS.minZ+.25,maxZ:VILLAGE_BOUNDS.maxZ-.25};
export const EXIT_GAP=1.5;            // 出村口:柵欄缺口的半寬(缺口總寬 3 = 6 排地磚)
// 出村口只有兩個:畫面右下(東側界線)與左下(南側界線),各接一條街。
// 道路鋪到村界(edge)為止、切平;村外沒有路、自由走。out 是村外的導航出口點,不畫成路。
export const EXITS=[
  {id:'east',side:'east',x:FENCE.maxX,z:STREET_Z[3],out:{x:VILLAGE_BOUNDS.maxX+.8,z:STREET_Z[3]},street:{x:STREET_X.at(-1),z:STREET_Z[3]},edge:{x:VILLAGE_BOUNDS.maxX,z:STREET_Z[3]}},
  {id:'south',side:'south',x:STREET_X[3],z:FENCE.maxZ,out:{x:STREET_X[3],z:VILLAGE_BOUNDS.maxZ+.8},street:{x:STREET_X[3],z:STREET_Z.at(-1)},edge:{x:STREET_X[3],z:VILLAGE_BOUNDS.maxZ}}
];
// 街區用途。建築 id 對應 pixel-data 的 BUILDINGS;其他是村莊用地(只畫地面):plaza 是空的廣場,market 是空地,park 有一個池塘。
// 交易所在廣場西側,酒館、餐廳、旅館在南邊一排,鐵匠/強化/學院在北邊工坊區,
// 復活聖所、治療所在東北角;獵人小屋、委託所靠東門。
export const BLOCK_PLAN={
  '-2,-2':'enhancement','-1,-2':'forge',     '0,-2':'academy',   '1,-2':'sanctuary',
  '-2,-1':'training',   '-1,-1':'hall',      '0,-1':'clinic',    '1,-1':'bounty',
  '-2,0':'market',      '-1,0':'trading',    '0,0':'plaza',      '1,0':'house',
  '-2,1':'inn',         '-1,1':'restaurant', '0,1':'tavern',     '1,1':'park'
};
// 建築在街區裡的微調:棋盤對齊後不再微調(保留匯出給存檔與搬家邏輯用)。
export const BUILDING_NUDGE={};const NUDGE=BUILDING_NUDGE;
export const BUILDING_SLOTS=Object.fromEntries(Object.entries(BLOCK_PLAN).map(([k,use])=>{const [i,j]=k.split(',').map(Number),c=blockCenter(i,j),n=NUDGE[use]||{x:0,z:0};return [use,{x:c.x+n.x,z:c.z+n.z,i,j}];}));
export const BLOCKS=Object.entries(BLOCK_PLAN).map(([k,use])=>{const [i,j]=k.split(',').map(Number);return {i,j,use,...blockCenter(i,j)};});
export const blockAt=(x,z)=>{const i=Math.round((x-GRID.cx)/GRID.pitchX),j=Math.round((z-GRID.cz)/GRID.pitchZ);return BLOCKS.find(b=>b.i===i&&b.j===j)||null;};
export const inVillageBounds=(x,z)=>x>VILLAGE_BOUNDS.minX&&x<VILLAGE_BOUNDS.maxX&&z>VILLAGE_BOUNDS.minZ&&z<VILLAGE_BOUNDS.maxZ;
