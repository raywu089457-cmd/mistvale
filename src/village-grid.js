// 村莊棋盤格(單一來源):建築預設位置、石板街道、柵欄、出入口、空地用途都從這裡來。
// 中央廣場(紀念碑 / 噴水池)固定在 (-8,2)。每個街區 10.5 單位見方,四周都是石板街;
// 一個街區放一棟建築或一種村莊用地(田、果園、市集、公園、水井廣場、畜欄…)。
// 欄 i=-3..1(西→東)、列 j=-2..2(北→南),i=j=0 是廣場。
export const GRID={cx:-8,cz:2,pitch:10.5,street:.8,cols:[-3,-2,-1,0,1],rows:[-2,-1,0,1,2]};
export const blockCenter=(i,j)=>({x:GRID.cx+GRID.pitch*i,z:GRID.cz+GRID.pitch*j});
// 街道中心線:每個街區的四邊。
export const STREET_X=[...GRID.cols.map(i=>GRID.cx+GRID.pitch*(i-.5)),GRID.cx+GRID.pitch*(GRID.cols.at(-1)+.5)];  // -44.75 … 7.75
export const STREET_Z=[...GRID.rows.map(j=>GRID.cz+GRID.pitch*(j-.5)),GRID.cz+GRID.pitch*(GRID.rows.at(-1)+.5)];  // -24.25 … 28.25
// 村莊範圍 = 最外圈街道再往外一點;東邊是柵欄(x≈9)與小溪。
export const VILLAGE_BOUNDS={minX:STREET_X[0]-1.4,maxX:9.4,minZ:STREET_Z[0]-1.4,maxZ:STREET_Z.at(-1)+1.4};
// 出村口:東側三條東西向街道直通過溪的橋(北門、正門、南門)。
export const EXIT_Z=[STREET_Z[0],STREET_Z[2],STREET_Z[4]];
export const PALISADE_X=9;
// 街區用途。建築 id 對應 pixel-data 的 BUILDINGS;其他是村莊用地(畫地面與擺設用)。
// 交易所/市集在廣場西側,酒館、餐廳、旅館在南邊一排,鐵匠/強化/學院在北邊工坊區,
// 復活聖所、治療所靠北門;獵人小屋、委託所靠正門。
export const BLOCK_PLAN={
  '-3,-2':'lumber',  '-2,-2':'enhancement','-1,-2':'forge',     '0,-2':'academy',   '1,-2':'sanctuary',
  '-3,-1':'training','-2,-1':'farm',       '-1,-1':'hall',      '0,-1':'clinic',    '1,-1':'bounty',
  '-3,0':'orchard',  '-2,0':'market',      '-1,0':'trading',    '0,0':'plaza',      '1,0':'house',
  '-3,1':'farm',     '-2,1':'inn',         '-1,1':'restaurant', '0,1':'tavern',     '1,1':'park',
  '-3,2':'pen',      '-2,2':'garden',      '-1,2':'well',       '0,2':'orchard',    '1,2':'pasture'
};
// 建築在街區裡的微調(委託所往南一點,靠正門那條街)。
const NUDGE={bounty:{x:0,z:.6}};
export const BUILDING_SLOTS=Object.fromEntries(Object.entries(BLOCK_PLAN).map(([k,use])=>{const [i,j]=k.split(',').map(Number),c=blockCenter(i,j),n=NUDGE[use]||{x:0,z:0};return [use,{x:c.x+n.x,z:c.z+n.z,i,j}];}));
export const BLOCKS=Object.entries(BLOCK_PLAN).map(([k,use])=>{const [i,j]=k.split(',').map(Number);return {i,j,use,...blockCenter(i,j)};});
export const blockAt=(x,z)=>{const i=Math.round((x-GRID.cx)/GRID.pitch),j=Math.round((z-GRID.cz)/GRID.pitch);return BLOCKS.find(b=>b.i===i&&b.j===j)||null;};
export const inVillageBounds=(x,z)=>x>VILLAGE_BOUNDS.minX&&x<VILLAGE_BOUNDS.maxX&&z>VILLAGE_BOUNDS.minZ&&z<VILLAGE_BOUNDS.maxZ;
