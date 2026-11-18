// z2a-hunter.js — Z2A(圖鑑規格 v2 的 f、g、j 節):獵人卡(C 視窗內容)、名冊卡、新獵人到訪暗帶(D)的 HTML。
// 只產生字串;狀態(游標位置、哪張子頁籤)放在這裡的 hc／vb,事件接線在 pixel-ui.js 的 doAction。
import {tipAttr,tipGradeName} from './ui-tip.js';
import {GEAR_SLOTS,EQUIP_SLOTS,MATERIALS,GEAR_TIER_MAX,GEAR_TIERS,gearItemView} from './pixel-data.js';
let C=null;   // { esc, fmt, iconHTML, portrait, game:()=>game, RARITIES, CLASSES, TRAITS }
export const initHunterUI=ctx=>{C=ctx;};

// ───────── 獵人卡(規格 g) ─────────
export const hc={tab:'info',id:''};   // 目前的子頁籤、正在看的獵人(換人或關掉再開就回到「資訊」)
export const HC_TABS=[['info','資訊','hunter'],['skill','技能','scroll'],['gear','裝備','swords'],['rebirth','轉世','rebirth']];
const xpNeed=l=>30+l*8;   // 同 pixel-game.js 的 xpNeeded(那邊沒匯出)
const attackInterval=h=>(h.classId==='sorcerer'?1.65:h.classId==='priest'?1.4:h.classId==='archer'?1.2:1.1)*(h.trait==='swift'?.9:1);   // 同 pixel-game.js 的 attackInterval
const gradeOfLv=lv=>lv>=10?'legendary':lv>=7?'heroic':lv>=4?'superior':lv>=1?'rare':'normal';
const STARS=5,STEP=4;   // 轉世 4 次點亮 1 顆星,20 次滿 5 星

// 2026-11-15 裝備物品化:每個格子顯示穿在身上的真實物品(沒有 h.gear 的舊物件才退回 equipment 布林值)
// 2026-11-17 併入裝備階級Ⅰ–Ⅴ:物品一律經過 gearItemView(升級件帶 grade/numeral,名稱與數值照階級)
const SLOT_LABEL={weapon:'武器',helm:'頭盔',chest:'胸甲',belt:'腰帶',legs:'腿甲',boots:'靴子',gloves:'手套'};
const itemIn=(h,slot)=>h&&h.gear&&h.gear[slot]?gearItemView(h.gear[slot]):null;
const craftGrade=it=>it&&it.tier==='craft'?it.grade||1:0;
const TIER_GRADE=['normal','normal','rare','superior','heroic','legendary'];   // 階級 → tooltip 品質色
const upNote=t=>t<GEAR_TIER_MAX?'鐵匠鋪有更高階的庫存時，獵人回村會自己花錢換新':'已是最高階 Ⅴ';
// 2026-11-16 裝備縮圖(使用者 m03470):build.mjs 把 assets/gear-icons/<itemId>.png 內嵌成
// window.PIXEL_ASSETS.gearIcons;沒有 key 時回傳空字串,呼叫端退回文字/圖示(不顯示破圖)。
export const gearIconSrc=id=>{const m=globalThis.PIXEL_ASSETS&&globalThis.PIXEL_ASSETS.gearIcons;return m&&id&&m[id]?m[id]:'';};
export function gearIconHTML(it,size=28,extra=''){const src=it&&gearIconSrc(it.id);return src?`<img class="gico${extra?' '+extra:''}" src="${src}" alt="" width="${size}" height="${size}" loading="lazy" decoding="async">`:'';}
const statLine=it=>{const s=(it&&it.stats)||{},parts=[];if(s.atk)parts.push(`攻擊 +${s.atk}`);if(s.hp)parts.push(`生命 +${s.hp}`);if(s.def)parts.push(`防禦 +${s.def}`);return parts.length?parts.join(' · '):'沒有數值加成';};
// 2026-11-16 裝備經濟:滑過裝備格就看得到「賣價與分解產出」
const salvageLine=it=>Object.entries(it.salvage||{}).map(([k,n])=>`${(MATERIALS[k]||{}).name||k}×${n}`).join('、')||'—';
const gearValueLine=it=>`售 ${it.sell} 金 · 分解 ${salvageLine(it)}`;
function gearSlotTip(h,slot){const it=itemIn(h,slot),t=craftGrade(it);
 return it?{name:it.name,grade:t?TIER_GRADE[t]||'superior':'normal',icon:slot==='weapon'?'swords':'def',stats:[['位置',SLOT_LABEL[slot]],...(t?[['階級',it.numeral]]:[]),['攻擊','+'+(it.stats.atk||0)],['生命','+'+(it.stats.hp||0)],['防禦','+'+(it.stats.def||0)]],lines:[['pos',statLine(it)],['note',gearValueLine(it)],['note',t?upNote(t):'鐵匠鋪製造升級件後，獵人回村會用個人金幣換上']]}
  :{name:`${SLOT_LABEL[slot]}（空）`,grade:'normal',icon:slot==='weapon'?'swords':'def',stats:[['狀態','未穿戴']],lines:[['neg','這個位置沒有數值加成'],['note',`倉庫裡有${SLOT_LABEL[slot]}時可以在裝備頁穿上`]]};}
