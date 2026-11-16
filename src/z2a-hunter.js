// z2a-hunter.js — Z2A(圖鑑規格 v2 的 f、g、j 節):獵人卡(C 視窗內容)、名冊卡、新獵人到訪暗帶(D)的 HTML。
// 只產生字串;狀態(游標位置、哪張子頁籤)放在這裡的 hc／vb,事件接線在 pixel-ui.js 的 doAction。
import {tipAttr,tipGradeName} from './ui-tip.js';
import {RECIPES,GEAR_SLOTS,GEAR_TIER_MAX,GEAR_TIERS,gearAt} from './pixel-data.js';
let C=null;   // { esc, fmt, iconHTML, portrait, game:()=>game, RARITIES, CLASSES, TRAITS }
export const initHunterUI=ctx=>{C=ctx;};

// ───────── 獵人卡(規格 g) ─────────
export const hc={tab:'info',id:''};   // 目前的子頁籤、正在看的獵人(換人或關掉再開就回到「資訊」)
export const HC_TABS=[['info','資訊','hunter'],['skill','技能','scroll'],['gear','裝備','swords'],['rebirth','轉世','rebirth']];
const xpNeed=l=>30+l*8;   // 同 pixel-game.js 的 xpNeeded(那邊沒匯出)
const attackInterval=h=>(h.classId==='sorcerer'?1.65:h.classId==='priest'?1.4:h.classId==='archer'?1.2:1.1)*(h.trait==='swift'?.9:1);   // 同 pixel-game.js 的 attackInterval
const gradeOfLv=lv=>lv>=10?'legendary':lv>=7?'heroic':lv>=4?'superior':lv>=1?'rare':'normal';
const STARS=5,STEP=4;   // 轉世 4 次點亮 1 顆星,20 次滿 5 星

// 2026-11-16 裝備階級Ⅰ–Ⅴ:階級由 game.gearTierOf 讀(h.equipment 仍是布林,階級在 h.gearTier;舊存檔 = 第 1 階)
const tierOf=(h,slot)=>{const g=C.game();return g.gearTierOf?g.gearTierOf(h,slot):(h.equipment?.[slot]?1:0);};
const TIER_GRADE=['normal','normal','rare','superior','heroic','legendary'];   // 階級 → tooltip 品質色
const upNote=t=>t<GEAR_TIER_MAX?'鐵匠鋪有更高階的庫存時，獵人回村會自己花錢換新':'已是最高階 Ⅴ';
function weaponTip(h){const lv=h.weaponLevel||0,t=tierOf(h,'weapon'),on=t>0,w=gearAt('weapon',t||1),g=gradeOfLv(on?lv:0);
 return on?{name:w.name,grade:g,icon:'swords',stars:Math.ceil(lv/2),level:'+'+lv,stats:[['品質',tipGradeName(g)],['階級',w.numeral],['強化',`+${lv} / 10`],['攻擊','+'+w.bonus]],
   lines:[['pos',`攻擊 +${w.bonus}（第 ${w.numeral} 階）`],lv?['pos',`強化 +${lv}：攻擊再 +${lv*7}%`]:null,lv<10?['note','強化精煉所可以繼續強化']:['note','已強化到最高 +10'],['note',upNote(t)]]}
  :{name:'武器（空）',grade:'normal',icon:'swords',stats:[['狀態','未裝備']],lines:[['neg',`少了 攻擊 +${w.bonus}`],['note','在鐵匠鋪製造武器後，獵人回村會用個人金幣購買']]};}
// 六件防具：裝備環一格一件(tooltip 寫生命／防禦，空的有缺少數值的紅字)
const GEAR_RECIPES=RECIPES.filter(r=>GEAR_SLOTS.includes(r.type));
function gearTip(r0,h){const t=tierOf(h,r0.type),on=t>0,r=gearAt(r0,t||1),gr=TIER_GRADE[t]||'normal';
 return on?{name:r.name,grade:gr,icon:'def',stats:[['品質',tipGradeName(gr)],['階級',r.numeral],['生命','+'+r.hp],['防禦','+'+r.def]],lines:[['pos',`生命 +${r.hp}`],['pos',`防禦 +${r.def}`],['note',upNote(t)]]}
  :{name:`${r.slotName}（空）`,grade:'normal',icon:'def',stats:[['狀態','未裝備']],lines:[['neg',`少了 生命 +${r.hp}、防禦 +${r.def}`],['note',`在鐵匠鋪製造${r.slotName}後，獵人回村會用個人金幣購買`]]};}

