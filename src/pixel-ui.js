import {WORLD,REGIONS,BIOME_PALETTE,biomeAt} from './overworld.js';
import {iconCanvas,iconsReady} from './pixel-icons.js';
import {assetProgress,markPhase} from './asset-loading.js';
import {createGame} from './pixel-game.js';
import {createPixelWorld,drawPortrait,buildingDataURL,MAP_PALETTE,MAP_ACCENT} from './pixel-world.js';
import {BUILDINGS,CLASSES,RARITIES,TRAITS,MATERIALS,PRODUCTS,RECIPES,DIFFICULTIES,PILOT_ATTACK,SAVE_KEY} from './pixel-data.js';

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Math.floor(Number(n)||0).toLocaleString('en-US');
let game,world,started=false,modal='',selected=null,portraitCache={},last=0,lastSave=0,leftOpen=false,placing=null,wandererPeek=-1;
// 派遣組隊:使用者自己挑要出征哪幾位(空陣列=未初始化 → 開啟視窗時預設全選存活獵人)。
let dispatchTab=0;   // 目前編輯的隊伍(0-3);隊員與區域都存在 game.state.dispatchTeams
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
function logToast(msg,ok=true){const e=document.createElement('div');e.className=`toast${ok?'':' error'}`;e.textContent=msg;$('#toasts').append(e);setTimeout(()=>e.remove(),3300);}
function save(){if(!started||previewMode)return;try{localStorage.setItem(SAVE_KEY,JSON.stringify(game.serialize()));$('#save-label').textContent='已自動儲存';$('#save-label').classList.remove('warn');}catch{$('#save-label').textContent='請匯出存檔';$('#save-label').classList.add('warn');}}
function costs(obj){return Object.entries(obj||{}).map(([k,v])=>`<span class="${game.state[k]<v?'short':''}">${iconHTML(k)} ${fmt(v)}</span>`).join('');}
function start(){started=true;if(artReviewMode){for(const b of BUILDINGS)game.state.buildings[b.id]=Math.max(1,game.state.buildings[b.id]);game.state.enemies=[];}game.state.paused=artReviewMode;$('#game-ui').classList.remove('hidden');world?.update(0,game.state);world?.focus('home');paint(true);save();}
function resourceRows(){const s=game.state;return [['food','香烤麵包','food'],['drink','莓果飲品','drink'],['bed','舒適床鋪','bed'],['bandage','亞麻繃帶','bandage']].map(([id,n,ic])=>`<button class="stock-item" data-action="craftProduct" data-id="${id}">${iconHTML(ic)}<span>${n}</span><b>${s.stocks[id]}</b><em>製作</em></button>`).join('');}
function miniRoster(){return game.state.hunters.slice(0,3).map(h=>`<button class="mini-hunter" data-action="hunter" data-id="${h.id}"><img data-portrait="${h.id}"><div><strong>${esc(h.name)} <small>Lv.${h.level}</small></strong><p>${esc(h.status)}</p><div class="tiny-health"><span style="width:${Math.max(0,h.hp/h.maxHp*100)}%"></span></div></div></button>`).join('');}
// 圖集載入完成後,立繪快取(portraitCache)必須清掉重畫 —— 
// 不然 UI 永遠顯示圖集載入前生成的舊立繪。(實測踩到:截圖跟舊版逐像素相同)
addEventListener('pixel-assets-ready',()=>{for(const k in portraitCache)delete portraitCache[k];paintPortraits();});
function paintPortraits(){document.querySelectorAll('[data-portrait]').forEach(e=>{const h=game.state.hunters.find(v=>v.id===e.dataset.portrait);if(!h)return;e.src=portrait(h);});}

