import {BUILDING_SLOTS,GRID,blockCenter} from './village-grid.js';
// 地下城入口固定在公園街區(1,1):蓋起來之後原本的池塘就讓給它。
const DUNGEON_SPOT=blockCenter(1,1);
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
 {id:'dungeon',name:'地下城入口',x:DUNGEON_SPOT.x,z:DUNGEON_SPOT.z,w:4,d:3.5,type:'dungeon',roof:'#756577',cost:{gold:380,wood:25,ore:60},desc:'派遣獵人挑戰地下城，逐層取得稀有資源。',effect:'三人小隊闖關探險'}
];
// 2026-10-24 遊俠(ranger)併入弓箭手(archer):兩個職業是同一個角色(PixelLab 788cd873),只留弓箭手;同日移除獵魔人(witchhunter)、加入刺客(assassin)。
// 舊存檔的遊俠、獵魔人讀檔時都轉成弓箭手(pixel-game.js restore;獵魔人也是遠程,弓箭手最接近)。
// 2026-10-30 使用者:「所有英雄走路速度都相同、遠程普A距離也相同」→ 走速統一 2.7(原本 2.25–3.1,平均約 2.7);
// 遠程射程統一 7.5(= 先前弓箭手的射程;法師 6、祭司 5.5 跟著拉到 7.5,仍小於被挑釁魔物的追擊範圍 PROVOKE.aggro 9)。
export const HERO_SPEED=2.7, RANGED_RANGE=7.5;
export const CLASSES = [
 {id:'berserker',name:'狂戰士',tag:'近戰 / 爆發',color:'#d77a58',hp:140,attack:19,defense:4,speed:HERO_SPEED,range:1.2,cost:120,desc:'揮舞巨劍的近戰獵人。'},
 {id:'paladin',name:'聖騎士',tag:'近戰 / 防禦',color:'#daaf48',hp:168,attack:15,defense:8,speed:HERO_SPEED,range:1.3,cost:150,desc:'以厚重鎧甲守護隊伍。'},
 // 2026-10-27 使用者要遠程射程拉遠:法師 4.5→6、弓箭手 5.5→7.5、祭司 4→5.5(各約 +33~38%)。
 // 上限考量:SIGHT 12 格(獵人看得到的距離)、被打的魔物會追到 PROVOKE.aggro 9 格 → 最遠 7.5 仍在魔物會反擊的範圍內,不會白打。
 // 傷害維持不變:遠程拉開距離(KITE)時不能出手,用損失的輸出換少挨打;近戰數值完全不動。
 {id:'sorcerer',name:'魔法師',tag:'遠程 / 魔法',color:'#b080ce',hp:84,attack:27,defense:1,speed:HERO_SPEED,range:RANGED_RANGE,cost:180,desc:'操縱元素，發射強大的魔法。'},
 {id:'archer',name:'弓箭手',tag:'遠程 / 連射',color:'#3fa7a0',hp:96,attack:18,defense:2,speed:HERO_SPEED,range:RANGED_RANGE,cost:160,desc:'背著大箭袋的輕裝射手，疾風箭雨可同時射穿三個目標。'},
 {id:'assassin',name:'刺客',tag:'近戰 / 暗殺',color:'#7a6a9c',hp:100,attack:23,defense:2,speed:HERO_SPEED,range:1.2,cost:160,desc:'披著兜帽的刺客，以匕首連刺快速解決魔物，暗影衝刺可重創單一目標。'},   // 2026-10-24 使用者要刺客回來:PixelLab 3d3020ce(assets/heroes/assassin,8 向走路＋攻擊/技能列),數值是新訂的
 // 2026-10-27 使用者要祭司能正常招募:原本只在 WANDER_ONLY 當流浪英雄(已移除)。放在最後 → 開局 5 人仍是前 5 職業,
 // 祭司由 offerNewClass 保證出現在招募欄第一位。素材是白袍金杖、法杖發光球(Bible §priest、assets/heroes/priest 攻擊列),
 // 所以改成遠程施法(原本的「紅斗篷短刃近戰」是舊素材的設定);pixel-world.js 早就把 priest 當遠程(後座/蓄力光)。
 // 數值:遠程化後下修生命/攻擊/防禦,定位在弓箭手與法師之間、以自療換輸出。
 {id:'priest',name:'祭司',tag:'遠程 / 恢復',color:'#b3434a',hp:104,attack:17,defense:3,speed:HERO_SPEED,range:RANGED_RANGE,cost:175,desc:'白袍金杖的祭司，從遠處擲出聖光球攻擊魔物，暗癒禱言會自動替射程內生命比例最低的隊友補血（先挑村裡招募的獵人）。'},
];
// 注意:CLASSES 的長度決定訪客與流浪英雄的擲骰映射(newVisitor / newWanderer),增減職業會讓決定性模擬整個重排。
// 招牌技能(真的遊戲機制):戰鬥中冷卻好就放,放完 lock 秒內不普攻(播完技能動畫)。
// kind:multi = 同時打 targets 個最近的魔物;aoe = 打目標與其 radius 內的魔物;single = 單體高倍率;heal = 回復自己;
// allyHeal = 不必在戰鬥中,冷卻好就替射程內「生命比例最低」的隊友補血(先挑招募的獵人,沒有才看流浪英雄;滿血的不補)。
export const SKILLS={
 berserker:{name:'旋風斬',kind:'aoe',cd:9,mult:1.5,radius:2.4,lock:.7,fx:'slash'},
 paladin:{name:'聖盾祈禱',kind:'heal',cd:12,heal:.25,lock:.7,fx:'holy'},
 sorcerer:{name:'流星火球',kind:'aoe',cd:10,mult:1.4,radius:2.6,lock:.8,fx:'spell'},
 archer:{name:'疾風箭雨',kind:'multi',cd:8,mult:1.3,targets:3,lock:.8,release:.32,fx:'gale'},
 assassin:{name:'暗影衝刺',kind:'single',cd:8,mult:2.4,lock:.6,fx:'slash'},
 priest:{name:'暗癒禱言',kind:'allyHeal',cd:10,heal:.28,lock:.7,fx:'holy',below:.9}   // 2026-10-30 使用者:牧師改成自動替範圍內 HP 最少的隊友補血,優先招募英雄
};
export const RARITIES=[{id:'normal',name:'普通',color:'#d3cab2',mult:1},{id:'rare',name:'稀有',color:'#6fbe8b',mult:1.08},{id:'superior',name:'超級稀有',color:'#6caeee',mult:1.18},{id:'heroic',name:'英雄',color:'#c184e1',mult:1.32},{id:'legendary',name:'傳說',color:'#efb955',mult:1.5}];
export const TRAITS=[{id:'swift',name:'快手',desc:'攻擊間隔縮短 10%'},{id:'stout',name:'壯碩',desc:'最大生命提高 15%'},{id:'cheerful',name:'樂天',desc:'心情消耗減半'},{id:'frugal',name:'節儉',desc:'生活需求消耗減少 15%'},{id:'brave',name:'勇敢',desc:'攻擊力提高 10%'}];
export const MATERIALS={wood:{name:'木材',price:2},ore:{name:'鐵礦',price:3},herb:{name:'藥草',price:2},cloth:{name:'亞麻布',price:2},flour:{name:'小麥粉',price:2},leather:{name:'獸皮',price:3}};
export const PRODUCTS={food:{name:'香烤麵包',building:'restaurant',need:'satiety',restore:75,price:12,cost:{flour:5},amount:10},drink:{name:'莓果飲品',building:'tavern',need:'mood',restore:75,price:10,cost:{herb:5},amount:10},bed:{name:'舒適床鋪',building:'inn',need:'stamina',restore:90,price:14,cost:{leather:3,cloth:2},amount:10},bandage:{name:'亞麻繃帶',building:'clinic',need:'hp',restore:80,price:10,cost:{cloth:5,herb:2},amount:10}};
export const RECIPES=[{id:'weapon',name:'精鐵武器',type:'weapon',price:85,cost:{ore:12,wood:6},bonus:7},{id:'armor',name:'皮革護甲',type:'armor',price:70,cost:{leather:10,cloth:4},bonus:4}];
export const DIFFICULTIES=[{id:0,name:'初級',mult:1,rebirths:0},{id:1,name:'普通',mult:1.7,rebirths:1},{id:2,name:'困難',mult:2.8,rebirths:3},{id:3,name:'專家',mult:4.5,rebirths:5},{id:4,name:'噩夢',mult:7,rebirths:10}];
export const HUNT_ZONE={x:18,z:-1,radius:8};
// 手動操控的攻擊節奏(秒)。動畫本身 = (攻擊列格數 − 出手格數) × 每格時間 + 命中停頓
// = 最長 (9−4)×0.075 + 0.07 ≈ 0.445;這裡取 0.45 蓋掉所有職業。
// 攻擊 CD 0.5 秒(兩次出手最短間隔);動作結束後再加 0.2 秒僵直,期間不能走。
export const PILOT_ATTACK={cd:0.5,anim:0.45,recover:0.2};
// 手動操控的法師魔法球(2026-10-25 使用者:「空打時候要朝攻擊方向發射魔法球,朝攻擊時候當下的朝向角度發射,
// 球體設定一個作用範圍,路徑上碰到的怪物要被攻擊到」):真的會飛的球,不再是出手瞬間就扣血。
// 方向:3.2 格內有魔物就朝牠(跟原本一樣自動瞄準),沒有就朝目前面向的角度(不吸附 8 方向)。
// 速度 12 格/秒(原本特效 0.25 秒飛 3.2 格),飛完法師射程(CLASSES sorcerer range,2026-10-27 起 6 格)就消失;
// 作用半徑 0.7 格(球本身約 0.15 格＋魔物身體約 0.55 格),路徑上碰到的每隻魔物各打一次(穿透)。
export const PILOT_ORB={speed:12,radius:.7};
// AI 獵人／流浪英雄出手後的短僵直(秒):這段時間不移動(收招感),但不受攻擊 CD 限制。
export const AI_ATTACK_LOCK=0.15;
// 遠程風箏(2026-10-27 使用者:「敵人靠近到一定距離後他要會自己拉開距離」):AI 獵人與流浪英雄的遠程職業(射程 ≥ 3)才有;
// 近戰職業、手動操控(pilot)完全不走這段。距離門檻都是「乘以自己的射程」。
// enter:最近的魔物進到 射程×0.4 以內就開始後撤(弓箭手 3、法師 2.4、祭司 2.2;都在魔物近身 1.7 之外)。
// exit:拉到 射程×0.65 以外(弓箭手 4.9、法師 3.9、祭司 3.6)才停 —— 進出門檻不同 = 遲滯,不會在邊界上一進一出抖動。
// minTime / maxTime:一次後撤至少走 0.35 秒、最多 1 秒(快的魔物追得上也不會一直逃、一直不出手)。
// cooldown:後撤結束後 2.5 秒內不再後撤,原地出手(保證拉開後真的有打,也讓快的魔物有機會咬到遠程)。
// stuckRest:被逼到牆角/區界走不了 → 2.5 秒內原地開打,不每幀重試(不抖動)。
// afterShot:出手後 0.45 秒(= 攻擊動畫全長,PILOT_ATTACK.anim)才開始走,免得攻擊動作還沒播完就滑步;同時也蓋過 AI_ATTACK_LOCK。
// windup:下一箭/法球再 0.55 秒內就要出手(畫面正在播蓄力;最長是弓箭手 7 格 × 0.075 = 0.525 秒)→ 先打完這一下再撤,
//   不然蓄力動作會在後撤時繼續播完(倒退滑步)。出手 → 收招 afterShot → 才開始走,節奏是「射一箭、退一步」。
// look:往前多探 0.6 格檢查牆/區界,貼牆時改走斜角或側面,不會一步一停。
export const KITE={enter:.4,exit:.65,minTime:.35,maxTime:1,cooldown:2.5,stuckRest:2.5,afterShot:.45,windup:.55,look:.6};
// 被打的魔物會反擊:最近 4 秒內挨過打,對「遠程」獵物的主動攻擊範圍至少 9 格(> 弓箭手射程 7.5)。
// 不然射程拉遠後,遠程站在小魔物的主動攻擊範圍(4~8.5 格)外放箭,魔物完全不還手。近戰獵物的判定不變。
export const PROVOKE={time:4,aggro:9};
// 遠程魔物(2026-10-30 使用者:「各種地形內選一隻怪物作為遠程攻擊怪」):每區一隻,站在射程內丟飛行物,不搶近身名額。
// range = 射程(格,主動攻擊範圍至少 range+1);every = 出手間隔(秒,近戰魔物是 1.8);speed = 飛行速度(格/秒);
// release = 攻擊動作開始到飛行物離手(秒);傷害在飛行物「打到」的那一刻才結算(半路上目標倒下、進了地下城就作廢)。
// shot = assets/ui/fx-mshots.png 的格(0 種子 1 孢子 2 苔泥 3 雪球 4 石彈 5 仙人掌刺 6 花粉光球 7 命中塵爆;l0veyou GPT Image 2 生);
// lob = 拋物線高度(世界像素,0 = 直線);size = 畫面大小(世界像素);spin = 飛行時旋轉(圓的東西),沒有就順著飛行方向。
export const MONSTER_RANGED={
 sprout:{range:5,every:2.3,speed:8,release:.25,shot:0,lob:3,size:9},           // 向陽草原 花芽妖:吐種子
 shroom:{range:4.5,every:2.4,speed:5.5,release:.25,shot:1,lob:4,size:11,spin:1}, // 暮林 蕈菇怪:噴孢子團
 moss:{range:5,every:2.6,speed:7,release:.3,shot:2,lob:10,size:12,spin:1},      // 寒杉林 苔蘚巨魔:扔苔泥塊
 snowman:{range:5.5,every:2.3,speed:8,release:.25,shot:3,lob:8,size:10,spin:1},  // 雪原 雪人哨兵:丟雪球
 kobold:{range:5.5,every:2.2,speed:10,release:.25,shot:4,lob:5,size:7,spin:1},   // 山地 礦穴地精:投石
 cactus:{range:5,every:2.4,speed:12,release:.2,shot:5,lob:0,size:12},           // 沙漠 仙人掌怪:射刺
 floraspirit:{range:5.5,every:2.3,speed:7,release:.25,shot:6,lob:2,size:11,spin:1}, // 白樺林 花妖精:花粉光球
};
export const MSHOT_IMPACT=7;
export const CAMP={x:GRID.cx,z:GRID.cz+.5};   // 營地:村中央的廣場(空的石板地)
export const SAVE_KEY='mistvale-pixel-v2';
export const LEGACY_LAYOUT_V15={hall:{x:-20,z:-10},trading:{x:-12,z:-7},restaurant:{x:-12,z:0},inn:{x:-20,z:11},tavern:{x:-3,z:11},clinic:{x:8,z:10},forge:{x:4,z:0},academy:{x:-4,z:-4},training:{x:-3,z:19},sanctuary:{x:7,z:-12},house:{x:-21,z:17},bounty:{x:4,z:18},enhancement:{x:-20,z:-16},dungeon:{x:19,z:-9.5}};
export const LEGACY_LAYOUT_V16={hall:{x:-20,z:-10},trading:{x:-12,z:-7},restaurant:{x:-12,z:0},inn:{x:-20,z:11},tavern:{x:-16,z:13},clinic:{x:5,z:10},forge:{x:4,z:0},academy:{x:1,z:-7},training:{x:-3,z:19},sanctuary:{x:5,z:-18},house:{x:-23,z:16},bounty:{x:5,z:17},enhancement:{x:-25,z:-17},dungeon:{x:19,z:-9.5}};
// v1.6 前的預設布局（概念圖重排前）：存檔還是這個布局就自動搬到新預設。
export const ART_LAYOUT_HISTORY=[{hall:{x:-17,z:-7},trading:{x:-24,z:0},restaurant:{x:-18,z:2},inn:{x:-20,z:11},tavern:{x:-10,z:14},clinic:{x:-23,z:16},forge:{x:-11,z:-15},academy:{x:-3,z:-15},training:{x:-26,z:-6},sanctuary:{x:5,z:-18},house:{x:5,z:10},bounty:{x:1,z:1},enhancement:{x:-16,z:20},dungeon:{x:19,z:-9.5}}];
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
// 2026-10-19 村莊收攏成緊湊棋盤、野外縮小一半:棋盤格第一版(街區間距 10.5)的預設佈局也記進歷史,存檔還是這個布局就搬到新預設。
export const LEGACY_LAYOUT_V17={hall:{x:-18.5,z:-8.5},trading:{x:-18.5,z:2},restaurant:{x:-18.5,z:12.5},inn:{x:-29,z:12.5},tavern:{x:-8,z:12.5},clinic:{x:-8,z:-8.5},forge:{x:-18.5,z:-19},academy:{x:-8,z:-19},training:{x:-39.5,z:-8.5},sanctuary:{x:2.5,z:-19},house:{x:2.5,z:2},bounty:{x:2.5,z:-7.9},enhancement:{x:-29,z:-19},dungeon:{x:19,z:-9.5}};
ART_LAYOUT_HISTORY.push(LEGACY_LAYOUT_V17);
for(const b of BUILDINGS){const slot=BUILDING_SLOTS[b.id];if(slot&&b.id!=='dungeon'){b.x=slot.x;b.z=slot.z;}}

export const LEGACY_LAYOUT_V14={"hall": {"x": -5.0, "z": -8.0}, "trading": {"x": -12.0, "z": -7.0}, "restaurant": {"x": -12.0, "z": 0.0}, "inn": {"x": -12.0, "z": 7.0}, "tavern": {"x": -4.0, "z": 7.0}, "clinic": {"x": 4.0, "z": 7.0}, "forge": {"x": 4.0, "z": 0.0}, "academy": {"x": -4.0, "z": 0.0}, "training": {"x": -3.0, "z": 14.0}, "sanctuary": {"x": 4.0, "z": -8.0}, "house": {"x": -12.0, "z": 14.0}, "bounty": {"x": 5.0, "z": 14.0}, "enhancement": {"x": -12.0, "z": -14.0}, "dungeon": {"x": 24, "z": -11}};
