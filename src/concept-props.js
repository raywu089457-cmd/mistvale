// 概念圖（assets/title.png，1254px）上的道具、圍籬、角色位置，座標是「物件底部中心」的概念圖像素。
// 執行時用 conceptToWorld 換成世界座標（跟 concept-ground.js 同一個對應：紀念碑 (-8,2) ↔ (640,613.6)，
// K=3.93 px/單位，等角 9:4.5）。改擺放時對著 title.png 量像素，不要直接寫世界座標。
const K=3.93,U0=640,V0=613.6;
export function conceptToWorld(u,v){const a=(u-U0)/(9*K)-10,b=(v-V0)/(4.5*K)-6;return{x:(a+b)/2,z:(b-a)/2};}

// [型別, u, v, 選項]；選項 s=倍率、f=左右翻、cls=獵人職業、who=村民
export const CONCEPT_PROPS=[
  // 左上修煉場：箭靶、木人、圍籬
  ['archeryTarget',160,198,{s:1}],['archeryTarget',312,122,{s:.9,f:1}],['dummy',228,238,{s:.9}],['dummy',262,206,{s:.8,f:1}],
  // 左上市集：大攤位、蔬果箱、麻袋、木箱
  ['stall',258,442,{s:1.45}],['crates',332,438,{s:.8}],['sacks',196,438,{s:.8}],['barrel',148,420,{s:.9}],['crates',398,492,{s:.7,f:1}],
  // 左中小攤位、花叢
  ['fruitStand',346,702,{s:1}],['flowerBush',438,690,{s:.8}],['flowerBush',470,655,{s:.6}],['barrels',300,735,{s:.8}],
  // 雕像四周：路燈、藍旗
  ['lamp',528,508],['lamp',772,532],['lamp',812,388],['lamp',878,655],['lamp',1072,650],
  ['villageBanner',522,640,{s:.95}],['villageBanner',742,618,{s:.95}],['villageBanner',718,500,{s:.95}],
  // 右上鐵匠鋪：鐵砧、木桶、柴堆、兵器架、山羊、花叢
  ['anvilStump',932,338,{s:.9}],['barrel',905,300,{s:.8}],['barrel',925,292,{s:.7}],['firewood',880,250,{s:.8}],
  ['weaponRack',1128,505,{s:1}],['weaponRack',1098,470,{s:.85,f:1}],['flowerBush',1062,492,{s:.6}],
  // 委託所兩側花叢
  ['flowerBush',862,715,{s:.6}],['flowerBush',1060,728,{s:.6}],
  // 下方：推車、花箱、木桶、灌木、河邊石、水桶
  ['handCart',832,1028,{s:.9,f:1}],['flowerBox',985,942,{s:.8}],['barrels',1128,990,{s:.8}],['flowerBush',872,1068,{s:.9}],['flowerBush',1022,1058,{s:.8}],
  ['riverRocks',905,1112,{s:.9}],['riverRocks',1000,1120,{s:.8,f:1}],['riverRocks',1135,1105,{s:.8}],['bucket',1102,1212,{s:.7}],
  // 左下酒館露台：桌椅、長凳、紫旗
  ['tableSet',182,1040,{s:1}],['tableSet',318,1010,{s:1,f:1}],['tableSet',478,948,{s:.9}],['bench',398,1050,{s:.8}],
  ['purpleBanner',590,962,{s:1}],['purpleBanner',500,1068,{s:.75}],
];

// 圍籬：從 (u1,v1) 到 (u2,v2) 一段一段排（每段 2 格）
export const CONCEPT_FENCES=[
  [96,452,272,522],[112,250,282,300],[858,372,995,470],[848,150,936,200],[1000,575,1254,628],[1010,522,1110,560],
  [440,775,560,790],[800,940,990,832],[930,960,1000,1030],[330,800,560,1062],
];

// 角色（純裝飾，原地待機）：cls=獵人職業圖集、who=村民圖集
export const CONCEPT_PEOPLE=[
  {cls:'ranger',u:256,v:112},{cls:'ranger',u:312,v:192},{who:'cat',u:380,v:140},{who:'dog',u:272,v:468},{who:'dog',u:405,v:405},
  {who:'merchant',u:352,v:418},{cls:'berserker',u:478,v:352},{cls:'darkknight',u:520,v:336},{cls:'paladin',u:566,v:338},
  {cls:'sorcerer',u:506,v:446},{who:'elder',u:338,v:512},{who:'child',u:420,v:530},{cls:'paladin',u:662,v:325},
  {cls:'sorcerer',u:722,v:372},{who:'smith',u:962,v:340},{cls:'paladin',u:1008,v:352,flip:true},{cls:'sorcerer',u:878,v:508},
  {cls:'sorcerer',u:1150,v:510},{who:'merchant',u:305,v:712},{cls:'berserker',u:602,v:665},{cls:'darkknight',u:692,v:770},
  {cls:'ranger',u:772,v:728},{cls:'berserker',u:804,v:835},{cls:'paladin',u:872,v:818},{cls:'ranger',u:952,v:708},
  {cls:'priest',u:962,v:898},{who:'child',u:1002,v:948},{cls:'darkknight',u:722,v:1018},{who:'farmer',u:1062,v:1192},
  {who:'maid',u:168,v:968},{who:'farmer',u:212,v:1028},{cls:'berserker',u:282,v:970},{cls:'priest',u:372,v:1000},{who:'elder',u:492,v:940},
];
