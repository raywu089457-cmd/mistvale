// lore.js — 魔物圖鑑(2026-10-30):世界地圖的區域卡列出該區出沒的魔物,每隻一句介紹。
// REGION_MONSTERS 對 pixel-game.js 的 REGION_MIX(小/中/大);MONSTER_NAME 對 ENEMY_NAME。
// MONSTER_LORE:魔物 id → 一句介紹(繁中,最多 26 字,測試會擋);還沒寫的魔物就不顯示。
export const REGION_MONSTERS={meadow:['sprout','ram','mole'],forest:['shroom','boar','vine'],taiga:['snowhare','wolfman','moss'],snow:['icebeetle','snowman','yeti'],mountain:['kobold','goat','boulder'],desert:['cactus','scorpion','mummy'],birch:['floraspirit','stag','birchling']};
export const MONSTER_NAME={"sprout": "花芽妖", "ram": "捲角羊", "mole": "鼴鼠", "shroom": "蕈菇怪", "boar": "野豬", "vine": "藤鞭怪", "wolfman": "灰毛狼人", "moss": "苔蘚巨魔", "snowhare": "雪兔", "yeti": "霜雪怪", "snowman": "雪人哨兵", "icebeetle": "冰甲蟲", "kobold": "礦穴地精", "boulder": "岩塊怪", "goat": "鐵角羊", "mummy": "木乃伊", "cactus": "仙人掌怪", "scorpion": "沙蠍", "floraspirit": "花妖精", "birchling": "白樺樹精", "stag": "白樺雄鹿"};
export const MONSTER_LORE={
 sprout:'頭頂花苞一開，種子就像彈丸般射出。',
 ram:'脾氣暴躁的公羊，捲角撞起人來毫不留情。',
 mole:'在草原地底挖滿隧道，常從獵人腳下冒出。',
 shroom:'走過的地方留下孢子，吸多了頭會發暈。',
 boar:'暮林裡最莽撞的傢伙，看到人就直線衝鋒。',
 vine:'偽裝成普通藤蔓，等獵物靠近才甩鞭出手。',
 snowhare:'跑得比箭還快，被逼急了也會狠狠踢人。',
 wolfman:'成群行動的狼人，月光越亮越是兇猛。',
 moss:'背上長滿苔蘚的巨魔，會挖起泥塊往人丟。',
 icebeetle:'冰甲蟲貼著冰河爬行，硬殼擋得住刀鋒。',
 snowman:'雪人哨兵站著不動，誰踩進雪地它就砸下。',
 yeti:'霜雪怪踏雪而來，腳步一落整片雪原發顫。',
 kobold:'礦穴地精躲在礦坑口，專挑落單的人扔石頭。',
 goat:'鐵角羊沿著岩壁跳，低頭一角能把人頂下山。',
 boulder:'岩塊怪縮成一顆石頭，等你走近才整顆彈起。',
 cactus:'仙人掌怪一動不動，刺卻會突然伸長扎人。',
 scorpion:'沙蠍埋在沙下只露尾針，走過就從腳邊竄出。',
 mummy:'木乃伊在遺跡裡醒著，繃帶一散就爬起來追。',
 floraspirit:'花妖精藏在花叢裡，一吹氣花粉就迷了眼睛。',
 stag:'白樺雄鹿在花間巡守，鹿角一低就直衝過來。',
 birchling:'白樺樹精裝成小樹，枝條一甩就抽在人身上。',
};
