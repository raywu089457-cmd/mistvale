from pathlib import Path
p=Path('src/pixel-ui.js');s=p.read_text(encoding='utf-8')
s=s.replace("import {createPixelWorld,drawPortrait}", "import {createPixelWorld,drawPortrait,buildingDataURL}")
s="import {WORLD,REGIONS,BIOME_PALETTE,biomeAt,riverX} from './overworld.js';\nimport {iconCanvas} from './pixel-icons.js';\n"+s
start=s.index('function icon(name)');end=s.index('\nfunction setIcons',start)
s=s[:start]+"const icon=iconCanvas;\nconst previewMode=new URLSearchParams(location.search).has('preview');\nconst buildingImages=new Map();\nconst buildingImg=id=>{if(!buildingImages.has(id))buildingImages.set(id,buildingDataURL(id));return buildingImages.get(id);};\nwindow.addEventListener('pixel-assets-ready',()=>{buildingImages.clear();if(selected)paintInspector();});\n"+s[end:]
s=s.replace("root.querySelectorAll('[data-icon]').forEach(e=>{e.innerHTML='';e.append(icon(e.dataset.icon));});", "root.querySelectorAll('[data-icon]').forEach(e=>{if(e.firstElementChild?.dataset?.type===e.dataset.icon)return;e.innerHTML='';const c=icon(e.dataset.icon);c.dataset.type=e.dataset.icon;e.append(c);});")
s=s.replace("function iconHTML(n){const c=icon(n);", "function iconHTML(n){")
s=s.replace("function save(){if(!started)return;", "function save(){if(!started||previewMode)return;").replace("JSON.stringify(game.state)","JSON.stringify(game.serialize())")
s=s.replace("const img=AS()[b.id]||'';", "const img=buildingImg(b.id);")
s=s.replace("${AS()[b.id]?`<img src=\"${AS()[b.id]}\" alt=\"\">`:`<div class=\"building-art\">${iconHTML(b.type)}</div>`}", "<img src=\"${buildingImg(b.id)}\" alt=\"${b.name}\">")
start=s.index('function paintPortraits()');end=s.index('\nfunction paintQuest',start)
s=s[:start]+'''function paintPortraits(){document.querySelectorAll('[data-portrait]').forEach(e=>{const h=game.state.hunters.find(v=>v.id===e.dataset.portrait);if(!h)return;e.src=portrait(h);});}
'''+s[end:]
start=s.index('function portrait(h)');end=s.index('\nfunction openModal',start)
s=s[:start]+'''function portrait(h){const key=h.classId+':'+h.rarity;if(portraitCache[key])return portraitCache[key];const c=document.createElement('canvas');c.width=84;c.height=96;drawPortrait(c,h,{scale:2.7});return portraitCache[key]=c.toDataURL();}
'''+s[end:]
s=s.replace("selected=null,portraitCache={}","selected=null,portraitCache={}")
s=s.replace("const names={build:","const names={worldmap:'主世界地圖 · 三倍探索面積',build:")
s=s.replace("$('#modal-content').innerHTML=modalHTML(type);setIcons", "$('#modal-content').innerHTML=modalHTML(type);if(type==='worldmap')paintMap($('#world-map-canvas'));setIcons")
mark="function modalHTML(type){const s=game.state;"
s=s.replace(mark,mark+'''
 if(type==='worldmap')return `<div class="world-map-header"><span>主世界 · 8 個區域</span><b>${WORLD.width} × ${WORLD.height} = ${WORLD.area.toLocaleString()} 地圖單位</b></div><canvas id="world-map-canvas" width="760" height="390" aria-label="三倍大主世界區域地圖"></canvas><div class="region-grid">${REGIONS.map(r=>`<article class="region-card ${s.region===r.id?'active':''}" style="--biome:${r.color}"><h3>${r.name}</h3><small>${r.subtitle}</small><p>${r.description}</p><div><button class="pixel-button" data-action="regionView" data-id="${r.id}">查看</button>${r.id!=='village'?`<button class="pixel-button gold" data-action="regionTravel" data-id="${r.id}">前往${r.name}</button>`:''}</div></article>`).join('')}</div><p class="modal-note">參考主世界的生態分區與河流配置。獵人沿橋樑通行；這個版本不含挖掘、放置方塊或無限地形。</p>`;
''')
s=s.replace("function doAction(el){const a=el.dataset.action,id=el.dataset.id;let r;", "function doAction(el){const a=el.dataset.action,id=el.dataset.id;let r;\n if(a==='worldmap')return openModal('worldmap');\n if(a==='worldOverview'){closeModal();world.focus('world');return;}\n if(a==='regionView'){closeModal();world.focus(id==='village'?'home':'region:'+id);return;}\n if(a==='regionTravel'){r=game.exploreRegion(id);logToast(r.message,r.ok);if(r.ok){closeModal();world.focus('region:'+id);save();}paint();return;}")
s=s.replace("if(a==='home'){world?.focus('home');return;}","if(a==='home'){closeModal();world?.focus('home');return;}")
s=s.replace("if(a==='hunter'){selected=id;openHunter(id);return;}", "if(a==='hunter'){openHunter(id);return;}")
s=s.replace("if(e.code==='Space'&&!modal)", "if(e.code==='Space'&&!modal&&started)")
s=s.replace("document.addEventListener('keydown',e=>{", "document.addEventListener('keydown',e=>{if(e.target.matches('input,textarea,select'))return;if(e.key.toLowerCase()==='m'&&started){openModal('worldmap');return;}")
s=s.replace("document.body.dataset.services=s.counts.services;", "document.body.dataset.services=s.counts.services;document.body.dataset.worldArea=WORLD.area;document.body.dataset.region=s.region;const rb=$('#region-badge');if(rb)rb.textContent=(REGIONS.find(r=>r.id===s.region)?.name||'向陽草原')+' · 狩獵中';if($('#minimap-v3'))paintMap($('#minimap-v3'),true);")
s=s.replace("try{return JSON.parse(localStorage.getItem(SAVE_KEY)||'null');}", "try{return previewMode?null:JSON.parse(localStorage.getItem(SAVE_KEY)||'null');}")
s=s.replace("game.state.paused=true;document.querySelector", "game.state.paused=true;if(saved)$('#start-button').innerHTML='繼續村莊生活 <span>▶</span>';document.querySelector")
# Throttle UI and pixels; never advance the simulation in hidden tabs.
s=s.replace("let previous=performance.now();function frame(now){requestAnimationFrame(frame);const dt=Math.min(.1,(now-previous)/1000);previous=now;if(started)game.tick(dt);world.update(dt,game.state);", "let previous=performance.now(),frameTime=0;function frame(now){requestAnimationFrame(frame);if(document.hidden){previous=now;return;}if(now-frameTime<1000/40)return;frameTime=now;const dt=Math.min(.1,(now-previous)/1000);previous=now;if(started)game.tick(dt);world.setTime((game.state.time%240)/240);world.update(game.state.paused?0:dt,game.state);")
s=s.replace("world.setTime(.18);", "world.setTime(.18);window.addEventListener('resize',()=>world.resize());window.addEventListener('pagehide',save);")
mapcode='''
function paintMap(canvas,mini=false){
 if(!canvas)return;const g=canvas.getContext('2d');g.imageSmoothingEnabled=false;const w=canvas.width,h=canvas.height,margin=mini?4:15,sx=(w-margin*2)/WORLD.width,sy=(h-margin*2)/WORLD.height;
 g.fillStyle='#273b35';g.fillRect(0,0,w,h);
 for(let z=WORLD.minZ;z<WORLD.maxZ;z+=1)for(let x=WORLD.minX;x<WORLD.maxX;x+=1){g.fillStyle=BIOME_PALETTE[biomeAt(x,z)];g.fillRect(Math.floor(margin+(x-WORLD.minX)*sx),Math.floor(margin+(z-WORLD.minZ)*sy),Math.ceil(sx),Math.ceil(sy));}
 const to=(x,z)=>[margin+(x-WORLD.minX)*sx,margin+(z-WORLD.minZ)*sy];
 for(const b of BUILDINGS){if(!game.state.buildings[b.id])continue;const p=game.state.layout[b.id],q=to(p.x,p.z);g.fillStyle='#efe1af';g.fillRect(q[0]-3,q[1]-2,6,4);}
 for(const r of REGIONS){const[x,y]=to(r.x,r.z);g.fillStyle=r.id===game.state.region?'#ffe182':'#344634';g.fillRect(x-3,y-3,6,6);if(!mini){g.font='bold 12px Microsoft JhengHei';g.textAlign='center';const tw=g.measureText(r.name).width;g.fillStyle='#233428dd';g.fillRect(x-tw/2-4,y+6,tw+8,19);g.fillStyle='#ffebbd';g.fillText(r.name,x,y+20);}}
 if(mini)for(const h of game.state.hunters){const[x,y]=to(h.x,h.z);g.fillStyle='#fff7da';g.fillRect(x-1,y-1,3,3);}
}
'''
s+=mapcode
p.write_text(s,encoding='utf-8')
p=Path('src/pixel-index.html');s=p.read_text(encoding='utf-8');s=s.replace('<div class="zone-tools">','<div id="region-badge">向陽草原 · 狩獵中</div><button class="world-map-trigger pixel-button gold" data-action="worldmap"><i data-icon="map"></i>主世界地圖 <kbd>M</kbd></button><button class="world-minimap" data-action="worldmap" aria-label="打開三倍大的世界地圖"><canvas id="minimap-v3" width="190" height="136"></canvas><span>主世界 <b>3×</b></span></button><div class="zone-tools">');s=s.replace('建設村莊，照顧獵人，深入魔物盤踞的森林。','重建精緻像素村莊，踏遍三倍大的主世界。');p.write_text(s,encoding='utf-8')
p=Path('src/pixel-world.js');s=p.read_text(encoding='utf-8');s=s.replace("const a=worldPos(x-rx,z),b=worldPos(x,z-rz),c=worldPos(x+rx,z),d=worldPos(x,z+rz)","const a=worldPos(x-rx,z-rz),b=worldPos(x+rx,z-rz),c=worldPos(x+rx,z+rz),d=worldPos(x-rx,z+rz)")
s=s.replace("diamond(gc,x,z,1,.995,col)","diamond(gc,x,z,.51,.51,col)").replace("diamond(gc,x,z,.98,.97,'#79583b')","diamond(gc,x,z,.51,.51,'#79583b')").replace("diamond(gc,x,z,1,.98,inVillage", "diamond(gc,x,z,.52,.52,inVillage")
# Pixel highlights, belts, armor plates and eyes sharpen character silhouettes.
s=s.replace("g.restore();spriteCache.set(key,c);return c;", "pixel(g,10,9,2,1,'#ffe2b1');pixel(g,16,9,2,1,'#ffe2b1');pixel(g,10,20,2,1,p[3]);pixel(g,17,20,2,1,p[0]);pixel(g,12,25,2,1,'#e4ca85');pixel(g,9,28-frame,3,1,'#a49479');pixel(g,16,28+frame,3,1,'#a49479');g.restore();spriteCache.set(key,c);return c;")
s=s.replace("const frame=moving?Math.floor", "const frame=(moving||h.status==='戰鬥中')?Math.floor")
p.write_text(s,encoding='utf-8')
# Embed all per-building assets that were actually generated; no external asset URLs.
p=Path('build.mjs');s=p.read_text(encoding='utf-8');a=s.index("try{const p=await fs.readFile(path.join(root,'assets/title.png'))");b=s.index('\nhtml=html.replace',a)
s=s[:a]+"for(const name of ['title','hall','inn','forge','clinic','tavern']){try{const p=await fs.readFile(path.join(root,`assets/${name}.png`));assetScript+=`window.PIXEL_ASSETS=window.PIXEL_ASSETS||{};window.PIXEL_ASSETS.${name}='data:image/png;base64,${p.toString('base64')}';`;}catch{}}\n"+s[b:];p.write_text(s,encoding='utf-8')
print('World atlas, portraits, assets, region navigation and pixel icon UI integrated.')