function weaponTip(h){const lv=h.weaponLevel||0,it=itemIn(h,'weapon'),on=!!(it||h.equipment?.weapon),fine=!!h.equipment?.weapon,g=gradeOfLv(fine?lv:0),atk=it?(it.stats&&it.stats.atk)||0:7,t=fine?craftGrade(it)||1:0,num=GEAR_TIERS[Math.max(1,t)-1].numeral;
 return on&&!fine?{name:it.name,grade:'normal',icon:'swords',stats:[['位置','武器'],['攻擊','+'+atk]],lines:[['note','初始武器：只有外觀，沒有數值加成'],['note','鐵匠鋪製造精鐵武器後，獵人回村會用個人金幣購買（之後才能強化）']]}
  :on?{name:it?it.name:'精鐵武器',grade:g,icon:'swords',stars:Math.ceil(lv/2),level:'+'+lv,stats:[['品質',tipGradeName(g)],['階級',num],['強化',`+${lv} / 10`],['攻擊','+'+atk]],
   lines:[['pos',`攻擊 +${atk}（第 ${num} 階）`],lv?['pos',`強化 +${lv}：攻擊再 +${lv*7}%`]:null,lv<10?['note','強化精煉所可以繼續強化']:['note','已強化到最高 +10'],['note',upNote(t)]]}
  :{name:'武器（空）',grade:'normal',icon:'swords',stats:[['狀態','未穿戴']],lines:[['neg','少了 攻擊 +7'],['note','在鐵匠鋪製造武器後，獵人回村會用個人金幣購買']]};}