const SLOT_GLYPH={helm:'盔',chest:'甲',belt:'腰',legs:'腿',boots:'靴',gloves:'手'};
// 2026-11-16:裝備格右下角標階級(Ⅰ–Ⅴ),一眼看出哪一格該換新
const tierBadge=t=>t>0?`<b class="z2-tier" data-tier="${t}" aria-hidden="true">${GEAR_TIERS[Math.min(GEAR_TIERS.length,t)-1]?.numeral||t}</b>`:'';
function ringHTML(h){const I=C.iconHTML,wOn=!!h.equipment.weapon,wl=h.weaponLevel||0,ws=Math.ceil(wl/2);
 const stars=n=>n?`<span class="z2-sstars" aria-hidden="true">${'<i></i>'.repeat(Math.min(5,n))}</span>`:'';
 return `<div class="z2-ring"><i class="z2-spot" aria-hidden="true"></i>`
  +`<button type="button" class="z2-slot s-w ${wOn?'eq':'open'}" aria-label="武器：${wOn?gearAt('weapon',tierOf(h,'weapon')).name+' +'+wl:'未裝備'}"${tipAttr(weaponTip(h))}>${I('swords',true)}${wOn?stars(ws||1):''}${wOn?tierBadge(tierOf(h,'weapon')):''}</button>`
  +GEAR_RECIPES.map((r,i)=>{const t=tierOf(h,r.type),on=t>0;
    return `<button type="button" class="z2-slot s-g${i+1} ${on?'eq':'open'}" aria-label="${r.slotName}：${on?gearAt(r,t).name:'未裝備'}"${tipAttr(gearTip(r,h))}><span class="z2-glyph" aria-hidden="true">${SLOT_GLYPH[r.type]||'甲'}</span>${on?tierBadge(t):''}</button>`;}).join('')
  +`<img class="z2-fig" src="${C.portrait(h)}" alt="${C.esc(h.name)}"></div>`;}

function barHTML(kind,icon,label,cur,max){const pct=max>0?Math.max(0,Math.min(100,cur/max*100)):0;
 return `<div class="z2-bar ${kind}" role="img" aria-label="${label} ${Math.floor(cur)}/${Math.floor(max)}"><i class="z2-bar-ic" aria-hidden="true">${C.iconHTML(icon,true)}</i><span class="z2-bar-box"><span class="z2-bar-fill" style="width:${pct.toFixed(1)}%"></span><b>${label} ${Math.floor(cur)}/${Math.floor(max)}</b></span></div>`;}
const valRow=(icon,label,v)=>`<div class="z2-val"><i aria-hidden="true">${C.iconHTML(icon,true)}</i><span>${label}</span><b>${v}</b></div>`;

function infoPanel(h,cls,r){const dps=h.attack/attackInterval(h),tr=C.TRAITS.find(t=>t.id===h.trait);
 return `<div class="z2-id"><div class="z2-id-l"><em class="z2-rar" style="color:${r?.color}">${r?.name||''}</em><span class="z2-cls">等級.${h.level} <b>${cls?.name||''}</b></span><small class="z2-st">${C.esc(h.status)}${tr?` · ${C.esc(tr.name)}`:''}</small></div><div class="z2-dps"><small>每秒攻擊力</small><b>${dps.toFixed(1)}</b></div></div>`
  +`<div class="z2-cols"><div class="z2-bars">${barHTML('hp','hp','生命',h.hp,h.maxHp)}${barHTML('satiety','satiety','飽食',h.satiety,100)}${barHTML('stamina','stamina','精力',h.stamina,100)}${barHTML('mood','mood','心情',h.mood,100)}</div>`
  +`<div class="z2-vals">${valRow('atk','攻擊力',h.attack)}${valRow('def','防禦力',h.defense)}${valRow('scroll','技能等級',`Lv.${h.skillLevel||0}`)}${valRow('anvil','武器強化',`+${h.weaponLevel||0}`)}${valRow('rebirth','轉世',`${h.rebirths}/20`)}</div></div>`
  +`<p class="z2-train z1-hint">${trainHint(h)}</p>`;}

// 修煉的條件文字(給資訊頁底部,不夠時說明原因):與 game.train 的檢查同一組
function trainState(h){const s=C.game().state;
 if(!s.buildings.training)return {ok:false,why:'要先蓋修煉地'};if(h.level>=100)return {ok:false,why:'已 Lv.100，可以轉世'};if(h.hp<=0||h.task==='dungeon'||h.task==='arena')return {ok:false,why:'現在無法修煉'};
 if(h.trainCooldown>0)return {ok:false,why:`冷卻 ${Math.ceil(h.trainCooldown)} 秒`};if(h.gold<20)return {ok:false,why:'個人金幣不足 20'};return {ok:true,why:''};}
