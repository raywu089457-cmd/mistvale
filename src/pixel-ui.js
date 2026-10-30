import {WORLD,REGIONS,BIOME_PALETTE,biomeAt} from './overworld.js';
import {iconCanvas,iconsReady} from './pixel-icons.js';
import {assetProgress,markPhase} from './asset-loading.js';
import {createGame,OFFLINE} from './pixel-game.js';
import {REGION_MONSTERS,MONSTER_NAME,MONSTER_LORE} from './lore.js';
import {createPixelWorld,drawPortrait,buildingDataURL,MAP_PALETTE,MAP_ACCENT} from './pixel-world.js';
import {BUILDINGS,CLASSES,RARITIES,TRAITS,MATERIALS,PRODUCTS,RECIPES,DIFFICULTIES,PILOT_ATTACK,SAVE_KEY} from './pixel-data.js';

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Math.floor(Number(n)||0).toLocaleString('en-US');
// top-bar resources on phones: 5+ digits do not fit the 4-across row, so 12,345 → 12.3k (exact numbers stay in the storehouse)
const TOP_NARROW=matchMedia('(max-width:760px),(max-height:520px)');
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
let infoRegion='meadow';   // 「地圖詳細資訊」彈窗目前看的區域
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

function setIcons(root=document){root.querySelectorAll('[data-icon]').forEach(e=>{if(e.firstElementChild?.dataset?.type===e.dataset.icon)return;e.innerHTML='';const c=icon(e.dataset.icon);c.dataset.type=e.dataset.icon;e.append(c);});}
function iconHTML(n){return `<span class="inline-icon" data-icon="${n}"></span>`;}
function logToast(msg,ok=true){const e=document.createElement('div');e.className=`toast${ok?'':' error'}`;e.textContent=msg;const box=$('#toasts');box.append(e);while(box.children.length>4)box.firstElementChild.remove();setTimeout(()=>e.remove(),3300);}   // 最多同時 4 則(連點製作時不會疊滿整個畫面)
function save(){if(!started||previewMode)return;try{const data=game.serialize();data.savedAt=Date.now();localStorage.setItem(SAVE_KEY,JSON.stringify(data));$('#save-label').textContent='已自動儲存';$('#save-label').classList.remove('warn');}catch{$('#save-label').textContent='請匯出存檔';$('#save-label').classList.add('warn');}}
function costs(obj){return Object.entries(obj||{}).map(([k,v])=>`<span class="${game.state[k]<v?'short':''}">${iconHTML(k)} ${fmt(v)}</span>`).join('');}
function start(){started=true;if(artReviewMode){for(const b of BUILDINGS)game.state.buildings[b.id]=Math.max(1,game.state.buildings[b.id]);game.state.enemies=[];}game.state.paused=artReviewMode;$('#game-ui').classList.remove('hidden');world?.update(0,game.state);world?.focus('home');paint(true);if(bootOffline>=60&&!artReviewMode)runOffline(bootOffline);else save();warmBuildingImgs();}
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
function resourceRows(){const s=game.state;return [['food','香烤麵包','food'],['drink','莓果飲品','drink'],['bed','舒適床鋪','bed'],['bandage','亞麻繃帶','bandage']].map(([id,n,ic])=>`<button class="stock-item" data-action="craftProduct" data-id="${id}">${iconHTML(ic)}<span>${n}</span><b>${s.stocks[id]}</b><em>製作</em></button>`).join('');}
function miniRoster(){return game.state.hunters.slice(0,3).map(h=>`<button class="mini-hunter" data-action="hunter" data-id="${h.id}"><img data-portrait="${h.id}"><div><strong>${esc(h.name)} <small>Lv.${h.level}</small></strong><p>${esc(h.status)}</p><div class="tiny-health"><span style="width:${Math.max(0,h.hp/h.maxHp*100)}%"></span></div></div></button>`).join('');}
// 圖集載入完成後,立繪快取(portraitCache)必須清掉重畫 —— 
// 不然 UI 永遠顯示圖集載入前生成的舊立繪。(實測踩到:截圖跟舊版逐像素相同)
addEventListener('pixel-assets-ready',()=>{for(const k in portraitCache)delete portraitCache[k];paintPortraits();});
function paintPortraits(){document.querySelectorAll('[data-portrait]').forEach(e=>{const h=game.state.hunters.find(v=>v.id===e.dataset.portrait);if(!h)return;e.src=portrait(h);});}

function paintQuest(){const q=game.state.quest;$('#quest-chapter').textContent=`CHAPTER ${String(q.index+1).padStart(2,'0')}`;$('#quest-title').textContent=q.title;$('#quest-desc').textContent=q.description;$('#quest-progress').textContent=`${q.progress}/${q.target}`;$('#quest-fill').style.width=`${Math.min(100,q.progress/q.target*100)}%`;$H('#quest-reward').innerHTML=costs(q.reward);$('#quest-button').textContent=q.claimed?'全部委託完成':q.complete?'領取獎勵':'查看委託';$('#quest-button').disabled=q.claimed;}
function paintInspector(){if(!selected||!BUILDINGS.some(b=>b.id===selected))return;const b=BUILDINGS.find(v=>v.id===selected),s=game.state,l=s.buildings[b.id],p=s.layout[b.id];$('#inspect-title').textContent=b.name;const img=buildingImg(b.id);$H('#inspect-content').innerHTML=`<div class="inspect-art">${img?`<img src="${img}" alt="${b.name}">`:iconHTML(b.type)}</div><div class="inspect-level">${l?'建築 Lv.'+l:'尚未建造'}</div><p class="inspect-desc">${b.desc}</p><div class="inspect-effect"><strong>作用</strong><br>${b.effect}</div><div class="cost"><span>需求</span>${costs(l?game.getUpgradeCost(b.id):b.cost)}</div><div class="inspect-actions">${l?`<button class="pixel-button gold" data-action="upgrade" data-id="${b.id}">升級 Lv.${l+1}</button>`:`<button class="pixel-button gold" data-action="construct" data-id="${b.id}">建造</button>`}<button class="move" data-action="moveBuilding" data-id="${b.id}">移動位置</button></div>`;setIcons($('#inspect-content'));}
const resFloat={t:0,last:null};
function floatDeltas(s){const keys=['gold','gems','wood','ore'],now=performance.now();if(!resFloat.last){resFloat.last=Object.fromEntries(keys.map(k=>[k,s[k]]));resFloat.t=now;return;}if(now-resFloat.t<1200)return;
 for(const k of keys){const d=Math.round(s[k]-resFloat.last[k]);resFloat.last[k]=s[k];if(!d||!started)continue;const host=$('#'+k)?.closest('button,div');if(!host)continue;if(getComputedStyle(host).position==='static')host.style.position='relative';const f=document.createElement('span');f.className='res-float '+(d>0?'up':'down');f.textContent=(d>0?'+':'−')+fmt(Math.abs(d));host.append(f);setTimeout(()=>f.remove(),1100);}resFloat.t=now;}
function paint(force=false){const s=game.state;floatDeltas(s);['gold','wood','ore','gems'].forEach(k=>$('#'+k).textContent=topNum(s[k]));$('#population').textContent=`${s.hunters.length}/${s.capacity}`;$('#town-level').textContent=`村莊 Lv.${s.buildings.hall}`;$('#difficulty-name').textContent=DIFFICULTIES[s.difficulty].name;{const di=$('.difficulty-button [data-icon]');if(di)di.dataset.icon='diff-'+Math.max(0,Math.min(4,DIFFICULTIES.indexOf(DIFFICULTIES[s.difficulty])));}$H('#stock-list').innerHTML=resourceRows();$H('#mini-roster').innerHTML=miniRoster();paintPortraits();paintQuest();$('#pause').textContent=s.paused?'▶':'Ⅱ';$('#speed').textContent=`${s.speed}×`;$('#pause-label').classList.toggle('hidden',!s.paused);$H('#notice-feed').innerHTML=s.log.slice(0,3).map(l=>`<div>${esc(l.text)}</div>`).join('');if(selected)paintInspector();setIcons();document.body.dataset.kills=s.totalKills;document.body.dataset.services=s.counts.services;const landscape=world?.landscapeStats?.();if(landscape){document.body.dataset.trees=landscape.trees;document.body.dataset.arenas=landscape.arenas;document.body.dataset.roads=landscape.roads;}document.body.dataset.worldArea=WORLD.area;document.body.dataset.region=s.region;const rb=$('#region-badge');if(rb)rb.textContent=(REGIONS.find(r=>r.id===s.region)?.name||'向陽草原')+' · 狩獵中';pilotStatus();}
// 主世界地圖畫布:長寬比跟世界一樣(一格世界單位在畫面上是正方形),四周各留 15 像素邊。
const WORLD_MAP_H=392,WORLD_MAP_W=Math.round((WORLD_MAP_H-30)*WORLD.width/WORLD.height)+30;
function modalTitle(t,ic='scroll'){const names={worldmap:'主世界地圖',build:'村莊建設',hunters:'獵人名冊',hunter:'獵人詳情',trade:'交易所',craft:'製作與庫存',dungeon:'地下城遠征',arena:'競技場模擬對戰',quests:'村長委託',inventory:'村莊倉庫',difficulty:'狩獵難度',offline:'離線收益',recruit:'招募訪客',settings:'遊戲設定',help:'村長入門手札',boss:'地圖首領',dispatch:'派遣出征 · 自由組隊',region:'地圖詳細資訊'};$('#modal-title').textContent=names[t]||t;$('#modal-icon').dataset.icon=ic;setIcons($('#modal'));}
function portrait(h){const key=h.classId+':'+h.rarity;if(portraitCache[key])return portraitCache[key];const c=document.createElement('canvas');c.width=84;c.height=96;drawPortrait(c,h,{scale:2.7});return portraitCache[key]=c.toDataURL();}