function paintQuest(){const q=game.state.quest;$('#quest-chapter').textContent=`CHAPTER ${String(q.index+1).padStart(2,'0')}`;$('#quest-title').textContent=q.title;$('#quest-desc').textContent=q.description;$('#quest-progress').textContent=`${q.progress}/${q.target}`;$('#quest-fill').style.width=`${Math.min(100,q.progress/q.target*100)}%`;$('#quest-reward').innerHTML=costs(q.reward);$('#quest-button').textContent=q.claimed?'全部委託完成':q.complete?'領取獎勵':'查看委託';$('#quest-button').disabled=q.claimed;}
function paintInspector(){if(!selected||!BUILDINGS.some(b=>b.id===selected))return;const b=BUILDINGS.find(v=>v.id===selected),s=game.state,l=s.buildings[b.id],p=s.layout[b.id];$('#inspect-title').textContent=b.name;const img=buildingImg(b.id);$('#inspect-content').innerHTML=`<div class="inspect-art">${img?`<img src="${img}" alt="${b.name}">`:iconHTML(b.type)}</div><div class="inspect-level">${l?'建築 Lv.'+l:'尚未建造'}</div><p class="inspect-desc">${b.desc}</p><div class="inspect-effect"><strong>作用</strong><br>${b.effect}</div><div class="cost"><span>需求</span>${costs(l?game.getUpgradeCost(b.id):b.cost)}</div><div class="inspect-actions">${l?`<button class="pixel-button gold" data-action="upgrade" data-id="${b.id}">升級 Lv.${l+1}</button>`:`<button class="pixel-button gold" data-action="construct" data-id="${b.id}">建造</button>`}<button class="move" data-action="moveBuilding" data-id="${b.id}">移動位置</button></div>`;setIcons($('#inspect-content'));}
function paint(force=false){const s=game.state;['gold','wood','ore','gems'].forEach(k=>$('#'+k).textContent=fmt(s[k]));$('#population').textContent=`${s.hunters.length}/${s.capacity}`;$('#town-level').textContent=`村莊 Lv.${s.buildings.hall}`;$('#difficulty-name').textContent=DIFFICULTIES[s.difficulty].name;$('#stock-list').innerHTML=resourceRows();$('#mini-roster').innerHTML=miniRoster();paintPortraits();paintQuest();$('#pause').textContent=s.paused?'▶':'Ⅱ';$('#speed').textContent=`${s.speed}×`;$('#pause-label').classList.toggle('hidden',!s.paused);$('#heal-button').disabled=s.healCooldown>0;$('#heal-label').textContent=s.healCooldown>0?`治癒 ${Math.ceil(s.healCooldown)}s`:'治癒';$('#notice-feed').innerHTML=s.log.slice(0,3).map(l=>`<div>${esc(l.text)}</div>`).join('');if(selected)paintInspector();setIcons();document.body.dataset.kills=s.totalKills;document.body.dataset.services=s.counts.services;const landscape=world?.landscapeStats?.();if(landscape){document.body.dataset.trees=landscape.trees;document.body.dataset.arenas=landscape.arenas;document.body.dataset.roads=landscape.roads;}document.body.dataset.worldArea=WORLD.area;document.body.dataset.region=s.region;const rb=$('#region-badge');if(rb)rb.textContent=(REGIONS.find(r=>r.id===s.region)?.name||'向陽草原')+' · 狩獵中';pilotStatus();}
// 主世界地圖畫布:長寬比跟世界一樣(一格世界單位在畫面上是正方形),四周各留 15 像素邊。
const WORLD_MAP_H=392,WORLD_MAP_W=Math.round((WORLD_MAP_H-30)*WORLD.width/WORLD.height)+30;
function modalTitle(t,ic='scroll'){const names={worldmap:'主世界地圖',build:'村莊建設',hunters:'獵人名冊',hunter:'獵人詳情',trade:'交易所',craft:'製作與庫存',dungeon:'地下城遠征',arena:'競技場模擬對戰',quests:'村長委託',inventory:'村莊倉庫',difficulty:'狩獵難度',settings:'遊戲設定',help:'村長入門手札',boss:'地圖首領',dispatch:'派遣出征 · 自由組隊'};$('#modal-title').textContent=names[t]||t;$('#modal-icon').dataset.icon=ic;setIcons($('#modal'));}
function portrait(h){const key=h.classId+':'+h.rarity;if(portraitCache[key])return portraitCache[key];const c=document.createElement('canvas');c.width=84;c.height=96;drawPortrait(c,h,{scale:2.7});return portraitCache[key]=c.toDataURL();}