function trainHint(h){const t=trainState(h);return `<b>修煉</b>：花 20 個人金幣，一次成長約 5 級。${t.ok?'<span class="ok">現在可以修煉</span>':`<span class="no">${t.why}</span>`}`;}

function need(label,have,want){return `<span class="${have>=want?'ok':'no'}">${label} ${C.fmt(have)}/${C.fmt(want)}</span>`;}
function rowHTML({icon,name,tone,desc,cost,reason,btn}){const I=C.iconHTML;
 return `<div class="z2-row"><i class="z2-row-ic" aria-hidden="true">${I(icon,true)}</i><div class="z2-row-b"><b class="z2-row-n"${tone?` data-grade="${tone}"`:''}>${name}</b><small class="z2-row-d">${desc}</small>${cost?`<small class="z2-row-c">${cost}</small>`:''}${reason?`<small class="z2-row-w">${reason}</small>`:''}</div>${btn||''}</div>`;}
// 2026-11-16:只缺鐵礦(金幣夠補)→ 青綠「補料」鈕,交易所行商補差額後直接學／強化(跟建設卡、製作同一套)
function merchantRowBtn(action,id,label,cost){const g=C.game(),q=g.merchantQuote?.(cost);if(!q||!q.ok||!Object.keys(q.short).length)return '';return `<button type="button" class="pixel-button z2-rowbtn merchant-btn" data-action="${action}" data-id="${id}" data-zb="teal" title="向交易所行商補鐵礦 ${q.short.ore||0}"><span>${label}</span><small>${C.iconHTML('gold',true)}${C.fmt(q.total)}</small></button>`;}
function rowBtn(action,id,label,ok){return `<button type="button" class="pixel-button z2-rowbtn${ok?'':' locked'}" data-action="${action}" data-id="${id}" data-zb="gold"${ok?'':' aria-disabled="true"'}>${ok?'':'<i class="hv-lock" aria-hidden="true"></i>'}<span>${label}</span></button>`;}

function skillPanel(h){const s=C.game().state,lv=h.skillLevel||0,cost=C.game().skillCost?.(h.id)||{gold:80+lv*50,ore:8+lv*4};let reason='',ok=true,btn='學習';
 if(lv>=5){ok=false;btn='MAX';reason='<span class="ok">戰鬥技能已達 Lv.5</span>';}
 else if(!s.buildings.academy){ok=false;reason='<span class="no">要先建造學院</span>';}
 else if(s.gold<cost.gold||s.ore<cost.ore){ok=false;reason=need('金幣',s.gold,cost.gold)+' '+need('鐵礦',s.ore,cost.ore);}
 const mBtn=!ok&&s.buildings.academy&&lv<5?merchantRowBtn('merchantSkill',h.id,'補料學習',cost):'';
 return `<div class="z2-list">`+rowHTML({icon:'scroll',name:`戰鬥技能 Lv.${lv}/5`,desc:'每級攻擊 +10%，在學院學習',cost:lv<5?`費用 ${C.iconHTML('gold',true)} ${C.fmt(cost.gold)} · 鐵礦 ${cost.ore}`:'',reason,btn:mBtn||rowBtn('learnSkill',h.id,btn,ok)})+`</div>`;}
