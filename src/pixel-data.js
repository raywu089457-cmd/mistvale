import {BUILDING_SLOTS,GRID,blockCenter} from './village-grid.js';
// 地下城入口固定在公園街區(1,1):蓋起來之後原本的池塘就讓給它。
const DUNGEON_SPOT=blockCenter(1,1);
export const BUILDINGS = [
 {id:'hall',name:'城鎮大廳',x:-16.5,z:-6.5,w:4.4,d:3.6,type:'hall',roof:'#b9543e',cost:{gold:350,wood:45,ore:25},desc:'村莊的中心。升級後開放更高等級的設施。',effect:'其他建築的等級上限'},
 {id:'trading',name:'交易所',x:-21.7,z:3.9,w:4,d:3.5,type:'trading',roof:'#427dc7',cost:{gold:160,wood:30,ore:10},desc:'發布收購委託，用村莊金幣向獵人購買戰利品，補充生產材料。',effect:'獵人出售材料 → 村莊收購'},
 {id:'restaurant',name:'餐廳',x:-12.8,z:10.8,w:4,d:3.5,type:'restaurant',roof:'#427dc7',cost:{gold:150,wood:25,ore:5},desc:'用小麥粉製作餐點。飢餓的獵人會前來購買食物。',effect:'餐點恢復飽食度',product:'food'},
 {id:'inn',name:'旅館',x:-21,z:13,w:4.3,d:3.5,type:'inn',roof:'#427dc7',cost:{gold:180,wood:35,ore:5},desc:'準備舒適床鋪，讓疲憊的獵人休息並恢復精力。',effect:'床鋪恢復精力',product:'bed'},
 {id:'tavern',name:'酒館',x:-4.6,z:18.1,w:4,d:3.4,type:'tavern',roof:'#9767bb',cost:{gold:160,wood:25,ore:10},desc:'製作飲品，讓戰鬥中情緒低落的獵人重新振作。',effect:'飲品恢復心情',product:'drink'},
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
 // 2026-11-14 exp/lpc-hero 實驗:第 7 個職業「旅人」。素材來自 LPC(Universal-LPC-Spritesheet-Character-Generator,
 // 美術 CC-BY-SA 3.0 + GPL 3.0 雙授權;授權檔在 assets/heroes/traveler-LICENSE/)。
 // 圖集 assets/heroes/traveler.png + traveler.json 是 LPC 64px 格子轉成的 13 列動作表(idle/walk/attack 各有上/下/側,
 // 另有 hurt/death/victory/skill);4 向由 dir4 依 action 名取 row,左向自動鏡像,紙娃娃沒有這個職業的身體 → 直接畫圖集。
 {id:'traveler',name:'旅人',tag:'近戰 / 機動',color:'#9a7b4f',hp:118,attack:20,defense:3,speed:HERO_SPEED,range:1.2,cost:140,desc:'赤手空拳走遍山野的旅人，出拳比刀劍更快；震地掌可同時震開身邊的魔物。'},
];
// 注意:CLASSES 的長度決定訪客與流浪英雄的擲骰映射(newVisitor / newWanderer),增減職業會讓決定性模擬整個重排。
// 招牌技能(真的遊戲機制):戰鬥中冷卻好就放,放完 lock 秒內不普攻(播完技能動畫)。
// kind:multi = 同時打 targets 個最近的魔物;aoe = 打目標與其 radius 內的魔物;single = 單體高倍率;heal = 回復自己;
// allyHeal = 不必在戰鬥中,冷卻好就替射程內「生命比例最低」的隊友補血(先挑招募的獵人,沒有才看流浪英雄;滿血的不補)。
export const SKILLS={
 berserker:{name:'旋風斬',kind:'aoe',cd:9,mult:1.5,radius:2.4,lock:.7,fx:'slash'},
 paladin:{name:'聖盾祈禱',kind:'heal',cd:12,heal:.25,lock:.7,fx:'holy'},
 // 2026-11-03 使用者:法師第一招換成火龍捲(pixelfx 整張 103 幀技能表,逐幀播放);傷害比原本的流星火球高一點、CD 長一點
 sorcerer:{name:'火龍捲',kind:'aoe',cd:14,mult:1.55,radius:3,lock:1,release:.55,fx:'cinder'},
 archer:{name:'疾風箭雨',kind:'multi',cd:8,mult:1.3,targets:3,lock:.8,release:.32,fx:'gale'},
 assassin:{name:'暗影衝刺',kind:'single',cd:8,mult:2.4,lock:.6,fx:'slash'},
 priest:{name:'暗癒禱言',kind:'allyHeal',cd:10,heal:.28,lock:.7,fx:'holy',below:.9},   // 2026-10-30 使用者:牧師改成自動替範圍內 HP 最少的隊友補血,優先招募英雄
 // 旅人:震地掌,近身 AOE。沒有專屬 -fx 特效表,走 pixel-world 的通用分支(fx:'slash' → 命中當下畫白色衝擊弧)。
 traveler:{name:'震地掌',kind:'aoe',cd:9,mult:1.45,radius:2.2,lock:.7,fx:'slash'}
};
export const RARITIES=[{id:'normal',name:'普通',color:'#d3cab2',mult:1},{id:'rare',name:'稀有',color:'#6fbe8b',mult:1.08},{id:'superior',name:'超級稀有',color:'#6caeee',mult:1.18},{id:'heroic',name:'英雄',color:'#c184e1',mult:1.32},{id:'legendary',name:'傳說',color:'#efb955',mult:1.5}];
// 2026-11-18 晉升:村莊金幣＋星晶把獵人的稀有度往上升一階(後期金幣、星晶的出口;只改 h.rarity,存檔格式不變)。
// key = 升上去的那一階。普通 → 傳說全程 40,500 金＋735 星晶(星晶跟金幣約 1:50,兩種一起用完)。
export const PROMOTE={rare:{gold:1500,gems:30},superior:{gold:4000,gems:75},heroic:{gold:10000,gems:180},legendary:{gold:25000,gems:450}};
export const TRAITS=[{id:'swift',name:'快手',desc:'攻擊間隔縮短 10%'},{id:'stout',name:'壯碩',desc:'最大生命提高 15%'},{id:'cheerful',name:'樂天',desc:'心情消耗減半'},{id:'frugal',name:'節儉',desc:'生活需求消耗減少 15%'},{id:'brave',name:'勇敢',desc:'攻擊力提高 10%'}];
// 2026-11-16 交易所商人直購:村莊金幣後期大量閒置(14 天模擬 5000~8000 金沒地方花),材料卻卡住升級。
// 交易所可以直接向行商買材料,單價 = 收購價 × markup;交易所每升一級便宜 step,最低 floor 倍(Lv.1 6 倍、Lv.5 4 倍)。
// 比向獵人收購貴很多,所以只是「卡關時補差額」的金幣出口,不會取代收購循環。
export const MERCHANT={markup:6,step:.5,floor:4,sell:.5,sellLot:50,sellKeep:100,gemPrice:250,gemLot:10,gemTrading:5};   // gem*:2026-11-18 後期金幣出口:交易所 Lv.5 起向行商買星晶(每顆 250 金,10 顆一組;比晉升的金幣:星晶 ≈ 53:1 貴很多,自己賺仍然划算)   // sell:多的材料半價賣給行商(低於收購價,不會變成買賣迴圈);庫存 ≥ sellLot+sellKeep 才顯示賣出鈕
// 2026-11-17 持續收購的金庫保留額:持續收購只花「金庫 − 保留額」的部分(一般委託照舊可花到 0,玩家明確下的單)。
// 保留額 = base + perHall × (大廳等級 − 1) → Lv.1 500、Lv.2 1000 … Lv.5 2500。
// 依據:大廳 Lv.h 時其他建築最高可到 h+1,玩家回來最常做的是「把一棟建築從 Lv.h 升到 h+1」,
// 中位數建築(基礎 220 金,×2.1/級)這一步要 220/462/970/2037/4279 金 → 保留額在 Lv.1–4 大約夠付一次升級的金幣部分,
// Lv.5 時金幣收入已經很高(8 小時離線 10 萬以上),不必再追上指數成長。不新增存檔欄位。
// 2026-11-18 保留額固定 500:原本大廳 Lv.5 要留 2,500,金庫常常低於這條線,持續收購整段停擺、獵人背包堆滿材料,玩家看起來就是「持續收購失效」。
export const TRADE_RESERVE={base:500,perHall:0};
export const MATERIALS={wood:{name:'木材',price:2},ore:{name:'鐵礦',price:3},herb:{name:'藥草',price:2},cloth:{name:'亞麻布',price:2},flour:{name:'小麥粉',price:2},leather:{name:'獸皮',price:3}};
export const PRODUCTS={food:{name:'香烤麵包',building:'restaurant',need:'satiety',restore:75,price:12,cost:{flour:5},amount:10},drink:{name:'莓果飲品',building:'tavern',need:'mood',restore:75,price:10,cost:{herb:5},amount:10},bed:{name:'舒適床鋪',building:'inn',need:'stamina',restore:90,price:14,cost:{leather:3,cloth:2},amount:10},bandage:{name:'亞麻繃帶',building:'clinic',need:'hp',restore:80,price:10,cost:{cloth:5,herb:2},amount:10}};
// 2026-11-13 六格裝備(docs/PAPERDOLL-EQUIPMENT-6.md §4):武器 + 頭盔/胸甲/腰帶/腿甲/靴子/手套。
// type = 裝備格名(state.gearStock / h.equipment 的 key)。舊存檔的 armor 只有一件,載入時視為六件全穿(見 pixel-game restore)。
// weapon 用 bonus 當攻擊加成;六件防具用 hp/def,全套合計 生命 +50、防禦 +10(舊皮革護甲是 +28/+4)。
export const GEAR_SLOTS=['helm','chest','belt','legs','boots','gloves'];
export const EQUIP_SLOTS=['weapon',...GEAR_SLOTS];
export const RECIPES=[
  {id:'weapon',name:'精鐵武器',type:'weapon',slotName:'武器',price:85,cost:{ore:12,wood:6},bonus:7},
  {id:'helm',name:'頭盔',type:'helm',slotName:'頭盔',price:90,cost:{cloth:4,ore:6},bonus:2,hp:6,def:2},
  {id:'chest',name:'胸甲',type:'chest',slotName:'胸甲',price:140,cost:{ore:10,leather:6},bonus:3,hp:22,def:3},
  {id:'belt',name:'腰帶',type:'belt',slotName:'腰帶',price:70,cost:{leather:4},bonus:1,hp:4,def:1},
  {id:'legs',name:'腿甲',type:'legs',slotName:'腿甲',price:110,cost:{ore:6,cloth:4},bonus:2,hp:10,def:2},
  {id:'boots',name:'靴子',type:'boots',slotName:'靴子',price:70,cost:{leather:4},bonus:1,hp:4,def:1},
  {id:'gloves',name:'手套',type:'gloves',slotName:'手套',price:60,cost:{cloth:3,leather:2},bonus:1,hp:4,def:1},
];
// 2026-11-16 裝備階級(Ⅰ–Ⅴ):鐵匠鋪 Lv.N 才能鍛造第 N 階(最高 5)。獵人回村時,庫存裡有比自己身上更高階、又買得起的,就換新的
// ——Kairosoft 村莊經營的主要收入循環:設施升級 → 店裡賣更好的裝備 → 冒險者把賺來的錢花回村裡。
// 以前每格只能買一次,14 天模擬每位獵人身上閒置 2000 金。
// 2026-11-17 併入裝備物品化(存檔 v4):階級是鐵匠鋪升級件(tier='craft')物品實例上的 grade 欄位({uid,itemId,grade});
// 換下來的舊件跟初始件一樣進村莊倉庫(可賣/可拆,售價與分解量照該階材料算,見 gearItemView)。
// price/cost/stat/def 是對第 1 階(上面 RECIPES 的數值)的倍率;材料無條件進位,攻擊/生命/防禦四捨五入。
export const GEAR_TIER_MAX=5;
// 2026-11-16 平衡(progression-sim 5 個 seed):原本售價 ×12、材料只 ×3,鍛造幾乎純賺 → 第 15 天就把全村升滿、金庫堆到上萬。
// 材料倍率拉高到 ×6(高階要靠行商補料,金幣才有地方花)、售價降到 ×9.5(獵人仍有東西可買)。
export const GEAR_TIERS=[
  {tier:1,numeral:'Ⅰ',price:1,cost:1,stat:1,def:1},
  {tier:2,numeral:'Ⅱ',price:2.2,cost:2,stat:1.6,def:1.5},
  {tier:3,numeral:'Ⅲ',price:4,cost:3,stat:2.3,def:2},
  {tier:4,numeral:'Ⅳ',price:6.5,cost:4.5,stat:3.1,def:2.5},
  {tier:5,numeral:'Ⅴ',price:9.5,cost:6,stat:4,def:3},
];
// 某一格某一階的完整配方(名稱帶羅馬數字、售價、材料、數值)。recipe 可以是 RECIPES 的物件或 id;tier 會夾在 1..GEAR_TIER_MAX。
export function gearAt(recipe,tier=1){
  const r=typeof recipe==='string'?RECIPES.find(x=>x.id===recipe):recipe;if(!r)return null;
  const t=GEAR_TIERS[Math.min(GEAR_TIER_MAX,Math.max(1,Math.floor(Number(tier))||1))-1];
  return{...r,baseName:r.name,tier:t.tier,numeral:t.numeral,name:`${r.name} ${t.numeral}`,price:Math.round(r.price*t.price),
    cost:Object.fromEntries(Object.entries(r.cost).map(([k,v])=>[k,Math.ceil(v*t.cost)])),
    bonus:Math.round(r.bonus*t.stat),...(r.hp?{hp:Math.round(r.hp*t.stat),def:Math.round(r.def*t.def)}:{})};
}
// ── 2026-11-15 裝備物品化(使用者:「把每個職業目前穿的裝備設定新招募角色初始裝備穿上裝備欄位,可以被脫下出售或分解或存放倉庫」)
// 每件裝備都是獨立物品:新招募的獵人自動穿上該職業的 starter 七件套(武器 + 六格防具),
// stats 直接加進 updateStats(武器 atk、防具 hp/def);look 是 HeroLoom 紙娃娃的外觀部件,脫下就會消失。
// tier='starter' 是初始套裝:2026-11-16 併入 5024(六格 + 存檔 v4)時改成 0 數值,只有外觀/售價/分解材料 →
// 新獵人開局數值跟 5024「沒有裝備」完全一樣(5024 新獵人本來就是六格全空);數值只來自鐵匠鋪升級件。
// tier='craft' 是鐵匠鋪可製作的升級件(對應原本 RECIPES 的數值,單件比 starter 強)。
// 出售價 sell、分解 salvage 都是物品自帶;倉庫(state.gearStorage)只放物品實例 {uid,itemId}。
export const EQUIPMENT={
  // 弓箭手(森林遊俠):短髮、綠布上衣、棕皮褲靴、綠披風、獵弓

  archer_bow:{id:'archer_bow',name:'獵弓',slot:'weapon',classId:'archer',tier:'starter',price:40,sell:16,salvage:{wood:3,leather:1},stats:{atk:0,hp:0,def:0},look:{weapon:'bow'}},
  archer_hood:{id:'archer_hood',name:'遊俠兜帽',slot:'helm',classId:'archer',tier:'starter',price:22,sell:9,salvage:{cloth:2},stats:{atk:0,hp:0,def:0},look:{}},
  archer_vest:{id:'archer_vest',name:'遊俠皮甲',slot:'chest',classId:'archer',tier:'starter',price:34,sell:14,salvage:{leather:2,cloth:1},stats:{atk:0,hp:0,def:0},look:{top:'tunic',cape:'cape'}},
  archer_belt:{id:'archer_belt',name:'箭袋腰帶',slot:'belt',classId:'archer',tier:'starter',price:16,sell:6,salvage:{leather:1},stats:{atk:0,hp:0,def:0},look:{}},
  archer_legs:{id:'archer_legs',name:'遊俠綁腿',slot:'legs',classId:'archer',tier:'starter',price:24,sell:10,salvage:{cloth:2},stats:{atk:0,hp:0,def:0},look:{bottom:'pants'}},
  archer_boots:{id:'archer_boots',name:'遊俠長靴',slot:'boots',classId:'archer',tier:'starter',price:20,sell:8,salvage:{leather:2},stats:{atk:0,hp:0,def:0},look:{shoes:'boots'}},
  archer_gloves:{id:'archer_gloves',name:'遊俠手套',slot:'gloves',classId:'archer',tier:'starter',price:18,sell:7,salvage:{cloth:1,leather:1},stats:{atk:0,hp:0,def:0},look:{}},
  // 魔法師:銀長髮、紫尖帽長袍、法杖
  sorc_staff:{id:'sorc_staff',name:'紫杉法杖',slot:'weapon',classId:'sorcerer',tier:'starter',price:45,sell:18,salvage:{wood:4,ore:1},stats:{atk:0,hp:0,def:0},look:{weapon:'staff'}},
  sorc_hat:{id:'sorc_hat',name:'尖頂法師帽',slot:'helm',classId:'sorcerer',tier:'starter',price:26,sell:10,salvage:{cloth:3},stats:{atk:0,hp:0,def:0},look:{hat:'wizard'}},
  sorc_robe:{id:'sorc_robe',name:'秘法長袍',slot:'chest',classId:'sorcerer',tier:'starter',price:40,sell:16,salvage:{cloth:3,leather:1},stats:{atk:0,hp:0,def:0},look:{top:'robe',cape:'cape'}},
  sorc_cord:{id:'sorc_cord',name:'秘法腰繩',slot:'belt',classId:'sorcerer',tier:'starter',price:16,sell:6,salvage:{cloth:1},stats:{atk:0,hp:0,def:0},look:{}},
  sorc_wraps:{id:'sorc_wraps',name:'法師護腿',slot:'legs',classId:'sorcerer',tier:'starter',price:24,sell:10,salvage:{cloth:2},stats:{atk:0,hp:0,def:0},look:{}},
  sorc_boots:{id:'sorc_boots',name:'旅法靴',slot:'boots',classId:'sorcerer',tier:'starter',price:20,sell:8,salvage:{leather:2},stats:{atk:0,hp:0,def:0},look:{shoes:'boots'}},
  sorc_gloves:{id:'sorc_gloves',name:'秘法手套',slot:'gloves',classId:'sorcerer',tier:'starter',price:18,sell:7,salvage:{cloth:2},stats:{atk:0,hp:0,def:0},look:{}},
  // 祭司:金長髮、白袍、聖光杖
  priest_staff:{id:'priest_staff',name:'聖光杖',slot:'weapon',classId:'priest',tier:'starter',price:45,sell:18,salvage:{wood:3,ore:2},stats:{atk:0,hp:0,def:0},look:{weapon:'staff'}},
  priest_band:{id:'priest_band',name:'祭司髮帶',slot:'helm',classId:'priest',tier:'starter',price:22,sell:9,salvage:{cloth:2},stats:{atk:0,hp:0,def:0},look:{hat:'band'}},
  priest_robe:{id:'priest_robe',name:'白袍',slot:'chest',classId:'priest',tier:'starter',price:40,sell:16,salvage:{cloth:3},stats:{atk:0,hp:0,def:0},look:{top:'robe',cape:'cape'}},
  priest_sash:{id:'priest_sash',name:'祈禱腰帶',slot:'belt',classId:'priest',tier:'starter',price:16,sell:6,salvage:{cloth:1},stats:{atk:0,hp:0,def:0},look:{}},
  priest_legs:{id:'priest_legs',name:'素布護腿',slot:'legs',classId:'priest',tier:'starter',price:24,sell:10,salvage:{cloth:2},stats:{atk:0,hp:0,def:0},look:{}},
  priest_sandals:{id:'priest_sandals',name:'布靴',slot:'boots',classId:'priest',tier:'starter',price:18,sell:7,salvage:{cloth:2},stats:{atk:0,hp:0,def:0},look:{shoes:'boots'}},
  priest_gloves:{id:'priest_gloves',name:'祝禱手套',slot:'gloves',classId:'priest',tier:'starter',price:18,sell:7,salvage:{cloth:2},stats:{atk:0,hp:0,def:0},look:{}},
  // 聖騎士:藍布白甲、頭盔、圓盾、紅披風、劍
  paladin_sword:{id:'paladin_sword',name:'聖騎士劍',slot:'weapon',classId:'paladin',tier:'starter',price:55,sell:22,salvage:{ore:3,wood:2},stats:{atk:0,hp:0,def:0},look:{weapon:'sword'}},
  paladin_helm:{id:'paladin_helm',name:'騎士頭盔',slot:'helm',classId:'paladin',tier:'starter',price:30,sell:12,salvage:{ore:2,cloth:1},stats:{atk:0,hp:0,def:0},look:{hat:'helmet'}},
  paladin_plate:{id:'paladin_plate',name:'聖騎士胸甲',slot:'chest',classId:'paladin',tier:'starter',price:48,sell:19,salvage:{ore:3,cloth:2},stats:{atk:0,hp:0,def:0},look:{top:'armor',shield:'buckler',cape:'cape'}},
  paladin_belt:{id:'paladin_belt',name:'騎士腰帶',slot:'belt',classId:'paladin',tier:'starter',price:18,sell:7,salvage:{leather:1},stats:{atk:0,hp:0,def:0},look:{}},
  paladin_legs:{id:'paladin_legs',name:'騎士腿甲',slot:'legs',classId:'paladin',tier:'starter',price:30,sell:12,salvage:{ore:1,cloth:2},stats:{atk:0,hp:0,def:0},look:{bottom:'pants'}},
  paladin_boots:{id:'paladin_boots',name:'騎士戰靴',slot:'boots',classId:'paladin',tier:'starter',price:24,sell:10,salvage:{leather:2},stats:{atk:0,hp:0,def:0},look:{shoes:'boots'}},
  paladin_gloves:{id:'paladin_gloves',name:'騎士手甲',slot:'gloves',classId:'paladin',tier:'starter',price:22,sell:9,salvage:{cloth:1,leather:1},stats:{atk:0,hp:0,def:0},look:{}},
  // 狂戰士:紅髮獸皮、無頭盔、斧(外觀用劍部件)
  berserk_axe:{id:'berserk_axe',name:'狂戰士斧',slot:'weapon',classId:'berserker',tier:'starter',price:50,sell:20,salvage:{ore:3,wood:2},stats:{atk:0,hp:0,def:0},look:{weapon:'sword'}},
  berserk_helm:{id:'berserk_helm',name:'狼皮頭飾',slot:'helm',classId:'berserker',tier:'starter',price:24,sell:10,salvage:{leather:2},stats:{atk:0,hp:0,def:0},look:{}},
  berserk_vest:{id:'berserk_vest',name:'獸皮背心',slot:'chest',classId:'berserker',tier:'starter',price:36,sell:14,salvage:{leather:3},stats:{atk:0,hp:0,def:0},look:{top:'tunic'}},
  berserk_belt:{id:'berserk_belt',name:'粗皮腰帶',slot:'belt',classId:'berserker',tier:'starter',price:16,sell:6,salvage:{leather:1},stats:{atk:0,hp:0,def:0},look:{}},
  berserk_legs:{id:'berserk_legs',name:'獸皮護腿',slot:'legs',classId:'berserker',tier:'starter',price:26,sell:10,salvage:{leather:2},stats:{atk:0,hp:0,def:0},look:{bottom:'pants'}},
  berserk_boots:{id:'berserk_boots',name:'戰士皮靴',slot:'boots',classId:'berserker',tier:'starter',price:20,sell:8,salvage:{leather:2},stats:{atk:0,hp:0,def:0},look:{shoes:'boots'}},
  berserk_gloves:{id:'berserk_gloves',name:'狼皮手套',slot:'gloves',classId:'berserker',tier:'starter',price:18,sell:7,salvage:{leather:1,cloth:1},stats:{atk:0,hp:0,def:0},look:{}},
  // 刺客:馬尾黑布、涼鞋、匕首
  assn_dagger:{id:'assn_dagger',name:'暗影匕首',slot:'weapon',classId:'assassin',tier:'starter',price:48,sell:19,salvage:{ore:2,leather:1},stats:{atk:0,hp:0,def:0},look:{weapon:'dagger'}},
  assn_band:{id:'assn_band',name:'黑頭巾',slot:'helm',classId:'assassin',tier:'starter',price:22,sell:9,salvage:{cloth:2},stats:{atk:0,hp:0,def:0},look:{hat:'band'}},
  assn_vest:{id:'assn_vest',name:'潛行皮甲',slot:'chest',classId:'assassin',tier:'starter',price:34,sell:14,salvage:{leather:2,cloth:1},stats:{atk:0,hp:0,def:0},look:{top:'tunic',cape:'cape'}},
  assn_belt:{id:'assn_belt',name:'暗袋腰帶',slot:'belt',classId:'assassin',tier:'starter',price:16,sell:6,salvage:{leather:1},stats:{atk:0,hp:0,def:0},look:{}},
  assn_legs:{id:'assn_legs',name:'貼身長褲',slot:'legs',classId:'assassin',tier:'starter',price:24,sell:10,salvage:{cloth:2},stats:{atk:0,hp:0,def:0},look:{bottom:'pants'}},
  assn_sandals:{id:'assn_sandals',name:'無聲涼鞋',slot:'boots',classId:'assassin',tier:'starter',price:18,sell:7,salvage:{leather:2},stats:{atk:0,hp:0,def:0},look:{shoes:'sandals'}},
  assn_gloves:{id:'assn_gloves',name:'暗影手套',slot:'gloves',classId:'assassin',tier:'starter',price:18,sell:7,salvage:{cloth:1,leather:1},stats:{atk:0,hp:0,def:0},look:{}},
  // 旅人:黃布上衣、空手(沒有武器外觀)
  trav_wraps:{id:'trav_wraps',name:'旅人纏手',slot:'weapon',classId:'traveler',tier:'starter',price:8,sell:3,salvage:{cloth:1},stats:{atk:0,hp:0,def:0},look:{weapon:'none'}},
  trav_hood:{id:'trav_hood',name:'旅行兜帽',slot:'helm',classId:'traveler',tier:'starter',price:20,sell:8,salvage:{cloth:2},stats:{atk:0,hp:0,def:0},look:{}},
  trav_vest:{id:'trav_vest',name:'旅人上衣',slot:'chest',classId:'traveler',tier:'starter',price:30,sell:12,salvage:{cloth:2,leather:1},stats:{atk:0,hp:0,def:0},look:{top:'tunic'}},
  trav_belt:{id:'trav_belt',name:'旅行腰帶',slot:'belt',classId:'traveler',tier:'starter',price:14,sell:6,salvage:{leather:1},stats:{atk:0,hp:0,def:0},look:{}},
  trav_legs:{id:'trav_legs',name:'耐磨長褲',slot:'legs',classId:'traveler',tier:'starter',price:22,sell:9,salvage:{cloth:2},stats:{atk:0,hp:0,def:0},look:{bottom:'pants'}},
  trav_boots:{id:'trav_boots',name:'旅行長靴',slot:'boots',classId:'traveler',tier:'starter',price:18,sell:7,salvage:{leather:2},stats:{atk:0,hp:0,def:0},look:{shoes:'boots'}},
  trav_gloves:{id:'trav_gloves',name:'旅行手套',slot:'gloves',classId:'traveler',tier:'starter',price:16,sell:6,salvage:{cloth:1},stats:{atk:0,hp:0,def:0},look:{}},

  // 鐵匠鋪升級件(tier craft):數值沿用 RECIPES,外觀用通用鐵甲部件
  craft_weapon:{id:'craft_weapon',name:'精鐵武器',slot:'weapon',classId:null,tier:'craft',price:85,sell:38,salvage:{ore:6,wood:3},stats:{atk:7,hp:0,def:0},look:{}},
  craft_helm:{id:'craft_helm',name:'精鐵頭盔',slot:'helm',classId:null,tier:'craft',price:90,sell:21,salvage:{cloth:2,ore:3},stats:{atk:0,hp:6,def:2},look:{hat:'helmet'}},
  craft_chest:{id:'craft_chest',name:'精鐵胸甲',slot:'chest',classId:null,tier:'craft',price:140,sell:38,salvage:{ore:5,leather:3},stats:{atk:0,hp:22,def:3},look:{top:'armor'}},
  craft_belt:{id:'craft_belt',name:'精鐵腰帶',slot:'belt',classId:null,tier:'craft',price:70,sell:10,salvage:{leather:2},stats:{atk:0,hp:4,def:1},look:{}},
  craft_legs:{id:'craft_legs',name:'精鐵腿甲',slot:'legs',classId:null,tier:'craft',price:110,sell:21,salvage:{ore:3,cloth:2},stats:{atk:0,hp:10,def:2},look:{bottom:'pants'}},
  craft_boots:{id:'craft_boots',name:'精鐵戰靴',slot:'boots',classId:null,tier:'craft',price:70,sell:10,salvage:{leather:2},stats:{atk:0,hp:4,def:1},look:{shoes:'boots'}},
  craft_gloves:{id:'craft_gloves',name:'精鐵手套',slot:'gloves',classId:null,tier:'craft',price:60,sell:10,salvage:{cloth:2,leather:1},stats:{atk:0,hp:4,def:1},look:{}},
};
// 新招募獵人的初始七件套(武器 + 六格防具)。物品一建立就穿在身上,不是背包道具。
export const CLASS_STARTER={
  archer:{weapon:'archer_bow',helm:'archer_hood',chest:'archer_vest',belt:'archer_belt',legs:'archer_legs',boots:'archer_boots',gloves:'archer_gloves'},
  sorcerer:{weapon:'sorc_staff',helm:'sorc_hat',chest:'sorc_robe',belt:'sorc_cord',legs:'sorc_wraps',boots:'sorc_boots',gloves:'sorc_gloves'},
  priest:{weapon:'priest_staff',helm:'priest_band',chest:'priest_robe',belt:'priest_sash',legs:'priest_legs',boots:'priest_sandals',gloves:'priest_gloves'},
  paladin:{weapon:'paladin_sword',helm:'paladin_helm',chest:'paladin_plate',belt:'paladin_belt',legs:'paladin_legs',boots:'paladin_boots',gloves:'paladin_gloves'},
  berserker:{weapon:'berserk_axe',helm:'berserk_helm',chest:'berserk_vest',belt:'berserk_belt',legs:'berserk_legs',boots:'berserk_boots',gloves:'berserk_gloves'},
  assassin:{weapon:'assn_dagger',helm:'assn_band',chest:'assn_vest',belt:'assn_belt',legs:'assn_legs',boots:'assn_sandals',gloves:'assn_gloves'},
  traveler:{weapon:'trav_wraps',helm:'trav_hood',chest:'trav_vest',belt:'trav_belt',legs:'trav_legs',boots:'trav_boots',gloves:'trav_gloves'},
};
// mult = 魔物生命與獎勵的倍率;atk = 魔物攻擊的倍率;nerve = 獵人肯冒的險:舒適度 ≥ 威脅 × nerve 的區也算能去,撤退的預留秒數也 × nerve(沒有 nerve = 只去打得動的區、照原本時機撤退)。
// 2026-11-18 分開,見 docs/BALANCE.md「難度的風險」。初級 atk 1、沒有 nerve,行為不變。
export const DIFFICULTIES=[{id:0,name:'初級',mult:1,atk:1,rebirths:0},{id:1,name:'普通',mult:1.7,atk:3,nerve:0.5,rebirths:1},{id:2,name:'困難',mult:2.8,atk:6.5,nerve:0.45,rebirths:3},{id:3,name:'專家',mult:4.5,atk:13,nerve:0.35,rebirths:5},{id:4,name:'噩夢',mult:7,atk:20,nerve:0.3,rebirths:10}];

