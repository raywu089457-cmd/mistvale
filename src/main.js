import {createWorld} from './world.js';
import {createGame} from './game.js';
import {BUILDINGS,CLASSES,SAVE_KEY,HUNT_ZONE} from './data.js';

const paths={
 gold:'<ellipse cx="12" cy="12" rx="8" ry="9"/><ellipse cx="12" cy="12" rx="5" ry="6"/><path d="M12 8v8m-2-6 2-2 2 2m-4 4 2 2 2-2"/>',
 wood:'<path d="m4 17 11-12c2-2 7 3 5 5L9 22c-3 2-8-3-5-5Z"/><ellipse cx="6.5" cy="19" rx="2" ry="3" transform="rotate(-40 6.5 19)"/><path d="m8 14 6-7m-3 11 7-8M5 13l-3-3 7-8 4 3"/>',
 ore:'<path d="m3 16 4-10 8-3 6 8-3 9H8Z"/><path d="m7 6 4 7 10-2M11 13l-3 7m3-7 7 7m-7-7 4-10M3 16l8-3"/>',
 gem:'<path d="m12 2 8 7-3 10-5 3-5-3L4 9Z"/><path d="m12 2-3 7 3 13 3-13-3-7M4 9h16"/>',
 village:'<path d="M3 10 12 3l9 7M5 9v12h14V9M9 21v-7h6v7M9 10h.1M15 10h.1M2 21h20"/>',
 shield:'<path d="m12 2 8 3v7c0 5-8 10-8 10S4 17 4 12V5Z"/><path d="M12 6v12M8 10h8"/>',
 swords:'<path d="m5 2 3 1 12 14-3 3L3 8 2 5ZM16 16l5 5M15 20l5-5M19 2l-3 1-5 6M22 5l-1 3-5 5M8 16l-5 5M4 15l5 5"/>',
 hammer:'<path d="m13 3 3-1 6 6-2 3-4-1-4-4ZM12 6 3 17c-2 3 1 5 3 3L16 10M10 4l3-2m7 9 2-3"/>',
 book:'<path d="M12 5C8 2 4 3 2 4v16c4-2 7-1 10 1 3-2 6-3 10-1V4c-2-1-6-2-10 1ZM12 5v16M5 8l4 1M5 12l4 1M15 9l4-1M15 13l4-1"/>',
 heal:'<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6Z"/>',
 arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
 up:'<path d="m6 14 6-6 6 6M12 8v13M5 3h14"/>',
 leaf:'<path d="M20 3C5 2 2 10 5 16s14 5 15-13ZM5 20l10-11M7 15h5"/>',
 crown:'<path d="m2 6 5 4 5-7 5 7 5-4-3 13H5ZM6 15h12"/>',
 cup:'<path d="M6 4h12v9a6 6 0 0 1-12 0ZM18 6h4v4c0 3-4 3-4 3M8 20h8M12 19v-1M9 2v1M14 2v1"/>',
 target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3"/>',
 settings:'<path d="m9 3 .8-2h4.4l.8 2 2 .9 2.2-.3 2.2 3.8-1.4 1.8V12l1.4 1.8-2.2 3.8-2.2-.3-2 .9-.8 2H9l-.8-2-2-.9-2.2.3-2.2-3.8L3.2 12V9.2L1.8 7.4 4 3.6l2.2.3Z" transform="translate(0 1)"/><circle cx="11.6" cy="11.6" r="3.2"/>',
 sound:'<path d="M11 4 6 8H2v8h4l5 4ZM15 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14"/>',
 soundOff:'<path d="M11 4 6 8H2v8h4l5 4ZM16 9l6 6m0-6-6 6"/>',
 pause:'<path d="M7 5v14M17 5v14" stroke-width="3"/>',
 play:'<path d="m7 4 13 8-13 8Z"/>',
 close:'<path d="m6 6 12 12M6 18 18 6"/>',
 help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 8.5a2.6 2.6 0 0 1 5 1c0 2-2.5 2-2.5 4M12 17h.01"/>',
 boss:'<path d="M8 9 3 2 2 10l5 7 1 4h8l1-4 5-7-1-8-5 7-4-2ZM8 12l3 2-2 2M16 12l-3 2 2 2M10 19l2-2 2 2"/>'
};
const icon=(name)=>`<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name==='gems'?'gem':name]||paths.shield}</svg>`;
const buildingIcons={hall:'crown',tavern:'cup',forge:'hammer',clinic:'heal',academy:'target',farm:'leaf'};
function icons(root=document){root.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));}
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Math.floor(Number(n)||0).toLocaleString('en-US');
const qa=new URLSearchParams(location.search).has('qa');
let saved=null,storageOK=true;
try{if(!qa)saved=JSON.parse(localStorage.getItem(SAVE_KEY)||'null');}catch{storageOK=false;}
const game=createGame(saved);game.state.paused=true;
let world,started=false,selected='hall',modalType='',lastPaint=0,lastSave=0,lastTime=0,selectedCache='',hunterCache='',questCache='',modalReturn=null,sound=false,quality=true,saveNotice=false;
let audioCtx=null;
icons();
if(saved)$('#start-button').innerHTML='繼續你的故事 <span>⟶</span>';