const MODAL_TAB={build:'build',hunters:'hunters',hunter:'hunters',recruit:'hunters',dispatch:'hunters',region:'hunters',trade:'trade',craft:'craft',dungeon:'dungeon',arena:'arena',quests:'quests'};
// 2026-10-30:彈窗開著時上方資源列與下方分頁列留在最上層、照常可點(看得到金幣變化、直接切換分頁),彈窗放在兩條列之間。
// 兩條列的實際高度每種版面不同(桌機/直式/橫式) → 開窗與縮放視窗時量一次,寫進 --hud-top / --hud-bottom。
function measureHud(){const top=$('#topbar'),bot=$('#bottom-bar'),vis=e=>e&&!e.classList.contains('hidden')&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden';
 const on=!document.body.classList.contains('piloting')&&vis(top)&&vis(bot);document.body.classList.toggle('hud-modal',on&&!!modal);if(!on)return;
 const st=document.documentElement.style;st.setProperty('--hud-top',Math.max(0,Math.round(top.getBoundingClientRect().bottom))+'px');st.setProperty('--hud-bottom',Math.max(0,Math.round(innerHeight-bot.getBoundingClientRect().top))+'px');}
addEventListener('resize',()=>{if(modal)measureHud();});
// 2026-10-30:開著的彈窗跟著遊戲狀態即時更新(交易所的收購量會被回村的獵人消化、委託進度、倉庫、製作庫存),
// 只在資料真的變了才重畫,最多 0.25 秒一次;手指/滑鼠按在彈窗裡時先不換(不吃掉點擊),捲動位置保留。
const LIVE={trade:s=>[s.tradeRequests,s.gold,s.wood,s.ore,s.herb,s.cloth,s.flour,s.leather],quests:s=>[s.quest],inventory:s=>[s.wood,s.ore,s.herb,s.cloth,s.flour,s.leather,s.stocks,s.gearStock],craft:s=>[s.stocks,s.gearStock,s.wood,s.ore,s.herb,s.cloth,s.flour,s.leather]};
let liveSig='',liveAt=0;
function liveModalTick(now){const f=LIVE[modal];if(!f||now-liveAt<250)return;liveAt=now;const sig=JSON.stringify(f(game.state));if(!liveSig){liveSig=sig;return;}if(sig===liveSig)return;
 const box=$('#modal-content');if(pressEl&&box.contains(pressEl))return;liveSig=sig;const st=box.scrollTop;openModal(modal);box.scrollTop=st;liveSig=sig;}
function openModal(type){modal=type;liveSig='';$('#modal').dataset.type=type;document.body.dataset.modalTab=MODAL_TAB[type]||'';measureHud();$('#modal-backdrop').classList.remove('hidden');modalTitle(type,type==='trade'?'trade':type==='craft'?'anvil':type==='dungeon'?'dungeon':type==='arena'?'swords':type==='hunters'?'hunter':type==='difficulty'?'skull':type==='dispatch'?'swords':type==='region'?'map':'scroll');$('#modal-content').innerHTML=modalHTML(type);if(type==='worldmap')paintMap($('#world-map-canvas'));setIcons($('#modal-content'));paintPortraits();}
function dungeonStatus(){const d=game.state.dungeon;return d.active?`第 ${d.floor} 層 · 第 ${Math.max(1,d.wave||1)}/3 波 · ${d.phase}${d.auto?' · 自動續戰':''}`:`最高紀錄：第 ${d.bestFloor} 層 · ${d.cooldown>0?`整備中 ${Math.ceil(d.cooldown)} 秒`:'可以出發'}`;}
let dgSig='';   // 地下城彈窗開著時:出發/結束(畫面要換)就整個重畫,其他只改狀態列
function dungeonTick(){if(modal!=='dungeon'){dgSig='';return;}const d=game.state.dungeon,sig=d.active+':'+d.bestFloor;if(dgSig&&sig!==dgSig){dgSig=sig;openModal('dungeon');return;}dgSig=sig;
 const st=$('#dg-status'),txt=dungeonStatus();if(st&&st.textContent!==txt)st.textContent=txt;if(d.active)world?.drawDungeonStrip?.($('#dungeon-strip'),game.state);}