const SLOT_GLYPH={helm:'盔',chest:'甲',belt:'腰',legs:'腿',boots:'靴',gloves:'手'};
// 2026-11-16:裝備格右下角標階級(Ⅰ–Ⅴ,只有鐵匠鋪升級件才有),一眼看出哪一格該換新
const tierBadge=it=>{const t=craftGrade(it);return t>0?`<b class="z2-tier" data-tier="${t}" aria-hidden="true">${GEAR_TIERS[Math.min(GEAR_TIERS.length,t)-1]?.numeral||t}</b>`:'';};
function ringHTML(h){const I=C.iconHTML,wl=h.weaponLevel||0,ws=Math.ceil(wl/2),wIt=itemIn(h,'weapon'),wOn=!!(wIt||h.equipment?.weapon);
 const stars=n=>n?`<span class="z2-sstars" aria-hidden="true">${'<i></i>'.repeat(Math.min(5,n))}</span>`:'';
 return `<div class="z2-ring"><i class="z2-spot" aria-hidden="true"></i>`
  +`<button type="button" class="z2-slot s-w ${wOn?'eq':'open'}" aria-label="武器：${wIt?wIt.name+(wl?' +'+wl:''):wOn?'已裝備':'未穿戴'}"${tipAttr(weaponTip(h))}>${(wIt&&gearIconHTML(wIt,34))||I('swords',true)}${wOn?stars(ws||1):''}${tierBadge(wIt)}</button>`
  +GEAR_SLOTS.map((slot,i)=>{const it=itemIn(h,slot),on=!!it||!!h.equipment?.[slot];
    return `<button type="button" class="z2-slot s-g${i+1} ${on?'eq':'open'}" aria-label="${SLOT_LABEL[slot]}：${it?it.name:'未穿戴'}"${tipAttr(gearSlotTip(h,slot))}>${(it&&gearIconHTML(it,32))||`<span class="z2-glyph" aria-hidden="true">${SLOT_GLYPH[slot]||'甲'}</span>`}${tierBadge(it)}</button>`;}).join('')
  +`<img class="z2-fig" src="${C.portrait(h)}" alt="${C.esc(h.name)}"></div>`;}

function barHTML(kind,icon,label,cur,max){const pct=max>0?Math.max(0,Math.min(100,cur/max*100)):0;
 return `<div class="z2-bar ${kind}" role="img" aria-label="${label} ${Math.floor(cur)}/${Math.floor(max)}"><i class="z2-bar-ic" aria-hidden="true">${C.iconHTML(icon,true)}</i><span class="z2-bar-box"><span class="z2-bar-fill" style="width:${pct.toFixed(1)}%"></span><b>${label} ${Math.floor(cur)}/${Math.floor(max)}</b></span></div>`;}
const valRow=(icon,label,v)=>`<div class="z2-val"><i aria-hidden="true">${C.iconHTML(icon,true)}</i><span>${label}</span><b>${v}</b></div>`;

function infoPanel(h,cls,r){const dps=h.attack/attackInterval(h),tr=C.TRAITS.find(t=>t.id===h.trait);
 return `<div class="z2-id"><div class="z2-id-l"><span class="z2-rar-row"><em class="z2-rar" style="color:${r?.color}">${r?.name||''}</em>${promoteChip(h)}</span><span class="z2-cls">等級.${h.level} <b>${cls?.name||''}</b></span><small class="z2-st">${C.esc(h.status)}${tr?` · ${C.esc(tr.name)}`:''}</small></div><div class="z2-dps"><small>每秒攻擊力</small><b>${dps.toFixed(1)}</b></div></div>`
  +`<div class="z2-cols"><div class="z2-bars">${barHTML('hp','hp','生命',h.hp,h.maxHp)}${barHTML('satiety','satiety','飽食',h.satiety,100)}${barHTML('stamina','stamina','精力',h.stamina,100)}${barHTML('mood','mood','心情',h.mood,100)}</div>`
  +`<div class="z2-vals">${valRow('atk','攻擊力',h.attack)}${valRow('def','防禦力',h.defense)}${valRow('scroll','技能等級',`Lv.${h.skillLevel||0}`)}${valRow('anvil','武器強化',`+${h.weaponLevel||0}`)}${valRow('rebirth','轉世',`${h.rebirths}/20`)}</div></div>`
  +`<p class="z2-train z1-hint">${trainHint(h)}</p>`+dismissRow(h);}