// ── 2026-11-16 裝備經濟(docs/EQUIPMENT-ECONOMY.md)──
// 售價: 一律 標價 × 40%(四捨五入) → 賣掉永遠比標價便宜,不會變成刷錢機器。
// 分解: starter = 依部位給 1–3 個基礎素材;craft = 製作成本的一半(向上取整),所以分解不會比重新打造更賺。
// 取得管道: starter = 新獵人初始套裝(招募即穿);craft = 鐵匠鋪製作 / 獵人與流浪英雄到鐵匠鋪購買 /
//          首領討伐(45%) / 地下城每 2 層 / 章節委託(指定件)。
export const GEAR_SELL_RATE=0.4;
export const GEAR_CRAFT_POOL=['craft_weapon','craft_helm','craft_chest','craft_belt','craft_legs','craft_boots','craft_gloves'];
export const GEAR_STARTER_POOL=Object.values(EQUIPMENT).filter(item=>item.tier==='starter').map(item=>item.id);
// chance = 每次觸發機率;every = 地下城每幾層給一件;quest = 章節索引 → 指定裝備。
export const GEAR_DROP={
  monster:{chance:0.025,pool:GEAR_STARTER_POOL},
  boss:{chance:0.45,pool:GEAR_CRAFT_POOL},
  dungeon:{every:2,pool:GEAR_CRAFT_POOL},
  quest:{3:'craft_helm',4:'craft_weapon',6:'craft_chest'},
};
// 2026-11-17 地下城寶箱的升級件階級跟著樓層走(第 1–10 層 Ⅰ、11–20 層 Ⅱ…41 層起 Ⅴ);只有第一次打過的樓層開寶箱。
export const dungeonGearGrade=floor=>Math.min(GEAR_TIER_MAX,1+Math.floor(Math.max(0,(Number(floor)||1)-1)/10));
// craft 售價/分解公式的係數(docs/EQUIPMENT-ECONOMY.md §3–4):售價 = 材料價值 × 0.8;分解 = 每種材料的一半(進位)。
export const GEAR_CRAFT_SELL_RATE=0.8;
// 物品實例 → 實際生效的物品資料。starter 與第 1 階升級件就是 EQUIPMENT 原物件(數值/售價/分解完全不變);
// 第 2 階以上的升級件:名稱加羅馬數字、數值/標價/材料照 gearAt(GEAR_TIERS 倍率),售價與分解沿用 craft 公式。
// 回傳物件多帶 grade(1..5)與 numeral。遊戲邏輯、獵人卡、倉庫列一律經過這裡,不要直接讀 EQUIPMENT[inst.itemId]。
const GEAR_VIEW=new Map();
export const gearGradeOf=inst=>{const it=inst&&EQUIPMENT[inst.itemId];return it&&it.tier==='craft'?Math.min(GEAR_TIER_MAX,Math.max(1,Math.floor(Number(inst.grade))||1)):0;};
export function gearItemView(inst){
  const base=inst&&EQUIPMENT[inst.itemId];if(!base)return null;
  const grade=gearGradeOf(inst);if(!grade)return base;
  const key=base.id+'@'+grade;if(GEAR_VIEW.has(key))return GEAR_VIEW.get(key);
  if(grade===1){const v={...base,grade:1,numeral:GEAR_TIERS[0].numeral};GEAR_VIEW.set(key,v);return v;}
  const r=gearAt(base.slot,grade),value=Object.entries(r.cost).reduce((n,[k,v])=>n+v*(MATERIALS[k]?.price||0),0);
  const view={...base,grade,numeral:r.numeral,name:`${base.name} ${r.numeral}`,price:r.price,sell:Math.round(value*GEAR_CRAFT_SELL_RATE),
    salvage:Object.fromEntries(Object.entries(r.cost).map(([k,v])=>[k,Math.ceil(v/2)])),
    stats:base.slot==='weapon'?{atk:r.bonus,hp:0,def:0}:{atk:0,hp:r.hp||0,def:r.def||0}};
  GEAR_VIEW.set(key,view);return view;
}