function closeModal(){modal='';document.body.dataset.modalTab='';document.body.classList.remove('hud-modal');$('#modal-backdrop').classList.add('hidden');}
function modalHTML(type){const s=game.state;
 if(type==='worldmap')return `<div class="world-map-header"><span>主世界 · 8 個區域</span><button class="pixel-button" data-action="worldOverview">全景查看</button><button class="pixel-button" data-action="recallHunters">召回獵人</button></div><canvas id="world-map-canvas" width="${WORLD_MAP_W}" height="${WORLD_MAP_H}" aria-label="主世界區域地圖"></canvas><div class="region-grid">${REGIONS.map(r=>`<article class="region-card ${s.region===r.id?'active':''}" data-region="${r.id}" style="--biome:${r.color}">${AS().ui?.['px-region-'+r.id]?`<div class="region-art" style="background-image:var(--ui-px-region-${r.id})"></div>`:''}<i class="region-emblem" data-icon="em-${r.id}"></i><h3>${r.name}</h3><small>${r.subtitle}</small><p>${r.description}</p>${loreList(r.id)}<div><button class="pixel-button" data-action="regionView" data-id="${r.id}">查看</button>${r.id!=='village'?`<button class="pixel-button gold" data-action="regionTravel" data-id="${r.id}">前往${r.name}</button>`:''}</div></article>`).join('')}</div><p class="modal-note">參考主世界的生態分區與河流配置。獵人沿橋樑通行；這個版本不含挖掘、放置方塊或無限地形。</p>`;

 if(type==='build')return `<p class="modal-intro">村長可以自由建造和升級設施。把建築移到喜歡的位置，讓獵人往返更順暢。</p><div class="building-grid">${BUILDINGS.map(b=>{const l=s.buildings[b.id];return `<button class="building-card ${l?'':'unbuilt'}" data-action="selectBuilding" data-id="${b.id}"><img src="${buildingImg(b.id)}" alt="${b.name}"><strong>${b.name}</strong><small>${l?'Lv.'+l:'未建造'}</small><b class="build-level">${l?'◆':''}</b></button>`}).join('')}</div>`;
 if(type==='hunters'){const all=s.hunters,list=rosterList(all);return `<div class="modal-toolbar"><span>性格、稀有度、裝備與需求都會影響狩獵結果。</span><button class="pixel-button" data-action="dispatchHunters">派遣出征</button><button class="pixel-button" data-action="recallHunters">召回村內</button><button class="pixel-button gold" data-action="recruit">招募訪客</button></div>${rosterBar(all.length,list.length)}<div class="roster-grid">${list.length?'':'<p class="modal-note">沒有符合條件的獵人。</p>'}${list.map(h=>`<button class="hunter-card" data-action="hunter" data-id="${h.id}"><i class="class-emblem" data-icon="em-${h.classId}"></i><img data-portrait="${h.id}"><div><h3>${esc(h.name)}</h3><small>Lv.${h.level} · ${CLASSES.find(c=>c.id===h.classId)?.name}</small><div class="rarity" data-rarity="${h.rarity}" style="--rarity:${RARITIES.find(r=>r.id===h.rarity)?.color}">${RARITIES.find(r=>r.id===h.rarity)?.name}</div><div class="status">${esc(h.status)}</div><div class="tiny-health"><span style="width:${h.hp/h.maxHp*100}%"></span></div></div></button>`).join('')}</div><p class="modal-note">獵人擁有自己的金幣，會購買餐點、飲品、床鋪、繃帶與裝備。</p>`;}
 if(type==='recruit')return `<div class="encounter-banner recruit"><i>${iconHTML('hunter')}</i><div><h3>招募訪客</h3><p>旅人會隨時間來到村莊。邀請更稀有的獵人加入，他們會帶著不同的性格與成長潛力。</p></div></div><div class="visitor-grid">${s.visitors.map(v=>{const c=CLASSES.find(x=>x.id===v.classId),r=RARITIES.find(x=>x.id===v.rarity),t=TRAITS.find(x=>x.id===v.trait);return `<article class="visitor-card"><div class="visitor-art"><img src="${portrait({id:v.id,classId:v.classId})}" alt="${c.name}"></div><h3>${c.name}</h3><div class="rarity" data-rarity="${r.id}" style="--rarity:${r.color}">${r.name}</div><div class="trait">${t.name} · ${t.desc}</div><p>${c.desc}</p><button class="pixel-button gold" data-action="recruitVisitor" data-id="${v.id}">邀請加入 ${v.cost} 金幣</button></article>`}).join('')}</div>`;
 if(type==='trade'){const rows=Object.entries(MATERIALS).map(([id,m])=>{const q=s.tradeRequests[id]||0;   // 2026-10-30 交易所重做:每種材料一列,±鈕直接改收購量(不用再按「發布」)
   return `<div class="trade-row ${q?'on':''}"><i class="tr-icon">${iconHTML(id)}</i><div class="tr-name"><b>${m.name}</b><small>庫存 ${fmt(s[id])} · ${m.price} 金幣/份</small></div><div class="tr-step" role="group" aria-label="${m.name}收購數量"><button class="pixel-button" data-action="tradeStep" data-id="${id}" data-d="-10" ${q?'':'disabled'}>−10</button><button class="pixel-button" data-action="tradeStep" data-id="${id}" data-d="-1" ${q?'':'disabled'}>−</button><output>${q}</output><button class="pixel-button" data-action="tradeStep" data-id="${id}" data-d="1" ${q>=999?'disabled':''}>＋</button><button class="pixel-button" data-action="tradeStep" data-id="${id}" data-d="10" ${q>=999?'disabled':''}>+10</button></div><div class="tr-cost">${q?`最多 ${fmt(q*m.price)} 金`:'未收購'}</div></div>`;}).join('');
  const total=Object.entries(s.tradeRequests).reduce((n,[k,v])=>n+(v||0),0),budget=Object.entries(s.tradeRequests).reduce((n,[k,v])=>n+(v||0)*(MATERIALS[k]?.price||0),0);
  return `<div class="encounter-banner trade"><i>${iconHTML('trade')}</i><div><h3>交易所</h3><p>向獵人發布收購委託：他們打獵回村時會把戰利品賣給村莊，村莊付金幣、拿到材料。</p></div></div><div class="trade-list">${rows}</div><div class="trade-footer"><span>收購中 <b>${fmt(total)}</b> 份 · 最多支出 <b>${fmt(budget)}</b> 金幣<br><small>從村莊金庫付款；獵人下次回村自動成交。</small></span><button class="pixel-button" data-action="tradeClear" ${total?'':'disabled'}>全部停收</button></div>`;}
 if(type==='craft')return `<div class="encounter-banner craft"><i>${iconHTML('anvil')}</i><div><h3>製作與庫存</h3><p>把材料轉成獵人需要的生活物資與裝備。服務會由獵人付費，回到村莊金庫。</p></div></div><div class="tabs"><button class="${craftTab==='goods'?'active':''}" data-action="craftTab" data-id="goods">生活物資</button><button class="${craftTab==='gear'?'active':''}" data-action="craftTab" data-id="gear">裝備製作</button></div>${craftTab==='goods'?`<div class="craft-grid">${Object.entries(PRODUCTS).map(([id,p])=>`<article class="craft-card"><div class="craft-heading"><i>${iconHTML(id)}</i><div><h3>${p.name}</h3><small>庫存 ${s.stocks[id]} · 售價 ${p.price}</small></div></div><p>${p.need==='hp'?'治療生命':p.need==='satiety'?'恢復飽食度':p.need==='stamina'?'恢復精力':'恢復心情'}，旅館與商店建築升級後效果更佳。</p><div class="cost">${costs(p.cost)}</div><div class="craft-buttons"><button class="pixel-button gold" data-action="craftProduct" data-id="${id}">製作 10 份</button><button class="pixel-button" data-action="craftProduct" data-id="${id}" data-batches="5">製作 50 份</button></div></article>`).join('')}</div>`:`<div class="craft-grid">${RECIPES.map(r=>`<article class="craft-card"><div class="craft-heading"><i>${iconHTML('anvil')}</i><div><h3>${r.name}</h3><small>裝備庫存 ${s.gearStock[r.type]} · 售價 ${r.price}</small></div></div><p>獵人返回村莊後會用個人金幣購買，裝備提升攻擊或防禦。</p><div class="cost">${costs(r.cost)}</div><button class="pixel-button gold" data-action="craftGear" data-id="${r.id}">鍛造裝備</button></article>`).join('')}</div>`}`;
 if(type==='dispatch'){const teams=s.dispatchTeams||[];const tab=Math.min(dispatchTab,teams.length-1);const team=teams[tab]||{name:'隊伍 1',ids:[],region:'meadow'};
   // 2026-10-30 重排:分頁＋快速鈕同一列;隊員卡加職業、近戰/遠程、生命條、「在別組」;狩獵區改成徽章卡＋危險度(依 risk 由易到難排)
   const alive=aliveHunters();const rn=REGIONS.find(r=>r.id===team.region)?.name||team.region;
   const other=h=>teams.findIndex((t2,i)=>i!==tab&&t2.ids.includes(h.id));
   const regions=REGIONS.filter(r=>r.id!=='village').sort((x,y)=>y.risk-x.risk);   // 2026-10-30:危險度由強到弱(最硬的排最上面)
   return `<p class="modal-intro">四組隊伍各自記住隊員與狩獵區（存檔會保留）。每位獵人只會在一組裡，選進這組就會從別組移過來。</p>
   <div class="dispatch-head"><div class="dispatch-tabs">${teams.map((t2,i)=>`<button class="pixel-button ${i===tab?'gold':''}" data-action="dispatchTab" data-index="${i}">${t2.name}${t2.ids.length?`（${t2.ids.length}）`:''}</button>`).join('')}</div>
   <div class="dispatch-quick"><span>已選 <b>${team.ids.length}</b> / ${alive.length}</span><button class="pixel-button" data-action="dispatchAll">全選</button><button class="pixel-button" data-action="dispatchNone" ${team.ids.length?'':'disabled'}>清空</button></div></div>
   <h4 class="dispatch-h">${iconHTML('hunter')}${team.name}的隊員</h4>
   <div class="party-grid dispatch-party">${s.hunters.map(h=>{const sel=team.ids.includes(h.id),o=other(h),c=CLASSES.find(x=>x.id===h.classId);
     return `<button class="party-pick ${sel?'selected':''} ${h.hp<=0?'down':''}" data-action="toggleDispatchHunter" data-id="${h.id}" aria-pressed="${sel}"><img data-portrait="${h.id}"><span>${esc(h.name)}<b>Lv.${h.level} · ${c?.name||''}</b><em>${c&&c.range>=3?'遠程':'近戰'}${o>=0?` · 在${teams[o].name}`:''}</em><i class="pp-hp"><i style="width:${Math.round(Math.max(0,h.hp)/h.maxHp*100)}%"></i></i></span><small>${h.hp<=0?'✝':sel?'✓':''}</small></button>`;}).join('')}</div>
   <h4 class="dispatch-h">${iconHTML('map')}狩獵區：<b>${rn}</b><small>★ 越多越危險、獎勵越好</small></h4>
   <div class="region-pick-grid">${regions.map(r=>`<div class="region-pick ${r.id===team.region?'on':''}" style="--biome:${r.color}"><button class="rp-body" data-action="dispatchRegion" data-id="${r.id}" aria-pressed="${r.id===team.region}"><i class="rp-em" data-icon="em-${r.id}"></i><span><b>${r.name}</b><small>${r.subtitle}</small><em aria-label="危險度 ${riskStars(r.risk).split('★').length-1}">${riskStars(r.risk)}</em></span></button><button class="rp-info" data-action="regionInfo" data-id="${r.id}" aria-label="${r.name} 詳細資訊" title="地圖詳細資訊">${iconHTML('scroll')}</button></div>`).join('')}</div>
   <div class="encounter-actions dispatch-go"><button class="pixel-button gold" data-action="startDispatch" ${team.ids.length?'':'disabled'}>${iconHTML('swords')}${team.ids.length?`派遣 ${team.ids.length} 位前往${rn}`:'這一組還沒有隊員'}</button></div>`;
 }
 // 2026-10-30:地圖詳細資訊(派遣出征的區域卡右上角捲軸鈕)。數值全部讀 game.regionInfo(),不另外抄。
 if(type==='region'){const rig=game.regionInfo(infoRegion)||game.regionInfo(REGIONS[1].id);const teams=s.dispatchTeams||[];const team=teams[Math.min(dispatchTab,teams.length-1)]||{name:'這一組',ids:[]};const fit=rig.fit(team.ids||[]);
   const FIT={easy:['easy','這組打這裡很輕鬆，打完幾乎不會受傷。'],ok:['ok','剛好打得動，偶爾會掛彩。'],hard:['hard','偏硬，會被打傷；建議先練等或換更弱的區。']};
   const lootRows=Object.entries(rig.loot).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<span>${iconHTML(k)}<b>${v}</b><small>${MATERIALS[k]?.name||k}</small></span>`).join('');
   return `<article class="region-detail" style="--biome:${rig.color}">
   ${AS().ui?.['px-region-'+rig.id]?`<div class="region-detail-art" style="background-image:var(--ui-px-region-${rig.id})"></div>`:''}
   <div class="rd-head"><i class="rd-em" data-icon="em-${rig.id}"></i><div><h3>${rig.name}</h3><small>${rig.subtitle}</small><em class="rd-risk" aria-label="危險度 ${rig.riskStars} 顆星">${riskStars(rig.risk)}<b>危險度 ${rig.riskStars}/5</b></em></div></div>
   <p class="rd-desc">${rig.description}</p>
   <div class="rd-stats"><div><small>場上魔物</small><b>${rig.alive} 隻</b></div><div><small>正在狩獵</small><b>${rig.hunting} 位獵人</b></div><div><small>首領</small><b>${rig.boss?'出沒中':'未出現'}</b></div><div><small>你目前的位置</small><b>${rig.current?'就在這裡':'不在這區'}</b></div></div>
   <p class="rd-fit ${fit?FIT[fit.verdict][0]:'none'}">${iconHTML('hunter')}<span>${fit?`${team.name}：${FIT[fit.verdict][1]}<small>舒適度 ${fit.comfort} · 這區威脅 ${fit.threat}</small>`:'這一組還沒有隊員，先在上面選人。'}</span></p>
   <h4 class="dispatch-h">${iconHTML('skull')}出沒魔物</h4>
   <ul class="rd-monsters">${rig.monsters.map(m=>`<li><div><b>${MONSTER_NAME[m.id]||m.id}</b><small>生命 ${m.hp} · 攻擊 ${m.attack} · ${m.gold} 金幣 · ${m.xp} 經驗</small></div><p>${MONSTER_LORE[m.id]||''}</p></li>`).join('')}</ul>
   <h4 class="dispatch-h">${iconHTML('trade')}每打倒一隻的平均掉落</h4>
   <div class="rd-loot">${lootRows}</div>
   <div class="encounter-actions dispatch-go"><button class="pixel-button gold" data-action="dispatchRegion" data-id="${rig.id}">選為${team.name}的目的地</button><button class="pixel-button" data-action="regionInfoClose">返回派遣</button></div></article>`;
 }

 if(type==='offline'){const o=offlineSum||{seconds:0,res:{},kills:0,levels:[]},hh=Math.floor(o.seconds/3600),mm=Math.floor(o.seconds%3600/60),NM={gold:'金幣',gems:'晶石',...Object.fromEntries(Object.entries(MATERIALS).map(([k,m])=>[k,m.name]))};
  const rows=Object.entries(o.res).filter(([,v])=>v).map(([k,v])=>`<div class="material-item">${iconHTML(k)}<div><span>${NM[k]||k}</span><b class="${v<0?'short':''}">${v>0?'+':''}${fmt(v)}</b></div></div>`).join('');
  return `<p class="modal-intro">村長不在的 ${hh?hh+' 小時 ':''}${mm} 分鐘裡，獵人們照常狩獵、買賣與生活${o.capped?'（離線收益最多計算 8 小時）':''}。</p><div class="offline-kills">${iconHTML('skull')}獵人擊倒 <b>${fmt(o.kills)}</b> 隻${o.wanderKills?` · 流浪英雄擊倒 <b>${fmt(o.wanderKills)}</b> 隻`:''}</div>${o.dungeon?`<div class="offline-kills">${iconHTML('dungeon')}地下城最高紀錄 第 ${o.dungeon.from} 層 → <b>第 ${o.dungeon.to} 層</b>${o.dungeon.active?` · 小隊還在第 ${o.dungeon.floor} 層奮戰`:' · 小隊已回村'}</div>`:''}<div class="materials-grid">${rows||'<p>村莊資源沒有變化。</p>'}</div>${o.levels.length?`<h3 class="offline-h">獵人成長</h3><ul class="offline-levels">${o.levels.map(l=>`<li>${esc(l.name)} Lv.${l.from} → <b>Lv.${l.to}</b></li>`).join('')}</ul>`:''}<div class="encounter-actions"><button class="pixel-button gold" data-action="offlineOk">收下</button></div>`;}
 if(type==='dungeon'){const d=s.dungeon,maxF=d.bestFloor+1,startF=Math.min(maxF,d.startFloor||maxF);   // 2026-10-30:橫條戰鬥畫面(world.drawDungeonStrip 每幀畫)、起始層、自動續戰
  const controls=`<div class="dungeon-controls"><div class="floor-pick"><span>起始層</span><button class="pixel-button" data-action="dgFloor" data-id="-1" ${d.active||startF<=1?'disabled':''} aria-label="往前一層">−</button><b>第 ${startF} 層</b><button class="pixel-button" data-action="dgFloor" data-id="1" ${d.active||startF>=maxF?'disabled':''} aria-label="往後一層">＋</button><button class="pixel-button" data-action="dgFloor" data-id="max" ${d.active||startF>=maxF?'disabled':''}>最新</button></div><button class="pixel-button ${d.auto?'gold':''}" data-action="dgAuto" aria-pressed="${d.auto}">${iconHTML('rebirth')}自動續戰：${d.auto?'開':'關'}</button>${d.active?'<button class="pixel-button danger" data-action="dgRetreat">撤退</button>':''}</div>`;
  return `<div class="encounter-banner dungeon"><i>${iconHTML('dungeon')}</i><div><h3>地下城遠征</h3><p>選派三位獵人深入地下城。近戰站前排、遠程站後排，每層三波魔物。開啟自動續戰會一層接一層打下去。</p></div></div>${d.active?`<canvas id="dungeon-strip" class="dungeon-strip" aria-label="地下城戰鬥畫面"></canvas>`:''}<div class="encounter-status" id="dg-status">${dungeonStatus()}</div>${controls}${d.active?'':`<div class="party-grid">${s.hunters.map(h=>`<button class="party-pick ${d.hunterIds.includes(h.id)?'selected':''}" data-action="toggleDungeonHunter" data-id="${h.id}"><img data-portrait="${h.id}"><span>${h.name}<b>Lv.${h.level}</b></span><small>${d.hunterIds.includes(h.id)?'✓':''}</small></button>`).join('')}</div><div class="encounter-actions"><button class="pixel-button gold" data-action="startDungeon">派遣三人小隊 · 從第 ${startF} 層</button></div>`}`;}
 if(type==='arena')return `<div class="encounter-banner arena"><i>${iconHTML('swords')}</i><div><h3>競技場模擬對戰</h3><p>與 NPC「${s.arena.opponent}」進行三人小隊模擬戰，不消耗真實死亡資源。</p></div></div><div class="encounter-status">勝場 ${s.arena.wins} · 敗場 ${s.arena.losses} · ${s.arena.active?s.arena.phase:s.arena.cooldown>0?'整備中':'可挑戰'}</div><div class="party-grid">${s.hunters.map(h=>`<button class="party-pick ${s.arena.hunterIds.includes(h.id)?'selected':''}" data-action="toggleArenaHunter" data-id="${h.id}"><img data-portrait="${h.id}"><span>${h.name}<b>Lv.${h.level}</b></span><small>${s.arena.hunterIds.includes(h.id)?'✓':''}</small></button>`).join('')}</div><div class="encounter-actions"><button class="pixel-button gold" data-action="startArena">開始模擬對戰</button></div>`;
 if(type==='quests'){const list=game.questList(),cur=s.quest.index,done=i=>i<cur||(i===cur&&s.quest.claimed);   // 2026-10-30 委託改成章節鏈:完成 ✓、目前(進度＋領取)、之後(鎖住、可預覽)
  return `<div class="encounter-banner quests"><i>${iconHTML('quest')}</i><div><h3>村長委託</h3><p>${s.quest.claimed?'全部章節都完成了。新的村莊傳說正在等待被書寫。':`第 ${cur+1} 章／共 ${list.length} 章 · 完成委託領取村莊獎勵。`}</p></div></div><ol class="quest-chain">${list.map((q,i)=>{const st=done(i)?'done':i===cur?'current':'locked';
   return `<li class="quest-step ${st}"><span class="qs-num">${st==='done'?'✓':String(i+1).padStart(2,'0')}</span><div class="qs-body"><h3>${q.title}</h3><p>${q.description}</p>${st==='current'?`<div class="progress"><span style="width:${Math.min(100,s.quest.progress/s.quest.target*100)}%"></span><b>${s.quest.progress}/${s.quest.target}</b></div>`:''}<div class="cost">獎勵 ${costs(q.reward)}</div></div>${st==='current'?`<button class="pixel-button gold" data-action="quest" ${s.quest.complete?'':'disabled'}>${s.quest.complete?'領取獎勵':'進行中'}</button>`:st==='done'?'<em class="qs-tag">已完成</em>':'<em class="qs-tag">未解鎖</em>'}</li>`;}).join('')}</ol>`;}
 if(type==='inventory')return `<div class="encounter-banner inventory"><i>${iconHTML('chest')}</i><div><h3>村莊倉庫</h3><p>村莊倉庫保存建材、生活物資與鐵匠鋪製作的裝備。</p></div></div><div class="materials-grid">${Object.entries({...MATERIALS,food:{name:'香烤麵包'},drink:{name:'莓果飲品'},bed:{name:'舒適床鋪'},bandage:{name:'亞麻繃帶'},weapon:{name:'精鐵武器'},armor:{name:'皮革護甲'}}).map(([id,m])=>`<div class="material-item">${iconHTML(id)}<div><span>${m.name}</span><b>${s[id]??s.stocks?.[id]??s.gearStock?.[id]??0}</b></div></div>`).join('')}</div>`;
 if(type==='difficulty')return `<p class="modal-intro">狩獵難度會提高森林魔物的生命與攻擊。高難度需要完成轉世累計。</p><div class="difficulty-grid">${DIFFICULTIES.map((d,i)=>`<article class="difficulty-card ${s.difficulty===d.id?'current':''}"><i>${iconHTML('diff-'+Math.min(4,i))}</i><h3>${d.name}</h3><small>魔物強度 ×${d.mult}<br>需要轉世 ${d.rebirths} 次</small><button class="pixel-button ${s.difficulty===d.id?'gold':''}" data-action="setDifficulty" data-id="${d.id}" ${s.difficulty===d.id?'disabled':''}>${s.difficulty===d.id?'目前難度':'選擇'}</button></article>`).join('')}</div>`;
 if(type==='settings'){const o=(s.settings||{}),on=settingsOpen,seg=(key,opts,cur)=>`<div class="seg" data-key="${key}">${opts.map(([v,label])=>`<button class="pixel-button ${String(cur)===String(v)?'gold':''}" data-action="setOpt" data-key="${key}" data-value="${v}">${label}</button>`).join('')}</div>`;
   const summary=[`畫質 ${o.quality==='low'?'低':'高'}`,`解析度 ${o.dpr==='auto'?'自動':(o.dpr||'1.5')+'x'}`,`幀率 ${o.fps===60?60:30}`,`影子 ${o.shadows===false?'關':'開'}`,`夜晚 ${o.night===false?'關':'開'}`].join(' · ');
   return `<div class="setting-row"><div><strong>畫質與效能</strong><small>${summary}</small></div><button class="pixel-button ${on?'gold':''}" data-action="toggleQuality">${on?'收起':'調整'}</button></div>
   ${on?`<div class="setting-group"><p class="setting-note">手機發燙就往下調：解析度 → 幀率 → 動態影子，這三個最吃電。</p>
   <div class="setting-row"><div><strong>畫質</strong><small>高：粒子、光暈、雪都開。低：關掉粒子與光暈，最省電。</small></div>${seg('quality',[['high','高'],['low','低']],o.quality||'high')}</div>
   <div class="setting-row"><div><strong>解析度</strong><small>畫布像素密度。1x 最省電（像素圖邊緣較粗）；2x 最清楚但最燙。</small></div>${seg('dpr',[['auto','自動'],['1','1x'],['1.5','1.5x'],['2','2x']],o.dpr||'auto')}</div>
   <div class="setting-row"><div><strong>幀率</strong><small>30 幀省電；60 幀順暢，但耗電與發熱大約多一倍。</small></div>${seg('fps',[[30,'30'],[60,'60']],o.fps||30)}</div>
   <div class="setting-row"><div><strong>動態影子</strong><small>角色與建築的投影。關掉可少一層貼圖，手機明顯更涼。</small></div>${seg('shadows',[[1,'開'],[0,'關']],o.shadows===false?0:1)}</div>
   <div class="setting-row"><div><strong>夜晚變暗</strong><small>入夜後畫面轉成藍色調。關掉可少一層覆蓋。</small></div>${seg('night',[[1,'開'],[0,'關']],o.night===false?0:1)}</div></div>`:''}
   <div class="setting-row"><div><strong>手動操控</strong><small>自己下去玩：手機是左下搖桿走路、右下大顆按鈕出手，鏡頭一直把角色固定在畫面中央；電腦用 WASD／方向鍵移動、空白鍵或 J 出手。</small></div><button class="pixel-button gold" data-action="pilotLab">選擇角色</button></div>
   <div class="setting-row dev-row"><div><strong>開發者作弊</strong><small>只在設定頁出現，直接改存檔（不影響模擬規則）。測試數值、跳過等待、驗收畫面時用。</small></div><button class="pixel-button ${devOpen?'gold':''}" data-action="toggleDev">${devOpen?'收起':'打開'}</button></div>
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
   <div class="setting-row"><div><strong>匯出存檔</strong><small>將整個村莊、獵人、地下城進度備份成 JSON。</small></div><button class="pixel-button gold" data-action="export">匯出</button></div>
   <div class="setting-row"><div><strong>重新開始</strong><small>清除目前存檔並從五位初始獵人開始。</small></div><button class="pixel-button danger" data-action="reset">重置</button></div>`;}
 if(type==='help')return `<div class="help-grid"><div class="help-card"><h3>${iconHTML('compass')}怎麼操作？</h3><p>${matchMedia('(pointer:coarse)').matches?'單指拖曳平移、雙指縮放':'拖曳平移、滾輪縮放'}；點建築看資訊與升級，點獵人看詳情。下方選單是村莊各項功能。</p></div><div class="help-card"><h3>${iconHTML('hall')}村長要做什麼？</h3><p>重建被魔王摧毀的城鎮，建造餐廳、旅館、酒館、治療所與鐵匠鋪，服務獵人的生活需求。</p></div><div class="help-card"><h3>${iconHTML('hunter')}獵人怎麼生活？</h3><p>獵人有自己的金幣、飽食度、心情與精力。他們會狩獵、帶回材料、回村交易，再支付費用吃飯、休息和治療。</p></div><div class="help-card"><h3>${iconHTML('up')}怎麼變強？</h3><p>在學院學技能、修煉地訓練、鐵匠鋪購買武器，再到強化精煉所強化。Lv.100 後可到復活聖所轉世。</p></div><div class="help-card"><h3>${iconHTML('map')}村外內容</h3><p>委託所追蹤魔物目標，地下城三人遠征，地圖首領討伐，以及修煉地開放的 NPC 競技場模擬對戰。</p></div></div>`;
 if(type==='boss'){const ex=s.expedition,hp=Math.max(0,Math.ceil(ex.bossHp||0)),max=ex.bossMaxHp||1;   // 2026-10-30:首領插圖橫幅、討伐中血條、獎勵預覽
  return `<div class="encounter-banner boss"><i>${iconHTML('horn')}</i><div><h3>地圖首領：森林魔王</h3><p>吹響號角，召集所有可出征的獵人。首領會帶回大量稀有材料與星晶。</p></div></div>${ex.active?`<div class="boss-hp"><span>森林魔王</span><div class="progress"><span style="width:${hp/max*100}%"></span><b>${fmt(hp)}/${fmt(max)}</b></div></div>`:''}<div class="encounter-status">${ex.active?'討伐中 · 全體獵人正趕往首領所在地':ex.cooldown>0?`整備 ${Math.ceil(ex.cooldown)} 秒`:'森林魔王尚未出現'}</div><div class="boss-loot"><span>擊倒獎勵（分給參戰獵人）</span>${costs({gold:260,ore:15,wood:10,herb:8,leather:10,cloth:8,flour:10})}</div><div class="encounter-actions"><button class="pixel-button gold" data-action="startBoss" ${ex.active||ex.cooldown>0?'disabled':''}>${iconHTML('horn')}召喚森林魔王</button></div>`;}
 return '';
}

function selectedIds(kind){return game.state[kind].hunterIds||[];}
function toggleParty(kind,id){const list=selectedIds(kind),i=list.indexOf(id);if(i>=0)list.splice(i,1);else if(list.length<3)list.push(id);openModal(kind==='dungeon'?'dungeon':'arena');}
function inspect(id){selected=id;$('#inspector').classList.remove('hidden');paintInspector();world?.setSelected(id);}
function doAction(el){const a=el.dataset.action,id=el.dataset.id;let r;
 if(a==='worldmap')return openModal('worldmap');
 if(a==='worldOverview'){closeModal();world.focus('world');return;}
 if(a==='regionView'){closeModal();world.focus(id==='village'?'home':'region:'+id);return;}
 if(a==='regionTravel'){r=game.exploreRegion(id);logToast(r.message,r.ok);if(r.ok){closeModal();world.focus('region:'+id);save();}paint();return;}
 if(a==='recallHunters'){r=game.recallHunters();logToast(r.message,r.ok);paint();return;}
 if(a==='start')return start();if(a==='close'||a==='offlineOk')return closeModal();if(a==='toggleLeft'){leftOpen=!leftOpen;$('#left-panel').classList.toggle('hidden',!leftOpen);$('#reopen-left').classList.toggle('hidden',leftOpen);return;}if(a==='closeInspector'){$('#inspector').classList.add('hidden');selected=null;world?.setSelected(null);return;}
 if(a==='home'){closeModal();world?.focus('home');return;}if(a==='zoomIn'){world?.zoomBy(1.15);return;}if(a==='zoomOut'){world?.zoomBy(1/1.15);return;}
 if(a==='pause'){game.state.paused=!game.state.paused;paint();return;}if(a==='speed'){game.state.speed=game.state.speed>=3?1:game.state.speed+1;paint();return;}
 if(a==='toggleParts'){const on=!(world?.getPartsVisible?.()??true);world?.setPartsVisible?.(on);el.textContent=on?'裝備顯示中':'裝備已卸下';logToast(on?'裝備零件層：開':'裝備零件層：關（同一個身體、不重生）',true);paint();return;}
 if(a==='peekWanderer'){const list=game.state.wanderers||[];if(!list.length)return logToast('目前沒有流浪英雄',false);wandererPeek=(wandererPeek+1)%list.length;const w=list[wandererPeek],c=CLASSES.find(v=>v.id===w.classId);closeModal();world?.lookAt(w.x,w.z,1.7);logToast(`${c?.name||w.classId} ${w.name} Lv.${w.level}｜${w.status}｜野外擊殺 ${game.state.wanderKills}`,true);return;}
 if(a==='spawnClasses'){const spawned=world?.spawnClassVillagers?.()||[];logToast(spawned.length?`已叫進村莊：${spawned.join('、')}`:'角色圖還沒載入好，稍後再試',spawned.length>0);paint();return;}
 if(a==='settings'||a==='help'||a==='build'||a==='hunters'||a==='recruit'||a==='trade'||a==='craft'||a==='dungeon'||a==='arena'||a==='quests'||a==='inventory'||a==='difficulty'||a==='boss'){if(modal===a&&el.closest('#bottom-bar,#topbar'))return closeModal();return openModal(a==='boss'?'boss':a);}   // 再點一次下方/上方同一顆 = 關掉
 if(a==='dispatchHunters'){const teams=game.state.dispatchTeams||[];
   // 第一次使用:四組都空 → 自動把存活獵人放進隊伍 1,一鍵就能出門
   if(teams.every(t2=>!t2.ids.length)){game.setDispatchTeam(0,{ids:aliveHunters().map(h=>h.id)});}
   dispatchTab=0;return openModal('dispatch');}
 if(a==='dispatchTab'){dispatchTab=Number(el.dataset.index)||0;return openModal('dispatch');}
 if(a==='toggleDispatchHunter'){const team=game.state.dispatchTeams[dispatchTab];const ids=[...(team?.ids||[])];const i=ids.indexOf(id);if(i>=0)ids.splice(i,1);else ids.push(id);game.setDispatchTeam(dispatchTab,{ids});return openModal('dispatch');}
 if(a==='dispatchAll'){game.setDispatchTeam(dispatchTab,{ids:aliveHunters().map(h=>h.id)});return openModal('dispatch');}
 if(a==='dispatchNone'){game.setDispatchTeam(dispatchTab,{ids:[]});return openModal('dispatch');}
 if(a==='regionInfo'){infoRegion=id;return openModal('region');}
 if(a==='regionInfoClose')return openModal('dispatch');
 if(a==='dispatchRegion'){game.setDispatchTeam(dispatchTab,{region:id});openModal('dispatch');const c=$('#modal-content');if(c)c.scrollTop=c.scrollHeight;return;}
 if(a==='startDispatch'){r=game.dispatchTeam(dispatchTab);logToast(r.message,r.ok);if(r.ok)closeModal();save();paint();return;}
 if(a==='toggleDungeonHunter'){toggleParty('dungeon',id);return;}if(a==='toggleArenaHunter'){toggleParty('arena',id);return;}if(a==='startDungeon'){r=game.startDungeon(game.state.dungeon.hunterIds);logToast(r.message,r.ok);paint();if(r.ok)openModal('dungeon');save();return;}if(a==='dgRetreat'){r=game.retreatDungeon();logToast(r.message,r.ok);openModal('dungeon');paint();save();return;}if(a==='dgAuto'){r=game.setDungeonAuto(!game.state.dungeon.auto);logToast(r.message,r.ok);openModal('dungeon');save();return;}if(a==='dgFloor'){const d=game.state.dungeon,maxF=d.bestFloor+1,cur=Math.min(maxF,d.startFloor||maxF);r=game.setDungeonStart(id==='max'?maxF:cur+Number(id));openModal('dungeon');save();return;}if(a==='startArena'){r=game.startArena(game.state.arena.hunterIds);logToast(r.message,r.ok);paint();return;}
 if(a==='setDifficulty'){r=game.setDifficulty(Number(id));logToast(r.message,r.ok);if(r.ok)closeModal();paint();return;}
 if(a==='toggleQuality'){settingsOpen=!settingsOpen;return openModal('settings');}
 // ── 建築:建造 / 升級 / 移動 / 從建造面板選一棟（2026-10-20 補上：這些按鈕原本沒有任何處理函式，按了不會有反應）
 if(a==='selectBuilding'){closeModal();inspect(id);return;}
 if(a==='construct'){r=game.construct(id);logToast(r.message,r.ok);if(r.ok)world?.setSelected(id);paint();save();return;}
 if(a==='upgrade'){r=game.upgrade(id);logToast(r.message,r.ok);paint();save();return;}
 if(a==='moveBuilding'){closeModal();placing=id;$('#placement').classList.remove('hidden');world?.placeMode(id);paint();return;}
 // ── 獵人:詳情 / 學技能 / 修煉 / 強化 / 轉世
 if(a==='hunter'){openHunter(id);return;}
 if(a==='learnSkill'){r=game.learnSkill(id);logToast(r.message,r.ok);openHunter(id);paint();return;}
 if(a==='train'){r=game.train(id);logToast(r.message,r.ok);openHunter(id);paint();return;}
 if(a==='enhanceHunter'){r=game.enhance(id);logToast(r.message,r.ok);openHunter(id);paint();return;}
 if(a==='reincarnate'){r=game.reincarnate(id);logToast(r.message,r.ok);openHunter(id);paint();return;}
 // ── 招募 / 委託 / 首領
 if(a==='recruitVisitor'){r=game.recruit(id);logToast(r.message,r.ok);paint();save();return;}
 if(a==='quest'){r=game.claimQuest();logToast(r.message,r.ok);openModal('quests');paint();save();return;}
 if(a==='startBoss'){r=game.expedition();logToast(r.message,r.ok);closeModal();paint();return;}
 // ── 交易所 / 製作
 if(a==='rosterFilter'||a==='rosterSort'){if(a==='rosterFilter')rosterFilter=id;else rosterSort=id;return openModal('hunters');}
 if(a==='tradeStep'){const cur=game.state.tradeRequests[id]||0,v=Math.max(0,Math.min(999,cur+Number(el.dataset.d||0)));r=game.setTradeRequest(id,v);if(!r.ok)logToast(r.message,false);openModal('trade');save();return;}
 if(a==='tradeClear'){for(const k of Object.keys(game.state.tradeRequests))game.setTradeRequest(k,0);logToast('已停止全部收購。');openModal('trade');save();return;}
 if(a==='setTrade'){const box=document.querySelector('#trade-'+id);r=game.setTradeRequest(id,Math.round(Number(box?.value??0)));logToast(r.message,r.ok);paint();save();return;}
 if(a==='collectTrade'){const t=game.state.tradeRequests,pend=Object.entries(t).filter(([,v])=>v>0).map(([k,v])=>`${MATERIALS[k]?.name||k} ${v}`);logToast(pend.length?`收購中：${pend.join('、')}（獵人回村會自動成交）`:'目前沒有發布收購委託。',pend.length>0);return;}
 if(a==='craftTab'){craftTab=id==='gear'?'gear':'goods';openModal('craft');return;}   // 2026-10-30 分頁原本是死的(兩區一起顯示)
 if(a==='craftProduct'){r=game.craft(id,Number(el.dataset.batches||1));logToast(r.message,r.ok);paint();save();if(modal==='craft')openModal('craft');return;}   // 製作後彈窗裡的庫存數字也要更新
 if(a==='craftGear'){r=game.craftEquipment(id);logToast(r.message,r.ok);paint();save();if(modal==='craft')openModal('craft');return;}
 if(a==='pilotLab'){closeModal();pilotOpen=true;pickOpen=false;pilotPaint();return;}
 if(a==='toggleDev'){devOpen=!devOpen;return openModal('settings');}
 if(a==='cheat'){const r2=game.cheat(id);logToast(r2.message,r2.ok);save();paint();openModal('settings');return;}
 if(a==='setOpt'){const key=el.dataset.key,raw=el.dataset.value,val=key==='fps'?Number(raw):key==='shadows'||key==='night'?raw==='1':raw;game.setSetting(key,val);applySettings();save();openModal('settings');paint();logToast('已套用：'+({quality:'畫質',dpr:'解析度',fps:'幀率',shadows:'動態影子',night:'夜晚變暗'}[key]||key));return;}if(a==='reset'){if(confirm('確定要重置村莊嗎？')){game.reset();applySettings();started=true;paint(true);logToast('五位獵人重新抵達暮影村。');}return;}
 if(a==='export'){const blob=new Blob([JSON.stringify(game.serialize())],{type:'application/json'}),u=URL.createObjectURL(blob),link=document.createElement('a');link.href=u;link.download='暮影村-像素存檔.json';link.click();setTimeout(()=>URL.revokeObjectURL(u),500);return;}
}
// 把 state.settings 套到畫面:畫質、解析度上限、影子、夜晚、幀率
// 區域卡的魔物圖鑑:有寫介紹的魔物才列(src/lore.js)
const loreList=id=>{const m=(REGION_MONSTERS[id]||[]).filter(k=>MONSTER_LORE[k]);return m.length?`<ul class="lore-list">${m.map(k=>`<li><b>${MONSTER_NAME[k]||k}</b>${MONSTER_LORE[k]}</li>`).join('')}</ul>`:'';};
let craftTab='goods';
// 2026-10-30 獵人名冊:篩選(全部/近戰/遠程/需要照顧/倒下)＋排序(等級/稀有度/職業/生命),遊戲開著時記住選擇
let rosterFilter='all',rosterSort='level';
const ROSTER_F=[['all','全部'],['melee','近戰'],['ranged','遠程'],['care','需要照顧'],['down','倒下']],ROSTER_S=[['level','等級'],['rarity','稀有度'],['class','職業'],['hp','生命']];
const needsCare=h=>h.hp>0&&(h.hp<h.maxHp*.5||h.satiety<30||h.stamina<30||h.mood<30);
function rosterList(all){const rng=h=>(CLASSES.find(c=>c.id===h.classId)?.range||0)>=3,f={all:()=>true,melee:h=>!rng(h),ranged:rng,care:needsCare,down:h=>h.hp<=0}[rosterFilter]||(()=>true);
 const rk=h=>RARITIES.findIndex(r=>r.id===h.rarity),ck=h=>CLASSES.findIndex(c=>c.id===h.classId);
 const cmp={level:(a,b)=>b.level-a.level||rk(b)-rk(a),rarity:(a,b)=>rk(b)-rk(a)||b.level-a.level,class:(a,b)=>ck(a)-ck(b)||b.level-a.level,hp:(a,b)=>a.hp/a.maxHp-b.hp/b.maxHp}[rosterSort];return all.filter(f).sort(cmp);}
function rosterBar(total,shown){const seg=(act,opts,cur)=>opts.map(([v,l])=>`<button class="pixel-button ${cur===v?'gold':''}" data-action="${act}" data-id="${v}" aria-pressed="${cur===v}">${l}</button>`).join('');
 return `<div class="roster-bar"><div><span>篩選</span>${seg('rosterFilter',ROSTER_F,rosterFilter)}</div><div><span>排序</span>${seg('rosterSort',ROSTER_S,rosterSort)}</div><em>顯示 ${shown} / ${total} 位</em></div>`;}   // 製作彈窗目前的分頁:goods 生活物資／gear 裝備製作
let devOpen=false;   // 設定頁「開發者作弊」是否展開
// 動作實驗室的面板 2026-10-29 移除（使用者）；pixel-world.js 的 __mistvalePoseLab 留著給 paladin-anchor-lab 的檢查腳本用
// ── 手動操控:手機遊戲式。左下類比搖桿走路、右下大顆攻擊鈕出手,鏡頭把角色本體釘在畫面正中央 ──
let pilotEl=null,pilotHud=null,stickEl=null,knobEl=null,cdEl=null,stickId=null,atkHold=0,pilotOpen=false,pickOpen=false,pilotShownId=null;
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
}
function ensurePilotHud(){
  if(pilotHud)return;
  pilotHud=document.createElement('div');pilotHud.id='pilot-hud';
  pilotHud.innerHTML=`<div class="ph-stick" id="pilot-stick"><span class="ph-base"></span><span class="ph-knob" id="pilot-knob"></span></div>
    <div class="ph-actions"><button class="ph-btn ghost" data-pilot="stop" aria-label="離開操控">✕<small>離開</small></button><button class="ph-btn" id="pilot-atk" aria-label="出手攻擊"><span class="ph-cd"></span><i data-icon="swords"></i><small>攻擊</small></button></div>`;
  document.body.appendChild(pilotHud);
  stickEl=pilotHud.querySelector('#pilot-stick');knobEl=pilotHud.querySelector('#pilot-knob');cdEl=pilotHud.querySelector('#pilot-atk .ph-cd');
  stickEl.addEventListener('pointerdown',e=>{e.preventDefault();try{stickEl.setPointerCapture(e.pointerId);}catch{}stickId=e.pointerId;pilotStickTo(e);});
  stickEl.addEventListener('pointermove',e=>{if(e.pointerId!==stickId)return;e.preventDefault();pilotStickTo(e);});
  for(const t of ['pointerup','pointercancel','lostpointercapture'])stickEl.addEventListener(t,e=>{if(t==='lostpointercapture'||e.pointerId===stickId)pilotStickEnd();});
  // 按一下打一次,按住就等 CD 好再打(CD 由遊戲邏輯管,這裡只是不白按)
  const atk=pilotHud.querySelector('#pilot-atk'),fire=()=>{if(!game?.state?.pilot||(game.pilotCooldown?.()||0)>0)return;game.pilotAttack();try{navigator.vibrate?.(10);}catch{}};
  atk.addEventListener('pointerdown',e=>{e.preventDefault();fire();pilotStopAttack();atkHold=setInterval(fire,ATK_POLL);});
  for(const t of ['pointerup','pointercancel','lostpointercapture'])atk.addEventListener(t,pilotStopAttack);
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
  pilotEl.innerHTML=`<div class="pl-head"><b id="pilot-name">${esc(cur.name)}</b><span id="pilot-lv">Lv.${cur.level}</span>
    <div class="pl-hp progress"><span id="pilot-fill" style="width:${Math.max(0,Math.min(100,cur.hp/cur.maxHp*100))}%"></span><b id="pilot-hp">${Math.round(cur.hp)}/${Math.round(cur.maxHp)}</b></div>
    <span id="pilot-status">${esc(cur.status)}</span>
    <button class="pixel-button" data-pilot="pick">換角色</button><button class="pixel-button danger" data-pilot="stop">離開</button></div>
    ${pickOpen?`<div class="pl-pick">${pilotPickList()}</div>`:''}
    <small class="pl-tip">左下搖桿移動 · 右下攻擊鈕出手（CD 0.5 秒；出手後僵直不能走，面向維持到走動才轉）</small>`;
  elLv=$('#pilot-lv');elStatus=$('#pilot-status');elHp=$('#pilot-hp');elFill=$('#pilot-fill');pilotShownId=cur.id;
}
// 每 400ms 跟著 paint() 更新血條與狀態(只改文字,不重畫整塊,才不會打斷按住螢幕的手指)
function pilotStatus(){
  if(!pilotEl)return;
  const cur=pilotCur();
  if(!cur){if(pilotShownId!==null)pilotPaint();return;}   // 角色倒下/被收回:立刻把搖桿收起來(不要留一個沒人可控的介面)
  if(elLv)elLv.textContent=`Lv.${cur.level}`;
  if(elStatus)elStatus.textContent=cur.status;
  if(elHp)elHp.textContent=`${Math.round(cur.hp)}/${Math.round(cur.maxHp)}`;
  if(elFill)elFill.style.width=`${Math.max(0,Math.min(100,cur.hp/cur.maxHp*100))}%`;
}
function pilotInputFromKeys(){const k=pilotKeys;const dx=(k.has('right')?1:0)-(k.has('left')?1:0),dz=(k.has('down')?1:0)-(k.has('up')?1:0);game.pilotInput(dx,dz);}
const PILOT_KEYS={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',w:'up',s:'down',a:'left',d:'right',W:'up',S:'down',A:'left',D:'right'};
document.addEventListener('keydown',e=>{
  if(!game?.state?.pilot)return;
  if(e.target.matches('input,textarea,select'))return;
  if(e.key===' '||e.key==='j'||e.key==='J'){e.preventDefault();game.pilotAttack();return;}
  const d=PILOT_KEYS[e.key];if(d){e.preventDefault();pilotKeys.add(d);pilotInputFromKeys();}
});
document.addEventListener('keyup',e=>{const d=PILOT_KEYS[e.key];if(d){pilotKeys.delete(d);if(game?.state?.pilot)pilotInputFromKeys();}});
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
let settingsOpen=false;   // 設定面板的「畫質與效能」是否展開(預設收成一條)
function applySettings(){const o=game?.state?.settings||{};world?.setQuality?.(o.quality!=='low');world?.setDpr?.(o.dpr||'auto');world?.setShadows?.(o.shadows!==false);world?.setNight?.(o.night!==false);fpsTarget=o.fps===60?60:30;}
let fpsTarget=30;
function openHunter(id){const h=game.state.hunters.find(v=>v.id===id);if(!h)return;modal='hunter-detail';$('#modal').dataset.type='hunter';modalTitle('hunter','hunter');$('#modal-content').innerHTML=`<div class="hunter-detail"><div class="detail-avatar"><img src="${portrait(h)}"><h3>${esc(h.name)}</h3><div class="rarity" data-rarity="${h.rarity}" style="--rarity:${RARITIES.find(r=>r.id===h.rarity)?.color}">${RARITIES.find(r=>r.id===h.rarity)?.name}</div></div><div><div class="detail-header"><strong>${iconHTML('em-'+h.classId)}${CLASSES.find(c=>c.id===h.classId)?.name} · Lv.${h.level}</strong><span>${esc(h.status)}</span></div><div class="stats-grid"><div>${iconHTML('atk')}攻擊<b>${h.attack}</b></div><div>${iconHTML('def')}防禦<b>${h.defense}</b></div><div>${iconHTML('rebirth')}轉世<b>${h.rebirths}</b></div></div>${[['hp','生命','hp'],['satiety','飽食','satiety'],['stamina','精力','stamina'],['mood','心情','mood']].map(([k,n,c])=>`<div class="need-row ${c}"><label>${iconHTML(c)}${n}</label><div class="progress"><span style="width:${k==='hp'?h.hp/h.maxHp*100:h[k]}%"></span><b>${Math.floor(k==='hp'?h.hp:h[k])}</b></div></div>`).join('')}<div class="equipment-row"><span>${iconHTML('gold')}個人金幣 <b>${fmt(h.gold)}</b></span><span class="${h.equipment.weapon?'has':'no'}">${iconHTML('swords')}${h.equipment.weapon?'精鐵武器':'未裝備武器'}</span><span class="${h.equipment.armor?'has':'no'}">${iconHTML('def')}${h.equipment.armor?'皮革護甲':'未裝備護甲'}</span></div></div></div><div class="hunter-actions"><button class="pixel-button" data-action="learnSkill" data-id="${h.id}">${iconHTML('scroll')}<span>學習技能<small>學院 · 技能 Lv.${h.skillLevel||0}</small></span></button><button class="pixel-button" data-action="train" data-id="${h.id}" ${h.gold<20||h.trainCooldown>0?'disabled':''}>${iconHTML('up')}<span>修煉<small>${h.trainCooldown>0?`冷卻 ${Math.ceil(h.trainCooldown)} 秒`:h.gold<20?'個人金幣不足 20':'20 個人金幣'}</small></span></button><button class="pixel-button" data-action="enhanceHunter" data-id="${h.id}">${iconHTML('anvil')}<span>強化裝備<small>精煉所 · +${h.weaponLevel||0}</small></span></button><button class="pixel-button ${h.level>=100?'gold':''}" data-action="reincarnate" data-id="${h.id}" ${h.level>=100?'':'disabled'}>${iconHTML('rebirth')}<span>轉世<small>${h.level>=100?'可以轉世':`Lv.100 才能（還差 ${100-h.level}）`}</small></span></button></div>`;setIcons($('#modal-content'));$('#modal-backdrop').classList.remove('hidden');document.body.dataset.modalTab='hunters';measureHud();}
function handleWorldSelect(id){if(!started)return;if(id?.startsWith('hunter:'))openHunter(id.slice(7));else if(id)inspect(id);}
document.addEventListener('click',e=>{const el=e.target.closest('[data-action]');if(el&&!el.disabled)doAction(el);});
document.addEventListener('keydown',e=>{if(e.target.matches('input,textarea,select'))return;if(e.key.toLowerCase()==='m'&&started){openModal('worldmap');return;}if(e.key==='Escape'){if(placing){placing=null;$('#placement').classList.add('hidden');world?.placeMode(null);}else closeModal();}if(e.code==='Space'&&!modal&&started){e.preventDefault();if(game.state.pilot){game.pilotAttack();return;}game.state.paused=!game.state.paused;paint();}const map={'1':'build','2':'hunters','3':'trade','4':'craft','5':'dungeon','6':'arena','7':'quests'};if(!modal&&map[e.key])openModal(map[e.key]);});
$('#modal-backdrop').addEventListener('click',e=>{if(e.target.id==='modal-backdrop')closeModal();});
try{const saved=(()=>{try{return previewMode?null:JSON.parse(localStorage.getItem(SAVE_KEY)||'null');}catch{return null;}})();game=createGame(saved);bootOffline=saved&&saved.paused!==true&&Number.isFinite(saved.savedAt)?Math.max(0,(Date.now()-saved.savedAt)/1000):0;game.state.paused=true;document.querySelector('#title-art')?.style.setProperty('background-image',`url(${AS().title||''})`);if(AS().woodui)document.documentElement.style.setProperty('--wood-tex',`url(${AS().woodui})`);/* 2026-10-28:把 PixelLab 的 UI 零件掛成 CSS 變數(--ui-panel / --ui-btn-primary …),CSS 用 border-image 九宮格拉伸 */{const uiMap=AS().ui||{};for(const [k,v] of Object.entries(uiMap)){const u=`url(${v})`;document.documentElement.style.setProperty('--ui-'+k,u);if(!uiMap['px-'+k])document.documentElement.style.setProperty('--ui-px-'+k,u);}/* 手機一套 UI 零件(2026-10-30):有 assets/ui/m-px-<名字>.png 的,手機尺寸改用它;<html class="ui-m"> 讓 CSS 換切片與框寬(make_mobile_ui.py) */const mUi=Object.keys(uiMap).filter(k=>k.startsWith('m-px-'));if(mUi.length){const mq=matchMedia('(max-width:760px),(max-height:520px)'),setM=()=>{for(const k of mUi){const base=k.slice(2);if(uiMap[base])document.documentElement.style.setProperty('--ui-'+base,`url(${mq.matches?uiMap[k]:uiMap[base]})`);}document.documentElement.classList.toggle('ui-m',mq.matches);};setM();mq.addEventListener('change',setM);}/* 另一套 CSS 用 --ui-px-<名字>（window/card/btn-wood/…）→ 對到同一批零件，兩套命名都吃得動；assets/ui/px-*.png 在的話就用真正的零件，別名只在缺檔時補位 */const UI_ALIAS={'px-window':'panel','px-card':'panel-sm','px-btn-wood':'btn-secondary','px-btn-gold':'btn-primary','px-btn-red':'btn-danger','px-btn-x':'btn-close','px-tile':'tab','px-tile-on':'tab-on','px-trough':'bar','px-toast':'toast-ok','px-toast-err':'toast-err'};for(const [alias,src] of Object.entries(UI_ALIAS))if(!uiMap[alias]&&uiMap[src])document.documentElement.style.setProperty('--ui-'+alias,`url(${uiMap[src]})`);}setIcons();world=createPixelWorld($('#world'),{getState:()=>game.state,onSelect:handleWorldSelect,onPlace:(id,x,z)=>{const r=game.moveBuilding(id,x,z);logToast(r.message,r.ok);if(r.ok){placing=null;$('#placement').classList.add('hidden');world.placeMode(null);}paint();}});world.setTime(.18);applySettings();if(matchMedia('(pointer:coarse)').matches)$('.map-hint').textContent='拖曳平移 · 雙指縮放 · 點選建築／獵人';  /* 觸控裝置沒有滾輪 */globalThis.__mistvaleView=world;globalThis.__mistvaleGame=game;  // 驗收腳本用(pipeline/scripts/l0veyou/verify_all_regions.js)
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
function frame(now){requestAnimationFrame(frame);if(document.hidden){previous=now;return;}const frameMsNow=started&&game.state.paused?PAUSED_MS:(fpsTarget===60?1000/60:FRAME_MS);if(now<nextFrame-2)return;nextFrame=Math.max(nextFrame+frameMsNow,now);
 // 每幀實際花了多少時間(給效能檢查用:手機上這個值決定會不會發燙)
 const t0=performance.now();try{frames++;if(now-fpsStart>2000){document.body.dataset.fps=Math.round(frames*1000/(now-fpsStart));fpsStart=now;frames=0;}const dt=Math.min(.1,(now-previous)/1000);previous=now;if(started)game.tick(dt);pilotHudTick();world.setTime((game.state.time%240)/240);world.update(game.state.paused?0:dt,game.state);dungeonTick();liveModalTick(now);if(now-last>400){paint();last=now;}if(now-lastSave>5000){save();lastSave=now;}}finally{const ms=performance.now()-t0;frameMs.avg=frameMs.avg?frameMs.avg*.9+ms*.1:ms;frameMs.max=Math.max(frameMs.max,ms);frameMs.n++;if(perfProbe)perfSample(now,ms);}}requestAnimationFrame(frame);}catch(err){console.error(err);$('#loading').innerHTML='<b>像素村莊載入失敗，請重新整理</b>';}

// 讀取畫面:圖片全部載完(成功或失敗都算完成)、村莊地板與建築都用美術版畫好、圖示換成圖集之後才進村莊。
// 有圖載入失敗就停在錯誤畫面,不進村、也不會退回程序繪製的陽春素材。
function bootWhenReady(){
  const loader=$('#loading'),bar=$('#loading-bar'),label=$('#loading-label'),phaseEl=$('#loading-phase'),assetEl=$('#loading-asset'),shownAt=performance.now(),MIN_SHOW_MS=600;   // 快取命中時也讓讀取動畫露一下,不然一閃就過
  let released=false;
  const seed=el=>{if(el.animate)el.animate([{opacity:.3},{opacity:1}],{duration:180,easing:'ease-out'});};   // 文字變了才寫(避免每幀重排),新文字從 30% 透明淡入
  const set=(el,text)=>{if(!el||el.textContent===text)return;el.textContent=text;seed(el);};
  const step=()=>{
    const p=assetProgress();
    if(p.failed){loader.classList.add('failed');label.textContent='素材載入失敗，請重新整理';return;}
    // 圖示的圖集延後到第 2 秒才放行(共 2 張):前面先讓 13 MB 素材解析與各圖集載入取得主執行緒,
    // 之後的進度輪詢才不會每次都被大張圖的貼上拖住,讀條才會一直動。
    if(!released&&performance.now()-shownAt>2000){released=true;globalThis.__mistvaleReleaseIcons?.();}
    const warming=world.assetsReady()&&iconsReady();   // 素材齊了,開始預熱
    const ready=p.done>=p.total&&warming;
    // 百分比 = 圖片完成比例;最後一步(預熱)由這裡顯示,不會卡在 99% 不動
    const pct=ready?100:Math.min(99,Math.round(p.done/Math.max(1,p.total)*100));
    bar.style.width=`${pct}%`;set(label,`${pct}%`);
    if(warming)markPhase('預熱角色素材');
    set(phaseEl,p.phase||'整理素材');
    set(assetEl,p.queued?'· 正在載入圖示':'· 載入美術素材');
    if(!ready||performance.now()-shownAt<MIN_SHOW_MS){requestAnimationFrame(step);return;}
    if(!world.warmupAssets()){requestAnimationFrame(step);return;}
    start();
    loader.classList.add('done');setTimeout(()=>loader.remove(),500);
  };
  requestAnimationFrame(step);
}
function paintMap(canvas,mini=false){
 if(!canvas)return;const g=canvas.getContext('2d');g.imageSmoothingEnabled=false;const w=canvas.width,h=canvas.height,margin=mini?4:15,sx=(w-margin*2)/WORLD.width,sy=(h-margin*2)/WORLD.height;
 g.fillStyle=MAP_ACCENT.sea;g.fillRect(0,0,w,h);
 for(let z=WORLD.minZ;z<WORLD.maxZ;z+=1)for(let x=WORLD.minX;x<WORLD.maxX;x+=1){const terrain=biomeAt(x,z);g.fillStyle=MAP_PALETTE[terrain]||BIOME_PALETTE[terrain];if((x*17+z*31)%11===0&&!['ocean','river','ice','bridge'].includes(terrain))g.fillStyle=terrain==='snow'?MAP_ACCENT.snow:terrain==='desert'?MAP_ACCENT.desert:terrain==='mountain'?MAP_ACCENT.mountain:MAP_ACCENT.grass;g.fillRect(Math.floor(margin+(x-WORLD.minX)*sx),Math.floor(margin+(z-WORLD.minZ)*sy),Math.ceil(sx),Math.ceil(sy));}
 const to=(x,z)=>[margin+(x-WORLD.minX)*sx,margin+(z-WORLD.minZ)*sy];
 for(const b of BUILDINGS){if(!game.state.buildings[b.id])continue;const p=game.state.layout[b.id],q=to(p.x,p.z);g.fillStyle='#efe1af';g.fillRect(q[0]-3,q[1]-2,6,4);}
 for(const r of REGIONS){const[x,y]=to(r.x,r.z);g.fillStyle=r.id===game.state.region?'#ffe182':'#344634';g.fillRect(x-3,y-3,6,6);if(!mini){g.font='bold 12px Microsoft JhengHei';g.textAlign='center';const tw=g.measureText(r.name).width;g.fillStyle='#233428dd';g.fillRect(x-tw/2-4,y+6,tw+8,19);g.fillStyle='#ffebbd';g.fillText(r.name,x,y+20);}}
 if(mini)for(const h of game.state.hunters){const[x,y]=to(h.x,h.z);g.fillStyle='#fff7da';g.fillRect(x-1,y-1,3,3);}
}