// 2026-11-18 送別:資訊頁最底下一顆不顯眼的鈕(名額滿時讓位給更好的旅人)。能不能送別讀 game.dismissCheck(跟 dismissHunter 同一組條件);按了先跳確認框。
function dismissRow(h){const c=C.game().dismissCheck?.(h.id);if(!c)return '';
 return `<div class="z2-dismiss"><button type="button" class="pixel-button quiet z2-dismiss-btn" data-action="dismissHunter" data-id="${h.id}" data-zb="ghost"${c.ok?'':' disabled aria-disabled="true"'} aria-label="送別 ${C.esc(h.name)}">送別</button><small class="z2-dismiss-why">${c.ok?'讓這位獵人離開村莊，空出一個名額':`<span class="no">${C.esc(c.why)}</span>`}</small></div>`;}

// 修煉的條件文字(給資訊頁底部,不夠時說明原因):與 game.train 的檢查同一組
function trainState(h){const s=C.game().state;
 if(!s.buildings.training)return {ok:false,why:'要先蓋修煉地'};if(h.level>=100)return {ok:false,why:'已滿級'};if(h.hp<=0||h.task==='dungeon'||h.task==='arena')return {ok:false,why:'現在無法修煉'};
 if(h.trainCooldown>0)return {ok:false,why:`冷卻 ${Math.ceil(h.trainCooldown)} 秒`};const q=C.game().trainQuote?.(h.id);if(q&&h.gold<q.cost)return {ok:false,why:`還差 ${C.fmt(q.cost-h.gold)} 金`};return {ok:true,why:''};}
// 2026-11-17 修煉重訂:學費＝20＋等級×10(個人金幣,付給村莊),每次約 1 級份經驗(修煉地升級最多 2 級份),冷卻 30 秒
function trainHint(h){const t=trainState(h),q=C.game().trainQuote?.(h.id),lv=(q?.xp||0)/(30+h.level*8);return `<b>修煉</b>：花 ${C.fmt(q?.cost??0)} 個人金幣，得到約 ${Math.max(1,Math.round(lv*4)/4)} 級份經驗（升級修煉地可以更多）。${t.ok?'<span class="ok">現在可以修煉</span>':`<span class="no">${t.why}</span>`}`;}

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
 return `<div class="z2-list">`+rowHTML({icon:'scroll',name:`戰鬥技能 Lv.${lv}/5`,desc:'每級攻擊 +10%，在學院學習',cost:lv<5?`費用 ${C.iconHTML('gold',true)} ${C.fmt(cost.gold)} · 鐵礦 ${cost.ore}`:'',reason,btn:btn==='MAX'?'':(mBtn||rowBtn('learnSkill',h.id,btn,ok))})+`</div>`;}
function gearBtn(action,id,slot,label,tone){return `<button type="button" class="pixel-button z2-rowbtn"${slot?` data-slot="${slot}"`:''} data-action="${action}" data-id="${id}" data-zb="${tone||'ghost'}"><span>${label}</span></button>`;}
// 一格一列真實物品：有穿→名稱/數值/卸下·存倉·出售·分解;沒穿→倉庫同位置候選直接穿上
function gearRow(h,slot){const it=itemIn(h,slot),s=C.game().state,I=C.iconHTML,t=craftGrade(it);
 if(it){const stats=statLine(it),desc=it.name.includes(SLOT_LABEL[slot])?stats:`${SLOT_LABEL[slot]} · ${stats}`;
  return `<div class="z2-row gear-slot" data-slot="${slot}"><i class="z2-row-ic gico-box" aria-hidden="true">${gearIconHTML(it,32)||I(slot==='weapon'?'swords':'def',true)}</i>`
   +`<div class="z2-row-b"><b class="z2-row-n"${t?` data-grade="${TIER_GRADE[t]||'superior'}"`:''}>${C.esc(it.name)}</b><small class="z2-row-d">${desc}</small>${t?`<small class="z2-row-w"><span class="ok">${t<GEAR_TIER_MAX?'有更高階庫存時會自己換新':'已是最高階 Ⅴ'}</span></small>`:''}<div class="gear-btns">`
   +gearBtn('gearUnequip',h.id,slot,'卸下','gold')+gearBtn('gearStore',h.id,slot,'存倉')+gearBtn('gearSell',h.id,slot,'出售','red')+gearBtn('gearSalvage',h.id,slot,'分解')
   +`</div></div></div>`;}
 const cands=(s.gearStorage||[]).map(g=>{const i=gearItemView(g);return i&&i.slot===slot?{uid:g.uid,it:i}:null;}).filter(Boolean);
 const body=cands.length?cands.map(c=>`<button type="button" class="pixel-button z2-rowbtn gear-cand" data-action="gearEquip" data-id="${h.id}" data-uid="${c.uid}" data-zb="olive" aria-label="穿上${C.esc(c.it.name)}"><span>穿上 · ${C.esc(c.it.name)}</span></button>`).join(''):`<small class="z2-row-w">倉庫沒有可穿的${SLOT_LABEL[slot]}</small>`;
 return `<div class="z2-row gear-slot empty" data-slot="${slot}"><i class="z2-row-ic" aria-hidden="true">${I(slot==='weapon'?'swords':'def',true)}</i>`
  +`<div class="z2-row-b"><b class="z2-row-n">未穿戴</b><small class="z2-row-d">${SLOT_LABEL[slot]} · 沒有數值加成</small><div class="gear-btns">${body}</div></div></div>`;}
