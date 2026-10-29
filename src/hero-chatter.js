// hero-chatter.js — 英雄對話框的台詞(2026-10-30 使用者:「顯示英雄當下心情或要做的事情,說話內容要有趣簡短,玩家覺得這是活人」)。
// pickHeroLine(h, ctx) 依「急迫需求 → 正在做的事 → 職業/特性/閒聊」挑一句;只決定說什麼,何時說、畫在哪由 pixel-world.js 管。
// ctx = { wanderer: 是不是流浪英雄, night: 是否夜晚, rnd: 0–1 亂數, last: 上一句(不連續講同一句) }
// 台詞原則:一句 4–12 字、口語、有個性;{region} 會換成要去的狩獵區名。

const NEED = {
  hurt: ['嘶…這傷有點深', '先退一下！', '繃帶在哪裡…', '我還能打…大概', '血條在閃了啦', '痛痛痛痛'],
  hungry: ['肚子在打鼓了…', '先吃麵包再說！', '聞到餐廳的香味', '餓到想啃花芽妖', '咕嚕嚕——', '今天的麵包有剩嗎'],
  tired: ['腿要斷了…', '旅館的床在呼喚我', '再一隻就休息…吧', '哈啊～好睏', '眼皮好重…', '我站著也能睡'],
  sad: ['今天好不順…', '來杯莓果汁就好', '誰來誇我一下', '心情跟陰天一樣', '唉……', '想回村躺平'],
};

const STATUS = {
  fight: ['看招！', '別想跑！', '就是現在！', '吃我這一下！', '再來一隻！'],
  kite: ['太近了太近了！', '保持距離！', '先拉開再說', '別黏過來啦！'],
  depart: ['出發打獵囉！', '今天要打到大的', '{region}，我來了！', '走走走，別落後', '路上別睡著喔'],
  search: ['魔物呢？躲哪去了', '這邊好像有動靜…', '安靜得有點可怕', '出來吧，我看到你了', '腳印…往這邊'],
  chase: ['給我站住！', '想逃？沒那麼容易', '追上你了！'],
  home: ['背包快塞爆了', '回村賣個好價錢', '想念村裡的麵包', '終於可以休息了', '這趟收穫不錯'],
  eat: ['吃飯皇帝大！', '這麵包是神作', '再來一份！', '嗯～外酥內軟'],
  drink: ['莓果汁萬歲！', '乾杯！', '心情回來了～', '再一杯就好'],
  rest: ['呼…呼…', 'Zzz…', '別吵我，五分鐘就好', '床好軟…'],
  heal: ['輕一點輕一點！', '繃帶纏好了', '這點傷沒事啦'],
  trade: ['這些戰利品很搶手喔', '老闆，算便宜點？', '賺到了！'],
  gear: ['新武器！眼睛都亮了', '這套裝備好帥', '錢包在哭泣…'],
  idle: ['今天天氣真好', '村長在看我嗎？', '要不要去狩獵呢', '發呆也是修行', '有委託嗎？', '村裡真熱鬧'],
  revive: ['我…還沒…輸…', '聖所的光好溫暖', '下次一定贏'],
  dungeonGo: ['地下城，衝了！', '裡面好潮濕…', '寶箱在等我們', '跟緊，別走散'],
  dungeon: ['頂住前排！', '這層的怪好兇', '再一波就過了！'],
  arena: ['讓我熱熱身', '對手看起來很強', '只是模擬，別緊張'],
  wander: ['這村子看起來不錯', '一個人也挺自在', '哪裡有好賺的區？', '流浪就是自由'],
  pilot: ['跟著感覺走！', '左邊、右邊、砍！', '交給你操控了'],
};

const CLASS_FIGHT = {
  berserker: ['來啊！再來！', '大劍餓了！', '吼啊啊啊！', '一刀兩斷！'],
  paladin: ['站我後面！', '盾牌頂住！', '以聖光之名！', '我來擋！'],
  sorcerer: ['火球——走你！', '咒語別念錯…', '元素聽我號令！', '燒起來吧！'],
  archer: ['瞄準…放！', '一箭一個！', '風向剛好', '別動，我在瞄'],
  assassin: ['影子裡見。', '太慢了。', '背後空空的喔', '一擊就夠'],
  priest: ['願光守護你們', '撐住，我來補！', '受傷的舉手！', '聖光照耀！'],
};