function openModal(type){modal=type;$('#modal-backdrop').classList.remove('hidden');modalTitle(type,type==='trade'?'trade':type==='craft'?'anvil':type==='dungeon'?'dungeon':type==='arena'?'swords':type==='hunters'?'hunter':type==='difficulty'?'skull':type==='dispatch'?'swords':'scroll');$('#modal-content').innerHTML=modalHTML(type);if(type==='worldmap')paintMap($('#world-map-canvas'));setIcons($('#modal-content'));paintPortraits();}
function closeModal(){modal='';$('#modal-backdrop').classList.add('hidden');}
function modalHTML(type){const s=game.state;
 if(type==='worldmap')return `<div class="world-map-header"><span>主世界 · 8 個區域</span><b>${WORLD.width} × ${WORLD.height} = ${WORLD.area.toLocaleString()} 地圖單位</b><button class="pixel-button" data-action="worldOverview">全景查看</button><button class="pixel-button" data-action="recallHunters">召回獵人</button></div><canvas id="world-map-canvas" width="${WORLD_MAP_W}" height="${WORLD_MAP_H}" aria-label="主世界區域地圖"></canvas><div class="region-grid">${REGIONS.map(r=>`<article class="region-card ${s.region===r.id?'active':''}" style="--biome:${r.color}"><h3>${r.name}</h3><small>${r.subtitle}</small><p>${r.description}</p><div><button class="pixel-button" data-action="regionView" data-id="${r.id}">查看</button>${r.id!=='village'?`<button class="pixel-button gold" data-action="regionTravel" data-id="${r.id}">前往${r.name}</button>`:''}</div></article>`).join('')}</div><p class="modal-note">參考主世界的生態分區與河流配置。獵人沿橋樑通行；這個版本不含挖掘、放置方塊或無限地形。</p>`;

 if(type==='build')return `<p class="modal-intro">村長可以自由建造和升級設施。把建築移到喜歡的位置，讓獵人往返更順暢。</p><div class="building-grid">${BUILDINGS.map(b=>{const l=s.buildings[b.id];return `<button class="building-card ${l?'':'unbuilt'}" data-action="selectBuilding" data-id="${b.id}"><img src="${buildingImg(b.id)}" alt="${b.name}"><strong>${b.name}</strong><small>${l?'Lv.'+l:'未建造'}</small><b class="build-level">${l?'◆':''}</b></button>`}).join('')}</div>`;
 if(type==='hunters')return `<div class="modal-toolbar"><span>性格、稀有度、裝備與需求都會影響狩獵結果。</span><button class="pixel-button" data-action="dispatchHunters">派遣出征</button><button class="pixel-button" data-action="recallHunters">召回村內</button><button class="pixel-button gold" data-action="recruit">招募訪客</button></div><div class="roster-grid">${s.hunters.map(h=>`<button class="hunter-card" data-action="hunter" data-id="${h.id}"><img data-portrait="${h.id}"><div><h3>${esc(h.name)}</h3><small>Lv.${h.level} · ${CLASSES.find(c=>c.id===h.classId)?.name}</small><div class="rarity" data-rarity="${h.rarity}" style="--rarity:${RARITIES.find(r=>r.id===h.rarity)?.color}">${RARITIES.find(r=>r.id===h.rarity)?.name}</div><div class="status">${esc(h.status)}</div><div class="tiny-health"><span style="width:${h.hp/h.maxHp*100}%"></span></div></div></button>`).join('')}</div><p class="modal-note">獵人擁有自己的金幣，會購買餐點、飲品、床鋪、繃帶與裝備。</p>`;
 if(type==='recruit')return `<p class="modal-intro">旅人會隨時間來到村莊。邀請更稀有的獵人加入，他們會帶著不同的性格與成長潛力。</p><div class="visitor-grid">${s.visitors.map(v=>{const c=CLASSES.find(x=>x.id===v.classId),r=RARITIES.find(x=>x.id===v.rarity),t=TRAITS.find(x=>x.id===v.trait);return `<article class="visitor-card"><div class="visitor-art"><img src="${portrait({id:v.id,classId:v.classId})}" alt="${c.name}"></div><h3>${c.name}</h3><div class="rarity" data-rarity="${r.id}" style="--rarity:${r.color}">${r.name}</div><div class="trait">${t.name} · ${t.desc}</div><p>${c.desc}</p><button class="pixel-button gold" data-action="recruitVisitor" data-id="${v.id}">邀請加入 ${v.cost} 金幣</button></article>`}).join('')}</div>`;
 if(type==='trade')return `<p class="modal-intro">向獵人發布收購委託。他們會在狩獵後回村出售戰利品，村莊支付金幣並獲得材料。</p><div class="materials-grid">${Object.entries(MATERIALS).map(([id,m])=>`<div class="material-item">${iconHTML(id)}<div><span>${m.name}</span><b>${s[id]}</b></div><small>${m.price} 金幣/份</small></div>`).join('')}</div><table class="trade-table"><thead><tr><th>材料</th><th>收購中</th><th>調整數量</th><th>操作</th></tr></thead><tbody>${Object.entries(MATERIALS).map(([id,m])=>`<tr><td>${m.name}</td><td>${s.tradeRequests[id]} 份</td><td><input id="trade-${id}" type="number" min="0" max="999" value="${s.tradeRequests[id]}"></td><td><button class="pixel-button" data-action="setTrade" data-id="${id}">發布</button></td></tr>`).join('')}</tbody></table><div class="trade-footer"><span>收購金額會從村莊金庫支付。<br>獵人會在下一次回村時自動交易。</span><button class="pixel-button gold" data-action="collectTrade">查看交易紀錄</button></div>`;
 if(type==='craft')return `<p class="modal-intro">把材料轉成獵人需要的生活物資與裝備。服務會由獵人付費，回到村莊金庫。</p><div class="tabs"><button class="active">生活物資</button><button>裝備製作</button></div><div class="craft-grid">${Object.entries(PRODUCTS).map(([id,p])=>`<article class="craft-card"><div class="craft-heading"><i>${iconHTML(id)}</i><div><h3>${p.name}</h3><small>庫存 ${s.stocks[id]} · 售價 ${p.price}</small></div></div><p>${p.need==='hp'?'治療生命':p.need==='satiety'?'恢復飽食度':p.need==='stamina'?'恢復精力':'恢復心情'}，旅館與商店建築升級後效果更佳。</p><div class="cost">${costs(p.cost)}</div><div class="craft-buttons"><button class="pixel-button gold" data-action="craftProduct" data-id="${id}">製作 10 份</button><button class="pixel-button" data-action="craftProduct" data-id="${id}" data-batches="5">製作 50 份</button></div></article>`).join('')}</div><div class="craft-grid" style="margin-top:14px">${RECIPES.map(r=>`<article class="craft-card"><div class="craft-heading"><i>${iconHTML('anvil')}</i><div><h3>${r.name}</h3><small>裝備庫存 ${s.gearStock[r.type]} · 售價 ${r.price}</small></div></div><p>獵人返回村莊後會用個人金幣購買，裝備提升攻擊或防禦。</p><div class="cost">${costs(r.cost)}</div><button class="pixel-button gold" data-action="craftGear" data-id="${r.id}">鍛造裝備</button></article>`).join('')}</div>`;
 if(type==='dispatch'){const teams=s.dispatchTeams||[];const tab=Math.min(dispatchTab,teams.length-1);const team=teams[tab]||{name:'隊伍 1',ids:[],region:'meadow'};
   const alive=aliveHunters();const rn=REGIONS.find(r=>r.id===team.region)?.name||team.region;
   return `<p class="modal-intro">四組隊伍各自記住隊員與狩獵區（存檔會保留）。點上面的分頁切換要編輯哪一組，改完直接按派遣。</p>
   <div class="encounter-actions dispatch-tabs">${teams.map((t2,i)=>`<button class="pixel-button ${i===tab?'gold':''}" data-action="dispatchTab" data-index="${i}">${t2.name}${t2.ids.length?`（${t2.ids.length}）`:''}</button>`).join('')}</div>
   <div class="modal-toolbar"><span>${team.name}：已選 <b>${team.ids.length}</b> / ${alive.length} 位</span>
   <button class="pixel-button" data-action="dispatchAll">全選</button><button class="pixel-button" data-action="dispatchNone">全不選</button></div>
   <div class="party-grid">${s.hunters.map(h=>`<button class="party-pick ${team.ids.includes(h.id)?'selected':''}" data-action="toggleDispatchHunter" data-id="${h.id}"><img data-portrait="${h.id}"><span>${esc(h.name)}<b>Lv.${h.level}</b></span><small>${h.hp<=0?'✝':team.ids.includes(h.id)?'✓':''}</small></button>`).join('')}</div>
   <div class="encounter-status">${team.name} 的狩獵區：<b>${rn}</b></div>
   <div class="encounter-actions dispatch-regions">${REGIONS.filter(r=>r.id!=='village').map(r=>`<button class="pixel-button ${r.id===team.region?'gold':''}" data-action="dispatchRegion" data-id="${r.id}">${r.name}</button>`).join('')}</div>
   <div class="encounter-actions"><button class="pixel-button gold" data-action="startDispatch">${team.ids.length?`派遣 ${team.ids.length} 位前往${rn}`:'這一組還沒有隊員'}</button></div>`;
 }
 if(type==='dungeon')return `<div class="encounter-banner"><i>${iconHTML('dungeon')}</i><div><h3>地下城遠征</h3><p>選派三位獵人深入地下城。每層都有新的敵人與材料獎勵。</p></div></div><div class="encounter-status">${s.dungeon.active?`第 ${s.dungeon.floor} 層 · ${s.dungeon.phase}`:`最高紀錄：第 ${s.dungeon.bestFloor} 層 · ${s.dungeon.cooldown>0?'整備中':'可以出發'}`}</div><div class="party-grid">${s.hunters.map(h=>`<button class="party-pick ${s.dungeon.hunterIds.includes(h.id)?'selected':''}" data-action="toggleDungeonHunter" data-id="${h.id}"><img data-portrait="${h.id}"><span>${h.name}<b>Lv.${h.level}</b></span><small>${s.dungeon.hunterIds.includes(h.id)?'✓':''}</small></button>`).join('')}</div><div class="encounter-actions"><button class="pixel-button gold" data-action="startDungeon">${s.dungeon.active?'探險中…':'派遣三人小隊'}</button></div>`;
 if(type==='arena')return `<div class="encounter-banner"><i>${iconHTML('swords')}</i><div><h3>競技場模擬對戰</h3><p>與 NPC「${s.arena.opponent}」進行三人小隊模擬戰，不消耗真實死亡資源。</p></div></div><div class="encounter-status">勝場 ${s.arena.wins} · 敗場 ${s.arena.losses} · ${s.arena.active?s.arena.phase:s.arena.cooldown>0?'整備中':'可挑戰'}</div><div class="party-grid">${s.hunters.map(h=>`<button class="party-pick ${s.arena.hunterIds.includes(h.id)?'selected':''}" data-action="toggleArenaHunter" data-id="${h.id}"><img data-portrait="${h.id}"><span>${h.name}<b>Lv.${h.level}</b></span><small>${s.arena.hunterIds.includes(h.id)?'✓':''}</small></button>`).join('')}</div><div class="encounter-actions"><button class="pixel-button gold" data-action="startArena">開始模擬對戰</button></div>`;
 if(type==='quests')return `<div class="quest-list">${s.quest.claimed?'<p class="modal-note">全部委託已完成。新的村莊傳說正在等待被書寫。</p>':`<article class="quest-list-row"><h3>${s.quest.title}</h3><p>${s.quest.description}</p><div class="progress"><span style="width:${s.quest.progress/s.quest.target*100}%"></span><b>${s.quest.progress}/${s.quest.target}</b></div><div class="cost">獎勵 ${costs(s.quest.reward)}</div><button class="pixel-button gold" data-action="quest" ${s.quest.complete?'':'disabled'}>${s.quest.complete?'領取獎勵':'尚未完成'}</button></article>`}</div>`;
 if(type==='inventory')return `<p class="modal-intro">村莊倉庫保存建材、生活物資與鐵匠鋪製作的裝備。</p><div class="materials-grid">${Object.entries({...MATERIALS,food:{name:'香烤麵包'},drink:{name:'莓果飲品'},bed:{name:'舒適床鋪'},bandage:{name:'亞麻繃帶'},weapon:{name:'精鐵武器'},armor:{name:'皮革護甲'}}).map(([id,m])=>`<div class="material-item">${iconHTML(id)}<div><span>${m.name}</span><b>${s[id]??s.stocks?.[id]??s.gearStock?.[id]??0}</b></div></div>`).join('')}</div>`;
 if(type==='difficulty')return `<p class="modal-intro">狩獵難度會提高森林魔物的生命與攻擊。高難度需要完成轉世累計。</p><div class="difficulty-grid">${DIFFICULTIES.map(d=>`<article class="difficulty-card"><i>${iconHTML('skull')}</i><h3>${d.name}</h3><small>魔物強度 ×${d.mult}<br>需要轉世 ${d.rebirths} 次</small><button class="pixel-button ${s.difficulty===d.id?'gold':''}" data-action="setDifficulty" data-id="${d.id}" ${s.difficulty===d.id?'disabled':''}>${s.difficulty===d.id?'目前難度':'選擇'}</button></article>`).join('')}</div>`;
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
   <div class="setting-row"><div><strong>動作實驗室</strong><small>直接挑一個職業，播放遊戲裡所有動作（待機、走路、攻擊、技能、受傷、倒地、勝利…），可逐格看。</small></div><button class="pixel-button gold" data-action="poseLab">打開</button></div>
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
 if(type==='help')return `<div class="help-grid"><div class="help-card"><h3>怎麼操作？</h3><p>${matchMedia('(pointer:coarse)').matches?'單指拖曳平移、雙指縮放':'拖曳平移、滾輪縮放'}；點建築看資訊與升級，點獵人看詳情。下方選單是村莊各項功能。</p></div><div class="help-card"><h3>村長要做什麼？</h3><p>重建被魔王摧毀的城鎮，建造餐廳、旅館、酒館、治療所與鐵匠鋪，服務獵人的生活需求。</p></div><div class="help-card"><h3>獵人怎麼生活？</h3><p>獵人有自己的金幣、飽食度、心情與精力。他們會狩獵、帶回材料、回村交易，再支付費用吃飯、休息和治療。</p></div><div class="help-card"><h3>怎麼變強？</h3><p>在學院學技能、修煉地訓練、鐵匠鋪購買武器，再到強化精煉所強化。Lv.100 後可到復活聖所轉世。</p></div><div class="help-card"><h3>村外內容</h3><p>委託所追蹤魔物目標，地下城三人遠征，地圖首領討伐，以及修煉地開放的 NPC 競技場模擬對戰。</p></div></div>`;
 if(type==='boss')return `<div class="encounter-banner"><i>${iconHTML('horn')}</i><div><h3>地圖首領：森林魔王</h3><p>吹響號角，召集所有可出征的獵人。首領會帶回大量稀有材料與星晶。</p></div></div><div class="encounter-status">${s.expedition.active?`討伐中 · 生命 ${Math.ceil(s.expedition.bossHp)}/${s.expedition.bossMaxHp}`:s.expedition.cooldown>0?`整備 ${Math.ceil(s.expedition.cooldown)} 秒`:'森林魔王尚未出現'}</div><div class="encounter-actions"><button class="pixel-button gold" data-action="startBoss" ${s.expedition.active||s.expedition.cooldown>0?'disabled':''}>召喚森林魔王</button></div>`;
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
 if(a==='start')return start();if(a==='close')return closeModal();if(a==='toggleLeft'){leftOpen=!leftOpen;$('#left-panel').classList.toggle('hidden',!leftOpen);$('#reopen-left').classList.toggle('hidden',leftOpen);return;}if(a==='closeInspector'){$('#inspector').classList.add('hidden');selected=null;world?.setSelected(null);return;}
 if(a==='home'){closeModal();world?.focus('home');return;}if(a==='hunt'){world?.focus('hunt');return;}if(a==='zoomIn'){world?.zoomBy(1.15);return;}if(a==='zoomOut'){world?.zoomBy(1/1.15);return;}
 if(a==='pause'){game.state.paused=!game.state.paused;paint();return;}if(a==='speed'){game.state.speed=game.state.speed>=3?1:game.state.speed+1;paint();return;}
 if(a==='toggleParts'){const on=!(world?.getPartsVisible?.()??true);world?.setPartsVisible?.(on);el.textContent=on?'裝備顯示中':'裝備已卸下';logToast(on?'裝備零件層：開':'裝備零件層：關（同一個身體、不重生）',true);paint();return;}
 if(a==='peekWanderer'){const list=game.state.wanderers||[];if(!list.length)return logToast('目前沒有流浪英雄',false);wandererPeek=(wandererPeek+1)%list.length;const w=list[wandererPeek],c=CLASSES.find(v=>v.id===w.classId);closeModal();world?.lookAt(w.x,w.z,1.7);logToast(`${c?.name||w.classId} ${w.name} Lv.${w.level}｜${w.status}｜野外擊殺 ${game.state.wanderKills}`,true);return;}
 if(a==='spawnClasses'){const spawned=world?.spawnClassVillagers?.()||[];logToast(spawned.length?`已叫進村莊：${spawned.join('、')}`:'角色圖還沒載入好，稍後再試',spawned.length>0);paint();return;}
 if(a==='settings'||a==='help'||a==='build'||a==='hunters'||a==='recruit'||a==='trade'||a==='craft'||a==='dungeon'||a==='arena'||a==='quests'||a==='inventory'||a==='difficulty'||a==='boss')return openModal(a==='boss'?'boss':a);
 if(a==='dispatchHunters'){const teams=game.state.dispatchTeams||[];
   // 第一次使用:四組都空 → 自動把存活獵人放進隊伍 1,一鍵就能出門
   if(teams.every(t2=>!t2.ids.length)){game.setDispatchTeam(0,{ids:aliveHunters().map(h=>h.id)});}
   dispatchTab=0;return openModal('dispatch');}
 if(a==='dispatchTab'){dispatchTab=Number(el.dataset.index)||0;return openModal('dispatch');}
 if(a==='toggleDispatchHunter'){const team=game.state.dispatchTeams[dispatchTab];const ids=[...(team?.ids||[])];const i=ids.indexOf(id);if(i>=0)ids.splice(i,1);else ids.push(id);game.setDispatchTeam(dispatchTab,{ids});return openModal('dispatch');}
 if(a==='dispatchAll'){game.setDispatchTeam(dispatchTab,{ids:aliveHunters().map(h=>h.id)});return openModal('dispatch');}
 if(a==='dispatchNone'){game.setDispatchTeam(dispatchTab,{ids:[]});return openModal('dispatch');}
 if(a==='dispatchRegion'){game.setDispatchTeam(dispatchTab,{region:id});return openModal('dispatch');}
 if(a==='startDispatch'){r=game.dispatchTeam(dispatchTab);logToast(r.message,r.ok);if(r.ok)closeModal();save();paint();return;}
 if(a==='toggleDungeonHunter'){toggleParty('dungeon',id);return;}if(a==='toggleArenaHunter'){toggleParty('arena',id);return;}if(a==='startDungeon'){r=game.startDungeon(game.state.dungeon.hunterIds);logToast(r.message,r.ok);paint();return;}if(a==='startArena'){r=game.startArena(game.state.arena.hunterIds);logToast(r.message,r.ok);paint();return;}
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
 if(a==='setTrade'){const box=document.querySelector('#trade-'+id);r=game.setTradeRequest(id,Math.round(Number(box?.value??0)));logToast(r.message,r.ok);paint();save();return;}
 if(a==='collectTrade'){const t=game.state.tradeRequests,pend=Object.entries(t).filter(([,v])=>v>0).map(([k,v])=>`${MATERIALS[k]?.name||k} ${v}`);logToast(pend.length?`收購中：${pend.join('、')}（獵人回村會自動成交）`:'目前沒有發布收購委託。',pend.length>0);return;}
 if(a==='craftProduct'){r=game.craft(id,Number(el.dataset.batches||1));logToast(r.message,r.ok);paint();save();return;}
 if(a==='craftGear'){r=game.craftEquipment(id);logToast(r.message,r.ok);paint();save();return;}
 if(a==='pilotLab'){closeModal();pilotOpen=true;pickOpen=false;pilotPaint();return;}
 if(a==='poseLab'){closeModal();poseLab.playing=false;clearTimeout(poseLab.timer);poseLabPaint();return;}
 if(a==='toggleDev'){devOpen=!devOpen;return openModal('settings');}
 if(a==='cheat'){const r2=game.cheat(id);logToast(r2.message,r2.ok);save();paint();openModal('settings');return;}
 if(a==='setOpt'){const key=el.dataset.key,raw=el.dataset.value,val=key==='fps'?Number(raw):key==='shadows'||key==='night'?raw==='1':raw;game.setSetting(key,val);applySettings();save();openModal('settings');paint();logToast('已套用：'+({quality:'畫質',dpr:'解析度',fps:'幀率',shadows:'動態影子',night:'夜晚變暗'}[key]||key));return;}if(a==='reset'){if(confirm('確定要重置村莊嗎？')){game.reset();applySettings();started=true;paint(true);logToast('五位獵人重新抵達暮影村。');}return;}
 if(a==='export'){const blob=new Blob([JSON.stringify(game.serialize())],{type:'application/json'}),u=URL.createObjectURL(blob),link=document.createElement('a');link.href=u;link.download='暮影村-像素存檔.json';link.click();setTimeout(()=>URL.revokeObjectURL(u),500);return;}
}
// 把 state.settings 套到畫面:畫質、解析度上限、影子、夜晚、幀率
// ── 動作實驗室:浮動面板,直接在任何畫面上播某個職業的動作(不影響模擬) ──
let poseLab={cls:'berserker',act:'idle',i:0,playing:false,timer:0};
let devOpen=false;   // 設定頁「開發者作弊」是否展開
let poseLabEl=null;
function poseLabFrame(){const info=world?.__mistvalePoseLab?.info?.(poseLab.cls)||globalThis.__mistvalePoseLab?.info?.(poseLab.cls);return info?info.actions[poseLab.act]?.frames||1:1;}
function poseLabApply(){const api=globalThis.__mistvalePoseLab;if(!api)return;api.set({classId:poseLab.cls,act:poseLab.act,i:poseLab.i,facing:1});}
function poseLabTick(){if(!poseLab.playing)return;const n=poseLabFrame();poseLab.i=(poseLab.i+1)%n;poseLabApply();const info=globalThis.__mistvalePoseLab?.info?.(poseLab.cls);const ft=info?1:1;
 poseLab.timer=setTimeout(poseLabTick,Math.max(40,1000/12));poseLabPaint();}