function beep(type='click'){
 if(!sound)return;
 try{audioCtx ||= new (window.AudioContext||window.webkitAudioContext)();audioCtx.resume();const t=audioCtx.currentTime;const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type='sine';o.frequency.setValueAtTime(type==='error'?160:480,t);o.frequency.exponentialRampToValueAtTime(type==='error'?110:720,t+.12);g.gain.setValueAtTime(.035,t);g.gain.exponentialRampToValueAtTime(.001,t+.2);o.connect(g);g.connect(audioCtx.destination);o.start();o.stop(t+.21);}catch{}
}
function toast(text,ok=true){const e=document.createElement('div');e.className='toast'+(ok?'':' error');e.textContent=text;$('#toasts').append(e);setTimeout(()=>e.remove(),3600);beep(ok?'click':'error');}
function actionResult(result){if(result)toast(result.message,result.ok);selectedCache='';questCache='';paint(true);save();}
function save(){if(!started||qa)return;try{localStorage.setItem(SAVE_KEY,JSON.stringify(game.serialize()));$('#save-status').textContent='進度已自動儲存';}catch{storageOK=false;$('#save-status').textContent='無法自動儲存 · 設定可匯出存檔';if(!saveNotice){toast('瀏覽器無法儲存，請到設定匯出你的存檔',false);saveNotice=true;}}}
function costs(id){return typeof game.getUpgradeCost==='function'?game.getUpgradeCost(id):Object.fromEntries(Object.entries(BUILDINGS.find(b=>b.id===id).cost).map(([k,v])=>[k,Math.ceil(v*Math.pow(1.6,game.state.buildings[id]-1))]));}
function costHTML(cost){return Object.entries(cost).filter(([k,v])=>v>0).map(([k,v])=>`<span class="${game.state[k]<v?'insufficient':''}">${icon(k)}${fmt(v)}</span>`).join('');}
function select(id,focus=false){
 if(id?.startsWith('hunter:')){openModal('hunters');return;}
 if(!BUILDINGS.some(b=>b.id===id))return;
 selected=id;selectedCache='';world?.setSelected?.(id);if(focus)world?.focus(id);renderBuilding();
 document.querySelectorAll('.world-label').forEach(e=>e.classList.toggle('selected',e.dataset.id===id));
}
function renderBuilding(){
 const s=game.state,b=BUILDINGS.find(b=>b.id===selected),lv=s.buildings[b.id],cost=costs(b.id);const afford=Object.entries(cost||{}).every(([k,v])=>s[k]>=v);const key=[b.id,lv,...Object.entries(cost||{}).map(([k,v])=>s[k]>=v)].join(':');if(key===selectedCache)return;selectedCache=key;
 $('#building-panel').innerHTML=`<div class="eyebrow">${b.en}<span>✧</span></div><div class="building-visual"><div class="building-emblem">${icon(buildingIcons[b.id])}</div><div class="level-badge">LEVEL<strong>${String(lv).padStart(2,'0')}</strong></div></div><h2>${b.name}</h2><p>${b.desc}</p><div class="building-effect">${icon('up')}<span>${b.effect}</span></div>${lv<5?`<div class="cost-row">${costHTML(cost)}</div><button class="primary" data-action="upgrade" data-id="${b.id}" ${afford?'':'disabled'}><span>升級設施</span>${icon('arrow')}</button>`:'<button class="primary" disabled>已達最高等級</button>'}`;
}
function renderHunters(){
 const s=game.state;$('#hunter-count').textContent=`${s.hunters.length} / ${s.capacity}`;
 const key=s.hunters.map(h=>[h.id,h.hp.toFixed(0),h.maxHp,h.status,h.level].join(',')).join(';');if(key===hunterCache)return;hunterCache=key;
 $('#hunter-list').innerHTML=s.hunters.slice(0,3).map(h=>`<button class="hunter-row" data-action="hunters" aria-label="查看${esc(h.name)}"><div class="portrait ${h.classId}"></div><div class="hunter-data"><div class="hunter-name">${esc(h.name)}<small>Lv.${h.level}</small></div><div class="hunter-meta"><span class="${h.status==='戰鬥中'?'fighting':''}">${esc(h.status)}</span><span>${Math.ceil(h.hp)}/${Math.ceil(h.maxHp)}</span></div><div class="health-track"><span style="width:${Math.max(0,h.hp/h.maxHp*100)}%;${h.hp/h.maxHp<.3?'background:#ca937d':''}"></span></div></div></button>`).join('');
}
function renderQuest(){const q=game.state.quest;if(!q)return;const key=JSON.stringify(q);if(key===questCache)return;questCache=key;$('#chapter-number').textContent=`CHAPTER ${String(q.index+1).padStart(2,'0')}`;$('#quest-title').textContent=q.title;$('#quest-description').textContent=q.description;$('#quest-progress-label').textContent=`${Math.min(q.progress,q.target)} / ${q.target}`;$('#quest-progress-fill').style.width=`${Math.min(100,q.progress/q.target*100)}%`;$('#quest-reward').innerHTML=Object.entries(q.reward||{}).filter(([k])=>k==='gold'||k==='gems').map(([k,v])=>`${icon(k)} ${v}`).join(' · ');$('#quest-action').disabled=Boolean(q.claimed);$('#quest-action').innerHTML=q.claimed?'全部委託已完成':q.complete?'領取獎勵 ✧':q.index===0?'前往招募 ↗':q.index===2?'前往升級 ↗':'查看目標 ↗';}
function renderMinimap(){const c=$('#minimap'),ctx=c.getContext('2d'),s=game.state;ctx.clearRect(0,0,c.width,c.height);ctx.fillStyle='#253f31';ctx.fillRect(0,0,300,180);const p=(x,z)=>[145+x*5,65+z*4];ctx.fillStyle='#435944';for(let i=0;i<30;i++){const x=(i*79%300),z=(i*47%180);ctx.beginPath();ctx.arc(x,z,8+i%6,0,Math.PI*2);ctx.fill();}ctx.strokeStyle='#6c6f51';ctx.lineWidth=9;ctx.beginPath();ctx.moveTo(...p(-18,0));ctx.lineTo(...p(22,0));ctx.moveTo(...p(-7,-13));ctx.lineTo(...p(-7,15));ctx.stroke();ctx.strokeStyle='#406e73';ctx.lineWidth=18;ctx.beginPath();ctx.moveTo(0,100);ctx.bezierCurveTo(20,120,25,150,120,180);ctx.stroke();for(const b of BUILDINGS){const[x,y]=p(b.x,b.z);ctx.fillStyle=selected===b.id?'#e6cb8b':'#a9a587';ctx.fillRect(x-b.w*2,y-b.d*2,b.w*4,b.d*4);}ctx.strokeStyle='#a2926777';ctx.lineWidth=1;ctx.beginPath();ctx.arc(...p(16,-5),31,0,Math.PI*2);ctx.stroke();for(const h of s.hunters){ctx.fillStyle='#e3d9a4';ctx.beginPath();ctx.arc(...p(h.x,h.z),2.5,0,Math.PI*2);ctx.fill();}for(const e of s.enemies){ctx.fillStyle=e.type==='boss'?'#e78777':'#b16e5e';ctx.beginPath();ctx.arc(...p(e.x,e.z),e.type==='boss'?4:2,0,Math.PI*2);ctx.fill();}}
function paint(force=false){const s=game.state;for(const k of ['gold','wood','ore','gems'])$('#'+k).textContent=fmt(s[k]);$('#day').textContent=`第 ${s.day} 日`;const phase=(s.time%240)/240;$('#time-label').textContent=phase<.3?'午後 · 晴朗':phase<.6?'黃昏 · 微風':phase<.84?'夜幕 · 星光':'清晨 · 薄霧';$('#speed-button').textContent=`${s.speed}×`;$('#pause-button').innerHTML=icon(s.paused?'play':'pause');$('#pause-button').setAttribute('aria-label',s.paused?'繼續遊戲':'暫停遊戲');$('#paused-banner').classList.toggle('hidden',!s.paused||!started);$('#heal-label').textContent=s.healCooldown>0?`祝福 ${Math.ceil(s.healCooldown)}s`:'治癒祝福';$('#heal-button').disabled=s.healCooldown>0;renderBuilding();renderHunters();renderQuest();renderMinimap();$('#event-feed').innerHTML=(s.log||[]).slice(0,2).map(l=>`<div class="event-line"><span>✧</span>${esc(l.text)}</div>`).join('');if(modalType==='expedition')paintBoss();if(modalType==='recruit'){document.querySelectorAll('[data-action="recruitClass"]').forEach(e=>{const c=CLASSES.find(c=>c.id===e.dataset.id);e.disabled=s.gold<c.cost||s.hunters.length>=s.capacity;});}document.body.dataset.hunters=s.hunters.length;document.body.dataset.kills=s.totalKills||s.kills||0;document.body.dataset.bossKills=s.bossKills||0;}
function openModal(type){
 modalReturn=document.activeElement;modalType=type;$('#modal-backdrop').classList.remove('hidden');const title={hunters:['THE WATCHERS','村莊獵人'],recruit:['A NEW CHAPTER BEGINS','招募你的守望者'],build:['BUILD A PLACE TO CALL HOME','村莊建設'],expedition:['INTO THE WHISPERING WOODS','幽林遠征'],journal:['THE CHRONICLES','暮影紀事'],settings:['MAKE YOURSELF AT HOME','遊戲設定'],help:['YOUR FIRST DAY IN MISTVALE','村長入門手札'],reset:['A NEW BEGINNING','重新開始故事']}[type];$('#modal-eyebrow').textContent=title[0];$('#modal-title').textContent=title[1];$('#modal-content').innerHTML=modalContent(type);$('#modal').scrollTop=0;$('#modal [data-action="close"]').focus();paint();
}
function closeModal(){modalType='';$('#modal-backdrop').classList.add('hidden');if(modalReturn?.isConnected)modalReturn.focus();}
function modalContent(type){const s=game.state;
 if(type==='recruit')return `<p class="modal-intro">酒館裡的旅人已準備啟程。每一位獵人，都有值得被記住的故事。<br>選擇一個職業，新夥伴會自動加入狩獵與村莊生活。</p><div class="class-grid">${CLASSES.map(c=>`<article class="class-card"><div class="class-art ${c.id}"></div><div class="class-card-info"><h3>${c.name}</h3><span class="class-tag">${c.tag}</span><p>${c.desc}</p><div class="class-stats"><span>生命 ${c.hp}</span><span>攻擊 ${c.attack}</span></div><button class="primary" data-action="recruitClass" data-id="${c.id}" ${s.gold<c.cost||s.hunters.length>=s.capacity?'disabled':''}>邀請加入 <span>${icon('gold')}${c.cost}</span></button></div></article>`).join('')}</div><p class="modal-note">目前獵人 ${s.hunters.length} / ${s.capacity} · 升級橡木酒館可以增加名額</p>`;
 if(type==='hunters')return `<p class="modal-intro">他們為村莊而戰，也為爐火而歸。獵人會自動狩獵，受傷後回村休養。</p><div class="roster-grid">${s.hunters.map(h=>`<article class="roster-card"><div class="portrait ${h.classId}"></div><div class="hunter-data"><div class="hunter-name">${esc(h.name)} <small>Lv.${h.level}</small></div><div class="hunter-meta"><span>${CLASSES.find(c=>c.id===h.classId)?.name}</span><span>${esc(h.status)}</span></div><div class="health-track"><span style="width:${h.hp/h.maxHp*100}%"></span></div><div class="roster-detail">生命 ${Math.ceil(h.hp)} / ${Math.ceil(h.maxHp)}　攻擊 ${Math.round(h.attack||0)}</div></div></article>`).join('')}</div><div class="modal-bottom"><span>獵人名額 ${s.hunters.length} / ${s.capacity} · 擊敗魔物獲得經驗</span><button class="primary" data-action="recruit">招募新獵人 ＋</button></div>`;
 if(type==='build')return `<p class="modal-intro">用狩獵帶回的資源，讓村莊茁壯。每一次升級，都會改善全體獵人的生活。<br>選擇設施查看效果與升級需求。</p><div class="building-grid">${BUILDINGS.map(b=>`<button class="building-tile" data-action="selectBuilding" data-id="${b.id}"><div class="building-emblem">${icon(buildingIcons[b.id])}</div><div><h3>${b.name}</h3><small>${b.effect}</small></div><span>Lv.${s.buildings[b.id]} ↗</span></button>`).join('')}</div><p class="modal-note">所有設施最高 5 級 · 建築位置固定，專注經營與成長</p>`;
 if(type==='expedition')return `<div class="boss-illustration">${icon('boss')}</div><h3 class="boss-title">古林守魘</h3><div class="boss-sub">WORLD BOSS · 幽語森林深處</div><p class="modal-intro" style="text-align:center;margin-top:19px">古老的守護者被黑霧侵蝕，正威脅村莊的邊界。<br>召集獵人一同迎戰。建議至少 4 位獵人與 2 級鐵匠鋪。</p><div class="expedition-grid"><div><strong>${s.hunters.length}</strong><span>可出征獵人</span></div><div><strong>Lv.${s.buildings.forge}</strong><span>全隊武器強化</span></div><div><strong>${s.bossKills||0}</strong><span>成功討伐</span></div></div><div id="boss-status" class="boss-status"></div><div class="progress-track" id="boss-progress" style="display:none"><div id="boss-fill" style="background:#cb9477"></div></div><button class="primary expedition-action" data-action="startExpedition" id="expedition-button">召集獵人 · 開始遠征 ⟶</button><p class="modal-note">成功討伐獲得大量金幣、礦石與星晶 · 受傷的獵人仍會回村休養</p>`;
 if(type==='journal')return `<div class="journal-stats"><div><strong>${s.day}</strong><span>村莊日數</span></div><div><strong>${s.totalKills||s.kills||0}</strong><span>魔物擊退</span></div><div><strong>${s.bossKills||0}</strong><span>首領討伐</span></div></div><p class="modal-intro">每一盞亮著的燈，都是冒險繼續的理由。</p>${(s.log||[]).slice(0,20).map((l,i)=>`<div class="journal-entry"><small>${String((s.log||[]).length-i).padStart(2,'0')}</small><span>${esc(l.text)}</span></div>`).join('')}`;
 if(type==='settings')return `<div class="setting-row"><div><strong>遊戲音效</strong><small>按鈕與村莊操作提示音</small></div><button class="secondary" data-action="sound">${sound?'已開啟':'已關閉'}</button></div><div class="setting-row"><div><strong>畫面品質</strong><small>省電模式會降低陰影與像素密度</small></div><button class="secondary" data-action="quality">${quality?'細緻畫質':'省電模式'}</button></div><div class="setting-row"><div><strong>儲存冒險</strong><small>${storageOK?'每 5 秒自動儲存於此瀏覽器，也可匯出備份。':'瀏覽器儲存不可用，請使用匯出備份。'}</small></div><button class="secondary" data-action="export">匯出存檔</button></div><div class="setting-row"><div><strong>載入存檔</strong><small>匯入之前匯出的暮影村 JSON 存檔</small></div><button class="secondary" data-action="import">匯入存檔</button></div><div class="setting-row"><div><strong>村長入門手札</strong><small>查看玩法、滑鼠與鍵盤操作</small></div><button class="secondary" data-action="help">操作說明</button></div><div class="setting-row"><div><strong>新的故事</strong><small>重置村莊、獵人與資源，從第一日開始。</small></div><button class="secondary danger" data-action="resetPrompt">重新開始</button></div><p class="modal-note">暮影村 — 獵魔紀事 v1.0 · 原創獨立遊戲 · 可離線遊玩</p>`;
 if(type==='reset')return `<p class="modal-intro">重新開始會清除目前的村莊進度。你可以先回到設定匯出存檔，保存這段故事。</p><div class="modal-bottom"><button class="secondary" data-action="settings">返回設定</button><button class="primary danger" data-action="resetConfirm">確定重新開始</button></div>`;
 if(type==='help')return `<div class="help-grid"><div class="help-step"><span>01</span><h3>召集你的獵人</h3><p>從酒館招募騎士、遊俠與法師。他們會自動前往森林戰鬥，受傷時回到療養所恢復。</p></div><div class="help-step"><span>02</span><h3>建設溫暖的家</h3><p>點擊場景裡的建築升級設施。鐵匠鋪提升攻擊、訓練場增加生命，農場持續供應物資。</p></div><div class="help-step"><span>03</span><h3>完成村長委託</h3><p>跟隨左上角手札的目標。達成後手動領取獎勵，解鎖下一個章節，逐步壯大村莊。</p></div><div class="help-step"><span>04</span><h3>深入幽語森林</h3><p>隊伍準備好後，從遠征召喚首領。善用治癒祝福恢復生命，完成討伐取得豐厚獎勵。</p></div></div><div class="help-keys">滑鼠拖曳／單指拖曳：旋轉視角　滾輪／雙指縮放：遠近<br>點擊建築：管理設施　<kbd>Space</kbd> 暫停　<kbd>1–5</kbd> 功能選單　<kbd>Esc</kbd> 關閉視窗<br>切換分頁時遊戲會停止推進，不會在背景消耗資源。</div>`;
 return '';
}
function paintBoss(){const e=game.state.expedition;if(!e||!$('#boss-status'))return;const hp=e.bossHp||0,max=e.bossMaxHp||1;$('#boss-status').textContent=e.active?`討伐進行中 · 守魘生命 ${Math.ceil(hp)} / ${Math.ceil(max)}`:e.cooldown>0?`森林正在平靜 · ${Math.ceil(e.cooldown)} 秒後可再次遠征`:'隊伍已就緒，等待村長的指令。';$('#boss-progress').style.display=e.active?'block':'none';$('#boss-fill').style.width=`${hp/max*100}%`;$('#expedition-button').disabled=e.active||e.cooldown>0;}