function gearPanel(h){const s=C.game().state,wl=h.weaponLevel||0,cost=C.game().enhanceCost?.(h.id)||{gold:60+wl*30,ore:6+wl*3},wIt=itemIn(h,'weapon'),hasWeapon=!!h.equipment?.weapon;let reason='',ok=true,btn='強化';
 if(!hasWeapon){ok=false;reason='<span class="no">'+(wIt?'初始武器不能強化：':'還沒有武器：')+'穿上倉庫裡的精鐵武器，或讓獵人買鐵匠鋪的武器</span>';}
 else if(wl>=10){ok=false;btn='MAX';reason='<span class="ok">武器已強化到 +10</span>';}
 else if(!s.buildings.enhancement){ok=false;reason='<span class="no">要先建造強化精煉所</span>';}
 else if(s.gold<cost.gold||s.ore<cost.ore){ok=false;reason=need('金幣',s.gold,cost.gold)+' '+need('鐵礦',s.ore,cost.ore);}
 const mBtn=!ok&&h.equipment.weapon&&wl<10&&s.buildings.enhancement?merchantRowBtn('merchantEnhance',h.id,'補料強化',cost):'';
 return `<div class="z2-list">`
  +rowHTML({icon:'swords',name:hasWeapon?`${wIt?wIt.name:'精鐵武器'} +${wl}`:wIt?`${wIt.name}（初始）`:'未裝備武器',tone:hasWeapon?gradeOfLv(wl):'',desc:hasWeapon||!wIt?`攻擊 +${wIt?(wIt.stats&&wIt.stats.atk)||0:7}，每級強化再 +7%`:'初始武器沒有數值加成；精鐵武器 攻擊 +7，可強化',cost:hasWeapon&&wl<10?`費用 ${C.iconHTML('gold',true)} ${C.fmt(cost.gold)} · 鐵礦 ${cost.ore}`:'',reason,btn:btn==='MAX'?'':(mBtn||rowBtn('enhanceHunter',h.id,btn,ok))})
  +`<p class="gear-hint">穿在身上的裝備是真的物品：卸下、出售、分解或存進倉庫，角色外觀也會跟著變。鐵匠鋪升級件分Ⅰ–Ⅴ階，有更高階庫存時獵人會自己花錢換新（舊的放回倉庫）。</p>`
  +EQUIP_SLOTS.map(slot=>gearRow(h,slot)).join('')
  +`</div>`;}
