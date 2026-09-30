export const BUILDINGS = [
 {id:'hall',name:'村長會館',en:'VILLAGE HALL',x:-3,z:-6,w:5,d:4,type:'hall',color:0x637583,desc:'暮影村的心臟。提升村落等級，增加所有狩獵收益。',cost:{gold:180,wood:35,ore:15},effect:'每級狩獵金幣收益 +15%'},
 {id:'tavern',name:'橡木酒館',en:'OAK & EMBER',x:-11,z:-5,w:5,d:3.8,type:'tavern',color:0x995e49,desc:'爐火、麥酒與冒險故事。旅人歇腳，也有新的獵人等待加入。',cost:{gold:140,wood:30,ore:0},effect:'每級增加 1 個獵人名額'},
 {id:'forge',name:'餘燼鐵匠鋪',en:'EMBER FORGE',x:-12,z:4,w:4.5,d:3.5,type:'forge',color:0x655859,desc:'鐵鎚敲擊聲日夜不歇。為每位獵人鍛造更鋒利的武器。',cost:{gold:150,wood:15,ore:30},effect:'每級全體獵人攻擊力 +20%'},
 {id:'clinic',name:'月草療養所',en:'MOONLEAF SANCTUARY',x:-4,z:5,w:4,d:3.5,type:'clinic',color:0x687b69,desc:'草藥師在這裡照顧歸來的獵人，讓疲憊的隊伍重新出發。',cost:{gold:120,wood:30,ore:10},effect:'每級休養恢復速度 +30%'},
 {id:'academy',name:'守望訓練場',en:'WATCHERS GUILD',x:4,z:5,w:3.8,d:3.4,type:'academy',color:0x736685,desc:'在木樁與箭靶之間磨練身手。訓練使獵人在荒野活得更久。',cost:{gold:160,wood:30,ore:20},effect:'每級全體獵人最大生命 +15%'},
 {id:'farm',name:'金穗農場',en:'GOLDEN FIELDS',x:-12,z:11,w:3.4,d:2.8,type:'farm',color:0x897556,desc:'村人的日常從一碗熱食開始。收成也會補充建設所需的木材。',cost:{gold:100,wood:20,ore:0},effect:'每 12 秒生產金幣與木材，升級提高產量'}
];
export const CLASSES = [
 {id:'knight',name:'守誓騎士',tag:'近戰 · 堅韌',color:'#d9b278',hp:130,attack:17,speed:2.2,cost:120,desc:'盾牌承受第一波衝擊，長劍為同伴開路。'},
 {id:'ranger',name:'逐風遊俠',tag:'遠程 · 敏捷',color:'#91b49a',hp:88,attack:22,speed:2.9,cost:150,desc:'穿行林間的精準射手，在安全距離擊退魔物。'},
 {id:'mage',name:'星火法師',tag:'魔法 · 高傷',color:'#a8a0d0',hp:78,attack:28,speed:2.35,cost:180,desc:'將古老符文凝成星火，對強大魔物造成重創。'}
];
export const HUNT_ZONE={x:16,z:-5,radius:7};
export const CAMP={x:0,z:0};
export const SAVE_KEY='mistvale-v1';