function start(){started=true;game.state.paused=false;$('#intro').classList.add('hidden');$('#hud').classList.remove('hidden');select('hall');paint(true);save();beep();if(!saved)toast('歡迎來到暮影村。先招募一位新獵人吧。');}
document.addEventListener('click',e=>{const el=e.target.closest('[data-action]');if(!el||el.disabled)return;const a=el.dataset.action;beep();switch(a){
 case 'start':start();break;
 case 'home':if(started){closeModal();world?.focus('home');select('hall');}break;
 case 'hunters':case 'recruit':case 'build':case 'expedition':case 'journal':case 'settings':case 'help':openModal(a);break;
 case 'close':closeModal();break;
 case 'selectBuilding':closeModal();select(el.dataset.id,true);break;
 case 'upgrade':actionResult(game.upgrade(el.dataset.id));break;
 case 'recruitClass':{const result=game.recruit(el.dataset.id);actionResult(result);if(result.ok){$('#modal-content').innerHTML=modalContent('recruit');paint();}break;}
 case 'quest':if(game.state.quest.complete){actionResult(game.claimQuest());}else if(game.state.quest.index===0){openModal('recruit');}else if(game.state.quest.index===2){select('forge',true);}else if(game.state.quest.index===3){openModal('expedition');}else{world?.focus('hunt');toast(game.state.quest.description);}break;
 case 'hunt':closeModal();world?.focus('hunt');toast('幽語森林 · 獵人會自動迎戰魔物');break;
 case 'heal':actionResult(game.heal());break;
 case 'pause':game.state.paused=!game.state.paused;paint();break;
 case 'speed':game.state.speed=game.state.speed>=3?1:game.state.speed+1;paint();break;
 case 'startExpedition':{const r=game.expedition();actionResult(r);if(r.ok){closeModal();world?.focus('hunt');}break;}
 case 'sound':sound=!sound;$('#sound-btn').innerHTML=icon(sound?'sound':'soundOff');$('#sound-btn').setAttribute('aria-label',sound?'關閉音效':'開啟音效');if(sound)beep();if(modalType==='settings')$('#modal-content').innerHTML=modalContent('settings');break;
 case 'quality':quality=!quality;world?.setQuality(quality);$('#modal-content').innerHTML=modalContent('settings');break;
 case 'zoomIn':case 'zoomOut':if(world){world.camera.zoom=Math.min(2.5,Math.max(.65,world.camera.zoom*(a==='zoomIn'?1.18:1/1.18)));world.camera.updateProjectionMatrix();}break;
 case 'export':{const blob=new Blob([JSON.stringify(game.serialize(),null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='暮影村-存檔.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('已匯出村莊存檔');break;}
 case 'import':{const input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.addEventListener('change',async()=>{try{const f=input.files[0];if(!f)return;if(f.size>1000000)throw new Error('檔案過大');const payload=JSON.parse(await f.text());if(!payload||typeof payload!=='object'||payload.version!==1||!Array.isArray(payload.hunters)||payload.hunters.length<1||payload.hunters.length>20||payload.hunters.some(h=>!h||!CLASSES.some(c=>c.id===h.classId))||!payload.buildings||Array.isArray(payload.buildings)||typeof payload.buildings!=='object'||BUILDINGS.some(b=>!Number.isInteger(payload.buildings[b.id])||payload.buildings[b.id]<1||payload.buildings[b.id]>5))throw new Error('格式不符');const next=createGame(payload);Object.assign(game.state,next.state);game.state.paused=false;started=true;$('#intro').classList.add('hidden');$('#hud').classList.remove('hidden');hunterCache=questCache=selectedCache='';closeModal();paint(true);save();toast('已載入你的村莊');}catch{toast('無法載入：請選擇暮影村匯出的 JSON 存檔',false);}});input.click();break;}
 case 'resetPrompt':openModal('reset');break;
 case 'resetConfirm':game.reset();started=true;game.state.paused=false;hunterCache=questCache=selectedCache='';$('#intro').classList.add('hidden');$('#hud').classList.remove('hidden');closeModal();select('hall');world?.focus('home');paint(true);save();toast('新的故事，從第一日開始。');break;
}});
$('#modal-backdrop').addEventListener('click',e=>{if(e.target===$('#modal-backdrop'))closeModal();});
document.addEventListener('keydown',e=>{if(e.code==='Escape'){closeModal();return;}if(e.key==='Tab'&&modalType){const els=[...$('#modal').querySelectorAll('button:not(:disabled),input')];if(!els.length)return;const first=els[0],last=els.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}return;}if(!started||modalType||e.repeat)return;if(e.code==='Space'){e.preventDefault();game.state.paused=!game.state.paused;paint();}const types={'1':'home','2':'hunters','3':'build','4':'expedition','5':'journal'};if(types[e.key]){if(e.key==='1'){world?.focus('home');select('hall');}else openModal(types[e.key]);}});
document.addEventListener('visibilitychange',()=>{lastTime=0;if(document.hidden)save();});
window.addEventListener('pagehide',save);
function createLabels(){const root=$('#world-labels');root.innerHTML=BUILDINGS.filter(b=>b.id!=='farm').map(b=>`<div class="world-label" data-id="${b.id}">${b.name}<span>Lv.1</span></div>`).join('')+'<div class="world-label hunt" data-id="hunt">幽語森林 <span>狩獵區</span></div>';}
function placeLabels(){if(!world)return;document.querySelectorAll('.world-label').forEach(el=>{const b=el.dataset.id==='hunt'?{x:17,z:-10}:BUILDINGS.find(b=>b.id===el.dataset.id);const p=world.project(b.x,el.dataset.id==='hunt'?1.7:5,b.z);const visible=started&&p.visible&&p.x>120&&p.x<innerWidth-120&&p.y>102&&p.y<innerHeight-100;el.style.opacity=visible?'1':'0';el.style.left=p.x+'px';el.style.top=p.y+'px';if(el.dataset.id!=='hunt')el.querySelector('span').textContent='Lv.'+game.state.buildings[b.id];});}
try{
 world=createWorld($('#world'),{onSelect:id=>{if(started)select(id);}});createLabels();select('hall');paint(true);world.resize();
 const loading=$('#loading');loading.style.opacity='0';setTimeout(()=>loading.remove(),650);
 let frames=0,fpsStart=0,previousRender=0;
 function frame(now){requestAnimationFrame(frame);if(now-previousRender<1000/60)return;previousRender=now;if(document.hidden){lastTime=0;return;}const dt=Math.min((now-lastTime)/1000||.016,.06);lastTime=now;if(started)game.tick(dt);world.update(game.state.paused?0:dt,game.state);world.setTime?.((game.state.time%240)/240);placeLabels();if(now-lastPaint>350){paint();lastPaint=now;}if(now-lastSave>5000){save();lastSave=now;}frames++;if(now-fpsStart>2000){document.body.dataset.fps=Math.round(frames*1000/(now-fpsStart));document.body.dataset.drawCalls=world.renderer.info.render.calls;frames=0;fpsStart=now;}}
 requestAnimationFrame(frame);window.addEventListener('resize',()=>world.resize());
}catch(error){console.error(error);$('#loading').innerHTML=`<span class="loading-rune">✧</span><h2>暮影村</h2><p style="max-width:360px;line-height:2;text-align:center;letter-spacing:1px">3D 場景無法啟動。請使用支援 WebGL 2 的新版 Chrome 或 Edge，並開啟瀏覽器硬體加速。</p><button class="primary" style="margin-top:24px" onclick="location.reload()">重新載入</button>`;}