function gearPanel(h){const s=C.game().state,wl=h.weaponLevel||0,cost=C.game().enhanceCost?.(h.id)||{gold:60+wl*30,ore:6+wl*3};let reason='',ok=true,btn='強化';
 if(!h.equipment.weapon){ok=false;reason='<span class="no">還沒有武器：鐵匠鋪製造後，獵人回村會自己購買</span>';}
 else if(wl>=10){ok=false;btn='MAX';reason='<span class="ok">武器已強化到 +10</span>';}
 else if(!s.buildings.enhancement){ok=false;reason='<span class="no">要先建造強化精煉所</span>';}
 else if(s.gold<cost.gold||s.ore<cost.ore){ok=false;reason=need('金幣',s.gold,cost.gold)+' '+need('鐵礦',s.ore,cost.ore);}
 const mBtn=!ok&&h.equipment.weapon&&wl<10&&s.buildings.enhancement?merchantRowBtn('merchantEnhance',h.id,'補料強化',cost):'';
 return `<div class="z2-list">`
  +rowHTML({icon:'swords',name:h.equipment.weapon?`${gearAt('weapon',tierOf(h,'weapon')).name} +${wl}`:'未裝備武器',tone:h.equipment.weapon?gradeOfLv(wl):'',desc:`攻擊 +${gearAt('weapon',tierOf(h,'weapon')||1).bonus}，每級強化再 +7%`,cost:h.equipment.weapon&&wl<10?`費用 ${C.iconHTML('gold',true)} ${C.fmt(cost.gold)} · 鐵礦 ${cost.ore}`:'',reason,btn:mBtn||rowBtn('enhanceHunter',h.id,btn,ok)})
  +GEAR_RECIPES.map(r0=>{const t=tierOf(h,r0.type),on=t>0,r=gearAt(r0,t||1);
    return rowHTML({icon:'def',name:on?r.name:`未裝備${r0.slotName}`,tone:on?TIER_GRADE[t]:'',desc:`生命 +${r.hp} · 防禦 +${r.def}`,reason:on?(t<GEAR_TIER_MAX?'<span class="ok">有更高階庫存時會自己換新</span>':'<span class="ok">已是最高階 Ⅴ</span>'):`<span class="no">鐵匠鋪製造${r0.slotName}後，獵人回村會自己購買</span>`});}).join('')
  +`</div>`;}
function rebirthPanel(h){const ready=h.level>=100,maxed=h.rebirths>=20;
 return `<div class="z2-list">`+rowHTML({icon:'rebirth',name:`轉世 ${h.rebirths}/20`,desc:'Lv.100 可轉世：等級回到 1，基礎能力永久 +35%、防禦 +2',
  reason:maxed?'<span class="ok">已完成全部 20 次轉世</span>':ready?'<span class="ok">已達 Lv.100，可以轉世</span>':`<span class="no">Lv.100 才能轉世（還差 ${100-h.level} 級）</span>`,
  btn:rowBtn('reincarnate',h.id,'轉世',ready&&!maxed)})+`</div>`;}

export function hunterDetailHTML(h){
 const r=C.RARITIES.find(v=>v.id===h.rarity),cls=C.CLASSES.find(c=>c.id===h.classId),max=h.level>=100,xn=xpNeed(h.level),xp=Math.min(h.xp||0,xn);
 const filled=Math.min(STARS,Math.floor((h.rebirths||0)/STEP));
 const tab=HC_TABS.some(t=>t[0]===hc.tab)?hc.tab:'info';
 const panel=tab==='skill'?skillPanel(h):tab==='gear'?gearPanel(h):tab==='rebirth'?rebirthPanel(h):infoPanel(h,cls,r);
 const t=trainState(h);
 return `<div class="z2-hc" data-rarity="${h.rarity}" data-tab="${tab}" style="--rarity:${r?.color||'#d3cab2'}">`
  +`<div class="z2-left"><div class="z2-top"><div class="z2-star-box"><span class="z2-stars" role="img" aria-label="轉世 ${h.rebirths||0} 次">${Array.from({length:STARS},(_,i)=>`<i class="${i<filled?'on':''}"></i>`).join('')}</span><small class="z2-rb">轉世 ${h.rebirths||0}</small></div>`
  +`<div class="z2-gold" role="status" aria-label="個人金幣 ${C.fmt(h.gold)}">${C.iconHTML('gold',true)}<small>個人金幣</small><b>${C.fmt(h.gold)}</b></div></div>`
  +ringHTML(h)
  +`<div class="z2-xp" role="progressbar" aria-label="經驗值" aria-valuemin="0" aria-valuemax="${max?1:xn}" aria-valuenow="${max?1:Math.floor(xp)}"><span class="z2-xp-fill" style="width:${max?100:(xp/xn*100).toFixed(1)}%"></span><b>${max?'經驗值已滿（Lv.100）':`經驗值 ${Math.floor(xp)}/${xn}`}</b></div></div>`
  +`<div class="z2-right"><div class="z2-tabs" role="tablist" aria-label="獵人資料">${HC_TABS.map(([id,label,ic])=>`<button type="button" role="tab" class="z2-tab${id===tab?' on':''}" aria-selected="${id===tab}" data-action="hunterTab" data-id="${id}">${C.iconHTML(ic,true)}<span>${label}</span></button>`).join('')}</div>`
  +`<div class="z2-panel" role="tabpanel">${panel}</div></div>`
  +`<button type="button" class="pixel-button z2-train-btn${t.ok?'':' locked'}" data-action="train" data-id="${h.id}" data-foot="primary"${t.ok?'':' aria-disabled="true"'}>修煉${t.ok?'':`<small class="z2-train-why">${t.why}</small>`}</button></div>`;   // 2026-11-16:鎖住時按鈕上直接寫原因(要先蓋修煉地／冷卻／金幣不足),不必捲到資訊頁底找
}

