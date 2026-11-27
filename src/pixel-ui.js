import {WORLD,REGIONS,BIOME_PALETTE,biomeAt} from './overworld.js';
import {iconCanvas,iconsReady} from './pixel-icons.js';
import {assetProgress,markPhase} from './asset-loading.js';
import {createGame,inspectSave,OFFLINE,ENEMIES} from './pixel-game.js';
import {sfx,sfxMuted,ambientSet,ambientRain} from './sfx.js';
import {UI_ICONS} from './ui-icons.js';   // T-ui: PixelLab 產的圖示（存在才覆蓋）
import {REGION_MONSTERS,MONSTER_NAME,MONSTER_LORE} from './lore.js';
import {createPixelWorld,drawPortrait,buildingDataURL,MAP_PALETTE,MAP_ACCENT,monsterPortrait} from './pixel-world.js';
import {mountTmwPuppet} from './tmw-puppet.js';
import {mountHeroLoomLab} from './heroloom-lab.js';  // ?loom=1 HeroLoom 紙娃娃實驗面板(docs/HEROLOOM.md)
import {mountPaperdollLab} from './paperdoll-lab.js';  // ?dv2lab=1 DV2 紙娃娃詳細面板(32 組動作姿勢、性別、石化、帽子、新武器;docs/DV2-PHASE6.md)
import {academySkillMult,AFFINITY,BUILDINGS,CLASSES,RARITIES,TRAITS,MATERIALS,PRODUCTS,RECIPES,GEAR_TIERS,gearAt,DIFFICULTIES,PILOT_ATTACK,SKILLS,SAVE_KEY,MERCHANT,EQUIPMENT,EQUIP_SLOTS,gearItemView,recipeItemId,canWield,WEAPON_TYPES,CLASS_WEAPON_TYPES,REALTIME} from './pixel-data.js';
import {isRealNight,agoText,waitText,playTimeText} from './real-clock.js';   // 2026-11-26 拿掉遊戲內日夜:需要白天黑夜/「天」的地方改看真實時間
import {tipAttr,initTips} from './ui-tip.js';   // Z2A:迷你視窗 tooltip(給任何面板用:元素加 ${tipAttr({name,grade,icon,stars,level,stats,lines})},說明見 ui-tip.js 開頭)
import {hc,HC_TABS,initHunterUI,hunterDetailHTML,gearIconHTML,gearIconSrc} from './z2a-hunter.js';   // Z2A:獵人卡(2026-11-25 新獵人暗帶隨旅人一起取消)

// ===== T157：把 PixelLab 的 UI 素材接上 CSS 變數 =====
// CSS 早就寫好 var(--ui-px-banner-dungeon) 這種用法，但專案裡沒有任何地方定義 --ui-px-*，
// 於是 14 張付費橫幅、卡片/視窗/按鈕底圖全部是「無效宣告」→ 面板頂部一直是純色。
// build 會把 assets/ui/*.png 塞進 window.PIXEL_ASSETS.ui（鍵名 px-*），這裡一次轉成 :root 變數。
function applyUiVars(){
  const ui=globalThis.PIXEL_ASSETS?.ui||{};
  let css=':root{';
  for(const [k,v] of Object.entries(ui)){
    if(!k.startsWith('px-')||typeof v!=='string'||!v)continue;
    css+=`--ui-px-${k.slice(3)}:url("${v.replace(/"/g,'%22')}");`;
  }
  css+='}';
  let el=document.getElementById('ui-px-vars');
  if(!el){el=document.createElement('style');el.id='ui-px-vars';document.head.append(el);}
  if(el.textContent!==css)el.textContent=css;
}
applyUiVars();

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Math.floor(Number(n)||0).toLocaleString('en-US');
// 區域切換過場：世界會整塊重建，直接換畫面會有一下跳動，所以先蓋一層霧再換。
// 遮罩不吃 pointer-events（避免擋住任何按鈕），減少動態時直接切換。
const travelReduced=()=>{try{return matchMedia('(prefers-reduced-motion: reduce)').matches}catch{return false}};
let travelVeilEl=null,travelVeilTimer=0,travelHoldTimer=0;
function travelVeil(label,run){
  if(travelReduced()){run();return}
  travelVeilEl??=document.createElement('div');
  const v=travelVeilEl;
  v.id='travel-veil';
  v.innerHTML='<div class="tv-inner"><b>'+esc(label||'出發')+'</b><small>整裝出發，隊伍正在穿越邊界…</small></div>';
  if(!v.isConnected)document.body.append(v);
  v.classList.remove('leave');
  void v.offsetWidth;
  v.classList.add('on');
  clearTimeout(travelVeilTimer);clearTimeout(travelHoldTimer);
  travelVeilTimer=setTimeout(()=>{
    try{run()}catch(e){console.error(e)}
    travelHoldTimer=setTimeout(()=>{v.classList.remove('on');v.classList.add('leave');setTimeout(()=>v.classList.remove('leave'),240)},220);
  },200);
}
// top-bar resources on phones: 5+ digits do not fit the 4-across row, so 12,345 → 12.3k (exact numbers stay in the storehouse)
const TOP_NARROW=matchMedia('(max-width:760px),(max-height:520px)');
const TOUCH_ONLY=matchMedia('(pointer:coarse)');
// 系統設定「減少動態效果」:Web Animations 不受 CSS 的 prefers-reduced-motion 影響,所以文字淡入要自己關掉。
const REDUCE_MOTION=matchMedia('(prefers-reduced-motion: reduce)');
const topNum=v=>{const n=Math.floor(Number(v)||0);return !TOP_NARROW.matches||n<1e4?fmt(n):n<1e5?(Math.floor(n/100)/10).toFixed(1)+'k':n<1e6?Math.floor(n/1e3)+'k':(Math.floor(n/1e5)/10).toFixed(1)+'M';};
// 2026-10-30 按鈕巡檢:左側面板、建築資訊每 0.4 秒整塊重畫 → 按下去到放開之間按鈕被換掉,這次點擊就落空(手機約 1/4 機率)。
// 定時重畫的區塊改走 $H(...).innerHTML=:內容沒變不動 DOM;手指/滑鼠還按在這一塊上先不換,放開後下一輪再補。
let pressEl=null;document.addEventListener('pointerdown',e=>{pressEl=e.target;},true);
for(const t of ['pointerup','pointercancel'])document.addEventListener(t,()=>setTimeout(()=>{pressEl=null;},0),true);
function setHTML(el,html){if(!el||el.__html===html)return;if(pressEl&&el.contains(pressEl))return;el.innerHTML=html;el.__html=html;}
const $H=sel=>{const el=document.querySelector(sel);return{set innerHTML(v){setHTML(el,v);}};};
let game,world,started=false,modal='',selected=null,portraitCache={},last=0,lastSave=0,leftOpen=false,placing=null,wandererPeek=-1;
// 派遣組隊:使用者自己挑要出征哪幾位(空陣列=未初始化 → 開啟視窗時預設全選存活獵人)。
let dispatchTab=0;   // 目前編輯的隊伍(0-3);隊員與區域都存在 game.state.dispatchTeams
// T54:鍵盤焦點 —— 彈窗開著時 Tab 只在彈窗裡跑(順序＝視覺順序),關窗後焦點回到開窗的那顆鈕。
const MODAL_FOCUSABLE='button,input,select,textarea,a[href],[tabindex]';
// 只有被背板真正蓋住的幾塊要 inert。上方資源列／下方分頁列在彈窗開著時照設計留在最上層(body.hud-modal z-index:32 > 背板 30),
// 滑鼠點分頁要照樣能用 → 不能把整個 #game-ui 或 #topbar 設成 inert。
const HUD_BEHIND_MODAL='#left-panel,#reopen-left,#inspector,.view-tools,#hd2d-cam,#placement,.hv-actions,#hv-left';   // 2026-11-11 獵魔村風格:世界地圖鈕搬進頂部圖示列、召喚首領改成右側行動徽章
let modalOpener=null;
// T121：第一次開局（沒有存檔、也不是 ?preview=1）時彈一次入門嚮導
let firstRun=false,bootHadSave=false;   // bootHadSave(FIX-A B5):開機當下是否已有存檔,標題畫面的「繼續／重新開始」只看這個
const modalShown=()=>!$('#modal-backdrop').classList.contains('hidden');
const modalDismissible=()=>$('#modal').dataset.kind!=='confirm';   // 確認對話框只能按按鈕回答,不能被 Esc／點背板打發掉
function hudInert(on){for(const el of document.querySelectorAll(HUD_BEHIND_MODAL)){if(on)el.inert=true;else el.inert=false;}}
initTips({esc,iconHTML,setIcons});   // Z2A:要比下面的 Esc 監聽先註冊,Esc 才會先關 tooltip、再按一次才關視窗
initHunterUI({esc,fmt,iconHTML,portrait,game:()=>game,RARITIES,CLASSES,TRAITS});
function modalTabTargets(){const box=$('#modal');if(!box)return [];
 return [...box.querySelectorAll(MODAL_FOCUSABLE)].filter(el=>!el.disabled&&el.tabIndex>=0&&el.getBoundingClientRect().width>0&&!el.closest('.hidden'));}
function focusModalStart(prev){if(!modal)return;
 const all=[...document.querySelectorAll('#modal '+MODAL_FOCUSABLE)];
 let el=prev&&prev.dataset&&prev.dataset.action?all.find(x=>x.dataset.action===prev.dataset.action&&(prev.dataset.id==null||x.dataset.id===prev.dataset.id)):null;
 if(!el&&prev&&prev.id){const byId=document.getElementById(prev.id);if(byId&&byId.closest('#modal')&&!byId.disabled&&byId.getBoundingClientRect().width>0)el=byId;}   // 重畫後同一個 id 的輸入框
 // 2026-11-11 第二階段:剛打開面板時焦點放在面板容器(#modal tabindex=-1,不畫框),不放在右上 X —— 否則 X 一開就掛著金色焦點框。
 // 鍵盤使用者按 Tab 就從容器進到第一顆控件(X),那時 :focus-visible 照樣畫清楚的框。
 if(!el||el.disabled||!el.getBoundingClientRect().width)el=$('#modal');
 el?.focus({preventScroll:true});}
function trapModalTab(e){if(!modal||e.key!=='Tab')return;
 const list=modalTabTargets();if(!list.length)return;
 const first=list[0],last=list[list.length-1],now=document.activeElement,inside=!!now&&!!now.closest&&!!now.closest('#modal');
 if(!inside||now===$('#modal')){e.preventDefault();(e.shiftKey?last:first).focus();return;}
 if(e.shiftKey&&now===first){e.preventDefault();last.focus();return;}
 if(!e.shiftKey&&now===last){e.preventDefault();first.focus();}}
document.addEventListener('scroll',e=>{const c=e.target;if(!c||c.id!=='modal-content')return;const w=c.querySelector('.eq-who');if(!w)return;const on=w.classList.contains('compact');if(!on&&c.scrollTop>150)w.classList.add('compact');else if(on&&c.scrollTop<60)w.classList.remove('compact');},true);   // 裝備倉庫:往下捲時獵人切換列釘在上方並縮成單列
document.addEventListener('keydown',e=>trapModalTab(e),true);   // capture:在其他 handler 的 input/textarea/select 早退之前就處理 Tab
document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;if(placing){placing=null;$('#placement').classList.add('hidden');world?.placeMode(null);}else if(!modal&&pilotOpen&&!pilotCur()){pilotOpen=false;pickOpen=false;pilotPaint();}else if(modalDismissible())closeModal(true);},true);   // FIX-A B3:手動操控選角清單(還沒選人)也能用 Esc 收;Esc 走自己的 capture 監聽:焦點在交易所的數字輸入框裡也要關得掉
let infoRegion='meadow';   // 「地圖詳細資訊」彈窗目前看的區域
let regionFrom='dispatch';   // T158：region 面板從哪裡開的（dispatch 派遣流程 / density 場上區域立牌）
let densityRegion='meadow';   // 地區立牌(怪物數量切換)目前看的區域
const riskStars=risk=>{const n=Math.max(1,Math.min(5,Math.round((risk-1)/.16)+1));return '★'.repeat(n)+'☆'.repeat(5-n);};
const aliveHunters=()=>game.state.hunters.filter(h=>h.hp>0);   // leftOpen=false:村長委託看板預設收起
const $=s=>document.querySelector(s);
const AS=()=>window.PIXEL_ASSETS||{};
const icon=iconCanvas;
const previewMode=new URLSearchParams(location.search).has('preview');
const artReviewMode=new URLSearchParams(location.search).get('preview')==='art-complete';
document.body.dataset.artReview=artReviewMode?'1':'0';
document.body.classList.toggle('art-review',artReviewMode);
const buildingImages=new Map();
const buildingImg=id=>{if(!buildingImages.has(id))buildingImages.set(id,buildingDataURL(id));return buildingImages.get(id);};
window.addEventListener('pixel-assets-ready',()=>{buildingImages.clear();if(selected)paintInspector();});

function setIcons(root=document){root.querySelectorAll('[data-icon]').forEach(e=>{const n=e.dataset.icon;if(e.firstElementChild?.dataset?.type===n)return;e.innerHTML='';if(UI_ICONS[n]){const im=document.createElement('img');im.src=UI_ICONS[n];im.alt='';im.className='ui-ico';im.dataset.type=n;im.draggable=false;e.append(im);}else{const c=icon(n);c.dataset.type=n;e.append(c);}});}
function iconHTML(n,hidden=false){return `<span class="inline-icon"${hidden?' aria-hidden="true"':''} data-icon="${n}"></span>`;}
// key = 配方 id(2026-11-24 起武器格有 sword/hammer/bow/staff/dagger 五份;防具的配方 id = 格名)或舊的格名
function craftGearIconHTML(key,size=32,fallback='anvil'){const r=RECIPES.find(x=>x.id===key),id=r?recipeItemId(r):'craft_'+key,src=gearIconSrc(id);return src?`<span class="inline-icon gico-wrap" data-icon="${id}" aria-hidden="true"><img class="gico" data-type="${id}" src="${src}" alt="" width="${size}" height="${size}" loading="lazy" decoding="async"></span>`:iconHTML(fallback);}
// 2026-11-16 裝備縮圖(使用者 m03470):倉庫的每一件真裝備都有自己的 32×32 縮圖,外加「已穿全套」小圖條。
// 縮圖來源由 build.mjs 內嵌成 window.PIXEL_ASSETS.gearIcons[itemId];缺 key 時退回文字單字,不顯示破圖。
const GEAR_NAME={weapon:'武器',helm:'頭盔',chest:'胸甲',belt:'腰帶',legs:'腿甲',boots:'靴子',gloves:'手套'};
const GEAR_TEXT={weapon:'武',helm:'盔',chest:'甲',belt:'腰',legs:'腿',boots:'靴',gloves:'手'};
const gearSetSlots=()=>Array.isArray(EQUIP_SLOTS)?EQUIP_SLOTS:['weapon','helm','chest','belt','legs','boots','gloves'];
function gearSetStripHTML(h){
  return gearSetSlots().map(slot=>{const g=h&&h.gear&&h.gear[slot],it=g&&gearItemView(g),ico=it&&gearIconHTML(it,32);
    return `<span class="gear-set-slot${it?'':' empty'}" data-slot="${slot}" title="${esc(it?it.name:GEAR_NAME[slot]+'（空）')}">${ico||`<b class="gear-set-gl" aria-hidden="true">${GEAR_TEXT[slot]}</b>`}</span>`;}).join('');
}
function gearSetHTML(h){const n=(h&&h.gear)?gearSetSlots().filter(sl=>h.gear[sl]).length:0;
  return `<div class="gear-set" data-gear-set><div class="gear-set-h">${h?`<select class="gear-set-who" data-gear-set-who aria-label="選擇要檢視全套裝備的獵人">${alertHunters().map(x=>`<option value="${x.id}"${x.id===h.id?' selected':''}>${esc(x.name)}</option>`).join('')}</select>`:'<span>全套裝備</span>'}<small data-gear-set-n>已穿 ${n}／7</small></div><div class="gear-set-strip" data-gear-set-strip>${gearSetStripHTML(h)}</div></div>`;}
const alertHunters=()=>((game&&game.state&&game.state.hunters)||[]).filter(h=>h&&h.hp>0);
// T100:隊員卡(派遣/地下城/競技場共用)——頭像 + 名字/等級職業/攻防射程/生命條,一眼看得出該派誰
// T102:遠征準備面板——選不到的理由、小隊總覽、出發條件的按鈕文字
// 2026-11-24 B7/B12:所有血量顯示共用一條規則——活著至少顯示 1、不超過上限、倒下顯示 0;開著的面板每 0.2 秒由 liveHpSync 依 data-lhp 就地更新(以前有的開啟時拍快照、有的跨 10% 才重畫)
const hpShow=(cur,max)=>{const m=Math.max(1,Math.ceil(max||1));return !(cur>0)?0:Math.min(Math.ceil(cur),m);};
const hpRatio=(cur,max)=>Math.max(0,Math.min(1,(cur||0)/Math.max(1,max||1)));
let hpSyncAt=0;
function liveHpSync(now){if(now-hpSyncAt<200||!modal)return;hpSyncAt=now;const box=document.getElementById('modal');if(!box)return;const hs=game.state.hunters;
 for(const el of box.querySelectorAll('[data-lhp]')){const h=hs.find(x=>x.id===el.dataset.lhp);if(!h)continue;const k=el.dataset.lhk,v=hpShow(h.hp,h.maxHp),m=Math.ceil(h.maxHp);
  if(k==='fill'){const w=(hpRatio(h.hp,h.maxHp)*100).toFixed(1)+'%';if(el.style.width!==w)el.style.width=w;const hb=el.closest('.hc-hp');if(hb){const st=hpState(h);hb.dataset.health=st;hb.classList.remove('healthy','hurt','critical');hb.classList.add(st);hb.setAttribute('aria-label',`生命 ${v}/${m}`);}}
  else if(k==='num'){const t=`${v}/${m}`;if(el.textContent!==t)el.textContent=t;}
  else if(k==='label'){const t=`${el.dataset.lbl} ${v}/${m}`;if(el.textContent!==t)el.textContent=t;const bar=el.closest('.z2-bar');if(bar)bar.setAttribute('aria-label',t);const f=bar?.querySelector('.z2-bar-fill');if(f)f.style.width=(hpRatio(h.hp,h.maxHp)*100).toFixed(1)+'%';}}
 for(const el of box.querySelectorAll('[data-lhp-sum]')){const t=fmt(el.dataset.lhpSum.split(',').reduce((n,id)=>{const h=hs.find(x=>x.id===id);return n+(h?hpShow(h.hp,h.maxHp):0);},0));if(el.textContent!==t)el.textContent=t;}}
function partyBlock(h,kind){if(h.hp<=0||h.task==='revive')return '待復活';if(kind==='dungeon'&&h.task==='arena')return '競技場中';if(kind==='arena'&&h.task==='dungeon')return '地下城出征中';return '';}
function partyPick(h,action,sel,note=''){
  const c=CLASSES.find(x=>x.id===h.classId),down=h.hp<=0,range=(c&&c.range>=3)?'遠程':'近戰';
  const kind=/Dungeon/.test(action)?'dungeon':/Arena/.test(action)?'arena':'';
  const rc=RARITIES.find(x=>x.id===h.rarity),rar=rc?` data-rarity="${rc.id}" style="--rarity:${rc.color}"`:'';
  const why=kind?partyBlock(h,kind):'';
  const blocked=!!why, dis=blocked?' disabled':'';
  const hp=hpShow(h.hp,h.maxHp),pct=Math.round(hpRatio(h.hp,h.maxHp)*100);
  const sub=`Lv.${h.level} · ${c?c.name:''}${(why||note)?`<em class="pp-note"> · ${esc(why||note)}</em>`:''}`;
  return `<button${rar} class="party-pick${sel?' selected':''}${down?' down':''}${blocked?' blocked':''}" data-action="${action}" data-id="${h.id}" aria-pressed="${sel}" aria-disabled="${blocked}"${dis} aria-label="${esc(h.name)} Lv.${h.level} ${c?c.name:''} 生命 ${hp}/${Math.ceil(h.maxHp)} 攻擊 ${h.attack} 防禦 ${h.defense}${why||note?' '+esc(why||note):''}"><img data-portrait="${h.id}" alt=""><span class="pp-body"><span class="pp-name">${esc(h.name)}</span><small class="pp-sub">${sub}</small><small class="pp-stats"><em class="pp-k">攻</em>${iconHTML('atk',true)}<b>${h.attack}</b><em class="pp-k">防</em>${iconHTML('def',true)}<b>${h.defense}</b><em class="pp-range">${range}</em></small><span class="pp-hpline"><i class="pp-hp"><i style="width:${pct}%" data-lhp="${h.id}" data-lhk="fill"></i></i><small class="pp-num" data-lhp="${h.id}" data-lhk="num">${hp}/${Math.ceil(h.maxHp)}</small></span></span><small class="pp-mark">${down?'✝':sel?'✓':''}</small></button>`;
}
// 2026-11-18 木材、鐵礦是建設的瓶頸(開局就有 160 木材,會讓「賣 50 份」第一天就出現)→ 全部建築滿級前不顯示賣出(引擎 sellMaterial 不變)
function matSellable(s,id){if((s[id]||0)<MERCHANT.sellLot+MERCHANT.sellKeep)return false;return !(id==='wood'||id==='ore')||BUILDINGS.every(b=>(s.buildings[b.id]||0)>=5);}
function partyList(kind,ids,action,emptyText,emptyHint){const busy=h=>kind&&partyBlock(h,kind)?1:0;return listHTML([...game.state.hunters].sort((x,y)=>busy(x)-busy(y)),h=>partyPick(h,action,ids.includes(h.id),''),emptyText,emptyHint);}
function partySummary(ids){const hs=ids.map(id=>game.state.hunters.find(h=>h.id===id)).filter(Boolean);const atk=hs.reduce((a,h)=>a+h.attack,0),hp=hs.reduce((a,h)=>a+hpShow(h.hp,h.maxHp),0),lv=hs.length?hs.reduce((a,h)=>a+h.level,0)/hs.length:0;return `<div class="party-summary" role="status"><span class="ps-sel">已選 <b>${hs.length}</b>/3</span> <span class="ps-nums">總攻擊 <b>${fmt(atk)}</b> · 總生命 <b data-lhp-sum="${hs.map(h=>h.id).join(',')}">${fmt(hp)}</b>${hs.length?` · 平均 Lv.<b>${lv.toFixed(1)}</b>`:''}</span>${hs.length<3?`<small class="ps-hint ps-state need">再選 ${3-hs.length} 位</small>`:`<small class="ps-state ok">可以出發</small>`}</div>`;}
function partyGate(n,cooldown,idleLabel,lock=''){if(lock)return {disabled:true,lock:true,label:`需要先建造${lock}`};if(cooldown>0)return {disabled:true,label:`小隊整備中 ${Math.ceil(cooldown)} 秒`};if(n<3)return {disabled:true,label:`還缺 ${3-n} 位獵人`};return {disabled:false,label:idleLabel};}
// T116：訊息卡片化——圖示＋語意色（獎勵金／升級金／委託棕／失敗紅／一般綠），進場滑入、離場淡出。
const downWarned=new Set();let downSeen=null;   // 獵人接連倒下的提醒:每個難度每次遊戲只講一次
const TOAST_KINDS={ok:{mark:"✓",color:"#8ebc5e"},reward:{icon:"gold",color:"#e7be5e"},level:{icon:"horn",color:"#f2c96a"},quest:{icon:"scroll",color:"#cfae6a"},error:{icon:"skull",color:"#e0705f"}};
const TOAST_RE=[[/升級|等級提升|轉世|Lv\.\d+/,"level"],[/金幣|獲得|獎勵|收入|成交|賣出|買到|收入/,"reward"],[/委託|章節|任務|完成/,"quest"]];
const toastKindOf=(msg,ok)=>{if(!ok)return "error";const t=String(msg||"");for(const [re,k] of TOAST_RE)if(re.test(t))return k;return "ok";};
// FIX-C:同一句話在顯示期間重複出現 → 合併成一條並顯示「×N」(重新計時、移到最新);面板開著時 #toasts 搬進面板標題列的空位(toastDock)
function toastArm(e,ms){clearTimeout(e._t);e._t=setTimeout(()=>{if(e.parentElement?.dataset.dock&&!e._seen){toastArm(e,600);return;}   // FIX-D:面板開著、排隊中還沒顯示過的 toast 不先過期(不漏看)
  e.classList.add("out");setTimeout(()=>{e.remove();toastDodge();},260);},ms);}
// Z2D(UX #9):由按鈕觸發的失敗訊息(資源不足、不能出發…)改在該按鈕上方(放不下就下方)出現一行小提示,按鈕短暫紅框;不是按鈕觸發的(快捷鍵、計時事件)才走原本的 toast 位置。
// 點擊當下記下被點的元素與矩形(z2dActEl／Rect),400ms 內的失敗 toast 才算「這顆按鈕的」。
let z2dActEl=null,z2dActRect=null,z2dActAt=0,z2dTipT=0;
function z2dTip(text){
  const el=z2dActEl,r=z2dActRect;if(!el||!r||performance.now()-z2dActAt>400)return false;
  if(r.width<16||r.height<16||r.bottom<0||r.top>innerHeight||r.right<0||r.left>innerWidth)return false;
  document.querySelectorAll(".z2d-tip").forEach(t=>t.remove());clearTimeout(z2dTipT);
  const tip=document.createElement("div");tip.className="z2d-tip";tip.setAttribute("role","alert");tip.innerHTML='<span class="z2d-tip-tx"></span>';tip.firstChild.textContent=text;document.body.append(tip);
  const w=tip.offsetWidth,h=tip.offsetHeight,vw=innerWidth,cx=r.left+r.width/2;
  tip.style.left=Math.round(Math.max(8,Math.min(vw-8-w,cx-w/2)))+"px";
  const above=r.top-h-8>=8;tip.dataset.side=above?"up":"down";
  tip.style.top=Math.round(above?r.top-h-8:Math.min(innerHeight-h-8,r.bottom+8))+"px";
  tip.style.setProperty("--tx",Math.round(Math.max(10,Math.min(w-10,cx-parseFloat(tip.style.left))))+"px");   // 小三角對準按鈕中心
  if(el.isConnected){el.classList.add("z2d-fail");setTimeout(()=>el.classList.remove("z2d-fail"),900);}
  z2dTipT=setTimeout(()=>{tip.classList.add("out");setTimeout(()=>tip.remove(),260);},3200);return true;}
function logToast(msg,ok=true,kind,ms=3000){const k=kind&&TOAST_KINDS[kind]?kind:toastKindOf(msg,ok),cfg=TOAST_KINDS[k];if(!ok){sfx("error");if(z2dTip(String(msg)))return;}
  const box=$("#toasts"),text=String(msg),dup=[...box.children].reverse().find(t=>!t.classList.contains("out")&&!t.classList.contains("tq-done")&&t.dataset.msg===text&&t.dataset.kind===k);
  if(dup){const n=(+dup.dataset.n||1)+1;dup.dataset.n=n;let b=dup.querySelector(".toast-n");if(!b){b=document.createElement("small");b.className="toast-n";dup.append(b);}b.textContent="×"+n;dup.classList.add("again");if(box.lastElementChild!==dup)box.append(dup);toastArm(dup,ms);toastDodge();setTimeout(toastDodge,380);return;}
  const e=document.createElement("div");e.className=`toast kind-${k}`;e.dataset.kind=k;e.dataset.msg=text;e.dataset.n="1";e.setAttribute("role","status");e.style.setProperty("--tk",cfg.color);
  e.innerHTML=`<i class="toast-ic">${cfg.icon?iconHTML(cfg.icon):`<b class="toast-check">${cfg.mark}</b>`}</i><span class="toast-tx"></span>`;
  e.querySelector(".toast-tx").textContent=msg;e._seen=!box.dataset.dock;e._ms=ms;box.append(e);setIcons(e);
  while(box.children.length>4)box.firstElementChild.remove();
  toastDodge();setTimeout(toastDodge,380);   // 380ms:進場動畫與面板內容穩定後再算一次
  toastArm(e,ms);}   // 最多同時 4 則（連點製作時不會疊滿整個畫面）
// FIX-D:面板(底部抽屜)開著時,toast 蓋住整個標題列(只留圓形 X),最多兩行;多則時排隊依序顯示、每則至少 TOAST_MIN_MS,不會漏看;關著時回到 body、貼在頁籤列上方
function toastHost(){
  const m=$("#modal"),ins=$("#inspector");
  // Z1:只有 A 模式抽屜讓 toast 住進標題列;C 置中視窗(含建築詳情)開著時 toast 出現在視窗上方的遮罩區(CSS 的 body[data-z1-c]),不蓋視窗標題
  // Z2D(R13):A 抽屜開著時 toast 不再蓋標題列(標題列的子頁籤、工具鈕會被蓋住看不到)→ 改出現在抽屜上方(見 toastDodge 的 data-z2d-a),不再住進標題列
  return null;
}
function zCOpen(){const m=$("#modal"),ins=$("#inspector");return modalShown()?(!!m&&m.dataset.mode==="C"):!!ins&&!ins.classList.contains("hidden");}
const TOAST_MIN_MS=1200;
function toastQueue(box){   // 標題列只有一格:一次顯示一則(最舊的先),顯示滿 TOAST_MIN_MS 且後面還有就讓位;排隊中的加 .tq-wait,看過的加 .tq-done(都由 CSS 藏起來)
  const alive=()=>[...box.children].filter(t=>!t.classList.contains("out")&&!t.classList.contains("tq-done"));
  let live=alive(),h=box._head;
  if(!live.length){box._head=null;return;}
  if(h&&live.includes(h)&&live.length>1&&performance.now()-h._since>=TOAST_MIN_MS){h.classList.add("tq-done");live=alive();h=null;}
  if(!h||!live.includes(h)){h=live[0];h._since=performance.now();if(!h._seen){h._seen=true;toastArm(h,h._ms||3000);}}   // 輪到它才開始計「顯示時間」
  box._head=h;for(const t of live)t.classList.toggle("tq-wait",t!==h);
  clearTimeout(box._tq);if(live.length>1)box._tq=setTimeout(()=>toastQueue(box),Math.max(40,TOAST_MIN_MS-(performance.now()-h._since)+10));}
function toastDock(){const box=$("#toasts");if(!box)return false;const host=toastHost();
  if(host){if(box.parentElement!==host)host.append(box);box.dataset.dock="1";toastQueue(box);return true;}
  if(box.parentElement!==document.body)document.body.append(box);delete box.dataset.dock;for(const t of box.children)t.classList.remove("tq-wait");return false;}
// FIX-A 缺口 4/19:面板開著時 toast 仍貼在頁籤列上方,但自動上移到「矩形不蓋任何可見按鈕中心點」的最低位置(寫進 body 的 --fa-toast-lift,CSS 在 ui-hv.css FIX-A 段讀它)
function toastDodge(){
  const box=$("#toasts"),st=document.body.style;
  document.body.toggleAttribute("data-z1-c",zCOpen());
  if(toastDock()){st.removeProperty("--fa-toast-lift");if(box)delete box.dataset.lane;if(box)for(const t of box.children)t.classList.remove("fa-skip");return;}
  if(zCOpen()){st.removeProperty("--fa-toast-lift");if(box){delete box.dataset.lane;for(const t of box.children)t.classList.remove("fa-skip");}document.body.removeAttribute("data-z2d-a");return;}   // C 視窗開著:位置由 CSS 決定(上方遮罩區),不做閃避計算
  {   // Z2D(R13):A 抽屜開著(直向手機／桌機,貼底的抽屜)→ toast 貼在抽屜上緣上方,不蓋標題列與頁籤列;用 offsetTop(版面位置)不受進場動畫影響
    const mA=$("#modal"),aOpen=!!(modalShown()&&mA&&mA.dataset.kind===""&&mA.dataset.mode==="A"&&!matchMedia("(max-height:520px)").matches);
    document.body.toggleAttribute("data-z2d-a",aOpen);
    if(aOpen){st.removeProperty("--fa-toast-lift");st.setProperty("--z2d-dtop",Math.max(0,Math.round(innerHeight-(mA.offsetParent||document.body).getBoundingClientRect().top-mA.offsetTop))+"px");if(box){delete box.dataset.lane;for(const t of box.children)t.classList.remove("fa-skip");}return;}
    st.removeProperty("--z2d-dtop");}
  if(box){for(const t of box.children)t.classList.remove("fa-skip");delete box.dataset.lane;}
  if(!box||!box.children.length||!(modal||document.body.classList.contains("hud-modal"))){st.removeProperty("--fa-toast-lift");return;}   // 橫向手機的整頁抽屜不會加 hud-modal(頂欄被藏起來),改看 modal 變數
  st.setProperty("--fa-toast-lift","0px");
  const all=[...box.children];if(!all.length||box.getBoundingClientRect().height<1)return;
  const pts=[];
  for(const b of document.querySelectorAll("#modal button,#modal [data-action],#modal a[href],#modal input,#modal select,#bottom-bar button,#topbar button")){
    const q=b.getBoundingClientRect();if(q.width<2||q.height<2)continue;
    const cs0=getComputedStyle(b);if(cs0.visibility==="hidden"||+cs0.opacity===0)continue;
    const x=q.left+q.width/2,y=q.top+q.height/2;let hide=false;
    for(let p=b.parentElement;p&&p!==document.body;p=p.parentElement){const cs=getComputedStyle(p);if(cs.display==="none"){hide=true;break;}if(/(auto|scroll|hidden)/.test(cs.overflowY+cs.overflowX)){const pr=p.getBoundingClientRect();if(x<pr.left||x>pr.right||y<pr.top||y>pr.bottom){hide=true;break;}}}
    if(!hide)pts.push([x,y]);
  }
  // 候選:保留最新 3→2→1 則(其餘暫時收起)× 靠左／靠右／預設置中 × 往上抬 0…45% 視窗高;同時要求每則中心都不落在畫面中央 50%
  const vw=innerWidth,vh=innerHeight,maxLift=Math.round(vh*.45),inCenter=(x,y)=>x>vw*.25&&x<vw*.75&&y>vh*.25&&y<vh*.75;
  for(let keep=Math.min(all.length,3);keep>=1;keep--){
    all.forEach((t,i)=>t.classList.toggle("fa-skip",i<all.length-keep));
    for(const lane of ["","l","r"]){
      if(lane)box.dataset.lane=lane;else delete box.dataset.lane;
      const bx=box.getBoundingClientRect();   // 用版面座標(offset*)不用 getBoundingClientRect:進場滑入動畫的 transform 會讓矩形暫時位移
      const rs=all.filter(t=>!t.classList.contains("fa-skip")&&t.offsetHeight>0).map(t=>({left:bx.left+t.offsetLeft,right:bx.left+t.offsetLeft+t.offsetWidth,top:bx.top+t.offsetTop,bottom:bx.top+t.offsetTop+t.offsetHeight}));if(!rs.length)continue;
      const L0=Math.min(...rs.map(q=>q.left)),R0=Math.max(...rs.map(q=>q.right)),T0=Math.min(...rs.map(q=>q.top)),B0=Math.max(...rs.map(q=>q.bottom));
      for(let lift=0;lift<=maxLift;lift+=2){
        if(rs.some(q=>inCenter((q.left+q.right)/2,(q.top+q.bottom)/2-lift)))continue;
        if(pts.some(([x,y])=>x>=L0-3&&x<=R0+3&&y>=T0-lift-3&&y<=B0-lift+3))continue;
        st.setProperty("--fa-toast-lift",lift+"px");return;
      }
    }
  }
  // 找不到完全合格的位置:只留最新一則、預設位置,至少不蓋住一整疊
  all.forEach((t,i)=>t.classList.toggle("fa-skip",i<all.length-1));delete box.dataset.lane;st.setProperty("--fa-toast-lift","0px");
}
function save(){if(!started||previewMode)return;try{const data=game.serialize();data.savedAt=Date.now();localStorage.setItem(SAVE_KEY,JSON.stringify(data));$('#save-label').textContent='已自動儲存';$('#save-label').classList.remove('warn');}catch{$('#save-label').textContent='請匯出存檔';$('#save-label').classList.add('warn');}}
function costs(obj){return Object.entries(obj||{}).map(([k,v])=>`<span class="${game.state[k]<v?'short':''}">${iconHTML(k)} ${fmt(v)}</span>`).join('');}
// T101：製作、交易所的「夠不夠」要看得到 — 材料寫成 現有/需要，不足整塊標紅；再算出這份成本最多能做幾批。
function needChips(obj,batches=1){const s=game.state;return Object.entries(obj||{}).map(([k,v])=>{const need=v*batches,have=s[k]||0;return `<span class="cost-chip${have<need?' short':''}" data-have="${have}" data-need="${need}">${iconHTML(k)} <span class="nm">${MATERIALS[k]?.name||({gold:"金幣",gems:"星晶"})[k]||k}</span> <b>${fmt(have)}</b><i>/${fmt(need)}</i></span>`;}).join('');}
function buildTileState(b,l){
  // T112：建設彈窗的每張卡自己講清楚「現在夠不夠、還缺什麼、是不是被大廳卡住」
  const st=game.state, hallLv=st.buildings.hall||0;
  if(l>=5) return {done:true,short:false,chips:'',note:'',aria:'已達最高等級'};
  const cost=l?game.getUpgradeCost(b.id):b.cost;
  const missing=costMissing(cost), hallBlocked=b.id!=='hall'&&(l+1)>(hallLv+1);
  const note=hallBlocked?'需要城鎮大廳 Lv.'+(l+1):(missing.length?'缺 '+missing.map(([k,v])=>costName(k)+' '+fmt(v)).join('、'):'');
  return {done:false,short:missing.length>0||hallBlocked,chips:needChips(cost),note,aria:(missing.length?'資源不足':'資源足夠')+(hallBlocked?'，需要大廳等級':'')};
}
function affordableBatches(obj,max=100){const s=game.state;let n=max;for(const [k,v] of Object.entries(obj||{})){if(!v)continue;n=Math.min(n,Math.floor((s[k]||0)/v));}return Math.max(0,Math.min(max,n));}
// T59:一種空狀態,每個清單共用 —— <b>少了什麼</b> + <small>下一步可以做什麼</small>
function emptyState(msg,hint){return `<div class="empty-state"><b>${msg}</b><small>${hint}</small></div>`;}
function listHTML(items,render,msg,hint){const html=items.map(render).join('');return html||emptyState(msg,hint);}
function start(){started=true;if(artReviewMode){for(const b of BUILDINGS)game.state.buildings[b.id]=Math.max(1,game.state.buildings[b.id]);game.state.enemies=[];}game.state.paused=artReviewMode;$('#game-ui').classList.remove('hidden');world?.update(0,game.state);world?.focus('home');paint(true);if(bootOffline>=60&&!artReviewMode)runOffline(bootOffline);else save();warmBuildingImgs();
  // T143：手機第一次進來，提示手勢（只提示一次；桌機不顯示）
  try{ if(!firstRun&&matchMedia('(pointer:coarse)').matches && !localStorage.getItem('mistvale-touch-tip')){ localStorage.setItem('mistvale-touch-tip','1'); setTimeout(()=>logToast('雙指縮放、雙擊放大、拖曳可以甩動畫面',true,'ok',7000),1500); } }catch{}if(firstRun&&!artReviewMode){firstRun=false;
  // FIX-A B5:歡迎對話框等標題畫面關掉(或被移除)才打開,不要在標題背後先開
  const tryWelcome=()=>{const ts=globalThis.__mistvaleTitle;if(ts&&(ts.state==='pending'||(ts.state==='shown'&&document.getElementById('title-screen')))){setTimeout(tryWelcome,250);return;}if(!modalShown())openModal('welcome');};
  setTimeout(tryWelcome,520);}}
// 「建設」彈窗第一次開要現做 15 張建築縮圖(實測 140–210ms 才有反應)→ 開局後趁閒置一張一張先做好(素材此時都已載完)
function warmBuildingImgs(){const ids=BUILDINGS.map(b=>b.id),idle=globalThis.requestIdleCallback||(f=>setTimeout(f,120));const next=()=>{const id=ids.shift();if(!id)return;try{buildingImg(id);}catch{}idle(next);};idle(next);}
// ── 離線／背景掛機收益(2026-10-30):關掉再開、或分頁在背景(瀏覽器暫停畫面)都算;最多 8 小時,暫停中存的檔不算 ──
let bootOffline=0,hiddenAt=0,offlineBusy=false,offlineSum=null;
async function runOffline(sec){if(offlineBusy||previewMode)return;offlineBusy=true;sec=Math.min(sec,OFFLINE.max+1);const wasPaused=game.state.paused;game.state.paused=true;
 const box=document.createElement('div');box.className='offline-calc';box.setAttribute('role','status');box.innerHTML='<b>離線收益計算中…</b><small>0%</small>';document.body.append(box);
 try{const snap=game.offlineSnapshot(),sample=Math.min(sec,OFFLINE.sample);for(let d=0;d<sample;d+=5){game.simulate(Math.min(5,sample-d));box.querySelector('small').textContent=Math.round(Math.min(1,(d+5)/sample)*100)+'%';await new Promise(r=>setTimeout(r,0));}
  offlineSum=game.offlineFinish(snap,sec);openModal('offline');}catch(err){console.error(err);}finally{box.remove();game.state.paused=wasPaused;offlineBusy=false;save();paint(true);}}
document.addEventListener('visibilitychange',()=>{if(!started||previewMode)return;if(document.hidden){hiddenAt=Date.now();save();return;}
 const sec=hiddenAt?(Date.now()-hiddenAt)/1000:0;hiddenAt=0;if(sec>=60&&!game.state.paused)runOffline(sec);});
 globalThis.__mistvaleShowOffline=(o)=>{try{offlineSum=o||{seconds:3660,res:{gold:420,gems:2,wood:-30},kills:37,wanderKills:4,levels:[{name:'艾登',from:3,to:5}],dungeon:{from:2,to:4,active:true,floor:4},capped:true};openModal('offline');}catch(e){console.error(e)}};
// 2026-11-16:製作／鍛造缺材料但金幣夠 → 跟建設卡一樣給青綠「補料」鈕(交易所行商補差額後直接做)
function merchantOk(cost){const q=game.merchantQuote?.(cost);return !!(q&&q.ok&&Object.keys(q.short).length);}
// 2026-11-25 製作列的「自動補貨」控制:真正的開關(role=switch)＋狀態標籤＋分段步進器(−10 − [目標 N] + +10);動作名稱與以前相同
const gearFullName=(r0,t)=>{const it=EQUIPMENT[recipeItemId(r0)];return `${it?it.name:r0.name} ${GEAR_TIERS[Math.min(GEAR_TIERS.length,Math.max(1,t))-1].numeral}`;};   // 2026-11-25 鐵匠鋪貨架／製作清單用的全名(跟裝備倉庫同名:精鐵頭盔 Ⅱ,不是頭盔 Ⅱ)
function zcAutoHTML(id,p,n,tg,paused){const on=tg>0,st=!on?['off','未開啟']:paused?['no','材料不足']:n>=tg?['done','已達目標']:['run','補貨中'];
 return `<div class="zc-auto${on?' on':' off'}${paused?' paused':''}" role="group" aria-label="${p.name}自動補貨"><div class="zc-sw-row"><button type="button" class="zc-sw${on?' on zc-auto-off':' zc-auto-set'}" role="switch" aria-checked="${on}" data-action="${on?'craftTargetOff':'craftTargetSet'}" data-id="${id}" aria-label="${p.name}自動補貨"><i class="zc-knob" aria-hidden="true"></i><span class="zc-sw-l">自動補貨</span><span class="zc-sw-s" aria-hidden="true">${on?'開':'關'}</span></button><em class="zc-chip ${st[0]}${st[0]==='done'?' zc-auto-st done':' zc-auto-st'}">${st[1]}</em></div>${on?`<div class="zc-step" role="group" aria-label="${p.name}補貨目標"><button type="button" data-action="craftTarget" data-id="${id}" data-d="-10" aria-label="${p.name}目標少 10 份">−10</button><button type="button" data-action="craftTarget" data-id="${id}" data-d="-1" aria-label="${p.name}目標少 1 份">−</button><output aria-label="${p.name}持續製作目標"><small>目標</small><b>${tg}</b></output><button type="button" data-action="craftTarget" data-id="${id}" data-d="1" aria-label="${p.name}目標多 1 份">＋</button><button type="button" data-action="craftTarget" data-id="${id}" data-d="10" aria-label="${p.name}目標多 10 份">＋10</button></div>`:''}</div>`;}
function merchantCraftBtn(kind,id,cost,tier,label){if(!merchantOk(cost))return '';const q=game.merchantQuote(cost);return `<button class="pixel-button merchant-btn" data-zb="teal" data-action="merchantCraft" data-kind="${kind}" data-id="${id}"${tier?` data-tier="${tier}"`:''} title="補料＝向交易所行商買下缺的材料（${Object.entries(q.short).map(([k,n])=>costName(k)+' '+fmt(n)).join('、')}），買完立刻製作" aria-label="${label}，花 ${fmt(q.gold)} 金向行商買缺的材料"><span>${label}</span><small>· ${iconHTML('gold',true)}${fmt(q.gold)} 金</small></button>`;}
function resourceRows(){const s=game.state;return [['food','香烤麵包','food'],['drink','莓果飲品','drink'],['bed','舒適床鋪','bed'],['bandage','亞麻繃帶','bandage']].map(([id,n,ic])=>`<button class="stock-item" data-action="craftProduct" data-id="${id}">${iconHTML(ic)}<span>${n}</span><b>${s.stocks[id]}</b><em>製作</em></button>`).join('');}
function miniRoster(){return listHTML(game.state.hunters.slice(0,3),h=>`<button class="mini-hunter" data-action="hunter" data-id="${h.id}"><img data-portrait="${h.id}"><div><strong>${esc(h.name)} <small>Lv.${h.level}</small></strong><p>${esc(h.status)}</p><div class="tiny-health"><span style="width:${Math.max(0,h.hp/h.maxHp*100)}%"></span></div></div></button>`,'村裡還沒有獵人','到「獵人」頁的「招募」邀請流浪英雄')}
// 圖集載入完成後,立繪快取(portraitCache)必須清掉重畫 —— 
// 不然 UI 永遠顯示圖集載入前生成的舊立繪。(實測踩到:截圖跟舊版逐像素相同)
addEventListener('pixel-assets-ready',()=>{for(const k in portraitCache)delete portraitCache[k];paintPortraits();});
function paintPortraits(){document.querySelectorAll('img[data-elder]').forEach(e=>{const u=portrait(ELDER);if(e.getAttribute('src')!==u)e.src=u;});document.querySelectorAll('[data-portrait]').forEach(e=>{const h=game.state.hunters.find(v=>v.id===e.dataset.portrait)||(game.state.wanderers||[]).find(v=>v.id===e.dataset.portrait);if(!h)return;const u=portrait(h);if(e.getAttribute('src')!==u)e.src=u;});document.querySelectorAll('[data-mface]').forEach(e=>{if(e.src&&e.src.startsWith('data:'))return;const u=monsterPortrait(e.dataset.mface,96);if(u)e.src=u;});}   // T125:魔物頭像跟獵人頭像一樣在 sheet 載入後補上

// 2026-11-11 獵魔村風格 HUD:左側任務追蹤(標題＋金幣獎勵／目標 x/y),可領獎勵時加 .ready(閃一下＋紅點);右側行動徽章的第二行字。
// 2026-11-16:委託鏈(18 章)全部領完後,追蹤列不再寫「暫時沒有新的委託」,改給下一個長線目標(獵魔村式:隨時都有下一步)
function endgameGoal(s){const R=(s.hunters||[]).reduce((n,h)=>n+(h.rebirths||0),0),next=DIFFICULTIES.find(d=>d.rebirths>R);
  const top=DIFFICULTIES.filter(d=>d.rebirths<=R).at(-1);if(top&&(s.difficulty||0)<top.id)return {title:`長線目標 · 挑戰「${top.name}」難度`,goal:'- 點左上的難度徽章，切換到更高的狩獵難度'};   // 已解鎖但還沒切 → 先叫玩家去挑戰
  if(next)return {title:`長線目標 · 解鎖「${next.name}」難度`,goal:`- 讓獵人在復活聖所轉世，累計 ${fmt(R)}/${fmt(next.rebirths)} 次`};
  const w=s.arena?.wins||0,nw=(Math.floor(w/5)+1)*5;return {title:'長線目標 · 競技場天梯',goal:`- 競技場累計 ${fmt(w)}/${fmt(nw)} 勝（每 5 勝獎勵星晶）`};}
function paintHvHud(s){const q=s.quest;const el=$('#hv-quest');if(el&&q){const t=$('#hv-quest-title'),rw=$('#hv-quest-reward'),gl=$('#hv-quest-goal');
  const eg=q.claimed?endgameGoal(s):null;
  const title=q.claimed?eg.title:`第 ${q.index+1} 章 · ${q.title}`;if(t.textContent!==title)t.textContent=title;
  const gold=q.reward&&q.reward.gold;$H('#hv-quest-reward').innerHTML=gold&&!q.claimed?iconHTML('gold',true)+'<b>'+fmt(gold)+'</b>':'';
  const goal=q.claimed?eg.goal:q.complete?'獎勵可以領取了':`- ${q.description} ${fmt(q.progress)}/${fmt(q.target)}`;if(gl.textContent!==goal)gl.textContent=goal;
  el.classList.toggle('ready',!!q.complete&&!q.claimed);el.setAttribute('aria-label',`村長委託：${q.title}，${q.complete&&!q.claimed?'獎勵可以領取':`進度 ${q.progress}/${q.target}`}`);}
 const away=s.hunters.filter(h=>h.hp>0&&/狩獵|前往|戰鬥|追擊|出征|遠征|搜尋|後撤|趕去治療/.test(h.status||'')).length,rest=s.hunters.filter(h=>h.hp>0).length-away;
 const hl=$('#hv-act-hunters');if(hl){const down=s.hunters.filter(h=>h.task==='revive').length,txt=down?`倒下 ${down}`:away?`狩獵中 ${away}`:`待命 ${rest}`;if(hl.textContent!==txt)hl.textContent=txt;hl.classList.toggle('is-down',down>0);hl.closest('button')?.setAttribute('aria-label',down?`獵人名冊，${down} 人倒下`:'獵人名冊');}
 if(s.counts.deaths!==downSeen){const first=downSeen===null;downSeen=s.counts.deaths;if(!first&&s.difficulty>0&&!s.paused&&!downWarned.has(s.difficulty)&&game.downReport().count>=3){downWarned.add(s.difficulty);logToast('獵人接連倒下：覺得太危險，可以從上方「難度」調低。',true,'error',5000);}}
 const ex=s.expedition||{},b1=$('#hv-act-boss1'),b2=$('#hv-act-boss2');if(b1&&b2){const a=ex.active?['討伐中','首領']:ex.cooldown>0?['首領',`${Math.ceil(ex.cooldown)} 秒後`]:['召喚','首領'];if(b1.textContent!==a[0])b1.textContent=a[0];if(b2.textContent!==a[1])b2.textContent=a[1];b1.closest('button')?.classList.toggle('cooling',!ex.active&&ex.cooldown>0);}
 const ar=s.arena||{},r1=$('#hv-act-arena1'),r2=$('#hv-act-arena2');if(r1&&r2){const locked=!s.buildings?.training,a=locked?['競技場','需修煉地']:ar.active?['對戰中','競技場']:ar.cooldown>0?['競技場',`${Math.ceil(ar.cooldown)} 秒後`]:s.expedition?.active?['競技場','討伐中']:['進入','競技場'];if(r1.textContent!==a[0])r1.textContent=a[0];if(r2.textContent!==a[1])r2.textContent=a[1];const btn=r1.closest('button');btn?.classList.toggle('cooling',locked||(!ar.active&&(ar.cooldown>0||!!s.expedition?.active)));btn?.setAttribute('aria-label',a.join(''));}}
function paintQuest(){const q=game.state.quest;$('#quest-chapter').textContent=`CHAPTER ${String(q.index+1).padStart(2,'0')}`;$('#quest-title').textContent=q.title;$('#quest-desc').textContent=q.description;$('#quest-progress').textContent=`${q.progress}/${q.target}`;$('#quest-fill').style.width=`${Math.min(100,q.progress/q.target*100)}%`;$H('#quest-reward').innerHTML=costs(q.reward);$('#quest-button').textContent=q.claimed?'全部委託完成':q.complete?'領取獎勵':'查看委託';$('#quest-button').disabled=q.claimed;}
// T111：建築面板要說清楚「這一級 → 下一級」、要付多少（現有／需要），
// 以及**為什麼不能升**（已滿級／大廳等級不夠／資源不足），不要按下去才靠 toast 告訴玩家。
function costName(k){return MATERIALS[k]?.name||({gold:'金幣',gems:'星晶'})[k]||k;}
function costMissing(obj){const s=game.state;return Object.entries(obj||{}).filter(([k,v])=>(s[k]||0)<v).map(([k,v])=>[k,v-(s[k]||0)]);}
function missText(missing){return missing.map(([k,d])=>costName(k)+' 還缺 '+fmt(d)).join('、');}
function upgradeView(b){
  const s=game.state,lv=s.buildings[b.id]||0;
  if(!lv) return {mode:'build',lv:0,next:1,cost:b.cost,missing:costMissing(b.cost)};
  if(lv>=5) return {mode:'max',lv,next:5,cost:null,missing:[]};
  const cost=game.getUpgradeCost(b.id),hallBlocked=b.id!=='hall'&&lv+1>s.buildings.hall+1;
  return {mode:'upgrade',lv,next:lv+1,cost,missing:costMissing(cost),hallBlocked,hall:s.buildings.hall};
}
// 只有真的有數字的效果才寫差額；不要編一個看起來很厉害、其實跟程式無關的數字。
function upgradeDelta(b,lv,next){
  // 跟 pixel-game upgrade() 的 capacity 公式一致:基礎名額 = max(8, 職業數+2)(7 職業 → 9),每級 +2
  if(b.id==='house'){const base=Math.max(8,CLASSES.length+2);return '獵人名額 '+(base+(lv-1)*2)+' → '+(base+(next-1)*2);}
  if(b.id==='hall') return '其他建築上限 Lv.'+lv+' → Lv.'+next;
  // 2026-11-16:服務設施每級售價 +25%(pixel-game servicePrice)、恢復量 +5%(beginService)
  if(b.product&&PRODUCTS[b.product]){const p=PRODUCTS[b.product],at=l=>Math.round(p.price*(1+.25*(l-1)));return p.name+'售價 '+at(lv)+' → '+at(next)+' 金 · 恢復量 +'+((next-1)*5)+'%';}
  // 2026-11-16 裝備階級:鐵匠鋪 Lv.N 最高鍛造第 N 階(pixel-game forgeTier),升級的主要理由要寫出來
  if(b.id==='forge'){const nm=l=>GEAR_TIERS[Math.min(GEAR_TIERS.length,l)-1]?.numeral||l;return '可鍛造裝備 第 '+nm(lv)+' 階 → 第 '+nm(next)+' 階';}
  // 2026-11-24 學院等級:獵人技能傷害 +5%/級(pixel-data academySkillMult),Lv.1 = +0%
  if(b.id==='academy'){const g=l=>'+'+Math.round((academySkillMult(l)-1)*100)+'%';return '技能傷害 '+g(lv)+' → '+g(next);}
  if(b.id==='trading'){const r=l=>Math.max(MERCHANT.floor,MERCHANT.markup-MERCHANT.step*(l-1));return '行商補料單價 '+r(lv)+' → '+r(next)+' 倍收購價';}
  // 2026-11-17 修煉重訂:修煉地每升 1 級,每次修煉多 25% 經驗(pixel-game TRAIN.levels:Lv.1 = 1 級份、Lv.5 = 2 級份)
  if(b.id==='training'){const g=l=>1+.25*(l-1);return '每次修煉經驗 '+g(lv)+' → '+g(next)+' 級份';}
  return '';
}
// Z1:建築詳情是 C 置中視窗 —— 主動作(升級／建造)搬進底部按鈕列、「移動位置」搬到標題右上的幽靈鈕、底部固定補一顆「關閉」(搬動不複製,按鈕只有一份)
function mountInspectFoot(){const f=$('#inspect-foot'),g=$('#inspect-ghost'),c=$('#inspect-content');if(!f||!g||!c)return;
 const up=c.querySelector('[data-action=upgrade],[data-action=construct],[data-action=merchantBuild]'),mv=c.querySelector('[data-action=moveBuilding]');
 if(!up&&!mv)return;   // 內容沒變(setHTML 略過重畫)時,按鈕已經在底部列裡,不要重蓋
 f.innerHTML='';g.innerHTML='';
 if(up){up.classList.add('z1-foot-btn');up.dataset.zb=up.dataset.action==='merchantBuild'?'teal':'olive';if(up.dataset.action==='merchantBuild')up.classList.add('merchant-btn');f.append(up);}
 if(mv){mv.classList.add('z1-ghost');g.append(mv);}
 const x=document.createElement('button');x.type='button';x.className='pixel-button z1-close z1-foot-btn';x.dataset.action='closeInspector';x.dataset.zb='red';x.textContent='關閉';x.setAttribute('aria-label','關閉建築資訊');f.append(x);f.dataset.n=String(f.children.length);}
// ── Z2B(2026-11-12 圖鑑 v2 e／h 節):建築詳情的清單列、建設卡用途說明、關鍵數字藍字 ──
// 用途說明一律從 BUILDINGS.desc 取第一句(太短就接第二句),不另編規則
function buildPurpose(b){const p=String(b.desc||'').split('。').filter(Boolean);return p.length?(p[0].length<8&&p[1]?p[0]+'，'+p[1]:p[0]):(b.effect||'');}
const z2bBlue=t=>esc(String(t)).replace(/(\d[\d,.]*%?)/g,'<b class="z2b-n">$1</b>');
// 2026-11-13 六格裝備:配方列的數值文案。武器只有攻擊,六件防具是生命+防禦(docs/PAPERDOLL-EQUIPMENT-6.md §4)。
// 鍛造卡、製作分頁、倉庫都用這一份,不另外抄數字。
const gearStatText=r=>r.hp?`生命 +${r.hp} · 防禦 +${r.def}`:`攻擊 +${r.bonus}`;
// 2026-11-16 裝備階級Ⅰ–Ⅴ:鐵匠鋪 Lv.N 能鍛造到第 N 階。gearStock[格] = {階: 件數};舊格式(數字)讀檔時已轉成第 1 階。
const forgeTierUI=()=>game.forgeTier?game.forgeTier():Math.min(GEAR_TIERS.length,game.state.buildings.forge||0);
const gearStockTotal=slot=>{const st=game.state.gearStock?.[slot];return typeof st==='number'?st:GEAR_TIERS.reduce((n,t)=>n+(st?.[t.tier]||0),0);};
const tierStockText=slot=>{const st=game.state.gearStock?.[slot]||{},p=GEAR_TIERS.filter(t=>(st[t.tier]||0)>0).map(t=>`${t.numeral}×${st[t.tier]}`);return p.length?p.join(' '):'0';};
// 清單列(e 節):左圖示格、粉色名稱、米白說明(藍色關鍵數字)、金色費用行、右側動作鈕
function z2bRow({ic,name,desc='',chips='',fee='',btn='',cls=''}){return `<li class="z2b-row${cls?' '+cls:''}"><i class="z2b-ic">${ic}</i><div class="z2b-rb"><b class="z2b-nm">${esc(name)}</b>${desc?`<p class="z2b-ds">${desc}</p>`:''}${chips?`<div class="z2b-chips">${chips}</div>`:''}${fee}</div>${btn?`<div class="z2b-act">${btn}</div>`:''}</li>`;}
const z2bBldIc=b=>{const u=buildingImg(b.id);return u?`<img src="${u}" alt="" draggable="false">`:iconHTML(b.type);};   // 建築沒有專屬小圖示 → 用建築縮圖當清單列的圖示格
let inspectTab='',inspectTabFor='';
function inspectRowsOf(b,l){const s=game.state,rows=[];
  if(b.product){const p=PRODUCTS[b.product],maxB=l?affordableBatches(p.cost):0;
    rows.push(z2bRow({ic:iconHTML(b.product),name:p.name,desc:z2bBlue(`庫存 ${s.stocks[b.product]} · 售價 ${game.servicePrice?game.servicePrice(b.product):p.price} 金 · 每批 ${p.amount} 份`),chips:needChips(p.cost),
      btn:`<button class="pixel-button" data-action="craftProduct" data-id="${b.product}"${maxB>=1?'':' disabled aria-disabled="true"'} aria-label="製作 ${p.amount} 份${p.name}">製作</button>`}));}
  if(b.id==='forge'){const top=Math.max(1,forgeTierUI());for(const r0 of RECIPES){const r=gearAt(r0,top),maxB=l?affordableBatches(r.cost):0;   // 鍛造卡只列目前最高階;選其他階到「裝備製作」分頁
    rows.push(z2bRow({ic:craftGearIconHTML(r.id,32,'anvil'),name:r.name,desc:z2bBlue(`裝備庫存 ${tierStockText(r.id)} · 售價 ${r.price} 金 · ${gearStatText(r)}`),chips:needChips(r.cost),
      btn:`<button class="pixel-button" data-action="craftGear" data-id="${r.id}" data-tier="${top}"${maxB>=1?'':' disabled aria-disabled="true"'} aria-label="鍛造${r.name}">鍛造</button>`}));}}
  const go={trading:['trade','收購管理','開啟交易所，設定收購的材料與數量'],bounty:['quests','村長委託','查看章節委託與可領取的獎勵'],dungeon:['dungeon','地下城遠征','挑選三人小隊出發闖關']}[b.id];
  if(go)rows.push(z2bRow({ic:z2bBldIc(b),name:go[1],desc:esc(go[2]),btn:`<button class="pixel-button" data-action="inspectGo" data-id="${go[0]}"${l?'':' disabled aria-disabled="true"'}>前往</button>`}));
  return rows;}
function paintInspector(){
  if(!selected||!BUILDINGS.some(b=>b.id===selected))return;
  if(pressEl&&$('#inspector')?.contains(pressEl)){setTimeout(paintInspector,60);return;}   // 正在按詳情裡的鈕(含底部列):這一輪先不重畫,免得按鈕被換掉、點擊落空;放開後補畫一次(子頁籤、鍛造的結果才會出現)
  const b=BUILDINGS.find(v=>v.id===selected),s=game.state,l=s.buildings[b.id];
  $('#inspect-title').textContent=l?'Lv.'+l+' '+b.name:b.name;   // Z2B:標題「Lv.n 建築名」(圖鑑 23/24/30)
  const img=buildingImg(b.id),v=upgradeView(b);
  const lvLine=l?'建築 Lv.'+l:'尚未建造';
  const nextLine=v.mode==='max'?'已達最高等級 Lv.5':(l?'升級到 Lv.'+v.next:'建造後 Lv.'+v.next);
  const delta=v.mode==='upgrade'?upgradeDelta(b,v.lv,v.next):'';
  // 2026-11-16:只缺材料、金幣夠補 → 主按鈕改成「補料並升級」(交易所行商),說明照樣寫還缺什麼(紅字)＋補料要多少金
  const mq=v.mode!=='max'&&!v.hallBlocked&&v.missing.length?game.merchantQuote(v.cost):null,viaMerchant=!!mq?.ok;
  const can=viaMerchant||(v.mode==='build'?!v.missing.length:(v.mode==='upgrade'&&!v.hallBlocked&&!v.missing.length));
  const note=v.mode==='max'?'這棟建築已經滿級，不需要再升級。'
    :v.hallBlocked?'需要城鎮大廳 Lv.'+v.next+'（目前 Lv.'+v.hall+'）'
    :v.missing.length?missText(v.missing)+(viaMerchant?`；可向交易所行商補料（${fmt(mq.gold)} 金）`:mq?.reason&&v.missing.some(([k])=>MATERIALS[k])?`；${mq.reason}`:'')   // 只缺金幣時不再重複「金幣不足」
    :v.mode==='build'?'資源足夠，按下去就會建造。':'資源足夠，按下去就會升級。';
  const btnLabel=v.mode==='max'?'已達最高等級':v.hallBlocked?'<i class="hv-lock" aria-hidden="true"></i>先升級大廳':viaMerchant?(v.mode==='build'?'補料並建造':'補料並升級 Lv.'+v.next):v.mode==='build'?'建造':'升級 Lv.'+v.next;
  const btnAct=viaMerchant?'merchantBuild':l?'upgrade':'construct';
  const blueprint=v.mode==='build';   // T153:還沒蓋的建築顯示 AI 藍圖插圖
  const art=blueprint?'<span class="bp-art" data-bid="'+b.id+'"></span>':(img?'<img src="'+img+'" alt="'+b.name+'">':iconHTML(b.type));
  // Z2B(圖鑑 23/24/30):說明在內凹框、生產／效果用清單列、升級需求放提示框(達成綠字、未達成粉紅字)、有生產或功能的建築加文字型子頁籤
  const gold=v.cost&&v.cost.gold,fee=gold?`<small class="z2b-fee">費用 ${iconHTML('gold',true)}<b>${fmt(gold)}</b></small>`:'';
  const effRow=z2bRow({ic:z2bBldIc(b),name:'Lv.'+(l||1)+' '+b.effect,desc:v.mode==='max'?'已達最高等級'+(b.id==='academy'?'・技能傷害 +'+Math.round((academySkillMult(l)-1)*100)+'%':''):delta?`<span class="inspect-delta">${z2bBlue(delta)}</span>`:esc(l?'升級到 Lv.'+v.next+' 會提升這項效果':'建造後 Lv.1 開始生效'),fee:v.mode==='max'?'':fee,
    btn:v.mode==='max'?'<button class="pixel-button z2b-max" disabled aria-disabled="true">MAX</button>':'',cls:'inspect-effect'});
  const actRows=l?inspectRowsOf(b,l):[],hasTabs=actRows.length>0;
  const tab=hasTabs?(inspectTabFor===b.id&&inspectTab==='up'?'up':'act'):'up';
  const tabsHtml=hasTabs?`<div class="z1-subtabs z2b-tabs" role="tablist">${[['act',b.product||b.id==='forge'?'生產':'功能'],['up','升級效果']].map(([k,t])=>`<button type="button" role="tab" class="z1-subtab${k===tab?' on':''}" aria-selected="${k===tab}" data-action="inspectTab" data-id="${k}"><span>${t}</span></button>`).join('')}</div>`:'';
  const listHtml=`<div class="z2b-sep"><span>${tab==='act'?(b.product||b.id==='forge'?'生產清單':'功能'):'升級效果'}</span></div><ul class="z2b-rows">${tab==='act'?actRows.join(''):effRow}</ul>`;
  const reqHtml=v.mode==='max'?`<div class="z1-hint inspect-req max"><p class="inspect-done">已達最高等級</p><div class="inspect-note">${esc(note)}</div></div>`
    :`<div class="z1-hint inspect-req"><div class="inspect-next">${nextLine}</div>${v.cost?'<div class="cost inspect-cost"><span>需求</span>'+needChips(v.cost)+'</div>':''}<div class="inspect-note${can?'':' short'}">${esc(note)}</div></div>`;
  $H('#inspect-content').innerHTML='<div class="z2b-top"><div class="inspect-art'+(blueprint?' blueprint':'')+'">'+art+'</div><div class="z1-inset z2b-desc"><div class="inspect-level">'+lvLine+'</div><p class="inspect-desc">'+b.desc+'</p></div></div>'
    +tabsHtml+listHtml+reqHtml
    +'<div class="inspect-actions">'+(v.mode==='max'?'':'<button class="pixel-button gold" data-action="'+btnAct+'" data-id="'+b.id+'"'+(can?'':' disabled aria-disabled="true"')+'>'+btnLabel+'</button>')+'<button class="move" data-action="moveBuilding" data-id="'+b.id+'">移動位置</button></div>';
  mountInspectFoot();setIcons($('#inspect-content'));setIcons($('#inspect-foot'));
}
const resFloat={t:0,last:null};
function floatDeltas(s){const keys=['gold','gems','wood','ore'],now=performance.now();if(!resFloat.last){resFloat.last=Object.fromEntries(keys.map(k=>[k,s[k]]));resFloat.t=now;return;}if(now-resFloat.t<1200)return;
 for(const k of keys){const d=Math.round(s[k]-resFloat.last[k]);resFloat.last[k]=s[k];if(!d||!started)continue;const host=$('#'+k)?.closest('.res-row,button,div');if(!host)continue;if(getComputedStyle(host).position==='static')host.style.position='relative';const f=document.createElement('span');f.className='res-float '+(d>0?'up':'down');f.textContent=(d>0?'+':'−')+fmt(Math.abs(d));host.append(f);setTimeout(()=>f.remove(),1100);}resFloat.t=now;}
// T129：底部分頁的「待處理」徽章——可領取的委託、可升級的建設、願意加入的流浪英雄、可製作的東西。
// 徽章用 CSS ::after + data-badge 畫，不改 DOM 結構、也不佔版面（按鈕尺寸完全不變）。
function buildableCount(s){
  // 只算「還沒蓋的建築」：已經蓋好的日常升級不算待處理事項，否則徽章永遠亮著。
  let n=0;
  for(const b of BUILDINGS){
    if((s.buildings[b.id]||0)>0)continue;
    const cost=b.cost;
    if(!cost||Object.keys(cost).some(k=>(s[k]||0)<cost[k]))continue;
    if(b.id!=='hall'&&1>(s.buildings.hall||0)+1)continue;
    n++;
  }
  return n;
}
// Z2B:商品(PRODUCTS)庫存 0 且對應設施已蓋好 → 倉庫頁籤待辦徽章＋顧問「○○賣完了，到倉庫的製作補貨」。
// 獵人會自己狩獵，但商品庫存只能靠玩家製作；賣完村莊就沒有這筆收入。只加提示，不動任何數值。
function soldOutGoods(s){return Object.entries(PRODUCTS).filter(([id,p])=>(s.buildings[p.building]||0)>0&&(s.stocks[id]||0)<=0).map(([,p])=>p.name);}
function paintBadges(s){
  const set=(action,n,label)=>{
    const b=document.querySelector(`#bottom-bar [data-action="${action}"],.hv-tr2 [data-action="${action}"]`);   // Z1:委託的徽章住在右上圖示列(頁籤列只剩 5 格)
    if(!b)return;
    if(!b.dataset.base)b.dataset.base=b.querySelector('b')?.textContent||b.getAttribute('aria-label')||action;
    const show=n>0;
    b.dataset.badge=show?String(n>9?'9+':n):'';
    if(show)b.setAttribute('aria-label',`${b.dataset.base}：${n} ${label}`);
    else if(b.querySelector('b'))b.removeAttribute('aria-label');   // 有文字標籤(頁籤列)才拿掉
    else b.setAttribute('aria-label',b.dataset.base);   // 右上圖示鈕(委託)沒有文字,拿掉就沒有名字了(按鈕巡檢 NO-LABEL)
  };
  set('quests',s.quest&&s.quest.complete&&!s.quest.claimed?1:0,'件獎勵可領取');   // 2026-11-24 已領完(claimed)不再算
  set('build',buildableCount(s),'棟可建造');   // 2026-11-24 數的是還沒蓋的建築,不是可升級
  set('hunters',recruitable(s),'位流浪英雄願意加入');   // 2026-11-25:好感度到門檻(100%)、付得起、名額沒滿的人數
  set('inventory',soldOutGoods(s).length,'項商品賣完了');

}
// 2026-11-26 拿掉日夜:頂欄的「第 N 天 · 白天／夜晚」時鐘整個拿掉(遊戲裡沒有天數與日夜了;要看時間看手機/電腦的時鐘就好)
// 真實的晚上(環境音蟲鳴用):每 5 秒才重算一次,不必每幀 new Date
let realNightAt=-1e9,realNightVal=false;
function realNightNow(){const t=Date.now();if(Math.abs(t-realNightAt)>5000){realNightAt=t;realNightVal=isRealNight(t);}return realNightVal;}
// FIX-C:面板標題列的精簡資源條(橫向 HUD 被藏起來時才顯示),跟頂欄同一個資料來源與 topNum 格式
function paintPanelRes(s){const pr=$('#modal-res');if(!pr)return;for(const el of pr.querySelectorAll('[data-res]')){const t=topNum(s[el.dataset.res]);if(el.textContent!==t)el.textContent=t;}}
function paint(force=false){const s=game.state;floatDeltas(s);['gold','wood','ore','gems'].forEach(k=>$('#'+k).textContent=topNum(s[k]));paintPanelRes(s);if($('#toasts')?.children.length)toastDock();$('#population').textContent=`${s.hunters.length}/${s.capacity}`;$('#town-level').textContent=`村莊 Lv.${s.buildings.hall}`;{const tw=$('#hv-town'),tt=`暮影村 Lv.${s.buildings.hall}`;if(tw&&tw.textContent!==tt)tw.innerHTML=`<span class="hv-town-n">暮影</span>村 Lv.${s.buildings.hall}`;}$('#difficulty-name').textContent=DIFFICULTIES[s.difficulty].name;{const di=$('.difficulty-button [data-icon]');if(di)di.dataset.icon='diff-'+Math.max(0,Math.min(4,DIFFICULTIES.indexOf(DIFFICULTIES[s.difficulty])));}$H('#stock-list').innerHTML=resourceRows();$H('#mini-roster').innerHTML=miniRoster();paintPortraits();paintQuest();$('#pause').textContent=s.paused?'▶':'Ⅱ';$('#pause').setAttribute('aria-pressed',String(!!s.paused));$('#speed').textContent=`${s.speed}×`;$('#speed').setAttribute('aria-pressed',String(s.speed>1));$('#pause-label').classList.toggle('hidden',!s.paused);$H('#notice-feed').innerHTML=listHTML(s.log.slice(0,3),l=>`<div class="nf-item tone-${esc(l.tone||'info')}">${esc(l.text)}</div>`,'還沒有村莊消息','讓時間跑一下，獵人回村就會有動靜');if(selected)paintInspector();setIcons();document.body.dataset.kills=s.totalKills;document.body.dataset.services=s.counts.services;const landscape=world?.landscapeStats?.();if(landscape){document.body.dataset.trees=landscape.trees;document.body.dataset.arenas=landscape.arenas;document.body.dataset.roads=landscape.roads;}document.body.dataset.worldArea=WORLD.area;document.body.dataset.region=s.region;const rb=$('#region-badge');if(rb)rb.textContent=(REGIONS.find(r=>r.id===s.region)?.name||'向陽草原')+' · 狩獵中';pilotStatus();paintBadges(s);paintHvHud(s);}
// 主世界地圖畫布:長寬比跟世界一樣(一格世界單位在畫面上是正方形),四周各留 15 像素邊。
const WORLD_MAP_H=392,WORLD_MAP_W=Math.round((WORLD_MAP_H-30)*WORLD.width/WORLD.height)+30;
function modalTitle(t,ic='scroll'){const names={build:'村莊建設',hunters:'獵人名冊',hunter:'獵人詳情',trade:'交易所',craft:'製作與庫存',dungeon:'地下城遠征',arena:'競技場模擬對戰',quests:'村長委託',inventory:'村莊倉庫',equipstore:'村莊倉庫',difficulty:'狩獵難度',offline:'離線戰報',recruit:'招募流浪英雄',settings:'遊戲設定',help:'村長入門手札',boss:'地圖首領',dispatch:'派遣出征 · 自由組隊',region:'地圖詳細資訊',density:'地區立牌 · 怪物數量',welcome:'村長',advisor:'村長',codex:'魔物圖鑑',confirm:confirmReq?.title||'請確認',result:resultReq?.title||'結算',bossconfirm:'召喚確認'};$('#modal-title').textContent=names[t]||t;$('#modal-icon').dataset.icon=ic;setIcons($('#modal'));}
function portrait(h){const e=h.equipment||{},gk=h.gear?Object.values(h.gear).map(g=>g&&g.itemId||'-').join(','):'',key=h.classId+':'+h.rarity+':'+gk+':'+(e.weapon===true?'f':'')+(e.helm===true||e.armor===true?'h':'')+(Object.entries(e).some(([s,v])=>s!=='weapon'&&v===true)?'a':'');/* 立繪會畫精良武器/頭盔/護甲:鍵要帶裝備,不然同職業同稀有度共用第一位畫到的;2026-11-15 物品化後改帶真裝備 id */if(portraitCache[key])return portraitCache[key];const c=document.createElement('canvas');c.width=84;c.height=96;drawPortrait(c,h,{scale:2.7});const u=c.toDataURL();if(u.length<1200)return u;return portraitCache[key]=u;}   // 還沒畫出東西(英雄表未載完)的空白圖不快取,下一輪再畫

// Z1(2026-11-12 圖鑑 v2):底部頁籤列 5 格＝建設、地下城、獵人、倉庫、交易;競技場併入地下城、製作併入倉庫(子頁籤),委託由任務追蹤與右上圖示進入。
const MODAL_TAB={build:'build',hunters:'hunters',hunter:'hunters',recruit:'hunters',dispatch:'hunters',region:'hunters',density:'hunters',trade:'trade',craft:'inventory',inventory:'inventory',equipstore:'inventory',dungeon:'dungeon',arena:'dungeon'};
// 視窗模式:A＝頁籤抽屜(貼在頁籤列上方、不壓暗)、C＝置中視窗(遮罩蓋住場景與頁籤列、底部按鈕、沒有 X)、D＝滿寬暗帶(新獵人到訪)、dialog＝村長對話框(另一套外觀,見 FIX-B)
const MODAL_MODE={build:'A',hunters:'A',recruit:'A',dispatch:'A',trade:'A',craft:'A',inventory:'A',equipstore:'A',dungeon:'A',arena:'A',
  hunter:'C','hunter-detail':'C',confirm:'C',result:'C',bossconfirm:'C',offline:'C',quests:'C',boss:'C',settings:'C',help:'C',region:'C',density:'C',difficulty:'C',codex:'C',welcome:'dialog',advisor:'dialog'};
const modalModeOf=t=>MODAL_MODE[t]||'C';
// 子頁籤群組:同一個頁籤列入口下的兩個面板(各自仍是獨立的 modal type,舊的 data-action 照常可開)
const MODAL_GROUPS={dungeon:[['dungeon','地下城'],['arena','競技場']],arena:[['dungeon','地下城'],['arena','競技場']],inventory:[['inventory','材料倉庫'],['equipstore','裝備倉庫'],['craft','製作']],equipstore:[['inventory','材料倉庫'],['equipstore','裝備倉庫'],['craft','製作']],craft:[['inventory','材料倉庫'],['equipstore','裝備倉庫'],['craft','製作']],hunters:[['hunters','名冊'],['recruit','招募']],recruit:[['hunters','名冊'],['recruit','招募']]};   // Z2A:獵人名冊＋招募(新獵人暗帶的完整清單)
function paintSubtabs(type){const box=$('#modal-subtabs'),m=$('#modal');if(!box||!m)return;const g=MODAL_GROUPS[type];
 if(!g){box.hidden=true;box.innerHTML='';delete m.dataset.subtabs;return;}
 const nRec=recruitable(game.state);
 box.innerHTML=g.map(([t,l])=>`<button type="button" role="tab" class="z1-subtab${t===type?' on':''}" aria-selected="${t===type}" data-action="${t}" data-subtab="${t}"${t==='recruit'&&nRec?` data-badge="${nRec}"`:''}><span>${l}</span></button>`).join('');box.hidden=false;m.dataset.subtabs='1';}
// 視窗底部按鈕列(C 模式):內容裡標 data-foot 的按鈕搬進來(搬不是複製,同一顆鈕只有一份),再補一顆「關閉」(內容的主動作本身就會關窗時不補)
function mountFoot(type,mode){const f=$('#modal-foot'),c=$('#modal-content');if(!f||!c)return;f.innerHTML='';
 if(mode!=='C'){f.hidden=true;return;}
 const prim=[...c.querySelectorAll('[data-foot]')],rank=b=>b.dataset.foot==='secondary'?1:0;prim.sort((x,y)=>rank(x)-rank(y));
 for(const b of prim){b.classList.add('z1-foot-btn');f.append(b);}
 if(!prim.some(b=>b.dataset.foot==='only'||b.dataset.foot==='secondary')){const x=document.createElement('button');x.type='button';x.className='pixel-button z1-close z1-foot-btn';x.dataset.action='close';x.dataset.zb='red';x.textContent='關閉';f.append(x);}
 f.hidden=!f.children.length;f.dataset.n=String(f.children.length);}
function setModalMode(type){const mode=modalModeOf(type),m=$('#modal'),bd=$('#modal-backdrop');m.dataset.mode=mode;bd.dataset.mode=mode;document.body.dataset.modalMode=mode;return mode;}
// 2026-10-30:彈窗開著時上方資源列與下方分頁列留在最上層、照常可點(看得到金幣變化、直接切換分頁),彈窗放在兩條列之間。
// 兩條列的實際高度每種版面不同(桌機/直式/橫式) → 開窗與縮放視窗時量一次,寫進 --hud-top / --hud-bottom。
function measureHud(){const top=$('#topbar'),bot=$('#bottom-bar'),vis=e=>e&&!e.classList.contains('hidden')&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden';
 const on=!document.body.classList.contains('piloting')&&vis(top)&&vis(bot);document.body.classList.toggle('hud-modal',on&&!!modal);if(!on)return;
 // 讀取畫面還在時 #game-ui 是隱藏的，底欄量到 0×0 → --hud-bottom 會變成整個視窗高，彈窗被壓成 5px。量不到就不寫。
 const tr=top.getBoundingClientRect(),br=bot.getBoundingClientRect();if(!tr.height||!br.height)return;
 const st=document.documentElement.style;st.setProperty('--hud-top',Math.max(0,Math.round(tr.bottom))+'px');st.setProperty('--hud-bottom',Math.max(0,Math.round(innerHeight-br.top))+'px');}
addEventListener('resize',()=>{if(modal){measureHud();fitDispatchPad();}else if(!$('#inspector')?.classList.contains('hidden'))measureHud();});
// 頂欄資源數字（金幣／星晶／木材／鐵礦）一變動就加 .res-tick 閃一下；純視覺，不碰遊戲狀態。
(function watchResTick(){if(typeof MutationObserver==='undefined')return;
 for(const id of ['gold','gems','wood','ore']){const el=document.getElementById(id);if(!el)continue;let last=el.textContent;
  new MutationObserver(()=>{if(el.textContent===last)return;last=el.textContent;el.classList.remove('res-tick');void el.offsetWidth;el.classList.add('res-tick');}).observe(el,{childList:true,characterData:true,subtree:true});
  el.addEventListener('animationend',()=>el.classList.remove('res-tick'));}})();
// T64: sticky 派遣鈕實際高度寫進 --dispatch-go-h,讓 #modal-content 的底部內距剛好等於鈕高+12px
function fitDispatchPad(){const c=$('#modal-content'),go=c&&c.querySelector('.dispatch-go');if(go)c.style.setProperty('--dispatch-go-h',go.offsetHeight+'px');}
// 2026-10-30:開著的彈窗跟著遊戲狀態即時更新(交易所的收購量會被回村的獵人消化、委託進度、倉庫、製作庫存),
// 只在資料真的變了才重畫,最多 0.25 秒一次;手指/滑鼠按在彈窗裡時先不換(不吃掉點擊),捲動位置保留。
const LIVE={trade:s=>[s.tradeRequests,s.tradeStanding,s.gold,s.buildings.hall,s.wood,s.ore,s.herb,s.cloth,s.flour,s.leather],quests:s=>[s.quest],inventory:s=>[s.wood,s.ore,s.herb,s.cloth,s.flour,s.leather,s.stocks,s.gearStock,(s.gearStorage||[]).length],equipstore:s=>[(s.gearStorage||[]).length,(s.hunters||[]).map(h=>h&&[h.id,h.level,h.gear?Object.values(h.gear).map(g=>g&&g.uid||'-').join():''])],craft:s=>[s.stocks,s.craftTargets,s.gearStock,s.wood,s.ore,s.herb,s.cloth,s.flour,s.leather],
 // 2026-11-16:名冊卡的需求標記(餓/累/心情差)要跟著變;只看慢變的欄位(等級、生命 10% 一格、三種需求是否偏低),不看每秒都在換的狀態字
 hunters:s=>s.hunters.map(h=>[h.id,h.level,Math.round(Math.max(0,h.hp)/h.maxHp*10),(h.satiety??100)<NEED_LOW,(h.stamina??100)<NEED_LOW,(h.mood??100)<NEED_LOW]),
 // 2026-11-24(B4):競技場勝算跟著目前生命／隊伍／裝備重算(原本停在開面板那一刻);進行中改由 z2cArenaPaint 逐幀更新
 // 注意:z2cLock/dgAssessNow 宣告在下面的區塊裡(模組頂層看不到)→ 這裡直接照 Z2C_UNLOCK 看修煉地有沒有蓋、直接呼叫 game.dungeonAssess
 arena:s=>s.arena.active?0:[s.arena.hunterIds,arOddsNow((s.buildings.training||0)>0?null:true)],
 // 2026-11-24(B9/B5):地下城風險評估跟著目前生命／飽食重算(以前是開面板那一刻的快照,按出發時又用當下重算 → 兩邊不一致)
 dungeon:s=>{const d=s.dungeon;if(d.active)return 0;const f=Math.min(d.bestFloor+1,d.startFloor||d.bestFloor+1),a=d.hunterIds.length===3&&game.dungeonAssess?game.dungeonAssess(d.hunterIds,f):null;return [d.hunterIds,f,a&&[a.verdict,a.safeFloor,a.weak,a.tired,Number.isFinite(a.secs)?Math.round(a.secs/5):-1]];}};
// 勝算:pixel-game arenaOdds 跟實戰同一套對戰核心、輸入沒變會回快取;這裡再節流成最多每秒算一次(試打 60 場,長局約 20ms)
let arOddsMemo={at:-1e9,key:'',v:null};
function arOddsNow(lock){const a=game.state.arena,mine=a.hunterIds.length===3,now=performance.now(),key=(lock?'L':'')+(mine?a.hunterIds.join(','):'rec')+':'+a.wins;
 if(arOddsMemo.key===key&&now-arOddsMemo.at<1000)return arOddsMemo.v;
 const ids=mine?a.hunterIds:game.recommendArenaParty?.()?.ids,o=!lock&&ids?.length===3?game.arenaOdds?.(ids):null;arOddsMemo={at:now,key,v:{mine,o}};return arOddsMemo.v;}
let liveSig='',liveAt=0;
function liveModalTick(now){const f=LIVE[modal];if(!f||now-liveAt<250)return;liveAt=now;const sig=JSON.stringify(f(game.state));if(!liveSig){liveSig=sig;return;}if(sig===liveSig)return;
 const box=$('#modal-content');if(pressEl&&(box.contains(pressEl)||$('#modal-foot')?.contains(pressEl)))return;liveSig=sig;const st=box.scrollTop;openModal(modal);box.scrollTop=st;liveSig=sig;}
function syncScrollHint(){   // T139：面板內容比視窗高時，下方顯示「還有內容」提示（2026-11-11 改成上下小箭頭：上面還有／下面還有）
  const c=$("#modal-content"), m=$("#modal"), hint=$("#scroll-hint"), up=$("#scroll-hint-up");
  if(!c||!m||!hint)return;
  const over=c.scrollHeight-c.clientHeight;
  const atEnd=c.scrollTop>=over-12;
  m.dataset.scroll=over>12?(atEnd?"end":"1"):"";
  hint.hidden=!(over>12)||atEnd;
  if(up)up.hidden=!(over>12)||c.scrollTop<=12;
}
function openModal(type){if(!modalShown())sfx('open');const wasOpen=modalShown(),prev=wasOpen?document.activeElement:null,prevType=modal;if(!wasOpen)modalOpener=document.activeElement;
 modal=type;liveSig='';$('#modal').dataset.type=type;$('#modal').dataset.kind=(type==='confirm'||type==='bossconfirm')?'confirm':(type==='welcome'||type==='advisor')?'dialog':'';document.body.dataset.modalTab=MODAL_TAB[type]||'';const zMode=setModalMode(type);measureHud();$('#modal-backdrop').classList.remove('hidden');hudInert(true);modalTitle(type,type==='trade'?'trade':type==='craft'?'anvil':type==='dungeon'?'dungeon':type==='arena'?'swords':type==='hunters'?'hunter':type==='difficulty'?'skull':type==='dispatch'?'swords':type==='region'?'map':type==='density'?'skull':'scroll');{const mg=$('#modal-ghost');if(mg){mg.classList.remove('z2-hnav');mg.innerHTML='';}}$('#modal-content').innerHTML=modalHTML(type);{const mt=$('#modal-tools');if(mt){mt.innerHTML=modalTools(type);setIcons(mt);}}paintSubtabs(type);setIcons($('#modal-content'));mountFoot(type,zMode);setIcons($('#modal-foot'));paintPortraits();fitDispatchPad();if(!wasOpen||prevType!==type){$("#modal-content").scrollTop=0;}   // T147：換面板或重新打開時回到最上面
 focusModalStart(prev);syncScrollHint();paintPanelRes(game.state);toastDodge();}   // 先把內容畫好、取消隐藏,最後才把焦點放進去(重畫時留在同一顆控件)
function dungeonStatus(){const d=game.state.dungeon;return d.active?`第 ${d.floor} 層 · 第 ${Math.max(1,d.wave||1)}/3 波 · ${d.phase}${d.auto?' · 自動續戰':''}`:`最高紀錄：第 ${d.bestFloor} 層 · ${!(game.state.buildings.dungeon>0)?'未解鎖':d.cooldown>0?`整備中 ${Math.ceil(d.cooldown)} 秒`:'可以出發'}`;}
let dgSig='';   // 地下城彈窗開著時:出發/結束(畫面要換)就整個重畫,其他只改狀態列
// 2026-11-24(B9):整備冷卻結束(cooldown>0 → 0)也算狀態改變 → 整頁重畫,出發鈕才會解鎖;冷卻中按鈕上的「小隊整備中 N 秒」就地倒數(以前只有狀態列在動)
function dungeonTick(){if(modal!=='dungeon'){dgSig='';return;}const d=game.state.dungeon,sig=d.active+':'+d.bestFloor+':'+(d.active?d.floor:'')+':'+(d.cooldown>0);if(dgSig&&sig!==dgSig){dgSig=sig;openModal('dungeon');return;}dgSig=sig;
 const st=$('#dg-status'),txt=dungeonStatus();if(st&&st.textContent!==txt)st.textContent=txt;if(d.active)world?.drawDungeonStrip?.($('#dungeon-strip'),game.state);
 if(!d.active&&d.cooldown>0){const t=Math.ceil(d.cooldown)+' 秒';for(const b of document.querySelectorAll('#modal [data-action=startDungeon][disabled]'))if(/小隊整備中 \d+ 秒/.test(b.textContent))b.lastChild.textContent=b.lastChild.textContent.replace(/\d+ 秒/,t);}
 const tr=document.getElementById('dg-tired');if(tr){const t=dgTiredText(d.hunterIds);if(tr.textContent!==t){tr.textContent=t;tr.hidden=!t;}}}
// 飢餓／疲勞的地下城傷害懲罰(pixel-game DG_TIRED_*:飽食或體力低於 15 → 普攻 ×0.6)以前畫面上完全沒有提示
function dgTiredText(ids){const hs=(ids||[]).map(id=>game.state.hunters.find(h=>h.id===id)).filter(h=>h&&h.hp>0&&((h.satiety??100)<15||(h.stamina??100)<15));return hs.length?`${hs.map(h=>h.name).join('、')}飢餓／疲勞：地下城普攻傷害 ×0.6（吃飯、休息後恢復）`:'';}
// 建設面板卡片上直接建造/升級後,面板留著、捲動位置不動,只換成新的狀態。
function refreshBuildModal(){if(modal!=='build')return;const c=$('#modal-content'),st=c?c.scrollTop:0;openModal('build');if(c)c.scrollTop=st;syncScrollHint();}
// 2026-11-11 確認框(獵魔村風格:炭黑小面板＋主按鈕磚紅／取消灰)。只能按按鈕回答(modalDismissible 擋 Esc 與背板)。
// Z2C(2026-11-12):首領正式名＝pixel-game.js ENEMY_NAME.boss;限時＝pixel-game.js 討伐 elapsed>=210 秒。結算視窗的內容與待顯示佇列。
const BOSS_NAME='森林領主',BOSS_LIMIT=210;let resultReq=null,z2cPending=null;
// Z2C 段(「═══ Z2C」標記)定義在啟動用的 try 區塊裡(跟 nextStepPick 同層),這裡是給模組層的 modalHTML／doAction 用的轉接
const Z2C={};const z2cDungeonHTML=(...a)=>Z2C.dungeon(...a),z2cArenaHTML=(...a)=>Z2C.arena(...a),z2cResultHTML=(...a)=>Z2C.result(...a),z2cBossConfirmHTML=(...a)=>Z2C.bossConfirm(...a),
 z2cVerdictTag=(...a)=>Z2C.verdictTag(...a),z2cFit=(...a)=>Z2C.fit(...a),z2cMarkRetreat=(...a)=>Z2C.markRetreat(...a),z2cFlashBuild=(...a)=>Z2C.flashBuild(...a),z2cFitMap=(...a)=>Z2C.fitMap(...a);
let confirmReq=null;
function askConfirm(text,yesLabel,onYes,back='',ask='',title=''){confirmReq={text,yesLabel,onYes,back,ask,title};openModal('confirm');}   // ask:說明框下方的一行提問(規格 h)
globalThis.__mistvaleSelect=id=>handleWorldSelect(id);   // 截圖／驗收用:等同在世界裡點一下(建築 id、hunter:<id>、foe:<id>)
globalThis.__mistvaleConfirm=(text='確定要重置村莊嗎？')=>askConfirm(text,'確認',()=>{},'');   // 截圖／驗收用:只開框,按確定不做事
function closeModal(soft){
 // 2026-11-19 使用者:從名冊點進來的獵人卡,按「關閉」／Esc／點背板之後要回到名冊,不是整個關掉回世界。
 // 只有那三個「使用者自己收視窗」的入口傳 soft=true;換頁籤、去地圖定位、回世界這些地方照舊整個關掉。
 if(soft&&modal==='hunter-detail'&&!placing){
  const id=hc.id,st=rosterScroll;hc.id='';hc.tab='info';openModal('hunters');
  const c=$('#modal-content');if(c)c.scrollTop=st;
  const back=id?$(`#modal-content .hv-hcard[data-id="${id}"]`):null;
  if(back&&back.getBoundingClientRect().width>0)back.focus({preventScroll:true});
  return;}
 if(modal)sfx('close');modal='';{const mg=$('#modal-ghost');if(mg){mg.classList.remove('z2-hnav');mg.innerHTML='';}}document.body.dataset.modalTab='';delete document.body.dataset.modalMode;const bdm=$('#modal-backdrop');delete bdm.dataset.mode;document.body.classList.remove('hud-modal');$('#modal-backdrop').classList.add('hidden');hudInert(false);toastDodge();
 const back=modalOpener;modalOpener=null;if(back&&back!==document.body&&back.isConnected&&!back.closest('.hidden')&&back.getBoundingClientRect().width>0)back.focus();}
// T128:區域探索進度——徽章點數與文字都從 state.codex 推導，不另外存一份進度。
// 只在區域真的有棲息魔物時才輸出；村莊沒有野外魔物，卡片不會多一行。
function regionProgress(rid,s){
  const mon=REGION_MONSTERS[rid]||[];
  if(!mon.length)return '';
  const seen=(s.codex||{});
  const got=mon.filter(id=>(seen[id]||0)>0).length;
  const kills=mon.reduce((n,id)=>n+(seen[id]||0),0);
  const dots=mon.map(id=>`<i class="rg-dot${(seen[id]||0)>0?' on':''}" title="${(seen[id]||0)>0?MONSTER_NAME[id]||id:'尚未記錄'}"></i>`).join('');
  return `<div class="rg-exp" role="group" aria-label="${rid} 探索進度"><span class="rg-dots" aria-hidden="true">${dots}</span><small>已記錄 ${got}／${mon.length} 種 · 擊殺 ${kills} 次</small></div>`;  syncScrollHint();

}
function regionBossLine(s){
  const n=s.bossKills||0;
  return n?`首領已擊敗 ${n} 次`:'首領尚未挑戰';
}
// 村長(說話者)頭像:用專案自己的祭司立繪(drawPortrait),不是新素材
const ELDER={id:'elder',classId:'priest',rarity:'normal'};
function elderFace(){return `<img src="${portrait(ELDER)}" alt="" class="hv-face" data-elder>`;}
let advisorReq=null;
// ═══ Z2D：新手引導氣泡(規格 l、diff #17、UX #4)═══
// 一次一步:開場用白色像素氣泡(粗黑框、黑字、尾巴指向村長)＋大頭像,「下一步」往下走;每步的 target 是要按的頁籤／圖示,z2dMarkPaint 在上面加高亮＋手指。
// 同一時間只留一條主引導:開場氣泡(視窗,獨占)→ 關掉後只剩左側顧問(nextStepPick);任務追蹤只靠紅點／N 徽章提示可領獎勵、不閃爍、不說話。
// 委託 01 原本「迎接第六位獵人」開局就完成;2026-11-16 起改成「招募 1 位旅人」(開局未完成)。nextStepPick 的 skipQuest 只看 slot,跟這章無關。
// 人數從資料讀:開局每個職業一位(CLASSES.length),文字不寫死。步驟內文改動只要改這張表。
const CN_NUM=['零','一','二','三','四','五','六','七','八','九','十'],cnNum=n=>CN_NUM[n]??String(n);
let welcomeStep=0;
const WELCOME_STEPS=[
  {h:'',target:'',p:()=>`你和${cnNum(game.state.hunters.length)}位獵人剛抵達這座被霧包圍的村莊。先把三件事做好，村子就會自己轉起來。`},
  // 2026-11-16:配合 18 章委託與顧問帶路改寫 —— 原本第 2 步叫玩家先蓋地下城(現在是第 7 章)、第 3 步叫玩家蓋食堂旅館(開局就有)
  {h:'跟著委託走',target:'hunters',p:()=>`左上是<strong>村長委託</strong>，下面的村長會一次只提醒一件事。第一章很簡單：到<strong>獵人</strong>的「招募」邀請 1 位好感度夠的流浪英雄加入（他們在村裡吃住、買東西，好感就會上升）。完成後點左上的委託就能領獎，並解鎖下一章。`},
  {h:'讓村子賺錢',target:'craft',p:()=>`獵人在<strong>餐廳、旅館、酒館、治療所</strong>花錢，村莊就有收入；商品賣完記得到<strong>倉庫 → 製作</strong>補貨。設施升級後賣得更貴。材料不夠時，按鈕會變成青綠色的<strong>補料</strong>，可以直接向行商買。`},
  {h:'變強之後',target:'help',p:()=>`鐵匠鋪做出更高階的裝備，獵人會自己買來換。之後的章節會帶你蓋<strong>地下城</strong>、召喚<strong>首領</strong>、挑戰<strong>競技場</strong>天梯。<br><small>隨時可以按右上角「說明」重看這段；點建築或獵人，腳下會出現兩顆小鈕，按 i 看詳情。</small>`},
];
// 高亮目標:要按的頁籤(建設、地下城、獵人、倉庫、交易)或右上圖示(委託、地圖);同一時間最多一個。每幀只在目標變了才動 DOM。
let z2dMarkKey='';
function z2dMarkSel(act){if(act&&act.startsWith('rebirth:')||act==='recruit')act='hunters';if(act==='arena')return '.hv-actions [data-act=arena]';return !act?null:({quests:'#topbar .hv-quests',help:'#topbar [data-action=help]',craft:'#bottom-bar [data-action=inventory]',equipstore:'#bottom-bar [data-action=inventory]'})[act]||`#bottom-bar [data-action="${act}"]`;}
function z2dMarkPaint(){
  let act='';
  if(modal==='welcome')act=WELCOME_STEPS[Math.max(0,Math.min(WELCOME_STEPS.length-1,welcomeStep))].target;
  else if(modal==='advisor')act=advisorReq?.act||'';
  else if(!modal)act=document.getElementById('next-step')?.dataset.act||'';   // (nextStepEl 宣告在檔案後段,這裡改從 DOM 讀,避免初始化順序問題)
  const sel=z2dMarkSel(act),key=sel||'';if(key===z2dMarkKey&&(!sel||document.querySelector('[data-z2d-target]')))return;
  z2dMarkKey=key;
  document.querySelectorAll('[data-z2d-target]').forEach(e=>{e.removeAttribute('data-z2d-target');e.querySelector(':scope>.z2d-finger')?.remove();});
  const t=sel&&document.querySelector(sel);if(!t)return;
  t.setAttribute('data-z2d-target','1');const f=document.createElement('i');f.className='z2d-finger';f.setAttribute('aria-hidden','true');t.append(f);}
const ADVISOR_ICON={quests:'quest',hunters:'hunter',recruit:'hunter',arena:'swords',dungeon:'dungeon',build:'hall'};
// 2026-11-25 好感度「怎麼升」只有這一份,招募頁/顧問/第 1 章提示/說明共用
const AFF_RISE='在村裡吃住療傷、賣材料給交易所、在鐵匠鋪買到裝備，好感度就會上升（商品賣完會下降）';
const ADVISOR_MORE={dungeon0:'地下城入口蓋好之後，才能挑 3 位獵人出發闖關；競技場則要先蓋修煉地。',restock:'獵人會自己出去狩獵，但商品只能靠你在「倉庫 → 製作」補貨；賣完了，村莊就沒有這筆收入。',quest:'領完獎勵就會解鎖下一章。',visitor:'流浪英雄'+AFF_RISE+'；到門檻就一定答應，稀有度越高門檻越高。','visitor-wait':'流浪英雄'+AFF_RISE+'；到門檻就一定答應，稀有度越高門檻越高。',dungeon:'每層三波魔物；打贏推進紀錄，打不過就會帶傷回村。',build:'先蓋食堂、旅館、酒館：獵人有地方花錢，村莊才有收入。',dungeon2:'地下城一次要三位獵人；其他人可以先去生態區狩獵。',hunt:'在地圖上選一個生態區，獵人會自己去那裡打怪、帶材料回來。'};
// ── 2026-11-25 招募 = 邀請流浪英雄(好感度;旅人/新獵人暗帶取消)。資料全部來自 game.recruitQuote(唯讀) ──
// 卡片:立繪(左下角 Lv)｜名字＋稀有度、職業·特性、正在做什麼、好感度條(淡色段 = 有機會的區間、亮線 = 門檻)、好感／成功率｜定位小鈕＋小顆邀請鈕(金額)
const rcTone=q=>q.chance>=1?'ok':q.chance>0?'mid':'low';
// 2026-11-25 好感度用語統一:標題/第一次提到寫「好感度」,條與短標籤寫「好感」;「怎麼升」只有這一份(介面/顧問/第 1 章提示/說明共用)
const AFF_LEVERS=[['吃住療傷',`+${AFFINITY.service}`,'craft'],['交易所收購',`+${AFFINITY.trade}`,'trade'],['鐵匠鋪買到裝備',`+${AFFINITY.gear}`,'craft'],['賣完了',`−${-AFFINITY.miss}`,'craft']];
let recruitHint='',recruitResult=null,recruitHelp=false;   // recruitHint:被點了的鎖住鈕、卡片上顯示原因;recruitResult:{id,kind:'fail'|'ok',text} 結果直接顯示在卡片上
const rcState=q=>q.cooldown?'cd':q.ok?'ok':q.chance<=0&&!q.full&&!q.down&&!q.broke?'locked':'blocked';
function recruitLockText(q,s){return q.full?'名額已滿':q.down?'倒下中':q.cooldown?`${waitText(q.retryIn)}後`:q.chance<=0?`再 +${Math.max(1,q.floor+1-q.affinity)} 好感`:q.broke?`缺 ${fmt(q.cost-(s.gold||0))} 金`:'';}
// 卡片上「最近一次好感變化」(w.affLast = {kind,delta,item,name,at};at = 真實時間毫秒,前綴「N 分鐘前／昨天」照玩家本機時間;舊存檔/還沒有/不認得的 kind → 不顯示)
function affLastText(w,s){const a=w.affLast;if(!a||typeof a!=='object'||!Number.isFinite(+a.delta))return '';const d=Math.round(+a.delta),sg=(d>0?'+':d<0?'−':'')+Math.abs(d),nm=esc(a.name||'商品'),k=a.kind;
 const body=k==='svc'?`剛買到 ${nm} ${sg}`:k==='miss'?`想買 ${nm} 但賣完了 ${sg} →`:k==='trade'?`交易所收購了他的戰利品 ${sg}`:k==='refuse'?`背包滿了，交易所沒收 ${sg}`:k==='gear'?`在鐵匠鋪買到 ${nm} ${sg}`:k==='fail'?`婉拒了邀請 ${sg}`:k==='offline'?(d?`你不在時 好感 ${sg}`:'你不在時 好感變化不大'):'';
 if(!body||(!d&&k!=='offline'))return '';return `${agoText(+a.at,game.realNow())}${body}`;}
function recruitCardHTML(w,s){const q=game.recruitQuote(w.id);if(!q)return '';
 const c=CLASSES.find(x=>x.id===w.classId),r=RARITIES.find(x=>x.id===w.rarity)||RARITIES[0],t=TRAITS.find(x=>x.id===w.trait),aff=Math.max(0,Math.min(100,q.affinity)),pct=Math.round(q.chance*100),lock=recruitLockText(q,s),st=rcState(q),res=recruitResult&&recruitResult.id===w.id?recruitResult:null;
 const last=affLastText(w,s),soldOut=w.affLast?.kind==='miss';
 let hint='';
 if(recruitHint===w.id&&lock&&!res){
  if(q.full)hint=`<p class="rc-hint" role="status">獵人 ${fmt(s.hunters.length)}／${fmt(s.capacity)}，沒有空位。升級獵人小屋增加名額，或「送別」一位獵人。<button type="button" class="rc-link" data-action="rcGo" data-id="build">去建設</button></p>`;
  else if(q.down)hint=`<p class="rc-hint" role="status">${esc(w.name)}倒下了，稍後會自己站起來。</p>`;
  else if(q.cooldown)hint=`<p class="rc-hint" role="status">${esc(w.name)}剛婉拒過，${waitText(q.retryIn)}後可再邀。</p>`;
  else if(q.chance<=0)hint=`<p class="rc-hint" role="status">他的好感 ${q.affinity}／${q.need}。在村裡吃住、買裝備會增加。</p>`;
  else if(q.broke)hint=`<p class="rc-hint" role="status">邀請要 ${fmt(q.cost)} 金，還缺 ${fmt(q.cost-(s.gold||0))} 金。<button type="button" class="rc-link" data-action="rcGo" data-id="trade">去交易所</button></p>`;}
 const resHTML=res?`<p class="rc-result ${res.kind}" role="status">${esc(res.text)}</p>`:'';
 const lastHTML=!res&&!hint&&last?`<p class="rc-last${Math.round(w.affLast.delta)<0?' neg':''}">${last}${soldOut?` <button type="button" class="rc-link" data-action="rcGo" data-id="craft">去補貨</button>`:''}</p>`:'';
 const meta=q.cooldown?'剛婉拒過':`成功率 <b>${pct}%</b>`;
 return `<article class="rc-card${res?' flash-'+res.kind:''}" role="listitem" data-id="${w.id}" data-state="${st}" data-rarity="${r.id}" data-tone="${rcTone(q)}" style="--rarity:${r.color}">`
  +`<div class="rc-art"><img src="${portrait(w)}" data-portrait="${w.id}" alt=""><em class="rc-lv">Lv.${w.level}</em></div>`
  +`<button type="button" class="hv-btn rc-loc" data-action="locateWanderer" data-id="${w.id}" aria-label="在地圖上找到 ${esc(w.name)}" title="在地圖上找到 ${esc(w.name)}">${iconHTML('locate',true)}</button>`
  +`<div class="rc-body"><div class="rc-head"><b class="rc-name">${esc(w.name)}</b><em class="rc-rar">${r.name}</em></div>`
  +`<small class="rc-sub">${esc(c?.name||'')}${t?` · <span title="${esc(t.desc)}">${esc(t.name)}</span>`:''}</small>`
  +`<p class="rc-doing">${esc(w.hp>0?(w.status||''):'倒下了，稍後會自己站起來')}</p>`
  +`<div class="rc-aff" role="meter" aria-label="好感度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${aff}" aria-valuetext="好感 ${aff}，門檻 ${q.need}"><i class="rc-ramp" style="left:${q.floor}%;width:${q.need-q.floor}%"></i><span class="rc-fill" style="width:${aff}%"></span><i class="rc-need" style="left:${q.need}%"></i></div>`
  +`<div class="rc-meta"><span class="rc-af">好感 <b>${aff}</b><small>／${q.need}</small></span><span class="rc-pct">${meta}</span></div></div>`
  +`<button type="button" class="pixel-button gold rc-go${lock?' is-locked':''}" data-action="recruitWanderer" data-id="${w.id}"${lock?' aria-disabled="true"':''} aria-label="${lock?`${esc(w.name)}：${lock}（點一下看原因）`:`邀請 ${esc(w.name)}（${fmt(q.cost)} 金幣，成功率 ${pct}%）`}">${lock?`<i class="hv-lock" aria-hidden="true"></i><span>${lock}</span>`:`<span>邀請</span><small>${iconHTML('gold',true)}${fmt(q.cost)}</small>`}</button>`
  +resHTML+hint+lastHTML
  +`</article>`;}
// 招募頁標題列的數字:只算「現在真的能邀請」的人,被擋住就說原因(跟徽章 recruitable() 同一個判斷:好感到門檻、付得起、名額沒滿)
function recruitSummary(s){const full=(s.hunters||[]).length>=(s.capacity||0),qs=(s.wanderers||[]).map(w=>game.recruitQuote(w.id)).filter(q=>q&&!q.cooldown&&!q.down&&q.chance>0);
 const sure=qs.filter(q=>q.chance>=1),part=qs.filter(q=>q.chance<1);
 if(full)return sure.length?`${sure.length} 位好感夠了 · 名額已滿`:part.length?'名額已滿':'還沒有人願意加入';
 const ready=sure.filter(q=>!q.broke),broke=sure.filter(q=>q.broke);
 if(ready.length)return `${ready.length} 位願意加入${broke.length?` · ${broke.length} 位缺金幣`:''}`;
 if(broke.length)return `${broke.length} 位好感夠了 · 缺金幣`;
 const tryq=part.filter(q=>!q.broke);
 if(tryq.length){const best=Math.round(Math.max(...tryq.map(q=>q.chance))*100);return tryq.length===1?`1 位可以試試（${best}%）`:`${tryq.length} 位可以試試（最高 ${best}%）`;}
 return part.length?`${part.length} 位好感差一點 · 缺金幣`:'還沒有人願意加入';}
let rcOrder=null,rcKeep=false;   // rcOrder:這次打開招募頁時的排列;點鈕後的重畫沿用它(被婉拒的卡不會馬上跳到最後面,玩家才看得到結果)
function refreshRecruit(clearResultSoon){rcKeep=true;const c=$('#modal-content'),st=c?c.scrollTop:0;openModal('recruit');rcKeep=false;if(c)c.scrollTop=st;syncScrollHint();
 const hot=document.querySelector('#modal-content .rc-card .rc-result,#modal-content .rc-card .rc-hint');if(hot)hot.closest('.rc-card').scrollIntoView({block:'nearest'});
 if(clearResultSoon&&recruitResult){const r0=recruitResult;setTimeout(()=>{if(recruitResult===r0){recruitResult=null;if(modal==='recruit')refreshRecruit();}},9000);}}
function recruitHTML(s){const full=(s.hunters||[]).length>=(s.capacity||0),house=s.buildings?.house||0,sold=soldOutGoods(s);
 const rank=q=>({ok:0,blocked:1,locked:2,cd:3})[rcState(q)];   // 2026-11-25 排序:能邀請(成功率高到低)→ 被金幣/名額擋住 → 好感還不夠 → 今天婉拒過(最後、變暗)
 const list=[...(s.wanderers||[])].map(w=>({w,q:game.recruitQuote(w.id)})).filter(x=>x.q).sort((a,b)=>(rank(a.q)-rank(b.q))||(b.q.chance-a.q.chance)||(b.q.affinity-a.q.affinity)||(b.w.level-a.w.level)).map(x=>x.w);
 if(rcKeep&&rcOrder)list.sort((a,b)=>{const ia=rcOrder.indexOf(a.id),ib=rcOrder.indexOf(b.id);return (ia<0?999:ia)-(ib<0?999:ib);});else rcOrder=list.map(w=>w.id);
 const lev=AFF_LEVERS.map(([n,v,go])=>`<button type="button" class="rc-lev${v[0]==='−'?' neg':''}" data-action="rcGo" data-id="${go}"><span>${n}</span><b>${v}</b></button>`).join('');
 return `<div class="rc-intro"><div class="rc-introtop"><b class="rc-ti">好感度</b><button type="button" class="rc-q" data-action="rcHelp" aria-expanded="${recruitHelp}" aria-label="好感度怎麼增加、條上的標記是什麼意思">?</button><b class="rc-count" role="status">${recruitSummary(s)}</b></div>`
  +`<div class="rc-levers" role="group" aria-label="好感度怎麼增加">${lev}</div>`
  +(recruitHelp?`<p class="rc-how">流浪英雄${AFF_RISE}。好感條上，<b>亮線</b>是門檻（到了一定答應）、<b>淡色段</b>是還沒到門檻但有機會的區間；被婉拒要等 ${waitText(REALTIME.recruitRetry)}才能再邀，不收金幣。</p>`:'')+`</div>`
  +(sold.length?`<p class="rc-sold" role="status"><span>賣完了：${esc(sold.join('、'))}</span><button type="button" class="rc-link" data-action="rcGo" data-id="craft">去補貨</button></p>`:'')
  +(recruitResult&&recruitResult.kind==='ok'?`<p class="rc-result ok rc-banner" role="status">${esc(recruitResult.text)}</p>`:'')
  +(full?`<p class="hv-note recruit-full" role="status">${iconHTML('lock',true)} 名額已滿（${fmt(s.hunters.length)}/${fmt(s.capacity)}）。${house<5?'升級獵人小屋每級多 2 個名額。':'獵人小屋已是最高級；想要更強的夥伴，可以在獵人詳情「轉世」頁「晉升」稀有度。'}也可以在獵人詳情「資訊」頁最下方「送別」一位獵人，空出名額。</p>`:'')
  +`<div class="rc-grid" role="list">${listHTML(list,w=>recruitCardHTML(w,s),'附近沒有流浪英雄',`有人被招募走後，每 ${waitText(REALTIME.wandererEvery)}會有一位新的流浪英雄來到村莊附近`)}</div>`;}
// 2026-11-25 招募徽章/顧問:可以 100% 招進來的人數(好感到門檻、沒在婉拒冷卻、站著、付得起;名額滿了就是 0)
function recruitable(s){if((s.hunters||[]).length>=(s.capacity||0)||!game?.recruitQuote)return 0;return (s.wanderers||[]).filter(w=>{const q=game.recruitQuote(w.id);return q&&q.ok&&q.chance>=1;}).length;}
function modalHTML(type){const s=game.state;
 if(type==='confirm'){const q=confirmReq||{text:'確定嗎？',yesLabel:'確認'};return `<div class="hv-confirm"><p>${esc(q.text)}</p>${q.ask===null?'':`<div class="z2b-ask" role="note">${esc(q.ask||'確認要執行嗎？')}</div>`}<div class="hv-confirm-row"><button class="pixel-button quiet hv-btn cancel" data-action="confirmNo" data-foot="secondary">取消</button><button class="pixel-button gold hv-btn primary" data-action="confirmYes" data-foot="primary">${esc(q.yesLabel||'確認')}</button></div></div>`;}   // Z2B(規格 h):標題帶(視窗標題)＋說明內凹框＋一行提問＋「確認(橄欖綠)／取消(紅)」

  if(type==='build'){   // T112：先把庫存攤在上面，每張卡再寫自己的缺口，不用點進去才知道能不能蓋
    const stock=['gold',...Object.keys(MATERIALS)].map(k=>`<span class="bs-item" data-key="${k}">${iconHTML(k)} <span class="nm">${MATERIALS[k]?.name||'金幣'}</span> <b>${fmt(s[k]||0)}</b></span>`).join('');
    // 2026-11-11 獵魔村風格卡片:標題＋右上金色 i(開詳情)→ 建築圖 → 成本一行(不足的數字標紅)→ 滿寬主按鈕(建造/升級/缺什麼/鎖住);滿級改一行綠字。
    return `<div class="build-stock" role="status" aria-label="村莊庫存">${stock}</div>${(()=>{const mx=BUILDINGS.filter(b=>(s.buildings[b.id]||0)>=5).length;return mx===BUILDINGS.length?`<p class="hv-note bs-allmax" role="status">${iconHTML('check',true)} 全部建築都已滿級。之後的金幣與星晶留給獵人晉升、轉世與強化。</p>`:'';})()}<div class="building-grid hv-build-grid">${listHTML([...BUILDINGS].sort((a,b)=>((s.buildings[a.id]||0)>=5)-((s.buildings[b.id]||0)>=5)),b=>{const l=s.buildings[b.id],st=buildTileState(b,l),v=upgradeView(b);
      const cost=v.cost?Object.entries(v.cost).map(([k,n])=>`<span class="hv-cost${(s[k]||0)<n?' short':''}" title="${costName(k)} ${fmt(s[k]||0)}/${fmt(n)}">${iconHTML(k,true)}<b>${fmt(n)}</b></span>`).join(''):'';
      const miss=v.missing||[],lock=v.mode==='upgrade'&&v.hallBlocked,mq=miss.length&&!lock?game.merchantQuote(v.cost):null;
      // 2026-11-16:只缺材料、金幣又夠 → 主按鈕變「補料升級」(交易所行商補差額後直接升級),不要讓玩家卡在灰色按鈕
      const btn=st.done?`<p class="bc-done">已達最高等級</p>`
        :lock?`<button class="hv-btn locked" disabled aria-disabled="true" data-id="${b.id}"><i class="hv-lock" aria-hidden="true"></i>需要大廳 Lv.${v.next}</button>`
        :mq?.ok?`<button class="hv-btn primary merchant-btn" data-action="merchantBuild" data-zb="teal" data-id="${b.id}" title="向交易所行商補 ${miss.map(([k,n])=>costName(k)+' '+fmt(n)).join('、')}">補料${l?'升級':'建造'} <small>${iconHTML('gold',true)}${fmt(mq.total)}</small></button>`
        :miss.length?`<button class="hv-btn short-btn" disabled aria-disabled="true" data-id="${b.id}">缺 ${miss.map(([k,n])=>costName(k)+fmt(n)).join('、')}${mq&&mq.total>0&&/金幣不足/.test(mq.reason||'')?`<small class="short-mq">補料共需 ${iconHTML('gold',true)}${fmt(mq.total)}</small>`:''}</button>`
        :`<button class="hv-btn primary" data-action="${l?'upgrade':'construct'}" data-id="${b.id}">${l?'升級 Lv.'+v.next:'建造'}</button>`;
      return `<article class="building-card hv-card ${l?'':'unbuilt'}${st.short?' tight':''}" data-id="${b.id}" data-state="${st.done?'max':lock?'locked':miss.length?'short':l?'upgrade':'build'}" aria-label="${b.name} ${l?'Lv.'+l:'未建造'} ${st.aria}"><header class="bc-head"><strong>${b.name}</strong><small>${l?'Lv.'+l:'未建造'}</small><button class="hv-i" data-action="selectBuilding" data-id="${b.id}" aria-label="${b.name} 詳情" title="${b.name} 詳情"><span aria-hidden="true">i</span></button></header><div class="bc-art"><img src="${buildingImg(b.id)}" alt="${b.name}"></div>${l?(!st.done&&v.next?(g=>g?`<p class="bc-use bc-gain">${esc(g)}</p>`:'')(upgradeDelta(b,l,v.next)):''):`<p class="bc-use">${esc(buildPurpose(b))}</p>`}${cost?`<div class="cost build-cost hv-costs">${cost}</div>`:''}${btn}</article>`},'目前沒有可建造的設施','先在村莊空地蓋一座大廳')}</div>`;
  }
 if(type==='hunters'){const all=s.hunters,list=rosterList(all);   // 2026-11-11 第二階段(規格 4.5):格狀肖像卡;篩選/排序與派遣/召回/招募收進頂部頁籤列右側(modalTools)
   return `${rosterMenu?rosterBar(all.length,list.length):''}<div class="hv-hgrid" role="list">${listHTML(list,hunterCardHTML,'沒有符合條件的獵人','換一個篩選，或按「招募」找新血')}</div>`;}
 // 2026-11-18:名額滿了 → 卡片上方說清楚怎麼辦,按鈕鎖起來(原本是綠色可按、按了才跳錯誤)
 if(type==='recruit')return recruitHTML(s);   // 2026-11-25 流浪英雄招募卡(好感度);名額滿了的說明也在 recruitHTML
 if(type==='trade'){const rows=Object.entries(MATERIALS).map(([id,m])=>{const q=s.tradeRequests[id]||0,hold=!!s.tradeStanding?.[id],stock=Math.floor(s[id]||0),room=hold?Math.max(0,q-stock):q,noGold=(s.gold||0)-game.tradeReserve()<m.price;   // 2026-11-24(B1):持續收購 = 維持庫存 q 份,room = 還會收幾份   // 2026-11-11 第二階段:物品格(圖示方格＋名稱＋小按鈕),參考交易請求面板的結構;±鈕直接改收購量
   return `<article class="trade-row hv-item z2b-cell ${q?'on':''}${hold?' standing':''}" data-id="${id}"><div class="hv-item-ic">${iconHTML(id)}${q?`<em class="hv-item-q" aria-hidden="true">${q}</em>`:''}</div><div class="tr-name"><b>${m.name}</b><small>庫存 ${fmt(s[id])} · ${m.price} 金/份</small>${(()=>{const nd=game.villageNeed?.()?.[id]||0,sr=nd>0&&game.specialtyRegion?.(id);return sr?`<em class="tr-need" title="存量低於收購量：自主狩獵的獵人會多去${esc(sr.name)}（${esc(m.name)}的特產區）" aria-label="缺料：自主狩獵的獵人會多去${esc(sr.name)}">缺料 → ${esc(sr.name)}</em>`:'';})()}</div><div class="tr-cost${room&&room*m.price>(s.gold||0)?' over':''}">${!q?'未收購':hold?(room?`維持 ${fmt(q)} 份 · 再收 ${fmt(room)} 份 ${fmt(room*m.price)} 金`:`維持 ${fmt(q)} 份 · 庫存已足`):`支出 ${fmt(q*m.price)} 金`}</div><div class="tr-big"><button class="pixel-button hv-sec" data-action="tradeStep" data-id="${id}" data-d="10" ${q>=999?'disabled':''} aria-label="${m.name}${hold?'維持庫存多 10 份':'多收 10 份'}">${hold?'庫存 +10':'收購 +10'}</button></div><div class="tr-step" role="group" aria-label="${m.name}${hold?'要維持的庫存':'收購數量'}"><button class="pixel-button quiet" data-action="tradeStep" data-id="${id}" data-d="-10" ${q?'':'disabled'} aria-label="${m.name}少收 10 份">−10</button><button class="pixel-button quiet" data-action="tradeStep" data-id="${id}" data-d="-1" ${q?'':'disabled'} aria-label="${m.name}少收 1 份">−</button><output aria-label="${m.name}${hold?'維持庫存':'收購量'}">${q}</output><button class="pixel-button quiet" data-action="tradeStep" data-id="${id}" data-d="1" ${q>=999?'disabled':''} aria-label="${m.name}多收 1 份">＋</button><button class="pixel-button quiet" data-action="tradeStep" data-id="${id}" data-d="10" ${q>=999?'disabled':''} aria-label="${m.name}多收 10 份">＋10</button></div><button class="pixel-button quiet tr-hold${hold&&room>0&&noGold?' paused':''}" data-action="tradeStanding" data-id="${id}" aria-pressed="${hold}" aria-label="${m.name}持續收購：維持庫存 ${q} 份" title="開啟後數字代表要維持的庫存：庫存低於這個數才向獵人收購，最多補到剛好這個數（金庫低於保留額時暫停）">持續收購：${!hold?'關':!q?'缺數量':!room?'庫存已足':noGold?'暫停':'開'}</button>${matSellable(s,id)?`<button class="pixel-button quiet tr-sell" data-action="matSell" data-id="${id}" aria-label="${m.name}賣 ${MERCHANT.sellLot} 份給行商，得到 ${Math.floor(MERCHANT.sellLot*m.price*MERCHANT.sell)} 金幣" title="用不完的材料半價賣給行商（庫存至少留 ${MERCHANT.sellKeep} 份才會顯示）">賣 ${MERCHANT.sellLot} 份<small>+${Math.floor(MERCHANT.sellLot*m.price*MERCHANT.sell)} 金</small></button>`:''}</article>`;}).join('');
  const roomOf=k=>{const v=s.tradeRequests[k]||0;return s.tradeStanding?.[k]?Math.max(0,v-Math.floor(s[k]||0)):v;};   // 2026-11-24(B1):「收購中／預計支出」只算還會收的份數(持續收購 = 補到維持庫存為止)
  const total=Object.keys(s.tradeRequests).reduce((n,k)=>n+roomOf(k),0),budget=Object.keys(s.tradeRequests).reduce((n,k)=>n+roomOf(k)*(MATERIALS[k]?.price||0),0),holds=Object.keys(MATERIALS).filter(k=>s.tradeStanding?.[k]).length,holdsLive=Object.keys(MATERIALS).filter(k=>s.tradeStanding?.[k]&&s.tradeRequests[k]>0).length;
  const mr=game.merchantRate(),reserve=game.tradeReserve(),paused=holdsLive>0&&(s.gold||0)-reserve<Math.min(...Object.keys(MATERIALS).filter(k=>s.tradeStanding?.[k]&&s.tradeRequests[k]>0).map(k=>MATERIALS[k].price));   // 2026-11-17 持續收購保留額:金庫扣掉保留額後連最便宜的一份都付不起 → 暫停
  return `<div class="trade-summary hv-sumline" role="status"><span>收購中 <b>${fmt(total)}</b> 份</span>${holdsLive?`<span>持續 <b>${holdsLive}</b> 項</span><span title="持續收購不會把金庫花到這個數以下">持續收購保留 <b>${fmt(reserve)}</b> 金</span>`:''}<span>預計支出 <b class="${budget>(s.gold||0)?'over':''}">${fmt(budget)}</b> 金</span><span>金庫 <b>${fmt(s.gold||0)}</b></span>${budget>(s.gold||0)?`<small class="over">超出 ${fmt(budget-s.gold)}</small>`:''}</div>${(()=>{const ks=Object.keys(MATERIALS),allOn=ks.every(k=>s.tradeStanding?.[k]&&s.tradeRequests[k]>0);return `<div class="trade-bulk"><span class="${paused?'pz':holdsLive?'on':''}" role="status">${paused?`金庫低於 ${fmt(reserve)} 金，持續收購暫停中`:holdsLive?`持續收購進行中 ${holdsLive}/${ks.length} 項`:'持續收購：維持設定的庫存，低於才收購'}</span><button class="pixel-button${allOn?' quiet':''}" data-action="tradeAllStanding" aria-pressed="${allOn}">${allOn?'全部關閉':'全部開啟'}</button></div>`;})()}<div class="trade-list hv-item-grid">${rows}</div>${(s.buildings.trading||0)>=MERCHANT.gemTrading?(()=>{const n=MERCHANT.gemLot,c=n*MERCHANT.gemPrice;return `<div class="trade-gems hv-sumline"><span>${iconHTML('gems',true)} 向行商買星晶（晉升用）：<b>${n}</b> 顆 <b>${fmt(c)}</b> 金 · 目前 <b>${fmt(s.gems||0)}</b> 顆</span><button class="pixel-button" data-action="buyGems"${(s.gold||0)<c?' disabled':''}>買 ${n} 顆</button></div>`;})():''}<div class="z1-inset z2b-info trade-info"><p>${esc(BUILDINGS.find(b=>b.id==='trading')?.desc||'')}</p>${mr?`<p class="trade-merchant">缺料可按青綠「補料」向行商買（收購價 <b class="z2b-n">${mr}</b> 倍，升級交易所更便宜）。</p>`:''}${Object.keys(MATERIALS).some(k=>matSellable(s,k))?`<p class="trade-merchant">用不完的材料可按「賣 ${MERCHANT.sellLot} 份」半價賣給行商。</p>`:''}</div><div class="trade-footer"><small class="tf-note">獵人回村時自動成交，從村莊金庫付款；「持續收購」的材料會維持在設定的庫存：低於才收購、最多補到該數，並保留 <b class="z2b-n">${fmt(reserve)}</b> 金，金庫低於此數就暫停。</small><button class="pixel-button quiet" data-action="tradeClear" ${total||holds?'':'disabled'}>全部停收</button></div>`;}
 if(type==='craft'){   // Z2B(圖鑑 e 節):製作改清單列——產物圖示、名稱、材料需求「現有/需要」(不足紅字＋「材料不足」)、右側金棕「製作」鈕；「做滿」保留為小鈕；庫存 0 的商品加「賣完了」標記
  const stockTag=n=>n<=0?'<em class="z2b-out">賣完了</em>':'';
  const goods=Object.entries(PRODUCTS).map(([id,p])=>{const maxB=affordableBatches(p.cost),n=s.stocks[id]||0,tg=game.craftTargetOf(id),tgPaused=tg>0&&n<tg&&maxB<1;
   const need=p.need==='hp'?'治療生命':p.need==='satiety'?'恢復飽食度':p.need==='stamina'?'恢復精力':'恢復心情';
   return `<li class="zc-row z2b-row${n<=0?' sold-out':''}" data-id="${id}"><i class="z2b-ic">${iconHTML(id)}<em class="z2b-q" aria-hidden="true">${fmt(n)}</em></i><div class="z2b-rb"><b class="z2b-nm">${p.name}${stockTag(n)}</b><p class="z2b-ds">${z2bBlue(`${need} · 庫存 ${n} · 每份售 ${game.servicePrice?game.servicePrice(id):p.price} 金`)}</p><div class="z2b-chips">${needChips(p.cost)}</div>${maxB>=1?`<div class="zc-meta">最多可做 <b>${maxB}</b> 批（${maxB*p.amount} 份）</div>`:''}</div>${zcAutoHTML(id,p,n,tg,tgPaused)}<div class="z2b-act zc-act">${maxB<1?merchantCraftBtn('goods',id,p.cost,null,`補料製作 ${p.amount} 份`):''}<button class="pixel-button gold" data-action="craftProduct" data-id="${id}" ${maxB>=1?'':'disabled'} aria-label="${maxB>=1?`製作 ${p.amount} 份`:'材料不足'}"${maxB<1&&merchantOk(p.cost)?' hidden':''}>${maxB>=1?`<span>製作</span><small>${p.amount} 份</small>`:'材料不足'}</button>${maxB>1?`<button class="pixel-button quiet hv-max" data-action="craftProduct" data-id="${id}" data-batches="${maxB}" aria-label="做滿 ${maxB*p.amount} 份" title="一次做滿：最多 ${maxB*p.amount} 份（${maxB} 批）"><span aria-hidden="true">最多</span><b aria-hidden="true">${maxB*p.amount}份</b><span class="hv-sr">做滿 ${maxB*p.amount} 份</span></button>`:''}</div></li>`;}).join('');
  const top=Math.max(1,forgeTierUI()),sel=craftTier>=1&&craftTier<=top?craftTier:top;   // 裝備製作分頁選的階級(預設 = 鐵匠鋪目前最高階)
  const tierChips=`<div class="z2b-chips gear-tiers" role="group" aria-label="鍛造階級"><span class="gear-tiers-lbl">鍛造階級</span>${GEAR_TIERS.map(t=>{const lock=t.tier>top;return `<button type="button" class="pixel-button${t.tier===sel?' gold':' quiet'}" data-action="craftTier" data-id="${t.tier}" aria-pressed="${t.tier===sel}"${lock?' disabled aria-disabled="true"':''} title="${lock?`鐵匠鋪 Lv.${t.tier} 解鎖`:`第 ${t.numeral} 階`}">${t.numeral}${lock?'<i class="hv-lock" aria-hidden="true"></i>':''}</button>`;}).join('')}</div>`;
  // 2026-11-26 裝備製作列重排:名稱＋階級章＋賣完了 → 武器/防具・誰能用 → 數值・售價 → 材料 有/需 ;右邊一顆主動作(鍛造 / 補料鍛造 / 材料不足)。庫存只講一次(圖示角標),另一階有貨才補一句。
  const whoOf=r0=>r0.wtype?`武器（${WEAPON_TYPES[r0.wtype]||r0.wtype}）· ${CLASSES.filter(c=>(CLASS_WEAPON_TYPES[c.id]||[]).includes(r0.wtype)).map(c=>c.name).join('、')}可用`:'防具 · 全職業可穿';
  const gearRow=r0=>{const r=gearAt(r0,sel),maxB=affordableBatches(r.cost),n=s.gearStock[r.id]?.[sel]||0,other=gearStockTotal(r.id)-n,full=gearFullName(r0,sel),base=full.slice(0,-2),mer=maxB<1&&merchantOk(r.cost);
   return `<li class="zc-row z2b-row gc-row${n<=0?' sold-out':''}" data-id="${r.id}"><i class="z2b-ic">${craftGearIconHTML(r.id,32,'anvil')}<em class="z2b-q" aria-hidden="true">${fmt(n)}</em></i><div class="z2b-rb"><b class="z2b-nm">${esc(base)} <em class="gc-tier" title="第 ${r.numeral} 階">${r.numeral}</em>${stockTag(n)}</b><p class="z2b-ds gc-who">${esc(whoOf(r0))}${other>0?` · 其他階貨架 ${other} 件`:''}</p><p class="z2b-ds gc-st">${z2bBlue(`${gearStatText(r)} · 售價 ${r.price} 金`)}</p><div class="z2b-chips">${needChips(r.cost)}</div></div><div class="z2b-act gc-act">${mer?merchantCraftBtn('gear',r0.id,r.cost,sel,'補料鍛造'):''}<button class="pixel-button gold" data-action="craftGear" data-id="${r.id}" data-tier="${sel}" ${maxB>=1?'':'disabled'}${mer?' hidden':''} aria-label="${maxB>=1?`鍛造${full}（最多可做 ${maxB} 件）`:'材料不足'}">${maxB>=1?`鍛造<small>可做 ${maxB}</small>`:'材料不足'}</button></div></li>`;};
  const gear=`<li class="gc-sec" role="presentation">武器 <b>${RECIPES.filter(r0=>r0.wtype).length}</b><small>依職業各用一種</small></li>${RECIPES.filter(r0=>r0.wtype).map(gearRow).join('')}<li class="gc-sec" role="presentation">防具 <b>${RECIPES.filter(r0=>!r0.wtype).length}</b><small>全職業共用，六格各一件</small></li>${RECIPES.filter(r0=>!r0.wtype).map(gearRow).join('')}`;
  const onTargets=Object.keys(PRODUCTS).filter(id=>(s.craftTargets?.[id]||0)>0);   // 2026-11-20 持續製作總覽:一眼看出哪幾項自動補貨中
  const autoSum=craftTab==='goods'&&onTargets.length>=2?`<div class="craft-auto-sum on" role="status"><span class="cas-l">持續製作 <b>${onTargets.length}</b> 項</span>${onTargets.map(id=>`<span class="cas-c">${PRODUCTS[id].name} <b>${s.craftTargets[id]}</b></span>`).join('')}<button class="pixel-button quiet" data-action="craftTargetAllOff">全部關閉</button></div>`:'';   // 2026-11-25 只有 2 項以上同時開著才顯示(一項的話列內開關已看得出來)
  const anyMer=craftTab==='goods'?Object.entries(PRODUCTS).some(([id,p])=>affordableBatches(p.cost)<1&&merchantOk(p.cost)):RECIPES.some(r0=>{const r=gearAt(r0,sel);return affordableBatches(r.cost)<1&&merchantOk(r.cost);});
  const merHint=anyMer?`<small class="zc-mer-hint">「補料」＝向行商買下缺的材料，買完立刻${craftTab==='goods'?'製作':'鍛造'}。</small>`:'';
  return `<div class="z1-subtabs z2b-tabs" role="tablist"><button type="button" role="tab" aria-selected="${craftTab==='goods'}" class="z1-subtab${craftTab==='goods'?' active on':''}" data-action="craftTab" data-id="goods"><span>生活物資</span></button><button type="button" role="tab" aria-selected="${craftTab==='gear'}" class="z1-subtab${craftTab==='gear'?' active on':''}" data-action="craftTab" data-id="gear"><span>裝備製作</span></button></div><p class="z2b-note">${craftTab==='goods'?'設定目標 → 庫存低於目標時自動用材料補貨':'鍛好的裝備放上貨架，獵人回村用個人金幣購買；鐵匠鋪每升一級解鎖下一階（最高 Ⅴ）'}${merHint}</p>${autoSum}${craftTab==='gear'?tierChips:''}<ul class="z2b-rows zc-list">${craftTab==='goods'?goods:gear}</ul>`;}
 if(type==='dispatch'){const teams=s.dispatchTeams||[];const tab=Math.min(dispatchTab,teams.length-1);const team=teams[tab]||{name:'隊伍 1',ids:[],region:'meadow'};
   // 2026-10-30 重排:分頁＋快速鈕同一列;隊員卡加職業、近戰/遠程、生命條、「在別組」;狩獵區改成徽章卡＋危險度(依 risk 由易到難排)
   const alive=aliveHunters();const rn=REGIONS.find(r=>r.id===team.region)?.name||team.region;
   const other=h=>teams.findIndex((t2,i)=>i!==tab&&t2.ids.includes(h.id));
   const regions=REGIONS.filter(r=>r.id!=='village').sort((x,y)=>x.risk-y.risk);   // 2026-10-30:危險度由弱到強(最好打的排最上面,越往下越硬)
   return `<div class="dispatch-head"><div class="dispatch-tabs tabs" role="tablist" aria-label="派遣隊伍">${teams.map((t2,i)=>`<button class="${i===tab?'active':''}" role="tab" aria-selected="${i===tab}" data-action="dispatchTab" data-index="${i}"><span class="dt-name">${t2.name}</span>${t2.ids.length?`<span class="dt-n">（${t2.ids.length}）</span>`:''}</button>`).join('')}</div>
   <div class="dispatch-quick"><span>已選 <b>${team.ids.length}</b> / ${alive.length}</span><button class="pixel-button quiet" data-action="dispatchAll">全選</button><button class="pixel-button quiet" data-action="dispatchNone" ${team.ids.length?'':'disabled'}>清空</button></div></div>
   <h4 class="dispatch-h">${iconHTML('hunter')}${team.name}的隊員</h4>
   <div class="party-grid dispatch-party">${s.hunters.map(h=>{const sel=team.ids.includes(h.id),o=other(h);
     return `${partyPick(h,'toggleDispatchHunter',sel,o>=0?'在'+teams[o].name:'')}`;}).join('')}</div>
   <h4 class="dispatch-h">${iconHTML('map')}狩獵區：<b>${rn}</b><small>★ 越多越危險、獎勵越好</small></h4>
   <div class="region-pick-grid">${regions.map(r=>`<div class="region-pick ${r.id===team.region?'on':''}" style="--biome:${r.color}"><button class="rp-body" data-action="dispatchRegion" data-id="${r.id}" aria-pressed="${r.id===team.region}"><i class="rp-em" data-icon="em-${r.id}"></i><span><b>${r.name}</b><small>${r.subtitle}</small><em aria-label="危險度 ${riskStars(r.risk).split('★').length-1}">${riskStars(r.risk)}</em></span>${z2cVerdictTag(z2cFit(r.id,team.ids))}</button><button class="rp-info" data-action="regionInfo" data-id="${r.id}" aria-label="${r.name} 詳細資訊" title="地圖詳細資訊">${iconHTML('scroll')}</button></div>`).join('')}</div>
   <div class="encounter-actions dispatch-go"><button class="pixel-button gold" data-action="startDispatch" ${team.ids.length?'':'disabled'}>${iconHTML('swords')}${team.ids.length?`派遣${z2cFit(team.region,team.ids)?.verdict==='hard'?'（危險）·':''} ${team.ids.length} 位前往${rn}`:'這一組還沒有隊員'}</button></div>`;
 }
 // 2026-10-30:地圖詳細資訊(派遣出征的區域卡右上角捲軸鈕)。數值全部讀 game.regionInfo(),不另外抄。
 if(type==='region'){const rig=game.regionInfo(infoRegion)||game.regionInfo(REGIONS[1].id);const teams=s.dispatchTeams||[];const team=teams[Math.min(dispatchTab,teams.length-1)]||{name:'這一組',ids:[]};const fit=rig.fit(team.ids||[]);
   const FIT={easy:['easy','這組打這裡很輕鬆，打完幾乎不會受傷。'],ok:['ok','剛好打得動，偶爾會掛彩。'],hard:['hard','偏硬，會被打傷；建議先練等或換更弱的區。']};
   const lootRows=Object.entries(rig.lootNow||rig.loot).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<span>${iconHTML(k)}<b>${v}</b><small>${MATERIALS[k]?.name||k}</small></span>`).join('');
   return `<article class="region-detail" style="--biome:${rig.color}">
   ${AS().ui?.['px-region-'+rig.id]?`<div class="region-detail-art" style="background-image:url('${AS().ui['px-region-'+rig.id]}')" aria-hidden="true"></div>`:''}
   <div class="rd-head"><i class="rd-em" data-icon="em-${rig.id}"></i><div><h3>${rig.name}</h3><small>${rig.subtitle}</small><em class="rd-risk" aria-label="危險度 ${rig.riskStars} 顆星">${riskStars(rig.risk)}<b>危險度 ${rig.riskStars}/5${rig.risk>1?` · 金幣經驗 ×${rig.risk}`:''}</b></em></div></div>
   <p class="rd-desc">${rig.description}</p>
   <div class="rd-stats"><div><small>場上魔物</small><b>${rig.alive} 隻</b></div>${(()=>{const tot=rig.hunting+(rig.wanderersHere||0),cap=Math.max(1,Math.round(rig.room??1)),crowd=tot>(rig.room??99)+.5;return `<div class="${crowd?'rd-crowd':''}" title="獵人 ${rig.hunting} 位、流浪英雄 ${rig.wanderersHere||0} 位；這區生怪速度約養得起 ${rig.room} 位，太擠時自主狩獵的獵人會改去別區"><small>狩獵人數 / 容量</small><b>${tot} / ${cap}${crowd?' 太擠':''}</b></div>`;})()}<div><small>首領</small><b>${rig.boss?'出沒中':'未出現'}</b></div><div><small>你目前的位置</small><b>${rig.current?'就在這裡':'不在這區'}</b></div></div>
   <p class="rd-fit ${fit?FIT[fit.verdict][0]:'none'}">${iconHTML('hunter')}<span>${fit?`${team.name}：${FIT[fit.verdict][1]}<small>舒適度 ${fit.comfort} · 這區威脅 ${fit.threat}</small>`:'這一組還沒有隊員，先在上面選人。'}</span></p>
   ${regionProgress(rig.id,s)}<h4 class="dispatch-h">${iconHTML('skull')}出沒魔物</h4>
   <ul class="rd-monsters">${rig.monsters.map(m=>`<li><div><b>${MONSTER_NAME[m.id]||m.id}</b><small>生命 ${m.hpNow??m.hp} · 攻擊 ${m.attackNow??m.attack} · ${m.goldNow??m.gold} 金幣 · ${m.xpNow??m.xp} 經驗</small></div><p>${MONSTER_LORE[m.id]||''}</p></li>`).join('')}</ul>
   <h4 class="dispatch-h">${iconHTML('trade')}每打倒一隻的平均掉落</h4>
   <div class="rd-loot">${lootRows}</div>
   <div class="encounter-actions dispatch-go">${regionFrom==='density'?`<button class="pixel-button" data-action="regionView" data-id="${rig.id}">在地圖上定位</button><button class="pixel-button" data-action="densityFor" data-id="${rig.id}" data-foot="secondary">返回立牌</button>${rig.id!=='village'?`<button class="pixel-button gold" data-action="regionTravel" data-id="${rig.id}" data-foot="primary">前往${rig.name}</button>`:''}`:`<button class="pixel-button gold" data-action="dispatchRegion" data-id="${rig.id}" data-foot="primary">選為${team.name}的目的地</button><button class="pixel-button" data-action="regionInfoClose" data-foot="secondary">返回派遣</button>`}</div></article>`;
 }

 if(type==='offline'){const o=offlineSum||{seconds:0,res:{},kills:0,levels:[]},hh=Math.floor(o.seconds/3600),mm=Math.floor(o.seconds%3600/60),NM={gold:'金幣',gems:'星晶',...Object.fromEntries(Object.entries(MATERIALS).map(([k,m])=>[k,m.name]))};
  // 2026-11-10 T160:離線戰報改成「摘要磚＋資源變化卡」，回來先看到三件大事
  // 2026-11-12:「你的獵人」與「流浪英雄」分兩行(擊倒、打怪拿到的金幣、付給村莊的金幣);資料來自 offlineFinish 的 sum.hunters / sum.wanderers
  const ofWho=(x,cls,ic,name)=>`<div class="offline-kills ${cls}">${iconHTML(ic)}<span>${name}</span><b>擊倒 ${fmt(x.kills||0)} 隻</b>${x.gold!=null?`<span>戰利品 ${fmt(x.gold)} 金 · 付給村莊 ${fmt(x.paid||0)} 金</span>`:''}</div>`;
  const rows=Object.entries(o.res).filter(([,v])=>v).map(([k,v])=>`<div class="material-item ${v<0?'lose':'gain'}">${iconHTML(k)}<div><span>${NM[k]||k}</span><b class="${v<0?'short':''}">${v>0?'+':''}${fmt(v)}</b></div></div>`).join('');
  const gold=o.res.gold||0,timeTxt=`${hh?hh+' 小時\n':''}${mm} 分鐘`;   // 2026-11-18 手機格子窄:在「小時」後面換行,不要斷成「1 小時 1 / 分鐘」
  const tiles=[['離線時間',timeTxt,'scroll'],['擊倒魔物',`${fmt(o.kills)} 隻`,'skull'],[gold<0?'金幣消耗':'金幣增加',`${gold<0?'':"+"}${fmt(gold)}`,'gold']]
    .map(([k,v,ic])=>`<div class="of-tile"><i aria-hidden="true">${iconHTML(ic)}</i><b>${esc(v)}</b><small>${esc(k)}</small></div>`).join('');
  // 2026-11-18「回來先做」:離線服務收入以庫存為上限 → 賣完的商品要補貨;到 Lv.100 的可以轉世;委託可領。按鈕走 nextStepGo(關掉戰報直接開對應面板)
  const todo=[],soldOut=Object.keys(PRODUCTS).filter(k=>(s.stocks[k]||0)<=0),top=s.hunters.filter(h=>h.level>=100&&h.task!=='dungeon'&&h.task!=='arena');
  if(soldOut.length)todo.push(['craft','去補貨',`${soldOut.length===Object.keys(PRODUCTS).length?'商品全部':soldOut.map(k=>PRODUCTS[k].name).join('、')}賣完了，補貨才有服務收入`]);
  if(top.length)todo.push(['rebirth:'+top[0].id,'去轉世',`${top.length} 位獵人到 Lv.100，可以轉世`]);
  if(s.quest.complete&&!s.quest.claimed)todo.push(['quests','去領取',`委託「${s.quest.title}」可以領獎`]);
  const todoHTML=todo.length?`<div class="of-todo"><h3 class="offline-h">回來先做</h3>${todo.map(([act,label,text])=>`<div class="of-todo-row"><span>${esc(text)}</span><button class="pixel-button gold" data-action="nextStepGo" data-act="${esc(act)}">${label}</button></div>`).join('')}</div>`:'';
  // Z2C(規格 m):緞帶標題(CSS)＋3 格摘要＋清單(你的獵人／流浪英雄兩列)＋底部一顆「收下」;村長頭像拿掉,說明縮成一行
  return `<p class="of-note">你不在的時候，村子照常運轉${o.capped?'（離線收益最多計算 8 小時）':''}。</p><div class="of-tiles">${tiles}</div>${todoHTML}<div class="of-list">${ofWho(o.hunters||{kills:o.kills},'of-hu','hunter','你的獵人')}${ofWho(o.wanderers||{kills:o.wanderKills||0},'of-wd','compass','流浪英雄')}${o.dungeon?`<div class="offline-kills of-dg">${iconHTML('dungeon')}<span>地下城</span><b>第 ${o.dungeon.from} 層 → 第 ${o.dungeon.to} 層</b><span>${o.dungeon.active?`小隊在 ${o.dungeon.floor} 層`:'小隊已回村'}</span></div>`:''}${o.trade&&o.trade.qty>0?`<div class="offline-kills of-tr">${iconHTML('trade')}<span>交易所收購</span><b>買進 ${fmt(o.trade.qty)} 份材料</b><span>花費 ${fmt(o.trade.gold)} 金</span></div>`:''}</div><h3 class="offline-h">資源變化</h3><div class="materials-grid">${rows||'<p class="of-empty">村莊資源沒有變化。</p>'}</div>${o.levels.length?`<h3 class="offline-h">獵人成長</h3><ul class="offline-levels">${o.levels.map(l=>`<li>${esc(l.name)} <span>Lv.${l.from}</span> <b>→ Lv.${l.to}</b></li>`).join('')}</ul>`:''}<div class="encounter-actions offline-actions"><button class="pixel-button gold" data-action="offlineOk" data-foot="only">收下</button></div>`;}
 if(type==='dungeon')return z2cDungeonHTML(s);   // Z2C:見 pixel-ui.js 內「Z2C」段
 if(type==='arena')return z2cArenaHTML(s);
 if(type==='result')return z2cResultHTML();
 if(type==='bossconfirm')return z2cBossConfirmHTML();
 if(type==='quests'){const list=game.questList(),cur=s.quest.index,done=i=>i<cur||(i===cur&&s.quest.claimed);   // 2026-10-30 委託改成章節鏈:完成 ✓、目前(進度＋領取)、之後(鎖住、可預覽)
  // 2026-11-09 T103:章節鏈改成時間軸（左側圓章＋往下接的線），獎勵靠左對齊標題、狀態固定在標題右側，
  // 鎖住的章節標鎖頭但保留可預覽的說明；上方橫幅補上「第幾章／已解鎖幾章」。
  const claimable=!!s.quest.complete,unlocked=Math.min(cur+(claimable?1:0)+1,list.length),pct=Math.min(100,s.quest.progress/s.quest.target*100);
  const step=(q,i)=>{const st=done(i)?'done':i===cur?'current':'locked';
   const met=st==='locked'&&(q.progress||0)>=q.target;   // 2026-11-18:之後的章節顯示現況,已達成的標「已達成」(解鎖後可以直接領)
   const tag=st==='done'?'已完成':st==='current'?(claimable?'可領取':'進行中'):met?'已達成':'未解鎖';
   const tagIcon=st==='done'?iconHTML('check',true):st==='locked'?iconHTML('lock',true):'';
   // Z2B(圖鑑 38／規格 k):每個委託一列——標題、目標進度膠囊「x/y」、獎勵；可領取用金棕「領取」鈕，領過的列壓暗＋灰色「已完成」
   const prog=st==='current'?s.quest.progress:st==='done'?q.target:(q.progress||0),pp=st==='current'?pct:st==='done'?100:Math.min(100,prog/q.target*100);
   return `<li class="zq-row ${st}${st==='current'&&claimable?' ready':''}"${st==='current'?' aria-current="step"':''}><span class="zq-num" aria-hidden="true">${st==='done'?'✓':String(i+1).padStart(2,'0')}</span><div class="zq-body"><h3>${q.title}</h3><p>${q.description}</p><div class="zq-line"><div class="zq-cap" role="progressbar" aria-valuemin="0" aria-valuemax="${q.target}" aria-valuenow="${prog}" aria-label="${q.title}進度"><span style="width:${pp.toFixed(1)}%"></span><b>${fmt(prog)}/${fmt(q.target)}</b></div><div class="cost zq-reward"><small>獎勵</small>${costs(q.reward)}</div>${st==='current'?'':`<em class="zq-tag ${st}${met?' met':''}">${tagIcon}${tag}</em>`}</div></div>${st==='current'?`<div class="zq-side">${claimable?'<button class="pixel-button gold zq-claim" data-action="quest">領取</button>':(g=>g?`<button class="pixel-button zq-claim zq-go" data-action="questGo">${esc(g.label)}</button>`:'<button class="pixel-button gold zq-claim" data-action="quest" disabled>進行中</button>')(Z2C.questGo?.(s))}</div>`:''}</li>`;};
   const sep=t=>`<li class="z2b-sep" role="separator" aria-label="${t}"><span>${t}</span></li>`;
  const doneN=list.filter((_,i)=>done(i)).length;
  const head=`<div class="qs-banner hv-sumline"><div class="qs-meta"><span>第 <b>${Math.min(cur+1,list.length)}</b> 章／共 ${list.length} 章</span>${unlocked<list.length?`<span>已解鎖 <b>${unlocked}</b> 章</span>`:''}${s.quest.claimed?'<span>全部章節完成</span>':claimable?'<span class="qs-ready">本章獎勵可領取</span>':''}</div><div class="qs-prog" aria-hidden="true"><i style="width:${Math.round(doneN/Math.max(1,list.length)*100)}%"></i></div></div>`;
  const grp=f=>list.map((q,i)=>f(i)?step(q,i):'').join('');
  const nowH=grp(i=>!done(i)&&i===cur),laterH=grp(i=>i>cur),doneH=list.map((q,i)=>done(i)?step(q,i):'').reverse().join('');   // 2026-11-18:已完成改成最新的在上面(後期 17 章往下滑才看得到剛完成的)
  return `${head}<ol class="quest-chain">${list.length?(nowH?sep('進行中')+nowH:'')+(laterH?sep('之後的章節')+laterH:'')+(doneH?sep('已完成')+doneH:''):emptyState('目前沒有新的委託','完成手上的章節就會解鎖下一章')}</ol>`;}
 if(type==='inventory'){
   // 2026-11-25 鐵匠鋪貨架:每個配方×階級一格(全名＋階級),只列有庫存的;key = `配方@階`
   const SHELF={};for(const r0 of RECIPES)for(const g of GEAR_TIERS){const q=s.gearStock?.[r0.id]?.[g.tier]||0;if(q>0){const r=gearAt(r0,g.tier);SHELF[`${r0.id}@${g.tier}`]={rid:r0.id,tier:g.tier,name:gearFullName(r0,g.tier),price:r.price,q};}}
   const stock=id=>SHELF[id]?SHELF[id].q:(s[id]??s.stocks?.[id]??(s.gearStock?.[id]!=null?gearStockTotal(id):0));   // 裝備 = 各階合計
   const GOODS={food:{name:'香烤麵包',price:12},drink:{name:'莓果飲品',price:10},bed:{name:'舒適床鋪',price:14},bandage:{name:'亞麻繃帶',price:10}};
   // 六件裝備的倉庫格:名稱/單價直接從鍛造配方推導(之後改配方,倉庫不用再維護一份)
   const GEAR=Object.fromEntries(RECIPES.map(r=>[r.id,{name:r.name,price:r.price}]));
   // 六件防具沒有各自的圖示;倉庫統一用防禦(盾)／武器用劍的圖示,避免空的圖示框
   const gearIcon=id=>GEAR[id]?(RECIPES.find(r=>r.id===id).type==='weapon'?'swords':'def'):id;   // 五份武器配方 → 劍圖示
   const ALL={...MATERIALS,...GOODS,...GEAR};
   // 用途與來源都從資料推導（改配方或掉落表時，說明會跟著變，不用另外維護文案）
   const USES=[...Object.values(PRODUCTS),...RECIPES].map(p=>({name:p.name,cost:p.cost||{}}));
   const usesOf=id=>USES.filter(u=>(u.cost[id]||0)>0).map(u=>u.name);
   const sourcesOf=id=>Object.keys(ENEMIES).filter(t=>(ENEMIES[t].drops||{})[id]>0).map(t=>MONSTER_NAME[t]||t);
   const held=id=>stock(id)>0;
   const groups=[['材料',Object.keys(MATERIALS),'交易所收購'],['生活物資',Object.keys(GOODS),'在自己的設施製作'],['鐵匠鋪貨架（待售給獵人）',Object.keys(SHELF),'鐵匠鋪製作']];
   const goTo=id=>SHELF[id]?['craftGearTab','鍛造']:MATERIALS[id]?['trade','收購']:GOODS[id]?['craft','製作']:['craftGearTab','鍛造'];
   // Z2B(規格 f 節):倉庫改方格——圖示框＋右下數量＋白色名稱；點一格 → 上方詳情框寫用途／來源／單價並給「前往」鈕(觸控沒有 hover tooltip;格子的 data-tip-* 留給 Z2A 的共用 tooltip 接點)
   const infoOf=(id,fb)=>{if(SHELF[id]){const sh=SHELF[id],[act,lab]=goTo(id);return {m:{name:sh.name,price:sh.price},q:sh.q,act,lab,use:'獵人回村時用個人金幣購買；比身上更高階就會換新',from:'鐵匠鋪製作（製作 → 裝備製作）'};}const m=ALL[id],u=usesOf(id),src=sourcesOf(id),[act,lab]=goTo(id);return {m,q:stock(id),act,lab,use:u.length?u.join('、'):'交易或村莊委託',from:src.length?src.join('、'):fb};};
   const invIconHTML=id=>SHELF[id]?craftGearIconHTML(SHELF[id].rid,32,'anvil'):GEAR[id]?craftGearIconHTML(id,32,gearIcon(id)):iconHTML(gearIcon(id));
   const itemRow=(id,fb)=>{const {m,q,use,from}=infoOf(id,fb);
     return `<li class="stock-item hv-sq${q>0?'':' empty'}${invPick===id?' sel':''}" data-id="${id}"><button type="button" class="sq-btn" data-action="invPick" data-id="${id}" aria-pressed="${invPick===id}" aria-label="${m.name}，庫存 ${q}，點一下看用途與來源" data-tip-title="${m.name}" data-tip-qty="${q}" data-tip-price="${m.price}" data-tip-use="${esc(use)}" data-tip-from="${esc(from)}"><span class="sq-ic">${invIconHTML(id)}<em class="sq-q">${fmt(q)}</em></span><b class="si-nm">${m.name}</b></button></li>`;};
   const pickFb=groups.flatMap(([,ids,fb])=>ids.map(x=>[x,fb])).find(([x])=>x===invPick);
   const detail=pickFb?(()=>{const {m,q,act,lab,use,from}=infoOf(pickFb[0],pickFb[1]);return `<div class="z1-inset z2b-detail" data-id="${pickFb[0]}"><div class="zd-head"><i class="z2b-ic">${invIconHTML(pickFb[0])}</i><div class="zd-t"><b class="si-nm">${m.name}</b><small class="si-num">庫存 <b>${fmt(q)}</b> · 單價 ${m.price} 金</small></div><button class="pixel-button hv-sec" data-action="${act}" aria-label="${m.name}：前往${lab}">前往${lab}</button></div><small class="si-use">用途：${esc(use)}</small><small class="si-src">來源：${esc(from)}</small></div>`;})():`<div class="z1-inset z2b-detail empty"><small>點一下物品，看它的用途與來源。</small></div>`;
   const totalKinds=Object.keys(ALL).filter(held).length,totalPieces=Object.keys(ALL).reduce((n,id)=>n+stock(id),0);   // 2026-11-25 裝備實例(gearStorage)搬到「裝備倉庫」頁,這裡只算材料／物資／鍛造成品

   return `<div class="stock-summary hv-sumline" role="status"><span>持有 <b>${totalKinds}</b>／${Object.keys(ALL).length} 種</span><span>共 <b>${totalPieces}</b> 件</span><small>數量 0 的淡化顯示</small></div>${detail}
   ${groups.map(([title,ids,fb],gi)=>gi===2?`<section class="stock-sec stock-shelf" data-sec="${title}"><h4 class="stock-sec-h"><span>${title}</span><small>${ids.length?`共 ${ids.reduce((n,x)=>n+SHELF[x].q,0)} 件`:'目前沒有庫存'}</small></h4><p class="shelf-note">獵人會自己來買；想直接給人穿 → <button type="button" class="eq-link" data-action="equipstore">裝備倉庫</button></p>${ids.length?`<ul class="stock-list hv-sq-grid">${ids.map(x=>itemRow(x,fb)).join('')}</ul>`:`<p class="shelf-empty">貨架是空的。到「製作 → 裝備製作」鍛造後，成品會放在這裡等獵人來買。</p>`}</section>`:`<section class="stock-sec" data-sec="${title}"><h4 class="stock-sec-h"><span>${title}</span><small>${ids.filter(held).length}／${ids.length} 種</small></h4><ul class="stock-list hv-sq-grid">${ids.map(x=>itemRow(x,fb)).join('')}</ul></section>`).join('')}`;
 }
 if(type==='equipstore'){   // 2026-11-25 裝備倉庫:一次看一位獵人(◀ ▶／點名字挑人)＋他的七格裝備＋倉庫裡的裝備(可裝備的在前、不能用的另列);整理設定收在最底下
   const GEAR_LABEL={weapon:'武器',helm:'頭盔',chest:'胸甲',belt:'腰帶',legs:'腿甲',boots:'靴子',gloves:'手套'};
   const STAT_NM={atk:'攻擊',hp:'生命',def:'防禦'};
   const gearStats=it=>{const st=it.stats||{},p=[];if(st.atk)p.push('攻擊 +'+st.atk);if(st.hp)p.push('生命 +'+st.hp);if(st.def)p.push('防禦 +'+st.def);return p.join(' · ')||'沒有數值加成';};
   const salvageText=it=>Object.entries(it.salvage||{}).map(([k,n])=>`${(MATERIALS[k]||{}).name||k}×${n}`).join('、')||'—';
   const shortNm=it=>String(it.name).replace(/\s*[ⅠⅡⅢⅣⅤ]$/,'');
   const storedGear=Array.isArray(s.gearStorage)?s.gearStorage:[];
   const roster=(s.hunters||[]).filter(Boolean);
   const bulk=game.bulkStoredGear?game.bulkStoredGear('sell',true):{count:0},bulkS=bulk.count?game.bulkStoredGear('salvage',true):null;
   const bulkBar=bulk.count?`<div class="gear-bulk" role="group" aria-label="倉庫一鍵整理"><span class="gear-bulk-tx">舊裝備 <b>${bulk.count}</b> 件（初始裝備、低於第 ${GEAR_TIERS[bulk.top-1]?.numeral||bulk.top} 階的鍛造裝備）</span><button class="pixel-button" data-action="gearBulk" data-kind="sell" data-zb="gold">全部賣出<small>${iconHTML('gold',true)}${fmt(bulk.gold)}</small></button><button class="pixel-button quiet" data-action="gearBulk" data-kind="salvage" title="${esc(Object.entries(bulkS?.mats||{}).map(([k,n])=>(MATERIALS[k]?.name||k)+'×'+n).join('、'))}">全部分解</button></div>`:'';
   const aj=s.autoJunk||'off',ajDone=s.counts?.autoJunk||0;
   const AJ_NM={off:'放進倉庫',sell:'自動賣出',salvage:'自動分解'};
   const autoBar=game.setAutoJunk?`<div class="gear-auto" role="radiogroup" aria-label="換下或撿到的舊裝備自動整理"><span class="gear-bulk-tx">換下或撿到的舊裝備${ajDone?`<small>（已自動整理 ${fmt(ajDone)} 件）</small>`:''}</span>${[['off','放進倉庫'],['sell','自動賣出'],['salvage','自動分解']].map(([m,l])=>`<button type="button" class="pixel-button${aj===m?'':' quiet'}" role="radio" aria-checked="${aj===m}" data-action="gearAuto" data-mode="${m}"${m==='sell'&&aj===m?' data-zb="gold"':''}>${l}</button>`).join('')}</div>`:'';
   // 整理設定:預設收起(一列摘要),展開才顯示自動整理與一鍵整理
   const tidy=(autoBar||bulkBar)?`<div class="eq-tidy${equipTidyOpen?' open':''}"><button type="button" class="eq-tidy-h" data-action="equipTidy" aria-expanded="${equipTidyOpen}"><b>整理設定</b><small>換下的舊裝備：${AJ_NM[aj]||AJ_NM.off}${bulk.count?` · 可清理 ${bulk.count} 件`:''}</small><i aria-hidden="true">${equipTidyOpen?'▲':'▼'}</i></button>${equipTidyOpen?`<div class="eq-tidy-b">${autoBar}${bulkBar}</div>`:''}</div>`:'';
   if(!roster.length)return `<section class="eq-empty">${iconHTML('hunter')}<b>村裡還沒有獵人</b><p>先招募一位獵人，才能替他穿裝備。倉庫裡的裝備（${storedGear.length} 件）會在這裡等他。</p><button class="pixel-button gold" data-action="hunters">去獵人名冊</button></section>${tidy}`;
   let idx=roster.findIndex(x=>x.id===equipHid);if(idx<0){idx=0;equipHid=roster[0].id;}
   const h=roster[idx],cls=CLASSES.find(c=>c.id===h.classId),rar=RARITIES.find(v=>v.id===h.rarity);
   const slots=gearSetSlots(),worn=slots.filter(sl=>h.gear&&gearItemView(h.gear[sl])).length;
   const okTypes=(CLASS_WEAPON_TYPES[h.classId]||[]).map(t=>WEAPON_TYPES[t]||t).join('、');
   const slotHTML=slots.map(sl=>{const g=h.gear&&h.gear[sl],it=g&&gearItemView(g);
     return `<li class="eq-slot${it?'':' empty'}" data-slot="${sl}" title="${esc(it?it.name+'：'+gearStats(it):GEAR_LABEL[sl]+'（空）')}"><span class="eq-slot-ic">${it?(gearIconHTML(it,32)||iconHTML(sl==='weapon'?'swords':'def')):`<b aria-hidden="true">${GEAR_TEXT[sl]}</b>`}${it&&it.numeral?`<em class="eq-slot-t" aria-hidden="true">${it.numeral}</em>`:''}</span><small class="eq-slot-l">${GEAR_LABEL[sl]}</small><span class="eq-slot-n">${it?esc(shortNm(it)):'空'}</span></li>`;}).join('');
   const pickStrip=equipPickOpen?`<div class="eq-pick" role="listbox" aria-label="選一位獵人">${roster.map(x=>`<button type="button" class="eq-pk${x.id===h.id?' on':''}" role="option" aria-selected="${x.id===h.id}" data-action="equipPick" data-hid="${x.id}" aria-label="${esc(x.name)} Lv.${x.level}"><img data-portrait="${x.id}" alt=""><small>${esc(x.name)}</small></button>`).join('')}</div>`:'';
   const switcher=`<div class="eq-who" data-hid="${h.id}" data-rarity="${h.rarity}" style="--rarity:${rar?.color||'#d3cab2'}"><button type="button" class="eq-nav" data-action="equipNav" data-d="-1" aria-label="上一位獵人"${roster.length<2?' disabled':''}><i aria-hidden="true">◀</i></button><button type="button" class="eq-card" data-action="equipPickToggle" aria-expanded="${equipPickOpen}" aria-label="${esc(h.name)}，點一下挑選獵人"><span class="eq-art"><img data-portrait="${h.id}" alt=""></span><span class="eq-info"><b class="eq-name">${esc(h.name)}<i class="eq-caret" aria-hidden="true">${equipPickOpen?'▲':'▼'}</i></b><span class="eq-sub">Lv.${h.level} ${cls?.name||''}<em class="eq-rar">${rar?.name||'普通'}</em></span><small class="eq-pos">第 ${idx+1}／${roster.length} 位 · 已穿 ${worn}／${slots.length} 件</small></span></button><button type="button" class="eq-nav" data-action="equipNav" data-d="1" aria-label="下一位獵人"${roster.length<2?' disabled':''}><i aria-hidden="true">▶</i></button></div>${pickStrip}<ul class="eq-slots" aria-label="${esc(h.name)}身上的裝備">${slotHTML}</ul>${okTypes?`<p class="eq-hint">${cls?.name||'這個職業'}能用的武器：<b>${okTypes}</b>；防具不限職業。</p>`:''}`;
   // 同樣的裝備疊成一列(×N);按鈕作用在最新的那一件(跟以前倉庫頁一樣)
   const stacks=new Map();for(let i=0;i<storedGear.length;i++){const g=storedGear[i],it=gearItemView(g);if(!it)continue;const key=it.name+'|'+it.slot+'|'+gearStats(it)+'|'+it.sell;const st=stacks.get(key);if(st){st.n++;st.g=g;st.it=it;}else stacks.set(key,{g,it,n:1,first:i});}
   const slotRank=Object.fromEntries(slots.map((x,i)=>[x,i]));
   // 這件放到某位獵人身上,各項數值變多少(只算他能用的);bestOf = 全村最划算的一位
   const diffFor=(hh,it)=>{const cur=hh.gear&&hh.gear[it.slot],cv=cur&&gearItemView(cur),cs=(cv&&cv.stats)||{},ns=it.stats||{};return {empty:!cv,atk:(ns.atk||0)-(cs.atk||0),hp:(ns.hp||0)-(cs.hp||0),def:(ns.def||0)-(cs.def||0)};};
   const scoreOf=d=>d.atk+d.def+d.hp/5;
   const bestOf=(g,it)=>{let b=null;for(const hh of roster){if(!canWield(g.itemId,hh.classId))continue;const d=diffFor(hh,it),v=scoreOf(d);if(v>0&&(!b||v>b.v))b={h:hh,d,v};}if(b){const ks=['atk','def','hp'].map(k=>[k,k==='hp'?b.d.hp/5:b.d[k]]).sort((x,y)=>y[1]-x[1]);b.k=ks[0][0];b.n=b.d[b.k];}return b;};
   let list=[...stacks.values()].map(x=>({...x,can:canWield(x.g.itemId,h.classId),best:bestOf(x.g,x.it)}));
   const pcs=a=>a.reduce((n,x)=>n+x.n,0),nUsable=pcs(list.filter(x=>x.can)),nOther=pcs(list.filter(x=>!x.can));
   if(equipOnlyUsable)list=list.filter(x=>x.can);
   list.sort((a,b)=>(b.can-a.can)||((slotRank[a.it.slot]??9)-(slotRank[b.it.slot]??9))||(b.first-a.first));
   const delta=it=>{const d=diffFor(h,it);if(d.empty)return `<em class="eq-cmp up">空格・直接穿上</em>`;
     const ch=['atk','hp','def'].filter(k=>d[k]);if(!ch.length)return `<em class="eq-cmp same">已穿同款</em>`;
     return ch.map(k=>`<em class="eq-cmp ${d[k]>0?'up':'down'}">${STAT_NM[k]} ${d[k]>0?'▲':'▼'}${Math.abs(d[k])}</em>`).join('');};
   const bestLine=(can,best)=>{if(!best)return `<small class="eq-best none">目前沒有獵人用得上</small>`;
     const lab=`${esc(best.h.name)} ${STAT_NM[best.k]} ▲${Math.round(best.n)}`;
     return best.h.id===h.id?`<small class="eq-best me">最適合：<b>${lab}</b>（就是他）</small>`:`<button type="button" class="eq-best" data-action="equipPick" data-hid="${best.h.id}" aria-label="看${esc(best.h.name)}的裝備，穿上這件${STAT_NM[best.k]}可增加 ${Math.round(best.n)}">最適合：<b>${lab}</b><i aria-hidden="true">›</i></button>`;};
   const askAttr=(it,best)=>{const why=[];if((it.grade||1)>=2)why.push(`${it.numeral||'Ⅱ'} 階以上的好裝備`);if(best)why.push(`${best.h.name}穿上能${STAT_NM[best.k]} ▲${Math.round(best.n)}`);return why.length?` data-ask="${esc(`${it.name}：${why.join('，')}。`)}"`:'';};
   const rowHTML=({g,it,n,can,best})=>{const ask=askAttr(it,best);
     return `<li class="z2b-row gear-store-row eq-row${can?' can':' cant'}" data-uid="${g.uid}" data-can="${can?1:0}"><i class="z2b-ic">${gearIconHTML(it,32)||iconHTML(it.slot==='weapon'?'swords':'def')}</i><div class="z2b-rb"><b class="z2b-nm">${esc(it.name)}${n>1?`<em class="gs-n">×${n}</em>`:''}<em class="eq-tag ${can?'ok':'no'}">${can?'可裝備':`${esc(cls?.name||'此職業')}不能用${WEAPON_TYPES[it.wtype]?'・'+WEAPON_TYPES[it.wtype]+'類':''}`}</em></b><div class="eq-st"><span class="eq-slotl">${GEAR_LABEL[it.slot]||it.slot}</span><span class="eq-stat">${gearStats(it)}</span>${can?delta(it):''}</div>${bestLine(can,best)}</div><div class="z2b-act eq-act">${can?`<button type="button" class="pixel-button eq-wear" data-action="gearStoreEquip" data-uid="${g.uid}" data-hid="${h.id}" data-zb="olive" aria-label="讓${esc(h.name)}穿上${esc(it.name)}">穿上</button>`:''}<button type="button" class="pixel-button eq-sell" data-action="gearStoreSell" data-uid="${g.uid}" data-zb="red"${ask} title="出售得 ${it.sell} 金" aria-label="出售${esc(it.name)}，得 ${it.sell} 金">出售<small>${it.sell} 金</small></button><button type="button" class="pixel-button eq-salv" data-action="gearStoreSalvage" data-uid="${g.uid}"${ask} title="分解得 ${esc(salvageText(it))}" aria-label="分解${esc(it.name)}，得 ${esc(salvageText(it))}">分解</button></div></li>`;};
   const usableRows=list.filter(x=>x.can).map(rowHTML).join(''),otherList=list.filter(x=>!x.can);
   const otherRows=otherList.length?`<li class="eq-div" role="separator"><span>${esc(h.name)}（${cls?.name||'此職業'}）不能用 · ${pcs(otherList)} 件</span></li>${otherList.map(rowHTML).join('')}`:'';
   const rows=usableRows+otherRows;
   const filt=storedGear.length?`<button type="button" class="eq-filter${equipOnlyUsable?' on':''}" data-action="equipUsable" role="switch" aria-checked="${equipOnlyUsable}"><i aria-hidden="true"></i>只看 ${esc(h.name)} 能用的</button>`:'';
   const emptyMsg=!storedGear.length?`<p class="gear-store-empty eq-none">倉庫裡沒有裝備。${aj==='off'?'獵人在鐵匠鋪換新裝時換下的舊件、':''}地下城寶箱、委託獎勵的裝備，以及在獵人「裝備」頁「卸下」的裝備，都會放在這裡。</p>`:!list.length?`<p class="gear-store-empty eq-none">倉庫裡的 ${storedGear.length} 件裝備，${esc(h.name)}都用不了。按 ▶ 換一位獵人看看。</p>`:'';
   return `<section class="eq-hunter">${switcher}</section><section class="stock-sec gear-store" data-sec="裝備倉庫"><h4 class="stock-sec-h"><span>倉庫裡的裝備</span><small>${storedGear.length?`可用 ${nUsable} · 其他 ${nOther}`:'0 件'}</small></h4>${filt}${rows?`<ul class="z2b-rows eq-list">${rows}</ul>`:emptyMsg}${tidy}</section>`;
 }
 if(type==='codex'){
  const MON=Object.keys(ENEMIES).filter(k=>k!=='boss');
  const sections=Object.keys(REGION_MONSTERS).map(rid=>{
    const ids=REGION_MONSTERS[rid]||[];
    const rg=REGIONS.find(r=>r.id===rid);
    return {rid,name:rg?.name||rid,sub:rg?.subtitle||'',ids};
  }).filter(x=>x.ids.length);
  const seen=s.codex||{};   // T126:擊殺過的魔物才有記錄
  const card=(id)=>{
    const e=ENEMIES[id]||{}, n=seen[id]||0;
    if(!n){ // 還沒打過:剪影＋問號，數值與掉落先不揭露
      return `<li class="cx-card unknown" data-id="${id}"><img class="cx-face" data-mface="${id}" alt="" loading="lazy"><div class="cx-body"><b class="cx-nm">？？？</b><p class="cx-lore">還沒遇見。擊殺一隻後才記錄數值與掉落。</p></div></li>`;
    }
    const drops=Object.keys(e.drops||{}).map(k=>`<span class="cx-drop">${iconHTML(k)}<b>${esc(MATERIALS[k]?.name||k)}</b><i>×${e.drops[k]}</i></span>`).join('');
    return `<li class="cx-card seen" data-id="${id}"><img class="cx-face" data-mface="${id}" alt="" loading="lazy"><div class="cx-body"><b class="cx-nm">${esc(MONSTER_NAME[id]||id)}<em class="cx-kill" title="累計擊殺">×${fmt(n)}</em></b><div class="cx-stats"><span>生命 ${fmt(e.hp)}</span><span>攻擊 ${fmt(e.attack)}</span><span>金幣 ${fmt(e.gold)}</span><span>經驗 ${fmt(e.xp)}</span></div><div class="cx-drops">${drops}</div><p class="cx-lore">${esc(MONSTER_LORE[id]||'')}</p></div></li>`;
  };
  const bossCard=(()=>{const e=ENEMIES.boss||{},bn=seen.boss||0;const drops=bn?Object.keys(e.drops||{}).map(k=>`<span class="cx-drop">${iconHTML(k)}<b>${esc(MATERIALS[k]?.name||k)}</b><i>×${e.drops[k]}</i></span>`).join(''):'<span class="cx-drop unknown-drop">還沒記錄掉落</span>';const st=bn?`<span>生命 ${fmt(e.hp)}</span><span>攻擊 ${fmt(e.attack)}</span><span>金幣 ${fmt(e.gold)}</span><span>經驗 ${fmt(e.xp)}</span>`:['生命 ?','攻擊 ?','金幣 ?','經驗 ?'].map(x=>`<span>${x}</span>`).join('');return `<li class="cx-card boss${bn?'':' unknown'}" data-id="boss"><img class="cx-face" data-mface="boss" alt="" loading="lazy"><div class="cx-body"><b class="cx-nm">${bn?esc(MONSTER_NAME.boss||'地圖首領'):'？？？'}${bn?`<em class="cx-kill">×${fmt(bn)}</em>`:''}</b><div class="cx-stats">${st}</div><div class="cx-drops">${drops}</div><p class="cx-lore">${bn?esc(MONSTER_LORE.boss||'全區最強的存在，需要一隊人馬才打得下來。'):'擊殺一隻後才會記錄。'}</p></div></li>`;})();
  const allIds=[...MON,'boss'], seenN=allIds.filter(id=>(seen[id]||0)>0).length, killN=allIds.reduce((n,id)=>n+(seen[id]||0),0);
  return `<div class="cx-summary hv-sumline" role="status"><span class="cx-s">已記錄 <b>${seenN}</b>／<b>${allIds.length}</b> 種</span><span class="cx-s">累計擊殺 <b>${fmt(killN)}</b> 次</span><span class="cx-s"><b>${sections.length}</b> 個區域</span><span class="cx-prog" aria-hidden="true"><i style="width:${Math.round(seenN/Math.max(1,allIds.length)*100)}%"></i></span></div><p class="hv-note">打過才會記錄；數值是基礎值（實際隨難度與生態區危險度加成，越危險的區金幣與經驗越多），掉落是每次擊殺的基底數量。</p>${sections.map(x=>`<section class="cx-sec"><h4 class="cx-h"><span>${esc(x.name)}</span><small>${esc(x.sub)} · ${x.ids.length} 種</small></h4><ul class="cx-list">${x.ids.map(card).join('')}</ul></section>`).join('')}<section class="cx-sec"><h4 class="cx-h"><span>首領</span><small>地圖深處</small></h4><ul class="cx-list">${bossCard}</ul></section>`;
 }
 if(type==='difficulty'){
   // 跟 game.setDifficulty() 同一個算法：全體獵人的轉世次數加總（不是村莊的 counts.rebirths）
   const rb=s.hunters.reduce((n,h)=>n+(h.rebirths||0),0);
   return `<p class="hv-note">難度提高魔物生命，攻擊漲得更快，獵人也更敢冒險，剛解鎖時可能被打倒；金幣與經驗小幅加成，野外材料掉落大幅增加（地下城與競技場不受影響）。切換會重生整張地圖的魔物。</p>
   <div class="diff-summary" role="status">目前 <b>${DIFFICULTIES[s.difficulty].name}</b> · 累計轉世 <b>${rb}</b> 次</div>${(()=>{const d=game.downReport();return d.count?`<div class="diff-downs" role="status">最近 4 分鐘遊戲時間倒下 <b>${d.count}</b> 次${d.place?` · 多在 <b>${esc(d.place)}</b>`:''}${d.foe?` · 最常被 <b>${esc(d.foe)}</b> 打倒`:''}${d.count>=3&&s.difficulty>0?'<small>覺得太危險，可以選低一級的難度。</small>':''}</div>`:'';})()}
   <div class="difficulty-grid">${DIFFICULTIES.map((d,i)=>{const cur=s.difficulty===d.id,locked=!cur&&rb<d.rebirths;return `<article class="difficulty-card ${cur?'current':''}${locked?' locked':''}" data-diff="${d.id}" ${locked?'aria-disabled="true"':''}><i>${iconHTML('diff-'+Math.min(4,i))}</i><h3>${d.name}${cur?'<em class="diff-now">目前</em>':''}</h3>
     <dl class="diff-stats"><div><dt>魔物生命</dt><dd>×${d.mult}</dd></div><div><dt>魔物攻擊</dt><dd>×${d.atk}</dd></div><div><dt>金幣・經驗</dt><dd>×${(Math.sqrt(d.mult)).toFixed(2)}</dd></div><div><dt>材料掉落</dt><dd>×${+(1+(d.mult-1)/2).toFixed(2)}</dd></div></dl>
     <small class="diff-gate ${locked?'short':''}">${locked?`需要累計轉世 ${d.rebirths} 次（目前 ${rb}）`:`轉世 ${d.rebirths} 次解鎖`}</small>
     <button class="pixel-button ${cur?'gold':''}" data-action="setDifficulty" data-id="${d.id}"${cur?' data-zb-cur="1"':''} ${cur||locked?'disabled':''}>${cur?'目前難度':locked?'<i class="hv-lock" aria-hidden="true"></i>未解鎖':'選擇'}</button></article>`;}).join('')}</div>`;
 }
 // 2026-10-30:狩獵區中央立牌點開的切換畫面。版面照「狩獵難度」頁面,但切的是這一區同時出現的魔物數量。
 if(type==='density'){const d=game.regionDensity(densityRegion);if(!d)return '<p class="modal-note">這裡沒有立牌。</p>';
   const info=game.regionInfo(d.regionId),alive=info?info.alive:0,hunting=info?info.hunting:0;
   return `<p class="modal-intro">${d.name}正中央的木頭立牌。三級只改變這一區<strong>同時出現的魔物數量</strong>與補怪速度，魔物本身不會變強、獎勵也不會變。</p>
   <div class="density-grid">${d.levels.map(l=>`<article class="difficulty-card density-card ${d.level===l.level?'current':''}" style="--density:${l.level}"><b class="roman" aria-hidden="true">${l.numeral}</b><h3>${l.name}</h3><small>這一區同時最多 <b>${l.cap}</b> 隻<br>其他區 ${l.other} 隻 · 每 ${l.every} 秒補一隻</small><button class="pixel-button ${d.level===l.level?'gold':''}" data-action="setDensity" data-level="${l.level}"${d.level===l.level?' data-zb-cur="1"':''} ${d.level===l.level?'disabled':''}>${d.level===l.level?'目前等級':'切換'}</button></article>`).join('')}</div>
   <div class="density-now">${iconHTML('skull')}<span>現在場上 <b>${alive}</b> 隻魔物${hunting?`、<b>${hunting}</b> 位獵人在這區`:''}<small>立牌上的數字就是目前等級（${d.numeral}）；切換後下一次補怪就生效。</small></span></div>
   <button class="pixel-button density-detail" data-action="regionDetail" data-id="${d.regionId}">區域詳情：出沒魔物、探索進度</button><button class="pixel-button gold" data-action="regionTravel" data-id="${d.regionId}" data-foot="primary">前往${d.name}</button>`;
 }
 if(type==='settings'){const o=(s.settings||{}),on=settingsOpen,seg=(key,opts,cur)=>`<div class="seg" data-key="${key}">${opts.map(([v,label])=>`<button class="pixel-button ${String(cur)===String(v)?'gold':''}" data-action="setOpt" data-key="${key}" data-value="${v}" aria-pressed="${String(cur)===String(v)}">${label}</button>`).join('')}</div>`;
   const summary=[`畫質 ${o.quality==='low'?'低':'高'}`,`解析度 ${o.dpr==='auto'?'自動':(o.dpr||'1.5')+'x'}`,`幀率 ${o.fps===60?60:30}`,`影子 ${o.shadows===false?'關':'開'}`].join(' · ');
   const feelSummary=[`震動 ${o.shake===false?'關':'開'}`,`音效 ${sfxMuted()?'關':'開'}`].join(' · ');
   return `<section class="set-sec" data-sec="perf"><h4 class="set-sec-h"><span>畫面與效能</span><small>${summary}</small></h4><div class="setting-row"><div><strong>畫質與效能</strong><small>手機發燙就往下調：解析度 → 幀率 → 動態影子，這三個最吃電。</small></div><button class="pixel-button" data-action="toggleQuality" aria-expanded="${on}">${on?'收起':'調整'}</button></div>
   ${on?`<div class="setting-group">
   <div class="setting-row"><div><strong>畫質</strong><small>高：粒子、光暈、雪都開。低：關掉粒子與光暈，最省電。</small></div>${seg('quality',[['high','高'],['low','低']],o.quality||'high')}</div>
   <div class="setting-row"><div><strong>解析度</strong><small>畫布像素密度。1x 最省電（像素圖邊緣較粗）；2x 最清楚但最燙。</small></div>${seg('dpr',[['auto','自動'],['1','1x'],['1.5','1.5x'],['2','2x']],o.dpr||'auto')}</div>
   <div class="setting-row"><div><strong>幀率</strong><small>30 幀省電；60 幀順暢，但耗電與發熱大約多一倍。</small></div>${seg('fps',[[30,'30'],[60,'60']],o.fps||30)}</div>
   <div class="setting-row"><div><strong>動態影子</strong><small>角色與建築的投影。關掉可少一層貼圖，手機明顯更涼。</small></div>${seg('shadows',[[1,'開'],[0,'關']],o.shadows===false?0:1)}</div>
    
     </div>`:''}
   ${uiScaleRow()}</section>
    <section class="set-sec" data-sec="feel"><h4 class="set-sec-h"><span>手感與聲音</span><small>${feelSummary}</small></h4>
    <div class="setting-row"><div><strong>鏡頭震動</strong><small>重擊、暴擊、技能命中時畫面晃一下；暈眩或不想要就關掉。</small></div>${seg('shake',[[1,'開'],[0,'關']],o.shake===false?0:1)}</div>
    <div class="setting-row"><div><strong>音效</strong><small>命中、暴擊、技能、金幣、升級都由程式即時合成（沒有音檔）；背景風聲會跟著區域換，晚上（照你裝置的時間）多些蟲鳴；鐵匠鋪、酒館、交易所、大廳也各有自己的聲音。關掉就完全靜音。</small></div>${seg('sound',[[1,'開'],[0,'關']],sfxMuted()?0:1)}</div></section>
    <section class="set-sec" data-sec="control"><h4 class="set-sec-h"><span>操控與教學</span><small>自己下去玩</small></h4>
    <div class="setting-row"><div><strong>手動操控</strong><small>自己下去玩：手機是左下搖桿走路、右下大顆按鈕出手，鏡頭一直把角色固定在畫面中央；電腦用 WASD／方向鍵移動、空白鍵或 J 出手。</small></div><button class="pixel-button" data-action="pilotLab">選擇角色</button></div></section><section class="set-sec" data-sec="data"><h4 class="set-sec-h"><span>存檔與資料</span><small>備份、匯入、重置、開發者工具</small></h4>
   <div class="setting-row dev-row"><div><strong>開發者作弊</strong><small>只在設定頁出現，直接改存檔（不影響模擬規則）。測試數值、跳過等待、驗收畫面時用。</small></div><button class="pixel-button" data-action="toggleDev" aria-expanded="${devOpen}">${devOpen?'收起':'打開'}</button></div>
   ${devOpen?`<div class="setting-group dev-group"><p class="setting-note">⚠ 會直接改目前存檔。想保留原本進度，先用下面的「匯出存檔」備份。</p>
   <div class="cheat-grid">
     <button class="pixel-button" data-action="cheat" data-id="resources">資源滿載<small>金幣／星晶／素材 +500</small></button>
     <button class="pixel-button" data-action="cheat" data-id="levels">全員 +10 級<small>上限 Lv.100，順便回滿血</small></button>
     <button class="pixel-button" data-action="cheat" data-id="buildings">建築全 Lv.5<small>包含未建造的設施</small></button>
     <button class="pixel-button" data-action="cheat" data-id="quest">完成當前委託<small>可直接領獎勵</small></button>
     <button class="pixel-button" data-action="cheat" data-id="heal">全員回血復活<small>含流浪英雄</small></button>
     <button class="pixel-button" data-action="cheat" data-id="clear">清空場上魔物<small>首領保留</small></button>
     <button class="pixel-button" data-action="cheat" data-id="wanderer">多一位流浪英雄<small>優先補缺少的職業</small></button>
     <button class="pixel-button gold" data-action="cheat" data-id="all">以上全部<small>一次套用</small></button>
   </div></div>`:''}
   <div class="setting-row"><div><strong>匯出存檔</strong><small>將整個村莊、獵人、地下城進度備份成 JSON。</small></div><button class="pixel-button" data-action="export">匯出</button></div>
   <div class="setting-row"><div><strong>匯入存檔</strong><small>選擇之前匯出的暮影村 JSON 存檔，覆蓋目前進度。</small></div><button class="pixel-button" data-action="importSave">匯入</button></div>
   <div class="setting-row"><div><strong>重新開始</strong><small>清除目前存檔並從${cnNum(CLASSES.length)}位初始獵人開始。</small></div><button class="pixel-button danger" data-action="reset">重置</button></div></section>`;}
  if(type==='help'){
    // T124：說明面板改成「核心循環 → 操作 → 獵人 → 設施 → 村外」的分段卡片；
    // 設施那段直接從 BUILDINGS 推導（名稱＋effect），改建築時說明會跟著變，不維護第二份文案。
    const coarse=matchMedia('(pointer:coarse)').matches;
    const loop=[
      ['選人出征','地下城三人遠征、競技場模擬對戰'],
      ['收成回村','獵人狩獵帶回材料、金幣與經驗'],
      ['交易與花費','獵人付錢吃飯、休息、喝酒、療傷'],
      ['建設再變強','升級設施、學技能、換裝備，滿百級轉世'],
    ].map(([t,d],i)=>`<li class="hl-step"><b class="hl-num">${i+1}</b><span class="hl-body"><strong>${t}</strong><small>${d}</small></span></li>`).join('<li class="hl-arrow" aria-hidden="true"></li>');
    const keys=[['Space','暫停遊戲（操作獵人時是攻擊）'],['右鍵拖曳 / Q·E','360° 旋轉 3D 鏡頭（R／F 調整仰角、C 重置視角）'],['U','選取建築時直接升級（六角鈕 ▲）'],['1 – 5','建設 · 地下城 · 獵人 · 倉庫 · 交易（與下方頁籤同順序）'],['6 / 7 / 8','競技場（地下城頁籤）· 委託 · 製作（倉庫頁籤）'],['Ctrl/⌘ + K','指令面板（搜尋並跳到任何面板）'],['Esc','關閉面板或單位小卡']]
      .map(([k,d])=>`<div class="hk-row"><dt>${k}</dt><dd>${d}</dd></div>`).join('');
    const facilities=BUILDINGS.map(b=>`<li class="hf-item" data-id="${b.id}"><b>${esc(b.name)}</b><small>${esc(b.effect||b.desc||'')}</small></li>`).join('');
    const bullets=list=>`<ul class="help-list">${list.map(t=>`<li>${t}</li>`).join('')}</ul>`;
    return ``
      +"<nav class=\"help-nav\" aria-label=\"說明段落\">" + [['loop','核心循環'],['keys','基本操作'],['day','獵人的一天'],['economy','經濟與裝備'],['facilities','村莊設施'],['outside','村外內容']].map(([k,t]) => `<button type=\"button\" class=\"help-nav-chip\" data-action=\"helpNav\" data-target=\"help-sec-${k}\">${t}</button>`).join('') + "</nav>"
      +`<section class="help-sec" id="help-sec-loop"><h4 class="help-h">核心循環</h4><ol class="hl-steps">${loop}</ol></section>`
      +`<section class="help-sec" id="help-sec-keys"><h4 class="help-h"><i>${iconHTML('compass')}</i>基本操作</h4>${bullets([
        coarse?'單指拖曳平移、雙指縮放與扭轉 3D 視角。':'左鍵拖曳平移、右鍵拖曳 360° 旋轉與俯仰 3D 視角、滾輪縮放（手機是單指平移、雙指縮放與旋轉）。',
        '點建築、獵人或魔物，腳下會出現六角小鈕：按 i（或 Enter）看資訊，按 ×（或 Esc）取消選取；建築能升級時還有一顆 ▲（或 U）可以直接升級；餐廳、旅館、酒館、治療所還有一顆 ＋ 可以直接補一批貨。青綠色代表會先向行商補料。',
        '下方五個頁籤是村莊各項功能（建設、地下城、獵人、倉庫、交易）；競技場在地下城裡、倉庫裡分成材料倉庫、裝備倉庫與製作三頁，委託從左上任務追蹤或右上捲軸圖示進入。',
      ])}<dl class="help-keys">${keys}</dl></section>`
      +`<section class="help-sec" id="help-sec-day"><h4 class="help-h"><i>${iconHTML('hunter')}</i>獵人的一天</h4>${bullets([
        '每個獵人有自己的金幣、飽食度、心情與精力，也會自己決定去哪裡狩獵。',
        '外出狩獵會帶回材料、金幣與經驗；回到村莊會在餐廳吃飯、旅館休息、酒館喝酒、治療所療傷，付錢給村莊金庫。',
        '飽食、心情或精力太低會拖慢成長；設施等級越高，商品賣得越貴（每級 +25%，村莊收入跟著變多）、恢復量也越大。',
        '受傷時獵人會照周圍的危險程度提早回村，來回都走村外的環形道路，比較不會在半路被圍。',
        '名冊卡片上的小圖示代表獵人餓了（麵包）、累了（床）或心情差（飲品），記得補齊對應的商品。',
        `野外的流浪英雄都能招募：他們${AFF_RISE}；好感度到門檻（普通 30、稀有 55、超級稀有 80）一定答應，差一點只有部分機會，被婉拒要等 ${waitText(REALTIME.recruitRetry)}才能再邀（不收金幣）。在名冊的「招募」頁邀請，花村莊金幣；名額由獵人小屋的等級決定，滿了就要先升級小屋；小屋滿級後，可以在獵人詳情「資訊」頁最下方「送別」一位獵人，空出名額給更好的流浪英雄（裝備會放回倉庫）。`,
      ])}</section>`
      +`<section class="help-sec" id="help-sec-economy"><h4 class="help-h"><i>${iconHTML('gold')}</i>經濟與裝備</h4>${bullets([
        `材料不夠時，建設、製作、鍛造、學技能與強化的按鈕會變成青綠色「補料」：向交易所行商買缺的那部分，比向獵人收購貴（收購價的 ${MERCHANT.markup} 倍；交易所每升一級少 ${MERCHANT.step} 倍，最低 ${MERCHANT.floor} 倍）。`,
        '反過來，用不完的材料（常見是小麥粉、藥草）庫存到 150 份以上時，交易所卡片會出現「賣 50 份」：半價賣給行商換金幣（木材、鐵礦要等全部建築滿級才會出現）。',
        `後期金幣與星晶的用途：獵人詳情「轉世」頁可以「晉升」，花村莊金幣＋星晶把稀有度升一階（普通→稀有→超級稀有→英雄→傳說），生命與攻擊永久提高。星晶不夠時，交易所 Lv.${MERCHANT.gemTrading} 起可以用金幣向行商買（${MERCHANT.gemLot} 顆 ${MERCHANT.gemLot*MERCHANT.gemPrice} 金）。`,
        '交易所每種材料都能開「持續收購」：開著時數字代表「要維持的庫存」，庫存低於這個數才向獵人收購、最多補到剛好這個數，用掉了會自動再補；為了留錢升級，持續收購會保留 500 金，一般的單次收購則可以花到 0。',
        '鐵匠鋪每升一級解鎖下一階裝備（Ⅰ～Ⅴ）；獵人回村看到比身上更高階的裝備，會自己花錢換新。',
        '換下來的舊裝備會放進倉庫，可以一件件處理，也能在倉庫的「裝備倉庫」頁按「全部賣出」或「全部分解」舊裝備：所有初始裝備，以及比鐵匠鋪目前最高階還低的鍛造裝備（不管是自己做的還是掉落的）；目前最高階的裝備會留著。新遊戲預設「自動賣出」：獵人在鐵匠鋪換下來的舊件、野外撿到的初始裝備與首領寶箱的舊階件直接賣掉，不進倉庫（地下城寶箱與委託獎勵照樣放進倉庫）；想自己處理可以切回「放進倉庫」，或改成「自動分解」。',
      ])}</section>`
      +`<section class="help-sec" id="help-sec-facilities"><h4 class="help-h"><i>${iconHTML('hall')}</i>村莊設施與用途</h4><ul class="hf-grid">${facilities}</ul></section>`
      +`<section class="help-sec" id="help-sec-outside"><h4 class="help-h"><i>${iconHTML('map')}</i>村外內容</h4>${bullets([
        `委託所追蹤 ${game.questList().length} 章委託，完成時點左上的委託追蹤就能直接領獎；全部完成後，左上追蹤列會改成下一個長線目標（解鎖難度、競技場天梯）。`,
        '地下城是三人遠征，走完一層推進紀錄；面板會依目前的生命與飽食評估選的那層有多危險、建議比較安全的樓層，但照你選的層出發；快撐不住也會自己撤退。飢餓或疲勞時普攻傷害打六折。已經打過的樓層再打，獎勵會減少。',
        '競技場是不會真的死亡的模擬對戰天梯：對手隨勝場變強，獎勵跟著變多（到第 40 勝封頂），之後對手每勝生命 +3%、攻擊 +2%，總有一天會輸——要靠轉世、換裝讓隊伍更強才能再往上爬；每 5 勝另給星晶。面板會寫下一位對手的生命與攻擊，以及這支隊伍照實戰規則試打算出的勝算。',
        '不知道派誰？地下城與競技場的組隊區都有「推薦隊伍」：地下城挑估計能安全推進最深的三人（職業搭配很重要，例如坦克＋射手＋祭司），競技場挑每秒傷害最高的三人。',
        `森林領主：按右側「召喚首領」把它叫到目前所在的生態區，全村獵人一起圍攻；限時 ${BOSS_LIMIT} 秒，打倒給 5 星晶起；越危險的生態區，首領越強、獎勵也越多。打完要整備一段時間才能再召喚，按鈕會寫還要幾秒。`,
      ])}</section>`
      +`<div class="help-foot"><small>想再看一次開場導覽？</small><button class="pixel-button" data-action="welcomeReplay">重看開場</button></div>`;
  }

 if(type==='boss'){const ex=s.expedition,hp=Math.max(0,Math.ceil(ex.bossHp||0)),max=ex.bossMaxHp||1;   // 2026-10-30:首領插圖橫幅、討伐中血條、獎勵預覽；T162:戰力對比與參戰名單
  // 參戰名單＝game.expedition() 的出征條件：活著、不在地下城／競技場。首領戰是即時戰鬥（趕路、攻速、防禦、限時），
  // 不用「總攻擊÷血量＝幾輪」估算，那個數字跟實際差很多。
  const alive=s.hunters.filter(h=>h.hp>0&&h.task!=='dungeon'&&h.task!=='arena'),totalAtk=alive.reduce((n,h)=>n+h.attack,0),bp=game.bossPreview?game.bossPreview():null,pool=ex.active?hp:(bp?.hp||max),bossAtk=(ex.active&&s.enemies.find(e=>e.type==='boss')?.attack)||bp?.attack||0;   // 2026-11-18 沒在打時顯示「在目前生態區召喚」的生命與獎勵(原本是上一隻的生命、獎勵寫基礎值)
  const partyRows=alive.map(h=>{const pct=Math.max(0,Math.min(100,h.hp/h.maxHp*100)),r=RARITIES.find(v=>v.id===h.rarity),cls=CLASSES.find(c=>c.id===h.classId);
   return `<div class="bs-hunter" data-rarity="${h.rarity}" style="--rarity:${r?.color||'#c9a227'}"><img data-portrait="${h.id}" alt=""><div class="bs-info"><b>${esc(h.name)}</b><small>Lv.${h.level} · ${cls?.name||''}</small><i class="bs-hp"><span style="width:${pct}%" data-lhp="${h.id}" data-lhk="fill"></span></i></div><em class="bs-atk">${iconHTML('atk',true)}${h.attack}</em></div>`;}).join('');
  // 2026-11-11 第二階段:桌機/橫向分左右兩欄 —— 左:戰力對比＋說明＋參戰名單;右:狀態＋獎勵＋召喚鈕(鈕不會疊在名單上)
  return `<div class="hv-boss"><div class="hv-boss-l"><div class="boss-faceoff"><div class="bf-side mine"><small>我方獵人</small><b>${alive.length}</b><span>位 · 總攻擊 ${fmt(totalAtk)}</span></div><div class="bf-vs">VS</div><div class="bf-side boss"><small>${BOSS_NAME}</small><b>${fmt(pool)}</b><span>${ex.active?'剩餘生命':'生命值'}${bossAtk?` · 攻擊 ${fmt(bossAtk)}`:''}</span></div></div><div class="boss-rounds">${!alive.length?'目前沒有可參戰的獵人，先讓傷兵休息':ex.active?'即時戰鬥進行中 · 限時內沒擊倒，首領會退回暮霧':'即時戰鬥 · 村外存活的獵人全體自動參戰，限時內要擊倒'}</div>${ex.active?`<div class="boss-hp"><span>${BOSS_NAME}</span><div class="progress"><span style="width:${hp/max*100}%"></span><b>${fmt(hp)}/${fmt(max)}</b></div></div>`:''}${alive.length?`<h4 class="hv-h">參戰名單 <small>${alive.length} 位</small></h4><div class="bs-party">${partyRows}</div>`:''}</div><div class="hv-boss-r"><div class="encounter-status">${ex.active?'討伐中 · 全體獵人正趕往首領所在地':ex.cooldown>0?`整備 ${Math.ceil(ex.cooldown)} 秒`:`${BOSS_NAME}尚未出現`}</div><div class="boss-loot"><span>擊倒獎勵（分給參戰獵人）</span><div class="cost">${costs(bp?{gold:bp.gold,...bp.drops}:{gold:ENEMIES.boss?.gold||0,...(ENEMIES.boss?.drops||{})})}</div><small class="boss-vil">村莊另得 ${iconHTML('gems',true)} ${bp?bp.gems:5} 星晶${bp&&!ex.active?`<br><span class="boss-where">在${esc(bp.region)}召喚${bp.risk>1?` · 危險度 ×${bp.risk}，生命與獎勵一起變多`:''}</span>`:''}</small></div><div class="encounter-actions"><button class="pixel-button gold" data-action="bossAsk" data-foot="primary" ${ex.active||ex.cooldown>0||!alive.length?'disabled':''}>${iconHTML('horn')}召喚${BOSS_NAME}</button></div></div></div>`;}
  if(type==='welcome'){   // Z2D(規格 l、diff #17):開場導覽＝白色像素氣泡＋大頭像,一次只說一步(「下一步」往下走),目標頁籤用高亮＋手指標出(z2dMarkPaint);人數從資料讀
   const i=Math.max(0,Math.min(WELCOME_STEPS.length-1,welcomeStep)),st=WELCOME_STEPS[i],last=i===WELCOME_STEPS.length-1;
   return `<div class="hv-dlg"><div class="hv-dlg-face">${elderFace()}</div><div class="hv-dlg-body z2d-bubble"><div class="hv-dlg-say z2d-step" data-step="${i}" data-target="${st.target||''}">${st.h?`<b class="z2d-h">${st.h}</b>`:''}<p>${st.p()}</p></div>
<div class="z2d-dots" aria-label="第 ${i+1} 步，共 ${WELCOME_STEPS.length} 步">${WELCOME_STEPS.map((_,k)=>`<i class="${k===i?'on':''}"></i>`).join('')}</div>
<div class="hv-dlg-acts welcome-actions">${last?`<button class="pixel-button quiet hv-btn cancel" data-action="welcomeHelp">${iconHTML('scroll',true)}<span>看完整說明</span></button><button class="pixel-button gold hv-btn primary" data-action="welcomeStart">${iconHTML('check',true)}<span>開始遊戲</span></button>`:`<button class="pixel-button quiet hv-btn cancel" data-action="welcomeStart">跳過</button><button class="pixel-button gold hv-btn primary" data-action="welcomeNext"><span>下一步</span></button>`}</div></div></div>`;
  }
  if(type==='advisor'){const n=advisorReq||{text:'',act:'',label:''};   // 顧問提示展開:同一個亮色對話框
   return `<div class="hv-dlg"><div class="hv-dlg-face">${elderFace()}</div><div class="hv-dlg-body z2d-bubble"><p class="hv-dlg-say z2d-step" data-step="0" data-target="${n.act||''}">${esc(n.text)}${n.more?`<br><small class="hv-dlg-more">${esc(n.more)}</small>`:''}</p><div class="hv-dlg-acts"><button class="pixel-button quiet hv-btn cancel" data-action="close">知道了</button>${n.act?`<button class="pixel-button gold hv-btn primary" data-action="nextStepGo" data-act="${n.act}">${iconHTML(ADVISOR_ICON[n.act]||'quest',true)}<span>${esc(n.label)}</span></button>`:''}</div></div></div>`;
  }
 return '';
}

function selectedIds(kind){return game.state[kind].hunterIds||[];}
function toggleParty(kind,id){const list=selectedIds(kind),i=list.indexOf(id);if(i>=0)list.splice(i,1);else if(list.length<3)list.push(id);else logToast('最多 3 人，先取消一位再選。',false);openModal(kind==='dungeon'?'dungeon':'arena');}
function inspect(id){selected=id;/* T111：手機上抽屜跟建築面板不能同時開（會疊在一起互相擋點擊），選建築就先把抽屜收起 */if(TOP_NARROW.matches&&leftOpen){leftOpen=false;$('#left-panel').classList.add('hidden');$('#reopen-left').classList.remove('hidden');}measureHud();/* Z1 R2：建築詳情用 --hud-bottom 排版，安全區(手勢列)變了要重量，不然沿用上一個面板留下的舊值 */$('#inspector').classList.remove('hidden');paintInspector();world?.setSelected(id);toastDodge();setTimeout(toastDodge,0);}
function closeInspector(){$('#inspector').classList.add('hidden');selected=null;world?.setSelected(null);toastDodge();}
function doAction(el){const a=el.dataset.action,id=el.dataset.id;let r;
 if(a==='regionView'){closeModal();world.focus(id==='village'?'home':'region:'+id);return;}
  if(a==='regionTravel'){const rg=REGIONS.find(x=>x.id===id);travelVeil(rg?rg.name:'',()=>{r=game.exploreRegion(id);logToast(r.message,r.ok);if(r.ok){closeModal();world.focus('region:'+id);save();}paint();});return;}
 if(a==='recallHunters'){r=game.recallHunters();logToast(r.message,r.ok);paint();return;}
 if(a==='start')return start();if(a==='close'||a==='offlineOk')return closeModal(true);if(a==='toggleLeft'){leftOpen=!leftOpen;$('#left-panel').classList.toggle('hidden',!leftOpen);$('#reopen-left').classList.toggle('hidden',leftOpen);if(leftOpen){/* T111：手機上抽屜蓋不到建築面板(兩塊面板疊在一起會互相擋點擊)，開抽屜就收起建物面板 */if(TOP_NARROW.matches&&!$('#inspector')?.classList.contains('hidden'))closeInspector();}return;}if(a==='closeInspector'){closeInspector();return;}
 if(a==='home'){closeModal();world?.focus('home');return;}if(a==='zoomIn'){world?.zoomBy(1.15);return;}if(a==='zoomOut'){world?.zoomBy(1/1.15);return;}
 if(a==='camOrbitL'||a==='camOrbitR'){world?.orbitBy?.(a==='camOrbitL'?-Math.PI/4:Math.PI/4,0);const ang=world?.angleState?.(),bar=$('#hd2d-cam');if(bar&&ang)bar.dataset.angle=`${ang.yawDeg},${ang.pitchDeg}`;return;}
 if(a==='camTilt'){const deg=world?.cycleTilt?.();const ang=world?.angleState?.(),bar=$('#hd2d-cam');if(bar&&ang)bar.dataset.angle=`${ang.yawDeg},${ang.pitchDeg}`;if(deg!=null)logToast(`3D 鏡頭仰角：${deg}°`);return;}
 if(a==='camReset'){world?.resetAngle?.();const ang=world?.angleState?.(),bar=$('#hd2d-cam');if(bar&&ang)bar.dataset.angle=`${ang.yawDeg},${ang.pitchDeg}`;logToast('已重置預設 3D 視角');return;}
 if(a==='camFx'){const on=!!world?.togglePostFx?.();el.classList.toggle('on',on);el.setAttribute('aria-pressed',String(on));logToast(on?'HD-2D 移軸景深與暖陽光暈：開':'HD-2D 移軸景深與暖陽光暈：關');return;}
 if(a==='pause'){game.state.paused=!game.state.paused;paint();return;}if(a==='speed'){game.state.speed=game.state.speed>=3?1:game.state.speed+1;paint();return;}
 if(a==='toggleParts'){const on=!(world?.getPartsVisible?.()??true);world?.setPartsVisible?.(on);el.textContent=on?'裝備顯示中':'裝備已卸下';logToast(on?'裝備零件層：開':'裝備零件層：關（同一個身體、不重生）',true);paint();return;}
 if(a==='peekWanderer'){const list=game.state.wanderers||[];if(!list.length)return logToast('目前沒有流浪英雄',false);wandererPeek=(wandererPeek+1)%list.length;const w=list[wandererPeek],c=CLASSES.find(v=>v.id===w.classId);closeModal();world?.lookAt(w.x,w.z,1.7);logToast(`${c?.name||w.classId} ${w.name} Lv.${w.level}｜${w.status}｜野外擊殺 ${game.state.wanderKills}`,true);return;}
 if(a==='spawnClasses'){const spawned=world?.spawnClassVillagers?.()||[];logToast(spawned.length?`已叫進村莊：${spawned.join('、')}`:'角色圖還沒載入好，稍後再試',spawned.length>0);paint();return;}
 // 2026-11-16 獵魔村式「點一下就收下」:委託完成時點左上追蹤列直接領獎,吐司寫出拿到什麼與下一章;沒完成時照舊打開委託清單
 if(a==='quests'&&el.id==='hv-quest'&&game.state.quest?.complete&&!game.state.quest?.claimed){const q0=game.state.quest,n0=q0.index+1,rw=Object.entries(q0.reward||{}).filter(([,v])=>v>0).map(([k,v])=>costName(k)+' '+fmt(v)).join('、');
   r=game.claimQuest();if(r.ok){const q1=game.state.quest;logToast(`第 ${n0} 章完成，獲得 ${rw||'獎勵'}`+(q1.claimed?'':`；下一章：${q1.title}`),true);}else logToast(r.message,false);paint();save();return;}
 if(a==='settings'||a==='help'||a==='build'||a==='hunters'||a==='recruit'||a==='trade'||a==='craft'||a==='dungeon'||a==='arena'||a==='quests'||a==='inventory'||a==='equipstore'||a==='difficulty'||a==='boss'){if(modal===a&&el.closest('#bottom-bar,#topbar'))return closeModal();return openModal(a==='boss'?'boss':a);}   // 再點一次下方/上方同一顆 = 關掉
 if(a==='dispatchHunters'){const teams=game.state.dispatchTeams||[];
   // 第一次使用:四組都空 → 自動把存活獵人放進隊伍 1,一鍵就能出門
   if(teams.every(t2=>!t2.ids.length)){game.setDispatchTeam(0,{ids:aliveHunters().map(h=>h.id)});}
   dispatchTab=0;return openModal('dispatch');}
 if(a==='dispatchTab'){dispatchTab=Number(el.dataset.index)||0;return openModal('dispatch');}
 if(a==='toggleDispatchHunter'){const team=game.state.dispatchTeams[dispatchTab];const ids=[...(team?.ids||[])];const i=ids.indexOf(id);if(i>=0)ids.splice(i,1);else ids.push(id);game.setDispatchTeam(dispatchTab,{ids});return openModal('dispatch');}
 if(a==='dispatchAll'){game.setDispatchTeam(dispatchTab,{ids:aliveHunters().map(h=>h.id)});return openModal('dispatch');}
 if(a==='dispatchNone'){game.setDispatchTeam(dispatchTab,{ids:[]});return openModal('dispatch');}
 if(a==='regionInfo'){regionFrom='dispatch';infoRegion=id;return openModal('region');}
 if(a==='regionDetail'){regionFrom='density';infoRegion=id;return openModal('region');}
 if(a==='densityFor'){densityRegion=id||'meadow';return openModal('density');}   // 驗收腳本用:不點世界立牌也能開這一頁
 if(a==='setDensity'){const r=game.setRegionDensity(densityRegion,Number(el.dataset.level));logToast(r.message,r.ok);save();paint();openModal('density');return;}
 if(a==='regionInfoClose')return openModal('dispatch');
 if(a==='dispatchRegion'){game.setDispatchTeam(dispatchTab,{region:id});openModal('dispatch');const c=$('#modal-content');if(c)c.scrollTop=c.scrollHeight;return;}
 if(a==='startDispatch'){const go=()=>{const r2=game.dispatchTeam(dispatchTab);logToast(r2.message,r2.ok);if(r2.ok)closeModal();save();paint();};
   // Z2C:選到「危險」的區域要二次確認(UX #11)——確認框寫出舒適度與威脅,取消回派遣面板
   const tm=(game.state.dispatchTeams||[])[dispatchTab],ft=tm&&tm.ids.length?z2cFit(tm.region,tm.ids):null;
   if(ft&&ft.verdict==='hard'){const rn=REGIONS.find(x=>x.id===tm.region)?.name||tm.region;askConfirm(`${rn}對這一組偏危險（舒適度 ${ft.comfort}、這區威脅 ${ft.threat}）：獵人可能受重傷甚至倒下。確定要派遣嗎？`,'派遣（危險）',go,'dispatch');return;}
   go();return;}
 if(a==='toggleDungeonHunter'){toggleParty('dungeon',id);return;}if(a==='dgRecommend'){r=game.recommendDungeonParty();if(r.ok){const l=game.state.dungeon.hunterIds;l.splice(0,l.length,...r.ids);}logToast(r.message,r.ok);openModal('dungeon');save();return;}if(a==='toggleArenaHunter'){toggleParty('arena',id);return;}if(a==='arRecommend'){r=game.recommendArenaParty();if(r.ok){const l=(game.state.arena.hunterIds||=[]);l.splice(0,l.length,...r.ids);}logToast(r.message,r.ok);openModal('arena');save();return;}if(a==='startDungeon'){r=game.startDungeon(game.state.dungeon.hunterIds);logToast(r.message,r.ok);paint();if(r.ok)openModal('dungeon');save();return;}if(a==='dgRetreat'){z2cMarkRetreat();r=game.retreatDungeon();logToast(r.message,r.ok);openModal('dungeon');paint();save();return;}if(a==='dgAuto'){r=game.setDungeonAuto(!game.state.dungeon.auto);logToast(r.message,r.ok);openModal('dungeon');save();return;}if(a==='dgFloor'){const d=game.state.dungeon,maxF=d.bestFloor+1,cur=Math.min(maxF,d.startFloor||maxF);r=game.setDungeonStart(id==='max'?maxF:cur+Number(id));openModal('dungeon');save();return;}if(a==='startArena'){r=game.startArena(game.state.arena.hunterIds);logToast(r.message,r.ok);paint();return;}
  // T132:下一步建議條
  if(a==='nextStep'){   // 2026-11-11 第二階段:顧問提示先展開成亮色對話框(村長說話＋動作鈕),再按動作鈕才跳過去
    if(el.dataset.key==='visitor'){openModal('recruit');return;}   // 2026-11-25 招募提示直接開名冊的「招募」子頁籤(新獵人暗帶取消)
    advisorReq={text:el.querySelector('.ns-tx')?.textContent||'',act:el.dataset.act||'',flash:el.dataset.flash||'',label:el.querySelector('.ns-go')?.textContent||'前往',more:ADVISOR_MORE[el.dataset.key]||''};
    openModal('advisor');return;
  }
  if(a==='questGo'){const g=Z2C.questGo?.(game.state);if(!g)return;advisorReq={text:g.text||'',act:g.act,flash:g.flash||'',label:g.label};}   // 2026-11-18 委託頁「前往」
  if(a==='nextStepGo'||a==='questGo'){const t=a==='questGo'?advisorReq.act:el.dataset.act;
    // 2026-11-16:原本「去製作」(act=craft)不在清單裡 → 按了只會關面板;補上製作、交易、鍛造分頁、首領
    if(t==='craftGear'){craftTab='gear';openModal('craft');return;}
    if(t.startsWith('rebirth:')){const hid=t.slice(8);closeModal();openHunter(hid);if(modal==='hunter-detail'){hc.tab='rebirth';openHunter(hid);}return;}   // 2026-11-18 Lv.100 → 直接開那位獵人的「轉世」頁
    if(t==='arena'){openModal('arena');return;}
    if(t==='quests'||t==='hunters'||t==='recruit'||t==='dungeon'||t==='build'||t==='craft'||t==='trade'||t==='boss'||t==='inventory'||t==='equipstore')openModal(t);else closeModal();
    if(t==='equipstore')requestAnimationFrame(()=>document.querySelector('#modal-content .gear-store')?.scrollIntoView({block:'start'}));   // 2026-11-17:舊裝備提示 → 直接捲到裝備倉庫(自動整理開關在那裡)
    if(t==='build'&&/地下城入口/.test(advisorReq?.text||''))z2cFlashBuild('dungeon');   // Z2C:顧問叫你蓋地下城入口時,建設面板直接標出那一格
    if(t==='build'&&advisorReq?.flash)z2cFlashBuild(advisorReq.flash);
    return;
  }
  // T107:小隊 HUD 的兩個按鈕(不開面板,直接在畫面上操作)
  if(a==='hunterRetreat'){z2cMarkRetreat();r=game.retreatDungeon();logToast(r.message,r.ok);if(r.ok&&modal==='hunter-detail'){hc.tab='rebirth';openHunter(id);}paint();save();return;}   // 2026-11-18 轉世頁的「小隊撤退」:撤完留在這頁(結算視窗等面板關了再出)
  if(a==='runRetreat'){z2cMarkRetreat();r=game.retreatDungeon();logToast(r.message,r.ok);paint();save();return;}
  if(a==='runAuto'){r=game.setDungeonAuto(!game.state.dungeon.auto);logToast(r.message,r.ok);save();return;}
   // T109:世界小卡上的兩顆按鈕
  if(a==='unitDetail'){const uid=id;hideUnitCard();openHunter(uid);return;}
  if(a==='unitCardClose'){hideUnitCard();return;}
 if(a==='helpNav'){   // T148：說明目錄跳到指定段落
  const box=$('#modal-content'),t=el&&el.dataset.target?document.getElementById(el.dataset.target):null;
  // 2026-11-16:黏在上面的目錄在手機上會換成兩行(6 顆) → 用目錄實際高度當偏移,段落標題才不會被蓋住
  if(box&&t){const nav=box.querySelector('.help-nav'),off=(nav?nav.getBoundingClientRect().height:48)+8,top=t.getBoundingClientRect().top-box.getBoundingClientRect().top+box.scrollTop-off;
    if(matchMedia('(prefers-reduced-motion: reduce)').matches)box.scrollTop=Math.max(0,top);
    else box.scrollTo({top:Math.max(0,top),behavior:'smooth'});}
  return;}
 if(a==='welcomeReplay'){welcomeStep=0;openModal('welcome');return;}
 if(a==='codex'){openModal('codex');return;}   // T125:魔物圖鑑
if(a==='setDifficulty'){r=game.setDifficulty(Number(id));logToast(r.message,r.ok);if(r.ok)closeModal();paint();return;}
 if(a==='toggleQuality'){settingsOpen=!settingsOpen;return openModal('settings');}
 // ── 建築:建造 / 升級 / 移動 / 從建造面板選一棟（2026-10-20 補上：這些按鈕原本沒有任何處理函式，按了不會有反應）
 if(a==='selectBuilding'){closeModal();inspect(id);return;}
 if(a==='inspectTab'){inspectTab=id==='up'?'up':'act';inspectTabFor=selected;paintInspector();return;}   // Z2B:建築詳情的文字型子頁籤(生產／升級效果)
 if(a==='inspectGo'){closeInspector();openModal(id);return;}   // Z2B:詳情清單列的「前往」:先收起建築詳情再開對應面板
 if(a==='equipNav'){const hs=(game.state.hunters||[]).filter(Boolean);if(hs.length){const cur=Math.max(0,hs.findIndex(x=>x.id===equipHid)),d=Number(el.dataset.d)||1;equipHid=hs[(cur+d+hs.length*8)%hs.length].id;}openModal('equipstore');{const c=$('#modal-content'),w=c&&c.querySelector('.eq-who');if(w&&c.scrollTop>150)w.classList.add('compact');}return;}
 if(a==='equipUsable'){equipOnlyUsable=!equipOnlyUsable;openModal('equipstore');return;}
 if(a==='equipTidy'){equipTidyOpen=!equipTidyOpen;openModal('equipstore');requestAnimationFrame(()=>document.querySelector('#modal-content .eq-tidy')?.scrollIntoView({block:'nearest'}));return;}
 if(a==='equipPickToggle'){equipPickOpen=!equipPickOpen;openModal('equipstore');{const c=$('#modal-content');if(c)c.scrollTop=0;}return;}
 if(a==='equipPick'){if(el.dataset.hid)equipHid=el.dataset.hid;equipPickOpen=false;openModal('equipstore');{const c=$('#modal-content');if(c)c.scrollTop=0;}return;}
 if(a==='invPick'){invPick=invPick===id?'':id;openModal('inventory');return;}   // Z2B:倉庫方格點選 → 上方詳情框(用途、來源、單價、前往)
 if(a==='construct'){r=game.construct(id);logToast(r.message,r.ok);if(r.ok)world?.setSelected(id);paint();save();refreshBuildModal();return;}
 if(a==='upgrade'){r=game.upgrade(id);logToast(r.message,r.ok);paint();save();refreshBuildModal();return;}
 // 2026-11-16 交易所行商:先補缺的材料,再照常建造/升級(兩步任一失敗都只回報,不會扣了錢沒升級 —— 補料成功後材料留在倉庫)
 if(a==='merchantBuild'){const lv=game.state.buildings[id]||0,b=BUILDINGS.find(x=>x.id===id);const buy=game.buyMaterials(lv?game.getUpgradeCost(id):b?.cost);
   if(!buy.ok){logToast(buy.message,false);paint();refreshBuildModal();return;}
   r=lv?game.upgrade(id):game.construct(id);if(!lv&&r.ok)world?.setSelected(id);logToast(r.ok?`${buy.message} ${r.message}`:r.message,r.ok);paint();save();refreshBuildModal();return;}
 if(a==='moveBuilding'){closeModal();if(TOP_NARROW.matches)closeInspector();placing=id;$('#placement').classList.remove('hidden');world?.placeMode(id);paint();return;}
 // FIX-A B2:放置提示上的「取消」——建築沒動(layout 只在 moveBuilding 成功時才改),只退出移動模式;觸控裝置沒有 Esc,靠這顆
 if(a==='cancelMove'){placing=null;$('#placement').classList.add('hidden');world?.placeMode(null);paint();return;}
 // ── 獵人:詳情 / 學技能 / 修煉 / 強化 / 轉世
 if(a==='hunter'){openHunter(id);return;}
 if(a==='hunterCycle'){cycleHunter(id==='prev'?-1:1);return;}
 if(a==='hunterTab'){if(HC_TABS.some(t=>t[0]===id)&&modal==='hunter-detail'&&hc.id){hc.tab=id;openHunter(hc.id);}return;}   // Z2A:獵人卡的子頁籤
 if(a==='merchantSkill'||a==='merchantEnhance'){const cost=a==='merchantSkill'?game.skillCost(id):game.enhanceCost(id);if(!cost){logToast('找不到這位獵人。',false);return;}
   const buy=game.buyMaterials(cost);if(!buy.ok){logToast(buy.message,false);openHunter(id);paint();return;}r=a==='merchantSkill'?game.learnSkill(id):game.enhance(id);logToast(r.ok?`${buy.message} ${r.message}`:r.message,r.ok);openHunter(id);paint();save();return;}
 if(a==='learnSkill'){r=game.learnSkill(id);logToast(r.message,r.ok);openHunter(id,true);paint();return;}
 if(a==='setHunterSpec'){const sp=el.dataset.spec;if(!sp)return;r=game.setHunterSpec(id,sp);logToast(r.message,r.ok);openHunter(id,true);paint();if(r.ok)save();return;}
 if(a==='train'){r=game.train(id);logToast(r.message,r.ok);openHunter(id);paint();return;}
 if(a==='enhanceHunter'){r=game.enhance(id);logToast(r.message,r.ok);openHunter(id);paint();return;}
 if(a==='reincarnate'){r=game.reincarnate(id);logToast(r.message,r.ok);openHunter(id);paint();return;}
 if(a==='promoteHunter'){r=game.promoteHunter(id);logToast(r.message,r.ok);openHunter(id);paint();return;}
 // 2026-11-18 送別獵人:一定先確認(跟「重置村莊」同一個 askConfirm 視窗);取消回到這位獵人的詳情,確認後關詳情、開名冊
 if(a==='dismissHunter'){const h=game.state.hunters.find(v=>v.id===id),c=game.dismissCheck(id);if(!h||!c.ok){logToast(c.why,false);if(h)openHunter(id);return;}
  askConfirm(`${h.name}會永遠離開村莊，不會再回來。身上的裝備會放回倉庫；等級、轉世、技能與武器強化不會保留，個人金幣與背包材料也會一起帶走。`,'送別',()=>{r=game.dismissHunter(id);logToast(r.message,r.ok);if(r.ok){hc.id='';openModal('hunters');}else openHunter(id);paint();save();},()=>openHunter(id),`確定要送別 ${h.name} 嗎？`);
  const y=document.querySelector('#modal [data-action=confirmYes]'),n=document.querySelector('#modal [data-action=confirmNo]');if(y)y.dataset.zb='red';if(n)n.dataset.zb='ghost';return;}
  // ── 裝備物品(2026-11-15):身上的七格 → 卸下／存倉／出售／分解;空位直接從倉庫穿上
  if(a==='gearUnequip'){r=game.unequipGear(id,el.dataset.slot);logToast(r.message,r.ok);openHunter(id);paint();save();return;}
  if(a==='gearStore'){r=game.storeGear(id,el.dataset.slot);logToast(r.message,r.ok);openHunter(id);paint();save();return;}
  // 2026-11-18 身上的裝備出售／分解不能復原 → 先確認(倉庫裡的批次整理不變)
  if(a==='gearSell'||a==='gearSalvage'){const slot=el.dataset.slot,h=game.state.hunters.find(v=>v.id===id),it=gearItemView(h?.gear?.[slot]);if(!h||!it)return;const sell=a==='gearSell',back=()=>{openHunter(id);if(modal==='hunter-detail'){hc.tab='gear';openHunter(id);}};   // 從確認框回來時 openHunter 會把頁籤重設成資訊 → 再切回裝備頁
    askConfirm(sell?`把 ${h.name} 身上的「${it.name}」賣掉，換 ${fmt(it.sell||0)} 個人金幣。賣掉就拿不回來；想留著可以按「卸下」放回倉庫。`:`把 ${h.name} 身上的「${it.name}」分解成材料。分解後就沒有這件裝備了；想留著可以按「卸下」放回倉庫。`,sell?'出售':'分解',()=>{r=sell?game.sellGear(id,slot):game.salvageGear(id,slot);logToast(r.message,r.ok);if(r.ok&&sell)sfx('coin');back();paint();save();},back,sell?`確定要賣掉「${it.name}」嗎？`:`確定要分解「${it.name}」嗎？`);
    const y=document.querySelector('#modal [data-action=confirmYes]'),n=document.querySelector('#modal [data-action=confirmNo]');if(y)y.dataset.zb='red';if(n)n.dataset.zb='ghost';return;}
  if(a==='gearEquip'){r=game.equipFromStorage(id,el.dataset.uid);logToast(r.message,r.ok);openHunter(id);paint();save();return;}
  if(a==='gearStoreEquip'){const uid=el.dataset.uid,sel=document.querySelector(`[data-store-who="${uid}"]`),hid=el.dataset.hid||(sel&&sel.value);
    if(!hid){logToast('先選一位獵人再穿上。',false);return;}
    r=game.equipFromStorage(hid,uid);logToast(r.message,r.ok);openModal('equipstore');paint();save();return;}
  if(a==='gearAuto'){r=game.setAutoJunk(el.dataset.mode);logToast(r.message,r.ok);openModal('equipstore');paint();save();return;}
  if(a==='gearBulk'){r=game.bulkStoredGear(el.dataset.kind==='salvage'?'salvage':'sell');logToast(r.message,r.ok);openModal('equipstore');paint();save();return;}
  if(a==='gearStoreSell'||a==='gearStoreSalvage'){const uid=el.dataset.uid,sell=a==='gearStoreSell',run=()=>{const r2=sell?game.sellStoredGear(uid):game.salvageStoredGear(uid);logToast(r2.message,r2.ok);openModal('equipstore');paint();save();};
    if(el.dataset.ask){const nm=sell?'出售':'分解';askConfirm(el.dataset.ask,`確定${nm}`,run,'equipstore',`${nm}後拿不回來。真的要${nm}嗎？`);return;}   // 2026-11-25 好裝備(Ⅱ 階以上或有獵人用得上)先確認,一般舊件直接處理
    run();return;}
 // ── 招募 / 委託 / 首領
 // 2026-11-25 邀請流浪英雄:成功率未滿 100% 先確認(婉拒會扣好感、當天不能再邀;不收金幣);成功後名冊招募頁重畫
 if(a==='recruitWanderer'){const q=game.recruitQuote(id);if(!q)return logToast('這位流浪英雄已經離開了',false);
   const lock=recruitLockText(q,game.state);   // 2026-11-25 鎖住的鈕也能點:不做事,只在卡片上說原因(不用跳紅色提示框蓋住清單)
   if(lock){recruitResult=null;recruitHint=recruitHint===id?'':id;refreshRecruit();return;}
   const w0=(game.state.wanderers||[]).find(v=>v.id===id),nm=w0?.name||'';
   const go=()=>{const r2=game.recruit(id);recruitHint='';
     if(r2.ok)recruitResult={id,kind:'ok',text:`${nm} 加入了村莊`};
     else if(r2.declined)recruitResult={id,kind:'fail',text:`${nm} 婉拒了 · 好感 ${AFFINITY.fail} · 明天再邀`,flash:1};
     else recruitResult=null;
     if(r2.declined){sfx('error');}else   /* 婉拒:結果直接寫在卡片上(遊戲日誌也有紀錄),不再跳 toast 蓋住清單 */ logToast(r2.message,r2.ok);
     paint();save();refreshRecruit(true);};
   if(q.ok&&q.chance<1){const pc=Math.round(q.chance*100);askConfirm(`邀請 ${nm} · 成功率 ${pc}% · 費用 ${fmt(q.cost)} 金（失敗不收）· 失敗：好感 ${AFFINITY.fail}，${waitText(REALTIME.recruitRetry)}內不能再邀`,`邀請（${pc}%）`,go,'recruit',null,'邀請流浪英雄');return;}
   go();return;}
 if(a==='rcHelp'){recruitHelp=!recruitHelp;refreshRecruit();return;}
 if(a==='rcGo'){if(id==='build'||id==='trade'||id==='craft')openModal(id);return;}   // 招募頁的連結:開 建設/交易/製作
 if(a==='locateWanderer'){const w=(game.state.wanderers||[]).find(v=>v.id===id);if(!w)return logToast('這位流浪英雄已經離開了',false);const c=CLASSES.find(v=>v.id===w.classId);closeModal();world?.lookAt(w.x,w.z,Math.max(1.7,world?.getScale?.()||1.7));logToast(`${c?.name||''} ${w.name} Lv.${w.level}｜${w.status}｜好感 ${Math.floor(w.affinity||0)}`,true);return;}   // 2026-11-25 招募卡的定位小鈕(跟 peekWanderer 同一套鏡頭)
 if(a==='quest'){r=game.claimQuest();logToast(r.message,r.ok);openModal('quests');paint();save();return;}
 if(a==='bossAsk'){openModal('bossconfirm');return;}   // Z2C(UX #6):召喚前先確認(首領名·血量·我方總攻擊·預估),取消回首領面板
 if(a==='bossBack'){openModal('boss');return;}
 if(a==='startBoss'){r=game.expedition();logToast(r.message,r.ok);closeModal();paint();return;}
 if(a==='resultOk'){const bk=resultReq?.back;resultReq=null;closeModal();if(bk)openModal(bk);return;}
 if(a==='z2cGoBuild'){openModal('build');z2cFlashBuild(id);return;}
 // ── 交易所 / 製作
 if(a==='rosterMenu'){rosterMenu=!rosterMenu;openModal('hunters');if(rosterMenu)$('#roster-menu [aria-pressed=true]')?.focus({preventScroll:true});return;}
 if(a==='locateHunter'){const h=game.state.hunters.find(v=>v.id===id);closeModal();if(h){world?.lookAt(h.x,h.z,Math.max(1.6,world?.getScale?.()||1.6));selectWorld('hunter:'+h.id);}return;}
 if(a==='selInfo'){selInfo();return;}
 if(a==='selCraft'){const id2=selTarget,st=id2&&selCraftState(id2);if(!st){logToast('現在沒辦法補貨。',false);return;}const p=PRODUCTS[st.product];
   if(st.merchant){const buy=game.buyMaterials(p.cost);if(!buy.ok){logToast(buy.message,false);selCraftPaint(id2);return;}r=game.craft(st.product,1);logToast(r.ok?`${buy.message} ${r.message}`:r.message,r.ok);}
   else{r=game.craft(st.product,1);logToast(r.message,r.ok);}
   paint();save();selUpgradePaint(id2);return;}
 if(a==='selUpgrade'){const id2=selTarget;const st=id2&&selUpgradeState(id2);if(!st){logToast('現在沒辦法升級這棟建築。',false);return;}const lv=game.state.buildings[id2]||0,b=BUILDINGS.find(x=>x.id===id2);
   if(st.merchant){const buy=game.buyMaterials(lv?game.getUpgradeCost(id2):b.cost);if(!buy.ok){logToast(buy.message,false);selUpgradePaint(id2);return;}r=lv?game.upgrade(id2):game.construct(id2);logToast(r.ok?`${buy.message} ${r.message}`:r.message,r.ok);}
   else{r=lv?game.upgrade(id2):game.construct(id2);logToast(r.message,r.ok);}
   paint();save();selUpgradePaint(id2);return;}
 if(a==='selCancel'){selCancel();return;}
 if(a==='rosterFilter'||a==='rosterSort'){if(a==='rosterFilter')rosterFilter=id;else rosterSort=id;return openModal('hunters');}
 if(a==='buyGems'){r=game.buyGems(1);logToast(r.message,r.ok);if(r.ok)sfx('coin');openModal('trade');save();paint();return;}   // 2026-11-18 後期金幣→星晶
 if(a==='matSell'){r=game.sellMaterial(id,MERCHANT.sellLot);logToast(r.message,r.ok);if(r.ok)sfx('coin');openModal('trade');save();paint();return;}
 if(a==='tradeStep'){const cur=game.state.tradeRequests[id]||0,v=Math.max(0,Math.min(999,cur+Number(el.dataset.d||0)));r=game.setTradeRequest(id,v);if(!r.ok)logToast(r.message,false);openModal('trade');save();return;}
 if(a==='tradeStanding'){r=game.setTradeStanding(id,!game.state.tradeStanding?.[id]);logToast(r.message,r.ok);openModal('trade');save();return;}
 if(a==='tradeAllStanding'){const ks=Object.keys(MATERIALS),on=!ks.every(k=>game.state.tradeStanding?.[k]&&game.state.tradeRequests[k]>0);for(const k of ks){if(on&&!game.state.tradeRequests[k])game.setTradeRequest(k,30);game.setTradeStanding(k,on);}logToast(on?'全部材料改為持續收購。':'已關閉持續收購，收購量保留。');openModal('trade');save();return;}
 if(a==='tradeClear'){for(const k of Object.keys(game.state.tradeRequests)){game.setTradeRequest(k,0);game.setTradeStanding(k,false);}logToast('已停止全部收購。');openModal('trade');save();return;}
 if(a==='setTrade'){const box=document.querySelector('#trade-'+id);r=game.setTradeRequest(id,Math.round(Number(box?.value??0)));logToast(r.message,r.ok);paint();save();return;}
 if(a==='collectTrade'){const t=game.state.tradeRequests,pend=Object.entries(t).filter(([,v])=>v>0).map(([k,v])=>`${MATERIALS[k]?.name||k} ${v}`);logToast(pend.length?`收購中：${pend.join('、')}（獵人回村會自動成交）`:'目前沒有發布收購委託。',pend.length>0);return;}
 if(a==='craftGearTab'){craftTab='gear';openModal('craft');return;}
 if(a==='craftTab'){craftTab=id==='gear'?'gear':'goods';openModal('craft');return;}   // 2026-10-30 分頁原本是死的(兩區一起顯示)
 if(a==='craftTargetSet'){const cur=game.state.stocks[id]||0,want=Math.max(30,Math.ceil((cur+1)/10)*10);r=game.setCraftTarget(id,want);logToast(r.ok?`${r.message}（用 −10　−　＋　＋10 調整目標）`:r.message,r.ok);paint();save();if(modal==='craft')openModal('craft');return;}   // 一鍵開尵:先給一個合理目標(目前庫存往上取整＋30，最少 30)
 if(a==='craftTargetOff'){r=game.setCraftTarget(id,0);logToast(r.message,r.ok);paint();save();if(modal==='craft')openModal('craft');return;}
 if(a==='craftTargetAllOff'){r=game.clearCraftTargets();logToast(r.message,r.ok);paint();save();if(modal==='craft')openModal('craft');return;}
 if(a==='craftTarget'){const d=Number(el.dataset.d)||0;r=game.setCraftTarget(id,game.craftTargetOf(id)+d);logToast(r.message,r.ok);paint();save();if(modal==='craft')openModal('craft');return;}   // 2026-11-19 持續製作:目標數量 ±
 if(a==='craftProduct'){r=game.craft(id,Number(el.dataset.batches||1));logToast(r.message,r.ok);paint();save();if(modal==='craft')openModal('craft');return;}   // 製作後彈窗裡的庫存數字也要更新
 if(a==='craftTier'){craftTier=Number(id)||0;openModal('craft');return;}
 if(a==='merchantCraft'){const kind=el.dataset.kind,tier=Number(el.dataset.tier)||null,cost=kind==='goods'?PRODUCTS[id]?.cost:gearAt(id,tier||1).cost;const buy=game.buyMaterials(cost);if(!buy.ok){logToast(buy.message,false);paint();if(modal==='craft')openModal('craft');return;}
   r=kind==='goods'?game.craft(id,1):game.craftEquipment(id,tier);logToast(r.ok?`${buy.message} ${r.message}`:r.message,r.ok);paint();save();if(modal==='craft')openModal('craft');return;}
 if(a==='craftGear'){const t=Number(el.dataset.tier);r=game.craftEquipment(id,Number.isInteger(t)&&t>=1?t:null);logToast(r.message,r.ok);paint();save();if(modal==='craft')openModal('craft');return;}
 if(a==='pilotLab'){closeModal();pilotOpen=true;pickOpen=false;pilotPaint();return;}
 if(a==='toggleDev'){devOpen=!devOpen;return openModal('settings');}
 if(a==='cheat'){const r2=game.cheat(id);logToast(r2.message,r2.ok);save();paint();openModal('settings');return;}
 if(a==='setUiScale'){const v=el.dataset.id==='auto'?'auto':Number(el.dataset.id);game.setSetting('uiScale',v);applySettings();save();openModal('settings');paint();logToast('介面大小：'+(v==='auto'?'自動':Math.round(v*100)+'%'));return;}
 if(a==='resetUiScale'){game.setSetting('uiScale','auto');applySettings();save();openModal('settings');paint();return;}
  if(a==='setOpt'&&el.dataset.key==='sound'){const off=el.dataset.value!=='1';sfxMuted(off);try{localStorage.setItem('mistvale-sfx',off?'0':'1');}catch{}sfx('tick');openModal('settings');logToast(off?'音效已關閉（存檔不會記，換裝置要重設）':'音效已開啟');return;}if(a==='setOpt'){const key=el.dataset.key,raw=el.dataset.value,val=key==='fps'?Number(raw):['shadows','shake'].includes(key)?raw==='1':raw;game.setSetting(key,val);applySettings();save();openModal('settings');paint();logToast('已套用：'+({quality:'畫質',dpr:'解析度',fps:'幀率',shadows:'動態影子',shake:'鏡頭震動'}[key]||key));return;}if(a==='welcomeNext'){welcomeStep=Math.min(WELCOME_STEPS.length-1,welcomeStep+1);openModal('welcome');return;}if(a==='welcomeStart'){closeModal();save();paint();return;}   /* Z2D:不再多丟一則「先派去地下城」的 toast(跟顧問重複、是第三條引導) */if(a==='welcomeHelp'){openModal('help');return;}if(a==='reset'){askConfirm('目前的進度會全部清除，無法復原。','確認',()=>{game.reset();resetUiTransientState();applySettings();started=true;world?.update(0,game.state);world?.focus('home');save();lastSave=performance.now();paint(true);logToast(`${cnNum(game.state.hunters.length)}位獵人重新抵達暮影村。`);},'settings','確定要重置村莊嗎？');return;}
 if(a==='confirmYes'||a==='confirmNo'){const req=confirmReq;confirmReq=null;if(a==='confirmYes'){closeModal();req?.onYes?.();}else if(typeof req?.back==='function')req.back();else if(req?.back)openModal(req.back);else closeModal();return;}   // back:面板名稱,或回到非 openModal 面板(例如獵人詳情)的函式
 if(a==='export'){exportSaveFile();return;}
 if(a==='importSave'){openImportPicker();return;}
}
// Save export / import helpers (validated dry-run + confirm preview + full UI state reset).
const IMPORT_MAX_BYTES=5*1024*1024;
let importInputEl=null;
function formatBackupTime(ts){
 if(!Number.isFinite(ts))return '';
 const d=new Date(ts);if(Number.isNaN(d.getTime()))return '';
 const p=n=>String(n).padStart(2,'0');
 return `${d.getFullYear()}/${p(d.getMonth()+1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function resetUiTransientState(){
 pilotStopAttack();pilotKeys.clear();pilotOpen=false;pickOpen=false;world?.setFollow(null);pilotPaint();
 placing=null;$('#placement')?.classList.add('hidden');world?.placeMode(null);
 selCancel();hideUnitCard();closeInspector();
 hc.id='';hc.tab='info';
 Z2C.resetRuns?.();dgSig='';
 downWarned.clear();downSeen=game.state.counts.deaths;
 resFloat.last=null;
 dispatchTab=0;wandererPeek=-1;invPick='';craftTier=0;liveSig='';
 bootOffline=0;hiddenAt=0;
}
function exportSaveFile(){
 try{
  const data=game.serialize(),now=Date.now();
  data.savedAt=now;data.exportedAt=now;
  const blob=new Blob([JSON.stringify(data)],{type:'application/json'}),u=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=u;link.download='暮影村-像素存檔.json';link.style.display='none';
  document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(u),5000);
  logToast('已匯出存檔（暮影村-像素存檔.json）。');
 }catch(err){console.error(err);logToast('匯出存檔失敗，請稍後再試。',false,'error',5000);}
}
function applyImportedSave(payload){
 const r=game.loadSave(payload);
 if(!r.ok){logToast('無法匯入：'+r.message,false,'error',5000);openModal('settings');return;}
 resetUiTransientState();
 bootHadSave=true;firstRun=false;started=true;
 applySettings();
 world?.update(0,game.state);
 world?.focus('home');
 save();lastSave=performance.now();
 paint(true);
 logToast(r.message,true);
}
async function handleImportFile(file){
 if(!file)return;
 if(file.size===0){logToast('無法匯入：選擇的檔案是空的。',false,'error',5000);return;}
 if(file.size>IMPORT_MAX_BYTES){logToast('無法匯入：檔案過大（上限 5 MB）。',false,'error',5000);return;}
 let text='';
 try{
  text=typeof file.text==='function'?await file.text():await new Promise((res,rej)=>{const fr=new FileReader();fr.onload=()=>res(String(fr.result||''));fr.onerror=()=>rej(fr.error);fr.readAsText(file);});
 }catch{logToast('無法匯入：讀取檔案失敗。',false,'error',5000);return;}
 const check=inspectSave(text);
 if(!check.ok){logToast('無法匯入：'+check.error,false,'error',5000);return;}
 const s=check.summary;
 const parts=[`遊戲時間 ${playTimeText(s.time)}`,`大廳 Lv.${s.hall}`,`金幣 ${fmt(s.gold)}`,`星晶 ${fmt(s.gems)}`,`獵人 ${s.hunters} 位`,`地下城第 ${s.bestFloor} 層`,`難度 ${s.difficulty}`];
 const when=formatBackupTime(s.savedAt);
 const mig=s.migrated?`這份是舊版（v${s.version}）存檔，匯入後會自動升級。`:'';
 const msg=`存檔內容：${parts.join(' · ')}${when?`（備份時間 ${when}）`:''}。${mig}匯入後會覆蓋目前的村莊進度，無法復原。`;
 askConfirm(msg,'確認匯入',()=>applyImportedSave(check.data),'settings','確定要匯入這份存檔嗎？');
}
function ensureImportInput(){
 if(importInputEl&&importInputEl.isConnected)return importInputEl;
 importInputEl=document.createElement('input');
 importInputEl.id='save-import-file';
 importInputEl.type='file';
 importInputEl.accept='.json,application/json,text/plain';
 importInputEl.hidden=true;
 importInputEl.tabIndex=-1;
 importInputEl.setAttribute('aria-hidden','true');
 importInputEl.addEventListener('change',()=>{const file=importInputEl.files&&importInputEl.files[0];importInputEl.value='';if(file)handleImportFile(file);});
 document.body.append(importInputEl);
 return importInputEl;
}
function openImportPicker(){const input=ensureImportInput();input.value='';input.click();}
// 把 state.settings 套到畫面:畫質、解析度上限、影子、幀率(2026-11-26 夜晚設定隨日夜一起拿掉)
// 區域卡的魔物圖鑑:有寫介紹的魔物才列(src/lore.js)
const loreList=id=>{const m=(REGION_MONSTERS[id]||[]).filter(k=>MONSTER_LORE[k]);return m.length?`<ul class="lore-list">${m.map(k=>`<li><b>${MONSTER_NAME[k]||k}</b>${MONSTER_LORE[k]}</li>`).join('')}</ul>`:'';};
let craftTab='goods',craftTier=0,invPick='',equipHid='',equipOnlyUsable=false,equipTidyOpen=false,equipPickOpen=false;   // equipHid:裝備倉庫目前看的獵人(整個 session 記住,不隨重開重置)
// 2026-10-30 獵人名冊:篩選(全部/近戰/遠程/需要照顧/倒下)＋排序(等級/稀有度/職業/生命),遊戲開著時記住選擇
let rosterFilter='all',rosterSort='level';
const ROSTER_F=[['all','全部'],['melee','近戰'],['ranged','遠程'],['care','需要照顧'],['down','倒下']],ROSTER_S=[['level','等級'],['rarity','稀有度'],['class','職業'],['hp','生命']];
const needsCare=h=>h.hp>0&&(h.hp<h.maxHp*.5||h.satiety<30||h.stamina<30||h.mood<30);
// 名冊血條狀態:健康 / 受傷(25–60%) / 危急(<25%);hp 0 的倒地獵人一定落在危急
const hpState=h=>{const r=Math.max(0,h.hp)/Math.max(1,h.maxHp);return r<.25?'critical':r<.6?'hurt':'healthy';};
// 狀態文字:倒地紅、受傷／需要照顧琥珀、其餘維持原本的中性色
const statusTone=h=>h.hp<=0?'down':hpState(h)==='hurt'||needsCare(h)?'care':'';
function rosterList(all){const rng=h=>(CLASSES.find(c=>c.id===h.classId)?.range||0)>=3,f={all:()=>true,melee:h=>!rng(h),ranged:rng,care:needsCare,down:h=>h.hp<=0}[rosterFilter]||(()=>true);
 const rk=h=>RARITIES.findIndex(r=>r.id===h.rarity),ck=h=>CLASSES.findIndex(c=>c.id===h.classId);
 const cmp={level:(a,b)=>b.level-a.level||rk(b)-rk(a),rarity:(a,b)=>rk(b)-rk(a)||b.level-a.level,class:(a,b)=>ck(a)-ck(b)||b.level-a.level,hp:(a,b)=>a.hp/a.maxHp-b.hp/b.maxHp}[rosterSort];return all.filter(f).sort(cmp);}
function rosterBar(total,shown){const seg=(act,opts,cur)=>opts.map(([v,l])=>`<button class="pixel-button ${cur===v?'gold':''}" data-action="${act}" data-id="${v}" aria-pressed="${cur===v}">${l}</button>`).join('');
 return `<div class="roster-bar" id="roster-menu"><div><span>篩選</span>${seg('rosterFilter',ROSTER_F,rosterFilter)}</div><div><span>排序</span>${seg('rosterSort',ROSTER_S,rosterSort)}</div><em>顯示 ${shown} / ${total} 位</em></div>`;}   // 製作彈窗目前的分頁:goods 生活物資／gear 裝備製作
// 2026-11-11 第二階段:名冊篩選/排序收成頁籤列右側一顆鈕(展開才出現上面那排切換鈕)
let rosterMenu=false;
// 2026-11-19:名冊捲動位置。點卡片進詳情時記住,closeModal 回名冊時還原(使用者要求關掉後留在名冊)。
let rosterScroll=0;
// 獵人卡底色依狀態:狩獵＝暗紅、休息＝藍灰、用餐＝暖橘、受傷＝紫、倒下＝灰、地下城/競技場＝靛、其他待機＝炭
const hunterState=h=>{const st=h.status||'';if(h.hp<=0||h.task==='revive')return 'down';if(h.task==='dungeon'||h.task==='arena')return 'away';if(/用餐|飲用/.test(st))return 'eat';if(/休息|休養|治療/.test(st))return 'rest';if(hpState(h)!=='healthy'||needsCare(h))return 'hurt';if(/戰鬥|追擊|狩獵|出征|前往|搜尋|後撤|返村/.test(st))return 'hunt';return 'idle';};
const RARITY_LETTER={normal:'N',rare:'R',superior:'S',heroic:'H',legendary:'L'};
// 2026-11-16 獵魔村式:名冊卡直接看出誰餓了／累了／心情差(<30),不用一張張點進詳情
const NEED_LOW=30,NEEDS=[['satiety','food','肚子餓'],['stamina','bed','很累'],['mood','drink','心情差']];
function needBadges(h){if(!(h.hp>0))return '';const low=NEEDS.filter(([k])=>(h[k]??100)<NEED_LOW);return low.length?`<span class="hc-needs" aria-label="${low.map(n=>n[2]).join('、')}" title="${low.map(n=>n[2]).join('、')}">${low.map(([,ic])=>iconHTML(ic,true)).join('')}</span>`:'';}
function hunterCardHTML(h){const r=RARITIES.find(v=>v.id===h.rarity),cls=CLASSES.find(c=>c.id===h.classId),st=hunterState(h),pct=Math.max(0,Math.min(100,h.hp/h.maxHp*100));
 // 2026-11-19 使用者:點卡片本體就直接開這位獵人的操作(以前要先按右上角金色 i 徽章),所以整張卡自己帶 data-action="hunter";
// 右上那顆 i 拿掉,卡片改成可聚焦(tabindex=0),鍵盤 Enter／空白鍵在下面的 keydown 監聽裡處理。
return `<article class="hv-hcard" role="listitem" tabindex="0" data-action="hunter" data-id="${h.id}" data-state="${st}" data-rarity="${h.rarity}" style="--rarity:${r?.color||'#d3cab2'}"><header class="hc-head"><em class="hc-rar" title="${r?.name||''}" aria-label="稀有度 ${r?.name||''}">${r?.name||'普通'}</em></header><div class="hc-art"><img data-portrait="${h.id}" alt="">${needBadges(h)}${h.level>=100?`<button class="hc-reb" data-action="nextStepGo" data-act="rebirth:${h.id}" aria-label="${esc(h.name)} 已 Lv.100，可以轉世" title="Lv.100：到復活聖所轉世，能力會更強">可轉世</button>`:""}</div><b class="hc-name">${esc(h.name)}</b><small class="hc-sub">Lv.${h.level} ${cls?.name||''}</small><p class="hc-status">${esc(h.task==='revive'?`復活中 ${Math.ceil(h.reviveTimer)} 秒`:h.status)}</p><div class="tiny-health hc-hp ${hpState(h)}" data-health="${hpState(h)}" role="img" aria-label="生命 ${hpShow(h.hp,h.maxHp)}/${Math.ceil(h.maxHp)}"><span style="width:${pct}%" data-lhp="${h.id}" data-lhk="fill"></span></div><div class="hc-btns"><button type="button" class="hv-btn hc-loc" data-action="locateHunter" data-id="${h.id}" aria-label="在地圖上找到 ${esc(h.name)}" title="在地圖上找到 ${esc(h.name)}">${iconHTML('locate',true)}</button></div></article>`;}
// 面板頂部頁籤列右側的小工具(面板名＝選中的頁籤在左,這組在右、X 之前)
function modalTools(type){
 if(type==='hunters'){const lab=(ROSTER_F.find(x=>x[0]===rosterFilter)||[])[1]+' · '+(ROSTER_S.find(x=>x[0]===rosterSort)||[])[1];
  return `<button class="hv-tool${rosterMenu?' on':''}" data-action="rosterMenu" aria-expanded="${rosterMenu}" aria-controls="roster-menu" aria-label="篩選與排序（目前 ${lab}）"><span>篩選</span><small class="hv-tool-cur">${lab}</small><i class="hv-caret" aria-hidden="true"></i></button><span class="hv-tool-sep" aria-hidden="true"></span><button class="hv-tool" data-action="dispatchHunters" aria-label="派遣出征"><span class="hv-long">派遣出征</span><span class="hv-short" aria-hidden="true">派遣</span></button><button class="hv-tool" data-action="recallHunters" aria-label="召回村內"><span class="hv-long">召回村內</span><span class="hv-short" aria-hidden="true">召回</span></button>`;}   // Z2A:「招募」搬到標題列的子頁籤(名冊｜招募)
 return '';}
let devOpen=false;   // 設定頁「開發者作弊」是否展開
// 動作實驗室的面板 2026-10-29 移除（使用者）；pixel-world.js 的 __mistvalePoseLab 留著給 paladin-anchor-lab 的檢查腳本用
// ── 手動操控:手機遊戲式。左下類比搖桿走路、右下大顆攻擊鈕出手,鏡頭把角色本體釘在畫面正中央 ──
let pilotEl=null,pilotHud=null,stickEl=null,knobEl=null,cdEl=null,skillCdEl=null,skillCooling=false,stickId=null,atkHold=0,pilotOpen=false,pickOpen=false,pilotShownId=null,pilotShownSpec='',pilotShownLv=-1;
let elLv=null,elStatus=null,elHp=null,elFill=null,cdCooling=false;
const pilotKeys=new Set();
const STICK_R=46,STICK_DEAD=5,ATK_POLL=90;   // 搖桿半徑/死區(px)、按住攻擊鈕時多久檢查一次 CD(ms)
function pilotAlive(){return (game?.state?.hunters||[]).filter(h=>h.hp>0);}
function pilotCur(){const p=game?.state?.pilot;return p?(game.state.hunters.find(h=>h.id===p.id)||null):null;}
// 鏡頭:每幀把「這位角色」交給世界並要求把本體釘在畫面中央(snap),邊走邊打也不會漂走
function pilotFollow(){
  const cur=pilotCur(); if(!cur){world?.setFollow(null);return;}
  const id=cur.id;
  world?.setFollow(()=>{const q=game.state.hunters.find(v=>v.id===id);return q&&q.hp>0?{x:q.x,z:q.z}:null;},{centerBody:true,snap:true});
}
function pilotKnob(dx,dy){if(knobEl)knobEl.style.transform=`translate(${Math.round(dx)}px,${Math.round(dy)}px)`;}
// 手指在搖桿盤上的位置 → 世界方向。往左上拖就往畫面左上走(等角投影由 dirFromScreen 換算)
function pilotStickTo(e){
  if(!stickEl)return;
  const r=stickEl.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;
  const dx=e.clientX-cx,dy=e.clientY-cy,len=Math.hypot(dx,dy)||1,k=Math.min(1,STICK_R/len);
  pilotKnob(dx*k,dy*k);
  if(len<STICK_DEAD||!game?.state?.pilot){game?.pilotInput(0,0);return;}
  const d=world?.dirFromScreen?.(dx,dy)||{x:dx,z:dy};
  game.pilotInput(d.x,d.z);
}
function pilotStickEnd(){stickId=null;pilotKnob(0,0);if(game?.state?.pilot)game.pilotInput(0,0);}
function pilotStopAttack(){if(atkHold){clearInterval(atkHold);atkHold=0;}}
// 攻擊鈕的 CD 遮罩:從下往上収(剩越多遮越高)。每隔一幀更新一次,按住時才看得出什麼時候可以再打。
function pilotHudTick(){
  if(!cdEl)return;
  const cd=game?.pilotCooldown?.()||0;
  cdEl.style.height=`${Math.round(Math.min(1,cd/PILOT_ATTACK.cd)*100)}%`;
  if(cdEl.parentElement&&cdCooling!==(cd>0)){cdCooling=cd>0;cdEl.parentElement.classList.toggle('cool',cdCooling);}
  if(skillCdEl){
    const scd=game?.pilotSkillCooldown?.()||0, info=game?.pilotSkills?.(), max=info?.slots?.[0]?.maxCd||1;
    skillCdEl.style.height=`${Math.round(Math.min(1,scd/max)*100)}%`;
    if(skillCdEl.parentElement&&skillCooling!==(scd>0)){skillCooling=scd>0;skillCdEl.parentElement.classList.toggle('cool',skillCooling);}
  }
  if(pilotEl||pilotHud){
    const info=game?.pilotSkills?.();
    if(info){
      for(const sk of info.slots){
        const cool=sk.unlocked&&sk.cd>0,pct=cool?`${Math.round(Math.min(1,sk.cd/Math.max(1,sk.maxCd))*100)}%`:'0%';
        const subTxt=!sk.unlocked?`Lv.${sk.unlockLv}`:cool?`${Math.ceil(sk.cd)}s`:(sk.shapeTag||'就緒');
        for(const root of [pilotEl,pilotHud]){
          const btn=root?.querySelector(`[data-pilot-slot="${sk.slot}"]`);
          if(!btn)continue;
          btn.classList.toggle('cool',cool);
          btn.classList.toggle('far',sk.unlocked&&!sk.inRange);
          const cdBar=btn.querySelector('.pl-sk-cd,.ph-sk-cd');
          if(cdBar)cdBar.style.height=pct;
          const sub=btn.querySelector('.pl-sk-s,.ph-sk-s');
          if(sub)sub.textContent=!sk.unlocked?`Lv.${sk.unlockLv}`:cool?`${Math.ceil(sk.cd)}s`:(btn.classList.contains('ph-sk')?sk.name.slice(0,2):subTxt);
        }
      }
    }
  }
}
function pilotCastAction(slotIdx){
  if(!game?.state?.pilot)return;
  const r=game.pilotCastSlot?.(slotIdx);
  if(r&&!r.ok){logToast(r.message,false);return;}
  if(r&&r.empty){
    for(const root of [pilotEl,pilotHud]){
      const btn=root?.querySelector(`[data-pilot-slot="${slotIdx}"]`);
      if(!btn)continue;
      btn.classList.remove('miss'); void btn.offsetWidth; btn.classList.add('miss');
      setTimeout(()=>btn.classList.remove('miss'),700);
    }
  }
  try{navigator.vibrate?.(14);}catch{}
}
function ensurePilotHud(){
  if(pilotHud)return;
  pilotHud=document.createElement('div');pilotHud.id='pilot-hud';
  pilotHud.innerHTML=`<div class="ph-stick" id="pilot-stick"><span class="ph-base"></span><span class="ph-knob" id="pilot-knob"></span></div>
    <div class="ph-actions"><div class="ph-arc" id="pilot-arc" role="group" aria-label="技能快捷弧"></div><button class="ph-btn ghost" data-pilot="stop" aria-label="離開操控">✕<small>離開</small></button><button class="ph-btn" id="pilot-skill" aria-label="施放技能"><span class="ph-cd"></span><i data-icon="star"></i><small>技能</small></button><button class="ph-btn" id="pilot-atk" aria-label="出手攻擊"><span class="ph-cd"></span><i data-icon="swords"></i><small>攻擊</small></button></div>`;
  document.body.appendChild(pilotHud);
  stickEl=pilotHud.querySelector('#pilot-stick');knobEl=pilotHud.querySelector('#pilot-knob');cdEl=pilotHud.querySelector('#pilot-atk .ph-cd');skillCdEl=pilotHud.querySelector('#pilot-skill .ph-cd');
  // 技能鈕換成紫色(不進 CSS 檔,避免跟其他 agent 的樣式改動混在一起)
  {const b=pilotHud.querySelector('#pilot-skill');if(b){b.style.background='radial-gradient(circle at 50% 30%,#d3b0f2,#8a63c0 60%,#4a2f78)';b.style.color='#2a1840';b.style.boxShadow='inset 2px 2px #eeddff,inset -2px -3px #37235c,0 4px 0 #171006';}}
  stickEl.addEventListener('pointerdown',e=>{e.preventDefault();try{stickEl.setPointerCapture(e.pointerId);}catch{}stickId=e.pointerId;pilotStickTo(e);});
  stickEl.addEventListener('pointermove',e=>{if(e.pointerId!==stickId)return;e.preventDefault();pilotStickTo(e);});
  for(const t of ['pointerup','pointercancel','lostpointercapture'])stickEl.addEventListener(t,e=>{if(t==='lostpointercapture'||e.pointerId===stickId)pilotStickEnd();});
  // 按一下打一次,按住就等 CD 好再打(CD 由遊戲邏輯管,這裡只是不白按)
  const atk=pilotHud.querySelector('#pilot-atk'),fire=()=>{if(!game?.state?.pilot||(game.pilotCooldown?.()||0)>0)return;game.pilotAttack();try{navigator.vibrate?.(10);}catch{}};
  atk.addEventListener('pointerdown',e=>{e.preventDefault();fire();pilotStopAttack();atkHold=setInterval(fire,ATK_POLL);});
  for(const t of ['pointerup','pointercancel','lostpointercapture'])atk.addEventListener(t,pilotStopAttack);
  // 技能鈕:點一下放技能(冷卻中會提示)。沒有目標也放,朝面向空放給玩家看特效。
  const skill=pilotHud.querySelector('#pilot-skill');
  skill.addEventListener('pointerdown',e=>{e.preventDefault();pilotCastAction(0);});
  // 手機右下 4 技能弧形鈕(pointerdown 直接觸發,零 300ms 延遲)
  const arc=pilotHud.querySelector('#pilot-arc');
  arc?.addEventListener('pointerdown',e=>{const b=e.target.closest('[data-pilot-slot]');if(!b)return;e.preventDefault();pilotCastAction(Number(b.dataset.pilotSlot));});
}
function pilotPickList(){
  const cur=pilotCur();
  return pilotAlive().map(h=>`<button class="pixel-button ${cur&&cur.id===h.id?'gold':''}" data-pilot="go" data-id="${h.id}">${esc(h.name)} · ${CLASSES.find(c=>c.id===h.classId)?.name||h.classId} Lv.${h.level}</button>`).join('');
}
function pilotPaint(){
  const cur=pilotCur(),need=pilotOpen||!!cur;
  document.body.classList.toggle('piloting',!!cur);
  if(!need){pilotEl?.remove();pilotEl=null;pilotHud?.remove();pilotHud=null;stickEl=knobEl=cdEl=null;stickId=null;pilotStopAttack();elLv=elStatus=elHp=elFill=null;return;}
  if(!pilotEl){pilotEl=document.createElement('div');pilotEl.id='pilotlab';document.body.appendChild(pilotEl);}
  if(!cur){   // 還沒選角色:只列清單
    pilotHud?.remove();pilotHud=null;stickEl=knobEl=cdEl=null;stickId=null;pilotStopAttack();
    pilotEl.innerHTML=`<div class="pl-head"><b>手動操控</b><span>選一位獵人開始</span><button class="pixel-button" data-pilot="close">關閉</button></div>
      <div class="pl-pick">${pilotPickList()||'<small>沒有存活的獵人</small>'}</div>`;
    elLv=elStatus=elHp=elFill=null;pilotShownId=null;return;
  }
  ensurePilotHud();
  const skInfo=game?.pilotSkills?.();
  const skBar=skInfo?`<div class="pl-skills" role="group" aria-label="手動技能快捷列">${skInfo.slots.map(sk=>{
    const cool=sk.unlocked&&sk.cd>0,pct=cool?Math.round(Math.min(1,sk.cd/Math.max(1,sk.maxCd))*100):0;
    const sub=!sk.unlocked?`Lv.${sk.unlockLv}`:cool?`${Math.ceil(sk.cd)}s`:(sk.shapeTag||'就緒');
    return `<button type="button" class="pixel-button pl-sk${sk.unlocked?'':' locked'}${cool?' cool':''}${sk.unlocked&&!sk.inRange?' far':''}" data-pilot-slot="${sk.slot}" style="--sk:${sk.color}"${sk.unlocked?'':' aria-disabled="true"'} title="${esc(sk.desc)}"><span class="pl-sk-cd" style="height:${pct}%"></span><span class="pl-sk-k">${sk.slot+1}</span><b class="pl-sk-n">${esc(sk.name)}</b><small class="pl-sk-s">${sub}</small></button>`;
  }).join('')}</div>`:'';
  const arcEl=pilotHud?.querySelector('#pilot-arc');
  if(arcEl&&skInfo){
    arcEl.innerHTML=skInfo.slots.map(sk=>{
      const cool=sk.unlocked&&sk.cd>0,pct=cool?Math.round(Math.min(1,sk.cd/Math.max(1,sk.maxCd))*100):0;
      const sub=!sk.unlocked?`Lv.${sk.unlockLv}`:cool?`${Math.ceil(sk.cd)}s`:esc(sk.name.slice(0,2));
      return `<button type="button" class="ph-sk s${sk.slot}${sk.unlocked?'':' locked'}${cool?' cool':''}${sk.unlocked&&!sk.inRange?' far':''}" data-pilot-slot="${sk.slot}" style="--sk:${sk.color}"${sk.unlocked?'':' aria-disabled="true"'} aria-label="技能 S${sk.slot+1}：${esc(sk.name)}"><span class="ph-sk-cd" style="height:${pct}%"></span><b class="ph-sk-k">S${sk.slot+1}</b><small class="ph-sk-s">${sub}</small></button>`;
    }).join('');
  }
  pilotEl.innerHTML=`<div class="pl-head"><b id="pilot-name">${esc(cur.name)}</b><span id="pilot-lv">Lv.${cur.level}${skInfo?` · ${esc(skInfo.specName)}`:''}</span>
    <div class="pl-hp progress"><span id="pilot-fill" style="width:${Math.max(0,Math.min(100,cur.hp/cur.maxHp*100))}%"></span><b id="pilot-hp">${Math.round(cur.hp)}/${Math.round(cur.maxHp)}</b></div>
    <span id="pilot-status">${esc(cur.status)}</span>
    <button class="pixel-button" data-pilot="pick">換角色</button><button class="pixel-button danger" data-pilot="stop">離開</button></div>
    ${pickOpen?`<div class="pl-pick">${pilotPickList()}</div>`:''}
    ${skBar}
    <small class="pl-tip">左下搖桿移動 · 右下攻擊鈕出手 · 數字 1–4 或 Q／E 施放流派技能（無目標也可空放展示）</small>`;
  elLv=$('#pilot-lv');elStatus=$('#pilot-status');elHp=$('#pilot-hp');elFill=$('#pilot-fill');pilotShownId=cur.id;pilotShownSpec=cur.spec||'';pilotShownLv=cur.skillLevel||0;
}
// 每 400ms 跟著 paint() 更新血條與狀態(只改文字,不重畫整塊,才不會打斷按住螢幕的手指;換人/換流派/技能升級才重畫)
function pilotStatus(){
  if(!pilotEl)return;
  const cur=pilotCur();
  if(!cur){if(pilotShownId!==null)pilotPaint();return;}   // 角色倒下/被收回:立刻把搖桿收起來(不要留一個沒人可控的介面)
  if(cur.id!==pilotShownId||(cur.spec||'')!==pilotShownSpec||(cur.skillLevel||0)!==pilotShownLv){pilotPaint();return;}
  if(elLv){const info=game?.pilotSkills?.();elLv.textContent=`Lv.${cur.level}${info?` · ${info.specName}`:''}`;}
  if(elStatus)elStatus.textContent=cur.status;
  if(elHp)elHp.textContent=`${Math.round(cur.hp)}/${Math.round(cur.maxHp)}`;
  if(elFill)elFill.style.width=`${Math.max(0,Math.min(100,cur.hp/cur.maxHp*100))}%`;
}
// 方向鍵 = 畫面方向(2026-11-13 起 4 方向:↑ 走畫面上、→ 走畫面右;以前送的是世界軸,在等角畫面上是斜的)。
// 兩鍵同按 = 畫面斜向,2026-11-15 起真的斜走;動畫方向由 pixel-world 依 4 象限決定(正斜 45° 在邊界上 → 維持上一個方向)。
function pilotInputFromKeys(){const k=pilotKeys;const sx=(k.has('right')?1:0)-(k.has('left')?1:0),sy=(k.has('down')?1:0)-(k.has('up')?1:0);
  if(!sx&&!sy){game.pilotInput(0,0);return;}const d=world?.dirFromScreen?.(sx,sy)||{x:(sx+2*sy)/2,z:(2*sy-sx)/2};game.pilotInput(d.x,d.z);}
const PILOT_KEYS={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',w:'up',s:'down',a:'left',d:'right',W:'up',S:'down',A:'left',D:'right'};
document.addEventListener('keydown',e=>{
  if(!game?.state?.pilot)return;
  if(e.target.matches?.('input,textarea,select'))return;
  if(e.key===' '||e.key==='j'||e.key==='J'){e.preventDefault();game.pilotAttack();return;}
  if(e.key==='q'||e.key==='Q'||e.key==='e'||e.key==='E'){e.preventDefault();pilotCastAction(0);return;}
  if(e.key==='1'||e.key==='2'||e.key==='3'||e.key==='4'){e.preventDefault();e.stopImmediatePropagation();pilotCastAction(Number(e.key)-1);return;}
  const d=PILOT_KEYS[e.key];if(d){e.preventDefault();pilotKeys.add(d);pilotInputFromKeys();}
});
document.addEventListener('keyup',e=>{const d=PILOT_KEYS[e.key];if(d){pilotKeys.delete(d);if(game?.state?.pilot)pilotInputFromKeys();}});
/* T139:scroll-hint-listener */
document.addEventListener('scroll',e=>{if(e.target&&e.target.id==='modal-content')syncScrollHint();},true);
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-pilot]'); if(!b)return;
  const a=b.dataset.pilot;
  if(a==='close'){pilotOpen=false;pickOpen=false;pilotPaint();return;}
  if(a==='pick'){pickOpen=!pickOpen;pilotPaint();return;}
  if(a==='stop'){pilotStopAttack();pilotKeys.clear();game.pilotStop();pilotOpen=false;pickOpen=false;world?.setFollow(null);pilotPaint();return;}
  if(a==='go'){const r=game.pilotStart(b.dataset.id);logToast(r.message,r.ok);
    if(r.ok){pilotOpen=true;pickOpen=false;pilotKeys.clear();const h=pilotCur();
      if(h)world?.lookAt(h.x,h.z,Math.max(1.9,world?.getScale?.()||1.9));
      pilotFollow();}
    pilotPaint();return;}
});
// FIX-A B3:選角清單(還沒開始操控)開著時,點清單外面(畫面其他地方)就收起來;pointerdown 先於 click,不會把剛按下的「手動操控」鈕又關掉
document.addEventListener('pointerdown',e=>{if(!pilotOpen||pilotCur()||!pilotEl)return;if(e.target.closest?.('#pilotlab'))return;pilotOpen=false;pickOpen=false;pilotPaint();},true);
// 操控模式四格流派技能列 + 舊測試特效鈕相容(#pilot-arc 已在 pointerdown 處理,只處理 #pilotlab 點擊避免雙觸發)
document.addEventListener('click',e=>{const b=e.target.closest('#pilotlab [data-pilot-slot]');if(!b)return;pilotCastAction(Number(b.dataset.pilotSlot));});
document.addEventListener('click',e=>{const b=e.target.closest('[data-pilot-fx]');if(!b)return;const r=game?.pilotTestFx?.(b.dataset.pilotFx);if(r&&!r.ok)logToast(r.message,false);});
let settingsOpen=false;   // 設定面板的「畫質與效能」是否展開(預設收成一條)
// 2026-11-01 介面大小＝Minecraft 式 GUI Scale：自動或固定級距，選的存成 state.settings.uiScale（'auto' 或 0.75/0.85/1/1.15/1.3/1.5）。
// 2026-11-11 第二階段:介面只放大不縮小(#game-ui／#topbar 的 zoom 是 max(1,--ui-scale)),75%／85% 兩個級距早就沒有作用 → 移除。
// 舊存檔存的 0.75／0.85 會在 uiScaleSnap 落到 100%(這只是顯示設定,不是遊戲存檔結構)。
const UI_SCALE_STEPS=[1,1.15,1.3,1.5];
const uiScaleLabel=st=>st==='auto'?'自動':Math.round(st*100)+'%';
// 這台機器容得下的最大倍率：桌機 1280x760、手機 402x712
// 2026-11-10：桌機寬度基準 1280 → 1180。1024 寬原本只能用 75%（12px 的字實際 9px）；實測 85% 時 HUD 各元件仍不重疊。
function uiScaleMaxRaw(){const d=innerWidth>760;return Math.min(innerWidth/(d?1180:402),innerHeight/(d?760:712));}
function uiScaleFit(){let f=UI_SCALE_STEPS[0];for(const s of UI_SCALE_STEPS)if(s<=uiScaleMaxRaw())f=s;return f;}   // 放得進畫面的最大級距（最小 100%）
// 自動：100%；只有大螢幕放得下 150% 才用 150%。不挑 115%／130%：像素圖示要整數倍放大(32px 的圖示在 115% 會變成 36.8px、邊緣糊掉)。
function uiScaleAuto(){return uiScaleFit()>=1.5?1.5:1;}
let uiScaleSetting='auto';
function uiScaleSnap(v){if(v==='auto'||v==null)return'auto';const n=Number(v);if(!Number.isFinite(n))return'auto';if(n<1)return 1;return UI_SCALE_STEPS.reduce((a,b)=>Math.abs(b-n)<Math.abs(a-n)?b:a);}
function uiScaleUsed(){return uiScaleSetting==='auto'?uiScaleAuto():Math.min(uiScaleSetting,uiScaleFit());}   // 手動選的放不下時先套放得下的最大級距，但設定值不動
function uiScaleNowText(){const used=uiScaleUsed();return uiScaleSetting==='auto'?`自動（實際 ${Math.round(used*100)}%）`:uiScaleSetting===used?uiScaleLabel(uiScaleSetting):`${uiScaleLabel(uiScaleSetting)}（實際 ${Math.round(used*100)}%）`;}
function uiScaleRow(){const fit=uiScaleFit();
  const btn=st=>{const over=st!=='auto'&&st>fit,on=st===uiScaleSetting,tip=over?'螢幕太小':st==='auto'?'依螢幕自動挑最大的級距':'介面放大到 '+Math.round(st*100)+'%';
    return `<button class="pixel-button ${on?'gold':''}" data-action="setUiScale" data-id="${st}" data-uiscale-step="${st}" aria-pressed="${on}" aria-disabled="${over}" title="${tip}" ${over?'disabled':''}>${uiScaleLabel(st)}</button>`;};
  return `<div class="setting-row" data-uiscale-row><div><strong>介面大小</strong><small>按鈕、文字與面板一起放大，地圖不變。自動：大螢幕放得下就用 150%。螢幕放不下的級距會變灰。</small></div><div class="ui-scale" role="group" aria-label="介面大小"><div class="ui-scale-steps">${['auto',...UI_SCALE_STEPS].map(btn).join('')}</div><span class="ui-scale-now" data-uiscale-now>目前：${uiScaleNowText()}</span></div></div>`;}
function syncUiScaleRow(){const row=document.querySelector('[data-uiscale-row]');if(!row)return;const fit=uiScaleFit();
  for(const b of row.querySelectorAll('[data-uiscale-step]')){const st=b.dataset.uiscaleStep==='auto'?'auto':Number(b.dataset.uiscaleStep),over=st!=='auto'&&st>fit,on=st===uiScaleSetting;
    b.disabled=over;b.setAttribute('aria-disabled',String(over));b.setAttribute('aria-pressed',String(on));b.classList.toggle('gold',on);b.title=over?'螢幕太小':st==='auto'?'依螢幕自動挑最大的級距':'介面放大到 '+Math.round(st*100)+'%';}
  const now=row.querySelector('[data-uiscale-now]');if(now)now.textContent='目前：'+uiScaleNowText();}
// 整組 HUD/彈窗用 CSS 變數縮放（地圖與 canvas 不動）
function applyUiScale(v){uiScaleSetting=uiScaleSnap(v);const k=uiScaleUsed();document.documentElement.style.setProperty('--ui-scale',k);document.documentElement.dataset.uiScale=String(k);syncUiScaleRow();}
addEventListener('resize',()=>applyUiScale(uiScaleSetting));
addEventListener('orientationchange',()=>applyUiScale(uiScaleSetting));
// ←/→ 在可用級距之間移動焦點（Minecraft 的方向鍵習慣）
document.addEventListener('keydown',e=>{if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight')return;const b=e.target.closest?.('[data-uiscale-step]');if(!b)return;
  const list=[...document.querySelectorAll('[data-uiscale-step]')].filter(x=>!x.disabled),i=list.indexOf(b);if(i<0)return;e.preventDefault();
  list[(i+(e.key==='ArrowRight'?1:list.length-1))%list.length].focus();});
function applySettings(){const o=game?.state?.settings||{};try{sfxMuted(localStorage.getItem('mistvale-sfx')==='0');}catch{}world?.setQuality?.(o.quality!=='low');world?.setDpr?.(o.dpr||'auto');world?.setShadows?.(o.shadows!==false);fpsTarget=o.fps===60?60:30;applyUiScale(o.uiScale);}
let fpsTarget=30;
function hunterCycleOrder(){const all=game.state.hunters||[],list=rosterList(all);return list.some(x=>x.id===hc.id)?list:all;}
function cycleHunter(dir){const list=hunterCycleOrder();if(list.length<=1)return;const i=list.findIndex(x=>x.id===hc.id),next=list[(Math.max(0,i)+dir+list.length)%list.length];if(next)openHunter(next.id,true);}
function paintHunterNav(id){const g=$('#modal-ghost');if(!g)return;const list=hunterCycleOrder(),i=list.findIndex(x=>x.id===id);
 if(list.length<=1||i<0){g.classList.remove('z2-hnav');g.innerHTML='';return;}
 const prev=list[(i-1+list.length)%list.length],next=list[(i+1)%list.length];
 g.classList.add('z2-hnav');
 g.innerHTML=`<button type="button" class="z2-hnav-btn prev" data-action="hunterCycle" data-id="prev" aria-label="上一位獵人：${esc(prev.name)}" title="上一位：${esc(prev.name)}（←）">‹</button>`
  +`<button type="button" class="z2-hnav-btn next" data-action="hunterCycle" data-id="next" aria-label="下一位獵人：${esc(next.name)}" title="下一位：${esc(next.name)}（→）">›</button>`;}
function openHunter(id,keepTab=false){const h=game.state.hunters.find(v=>v.id===id);if(!h)return;const wasOpen=modalShown(),prev=wasOpen?document.activeElement:null;if(!wasOpen)modalOpener=document.activeElement;
 // 2026-11-19:從名冊點進來的,記住名冊捲到哪 —— 關掉獵人卡要回到同一格(closeModal 會用到)。
 if(modal==='hunters'){const c0=$('#modal-content');rosterScroll=c0?c0.scrollTop:0;}
 const prevHunter=modal==='hunter-detail'?hc.id:'';modal='hunter-detail';$('#modal').dataset.type='hunter';$('#modal').dataset.kind='';modalTitle('hunter','hunter');{const mt=$('#modal-tools');if(mt)mt.innerHTML='';}if(!keepTab&&(!wasOpen||prevHunter!==id))hc.tab='info';hc.id=id;$('#modal-content').innerHTML=hunterDetailHTML(h);$('#modal-title').textContent=h.name;paintHunterNav(id);const zMode=setModalMode('hunter');paintSubtabs('hunter');setIcons($('#modal-content'));mountFoot('hunter',zMode);setIcons($('#modal-foot'));$('#modal-backdrop').classList.remove('hidden');document.body.dataset.modalTab='hunters';measureHud();hudInert(true);focusModalStart(prev);paintPanelRes(game.state);toastDodge();}
function handleWorldSelect(id){
  if(!started)return;
  // 2026-11-11 第二階段(規格 4.6):點獵人、魔物或建築 → 目標腳下出現兩顆六角鈕(資訊 i／取消 ×),不直接開面板;按「資訊」才開詳情。
  if(id?.startsWith('region:')){selCancel();hideUnitCard();densityRegion=id.slice(7);openModal('density');return;}
  // FIX-C:建築詳情抽屜開著時點另一棟建築 → 直接切換抽屜內容(不必先關、也不必再按資訊);其他情況照舊先出六角鈕
  if(id&&BUILDINGS.some(b=>b.id===id)&&selected&&!$('#inspector').classList.contains('hidden')&&!modal&&!placing){selCancel();hideUnitCard();inspect(id);return;}
  if(id&&(id.startsWith('hunter:')||id.startsWith('foe:')||BUILDINGS.some(b=>b.id===id))){selectWorld(id);return;}
  selCancel();hideUnitCard();
}
// ── 世界內選取:兩顆六角鈕跟著目標(建築點擊框的下緣／角色腳底)走,每幀用 world 的點擊框換算成畫面座標 ──
let selTarget=null,selShownKey='';
function selectWorld(id){hideUnitCard();if(selected&&!$('#inspector').classList.contains('hidden'))closeInspector();selTarget=id;world?.setSelected(id);
  const el=$('#hv-sel');if(el){const nm=selName(id);el.dataset.target=id;el.setAttribute('aria-label','已選取 '+nm);el.querySelector('[data-action=selInfo]')?.setAttribute('aria-label',nm+' 資訊');}selUpgradePaint(id);selPaint();}
// 2026-11-16 獵魔村式「在地圖上直接升級」:點建築後的六角鈕多一顆 ▲,能升級(或補料後能升級／建造)時才出現
function selUpgradeState(id){const b=BUILDINGS.find(x=>x.id===id);if(!b)return null;const s=game.state,lv=s.buildings[id]||0;if(lv>=5)return null;
  if(lv&&id!=='hall'&&lv+1>(s.buildings.hall||1)+1)return null;
  const cost=lv?game.getUpgradeCost(id):b.cost,miss=costMissing(cost),verb=lv?`升級到 Lv.${lv+1}`:'建造';
  if(!miss.length)return {merchant:false,label:`${b.name}：${verb}（${Object.entries(cost).map(([k,v])=>costName(k)+' '+fmt(v)).join('、')}）`};
  const q=game.merchantQuote?.(cost);return q?.ok?{merchant:true,label:`${b.name}：補料${verb}（共 ${fmt(q.total)} 金）`}:null;}
function selUpgradePaint(id){const up=$('#hv-sel .hv-hex-up');if(!up)return;const st=BUILDINGS.some(b=>b.id===id)?selUpgradeState(id):null;
  up.hidden=!st;up.classList.toggle('merchant',!!st?.merchant);if(st){up.title=st.label;up.setAttribute('aria-label',st.label);}selCraftPaint(id);}
// 2026-11-16 地圖上直接補貨:餐廳／旅館／酒館／治療所選取時多一顆 ＋,做一批商品(缺料而金幣夠 → 青綠,先向行商補料)
function selCraftState(id){const b=BUILDINGS.find(x=>x.id===id),s=game.state;if(!b?.product||!(s.buildings[id]>0))return null;const p=PRODUCTS[b.product];if(!p)return null;
  const stock=s.stocks[b.product]||0;if(!costMissing(p.cost).length)return {merchant:false,product:b.product,label:`${b.name}：製作 ${p.amount} 份${p.name}（庫存 ${stock}）`};
  const q=game.merchantQuote?.(p.cost);return q?.ok?{merchant:true,product:b.product,label:`${b.name}：補料製作 ${p.amount} 份${p.name}（${fmt(q.gold)} 金，庫存 ${stock}）`}:null;}
function selCraftPaint(id){const c=$('#hv-sel .hv-hex-craft');if(!c)return;const st=selCraftState(id);c.hidden=!st;c.classList.toggle('merchant',!!st?.merchant);if(st){c.title=st.label;c.setAttribute('aria-label',st.label);}}
function selName(id){if(id.startsWith('hunter:')){const h=game.state.hunters.find(v=>v.id===id.slice(7));return h?h.name:'獵人';}if(id.startsWith('foe:')){const e=(game.state.enemies||[]).find(v=>v.id===id.slice(4));return e?(MONSTER_NAME[e.type]||e.type):'魔物';}return BUILDINGS.find(b=>b.id===id)?.name||id;}
function selCancel(){if(!selTarget)return;const t=selTarget;selTarget=null;selShownKey='';const el=$('#hv-sel');if(el){el.hidden=true;delete el.dataset.target;}if(!selected||selected!==t)world?.setSelected(selected||null);}
function selInfo(){const t=selTarget;if(!t)return;selTarget=null;selShownKey='';const el=$('#hv-sel');if(el){el.hidden=true;delete el.dataset.target;}
  if(t.startsWith('hunter:')||t.startsWith('foe:'))showUnitCard(t);else inspect(t);}
function selRect(id){if(!world)return null;let list;
  if(id.startsWith('hunter:'))list=world.unitRects?.().filter(r=>'hunter:'+r.id===id);
  else if(id.startsWith('foe:'))list=world.foeRects?.().filter(r=>'foe:'+r.id===id);
  else list=world.hitRects?.().filter(r=>r.id===id);
  if(!list||!list.length)return null;let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(const r of list){x0=Math.min(x0,r.x);y0=Math.min(y0,r.y);x1=Math.max(x1,r.x+r.w);y1=Math.max(y1,r.y+r.h);}return{x:x0,y:y0,w:x1-x0,h:y1-y0};}
function selPaint(){const el=$('#hv-sel');if(!el)return;
  if(!selTarget){if(!el.hidden)el.hidden=true;return;}
  // 目標消失(魔物被打倒、獵人離開)就取消選取
  if(selTarget.startsWith('foe:')&&!(game.state.enemies||[]).some(v=>v.id===selTarget.slice(4)&&v.hp>0)){selCancel();return;}
  if(selTarget.startsWith('hunter:')&&!game.state.hunters.some(v=>v.id===selTarget.slice(7))){selCancel();return;}
  const busy=modal||placing||document.body.classList.contains('piloting');
  const r=busy?null:selRect(selTarget);
  if(!r){if(!el.hidden)el.hidden=true;return;}
  const cv=$('#world'),cr=cv.getBoundingClientRect(),u=world.unproject(cr.left+cr.width,cr.top),k=u&&u.sx>0?cr.width/u.sx:1;
  const cx=cr.left+(r.x+r.w/2)*k,foot=cr.top+(r.y+r.h)*k;
  if(cx<0||cx>innerWidth||foot<0||foot>innerHeight+40){if(!el.hidden)el.hidden=true;return;}
  if(el.hidden)el.hidden=false;
  const w=el.offsetWidth||104,h=el.offsetHeight||52,topMin=56,bottomMax=innerHeight-($('#bottom-bar')?.getBoundingClientRect().height||72)-h-6;
  const x=Math.round(Math.max(6,Math.min(innerWidth-w-6,cx-w/2))),y=Math.round(Math.max(topMin,Math.min(bottomMax,foot-6)));
  const key=x+','+y;if(key!==selShownKey){selShownKey=key;el.style.transform=`translate(${x}px,${y}px)`;}}

// T109/T110:點世界裡的獵人或魔物時,只開一張小卡(頭像/名字/等級職業或區域/生命/攻防),
// 要看完整資料再按「詳細」。以前點一下就直接整頁跳進獵人名冊,看個人卻被抽離世界。
let unitCardEl=null,unitCardSel=null,unitCardSig="";let codexFaceAt=0;
function unitCardTarget(){
  if(!unitCardSel)return null;
  if(unitCardSel.startsWith("hunter:")){const h=game.state.hunters.find(v=>v.id===unitCardSel.slice(7));return h?{kind:"hunter",u:h}:null;}
  if(unitCardSel.startsWith("foe:")){const e=(game.state.enemies||[]).find(v=>v.id===unitCardSel.slice(4)&&v.hp>0);return e?{kind:"foe",u:e}:null;}
  return null;
}
function hideUnitCard(){const had=unitCardSel;unitCardEl?.remove();unitCardEl=null;unitCardSel=null;unitCardSig="";if(had&&!selTarget)world?.setSelected(selected||null);}
function showUnitCard(sel){
  unitCardSel=sel;unitCardSig="";
  if(!unitCardTarget()){hideUnitCard();return;}
  unitCardPaint(true);
  openOtherPanelsClosed();
  world?.setSelected(sel);
}
function openOtherPanelsClosed(){if(placing)return;const ins=$("#inspector");if(ins&&!ins.classList.contains("hidden"))closeInspector();}
function unitCardHTML(t){
  if(t.kind==="hunter"){
    const h=t.u,cls=CLASSES.find(c=>c.id===h.classId)||{},rng=(h.range||0)>=5?"遠程":"近戰",tr=TRAITS.find(x=>x.id===h.trait)?.name||"";
    return `<img class="uc-portrait" src="${portrait(h)}" alt=""><div class="uc-body"><div class="uc-head"><b class="uc-name">${esc(h.name)}</b><span class="uc-lv">Lv.${h.level}</span><em class="uc-status" data-status="${esc(h.status)}">${esc(h.status)}</em></div><div class="uc-sub">${iconHTML("em-"+h.classId)}<span>${esc(cls.name||"")} · ${rng} · ${esc(tr)}</span></div><div class="uc-hp"><i class="uc-bar"><span></span></i><b class="uc-hpnum"></b></div><div class="uc-stats"><span>${iconHTML("atk")}<b>${h.attack}</b></span><span>${iconHTML("def")}<b>${h.defense}</b></span><span>${iconHTML("rebirth")}<b>${h.rebirths}</b></span></div></div><div class="uc-actions"><button class="pixel-button gold uc-more" data-action="unitDetail" data-id="${h.id}">詳細</button><button class="uc-x" data-action="unitCardClose" aria-label="關閉單位資訊">✕</button></div>`;
  }
  const e=t.u,data=ENEMIES[e.type]||{},boss=e.type==="boss";
  const region=REGIONS.find(r=>r.id===e.regionId)?.name||"野外";
  const drops=Object.keys(data.drops||{}).map(k=>MATERIALS[k]?.name||k).slice(0,3).join("、");
  return `<img class="uc-portrait foe" src="${monsterPortrait(e.type,96)}" alt=""><div class="uc-body"><div class="uc-head"><b class="uc-name">${esc(MONSTER_NAME[e.type]||e.type)}</b><em class="uc-status" data-status="${boss?"boss":"foe"}">${boss?"首領":"魔物"}</em></div><div class="uc-sub">${iconHTML("skull")}<span>${esc(region)}${drops?" · 掉落 "+esc(drops):""}</span></div><div class="uc-hp"><i class="uc-bar foe"><span></span></i><b class="uc-hpnum"></b></div><div class="uc-stats"><span>${iconHTML("atk")}<b>${Math.round(e.attack)}</b></span><span>${iconHTML("gold")}<b>${data.gold||0}</b></span><span>${iconHTML("quest")}<b>${data.xp||0}</b></span></div></div><div class="uc-actions"><button class="uc-x" data-action="unitCardClose" aria-label="關閉單位資訊">✕</button></div>`;
}
function unitCardSigOf(t){
  if(t.kind==="hunter")return ["hunter",t.u.id,t.u.name,t.u.classId,t.u.level,t.u.rarity,t.u.status,t.u.trait,t.u.attack,t.u.defense,t.u.maxHp,t.u.rebirths].join("|");
  return ["foe",t.u.id,t.u.type,Math.round(t.u.maxHp),t.u.regionId].join("|");
}
function unitCardPaint(force){
  const t=unitCardTarget();
  if(!t){hideUnitCard();return;}
  if(!unitCardEl){unitCardEl=document.createElement("div");unitCardEl.id="unit-card";unitCardEl.setAttribute("role","group");unitCardEl.setAttribute("aria-label","選取單位");document.body.append(unitCardEl);}
  const sig=unitCardSigOf(t);
  if(force||sig!==unitCardSig){unitCardSig=sig;unitCardEl.dataset.kind=t.kind;unitCardEl.innerHTML=unitCardHTML(t);}
  const maxHp=Math.max(1,t.u.maxHp||1),hp=Math.min(maxHp,Math.max(0,t.u.hp||0)),ratio=Math.max(0,Math.min(1,hp/maxHp));
  const bar=unitCardEl.querySelector(".uc-bar>span"),num=unitCardEl.querySelector(".uc-hpnum"),hpEl=unitCardEl.querySelector(".uc-hp");
  if(bar){bar.style.width=(ratio*100).toFixed(1)+"%";
    num.textContent=hpShow(hp,maxHp)+"/"+Math.ceil(maxHp);
    hpEl.setAttribute("role","progressbar");hpEl.setAttribute("aria-valuemin","0");hpEl.setAttribute("aria-valuemax",String(Math.round(maxHp)));hpEl.setAttribute("aria-valuenow",String(Math.round(hp)));
    hpEl.classList.toggle("low",ratio>0&&ratio<.35);hpEl.classList.toggle("down",ratio<=0);}
}
document.addEventListener('click',e=>{const el=e.target.closest('[data-action]');if(el&&!el.disabled){z2dActEl=el;z2dActRect=el.getBoundingClientRect();z2dActAt=performance.now();sfx('ui');doAction(el);}});
// 2026-11-19:名冊卡片改成 <article tabindex="0" data-action="hunter"> 之後(右上金色 i 徽章拿掉),
// 瀏覽器不會把 Enter／空白鍵自動轉成 click,要在這裡補上,不然鍵盤操作的人點不進獵人卡。
document.addEventListener('keydown',e=>{
 if(e.key!=='Enter'&&e.key!==' '&&e.key!=='Spacebar')return;
 const card=e.target.closest?.('#modal-content .hv-hcard[data-action]');if(!card)return;
 if(e.target!==card)return;               // 卡片裡的按鈕(定位鈕等)自己會處理
 e.preventDefault();card.click();
},true);
// 2026-11-16 裝備縮圖:倉庫「已穿全套」小圖條換獵人時即時重畫(不重開面板、不丟捲動位置)
document.addEventListener('change',e=>{const sel=e.target.closest('[data-gear-set-who]');if(!sel)return;const h=game&&game.state.hunters.find(v=>v.id===sel.value),set=sel.closest('[data-gear-set]');if(!set)return;const strip=set.querySelector('[data-gear-set-strip]');if(strip)strip.innerHTML=gearSetStripHTML(h);const n=set.querySelector('[data-gear-set-n]');if(n){const c=h&&h.gear?gearSetSlots().filter(sl=>h.gear[sl]).length:0;n.textContent=`已穿 ${c}／7`;}});
// Z2D:左上資源疊的「＋」框(金幣→交易所、星晶→地下城,星晶是通關層數與首領的掉落)。整個資源疊還是同一顆 44px 以上的鈕,只有點在 ＋ 上才改道,點別處照常開倉庫。
document.querySelector('#topbar .treasury')?.addEventListener('click',e=>{const p=e.target.closest('.res-plus');if(!p)return;e.stopPropagation();sfx('ui');openModal(p.dataset.plus==='gems'?'dungeon':'trade');});
document.addEventListener('keydown',e=>{if(e.target.matches?.('input,textarea,select'))return;if(modal==='hunter-detail'&&(e.key==='ArrowLeft'||e.key==='ArrowRight')&&!document.querySelector('#ui-tip:not([hidden])')){e.preventDefault();cycleHunter(e.key==='ArrowLeft'?-1:1);return;}if(e.key==='Escape'&&unitCardEl&&!modal){hideUnitCard();return;}if(e.key==='Escape'&&!modal&&selected&&!$('#inspector').classList.contains('hidden')&&!selTarget){closeInspector();return;}if(selTarget&&!modal){if(e.key==='Escape'){selCancel();return;}if(e.key==='Enter'&&!e.target.closest?.('button,a,[tabindex]:not(#modal)')){e.preventDefault();selInfo();return;}if(e.key.toLowerCase()==='u'&&!$('#hv-sel .hv-hex-up')?.hidden){e.preventDefault();$('#hv-sel .hv-hex-up').click();return;}}if(e.code==='Space'&&!modal&&started){e.preventDefault();if(game.state.pilot){game.pilotAttack();return;}game.state.paused=!game.state.paused;paint();}const map={'1':'build','2':'dungeon','3':'hunters','4':'inventory','5':'trade','6':'arena','7':'quests','8':'craft'};if(!modal&&!game?.state?.pilot&&map[e.key])openModal(map[e.key]);});
$('#modal-backdrop').addEventListener('click',e=>{if(e.target.id==='modal-backdrop'&&modalDismissible())closeModal(true);});
$('#inspector-scrim')?.addEventListener('click',()=>closeInspector());   // Z1:建築詳情的遮罩點一下就關
try{const saved=(()=>{try{return previewMode?null:JSON.parse(localStorage.getItem(SAVE_KEY)||'null');}catch{return null;}})();firstRun=!previewMode&&!saved;bootHadSave=!!saved;game=createGame(saved);bootOffline=saved&&saved.paused!==true&&Number.isFinite(saved.savedAt)?Math.max(0,(Date.now()-saved.savedAt)/1000):0;game.state.paused=true;document.querySelector('#title-art')?.style.setProperty('background-image',`url(${AS().title||''})`);if(AS().woodui)document.documentElement.style.setProperty('--wood-tex',`url(${AS().woodui})`);/* 2026-10-28:把 PixelLab 的 UI 零件掛成 CSS 變數(--ui-panel / --ui-btn-primary …),CSS 用 border-image 九宮格拉伸 */{const uiMap=AS().ui||{};for(const [k,v] of Object.entries(uiMap)){const u=`url(${v})`;document.documentElement.style.setProperty('--ui-'+k,u);if(!uiMap['px-'+k])document.documentElement.style.setProperty('--ui-px-'+k,u);}/* 手機一套 UI 零件(2026-10-30):有 assets/ui/m-px-<名字>.png 的,手機尺寸改用它;<html class="ui-m"> 讓 CSS 換切片與框寬(make_mobile_ui.py) */const mUi=Object.keys(uiMap).filter(k=>k.startsWith('m-px-'));if(mUi.length){const mq=matchMedia('(max-width:760px),(max-height:520px)'),setM=()=>{for(const k of mUi){const base=k.slice(2);if(uiMap[base])document.documentElement.style.setProperty('--ui-'+base,`url(${mq.matches?uiMap[k]:uiMap[base]})`);}document.documentElement.classList.toggle('ui-m',mq.matches);};setM();mq.addEventListener('change',setM);}/* 另一套 CSS 用 --ui-px-<名字>（window/card/btn-wood/…）→ 對到同一批零件，兩套命名都吃得動；assets/ui/px-*.png 在的話就用真正的零件，別名只在缺檔時補位 */const UI_ALIAS={'px-window':'panel','px-card':'panel-sm','px-btn-wood':'btn-secondary','px-btn-gold':'btn-primary','px-btn-red':'btn-danger','px-btn-x':'btn-close','px-tile':'tab','px-tile-on':'tab-on','px-trough':'bar','px-toast':'toast-ok','px-toast-err':'toast-err'};for(const [alias,src] of Object.entries(UI_ALIAS))if(!uiMap[alias]&&uiMap[src])document.documentElement.style.setProperty('--ui-'+alias,`url(${uiMap[src]})`);}setIcons();world=createPixelWorld($('#world'),{getState:()=>game.state,onSelect:handleWorldSelect,onPlace:(id,x,z)=>{const r=game.moveBuilding(id,x,z);logToast(r.message,r.ok);if(r.ok){placing=null;$('#placement').classList.add('hidden');world.placeMode(null);}paint();}});applySettings();if(!world.isHD2D?.())$('#hd2d-cam')?.classList.add('hidden');if(matchMedia('(pointer:coarse)').matches)$('.map-hint').textContent='拖曳平移 · 雙指縮放與旋轉 3D 視角 · 點選建築／獵人';  /* 觸控裝置沒有滾輪 */globalThis.__mistvaleView=world;globalThis.__mistvaleGame=game;if(new URLSearchParams(location.search).has('tmw')){try{mountTmwPuppet(world);}catch(e){console.warn('tmw puppet failed',e);}}if(new URLSearchParams(location.search).get('loom')==='1'){try{mountHeroLoomLab();}catch(e){console.warn('heroloom lab failed',e);}}if(new URLSearchParams(location.search).get('dv2lab')==='1'){try{mountPaperdollLab();}catch(e){console.warn('dv2 paperdoll lab failed',e);}}  // 驗收腳本用(pipeline/scripts/l0veyou/verify_all_regions.js)
$('#left-panel')?.classList.add('hidden');$('#reopen-left')?.classList.remove('hidden');   // 委託看板預設收起（按鈕可展開）
// 關掉瀏覽器自己的手勢:雙指縮放頁面、雙擊放大、長按選字/跳選單、下拉重新整理、選取文字。
// 這些會跟遊戲的拖曳、雙指縮放、點選搶事件(拖到一半頁面跟著縮、長按跳出選單、往下拉就重新整理)。
// 畫布本身用 touch-action:none 自己處理手勢;這裡擋的是頁面層級的那一些。
(()=>{const typing=e=>!!e.target?.closest?.('input,textarea,select,[contenteditable]');
for(const t of ['gesturestart','gesturechange','gestureend'])document.addEventListener(t,e=>e.preventDefault(),{passive:false});   // iOS/macOS 的頁面雙指縮放
document.addEventListener('contextmenu',e=>{if(!typing(e))e.preventDefault();});
document.addEventListener('selectstart',e=>{if(!typing(e))e.preventDefault();});
document.addEventListener('dragstart',e=>{if(!typing(e))e.preventDefault();});
document.addEventListener('dblclick',e=>{if(!typing(e))e.preventDefault();});})();   // 雙擊放大 / 選字
window.addEventListener('resize',()=>world.resize());window.addEventListener('pagehide',save);bootWhenReady();   // 讀取完成才進村莊(見 bootWhenReady)
let previous=performance.now(),nextFrame=0,frames=0,fpsStart=performance.now();
// 上限 30 fps：依排程每 1000/30 ms 畫一次，容許 2 ms 的時間抖動；60/120/144 Hz 螢幕都只畫 30 次
const FRAME_MS=1000/30, PAUSED_MS=1000/10;   // 暫停(在看選單/面板)時降到 10fps:畫面幾乎不動,不必燒 30fps 的電
const frameMs={avg:0,max:0,n:0};globalThis.__mistvaleFrameStats=()=>({avgMs:+frameMs.avg.toFixed(2),maxMs:+frameMs.max.toFixed(2),frames:frameMs.n});
// 效能回報(只有網址加 ?perf=1 才開,平常完全不跑):實機每 3 秒把「每幀 JS 毫秒」與「畫面間隔」統計 POST 到本機服務 /perf,
// 左上角小字顯示 fps／JS。2026-10-26 使用者回報手機卡頓,用來量真機(模擬器量不到真機 GPU 與記憶體)。
const perfProbe=new URLSearchParams(location.search).has('perf')?{js:[],iv:[],last:0,t0:performance.now(),hud:null}:null;
function perfSample(now,ms){const P=perfProbe;if(P.last)P.iv.push(now-P.last);P.last=now;P.js.push(ms);if(now-P.t0<3000)return;
  const q=(a,p)=>{const s=[...a].sort((x,y)=>x-y);return s.length?+s[Math.min(s.length-1,Math.floor(p*s.length))].toFixed(1):0;};
  const s=game?.state||{},pf=globalThis.__mistvalePerf?.()||{},pil=s.pilot?(s.hunters||[]).find(h=>h.id===s.pilot.id):null;
  const rep={t:new Date().toISOString(),secs:+((now-P.t0)/1000).toFixed(1),frames:P.js.length,fps:+(P.js.length*1000/(now-P.t0)).toFixed(1),
    js:{p50:q(P.js,.5),p95:q(P.js,.95),max:q(P.js,1)},iv:{p50:q(P.iv,.5),p95:q(P.iv,.95),max:q(P.iv,1),over50:P.iv.filter(v=>v>50).length,over100:P.iv.filter(v=>v>100).length},
    canvas:pf.canvas,dprCap:pf.dpr,scale:pf.scale,mode:pf.mode,modeFrames:pf.modeFrames,lod:globalThis.__mistvaleHeroLod?.(),
    pilot:pil?pil.classId:null,paused:!!s.paused,speed:s.speed,enemies:(s.enemies||[]).filter(e=>e.hp>0).length,wanderers:(s.wanderers||[]).length,hunters:(s.hunters||[]).length,
    dpr:devicePixelRatio,view:[innerWidth,innerHeight],cores:navigator.hardwareConcurrency,mem:navigator.deviceMemory,ua:navigator.userAgent};
  fetch('/perf',{method:'POST',body:JSON.stringify(rep),keepalive:true}).catch(()=>{});
  if(!P.hud){P.hud=document.createElement('div');P.hud.style.cssText='position:fixed;left:4px;top:4px;z-index:99999;font:11px/1.3 monospace;color:#0f0;background:#000a;padding:2px 4px;pointer-events:none;white-space:pre';document.body.appendChild(P.hud);}
  P.hud.textContent=`${rep.fps}fps JS ${rep.js.p50}/${rep.js.p95}ms 間隔p95 ${rep.iv.p95} >50:${rep.iv.over50}`;
  P.js=[];P.iv=[];P.t0=now;}
// T107:外出中的小隊 HUD。地下城/競技場進行時,畫布上只有一行「第 N 層 · 第 W/3 波」,
// 玩家看不到小隊血量、也看不到競技場對手的血量;這裡在主畫面頂端常駐一條:
// 樓層/波數/階段 + 三位獵人的生命條與數字(競技場再加對手血條),另外給自動續戰與撤退。
// 只有按鈕吃點擊,其餘 pointer-events:none,不會擋世界裡的點擊與拖曳。
let runHudEl=null,runHudShape='',runHudUnits=[],runHudFoe=null;
const runHudParty=o=>game.state.hunters.filter(h=>(o.hunterIds||[]).includes(h.id));
function runHudPaint(){
  const s=game?.state;if(!s){return;}
  // 面板開著時戰鬥畫面就在面板裡,不需要再疊一條;關掉面板才由這條接手。
  if(modal){if(runHudEl){runHudEl.remove();runHudEl=null;}runHudShape='';runHudUnits=[];runHudFoe=null;return;}
  const d=s.dungeon,a=s.arena;
  const on=d?.active?'dungeon':a?.active?'arena':null;
  if(!on){if(runHudEl){runHudEl.remove();runHudEl=null;}runHudShape='';runHudUnits=[];runHudFoe=null;return;}
  const o=on==='dungeon'?d:a,party=runHudParty(o);
  const head=on==='dungeon'
    ?`<b>地下城</b><span>第 ${d.floor} 層 · 第 ${Math.max(1,d.wave||1)}/3 波</span>`
    :`<b>競技場</b><span>vs ${esc(a.opponent||'訓練隊')}</span>`;
  const phase=esc(o.phase||'待命');
  // 樓層/波數/階段只就地改字,不重建 DOM:否則階段切換時撤退鈕被換掉,按到一半(pointerdown→up)會點空。
  const shape=[on,on==='dungeon'?!!d.auto:'',party.map(h=>h.id+h.name+h.classId).join(',')].join('|');
  if(shape!==runHudShape||!runHudEl){
    runHudShape=shape;
    if(!runHudEl){runHudEl=document.createElement('div');runHudEl.id='run-hud';document.body.appendChild(runHudEl);}
    const btns=on==='dungeon'
      ?`<button class="rh-toggle${d.auto?' on':''}" data-action="runAuto" aria-pressed="${d.auto?'true':'false'}">自動續戰 ${d.auto?'開':'關'}</button><button class="rh-x" data-action="runRetreat">撤退</button>`
      :'';
    const foe=on==='arena'&&a.enemyMaxHp>0
      ?`<div class="rh-foe"><span>對手</span><i class="rh-bar"><span></span></i><b class="rh-num"></b></div>`:'';
    runHudEl.innerHTML=`<div class="rh-head">${head}<em class="rh-phase">${phase}</em>${btns}</div>
      <div class="rh-party">${party.map(h=>`<div class="rh-unit${h.hp<=0?' down':''}"><em class="rh-cls">${esc(CLASSES.find(c=>c.id===h.classId)?.name||h.classId)}</em><span class="rh-name">${esc(h.name)}</span><i class="rh-bar"><span></span></i><b class="rh-num"></b></div>`).join('')}</div>${foe}`;
    runHudUnits=[...runHudEl.querySelectorAll('.rh-unit')].map((el,i)=>({h:party[i],fill:el.querySelector('.rh-bar>span'),num:el.querySelector('.rh-num'),el}));
    runHudFoe=on==='arena'?{fill:runHudEl.querySelector('.rh-foe .rh-bar>span'),num:runHudEl.querySelector('.rh-foe .rh-num')}:null;
  }
  {const hs=runHudEl.querySelector('.rh-head>span'),ps=runHudEl.querySelector('.rh-phase');const ht=on==='dungeon'?`第 ${d.floor} 層 · 第 ${Math.max(1,d.wave||1)}/3 波`:`vs ${a.opponent||'訓練隊'}`;if(hs&&hs.textContent!==ht)hs.textContent=ht;if(ps&&ps.textContent!==(o.phase||'待命'))ps.textContent=o.phase||'待命';}
  for(const u of runHudUnits){const h=u.h,ratio=Math.max(0,Math.min(1,h.hp/(h.maxHp||1)));u.fill.style.width=(ratio*100).toFixed(1)+'%';{const t=`${hpShow(h.hp,h.maxHp)}/${Math.ceil(h.maxHp)}`;if(u.num.dataset.t!==t){u.num.dataset.t=t;u.num.innerHTML=`${hpShow(h.hp,h.maxHp)}<span class="rh-max">/${Math.ceil(h.maxHp)}</span>`;}}u.el.classList.toggle('down',h.hp<=0);u.el.classList.toggle('low',ratio<.35);}
  if(runHudFoe&&a?.active){const ratio=hpRatio(a.enemyHp,a.enemyMaxHp);runHudFoe.fill.style.width=(ratio*100).toFixed(1)+'%';runHudFoe.num.textContent=`${hpShow(a.enemyHp,a.enemyMaxHp)}/${Math.ceil(a.enemyMaxHp)}`;}   /* 2026-11-24 B12 夾上限 */
}

// ═══ Z2C(2026-11-12 圖鑑 v2 規格 a/d/m/n、決定 C2/C4):戰鬥與地圖畫面的內容 ═══
// 地下城／競技場抽屜(未解鎖引導、樓層步進、固定底部出發列)、結算視窗、競技場進行中、首領確認與血條、世界地圖每區一行、判定標籤。
// 只掛在既有的開始/結束事件上(state 的 active 變 false 才跳結算),不改戰鬥流程。
const Z2C_V={easy:['輕鬆','easy'],ok:['可行','ok'],hard:['危險','hard']};
const Z2C_UNLOCK={dungeon:{b:'dungeon',name:'地下城入口'},arena:{b:'training',name:'修煉地'}};
function z2cLock(kind){const u=Z2C_UNLOCK[kind];if(!u||(game.state.buildings[u.b]||0)>0)return null;const b=BUILDINGS.find(x=>x.id===u.b);return {id:u.b,name:u.name,cost:b?.cost||{}};}
function z2cCostHTML(cost){const s=game.state;return Object.entries(cost).map(([k,n])=>`<span class="${(s[k]||0)<n?'no':'ok'}">${esc(costName(k))} ${fmt(n)}</span>`).join('、');}
function z2cLockHint(lk){return `<div class="z1-hint z2c-lock" role="status"><p>需要先建造<b>${esc(lk.name)}</b>（成本：${z2cCostHTML(lk.cost)}）</p><button type="button" class="pixel-button" data-zb="olive" data-action="z2cGoBuild" data-id="${lk.id}">前往建設</button></div>`;}
function z2cFlashBuild(id){const c=document.querySelector('#modal-content');if(!c)return;const card=c.querySelector(`.building-card[data-id="${id}"]`)||c.querySelector(`[data-id="${id}"]`);if(!card)return;
 const row=card.closest('.building-card')||card;row.classList.add('z2c-flash');c.scrollTop=Math.max(0,row.getBoundingClientRect().top-c.getBoundingClientRect().top+c.scrollTop-8);setTimeout(()=>row.classList.remove('z2c-flash'),4500);}
// 判定標籤:同一條 comfort vs threat 公式(game.regionInfo().fit),輕鬆=綠、可行=黃、危險=紅
function z2cTeamIds(){const s=game.state,t=(s.dispatchTeams||[])[Math.min(dispatchTab,(s.dispatchTeams||[]).length-1)];return t&&t.ids&&t.ids.length?t.ids:[];}
function z2cFit(rid,ids){const rg=game.regionInfo(rid);return rg?rg.fit(ids||[]):null;}
function z2cVerdictTag(f){return f?`<em class="z2c-v ${f.verdict}" aria-label="判定：${Z2C_V[f.verdict][0]}">${Z2C_V[f.verdict][0]}</em>`:'';}
function z2cFitMap(c){const r=c.getBoundingClientRect(),w=Math.round(r.width),h=Math.round(r.height);if(w<100||h<60)return;if(c.width!==w||c.height!==h){c.width=w;c.height=h;}}   // 畫布像素＝實際顯示大小,12px 的區域名才不會被縮到看不清(R4)
// 2026-11-18 區域列第二行改寫「主要掉落」:從 ENEMIES 的掉落表算(出怪比例 3:3:2 = pixel-game REGION_MIX,跟 REGION_MONSTERS 同順序),
// 掉落改了也不會跟說明對不上;原本的風景短語留在「詳情」。
function regionDrops(rid,n=3){const ms=REGION_MONSTERS[rid]||[],w=[3,3,2],tot={};ms.forEach((m,i)=>{for(const [k,v] of Object.entries(ENEMIES[m]?.drops||{}))tot[k]=(tot[k]||0)+v*(w[i]||1);});return Object.entries(tot).sort((a,b)=>b[1]-a[1]).slice(0,n).map(([k])=>k);}
// ── 地下城／競技場抽屜
function z2cDungeonHTML(s){const d=s.dungeon,maxF=d.bestFloor+1,startF=Math.min(maxF,d.startFloor||maxF),lock=z2cLock('dungeon');
 const auto=`<button class="pixel-button z2c-auto${d.auto?' on':''}" data-action="dgAuto" aria-pressed="${d.auto}">${iconHTML('rebirth',true)}自動續戰：${d.auto?'開':'關'}</button>`;
 const facts=`<div class="encounter-facts" title="三人一隊 · 近戰站前排、遠程站後排">每層 3 波魔物 · 通過後紀錄推進到第 <b>${maxF}</b> 層</div>`;
 if(d.active){const ra=game.dungeonReward?game.dungeonReward(d.floor):null,rv=ra?.village||{};return `<canvas id="dungeon-strip" class="dungeon-strip" aria-label="地下城戰鬥畫面"></canvas><div class="encounter-status z2c-sr" id="dg-status" role="status">${dungeonStatus()}</div>${ra?`<div class="z1-box z2c-rec z2c-run-rw"><span>第 ${d.floor} 層通關獎勵</span>${['gold','ore','gems'].filter(k=>rv[k]>0).map(k=>`<span class="z2c-rw" title="${costName(k)}">${iconHTML(k,true)}<b>${fmt(rv[k])}</b></span>`).join('')}${ra.first?'<small class="z2c-first">新紀錄</small>':'<small class="z2c-lower">已打過，獎勵減少</small>'}</div>`:''}${facts}<div class="encounter-facts z2c-tired" id="dg-tired" role="status"${dgTiredText(d.hunterIds)?'':' hidden'}>${esc(dgTiredText(d.hunterIds))}</div><div class="encounter-actions z1-sticky z2c-dock z2c-dock-run">${auto}<button class="pixel-button danger z2c-retreat" data-action="dgRetreat">撤退</button></div>`;}
 // 2026-11-24(B9,使用者選 b):不再強制降層 → 照選的層出發;風險評估只當提示(dgRiskHTML,LIVE.dungeon 跟著目前生命／飽食重算)
 const realF=startF;
 // 2026-11-17:已打過的樓層獎勵減少(pixel-game dgFloorReward)→ 預估跟 floorCleared 走同一支公式,重複層加註
 const rwA=game.dungeonReward?game.dungeonReward(realF):{first:realF>d.bestFloor,village:{gold:120+realF*40,ore:10+realF*5,gems:2+Math.floor(realF/2)}},rw=rwA.village;
 const rwHTML=['gold','ore','gems'].filter(k=>rw[k]>0).map(k=>`<span class="z2c-rw" title="${costName(k)}">${iconHTML(k,true)}<b>${fmt(rw[k])}</b></span>`).join('')+(rwA.first?'':'<small class="z2c-lower">已打過的樓層，獎勵減少</small>');
 const g=partyGate(d.hunterIds.length,d.cooldown,'派遣三人小隊 · 從第 '+realF+' 層',lock?lock.name:'');
 return `${lock?z2cLockHint(lock):''}<div class="z1-box z2c-info"><div class="encounter-status" id="dg-status">${dungeonStatus()}</div><div class="z2c-rec"><span>第 ${realF} 層預估獎勵</span>${rwHTML}</div>${facts}${dgRiskHTML(d,startF)}`
  +`<div class="z2c-steps"><div class="floor-pick z2c-floors" role="group" aria-label="起始層"><span class="z2c-fl-l">起始層</span><button class="pixel-button" data-action="dgFloor" data-id="-1" ${startF<=1?'disabled':''} aria-label="往前一層">−</button><b>第 ${startF} 層</b><button class="pixel-button" data-action="dgFloor" data-id="1" ${startF>=maxF?'disabled':''} aria-label="往後一層">＋</button>${startF>=maxF?'':'<button class="pixel-button" data-action="dgFloor" data-id="max">最新</button>'}</div>${auto}</div></div>`
  +`<div class="z2c-party-h"><span>選 3 位獵人組隊</span><button class="pixel-button z2c-recbtn" data-zb="gold" data-action="dgRecommend" title="依職業組合與能力，挑出估計能最安全、推進最深的三人">推薦隊伍</button></div>`+`<div class="party-grid z2c-party">${partyList('dungeon',d.hunterIds,'toggleDungeonHunter','村裡還沒有獵人','先招募一位獵人，才能組隊遠征地下城')}</div>`
  +`<div class="encounter-actions z1-sticky z2c-dock${lock?' is-lock':''}">${partySummary(d.hunterIds)}<button class="pixel-button gold${g.lock?' z2c-locked':''}" data-action="startDungeon" ${g.disabled?'disabled':''}>${g.label}</button></div>`;}
// 2026-11-24(B9/B5)地下城風險評估:pixel-game dungeonAssess(跟自動續戰同一套預估),用「現在」的生命與飽食算;只提示、不改出發層
const DG_VERDICT={safe:['估計打得過','easy'],risky:['有風險','ok'],danger:['很危險','hard']};
function dgAssessNow(d,startF){return d.hunterIds.length===3&&game.dungeonAssess?game.dungeonAssess(d.hunterIds,startF):null;}
function dgRiskHTML(d,startF){const a=dgAssessNow(d,startF),tired=dgTiredText(d.hunterIds);
 if(!a||!a.verdict)return `<div class="encounter-facts z2c-risk" id="dg-risk">選滿 3 位獵人後，這裡會評估第 ${startF} 層的風險</div><div class="encounter-facts z2c-tired" id="dg-tired" role="status"${tired?'':' hidden'}>${esc(tired)}</div>`;
 const V=DG_VERDICT[a.verdict],secs=Number.isFinite(a.secs)?`預估約 ${fmt(Math.max(5,Math.round(a.secs/5)*5))} 秒`:'預估打不完',tips=[];
 if(a.weak.length)tips.push(`${a.weak.join('、')}的生命不到 35%，要先休養才能出發`);
 if(a.safeFloor<a.floor)tips.push(`建議從第 ${a.safeFloor} 層出發（照你選的第 ${a.floor} 層出發也可以）`);
 else if(a.verdict!=='safe')tips.push('可能中途撤退');
 return `<div class="encounter-facts z2c-risk" id="dg-risk">第 ${a.floor} 層風險評估 <em class="z2c-v ${V[1]}">${V[0]}</em> · ${secs}（限時 ${fmt(a.timeLimit)} 秒）${tips.length?`<br><small>${esc(tips.join('；'))}</small>`:''}</div><div class="encounter-facts z2c-tired" id="dg-tired" role="status"${tired?'':' hidden'}>${esc(tired)}</div>`;}
function z2cArenaHTML(s){const a=s.arena,lock=z2cLock('arena'),rwd=game.arenaReward?game.arenaReward():{gold:90,gems:0},reward=rwd.gold;   // 2026-11-16:改用 game.arenaReward(),跟 endArena 同一條公式
 if(a.active){const party=runHudParty(a);
  return `<div class="z1-box z2c-live" id="ar-live"><div class="z2c-live-h"><b>對戰進行中</b><em id="ar-phase">${esc(a.phase)}</em><span id="ar-left"></span></div><div class="z2c-bar-row foe"><span>對手 ${esc(a.opponent)}</span><i class="z2c-bar"><span id="ar-foe-fill"></span></i><b id="ar-foe-num"></b></div>${party.map(h=>`<div class="z2c-bar-row" data-hid="${h.id}"><span>${esc(h.name)}</span><i class="z2c-bar"><span></span></i><b></b></div>`).join('')}</div><div class="encounter-status">勝場 ${a.wins} · 敗場 ${a.losses} · <span id="ar-phase2">${esc(a.phase)}</span></div><div class="encounter-actions z1-sticky z2c-dock z2c-dock-run"><div class="z2c-wait" id="ar-wait">模擬對戰進行中，結束後會跳出結算</div></div>`;}
 const g=partyGate(a.hunterIds.length,a.cooldown,'開始模擬對戰',lock?lock.name:'');
 return `${lock?z2cLockHint(lock):''}<div class="z1-box z2c-info"><div class="encounter-status">勝場 ${a.wins} · 敗場 ${a.losses} · ${lock?'未解鎖':a.cooldown>0?`整備中 <b class="ar-cd">${Math.ceil(a.cooldown)}</b> 秒`:s.expedition?.active?'首領討伐中，結束後才能開賽':'可挑戰'}</div><div class="z2c-rec"><span>對手「${esc(a.opponent)}」</span><span>勝利獎勵</span><span class="z2c-rw">${iconHTML('gold',true)}<b>${fmt(reward)}</b></span>${rwd.gems?`<span class="z2c-rw" title="每 5 勝的星晶">${iconHTML('gems',true)}<b>${rwd.gems}</b></span>`:''}</div>${(()=>{const f=game.arenaFoe?.();if(!f)return'';const {mine,o}=arOddsNow(lock),who=mine?'目前隊伍':'推薦隊伍';   // 2026-11-18:改顯示實際勝算(含隊伍被打倒),選了三人就算選的那隊
      const odds=o?(o.win<10?`<small class="no">${who}大概打不贏，先升級、換裝或轉世再來</small>`:`<small class="${o.win>=60?'ok':o.win>=35?'warn':'no'}">${who}勝算約 <b>${o.win}%</b>，約 ${fmt(o.sec)} 秒分出勝負${o.win<35?'，建議先變強再來':''}</small>`):'';
      return `<div class="encounter-facts z2c-foe-stat">下一位對手：生命 <b>${fmt(f.hp)}</b> · 每次攻擊 <b>${fmt(f.atk)}</b>${odds?`<br>${odds}`:''}</div>`;})()}${a.wins+a.losses<3?'<div class="encounter-facts">三人小隊模擬戰，倒下不會真的死亡、賽後回滿血；每場之間整備約 2 分鐘，首領討伐中不能開賽。對手跟著勝場變強，第 40 勝以後每勝生命 +3%、攻擊 +2%（獎勵在第 40 勝封頂），每 5 勝多給星晶。</div>':''}</div>`
  +`<div class="z2c-party-h"><span>選 3 位獵人上場</span><button class="pixel-button z2c-recbtn" data-zb="gold" data-action="arRecommend" title="挑出每秒傷害最高、體力足夠的三人">推薦隊伍</button></div>`
  +`<div class="party-grid z2c-party">${partyList('arena',a.hunterIds,'toggleArenaHunter','村裡還沒有獵人','先招募一位獵人，才能派隊上競技場')}</div>`
  +`<div class="encounter-actions z1-sticky z2c-dock${lock?' is-lock':''}">${partySummary(a.hunterIds)}<button class="pixel-button gold${g.lock?' z2c-locked':''}" data-action="startArena" ${g.disabled?'disabled':''}>${g.label}</button></div>`;}
// 競技場進行中:面板內的血條逐幀更新(結構不變、不重畫)
function z2cArenaPaint(){const a=game.state.arena,box=document.getElementById('ar-live');if(!box||!a.active)return;
 const set=(fill,num,cur,max)=>{const r=hpRatio(cur,max);if(fill)fill.style.width=(r*100).toFixed(1)+'%';if(num)num.textContent=`${hpShow(cur,max)}/${Math.ceil(max)}`;};
 set(box.querySelector('#ar-foe-fill'),box.querySelector('#ar-foe-num'),a.enemyHp,a.enemyMaxHp);
 for(const row of box.querySelectorAll('.z2c-bar-row[data-hid]')){const h=game.state.hunters.find(x=>x.id===row.dataset.hid);if(h){set(row.querySelector('.z2c-bar>span'),row.querySelector('b'),Math.max(0,h.hp),h.maxHp);row.classList.toggle('down',h.hp<=0);}}
 for(const ph of [box.querySelector('#ar-phase'),document.getElementById('ar-phase2')])if(ph&&ph.textContent!==a.phase)ph.textContent=a.phase;   // 2026-11-24 B11 底部狀態列也跟著階段更新
 const lf=box.querySelector('#ar-left');if(lf)lf.textContent=`剩 ${Math.max(0,Math.ceil(120-(a.time||0)))} 秒`;}
// ── 結算視窗(規格 m):緞帶標題「勝利／落敗／撤退」、一行說明、3 個獎勵格、底部一顆鈕
const Z2C_RUNS={dungeon:null,arena:null};
const z2cNames=ids=>(ids||[]).map(id=>game.state.hunters.find(h=>h.id===id)?.name).filter(Boolean).join('、');
function z2cMarkRetreat(){if(Z2C_RUNS.dungeon)Z2C_RUNS.dungeon.retreat=true;}
function z2cShow(req){if(modal&&modal!=='dungeon'&&modal!=='arena'){z2cPending=req;return;}req.back=modal==='dungeon'||modal==='arena'?modal:'';resultReq=req;openModal('result');}
function z2cResultHTML(){const q=resultReq||{title:'結算',tone:'win',line:'',cells:[]};$('#modal').dataset.tone=q.tone;   // 緞帶標題的顏色(勝=青、敗=紅)靠這個
 return `<div class="z2c-result" data-tone="${q.tone}"><p class="z2c-rline">${esc(q.line)}</p>${q.sub?`<p class="z2c-rsub">${esc(q.sub)}${q.kind==='arena'&&q.tone==='win'?'（經驗與獎金為每人）':''}</p>`:''}<div class="z2c-cells">${q.cells.map(c=>`<div class="z2c-cell${c.v?'':' nil'}"><i>${iconHTML(c.ic,true)}</i><b>${c.v?'+':''}${fmt(c.v)}</b><small>${esc(c.name)}</small></div>`).join('')}</div><div class="encounter-actions"><button class="pixel-button gold" data-action="resultOk" data-foot="only">${q.tone==='win'?'收下':'確定'}</button></div></div>`;}
function z2cWatch(){const s=game?.state;if(!s||!started||offlineBusy){Z2C_RUNS.dungeon=Z2C_RUNS.arena=null;return;}
 const d=s.dungeon,a=s.arena,R=Z2C_RUNS;
 if(d.active&&!R.dungeon)R.dungeon={from:d.floor,best0:d.bestFloor,wins:s.counts.dungeonWins,floors:0,res:{gold:0,ore:0,gems:0},who:z2cNames(d.hunterIds),retreat:false};
 if(R.dungeon){const run=R.dungeon,n=s.counts.dungeonWins-run.wins;if(n>0){run.wins=s.counts.dungeonWins;run.floors+=n;for(const k of ['gold','ore','gems'])run.res[k]+=(d.reward&&d.reward[k])||0;}
  if(!d.active){R.dungeon=null;const won=d.phase==='勝利',tone=won?'win':'lose';if(d.endKind==='retreat')run.retreat=true;const why=d.endKind==='timeout'?`超過 ${game.dungeonTimeLimit||180} 秒沒打完`:'';
   z2cShow({kind:'dungeon',tone,title:won?'勝利':run.retreat?'撤退':'落敗',
    line:won?(d.bestFloor>run.best0?(run.floors>1?`小隊從第 ${run.from} 層一路推進，共通過 ${run.floors} 層，最高紀錄第 ${d.bestFloor} 層。`:`突破第 ${run.from} 層，最高紀錄第 ${d.bestFloor} 層。`)   // 2026-11-24 只有刷新紀錄才寫推進/突破
      :(run.floors>1?`小隊從第 ${run.from} 層一路打過，共通過 ${run.floors} 層（已打過的樓層），最高紀錄仍是第 ${d.bestFloor} 層。`:`再次通過第 ${run.from} 層（已打過的樓層），最高紀錄仍是第 ${d.bestFloor} 層。`))
      :run.retreat?`${d.endNote?d.endNote.replace(/（本層沒有獎勵）。?$/,''):`小隊在第 ${d.floor} 層撤退`}，已返回村莊${run.floors?`；先前通過 ${run.floors} 層`:''}。`:why?`第 ${d.floor} 層${why}，獵人撤回村莊${run.floors?`；先前通過 ${run.floors} 層`:''}。`:`小隊在第 ${d.floor} 層倒下，獵人正撤回村莊休養${run.floors?`；先前通過 ${run.floors} 層`:''}。`,
    sub:run.who,cells:[{ic:'gold',name:'金幣',v:run.res.gold},{ic:'ore',name:'鐵礦',v:run.res.ore},{ic:'gems',name:'星晶',v:run.res.gems}]});}}
 if(a.active&&!R.arena)R.arena={wins:a.wins,who:z2cNames(a.hunterIds)};
 if(R.arena&&!a.active){const run=R.arena;R.arena=null;const won=a.wins>run.wins;
  z2cShow({kind:'arena',tone:won?'win':'lose',title:won?'勝利':'落敗',line:won?`擊敗了「${a.opponent}」，村莊獲得 ${fmt(a.reward)} 金幣。`:`輸給了「${a.opponent}」，隊伍已安全撤回（模擬對戰不會真的死亡）。`,sub:run.who,
   cells:[{ic:'gold',name:'村莊金幣',v:won?a.reward:0},{ic:'hunter',name:'獵人經驗',v:won?(a.xpEach||0):0},{ic:'gold',name:'獵人獎金',v:won?25:0}]});}}
function z2cTick(){const s=game?.state;if(!s)return;
 z2cWatch();
 if(z2cPending&&!modal&&!placing){const r=z2cPending;z2cPending=null;resultReq=r;openModal('result');}
 // 2026-11-18:整備時間改 120 秒 → 面板上的秒數就地更新(不整頁重畫);整備結束、首領討伐開始/結束時重畫(開賽鈕才會解鎖)
 if(modal==='arena'){const a=s.arena,sig=a.active+':'+a.wins+':'+a.losses+':'+(game.state.buildings.training||0)+':'+(a.cooldown>0)+':'+!!s.expedition?.active;if(z2cArSig&&sig!==z2cArSig){z2cArSig=sig;openModal('arena');}else{z2cArSig=sig;if(a.active)z2cArenaPaint();else if(a.cooldown>0){const t=String(Math.ceil(a.cooldown));for(const el of document.querySelectorAll('#modal .ar-cd'))if(el.textContent!==t)el.textContent=t;for(const b of document.querySelectorAll('#modal button[disabled]'))if(/小隊整備中 \d+ 秒/.test(b.textContent))b.lastChild.textContent=b.lastChild.textContent.replace(/\d+ 秒/,t+' 秒');}}}else z2cArSig='';
 bossHudPaint();}
let z2cArSig='';
// ── 首領:召喚前確認(UX #6)＋出征 HUD 頂部中央的血條與剩餘時間(規格 a)
function z2cBossEst(){const s=game.state,ex=s.expedition,alive=s.hunters.filter(h=>h.hp>0&&h.task!=='dungeon'&&h.task!=='arena'),atk=alive.reduce((n,h)=>n+h.attack,0),hp=Math.ceil(ex.bossMaxHp||ENEMIES.boss.hp),ratio=atk/Math.max(1,hp);
 return {hp,atk,n:alive.length,verdict:!alive.length?'hard':ratio>=.2?'easy':ratio>=.09?'ok':'hard'};}
function z2cBossConfirmHTML(){const e=z2cBossEst(),V=Z2C_V[e.verdict],say={easy:'全隊火力充足，預計能在限時內擊倒。',ok:`勢均力敵：限時 ${BOSS_LIMIT} 秒內要打完，過程中會有人受傷。`,hard:'偏危險：人手或火力不足，可能無功而返、獵人倒下。建議先升級或等傷兵恢復。'}[e.verdict];
 return `<div class="hv-confirm z2c-bconf"><div class="z2c-bc-name">${BOSS_NAME}</div><dl class="z2c-bc-list"><div><dt>血量</dt><dd>${fmt(e.hp)}</dd></div><div><dt>我方總攻擊</dt><dd>${fmt(e.atk)}<small>（${e.n} 位獵人）</small></dd></div><div><dt>預估</dt><dd><em class="z2c-v ${e.verdict}">${V[0]}</em></dd></div></dl><p>${say}</p><div class="hv-confirm-row"><button class="pixel-button quiet hv-btn cancel" data-action="bossBack" data-foot="secondary">取消</button><button class="pixel-button gold hv-btn primary" data-action="startBoss" data-foot="primary">召喚</button></div></div>`;}
function bossHudPaint(){const el=document.getElementById('boss-bar');if(!el)return;const ex=game.state.expedition,on=!!(ex&&ex.active)&&!document.body.classList.contains('piloting');
 if(!on){if(!el.classList.contains('hidden')){el.classList.add('hidden');el.dataset.z2c='';}return;}
 if(el.dataset.z2c!=='1'){el.innerHTML=`<strong>${BOSS_NAME}</strong><em class="z2c-bs">進行中</em><div class="progress red"><span id="boss-fill"></span><b id="boss-hp"></b></div><time class="z2c-bt"></time>`;el.dataset.z2c='1';el.setAttribute('role','progressbar');el.setAttribute('aria-label',BOSS_NAME+'血量');}
 el.classList.remove('hidden');
 {const pos=innerHeight<=520?'land':innerWidth<=760?'port':'desk';if(el.dataset.pos!==pos)el.dataset.pos=pos;
  if(pos==='port'){const tb=document.querySelector('#topbar')?.getBoundingClientRect().bottom||0,hl=document.querySelector('#hv-left')?.getBoundingClientRect().bottom||0,t=Math.round(Math.max(tb,hl)+6)+'px';if(el.style.getPropertyValue('--z2c-boss-top')!==t)el.style.setProperty('--z2c-boss-top',t);}}
 const hp=Math.max(0,ex.bossHp||0),max=ex.bossMaxHp||1,left=Math.max(0,Math.ceil(BOSS_LIMIT-(ex.elapsed||0)));
 const f=el.querySelector('#boss-fill'),t=el.querySelector('#boss-hp'),tm=el.querySelector('.z2c-bt');if(f)f.style.width=Math.max(0,Math.min(100,hp/max*100)).toFixed(1)+'%';
 const txt=`${fmt(hp)}/${fmt(max)}`;if(t&&t.textContent!==txt)t.textContent=txt;const tt=`${Math.floor(left/60)}:${String(left%60).padStart(2,'0')}`;if(tm&&tm.textContent!==tt){tm.textContent=tt;tm.setAttribute('aria-label','剩餘時間 '+tt);}
 el.setAttribute('aria-valuenow',String(Math.round(hp)));el.setAttribute('aria-valuemax',String(Math.round(max)));}
Object.assign(Z2C,{dungeon:z2cDungeonHTML,arena:z2cArenaHTML,result:z2cResultHTML,bossConfirm:z2cBossConfirmHTML,verdictTag:z2cVerdictTag,fit:z2cFit,markRetreat:z2cMarkRetreat,flashBuild:z2cFlashBuild,fitMap:z2cFitMap,resetRuns:()=>{Z2C_RUNS.dungeon=null;Z2C_RUNS.arena=null;z2cPending=null;resultReq=null;z2cArSig='';nextStepKey='';}});
// ═══ Z2C end ═══

// T132：下一步建議——把「現在最該做的一件事」放在畫面下方，點一下直接跳過去。
// 純粹由 state 推導，不記任何「已看過」狀態；條件消失就自己收起來。
let nextStepEl=null,nextStepKey='';
// 教學鏈(第 2–7 章)每章的「下一步」:文字＋要開的畫面(nextStepGo 的 act)＋建設面板要標的建築(flash)
// 2026-11-17:Lv.100 還能轉世的獵人。自動續戰不會自己停,滿級獵人常卡在地下城隊伍裡(轉世會被拒絕)→ 先叫玩家撤退
Z2C.questGo=s=>{const q=s&&s.quest;if(!q||q.complete||q.claimed)return null;return q.index===0?{text:'',act:'recruit',label:'去招募'}:questGuide(s);};
function rebirthTip(s){const top=(s.hunters||[]).filter(h=>(h.level||0)>=100&&(h.rebirths||0)<20&&(h.hp||0)>0);if(!top.length)return null;
  const free=top.find(h=>h.task!=='dungeon'&&h.task!=='arena');if(free)return {text:`${free.name} 到 Lv.100 了，轉世後能力會更強`,act:'rebirth:'+free.id,label:'去轉世'};
  const dg=top.find(h=>h.task==='dungeon');if(dg)return {text:`${dg.name}已 Lv.100，在地下城裡，先讓小隊撤退再轉世`,act:'rebirth:'+dg.id,label:'去轉世頁'};
  return {text:`${top[0].name}已 Lv.100，競技場打完就能轉世`,act:'arena',label:'看競技場'};}
function questGuide(s){const q=s.quest||{},n=q.index+1,p=`（${fmt(q.progress||0)}/${fmt(q.target||0)}）`,dg=(s.buildings?.dungeon||0)>0;
  switch(q.index){
    case 1:return {text:`到「倉庫 → 製作」做餐點，完成第 ${n} 章${p}`,act:'craft',label:'去製作'};
    case 2:return {text:`在交易所發布材料收購，獵人回村就會賣給你${p}`,act:'trade',label:'去交易所'};
    case 3:return {text:`把鐵匠鋪升到 Lv.2，完成第 ${n} 章`,act:'build',label:'去建設',flash:'forge'};
    case 4:return {text:`鍛造 1 件精鐵武器，完成第 ${n} 章`,act:'craftGear',label:'去鍛造'};
    case 5:return {text:`召喚森林領主，讓獵人一起討伐，完成第 ${n} 章`,act:'boss',label:'召喚首領'};
    case 6:return dg?{text:`派 3 位獵人進地下城打完 1 層，完成第 ${n} 章`,act:'dungeon',label:'去地下城'}:{text:'先蓋地下城入口，獵人才能出發闖關',act:'build',label:'去建設'};
    // 2026-11-16 中期章節(8–18):每章也給「下一步該按哪裡」;條件不足時先指向卡住的那棟建築
    case 7:return (s.capacity||0)<(q.target||12)?{text:`升級獵人小屋增加名額（目前 ${s.capacity}），第 ${n} 章要 ${q.target} 位獵人`,act:'build',label:'去建設',flash:'house'}:{text:`到「招募」邀請好感度夠的流浪英雄，第 ${n} 章${p}`,act:'recruit',label:'去招募'};
    case 8:case 13:case 16:return {text:`派獵人打地下城、競技場最快練等級，第 ${n} 章${p}`,act:'dungeon',label:'去地下城'};
    case 9:return {text:`把城鎮大廳升到 Lv.${q.target}，第 ${n} 章${p}`,act:'build',label:'去建設',flash:'hall'};
    case 10:case 14:return s.dungeon?.active&&s.dungeon?.auto?{text:`地下城自動續戰中，推到第 ${fmt(q.target||0)} 層完成第 ${n} 章${p}`,act:'dungeon',label:'看戰況'}:{text:`開自動續戰往下推，地下城紀錄第 ${n} 章${p}`,act:'dungeon',label:'去地下城'};   // 已在自動續戰就不要再叫玩家「開自動續戰」
    case 11:return (s.buildings?.academy||0)>0?{text:`在獵人詳情的「技能」頁學習戰鬥技能，第 ${n} 章${p}`,act:'hunters',label:'看名冊'}:{text:`先蓋學院，才能教獵人戰鬥技能（第 ${n} 章）`,act:'build',label:'去建設',flash:'academy'};
    case 12:return (s.buildings?.enhancement||0)>0?{text:`在獵人詳情的「裝備」頁強化武器，第 ${n} 章${p}`,act:'hunters',label:'看名冊'}:{text:`先蓋強化精煉所，才能強化武器（第 ${n} 章）`,act:'build',label:'去建設',flash:'enhancement'};
    case 15:return {text:`首領出征冷卻好就召喚，第 ${n} 章${p}`,act:'boss',label:'召喚首領'};
    case 17:return rebirthTip(s)||{text:`讓獵人練到 Lv.100 後轉世（最高 Lv.${Math.max(0,...(s.hunters||[]).map(h=>h.level||0))}）`,act:'dungeon',label:'去地下城'};
  }return null;}
function nextStepPick(s,skipQuest=false){
  if(!s||!s.hunters)return null;
  const idle=(s.hunters||[]).filter(h=>!h.task&&(h.hp||0)>0);
  if(!skipQuest&&s.quest&&s.quest.complete&&!s.quest.claimed)return {key:'quest',text:'村長委託的獎勵可以領了',act:'quests',label:'查看委託'};
  // 2026-11-16:第 1 章是「邀請 1 位旅人」→ 這時引導先跟委託走同一件事,不要上面寫招募、下面叫人去蓋地下城(兩個第一步互搶)
  // 2026-11-25 旅人取消:有人好感度到門檻 → 去招募(還沒有人到門檻時,最後面才說明好感度怎麼來,不跟其他建議互搶)
  if(s.quest&&s.quest.index===0&&!s.quest.complete&&recruitable(s))return {key:'visitor',text:'有流浪英雄願意加入了，邀請 1 位完成第 1 章委託',act:'recruit',label:'去招募'};
  // 2026-11-16:前 7 章是教學鏈 → 顧問照「目前這一章要做的事」帶路(獵魔村式:一次只指一件事),不要跟委託追蹤互搶
  {const q=s.quest,g=q&&q.index<=6?questGuide(s):null;if(q&&!q.complete&&!q.claimed&&g)return {key:'quest'+q.index+'-'+(q.progress||0),...g};}
  // Z2C(UX #1):還沒有地下城入口、而且蓋得起 → 第一步是蓋它(不是「去地下城挑人」);蓋不起時照舊走下面的建議
  {const dg0=BUILDINGS.find(b=>b.id==='dungeon');if(dg0&&!(s.buildings&&s.buildings.dungeon>0)&&Object.entries(dg0.cost).every(([k,n])=>(s[k]||0)>=n))return {key:'dungeon0',text:'先蓋地下城入口，獵人才能出發闖關',act:'build',label:'去建設'};}
  const vis=recruitable(s);   // 2026-11-16:名額滿了就不提示招募(按了也招不進來);2026-11-25 = 好感度到門檻、付得起的流浪英雄
  if(vis)return {key:'visitor',text:'有 '+vis+' 位流浪英雄願意加入',act:'recruit',label:'去招募'};
  const sold=soldOutGoods(s);
  if(sold.length)return {key:'restock',text:sold.slice(0,2).join('、')+(sold.length>2?'等':'')+'賣完了，到倉庫的製作補貨',act:'craft',label:'去製作'};
  // 中期章節(8–18)的帶路排在「商品賣完」之後:斷貨會直接少收入,比章節目標急
  {const q=s.quest,g=q&&q.index>=7?questGuide(s):null;if(q&&!q.complete&&!q.claimed&&g)return {key:'quest'+q.index+'-'+(q.progress||0),...g};}
  // 2026-11-17:倉庫舊裝備堆到 30 件、又沒開自動整理 → 提醒一次去倉庫整理(30 天會堆到約 300 件);件數以 10 件為一格,避免每換一件就重彈
  if((s.autoJunk||'off')==='off'&&(s.gearStorage||[]).length>=30&&game.bulkStoredGear){const old=game.bulkStoredGear('sell',true).count;if(old>=30)return {key:'junk'+Math.floor(old/10),text:'倉庫堆了 '+old+' 件舊裝備，可以一鍵賣出或開「自動賣出」',act:'equipstore',label:'去裝備倉庫'};}
  {const q=s.quest,t=(!q||q.claimed||q.index>17)?rebirthTip(s):null;if(t)return {key:'rebirth|'+t.text,...t};}
  // 2026-11-18:委託鏈結束後金幣、星晶會一直堆 → 夠晉升時提醒(只在委託全部完成後,不跟前期引導互搶)
  {const q=s.quest;if(q&&q.claimed&&game.promoteQuote){const c=(s.hunters||[]).filter(h=>h.hp>0&&h.task!=='dungeon'&&h.task!=='arena').map(h=>({h,p:game.promoteQuote(h.id)})).filter(x=>x.p&&!x.p.max&&s.gold>=x.p.gold&&s.gems>=x.p.gems).sort((a,b)=>b.h.level-a.h.level)[0];if(c)return {key:'promote|'+c.h.id+'|'+c.p.next,text:`金幣與星晶夠讓${c.h.name}晉升為${c.p.name}（「轉世」頁）`,act:'hunters',label:'看名冊'};}}
  const d=s.dungeon||{};
  if((s.buildings&&s.buildings.dungeon||0)>0&&idle.length>=3&&!d.active&&!(d.cooldown>0))
    return {key:'dungeon',text:idle.length+' 位獵人待機，可以派去地下城',act:'dungeon',label:'去地下城'};
  if(buildableCount(s)>0)return {key:'build',text:'資源夠了，可以蓋新的建築',act:'build',label:'去建設'};
  if(!d.active&&(s.buildings&&s.buildings.dungeon||0)>0&&idle.length>=1&&!(d.cooldown>0))
    return {key:'dungeon2',text:'派滿 3 位獵人就能進地下城（目前 '+idle.length+' 位待機）',act:'dungeon',label:'看地下城'};
  if(idle.length===s.hunters.length&&idle.length>0)
    return {key:'hunt',text:'獵人都在村裡待機，可以派到生態區蒐集材料',act:'hunters',label:'去派遣'};
  // 2026-11-25 第 1 章還沒有人願意加入、也沒別的事可做 → 說明好感度怎麼來(開局約 1–2 分鐘就有第一位)
  if(s.quest&&s.quest.index===0&&!s.quest.complete)return {key:'visitor-wait',text:'流浪英雄'+AFF_RISE+'，到門檻就能邀請（第 1 章）',act:'recruit',label:'看招募'};
  return null;
}
function nextStepPaint(){
  const s=game&&game.state;
  // 面板開著、或點了單位小卡、或正在放置建築時，都不要多疊一條東西。
  const insp=document.querySelector('#inspector');
  const inspectorOpen=!!(insp&&!insp.classList.contains('hidden'));
  // 2026-11-25 旅人取消 → 「新的獵人」暗帶不再自動彈出;招募提示走下面的顧問提示(key 'visitor')
  // 2026-11-11 獵魔村風格:「下一步」改成左側任務追蹤下方的顧問提示(小頭像＋兩行字);可領委託獎勵由任務追蹤自己標示,這裡跳過。
  const slot=document.querySelector('#hv-advisor');
  const n=modal||(typeof unitCardEl!=='undefined'&&unitCardEl)||placing||inspectorOpen?null:nextStepPick(s,!!slot);
  if(!n){if(nextStepEl){nextStepEl.remove();nextStepEl=null;}nextStepKey='';return;}
  const key=n.key+'|'+n.text;
  if(key===nextStepKey&&nextStepEl)return;
  nextStepKey=key;
  if(!nextStepEl){nextStepEl=document.createElement('button');nextStepEl.type='button';nextStepEl.id='next-step';nextStepEl.className='next-step'+(slot?' hv-advice':'');nextStepEl.setAttribute('data-action','nextStep');(slot||document.body).appendChild(nextStepEl);}
  nextStepEl.innerHTML='<i class="ns-ic">'+(slot?elderFace():iconHTML('scroll',true))+'</i><span class="ns-tx"></span><b class="ns-go"></b>';
  nextStepEl.querySelector('.ns-tx').textContent=n.text;
  nextStepEl.querySelector('.ns-go').textContent=n.label;
  nextStepEl.setAttribute('data-key',n.key);
  nextStepEl.setAttribute('data-act',n.act);
  if(n.flash)nextStepEl.setAttribute('data-flash',n.flash);else nextStepEl.removeAttribute('data-flash');
  nextStepEl.setAttribute('aria-label',n.text+'（'+n.label+'）');
  setIcons(nextStepEl);
}

let lastStormCount=-1;   // T137:閃電次數(變了才叫雷聲)
function frame(now){requestAnimationFrame(frame);if(document.hidden){previous=now;return;}const frameMsNow=started&&game.state.paused?PAUSED_MS:(fpsTarget===60?1000/60:FRAME_MS);if(now<nextFrame-2)return;nextFrame=Math.max(nextFrame+frameMsNow,now);
 // 每幀實際花了多少時間(給效能檢查用:手機上這個值決定會不會發燙)
 const t0=performance.now();try{frames++;if(now-fpsStart>2000){document.body.dataset.fps=Math.round(frames*1000/(now-fpsStart));fpsStart=now;frames=0;}const dt=Math.min(.1,(now-previous)/1000);previous=now;if(started)game.tick(dt);pilotHudTick();{
    // T113：村莊環境音（打鐵、酒館、交易所、鐘聲）只在相機看得到村莊時響
    const c=world?.cameraXZ?.();const inVil=c?Math.hypot(c.x+15,c.z-3)<30:true;
    ambientSet(game.state.region||'village',realNightNow()?.7:.15,game.state.buildings,inVil);   // 2026-11-26:蟲鳴/鳥叫看真實時間(.7 = 晚上、.15 = 白天,見 sfx.ambientSet)
      ambientRain(!!globalThis.__mistvaleRain?.on);
    {const st=globalThis.__mistvaleStorm;if(st&&st.count!==lastStormCount){lastStormCount=st.count;if(st.count)sfx('thunder',{gain:.85});}}   // T137:打雷   // T136：下雨就加一層雨聲
  }world.update(game.state.paused?0:dt,game.state);dungeonTick();z2cTick();runHudPaint();nextStepPaint();z2dMarkPaint();if(unitCardEl)unitCardPaint();selPaint();liveModalTick(now);liveHpSync(now);if(modal==='codex'&&now-codexFaceAt>400){codexFaceAt=now;paintPortraits();}if(now-last>400){paint();last=now;}if(now-lastSave>5000){save();lastSave=now;}}finally{const ms=performance.now()-t0;frameMs.avg=frameMs.avg?frameMs.avg*.9+ms*.1:ms;frameMs.max=Math.max(frameMs.max,ms);frameMs.n++;if(perfProbe)perfSample(now,ms);}}requestAnimationFrame(frame);}catch(err){console.error(err);$('#loading').innerHTML='<b>像素村莊載入失敗，請重新整理</b>';}

// 讀取畫面:圖片全部載完(成功或失敗都算完成)、村莊地板與建築都用美術版畫好、圖示換成圖集之後才進村莊。
// 有圖載入失敗就停在錯誤畫面,不進村、也不會退回程序繪製的陽春素材。
function bootWhenReady(){
  const loader=$('#loading'),bar=$('#loading-bar'),label=$('#loading-label'),phaseEl=$('#loading-phase'),assetEl=$('#loading-asset'),shownAt=performance.now(),MIN_SHOW_MS=600;   // 快取命中時也讓讀取動畫露一下,不然一閃就過
  let released=false;
  const seed=el=>{if(el.animate)el.animate([{opacity:.3},{opacity:1}],{duration:REDUCE_MOTION.matches?0:180,easing:'ease-out'});};   // 文字變了才寫(避免每幀重排),新文字從 30% 透明淡入
  const set=(el,text)=>{if(!el||el.textContent===text)return;el.textContent=text;seed(el);};
  // 讀取畫面底部的提示輪替：一閃就過的畫面也順便教一件事(2 秒換一則，減少動態時只換文字不做淡入)。
  const TIPS=[matchMedia('(pointer:coarse)').matches?'提示：單指拖曳平移視角，雙指縮放':'提示：拖曳畫面可平移視角，滾輪縮放','提示：點選建築再按腳下的 i，就能升級；升級前會先告訴你需要什麼','提示：蓋好地下城入口後，選三位獵人就能派去地下城，回來會帶回材料','提示：交易所收購的材料，會在獵人回村時自動成交','提示：鐵匠鋪與學院等級越高，裝備與技能越強','提示：手機上左下搖桿走路、右下按鈕攻擊'];
  const tipEl=$('#loading-tip');
  let tipI=0,tipTimer=0;
  const tipNext=()=>{if(!tipEl)return;tipEl.textContent=TIPS[tipI++%TIPS.length];if(tipEl.animate&&!REDUCE_MOTION.matches)tipEl.animate([{opacity:.2},{opacity:.95}],{duration:220,easing:'ease-out'});};
  const tipStop=()=>{if(tipTimer)clearInterval(tipTimer);tipTimer=0;};
  if(tipEl){tipNext();tipTimer=setInterval(tipNext,2000);}
  // 2026-11-19:載入的那幾秒原本是全黑畫布,只有一張小卡浮著。先把世界地圖畫成背景(純資料繪製、不吃素材、不等載入),
  // 第一秒就有東西,而且是這款遊戲自己的世界,不是裝飾圖。
  requestAnimationFrame(()=>{try{const lm=document.getElementById('loading-map');
    if(lm){const ar=WORLD_MAP_W/WORLD_MAP_H,w=Math.min(innerWidth,innerHeight*ar),h=Math.round(w/ar);   // 等比縮到畫面內:地圖不被拉寬
      lm.style.width=Math.round(w)+'px';lm.style.height=h+'px';paintMap(lm);}   // 照世界地圖的長寬比,不把地圖拉寬
  }catch(e){}});
  const step=()=>{
    const p=assetProgress();
    if(p.failed){tipStop();loader.classList.add('failed');label.textContent='素材載入失敗，請重新整理';return;}
    // 圖示的圖集延後到第 2 秒才放行(共 2 張):前面先讓 13 MB 素材解析與各圖集載入取得主執行緒,
    // 之後的進度輪詢才不會每次都被大張圖的貼上拖住,讀條才會一直動。
    if(!released&&performance.now()-shownAt>2000){released=true;globalThis.__mistvaleReleaseIcons?.();}
    const warming=world.assetsReady()&&iconsReady();   // 素材齊了,開始預熱
    const ready=p.done>=p.total&&warming;
    // 百分比 = 圖片完成比例;最後一步(預熱)由這裡顯示,不會卡在 99% 不動
    const pct=ready?100:Math.min(99,Math.round(p.done/Math.max(1,p.total)*100));
    bar.style.width=`${pct}%`;set(label,`載入素材 ${pct}%`);
    if(warming)markPhase('預熱角色素材');
    set(phaseEl,p.phase||'整理素材');
    set(assetEl,p.queued?'· 正在載入圖示':'· 載入美術素材');
    if(!ready||performance.now()-shownAt<MIN_SHOW_MS){requestAnimationFrame(step);return;}
    if(!world.warmupAssets()){requestAnimationFrame(step);return;}
    start();
    tipStop();
    loader.classList.add('done');setTimeout(()=>loader.remove(),500);
  };
  requestAnimationFrame(step);
}
function paintMap(canvas,mini=false){
 if(!canvas)return;if(!mini)z2cFitMap(canvas);const g=canvas.getContext('2d');g.imageSmoothingEnabled=false;const w=canvas.width,h=canvas.height,margin=mini?4:15,sx=(w-margin*2)/WORLD.width,sy=(h-margin*2)/WORLD.height;
 g.fillStyle=MAP_ACCENT.sea;g.fillRect(0,0,w,h);
 for(let z=WORLD.minZ;z<WORLD.maxZ;z+=1)for(let x=WORLD.minX;x<WORLD.maxX;x+=1){const terrain=biomeAt(x,z);g.fillStyle=MAP_PALETTE[terrain]||BIOME_PALETTE[terrain];if((x*17+z*31)%11===0&&!['ocean','river','ice','bridge'].includes(terrain))g.fillStyle=terrain==='snow'?MAP_ACCENT.snow:terrain==='desert'?MAP_ACCENT.desert:terrain==='mountain'?MAP_ACCENT.mountain:MAP_ACCENT.grass;g.fillRect(Math.floor(margin+(x-WORLD.minX)*sx),Math.floor(margin+(z-WORLD.minZ)*sy),Math.ceil(sx),Math.ceil(sy));}
 const to=(x,z)=>[margin+(x-WORLD.minX)*sx,margin+(z-WORLD.minZ)*sy];
 for(const b of BUILDINGS){if(!game.state.buildings[b.id])continue;const p=game.state.layout[b.id],q=to(p.x,p.z);g.fillStyle='#efe1af';g.fillRect(q[0]-3,q[1]-2,6,4);}
 const placed=[];   // 2026-11-17 區域名牌互相避開:先試點的下方,再試上方、右、左;四個位置都會壓到別的名牌就只畫點(名字在下方清單)
 for(const r of REGIONS){const[x,y]=to(r.x,r.z);g.fillStyle=r.id===game.state.region?'#ffe182':'#344634';g.fillRect(x-3,y-3,6,6);if(!mini){const small=w<260,nm=small?r.name.slice(0,2):r.name;g.font=`bold ${small?11:12}px "Ark Pixel 12", "Microsoft JhengHei", sans-serif`;g.textAlign='center';const tw=g.measureText(nm).width,bw=tw+(small?4:8),bh=small?15:19;
  const spots=[[x-bw/2,y+4],[x-bw/2,y-4-bh],[x+5,y-bh/2],[x-5-bw,y-bh/2]].map(([lx,ly])=>[Math.max(1,Math.min(w-bw-1,lx)),Math.max(1,Math.min(h-bh-1,ly))]);
  const hit=([lx,ly])=>placed.some(q=>lx<q[0]+q[2]&&lx+bw>q[0]&&ly<q[1]+q[3]&&ly+bh>q[1]),spot=spots.find(p=>!hit(p));if(!spot)continue;placed.push([spot[0],spot[1],bw,bh]);
  g.fillStyle='#233428dd';g.fillRect(spot[0],spot[1],bw,bh);g.fillStyle='#ffebbd';g.fillText(nm,spot[0]+bw/2,spot[1]+(small?12:14));}}   // 手機地圖只有約 160px 寬:用兩個字的簡稱(白樺、向陽…都不重複)
 if(mini)for(const h of game.state.hunters){const[x,y]=to(h.x,h.z);g.fillStyle='#fff7da';g.fillRect(x-1,y-1,3,3);}
}

globalThis.__toast=(msg,ok=true,kind)=>logToast(msg,ok,kind);globalThis.__mistvaleToastDodge=()=>toastDodge();   // 驗收用:面板內容變動後重算 toast 位置

/* ===== 開場畫面（T150）：移除本段即回退 ===== */
(function titleScreen(){
  try{
    if(new URLSearchParams(location.search).has('preview'))return;
    if(sessionStorage.getItem('mistvale-title-seen'))return;
  }catch(e){return;}
  // FIX-A B5:標題畫面該不該有「繼續／重新開始」,看的是「開機當下有沒有存檔」——start() 會在標題出現前自動存檔,不能再讀 localStorage
  globalThis.__mistvaleTitle={state:'pending'};   // start() 靠它等標題關掉才開歡迎對話框
  let keyHandler=null;
  const hasSave=()=>bootHadSave;
  const close=()=>{const el=document.getElementById('title-screen');if(el)el.remove();if(keyHandler){document.removeEventListener('keydown',keyHandler,true);keyHandler=null;}if(globalThis.__mistvaleTitle)globalThis.__mistvaleTitle.state='closed';try{sessionStorage.setItem('mistvale-title-seen','1')}catch(e){}};
  // Z2D(UX #2):「重新開始」不再一點就刪檔——先跳確認 C 小視窗(標題「重新開始」、說明「會刪除目前存檔」、確認刪除(紅)／取消),確認才刪、重新載入。確認框蓋在標題畫面上方(CSS 抬高 #modal-backdrop)。
  // (確認刪除時先把 started 關掉:重新載入前頁面轉成背景會觸發 visibilitychange → save() 把剛刪掉的存檔又寫回去,「重新開始」就沒有重新開始)
  const fresh=()=>{askConfirm('會刪除目前存檔，無法復原。','確認刪除',()=>{started=false;try{localStorage.removeItem(SAVE_KEY)}catch(e){};location.reload();},'');
    const t=$('#modal-title');if(t)t.textContent='重新開始';
    const y=document.querySelector('#modal [data-action=confirmYes]'),n=document.querySelector('#modal [data-action=confirmNo]');if(y)y.dataset.zb='red';if(n)n.dataset.zb='ghost';};
  const help=()=>{close();try{openModal('help')}catch(e){}};
  const saveInfo=()=>{try{
    if(!bootHadSave)return '';
    const d=JSON.parse(localStorage.getItem(SAVE_KEY)||'null');
    if(!d)return '';
    const gold=Math.round(d.gold||0), n=(d.hunters||[]).length;
    return `遊戲時間 ${playTimeText(d.time)} · 金幣 ${gold.toLocaleString('en-US')} · 獵人 ${n} 位`;
  }catch(e){return ''}};
  const isNight=()=>{try{return isRealNight();}catch(e){return false}};   // 2026-11-26:標題畫面的夜景看真實時間(本機 19:00–05:59)
  const show=()=>{
    if(document.getElementById('title-screen'))return;
    const el=document.createElement('div');
    el.id='title-screen'; if(isNight())el.classList.add('ts-night'); el.setAttribute('role','dialog'); el.setAttribute('aria-label','暮影村 開場');
    el.innerHTML=`<div class="ts-inner">
      <i class="ts-crest" aria-hidden="true"></i>
      <div class="ts-title">暮影村</div>
      <div class="ts-sub">獵魔物語</div>
      <div class="ts-rule"></div>
      <div class="ts-save">${saveInfo()}</div>
      <div class="ts-actions">
        <button class="pixel-button gold" type="button" data-ts="continue">${hasSave()?'繼續遊戲':'開始遊戲'}</button>
        <button class="pixel-button" type="button" data-ts="help">遊戲說明</button>
      </div>
      ${hasSave()?'<button class="ts-link" type="button" data-ts="fresh">重新開始</button>':''}
      <div class="ts-meta">插圖與圖示：PixelLab 生成 · v1.4.0</div>
      <div class="ts-hint">${(TOUCH_ONLY.matches||TOP_NARROW.matches)?'點擊畫面開始':'按 Enter 或點擊畫面開始'}</div>
    </div>`;
    el.addEventListener('click',(ev)=>{
      const b=ev.target.closest('[data-ts]');
      const act=b?b.dataset.ts:'continue';
      if(act==='fresh')return fresh();
      if(act==='help')return help();
      close();
    });
    // FIX-A B12:新增與移除都用 capture(true),而且標題用點的關掉時也一併移除
    if(keyHandler)document.removeEventListener('keydown',keyHandler,true);
    keyHandler=function esc(ev){
      if(modalShown())return;   // Z2D:「重新開始」確認框開著時,Enter／Esc 交給確認框,不把標題畫面關掉
      if(ev.key==='Enter'||ev.key==='Escape')close();
    };
    document.addEventListener('keydown',keyHandler,true);
    if(globalThis.__mistvaleTitle)globalThis.__mistvaleTitle.state='shown';
    document.body.appendChild(el);
  };
  const wait=()=>{ if(document.getElementById('loading')){ setTimeout(wait,400); return; } setTimeout(show,120); };
  setTimeout(wait,500);
})();

/* ===== 指令面板（Ctrl/⌘+K）：快速跳到任何面板 ===== */
// ── Z1:按鈕顏色語意(2026-11-12 決定 C2)。紅＝關閉／取消、橄欖綠＝確認與視窗主動作、金棕＝清單列裡的動作、灰＝不能用(CSS 看 :disabled,標題 ≥3 字的加鎖頭)。
// 分類集中在這一張表:新按鈕要換顏色就在這裡加 data-action,或直接在按鈕上寫 data-zb="red|olive|gold|ghost"(優先於表)。
const ZB_RED=new Set(['close','closeInspector','confirmNo','cancelMove','regionInfoClose','densityFor','unitCardClose','dgRetreat','runRetreat']);
const ZB_OLIVE=new Set(['confirmYes','offlineOk','startDungeon','startArena','startDispatch','startBoss','regionTravel','dispatchRegion','recruitWanderer','welcomeStart','welcomeNext','nextStepGo','train']);
function zbRole(b){if(b.dataset.zb)return b.dataset.zb;const a=b.dataset.action||'',f=b.dataset.foot;
 if(f==='secondary')return 'red';if(f==='primary'||f==='only')return 'olive';
 if(ZB_RED.has(a))return 'red';if(ZB_OLIVE.has(a))return 'olive';
 if((a==='upgrade'||a==='construct')&&b.closest('#inspector'))return 'olive';
 if(b.classList.contains('quiet'))return 'ghost';return 'gold';}
const ZB_SCOPE='#modal,#inspector,#left-panel,#placement,#unit-card,#run-hud';
function zbPaint(root){if(!root||root.nodeType!==1)return;const list=root.matches?.('button.pixel-button,button.hv-btn')?[root]:[];list.push(...root.querySelectorAll?.('button.pixel-button,button.hv-btn')||[]);
 for(const b of list){if(b.matches('[aria-pressed],.hv-i,.hv-tool,.hv-max'))continue;b.classList.add('zb');const r=zbRole(b);if(b.dataset.zbr!==r){b.dataset.zbr=r;}
  if((b.textContent||'').trim().length>=3&&!b.dataset.zbCur)b.classList.add('zb-lock');}}
(()=>{if(typeof MutationObserver==='undefined')return;const scope=n=>n.nodeType===1&&(n.matches?.(ZB_SCOPE)||n.closest?.(ZB_SCOPE));
 for(const r of document.querySelectorAll(ZB_SCOPE))zbPaint(r);
 new MutationObserver(ms=>{for(const m of ms)for(const n of m.addedNodes){if(n.nodeType!==1)continue;if(scope(n))zbPaint(n);else if(n.querySelector?.(ZB_SCOPE)){for(const r of n.querySelectorAll(ZB_SCOPE))zbPaint(r);}}}).observe(document.body,{childList:true,subtree:true});})();
(()=>{
  const CMDS=[
    ['build','村莊建設','build'],
    ['hunters','獵人名冊','hunters roster'],
    ['recruit','招募流浪英雄','recruit'],
    ['trade','交易所','trade'],
    ['inventory','村莊倉庫','storehouse stock'],
    ['equipstore','裝備倉庫','equipment gear storage warehouse'],
    ['craft','製作（倉庫頁籤）','craft inventory'],
    ['dungeon','地下城遠征','dungeon'],
    ['arena','競技場（地下城頁籤）','arena'],
    ['quests','村長委託','quests'],
    ['codex','魔物圖鑑','codex'],
    ['difficulty','狩獵難度','difficulty'],
    ['settings','遊戲設定','settings'],
    ['help','村長入門手札','help'],
  ];
  let box=null,input=null,list=null,rows=[],sel=0;
  const close=()=>{if(!box)return;box.remove();box=null;input=null;list=null;rows=[];globalThis.__mistvaleCmdkOpen=false;};
  const open=()=>{
    if(box)return;
    box=document.createElement('div');box.id='cmdk';
    box.innerHTML='<div class="cmdk-box" role="dialog" aria-modal="true" aria-label="指令面板">'
      +'<div class="cmdk-head"><span class="cmdk-key">⌘K</span>'
      +'<input id="cmdk-input" type="text" placeholder="輸入面板名稱或關鍵字…" autocomplete="off" spellcheck="false" aria-label="搜尋面板">'
      +'<button type="button" class="cmdk-esc" aria-label="關閉">ESC</button></div>'
      +'<ul class="cmdk-list" role="listbox" aria-label="面板清單"></ul>'
      +'<p class="cmdk-foot">↑↓ 選擇　Enter 開啟　Esc 關閉</p></div>';
    document.body.appendChild(box);
    input=box.querySelector('#cmdk-input');list=box.querySelector('.cmdk-list');
    const paint=()=>{
      const q=input.value.trim().toLowerCase();
      rows=CMDS.filter(c=>!q||c[1].includes(q)||c[0].includes(q)||c[2].includes(q));
      sel=Math.max(0,Math.min(sel,rows.length-1));
      list.innerHTML=rows.length?rows.map((c,i)=>`<li class="cmdk-row${i===sel?' sel':''}" role="option" aria-selected="${i===sel}" data-type="${c[0]}"><b>${c[1]}</b><small>${c[2]}</small></li>`).join(''):'<li class="cmdk-empty">沒有符合的面板</li>';
      list.dataset.count=String(rows.length);
    };
    const run=(i)=>{const c=rows[i];if(!c)return;close();openModal(c[0]);};
    input.addEventListener('input',()=>{sel=0;paint();});
    input.addEventListener('keydown',(e)=>{
      if(e.key==='ArrowDown'){e.preventDefault();sel=Math.min(sel+1,rows.length-1);paint();}
      else if(e.key==='ArrowUp'){e.preventDefault();sel=Math.max(sel-1,0);paint();}
      else if(e.key==='Enter'){e.preventDefault();run(sel);}
      else if(e.key==='Escape'){e.preventDefault();close();}
    });
    list.addEventListener('click',(e)=>{const li=e.target.closest('.cmdk-row');if(!li)return;run(rows.findIndex(c=>c[0]===li.dataset.type));});
    box.addEventListener('click',(e)=>{if(e.target===box||e.target.closest('.cmdk-esc'))close();});
    paint();input.focus();globalThis.__mistvaleCmdkOpen=true;
  };
  document.addEventListener('keydown',(e)=>{
    if((e.ctrlKey||e.metaKey)&&(e.key==='k'||e.key==='K')){e.preventDefault();e.stopPropagation();box?close():open();return;}
    if(e.key==='Escape'&&box){e.preventDefault();e.stopPropagation();close();}
  },true);
  globalThis.__mistvaleCmdk={open,close,isOpen:()=>!!box};
})();