function rebirthPanel(h){const ready=h.level>=100,maxed=h.rebirths>=20,busy=h.hp<=0?'倒下了，復活後才能轉世':h.task==='dungeon'?'還在地下城裡，先撤退回村才能轉世':h.task==='arena'?'競技場打完才能轉世':'';   // 2026-11-18 跟 reincarnate 的拒絕條件一致,不要顯示「可以轉世」卻按了被拒
 return `<div class="z2-list">`+rowHTML({icon:'rebirth',name:`轉世 ${h.rebirths}/20`,desc:'Lv.100 可轉世：等級回到 1，基礎能力永久 +35%、防禦 +2',
  reason:maxed?'<span class="ok">已完成全部 20 次轉世</span>':ready&&busy?`<span class="no">已達 Lv.100，但${busy}</span>`:ready?'<span class="ok">已達 Lv.100，可以轉世</span>':`<span class="no">Lv.100 才能轉世（還差 ${100-h.level} 級）</span>`,
  // 2026-11-18 Lv.100 但在地下城裡:鎖住的轉世鈕換成「小隊撤退」(整隊一起回村),撤完這頁直接可以轉世
  btn:ready&&!maxed&&h.hp>0&&h.task==='dungeon'&&C.game().state.dungeon.active?`<button type="button" class="pixel-button z2-rowbtn" data-action="hunterRetreat" data-id="${h.id}" data-zb="red"><span>小隊撤退</span></button>`:rowBtn('reincarnate',h.id,'轉世',ready&&!maxed&&!busy)})+promoteRow(h,busy)+`</div>`;}
// 2026-11-18 晉升:稀有度升一階(村莊金幣＋星晶)。後期金幣與星晶的出口,放在轉世旁邊(都是永久成長)。
// 2026-11-18 資訊頁稀有度旁:金幣與星晶夠晉升時出現「可晉升」小鈕,點了跳到「轉世」頁(晉升放在那裡,不然沒人找得到)
function promoteChip(h){const g=C.game(),s=g.state,q=g.promoteQuote?.(h.id);if(!q||q.max||s.gold<q.gold||s.gems<q.gems)return '';return `<button type="button" class="z2-promo-chip" data-action="hunterTab" data-id="rebirth" aria-label="可以晉升為${q.name}，前往轉世頁">${C.iconHTML('up',true)}可晉升</button>`;}
function promoteRow(h,busy){const g=C.game(),s=g.state,q=g.promoteQuote?.(h.id);if(!q)return '';const cur=C.RARITIES.find(v=>v.id===h.rarity);
 if(q.max)return rowHTML({icon:'up',name:`稀有度：${cur.name}`,tone:h.rarity,desc:'已是最高稀有度，能力倍率 ×1.5',reason:'<span class="ok">晉升已完成</span>'});
 const pct=Math.round((q.mult/q.from-1)*100),ok=!busy&&s.gold>=q.gold&&s.gems>=q.gems;
 return rowHTML({icon:'up',name:`晉升：${cur.name} → ${q.name}`,tone:q.next,desc:`生命、攻擊再 +${pct}%（能力倍率 ×${q.from} → ×${q.mult}）`,
  cost:`費用 ${C.iconHTML('gold',true)} ${C.fmt(q.gold)} · ${C.iconHTML('gems',true)} ${q.gems}`,
  reason:busy?`<span class="no">${busy.replace('轉世','晉升')}</span>`:ok?'<span class="ok">村莊金幣與星晶足夠</span>':need('金幣',s.gold,q.gold)+' '+need('星晶',s.gems,q.gems)+(s.gems<q.gems&&(s.buildings.trading||0)>=5?'<span class="ok"> · 交易所可用金幣買星晶</span>':''),
  btn:rowBtn('promoteHunter',h.id,'晉升',ok)});}

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
 // 2026-11-16:獵人名額滿了就不彈「新的獵人！」(按邀請也招不進來);旅人照樣記成已看過,之後有名額也不會補彈舊的
 return !busy&&(s.hunters||[]).length<(s.capacity||0)&&fresh.some(v=>s.gold>=v.cost&&!vb.later.has(v.id));}