// ───────── 新獵人到訪暗帶(規格 j) ─────────
export const vb={pick:'',later:new Set(),seen:null};   // 選中的訪客、按過「稍後」的訪客 id、已經見過的訪客 id(用來只在「新到」時自動彈出)
const RANK={legendary:4,heroic:3,superior:2,rare:1,normal:0};
export function bandVisitors(){const s=C.game().state,list=[...(s.visitors||[])];
 list.sort((a,b)=>((s.gold>=b.cost)-(s.gold>=a.cost))||(RANK[b.rarity]-RANK[a.rarity])||(a.cost-b.cost));return list.slice(0,2);}
export function visitorBandHTML(){
 const s=C.game().state,list=bandVisitors(),all=(s.visitors||[]).length;
 if(!list.length)return `<div class="z2-band"><h3 class="z2-band-t">新的獵人！</h3><p class="z2-band-p">現在沒有旅人，等一下再來看看。</p><div class="z2-band-btns"><button type="button" class="pixel-button" data-action="close" data-zb="red">關閉</button></div></div>`;
 let pick=list.find(v=>v.id===vb.pick);if(!pick){pick=list[0];vb.pick=pick.id;}
 const c=C.CLASSES.find(x=>x.id===pick.classId),r=C.RARITIES.find(x=>x.id===pick.rarity),t=C.TRAITS.find(x=>x.id===pick.trait),pv=C.game().visitorPreview(pick),afford=s.gold>=pick.cost,short=pick.cost-s.gold;
 const cards=list.map(v=>{const cc=C.CLASSES.find(x=>x.id===v.classId),rr=C.RARITIES.find(x=>x.id===v.rarity),on=v.id===pick.id;
  return `<button type="button" class="z2-vcard${on?' on':''}" data-action="visitorPick" data-id="${v.id}" data-rarity="${v.rarity}" aria-pressed="${on}" aria-label="${C.esc(cc?.name||'')}（${rr?.name||''}）" style="--rarity:${rr?.color}"><em class="z2-vr">${rr?.name||''}</em><img src="${C.portrait({id:v.id,classId:v.classId,rarity:v.rarity})}" alt=""><b class="z2-vn">${C.esc(cc?.name||'')}</b></button>`;}).join('');
 return `<div class="z2-band" role="group" aria-label="新的獵人到訪"><h3 class="z2-band-t">新的獵人！</h3><div class="z2-vcards">${cards}</div>`
  +`<p class="z2-band-p"><b style="color:${r?.color}">${r?.name||''}</b> ${C.esc(c?.name||'')} · ${C.esc(t?.name||'')}：${C.esc(t?.desc||'')}<br><span class="z2-band-s">攻擊 ${pv.attack} · 防禦 ${pv.defense} · 生命 ${pv.maxHp} · ${afford?`加入需要 ${C.fmt(pick.cost)} 金幣`:`<span class="no">還缺 ${C.fmt(short)} 金幣</span>`}</span></p>`
  +`<div class="z2-band-btns"><button type="button" class="pixel-button${afford?'':' locked'}" data-action="recruitVisitor" data-id="${pick.id}" data-zb="olive"${afford?'':' aria-disabled="true"'}>${afford?'':'<i class="hv-lock" aria-hidden="true"></i>'}邀請</button><button type="button" class="pixel-button" data-action="visitorLater" data-zb="red">稍後</button></div>`
  +(all>list.length||all>1?`<button type="button" class="z2-band-all" data-action="recruit">看全部旅人（${all}）</button>`:'')+`</div>`;
}
// 新訪客「到」的那一刻(不是每幀都有):回傳要不要自動彈出暗帶。第一次呼叫只記下現有的訪客;之後出現沒見過的 id、付得起、玩家閒著才彈。
export function visitorArrival(busy){const s=C.game().state,vs=s.visitors||[];
 if(!vb.seen){vb.seen=new Set(vs.map(v=>v.id));return false;}
 const fresh=vs.filter(v=>!vb.seen.has(v.id));for(const v of vs)vb.seen.add(v.id);
 return !busy&&fresh.some(v=>s.gold>=v.cost&&!vb.later.has(v.id));}
