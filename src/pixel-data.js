import {BUILDING_SLOTS} from './village-grid.js';
export const BUILDINGS = [
 {id:'hall',name:'城鎮大廳',x:-16.5,z:-6.5,w:4.4,d:3.6,type:'hall',roof:'#b9543e',cost:{gold:350,wood:45,ore:25},desc:'村莊的中心。升級後開放更高等級的設施。',effect:'其他建築的等級上限'},
 {id:'trading',name:'交易所',x:-21.7,z:3.9,w:4,d:3.5,type:'trading',roof:'#427dc7',cost:{gold:160,wood:30,ore:10},desc:'發布收購委託，用村莊金幣向獵人購買戰利品，補充生產材料。',effect:'獵人出售材料 → 村莊收購'},
 {id:'restaurant',name:'餐廳',x:-12.8,z:10.8,w:4,d:3.5,type:'restaurant',roof:'#427dc7',cost:{gold:150,wood:25,ore:5},desc:'用小麥粉製作餐點。飢餓的獵人會前來購買食物。',effect:'餐點恢復飽食度',product:'food'},
 {id:'inn',name:'旅館',x:-21,z:13,w:4.3,d:3.5,type:'inn',roof:'#427dc7',cost:{gold:180,wood:35,ore:5},desc:'準備舒適床鋪，讓疲憊的獵人休息並恢復精力。',effect:'床鋪恢復精力',product:'bed'},
 {id:'tavern',name:'酒館',x:-4.6,z:18.1,w:4,d:3.4,type:'tavern',roof:'#9767bb',cost:{gold:160,wood:25,ore:10},desc:'製作飲品，讓战鬥中情緒低落的獵人重新振作。',effect:'飲品恢復心情',product:'drink'},
 {id:'clinic',name:'治療所',x:-23,z:20,w:4,d:3.4,type:'clinic',roof:'#b85c62',cost:{gold:150,wood:20,ore:15},desc:'準備繃帶，治療負傷的獵人。傷者會自動返村接受治療。',effect:'繃帶恢復生命',product:'bandage'},
 {id:'forge',name:'鐵匠鋪',x:-9.6,z:-13.1,w:4,d:3.3,type:'forge',roof:'#626d98',cost:{gold:220,wood:25,ore:30},desc:'用戰利品製造裝備；獵人購買後，村莊會收到貨款。',effect:'製作、販售武器與護甲'},
 {id:'academy',name:'學院',x:-2.5,z:-10.5,w:3.5,d:3.2,type:'academy',roof:'#6555ad',cost:{gold:240,wood:30,ore:25},desc:'教授戰鬥技能與轉世特性。每位獵人都可以走出不同的成長路線。',effect:'技能提高攻擊力'},
 {id:'training',name:'修煉地',x:-25.6,z:-4.6,w:4,d:3.5,type:'training',roof:'#91704b',cost:{gold:220,wood:35,ore:15},desc:'支付訓練費用，讓指定獵人快速獲得經驗。',effect:'獵人訓練獲得經驗'},
 {id:'sanctuary',name:'復活聖所',x:5,z:-18,w:3.4,d:3.2,type:'sanctuary',roof:'#a7b4cc',cost:{gold:260,wood:20,ore:35},desc:'復活倒下的獵人，也見證滿百級獵人的轉世。',effect:'死亡復活／100 級轉世'},
 {id:'house',name:'獵人小屋',x:4.6,z:0.6,w:3.6,d:3.2,type:'house',roof:'#438eba',cost:{gold:180,wood:40,ore:10},desc:'為前來村莊的冒險者提供居所。升級可增加獵人上限。',effect:'每級增加 2 位獵人名額'},
 {id:'bounty',name:'委託所',x:-1.2,z:-0.5,w:3.2,d:3,type:'bounty',roof:'#cc9c39',cost:{gold:170,wood:25,ore:10},desc:'追蹤獵魔委託並領取完成獎勵。',effect:'討伐委託與章節目標'},
 {id:'enhancement',name:'強化精煉所',x:-16,z:20,w:4,d:3.2,type:'enhancement',roof:'#bd5c43',cost:{gold:300,wood:30,ore:45},desc:'消耗村莊資源，強化獵人武器；最高可達 +10。',effect:'裝備每次強化提升攻擊'},
 {id:'dungeon',name:'地下城入口',x:24,z:-11,w:4,d:3.5,type:'dungeon',roof:'#756577',cost:{gold:380,wood:25,ore:60},desc:'派遣獵人挑戰地下城，逐層取得稀有資源。',effect:'三人小隊闖關探險'}
];
export const CLASSES = [
 {id:'berserker',name:'狂戰士',tag:'近戰 / 爆發',color:'#d77a58',hp:140,attack:19,defense:4,speed:2.65,range:1.2,cost:120,desc:'揮舞巨劍的近戰獵人。'},
 {id:'ranger',name:'遊俠',tag:'遠程 / 迅捷',color:'#72aa58',hp:92,attack:20,defense:2,speed:3,range:5,cost:150,desc:'從遠處以箭矢精準攻擊。'},
 {id:'paladin',name:'聖騎士',tag:'近戰 / 防禦',color:'#daaf48',hp:168,attack:15,defense:8,speed:2.25,range:1.3,cost:150,desc:'以厚重鎧甲守護隊伍。'},
 {id:'sorcerer',name:'魔法師',tag:'遠程 / 魔法',color:'#b080ce',hp:84,attack:27,defense:1,speed:2.4,range:4.5,cost:180,desc:'操縱元素，發射強大的魔法。'},
 {id:'archer',name:'弓箭手',tag:'遠程 / 連射',color:'#3fa7a0',hp:96,attack:18,defense:2,speed:2.9,range:5.5,cost:160,desc:'背著大箭袋的輕裝射手，疾風箭雨可同時射穿三個目標。'},
 {id:'witchhunter',name:'獵魔人',tag:'遠程 / 獵魔',color:'#3f7f86',hp:104,attack:22,defense:3,speed:2.8,range:4.8,cost:170,desc:'戴羽飾獵帽、手持連弩的獵魔人，銀弩矢專破魔物要害。'}
];
// 招牌技能(真的遊戲機制):戰鬥中冷卻好就放,放完 lock 秒內不普攻(播完技能動畫)。
// kind:multi = 同時打 targets 個最近的魔物;aoe = 打目標與其 radius 內的魔物;single = 單體高倍率;heal = 回復自己。
export const SKILLS={
 berserker:{name:'旋風斬',kind:'aoe',cd:9,mult:1.5,radius:2.4,lock:.7,fx:'slash'},
 ranger:{name:'穿心箭',kind:'single',cd:8,mult:2.3,lock:.6,fx:'arrow'},
 paladin:{name:'聖盾祈禱',kind:'heal',cd:12,heal:.25,lock:.7,fx:'holy'},
 sorcerer:{name:'流星火球',kind:'aoe',cd:10,mult:1.4,radius:2.6,lock:.8,fx:'spell'},
 witchhunter:{name:'銀弩獵殺',kind:'single',cd:9,mult:2.6,lock:.6,fx:'arrow'},
 archer:{name:'疾風箭雨',kind:'multi',cd:8,mult:1.3,targets:3,lock:.8,release:.32,fx:'gale'}
};
export const RARITIES=[{id:'normal',name:'普通',color:'#d3cab2',mult:1},{id:'rare',name:'稀有',color:'#6fbe8b',mult:1.08},{id:'superior',name:'超級稀有',color:'#6caeee',mult:1.18},{id:'heroic',name:'英雄',color:'#c184e1',mult:1.32},{id:'legendary',name:'傳說',color:'#efb955',mult:1.5}];
export const TRAITS=[{id:'swift',name:'快手',desc:'攻擊間隔縮短 10%'},{id:'stout',name:'壯碩',desc:'最大生命提高 15%'},{id:'cheerful',name:'樂天',desc:'心情消耗減半'},{id:'frugal',name:'節儉',desc:'生活需求消耗減少 15%'},{id:'brave',name:'勇敢',desc:'攻擊力提高 10%'}];
export const MATERIALS={wood:{name:'木材',price:2},ore:{name:'鐵礦',price:3},herb:{name:'藥草',price:2},cloth:{name:'亞麻布',price:2},flour:{name:'小麥粉',price:2},leather:{name:'獸皮',price:3}};
export const PRODUCTS={food:{name:'香烤麵包',building:'restaurant',need:'satiety',restore:75,price:12,cost:{flour:5},amount:10},drink:{name:'莓果飲品',building:'tavern',need:'mood',restore:75,price:10,cost:{herb:5},amount:10},bed:{name:'舒適床鋪',building:'inn',need:'stamina',restore:90,price:14,cost:{leather:3,cloth:2},amount:10},bandage:{name:'亞麻繃帶',building:'clinic',need:'hp',restore:80,price:10,cost:{cloth:5,herb:2},amount:10}};
export const RECIPES=[{id:'weapon',name:'精鐵武器',type:'weapon',price:85,cost:{ore:12,wood:6},bonus:7},{id:'armor',name:'皮革護甲',type:'armor',price:70,cost:{leather:10,cloth:4},bonus:4}];
export const DIFFICULTIES=[{id:0,name:'初級',mult:1,rebirths:0},{id:1,name:'普通',mult:1.7,rebirths:1},{id:2,name:'困難',mult:2.8,rebirths:3},{id:3,name:'專家',mult:4.5,rebirths:5},{id:4,name:'噩夢',mult:7,rebirths:10}];
export const HUNT_ZONE={x:18,z:-1,radius:8};
export const CAMP={x:-8,z:5.5};
export const SAVE_KEY='mistvale-pixel-v2';
export const LEGACY_LAYOUT_V15={hall:{x:-20,z:-10},trading:{x:-12,z:-7},restaurant:{x:-12,z:0},inn:{x:-20,z:11},tavern:{x:-3,z:11},clinic:{x:8,z:10},forge:{x:4,z:0},academy:{x:-4,z:-4},training:{x:-3,z:19},sanctuary:{x:7,z:-12},house:{x:-21,z:17},bounty:{x:4,z:18},enhancement:{x:-20,z:-16},dungeon:{x:24,z:-11}};
export const LEGACY_LAYOUT_V16={hall:{x:-20,z:-10},trading:{x:-12,z:-7},restaurant:{x:-12,z:0},inn:{x:-20,z:11},tavern:{x:-16,z:13},clinic:{x:5,z:10},forge:{x:4,z:0},academy:{x:1,z:-7},training:{x:-3,z:19},sanctuary:{x:5,z:-18},house:{x:-23,z:16},bounty:{x:5,z:17},enhancement:{x:-25,z:-17},dungeon:{x:24,z:-11}};
// v1.6 前的預設布局（概念圖重排前）：存檔還是這個布局就自動搬到新預設。
export const ART_LAYOUT_HISTORY=[{hall:{x:-17,z:-7},trading:{x:-24,z:0},restaurant:{x:-18,z:2},inn:{x:-20,z:11},tavern:{x:-10,z:14},clinic:{x:-23,z:16},forge:{x:-11,z:-15},academy:{x:-3,z:-15},training:{x:-26,z:-6},sanctuary:{x:5,z:-18},house:{x:5,z:10},bounty:{x:1,z:1},enhancement:{x:-16,z:20},dungeon:{x:24,z:-11}}];
let artLayout={...LEGACY_LAYOUT_V16};
for(const change of [
 {bounty:{x:0,z:6}},
 {restaurant:{x:-18,z:2}},
 {forge:{x:-11,z:-15}},
 {trading:{x:-24,z:-3}},
 {tavern:{x:-10,z:14}},
 {clinic:{x:-23,z:16},house:{x:5,z:10}},
 {academy:{x:-3,z:-19}},
 {academy:{x:-5,z:-12}},
 {academy:{x:-3,z:-15}},
 {training:{x:-26,z:-12}},
 {training:{x:-26,z:-6},trading:{x:-24,z:0}},
 {enhancement:{x:-16,z:20}}
]){artLayout={...artLayout,...change};ART_LAYOUT_HISTORY.push(artLayout);}
// 獵人小屋舊預設 (6.2,4.2) 擋在東門路上 → 移到路北 (4.6,0.6),門朝路。舊預設的存檔自動搬。
ART_LAYOUT_HISTORY.push(Object.fromEntries(BUILDINGS.map(b=>[b.id,b.id==='house'?{x:6.2,z:4.2}:{x:b.x,z:b.z}])));
// 2026-10-03 棋盤格村莊:前一版(概念圖構圖)預設也記進歷史,再把預設位置改成棋盤街區中心(src/village-grid.js)。
ART_LAYOUT_HISTORY.push(Object.fromEntries(BUILDINGS.map(b=>[b.id,{x:b.x,z:b.z}])));
for(const b of BUILDINGS){const slot=BUILDING_SLOTS[b.id];if(slot&&b.id!=='dungeon'){b.x=slot.x;b.z=slot.z;}}

export const LEGACY_LAYOUT_V14={"hall": {"x": -5.0, "z": -8.0}, "trading": {"x": -12.0, "z": -7.0}, "restaurant": {"x": -12.0, "z": 0.0}, "inn": {"x": -12.0, "z": 7.0}, "tavern": {"x": -4.0, "z": 7.0}, "clinic": {"x": 4.0, "z": 7.0}, "forge": {"x": 4.0, "z": 0.0}, "academy": {"x": -4.0, "z": 0.0}, "training": {"x": -3.0, "z": 14.0}, "sanctuary": {"x": 4.0, "z": -8.0}, "house": {"x": -12.0, "z": 14.0}, "bounty": {"x": 5.0, "z": 14.0}, "enhancement": {"x": -12.0, "z": -14.0}, "dungeon": {"x": 24, "z": -11}};