const TRAIT = {
  swift: ['快快快！', '慢吞吞的最討厭'],
  stout: ['這點傷不算什麼', '我皮厚，放心'],
  cheerful: ['哈哈，今天也很開心！', '笑一個嘛～', '好事要發生了！'],
  frugal: ['能省則省…', '金幣要存起來', '這個太貴了吧'],
  brave: ['哪裡有強敵？', '我什麼都不怕！', '首領呢？叫他出來'],
};

const NIGHT = ['天黑了，小心點', '星星好亮', '夜裡的魔物比較兇', '好想念被窩'];
const RICH = ['錢包鼓鼓的～', '今天請大家吃飯！'];

function pick(list, rnd, last) {
  if (!list?.length) return null;
  let line = list[Math.floor(rnd() * list.length) % list.length];
  if (line === last && list.length > 1) line = list[(list.indexOf(line) + 1) % list.length];
  return line;
}

// 目前在做的事 → 台詞池
function statusPool(h, ctx) {
  const st = String(h.status || '');
  if (h.hp <= 0) return STATUS.revive;
  if (st === '戰鬥中') return [...STATUS.fight, ...(CLASS_FIGHT[h.classId] || []), ...(CLASS_FIGHT[h.classId] || [])];
  if (st === '後撤中') return STATUS.kite;
  if (st === '追擊中') return STATUS.chase;
  if (st === '搜尋中') return STATUS.search;
  if (st === '出征中' || st.startsWith('前往')) return STATUS.depart;
  if (st === '返村中') return STATUS.home;
  if (st === '用餐中') return STATUS.eat;
  if (st === '飲用中') return STATUS.drink;
  if (st === '休息中') return STATUS.rest;
  if (st === '休養中') return STATUS.heal;
  if (st === '交易中') return STATUS.trade;
  if (st === '購買裝備') return STATUS.gear;
  if (st === '地下城集結') return STATUS.dungeonGo;
  if (st === '地下城戰鬥') return STATUS.dungeon;
  if (st.startsWith('競技場')) return STATUS.arena;
  if (st === '手動操控') return STATUS.pilot;
  if (st === '遊蕩中' || ctx.wanderer) return [...STATUS.wander, ...STATUS.idle];
  return STATUS.idle;
}

export function pickHeroLine(h, ctx = {}) {
  const rnd = ctx.rnd || Math.random, last = ctx.last || '';
  // 1) 急迫需求:七成機率先抱怨(倒下的人不抱怨肚子餓)
  if (h.hp > 0) {
    const needs = [];
    if (h.maxHp > 0 && h.hp / h.maxHp < 0.35) needs.push(NEED.hurt);
    if ((h.satiety ?? 100) < 25) needs.push(NEED.hungry);
    if ((h.stamina ?? 100) < 25) needs.push(NEED.tired);
    if ((h.mood ?? 100) < 25) needs.push(NEED.sad);
    if (needs.length && rnd() < 0.7) return pick(needs[Math.floor(rnd() * needs.length) % needs.length], rnd, last);
  }
  // 2) 正在做的事(七成);3) 其餘講個性:特性、夜晚、有錢
  const pool = statusPool(h, ctx);
  if (h.hp <= 0 || rnd() < 0.7) {
    const line = pick(pool, rnd, last);
    const region = String(h.status || '').startsWith('前往') ? String(h.status).slice(2) : '狩獵區';
    return line && line.replace('{region}', region);
  }
  const flavor = [...(TRAIT[h.trait] || []), ...(ctx.night ? NIGHT : []), ...((h.gold ?? 0) > 600 ? RICH : [])];
  return pick(flavor.length ? flavor : pool, rnd, last)?.replace('{region}', '狩獵區') ?? null;
}

export const CHATTER_LINES = { NEED, STATUS, CLASS_FIGHT, TRAIT, NIGHT, RICH };   // 給測試檢查:每句都夠短