function poseLabPaint(){
 const api=globalThis.__mistvalePoseLab; if(!api)return;
 const info=api.info(poseLab.cls);
 if(!poseLabEl){poseLabEl=document.createElement('div');poseLabEl.id='poselab';document.body.appendChild(poseLabEl);}
 if(!info){poseLabEl.innerHTML='<b>這個職業的圖還沒載入</b>';return;}
 const acts=Object.keys(info.actions);
 if(!acts.includes(poseLab.act))poseLab.act=acts[0];
 const n=info.actions[poseLab.act]?.frames||1;
 poseLab.i=Math.max(0,Math.min(n-1,poseLab.i));
 const clsBtn=CLASSES.map(c=>`<button class="pixel-button ${c.id===poseLab.cls?'gold':''}" data-poselab="cls" data-id="${c.id}">${c.name}</button>`).join('');
 const actBtn=acts.map(a=>`<button class="pixel-button ${a===poseLab.act?'gold':''}" data-poselab="act" data-id="${a}">${POSE_LABEL[a]||a}</button>`).join('');
 poseLabEl.innerHTML=`<div class="pl-head"><b>動作實驗室</b><span>${CLASSES.find(c=>c.id===poseLab.cls)?.name||poseLab.cls} · ${POSE_LABEL[poseLab.act]||poseLab.act} · ${n} 格</span>
  <button class="pixel-button" data-poselab="play">${poseLab.playing?'⏸ 暫停':'▶ 播放'}</button><button class="pixel-button" data-poselab="close">關閉</button></div>
  <div class="pl-row">${clsBtn}</div>
  <div class="pl-row">${actBtn}</div>
  <div class="pl-row pl-frame"><input type="range" min="0" max="${n-1}" value="${poseLab.i}" data-poselab="frame"><b>${poseLab.i+1}/${n}</b></div>`;
 poseLabApply(); paint();
}
const POSE_LABEL={idle:'待機',idleDown:'待機(下)',idleUp:'待機(上)',walk:'走(側)',walkDown:'走(下)',walkDownRight:'走(右下)',walkUp:'走(上)',walkUpRight:'走(右上)',attack:'攻擊(側)',attackDown:'攻擊(下)',attackDownRight:'攻擊(右下)',attackUp:'攻擊(上)',attackUpRight:'攻擊(右上)',skill:'技能',hurt:'受傷',death:'倒地',victory:'勝利',walkLeft:'走(左)',attackLeft:'攻擊(左)'};
document.addEventListener('click',e=>{
 const b=e.target.closest('[data-poselab]'); if(!b)return;
 const kind=b.dataset.poselab;
 if(kind==='close'){poseLab.playing=false;clearTimeout(poseLab.timer);globalThis.__mistvalePoseLab?.set(null);poseLabEl?.remove();poseLabEl=null;paint();return;}
 if(kind==='play'){poseLab.playing=!poseLab.playing;if(poseLab.playing)poseLabTick();else clearTimeout(poseLab.timer);poseLabPaint();return;}
 if(kind==='cls'){poseLab.cls=b.dataset.id;poseLab.act='idle';poseLab.i=0;}
 if(kind==='act'){poseLab.act=b.dataset.id;poseLab.i=0;}
 poseLabPaint();
});
document.addEventListener('input',e=>{
 const el=e.target.closest('[data-poselab="frame"]'); if(!el)return;
 poseLab.i=Number(el.value); poseLabApply(); poseLabPaint();
});
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
function openHunter(id){const h=game.state.hunters.find(v=>v.id===id);if(!h)return;modal='hunter-detail';modalTitle('hunter','hunter');$('#modal-content').innerHTML=`<div class="hunter-detail"><div class="detail-avatar"><img src="${portrait(h)}"><h3>${esc(h.name)}</h3><div class="rarity" data-rarity="${h.rarity}" style="--rarity:${RARITIES.find(r=>r.id===h.rarity)?.color}">${RARITIES.find(r=>r.id===h.rarity)?.name}</div></div><div><div class="detail-header"><strong>${CLASSES.find(c=>c.id===h.classId)?.name} · Lv.${h.level}</strong><span>${esc(h.status)}</span></div><div class="stats-grid"><div>攻擊<b>${h.attack}</b></div><div>防禦<b>${h.defense}</b></div><div>轉世<b>${h.rebirths}</b></div></div>${[['hp','生命','hp'],['satiety','飽食','satiety'],['stamina','精力','stamina'],['mood','心情','mood']].map(([k,n,c])=>`<div class="need-row ${c}"><label>${n}</label><div class="progress"><span style="width:${k==='hp'?h.hp/h.maxHp*100:h[k]}%"></span><b>${Math.floor(k==='hp'?h.hp:h[k])}</b></div></div>`).join('')}<div class="equipment-row">${iconHTML('gold')} 個人金幣 ${fmt(h.gold)}　 ${h.equipment.weapon?'⚔️ 武器':'未裝備武器'}　${h.equipment.armor?'🛡️ 護甲':'未裝備護甲'}</div></div></div><div class="hunter-actions"><button class="pixel-button" data-action="learnSkill" data-id="${h.id}">學習技能<small>學院</small></button><button class="pixel-button" data-action="train" data-id="${h.id}">修煉<small>20 個人金幣</small></button><button class="pixel-button" data-action="enhanceHunter" data-id="${h.id}">強化裝備<small>精煉所</small></button><button class="pixel-button" data-action="reincarnate" data-id="${h.id}">轉世<small>Lv.100</small></button></div>`;setIcons($('#modal-content'));$('#modal-backdrop').classList.remove('hidden');}
function handleWorldSelect(id){if(!started)return;if(id?.startsWith('hunter:'))openHunter(id.slice(7));else if(id)inspect(id);}
document.addEventListener('click',e=>{const el=e.target.closest('[data-action]');if(el&&!el.disabled)doAction(el);});
document.addEventListener('keydown',e=>{if(e.target.matches('input,textarea,select'))return;if(e.key.toLowerCase()==='m'&&started){openModal('worldmap');return;}if(e.key==='Escape'){if(placing){placing=null;$('#placement').classList.add('hidden');world?.placeMode(null);}else closeModal();}if(e.code==='Space'&&!modal&&started){e.preventDefault();if(game.state.pilot){game.pilotAttack();return;}game.state.paused=!game.state.paused;paint();}const map={'1':'build','2':'hunters','3':'trade','4':'craft','5':'dungeon','6':'arena','7':'quests'};if(!modal&&map[e.key])openModal(map[e.key]);});
$('#modal-backdrop').addEventListener('click',e=>{if(e.target.id==='modal-backdrop')closeModal();});
try{const saved=(()=>{try{return previewMode?null:JSON.parse(localStorage.getItem(SAVE_KEY)||'null');}catch{return null;}})();game=createGame(saved);game.state.paused=true;document.querySelector('#title-art')?.style.setProperty('background-image',`url(${AS().title||''})`);if(AS().woodui)document.documentElement.style.setProperty('--wood-tex',`url(${AS().woodui})`);/* 2026-10-28:把 PixelLab 的 UI 零件掛成 CSS 變數(--ui-panel / --ui-btn-primary …),CSS 用 border-image 九宮格拉伸 */{const uiMap=AS().ui||{};for(const [k,v] of Object.entries(uiMap)){const u=`url(${v})`;document.documentElement.style.setProperty('--ui-'+k,u);document.documentElement.style.setProperty('--ui-px-'+k,u);}/* 另一套 CSS 用 --ui-px-<名字>（window/card/btn-wood/…）→ 對到同一批零件，兩套命名都吃得動 */const UI_ALIAS={'px-window':'panel','px-card':'panel-sm','px-btn-wood':'btn-secondary','px-btn-gold':'btn-primary','px-btn-red':'btn-danger','px-btn-x':'btn-close','px-tile':'tab','px-tile-on':'tab-on','px-trough':'bar','px-toast':'toast-ok','px-toast-err':'toast-err'};for(const [alias,src] of Object.entries(UI_ALIAS))if(uiMap[src])document.documentElement.style.setProperty('--'+alias,`url(${uiMap[src]})`);}setIcons();world=createPixelWorld($('#world'),{getState:()=>game.state,onSelect:handleWorldSelect,onPlace:(id,x,z)=>{const r=game.moveBuilding(id,x,z);logToast(r.message,r.ok);if(r.ok){placing=null;$('#placement').classList.add('hidden');world.placeMode(null);}paint();}});world.setTime(.18);applySettings();if(matchMedia('(pointer:coarse)').matches)$('.map-hint').textContent='拖曳平移 · 雙指縮放 · 點選建築／獵人';  /* 觸控裝置沒有滾輪 */globalThis.__mistvaleView=world;globalThis.__mistvaleGame=game;  // 驗收腳本用(pipeline/scripts/l0veyou/verify_all_regions.js)
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
 const t0=performance.now();try{frames++;if(now-fpsStart>2000){document.body.dataset.fps=Math.round(frames*1000/(now-fpsStart));fpsStart=now;frames=0;}const dt=Math.min(.1,(now-previous)/1000);previous=now;if(started)game.tick(dt);pilotHudTick();world.setTime((game.state.time%240)/240);world.update(game.state.paused?0:dt,game.state);if(now-last>400){paint();last=now;}if(now-lastSave>5000){save();lastSave=now;}}finally{const ms=performance.now()-t0;frameMs.avg=frameMs.avg?frameMs.avg*.9+ms*.1:ms;frameMs.max=Math.max(frameMs.max,ms);frameMs.n++;if(perfProbe)perfSample(now,ms);}}requestAnimationFrame(frame);}catch(err){console.error(err);$('#loading').innerHTML='<b>像素村莊載入失敗，請重新整理</b>';}

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