// 2026-11-18 使用者:怪物區域兩倍大、怪物量也兩倍(密度不變)。同時在場上限、補怪速度、開局與派遣時的補怪數量都乘這個倍率。
export const MONSTER_POP=2;
// 2026-10-30:每個狩獵區中央立牌切換「怪物數量」三級(羅馬數字)。只改同時出現的數量與補怪速度,魔物本身不變強。
// cap = 目前狩獵區的上限、other = 沒人在打的區的上限、every = 補一隻的間隔(秒)。下表是一倍的基準,實際值再乘 MONSTER_POP:
// 第 2 級 = 主狩獵區 28 隻/1.25 秒、其他區 12 隻/4 秒。
export const REGION_DENSITY=[
  {level:1,numeral:'I',name:'稀疏',cap:8,other:4,every:4,otherEvery:12},
  {level:2,numeral:'II',name:'標準',cap:14,other:6,every:2.5,otherEvery:8},
  {level:3,numeral:'III',name:'密集',cap:22,other:9,every:1.8,otherEvery:6},
].map(d=>({...d,cap:d.cap*MONSTER_POP,other:d.other*MONSTER_POP,every:d.every/MONSTER_POP,otherEvery:d.otherEvery/MONSTER_POP}));
// 2026-10-31 使用者:怪物移動速度 ×1.5、攻擊速度 ×1.3。
// 攻擊速度是「間隔變短」→ 攻擊間隔 ÷1.3(近戰 1.8→1.385 秒、首領 1.5→1.154、遠程 each÷1.3);走路動畫照位移距離推進,會自己跟著變快。
// 只影響魔物(含首領),英雄、流浪英雄、村民都不動。
export const MONSTER_SPEED_MULT = 1.5;
export const MONSTER_ATTACK_RATE = 1.3;
export const DEFAULT_REGION_DENSITY=2;
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
