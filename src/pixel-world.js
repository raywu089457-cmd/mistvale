import {getRoads,roadStyle,onRoad,PALISADE,villagePonds as pondsOf,doorFoot} from './landscape-layout.js';
import {RING_ROAD,onRingRoad} from './overworld.js';
import { BUILDINGS, CLASSES, RARITIES, MONSTER_RANGED, MSHOT_IMPACT, SKILLS } from './pixel-data.js';
import {dollActionTick,dollDirName,advanceNoSkip,hurtChain,trackAttackStamp,dollAttackVariant,dollVictoryAction,dollLifeAction,getSlot as dollSlot} from './paperdoll-hero.js';   // DV2 的出招對時/逐格播放 helper(動作時間點照舊);英雄美術本體已換成 HeroLoom
import {createDollHero} from './heroloom-hero.js';   // 預設:HeroLoom 紙娃娃英雄(docs/HEROLOOM.md);?doll=0 回烘好的 sheet
import {createDollHero as createDv2DollHero} from './paperdoll-hero.js';   // ?doll=dv2[:職業,…]:DV2 包(assets/paperdoll-dv2,docs/DV2-PHASE6.md)
import {LOOM_MONSTERS,monsterSheetUrl,loomMonsterMeta} from './heroloom-monsters.js';   // HeroLoom 風格魔物實驗包(?lmob=1;docs/HEROLOOM-MONSTERS.md)
import {rideDepth,mountMotion,dirIndex as dollDirIndex,computeMonsterParts,monsterFrameTick,drawParts as drawDollParts} from './paperdoll.js';   // 騎乘(§20)、單層怪物紙娃娃(§21)   // 紙娃娃英雄(旗標 ?doll=hero,docs/PAPERDOLL.md §12.1)
import {WORLD,REGIONS,biomeAt,BIOME_PALETTE,inVillage} from './overworld.js';
import {conceptGroundAt} from './concept-ground.js';
import {TILE,GRID,STREET_X,STREET_Z,VILLAGE_BOUNDS,blockAt,blockCenter,EXITS,EXIT_GAP} from './village-grid.js';
import {trackImage,markPhase} from './asset-loading.js';
import {pickHeroLine} from './hero-chatter.js';
import {createGLRenderer,tagPattern} from './gl-renderer.js';
import {layoutMapLabels} from './map-labels.js';
import {vdir4,DIR_ACT,dirSuffix,leftRow,facingOk,VDIR_TO_DIR4} from './dir4.js';   // 4 方向(2026-11-13,docs/DV2-ADOPTION-PLAN.md Phase 2)

// All artwork is rendered to a small integer pixel buffer and enlarged without
// interpolation. World coordinates are shared with the village simulation.
const PX = 9, PY = 4.5;
const ATLAS_ORDER = ['hall','trading','restaurant','inn','tavern','clinic','forge','academy','training','sanctuary','house','bounty','enhancement','dungeon','fountain','well'];
const WARRIOR_SHOWCASE_ACTIONS = [
  {act:'idle',label:'待機'}, {act:'walk',label:'移動'},
  {act:'attack',label:'普攻'}, {act:'skill',label:'技能'},
  {act:'hurt',label:'受擊'}, {act:'death',label:'倒下'}, {act:'victory',label:'勝利'},
  {act:'idleDown',label:'正面待機'}, {act:'walkDown',label:'向下移動'},
  {act:'idleUp',label:'背面待機'}, {act:'walkUp',label:'向上移動'},
  {act:'idleLeft',label:'側面待機'}, {act:'walkLeft',label:'側面移動'},
];
const spriteCache = new Map(), buildingCache = new Map();
let partsVisible = true;   // 裝備零件層開關（設定頁可切換，用來驗證換裝機制）
let sharedAtlas = null, atlasAttempt = null;

const makeCanvas = (w,h) => { const c=document.createElement('canvas');c.width=w;c.height=h;return c; };
// 整張 1:1 複製(不受目前的縮放與 DPR 影響)
const copyLayer=(dst,src)=>{dst.save();dst.setTransform(1,0,0,1,0,0);dst.drawImage(src,0,0);dst.restore();};
// 整張直接覆蓋(不疊加),比先清空再畫省一次整張繪製
// 先清空再畫:結果和 'copy' 組合一樣(目的地是透明的),但軟體畫布上 'copy' 慢很多
// 矩形清單(x,y,w,h,…,裝置像素)組成剪裁路徑
const devPath=(ctx,rects)=>{ctx.beginPath();for(let i=0;i<rects.length;i+=4)ctx.rect(rects[i],rects[i+1],rects[i+2],rects[i+3]);};
const copyTo=(dst,src)=>{dst.save();dst.setTransform(1,0,0,1,0,0);dst.globalAlpha=1;dst.clearRect(0,0,dst.canvas.width,dst.canvas.height);dst.drawImage(src,0,0);dst.restore();};
// 靜態裝飾的範圍外加的留白、會動物件的範圍(CSS px,乘上縮放):留白要夠大,才能裝下貼圖以外的小細節(接觸陰影、血條等)
// 靜態裝飾與建築的範圍留白;會動物件的範圍 [左右, 上, 下](乘上縮放)。數字取自實測的貼圖範圍(英雄左右 ±28、上 −50、下 +5;魔物左右 ±43、上 −82、下 +4,皆以縮放 1.68 量),再加一點餘量
const DECOR_PAD=12,BUILDING_PAD=16,HERO_BOX=[22,36,6],MON_BOX=[30,54,6],DYN_BOX=[30,56,14];
const pixel = (c,x,y,w,h,color) => { c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h)); };
function polygon(c, points, color) { c.fillStyle=color;c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(Math.round(x),Math.round(y)):c.moveTo(Math.round(x),Math.round(y)));c.closePath();c.fill(); }
function line(c,x1,y1,x2,y2,color,width=1) { c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.moveTo(Math.round(x1)+.5,Math.round(y1)+.5);c.lineTo(Math.round(x2)+.5,Math.round(y2)+.5);c.stroke(); }
function rnd(seed) { let a=seed>>>0;return ()=>{a=(1664525*a+1013904223)>>>0;return a/4294967296;}; }
function hash(text) { let h=0;for(const c of String(text))h=(h*31+c.charCodeAt(0))>>>0;return h; }
function shade(hex,n) { const v=parseInt(hex.slice(1),16);return `rgb(${Math.max(0,Math.min(255,(v>>16)+n))},${Math.max(0,Math.min(255,((v>>8)&255)+n))},${Math.max(0,Math.min(255,(v&255)+n))})`; }
function iso(x,z) { return {x:(x-z)*PX,y:(x+z)*PY}; }

// ── 投影陰影(剪影投到地面) ─────────────────────────────────────────────
// 概念圖的光從右上方來:人物、建築、樹、道具的影子一律往「左、略下」落,冷紫灰、離地越高越淡。
// 每個圖(或圖集格)算一次:每個不透明像素離地高 h → 落在 (x − h·SX, 地面 + h·SY)。
// grounded=true(人物、怪物、樹、旗桿):整張圖只有一個地面(最底列),武器、樹冠的影子才會落在地上;
// grounded=false(建築、圍籬、攤位):每一欄最低的像素是地面,牆腳沿著等角斜邊。
const SHADOW_SX=.62,SHADOW_SY=.2,SHADOW_RGB=[34,26,58];
const shadowCache=new WeakMap();
// 手機/平板(觸控)省記憶體(2026-10-26 真機 iPhone 卡頓):createWorld 依 coarsePointer 設定。
// 影響:不用 2x 英雄表(heroHiAllowed)、影子用一半解析度、影子與換色格的記憶體上限較小。
let lowMemDevice=false;
// 影子快取有上限(以前永遠不清:手機模擬玩 2 分鐘 941 張≈95 MB 還在長)。全部影子排一條 LRU,
// 總像素超過上限就丟最久沒畫到的(之後又用到再算一次)。上限:桌機 3200 萬像素(≈128 MB,實測 2 分鐘約用 2400 萬)、手機 600 萬(半解析度約 1000 張)。
const shadowLru=new Map();let shadowPx=0,shadowMade=0;
// GL 模式(預設;?renderer=2d 關閉):快取丟掉的畫布要一併釋放 GPU 材質(createWorld 設定;2D 模式是 null)
let texRelease=null;
const SHADOW_BUDGET=()=>lowMemDevice?6e6:32e6;
function shadowTouch(r){shadowLru.delete(r);shadowLru.set(r,1);}
function shadowFor(img,sx,sy,sw,sh,flip,wpp,grounded,capWorld){
  let m=shadowCache.get(img);if(!m){m=new Map();shadowCache.set(img,m);}
  const key=`${sx},${sy},${sw},${sh},${flip?1:0},${wpp},${grounded?1:0},${capWorld}`;let r=m.get(key);if(r){shadowTouch(r);return r;}
  // 影子用最長邊 ≤128px 的縮小版算(Xilurus 圖集一格 250–350px,畫面上只有 40–60px):
  // 原尺寸影子每幀被大幅縮小重畫,桌機 30→23fps;影子本來就是半透明剪影,縮小看不出差別。
  // 手機再減半(最長邊 ≤64px):影子是半透明剪影、畫面上只有幾十個像素,記憶體與計算都變 1/4。
  const f=Math.min(1,(lowMemDevice?64:128)/Math.max(sw,sh)),SW=sw,SH=sh;sw=Math.max(2,Math.round(sw*f));sh=Math.max(2,Math.round(sh*f));wpp/=sw/SW;
  const src=makeCanvas(sw,sh),sc=src.getContext('2d',{willReadFrequently:true});sc.drawImage(img,sx,sy,SW,SH,0,0,sw,sh);
  const a=sc.getImageData(0,0,sw,sh).data,cap=capWorld/wpp,ex=Math.ceil(cap*SHADOW_SX)+2,ey=Math.ceil(cap*SHADOW_SY)+2,W=sw+ex,H=sh+ey,out=new Uint8ClampedArray(W*H);
  const base=new Int32Array(sw).fill(-1);let bottom=-1;
  for(let x=0;x<sw;x++)for(let y=sh-1;y>=0;y--)if(a[(y*sw+x)*4+3]>40){base[x]=y;if(y>bottom)bottom=y;break;}
  for(let X=0;X<sw;X++){const x=flip?sw-1-X:X,b=grounded?bottom:base[x];if(b<0)continue;
    for(let y=0;y<=b;y++){if(a[(y*sw+x)*4+3]<=40)continue;const h=b-y;if(h>cap)continue;
      const dx=Math.round(X+ex-h*SHADOW_SX),dy=Math.round(b+h*SHADOW_SY),v=255*(1-.72*h/cap),i=dy*W+dx;
      if(dy>=0&&dy<H&&dx>=0&&dx<W-1){if(v>out[i])out[i]=v;if(v>out[i+1])out[i+1]=v;}}}
  // 影子是逐像素投影,斜向取樣有時會漏掉像素、留下細條紋(例:地下城入口在亮草地上的影子)。
  // 上下或左右都有影子的 1 像素空洞,補成鄰居平均;輪廓本來的凹陷(兩側無影子)不受影響。
  {const src=out.slice();for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){const i=y*W+x;if(src[i])continue;const u=src[i-W],d=src[i+W],l=src[i-1],r=src[i+1];
    if((u&&d)||(l&&r)){let s=0,n=0;if(u){s+=u;n++;}if(d){s+=d;n++;}if(l){s+=l;n++;}if(r){s+=r;n++;}out[i]=s/n;}}}
  const cv=makeCanvas(W,H),cx=cv.getContext('2d'),id=cx.createImageData(W,H);
  for(let i=0;i<out.length;i++){if(!out[i])continue;id.data[i*4]=SHADOW_RGB[0];id.data[i*4+1]=SHADOW_RGB[1];id.data[i*4+2]=SHADOW_RGB[2];id.data[i*4+3]=out[i];}
  cx.putImageData(id,0,0);r={cv,ex,W,H,sw,m,key};m.set(key,r);
  shadowLru.set(r,1);shadowPx+=W*H;shadowMade++;
  while(shadowPx>SHADOW_BUDGET()&&shadowLru.size>1){const old=shadowLru.keys().next().value;shadowLru.delete(old);old.m.delete(old.key);shadowPx-=old.W*old.H;texRelease?.(old.cv);}
  return r;
}
globalThis.__mistvaleShadows=()=>({n:shadowLru.size,mpx:+(shadowPx/1e6).toFixed(2),budget:SHADOW_BUDGET()/1e6,made:shadowMade});

function heroSprite(classId='berserker',frame=0,facing=1,variant=0,lodScale=heroLodScale,pose='idle') {
  heroUse.calls++;
  // 新規格英雄:立繪/路人/殘影用待機第 1 格,裁到身體(畫布比例 28:35 跟舊圖一樣,drawPortrait 不變形)
  if(heroSheets[classId]){const key=`sheet:${classId}:${facing}`;if(spriteCache.has(key))return spriteCache.get(key);
    const f=sheetFrame(classId,'idle',0),H=f.meta.heroHeight+4,W=Math.round(H*28/35),c=makeCanvas(W,H),g=c.getContext('2d');g.imageSmoothingEnabled=false;
    g.save();if(facing<0){g.translate(W,0);g.scale(-1,1);}g.drawImage(f.img,f.sx+f.c/2-W/2,f.sy+f.foot-H+1,W,H,0,0,W,H);g.restore();c.baseH=H;heroUse.atlas++;spriteCache.set(key,c);return c;}
  const hf=heroFrameFor(classId,lodScale);
  // 戰鬥姿勢圖(heropose 圖集,<職業>_windup/_strike/_hurt):倍率跟待機圖同一個,腳底(foot)對齊畫布中線,
  // 武器往外伸就把畫布加寬,人不會因為姿勢不同而忽大忽小。沒有姿勢圖就用待機圖。
  // 待機也走同一條路(同一個倍率、同一個軀幹錨點):以前待機是「塞進 40 寬畫布置中」,寬武器職業的待機會被縮小、換姿勢時身體左右跳。
  const pf=hf?(pose!=='idle'&&heroFrameFor(`${classId}_${pose}`,lodScale))||(hf.cell.foot!=null?hf:null):null,idleBob=pose==='idle'&&frame?1:0;
  if(pf&&pf.sc===hf.sc){const key=`${classId}:${pose}:${facing}:${variant%3}:${pf.sc}:${idleBob}`;if(spriteCache.has(key))return spriteCache.get(key);
    const cell=pf.cell,res=pf.sc,H0=35*res,k=(H0-res)/hf.cell.h,dw=Math.max(1,Math.round(cell.w*k)),dh=Math.max(1,Math.round(cell.h*k)),fx=(cell.foot??cell.w/2)*k;
    // 畫布高要放得下最高的姿勢(歡呼舉手/舉劍比站姿高 2–10px),不然頭頂被畫布切掉;
    // 倍率不變(跟站姿同像素密度),只是畫布比較高,所以角色不會忽大忽小。
    const H=Math.max(H0,dh+res);
    const half=Math.ceil(Math.max(20*res,fx,dw-fx)),c=makeCanvas(half*2,H),g=c.getContext('2d');g.imageSmoothingEnabled=false;g.save();if(facing<0){g.translate(c.width,0);g.scale(-1,1);}
    g.drawImage(pf.img,cell.x,cell.y,cell.w,cell.h,Math.round(half-fx),H-dh-idleBob*res,dw,dh);g.restore();
    g.globalCompositeOperation='source-atop';g.fillStyle=HERO_TINT[variant%3];g.fillRect(0,0,c.width,c.height);c.baseH=H0;heroUse.atlas++;spriteCache.set(key,c);return c;}
  // key 要帶 LOD —— 不然放大後快取裡還是 1x 的圖,2x 永遠用不到。
  const key=`${classId}:${frame}:${facing}:${variant%3}:${hf?hf.sc:0}`;
  if(spriteCache.has(key))return spriteCache.get(key);
  // ── 圖集優先 ────────────────────────────────────────────────────────
  // 28x35 是遊戲既定的角色畫布;把出土角色 contain 進去、底部對齊(腳 = 基準線),
  // frame 1 往上 1px 做走路起伏。variant 用一層極淡的染色保留「同職業不同人」的差異。
  // 圖集還沒載完時 heroFrameFor 回 null,自動退回下面的程序繪製。
  if(hf){
    // 畫布 40×35:拿大武器的角色以高度對齊,不被寬度壓小(繪製時寬度跟著畫布比例走)。
    const cell=hf.cell,resolution=hf.sc,c=makeCanvas(40*resolution,35*resolution),g=c.getContext('2d');
    g.imageSmoothingEnabled=false;
    const k=Math.min(c.width/cell.w,(c.height-resolution)/cell.h);
    const dw=Math.max(1,Math.round(cell.w*k)),dh=Math.max(1,Math.round(cell.h*k));
    g.save();
    if(facing<0){g.translate(c.width,0);g.scale(-1,1);}
    g.drawImage(hf.img,cell.x,cell.y,cell.w,cell.h,
                Math.round((c.width-dw)/2),c.height-dh-(frame?resolution:0),dw,dh);
    g.restore();
    g.globalCompositeOperation='source-atop';
    g.fillStyle=HERO_TINT[variant%3];g.fillRect(0,0,c.width,c.height);
    g.globalCompositeOperation='source-over';
    c.baseH=35*resolution;heroUse.atlas++;spriteCache.set(key,c);return c;
  }
  // 沒有任何程序繪製 fallback(sprites/ 管線是角色素材的唯一來源):
  // 圖集缺漏就回一張空的透明畫布 —— 寧可看不到角色,也不要畫出跟新規格不一致的舊圖。
  heroUse.missing++;
  const c=makeCanvas(28,35);c.baseH=35;spriteCache.set(key,c);return c;
}

export function spriteDataURL(classId='berserker',rarity='normal') {
  const c=makeCanvas(84,90),g=c.getContext('2d');g.imageSmoothingEnabled=false;
  const color=RARITIES.find(r=>r.id===rarity)?.color||'#c6bb9c';
  const sprite=heroSprite(classId,0,1,hash(classId)%3,2.5);g.fillStyle=color+'20';g.fillRect(4,4,76,80);g.drawImage(sprite,0,0,sprite.width,sprite.height,7,-4,70,87.5);return c.toDataURL();
}
let dollPortraitSource=null;   // createWorld 裡的紙娃娃(createDollHero);立繪跟遊戲內用同一套
export function drawPortrait(canvas,hunter={},options={}) {
  const g=canvas.getContext('2d');g.imageSmoothingEnabled=false;g.clearRect(0,0,canvas.width,canvas.height);
  // 紙娃娃立繪:正面待機第 0 格,裁法跟 sheet 立繪一樣(站高 + 6、寬 0.8 倍),所以 UI 版面不用改
  if(dollPortraitSource?.on&&dollPortraitSource.covers(hunter.classId)){const c=dollPortraitSource.compose(hunter,{action:'idle',tick:0,dir:'down',globalTick:0,portrait:true});
    // 包有給 portraitHeight 就用它(帽尖不會被切);沒有就照舊 heroHeight+6
    if(c){const H=c.portraitHeight||c.heroHeight+6,s=Math.min(canvas.width/(H*.8),canvas.height/H);
      g.drawImage(c.cv,c.footX-H*.4,c.footY-H+2,H*.8,H,Math.round((canvas.width-H*.8*s)/2),Math.round(canvas.height-H*s),Math.round(H*.8*s),Math.round(H*s));return;}}
  if(heroSheets[hunter.classId]){const f=sheetFrame(hunter.classId,'idle',0,hunter.id?heroLook(hunter):null),H=f.meta.heroHeight+6,s=Math.min(canvas.width/(H*.8),canvas.height/H);  // 新規格英雄:用自己的換色版待機格
    g.drawImage(f.img,f.sx+f.c/2-H*.4,f.sy+f.foot-H+2,H*.8,H,Math.round((canvas.width-H*.8*s)/2),Math.round(canvas.height-H*s),Math.round(H*.8*s),Math.round(H*s));return;}
  if(pendingHero(hunter.classId))return;
  const s=options.scale||Math.min(canvas.width/28,canvas.height/34);g.drawImage(heroSprite(hunter.classId,0,1,hash(hunter.id||hunter.classId)%3,s),Math.round((canvas.width-28*s)/2),Math.round(canvas.height-34*s),28*s,35*s);
}

function window(g,x,y,w=7,h=8) {pixel(g,x-1,y-1,w+2,h+2,'#493830');pixel(g,x,y,w,h,'#344e62');pixel(g,x+1,y+1,w-2,h-2,'#eab967');pixel(g,x+1,y+1,2,h-2,'#ffe0a1');pixel(g,x+Math.floor(w/2),y,1,h,'#71533b');pixel(g,x,y+Math.floor(h/2),w,1,'#71533b');pixel(g,x-2,y+h,w+4,2,'#78583b');}
function barrel(g,x,y) {pixel(g,x+1,y,7,1,'#453529');pixel(g,x,y+1,9,9,'#735132');pixel(g,x+1,y+1,7,8,'#aa7946');pixel(g,x+2,y+2,2,7,'#c69154');pixel(g,x,y+3,9,2,'#5a5b52');pixel(g,x,y+7,9,2,'#53554e');pixel(g,x+1,y+10,7,1,'#433527');}
function crate(g,x,y) {pixel(g,x,y,10,9,'#49392e');pixel(g,x+1,y+1,8,7,'#b18b55');pixel(g,x+2,y+2,6,5,'#775d3e');line(g,x+1,y+1,x+8,y+7,'#c9a471',2);pixel(g,x,y+4,10,1,'#c7a16a');}
function stone(g,x,y,w,h) {pixel(g,x,y,w,h,'#555858');pixel(g,x+1,y,w-2,h-1,'#96988b');pixel(g,x+1,y,w-2,1,'#c1c0aa');pixel(g,x,y+h-1,w,1,'#6d746d');}
function buildingSprite(id) {
  if(buildingCache.has(id))return buildingCache.get(id);
  const b=BUILDINGS.find(v=>v.id===id)||{roof:'#68a3b6'},c=makeCanvas(90,91),g=c.getContext('2d');g.imageSmoothingEnabled=false;
  const r=rnd(hash(id)+47),outline='#3c352f',roof=b.roof;
  // Foundation has a hard pixel outline, carved stone footing, and little props.
  polygon(g,[[7,69],[47,57],[85,69],[45,85]],'#42584466');
  polygon(g,[[13,59],[54,53],[77,66],[36,79]],'#535949');
  polygon(g,[[14,57],[55,50],[77,63],[36,76]],'#b4ad8c');
  for(let i=0;i<22;i++){const x=17+r()*55,y=61+r()*11;pixel(g,x,y,3+r()*3,1,'#92987d');}
  if(id==='training') {
    polygon(g,[[13,56],[51,45],[77,60],[39,74]],'#7c6647');polygon(g,[[15,54],[50,44],[75,58],[40,71]],'#a78e5f');
    for(const[x,y]of[[28,43],[56,52]]){pixel(g,x,y-15,3,24,'#49392b');pixel(g,x-7,y-11,17,3,'#64462e');pixel(g,x-3,y-18,9,9,'#ae9d68');pixel(g,x-2,y-17,7,7,'#dbc088');pixel(g,x-1,y-13,1,1,'#463c31');pixel(g,x+4,y-13,1,1,'#463c31');pixel(g,x-6,y-7,15,10,'#977f52');pixel(g,x-4,y-5,11,6,'#c4a876');pixel(g,x-1,y-5,2,6,'#886c44');}
    pixel(g,17,35,3,32,'#5b432c');pixel(g,18,35,1,30,'#b88a4a');polygon(g,[[20,36],[35,39],[20,45]],'#c16049');pixel(g,23,39,6,2,'#e2b865');crate(g,64,65);barrel(g,12,64);
  } else if(id==='dungeon') {
    polygon(g,[[10,67],[14,39],[26,24],[47,17],[69,33],[78,64],[58,75],[31,76]],outline);
    polygon(g,[[12,64],[17,39],[29,27],[48,20],[66,35],[75,64],[57,71],[31,73]],'#737a72');
    polygon(g,[[17,49],[25,34],[45,24],[42,42],[30,47],[23,67]],'#979a85');polygon(g,[[47,25],[62,38],[70,63],[60,66],[56,45]],'#535e60');
    polygon(g,[[28,66],[29,46],[37,37],[50,35],[60,43],[64,65]],'#333946');polygon(g,[[32,64],[33,47],[40,41],[50,40],[57,46],[60,64]],'#1d2433');
    polygon(g,[[36,65],[39,49],[45,43],[51,49],[56,64]],'#432e58');pixel(g,40,48,12,17,'#352644');pixel(g,42,49,7,14,'#745290');pixel(g,44,53,3,10,'#bd83d1');
    for(let i=0;i<6;i++)stone(g,31+i*5,66+i%2,6,3);pixel(g,19,52,2,12,'#4a3328');pixel(g,18,49,4,5,'#e59243');pixel(g,19,48,2,5,'#ffe5a1');pixel(g,65,53,2,11,'#4a3328');pixel(g,64,49,4,5,'#dd7442');pixel(g,65,48,2,5,'#ffdfa0');
  } else if(id==='fountain') {
    polygon(g,[[20,63],[41,52],[69,62],[69,69],[46,81],[20,71]],'#53676a');polygon(g,[[19,59],[41,49],[70,60],[70,66],[45,78],[19,67]],'#bbc1ac');polygon(g,[[23,60],[42,52],[66,61],[45,71]],'#62aeb8');polygon(g,[[26,62],[44,54],[62,61],[45,69]],'#8ed0d2');pixel(g,42,34,6,28,'#6e8790');pixel(g,43,35,3,23,'#c1cab2');polygon(g,[[31,37],[44,30],[59,37],[58,41],[45,47],[32,41]],'#a9b6a7');polygon(g,[[34,36],[45,32],[56,36],[45,41]],'#80c5cc');pixel(g,44,21,3,15,'#99d5db');pixel(g,43,21,5,2,'#edf2d5');pixel(g,39,40,2,17,'#addae1');pixel(g,53,40,2,16,'#c3eef1');
  } else if(id==='well') {
    polygon(g,[[29,60],[43,54],[59,61],[59,72],[44,79],[28,71]],'#545d58');polygon(g,[[30,60],[43,56],[57,61],[43,67]],'#adb8a2');polygon(g,[[35,61],[43,58],[52,61],[44,64]],'#364d59');pixel(g,31,34,3,29,'#644a32');pixel(g,54,35,3,29,'#644a32');pixel(g,32,36,2,27,'#b18a55');pixel(g,55,36,1,27,'#b18a55');polygon(g,[[23,35],[43,20],[65,35],[62,39],[41,28],[25,40]],'#414d48');polygon(g,[[25,34],[43,23],[62,34],[58,35],[43,27],[28,38]],'#759785');pixel(g,32,43,23,3,'#9a7546');line(g,45,45,45,64,'#cfb37e');
  } else if(id==='sanctuary') {
    stone(g,23,60,45,10);stone(g,29,54,34,8);polygon(g,[[33,54],[34,27],[46,20],[57,28],[58,55],[45,62]],outline);polygon(g,[[36,29],[46,24],[54,30],[55,53],[46,58],[36,53]],'#9da9a7');polygon(g,[[38,31],[46,27],[51,32],[52,50],[46,54],[39,50]],'#c9d0bd');pixel(g,43,13,6,29,'#dee3ca');pixel(g,36,22,21,6,'#e7e5c8');pixel(g,43,14,2,25,'#fff7d8');pixel(g,48,15,1,26,'#91a9ad');polygon(g,[[24,57],[29,53],[34,57],[33,63],[27,65]],'#50849a');polygon(g,[[60,57],[65,53],[70,57],[69,63],[63,65]],'#50849a');pixel(g,27,46,2,13,'#d1ba89');pixel(g,26,45,4,3,'#ffdc88');pixel(g,63,46,2,13,'#d1ba89');pixel(g,62,45,4,3,'#ffdc88');
  } else {
    const isHall=id==='hall',isShop=['trading','restaurant','tavern'].includes(id),w=isHall?49:44,top=isHall?28:34,left=18,right=left+w,front=68,side=11;
    // Plaster and timber-frame walls with a visible side plane.
    polygon(g,[[left,top],[right,top-4],[right,front-5],[left,front]],outline);
    polygon(g,[[right,top-4],[right+side,top+3],[right+side,front+2],[right,front-5]],'#80664c');
    polygon(g,[[left+2,top+1],[right-1,top-2],[right-1,front-6],[left+2,front-2]],'#ddca98');
    polygon(g,[[right+1,top],[right+side-2,top+4],[right+side-2,front-1],[right+1,front-6]],'#b89b6c');
    for(let y=top+4;y<front-4;y+=5){line(g,left+3,y,right-2,y-3,'#cfb786');if(y%2)pixel(g,left+6,y,5,1,'#eee1b5');}
    pixel(g,left+1,top+1,3,front-top-2,'#6c4e35');pixel(g,right-4,top,3,front-top-6,'#634632');line(g,left+3,front-12,right-2,front-15,'#785639',2);line(g,right+1,top+2,right+side-2,top+8,'#684b35',2);
    // Deep eaves and tile rows, hand-placed light and dark shingle clusters.
    polygon(g,[[left-7,top+2],[left+12,top-25],[right-5,top-27],[right+side+4,top+4],[right+2,top+7],[left+12,top-14],[left-3,top+8]],outline);
    polygon(g,[[left-5,top+1],[left+13,top-23],[right-6,top-25],[right+2,top+2],[left+13,top-16],[left-2,top+5]],shade(roof,-22));
    polygon(g,[[left-4,top],[left+13,top-22],[right-6,top-24],[right-13,top-1]],roof);
    polygon(g,[[right-6,top-24],[right+side+2,top+3],[right+3,top+5],[right-13,top-1]],shade(roof,-28));
    for(let row=0;row<6;row++){const y=top-19+row*4,l=left+11-row*3,rr=right-8-row;line(g,l,y,rr,y-2,shade(roof,row%2?14:-20));for(let x=l+3+(row%2)*3;x<rr;x+=7)pixel(g,x,y-2,1,3,shade(roof,-31));}
    line(g,left+13,top-23,right-6,top-25,shade(roof,57),2);line(g,left-4,top+1,right-14,top-1,shade(roof,22),2);
    // Individually shaded terracotta/slate shingles on the front roof plane.
    const roofPts=[[left-4,top],[left+13,top-22],[right-6,top-24],[right-13,top-1]];
    const inRoof=(x,y)=>{let hit=false;for(let i=0,j=3;i<4;j=i++){const a=roofPts[i],b=roofPts[j];if(((a[1]>y)!==(b[1]>y))&&(x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]))hit=!hit;}return hit;};
    for(let yy=top-23;yy<top;yy++)for(let xx=left-3;xx<right-5;xx++)if(inRoof(xx,yy)){const row=Math.floor((yy-top+24)/4),v=((xx+row*3)%7+7)%7,edge=(yy-top+24)%4;const light=edge===0?35:edge===3?-32:v===0?-24:v===1?17:((xx*13+yy*7)%9)-4;pixel(g,xx,yy,1,1,shade(roof,light));}
    for(let yy=front-10;yy<front;yy+=4)for(let xx=left+2;xx<right-3;xx+=8){if(xx>left+14&&xx<left+31)continue;pixel(g,xx,yy,7,3,'#8c8c77');pixel(g,xx,yy,7,1,'#c8bda0');pixel(g,xx+1,yy+1,4,1,'#a6a18a');}
    pixel(g,left+5,front-8,2,7,'#506b39');pixel(g,left+3,front-7,5,2,'#87a458');pixel(g,left+5,front-4,5,2,'#a1b971');pixel(g,left+7,front-9,2,2,'#e1af9d');
    // Chimney masonry.
    pixel(g,right-5,top-26,7,15,outline);pixel(g,right-4,top-26,5,13,'#a9876f');pixel(g,right-6,top-28,9,3,'#594e45');pixel(g,right-5,top-28,7,1,'#d0b699');pixel(g,right-4,top-22,4,1,'#6c584a');pixel(g,right-4,top-17,4,1,'#6c584a');
    // Door and tiny amber windows.
    pixel(g,left+17,front-20,13,20,outline);pixel(g,left+18,front-19,11,18,'#987044');pixel(g,left+19,front-18,3,17,'#ba9056');pixel(g,left+24,front-17,1,14,'#624a35');pixel(g,left+27,front-10,1,2,'#e4c774');stone(g,left+15,front-1,17,4);stone(g,left+13,front+3,21,3);
    window(g,left+6,front-24,7,8);window(g,right-13,front-27,7,8);
    if(isHall){pixel(g,left+17,top+1,12,14,'#705337');window(g,left+19,top+3,8,9);pixel(g,left+22,top-24,2,12,'#6b4f37');polygon(g,[[left+24,top-24],[left+35,top-21],[left+24,top-17]],'#edbc52');pixel(g,left+26,top-22,2,2,'#fff1a3');}
    if(isShop){const awning=id==='trading'?'#769646':id==='restaurant'?'#d58844':'#a97084';polygon(g,[[left+2,front-29],[right-4,front-32],[right,front-22],[left-2,front-19]],outline);polygon(g,[[left+3,front-28],[right-4,front-30],[right-1,front-23],[left,front-21]],awning);for(let x=left+3;x<right-4;x+=9)polygon(g,[[x,front-28-(x-left)/15],[x+4,front-28-(x-left)/15],[x+4,front-21-(x-left)/15],[x,front-21-(x-left)/15]],'#ecd69e');pixel(g,left-1,front-20,2,18,'#66472e');pixel(g,right-1,front-23,2,17,'#66472e');}
    // Signboards let players distinguish facilities at a glance.
    pixel(g,right+4,front-26,2,16,'#56422e');pixel(g,right+2,front-27,11,2,'#56422e');pixel(g,right+7,front-26,1,4,'#514b42');pixel(g,right+2,front-22,13,10,outline);pixel(g,right+3,front-21,11,8,'#bd9556');
    const sx=right+5,sy=front-20;
    if(id==='clinic'){pixel(g,sx+3,sy,2,6,'#a44340');pixel(g,sx+1,sy+2,6,2,'#a44340');}
    else if(id==='forge'||id==='enhancement'){pixel(g,sx+1,sy+1,7,2,'#4c5050');pixel(g,sx+3,sy+3,3,2,'#4c5050');pixel(g,sx+1,sy+5,7,1,'#4c5050');}
    else if(id==='inn'||id==='house'){pixel(g,sx+1,sy+3,7,2,'#537b91');pixel(g,sx+1,sy+1,2,5,'#e4dfbb');pixel(g,sx+7,sy+3,1,3,'#e4dfbb');}
    else if(id==='academy'){pixel(g,sx+1,sy+1,7,5,'#614e80');pixel(g,sx+4,sy+1,1,5,'#e4ddb2');}
    else if(id==='bounty'){pixel(g,sx+2,sy,5,7,'#efe3ae');pixel(g,sx+3,sy+2,3,1,'#876446');pixel(g,sx+3,sy+4,2,1,'#876446');}
    else if(id==='restaurant'){pixel(g,sx+1,sy+2,7,4,'#e3b760');pixel(g,sx+2,sy+1,5,1,'#fbdaa0');pixel(g,sx+3,sy+3,1,2,'#bd8040');pixel(g,sx+6,sy+2,1,2,'#bd8040');}
    else {pixel(g,sx+2,sy+1,5,5,'#e7c157');pixel(g,sx+3,sy+2,3,3,'#9a6a3d');}
    barrel(g,left-9,front-1);crate(g,right+1,front+2);
    if(id==='forge'||id==='enhancement'){pixel(g,left-10,front-14,13,10,'#4b4740');pixel(g,left-9,front-13,11,8,'#86644a');pixel(g,left-7,front-11,7,5,'#e47b37');pixel(g,left-5,front-10,3,4,'#ffcb63');pixel(g,left-12,front-5,17,2,'#454b4c');pixel(g,left-8,front-3,9,4,'#687678');}
    if(id==='restaurant'){pixel(g,left-4,front+7,12,3,'#8b6740');pixel(g,left-3,front+10,2,3,'#59432e');pixel(g,left+5,front+10,2,3,'#59432e');pixel(g,left-2,front+4,4,3,'#c99542');pixel(g,left+3,front+5,3,2,'#e6b85d');}
    if(id==='academy'){pixel(g,9,51,3,15,'#75604a');pixel(g,7,48,7,5,'#b783c9');pixel(g,9,46,3,3,'#efc0ed');}
    for(const[x,y]of[[left-5,front+11],[right-6,front+8]]){pixel(g,x,y,8,3,'#615237');pixel(g,x+1,y-4,6,4,'#598047');pixel(g,x+2,y-6,2,3,'#89a959');pixel(g,x+5,y-5,2,2,id==='clinic'?'#dedcab':'#d99a94');}
  }
  for(let i=0;i<14;i++){const x=18+r()*45,y=57+r()*9;pixel(g,x,y,2,1,'#b39a70');}buildingCache.set(id,c);return c;
}

function atlasCell(id) { return sharedAtlas?.get(id)||null; }
export function buildingDataURL(id) {
  const concept=atlasCell(id);
  if(concept)return concept.toDataURL();
  // 縮圖要 2x:卡片 <img> 用瀏覽器預設平滑縮放,來源大一點比較清楚。
  const lod=atlasFrameFor(id,true);
  if(!lod)return buildingSprite(id).toDataURL();
  if(lod.scale===2)atlasUse.thumb2x++;else atlasUse.thumb1x++;
  const c=lod.frames[id],out=makeCanvas(c.w,c.h);
  out.getContext('2d').drawImage(lod.img,c.x,c.y,c.w,c.h,0,0,c.w,c.h);
  return out.toDataURL();
}
// ── 角色圖集(六職業) ─────────────────────────────────────────────────
// heroSprite() 是遊戲唯一的角色取圖入口,所以在它裡面加「圖集優先」分支就好,
// 其餘程式碼(獵人、死亡姿勢、縮圖、立繪)一行都不用改。
const heroAtlasLod=[];
// heroSprite 在模組層,看不到閉包裡的 scale —— 用這個模組層變數由 update() 更新。
// (踩過兩次同樣的坑:h is not defined / scale is not defined)
let heroLodScale=1;
// 「正在操作」= 手指拖動/雙指縮放/滾輪/縮放按鈕。操作中不做會卡頓的背景工作(解碼高解析圖、預生成變體),
// 這些工作等手停下來(<260 ms 無輸入)才跑,縮放的每一幀就只剩繪製。
let lastInputAt=-1e9;
const markInput=()=>{lastInputAt=performance.now();};
const interacting=()=>performance.now()-lastInputAt<260;
const heroUse={calls:0,atlas:0,missing:0};
const HERO_TINT=['rgba(255,225,190,.10)','rgba(190,215,255,.10)','rgba(255,200,215,.10)'];
function heroFrameFor(classId,sc){
  const pick=sc>=4.4?4:sc>=2.2?2:1;  // 每邏輯像素的裝置像素數 → 1x/2x/4x
  let alt=null;
  for(const lod of heroAtlasLod){
    const cell=lod.frames[classId];
    if(!cell)continue;
    if(lod.scale===pick)return {img:lod.img,cell,sc:lod.scale};
    if(!alt)alt={img:lod.img,cell,sc:lod.scale};
  }
  return alt;
}
function ensureHeroAtlas(){
  markPhase('角色');
  const assets=globalThis.PIXEL_ASSETS||{};
  for(const [sheetKey,manKey] of [['heroAtlas','heroManifest'],['heroAtlas2x','heroManifest2x'],['heroposeAtlas','heroposeManifest'],['heroposeAtlas2x','heroposeManifest2x'],['heroAtlas4x','heroManifest4x'],['heroposeAtlas4x','heroposeManifest4x']]){
    if(!assets[sheetKey]||!assets[manKey]||loadedAssetKeys.has(sheetKey))continue;
    loadedAssetKeys.add(sheetKey);
    const m=(typeof assets[manKey]==='string')?JSON.parse(assets[manKey]):assets[manKey];
    const im=trackImage(new Image());
    im.onload=()=>{heroAtlasLod.push({img:im,scale:m.scale>=0.5?4:m.scale>=0.2?2:1,frames:m.cells});
      // spriteCache 只存角色圖。圖集載入前建的程序版會被快取住永遠不換,
      // 所以圖集一到就整批清掉,下一幀全部改用圖集重建。
      spriteCache.clear();heroUse.atlas=heroUse.missing=0;
      globalThis.dispatchEvent(new CustomEvent('pixel-assets-ready'));};
    im.onerror=()=>loadedAssetKeys.delete(sheetKey);
    im.src=assets[sheetKey];
  }
}

// ── 無縫地面材質(整片 pattern,不是逐格貼圖) ─────────────────────────
// 地面材質縮放:1.0 = 一比一。0.5 讓草葉落在 1~3px(跟建築細節同一個量級)。
const TERRAIN_TEX_SCALE=0.29;  // 1 材質像素 = 0.5 邏輯單位:地面美術像素跟英雄(0.62)、建築同一級(pipeline/scripts/check/audit_density.py)
// 垂直壓扁比例。等角理論上是 0.5,但實測草葉會被壓成橫向斑點、看起來像雜訊,
// 所以先用 1(不壓)。要試等角感就把 TERRAIN_TEX_SQUASH 改成 .5。
const TERRAIN_TEX_SQUASH=1;
// 材質疊在生態域底色上的不透明度。1 = 完全用材質,會太吵;
// 保留底色可以讓生態域的色調準確,又不會失去紋理。
const TERRAIN_TEX_ALPHA=.6;
const groundPatterns={};
// 鋪面(石板/土路)垂直壓扁:概念圖是 3/4 俯視,石塊看起來比較扁寬,不是正上方的圓石。
const PAVE_SQUASH=.36;
// 概念圖草地取樣(pipeline/l0veyou.md 有量測方法)。meadow/birch 比村莊亮一階,保留生態域差異。
// birch 往概念圖亮草綠 (83,156,61) 靠、收窄標準差:原本亮端 (124,179,75) 跑出色票。
const GRASS_TONE={village:{mean:[70,98,27],sd:[19,20,7]},meadow:{mean:[177,190,63],sd:[32,21,19]},birch:{mean:[190,198,56],sd:[33,21,17]},forest:{mean:[54,42,21],sd:[37,20,9]},taiga:{mean:[56,82,60],sd:[27,25,12]},snow:{mean:[212,223,241],sd:[28,22,19]},mountain:{mean:[106,95,92],sd:[25,23,21]},desert:{mean:[240,179,77],sd:[13,20,15]},river:{mean:[35,152,173],sd:[31,20,9]},ocean:{mean:[35,152,173],sd:[31,20,9]},ice:{mean:[158,201,237],sd:[31,19,8]}};  // Xilurus 材質量測(pipeline/scripts/xilurus/assemble.py tones)
const groundBase=b=>GRASS_TONE[b]?'#'+GRASS_TONE[b].mean.map(v=>v.toString(16).padStart(2,'0')).join(''):BIOME_PALETTE[b];
// 小地圖/世界地圖用同一套對齊概念圖的地面色,地圖跟畫面看起來才是同一個世界。
// 石板/土路色取自 plaza.png、road.png 的取樣平均。
export const MAP_PALETTE=Object.fromEntries(Object.keys(BIOME_PALETTE).map(b=>[b,groundBase(b)]));
export const MAP_ACCENT={grass:'#c6d547',snow:'#dae6f8',desert:'#ffc153',mountain:'#776a67',road:'#be8349',sea:'#1e8193'};
let terrainPatternRev=0,terrainLoadsPending=0;   // 還在載入的地面貼圖數;全部載完才重畫地面,避免每張貼圖各重畫一次
function ensureTerrainAtlas(){
  markPhase('地面材質');
  const assets=globalThis.PIXEL_ASSETS||{};
  if(!assets.terrainAtlas||!assets.terrainManifest||loadedAssetKeys.has('terrainAtlas'))return;
  loadedAssetKeys.add('terrainAtlas');
  const m=(typeof assets.terrainManifest==='string')?JSON.parse(assets.terrainManifest):assets.terrainManifest;
  const im=trackImage(new Image());
  im.onload=()=>{
    terrainLoadsPending--;
    for(const [name,c] of Object.entries(m.cells)){
      const cv=makeCanvas(c.w,c.h),cx=cv.getContext('2d');
      cx.imageSmoothingEnabled=false;
      cx.drawImage(im,c.x,c.y,c.w,c.h,0,0,c.w,c.h);
      // 地面色調對齊概念圖(草地/水/森林地面):title.png 草地像素平均 (66,124,38)。逐通道把材質的平均/標準差
      // 配到 GRASS_TONE,底色也換成同一個平均 → 疊上 TERRAIN_TEX_ALPHA 後整片仍落在概念圖的綠。
      const tone=GRASS_TONE[name];
      if(tone){
        const pixels=cx.getImageData(0,0,c.w,c.h),data=pixels.data,n=data.length/4,mean=[0,0,0],sq=[0,0,0];
        for(let i=0;i<data.length;i+=4)for(let k=0;k<3;k++){mean[k]+=data[i+k];sq[k]+=data[i+k]*data[i+k];}
        const sd=mean.map((m,k)=>Math.sqrt(Math.max(1,sq[k]/n-(m/n)**2)));for(let k=0;k<3;k++)mean[k]/=n;
        for(let i=0;i<data.length;i+=4)for(let k=0;k<3;k++)data[i+k]=Math.max(0,Math.min(255,(data[i+k]-mean[k])/sd[k]*tone.sd[k]+tone.mean[k]));
        cx.putImageData(pixels,0,0);
      }
      groundPatterns[name]=tagPattern(cx.createPattern(cv,'repeat'),cv);   // tagPattern:GL 模式用 pattern 時找得到來源圖
    }
    terrainPatternRev++;   // generateGround 會偵測到這個變化並重畫
    globalThis.dispatchEvent(new CustomEvent('pixel-assets-ready'));
  };
  im.onerror=()=>{loadedAssetKeys.delete('terrainAtlas');terrainLoadsPending--;terrainPatternRev++;};
  terrainLoadsPending++;
  im.src=assets.terrainAtlas;
}
// 廣場石板(l0veyou 生,色調已離線對齊概念圖廣場)。載入後 terrainPatternRev++ 讓地面重畫。
// 土路(road.png)同理:色調對齊概念圖小路取樣 (205,158,78)。
let plazaPattern=null,roadPattern=null;
// 概念圖像素材質(石板/土路/草):原生解析度 3.93 px/世界單位,畫在村莊高解析地面層。
const conceptTex={};
function ensureConceptTextures(){
  const assets=globalThis.PIXEL_ASSETS||{};
  for(const [key,name] of [['conceptStone','stone'],['conceptEarth','earth'],['conceptGrass','grass']]){
    if(!assets[key]||loadedAssetKeys.has(key))continue;loadedAssetKeys.add(key);
    const im=trackImage(new Image());im.onload=()=>{terrainLoadsPending--;conceptTex[name]=im;terrainPatternRev++;globalThis.dispatchEvent(new CustomEvent('pixel-assets-ready'));};
    terrainLoadsPending++;im.onerror=()=>{loadedAssetKeys.delete(key);terrainLoadsPending--;terrainPatternRev++;};im.src=assets[key];
  }
}
function ensurePlazaTile(){
  const assets=globalThis.PIXEL_ASSETS||{};
  for(const key of ['plaza','road']){
    if(!assets[key]||loadedAssetKeys.has(key))continue;
    loadedAssetKeys.add(key);
    const im=trackImage(new Image());
    // 3/4 俯視的壓扁先在載入時用平滑縮放烘進材質,繪製時 1:1 貼上;不然最近鄰的小數縮放會產生摩爾紋斜條。
    im.onload=()=>{terrainLoadsPending--;const h=Math.max(1,Math.round(im.height*PAVE_SQUASH/.5)),cv=makeCanvas(im.width,h),cx=cv.getContext('2d');cx.imageSmoothingEnabled=true;cx.imageSmoothingQuality='high';cx.drawImage(im,0,0,im.width,h);
      const pat=cx.createPattern(cv,'repeat');if(key==='plaza')plazaPattern=pat;else roadPattern=pat;
      terrainPatternRev++;globalThis.dispatchEvent(new CustomEvent('pixel-assets-ready'));};
    im.onerror=()=>{loadedAssetKeys.delete(key);terrainLoadsPending--;terrainPatternRev++;};
    terrainLoadsPending++;
    im.src=assets[key];
  }
}

// ── 地圖細節圖集(樹、岩石、村莊家具) ──────────────────────────────────
// key 就是裝飾型別,剛好 1:1 對上 drawDecoration() 的分支。
const detailLod=[];
const FLOWER_ATLAS=['flowerYellow','flowerPink','flowerBlue','flowerWhite'];
const detailUse={draw1x:0,draw2x:0};
const procUse={};
function detailFrameFor(id,prefer2x){
  if(prefer2x)for(const lod of detailLod)if(lod.scale===2&&lod.frames[id])return lod;
  for(const lod of detailLod)if(lod.frames[id])return lod;
  return null;
}
// 樹冠色調對齊概念圖:只動「綠色葉子」像素(樹幹、外框、雪不動),逐通道配平均/標準差。
// 取樣:概念圖左下與下方松林葉子 (48,115,46)、右上闊葉樹 (87,132,29)(見 pipeline/l0veyou.md)。
const FOLIAGE_TONE={pine:{mean:[46,115,47],sd:[52,44,17]},snowpine:{mean:[46,108,47],sd:[50,42,17]},
  oak:{mean:[87,132,29],sd:[62,48,18]},birch:{mean:[96,136,34],sd:[60,48,18]}};
function toneFoliage(im,cells){
  const cv=makeCanvas(im.width,im.height),cx=cv.getContext('2d');cx.drawImage(im,0,0);
  for(const [id,t] of Object.entries(FOLIAGE_TONE)){const c=cells[id];if(!c)continue;
    const px=cx.getImageData(c.x,c.y,c.w,c.h),d=px.data,idx=[],mean=[0,0,0],sq=[0,0,0];
    for(let i=0;i<d.length;i+=4){if(!d[i+3])continue;const r=d[i],g=d[i+1],b=d[i+2],mx=Math.max(r,g,b),mn=Math.min(r,g,b);
      if(g>=r&&g>b&&mx>30&&(mx-mn)/mx>.25){idx.push(i);for(let k=0;k<3;k++){mean[k]+=d[i+k];sq[k]+=d[i+k]*d[i+k];}}}
    const n=idx.length;if(!n)continue;const sd=mean.map((m,k)=>Math.sqrt(Math.max(1,sq[k]/n-(m/n)**2)));for(let k=0;k<3;k++)mean[k]/=n;
    for(const i of idx)for(let k=0;k<3;k++)d[i+k]=Math.max(0,Math.min(255,(d[i+k]-mean[k])/sd[k]*t.sd[k]+t.mean[k]));
    cx.putImageData(px,c.x,c.y);}
  return cv;
}
function ensureDetailAtlas(){
  markPhase('樹木與道具');
  const assets=globalThis.PIXEL_ASSETS||{};
  // props / monsters / flora 是 l0veyou 生的圖集,同契約、cell id 不重複,所以共用 detailLod。
  for(const [sheetKey,manKey] of [['detailsAtlas','detailsManifest'],
                                  ['detailsAtlas2x','detailsManifest2x'],
                                  ['propsAtlas','propsManifest'],['propsAtlas2x','propsManifest2x'],
                                  ['streamAtlas','streamManifest'],['streamAtlas2x','streamManifest2x'],['coldAtlas','coldManifest'],['coldAtlas2x','coldManifest2x'],['woodsAtlas','woodsManifest'],['woodsAtlas2x','woodsManifest2x'],
                                  ['floraAtlas','floraManifest'],['floraAtlas2x','floraManifest2x'],
                                  ['villagersAtlas','villagersManifest'],['villagersAtlas2x','villagersManifest2x'],
                                  ['yardAtlas','yardManifest'],['yardAtlas2x','yardManifest2x'],
                                  ['townAtlas','townManifest'],['townAtlas2x','townManifest2x'],['town2Atlas','town2Manifest'],['town2Atlas2x','town2Manifest2x'],
                                  ['iconsAtlas','iconsManifest'],['iconsAtlas2x','iconsManifest2x'],
                                  ['vfxAtlas','vfxManifest'],['vfxAtlas2x','vfxManifest2x']]){
    if(!assets[sheetKey]||!assets[manKey]||loadedAssetKeys.has(sheetKey))continue;
    loadedAssetKeys.add(sheetKey);
    const m=(typeof assets[manKey]==='string')?JSON.parse(assets[manKey]):assets[manKey];
    const im=trackImage(new Image());
    im.onload=()=>{detailLod.push({img:m.kind==='mistvale-detail-atlas'?toneFoliage(im,m.cells):im,scale:m.scale===0.5?1:2,frames:m.cells});
      globalThis.dispatchEvent(new CustomEvent('pixel-assets-ready'));};
    im.onerror=()=>loadedAssetKeys.delete(sheetKey);
    im.src=assets[sheetKey];
  }
}

const loadedAssetKeys=new Set();

// ── manifest 驅動的建築圖集 ────────────────────────────────────────────────
// 契約(build.mjs 注入):
//   PIXEL_ASSETS.buildingsAtlas / buildingsAtlas2x      = data:image/png;base64,...
//   PIXEL_ASSETS.buildingsManifest / buildingsManifest2x = {cells:{<id>:{x,y,w,h}}}
// 每格 rect 是「內容本身」的來源矩形,已經去背、去空白,所以不用再跑色鍵和 bbox 掃描。
const atlasLod=[];
// 圖集裡「參考建築」的來源寬度(manifest 產出時的中位數)。用它把舊版的
// 世界寬度 71 換算成「每來源像素多少世界單位」,畫面大小才跟改之前一致。
const ATLAS_REF_WIDTH_1X=145.5;
const BUILDING_WORLD_WIDTH=71;
// v3(概念圖參考重生)的酒館連露台,概念圖量約 560px+ → 140 單位。
// Xilurus 風格等角建築(assets/xilurus/<id>.png):畫寬上限(世界像素);實際大小再由 fitScaleFor 限制在街區內。
const conceptBuildingWidth=id=>({hall:132,inn:116,tavern:116,forge:116,trading:116,training:116,academy:110,sanctuary:110,enhancement:110,clinic:106,house:106,bounty:98,restaurant:96,dungeon:88}[id]||106);
// T130:鐵匠鋪煙囪會冒煙（有蓋才有煙，等級越高煙越旺、越密）。
// 以前只有「程序繪製的備援圖」會冒煙，實際上所有建築都用 atlas 圖，所以整座村莊一直是靜止的。
// 煙囪口座標在建築繪製時記下來，煙本身畫在最後的動態層（建築層會被凍結成靜態快取）。
// T133:夜晚的窗光——每種建築的不透明範圍內，窗戶大概在哪（0..1，x 由左、y 由上）。
// 純表驅動：改這裡就能調位置，不用動繪製程式。
const NIGHT_WINDOWS={
  hall:[[.30,.40],[.62,.40],[.46,.28]],
  house:[[.36,.44],[.62,.44]],
  inn:[[.30,.48],[.66,.48]],
  tavern:[[.32,.44],[.62,.50]],
  restaurant:[[.40,.42]],
  forge:[[.42,.50]],
  enhancement:[[.44,.44]],
  academy:[[.38,.42],[.62,.42]],
  clinic:[[.42,.46]],
  dungeon:[[.36,.48]],
  arena:[[.36,.48],[.64,.48]]
};
let smokeSpot=null;   // T130:鐵匠鋪煙囪口的螢幕座標（由建築繪製時記錄）
const glowSpots=new Map();   // T131:每棟建築的 sprite 螢幕矩形（給夜晚地面的燈光定位）
// 大廳與地下城要比店鋪大。舊版是 hall:79 / dungeon:77,換算成倍率。
const BUILDING_SCALE={hall:1.11,dungeon:1.08};
// 2026-10-13 使用者指定:「建築大小都不一樣了,全部改成現在最大建築的一半大小」。
// 以前實際倍率 = min(玩家設定, 街區容得下的最大值),所以「搬到小街區」的建築會自己縮小 → 大小不一。
// 現在所有建築都畫同一個倍率 = **目前最大的那棟 × 0.5**（動態算,所以把某棟調大時全部會一起跟著調整）。
// 門/動線用的是佔地(b.w/b.d),不受精靈縮放影響。
const BUILDING_UNIFORM_RATIO=0.5;
// 除錯用:console 打 __mistvaleAtlas() 看圖集載入狀況
globalThis.__mistvaleHero=()=>({ready:heroAtlasLod.length>0,lods:heroAtlasLod.map(l=>({scale:l.scale,cells:Object.keys(l.frames).length})),use:{...heroUse}});
globalThis.__mistvaleDetails=()=>({ready:detailLod.length>0,use:Object.assign({},detailUse),proc:Object.assign({},procUse)});
globalThis.__mistvaleResetProc=()=>{for(const k in procUse)delete procUse[k];};
globalThis.__mistvaleAtlas=()=>({ready:atlasLod.length>0,
  lods:atlasLod.map(l=>({scale:l.scale,cells:Object.keys(l.frames).length})),
  use:Object.assign({},atlasUse)});
// 用明確的布林旗標,不要用「比較暗門檻」—— 之前傳 2 進來但門檻是 2.2,
// 那個分支永遠走不到,而且是靜默的(buildingDataURL 的 2x 意圖從來沒生效過)。
function atlasFrameFor(id,prefer2x){
  if(prefer2x)for(const lod of atlasLod)if(lod.scale===2&&lod.frames[id])return lod;
  for(const lod of atlasLod)if(lod.frames[id])return lod;
  return null;
}
// 使用計數:驗證 LOD 到底有沒有真的被選到,不要靠「看起來很清晰」猜。
const atlasUse={draw1x:0,draw2x:0,thumb1x:0,thumb2x:0,lastScale:0};
function atlasReady(){return atlasLod.length>0;}
function ensureAtlasManifest(){
  const assets=globalThis.PIXEL_ASSETS||{};
  const specs=[['buildingsAtlas','buildingsManifest',1/ATLAS_REF_WIDTH_1X,1],
               ['buildingsAtlas2x','buildingsManifest2x',1/(ATLAS_REF_WIDTH_1X*2),2]];
  for(const [sheetKey,manKey] of specs){
    const urlKey=sheetKey, man=assets[manKey];
    if(!man||!assets[urlKey]||loadedAssetKeys.has(urlKey))continue;
    loadedAssetKeys.add(urlKey);
    const m=(typeof man==='string')?JSON.parse(man):man;
    const im=trackImage(new Image());
    im.onload=()=>{
      const k=(m.scale===0.5)?(1/(ATLAS_REF_WIDTH_1X)):(1/(ATLAS_REF_WIDTH_1X*2));
      atlasLod.push({img:im,k,scale:m.scale===0.5?1:2,frames:m.cells});
      globalThis.dispatchEvent(new CustomEvent('pixel-assets-ready'));
    };
    im.onerror=()=>loadedAssetKeys.delete(urlKey);
    im.src=assets[urlKey];
  }
}
// ── 新規格英雄 sprite sheet(sprites/SPRITE_VISUAL_BIBLE.md §9;assets/heroes/<id>.png + .json,build.mjs 嵌成 PIXEL_ASSETS.heroSheets)──
// 每列一個動作、每格 128(技能 160)、1:1 像素、軀幹中心 = 格中線、腳底 = 格底往上 10px。遊戲裡待機身高 = HERO_H(21)邏輯單位。
const heroSheets={},HERO_H=21,heroLodUse={ '1x':0, '2x':0 };
globalThis.__mistvaleHeroLod=()=>({...heroLodUse});  // 使用者決定:新規格英雄在遊戲裡維持原本角色大小(待機身高 21 邏輯單位,跟舊英雄一樣)
const heroArt=id=>HERO_H/(heroSheets[id]?.meta.heroHeight||72);  // 1 美術像素 = 幾個邏輯單位
// 2026-10-30 使用者:「所有英雄動畫播放 fps 也相同」→ 走路列一律每格 0.125 秒(8 fps)、照時間播(拿掉祭司走路列
// 依移動距離推進的 cycle,不然走路動畫的快慢跟著步幅變);倒下列一律 0.1 秒。其他動作各職業本來就一樣
// (待機 0.16、攻擊／技能 0.075、受擊／勝利 0.1)。改的是執行期 meta,不動 sheet 檔。
const HERO_FT={walk:.125,death:.1};
function unifyHeroTiming(meta){for(const [k,a] of Object.entries(meta?.actions||{})){if(!a||typeof a!=='object')continue;
  if(/^walk/.test(k)){a.frameTime=HERO_FT.walk;delete a.cycle;}else if(k==='death')a.frameTime=HERO_FT.death;}return meta;}
function ensureHeroSheets(){const A=globalThis.PIXEL_ASSETS?.heroSheets||{};
  for(const [id,v] of Object.entries(A)){if(loadedAssetKeys.has('hs:'+id))continue;loadedAssetKeys.add('hs:'+id);
    const meta=unifyHeroTiming(typeof v.meta==='string'?JSON.parse(v.meta):v.meta),im=trackImage(new Image()),fx=v.fx?trackImage(new Image()):null;
    const hi=v.hi?(typeof v.hi.meta==='string'?{img:v.hi.img,meta:JSON.parse(v.hi.meta)}:v.hi):null;if(hi)unifyHeroTiming(hi.meta);
    // @2x(hi)只在 heroSheets[id] 建立時登記「來源」,真正下載由 hiWarm 觸發(放大到門檻才載)
    im.onload=()=>{heroSheets[id]={...heroSheets[id],img:im,meta,fx,fxMeta:v.fxMeta?(typeof v.fxMeta==='string'?JSON.parse(v.fxMeta):v.fxMeta):null,...(hi?{hi:{meta:hi.meta,src:hi.img}}:{})};spriteCache.clear();globalThis.dispatchEvent(new CustomEvent('pixel-assets-ready'));};
    im.onerror=()=>loadedAssetKeys.delete('hs:'+id);im.src=v.img;if(fx)fx.src=v.fx;
  }}
// 模組化配件槽(Accessory/Head):assets/heroes/accessories.png,依稀有度戴在每格的頭頂錨點(meta.actions[act].head)。
let heroAcc=null;function ensureHeroAcc(){return;}   // 2026-10-31:英雄不再戴配件,配件圖集也不用載入(省一張大圖的解碼)
// 2026-10-31 使用者:「配件也移除」→ 英雄一律不戴配件(緞帶/羽毛/花冠/頭冠/月桂/角/王冠/光環)。
// 保留空表與函式,繪製路径看到 null 就不畫;素材 heroAccessories 也不再被要求載入。
const ACC_BY_RARITY={};
function heroAccessory(){return null;}
// 新規格魔物 sheet(assets/monsters3,同英雄規格:1:1 像素、16 色、每列一個動作、軀幹中心=格中線、腳底=格底上 10px;密度跟英雄一樣 72 px = 21 單位)
// 2026-10-26:魔物 26 種(每種約 8–18 MB 解碼後),全部開場載入會吃掉 280 MB → 改成**用到哪一種才載哪一種**(MON_SHEET 觸發)。
const monsterSheets={};let monsterReq=new Set();
function ensureMonsterSheet(id){const A=globalThis.PIXEL_ASSETS?.monsterSheets||{};const v=A[id];if(!v||loadedAssetKeys.has('ms:'+id))return;
  loadedAssetKeys.add('ms:'+id);const im=trackImage(new Image());im.onload=()=>{monsterSheets[id]={img:im,meta:v.meta};globalThis.dispatchEvent(new CustomEvent('pixel-assets-ready'));};im.onerror=()=>{loadedAssetKeys.delete('ms:'+id);};im.src=v.img;}
// 遠程魔物的飛行物(assets/ui/fx-mshots.png:8 格 32×32 橫排,l0veyou GPT Image 2 生)。開場就載(很小、內嵌)。
// 2026-10-30:地區立牌的木牌素材(PixelLab generate-ui-v2 生的,pixel 精緻版)。
let signImg=null;function regionSignArt(){if(!signImg){const src=globalThis.PIXEL_ASSETS?.ui?.['px-signpost'];if(!src)return null;signImg=trackImage(new Image());signImg.src=src;}return signImg.complete&&signImg.naturalWidth?signImg:null;}
let mshotImg=null;function mshotSheet(){if(!mshotImg){const src=globalThis.PIXEL_ASSETS?.ui?.['fx-mshots'];if(!src)return null;mshotImg=trackImage(new Image());mshotImg.src=src;}return mshotImg.complete&&mshotImg.naturalWidth?mshotImg:null;}
function ensureMonsterSheets(){for(const id of monsterReq)ensureMonsterSheet(id);}
// HeroLoom 風格魔物實驗包(docs/HEROLOOM-MONSTERS.md;?lmob=1 才開,預設照舊 assets/monsters3):
// 減少列數的 sheet(5 列 idle/walk/attack/hurt/death,160 px 格)由 src/heroloom-monsters.js 補成
// 跟 monsters3 一樣的 meta 形狀;dirSuffix/actRow 找不到 <動作>Down/Up 時退回側面列,跟 treant 走同一條路。
// 包還沒載好時 MON_SHEET 回 undefined → pendingMon 讓這一幀先不畫,載好後 pixel-assets-ready 重畫。
const loomMonsterOn=(()=>{try{return /^(1|on|yes|true)$/i.test(new URLSearchParams(globalThis.location?.search||'').get('lmob')||'');}catch{return false;}})();
const loomMonsterSheets={},loomMonsterReq=new Set();
function ensureLoomMonsterSheet(id){if(!loomMonsterOn||!LOOM_MONSTERS[id]||loomMonsterSheets[id]||loomMonsterReq.has(id))return;loomMonsterReq.add(id);
  const im=trackImage(new Image());im.onload=()=>{loomMonsterSheets[id]={img:im,meta:loomMonsterMeta(id)};globalThis.dispatchEvent(new CustomEvent('pixel-assets-ready'));};
  im.onerror=()=>{loomMonsterReq.delete(id);};im.src=monsterSheetUrl(id);}
globalThis.__mistvaleLoomMonsters=()=>({on:loomMonsterOn,ids:Object.keys(LOOM_MONSTERS),loaded:Object.keys(loomMonsterSheets),pending:[...loomMonsterReq].filter(id=>!loomMonsterSheets[id])});
// 2026-11-16:魔物圖只有側面列(沒有 *Up/*Down 列,HeroLoom PixelLab 重畫那批)= true;圖還沒載入時回 false、不記住。
const monSideOnlyMemo=new Map();
function monSideOnly(t){if(monSideOnlyMemo.has(t))return monSideOnlyMemo.get(t);const ms=MON_SHEET(t);if(!ms||!ms.meta)return false;const v=!Object.keys(ms.meta.actions||{}).some(k=>/(Up|Down)$/.test(k));monSideOnlyMemo.set(t,v);return v;}
const MON_SHEET=t=>{const id=t==='boss'?'treant':t;
  if(loomMonsterOn&&LOOM_MONSTERS[id]){ensureLoomMonsterSheet(id);return loomMonsterSheets[id];}
  monsterReq.size<64&&monsterReq.add(id);ensureMonsterSheet(id);return monsterSheets[id];};
// T110:魔物資訊卡的頭像 —— 取 sheet 的 idle 第 0 格,最近鄰放大到 size×size(沒有 sheet 就回空字串,卡片改畫色塊)。
export function monsterPortrait(type,size=96){
  const ms=MON_SHEET(type),acts=ms?.meta?.actions||{},a=acts.idle||acts.walk||acts.attack;
  if(!a||!ms.img)return '';
  try{const cv=document.createElement('canvas');cv.width=size;cv.height=size;const c=cv.getContext('2d');c.imageSmoothingEnabled=false;c.drawImage(ms.img,0,a.y,a.cell,a.cell,0,0,size,size);return cv.toDataURL();}catch{return '';}
}
// 進區前先叫齊該區魔物的 sheet(只會載入真的會用到的種類)。
globalThis.__mistvalePreloadMonsters=(ids)=>{for(const id of ids||[]){if(!id)continue;monsterReq.add(id);ensureMonsterSheet(id);}};
// 新版 sheet 還在解碼:這一幀先不畫(不退回舊程序圖),載好後 pixel-assets-ready 重畫。
const pendingHero=id=>!heroSheets[id]&&!!globalThis.PIXEL_ASSETS?.heroSheets?.[id];
const pendingMon=t=>!MON_SHEET(t)&&!!globalThis.PIXEL_ASSETS?.monsterSheets?.[t==='boss'?'treant':t];
// 動畫方向 = 4 象限(2026-11-15 使用者:「允許斜走，90度分界分四個象限，每個象限一個動畫方向」;規則在 src/dir4.js):
// 取「畫面上」的向量(等角 x 9、y 4.5,不是世界 dx/dz)的角度,90° 一個象限,象限中心 = 畫面右/下/左/上(邊界在畫面對角線,QUADRANT_OFFSET_DEG)
// → side(右)/ down / sideLeft(左)/ up。人物可以斜走,只有動畫方向是 4 個。沒移動就沿用上一個方向。
// 斜向名稱(downRight、upLeft…)不再產生;英雄 sheet 上烘好的斜向列不會被選到;assets/monsters3 的斜向列已修剪(計畫 2.8,選列只看名稱與 a.y)。
// 一次性的方向(出手、受擊、技能,事件開始時鎖一次):moveDir,邊界 ±3° 內維持上一個方向。
function moveDir(dx,dz,prev){return vdir4(dx,dz,prev||'side',false);}
// 連續的方向(走路):moveDirStable 多一段遲滯 —— 超過象限邊界 FACING_HYSTERESIS_DEG(10°)才換,幾乎正斜走時不會一幀一換。
function moveDirStable(dx,dz,prev){return vdir4(dx,dz,prev||'side',true);}
// 左右鏡像跟著動畫方向:側面(side/sideLeft)時鏡像「就是」方向,一定要一致;上/下時鏡像只是外觀(紙娃娃不看),維持呼叫端原本的值。
const mirrorOf=(vdir,facing)=>vdir==='side'?1:vdir==='sideLeft'?-1:facing;
// 魔物走路方向的取樣窗口(秒,遊戲時間);見 drawEnemy。pipeline/scripts/check/check_facing.mjs 的 WIN 要一樣
const ENEMY_DIR_WIN=.15;
// DIR_ACT / ATTACK_ACT / dirSuffix / leftRow 在 src/dir4.js(4 方向版:右 = 原列、下 = <動作>Down、上 = <動作>Up、左 = 原列鏡像或烘好的 <動作>Left)
globalThis.__mistvaleHeroSheets=()=>Object.fromEntries(Object.entries(heroSheets).map(([k,v])=>[k,{w:v.img.width,h:v.img.height,actions:Object.keys(v.meta.actions)}]));
// 模組化換色(sprites/SPRITE_VISUAL_BIBLE.md §9.3):每職業 meta.groups = outfit(職業代表色布料)/metal(鎧甲、刀刃)。
// 每位英雄依 id 挑一個布料色相(5 選 1)→ 同職業不同人;買了鎧甲 → 布料更飽和;買了武器 → 金屬變金色。
// 換色改成「畫到哪一格才換那一格」(2026-10-26 手機卡頓):以前每個外觀把整張表複製一份換色(1x 一張 10–20 MB、約 7 張 ≈ 95 MB;
// 2x 一張 40–73 MB,而且要分段做幾十秒),現在只換真的畫到的格(1x 一格 100×100)。換色表(每職業×外觀一個小 Map)照舊。
// 換好的格排一條 LRU,總像素超過上限丟最久沒畫到的:桌機 1600 萬像素、手機 400 萬(1x 約 400 格)。
// 每幀最多新換 VARIANT_PER_FRAME 格(換一格:畫入、讀回、換色、寫回);超過的這一幀先用原色,下一幀補上(只在開場一大群英雄同時出現時才會碰到)。
// 2026-10-31 使用者:同職業的英雄不要靠 id 隨機換色(名字不同就好)。換色只剩裝備造成的(穿甲/持武器的金屬)。
const OUTFIT_SHIFT=[0],variantMaps=new Map(),variantCells=new Map();let variantCellPx=0,variantNew=0,variantMade=0;
const VARIANT_PER_FRAME=12,VARIANT_BUDGET=()=>lowMemDevice?4e6:16e6;
function rgb2hsl(r,g,b){r/=255;g/=255;b/=255;const mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2;if(mx===mn)return[0,0,l];const d=mx-mn,s=l>.5?d/(2-mx-mn):d/(mx+mn);let h=mx===r?(g-b)/d+(g<b?6:0):mx===g?(b-r)/d+2:(r-g)/d+4;return[h/6,s,l];}
function hsl2rgb(h,s,l){const f=n=>{const k=(n+h*12)%12,a=s*Math.min(l,1-l);return Math.round(255*(l-a*Math.max(-1,Math.min(k-3,9-k,1))));};return[f(0),f(8),f(4)];}
// 2026-11-12 裝備換表:穿甲／精良武器有專用 sheet 就直接換表,不再靠調色;沒有專用表的職業仍走舊的 rich/gold 調色。
// 兩種手段不疊加(專用表已經把顏色畫好),所以有表時 rich/gold 一律關掉。
const warnedPartSheets=new Set();   // 缺零件表:每張只 console.warn 一次,不要每幀洗板
function warnPartOnce(id){if(warnedPartSheets.has(id))return;warnedPartSheets.add(id);console.warn('[mistvale] missing equipment part sheet:',id);}
// 2026-11-13 起 gameplay 是六格裝備(頭/胸/腰/腿/靴/手) + 武器;舊存檔的 armor:true 仍算「有穿甲」。
// 只有 ?doll=0 的 sheet 路徑會用到這裡:六格任一格有穿就當有護甲(染色),-armor 全身表只在胸甲/舊 armor 時換。
const GEAR_SLOTS_W=Object.freeze(['helm','chest','belt','legs','boots','gloves']);
const gearWorn=h=>{const e=h&&h.equipment;if(!e)return 0;let n=0;for(const s of GEAR_SLOTS_W)if(e[s]===true)n++;if(!n&&e.armor===true)n=1;return n;};
function heroLook(h){const cls=h.classId||'',eq=(h&&h.equipment)||{},worn=gearWorn(h),armor=worn>0,weapon=!!eq.weapon,
  armorSheet=armor&&(eq.chest===true||eq.armor===true)&&heroSheets[cls+'-armor']?.meta?cls+'-armor':'',
  fine=weapon&&!!heroSheets[cls+'-weapon-fine']?.meta;
  return{shift:OUTFIT_SHIFT[hash(h.id||'')%OUTFIT_SHIFT.length],rich:armor&&!armorSheet,gold:weapon&&!fine,bodySheet:armorSheet,weapon:fine?'fine':''};}
// 調色表用數字鍵(r<<16|g<<8|b),不再逐像素拼字串。
const colorKey=c=>(c[0]<<16)|(c[1]<<8)|c[2];
function variantMap(hs,look){const m=hs.meta,pal=m.palette.map(c=>[1,3,5].map(i=>parseInt(c.slice(i,i+2),16))),map=new Map();
  for(const i of m.groups?.outfit||[]){const [h,s,l]=rgb2hsl(...pal[i]);map.set(colorKey(pal[i]),hsl2rgb((h+look.shift/360)%1,Math.min(1,s*(look.rich?1.25:1)),l*(look.rich?.9:1)));}
  if(look.gold)for(const i of m.groups?.metal||[]){const [,,l]=rgb2hsl(...pal[i]);map.set(colorKey(pal[i]),hsl2rgb(45/360,.7,Math.min(.85,l*.95+.05)));}
  return map;}
let variantScratch=null;
// 回傳換好色的一格(canvas,原點 0,0、大小 c×c);不用換色(沒有外觀)或這幀額度用完 → null(呼叫端用原圖)。
function variantCell(id,look,hs,sx,sy,c){if(!look||(!look.shift&&!look.rich&&!look.gold))return null;
  const mk=`${id}:${hs===heroSheets[id]?'1x':'2x'}:${look.shift}:${+look.rich}:${+look.gold}`,key=`${mk}:${sx},${sy},${c}`;
  let cv=variantCells.get(key);if(cv){variantCells.delete(key);variantCells.set(key,cv);return cv;}
  if(variantNew>=VARIANT_PER_FRAME)return null;variantNew++;
  let map=variantMaps.get(mk);if(!map){map=variantMap(hs,look);variantMaps.set(mk,map);}
  // 讀回用共用的暫存畫布(willReadFrequently);換好再畫進一般畫布,遊戲每幀畫的是一般畫布(不是讀回用的軟體畫布)。
  if(!variantScratch||variantScratch.width<c||variantScratch.height<c){variantScratch=makeCanvas(Math.max(c,variantScratch?.width||0),Math.max(c,variantScratch?.height||0));variantScratch.x=variantScratch.getContext('2d',{willReadFrequently:true});}
  const x=variantScratch.x;x.clearRect(0,0,c,c);x.drawImage(hs.img,sx,sy,c,c,0,0,c,c);
  const d=x.getImageData(0,0,c,c),p=d.data;
  for(let k=0;k<p.length;k+=4){if(!p[k+3])continue;const n=map.get((p[k]<<16)|(p[k+1]<<8)|p[k+2]);if(n){p[k]=n[0];p[k+1]=n[1];p[k+2]=n[2];}}
  x.putImageData(d,0,0);cv=makeCanvas(c,c);cv.getContext('2d').drawImage(variantScratch,0,0,c,c,0,0,c,c);
  variantCells.set(key,cv);variantCellPx+=c*c;variantMade++;
  while(variantCellPx>VARIANT_BUDGET()&&variantCells.size>1){const [k0,v0]=variantCells.entries().next().value;variantCells.delete(k0);variantCellPx-=v0.width*v0.height;texRelease?.(v0);}
  return cv;}
globalThis.__mistvaleVariants=()=>[...variantMaps.keys()];
globalThis.__mistvaleVariantCells=()=>({n:variantCells.size,mpx:+(variantCellPx/1e6).toFixed(2),budget:VARIANT_BUDGET()/1e6,made:variantMade});
// 動作列退回:新素材(PixelLab 滙出)只有待機＋走路,沒有攻擊／技能列。
// 少一列時退回「最接近的現有列」,而不是整隻不畫 —— sheetFrame 以前直接回 null,就是「人消失」。
// 順序:完全同名 → 去掉方向字尾 → 同方向的待機 → 待機 → 走路 → 表上第一列。
function actRow(m,act){const name=String(act||'');if(m[name])return name;
  const suffix=(name.match(/(DownRight|UpRight|DownLeft|UpLeft|Down|Up|Left|Right)$/)||[''])[0];
  const base=suffix?name.slice(0,-suffix.length):name;
  for(const candidate of [base,base+'Down',base+'Up',suffix&&'idle'+suffix,suffix&&'walk'+suffix,'idle','idleDown','idleUp','walk','walkDown','walkUp'])
    if(candidate&&m[candidate])return candidate;
  return Object.keys(m)[0]||'';}
function actOf(meta,name){const m=meta?.actions||{};return m[actRow(m,name)];}
// LOD 選擇：預設縮放下英雄只畫約 46–50px 高，用 1x 表（1 美術像素 ≈ 1 螢幕像素，銳利）；
// 放大到接近 1:1 時換原生 @2x 表，細節才喫得到。門檻用「每個美術像素幾個裝置像素」；2x 表若缺該動作就退回 1x。
const heroLodOn=new Map();   // 每個職業目前是否用 @2x（遲滯用，避免在門檻附近來回換表）
// 2x 表是大圖(約 4–6 百萬像素)。直接從 Image 取樣時,瀏覽器的解碼快取會被擠掉,每次新的取樣(例如算影子)都可能重新解碼一次(單次 70–100 ms),放大到 2x 時最明顯。
// 改成轉成 ImageBitmap(像素常駐、取樣不再重新解碼)。轉一張要占主執行緒(1 倍速約 20 ms、4 倍降速約 70 ms),五位英雄同一幀一起轉會卡 300 多 ms,
// 所以縮放接近 2x 門檻(約 70%)就開始排隊,每 8 幀轉一張;還沒轉好的職業先用 1x 表(兩份表的版面是嚴格 2 倍關係,只差解析度)。只有縮放到那裡才會轉,平常不佔記憶體。
const hiQueue=[];let hiTick=0;
// 手機/平板(觸控)不用 2x 英雄表,放大時用 1x 表放大畫(2026-10-26 真機 iPhone 實測,?perf=1 回報):
// 放大到 3 倍以上切到 2x 表時,每張 2x 表(1300–1800 萬像素,解碼 40–73 MB)要轉 ImageBitmap,
// 有換色外觀的英雄還要整張重新換色一份(pumpVariants 每幀做 64 列,iPhone 上每幀 20 ms 以上、持續幾十秒,縮回來也還在做),
// 記憶體一下多出好幾百 MB → 實測掉到 6–16 fps、還有一次卡住 16 秒。手機畫布上限 1.5 倍,2x 表的細節在手機上本來就看不太出來。
let heroHiAllowed=true;
// hi.src 還沒下載過 → 先建立 Image 開始載入(onload 後才排隊轉 ImageBitmap;轉好才切到 2x 表)
function hiWarm(hi){if(hi.bmp||hi.bmpPending)return;hi.bmpPending=true;
  if(!hi.img){if(!hi.src){hi.bmp=true;return;}const im=trackImage(new Image());
    im.onload=()=>{hi.img=im;hi.onloadDone=true;hiWarm(hi);};im.onerror=()=>{hi.bmp=true;};im.src=hi.src;return;}
  if(typeof createImageBitmap!=='function'){hi.bmp=true;return;}hiQueue.push(hi);}
function pumpHi(){if(!hiQueue.length||++hiTick%8)return;const hi=hiQueue.shift();createImageBitmap(hi.img).then(b=>{hi.img=b;hi.bmp=true;}).catch(()=>{hi.bmp=true;});}
function sheetFor(id,act,look){const bid=look?.bodySheet||id,hs=heroSheets[bid];if(!hs?.meta)return null;const hi=hs.hi;
  if(!hi?.meta||!heroHiAllowed)return hs;
  // 進入 0.66、退出 0.54（雙門檻）＝縮放在門檻附近來回時不會一直切換；兩份表的 cell/foot/heroHeight 是嚴格的 2 倍關係，
  // 所以真的切換時位置與大小完全不變，只差解析度。
  // 預先轉 2x 表(hiWarm)只在接近切換門檻時才做:轉一張要在主執行緒解碼整張 2x 表(現在 8 方向列加完約 1300–1800 萬像素,
  // 手機 4 倍降速一張 0.2–0.5 秒)。以前 0.46 就開始轉 → 手機進「手動操控」(鏡頭拉近到 1.9,px 約 0.45–0.5)每一職業都轉一次、
  // 連卡好幾下,但那個縮放根本用不到 2x 表(要 0.66 才切)。2026-10-25 使用者回報「操控角色後常常卡頓」。
  const px=(HERO_H/hi.meta.heroHeight)*heroLodScale,prev=!!heroLodOn.get(bid),next=prev?px>=.54:px>=.66;if(px>=.6)hiWarm(hi);
  if(next&&hi.meta.actions[actRow(hi.meta.actions,act)]){if(!hi.bmp){heroLodOn.set(bid,false);return hs;}heroLodOn.set(bid,true);return hi;}
  heroLodOn.set(bid,next);return hs;}
// 列有 cols＝格數太多時每 cols 格換一行(2026-10-24 刺客南向 41 格,單行會讓整張表寬 8200 px)。
function sheetFrame(id,act,i,look){const bid=look?.bodySheet||id,hs=sheetFor(id,act,look);if(!hs?.meta)return null;const meta=hs.meta,a=meta.actions[actRow(meta.actions,act)];if(!a)return null;const f=Math.max(0,Math.min(a.frames-1,i)),sx=(a.cols?f%a.cols:f)*a.cell,sy=a.y+(a.cols?Math.floor(f/a.cols):0)*a.cell,vc=variantCell(bid,look,hs,sx,sy,a.cell);return{img:vc||hs.img,sx:vc?0:sx,sy:vc?0:sy,c:a.cell,foot:a.cell-(a.footFromBottom??meta.footFromBottom),art:HERO_H/meta.heroHeight,meta,hi:hs!==heroSheets[bid]};}   // 列可自帶 footFromBottom（劍尖伸到腳下很低的攻擊列，例：聖騎士 attackDown）
function ensureAtlas() {
  ensureAtlasManifest();
  ensureDetailAtlas();
  ensureTerrainAtlas();
  ensurePlazaTile();ensureConceptTextures();
  ensureHeroAtlas();ensureHeroSheets();ensureHeroAcc();ensureMonsterSheets();mshotSheet();
  const assets=globalThis.PIXEL_ASSETS||{};
  // 舊的硬切格圖集載入已由上面的 manifest 圖集取代(列切線原本是猜的)。

  for(const b of [...BUILDINGS,{id:'monument'}]){const src=assets[b.id];if(!src||loadedAssetKeys.has(b.id))continue;loadedAssetKeys.add(b.id);
    const im=trackImage(new Image());im.onload=()=>{const cell=makeCanvas(im.width,im.height),c=cell.getContext('2d');c.drawImage(im,0,0);const pixels=c.getImageData(0,0,im.width,im.height),d=pixels.data;let x0=im.width,y0=im.height,x1=0,y1=0;
      const alphaAsset=globalThis.PIXEL_ASSETS?.alphaAssets?.[b.id];
      // L3(載入加速,2026-11-16):同一個判準,但每個像素只讀一次 32 位元(整數)並直接跳過全透明像素,
      // 比逐通道讀 d[j]/d[j+1]/d[j+2]/d[j+3] 快約 2 倍;輸出位元相同(有 node 隨機像素比對測試)。
      const W=im.width,H=im.height,u=new Uint32Array(d.buffer),innTrim=!alphaAsset&&b.id==='inn';
      for(let y=0;y<H;y++){const row=y*W,roof=innTrim&&y<H*.25;
        for(let x=0;x<W;x++){const i=row+x,w=u[i],a=w>>>24;if(a===0)continue;
          const r=w&255,g=(w>>>8)&255,bl=(w>>>16)&255;
          if(!alphaAsset&&r>160&&bl>130&&g<130&&r>g*1.5&&bl>g*1.5){u[i]=w&0x00ffffff;continue;}
          if(roof&&g>100&&bl>g*1.10){u[i]=w&0x00ffffff;continue;}
          if(a>32){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}}}
      c.putImageData(pixels,0,0);if(x1>x0&&y1>y0){const sourceWidth=x1-x0+1,sourceHeight=y1-y0+1,out=makeCanvas(alphaAsset?sourceWidth:384,alphaAsset?sourceHeight:Math.round(384*sourceHeight/sourceWidth)),g=out.getContext('2d');g.imageSmoothingEnabled=false;g.drawImage(cell,x0,y0,sourceWidth,sourceHeight,0,0,out.width,out.height);sharedAtlas||=new Map();sharedAtlas.set(b.id,out);globalThis.dispatchEvent(new CustomEvent('pixel-assets-ready'));}
    };im.onerror=()=>loadedAssetKeys.delete(b.id);im.src=src;
  }
}
// FIX-A B2:觸控裝置沒有 Esc,放置提示改成指向畫面上的「取消」鈕
const PLACE_HINT_COARSE=typeof matchMedia==='function'&&matchMedia('(pointer:coarse)').matches;
export function createWorld(canvas,{onSelect=()=>{},onPlace=()=>{},getState=()=>null}={}) {
  ensureAtlas();
  // 繪製後端:預設 WebGL2(gl-renderer.js;2026-10-28 使用者實機試過後改為預設);網址 ?renderer=2d 改回 Canvas 2D。getContext 只能叫一次,所以先決定模式。
  // GL 模式:原畫布底下墊一張 WebGL 畫布畫世界;原畫布照舊收輸入事件,改成透明、只畫文字。拿不到 WebGL2 → 照舊 2D。
  // GL 模式每幀整張重畫(不走靜止快取/髒矩形/comp):地面 → 影子 FBO 以 .56 壓上 → 物件 → 殘影/覆蓋層/特效/粒子 → 文字(2D 層)。
  const glWanted=(()=>{try{return new URLSearchParams(globalThis.location?.search||'').get('renderer')!=='2d';}catch{return true;}})();
  let glCanvas=null,glr=null;
  if(glWanted){glCanvas=makeCanvas(canvas.width||800,canvas.height||500);glCanvas.setAttribute('aria-hidden','true');glCanvas.style.cssText='position:fixed;left:0;top:0;pointer-events:none;image-rendering:pixelated';
    glr=createGLRenderer(glCanvas,{onLost:()=>useGL(false),onRestored:()=>useGL(true)});if(glr&&canvas.parentNode)canvas.parentNode.insertBefore(glCanvas,canvas);else glr=glCanvas=null;}
  const glKeep=glr;   // 繪製器本體:context 遺失時 glr 設 null 退回 2D,恢復後再接回
  texRelease=glKeep?src=>glKeep.release(src):null;
  const screen=canvas.getContext('2d',{alpha:!!glr});   // 2D:世界直接畫在可見的畫布上;GL:只畫文字(要透明)
  // 物件先畫到 spriteLayer、影子畫到 shadowLayer;地面 → 整層影子 → 物件。g 指向「目前在畫的那一層」。
  // GL 模式 bg/spg 是主清單的兩個轉接物件(各自的狀態,同一條清單)、sg 是影子 FBO 的清單。
  const shadowLayer=makeCanvas(800,500),sg2d=shadowLayer.getContext('2d'),spriteLayer=makeCanvas(800,500),spg2d=spriteLayer.getContext('2d');
  const glMain=glKeep?.ctx('main'),glSprite=glKeep?.ctx('main'),glShadow=glKeep?.ctx('shadow');
  let bg=glr?glMain:screen,sg=glr?glShadow:sg2d,spg=glr?glSprite:spg2d;
  let groundGen=0,glGroundSeen=-1;   // 地面/村莊層重畫的版本:GL 模式看到版本變了就讓舊材質失效重傳
  // 靜止快取(鏡頭連續兩幀不動才錄製,動了立刻停用,見 render):靜態物件整層、靜態影子、地面+海洋+村莊
  const fullStatic=makeCanvas(800,500),fsc=fullStatic.getContext('2d');
  const rdl=makeCanvas(800,500),rdc=rdl.getContext('2d');   // 會動範圍內的重畫暫存層
  const comp=makeCanvas(800,500),cmp=comp.getContext('2d');   // 地面+影子+精靈的最終合成(整張貼到螢幕)
  let compValid=false;   // comp 是否等於「上一幀完整的三層合成」;中間只要有一幀直接畫到螢幕就要重做整張
  const shadowStatic=makeCanvas(800,500),ssc=shadowStatic.getContext('2d');
  const bgCache=makeCanvas(800,500),bgc=bgCache.getContext('2d',{alpha:false});
  // 合成快取:靜止時把地面、影子、精靈依序合成在這裡,之後只重算動過的範圍,再整張複製到螢幕(不必每幀三次整張合成)
  const staticBox=new Map();   // 錄製時每個靜態裝飾的繪製範圍(CSS px);'always' = 每幀都要畫;'none' = 這個視角看不到
  const staticSide=new Map();   // 錄製時每棟建築的點擊框、標籤與覆蓋層(只和鏡頭與狀態有關,每幀直接補回來,不必重畫)
  let shadowMode='normal',staticKey=null,bgKey=null,lastViewKey='',boxSink=null;
  let shadowsOn=true,nightOn=true;   // 設定面板:動態影子 / 夜晚變暗
  // 精靈層與影子層保留上一幀的內容:staticGen 是靜態快取的版本;spgGen/sgGen 記下各層和哪一版快取同步;
  // spgPrev/sgPrev 是上一幀會動的範圍(裝置像素);shadowSink 在畫會動物件的影子時收集範圍
  let staticGen=0,spgGen=-1,sgGen=-1,spgPrev=[],sgPrev=[],shadowSink=null;
  let tileMark=new Uint8Array(0);   // 估計合成範圍面積用的格子標記(重複使用,避免每幀配置)
  let g=bg,casting=false,DPRK=1;  // DPRK = 裝置像素 / 邏輯像素(圖集解析度用)
  let rectCache=null;   // 畫布在視窗中的位置(縮放/ pointermove 每幀要用;只在 resize 後重讀)
  const atkDirs=new Map();   // 獵人 id → 這一次攻擊鎖定的方向(蓄力開始就固定,換攻擊才重算)
  let atlasTick=0;
  // 夜晚變暗用的覆蓋層(比每幀整張 fillRect 便宜很多;pointer-events:none 不影響操作)
  // T131:半透明藍色只會把畫面洗淡，改用正片疊底(multiply)才是真的變暗。
  const nightLayer=(()=>{const el=document.createElement('div');el.style.cssText='position:fixed;inset:0;pointer-events:none;background:#5a6aa8;mix-blend-mode:multiply;opacity:0;z-index:2';document.body.appendChild(el);return el;})();
  let nightShown=0,nightLast=0,nightFrames=0;
  // T135:雨天濕氣層(比 screen-grade 晚掛,疊在它上面;pointer-events:none)
  const rainTint=(()=>{const el=document.createElement('div');el.id='rain-tint';el.setAttribute('aria-hidden','true');el.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:1;opacity:0;transition:opacity 1.2s;background:linear-gradient(180deg,rgba(122,152,176,.10),rgba(78,100,122,.17))';document.body.appendChild(el);return el;})();
  let rainTintShown=0;
  // T137:閃電層(z-index 3,在夜色與濕氣之上、HUD 之下;pointer-events:none)
  const boltLayer=(()=>{const el=document.createElement('div');el.id='lightning';el.setAttribute('aria-hidden','true');el.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:3;opacity:0;background:radial-gradient(130% 95% at 50% 26%,rgba(226,238,255,.95),rgba(176,202,238,.42) 52%,rgba(130,158,204,0) 100%)';document.body.appendChild(el);return el;})();
  let boltT=0,boltCount=0,boltShown=0,lastBoltPer=-1,boltPeak=0;   // boltPeak:本次閃光最高不透明度(除錯/驗收用)
  // T131:燈光層(在夜色之上、HUD 之下)。夜色是正片疊底,畫在同一張畫布上的暖光會被壓成藍灰,
  // 所以燈另外放一層,用加法混合(lighter)疊上去。
  const lightsCanvas=(()=>{const el=document.createElement('canvas');el.setAttribute('aria-hidden','true');el.style.cssText='position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:3';document.body.appendChild(el);return el;})();
  const lightsG=lightsCanvas.getContext('2d',{alpha:true});
  // 2026-11-11 第二階段:建築名牌層(z-index 4,在夜色 z2 與燈光/閃電 z3 之上、HUD 之下)。
  // 名牌原本畫在世界畫布上,入夜會被正片疊底的夜色壓成灰色 → 改畫到這一層,不受日夜濾鏡影響(繪製順序:世界 → 夜色 → 窗光 → 名牌)。
  const labelsCanvas=(()=>{const el=document.createElement('canvas');el.id='map-label-layer';el.setAttribute('aria-hidden','true');el.style.cssText='position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:4';document.body.appendChild(el);return el;})();
  const labelsG=labelsCanvas.getContext('2d',{alpha:true});
  let lightsW=0,lightsH=0;
  // 位置一律取整到裝置像素:CSS 整數座標在 1.25、1.5 倍等非整數 DPR 下會落在半個裝置像素上,平移/縮放時最近鄰取樣的像素模式就跟著跳(抖動)。
  const R=v=>Math.round(v*DPRK)/DPRK;
  canvas.style.imageRendering='pixelated';canvas.style.touchAction='none';screen.imageSmoothingEnabled=false;bg.imageSmoothingEnabled=false;
  let width=800,height=500,scale=.9,elapsed=0,phase=.15,selected=null,placing=null,state={buildings:{},hunters:[],enemies:[],effects:[]},disposed=false,quality=true,baseScale=1.95;
  const coarsePointer=!!(globalThis.matchMedia?.('(pointer:coarse)')?.matches || (globalThis.navigator?.maxTouchPoints||0)>0 || /Mobi|Android|iPhone|iPad/i.test(globalThis.navigator?.userAgent||''));
  heroHiAllowed=!coarsePointer;lowMemDevice=coarsePointer;   // 手機/平板:不用 2x 英雄表(見 heroHiAllowed)、影子半解析度與較小的記憶體上限(見 lowMemDevice)
// 手機/平板:畫布解析度上限 1.5 倍。這些機器 fill/blit 的像素量直接決定溫度(2 倍 → 4 倍像素),
// 1.5 倍的像素量只有原本的 56%,像素圖看起來幾乎一樣(最近鄰放大),但記憶體頻寬少快一半。
const autoDpr=()=>Math.min(coarsePointer?1.5:2,globalThis.devicePixelRatio||1);   // 自動:手機/平板 1.5、其他 2
let dprCap=null;   // 設定面板指定的上限(null = 自動)
let renderDprMax=Math.max(1,dprCap||autoDpr());   // 畫布解析度上限(devicePixelRatio 再高也不超過)
  let canvasRect=null;
  const HOME0=(()=>iso((VILLAGE_BOUNDS.minX+VILLAGE_BOUNDS.maxX)/2,(VILLAGE_BOUNDS.minZ+VILLAGE_BOUNDS.maxZ)/2))();   // 村莊中心(初始鏡頭)
  let cam={...HOME0},target={...HOME0},pointer=null,hover=null,lastSource=null,pinchDistance=0,homeFraming=false;
  const uiLabels=[],hits=[],pointers=new Map(),previousPositions=new Map();
  const decorations=[];let roads=getRoads(),landscapeKey='',terrainRevision=0,lastPatternRev=-1;
  // 地面畫布解析度:桌機 4 px/單位、手機 2(跟建築圖集同一個清晰度)。繪圖座標範圍由世界大小算出(含延伸海岸 EXT 格與四周各 7 的餘裕)。
  const GROUND_RES=((globalThis.screen?.width||0)>=1024&&!globalThis.matchMedia?.('(pointer:coarse)').matches)?4:2;
  // 2026-10-04:只涵蓋陸地(含延伸海岸)的範圍,解析度提高到跟建築圖同級(桌機 4 px/單位、手機 2)。
  const EXT=11;   // 海岸延伸格數(只是風景,不能走)
  const GX0=Math.floor((WORLD.minX-EXT-(WORLD.maxZ+EXT))*9)-7,GX1=Math.ceil((WORLD.maxX+EXT-(WORLD.minZ-EXT))*9)+7,GY0=Math.floor((WORLD.minX-EXT+WORLD.minZ-EXT)*4.5)-7,GY1=Math.ceil((WORLD.maxX+EXT+WORLD.maxZ+EXT)*4.5)+8;
  const ground=makeCanvas((GX1-GX0)*GROUND_RES,(GY1-GY0)*GROUND_RES),gc=ground.getContext('2d');gc.imageSmoothingEnabled=false;
  const groundOrigin={x:-GX0,y:-GY0};
  const worldPos=(x,z)=>{const p=iso(x,z);return{x:p.x+groundOrigin.x,y:p.y+groundOrigin.y};};

  function diamond(ctx,x,z,rx,rz,color){const a=worldPos(x-rx,z-rz),b=worldPos(x+rx,z-rz),c=worldPos(x+rx,z+rz),d=worldPos(x-rx,z+rz);polygon(ctx,[[a.x,a.y],[b.x,b.y],[c.x,c.y],[d.x,d.y]],color);}
  function generateGround(){
    markPhase('繪製村莊地板');
    // 高細節材質 1 原生像素 = 0.25 畫面單位:桌機地面 4px/單位剛好一比一(關平滑、像素銳利);手機 2px/單位是縮小一半,開平滑才不會閃爍摩爾紋。
    gc.setTransform(GROUND_RES,0,0,GROUND_RES,0,0);gc.imageSmoothingEnabled=GROUND_RES<4;gc.imageSmoothingQuality='high';
    const rand=rnd(349180);decorations.length=0;roads=getRoads(state.layout||{},state.buildings||{});terrainRevision++;
    // 世界外圍的海:用對齊概念圖水色的 ocean 材質鋪滿,不再是一片平塗青色。
    gc.fillStyle=groundBase('ocean')||'#417d90';gc.fillRect(0,0,ground.width,ground.height);
    if(groundPatterns.ocean){gc.save();gc.globalAlpha=TERRAIN_TEX_ALPHA;gc.scale(TERRAIN_TEX_SCALE,TERRAIN_TEX_SCALE*TERRAIN_TEX_SQUASH);gc.fillStyle=groundPatterns.ocean;
      gc.fillRect(0,0,ground.width/TERRAIN_TEX_SCALE,ground.height/(TERRAIN_TEX_SCALE*TERRAIN_TEX_SQUASH));gc.restore();}
    const road=(x,z)=>onRoad(x,z,roads);
    // 底層:按生態域「整片」填無縫材質。一格菱形只有 9x5 螢幕像素,逐格貼圖
    // 塞不進細節;整片填才會有連續的草/沙/雪紋理。pattern 垂直壓 0.5 符合等角透視。
    // 材質還沒載完時 tiled=false,退回原本的平塗菱形,不開天窗。
    const tiled=Object.keys(groundPatterns).length>0,roadCells=[],stoneCells=[];
    if(tiled){
      const byBiome=new Map();
      for(let z=WORLD.minZ;z<WORLD.maxZ;z++)for(let x=WORLD.minX;x<WORLD.maxX;x++){
        const b=biomeAt(x,z);let arr=byBiome.get(b);if(!arr){arr=[];byBiome.set(b,arr);}arr.push(x,z);
      }
      for(const [b,pts] of byBiome){
        const pat=groundPatterns[b];if(!pat)continue;
        gc.beginPath();
        for(let i=0;i<pts.length;i+=2){
          const x0=pts[i],z0=pts[i+1];
          const q=worldPos(x0-.51,z0-.51),r=worldPos(x0+.51,z0-.51),
                t=worldPos(x0+.51,z0+.51),u=worldPos(x0-.51,z0+.51);
          gc.moveTo(q.x,q.y);gc.lineTo(r.x,r.y);gc.lineTo(t.x,t.y);gc.lineTo(u.x,u.y);gc.closePath();
        }
        // TERRAIN_TEX_SCALE 是「材質像素 → 螢幕像素」的倍率。1.0 = 一比一,
        // 但出土材質的草葉約 4~8px,跟建築的窗戶一樣大,所以要縮。
        // 縮太小會讓重複週期變短(256*scale 螢幕像素就循環一次)。
        gc.save();gc.clip();
        gc.fillStyle=groundBase(b)||'#7a9460';gc.fillRect(0,0,ground.width,ground.height);
        gc.globalAlpha=TERRAIN_TEX_ALPHA;
        gc.scale(TERRAIN_TEX_SCALE,TERRAIN_TEX_SCALE*TERRAIN_TEX_SQUASH);
        gc.fillStyle=pat;
        gc.fillRect(0,0,ground.width/TERRAIN_TEX_SCALE,ground.height/(TERRAIN_TEX_SCALE*TERRAIN_TEX_SQUASH));
        gc.restore();
      }
    }
    for(let z=WORLD.minZ;z<WORLD.maxZ;z++)for(let x=WORLD.minX;x<WORLD.maxX;x++){
      const p=worldPos(x,z),biome=biomeAt(x,z),base=groundBase(biome),n=Math.floor(rand()*13)-6;
      if(!tiled)diamond(gc,x,z,.51,.51,shade(base,n));
      if(biome==='ocean'||biome==='river'||biome==='ice'){if(rand()<.4){const w=4+rand()*6;if(!tiled)pixel(gc,p.x-4,p.y,w,1,biome==='ice'?'#d1edeb':'#a8ddf7');}if(biome==='river'&&!tiled)pixel(gc,p.x-2,p.y+2,4,1,'#17609f');continue;}  // 浪花/深水色取自概念圖溪流
      if(biome==='bridge'){
        if(!tiled)diamond(gc,x,z,.51,.51,'#79583b');
        for(let i=-3;i<4;i+=2){pixel(gc,p.x-7,p.y+i,14,1,i%3?'#c3a16b':'#947245');pixel(gc,p.x-5,p.y+i+1,10,1,'#6d4b32');}
        if((x+z)%3===0){pixel(gc,p.x-3,p.y-1,2,1,'#e0b781');pixel(gc,p.x+4,p.y+2,1,1,'#4d392a');}continue;
      }
      // 雪地空地/雪路跟著 GRASS_TONE.snow 的暮光暖白走(踩過的雪暗一階),不用冷灰藍。
      // 土路色:概念圖土路取樣平均 (202,146,69)=#ca9245,明暗點綴跟著同一個色相。
      if(road(x,z)&&biome!=='snow'&&(roadStyle(x,z,roads)==='stone'?plazaPattern:roadPattern)){const st=roadStyle(x,z,roads)==='stone';if(conceptGroundAt(x,z)==='.')(st?stoneCells:roadCells).push(x,z);for(let i=st?4:1;i>0;i--)rand();continue;}  // 概念圖畫框內的路面由概念圖地面圖負責  // 跟原分支吃一樣多的亂數
      if(road(x,z)&&tiled&&roadPattern&&plazaPattern){if(roadStyle(x,z,roads)==='stone')for(let i=0;i<4;i++)rand();else rand();continue;}  // 有材質時路面由下面的描線道路畫;亂數照吃
      if(road(x,z)){diamond(gc,x,z,.60,.60,roadStyle(x,z,roads)==='stone'?'#d8c0a8':biome==='snow'?'#c3c9d0':'#ca9245');if(roadStyle(x,z,roads)==='stone'){for(let i=0;i<4;i++){const dx=(i%2)*7-6,dy=Math.floor(i/2)*3-2;pixel(gc,p.x+dx,p.y+dy,6,2,rand()>.5?'#e4d0b2':'#b0a184');pixel(gc,p.x+dx,p.y+dy,5,1,'#f0e2c6');}}else{pixel(gc,p.x-5,p.y-1,7,1,biome==='snow'?'#a9b1bb':'#a06c34');pixel(gc,p.x+1,p.y+1,5,1,biome==='snow'?'#e2e7ec':'#e0ae68');if(rand()<.2)pixel(gc,p.x-2,p.y,2,1,'#ecc27e');}continue;}
      // 每格固定位置的小點綴只在「沒有材質」時畫:有材質時放大會排成規則的斜格紋(概念圖沒有)。亂數照吃。
      const dot=tiled?()=>{}:pixel;
      if(biome==='desert'){dot(gc,p.x-5+rand()*7,p.y-2,4,1,'#eed298');if(rand()<.24)dot(gc,p.x,p.y+2,3,1,'#bb935e');}
      else if(biome==='mountain'){dot(gc,p.x-5,p.y-2,5,2,'#bfc0b2');dot(gc,p.x+2,p.y,4,1,'#777f7b');if(rand()<.12)dot(gc,p.x,p.y,2,2,'#bf9974');}
      else if(biome==='snow'){if(rand()<.4)dot(gc,p.x-4,p.y-1,6,1,'#f1f3df');if(rand()<.15)dot(gc,p.x+1,p.y+1,3,1,'#a8c9cb');}
      else {if(rand()<.65){dot(gc,p.x-3,p.y-2,2,3,shade(base,-20));dot(gc,p.x,p.y-1,2,2,shade(base,24));}if(rand()<.15){dot(gc,p.x+3,p.y-2,2,1,'#c2c982');dot(gc,p.x+1,p.y,1,2,shade(base,-12));}}
    }
    const cellPath=(cells,half)=>{const path=new Path2D();for(let i=0;i<cells.length;i+=2){const x0=cells[i],z0=cells[i+1],q=worldPos(x0-half,z0-half),r=worldPos(x0+half,z0-half),t=worldPos(x0+half,z0+half),u=worldPos(x0-half,z0+half);
      path.moveTo(q.x,q.y);path.lineTo(r.x,r.y);path.lineTo(t.x,t.y);path.lineTo(u.x,u.y);path.closePath();}return path;};
    // 生態域地面(底色+對齊後的材質),給不在世界格子裡的區塊用(西側林地、池塘)。
    const fillTerrain=(cells,half,biome,path=cellPath(cells,half))=>{gc.save();gc.clip(path);gc.fillStyle=groundBase(biome);gc.fillRect(0,0,ground.width,ground.height);
      const pat=groundPatterns[biome];if(pat){gc.globalAlpha=TERRAIN_TEX_ALPHA;gc.scale(TERRAIN_TEX_SCALE,TERRAIN_TEX_SCALE*TERRAIN_TEX_SQUASH);gc.fillStyle=pat;gc.fillRect(0,0,ground.width/TERRAIN_TEX_SCALE,ground.height/(TERRAIN_TEX_SCALE*TERRAIN_TEX_SQUASH));}gc.restore();};
    // Path2D.ellipse 會從上一個子路徑的終點拉一條直線過來;每個橢圓先 moveTo 起點,才是獨立的一塊。
    const addEllipse=(path,cx,cy,rx,ry)=>{path.moveTo(cx+rx,cy);path.ellipse(cx,cy,rx,ry,0,0,Math.PI*2);};
    const diamondPath=(x,z,rx,rz)=>{const a=worldPos(x-rx,z-rz),b=worldPos(x+rx,z-rz),c=worldPos(x+rx,z+rz),d=worldPos(x-rx,z+rz),path=new Path2D();path.moveTo(a.x,a.y);path.lineTo(b.x,b.y);path.lineTo(c.x,c.y);path.lineTo(d.x,d.y);path.closePath();return path;};
    const fillPave=(path,pat,alpha=1,tint=null)=>{if(!pat)return false;gc.save();gc.clip(path);gc.globalAlpha=alpha;gc.save();gc.scale(TERRAIN_TEX_SCALE,TERRAIN_TEX_SCALE);gc.fillStyle=pat;gc.fillRect(0,0,ground.width/TERRAIN_TEX_SCALE,ground.height*2);gc.restore();if(tint){gc.globalAlpha=1;gc.fillStyle=tint;gc.fillRect(0,0,ground.width,ground.height);}gc.restore();return true;};
    // 生態域交界:格子邊界是一階一階的鋸齒。沿交界撒不規則的「鄰區材質斑塊」,邊緣變成自然交錯
    // (概念圖裡草地、土路、石板都是不規則邊)。水域邊界不撒,改在岸邊放岩石。獨立亂數,不動到既有擺放。
    if(tiled){const br=rnd(4242),WET=['ocean','river','ice','bridge'],GRASSY=['village','meadow','birch'],paths={};
      for(let z=WORLD.minZ;z<WORLD.maxZ;z++)for(let x=WORLD.minX;x<WORLD.maxX;x++){const a=biomeAt(x,z);if(WET.includes(a))continue;
        for(const [dx,dz] of [[1,0],[0,1]]){const b=biomeAt(x+dx,z+dz);if(a===b||!b||WET.includes(b)||(GRASSY.includes(a)&&GRASSY.includes(b)))continue;  // 兩邊都是草地就不撒(撒了反而成條紋)
          for(let k=0;k<4;k++){const along=br()-.5,across=(br()-.5)*.8,target=br()<.5?a:b,r=.16+br()*.3;
            const cx=x+dx*(.5+across)+(dz?along:0),cz=z+dz*(.5+across)+(dx?along:0),c=worldPos(cx,cz);
            if([[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]].some(([ox,oz])=>WET.includes(biomeAt(Math.round(cx+ox*(r+.6)),Math.round(cz+oz*(r+.6))))))continue;  // 斑塊不能蓋到小溪/河
            addEllipse(paths[target]||(paths[target]=new Path2D()),c.x,c.y,r*12.7,r*6.4);}}}
      // 只畫在陸地上:用所有陸地格子的聯集當裁切,斑塊不可能蓋到溪流或河面。
      const land=[];for(let z=WORLD.minZ;z<WORLD.maxZ;z++)for(let x=WORLD.minX;x<WORLD.maxX;x++)if(!WET.includes(biomeAt(x,z)))land.push(x,z);
      gc.save();gc.clip(cellPath(land,.5));
      for(const [b,path] of Object.entries(paths))if(groundPatterns[b])fillTerrain(null,0,b,path);
      gc.restore();
    }
    // 路與戰鬥空地:整片 clip 後填概念圖對齊的材質(不逐格貼,紋理才連續)。空地是半透明土 → 踩出來的草地。
    const fillCells=(cells,half,pat,alpha,edge)=>{if(!cells.length)return;const path=new Path2D();
      for(let i=0;i<cells.length;i+=2){const x0=cells[i],z0=cells[i+1],q=worldPos(x0-half,z0-half),r=worldPos(x0+half,z0-half),t=worldPos(x0+half,z0+half),u=worldPos(x0-half,z0+half);
        path.moveTo(q.x,q.y);path.lineTo(r.x,r.y);path.lineTo(t.x,t.y);path.lineTo(u.x,u.y);path.closePath();}
      if(edge){gc.save();gc.translate(0,1);gc.fillStyle=edge;gc.fill(path);gc.restore();}
      gc.save();gc.clip(path);gc.globalAlpha=alpha;gc.scale(TERRAIN_TEX_SCALE,TERRAIN_TEX_SCALE);gc.fillStyle=pat;gc.fillRect(0,0,ground.width/TERRAIN_TEX_SCALE,ground.height/TERRAIN_TEX_SCALE);gc.restore();};
    // 海岸線:世界是一個長方形,海岸原本是四條直線。外圍加一圈「不規則的延伸陸地」(只是風景、不能走,
    // 地圖只會變大),地形接著邊上的生態域;河流一路流進海。visBiome = 畫面上看到的地形(含延伸陸地)。
    // 海岸線由 overworld 的 inWorld() 決定(四面都不規則),世界矩形以外一律是海。
    const visBiome=(x,z)=>x>=WORLD.minX&&x<WORLD.maxX&&z>=WORLD.minZ&&z<WORLD.maxZ?biomeAt(x,z):'ocean';
    let coastBlobs={};
    if(tiled){const ext=new Map();
      for(let z=WORLD.minZ-EXT;z<WORLD.maxZ+EXT;z++)for(let x=WORLD.minX-EXT;x<WORLD.maxX+EXT;x++){if(x>=WORLD.minX&&x<WORLD.maxX&&z>=WORLD.minZ&&z<WORLD.maxZ)continue;
        const b=visBiome(x,z);if(b==='ocean')continue;let a=ext.get(b);if(!a)ext.set(b,a=[]);a.push(x,z);}
      for(const [b,cells] of ext)fillTerrain(cells,.56,b);
      // 圓滑海岸:沿岸每格往海裡長一個圓斑(同地形材質),外圈一道白浪,海岸不再是格子鋸齒。
      const blobs={},foam=new Path2D(),cr=rnd(3301);
      for(let z=WORLD.minZ-EXT;z<WORLD.maxZ+EXT;z++)for(let x=WORLD.minX-EXT;x<WORLD.maxX+EXT;x++){const b=visBiome(x,z);if(b==='ocean'||b==='river'||b==='ice'||b==='bridge')continue;
        for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){if(visBiome(x+dx,z+dz)!=='ocean')continue;const r=.55+cr()*.35,c=worldPos(x+dx*(.3+cr()*.2)+(dz?cr()-.5:0)*.6,z+dz*(.3+cr()*.2)+(dx?cr()-.5:0)*.6);
          addEllipse(blobs[b]||(blobs[b]=new Path2D()),c.x,c.y,r*12.7,r*6.4);addEllipse(foam,c.x,c.y,r*15.5,r*8);}}
      gc.save();gc.fillStyle='rgba(214,238,250,.32)';gc.fill(foam);gc.restore();
      for(const [b,path] of Object.entries(blobs))fillTerrain(null,0,b,path);
      coastBlobs=blobs;}
    // 海岸:陸地碰到海的地方鋪一條沙岸(沙漠材質,裁在陸地內)再放礁石,不是森林直接切進海裡。
    // 岸的材質跟著地形:草地/林地/沙漠是沙灘,山地是灰碎石岸,雪地直接接到水邊(不鋪黃沙)。
    {const WET2=['ocean'],beach=new Path2D(),shingle=new Path2D(),sr=rnd(6627);let any=false;
      for(let z=WORLD.minZ-EXT;z<WORLD.maxZ+EXT;z++)for(let x=WORLD.minX-EXT;x<WORLD.maxX+EXT;x++){const b=visBiome(x,z);if(b==='ocean'||b==='river'||b==='ice'||b==='bridge')continue;
        for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){if(!WET2.includes(visBiome(x+dx,z+dz)))continue;any=true;
          for(let k=0;k<3;k++){const c=worldPos(x+dx*(.25+sr()*.3)+(dz?sr()-.5:0),z+dz*(.25+sr()*.3)+(dx?sr()-.5:0)),r=.3+sr()*.35;if(b==='snow'||b==='taiga')continue;addEllipse(b==='mountain'?shingle:beach,c.x,c.y,r*12.7,r*6.4);}
        }}
      if(any&&groundPatterns.desert){const land=[];for(let z=WORLD.minZ-EXT;z<WORLD.maxZ+EXT;z++)for(let x=WORLD.minX-EXT;x<WORLD.maxX+EXT;x++){const b=visBiome(x,z);if(b!=='ocean'&&b!=='river'&&b!=='ice'&&b!=='bridge')land.push(x,z);}
        const clip=cellPath(land,.5);for(const p2 of Object.values(coastBlobs))clip.addPath(p2);
        gc.save();gc.clip(clip);fillTerrain(null,0,'desert',beach);gc.globalAlpha=1;fillTerrain(null,0,'mountain',shingle);gc.fillStyle='rgba(255,255,255,.12)';gc.fill(shingle);gc.restore();}}
    // 道路:在等角世界座標裡直接描線(圓頭、圓角、輕微蜿蜒),再用遮罩填材質——邊緣平滑,不是一格一格的階梯。
    // 只是畫法;行走用的道路圖(getRoads)不變。概念圖畫框內的路面由村莊高解析地面層蓋上。
    if(roadPattern&&plazaPattern){const W=ground.width,H=ground.height,iso2=c=>c.setTransform(9*GROUND_RES,4.5*GROUND_RES,-9*GROUND_RES,4.5*GROUND_RES,groundOrigin.x*GROUND_RES,groundOrigin.y*GROUND_RES);
      const wob=(r,u)=>.22*Math.sin(u*1.7+r.a.x*.9+r.a.z*1.3)+.12*Math.sin(u*4.1+r.b.z);
      const trace=(c,r,extra)=>{const dx=r.b.x-r.a.x,dz=r.b.z-r.a.z,L=Math.hypot(dx,dz)||1,nx=-dz/L,nz=dx/L,n=Math.max(1,Math.ceil(L/.8));c.lineWidth=2*r.width+extra;c.lineCap=r.cap||'round';c.beginPath();
        for(let i=0;i<=n;i++){const u=i/n,w=(i===0||i===n)?0:wob(r,u*L),x=r.a.x+dx*u+nx*w,z=r.a.z+dz*u+nz*w;i?c.lineTo(x,z):c.moveTo(x,z);}c.stroke();};
      const mask=makeCanvas(W,H),mc=mask.getContext('2d'),tex=makeCanvas(W,H),tc=tex.getContext('2d');
      for(const [kind,pat,edge] of [['trail',roadPattern,'rgba(96,70,36,.8)'],['stone',plazaPattern,'rgba(110,98,80,.85)']]){
        // 環村道路(kind:'ring')用跟村內一樣的石板材質
        const list=roads.filter(r=>(r.kind==='stone')===(kind==='stone'));if(!list.length)continue;   // 環村道路(kind:'ring')走土路材質,跟村內石板區隔開
        gc.save();iso2(gc);gc.lineCap=gc.lineJoin='round';gc.strokeStyle=edge;for(const r of list)trace(gc,r,.28);gc.restore();   // 路緣暗邊
        {const sc=[];for(let z=WORLD.minZ;z<WORLD.maxZ;z++)for(let x=WORLD.minX;x<WORLD.maxX;x++)if(biomeAt(x,z)==='snow')sc.push(x,z);gc.save();gc.clip(cellPath(sc,.5));iso2(gc);gc.lineCap=gc.lineJoin='round';gc.strokeStyle='rgba(176,188,201,1)';for(const r of list)trace(gc,r,.28);gc.restore();}  // 雪地路緣:淡藍灰,不是土色暗邊
        mc.setTransform(1,0,0,1,0,0);mc.clearRect(0,0,W,H);iso2(mc);mc.lineCap=mc.lineJoin='round';mc.strokeStyle='#000';for(const r of list)trace(mc,r,0);
        tc.setTransform(1,0,0,1,0,0);tc.globalCompositeOperation='source-over';tc.clearRect(0,0,W,H);tc.setTransform(GROUND_RES*TERRAIN_TEX_SCALE,0,0,GROUND_RES*TERRAIN_TEX_SCALE,0,0);tc.fillStyle=pat;tc.fillRect(0,0,W/TERRAIN_TEX_SCALE/GROUND_RES,H/TERRAIN_TEX_SCALE/GROUND_RES);
        // 雪地裡的路:踩實的雪(冷灰白),不是黃土
        tc.setTransform(GROUND_RES,0,0,GROUND_RES,0,0);tc.save();const snowCells=[];for(let z=WORLD.minZ;z<WORLD.maxZ;z++)for(let x=WORLD.minX;x<WORLD.maxX;x++)if(biomeAt(x,z)==='snow')snowCells.push(x,z);
        tc.clip(cellPath(snowCells,.56));tc.fillStyle='rgba(214,221,229,.9)';tc.fillRect(0,0,W,H);tc.restore();
        tc.setTransform(1,0,0,1,0,0);tc.globalCompositeOperation='destination-in';tc.drawImage(mask,0,0);
        gc.save();gc.setTransform(1,0,0,1,0,0);gc.drawImage(tex,0,0);gc.restore();}
      mask.width=tex.width=0;}   // 釋放暫存畫布
    else{fillCells(roadCells,.6,roadPattern,1,'#7a5a30');fillCells(stoneCells,.6,plazaPattern,1,'#8a7a62');}
    // 村莊只留建築、地面與村界的木柵欄:公園街區挖一個池塘(水畫在地面層),其餘街區與建築周圍都不擺任何擺設。
    function villagePonds(){
      PONDS.length=0;PONDS.push(...pondsOf(state.layout||{},state.buildings||{}));
      // 池塘:大地面畫水,村莊地面層在這裡挖洞
      for(const p of PONDS){const path=new Path2D();pondPath(path,p,.15);const pp=new Path2D();pp.addPath(path,new DOMMatrix().translate(groundOrigin.x,groundOrigin.y));
        if(groundPatterns.river)fillTerrain(null,0,'river',pp);else{gc.fillStyle='#3a8fc0';gc.fill(pp);}}
    }
    villagePonds();
    // 村界木柵欄(跟 PALISADE 同一份):等角木柵(fenceRail,每段約 2 格),南北兩邊沿 x 走(圖翻面)、東西兩邊沿 z 走;出村口是缺口。
    for(const seg of PALISADE){const alongX=seg.side==='north'||seg.side==='south',lo=alongX?seg.minX+.3:seg.minZ+.3,hi=alongX?seg.maxX-.3:seg.maxZ-.3,n=Math.max(1,Math.round((hi-lo)/2)),step=(hi-lo)/n;
      for(let k=0;k<n;k++){const c=lo+step*(k+.5),at=alongX?(seg.minZ+seg.maxZ)/2:(seg.minX+seg.maxX)/2;decorations.push(alongX?{type:'fenceRail',x:c,z:at,variant:1,size:step/2}:{type:'fenceRail',x:at,z:c,variant:0,size:step/2});}}
    // 村中央的雕像(廣場 0,0 正中):村莊收攏成棋盤時被拿掉,現在放回來。
    // 廣場只有 4.4×3.6,雕像畫 3.2 個單位寬(約 1.5 個英雄高),不會壓到旁邊的街。
    {const plaza=blockCenter(0,0);decorations.push({type:'monument',x:plaza.x,z:plaza.z,size:1});}
    // 每個狩獵區正中央的木頭立牌(怪物數量等級);點擊由 hits 的 region:<id> 交給 UI 開切換畫面。
    {const dry=(x,z)=>{const b=biomeAt(x,z);return b!=='ocean'&&b!=='river'&&b!=='ice'&&b!=='bridge'&&b!=='village';};
      const spot=r=>{if(dry(r.x,r.z)&&!onRingRoad(r.x,r.z,.8))return {x:r.x,z:r.z};
        for(let rad=1.5;rad<=14;rad+=1.5)for(let k=0;k<16;k++){const a=k/16*Math.PI*2,x=r.x+Math.cos(a)*rad,z=r.z+Math.sin(a)*rad;if(dry(x,z)&&!onRingRoad(x,z,.8))return {x,z};}
        return {x:r.x,z:r.z};};
      for(const r of REGIONS) if(r.id!=='village'){const q=spot(r);decorations.push({type:'signpost',regionSign:true,regionId:r.id,x:q.x,z:q.z,size:1});}}
    decorations.sort((a,b)=>a.x+a.z-b.x-b.z);
    globalThis.__mistvaleDecorations=[...decorations];  // 除錯用:讀街上/場景裡的裝飾(NPC)名單
    buildVillageLayer();
  }
  // 村莊高解析地面層:概念圖畫框(x-z∈[-28.1,7.36]、x+z∈[-40.7,30.2])以 VRES px/單位重畫草/土路/石板,
  // 材質是概念圖像素(1 材質 px = 1/3.93 單位,跟概念圖同尺度)。大地面畫布只有 GROUND_RES,放大會糊。
  // 棋盤格村莊的高解析地面層:整個村莊範圍(VILLAGE_BOUNDS)以 VRES px/單位重畫,材質用概念圖像素(草/土/石板)。
  // 街道、廣場、建築地坪是石板;田、柴場、畜欄是翻土;公園挖一個池塘(露出底下大地面上畫好的水)。
  const VRES=GROUND_RES,VBOX=(()=>{const B=VILLAGE_BOUNDS,c=[iso(B.minX,B.minZ),iso(B.maxX,B.minZ),iso(B.maxX,B.maxZ),iso(B.minX,B.maxZ)];
    const x0=Math.min(...c.map(p=>p.x)),y0=Math.min(...c.map(p=>p.y));return{x0,y0,w:Math.max(...c.map(p=>p.x))-x0,h:Math.max(...c.map(p=>p.y))-y0};})();
  const villageLayer=makeCanvas(Math.ceil(VBOX.w*VRES),Math.ceil(VBOX.h*VRES)),vc=villageLayer.getContext('2d');let villageReady=false;
  const PONDS=[];  // 沒被建築佔用的公園街區才有池塘(villagePonds 重算)
  const pondPath=(path,p,grow=0)=>{for(let i=0;i<=40;i++){const t=i/40*Math.PI*2,r=1+.08*Math.sin(3*t+1),q=iso(p.x+Math.cos(t)*(p.rx+grow)*r,p.z+Math.sin(t)*(p.rz+grow)*r);i?path.lineTo(q.x,q.y):path.moveTo(q.x,q.y);}path.closePath();};
  function buildVillageLayer(){
    groundGen++;   // 只在 generateGround 最後呼叫:地面與村莊層都換了(GL 材質要重傳)
    villageReady=false;if(!conceptTex.grass||!conceptTex.earth||!conceptTex.stone)return;
    vc.setTransform(1,0,0,1,0,0);vc.clearRect(0,0,villageLayer.width,villageLayer.height);
    vc.setTransform(VRES,0,0,VRES,-VBOX.x0*VRES,-VBOX.y0*VRES);vc.imageSmoothingEnabled=VRES<4;vc.imageSmoothingQuality='high';
    // 所有多邊形統一成同一個繞向(面積為正):nonzero 填色時,繞向相反的兩塊疊在一起會互相抵銷成洞
    // (街道段與整塊鋪滿的街區重疊處會露出草地),統一之後重疊處只會加深、不會挖空。
    const poly=(path,pts)=>{let area=0;for(let i=0;i<pts.length;i++){const p=pts[i],q=pts[(i+1)%pts.length];area+=p.x*q.y-q.x*p.y;}if(area<0)pts=[...pts].reverse();
      path.moveTo(pts[0].x,pts[0].y);for(const q of pts.slice(1))path.lineTo(q.x,q.y);path.closePath();};
    const quad=(path,x0,z0,x1,z1)=>poly(path,[iso(x0,z0),iso(x1,z0),iso(x1,z1),iso(x0,z1)]);
    const seg=(path,r,w)=>{const dx=r.b.x-r.a.x,dz=r.b.z-r.a.z,L=Math.hypot(dx,dz)||1,nx=-dz/L*w,nz=dx/L*w,ex=dx/L*w*.6,ez=dz/L*w*.6,sa=r.door?0:1;  // 門前小路起點(台階腳)不外延,石板不會鋪進建築
      poly(path,[[r.a.x+nx-ex*sa,r.a.z+nz-ez*sa],[r.b.x+nx+ex,r.b.z+nz+ez],[r.b.x-nx+ex,r.b.z-nz+ez],[r.a.x-nx-ex*sa,r.a.z-nz-ez*sa]].map(([x,z])=>iso(x,z)));};
    const B=VILLAGE_BOUNDS,land=new Path2D(),stone=new Path2D(),earth=new Path2D(),w=GRID.street;
    quad(land,B.minX,B.minZ,B.maxX,B.maxZ);for(const p of PONDS)pondPath(land,p);   // 池塘是洞(evenodd)
    for(const r of roads){if(!inVillage(r.a.x,r.a.z)&&!inVillage(r.b.x,r.b.z))continue;seg(r.kind==='stone'?stone:earth,r,r.width);}
    // 整個村莊地板鋪滿石板(範圍見 landscape-layout.pavedRings,畫面與村內尋路共用同一份)。
    for(const r of roads.paved||[])quad(stone,r.minX,r.minZ,r.maxX,r.maxZ);
    const VT=1/TERRAIN_TEX_SCALE,fill=(path,img,rule='nonzero')=>{vc.save();vc.clip(path,rule);const pat=vc.createPattern(img,'repeat');vc.scale(1/VT,1/VT);vc.fillStyle=pat;vc.fillRect(VBOX.x0*VT,VBOX.y0*VT,VBOX.w*VT,VBOX.h*VT);vc.restore();};  // 跟村外地面同一個材質密度
    // 石板的斜率要跟建築一樣:材質沿世界 x、z 軸排成等角斜格(2:1),不是正對螢幕的水平/垂直方格。
    // 材質的 u 軸 → (2k, k)、v 軸 → (−2k, k)(畫面單位);材質一格石板(16 材質像素)= 一片地磚(TILE,世界單位)⇒ k = 9·TILE/32。
    // 網格以村界的西北角為起點,所以村界邊緣是整片地磚。
    const isoFill=(path,img)=>{const pat=vc.createPattern(img,'repeat');if(!pat.setTransform){fill(path,img);return;}
      const k=9*TILE/32,o=iso(B.minX,B.minZ);pat.setTransform(new DOMMatrix([2*k,k,-2*k,k,o.x,o.y]));vc.save();vc.clip(path);vc.fillStyle=pat;vc.fillRect(VBOX.x0,VBOX.y0,VBOX.w,VBOX.h);vc.restore();};
    fill(land,conceptTex.grass,'evenodd');
    vc.save();vc.clip(land,'evenodd');
    vc.save();vc.translate(0,.8);vc.fillStyle='rgba(70,48,24,.55)';vc.fill(earth);vc.restore();fill(earth,conceptTex.earth);vc.fillStyle='rgba(60,35,15,.12)';vc.fill(earth);
    vc.save();vc.translate(0,1.2);vc.fillStyle='rgba(96,80,66,.85)';vc.fill(stone);vc.restore();   // 石板路緣暗邊
    isoFill(stone,conceptTex.stone);
    vc.restore();
    // 池塘岸:一圈濕土與石頭色描邊
    vc.save();for(const p of PONDS){const e=new Path2D();pondPath(e,p);vc.lineWidth=2.4;vc.strokeStyle='rgba(84,74,52,.95)';vc.stroke(e);vc.lineWidth=1;vc.strokeStyle='rgba(205,236,248,.6)';vc.stroke(e);}vc.restore();
    villageReady=true;
  }

  if(!terrainLoadsPending)generateGround();   // 地面貼圖還在載入就先不畫,載完由 update() 畫一次(避免啟動時重畫好幾次)

  function resize(){canvas.style.transform='';const r=canvas.getBoundingClientRect();rectCache=r;if(glCanvas)glBox(r);const actualWidth=Math.max(320,Math.round(r.width||innerWidth)),actualHeight=Math.max(260,Math.round(r.height||innerHeight));if(actualWidth===width&&actualHeight===height&&canvas.width===Math.round(actualWidth*renderDprMax))return;   /* 大小沒變就不重新配置七張畫布(縮放視窗時不白做整張重建) */const dpr=renderDprMax;canvas.width=Math.round(actualWidth*dpr);canvas.height=Math.round(actualHeight*dpr);width=actualWidth;height=actualHeight;/* 畫布用裝置解析度:像素圖一樣最近鄰放大,文字直接用高解析畫 */sizeLayers();staticKey=bgKey=null;spgGen=sgGen=-1;compValid=false;  /* 全部用裝置解析度畫(高 DPI 螢幕上像素圖也清楚) */screen.imageSmoothingEnabled=false;bg.imageSmoothingEnabled=false;sg.imageSmoothingEnabled=false;spg.imageSmoothingEnabled=false;cmp.imageSmoothingEnabled=false;const n=2*Math.max(.62,Math.min(1.18,width/1140,(height/2-56)/300));scale*=n/baseScale;baseScale=n;if(!lastSource){scale=n;lastSource=true;}}
  // 2D 的七張暫存層跟畫布同大;GL 模式用不到,縮成 1×1 省記憶體(退回 2D 時再放大)
  function sizeLayers(){const w=glr?1:canvas.width,h=glr?1:canvas.height;for(const c of [shadowLayer,spriteLayer,shadowStatic,bgCache,fullStatic,rdl,comp]){c.width=w;c.height=h;}}
  // WebGL 畫布疊在原畫布正下方(同一個框,不收事件)
  function glBox(r){const s=glCanvas.style,w=Math.max(320,Math.round(r.width||innerWidth)),h=Math.max(260,Math.round(r.height||innerHeight));s.left=(r.left||0)+'px';s.top=(r.top||0)+'px';s.width=w+'px';s.height=h+'px';}
  // 切換 GL/2D(context 遺失/恢復):換掉各層的繪圖對象,快取全部作廢
  function useGL(on){glr=on?glKeep:null;bg=glr?glMain:screen;sg=glr?glShadow:sg2d;spg=glr?glSprite:spg2d;g=bg;if(glCanvas)glCanvas.style.display=glr?'':'none';
    staticKey=bgKey=null;spgGen=sgGen=-1;compValid=false;lastViewKey='';glGroundSeen=-1;sizeLayers();sg2d.imageSmoothingEnabled=spg2d.imageSmoothingEnabled=cmp.imageSmoothingEnabled=false;}
  // 鏡頭位移一律取整數再疊物件自己的整數位移。
  // 舊寫法 Math.round(width/2+(p.x-cam.x)*scale) 把鏡頭的小數和物件自己的小數一起進位:
  // 平移時每個物件的進位時機不同,彼此的相對距離會在 0/1px 之間來回 → 看起來就是地圖物件在抖。
  // T95:重擊的鏡頭震動。只加在畫面投影上(camPxX/camPxY),不動 cam/target;unproject 不看 shake,
  // 所以震動中點擊、拖曳換算的世界座標完全一樣。震幅以 1440x900 DPR1 為基準,乘 scale/baseScale 讓各縮放看起一樣大。
  // 方向用固定雜訊每 40ms 換一格(每幀隨機會閃);衰减 amp*(1-t)^2;同時兩個事件取大的,不相加。
  let shakeBase=0,shakeMs=0,shakeT=0,shakeX=0,shakeY=0,lastShakeSeq=0;
  let reduceMotion=false;
  try{const mq=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');if(mq){reduceMotion=!!mq.matches;mq.addEventListener?.('change',e=>{reduceMotion=!!e.matches;});}}catch{}
  const shakeAllowed=()=>state.settings?.shake!==false&&!reduceMotion;
  // T106:重擊停格(hitstop)。世界端只做一件事:這段毫秒數內整幀不重畫,canvas 停在「打下去」那一格。
  // elapsed、鏡頭 lerp、戰鬥結算都不推進(重畫才推進),恢復後不會補跳;跟震動同一個開關與 reduced-motion。
  let hitStopUntil=0,hitStopSeq=-1,hitStopCount=0,hitStopSkipped=0,hitStopPainted=-1;
  const hitStopAllowed=()=>state.settings?.shake!==false&&!reduceMotion;
  const shakeAmpNow=()=>shakeMs>0?shakeBase*Math.pow(1-Math.min(1,shakeT/shakeMs),2):0;   // 目前的震幅(px,純量;不是 hypot)
  function shake(amp,ms){
    if(!shakeAllowed()||!(amp>0)||!(ms>0)){shakeBase=shakeMs=shakeT=shakeX=shakeY=0;return 0;}
    const px=amp*scale/(baseScale||1);
    if(shakeT<shakeMs&&shakeAmpNow()>=px)return 0;   // 還在震的事件比較大就讓它震完,不疊加
    shakeBase=px;shakeMs=ms/1000;shakeT=0;return px;
  }
  function stepShake(dt){
    if(!shakeAllowed()){shakeBase=shakeMs=shakeT=shakeX=shakeY=0;return;}
    if(!(shakeMs>0)){shakeX=shakeY=0;return;}
    shakeT+=Math.max(0,dt||0);
    if(shakeT>=shakeMs){shakeBase=shakeMs=shakeT=shakeX=shakeY=0;return;}
    const a=shakeAmpNow();
    const phase=Math.floor(shakeT/0.04);
    const r=((Math.imul(phase,2654435761)>>>0)/4294967296);
    shakeX=a*Math.cos(r*6.2832);shakeY=a*Math.sin(r*6.2832)*0.7;
  }
  const camPxX=()=>R(width/2-cam.x*scale+shakeX),camPxY=()=>R(height/2+50-cam.y*scale+shakeY);
  function screenPoint(x,z,y=0){const p=iso(x,z);return{x:camPxX()+R(p.x*scale),y:camPxY()+Math.round((p.y-y*8)*scale)};}
  function project(x,y=0,z=0){const p=screenPoint(x,z,y);return{x:p.x,y:p.y,visible:p.x>=0&&p.x<=width&&p.y>=0&&p.y<=height};}
  function viewRect(){return rectCache||(rectCache=canvas.getBoundingClientRect());}   // 快取:每次 pointermove 都 getBoundingClientRect 會強制版面計算,拖動與縮放明顯變重
  function unproject(clientX,clientY){const r=viewRect(),sx=(clientX-r.left)*width/r.width,sy=(clientY-r.top)*height/r.height,ix=(sx-width/2)/scale+cam.x,iy=(sy-height/2-50)/scale+cam.y;return{x:(ix/PX+iy/PY)/2,z:(iy/PY-ix/PX)/2,sx,sy};}
  function focusHome(){
    homeFraming=true;
    const bounds=[];
    for(const b of BUILDINGS){
      if(b.id==='dungeon'||state.buildings?.[b.id]===0)continue;
      const pos=state.layout?.[b.id]||b,p=iso(pos.x,pos.z),sprite=atlasCell(b.id),lod=sprite?null:atlasFrameFor(b.id,false);
      const frame=lod?.frames[b.id],fallback=sprite||buildingSprite(b.id);
      const w=frame?frame.w*BUILDING_WORLD_WIDTH*lod.k*(BUILDING_SCALE[b.id]||1):conceptBuildingWidth(b.id);
      const h=frame?w*frame.h/frame.w:w*fallback.height/fallback.width;
      bounds.push({left:p.x-w/2,right:p.x+w/2,top:p.y-h+9,bottom:p.y+20});
    }
    // 村界(柵欄)一圈也要整個看得到:四個角投影到畫面,北角多留柵欄立柱的高度,南角多留一點地面。
    {const V=VILLAGE_BOUNDS,c=[iso(V.minX,V.minZ),iso(V.maxX,V.minZ),iso(V.maxX,V.maxZ),iso(V.minX,V.maxZ)];
     bounds.push({left:Math.min(...c.map(p=>p.x))-8,right:Math.max(...c.map(p=>p.x))+8,top:Math.min(...c.map(p=>p.y))-24,bottom:Math.max(...c.map(p=>p.y))+12});}
    if(!bounds.length)return;
    const left=Math.min(...bounds.map(b=>b.left)),right=Math.max(...bounds.map(b=>b.right));
    const top=Math.min(...bounds.map(b=>b.top)),bottom=Math.max(...bounds.map(b=>b.bottom));
    const topMargin=(document.querySelector('#topbar')?.getBoundingClientRect().height||76)+16;
    const bottomMargin=(document.querySelector('#bottom-bar')?.getBoundingClientRect().height||94)+16;
    // 緊湊的村莊:整村放在可用畫面(上下列之間)的正中,放大到剛好放得下(最多比預設倍率大 1.3 倍)。
    const mid={x:(left+right)/2,y:(top+bottom)/2},midY=(topMargin+height-bottomMargin)/2;
    const room=(available,extent)=>available/Math.max(1,extent);
    scale=Math.max(.48,Math.min(baseScale*1.3,room(width-48,right-left),room(height-topMargin-bottomMargin,bottom-top)));
    target={x:mid.x,y:mid.y-(midY-(height/2+50))/scale};cam={...target};
  }
  function focus(id){let pos;if(id==='home'||!id){focusHome();return;}if(id==='world'){const X0=(WORLD.minX-WORLD.maxZ)*9,X1=(WORLD.maxX-WORLD.minZ)*9,Y0=(WORLD.minX+WORLD.minZ)*4.5,Y1=(WORLD.maxX+WORLD.maxZ)*4.5;
      const topM=(document.querySelector('#topbar')?.getBoundingClientRect().height||76)+8,bottomM=(document.querySelector('#bottom-bar')?.getBoundingClientRect().height||94)+8;   // 上下列之間的可用高度
      scale=Math.max(zoomFloor(),Math.min(ZOOM_MAX,(width-24)/(X1-X0),(height-topM-bottomM)/(Y1-Y0)));const midY=(topM+height-bottomM)/2;target={x:(X0+X1)/2,y:(Y0+Y1)/2-(midY-(height/2+50))/scale};return;}if(id.startsWith?.('region:'))pos=REGIONS.find(r=>r.id===id.slice(7));else if(id==='hunt')pos=REGIONS.find(r=>r.id===state.region)||REGIONS[1];else if(id.startsWith?.('hunter:'))pos=state.hunters?.find(h=>String(h.id)===id.slice(7));else pos=BUILDINGS.find(b=>b.id===id);if(pos){const override=state.layout?.[id];const p=iso(override?.x??pos.x,override?.z??pos.z);target={x:p.x,y:p.y+(id.startsWith?.('region:')?30:-25)};scale=Math.max(baseScale,Math.min(3.1,baseScale*1.28));}}
  function setSelected(id){selected=id;}
  // 縮放階梯:每個元素都各自把自己的世界座標四捨五入到整數螢幕像素,所以 scale 每動一點點,
  // 所有元件都會各自「跳一格」= 縮放時整個畫面在抖。把使用者縮放鎖在等比階梯(約 1.05 倍一階)上,
  // 位置重排只發生在換階的瞬間;階梯夠細(5%),連續 pinch 看起來就是平滑的,不會一格一格跳。
  const ZOOM_MIN=.75,ZOOM_MAX=5.4;   // 最遠只能放到 0.75 倍(再遠就只會看到一堆海)
  const ZOOM_LADDER=(()=>{const a=[];for(let s=.48;s<=ZOOM_MAX+.0001;s*=1.05)a.push(+s.toFixed(3));return a;})();
  // 縮小的下限:0.75,但「首頁剛好放得下整村」如果比 0.75 小(手機),就以現在的比例為下限,不會反而放大。
  const zoomFloor=()=>Math.min(ZOOM_MIN,scale);
  const snapZoom=v=>{let best=ZOOM_LADDER[0];for(const s of ZOOM_LADDER)if(Math.abs(Math.log(s/v))<Math.abs(Math.log(best/v)))best=s;return best;};
  // 縮放一律吸附到階梯:吸附後比例只會在換階時變一次,每一幀都能直接以當下比例重繪(不靠 CSS 變形拉上一幀的畫面),
  // 縮放的過程是實時畫面,不會停住不動;換階之間的比例沒變,靜態層快取照樣命中,所以看起來也不抖。
  function zoomBy(factor){markInput();homeFraming=false;const floor=zoomFloor();scale=Math.max(floor,snapZoom(Math.max(floor,Math.min(ZOOM_MAX,scale*factor))));}
  function placeMode(id){placing=id;canvas.style.cursor=id?'crosshair':'grab';}
  // 鏡頭範圍由世界大小算出(世界的等角外框再多留一圈,能看到海岸與西側林地)。
  const CAM_X0=(WORLD.minX-WORLD.maxZ)*9-140,CAM_X1=(WORLD.maxX-WORLD.minZ)*9+20,CAM_Y0=(WORLD.minX+WORLD.minZ)*4.5-40,CAM_Y1=(WORLD.maxX+WORLD.maxZ)*4.5+50;
  const clampCam=()=>{target.x=Math.max(CAM_X0,Math.min(CAM_X1,target.x));target.y=Math.max(CAM_Y0,Math.min(CAM_Y1,target.y));};
  // T141：手機手感——拖曳甩動慣性、雙擊縮放、雙指縮放釘住指間的世界點
  let inertia=null;   // {vx,vy} 螢幕像素/毫秒，放手後指數衰減
  let lastTapT=0,lastTapX=0,lastTapY=0;
  const zoomAt=(sx,sy,factor)=>{const before=unproject(sx,sy);zoomBy(factor);const after=unproject(sx,sy),b=iso(before.x,before.z),a=iso(after.x,after.z);target.x+=b.x-a.x;target.y+=b.y-a.y;cam={...target};clampCam();};
  function down(e){markInput();if(e.button!==undefined&&e.button!==0&&e.button!==1)return;try{canvas.setPointerCapture?.(e.pointerId);}catch{}   /* 取得到就鎖住指標;某些情況(合成事件、已被取消的指標)會拋錯,不能讓它中斷後面的手勢初始化 */pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===2){const pts=[...pointers.values()];pinchDistance=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y);pointer=null;return;}pointer={id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,moved:false,t:performance.now(),vx:0,vy:0};inertia=null;canvas.style.cursor=placing?'crosshair':'grabbing';}
  function move(e){markInput();hover=unproject(e.clientX,e.clientY);hoverBuilding=e.pointerType==='mouse'&&!pointer?hoverIdAt(hover.sx,hover.sy):null;if(pointers.has(e.pointerId))pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===2){const pts=[...pointers.values()],dist=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y);if(pinchDistance&&dist>0){zoomAt((pts[0].x+pts[1].x)/2,(pts[0].y+pts[1].y)/2,dist/pinchDistance);}pinchDistance=dist;return;}if(!pointer||pointer.id!==e.pointerId)return;const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;if(Math.hypot(e.clientX-pointer.startX,e.clientY-pointer.startY)>5)pointer.moved=true;if(!followFn){target.x-=dx/scale;target.y-=dy/scale;cam={...target};clampCam();}const nowMs=performance.now(),dtMs=Math.max(1,nowMs-(pointer.t||nowMs));pointer.vx=(e.clientX-pointer.x)/dtMs;pointer.vy=(e.clientY-pointer.y)/dtMs;pointer.t=nowMs;pointer.x=e.clientX;pointer.y=e.clientY;}   // 跟隨角色時不讓拖曳把鏡頭拉走(下一幀就會被拉回來,只會抖一下)
  function up(e){const p=pointer;const wasTouch=(e.pointerType==='touch');pointers.delete(e.pointerId);pinchDistance=0;pointer=null;if(p&&p.moved&&wasTouch&&!followFn){inertia={vx:p.vx||0,vy:p.vy||0};}if(p&&!p.moved&&wasTouch&&!placing){const nowMs=performance.now();const near=Math.hypot(e.clientX-lastTapX,e.clientY-lastTapY)<28;if(nowMs-lastTapT<320&&near){lastTapT=0;inertia=null;zoomAt(e.clientX,e.clientY,scale>=ZOOM_MAX*0.98?1/1.25:1.25);canvas.style.cursor=placing?'crosshair':'grab';return;}lastTapT=nowMs;lastTapX=e.clientX;lastTapY=e.clientY;}canvas.style.cursor=placing?'crosshair':'grab';if(!p||p.moved)return;const q=unproject(e.clientX,e.clientY);if(placing){onPlace(placing,R(q.x*2)/2,Math.round(q.z*2)/2);return;}for(let i=hits.length-1;i>=0;i--){const hit=hits[i];if(q.sx>=hit.x&&q.sx<=hit.x+hit.w&&q.sy>=hit.y&&q.sy<=hit.y+hit.h){onSelect(hit.id);return;}}onSelect(null);}
  function wheel(e){e.preventDefault();markInput();const before=unproject(e.clientX,e.clientY);zoomBy(e.deltaY<0?1.1:1/1.1);const after=unproject(e.clientX,e.clientY),b=iso(before.x,before.z),a=iso(after.x,after.z);target.x+=b.x-a.x;target.y+=b.y-a.y;cam={...target};clampCam();}
  canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);canvas.addEventListener('wheel',wheel,{passive:false});canvas.addEventListener('pointerleave',()=>{hoverBuilding=null;});canvas.style.cursor='grab';

  // 腳底接觸暗(很小、很貼地):真正的影子是 cast() 的剪影投影。
  function contact(p,w=5){g.fillStyle='#221a3a40';g.beginPath();g.ellipse(p.x-.6*scale,p.y,Math.max(2,w*scale),Math.max(1,w*.32*scale),0,0,Math.PI*2);g.fill();}
  function shadow(p,w=12,h=4,color='#304a3660'){g.fillStyle=color;g.beginPath();g.ellipse(p.x,p.y,Math.max(2,w*scale),Math.max(1,h*scale),0,0,Math.PI*2);g.fill();}
  // 投影:物件畫出去的同時把它的剪影影子畫進 shadowLayer。cap = 影子最長幾個世界單位(樹冠長、建築短)。
  const SHADOW_CAP={building:32,tree:58,char:40,prop:30},SHADOW_ALPHA=.56;
  function cast(img,sx,sy,sw,sh,dx,dy,dw,dh,flip=false,grounded=true,kind='prop'){
    if(!shadowsOn||!casting||!img||sw<2||sh<2||dw<2||dh<2||shadowMode==='skip')return;
    const wpp=2**(Math.round(Math.log2(dh/scale/sh)*4)/4),s=shadowFor(img,sx,sy,sw,sh,flip,wpp,grounded,SHADOW_CAP[kind]||30),k=dw/s.sw;
    const x0=Math.round(dx-s.ex*k),y0=Math.round(dy),w=Math.round(s.W*k),h=Math.round(s.H*k);
    if(shadowMode==='record')ssc.drawImage(s.cv,x0,y0,w,h);else{sg.drawImage(s.cv,x0,y0,w,h);if(shadowSink)shadowSink.push(x0,y0,x0+w,y0+h);}
  }
  function drawSprite(sprite,p,w,h,offset=0,alpha=1,kind=null){const ww=Math.round(w*scale),hh=Math.round(h*scale);if(boxSink)boxSink.push(R(p.x-ww/2),R(p.y-hh+offset*scale),R(p.x-ww/2)+ww,R(p.y-hh+offset*scale)+hh);if(kind)cast(sprite,0,0,sprite.width,sprite.height,R(p.x-ww/2),R(p.y-hh+offset*scale),ww,hh,false,kind!=='building',kind);g.globalAlpha=alpha;g.drawImage(sprite,R(p.x-ww/2),R(p.y-hh+offset*scale),ww,hh);
    if(flashNext){const fl=flashNext,tf=g.getTransform(),fa=alpha*fl.alpha,tc=tinted(sprite,0,0,sprite.width,sprite.height,fl.color),x=R(p.x-ww/2),y=R(p.y-hh+offset*scale);
      deferTopVfx(()=>{g.save();g.setTransform(tf);g.globalAlpha=fa;g.drawImage(tc,x,y,ww,hh);g.restore();});}g.globalAlpha=1;return{x:p.x-ww/2,y:p.y-hh+offset*scale,w:ww,h:hh};}
  // 把圖集物件 contain 進「世界單位外框」並畫出。回傳 true = 畫成功。
  // contain 而不是拉伸:保持出土物件的等比,尺寸由外框決定(版面才不會跑掉)。
  // 平貼地面的不投影;寬的(圍籬、攤位、桌椅)每欄自己的地面;其他(人、樹、旗、燈)整張一個地面。
  const FLAT_DETAIL=new Set(['frozenPond','flowerYellow','flowerPink','flowerBlue','flowerWhite','plot','wheat','cabbage','garden']);
  const WIDE_DETAIL=new Set(['cliffLedge','snowDrift','fallenLog','streamBridge','bankRocks','waterfall','fenceRail','fence','stall','fruitStand','tableSet','bench','handCart','well','flowerBox','riverRocks','boulders','outcrop','cave','ruin','trough','crates','barrels','hayBale','firewood','sacks','railing','signpost']);
  const CHAR_DETAIL=new Set(['merchant','farmer','child','elder','smith','maid','cat','dog','sheep','goat']);
  const FENCE_RAIL_SHEAR=.125;  // .5(2:1 格線)− 柵欄素材實測斜率 .375
  function drawAtlasDetail(id,p,bw,bh,offset=0,alpha=1,flip=false){
    const lod=detailFrameFor(id,scale*DPRK>=2.2);
    if(!lod)return false;
    const c=lod.frames[id];
    const rs=Math.min(bw*scale/c.w,bh*scale/c.h);
    const dw=Math.max(1,Math.round(c.w*rs)),dh=Math.max(1,Math.round(c.h*rs));
    if(lod.scale===2)detailUse.draw2x++;else detailUse.draw1x++;
    g.globalAlpha=alpha;
    const dx=R(p.x-dw/2),dy=R(p.y-dh+offset*scale);
    if(boxSink)boxSink.push(dx,dy,dx+dw,dy+dh);   // 錄製靜態層時記下繪製範圍
    if(!FLAT_DETAIL.has(id))cast(lod.img,c.x,c.y,c.w,c.h,dx,dy,dw,dh,flip,!WIDE_DETAIL.has(id),CHAR_DETAIL.has(id)?'char':'prop');
    // 柵欄橫條原圖只有約 .375 的斜率,格線是 2:1(.5):以中心為軸做垂直剪切補齊,段與段接點才連得上。
    const sh=id==='fenceRail'?FENCE_RAIL_SHEAR:0;
    if(sh){g.save();g.translate(dx+dw/2,dy);g.transform(1,flip?sh:-sh,0,1,0,0);
      if(flip)g.scale(-1,1);g.drawImage(lod.img,c.x,c.y,c.w,c.h,-dw/2,0,dw,dh);g.restore();}
    else if(flip){g.setTransform(-DPRK,0,0,DPRK,DPRK*(dx+dw),DPRK*dy);g.drawImage(lod.img,c.x,c.y,c.w,c.h,0,0,dw,dh);g.setTransform(DPRK,0,0,DPRK,0,0);}   // 直接設定翻轉矩陣(和原本 translate+scale 的結果一樣),不用 save/restore
    else g.drawImage(lod.img,c.x,c.y,c.w,c.h,dx,dy,dw,dh);
    g.globalAlpha=1;
    return {x:dx,y:dy,w:dw,h:dh};
  }
  // 用「每來源像素」的統一倍率畫。不把寬度硬塞成固定值,所以寬一點的建築就真的寬一點。
  function drawAtlasBuilding(id,p,offset=0,mult=1){
    const prefer2x=scale*DPRK>=2.2;
    atlasUse.lastScale=scale;
    const lod=atlasFrameFor(id,prefer2x);
    if(!lod)return null;
    if(lod.scale===2)atlasUse.draw2x++;else atlasUse.draw1x++;
    const c=lod.frames[id];
    // lod.k 是「每來源像素多少世界單位」的倒數基準,要再乘回舊版的世界寬度 71,
  // 否則會畫成 1px 寬(漏乘就等於隱形 —— 踩過一次)。
  const k=BUILDING_WORLD_WIDTH*lod.k*(BUILDING_SCALE[id]||1)*mult;
    const dw=Math.max(1,Math.round(c.w*k*scale)),dh=Math.max(1,Math.round(c.h*k*scale));
    const dx=R(p.x-dw/2),dy=R(p.y-dh+offset*scale);
    cast(lod.img,c.x,c.y,c.w,c.h,dx,dy,dw,dh,false,false,'building');
    g.drawImage(lod.img,c.x,c.y,c.w,c.h,dx,dy,dw,dh);
    return {x:dx,y:dy,w:dw,h:dh};
  }
  function ring(p,w=18,color='#ffe795'){g.strokeStyle='#435041';g.lineWidth=3;g.beginPath();g.ellipse(p.x,p.y,w*scale,w*.43*scale,0,0,Math.PI*2);g.stroke();g.strokeStyle=color;g.lineWidth=1;g.stroke();}
  // T119：canvas 上的文字也走像素字型。Ark Pixel 是照 12px 設計的，字級落在 12 的倍數才不會糊；
  // 文字座標原本就取整了，這裡只負責把字級吸到 12／24／36 並指定字族。
  const TEXT_STEPS=[12,24,36];
  function textSize(n){let best=TEXT_STEPS[0],bd=1e9;for(const s of TEXT_STEPS){const d=Math.abs(s-n);if(d<bd){bd=d;best=s;}}return best;}
  function textFont(n,w='bold'){return w+' '+textSize(n)+'px "Ark Pixel 12", "Microsoft JhengHei", sans-serif';}
  // 文字一律排進 screenTexts,最後在裝置解析度的畫布上畫(高清、永遠在最上層)。
  const screenTexts=[];
  // T151:建築名牌。drawBuilding 只把資料推進 uiLabels;這裡用 map-labels.js 的同一份排版算矩形再照矩形畫,
  // 檢查器(tools/checks/map-labels.mjs)讀 __mistvaleMapLabels 拿到的就是畫出來的矩形。
  // 預設只顯示名稱;滑鼠移到建築(或名牌)上、或選取時才顯示等級,展開的名牌釘在原位、其他名牌讓開。
  let hoverBuilding=null,mapLabelRects=[],mapLabelKey='';
  function hoverIdAt(sx,sy){for(const r of mapLabelRects)if(sx>=r.x&&sx<=r.x+r.w&&sy>=r.y&&sy<=r.y+r.h)return r.id;
    for(let i=hits.length-1;i>=0;i--){const h=hits[i];if(sx>=h.x&&sx<=h.x+h.w&&sy>=h.y&&sy<=h.y+h.h)return h.id;}return null;}
  function drawMapLabels(k){
    if(labelsCanvas.width!==canvas.width||labelsCanvas.height!==canvas.height){labelsCanvas.width=canvas.width;labelsCanvas.height=canvas.height;}
    const screen=labelsG;screen.setTransform(1,0,0,1,0,0);screen.clearRect(0,0,labelsCanvas.width,labelsCanvas.height);screen.imageSmoothingEnabled=false;screen.textAlign='center';screen.textBaseline='middle';
    screen.font=textFont(11*k);
    const items=[];for(const l of uiLabels){const ex=l.id===selected||l.id===hoverBuilding;if(l.show||ex)items.push({...l,expanded:ex&&l.built});}
    const key=width+'x'+height+'@'+k+'|'+items.map(i=>`${i.id},${i.x.toFixed(2)},${i.y.toFixed(2)},${i.level},${i.expanded?1:0}`).join(';');
    if(key!==mapLabelKey){
      const opt={measure:t=>screen.measureText(t).width/k,width,height};
      let out=layoutMapLabels(items.map(i=>({...i,expanded:false})),opt);
      if(items.some(i=>i.expanded)){const at=new Map(out.map(r=>[r.id,r]));
        out=layoutMapLabels(items.map(i=>i.expanded&&at.has(i.id)?{...i,pin:{cx:at.get(i.id).cx,cy:at.get(i.id).cy}}:i),opt);}
      mapLabelRects=out;mapLabelKey=key;
    }
    for(const r of mapLabelRects){const x=Math.round(r.x*k),y=Math.round(r.y*k),w=Math.round(r.w*k),h=Math.round(r.h*k),u=Math.max(1,Math.round(k)),hot=r.id===selected||r.id===hoverBuilding;
      // 2026-11-11 獵魔村風格名牌:炭黑半透明底(--hv-ink #14110f)、白字、無金邊;選取/滑過時字轉金(--hv-gold)。
      // 未建造較淡:底只有 65% 不透明、字偏灰 —— 在最亮的雪地上(底色合成約 #666)字的對比仍 ≥ 3:1。
      if(r.built){
        screen.fillStyle='#14110fd9';screen.fillRect(x,y,w,h);
        screen.fillStyle=hot?'#e6b43c':'#f4ecd6';
      }else{
        screen.fillStyle='#14110fa6';screen.fillRect(x,y,w,h);
        screen.fillStyle=hot?'#f4ecd6':'#cfc6b2';
      }
      screen.fillText(r.text,Math.round(r.cx*k),Math.round(r.cy*k));screen.globalAlpha=1;}
  }
  globalThis.__mistvaleMapLabels=()=>({width,height,scale:+scale.toFixed(3),labels:mapLabelRects.map(r=>({id:r.id,text:r.text,built:r.built,x:+r.x.toFixed(2),y:+r.y.toFixed(2),w:+r.w.toFixed(2),h:r.h}))});
  function textLabel(text,x,y,opts={}){if(document.body.dataset.artReview==='1')return;screenTexts.push({text,x,y,alpha:g.globalAlpha,...opts});}
  // 2026-11-16:地名牌要避開的 HUD 矩形(換成畫布像素)。量 DOM 會觸發版面計算 → 最多每 500ms 量一次
  let hudAvoid=[],hudAvoidAt=-1e9,placedLabels=[];
  function hudAvoidRects(){const now=performance.now();if(now-hudAvoidAt<500)return hudAvoid;hudAvoidAt=now;
    const cr=canvas.getBoundingClientRect();if(!cr.width){hudAvoid=[];return hudAvoid;}const sx=screen.canvas.width/cr.width,sy=screen.canvas.height/cr.height;
    hudAvoid=[...document.querySelectorAll('.hv-actions,.view-tools,#hv-quest,#next-step')].map(e=>e.getBoundingClientRect()).filter(r=>r.width>0&&r.height>0)
      .map(r=>({x0:(r.left-cr.left)*sx,x1:(r.right-cr.left)*sx,y0:(r.top-cr.top)*sy,y1:(r.bottom-cr.top)*sy}));return hudAvoid;}
  function drawScreenText(t,k){if(t.bubble){drawBubble(t,k);return;}const {text,x:x0,y:y0,color='#fff7d9',size=7,back=true,alpha=1}=t;let x=Math.round(x0*k),y=Math.round(y0*k);screen.globalAlpha=alpha;
    screen.font=textFont(size*2*k);const tw=Math.ceil(screen.measureText(text).width);
    // 2026-11-16 UX:地名牌(clamp)在畫面邊緣只露半截(「地」「向陽草」)→ 只要名牌還有一部分在畫面內,就整塊推回畫面內;完全在外面的照舊不畫進來
    if(t.clamp){const W=screen.canvas.width,H=screen.canvas.height,hw=tw/2+5*k,m=4*k;
      if(x+hw>0&&x-hw<W)x=Math.min(W-m-hw,Math.max(m+hw,x));
      if(y+11*k>0&&y-10*k<H)y=Math.min(H-m-11*k,Math.max(m+10*k,y));
      // 右側 HUD 直排鈕(行動徽章、縮放/回村)蓋在地名牌上 → 名牌往左讓開到按鈕左邊
      for(const r of hudAvoidRects())if(y+11*k>r.y0&&y-10*k<r.y1&&x+hw>r.x0&&x-hw<r.x1){if((r.x0+r.x1)/2>W/2)x=Math.max(m+hw,r.x0-m-hw);else y=r.y1+10*k+m;}   // 右側直排鈕 → 往左讓;左上委託追蹤/顧問 → 往下讓
      // 被推開的地名牌可能疊到另一塊地名牌 → 往下挪到不重疊為止(最多 4 次);這一幀放過的名牌記在 placedLabels
      for(let n=0;n<4;n++){const o=placedLabels.find(b=>x+hw>b.x0&&x-hw<b.x1&&y+11*k>b.y0&&y-10*k<b.y1);if(!o)break;y=o.y1+10*k+2*k;}
      placedLabels.push({x0:x-hw,x1:x+hw,y0:y-10*k,y1:y+11*k});}
    if(back){screen.fillStyle='#14110fd9';screen.fillRect(x-tw/2-5*k,y-10*k,tw+10*k,21*k);}   // 2026-11-11:地區名牌同建築名牌,炭黑半透明、無木框金線
    else{screen.lineWidth=Math.max(2,2.6*k);screen.strokeStyle='#1c0e06';screen.lineJoin='round';screen.strokeText(text,x,y);}
    screen.fillStyle=color;screen.fillText(text,x,y);screen.globalAlpha=1;}
  // 英雄對話框:奶油色像素泡泡(切角、深棕外框)＋往下的小尾巴,字畫在螢幕解析度那層(清楚)。
  function drawBubble(t,k){const x=Math.round(t.x*k),y=Math.round(t.y*k),fs=Math.round(11*k),u=Math.max(1,Math.round(k));screen.globalAlpha=t.alpha??1;
    screen.font=textFont(fs);const tw=Math.ceil(screen.measureText(t.text).width),w=tw+12*u,h=fs+10*u,bx=Math.round(x-w/2),by=Math.round(y-h);
    const box=(dx,dy,ww,hh,c)=>{screen.fillStyle=c;screen.fillRect(dx+2*u,dy,ww-4*u,hh);screen.fillRect(dx,dy+2*u,ww,hh-4*u);screen.fillRect(dx+u,dy+u,ww-2*u,hh-2*u);};
    box(bx-2*u,by-2*u,w+4*u,h+4*u,'#3a2414');box(bx,by,w,h,'#fff4dc');screen.fillStyle='#e8d3a8';screen.fillRect(bx+2*u,by+h-2*u,w-4*u,u);   // 底邊一條陰影:有厚度
    screen.fillStyle='#3a2414';for(let i=0;i<4;i++)screen.fillRect(x-(4-i)*u-u,by+h+i*u,(4-i)*2*u+2*u,u);screen.fillStyle='#fff4dc';for(let i=0;i<3;i++)screen.fillRect(x-(3-i)*u,by+h-u+i*u,(3-i)*2*u,u);
    screen.textAlign='center';screen.textBaseline='middle';screen.fillStyle='#3a2414';screen.fillText(t.text,x,by+h/2+u);screen.globalAlpha=1;}
  // 誰在說話:每位英雄每 14–28 秒(流浪英雄 22–36 秒)講一句、停 3.4 秒;畫面上同時最多 3 個泡泡,只算看得到的人;
  // 拉得太遠(scale 小)不講,免得滿畫面字。時間用畫面時間(elapsed:暫停就停、不受 2–3 倍速影響,字才讀得完)。
  const chatter=new Map(),CHAT_SHOW=3.4,CHAT_MAX=3;
  function drawChatter(){if(scale<1.1||document.body.dataset.artReview==='1')return;const t=elapsed,night=nightOn&&phase>.55&&phase<.95;
    const who=[...(state.hunters||[]).map(h=>[h,false]),...(state.wanderers||[]).map(w=>[w,true])].filter(([h])=>Number.isFinite(h.x)&&Number.isFinite(h.z));
    const seen=[];for(const [h,wd] of who){const p=screenPoint(h.x,h.z);if(p.x>-30&&p.x<width+30&&p.y>20&&p.y<height+40)seen.push([h,wd,p]);}
    let showing=seen.filter(([h])=>t<(chatter.get(h.id)?.until??0)).length;
    for(const [h,wd,p] of seen){let c=chatter.get(h.id);if(!c){c={next:t+3+(hash(h.id)%160)/10,until:0,text:'',last:''};chatter.set(h.id,c);}
      if(t>=c.until&&t>=c.next){if(showing<CHAT_MAX){const line=pickHeroLine(h,{wanderer:wd,night,rnd:Math.random,last:c.last});
          if(line){c.text=line;c.last=line;c.until=t+CHAT_SHOW;c.next=t+(wd?22:14)+Math.random()*14;showing++;}else c.next=t+6;}else c.next=t+1.5+Math.random()*2.5;}
      if(t<c.until){const left=c.until-t,a=Math.min(1,(CHAT_SHOW-left)/.18,left/.35);textLabel(c.text,p.x,p.y-(HERO_H+18)*scale,{bubble:true,alpha:a});}}}
  globalThis.__mistvaleChatter=()=>[...chatter].map(([id,c])=>({id,text:c.text,showing:elapsed<c.until}));   // 驗收用
  // 物件那一輪(casting)裡畫的血條、名牌延後到最上層:不會被後畫的魔物、樹蓋住。
  const overlays=[];
  // T61:打在魔物/角色身上的特效(受擊閃光、蓄力表)延後到物件那一輪之後的最上層,任何角色、魔物、樹、道具都不會蓋住它。
  // 只在物件那一輪(casting)延後;已在特效/文字那一輪(casting=false)就照原順序直接畫,不會被延到下一幀。
  const topVfx=[];
  function deferTopVfx(fn){if(casting)topVfx.push(fn);else fn();}
  function flushTopVfx(){for(const f of topVfx.splice(0))f();}
  function bar(x,y,w,frac,color){if(casting){overlays.push(()=>bar(x,y,w,frac,color));return;}pixel(g,x-1,y-1,w+2,6,'#1c0e06dd');pixel(g,x,y,w,4,'#5a2f14');pixel(g,x,y,Math.max(0,w*Math.min(1,frac)),4,color);pixel(g,x,y,Math.max(0,w*Math.min(1,frac)),2,shade(color,25));}
  function getLevel(id){const level=state.buildings?.[id];return typeof level==='number'?level:level?.level??1;}

  const SPRITE_SHIFT={};
  // 各建築圖左右立面斜率(實測)換算成[垂直縮放 σ(以 √σ 垂直、1/√σ 水平分攤), 剪切 k],使立面變成 +.5 / -.5。
  // 量法:邊緣像素沿候選斜率投影,取最銳利的那個;校正後重量結果為 (.50,-.50)。bounty 右面量不準,只校左面。
  const BUILDING_FACADE={hall:[1.136,.051],inn:[1.124,.022],trading:[1.111,.017],restaurant:[1.087,.005],tavern:[1.042,-.036],forge:[1.015,-.018],clinic:[1.042,.01],academy:[1.053,-.005],training:[.93,.049],sanctuary:[.971,.049],house:[.93,.067],bounty:[1,.035],enhancement:[1.047,-.013]};
  // 建築不能壓到四周的街:用圖的實際像素算出「在這個街區裡最大能畫多大」。
  // 地面那一段(錨點以下)要落在街區內的菱形裡;整張圖左右不超過菱形的左右角。結果快取(圖、街區、尺寸)。
  const fitCache=new Map();
  function blockHalf(x,z){const w=STREET_X.filter(v=>v<x).at(-1),e=STREET_X.find(v=>v>x),n=STREET_Z.filter(v=>v<z).at(-1),sv=STREET_Z.find(v=>v>z);
    if(w==null||e==null||n==null||sv==null)return null;const m=GRID.street+.15;return{w:x-w-m,e:e-x-m,n:z-n-m,s:sv-z-m};}
  function fitScaleFor(key,img,sx,sy,sw,sh,W,H,pos){
    const half=blockHalf(pos.x,pos.z);if(!half)return {k:1.6,c:{x:0,z:0}};const k0=`${key}:${W}:${pos.x},${pos.z}`;if(fitCache.has(k0))return fitCache.get(k0);
    const cw=Math.min(160,sw),ch=Math.max(1,Math.round(sh*cw/sw)),c=makeCanvas(cw,ch),cx=c.getContext('2d',{willReadFrequently:true});cx.drawImage(img,sx,sy,sw,sh,0,0,cw,ch);
    // 每一欄最低的不透明像素＝貼地點(牆腳、露台邊、台階):不管在錨點上方或下方,都要落在街區內。
    // 整張圖的左右也不能超過街區菱形的左右角。
    const a=cx.getImageData(0,0,cw,ch).data,ground=[],xs=[];
    for(let x=0;x<cw;x++){let yb=-1;for(let y=ch-1;y>=0;y--)if(a[(y*cw+x)*4+3]>100){yb=y;break;}if(yb<0)continue;const X=(x+.5)/cw*W-W/2;ground.push([X,9-H+(yb+.5)/ch*H]);xs.push(X);}
    // 屋簷懸空的欄不算貼地:等角地面線從最低點往兩側以 1:2 上升,只收離地面線 12% 圖寬以內的點。
    {const yMax=Math.max(...ground.map(g=>g[1])),xMid=ground.find(g=>g[1]===yMax)?.[0]??0,T=.12*W;for(let i=ground.length-1;i>=0;i--){const [X,Y]=ground[i];if(Y<yMax-Math.abs(X-xMid)*.5-T)ground.splice(i,1);}}
    // 置中:貼地輪廓(左角→前角→右角)涵蓋整個佔地的 x、z 範圍,外框中心＝佔地中心 → 移到街區正中。
    const center=k=>{let a0=1e9,a1=-1e9,b0=1e9,b1=-1e9;for(const [X,Y] of ground){const x=k*X,y=9-k*(9-Y),dx=(x/9+y/4.5)/2,dz=(y/4.5-x/9)/2;a0=Math.min(a0,dx);a1=Math.max(a1,dx);b0=Math.min(b0,dz);b1=Math.max(b1,dz);}
      const c=ground.length?{x:(a0+a1)/2,z:(b0+b1)/2}:{x:0,z:0},cx=Math.max(-2.5,Math.min(2.5,c.x)),cz=Math.max(-2.5,Math.min(2.5,c.z));return {x:cx,z:cz};};
    const ok=k=>{const c=center(k),sx=(c.x-c.z)*9;for(const X of xs){const x=k*X-sx;if(x>(half.e+half.n)*9||x<-(half.w+half.s)*9)return false;}
      return ground.every(([X,Y])=>{const x=k*X,y=9-k*(9-Y),dx=(x/9+y/4.5)/2-c.x,dz=(y/4.5-x/9)/2-c.z;return dx<=half.e&&dx>=-half.w&&dz<=half.s&&dz>=-half.n;});};
    let lo=.3,hi=1.6;if(ok(hi))lo=hi;else for(let i=0;i<18;i++){const m=(lo+hi)/2;if(ok(m))lo=m;else hi=m;}
    const r={k:lo,c:center(lo)};fitCache.set(k0,r);return r;}
  // 畫面上的實際倍率 = 統一倍率（BUILDING_UNIFORM_SCALE）。2026-10-13 改成固定值。
  // 街區容得下的最大值(f.k) 仍要算:只用它的**置中位移** c,不用它的 k —— 建築擺在自己街區正中不變。
  // 回傳 {k: 實際倍率, c: 置中位移(世界單位)}。
  // 統一大小：每棟都畫「目前最大的那棟 × 0.5」的寬度（動態算 —— 升級/新建大棟時全部一起跟著調整）。
  // 不只是倍率統一:連「大廳天生比小屋寬」這個差異也拿掉,畫面上每棟一樣大。
  function uniformBuildingWidth(){let mx=0;
    for(const b of BUILDINGS)if((state.buildings||{})[b.id])mx=Math.max(mx,conceptBuildingWidth(b.id)*(state.layout?.[b.id]?.s??1));
    return (mx||conceptBuildingWidth('hall'))*BUILDING_UNIFORM_RATIO;}
  function buildingFit(id){const b=BUILDINGS.find(q=>q.id===id);if(!b)return {k:1,c:{x:0,z:0}};const pos=state.layout?.[id]||b,sp=atlasCell(id);let f;
    if(sp){const W=conceptBuildingWidth(id);f=fitScaleFor(id,sp,0,0,sp.width,sp.height,W,W*sp.height/sp.width,pos);}
    else{const lod=atlasFrameFor(id,false),c=lod?.frames[id];if(!c)return {k:1,c:{x:0,z:0}};const k=BUILDING_WORLD_WIDTH*lod.k*(BUILDING_SCALE[id]||1);f=fitScaleFor(id+'@a',lod.img,c.x,c.y,c.w,c.h,c.w*k,c.h*k,pos);}
    const k=1,r=k/f.k;return {k,c:{x:f.c.x*r,z:f.c.z*r}};}
  function effectiveScale(id){return buildingFit(id).k;}  // 棋盤格:每棟建築畫在自己街區正中
  // 每棟建築「可見像素」的範圍(0..1,相對圖片)。互動框要貼著建築最下面那一排(門口/台階所在),
  // 所以要先把透明的留白去掉,不能用整張圖的矩形。
  const spriteBoundsCache=new Map();
  globalThis.__mistvaleSpriteBounds=(id)=>spriteBounds(id);
  function spriteBounds(id){
    if(spriteBoundsCache.has(id))return spriteBoundsCache.get(id);
    let sp=null;try{sp=atlasCell(id);}catch{}
    if(!sp||sp.width<16)return {x0:0,x1:1,y0:0,y1:1};   // 圖集還沒好:先回整張,不快取
    let out=null;
    try{
      const t=document.createElement('canvas');t.width=sp.width;t.height=sp.height;
      const x=t.getContext('2d',{willReadFrequently:true});x.drawImage(sp,0,0);
      const W=t.width,H=t.height,d=x.getImageData(0,0,W,H).data;
      let x0=W,x1=-1,y0=H,y1=-1;
      for(let y=0;y<H;y++)for(let px=0;px<W;px++){
        if(d[(y*W+px)*4+3]>40){if(px<x0)x0=px;if(px>x1)x1=px;if(y<y0)y0=y;if(y>y1)y1=y;}
      }
      if(x1>=x0&&y1>=y0)out={x0:x0/W,x1:(x1+1)/W,y0:y0/H,y1:(y1+1)/H};
    }catch{out=null;}
    if(!out)return {x0:0,x1:1,y0:0,y1:1};
    spriteBoundsCache.set(id,out);return out;
  }
  function drawBuilding(b){const layout=state.layout?.[b.id]||b;let p=screenPoint(layout.x,layout.z);const level=getLevel(b.id),s=selected===b.id;
    let selRing=null;   // 選取圈:畫在門口前的地面(畫完建築才知道門口在哪,所以先記下來)
    if(!level){
      // 空地:l0veyou 的施工地基(石基、木樁、繩子、木板堆),取代虛線菱形。
      if(drawAtlasDetail('plot',p,52,40,10)){uiLabels.push({id:b.id,name:b.name,level:0,built:false,x:p.x,y:p.y-36*scale,box:{x:p.x-26*scale,y:p.y-40*scale,w:52*scale,h:50*scale},show:scale>1.12||s});
        {const dw=Math.max(40*scale,52*scale*.55),dh=Math.max(32*scale,42*scale*.5);hits.push({id:b.id,x:p.x-dw/2,y:p.y+10*scale-dh,w:dw,h:dh});}return;}   // 互動點在工地正面中央   // 名牌在施工地基上方:緊湊棋盤裡放在地基前面會落到前一棟的屋頂上,跟那一棟的名牌疊在一起
      procUse['plot']=(procUse['plot']||0)+1;
      const r=24*scale;polygon(g,[[p.x-r,p.y],[p.x,p.y-r*.5],[p.x+r,p.y],[p.x,p.y+r*.5]],'#716b4f99');g.strokeStyle='#c6bc90';g.lineWidth=1;g.setLineDash([3,2]);g.beginPath();g.moveTo(p.x-r,p.y);g.lineTo(p.x,p.y-r*.5);g.lineTo(p.x+r,p.y);g.lineTo(p.x,p.y+r*.5);g.closePath();g.stroke();g.setLineDash([]);textLabel('+',p.x,p.y-7,{size:16,color:'#f1dfab',back:false});uiLabels.push({id:b.id,name:b.name,level:0,built:false,x:p.x,y:p.y+13,box:{x:p.x-r,y:p.y-r*.5,w:2*r,h:r},show:scale>1.12||s});
      {const dw=Math.max(34*scale,r*.9),dh=Math.max(30*scale,r*.8);hits.push({id:b.id,x:p.x-dw/2,y:p.y+r*.55-dh,w:dw,h:dh});}return;   // 工地也一樣:互動點在正面中央
    }
    const conceptSprite=atlasCell(b.id);
    const conceptWidth=uniformBuildingWidth();   // 2026-10-13 使用者指定:所有建築同一個大小
    // 酒館 v3 連露台:圖往右下畫(露台在佔地前方),對齊概念圖左下的酒館;佔地與道路不變。
    const sh=SPRITE_SHIFT[b.id];if(sh)p={x:p.x+sh[0]*scale,y:p.y+sh[1]*scale};
    // 影子:剪影投影(往左下),取代舊的腳下大橢圓——概念圖沒有大片暗橢圓。
    const fit=buildingFit(b.id),es=1;   // 大小已由統一寬度決定;fit 只用它的置中位移p={x:p.x-(fit.c.x-fit.c.z)*9*scale,y:p.y-(fit.c.x+fit.c.z)*4.5*scale};  // 佔地置中到街區
    // 立面斜率校正:圖的左右立面實測不是 2:1(.5/-.5),以腳底中心為軸做縮放+剪切,讓牆線/屋簷跟街道平行。
    const fx=BUILDING_FACADE[b.id],pivotY=p.y+9*scale;if(fx){const r=Math.sqrt(fx[0]);g.save();g.translate(R(p.x),R(pivotY));g.transform(1/r,fx[1]/r,0,r,0,0);g.translate(-R(p.x),-R(pivotY));}
    let rect=conceptSprite?drawSprite(conceptSprite,p,conceptWidth*es,conceptWidth*es*conceptSprite.height/conceptSprite.width,9,1,'building'):drawAtlasBuilding(b.id,p,9,es);
    if(fx)g.restore();
    if(!rect){procUse['building-fallback:'+b.id]=(procUse['building-fallback:'+b.id]||0)+1;const sprite=atlasCell(b.id)||buildingSprite(b.id),w=conceptBuildingWidth(b.id);rect=drawSprite(sprite,p,w,w*sprite.height/sprite.width,9,1,'building');}
    // T130:記下鐵匠鋪煙囪口（圖片右上方）的實際螢幕座標，給最上層的煙霧用。
    if(b.id==='forge')smokeSpot={x:rect.x+rect.w*.855,y:rect.y+rect.h*.02};
    glowSpots.set(b.id,{x:rect.x,y:rect.y,w:rect.w,h:rect.h,bb:spriteBounds(b.id)});   // T131:夜晚燈光用（含不透明範圍，圖片底部常有透明留白）
    // 下面冒煙那段用的是「世界單位」的高度(會再乘 scale),照舊版語意換算回去。
    const h=rect.h/scale;
    // 互動點(點擊範圍)貼在**建築最下面那一排**:門口、台階都長在這裡(每棟的門偏左或偏右都涵蓋),
    // 點屋頂或上半部不會選到,也不會像「用圖片中心」那樣落在門旁邊的牆上。
    {const bb=spriteBounds(b.id);
     const bx0=rect.x+bb.x0*rect.w,bx1=rect.x+bb.x1*rect.w,by1=rect.y+bb.y1*rect.h;
     // 互動範圍 = 建築「最下面那一排」整條(門與台階都在這裡,不管門偏左、偏右或在中間),
     // 選取圈畫在這條的中線、再往下一點(= 門口前的地面)。用圖片可見範圍算,不用佈局座標(那是獵人站位)。
     const cx2=(bx0+bx1)/2,bw=Math.max(30*scale,(bx1-bx0)*0.9),bh=Math.max(34*scale,Math.min((by1-rect.y)*0.34,64*scale));
     hits.push({id:b.id,x:cx2-bw/2,y:by1-bh+4*scale,w:bw,h:bh});
     const pw=Math.max(28*scale,bw*0.62),ph=Math.max(22*scale,bh*0.45);
     hits.push({id:b.id,x:cx2-pw/2,y:by1+3*scale-ph*.45,w:pw,h:ph});        // 門口前的地面
     selRing={x:cx2,y:by1+5*scale};}
    // Smoke is made from individual four-pixel clusters and never blurs the art.
    if(!conceptSprite&&['forge','enhancement','restaurant','inn','hall'].includes(b.id)){
      for(let i=0;i<3;i++){const t=(elapsed*.3+i*.33)%1,xx=p.x+(18+t*5)*scale,yy=p.y+(-h+12-t*22)*scale;g.globalAlpha=(1-t)*.4;pixel(g,xx,yy,Math.max(2,4*scale),Math.max(2,3*scale),'#e5dfc8');pixel(g,xx+1,yy-1,Math.max(2,2*scale),1,'#f7ecd5');g.globalAlpha=1;}
    }
    if(s&&selRing)ring(selRing,17,'#ffdc7b');   // 選取圈在門口前的地面
    // 名牌放在自己屋頂上(圖頂往下 18%):放在地基前緣會被前一排建築蓋住、看起來像別棟的名字。
    // T151:只記資料,文字(要不要顯示等級)、避讓位移與畫法都在最後那一輪由 map-labels.js 決定。
    uiLabels.push({id:b.id,name:b.name,level,built:true,x:rect.x+rect.w/2,y:rect.y+rect.h*.18,box:{x:rect.x,y:rect.y,w:rect.w,h:rect.h},show:scale>1.12||s});
    const products={restaurant:'food',inn:'bed',tavern:'drink',clinic:'bandage'},pid=products[b.id];
    const stock=pid?(state.stocks?.[pid]??state.stock?.[pid]??state.products?.[pid]??state.inventory?.[pid]):null;
    if(pid&&stock===0){textLabel('!',p.x+27*scale,p.y-45*scale,{size:9,color:'#ffda87'});}
  }
  // 比例對齊概念圖:以大廳為尺(概念圖大廳約 440px = 遊戲 112 世界單位,1px≈0.255 單位)。
  // 人物/魔物用這個倍率。曾設 .6(概念圖人物約 12.5 單位),使用者要求維持原本大小 → 1(獵人 21、魔物 28–33、首領 50)。
  const CHAR_SCALE=1;  // 人物/魔物維持原本大小(使用者指定;曾縮成 .6 對齊概念圖比例)
  const padHit=(r,minW,minH)=>{const w=Math.max(r.w,minW),h=Math.max(r.h,minH);return{x:r.x+r.w/2-w/2,y:r.y+r.h-h,w,h};};
  // l0veyou 道具圖集:[cell id, 外框寬, 外框高, 底部偏移]。尺寸照概念圖比例(旗約 75px→19、木桶堆約 45px→11)。
  const PROP_ATLAS={garden:['garden',20,11,1],bush:['bush',12,11,1],mushroom:['mushroom',9,8,1],cactus:['cactus',16,22,2],
    villageBanner:['villageBanner',12,20,1],arenaFlag:['arenaFlag',11,19,1],gate:['gate',11.5,15.3,0],stall:['stall',30,22,2],barrels:['barrels',12,11,1],
    // yard 圖集:以人物 12.6、木桶堆 11、路燈 15 為尺。
    chest:['chest',8,8,1],crates:['crates',8,10,1],hayBale:['hayBale',9,9.7,1],firewood:['firewood',9,8,1],
    trough:['trough',11,9,1],scarecrow:['scarecrow',11,14,1],lantern:['lantern',8,15,1],wheelbarrow:['wheelbarrow',11,9,1],
    // town/town2 圖集(概念圖道具):尺寸照概念圖量(K=3.93 px/單位)。圍籬一段 2 格,底部偏移 4.5(下端柱腳在中點下方)。
    archeryTarget:['archeryTarget',17,18.5,1],dummy:['dummy',10,15,1],weaponRack:['weaponRack',14,18,1],anvilStump:['anvilStump',10,9,1],
    tableSet:['tableSet',20,16,1],bench:['bench',16,10,1],handCart:['handCart',16,12.3,1],flowerBox:['flowerBox',12,10,1],
    purpleBanner:['purpleBanner',9,30,1],fenceRail:['fenceRail',22.6,22,4.6],fruitStand:['fruitStand',22,27,1],sacks:['sacks',11,11,1],
    // 各地形的地貌(l0veyou cold/woods 圖集):雪堆、冰湖、冰晶岩、山崖,倒木、樹樁、苔石、蕨叢。
    snowDrift:['snowDrift',26,18.7,2],frozenPond:['frozenPond',30,17,3],iceRocks:['iceRocks',22,15,1],cliffLedge:['cliffLedge',40,23,2],
    fallenLog:['fallenLog',22,18,1],stump:['stump',13,11,1],mossRock:['mossRock',15,13,1],ferns:['ferns',13,12,1],
    barrel:['barrel',6,8.7,1],bucket:['bucket',5,6.2,1],flowerBush:['flowerBush',12,11,1],riverRocks:['riverRocks',14,11,1]};
  // 驗收用:每一個畫面上的裝飾都該來自圖集/概念圖素材。退回程序繪製就記在 procUse,
  // __mistvaleDetails().proc 應該是空物件。
  // 會動的裝飾(村民、動物、路人,以及有動畫亮點的):每幀都要重畫,不進靜態層
  const ANIMATED_DECOR=new Set(['npc','villager','animal','fisher','waterfall','fountain','villageBanner']);
  // 立牌上的等級(1-3):直接讀存檔裡的 regionDensity,沒有就當第 2 級(跟遊戲預設一致)。
  const signLevel=d=>{const n=Math.round(Number(getState()?.regionDensity?.[d.regionId]));return n>=1&&n<=3?n:2;};
  // 手畫的像素羅馬數字(I/II/III):有襯線才認得出來,不用字型,遠近都清楚。cx=板面中心、y0=板面頂端、h=板面高。
  function drawRoman(cx,y0,h,n){const bw=h*0.42,gap=h*0.18,bar=h*0.66,th=h*0.15,span=n*bw+(n-1)*gap,x0=cx-span/2,top=y0+(h-bar)/2;
    for(let i=0;i<n;i++){const bx=x0+i*(bw+gap);pixel(g,bx,top,bw,th,'#4a2f14');pixel(g,bx+(bw-th*1.3)/2,top+th,th*1.3,bar-th*2,'#4a2f14');pixel(g,bx,top+bar-th,bw,th,'#4a2f14');}}
  function drawDecoration(d){const p=screenPoint(d.x,d.z);if(p.x<-100||p.x>width+100||p.y<-70||p.y>height+260){if(globalThis.__mistvaleNpcLog&&d.type==='npc')globalThis.__mistvaleNpcLog.push({cls:d.cls,x:d.x,z:d.z,culled:true});return;}
    const before=detailUse.draw1x+detailUse.draw2x;drawDecorationArt(d,p);
    if(detailUse.draw1x+detailUse.draw2x===before&&!(d.type==='monument'&&atlasCell('monument')))procUse[d.type]=(procUse[d.type]||0)+1;}
  function drawDecorationArt(d,p){
    const prop=PROP_ATLAS[d.type];
    if(prop){const k=d.size||1;if(drawAtlasDetail(prop[0],p,prop[1]*k,prop[2]*k,prop[3],1,(d.variant||0)%2===1)){
      return;}}
    if(d.type==='flowers'&&drawAtlasDetail(FLOWER_ATLAS[(d.variant||0)%4],p,9*(d.size||1),7*(d.size||1),1,1,(d.variant||0)>=4))return;
    if((d.type==='wheat'||d.type==='cabbage')&&drawAtlasDetail(d.type,p,d.type==='wheat'?9:10,d.type==='wheat'?9:7,1,1,(d.variant||0)%2===1))return;
    if(d.type==='wheat'){for(let i=-1;i<=1;i++){const xx=p.x+i*2*scale;pixel(g,xx,p.y-5*scale,scale,6*scale,'#ba973d');pixel(g,xx-scale,p.y-5*scale,3*scale,scale,'#eac665');pixel(g,xx,p.y-7*scale,scale,2*scale,'#f1dc8e');}return;}
    if(d.type==='cabbage'){pixel(g,p.x-3*scale,p.y-4*scale,7*scale,4*scale,'#4f8a3c');pixel(g,p.x-2*scale,p.y-5*scale,5*scale,3*scale,'#9cc964');return;}
    if(d.type==='bridgeRail'&&d.u!==undefined&&drawRailSlice(d.u,d.last,p))return;
    if(d.type==='streamBridge'&&drawAtlasDetail('streamBridge',p,76,74,30))return;
    if(d.type==='waterfall'&&drawAtlasDetail('waterfall',p,30,38,6)){if(quality){g.globalAlpha=.55;for(let i=0;i<5;i++){const t=(elapsed*1.6+i*.2)%1;pixel(g,p.x+(i-2)*2.5*scale,p.y-(3-t*3)*scale,Math.max(1,scale),Math.max(1,scale),'#e8f6ff');}g.globalAlpha=1;}return;}
    if(d.type==='bankRocks'&&drawAtlasDetail('bankRocks',p,24*d.size,23*d.size,3,1,true))return;
    if(d.type==='fisher'){contact(p,5);if(drawAtlasDetail('fisher',p,28,20,1,1,true)){const s=scale,t=Math.sin(elapsed*1.3);g.globalAlpha=.7;pixel(g,p.x-15*s,p.y+(3+t*.6)*s,4*s,Math.max(1,s*.6),'#cfeeff');g.globalAlpha=1;return;}}
    // 概念圖街上滿是村民與貓狗:純裝飾(不參與模擬),原地輕微上下呼吸。
    if(d.type==='npc'&&heroSheets[d.cls]){const m=heroSheets[d.cls].meta.actions,t=elapsed+d.phase,sf=d.walk?dirSuffix(m,'walk',d.vdir||'side'):'',w='walk'+sf;let sp,label;
      if(globalThis.__mistvaleNpcLog)globalThis.__mistvaleNpcLog.push({cls:d.cls,x:d.x,z:d.z,act:d.actionShowcase?'showcase':(d.walk?'walk':'idle'),px:R(p.x),py:R(p.y)});
      if(d.actionShowcase){const rows=WARRIOR_SHOWCASE_ACTIONS.filter(row=>m[row.act]),gap=.2,cycle=rows.reduce((sum,row)=>sum+m[row.act].frames*m[row.act].frameTime+gap,0);let at=((t%cycle)+cycle)%cycle;
        for(const row of rows){const a=m[row.act],duration=a.frames*a.frameTime;if(at<duration){sp={act:row.act,i:Math.min(a.frames-1,Math.floor(at/a.frameTime))};label=row.label;break;}at-=duration;
          if(at<gap){sp={act:row.act,i:a.frames-1};label=row.label;break;}at-=gap;}}
      else sp=d.walk?{act:w,i:gaitFrame(d,d.x,d.z,m[w],d.phase%1)}:{act:'idle',i:Math.floor(t/m.idle.frameTime)%m.idle.frames};
      contact(p,5);drawSheetHero({classId:d.cls},p,d.flip?-1:1,sp);if(d.actionShowcase&&label)textLabel('戰士展示 · '+label,p.x,p.y-25*scale,{color:'#ffe4a8',size:8});detailUse.draw1x++;return;}
    if(d.type==='npc'&&pendingHero(d.cls))return;
    if(d.type==='npc'){const bob=Math.sin(elapsed*2.1+d.phase)>.55?1:0,hf=heroFrameFor(d.cls,heroLodScale);contact(p,5);
      {const sp=heroSprite(d.cls,bob,d.flip?-1:1,Math.floor(d.phase*7)%3,heroLodScale,d.walk?walkFrame(elapsed,d.phase*7):'idle');drawSprite(sp,p,21*CHAR_SCALE*sp.width/(sp.baseH||sp.height),21*CHAR_SCALE*sp.height/(sp.baseH||sp.height),1.2,1,'char');};if(hf)detailUse.draw1x++;return;}
    if(d.type==='villager'){const pet=d.who==='cat'||d.who==='dog',bob=d.walk?(Math.floor(elapsed*6+d.phase)%2):Math.sin(elapsed*2.2+d.phase)>.4?1:0,k=CHAR_SCALE;contact(p,pet?4:5);
      const kid=d.who==='child';if(drawAtlasDetail(d.who,p,(pet?10:kid?13:15)*k,(pet?9:kid?16.5:20)*k,1.2-bob*.4,1,d.flip))return;  // 村民跟英雄同一批風格、同像素密度;小孩矮一截
      pixel(g,p.x-3*scale,p.y-14*scale,6*scale,12*scale,'#8a6a48');pixel(g,p.x-2*scale,p.y-18*scale,4*scale,4*scale,'#f0c9a0');return;}
    if(d.type==='animal'&&detailFrameFor('sheep')){const goat=d.variant===1,bob=Math.sin(elapsed*2+d.phase)>0?1:0;contact(p,4);
      if(drawAtlasDetail(goat?'goat':'sheep',p,goat?9.5:10,goat?10:8.5,.6-bob*.4,1,Math.sin(elapsed*.21+d.phase*3)<0)){return;}}
    if(d.type==='monument'){const sp=atlasCell('monument')||buildingSprite('fountain');const w=20*(d.size||1);drawSprite(sp,p,w,w*sp.height/sp.width,.6,1,'building');return;}   // 20 = 實測約 1.6 個英雄高,剛好塞進廣場(4.4×3.6)
    if(d.type==='villageBanner'){
      const s=scale,wave=Math.round(Math.sin(elapsed*1.4+d.x));
      pixel(g,p.x,p.y-32*s,2*s,33*s,'#59432e');
      pixel(g,p.x+s,p.y-31*s,s,31*s,'#c99e54');
      pixel(g,p.x-2*s,p.y-33*s,17*s,2*s,'#dfb653');
      pixel(g,p.x+3*s,p.y-30*s,11*s,20*s,'#244b87');
      pixel(g,p.x+4*s,p.y-29*s,2*s,18*s,'#3b77b0');
      pixel(g,p.x+13*s,p.y-28*s,2*s,16*s,'#17375f');
      line(g,p.x+8*s,p.y-27*s,p.x+(8+wave)*s,p.y-14*s,'#eee6c9',s);
      line(g,p.x+5*s,p.y-24*s,p.x+11*s,p.y-19*s,'#eee6c9',s);
      line(g,p.x+11*s,p.y-24*s,p.x+5*s,p.y-19*s,'#eee6c9',s);
      polygon(g,[[p.x+3*s,p.y-10*s],[p.x+8*s,p.y-6*s],[p.x+14*s,p.y-10*s]],'#244b87');
      pixel(g,p.x-3*s,p.y,8*s,3*s,'#9c8c6c');return;
    }
    if(d.type==='garden'){
      const s=scale*(d.size||1);pixel(g,p.x-9*s,p.y-2*s,19*s,5*s,'#695844');
      pixel(g,p.x-8*s,p.y-3*s,17*s,4*s,'#365f32');
      for(let i=0;i<6;i++){
        const xx=p.x+(i*3-7)*s,yy=p.y-(4+i%2)*s;
        pixel(g,xx-s,yy,4*s,3*s,i%2?'#79a443':'#508638');
        pixel(g,xx,yy-s,2*s,2*s,'#a3c85a');
        const flower=['#f4dfad','#d98da5','#e6ac4d'][(i+(d.variant||0))%3];
        pixel(g,xx,yy-2*s,2*s,2*s,flower);pixel(g,xx+s,yy-2*s,s,s,'#fff1ca');
        pixel(g,p.x+(i*3-8)*s,p.y+2*s,2*s,s,i%2?'#d1b98f':'#9a8366');
      }return;
    }
    
    if(d.type==='arenaFlag'){const ss=scale;pixel(g,p.x,p.y-26*ss,2*ss,28*ss,'#664b31');pixel(g,p.x+2*ss,p.y-25*ss,12*ss,12*ss,'#954f45');pixel(g,p.x+4*ss,p.y-22*ss,7*ss,2*ss,'#ead08c');return;}
    if(d.type==='mushroom'){
      const s=scale*(d.size||1);shadow(p,4,1.5);
      pixel(g,p.x-s,p.y-6*s,4*s,7*s,'#4d4032');pixel(g,p.x,p.y-5*s,2*s,5*s,'#e2d6b0');pixel(g,p.x+s,p.y-3*s,s,3*s,'#bca880');
      polygon(g,[[p.x-4*s,p.y-5*s],[p.x-4*s,p.y-7*s],[p.x-2*s,p.y-10*s],[p.x+3*s,p.y-10*s],[p.x+5*s,p.y-7*s],[p.x+5*s,p.y-5*s]],'#52352e');
      pixel(g,p.x-3*s,p.y-7*s,8*s,2*s,'#9c584d');pixel(g,p.x-2*s,p.y-9*s,6*s,2*s,'#d18468');
      pixel(g,p.x-s,p.y-9*s,2*s,s,'#f4d4a1');pixel(g,p.x+2*s,p.y-7*s,2*s,s,'#f3ddb4');return;
    }
    if(d.type==='flowers'){const cols=['#f4e7ad','#e9b057','#d98691','#99b6e0','#eee8cd'];for(let i=0;i<4;i++){const x=p.x+(i*3-5)*scale,y=p.y-(2+i%2)*scale;pixel(g,x,y,1,4*scale,'#4d733d');pixel(g,x-scale,y-scale,3*scale,2*scale,cols[(d.variant+i)%5]);pixel(g,x,y-scale,scale,scale,'#e7c363');}return;}
    if(d.type==='cactus'){const s=scale*d.size;shadow(p,9*d.size,2.5*d.size);pixel(g,p.x-3*s,p.y-28*s,7*s,30*s,'#365d3a');pixel(g,p.x-2*s,p.y-27*s,4*s,27*s,'#76904c');pixel(g,p.x-1*s,p.y-25*s,s,25*s,'#a8ad65');pixel(g,p.x-9*s,p.y-18*s,6*s,5*s,'#4f773f');pixel(g,p.x-10*s,p.y-25*s,4*s,11*s,'#698948');pixel(g,p.x+4*s,p.y-14*s,6*s,4*s,'#4d713c');pixel(g,p.x+7*s,p.y-21*s,4*s,10*s,'#829b55');
      pixel(g,p.x+2*s,p.y-26*s,s,24*s,'#42683b');pixel(g,p.x-9*s,p.y-23*s,s,7*s,'#b3b979');pixel(g,p.x+8*s,p.y-19*s,s,6*s,'#bac285');
      pixel(g,p.x-4*s,p.y-s,10*s,2*s,'#9b8459');pixel(g,p.x-3*s,p.y-s,4*s,s,'#c6ad72');
      for(let k=0;k<5;k++){pixel(g,p.x+2*s,p.y-(5+k*4)*s,s,s,'#d6d29b');pixel(g,p.x-2*s,p.y-(7+k*4)*s,s,s,'#3f6639');}return;}
    if(d.type==='outcrop'||d.type==='cave'||d.type==='ruins'){
      const hh0=d.type==='cave'?38:d.type==='ruins'?28:17;
      // 外框高度放寬:圖集裡的岩峰/洞穴/遺跡是高的,舊的程序版高度會把它們壓成小石頭。
      if(drawAtlasDetail(d.type==='ruins'?'ruin':d.type,p,46*d.size,(d.type==='cave'?50:d.type==='ruins'?46:44)*d.size)){
        
        return;}
      const s=scale*d.size,hh=hh0;polygon(g,[[p.x-19*s,p.y],[p.x-17*s,p.y-hh*s],[p.x+8*s,p.y-(hh+5)*s],[p.x+22*s,p.y-12*s],[p.x+20*s,p.y+7*s],[p.x-6*s,p.y+10*s]],'#565e5e');polygon(g,[[p.x-17*s,p.y-hh*s],[p.x+8*s,p.y-(hh+5)*s],[p.x+19*s,p.y-12*s],[p.x-5*s,p.y-4*s]],'#a5aba1');for(let i=0;i<5;i++)pixel(g,p.x-(12-i*5)*s,p.y-(hh-5-i%2*4)*s,4*s,2*s,i%2?'#c2bcb0':'#8f958c');if(d.type==='cave'){pixel(g,p.x-9*s,p.y-24*s,19*s,25*s,'#343e40');pixel(g,p.x-6*s,p.y-21*s,13*s,23*s,'#1d2930');pixel(g,p.x-15*s,p.y-16*s,3*s,5*s,'#e6a94c');pixel(g,p.x+15*s,p.y-15*s,3*s,5*s,'#ffd574');textLabel('鐵脊礦坑',p.x,p.y+16*s,{color:'#e3d5b0'});}else if(d.type==='ruins'){pixel(g,p.x-13*s,p.y-31*s,6*s,28*s,'#c3b489');pixel(g,p.x+8*s,p.y-26*s,6*s,29*s,'#a7a780');pixel(g,p.x-5*s,p.y-15*s,8*s,2*s,'#617b53');}else{pixel(g,p.x+4*s,p.y-11*s,3*s,3*s,'#ba8c66');pixel(g,p.x-8*s,p.y-9*s,3*s,2*s,'#d3a47a');}return;}
    if(d.type==='bridgeRail'){
      const s=scale;pixel(g,p.x-s,p.y-10*s,4*s,12*s,'#49362a');pixel(g,p.x,p.y-9*s,2*s,10*s,'#b08654');
      pixel(g,p.x-s,p.y-11*s,4*s,2*s,'#d1ab73');pixel(g,p.x-s,p.y-4*s,4*s,s,'#5a5146');
      line(g,p.x-5*s,p.y-7*s,p.x+5*s,p.y-3*s,'#61442e',3*s);
      line(g,p.x-5*s,p.y-8*s,p.x+5*s,p.y-4*s,'#c69d65',s);return;
    }
    if(d.type==='signpost'){
      // 2026-10-30:每個狩獵區中央的木頭立牌,牌面用羅馬數字顯示這一區的怪物數量等級(I/II/III),點它開切換畫面。
      if(d.regionSign){
        const s=scale,bd=signLevel(d),art=regionSignArt(),band=bd===1?'#5f8f4a':bd===2?'#c98a2e':'#b03a2a';
        if(art){   // 素材版:一根木樁＋奶油色板面,羅馬數字畫在板面中央
          const dw=Math.round(22*s),dh=Math.round(dw*art.height/art.width),dx=R(p.x-dw/2),dy=R(p.y-dh+2*s);
          shadow(p,10,3.4);g.drawImage(art,dx,dy,dw,dh);   // 小立牌不要投影(縮小後那塊影子比牌子還大);腳下一圈淡淡的地面陰影就夠
          // 板面在素材裡的相對範圍(prep_signpost.py 量出來的):x 0.089–0.893、y 0.128–0.519
          const fx=dx+dw*0.089,fw=dw*0.804,fy=dy+dh*0.128,fh=dh*0.391;
          pixel(g,fx+fw*0.05,fy+fh*0.16,Math.max(1.5,1.5*s),fh*0.68,band);   // 等級色帶(貼在板面左緣內側)
          drawRoman(fx+fw/2+s,fy+fh*.06,fh*.82,bd);
        }else{
          pixel(g,p.x-2.5*s,p.y-21*s,5*s,22*s,'#4a3520');            // 木樁
          pixel(g,p.x-1.5*s,p.y-21*s,2*s,22*s,'#6b4f31');
          pixel(g,p.x-17*s,p.y-42*s,34*s,22*s,'#4a3520');             // 牌面外框(深)
          pixel(g,p.x-16*s,p.y-41*s,32*s,20*s,'#7a5734');             // 木板
          pixel(g,p.x-16*s,p.y-41*s,32*s,3*s,'#c9a86a');              // 上緣受光
          pixel(g,p.x-16*s,p.y-24*s,32*s,3*s,'#57402a');              // 下緣暗邊
          pixel(g,p.x-12*s,p.y-38*s,24*s,12*s,'#efdfb4');             // 奶油色內板
          pixel(g,p.x-12*s,p.y-38*s,24*s,s,'#fff6d8');
          pixel(g,p.x-15.5*s,p.y-37*s,2.5*s,10*s,band);               // 等級色帶
          pixel(g,p.x-17*s,p.y-35*s,3*s,3*s,'#8f7440');               // 釘子
          pixel(g,p.x+14*s,p.y-35*s,3*s,3*s,'#8f7440');
          drawRoman(p.x+1*s,p.y-36.6*s,7.6*s,bd);
        }
        hits.push({id:`region:${d.regionId}`,x:p.x-(art?14:19)*scale,y:p.y-(art?27:42)*scale,w:(art?28:38)*scale,h:(art?27:30)*scale});
        return;
      }
      if(!drawAtlasDetail('signpost',p,13,16)){const s=scale;pixel(g,p.x,p.y-18*s,2*s,19*s,'#624a31');pixel(g,p.x-7*s,p.y-21*s,17*s,8*s,'#48392b');pixel(g,p.x-6*s,p.y-20*s,15*s,6*s,'#c4a66c');pixel(g,p.x-3*s,p.y-18*s,9*s,s,'#79613c');}
      return;  // 戰鬥區不顯示文字(地名改在世界地圖縮小時、空地外緣顯示)
    }
    if(d.type==='animal'){
      const s=scale,bob=Math.sin(elapsed*2+d.phase)>0?1:0,goat=d.variant===1;
      const fill=goat?'#b99568':'#eee9d7',light=goat?'#d5b587':'#fff8e5',shade=goat?'#886644':'#bcb8a4';
      shadow(p,8,2);
      polygon(g,[[p.x-8*s,p.y-5*s],[p.x-7*s,p.y-10*s],[p.x-3*s,p.y-12*s],[p.x+4*s,p.y-11*s],[p.x+8*s,p.y-7*s],[p.x+6*s,p.y],[p.x-5*s,p.y]],'#3b392e');
      pixel(g,p.x-6*s,p.y-9*s,12*s,7*s,fill);
      pixel(g,p.x-4*s,p.y-11*s,7*s,3*s,light);
      pixel(g,p.x-6*s,p.y-3*s,11*s,3*s,shade);
      for(const offset of[-5,-1,3])pixel(g,p.x+offset*s,p.y-(7+(offset===-1?1:0))*s,3*s,3*s,light);
      pixel(g,p.x+5*s,p.y-10*s,6*s,7*s,'#4a4135');
      pixel(g,p.x+6*s,p.y-9*s,4*s,5*s,goat?'#c0a279':'#ded3b9');
      pixel(g,p.x+8*s,p.y-8*s,s,s,'#211f1c');
      pixel(g,p.x+4*s,p.y-11*s,3*s,2*s,shade);
      pixel(g,p.x+10*s,p.y-10*s,2*s,2*s,shade);
      pixel(g,p.x-9*s,p.y-7*s,3*s,2*s,light);
      for(const offset of[-4,4]){pixel(g,p.x+offset*s,p.y-s,2*s,(4+(offset<0?bob:-bob))*s,'#6b5741');pixel(g,p.x+offset*s,p.y+(3+(offset<0?bob:-bob))*s,3*s,s,'#302b25');}
      if(goat){pixel(g,p.x+6*s,p.y-14*s,s,4*s,'#ddcba4');pixel(g,p.x+9*s,p.y-14*s,s,4*s,'#ddcba4');pixel(g,p.x+8*s,p.y-4*s,s,3*s,'#8b7354');}
      return;
    }

    if(d.type==='fountain'||d.type==='well'){
      if(d.type==='well'&&drawAtlasDetail('well',p,90*d.size,91*d.size,8))return;
      const sp=atlasCell(d.type)||buildingSprite(d.type);drawSprite(sp,p,90*d.size,91*d.size,8,1,'building');if(d.type==='fountain'){g.globalAlpha=.6;for(let i=0;i<4;i++){const yy=((elapsed*10+i*4)%16);pixel(g,p.x+(i%2?4:-4)*scale,p.y-(26-yy)*scale,1,2,'#e1f7e2');}g.globalAlpha=1;}return;}
    if(d.type==='rock'){const rockScale=d.size||1;if(!drawAtlasDetail('boulders',p,13*rockScale,10*rockScale)){polygon(g,[[p.x-6*scale*rockScale,p.y],[p.x-4*scale*rockScale,p.y-6*scale*rockScale],[p.x+2*scale*rockScale,p.y-8*scale*rockScale],[p.x+7*scale*rockScale,p.y-2*scale*rockScale],[p.x+5*scale*rockScale,p.y+2*scale*rockScale]],'#616e60');polygon(g,[[p.x-4*scale*rockScale,p.y-5*scale*rockScale],[p.x+2*scale*rockScale,p.y-7*scale*rockScale],[p.x+5*scale*rockScale,p.y-3*scale*rockScale],[p.x-1*scale*rockScale,p.y-2*scale*rockScale]],'#a4aa8c');}return;}
    if(d.type==='bush'){pixel(g,p.x-5*scale,p.y-5*scale,11*scale,5*scale,'#4b7045');pixel(g,p.x-3*scale,p.y-8*scale,7*scale,6*scale,'#638b4c');pixel(g,p.x-2*scale,p.y-8*scale,4*scale,2*scale,'#87a85d');if(d.variant%2){pixel(g,p.x-2*scale,p.y-4*scale,2*scale,2*scale,'#d7af6a');pixel(g,p.x+3*scale,p.y-5*scale,2*scale,2*scale,'#cc7a72');}return;}
    // 圍欄不能用圖集:遊戲是「單柱+橫桿」反覆排列成連續柵欄,
    // 但圖集給的是「兩柱一段」的完整護欄板,排起來會變一段一段的鋸齒。
    // 要用的話得另外生一張「單柱+左右短橫桿」的可拼接單位。
    if(d.type==='fence'){if(drawAtlasDetail('fence',p,9,12,0))return;pixel(g,p.x-2*scale,p.y-13*scale,4*scale,15*scale,'#67533a');polygon(g,[[p.x-2*scale,p.y-13*scale],[p.x,p.y-17*scale],[p.x+2*scale,p.y-13*scale]],'#67533a');pixel(g,p.x-1*scale,p.y-12*scale,2*scale,12*scale,'#b49a61');line(g,p.x-5*scale,p.y-6*scale,p.x+5*scale,p.y-11*scale,'#6e573a',2*scale);return;}
    if(d.type==='gate'){
      // 兩根門柱立在缺口兩端(沿著柵欄的方向),上面架一根橫樑、樑下掛門牌。
      // 南北兩側的柵欄沿 x 走、東西兩側沿 z 走;橫樑直接用「兩個門柱的螢幕座標」連起來,等角斜度就自動正確。
      const s=scale,half=EXIT_GAP,ax=d.side==='north'||d.side==='south'?{x:1,z:0}:{x:0,z:1};
      const pa=screenPoint(d.x-ax.x*half,d.z-ax.z*half),pb=screenPoint(d.x+ax.x*half,d.z+ax.z*half);
      const postH=3.6*s,pw=Math.max(2,Math.round(.55*s)),beamH=Math.max(1,Math.round(.35*s)),topY=-postH+.5*s;
      for(const q of [pa,pb]){
        pixel(g,q.x-pw/2,q.y-postH,pw,postH,'#574733');
        pixel(g,q.x-pw/2+Math.max(1,Math.round(.15*s)),q.y-postH+.4*s,Math.max(1,pw-Math.round(.3*s)),postH-.6*s,'#b0935e');
        pixel(g,q.x-pw,q.y-postH-.35*s,pw*2,Math.max(2,Math.round(.35*s)),'#463a2b');
      }
      g.fillStyle='#6b5138';g.beginPath();
      g.moveTo(pa.x,pa.y+topY);g.lineTo(pb.x,pb.y+topY);g.lineTo(pb.x,pb.y+topY+beamH);g.lineTo(pa.x,pa.y+topY+beamH);g.closePath();g.fill();
      const my=(pa.y+pb.y)/2+topY+beamH+1,mx=(pa.x+pb.x)/2,bw=Math.max(4,Math.round(1.3*s)),bh=Math.max(4,Math.round(1.6*s));
      pixel(g,mx-bw/2,my,bw,bh,'#244b87');pixel(g,mx-bw/2,my,bw,Math.max(1,Math.round(s)),'#dfb653');
      line(g,mx,my+.4*s,mx,my+bh-.3*s,'#eee6c9',Math.max(1,Math.round(.16*s)));
      line(g,mx-.45*s,my+.7*s,mx+.45*s,my+.7*s,'#eee6c9',Math.max(1,Math.round(.16*s)));
      return;
    }
    if(d.type==='lamp'){
      if(!drawAtlasDetail('lamppost',p,7,15)){pixel(g,p.x,p.y-21*scale,2*scale,22*scale,'#4e4937');pixel(g,p.x-3*scale,p.y-24*scale,8*scale,7*scale,'#454935');pixel(g,p.x-2*scale,p.y-23*scale,6*scale,5*scale,'#e3b96a');pixel(g,p.x-1*scale,p.y-23*scale,2*scale,4*scale,'#ffe6a0');}
      if(quality&&phase>.55){g.save();g.globalAlpha=.07;g.fillStyle='#ffd57b';g.beginPath();g.arc(p.x,p.y-13*scale,11*scale,0,Math.PI*2);g.fill();g.restore();}return;
    }
  }

  // ── 戰鬥動畫 ──────────────────────────────────────────────────────────
  // 模擬只記時間戳(atkAt 出手、hitAt 命中、atkX/Z 目標、hitFromX/Z 打來的方向),畫面依時間算姿勢:
  // 蓄力(攻擊計時剩 <0.3 秒:往後縮、壓低)→ 出手(近戰往目標衝再收回、遠程後座)→ 受擊(往反方向退、閃光、抖)。
  // 有生成的姿勢圖(<職業>_windup/_strike/_hurt、<魔物>2)就換圖;沒有就只用位移/剪切/縮放。
  const ease=t=>1-(1-t)*(1-t);
  // 目標在畫面左(-1)或右(+1);幾乎正上/正下(|x| ≤ .1)回 prev
  function sideOf(h,tx,tz,prev){if(tx==null||tz==null)return prev||0;const d=screenDir(h.x,h.z,tx,tz).x;return Math.abs(d)>.1?(d>0?1:-1):(prev||0);}
  function screenDir(fx,fz,tx,tz){const dx=(tx-fx-(tz-fz))*PX,dy=(tx-fx+(tz-fz))*PY,l=Math.hypot(dx,dy)||1;return{x:dx/l,y:dy/l};}
  // 四格走路循環(左腳著地 → 經過 → 右腳著地 → 經過),每秒 8 格;每格的武器握法一致(l0veyou walk4 表)。
  const walkFrame=(t,seed)=>'walk'+(1+Math.floor(t*8+(seed%4))%4);
  // 蓄力長度:英雄的攻擊列有 windupFrameTime(蓄力每格秒數)＝蓄力格數 × 每格秒數(蓄力格逐格等速播,sheetPose 用 out.wt 挑格);
  // 沒有就是原本的 0.3 秒(魔物、其他職業不變)。只影響畫面:出手時間點仍是 attackTimer 歸零那一刻。
  // 魔物:重擊怪/首領的預告更長(看得懂才躲得掉),普通魔物維持 0.3 秒;只影響畫面,出手時機點不變。
  function windupLen(a,isEnemy){if(isEnemy)return a.type==='boss'?.55:HEAVY_SLAM.has(a.type)?.42:.3;
    const r=heroSheets[a.classId]?.meta.actions.attack;return r?.windupFrameTime?(r.release??1)*r.windupFrameTime:.3;}
  function combatPose(a,isEnemy,target){
    const t=state.time||0,out={pose:'idle',ox:0,oy:0,lean:0,sx:1,sy:1,flash:0,flashColor:'#ffffff',face:0,k:0,atk:0,hit:0};
    const atk=t-(a.atkAt??-99),hit=t-(a.hitAt??-99),engaged=isEnemy?a.engaged:a.status==='戰鬥中';
    out.atk=atk;out.hit=hit;  // 給畫面挑收招格(strike2/7)與第二受擊格(8)
    const ranged=!isEnemy&&(a.classId==='archer'||a.classId==='sorcerer'||a.classId==='priest');
    // 遠程魔物在遊戲裡永遠 engaged=false(牠們用 attackTimer 當冷卻、站定才射),所以蓄力預告要另外放行:
    // 冷卻最後 0.3 秒一樣進 windup 姿勢,腳下集氣圈才畫得出來。
    const rangedFoe=isEnemy&&!!MONSTER_RANGED[a.type];
    const tx=target?.x??(isEnemy?a.facingX:null),tz=target?.z??(isEnemy?a.facingZ:null);
    if(atk>=0&&atk<.36&&a.atkX!=null){const d=screenDir(a.x,a.z,a.atkX,a.atkZ);out.face=d.x;out.pose='strike';
      if(ranged){const k=atk<.06?atk/.06:Math.max(0,1-(atk-.06)/.3);out.k=k;out.ox=-d.x*1.8*k;out.oy=-d.y*.9*k;out.lean=-d.x*.1*k;}
      else{const reach=isEnemy?(a.type==='boss'?4:a.type==='wolf'?3.5:a.type==='slime'?4:2):5.5,  /* 魔物的出手圖本身已往前伸,位移只補一點,不然整隻蓋住獵人 */k=atk<.07?ease(atk/.07):Math.max(0,1-(atk-.07)/.29);out.k=k;
        out.ox=d.x*reach*k;out.oy=d.y*reach*.7*k;out.lean=d.x*.24*k;out.sx=1+.07*k;out.sy=1-.06*k;
        if(isEnemy&&a.type==='slime')out.oy-=7*Math.sin(Math.min(1,atk/.22)*Math.PI);
        if(isEnemy&&a.type==='wolf')out.oy-=3.5*Math.sin(Math.min(1,atk/.2)*Math.PI);}
    }else if((engaged||rangedFoe)&&tx!=null&&(a.attackTimer??9)<windupLen(a,isEnemy)){const wl=windupLen(a,isEnemy),d=screenDir(a.x,a.z,tx,tz),k=ease(1-Math.max(0,a.attackTimer)/wl);out.face=d.x;out.pose='windup';out.k=k;out.wt=wl-Math.max(0,a.attackTimer);
      out.ox=-d.x*2*k;out.oy=-d.y*k;out.lean=-d.x*.16*k;out.sx=1+.05*k;out.sy=1-.08*k;}
    else if(engaged&&tx!=null)out.face=screenDir(a.x,a.z,tx,tz).x;
    if(hit>=0&&hit<.32&&a.hitFromX!=null){const d=screenDir(a.hitFromX,a.hitFromZ,a.x,a.z),k=hit<.05?hit/.05:Math.max(0,1-(hit-.05)/.27);
      out.ox+=d.x*3.2*k+Math.sin(hit*95)*.9*k;out.oy+=d.y*1.6*k;out.lean+=d.x*.14*k;
      // 受擊圖是「被右邊打到、往左退」:受擊時一律面向打來的那一側(不然從背後被打會朝攻擊者縮)。
      if(out.pose!=='strike'){out.pose='hurt';if(Math.abs(d.x)>.15)out.face=-d.x;}
      out.flash=hit<.14?1-hit/.14:0;out.flashColor=isEnemy?'#ffffff':'#ff6a52';}
    return out;
  }
  // 受擊閃光:同剪影上色(快取),drawSprite/drawAtlasMonster 畫完本體後疊上去。
  let flashNext=null;
  const tintCache=new WeakMap();
  function tinted(img,sx,sy,sw,sh,color){let m=tintCache.get(img);if(!m){m=new Map();tintCache.set(img,m);}const key=`${sx},${sy},${sw},${sh},${color}`;let c=m.get(key);if(c)return c;
    c=makeCanvas(sw,sh);const x=c.getContext('2d');x.drawImage(img,sx,sy,sw,sh,0,0,sw,sh);x.globalCompositeOperation='source-in';x.fillStyle=color;x.fillRect(0,0,sw,sh);m.set(key,c);return c;}
  // 以腳底為軸剪切(前傾/後仰)與縮放;影子(cast)跟著位移但不跟著傾斜。
  function posed(p,pose,draw){const q={x:R(p.x+pose.ox*scale),y:R(p.y+pose.oy*scale)};g.save();g.translate(q.x,q.y);g.transform(pose.sx,0,-pose.lean,pose.sy,0,0);g.translate(-q.x,-q.y);
    if(pose.flash>0)flashNext={color:pose.flashColor,alpha:Math.min(1,pose.flash*.9)};try{return draw(q);}finally{flashNext=null;g.restore();}}
  // 蓄力時武器/法杖上的光點:近戰一閃、法系聚光。
  // T67:法師普攻一律用 spell-charge 表(不看畫質、不看 fxInSprite),自動狩獵與兩個繪製器都畫。
  function chargeGlow(h,p,pose,facing){if(pose.pose!=='windup'||h.hp<=0)return;const s=scale;
    if(h.classId==='sorcerer'&&heroSheets[h.classId]){const ck=(HERO_H/heroSheets[h.classId].meta.heroHeight)*s,wt=pose.wt??0;
      // 2026-11:法師蓄力改吃 iso 版魔法陣(arcane/magic-circle-cast-iso),取代側視 spell-charge 循環表。
      // 從表上 0.42 s(五芒星畫完、符文開始亮)起播,普攻蓄力看起來像「陣已經成形、符文在轉」;
      // 法杖上再補一顆小光點(iso 陣貼在地上,不畫光點會看不出蓄力在手上)。
      if(vfxSheet('magic-circle-cast-iso')){const t=.42+wt;
        drawVfxSheet('magic-circle-cast-iso',t,p.x,p.y,ISO_PX*s*(ISO_FX['magic-circle-cast-iso'].tune||1),{});isoSeen.add('magic-circle-cast-iso');
        const ox=p.x+facing*(2.2*s-15*ck),oy=p.y-(12.8*s-22*ck),a=Math.min(1,wt/.12);
        g.save();g.globalAlpha=a*.5;g.fillStyle='#d9a8ff';g.beginPath();g.arc(ox,oy,Math.max(1.5,2.6*s),0,Math.PI*2);g.fill();
        g.globalAlpha=a*.9;g.fillStyle='#fff6ff';g.beginPath();g.arc(ox,oy,Math.max(1,.9*s),0,Math.PI*2);g.fill();g.restore();
        state.lastVfxDraw={sheet:'magic-circle-cast-iso',t:+t.toFixed(2),x:Math.round(p.x),y:Math.round(p.y),k:+(ISO_PX*s).toFixed(3),iso:true,ok:true,wt:+wt.toFixed(2)};
        return;}
      drawVfxSheet('spell-charge',wt,p.x+facing*(2.2*s-15*ck),p.y-(12.8*s-22*ck),ck,{alpha:Math.min(1,wt/.12),rate:2.4,flip:facing<0});return;}
    if(!quality||heroSheets[h.classId]?.meta.actions.attack?.fxInSprite)return;const k=pose.k,caster=h.classId==='sorcerer'||h.classId==='priest';   // fxInSprite:蓄力的光已畫在攻擊列裡(PixelLab 手上的魔法球),不再疊固定位置的光點
    const x=p.x+(pose.ox+facing*(caster?8:-6))*s,y=p.y+(pose.oy-(caster?17:19))*s,col=h.classId==='sorcerer'?'#d9a8ff':h.classId==='priest'?'#ffe9a0':h.classId==='archer'?'#e8f2c0':'#fff4c8';
    g.save();g.globalAlpha=.25+.55*k;g.fillStyle=col;const r=(caster?2+3*k:1+2*k)*s;g.beginPath();g.arc(x,y,r,0,Math.PI*2);g.fill();
    g.globalAlpha=.9*k;pixel(g,x-r*1.6,y-.5*s,r*3.2,Math.max(1,s),'#ffffff');pixel(g,x-.5*s,y-r*1.6,Math.max(1,s),r*3.2,'#ffffff');
    if(caster)for(let i=0;i<4;i++){const an=i*1.57+elapsed*6,rr=(7-5*k)*s;pixel(g,x+Math.cos(an)*rr,y+Math.sin(an)*rr*.6,Math.max(1,s),Math.max(1,s),col);}
    g.restore();}

  function ghostHunter(h){if(!(h.hp>0)||h.status!=='戰鬥中'||!Number.isFinite(h.x))return;const p=screenPoint(h.x,h.z);if(p.x<-40||p.x>width+40||p.y<-40||p.y>height+60)return;
    const target=h.targetId?(state.enemies||[]).find(e=>e.id===h.targetId&&e.hp>0):null,pose={...combatPose(h,false,target),flash:0},facing=previousPositions.get(h.id)?.facing||1;
    if(heroSheets[h.classId]){const d=drawnFacing.get(h.id);if(d?.act)drawSheetHero(h,p,facing,{act:d.act,i:d.i},.38);return;}  // 新規格英雄:殘影用同一格
    const sprite=heroSprite(h.classId,0,facing,hash(h.id)%3,heroLodScale,pose.pose);posed(p,pose,q=>drawSprite(sprite,q,21*CHAR_SCALE*sprite.width/(sprite.baseH||sprite.height),21*CHAR_SCALE*sprite.height/(sprite.baseH||sprite.height),1.2,.38));}
  // 驗收用:每一隻最後一次畫出來的朝向/姿勢(__mistvaleFacing())。
  globalThis.__mistvaleBuildingSize=id=>{const b=BUILDINGS.find(q=>q.id===id);return b?{w:b.w,d:b.d}:null;};
  let drawOrder=[];globalThis.__mistvaleOrder=()=>drawOrder;  // 驗收用:這一幀實際的畫圖先後
  // ── 動作實驗室(設定 → 動作實驗室):直接在畫面上播某個職業的某一列動作 ──
  let posePreview=null;   // {classId, act, i, facing}
  globalThis.__mistvalePoseLab={
    info:(cls)=>{const sh=heroSheets[cls];if(!sh?.meta)return null;const m=sh.meta;
      return {cell:m.cell,heroHeight:m.heroHeight,actions:Object.fromEntries(Object.entries(m.actions).map(([k,v])=>[k,{frames:v.frames,cell:v.cell}]))};},
    set:(cfg)=>{posePreview=cfg&&heroSheets[cfg.classId]?{classId:cfg.classId,act:cfg.act||'idle',i:Math.max(0,cfg.i|0),facing:cfg.facing||1}:null;},
    current:()=>posePreview,
  };
  // 驗收用:裝備換表目前選了哪幾張(每次呼叫重算,改 h.equipment 後馬上反映;預設第一位獵人)。
  // bodySheet=身體表;weaponSheet=會畫的武器零件表(空字串＝身體表已把武器畫進去,不再疊零件)。
  globalThis.__mistvaleGear=(hunter)=>{const h=hunter||(state.hunters||[])[0];if(!h)return null;
    const look=heroLook(h),cls=h.classId||'',bodySheet=look.bodySheet||cls,parts=heroSheets[bodySheet]?.meta?.parts||[],
      wp=parts.find(p=>p.id==='weapon');
    let weaponSheet='';if(wp){weaponSheet=wp.sheet;if(look.weapon==='fine'){const fine=`${cls}-weapon-fine`;if(heroSheets[fine]?.meta)weaponSheet=fine;}}
    return{bodySheet,weaponSheet,bodyBakesWeapon:!wp,equipped:{weapon:!!h.equipment?.weapon,armor:gearWorn(h)>0,slots:GEAR_SLOTS_W.map(s=>!!h.equipment?.[s])}};};
  globalThis.__mistvaleRing=()=>({points:RING_ROAD,onRoad:(x,z,extra=0)=>onRingRoad(x,z,extra)});   // 驗收用:環村道路
  globalThis.__mistvaleDoors=()=>BUILDINGS.map(b=>{const p=state.layout?.[b.id]||b,d=doorFoot(b,p);return {id:b.id,x:d.x,z:d.z};});   // 驗收用:各棟門口的 world 座標
  globalThis.__mistvaleHits=()=>hits.map(h=>({id:h.id,x:h.x,y:h.y,w:h.w,h:h.h}));  // 驗收用:畫出來的點擊框(check_zorder.mjs)
  globalThis.__mistvaleDecor=()=>decorations.map(d=>({type:d.type,x:d.x,z:d.z,size:d.size||1,walk:!!d.walk,cls:d.cls,vdir:d.vdir}));  // 驗收用:擺設清單(check_placement.mjs)
  const drawnFacing=new Map();globalThis.__mistvaleFacing=()=>Object.fromEntries(drawnFacing);
  const heroMemo=new Map();  // 獵人上一幀的目標(打倒目標 → 歡呼)
  // 走路格依「畫面上實際走了多少」推進(sheet 的 cycle = 一輪走路身體前進的美術像素):用時間推進時慢吞吞的魔像腳會在地上打滑。
  const gait=new Map();
  function gaitFrame(key,x,z,a,seed){const s=iso(x,z);let g=gait.get(key);
    if(!g||!a.cycle){if(!g)gait.set(key,g={x:s.x,y:s.y,ph:seed%1});if(!a.cycle)return Math.floor(elapsed/a.frameTime+seed*a.frames)%a.frames;}
    const d=Math.hypot(s.x-g.x,s.y-g.y)*72/21;g.x=s.x;g.y=s.y;if(d<60)g.ph+=d/a.cycle;  // 大跳(復活、載入)不算步
    return Math.floor(g.ph*a.frames)%a.frames;}
  // 執行期補動作(不改 sheet 像素):fx/fy = 整體前衝/跳(邏輯 px,朝前為正);ux/uy = 只動膝蓋以上(前傾/下沉,腳不動 = 呼吸、預備、後仰)。
  const MOTION={
    idle:{uy:[0,0,0,1,1,1,0,0]},
    walk:{uy:[0,1,0,0,0,1,0,0],ux:[1,1,1,1,1,1,1,1]},
    attack:{fx:[0,-1,-1,0,2,3,1,0],ux:[0,-1,-2,-1,1,2,1,0],uy:[0,1,2,1,0,1,0,0]},
    skill:{fx:[0,-1,-1,0,1,2,1,0],ux:[0,-1,-2,-1,1,2,1,0],uy:[0,1,2,1,0,1,0,0]},
    hurt:{fx:[0,-1,-2,-1],ux:[0,-2,-3,-1],uy:[0,1,1,0]},
    victory:{uy:[0,1,0,1,0,1,0,1]}};
  const HIT_STOP=.07;  // 命中格多停 70ms:打擊感
  function motionOf(act,i,n){const m=MOTION[act.replace(/(DownRight|UpRight|DownLeft|UpLeft|Down|Up|Left|Right)$/,'')];if(!m)return null;
    const at=a=>a?a[Math.min(a.length-1,Math.floor(i*a.length/Math.max(1,n)))]:0,side=!/Down|Up/.test(act);   // 上下/斜角列不做水平位移(素材本身已經往前伸)
    return{fx:at(m.fx),ux:side?at(m.ux):0,uy:at(m.uy)};}
  function drawBodySliced(img,sx,sy,c,dx,dy,dw,flip,mo,split,fwd,sc){  // 分上下兩段畫:下段(腳)固定,上段位移
    const u=dw/100,ux=Math.round(mo.ux*u)*fwd,uy=Math.round(mo.uy*u),sp=Math.max(1,Math.min(c-1,Math.round(split)));
    g.save();if(flip){g.translate(dx+dw,dy);g.scale(-1,1);dx=0;dy=0;}
    const sh=sp*dw/c;
    g.drawImage(img,sx,sy+sp,c,c-sp,dx,dy+sh,dw,dw-sh);
    g.drawImage(img,sx,sy,c,sp,dx+ux,dy+uy,dw,sh);
    g.restore();}
  // 新規格英雄:依動作時間軸挑格(sprites/SPRITE_VISUAL_BIBLE.md §9.2 動畫時間表)。回傳 {act,i,pose}(pose 給驗收 hook)。
  // vdir:四方向(上 Up 正背面、下 Down 正面、左右 = 側面;左用烘好的 Left 列)。戰鬥一律側面。
  function sheetPose(h,pose,walking,cheering,vdir='side'){const t=state.time||0,m=heroSheets[h.classId].meta.actions,A=n=>actOf(heroSheets[h.classId].meta,n)||m.idle;
    if(h.hp<=0){const dt=8-(h.reviveTimer??8);return{act:'death',i:Math.floor(dt/A('death').frameTime),pose:'dead'};}
    const sk=t-(h.skillAt??-99),skLen=A('skill').frames*A('skill').frameTime;if(sk>=0&&sk<skLen)return{act:'skill',i:Math.floor(sk/A('skill').frameTime),pose:'skill'};
    if(pose.pose==='hurt'||(pose.hit>=0&&pose.hit<A('hurt').frames*A('hurt').frameTime&&pose.pose!=='strike'))return{act:'hurt',i:Math.floor(Math.max(0,pose.hit)/A('hurt').frameTime),pose:'hurt'};
    // 出招節奏:列上有 strikeDur(出手後每格秒數)就逐格計時(放招格極短、命中格長、收招慢 = 力量感),沒有就每格 frameTime;
    // windupPow < 1 = 蓄力早早到最大蓄力格並停住(預備動作)。總長不變,不影響戰鬥節奏。
    const atkAct='attack'+dirSuffix(m,'attack',vdir);
    let atk=t-(h.atkAt??-99);const AR0=actOf(heroSheets[h.classId].meta,atkAct),AR=AR0?.ownTiming?AR0:A('attack'),rel=AR.release??1,ft=AR.frameTime,sd=AR.strikeDur,imp=(AR.impact||rel+1)-rel,
      hs=sd?sd.slice(0,imp).reduce((s,v)=>s+v,0):imp*ft,sLen=sd?sd.reduce((s,v)=>s+v,0):(AR.frames-rel)*ft;
    if(atk>=hs+HIT_STOP)atk-=HIT_STOP;else if(atk>=hs)atk=hs;  // 命中格停頓
    // 方向列有 ownTiming:用它自己的節奏(格數跟其他方向不同,例:刺客南向 41 格,總長仍跟其他方向一樣;蓄力長度 release×windupFrameTime 要等於 attack 列的)。
    // 4 方向攻擊:打向哪裡就用那一列(上/下/右;左 = 烘好的 Left 列或右列鏡像)。素材沒有上/下列就退回側面。
    if(atk>=0&&atk<sLen){let i=rel+Math.floor(atk/ft);if(sd){let acc=0;i=rel+sd.length-1;for(let k=0;k<sd.length;k++){acc+=sd[k];if(atk<acc){i=rel+k;break;}}}return{act:atkAct,i,pose:'strike'};}
    // windupFrame:素材指定蓄力停在哪一格(法師停 frame 2 = 手上的球還小,留位置給 pixelfx 的集氣火焰)
    if(pose.pose==='windup'){const wf=Math.max(0,Math.min(rel-1,AR.windupFrame??rel-1)),wi=AR.windupFrameTime&&pose.wt!=null?Math.floor(pose.wt/AR.windupFrameTime):Math.floor(Math.pow(pose.k,AR.windupPow||1)*rel);return{act:atkAct,i:Math.max(0,Math.min(wf,wi)),pose:'windup'};}
    if(walking){const w='walk'+dirSuffix(m,'walk',vdir),i=gaitFrame('h'+h.id,h.x,h.z,m[w],(hash(h.id)%97)/97);return{act:w,i,pose:'walk'+(1+i),vdir};}
    if(cheering)return{act:'victory',i:Math.floor((t-(heroMemo.get(h.id).cheer-.9))/A('victory').frameTime),pose:'victory'};
    // 待機也用上一次動作(出手/走路)鎖定的方向:攻擊前後姿勢一致,要到下一個動作才換方向。
    const isf=dirSuffix(m,'idle',vdir);const id='idle'+isf;return{act:id,i:Math.floor(elapsed/m[id].frameTime+hash(h.id))%m[id].frames,pose:'idle',vdir};}
  // 攻擊逐格播放(攻擊列有 windupFrameTime 才開,目前只有遊俠):畫面一幀最多前進一格,攻擊一開始之後每一格都會畫到。
  // 遊戲預設 30fps(一幀 33ms)又有 2–3 倍速,照時間算的格常一次跳 2 格以上、中間那格整個沒畫到 → 落後時畫下一格、慢慢追上;
  // 出手時間結束了還沒播到最後一格,也先播完再換待機/走路/勝利(受擊、技能、倒下不等)。同一個遊戲時間重畫(暫停)停在同一格。
  const atkSeq=new Map();
  function noSkip(h,sp){const meta=heroSheets[h.classId].meta;if(!actOf(meta,'attack')?.windupFrameTime)return sp;
    const L=atkSeq.get(h.id),t=state.time||0,isAtk=/^attack/.test(sp.act);
    if(actOf(meta,sp.act)?.noSkip===false){atkSeq.set(h.id,{sp,t,last:0});return sp;}   // 這一列不逐格(例:刺客南向 41 格塞在原本的攻擊時長裡)
    if(L&&t-L.t<.4){
      if(t===L.t)return L.sp;
      if(isAtk&&sp.act===L.sp.act&&sp.i>L.sp.i+1)sp={...sp,i:L.sp.i+1};
      else if(!isAtk&&/^(idle|walk|victory)/.test(sp.act)&&/^attack/.test(L.sp.act)&&L.sp.i<L.last)sp={...L.sp,i:L.sp.i+1};}
    atkSeq.set(h.id,{sp,t,last:(actOf(meta,sp.act)?.frames||1)-1});return sp;}
  function drawSheetHero(h,p,facing,sp,alpha=1,pose=null){const meta=heroSheets[h.classId].meta,key=actRow(meta.actions,sp.act),row=meta.actions[key];let baked=!!sp.act&&/Left$/.test(sp.act);if(baked)facing=1;   // 已是烘好的左向列:不要再翻一次(翻了會變成面朝右),配件錨點也用列自己的
    {const [a2]=leftRow(meta,sp.act,facing);if(a2!==sp.act){sp={...sp,act:a2};facing=1;baked=true;}}
    const look=h.id?heroLook(h):null,bid=look?.bodySheet||h.classId;
    const f=sheetFrame(h.classId,sp.act,sp.i,look);if(!f)return null;heroLodUse[f.hi?'2x':'1x']++;const k=f.art*scale,dw=Math.round(f.c*k),dh=dw;
    const mo=row?.bakedMotion?null:motionOf(key,sp.i,row?.frames||8),fwd=baked?-1:1,walkDir=facing<0?-1:1;   // bakedMotion：素材本身已有真的踏步/弓步，不再疊執行期的假前衝與切身體
    const q=pose?{x:p.x+Math.round((pose.flash?Math.sin((state.time||0)*95)*.8:0)*scale),y:p.y}:p,dx=R(q.x-f.c/2*k)+(mo?R(mo.fx*dw/100)*(baked?-1:walkDir):0),dy=R(q.y-f.foot*k);
    const split=f.foot-.38*f.meta.heroHeight;
    cast(f.img,f.sx,f.sy,f.c,f.c,dx,dy,dw,dh,facing<0,true,'char');g.save();g.globalAlpha=alpha;
    if(mo)drawBodySliced(f.img,f.sx,f.sy,f.c,dx,dy,dw,facing<0,mo,split,fwd);
    else if(facing<0){g.translate(dx+dw,dy);g.scale(-1,1);g.drawImage(f.img,f.sx,f.sy,f.c,f.c,0,0,dw,dh);}else g.drawImage(f.img,f.sx,f.sy,f.c,f.c,dx,dy,dw,dh);
    // 零件層（照開羅《冒險村物語2》的做法）：身體一張表、每個零件自己一張表，
    // 用「逐格位移」offset[frame] 疊在同一個座標系上。換裝備＝只換那張零件表，身體不用重生。
    if(partsVisible){const parts=heroSheets[bid]?.meta?.parts;   // 穿甲整身表沒有 parts（武器已畫進身體，不要疊兩把）
      if(parts)for(const part of parts){let pid=part.sheet;
        if(part.id==='weapon'&&look?.weapon==='fine'){const fine=`${h.classId}-weapon-fine`;if(heroSheets[fine]?.meta)pid=fine;}   // 精良武器＝換零件表，身體不用重生
        let ps=heroSheets[pid];if(!ps?.meta){warnPartOnce(pid);continue;}
        if(f.hi&&ps.hi?.meta?.actions[key])ps=ps.hi;   // 身體用 @2x 時零件也用 @2x（兩份表版面是嚴格 2 倍，位置不變）
        const pa=ps.meta.actions[key];if(!pa)continue;
        const pi=Math.max(0,Math.min(pa.frames-1,sp.i)),off=pa.offset?.[pi]||[0,0],pk=(HERO_H/ps.meta.heroHeight)*scale;
        // 執行期上半身位移（drawBodySliced 的 ux/uy）：手在上半身，拿在手上的零件要跟著動，不然劍會跟手分開
        const mux=mo?Math.round(mo.ux*dw/100)*fwd*(facing<0?-1:1):0,muy=mo?Math.round(mo.uy*dw/100):0;
        const px=dx+Math.round(off[0]*pk)+mux,py=dy+Math.round(off[1]*pk)+muy;
        if(part.shadow!==false)cast(ps.img,pi*pa.cell,pa.y,pa.cell,pa.cell,px,py,dw,dh,facing<0,true,'char');   // 劍也投影；殘影（shadow:false）不投影
        if(facing<0){g.save();g.translate(px+dw,py);g.scale(-1,1);g.drawImage(ps.img,pi*pa.cell,pa.y,pa.cell,pa.cell,0,0,dw,dh);g.restore();}
        else g.drawImage(ps.img,pi*pa.cell,pa.y,pa.cell,pa.cell,px,py,dw,dh);}}
    if(pose?.flash>0){const tf=g.getTransform(),fa=alpha*pose.flash*.8,tc=tinted(f.img,f.sx,f.sy,f.c,f.c,pose.flashColor),flipNow=facing<0,
      paint=()=>{if(mo)drawBodySliced(tc,0,0,f.c,dx,dy,dw,flipNow,mo,split,fwd);else if(flipNow)g.drawImage(tc,0,0,f.c,f.c,0,0,dw,dh);else g.drawImage(tc,0,0,f.c,f.c,dx,dy,dw,dh);};
      deferTopVfx(()=>{g.save();g.setTransform(tf);g.globalAlpha=fa;paint();g.restore();});}
    g.restore();
    // 配件:頭頂錨點 → 配件底部沉進頭頂 4 美術像素(光環浮在上面 4 px);跟角色同密度、同翻面
    {const acc=h.id&&heroAcc?heroAccessory(h):null,hd=acc?row?.head?.[Math.max(0,Math.min((row.frames||1)-1,sp.i))]:null;
     if(hd){const it=heroAcc.meta.items[acc],C=heroAcc.meta.cell,hx=facing<0?f.c-hd[0]:hd[0],ax=Math.round(dx+(hx-C/2)*k),ay=Math.round(dy+(hd[1]-C+2+(acc==='halo'?-4:4))*k);
       g.save();g.globalAlpha=alpha;if(facing<0){g.translate(ax+C*k,ay);g.scale(-1,1);g.drawImage(heroAcc.img,it.i*C,0,C,C,0,0,C*k,C*k);}else g.drawImage(heroAcc.img,it.i*C,0,C,C,ax,ay,C*k,C*k);g.restore();}}
    const hh=f.meta.heroHeight*k;return{x:q.x-hh*.35,y:q.y-hh,w:hh*.7,h:hh};}
  // 紙娃娃英雄(docs/PAPERDOLL.md §12.1)。旗標:?doll=hero(有資料的職業全換)、?doll=hero:paladin,archer、或 globalThis.__mistvaleDoll('hero'|null)。
  // 沒開旗標時 dollHero.on=false,drawHunterSheet 直接走原本的 drawSheetHero —— 跟沒有這段程式碼時完全一樣。
  // 動作/時間點仍由 sheetPose 決定(同一套戰鬥時序),這裡只把那一刻換成紙娃娃的 (動作,tick),合成格子圖後用跟 sheet 相同的方式畫。
  // hideEffects:'arrow' —— 弓的出手格在弓旁畫一支箭,但遊戲在 atkAt 已經射出真的箭(drawProjectile),兩支會重疊約 0.13 秒。
  // 近戰的 slash(英雄身上的揮砍軌跡)與法杖技能的 burst(手上的光)保留:遊戲在施法者身上沒有同位置的特效(命中特效畫在目標)。
  // (歷史:2026-11-15 早先預設是 DV2 包,docs/DV2-PHASE6.md §5;HeroLoom 實驗見 commit ac6d722。)
  // 2026-11-15 使用者:HeroLoom(experiment/heroloom 分支版本)是唯一英雄系統 → 預設 HeroLoom(?doll= 沒給 / hero / loom);
  // ?doll=dv2[:職業] = DV2 包(只當可選開關)。HeroCreator 草稿已捨棄。
  const dollQ0=globalThis.location?new URLSearchParams(globalThis.location.search).get('doll'):null;
  const dollKind=/^(hero)?loom(:|$)/i.test(dollQ0??'')?'loom':/^dv2(:|$)/i.test(dollQ0??'')?'dv2':'loom';
  const dollDv2=dollKind==='dv2';
  const dollHero=(dollDv2?createDv2DollHero:createDollHero)({trackImage,makeCanvas,cap:()=>lowMemDevice?192:512,onEvict:cv=>texRelease?.(cv),
    ...(dollDv2?{hideEffects:['arrow']}:{}),   // DV2 包的弓出手格會畫一支箭;遊戲自己射真的箭,不重複畫
    onReady:()=>globalThis.dispatchEvent?.(new CustomEvent('pixel-assets-ready'))});   // 資料好了:UI 立繪快取清掉重畫(換成紙娃娃立繪)
  // HeroLoom(?doll=loom,assets/heroloom,docs/HEROLOOM.md)的資料包沒有 death/ride_* 動作,
  // 由 paperdoll-hero.js 的衍生路徑接手(倒地 = hurt 末格 + 旋轉;騎乘 = walk/stand),所以下面的騎乘判斷不看 ride_sit。
  // ?doll=0 / ?doll=off / ?doll=sheet 回到原本烘好的 sheet;?doll=hero:paladin,archer / dv2:… / loom:… 指定該包的職業子集。
  // 沒有 XMLHttpRequest 的環境(檢查腳本在 Node 裡直接 createWorld)就維持 sheet,不要讓它爆掉。
  {const q=globalThis.location?new URLSearchParams(globalThis.location.search).get('doll'):null;
   const off=/^(0|off|no|sheet|none)$/i.test(q??'');
   const sub=(q??'').match(/^(?:dv2|hero(?!loom)|(?:hero)?loom)(:.*)?$/i)?.[1]||'';   // 職業子集 ':paladin,archer'
   if(!off&&typeof XMLHttpRequest!=='undefined'){try{dollHero.setSpec('hero'+sub);}
     catch(e){console.warn('[mistvale] paperdoll hero off:',e&&e.message||e);}}}
  globalThis.__mistvaleDoll=(spec)=>spec===undefined?dollHero.status():dollHero.setSpec(spec);
  globalThis.__mistvaleLoom=dollHero;   // 驗收/實驗面板 hook:covers/compose/look/recipe/bakeRecipe/status
  // 弓手換裝測試(docs/HEROLOOM-OUTFITS.md;?outfit=a|b|c):整張換裝 sheet 蓋掉分層紙娃娃,
  // 只對弓手生效;sheet 缺檔/不合規格(尺寸、格數、腳底錨點)就自動退回分層,遊戲照常跑。
  {const q=globalThis.location?new URLSearchParams(globalThis.location.search).get('outfit'):null;
   if(q&&typeof dollHero.setOutfit==='function'){try{dollHero.setOutfit(q);}catch(e){console.warn('[mistvale] outfit off:',e&&e.message||e);}}}
  // 單層怪物紙娃娃(DV2 C2,docs/PAPERDOLL.md §21):**只在 ?mdoll=1(或 __mistvaleMonsterDoll(true))才開**,預設魔物照舊畫 assets/monsters3。
  // 開著時 drawMonsterSheet 把要畫的那一格 (列, 格) 換成怪物包的 (SEB_M, 方向, 格),經 computeMonsterParts → drawParts 畫進一張跟 sheet 格同尺寸的
  // 格子圖,其餘(縮放、鏡像、切片位移、閃光、影子)走原本的程式 → 畫面跟 sheet 逐像素相同(test-paperdoll 比對)。包或圖還沒載好的那幾幀照畫 sheet。
  const monDoll={on:false,data:null,loading:false,failed:null,img:{},imgReq:new Set(),index:new Map(),cells:new Map(),hits:0,misses:0};
  function monDollLoad(){if(monDoll.data||monDoll.loading||typeof XMLHttpRequest==='undefined')return;monDoll.loading=true;
    const base=globalThis.PIXEL_ASSETS?.monsterDollBase||'media/monsterdoll/',x=new XMLHttpRequest();x.open('GET',base+'monsterdoll.json');
    x.onload=()=>{try{if(!(x.status===200||(x.status===0&&x.responseText)))throw new Error('status '+x.status);const d=JSON.parse(x.responseText);
      // (物種|sheet 列|格) → [SEB_M, 方向, 該動作第幾格];只收非鏡像的來源(鏡像由 drawMonsterSheet 的 flip 處理,跟 sheet 一樣)
      for(const [key,a] of Object.entries(d.actions||{})){const [sp,seb]=key.split('/');(a.src||[]).forEach((s,dir)=>{if(s.mirror)return;for(let i=0;i<s.n;i++){const k=sp+'|'+s.row+'|'+(s.from+i);if(!monDoll.index.has(k))monDoll.index.set(k,[seb,dir,i]);}});}
      monDoll.data=d;}catch(e){monDoll.failed=String(e.message||e);console.warn('[mistvale] monster doll:',e);}};
    x.onerror=()=>{monDoll.failed='monsterdoll.json unreachable';};x.send();}
  function monDollCell(id,act,f,c,fb){
    if(!monDoll.data)return null;const key=id+'|'+act+'|'+f,hit=monDoll.cells.get(key);if(hit){monDoll.hits++;return hit;}
    const e=monDoll.index.get(key);if(!e)return null;const im=monDoll.img[id];
    if(!im){if(!monDoll.imgReq.has(id)&&monDoll.data.images?.[id]){monDoll.imgReq.add(id);const base=globalThis.PIXEL_ASSETS?.monsterDollBase||'media/monsterdoll/',m=trackImage(new Image());
      m.onload=()=>{monDoll.img[id]=m;};m.onerror=()=>{monDoll.imgReq.delete(id);};m.src=base+monDoll.data.images[id];}return null;}
    const [seb,dir,i]=e,parts=computeMonsterParts(monDoll.data,id,{action:seb,dir,tick:monsterFrameTick(monDoll.data,id,seb,i)});if(!parts.length)return null;
    const cv=makeCanvas(c,c);drawDollParts(cv.getContext('2d'),parts,{[id]:im},{x:c/2,y:c-fb},1);monDoll.misses++;
    monDoll.cells.set(key,cv);if(monDoll.cells.size>(lowMemDevice?256:768)){const k0=monDoll.cells.keys().next().value;texRelease?.(monDoll.cells.get(k0));monDoll.cells.delete(k0);}
    return cv;}
  {const q=globalThis.location?new URLSearchParams(globalThis.location.search).get('mdoll'):null;if(/^(1|on|yes|true)$/i.test(q??'')){monDoll.on=true;monDollLoad();}}
  globalThis.__mistvaleMonsterDoll=(on)=>{if(on!==undefined){monDoll.on=!!on;if(monDoll.on)monDollLoad();}
    return{on:monDoll.on,ready:!!monDoll.data,failed:monDoll.failed,species:Object.keys(monDoll.img),cells:monDoll.cells.size,hits:monDoll.hits,misses:monDoll.misses};};
  // 驗收:這個物種每一個對到的 (列,格) 用怪物包組出來的格子圖 vs monsters3 sheet 的同一格,逐像素比(兩張圖都要已載入)
  globalThis.__mistvaleMonsterDollCompare=(id)=>{const ms=monsterSheets[id];if(!monDoll.data||!ms||!monDoll.img[id])return{ready:false};let cells=0,diffs=0;const bad=[];
    for(const [key] of monDoll.index){const [sp,act,fs]=key.split('|');if(sp!==id)continue;const a=ms.meta.actions[act],f=+fs,c=a.cell;
      monDoll.cells.delete(key);const cv=monDollCell(id,act,f,c,ms.meta.footFromBottom);if(!cv){diffs++;bad.push(key+' (no cell)');continue;}
      const ref=makeCanvas(c,c),rx=ref.getContext('2d');rx.drawImage(ms.img,f*c,a.y,c,c,0,0,c,c);
      const A=rx.getImageData(0,0,c,c).data,B=cv.getContext('2d').getImageData(0,0,c,c).data;let same=true;for(let i=0;i<A.length;i++)if(A[i]!==B[i]){same=false;break;}
      cells++;if(!same){diffs++;if(bad.length<5)bad.push(key);}}
    return{ready:true,cells,diffs,bad};};
  // 騎乘(DV2 C1,docs/PAPERDOLL.md §20):坐騎 = 一種 monsters3 魔物 sheet;騎乘者的腳放在坐騎表(assets/mounts.json,build 內嵌)的鞍點;
  // 深度照 DV2 Proc_updateDrawDepth(rideDepth:上 +1 騎乘者在前、右/下/左 −1 在後);只有坐騎投影。
  const MOUNT_TABLE=()=>globalThis.PIXEL_ASSETS?.mounts?.mounts||{};
  const RIDE_VDIR=['up','side','down','sideLeft'];
  // dir = 騎乘者實際畫的方向 0..3;riderKey/tick = 紙娃娃騎乘動作與 tick(sheet 路徑傳 null → 坐騎只走/站);
  // riderK = 騎乘者自己的縮放(畫面 px / 騎乘者美術 px):鞍點(坐騎的背線)用坐騎的縮放 km,騎乘者腳到背線的距離 hip 用騎乘者的 riderK
  function mountPlan(h,dir,riderKey,tick,moving,q,alpha=1,riderK=null){
    const type=h.mount,ms=MON_SHEET(type);if(!ms)return null;const A=ms.meta.actions,vd=RIDE_VDIR[dir]??'side',flip=dir===3;
    const mm=riderKey&&dollHero.data?mountMotion(dollHero.data,riderKey,tick,moving):{seb:moving?'walk':'stand',k:null};
    const kind=mm.seb==='walk'?'walk':mm.seb==='stand'?'idle':'attack',act=kind+dirSuffix(A,kind,vd),row=A[act]||A[kind];if(!row)return null;
    let f=0;
    if(kind==='walk')f=gaitFrame('mount:'+h.id,h.x,h.z,row,(hash(h.id)%97)/97);
    else if(kind==='idle')f=Math.floor(elapsed/row.frameTime+hash(h.id))%row.frames;
    else{const rel=Number.isFinite(row.release)?row.release:4;f=mm.seb==='charge'?Math.max(0,Math.min(rel-1,Math.floor(mm.k*rel))):Math.min(row.frames-1,rel+Math.floor(mm.k*(row.frames-rel)));}
    f=Math.max(0,Math.min(row.frames-1,f));
    const [act2]=leftRow(ms.meta,act,flip?-1:1),hd=(A[act2]||row).head,bob=hd&&hd[f]&&hd[0]?hd[f][1]-hd[0][1]:0;   // 坐騎走路的上下起伏,騎乘者跟著
    const MT=globalThis.PIXEL_ASSETS?.mounts,seat=MT?.mounts?.[type]?.seat==='stand'?'stand':'sit',hip=MT?.hip?.[seat]??(seat==='sit'?5:1);
    const sad=MT?.mounts?.[type]?.saddle?.[dir]||[0,-Math.round((ms.meta.artSize||72)*.8)],km=21/72*scale,rk=riderK??(HERO_H/(dollHero.data?.meta?.heroHeight||29))*scale;
    return{type,act,f,flip,depth:rideDepth(dir),ox:R(sad[0]*km),oy:R((sad[1]+bob)*km+hip*rk),draw:()=>drawMonsterSheet(type,q,flip,act,f,alpha)};}
  const dollSeq=new Map(),dollHurt=new Map(),dollWind=new Map(),dollAtk=new Map(),DOLL_HOR=[0,1,0,-1,1,1,-1,-1],dollWarned=new Set();
  dollPortraitSource=dollHero;   // drawPortrait(模組層級)用同一個紙娃娃
  // 紙娃娃開著卻退回 sheet:每種(職業,動作)只警告一次。正常情況不該發生(test-paperdoll 的 coverage 測試保證)。
  function dollFallbackWarn(cls,act,failed){const k=cls+':'+act+':'+(failed||'');if(dollWarned.has(k))return;dollWarned.add(k);
    console.warn('[mistvale] paperdoll fallback to hero sheet:',cls,act,failed?'(data failed: '+failed+')':'(no paperdoll for this class/pose)');}
  function drawDollHero(h,p,facing,sp,alpha,pose,target,vdir){
    if(!dollHero.covers(h.classId))return null;
    const meta=heroSheets[h.classId].meta,A=n=>actOf(meta,n)||meta.actions.idle,t=state.time||0,data=dollHero.data;
    // 出招時間點照 sheetPose 的算法:release 在 atkAt、命中格開頭 = 遊戲打中的那一刻(目標 hitAt;沒有就用 sheet 列的命中時間)、命中停 HIT_STOP
    const AR0=actOf(meta,'attack'+dirSuffix(meta.actions,'attack',vdir)),AR=AR0?.ownTiming?AR0:A('attack'),rel=AR.release??1,ft=AR.frameTime,sd=AR.strikeDur,imp=(AR.impact||rel+1)-rel,
      hs=sd?sd.slice(0,imp).reduce((s,v)=>s+v,0):imp*ft,sLen=sd?sd.reduce((s,v)=>s+v,0):(AR.frames-rel)*ft;
    // 命中時刻用攻擊者自己這一擊的(h.atkHitAt,pixel-game 出手時記下);不用 target.hitAt —— 那是共用的,
    // 別的獵人/箭/技能打同一隻會覆寫它,命中格就會提早或延後、甚至出手中途 命中→出手→命中 閃。沒有(遠程、空揮、舊資料)就用 sheet 列的命中時間。
    const hd=h.atkHitAt!=null&&h.atkAt!=null&&h.atkHitAt>=h.atkAt&&h.atkHitAt-h.atkAt<.3?h.atkHitAt-h.atkAt:hs;
    const hurtLen=A('hurt').frames*A('hurt').frameTime;let hit=pose?.hit;
    if(sp.pose==='hurt'&&h.hitAt!=null){const ch=hurtChain(dollHurt.get(h.id),h.hitAt,t,hurtLen);dollHurt.set(h.id,ch);hit=t-ch.start;}   // 連續被打:受擊接著播,不從頭閃
    // 騎乘(§20):有坐騎、資料包有騎乘動作、坐騎 sheet 已載好 → 騎乘動作(坐騎 sheet 還在載的那幾幀照一般動作畫,不閃空)
    const riding=h.hp>0&&!!h.mount&&!!MON_SHEET(h.mount),seat=riding?(MOUNT_TABLE()[h.mount]?.seat==='stand'?'stand':'sit'):null;   // HeroLoom 沒有 ride_* 動作,騎乘者靠衍生路徑(走路/站立),坐騎照常演
    // DV2 連擊變體(§22,只是外觀):蓄力與出手用同一個鍵(上一擊的 atkAt)骰 attack/attack_h/attack_t,見 paperdoll-hero.js dollAttackVariant
    const wt=dollHero.weaponTypeOf(h),am=trackAttackStamp(dollAtk.get(h.id),h.atkAt);dollAtk.set(h.id,am);
    const req=dollActionTick({pose:sp.pose,ride:seat,i:sp.i,t,atkAt:h.atkAt??-99,skillAt:h.skillAt??-99,hit,windupT:pose?.wt,windupLen:windupLen(h,false),
      hitDelay:hd,strikeEnd:sLen+HIT_STOP,hitStop:HIT_STOP,skillRelease:SKILLS[h.classId]?.release,skillLen:A('skill').frames*A('skill').frameTime,
      hurtLen,walkFrames:actOf(meta,sp.act)?.frames,elapsed,seed:(hash(h.id)%97)/97,data,weaponType:wt,attack:dollAttackVariant(data,wt,h.id,sp.pose,am),
      deathT:8-(h.reviveTimer??8),deathLen:A('death').frames*A('death').frameTime,cheerT:t-((heroMemo.get(h.id)?.cheer??t)-.9),
      // Phase 6(§23,只是外觀):歡呼有時播 ｼﾞｬﾝﾌﾟ万歳(鍵 = 這次歡呼);站在店門口交易/買裝備時播 物渡し
      victory:dollVictoryAction(data,h.id,heroMemo.get(h.id)?.cheer),life:dollLifeAction(h.status)});
    if(!req)return null;
    const af=data.actions[req.action].af,stamp=sp.pose==='skill'?h.skillAt:sp.pose==='strike'?h.atkAt:null;
    if(stamp!=null){req.tick=advanceNoSkip(dollSeq.get(h.id),req,stamp,t,af);dollSeq.set(h.id,{stamp,key:req.action,slot:dollSlot(af,req.tick),tick:req.tick,t});}
    // 同一段蓄力只往前(遠程拉開時 attackTimer 會來回,不要 0→1→0 閃)。「同一段」= 同一個上一擊(atkAt)而且上一次畫蓄力在 0.25 秒內;
    // 蓄力被打斷(目標死了、換目標)後重新蓄力,中間隔了走路/待機 → 新的一段,從 slot 0 開始,不沿用舊的最大值。
    if(sp.pose==='windup'){const w=dollWind.get(h.id);if(w&&w.stamp===h.atkAt&&w.key===req.action&&t-w.t>=0&&t-w.t<.25)req.tick=Math.max(w.tick,req.tick);dollWind.set(h.id,{stamp:h.atkAt,key:req.action,tick:req.tick,t});}
    // sideHint:只給只有側面美術的 HeroLoom(上/下象限畫側面時朝哪邊);DV2 包不看它
    const wn=req.action==='walk'&&/^walk/.test(sp.pose)?actOf(meta,sp.act)?.frames:0;   // 走路相位給 HeroLoom 自己換算格(見 heroloom-hero.js walkFrameOf)
    const c=dollHero.compose(h,{action:req.action,tick:req.tick,walkPhase:wn>0?((((sp.i||0)%wn)+wn)%wn+.5)/wn:null,dir:dollDirName(vdir,facing),sideHint:facing<0?-1:1,hideWeapon:!partsVisible,globalTick:Math.floor(t*(data.tickRate||20))});
    if(!c)return null;
    heroLodUse['1x']++;   // 紙娃娃沒有 @2x;計數照算,LOD 切換邏輯不受影響
    const W=c.cv.width,H=c.cv.height,k=(HERO_H/c.heroHeight)*scale,dw=Math.round(W*k),dh=Math.round(H*k);
    // 跟 sheet 一樣的整體前衝/受擊後退(MOTION 的 fx,單位 = sheet 格寬的 %;drawSheetHero 的 mo.fx*dw/100)。
    // 只用 fx(整張平移);ux/uy 是把 sheet 切上下兩段的上半身位移,紙娃娃是合成好的一張,不做。
    const mrow=actOf(meta,sp.act),mo=mrow&&!mrow.bakedMotion?motionOf(actRow(meta.actions,sp.act),sp.i,mrow.frames||8):null,
      lunge=mo?.fx?R(mo.fx*(mrow.cell||meta.cell)*(HERO_H/meta.heroHeight)*scale/100)*(facing<0?-1:1):0;
    const q0=pose?{x:p.x+Math.round((pose.flash?Math.sin(t*95)*.8:0)*scale),y:p.y}:p;
    // 騎乘:坐騎畫在獵人腳下(p),騎乘者的腳移到鞍點;深度 +1 先畫坐騎、−1 後畫坐騎(蓋住騎乘者的腳)
    const mount=riding?mountPlan(h,c.parts.dir,c.parts.action,req.tick,/^walk/.test(sp.pose),p,alpha,k):null;
    const q=mount?{x:q0.x+mount.ox,y:q0.y+mount.oy}:q0,dx=R(q.x-c.footX*k)+lunge,dy=R(q.y-c.footY*k);
    let mountRect=null;if(mount&&mount.depth>0)mountRect=mount.draw();
    const castWas=casting;if(mount)casting=false;   // 一個影子:坐騎的(騎乘者不投影)
    try{
    if(req.lie){   // 資料包沒有 death 動作時的衍生倒地:hurt 末格以腳底為軸往後倒(0.45 秒倒成 90°)
      g.save();g.globalAlpha=alpha*(1-.25*req.lie);g.translate(R(q.x),R(q.y));g.rotate(-(facing<0?-1:1)*req.lie*Math.PI/2);
      g.drawImage(c.cv,0,0,W,H,-c.footX*k,-c.footY*k,dw,dh);g.restore();
    }else{
    {const sh=c.shadow||c,SW=sh.cv.width,SH=sh.cv.height;   // 影子:同一個(外觀,動作,方向)共用一張(見 paperdoll-hero.js shadowRep)
      cast(sh.cv,0,0,SW,SH,R(q.x-sh.footX*k)+lunge,R(q.y-sh.footY*k),Math.round(SW*k),Math.round(SH*k),false,true,'char');}
    g.save();g.globalAlpha=alpha;g.drawImage(c.cv,0,0,W,H,dx,dy,dw,dh);
    if(pose?.flash>0){const tf=g.getTransform(),fa=alpha*pose.flash*.8,tc=tinted(c.cv,0,0,W,H,pose.flashColor);
      deferTopVfx(()=>{g.save();g.setTransform(tf);g.globalAlpha=fa;g.drawImage(tc,0,0,W,H,dx,dy,dw,dh);g.restore();});}
    g.restore();}
    }finally{casting=castWas;}
    if(mount&&mount.depth<=0)mountRect=mount.draw();
    // 驗收 hook:記下紙娃娃實際畫的方向(左右由畫出來的那一列決定)與動作/slot
    const df=drawnFacing.get(h.id),hor=DOLL_HOR[c.parts.dir];if(df){if(hor)df.f=hor;df.doll={act:c.parts.action,slot:c.parts.slot,dir:c.parts.dir,want:c.parts.wantDir,phase:req.phase};
      if(mount)df.mount={type:mount.type,act:mount.act,f:mount.f,depth:mount.depth,ox:mount.ox,oy:mount.oy};}
    const hh=c.heroHeight*k,rr={x:q.x-hh*.35,y:q.y-hh,w:hh*.7,h:hh};
    if(mountRect){const x0=Math.min(rr.x,mountRect.x),y0=Math.min(rr.y,mountRect.y);return{x:x0,y:y0,w:Math.max(rr.x+rr.w,mountRect.x+mountRect.w)-x0,h:Math.max(rr.y+rr.h,mountRect.y+mountRect.h)-y0};}
    return rr;}
  function drawHunter(h,wanderer){if(!Number.isFinite(h.x)||!Number.isFinite(h.z))return;
    if(heroSheets[h.classId])return drawHunterSheet(h,wanderer);if(pendingHero(h.classId))return;const p=screenPoint(h.x,h.z),old=previousPositions.get(h.id),moving=old&&Math.hypot(h.x-old.x,h.z-old.z)>.005;let facing=old?.facing||1;if(old&&Math.abs(h.x-old.x-(h.z-old.z))>.002)facing=h.x-old.x-(h.z-old.z)>0?1:-1;
    const isSelected=selected===`hunter:${h.id}`;
    contact(p,5);if(state.pilot?.id===h.id)ring(p,9,'#ffd98a');if(isSelected)ring(p,8,'#fff1b0');if(wanderer)ring(p,6,'#7fc4ff');  // 金圈＝我現在操控的這位(釘在畫面正中央那一位)
    // 倒下:用倒地圖(<職業>_dead),半透明等復活;沒有倒地圖才退回把待機圖轉 90°。
    if(h.dead||h.hp<=0){previousPositions.set(h.id,{x:h.x,z:h.z,facing});drawnFacing.set(h.id,{f:facing,pose:(h.reviveTimer??0)>7.55?'falling':'dead',x:h.x,z:h.z,t:state.time});
      heroMemo.set(h.id,{...(heroMemo.get(h.id)||{}),wasDead:true});
      // 倒下過程:剛倒下的 0.45 秒先畫「跪倒」(falling),再躺平(dead)。reviveTimer 從 8 倒數。
      const deadPose=(h.reviveTimer??0)>7.55&&heroFrameFor(`${h.classId}_falling`,heroLodScale)?'falling':'dead';
      if(heroFrameFor(`${h.classId}_dead`,heroLodScale)){const sp=heroSprite(h.classId,0,facing,hash(h.id)%3,heroLodScale,deadPose);drawSprite(sp,p,21*CHAR_SCALE*sp.width/(sp.baseH||sp.height),21*CHAR_SCALE*sp.height/(sp.baseH||sp.height),1.2,.75);}
      else{g.save();g.translate(R(p.x),R(p.y-3*scale));g.rotate(Math.PI/2);g.globalAlpha=.55;{const sp=heroSprite(h.classId,0,facing,hash(h.id)%3),dw=21*sp.width/sp.height;g.drawImage(sp,-dw/2*scale*CHAR_SCALE,-12*scale*CHAR_SCALE,dw*scale*CHAR_SCALE,21*scale*CHAR_SCALE);}g.restore();}
      textLabel('✦',p.x,p.y-15*scale,{color:'#e7d8ef',back:false});return;}
    const target=h.status==='戰鬥中'&&h.targetId?(state.enemies||[]).find(e=>e.id===h.targetId&&e.hp>0):null,pose=combatPose(h,false,target);
    if(pose.face)facing=pose.face>0?1:-1;previousPositions.set(h.id,{x:h.x,z:h.z,facing});
    // 戰鬥中的位移只是「分散站位」被推開(面向目標),不播走路,不然會像倒退走。
    const walking=moving&&h.status!=='戰鬥中';
    const frame=walking&&pose.pose==='idle'?Math.floor(elapsed*7+hash(h.id)%5)%2:0;
    // 走路:四格走路;戰鬥:蓄力 → 出手 → 收招(strike2)、受擊;停著時依狀態:用餐/飲用/睡覺/包紮/交易/訓練;
    // 打倒目標後短暫歡呼(victory);其他待機時待機圖與呼吸圖(idle2)慢慢交替。
    const st=h.status||'',still=!walking&&!moving&&pose.pose==='idle';
    {const tg=h.targetId,prev=heroMemo.get(h.id);if(prev&&prev.tg&&prev.tg!==tg&&!(state.enemies||[]).some(e=>e.id===prev.tg&&e.hp>0)&&(state.time||0)-(h.atkAt??-99)<.8)heroMemo.set(h.id,{...prev,tg,cheer:(state.time||0)+.9});else heroMemo.set(h.id,{...prev,tg,cheer:prev?.cheer??-1});}
    const cheering=(state.time||0)<(heroMemo.get(h.id)?.cheer??-1)&&pose.pose==='idle'&&!walking;
    const servicePose=/用餐/.test(st)?'eat':/飲用/.test(st)?'drink':/休息|旅館/.test(st)?'sleep':/休養|治療/.test(st)?'bandaged':/交易|購買/.test(st)?'trade':/訓練/.test(st)?(Math.floor(elapsed*2.5+hash(h.id))%2?'train':'windup'):null;
    // 待機:待機/呼吸兩格交替,約每 3.2 秒眨一次眼(0.14 秒)
    const blinkT=(elapsed+hash(h.id)%17*.19)%3.2,breathe=blinkT<.14?'blink':Math.floor(elapsed*1.6+hash(h.id)%7*.37)%2?'idle2':'idle';
    // 復活:剛從倒地回來的 0.6 秒畫「起身」
    {const m=heroMemo.get(h.id)||{};if(m.wasDead){heroMemo.set(h.id,{...m,wasDead:false,getupUntil:(state.time||0)+.6});}}
    const gettingUp=(state.time||0)<(heroMemo.get(h.id)?.getupUntil??-1)&&!walking;
    const combatPoseName=pose.pose==='strike'&&pose.atk>.2&&!['archer','sorcerer'].includes(h.classId)?'strike2':pose.pose==='hurt'&&pose.hit>.16?'hurt2':pose.pose;
    const drawPose=pose.pose!=='idle'?combatPoseName:walking?walkFrame(elapsed,hash(h.id)):gettingUp?'getup':cheering?'victory':still&&servicePose?servicePose:breathe;
    drawnFacing.set(h.id,{f:facing,pose:drawPose,x:h.x,z:h.z,t:state.time});
    const sprite=heroSprite(h.classId,frame,facing,hash(h.id)%3,heroLodScale,drawPose),rect=posed(p,pose,q=>drawSprite(sprite,q,21*CHAR_SCALE*sprite.width/(sprite.baseH||sprite.height),21*CHAR_SCALE*sprite.height/(sprite.baseH||sprite.height),1.2,1,'char'));hits.push({id:`hunter:${h.id}`,...padHit(rect,14,18)});  // 圖變小,點擊範圍保底
    {const tf=g.getTransform();deferTopVfx(()=>{g.save();g.setTransform(tf);chargeGlow(h,p,pose,facing);g.restore();});}
    const full=(h.hp??1)/(h.maxHp||1);if(full<.99||isSelected||h.status==='戰鬥中')bar(p.x-7*scale,p.y-24*scale,14*scale,full,full<.35?'#df795c':'#84bf6a');
    if(isSelected)textLabel(`${h.name||'獵人'} Lv.${h.level||1}`,p.x,p.y-31*scale,{color:RARITIES.find(r=>r.id===h.rarity)?.color||'#ffe19a'});
    if(!isSelected&&scale>.65){let symbol='';if(h.status?.includes('治療')||h.status?.includes('休養'))symbol='+';else if(h.status?.includes('休息')||h.status?.includes('旅館'))symbol='z';else if(h.status?.includes('用餐'))symbol='♥';else if(h.status?.includes('飲用'))symbol='♪';else if(h.status?.includes('訓練'))symbol='↑';else if(h.status?.includes('交易'))symbol='$';if(symbol)textLabel(symbol,p.x+6*scale,p.y-24*scale-Math.sin(elapsed*3)*1.3,{size:8,color:'#f7e1a0'});}
  }
  // 橋欄:flora 的 railing 是「正面欄杆接成長條再剪切成等角斜向」的一整條。
  // 每個 bridgeRail 裝飾只畫長條上屬於自己那一格(u)的切片;最後一根(last)只畫柱子。
  // 欄杆高 12 世界像素;切片寬 = 一格世界單位(螢幕 9:4.5),剛好對上剪切斜率 0.5。
  function drawRailSlice(u,last,p){
    const lod=detailFrameFor('railing',scale*DPRK>=2.2),c=lod?.frames.railing;if(!c?.frontH)return false;
    const k=12*scale/c.frontH,uw=9*scale/k,half=c.postW/2;
    const a=last?0:u*uw,w=last?c.postW:Math.min(uw+1,c.w-u*uw);if(w<=0)return false;
    const anchor=a+half;
    g.drawImage(lod.img,c.x+a,c.y,w,c.h,R(p.x-half*k),R(p.y-(c.frontH+anchor*.5)*k),Math.max(1,Math.round(w*k)),Math.round(c.h*k));
    if(lod.scale===2)detailUse.draw2x++;else detailUse.draw1x++;
    return true;
  }
  // 魔物圖集(l0veyou 生):各格大小不同,倍率一律以第 0 格算,動畫才不會忽大忽小。
  // frame:0 待機、1 蓄力(狼伏低、魔像舉拳、領主怒吼)、2 出手(有攻擊圖集才有,沒有退回 1)。
  function drawAtlasMonster(type,frame,p,sz,flip,alpha=1){
    let id=type+frame,lod=detailFrameFor(id,scale*DPRK>=2.2);if(!lod&&frame===2){id=type+'1';lod=detailFrameFor(id,scale*DPRK>=2.2);}if(!lod){id=type+'0';lod=detailFrameFor(id,scale*DPRK>=2.2);}
    // 倍率基準＝待機圖(第 0 格)。0 格在 monsters 圖集、其他姿勢在 monsteratk 圖集 → 用「同解析度」的那份 0 格,不然會縮放錯或退回程序圖。
    const refLod=lod&&(detailLod.find(l=>l.scale===lod.scale&&l.frames[type+'0'])||detailFrameFor(type+'0',lod.scale===2)),ref=refLod?.frames[type+'0'];if(!lod||!ref)return null;
    const c=lod.frames[id],rs=sz*scale/Math.max(ref.w,ref.h),dw=Math.max(1,Math.round(c.w*rs)),dh=Math.max(1,Math.round(c.h*rs));
    // 軀幹錨點(ax)對齊站位點;沒有 ax 才用格寬置中。翻面時錨點跟著鏡像。
    const ax=c.ax!=null?c.ax*dw/c.w:dw/2,dx=R(p.x-(flip?dw-ax:ax)),dy=R(p.y-dh+2*scale);
    cast(lod.img,c.x,c.y,c.w,c.h,dx,dy,dw,dh,flip,true,'char');
    const fl=flashNext,ga=g.globalAlpha;g.globalAlpha=ga*alpha;
    const put=(img,sx,sy,sw,sh)=>{if(flip){g.save();g.translate(dx+dw,dy);g.scale(-1,1);g.drawImage(img,sx,sy,sw,sh,0,0,dw,dh);g.restore();}else g.drawImage(img,sx,sy,sw,sh,dx,dy,dw,dh);};
    put(lod.img,c.x,c.y,c.w,c.h);
    if(fl){const tf=g.getTransform(),fa=ga*alpha*fl.alpha,tc=tinted(lod.img,c.x,c.y,c.w,c.h,fl.color);
      deferTopVfx(()=>{g.save();g.setTransform(tf);g.globalAlpha=fa;put(tc,0,0,c.w,c.h);g.restore();});}
    g.globalAlpha=ga;
    return {x:dx,y:dy,w:dw,h:dh};
  }
  // 尺寸直接用 sheet 的 gameSize（舊的 slime/wolf/golem 已下架）；沒載到就用 28 頂著
  const ENEMY_SIZE=type=>{const id=type==='boss'?'treant':type;const m=monsterSheets[id]?.meta;
    return (type==='boss'?50:(m?.size||28))*CHAR_SCALE;};
  function drawHunterSheet(h,wanderer){const p=screenPoint(h.x,h.z),old=previousPositions.get(h.id),
    step=old?Math.hypot(h.x-old.x,h.z-old.z):0,moving=!!old&&step>.005;let facing=old?.facing||1;
    if(old&&Math.abs(h.x-old.x-(h.z-old.z))>.002)facing=h.x-old.x-(h.z-old.z)>0?1:-1;
    const isSelected=selected===`hunter:${h.id}`,top=HERO_H;contact(p,5);if(state.pilot?.id===h.id)ring(p,9,'#ffd98a');if(isSelected)ring(p,8,'#fff1b0');if(wanderer)ring(p,6,'#7fc4ff');
    // 狀態保持:走路 0.18 s、戰鬥 0.3 s。
    // 模擬的 status 會在同一場戰鬥裡 戰鬥中↔追擊中 每幾幀跳一次,位移也常常一幀有、一幀沒有;
    // 直接拿當幀的值決定「walk/idle」「側面/上下待機」就會每幀換一格 → 角色看起來在原地抖。
    const nowT=state.time||0,walkUntil=step>.0008?nowT+.18:(old?.walkUntil||0);
    const fightUntil=h.status==='戰鬥中'?nowT+.3:(old?.fightUntil||0),inFight=nowT<fightUntil;
    const target=inFight&&h.targetId?(state.enemies||[]).find(e=>e.id===h.targetId&&e.hp>0):null,pose=h.hp>0?combatPose(h,false,target):{pose:'idle',face:0,flash:0,hit:-1};
    let vdir=old?.vdir||'side';if(old&&step>.0008)vdir=moveDirStable(h.x-old.x,h.z-old.z,vdir);
    // 攻擊方向:每一次攻擊只在「開始那一刻」算一次,整段(蓄力+出手)固定不變。
    // 以前每一幀都用目標當下的位置重算方向 → 魔物一移動就越過扇區邊界,攻擊列每幀換一次,
    // 動畫看起來就是在亂跳(而且蓄力和出手可能選到不同方向)。方向一旦決定就不再改。
    const atkT=(state.time||0)-(h.atkAt??-99),armed=atkT>=0&&atkT<.46;   // .46 = 出手動畫全長(含命中停頓)
    const winding=!armed&&pose.pose==='windup'&&!!target;
    const ad=atkDirs.get(h.id)||{stamp:-1e9,dir:'side',mode:''};
    if(armed&&ad.stamp!==(h.atkAt??-99)&&h.atkX!=null){
      ad.stamp=h.atkAt??-99;
      // 有蓄力(畫面上先演了 0.3 秒)就沿用蓄力時鎖定的方向,整段攻擊同一列;沒有蓄力才用出手那刻的位置算
      if(ad.mode!=='windup'){ad.dir=moveDir(h.atkX-h.x,h.atkZ-h.z,ad.dir);ad.sx=sideOf(h,h.atkX,h.atkZ,ad.sx);}
      ad.mode='strike';
    }
    const vMove=vdir;   // 移動方向(走路列用)
    if(armed)vdir=ad.dir;
    else if(winding){
      // 蓄力:進入時算一次;蓄力中目標走開就跟著換象限(10° 遲滯,不會在邊界上抖)。出手(armed)之後就不再改。
      if(ad.mode!=='windup'){ad.mode='windup';ad.dir=moveDir(target.x-h.x,target.z-h.z,ad.dir);}
      else ad.dir=moveDirStable(target.x-h.x,target.z-h.z,ad.dir);
      ad.sx=sideOf(h,target.x,target.z,ad.sx);
      vdir=ad.dir;
    }else ad.mode='';   // 攻擊結束後「方向不動」:維持出手/走路時鎖定的方向,下一個動作(出手或起步)才重算
    atkDirs.set(h.id,ad);
    const walking=(moving||nowT<walkUntil)&&h.hp>0;   // 有動就播走路(含戰鬥中被推開);停下來 0.18 s 內還算走,免得每幀互換
    {const tg=h.targetId,prev=heroMemo.get(h.id);if(prev&&prev.tg&&prev.tg!==tg&&!(state.enemies||[]).some(e=>e.id===prev.tg&&e.hp>0)&&(state.time||0)-(h.atkAt??-99)<.8)heroMemo.set(h.id,{...prev,tg,cheer:(state.time||0)+.9});else heroMemo.set(h.id,{...prev,tg,cheer:prev?.cheer??-1});}
    const cheering=(state.time||0)<(heroMemo.get(h.id)?.cheer??-1)&&!walking;
    // 出手方向只給攻擊列:armed(0.46 s)比攻擊列長,攻擊列播完就走路的那幾幀要用移動方向(不然會朝攻擊方向「橫著走」)。
    let sp0=sheetPose(h,pose,walking,cheering,vdir);
    if(vdir!==vMove&&/^walk/.test(sp0.act)){vdir=vMove;sp0=sheetPose(h,pose,walking,cheering,vdir);}
    const sp=noSkip(h,sp0);
    if(/^attack/.test(sp.act))vdir=ad.dir;   // 攻擊列(含 noSkip 把攻擊列播完的那幾格):方向一律是出手/蓄力時鎖的
    // 受擊/技能也是 4 象限:受擊朝打來的人、技能朝施放目標;每次事件(hitAt / skillAt)開始時鎖一次,整段不變。
    // (sheetPose 的受擊/技能列不看 vdir;紙娃娃 dollDirName 看,所以這裡改 vdir 就是改畫出來的方向。)之後的待機沿用這個方向。
    if(sp.act==='hurt'&&h.hitFromX!=null){const hs=h.hitAt+'|'+h.hitFromX+'|'+h.hitFromZ;   // 同一刻被兩隻打到:跟最後打到的那隻
      if(ad.hurtStamp!==hs){ad.hurtStamp=hs;ad.hurtDir=moveDir(h.hitFromX-h.x,h.hitFromZ-h.z,vdir);ad.hurtSx=sideOf(h,h.hitFromX,h.hitFromZ,0);}vdir=ad.hurtDir;}
    else if(sp.act==='skill'&&h.atkX!=null){if(ad.skillStamp!==h.skillAt){ad.skillStamp=h.skillAt;ad.skillDir=moveDir(h.atkX-h.x,h.atkZ-h.z,vdir);}vdir=ad.skillDir;}
    // 朝向:畫的是戰鬥格(普攻/受擊/技能)才用戰鬥朝向(面向目標/打來的一側);走路/待機一律照移動方向 —— 出手後 0.3–0.36 秒換追下一個目標時,不會倒退走
    if(sp.act.startsWith('attack')||['hurt','skill','death'].includes(sp.act)){if(pose.face)facing=pose.face>0?1:-1;
      {const t=state.time||0,sk=t-(h.skillAt??-99);if(sp.act==='skill'&&sk>=0&&h.atkX!=null){const d=screenDir(h.x,h.z,h.atkX,h.atkZ).x;if(Math.abs(d)>.1)facing=d>0?1:-1;}}
      // 上/下象限的出手/受擊:左右 = 鎖方向那一刻目標(受擊 = 打來的人)在畫面哪一側。只有側面美術的 HeroLoom 用這個 facing 鏡像畫上/下(sideHint),
      // 以前沿用 pose.face / 上一個動作的 facing,目標在左上卻畫成朝右(check_facing heroCombat)。DV2 的上/下列不看它,只影響前衝的左右。
      if(vdir==='up'||vdir==='down'){const sx=sp.act==='hurt'?ad.hurtSx:/^attack/.test(sp.act)?ad.sx:0;if(sx)facing=sx;}}
    // 側面方向時左右鏡像 = 動畫方向(走路、出手、受擊、技能、待機都一樣),不會出現「方向是右、圖朝左」
    if(sp.act!=='death')facing=mirrorOf(vdir,facing);
    previousPositions.set(h.id,{x:h.x,z:h.z,facing,vdir,walkUntil,fightUntil});{const row=actOf(heroSheets[h.classId].meta,sp.act)||{frames:1};sp.i=Math.max(0,Math.min(row.frames-1,sp.i));}  // 時間超過最後一格就停在最後一格
    drawnFacing.set(h.id,{f:facing,pose:sp.pose,act:sp.act,i:sp.i,x:h.x,z:h.z,t:state.time,vdir,atkT});
    let rect=null;
    if(dollHero.on){rect=drawDollHero(h,p,facing,sp,h.hp>0?1:.85,pose,target,vdir);
      if(!rect){const st=dollHero.status();if(!st.ready&&!st.failed)return;   // 紙娃娃資料還在載:這一幀先不畫(不閃一下 sheet)
        if(st.all||st.classes?.includes(h.classId))dollFallbackWarn(h.classId,sp.act,st.failed);}}   // ?doll=hero:x 沒選到的職業本來就畫 sheet,不警告
    if(!rect){   // 騎乘(§20)在 sheet 路徑(?doll=off):sheet 英雄沒有騎乘姿勢,照原本的姿勢站在鞍點上(刻意簡化,見 PAPERDOLL.md §20)
      const mp=h.hp>0&&h.mount&&MON_SHEET(h.mount)?mountPlan(h,dollDirIndex(dollDirName(vdir,facing)),null,0,walking,p):null;
      if(mp&&mp.depth>0)mp.draw();const cw=casting;if(mp)casting=false;
      try{rect=drawSheetHero(h,mp?{x:p.x+mp.ox,y:p.y+mp.oy}:p,facing,sp,h.hp>0?1:.85,pose);}finally{casting=cw;}
      if(mp&&mp.depth<=0)mp.draw();}
    if(rect)hits.push({id:`hunter:${h.id}`,...padHit(rect,16,22)});
    // 法師集氣(2026-11):蓄力段在手上跑 pixelfx 的 spell-charge(loop 表),取代原本的程式光點。
    // 位置對到精靈自己的手心:身體中心往面向 2.2 單位、腳底往上 12.8 單位(量自 sorcerer@2x 攻擊列的球心);
    // 表裡的球在 pivot 右上 (15,-22),所以 pivot 要往回補;表是 1.6 秒 loop,rate 2.4 再乘 VFX_SPEED(0.6)= 實際 1.44 倍,
    // 0.6 秒的蓄力只播到 0.864 秒(約 54% 的 loop),蓄力結束時球還沒長到滿 —— 這是 T65 放慢後的預期樣子。
    // T67:改由 chargeGlow 統一畫(普攻/自動狩獵都畫),仍延後到最上層才不會被魔物蓋住。
    {const tf=g.getTransform();deferTopVfx(()=>{g.save();g.setTransform(tf);chargeGlow(h,p,pose,facing);g.restore();});}
    if(h.hp<=0){textLabel('✦',p.x,p.y-(top*.4)*scale,{color:'#e7d8ef',back:false});return;}
    const full=(h.hp??1)/(h.maxHp||1);if(full<.99||isSelected||h.status==='戰鬥中')bar(p.x-7*scale,p.y-(top+3)*scale,14*scale,full,full<.35?'#df795c':'#84bf6a');
    if(isSelected)textLabel(`${h.name||'獵人'} Lv.${h.level||1}`,p.x,p.y-(top+11)*scale,{color:RARITIES.find(r=>r.id===h.rarity)?.color||'#ffe19a'});}
  // ── 魔物動作節奏:全部讀 sheet meta(跟英雄同一套),不再寫死 4/5/.075 ──────────
  // 攻擊列:方向用 dirSuffix 挑(4 方向:attack / attackDown / attackUp / attackLeft;魔物 sheet 烘的斜向列不再用;treant 只有側面 attack,dirSuffix 會自己退回側面),
  // 節奏用該列的 release / impact / frameTime:出手格 = release,命中格 = impact。
  // 舊版寫死「4 + floor(出手後秒數/.075)」;meta 缺欄位時這裡也退回同一組數字(表現跟舊版一樣)。
  const MON_ATK_FALLBACK={rel:4,imp:5,ft:.075};
  // 受擊剪影的「種類色」:白 → 這一色 2 幀(只給重擊用,普通命中維持純白剪影)。
  const MON_TINT={birchling:'#cfe8a0',boar:'#d8a878',boulder:'#cfc6ad',cactus:'#a8d878',floraspirit:'#f0b6d2',goat:'#efe2c4',
    icebeetle:'#bfe8ff',kobold:'#e0b46a',mole:'#c9a27a',moss:'#9cc47a',mummy:'#f0e4c0',ram:'#e6dcc2',scorpion:'#e0a060',
    shroom:'#f0a0a0',snowhare:'#f2fbff',snowman:'#d8f0ff',sprout:'#bfe89a',stag:'#e0b890',treant:'#b8c98a',vine:'#9cd88a',
    wolfman:'#e8b08a',yeti:'#dff2ff',boss:'#c8d88a'};
  function monsterAttack(type,vdir){
    const meta=MON_SHEET(type)?.meta;if(!meta?.actions)return null;
    const act='attack'+dirSuffix(meta.actions,'attack',vdir||'side'),row=meta.actions[act]||meta.actions.attack;
    if(!row)return null;
    const ft=row.frameTime||MON_ATK_FALLBACK.ft,rel=Number.isFinite(row.release)?row.release:MON_ATK_FALLBACK.rel,
      imp=Number.isFinite(row.impact)?row.impact:rel+1;
    return{act:meta.actions[act]?act:'attack',row,rel,imp,ft,contactAt:Math.max(1,imp-rel)*ft};
  }
  // 命中停格長度:普通魔物 HIT_STOP(.07 ≈ 2 幀),重擊怪/首領更長(定格看得出「這一下很重」)。
  const monsterHold=type=>HEAVY_SLAM.has(type)?HIT_STOP*1.7:HIT_STOP;
  // 重擊判定(只給畫面):這一刻有帶 crit/skill/heavy 的命中特效打在牠身上 = 重擊 → 3 幀抖動 + 白→種類色 2 幀閃光。
  // 讀 state.effects(獵人近戰/技能的命中特效帶 targetId;age > .5 s 的是上一下,不算)。
  function monHeavyHit(e){const fx=state.effects;if(!fx||!fx.length)return false;
    for(let i=fx.length-1;i>=0;i--){const f=fx[i],age=f.age||0;if(age>.5)break;if(f.targetId===e.id&&(f.crit||f.skill||f.heavy))return true;}
    return false;}
  // 魔物 sheet 的執行期位移/剪切(sheet 路徑以前只吃 flash,位移全被吃掉 → 受擊/蓄力看不出來):
  // 蓄力 = 往攻擊方向前傾 1px + 影子收緊(在 drawEnemy 的 contact);出手 = 朝目標微衝;受擊 = 2–3px 後退 + 發抖;
  // 重擊怪蓄力再多一個很慢的 5% squash(壓扁,不是整隻放大)。
  function monsterVis(e,pose){
    const out={x:0,y:0,sx:1,sy:1,lean:0},heavy=HEAVY_SLAM.has(e.type);
    if(pose.pose==='windup'){
      const k=pose.k??0,tx=e.facingX??e.atkX,tz=e.facingZ??e.atkZ,
        d=tx!=null&&tz!=null?screenDir(e.x,e.z,tx,tz):{x:0,y:0};
      out.x=d.x*1*k;out.y=d.y*.6*k;out.lean=d.x*.1*k;
      if(heavy){const sq=.05*k;out.sy=1-sq;out.sx=1+sq*.5;}   // 重擊怪:慢 5% squash-stretch
    } else if(pose.pose==='strike'){
      const k=pose.k??0,d=screenDir(e.x,e.z,e.atkX??e.x,e.atkZ??e.z);
      out.x=d.x*1.5*k;out.y=d.y*1.2*k;
    }
    if(pose.hit>=0&&pose.hit<.32&&e.hitFromX!=null){
      const d=screenDir(e.hitFromX,e.hitFromZ,e.x,e.z),h=pose.hit,k=h<.05?h/.05:Math.max(0,1-(h-.05)/.27),
        heavyHit=heavy||monHeavyHit(e),jitter=Math.sin(h*95)*(heavyHit?1.6:.9)*k;   // 95 rad/s ≈ 15 Hz → 3 幀抖動
      out.x+=d.x*2.5*k+jitter;out.y+=d.y*1.4*k;out.lean+=d.x*.08*k;
    }
    return out;
  }
  // 魔物 sheet 繪製:回傳畫面框(點擊/血條用)
  function drawMonsterSheet(type,p,flip,act,i,alpha=1,pose=null,vis=null){let baked=false;{const ms0=MON_SHEET(type);if(ms0){const [a2,fl]=leftRow(ms0.meta,act,flip?-1:1);baked=a2!==act;act=a2;flip=fl;}}const ms=MON_SHEET(type),a=ms?.meta.actions[act];if(!a)return null;const f=Math.max(0,Math.min(a.frames-1,i)),c=a.cell,k=21/72*scale,foot=c-ms.meta.footFromBottom;
    const mo=motionOf(act,f,a.frames),fwd=baked?-1:1;
    // ?mdoll=1(§21):這一格改從單層怪物紙娃娃包組出來(同尺寸格子圖,座標 0,0);沒開/沒載好 → 原本的 sheet 格
    const mdc=monDoll.on?monDollCell(type==='boss'?'treant':type,act,f,c,ms.meta.footFromBottom):null,IMG=mdc||ms.img,SX=mdc?0:f*c,SY=mdc?0:a.y;
    const q=pose?{x:p.x+Math.round((pose.flash?Math.sin((state.time||0)*95)*.8:0)*scale),y:p.y}:p,dw=Math.round(c*k),
      vx=vis?Math.round(vis.x*scale):0,vy=vis?Math.round(vis.y*scale):0,
      dx=R(q.x-c/2*k)+vx+(mo?R(mo.fx*dw/100)*(baked?-1:flip?-1:1):0),dy=R(q.y-foot*k)+vy;
    cast(IMG,SX,SY,c,c,dx,dy,dw,dw,flip,true,'char');g.save();g.globalAlpha=alpha;
    // 執行期位移/剪切以腳底為軸(跟英雄 posed() 同一套算法);影子(cast)只跟著位移、不跟著壓扁。
    if(vis&&(vis.sx!==1||vis.sy!==1||vis.lean)){const cx=dx+dw/2,cy=dy+dw;g.translate(cx,cy);g.transform(vis.sx,0,-vis.lean,vis.sy,0,0);g.translate(-cx,-cy);}
    const put=img=>{if(mo){const s0=img===IMG;drawBodySliced(img,s0?SX:0,s0?SY:0,c,dx,dy,dw,flip,mo,foot*.55,fwd);return;}if(flip){g.save();g.translate(dx+dw,dy);g.scale(-1,1);g.drawImage(img,img===IMG?SX:0,img===IMG?SY:0,c,c,0,0,dw,dw);g.restore();}else g.drawImage(img,img===IMG?SX:0,img===IMG?SY:0,c,c,dx,dy,dw,dw);};
    put(IMG);if(pose?.flash>0){const tf=g.getTransform(),fa=alpha*pose.flash*.8,tc=tinted(IMG,SX,SY,c,c,pose.flashColor);
      deferTopVfx(()=>{g.save();g.setTransform(tf);g.globalAlpha=fa;put(tc);g.restore();});}g.restore();
    const hh=ms.meta.artSize*k;return{x:q.x+vx-hh/2,y:q.y+vy-hh,w:hh,h:hh};}
  // 魔物 sheet 動作時間軸(對照 sprites/SPRITE_VISUAL_BIBLE.md §9.2;跟英雄 sheetPose 同一套規則):
  // 蓄力 = 同一條攻擊列的 release 之前幾格;出手 = release 開始,命中 = impact 那一格停 monsterHold 秒;
  // avdir = 這場攻擊打哪個方位(由 drawEnemy 鎖住),挑 <attack><方位> 列;沒有那一列 dirSuffix 自己退回。
  function monsterSheetPose(e,pose,walking,vdir='side',avdir=null){const m=MON_SHEET(e.type).meta.actions,D=DIR_ACT[vdir]||'';
    if(pose.pose==='strike'||pose.pose==='windup'){
      const R=monsterAttack(e.type,avdir||'side');
      if(!R)return['attack',0];
      if(pose.pose==='strike'){let at=Math.max(0,pose.atk);const stop=monsterHold(e.type);
        if(at>=R.contactAt+stop)at-=stop;else if(at>=R.contactAt)at=R.contactAt;   // 命中格定格(stop 秒),之後照原本節奏播完收招
        return[R.act,Math.min(R.row.frames-1,R.rel+Math.floor(at/R.ft))];}
      const k=Math.max(0,Math.min(1,pose.k??0));
      return[R.act,Math.max(0,Math.min(Math.max(0,R.rel-1),Math.floor(k*R.rel)))];}
    if(pose.pose==='hurt')return['hurt',Math.floor(Math.max(0,pose.hit)/m.hurt.frameTime)];
    if(walking){const w=m['walk'+D]?'walk'+D:'walk';return[w,gaitFrame('e'+e.id,e.x,e.z,m[w],(hash(e.id)%97)/97)];}
    const id=m['idle'+D]&&!e.engaged?'idle'+D:'idle';return[id,Math.floor(elapsed/m[id].frameTime+hash(e.id))%m[id].frames];}
  function drawEnemy(e){
    if(!Number.isFinite(e.x)||!Number.isFinite(e.z)||e.hp<=0)return;
    // 2026-10-27:先看畫面外就return —— pendingMon 會觸發 MON_SHEET(開始下載),
    // 以前每隻魔物都先過 pendingMon,所以 21 種 sheet 全部在開場被抓下來(5.6 MB)。
    const p0=screenPoint(e.x,e.z);
    if(p0.x<-360*DPRK||p0.x>width+360*DPRK||p0.y<-420*DPRK||p0.y>height+420*DPRK)return;
    if(pendingMon(e.type))return;const p=p0,boss=e.type==='boss',sz=ENEMY_SIZE(e.type),seed=hash(e.id)%97;
    const old=previousPositions.get('enemy:'+e.id),step=old?Math.hypot(e.x-old.x,e.z-old.z):0,moving=!!old&&step>.003,pose=combatPose(e,true,null);
    const nowT=state.time||0,walkUntil=step>.0006?nowT+.2:(old?.walkUntil||0);
    // 2026-10-31 修正「魔物突然左右抖動」:以前每幀看單幀位移的 (dx-dz) 正負決定鏡像,
    // 魔物朝正上/正下(等角畫面上幾乎沒有左右分量)走、或站在獵人正上下方時,正負會在 0 附近跳 → 每幀閃面。
    // 現在用 4 象限 + 遲滯(moveDirStable):側面列的鏡像跟方向走,朝上下時維持原本面向;外觀性的鏡像(上/下列、受擊)至少鎖 0.12 秒。
    // (2026-11-15 起方向樣本改成時間窗口,取代以前「累積 0.12 格」的錨點,見下。)
    let vdir=old?.vdir||'side';
    // 方向樣本 = 最近 ENEMY_DIR_WIN 秒(遊戲時間)的位移(盒狀窗口)。魔物 AI 在追擊/閒晃/交戰的邊界上會一個 tick 換一次目的地
    // (畫面上是鋸齒路徑,約 1.4% 的 tick 方向差 > 40°),拿單幀位移決定方向會一幀一換;窗口位移是眼睛看到的平均走向,
    // 轉彎最多落後 ENEMY_DIR_WIN 秒(窗口滿了就完全是新方向,不會像指數平滑那樣一直差一點)。check_facing 用同一個窗口量。
    // 再套象限 + 10° 遲滯(moveDirStable):幾乎正斜走時不會在兩個方向之間跳。
    let trail=old?.trail||[];
    if(old&&step>=3)trail=[];   // 瞬移(重生、換區):重新開始
    if(!trail.length||trail[trail.length-1].t<nowT){trail.push({t:nowT,x:e.x,z:e.z});while(trail.length>2&&trail[1].t<=nowT-ENEMY_DIR_WIN)trail.shift();}
    // 急轉(約 > 120°)時窗口位移是兩段的平均,可能落在第三個象限(右→左中間閃一格「上」):窗口方向如果跟這一幀、上一幀的位移
    // 都對不上(差超過 45°+遲滯),就改用這一幀的位移。鋸齒路徑(這幀/上幀各偏一邊)窗口方向至少對得上其中一幀,照用窗口。
    const mfx=old?e.x-old.x:0,mfz=old?e.z-old.z:0;let lpx=old?.lpx??null,lpz=old?.lpz??null;
    {const o0=trail[0],wx=e.x-o0.x,wz=e.z-o0.z;if(o0.t<nowT&&Math.hypot(wx,wz)>.02&&(moving||nowT<walkUntil)){
      let cand=moveDirStable(wx,wz,vdir);const fits=(dx,dz)=>dx!=null&&Math.hypot(dx,dz)>1e-4&&facingOk(dx,dz,VDIR_TO_DIR4[cand]);
      if(step>1e-4&&step<3&&!fits(mfx,mfz)&&!fits(lpx,lpz))cand=moveDirStable(mfx,mfz,vdir);
      vdir=cand;}}
    if(step>1e-4&&step<3){lpx=mfx;lpz=mfz;}
    // 停著(不在走路)等空位的魔物(sim 剛更新 facingAt)面向牠盯著的獵人(4 象限,含上/下),不會背對戰鬥站著。
    if(!moving&&nowT>=walkUntil&&!pose.face&&e.facingX!=null&&(state.time||0)-(e.facingAt??-9)<.5)vdir=moveDirStable(e.facingX-e.x,e.facingZ-e.z,vdir);
    // 攻擊列的方向(avdir):蓄力一出現就鎖住、整段攻擊(蓄力→出手→收招)都用同一條方向列 ——
    // 方向每幀重算的話,列會在兩格之間跳,看起來像抽動。取「目標在哪邊」:蓄力看 facingX/Z(模擬每幀更新),出手看 atkX/Z。
    let avdir=old?.avdir||null;
    if(pose.pose==='windup'||pose.pose==='strike'){
      if(!avdir){const tx=pose.pose==='strike'?(e.atkX??e.facingX):(e.facingX??e.atkX),tz=pose.pose==='strike'?(e.atkZ??e.facingZ):(e.facingZ??e.atkZ);
        // 攻擊方位用 moveDir(不做遲滯):出手只有一次,取當下方位最準(4 象限)。
        avdir=(tx!=null&&tz!=null)?moveDir(tx-e.x,tz-e.z,'side'):'side';}
      // 蓄力中目標走開(遠程魔物蓄力長、獵人在走):跟著目標換象限,但有 10° 遲滯(不會在邊界上抖);出手後就不再改。
      else if(pose.pose==='windup'&&e.facingX!=null)avdir=moveDirStable(e.facingX-e.x,e.facingZ-e.z,avdir);
    } else avdir=null;
    // 走路列也上鎖:同一個方向列至少撐 0.25 秒(方向在兩軸之間來回時精靈圖才不會閃)。在算鏡像之前套,鏡像才跟畫出來的列一致。
    const vdirRaw=vdir;
    if(MON_SHEET(e.type)&&old&&pose.pose==='idle'&&vdir!==(old.rowVdir??'side')&&nowT-(old.rowAt??-9)<0.25)vdir=old.rowVdir??'side';
    // 鏡像:側面列時鏡像就是方向(走路看 vdir、出手看 avdir),上/下列維持原本的鏡像;受擊(只有側面列)朝打來的一側。
    let flip=old?.flip??false;
    // 交戰中在走(追擊、被推開)= 走路列跟移動方向;交戰中站著 = 側面待機列朝目標那一側(pose.face)。
    const rowDir=(pose.pose==='windup'||pose.pose==='strike')?avdir:pose.pose==='hurt'?null:(moving||nowT<walkUntil||!pose.face)?vdir:null,hardSide=rowDir==='side'||rowDir==='sideLeft';
    if(pose.face&&!hardSide)flip=pose.face<0;
    else flip=mirrorOf(rowDir,flip?-1:1)<0;
    // 2026-11-16:HeroLoom 魔物(heroloom-monsters3,PixelLab 重畫)只有側面列,上/下畫的是側面圖:鏡像朝螢幕左右的移動或出手目標
    // (同 HeroLoom 英雄的 sideHint),不沿用舊鏡像。這時鏡像就是方向,不做防抖。
    let sideOnlyFlip=false;
    if((rowDir==='up'||rowDir==='down')&&monSideOnly(e.type)){
      const tx=pose.pose==='strike'?e.atkX:pose.pose==='windup'?e.facingX:null,tz=pose.pose==='strike'?e.atkZ:pose.pose==='windup'?e.facingZ:null;
      const ds=tx!=null&&tz!=null?(tx-e.x)-(tz-e.z):old?(e.x-old.x)-(e.z-old.z):0;
      if(Math.abs(ds)>1e-4){flip=ds<0;sideOnlyFlip=true;}
    }
    // 只有「鏡像是外觀」(上/下列、受擊)時才做 0.12 秒防抖;側面列的鏡像就是方向,由象限遲滯管,不能落後。
    let flipAt=old?.flipAt??-9;
    if(old&&flip!==old.flip){if(!hardSide&&!sideOnlyFlip&&nowT-flipAt<0.12)flip=old.flip;else flipAt=nowT;}
    previousPositions.set('enemy:'+e.id,{x:e.x,z:e.z,flip,vdir:vdirRaw,walkUntil,flipAt,trail,lpx,lpz,avdir,rowVdir:vdirRaw,rowAt:vdirRaw!==(old?.rowVdir??'side')?nowT:(old?.rowAt??-9)});
    // 待機呼吸(史萊姆 Q 彈)、移動時跳步;攻擊/受擊的位移疊在上面。
    const breathe=Math.sin(elapsed*(e.type==='slime'?5:3)+seed),amp=e.type==='slime'?.07:.025;pose.sy*=1+amp*breathe;pose.sx*=1-amp*.6*breathe;
    // 走路:狼/魔像/領主一直用側面走路圖(3),配步伐上下起伏;史萊姆是跳躍——著地時用壓扁圖(3),騰空時用圓圖(0)。
    const stride=Math.sin(elapsed*(e.type==='wolf'?11:e.type==='slime'?6:7)+seed);
    const walking=(moving||nowT<walkUntil);   // 停一格不算停(見 walkUntil);有動就播走路
    if(walking&&pose.pose==='idle'){pose.oy-=Math.abs(stride)*(e.type==='slime'?4:e.type==='wolf'?1.8:1);if(e.type!=='slime'){pose.sy*=1-.03*Math.abs(stride);pose.lean+=(flip?-1:1)*.04;}}
    // 0 待機、1 蓄力、2 出手、3 走路、4 受擊(l0veyou monsteratk 圖集)
    // 0 待機/5 呼吸、1 蓄力、2 出手/7 收招、3·6 走路兩格(史萊姆:騰空 0、著地 3、壓扁 6)、4/8 受擊兩格(第四批 monsters 圖集 5–9)
    const has=i=>!!detailFrameFor(e.type+i);
    const frame=pose.pose==='strike'?(pose.atk>.2&&has(7)?7:2):pose.pose==='windup'?1:pose.pose==='hurt'?(pose.hit>.16&&has(8)?8:4)
      // 走路:四格循環 3 → 6 → 10 → 11(接地/經過/另一腳接地/經過;史萊姆是壓扁/伸長/騰空/落地),每種魔物自己的步頻
      :walking?(has(11)?[3,6,10,11][Math.floor(elapsed*({wolf:10,slime:6,golem:6,boss:5}[e.type]||7)+seed)%4]:e.type==='slime'?(Math.abs(stride)<.25?(has(6)?6:3):Math.abs(stride)<.5?3:0):(stride>0||!has(6)?3:6))
      :(Math.floor(elapsed*1.4+seed*.13)%2&&has(5)?5:0);
    // 被獵人鎖定:腳下紅色目標圈(誰在打誰一眼看得出來)。
    const targeted=(state.hunters||[]).some(h=>h.targetId===e.id&&h.status==='戰鬥中');
    if(targeted){const r=(boss?15:9)*scale,pulse=1+.06*Math.sin(elapsed*6);g.save();g.strokeStyle='#2a0d0a99';g.lineWidth=Math.max(2,scale*1.4);g.beginPath();g.ellipse(p.x,p.y+scale,r*pulse,r*.42*pulse,0,0,Math.PI*2);g.stroke();
      g.strokeStyle='#ff7a55d0';g.lineWidth=Math.max(1,scale*.7);g.setLineDash([3*scale,2*scale]);g.lineDashOffset=-elapsed*8*scale;g.stroke();g.setLineDash([]);g.restore();}
    // 蓄力時影子收緊 1–2px(重擊怪最明顯):腳下接觸感變實 = 「要用力了」的預告;不是整隻放大縮小。
    const tighten=pose.pose==='windup'?Math.min(2,(HEAVY_SLAM.has(e.type)?2:1.2)*(pose.k??0)):0;
    contact(p,(boss?12:7)-tighten);
    // 遠程魔物:射前集氣 —— 蓄力期間腳下亮起小魔法陣(沿用已匯出的 magic-circle-cast-iso,0.45 英雄尺度;沒有新美術)。
    if(pose.pose==='windup'&&MONSTER_RANGED[e.type]){
      const prog=Math.max(0,Math.min(1,pose.k??0));
      drawIso('magic-circle-cast-iso',.05+prog*.55,p.x,p.y,{tune:.45,alpha:.8+.2*prog});
    }
    drawnFacing.set('enemy:'+e.id,{f:flip?-1:1,frame,x:e.x,z:e.z,t:state.time});
    let rect;
    if(MON_SHEET(e.type)){   // 出手用「打的方位」那條攻擊列(4 方向);待機/走路照原本的方位列(0.25 秒列鎖已在上面套過)
      const [act,i]=monsterSheetPose(e,pose,walking,vdir,avdir);
      // 受擊閃光:普通命中維持純白剪影(原本的樣子);重擊第 2 幀起換成該種魔物的顏色(白 → 種類色 2 幀)。
      let sheetPose=pose;
      if(pose.flash>0){const heavy=monHeavyHit(e),tint=MON_TINT[e.type==='boss'?'treant':e.type]||'#ffffff';
        sheetPose={...pose,flashColor:(heavy&&pose.hit>=.067)?tint:'#ffffff'};}
      const vis=monsterVis(e,pose);
      drawnFacing.set('enemy:'+e.id,{f:flip?-1:1,frame,act,i,dir:avdir,vd:vdir,x:e.x,z:e.z,t:state.time});   // vd = 想要的走路/待機列方向(check_facing 用來分辨「素材沒有這個方向的列」)
      rect=drawMonsterSheet(e.type,p,flip,act,i,1,sheetPose,vis);}   // sheet:位移/壓扁/後退由 vis 套(以前 sheet 只吃 flash)
    else rect=posed(p,pose,q=>drawAtlasMonster(e.type,frame,q,sz,flip));
    if(rect)hits.push({id:'foe:'+e.id,...padHit(rect,14,18)});  // T110:魔物也可以點開資訊卡
    if(!rect)procUse['enemy-missing:'+e.type]=(procUse['enemy-missing:'+e.type]||0)+1;  // 沒有程序繪製 fallback:sheet 缺了就只記數、不畫
    if(e.hp<e.maxHp||boss||targeted){bar(p.x-(boss?17:10)*scale,p.y-(sz+3)*scale,(boss?34:20)*scale,e.hp/(e.maxHp||1),boss?'#d27967':'#c68764');}}

  // ── 戰鬥特效 ──────────────────────────────────────────────────────────
  // 時間軸:effect 生出來就是「出手」;e.delay 秒後才「命中」(箭/法球飛行中),命中後才有斬痕、火花、數字。
  // 圖集特效:l0veyou vfx(斬擊、法球、治療、星、命中、閃光)與 icons 的箭;粒子是程序像素(不算退回)。
  const FX_SPRITE={slash:'fxSlash',heal:'fxHeal',level:'fxStar',victory:'fxStar',harvest:'fxStar',rally:'fxStar',recruit:'fxStar',purchase:'fxStar',upgrade:'fxSparkle',hit:'fxHit'};
  function fxSprite(id,x,y,size,{rot=0,flip=false,alpha=1,sy=1}={}){const lod=detailFrameFor(id,size*scale>=40);if(!lod)return false;const c=lod.frames[id],k=size*scale/Math.max(c.w,c.h);
    g.save();g.globalAlpha=alpha;g.translate(R(x),R(y));if(rot)g.rotate(rot);g.scale(flip?-1:1,sy);g.drawImage(lod.img,c.x,c.y,c.w,c.h,-c.w*k/2,-c.h*k/2,c.w*k,c.h*k);g.restore();
    if(lod.scale===2)detailUse.draw2x++;else detailUse.draw1x++;return true;}
  // 命中火花:幾顆像素往外噴、受重力落下。
  // dir: 指定噴射方向(弧度,螢幕座標);不給就四面八方。spread: 扇形張角。
  function sparks(x,y,age,seed,n,cols,speed=26,dir=null,spread=1.2){if(age>.45)return;const s=scale,r=rnd(seed);for(let i=0;i<n;i++){const an=dir==null?r()*Math.PI*2:dir+(r()-.5)*spread,v=(.5+r())*speed,px=x+Math.cos(an)*v*age*s,py=y+(Math.sin(an)*v*.6*age+60*age*age)*s,sz=Math.max(1,Math.round((r()<.3?2:1)*s));
    g.globalAlpha=Math.max(0,1-age/.45);pixel(g,px,py,sz,sz,cols[i%cols.length]);}g.globalAlpha=1;}
  // 投射物大小＝攻擊動畫裡的大小(2026-10-25 使用者:「取消改用原本的素材,縮小到跟攻擊動畫內的大小一樣」):
  // 法師手上的魔法球直徑約 26 px(@2x 表,身高 132 px)＝4.1 單位 → fxOrb(球本體約佔圖寬 80–90%)畫 5(原本 11);
  // 弓手拉滿弓的箭(箭尖到拉弦手)約 80 px(@2x 表,身高 134 px)＝12.5 單位 → arrowFx(箭沿圖的對角線,長＝邊長×1.29)畫 9.7(原本 13)。
  // 球的程序光圈與拖尾跟著同比例縮。
  const ORB_SIZE=5,ORB_K=ORB_SIZE/11,ARROW_SIZE=9.7,ARROW_K=ARROW_SIZE/13;
  const ARROW_VFX_K=0.19;   // pixelfx arrow 表:普攻的箭也放大(原本 0.12)
  function drawProjectile(e,u,p){const s=scale,a0=screenPoint(e.sourceX??e.x,e.sourceZ??e.z),gale=e.fx==='gale',lob=e.type==='arrow'?Math.sin(u*Math.PI)*5:Math.sin(u*Math.PI)*2;
    // 疾風箭雨:起點抬高、偏左,三支箭從斜上方落下(普攻維持平飛)
    const a=gale?{x:a0.x-26*s,y:a0.y-70*s}:a0;
    const at=v=>({x:a.x+(p.x-a.x)*v,y:a.y+(p.y-a.y)*v-(12+(e.type==='arrow'?lob:lob))*s});const q=at(u);
    if(e.type==='arrow'){const prev=at(Math.max(0,u-.18)),ang=Math.atan2(q.y-prev.y,q.x-prev.x);
      // 殘影:沿飛行曲線取兩個早先的位置(越遠越淡),先畫再畫箭
      for(const [du,alpha] of [[-.16,.15],[-.08,.3]]){const gu=u+du;if(gu<0)continue;const gp=at(gu);
        drawVfxSheet('arrow',(e.age||0),gp.x,gp.y,ARROW_VFX_K*2.7*s,{rot:ang,alpha});}
      // 箭體飛行動畫全部用 pixelfx 的 arrow 表(含它自己的風切線),不再另外畫白色流線;大小固定 2.7×
      if(drawVfxSheet('arrow',(e.age||0),q.x,q.y,ARROW_VFX_K*2.7*s,{rot:ang})){arrowLast={u:+u.toFixed(2),x:Math.round(q.x),y:Math.round(q.y)};return;}
      if(!fxSprite('arrowFx',q.x,q.y,ARROW_SIZE*2.7,{rot:ang+Math.PI/4})){line(g,q.x-Math.cos(ang)*6*ARROW_K*s,q.y-Math.sin(ang)*6*ARROW_K*s,q.x,q.y,'#513e2e',Math.max(1,2*ARROW_K*s));}return;}
    if(e.type==='spell'){const prev=at(Math.max(0,u-.12)),ang=Math.atan2(q.y-prev.y,q.x-prev.x);
      if(drawVfxSheet('fireball',(e.age||0)+.22/VFX_SPEED,q.x,q.y,FIRE_K*s,{rot:ang})){fireballDrawn++;fireballLast={u:+u.toFixed(2),x:Math.round(q.x),y:Math.round(q.y)};return;}   // 法師普攻:整張火球表沿飛行方向轉
      for(let i=4;i>=1;i--){const t=at(Math.max(0,u-i*.06));g.globalAlpha=.12*(5-i);g.fillStyle='#c79cff';g.beginPath();g.arc(t.x,t.y,(2+(4-i)*.6)*ORB_K*s,0,Math.PI*2);g.fill();}g.globalAlpha=1;
      g.save();g.globalAlpha=.35;g.fillStyle='#e7cfff';g.beginPath();g.arc(q.x,q.y,7*ORB_K*s,0,Math.PI*2);g.fill();g.restore();
      if(!fxSprite('fxOrb',q.x,q.y,ORB_SIZE,{rot:elapsed*6})){const r=3*ORB_K*s;pixel(g,q.x-r,q.y-r,2*r,2*r,'#8a68b9');}return;}
    if(e.type==='holy'){g.save();g.globalAlpha=.25+.5*u;g.fillStyle='#fff3c0';g.beginPath();g.ellipse(p.x,p.y,10*s*u,4*s*u,0,0,Math.PI*2);g.fill();g.restore();}
  }
  function drawSlash(e,age,p){const s=scale,src=screenPoint(e.sourceX??e.x,e.sourceZ??e.z),fromRight=src.x>p.x,r=rnd(hash(e.id)),tilt=(r()-.5)*.8;
    const cx=p.x+(fromRight?3:-3)*s,cy=p.y-11*s,k=Math.min(1,age/.12),alpha=age<.12?1:Math.max(0,1-(age-.12)/.3);
    // 斬痕:新月從攻擊方掃過目標(放大+淡出),中心白色閃光。
    // fxSlash 圖(Xilurus)＝白色刀弧在左、橙色拖尾在右 → 原圖是「由右往左揮」;攻擊者在左邊(往右揮)才翻面。
    // 特效尺寸跟角色同級(英雄 21 單位):原本斬痕 30 單位、命中白閃 20 單位會把攻擊者整隻蓋住,
    // 縮到 20/11 單位、白閃快一點淡出,人才看得見自己在打什麼。
    // 打擊方向:dir=+1 表示刀往右揮(攻擊者在左邊)。表往 +x 畫,刀往左時整張水平翻面。
    if(drawMeleeSheet(e,age,p))return;   // 黑騎士/聖騎士:整張 pixelfx 表(MELEE_FX),表不在才走下面的舊特效
    const berserk=e.cls==='berserker',dir=fromRight?-1:1,bk=.28*s;
    if(berserk){const st=age*VFX_SPEED,fade=Math.max(0,Math.min(1,(1.05-st)/.25));
      // 命中特效是 pixelfx 用 chain 串好的一張表(impacts/berserk-hit):
      // 切痕噴濺(t 0)→ 星爆(t 0.16)→ 腳下塵環(t 0.16,+52 美術 px)。同一張表自己管時序和地板,
      // 遊戲這邊只給打擊點(p.x, 胸口下方)和尺度,比之前兩張表各自對位乾淨。
      // 表不存在時退回程式火花,方向也順著刀。
      if(!drawVfxSheet('berserk-hit',age,p.x,cy-12*bk,bk,{alpha:fade,flip:dir<0}))sparks(p.x,cy,age,hash(e.id),22,['#fff7d0','#ffd56a','#ff9c4a','#ffefb0'],38,Math.atan2(p.y-src.y,p.x-src.x),1.5);}
    else{
      if(alpha>0)fxSprite('fxSlash',cx,cy,13+7*k,{rot:tilt+(fromRight?.3:-.3),flip:!fromRight,alpha:alpha*.92,sy:.85});
      if(age<.12)fxSprite('fxHit',p.x,cy,7+age*34,{alpha:.85*(1-age/.12)});
    }
    // 其他職業維持原本四面八方的小火花;狂戰士的噴濺在上一段由 crit-spray 表負責(方向順著刀)。
    if(!berserk)sparks(p.x,cy,age,hash(e.id),9,['#fff7d0','#ffd56a','#ff9c4a']);
    if(e.cls==='paladin'&&age<.3){g.save();g.globalAlpha=.6*(1-age/.3);g.strokeStyle='#fff2b0';g.lineWidth=Math.max(1,s);g.beginPath();g.ellipse(p.x,p.y,(6+age*40)*s,(2.5+age*16)*s,0,0,Math.PI*2);g.stroke();g.restore();}}
  // 遠程魔物的飛行物:離手(release)前不畫;飛行中沿直線或拋物線(lob)前進,圓的東西會轉、細長的順著方向;打到後放塵爆。
  function mshotFrame(i,x,y,size,rot=0,alpha=1,flipY=false){const im=mshotSheet();if(!im)return false;const k=size*scale/32;
    g.save();g.globalAlpha=alpha;g.translate(R(x),R(y));if(rot)g.rotate(rot);if(flipY)g.scale(1,-1);g.drawImage(im,i*32,0,32,32,-16*k,-16*k,32*k,32*k);g.restore();return true;}
  let lastShot=null;globalThis.__mistvaleLastShot=()=>lastShot;
  function drawMonsterShot(e,age0,delay,p){const cfg=MONSTER_RANGED[e.by]||{},rel=e.release||0,s=scale,size=cfg.size||10;if(age0<rel)return;
    const a=screenPoint(e.sourceX??e.x,e.sourceZ??e.z),y0=a.y-9*s,y1=p.y-11*s,at=v=>({x:a.x+(p.x-a.x)*v,y:y0+(y1-y0)*v-Math.sin(v*Math.PI)*(cfg.lob||0)*s});
    if(age0<delay){const u=Math.min(1,(age0-rel)/Math.max(.01,delay-rel)),q=at(u),q0=at(Math.max(0,u-.04)),ang=Math.atan2(q.y-q0.y,q.x-q0.x);
      g.save();g.globalAlpha=.28;g.fillStyle='#000';g.beginPath();g.ellipse(a.x+(p.x-a.x)*u,a.y+(p.y-a.y)*u,size*.32*s,size*.12*s,0,0,Math.PI*2);g.fill();g.restore();   // 地上的影子:看得出拋物線
      lastShot={x:q.x,y:q.y,ax:a.x,ay:a.y,bx:p.x,by:p.y,type:e.by,id:e.id};   // 驗收用(__mistvaleLastShot):最後一次畫飛行物的螢幕位置
      if(!mshotFrame(e.shot??0,q.x,q.y,size,cfg.spin?age0*9:ang,1,!cfg.spin&&Math.cos(ang)<0)){g.fillStyle='#e9e0c8';g.fillRect(q.x-2*s,q.y-2*s,4*s,4*s);}return;}
    const t=age0-delay;
    // 命中:改用 iso 版火花(hit-spark-iso,紅),和近戰/箭矢命中同一個視覺語言;沒有 iso 表才退回側視 MSHOT_IMPACT。
    if(vfxSheet('hit-spark-iso')){if(t<=ISO_FX['hit-spark-iso'].to)drawIso('hit-spark-iso',t,p.x,p.y,{tune:.85});return;}
    if(t<.32)mshotFrame(MSHOT_IMPACT,p.x,y1,size*(1.1+t*3),0,1-t/.32);}
  // ── 地下城橫條戰鬥畫面(2026-10-30 使用者:「地下城要做出來橫條戰鬥畫面,近戰前排遠程後排」) ──
  // 彈窗裡的 canvas:左邊英雄(近戰前排、遠程後排)面向右,右邊魔物(近戰在前、遠程在後)面向左;用遊戲本身的英雄/魔物 sheet。
  // 背景 = l0veyou(GPT Image 2)生的地下城走廊側面圖(assets/ui/dg-strip-bg),左右鏡像接成無縫,「前進中」時往左捲。
  // 動作全由 state.dungeon.events 推出來:hit/skill(英雄出手 → 魔物)、hurt(魔物出手 → 英雄)、heal(祭司補血)、clear(過層)。
  // 畫的時候把 g / scale 暫時換成這張 canvas(繪圖函式都畫在 g 上),畫完換回來;影子(cast)關掉。
  let dgBgImg=null,dgScroll=0,dgLastNow=0;
  function dgBackground(){if(!dgBgImg){const src=globalThis.PIXEL_ASSETS?.ui?.['dg-strip-bg'];if(!src)return null;dgBgImg=new Image();dgBgImg.src=src;}return dgBgImg.complete&&dgBgImg.naturalWidth?dgBgImg:null;}
  const DG_RANGED=new Set(['archer','sorcerer','priest']);
  const DG_HERO_SLOTS={front:[[.41,.76],[.33,.82],[.36,.69]],back:[[.21,.73],[.13,.80],[.16,.67]]};
  const DG_FOE_SLOTS={front:[[.63,.76],[.71,.82],[.68,.69]],back:[[.84,.73],[.91,.80],[.88,.67]]};
  const DG_SHOT={archer:'#fff3c9',sorcerer:'#c79cff',priest:'#ffe58a'};
  function drawDungeonStrip(cv,st){
    const d=st?.dungeon;if(!cv||!d)return;
    const dpr=Math.min(2,globalThis.devicePixelRatio||1),cw=Math.round(cv.clientWidth*dpr),ch=Math.round(cv.clientHeight*dpr);if(!cw||!ch)return;
    if(cv.width!==cw||cv.height!==ch){cv.width=cw;cv.height=ch;}
    const ctx=cv.getContext('2d'),W=cw,H=ch,t=st.time||0,ev=d.events||[];ctx.imageSmoothingEnabled=false;
    const now=performance.now(),dtR=dgLastNow?Math.min(.1,(now-dgLastNow)/1000):0;dgLastNow=now;
    const marching=d.phase==='前進中'||d.phase==='集結中';if(marching&&!st.paused)dgScroll+=dtR*W*.16;
    const bgi=dgBackground();
    if(bgi){const bw=bgi.naturalWidth*H/bgi.naturalHeight,off=((dgScroll%(bw*2))+bw*2)%(bw*2);
      for(let k=0,x=-off;x<W;k++,x+=bw){if(k%2){ctx.save();ctx.translate(Math.round(x+bw),0);ctx.scale(-1,1);ctx.drawImage(bgi,0,0,Math.ceil(bw)+1,H);ctx.restore();}else ctx.drawImage(bgi,Math.round(x),0,Math.ceil(bw)+1,H);}}
    else{ctx.fillStyle='#24180f';ctx.fillRect(0,0,W,H);}
    const party=(st.hunters||[]).filter(h=>d.hunterIds?.includes(h.id)),foes=(d.foes||[]);
    const pos=new Map(),place=(list,slots,isFoe)=>{let f=0,b=0;for(const u of list){const back=isFoe?u.ranged:DG_RANGED.has(u.classId),sl=back?slots.back[b++%3]:slots.front[f++%3];pos.set(u.id,{x:sl[0]*W,y:sl[1]*H});}};
    place(party,DG_HERO_SLOTS,false);place(foes,DG_FOE_SLOTS,true);
    const lastEv=(pred)=>{for(let i=ev.length-1;i>=0;i--)if(pred(ev[i]))return ev[i];return null;};
    const land=e=>e.t+(e.shot?.3:.12);   // 出手 → 打到(遠程要飛 0.3 秒)
    const saveG=g,saveScale=scale,saveCast=casting,saveK=DPRK;
    g=ctx;scale=H/68;casting=false;DPRK=1;
    try{
      const units=[];
      for(const h of party){const p=pos.get(h.id);if(p)units.push({y:p.y,draw:()=>dgHero(h,p)});}
      for(const f of foes){const p=pos.get(f.id);if(p)units.push({y:p.y,draw:()=>dgFoe(f,p)});}
      units.sort((a,b)=>a.y-b.y).forEach(u=>u.draw());
      // 飛行物(英雄的箭/法球/聖光、遠程魔物的飛行物)與數字
      for(const e of ev){const a=pos.get(e.a),b=pos.get(e.b),age=t-e.t;if(age<0||age>1.6)continue;
        if(e.shot&&a&&b&&age<.3){const u=age/.3,ay=a.y-11*scale,by=b.y-11*scale,x=a.x+(b.x-a.x)*u,y=ay+(by-ay)*u-Math.sin(u*Math.PI)*(e.k==='hurt'?(MONSTER_RANGED[e.shot]?.lob||0)*scale*.6:2*scale);
          if(e.k==='hurt'){const c=MONSTER_RANGED[e.shot];if(!c||!mshotFrame(c.shot,x,y,c.size*.9,c.spin?age*9:Math.atan2(by-ay,b.x-a.x),1,!c.spin&&b.x<a.x))ctx.fillRect(x-2,y-2,4,4);}
          else{ctx.save();ctx.fillStyle=DG_SHOT[e.shot]||'#fff';ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=6*dpr;if(e.shot==='archer'){ctx.fillRect(x-7*dpr,y-1*dpr,14*dpr,2*dpr);}else{ctx.beginPath();ctx.arc(x,y,3.5*dpr,0,Math.PI*2);ctx.fill();}ctx.restore();}}
        const la=t-land(e);if(la<0||la>1.1||!b)continue;
        if(e.k==='heal'){ctx.save();ctx.globalAlpha=Math.max(0,1-la/.8);ctx.fillStyle='#b9f5a8';for(let i=0;i<6;i++){const r=(hash(e.t+':'+i)%100)/100,x=b.x+(r-.5)*16*scale,y=b.y-(6+la*30+i*3)*scale;ctx.fillRect(x,y,2*dpr,2*dpr);}ctx.restore();}
        const txt=(e.k==='heal'?'+':'')+e.v,col=e.k==='heal'?'#a6f59a':e.k==='hurt'?'#ff8a6e':e.k==='skill'?'#ffd75e':'#fff3d0',rise=Math.min(1,la/.7)*14*scale,pop=la<.12?1+.6*(1-la/.12):1;
        dgText(txt,b.x+((hash(e.t)%11)-5)*scale,b.y-(27*scale)-rise,{size:Math.round((e.k==='skill'?13:11)*dpr*pop),color:col,alpha:Math.max(0,1-Math.max(0,la-.7)/.4)});}
      // 上方資訊:層數/波數、狀態、自動續戰
      const top=Math.round(15*dpr);
      dgText(`第 ${d.floor} 層 · 第 ${Math.max(1,d.wave||1)}/3 波`,10*dpr,top,{size:Math.round(13*dpr),color:'#f6e3b0',align:'left'});
      dgText(d.phase+(d.auto?' · 自動續戰':''),W-10*dpr,top,{size:Math.round(12*dpr),color:d.auto?'#ffe08a':'#e9d6a8',align:'right'});
      const clr=lastEv(e=>e.k==='clear');
      if(clr&&t-clr.t<2.2){const a=Math.min(1,(2.2-(t-clr.t))/.4);dgText(`第 ${clr.v} 層突破！`,W/2,H*.38,{size:Math.round(22*dpr),color:'#ffe08a',alpha:a});}
      if(d.phase==='集結中')dgText('小隊正前往地下城入口…',W/2,H*.38,{size:Math.round(14*dpr),color:'#f0dfb8'});
    }finally{g=saveG;scale=saveScale;casting=saveCast;DPRK=saveK;}
    function dgText(txt,x,y,{size=12,color='#fff',align='center',alpha=1}={}){ctx.save();ctx.globalAlpha=alpha;ctx.font=textFont(size);ctx.textAlign=align;ctx.textBaseline='middle';
      ctx.lineWidth=Math.max(2,size/4);ctx.strokeStyle='#120a05';ctx.strokeText(txt,x,y);ctx.fillStyle=color;ctx.fillText(txt,x,y);ctx.restore();}
    function hpBar(x,y,w,ratio,color){const h=Math.max(3,Math.round(3*dpr));ctx.fillStyle='#120a05cc';ctx.fillRect(Math.round(x-w/2)-1,Math.round(y)-1,Math.round(w)+2,h+2);ctx.fillStyle='#3a2416';ctx.fillRect(Math.round(x-w/2),Math.round(y),Math.round(w),h);ctx.fillStyle=color;ctx.fillRect(Math.round(x-w/2),Math.round(y),Math.round(w*Math.max(0,Math.min(1,ratio))),h);}
    function dgHero(h,p){const m=heroSheets[h.classId]?.meta?.actions;if(!m)return;
      const A=n=>actOf(heroSheets[h.classId].meta,n)||m.idle,atk=lastEv(e=>e.a===h.id&&(e.k==='hit'||e.k==='skill'||e.k==='heal')),hurt=lastEv(e=>e.b===h.id&&e.k==='hurt');
      let act='idle',i=0;
      if(h.hp<=0){act='death';i=A('death').frames-1;}
      else if(atk&&(atk.k==='skill'||atk.k==='heal')&&t-atk.t<A('skill').frames*A('skill').frameTime){act='skill';i=Math.floor((t-atk.t)/A('skill').frameTime);}
      else if(atk&&atk.k==='hit'&&t-atk.t<A('attack').frames*A('attack').frameTime){act='attack';i=Math.floor((t-atk.t)/A('attack').frameTime);}
      else if(hurt&&t-land(hurt)>=0&&t-land(hurt)<A('hurt').frames*A('hurt').frameTime){act='hurt';i=Math.floor((t-land(hurt))/A('hurt').frameTime);}
      else if(marching){act='walk';i=Math.floor(t/A('walk').frameTime)%A('walk').frames;}
      else{const id=m.idle?'idle':Object.keys(m)[0];act=id;i=Math.floor(t/m[id].frameTime+hash(h.id))%m[id].frames;}
      ctx.save();ctx.globalAlpha=.3;ctx.fillStyle='#000';ctx.beginPath();ctx.ellipse(p.x,p.y,9*scale,2.6*scale,0,0,Math.PI*2);ctx.fill();ctx.restore();
      if(!dgDollHero(h,p,act,i,atk,hurt,h.hp>0?1:.75))drawSheetHero(h,p,1,{act,i},h.hp>0?1:.75);   // 紙娃娃沒涵蓋/還沒載好 → 舊 sheet
      if(h.hp>0)hpBar(p.x,p.y-26*scale,14*scale,h.hp/h.maxHp,h.hp/h.maxHp>.35?'#7ccf6a':'#e0533f');
      dgText(h.name,p.x,p.y+5*scale,{size:Math.round(10*dpr),color:'#f6e3b0'});}
    // 地下城條的紙娃娃(HeroLoom)英雄:跟地圖同一套合成,但動作/tick 只由地下城事件(d.events)推出來 —— 直接呼叫純函式
    // dollActionTick + dollHero.compose,不經 drawDollHero,所以不碰地圖的逐獵人狀態(dollSeq/dollWind/dollHurt/dollAtk/drawnFacing/heroMemo),
    // 獵人回到地圖時動畫不會錯位。事件時間 = 出手(release);近戰命中格對到傷害數字跳出(land),遠程在出手時射出。
    // 一律朝右(小隊在左、魔物在右)。HeroLoom 沒有 death 動作 → dollActionTick 回 lie(hurt 末格以腳底為軸倒下)。
    function dgDollHero(h,p,act,i,atk,hurt,alpha){
      if(!dollHero.covers(h.classId))return false;const data=dollHero.data;if(!data)return false;
      const meta=heroSheets[h.classId].meta,A=n=>actOf(meta,n)||meta.actions.idle;
      const AR=A('attack'),rel=AR.release??1,ft=AR.frameTime,sd=AR.strikeDur,imp=(AR.impact||rel+1)-rel,
        hs=sd?sd.slice(0,imp).reduce((s,v)=>s+v,0):imp*ft,sLen=sd?sd.reduce((s,v)=>s+v,0):(AR.frames-rel)*ft;
      const pose=act==='death'?'dead':act==='skill'?'skill':act==='attack'?'strike':act==='hurt'?'hurt':act==='walk'?'walk':'idle';
      const wn=A('walk').frames||8,wt=dollHero.weaponTypeOf(h),stamp=pose==='strike'?atk.t:null;
      const req=dollActionTick({pose,i,t,atkAt:pose==='strike'?atk.t:-99,skillAt:pose==='skill'?atk.t:-99,hit:pose==='hurt'?Math.max(0,t-land(hurt)):0,
        hitDelay:pose==='strike'&&!atk.shot?Math.max(.001,land(atk)-atk.t):hs,strikeEnd:sLen+HIT_STOP,hitStop:HIT_STOP,
        skillRelease:SKILLS[h.classId]?.release,skillLen:A('skill').frames*A('skill').frameTime,hurtLen:A('hurt').frames*A('hurt').frameTime,
        walkFrames:wn,elapsed:t,seed:(hash(h.id)%97)/97,data,weaponType:wt,attack:dollAttackVariant(data,wt,h.id,pose,{stamp,prev:stamp}),
        deathT:9,deathLen:A('death').frames*A('death').frameTime});
      if(!req)return false;
      const c=dollHero.compose(h,{action:req.action,tick:req.tick,walkPhase:pose==='walk'?((((i%wn)+wn)%wn)+.5)/wn:null,dir:'side',sideHint:1,
        hideWeapon:!partsVisible,globalTick:Math.floor(t*(data.tickRate||20))});
      if(!c)return false;
      const cw2=c.cv.width,ch2=c.cv.height,k=(HERO_H/c.heroHeight)*scale,dw=Math.round(cw2*k),dh=Math.round(ch2*k);
      // 跟 drawDollHero 一樣的整體前衝/受擊後退(sheet MOTION 的 fx),朝右
      const mrow=actOf(meta,act),mo=mrow&&!mrow.bakedMotion?motionOf(actRow(meta.actions,act),i,mrow.frames||8):null,
        lunge=mo?.fx?R(mo.fx*(mrow.cell||meta.cell)*(HERO_H/meta.heroHeight)*scale/100):0;
      ctx.save();
      if(req.lie){ctx.globalAlpha=alpha*(1-.25*req.lie);ctx.translate(R(p.x),R(p.y));ctx.rotate(-req.lie*Math.PI/2);ctx.drawImage(c.cv,0,0,cw2,ch2,-c.footX*k,-c.footY*k,dw,dh);}
      else{ctx.globalAlpha=alpha;ctx.drawImage(c.cv,0,0,cw2,ch2,R(p.x-c.footX*k)+lunge,R(p.y-c.footY*k),dw,dh);}
      ctx.restore();
      return true;}
    function dgFoe(f,p){const ms=MON_SHEET(f.type);if(!ms)return;const m=ms.meta.actions,big=f.big?1.3:1;
      const atk=lastEv(e=>e.a===f.id&&e.k==='hurt'),hit=lastEv(e=>e.b===f.id&&(e.k==='hit'||e.k==='skill'));
      let act='idle',i=0,alpha=1,flash=0;
      if(f.hp<=0){const dt=hit?t-land(hit):9,dd=m.death||m.hurt;if(dt>1.3)return;act=m.death?'death':'hurt';i=Math.min(dd.frames-1,Math.floor(Math.max(0,dt)/dd.frameTime));alpha=dt<.9?1:Math.max(0,1-(dt-.9)/.4);}
      else if(atk&&t-atk.t<m.attack.frames*m.attack.frameTime){act='attack';i=Math.floor((t-atk.t)/m.attack.frameTime);}
      else if(hit&&t-land(hit)>=0&&t-land(hit)<m.hurt.frames*m.hurt.frameTime){act='hurt';i=Math.floor((t-land(hit))/m.hurt.frameTime);}
      else{act='idle';i=Math.floor(t/m.idle.frameTime+hash(f.id))%m.idle.frames;}
      if(hit&&t-land(hit)>=0&&t-land(hit)<.12)flash=1-(t-land(hit))/.12;
      ctx.save();ctx.globalAlpha=.3*alpha;ctx.fillStyle='#000';ctx.beginPath();ctx.ellipse(p.x,p.y,10*scale*big,2.8*scale*big,0,0,Math.PI*2);ctx.fill();ctx.restore();
      const s0=scale;scale*=big;try{drawMonsterSheet(f.type,p,true,act,i,alpha,flash?{flash,flashColor:'#ffffff'}:null);}finally{scale=s0;}
      if(f.hp>0)hpBar(p.x,p.y-(30*big)*scale,16*scale*big,f.hp/f.maxHp,'#e0533f');}
  }
  // 砸地類的重擊魔物(王 + 三隻大型怪):命中時畫 iso 的大地震擊,取代原本的爪痕。
  const HEAVY_SLAM=new Set(['boulder','yeti','moss','boss']);
  function drawImpact(e,age,p){const s=scale,cy=p.y-11*s;
    if(e.type==='arrow'){// 箭矢命中:iso 版 hit-spark(胸口高度,地板火花環貼地)。暴擊同一張表放大 35% + 白光一閃
      if(vfxSheet('hit-spark-iso')){const crit=e.crit&&!e.skill;drawIso('hit-spark-iso',age,p.x,p.y,{tune:crit?1.35:1});
        if(age<.1)pixelFlash(p.x,cy,crit?7:4.5,(1-age/.1)*(crit?1:.7));return;}
      if(e.crit&&drawVfxSheet('crit-hit',age,p.x,cy,CRIT_K*s)){sparks(p.x,cy,age,hash(e.id),10,['#fff4c8','#ffd98a']);return;}   // 暴擊:大金爆
      if(drawVfxSheet('hit-spark',age,p.x,cy,SPARK_K*s*.85)){sparks(p.x,cy,age,hash(e.id),8,['#fff4c8','#ffd98a','#e8d090']);return;}   // 普攻命中:火花
      if(age<.14)fxSprite('fxHit',p.x,cy,8+age*50,{alpha:1-age/.14});sparks(p.x,cy,age,hash(e.id),6,['#fff4c8','#e8d090']);return;}
    if(e.type==='spell'){const st=age*VFX_SPEED,fade=st<.85?1:Math.max(0,1-(st-.85)/.3);
      // 法師普攻命中:直接用法球術自己的爆炸素材(pixelfx fireball-blast＝small-explosion 前 1.2 秒),取代原本的火花表。
      // T69:錨在特效快取的身體中心(見 drawEffect),擊殺後目標已不在 state.enemies 也不會掉回腳下。
      // 尺寸要從「不透明範圍」算:表是 300×240、實際火球只佔約 174 px 寬,拿整個畫格換算會只剩約 0.58 倍。
      // 可見寬度至少 1.2 倍魔物圖寬(ENEMY_SIZE＝sprite 寬),上限 2.2 倍中型怪(26),大 boss 才不會佔滿畫面。
      const a=e.bodyAnchor,bw=(a?a.size:22)*s,bh=bw,tp=a?screenPoint(a.x,a.z):p,
        BLAST_OPAQUE=174/300,want=Math.min(1.2*bw,2.2*26*s),bk=Math.max(.17*s,want/(300*BLAST_OPAQUE));
      // 火球本體留著(球體側視沒問題),命中再加一層 iso 冰爆:0.35 s 起在腳下綻開,補上「紫系法師」的顏色。
      if(vfxSheet('frost-nova-iso')){drawIso('frost-nova-iso',age,p.x,p.y);if(fade>0)drawVfxSheet('fireball-blast',age,tp.x,tp.y-bh/2,bk,{alpha:fade});return;}
      if(fade>0&&drawVfxSheet('fireball-blast',age,tp.x,tp.y-bh/2,bk,{alpha:fade}))return;
      if(drawVfxSheet('hit-spark',age,p.x,cy,SPARK_K*s)){sparks(p.x,cy,age,hash(e.id),8,['#fff3c8','#ffb04a','#e8584a']);return;}   // 表不在時的後備:火花表
      const t=Math.min(1,age/.35);g.save();g.globalAlpha=.7*(1-t);g.strokeStyle='#b98aff';g.lineWidth=Math.max(1,2*s*(1-t));g.beginPath();g.ellipse(p.x,p.y,(4+16*t)*s,(1.8+7*t)*s,0,0,Math.PI*2);g.stroke();g.restore();
      if(age<.3)fxSprite('fxSparkle',p.x,cy,14+age*40,{alpha:1-age/.3,rot:age*3});sparks(p.x,cy,age,hash(e.id),12,['#f1e0ff','#c79cff','#8f6ad8'],32);return;}
    if(e.type==='holy'){// 牧師聖光命中:iso 版 smite-iso(光錘從天上砸下來 + 石屑),表不在才退回 holy-hit
      if(vfxSheet('smite-iso')){drawIso('smite-iso',age,p.x,p.y);return;}
      if(drawHolyHit(age,p))return;const t=Math.min(1,age/.4);g.save();g.globalAlpha=.55*(1-t);g.fillStyle='#fff3c0';g.fillRect(p.x-4*s*(1-t*.5),p.y-60*s,8*s*(1-t*.5),60*s);g.restore();if(age<.3)fxSprite('fxSparkle',p.x,cy,16,{alpha:1-age/.3});return;}
    if(e.type==='hit'&&drawMeleeSheet(e,age,p))return;   // 刺客/聖騎/黑騎/狂戰普攻:pixelfx 表(MELEE_FX),魔物打英雄沒有 cls 不受影響
    if(e.type==='hit'){const boss=e.by==='boss',src=screenPoint(e.sourceX??e.x,e.sourceZ??e.z),dir=src.x>p.x?-1:1;
      // 魔物打英雄:iso 命中特效。大型怪/王 = 大地震擊(砸地、塵環),其餘 = hit-spark-iso(紅系火花)
      if(vfxSheet('hit-spark-iso')){if(HEAVY_SLAM.has(e.by))drawIso('ground-slam-iso',age,p.x,p.y,{tune:boss?1.15:1});else drawIso('hit-spark-iso',age,p.x,p.y);
        if(!HEAVY_SLAM.has(e.by)&&age<.09)pixelFlash(p.x,cy,4,1-age/.09);return;}
      const t=Math.min(1,age/.08),a=age<.08?1:Math.max(0,1-(age-.08)/.3);
      // 爪痕:三道斜線由打來的方向劃過,白芯紅邊
      if(a>0){g.save();g.globalAlpha=a;for(let i=-1;i<=1;i++){const x0=p.x+(i*3-dir*5)*s,y0=cy-(6+i)*s,x1=x0+dir*10*t*s*(boss?1.5:1),y1=y0+9*t*s*(boss?1.5:1);line(g,x0,y0,x1,y1,'#c8322a',Math.max(2,2*s));line(g,x0,y0,x1,y1,'#fff0e0',Math.max(1,s*.8));}g.restore();}
      if(age<.12)fxSprite('fxHit',p.x,cy,(boss?10:7)+age*30,{alpha:.85*(1-age/.12)});sparks(p.x,cy,age,hash(e.id),7,['#ffd0b8','#e8584a']);}
  }
  function drawDeath(e,age,p){if(pendingMon(e.enemyType||'sprout'))return;const type=e.enemyType||'sprout',sz=ENEMY_SIZE(type),s=scale,t=Math.max(0,(age-.1)/.6);
    if(MON_SHEET(type)){const m=MON_SHEET(type).meta.actions.death,i=Math.floor(age/m.frameTime),fade=age<1.1?1:Math.max(0,1-(age-1.1)/.5);if(fade>0)drawMonsterSheet(type,p,!!e.flipHint,'death',i,fade,{flash:age<.1?1:0,flashColor:'#ffffff'});return;}
    // 倒下:先第二受擊格(8)一下,再倒地屍體圖(9)躺著淡出;朝向沿用受擊時(面向打倒牠的獵人)。沒有 8/9 格才退回壓扁受擊圖。
    if(detailFrameFor(type+'9')){const fade=age<1.1?1:Math.max(0,1-(age-1.1)/.5),pose={pose:'hurt',ox:0,oy:0,lean:0,sx:1,sy:1,flash:age<.12?1:0,flashColor:'#ffffff'};
      if(fade>0)posed(p,pose,q=>drawAtlasMonster(type,age<.18?8:9,q,sz,!!e.flipHint,fade));}
    else if(t<1){const pose={pose:'hurt',ox:0,oy:0,lean:0,sx:1+.25*t,sy:Math.max(.08,1-ease(t)*.92),flash:age<.18?1:0,flashColor:'#ffffff'};
      posed(p,pose,q=>drawAtlasMonster(type,4,q,sz,!!e.flipHint,1-t*t));}
    // 煙塵往外擴、魂火往上飄
    const r=rnd(hash(e.id)+7);for(let i=0;i<10;i++){const an=r()*Math.PI*2,d=(6+r()*10)*Math.min(1,age/.5),x=p.x+Math.cos(an)*d*s,y=p.y-2*s+Math.sin(an)*d*.4*s,a=Math.max(0,1-age/1.1);
      g.globalAlpha=a*.7;const sz2=Math.max(2,Math.round((2+r()*2)*s));pixel(g,x-sz2/2,y-sz2/2,sz2,sz2,i%2?'#d8ccb4':'#a89c88');}
    for(let i=0;i<5;i++){const x=p.x+(r()-.5)*12*s,y=p.y-(8+age*30+r()*8)*s,a=Math.max(0,1-age/1.2);g.globalAlpha=a;pixel(g,x,y,Math.max(1,2*s),Math.max(1,2*s),i%2?'#cfe8ff':'#9ad0ff');}
    g.globalAlpha=1;if(age>.1&&age<.4)fxSprite('fxStar',p.x,p.y-sz*.4*s,14+(age-.1)*30,{alpha:1-(age-.1)/.3});}
  function damageText(e,age,p){const txt=e.text||String(e.value),hero=e.type==='hit',crit=e.crit,pop=age<.12?1+.7*(1-age/.12):1,rise=ease(Math.min(1,age/.7))*16;
    const col=e.color||(hero?'#ff8a6e':e.type==='heal'?'#c7ffbd':crit?'#ffe066':'#fff3d0'),size=Math.round((crit?10:hero?8:8.5)*pop);
    const hh=hash(e.id),dx=e.type==='loot'?0:((hh%13)-6)*1.6*scale,dy=e.type==='loot'?0:((hh>>5)%4)*3.5*scale;  // 同一目標連續挨打:數字錯開成一小片,不疊成一團
    textLabel(crit?txt+'!':txt,p.x+dx,p.y-(27+rise)*scale-dy,{color:col,size,back:false});}
  // 弓箭手的箭是 state.shots 裡的實體:畫在它真正的位置,碰到魔物才消失(命中/扣血由 stepShots 判定)
  function drawShotArrows(){const shots=state?.shots;if(!shots?.length)return;const s=scale;
    for(const sh of shots){if(sh.kind!=='arrow'||sh.wait>0)continue;   // 箭雨:還沒到放出格的箭不畫
      // 箭雨的大箭:從高處斜落(高度隨飛行遞減,飛到瞄準點 span 時落到地面高度),箭身角度跟著下墜的斜率
      const seen=drawShotArrows._seen??(drawShotArrows._seen=new WeakMap()), launchLeft=seen.has(sh)?seen.get(sh):(seen.set(sh,sh.left),sh.left);
      const span=sh.span||7, travel=sh.range0?Math.max(0,sh.range0-sh.left):Math.max(0,launchLeft-sh.left), drop=(sh.drop||0)*Math.max(0,1-travel/span), fall=drop>0?(sh.drop||0)*.6/span:0;
      const p=screenPoint(sh.x,sh.z),q=screenPoint(sh.x+sh.dx*.6,sh.z+sh.dz*.6);
      const ang=Math.atan2(q.y-p.y+fall*s,q.x-p.x);
      // 整段飛行只用 pixelfx 的箭表(風切線已畫在素材裡),大小 2.7×;疾風箭雨的箭用綠色 gale-arrow 表
      const sid=sh.fx==='gale'?'gale-arrow':'arrow';
      const dl=Math.hypot(sh.dx,sh.dz)||1,ux=sh.dx/dl,uz=sh.dz/dl;
      const ghosts=sh.fx==='gale'?{n:3,gap:.35,a:[.45,.28,.14]}:{n:2,gap:.3,a:[.3,.15]};
      const hx=p.x, hy=p.y-12*s-drop*s;
      // 殘影:沿飛行方向往後取早先的點(越遠越淡),高度用該點的 travel 算;還沒離弦(<0)的不畫
      for(let i=ghosts.n;i>=1;i--){const back=i*ghosts.gap,earlier=travel-back;if(earlier<0)continue;
        const gp=screenPoint(sh.x-ux*back,sh.z-uz*back),gdrop=(sh.drop||0)*Math.max(0,1-earlier/span),gx=gp.x,gy=gp.y-12*s-gdrop*s;   // gx/gy 是螢幕座標
        const age=state.time+(sh.big?.15:0),k=ARROW_VFX_K*2.7*s,a=ghosts.a[i-1];
        if(!drawVfxSheet(sid,age,gx,gy,k,{rot:ang,alpha:a})&&sid==='gale-arrow')drawVfxSheet('arrow',age,gx,gy,k,{rot:ang,alpha:a});}
      if(!drawVfxSheet(sid,state.time+(sh.big?.15:0),hx,hy,ARROW_VFX_K*2.7*s,{rot:ang})&&sid==='gale-arrow')
        drawVfxSheet('arrow',state.time+(sh.big?.15:0),hx,hy,ARROW_VFX_K*2.7*s,{rot:ang});
    }}
  function drawEffect(e){const age0=e.age||0,delay=e.delay||0,age=age0-delay,p=screenPoint(e.x||0,e.z||0);
    // T69:法師普攻的爆炸把目標身體錨點記在特效上 —— 擊殺那一幀 step() 已經把 hp=0 的魔物移出
    // state.enemies(在同一次 tick、第一次繪製之前),所以不能只靠還活著的目標:建立特效時
    // pixel-game.js 的 effect() 會一起寫入 bodyType,目標不見了就退回它,位置用特效本身的 x/z。
    if(e.type==='spell'){const tgt=(state.enemies||[]).find(o=>o.id===e.targetId),bt=tgt?tgt.type:e.bodyType;
      if(bt)e.bodyAnchor={type:bt,x:tgt?tgt.x:e.x,z:tgt?tgt.z:e.z,size:ENEMY_SIZE(bt)};}
    if(e.type==='skillName'){if(age<1.1){const a=Math.min(1,(1.1-age)*3);g.globalAlpha=a;textLabel(e.text,p.x,p.y-(30+age*10)*scale,{size:11,color:e.color||'#bdf4ff'});g.globalAlpha=1;}return;}
    if(e.type==='skillSelf'){drawSkillSelf(e,age0,p);return;}
    if(e.type==='skillfx'||e.type==='gale'){drawSkillFx(e,age0,delay,p);if(age>=0&&(e.value||e.text))damageText(e,age,p);g.globalAlpha=1;return;}
    if(e.type==='mshot'){drawMonsterShot(e,age0,delay,p);if(age>=0&&e.value)damageText(e,age,p);g.globalAlpha=1;return;}
    if(e.type==='vfxsheet'){const t=(e.age||0)-(e.delay||0);if(t<0)return;
      // iso 表:自己的時間軸(from/to)、1:1 尺度、tune 由呼叫端微調(不傳就用表上的預設)
      if(ISO_FX[e.sheet]){drawIso(e.sheet,t,p.x,p.y,{rot:e.rot||0,alpha:e.alpha??1,flip:!!e.flip,tune:e.tune||1,dy:e.dy||0});return;}
      const speed=vfxSpeed(e.sheet),st=t*speed,dur=e.dur||2;const fade=st>dur-.35?Math.max(0,(dur-st)/.35):1;
      const ok=drawVfxSheet(e.sheet,t,p.x,p.y-(e.dy||0)*scale,(e.k||.1)*scale,{alpha:fade,rot:e.rot||0,flip:!!e.flip});state.lastVfxDraw={sheet:e.sheet,t:+t.toFixed(2),x:Math.round(p.x),y:Math.round(p.y-(e.dy||0)*scale),ok};return;}
    if(age<0){if(e.type==='holy'&&drawHolyHit(age,p))return;if((e.type==='slash'||e.type==='hit')&&drawMeleeSheet(e,age,p))return;if(e.type==='arrow'||e.type==='spell'||e.type==='holy')drawProjectile(e,Math.min(1,age0/Math.max(.01,delay)),p);return;}
    if(e.noImpact)return;   // 只負責飛行畫面(手動操控法師的魔法球飛完射程就消失;命中特效由打到的那一刻另外出)
    // 只有畫 pixelfx 表的命中/法術/箭/近戰特效才跟著放慢收尾;victory/heal/level/upgrade 等 atlas/程序特效
    // 維持原本 1.5 秒淡出(REVIEW T65 high:非表的特效不能被拉長到 2.5 秒)。
    const slowEnd=e.type==='holy'||e.type==='spell'||e.type==='arrow'||e.type==='hit'||e.type==='slash';
    const fade=Math.max(0,1-age*(slowEnd?VFX_SPEED:1)/1.5);if(!fade)return;
    if(e.type==='death'){drawDeath(e,age,p);return;}
    if(e.type==='slash')drawSlash(e,age,p);
    else if(e.type==='arrow'||e.type==='spell'||e.type==='holy'||e.type==='hit')drawImpact(e,age,p);
    else if(!drawAtlasEffect(e,age,p,fade))drawProcEffect(e,age,p,fade);
    if((e.value||e.text)&&age<1.5)damageText(e,age,p);   // 傷害數字維持原本 1.5 秒,不跟著特效放慢拉長(T65 review)
    g.globalAlpha=1;
  }
  // 疾風箭雨:放出格(0.32 秒)前不畫;飛行中用弓箭手特效表第 0–1 格(青色風箭+拖尾),命中後 3–5 格(星爆→衝擊環→散光)。
  function fxFrame(cls,i,x,y,size,{flip=false,rot=0,alpha=1}={}){const hs=heroSheets[cls];if(!hs?.fx||!hs.fxMeta)return false;const c=hs.fxMeta.cell,k=size*scale/c;
    g.save();g.globalAlpha=alpha;g.translate(R(x),R(y));if(rot)g.rotate(rot);if(flip)g.scale(-1,1);g.drawImage(hs.fx,i*c,0,c,c,-c*k/2,-c*k/2,c*k,c*k);g.restore();return true;}
  // 各職業技能特效格(<職業>-fx 表,8 格):fly = 飛行物格、hit = 命中格、self = 英雄身上的格(旋風/聖盾/蓄力)。順序對 make_heroes_v3.py 的 fx_frames。
  // selfY:身上特效的高度(蓄力漩渦在腳邊 2、旋風/聖盾在身體中間 10);selfA:身上特效透明度(聖盾半透明,不蓋掉角色)
  const SKILL_FX={archer:{fly:[0,1],hit:[3,4,5],self:[6,7],size:14,selfY:2,selfA:.9},sorcerer:{fly:[1,2],hit:[3,4,5],self:[6,7],size:18,selfY:2,selfA:.9},
    berserker:{fly:[],hit:[5,6,7],self:[0,1,2,3,4],size:30,selfY:10,selfA:.9},paladin:{fly:[],hit:[6,7],self:[0,1,2,3,4,5],size:28,selfY:10,selfA:.55}};
  function drawSkillSelf(e,age0,p){const cfg=SKILL_FX[e.cls],t=age0-(e.delay||0);
    // 疾風箭雨:弓手身上捲起落葉風場(pixelfx leaf-storm),跟著施法淡出
    if(e.cls==='archer'&&e.fx==='gale'){const st=t*VFX_SPEED;if(st>=0&&st<1.45){const fade=st<1.1?1:Math.max(0,(1.45-st)/.35);drawVfxSheet('leaf-storm',t,p.x,p.y,LEAF_K*scale,{alpha:fade});}return;}
    // 狂戰士旋風斬:iso 版整張 whirlwind-iso 繞著英雄轉(取代側視 self fx 格),以腳下為圓心
    if(e.cls==='berserker'&&e.fx==='slash'){drawIso('whirlwind-iso',Math.max(0,t),p.x,p.y);return;}
    // 聖騎士聖盾祈禱:iso 版 divine-shield-iso 由 pixel-game 另外開 vfxsheet 效果(要跟著被治療的獵人),這裡不再畫 atlas 盾
    if(e.cls==='paladin'&&e.fx==='holy')return;
    if(!cfg||!heroSheets[e.cls]?.fx)return;const len=cfg.self.length*.09;if(t<-.25||t>len)return;
    const i=cfg.self[Math.max(0,Math.min(cfg.self.length-1,Math.floor((t+.25)/(len+.25)*cfg.self.length)))];fxFrame(e.cls,i,p.x,p.y-cfg.selfY*scale,cfg.selfY<5?cfg.size*.9:cfg.size,{alpha:cfg.selfA*(t>len-.1?Math.max(0,(len-t)/.1):1)});}
  // 法師第一招「火龍捲」:pixelfx 匯出的整張技能表(iso 版 240×400、157 幀、30fps),
  // 依 JSON 的 pivot 對齊目標腳下,逐幀 drawImage(每幀都用到,不是抽格)。
  // 所有 pixelfx 技能表(assets/vfx-sheets, build 嵌成 PIXEL_ASSETS.vfxSheets)。
  const vfxSheetCache=new Map();
  function vfxSheet(id){const v=globalThis.PIXEL_ASSETS?.vfxSheets?.[id];if(!v)return null;
    let im=vfxSheetCache.get(id);if(!im){im=trackImage(new Image());im.src=v.img;vfxSheetCache.set(id,im);}
    return im.complete&&im.naturalWidth?{img:im,meta:v.meta}:null;}
  // 驗收用:把指定的表先解碼好(vfxSheet() 在圖片解碼完成前回 null,第一幀會畫不出來)。
  globalThis.__mistvaleVfxWarm=(ids=[])=>Promise.all(ids.map(id=>{const v=globalThis.PIXEL_ASSETS?.vfxSheets?.[id];if(!v)return null;
    let im=vfxSheetCache.get(id);if(!im){im=trackImage(new Image());im.src=v.img;vfxSheetCache.set(id,im);}
    return im.complete&&im.naturalWidth?null:(im.decode?im.decode().catch(()=>{}):Promise.resolve());}));
  // 以美術像素為單位畫一格;k = 螢幕 px / 美術 px。rot 轉向;looping 表依 meta.loop 取餘數。
  const VFX_SPEED=0.6;   // T65:所有 pixelfx 表(含蓄力/箭/火球的循環動畫)統一的播放倍率,調慢才看得清楚;命中格另外除以它對齊。
  // T66:每個表可以有自己的倍率;火龍捲(iso 版)維持原本 1.0 倍速(和 dd3d616 之前一樣),其他表照 VFX_SPEED。
  // iso 改寫的表(*-iso)一律 1.0 倍速:它們是照「1 特效 px = 1 英雄 px」重畫的,0.6 的慢速是給側視舊表看的。
  // 這裡把每一張接上的 iso 表都明列 1.0,不靠 /-iso$/ 的後備規則(驗收時一眼看得出誰是 1.0)。
  const VFX_SPEED_BY_SHEET={'cinder-cyclone-iso':1.0,'hit-spark-iso':1.0,'blade-hit-iso':1.0,'blade-hit-heavy-iso':1.0,
    'whirlwind-iso':1.0,'great-slash-iso':1.0,'dagger-flurry-iso':1.0,'warp-iso':1.0,'divine-shield-iso':1.0,
    'heal-aoe-iso':1.0,'magic-circle-cast-iso':1.0,'soul-rise-iso':1.0,'coin-drop-iso':1.0,'portal-iso':1.0,
    'smite-iso':1.0,'frost-nova-iso':1.0,'ground-slam-iso':1.0};
  const vfxSpeed=id=>VFX_SPEED_BY_SHEET[id]??(/-iso$/.test(id)?1:VFX_SPEED);
  function drawVfxSheet(id,age,x,y,k,{rot=0,alpha=1,rate=1,flip=false}={}){const sh=vfxSheet(id);if(!sh)return false;
    const px=sh.meta.meta.pixelfx,cw=px.frameSize[0],ch=px.frameSize[1],cols=px.columns;
    const tt=age*rate*vfxSpeed(id);
    const t=px.loop?tt%Math.max(.001,px.frames/px.fps):Math.max(0,tt);
    const i=Math.max(0,Math.min(px.frames-1,Math.floor(t*px.fps)));
    g.save();g.globalAlpha=alpha;g.translate(R(x),R(y));if(rot)g.rotate(rot);if(flip)g.scale(-1,1);
    g.drawImage(sh.img,(i%cols)*cw,Math.floor(i/cols)*ch,cw,ch,-px.pivot[0]*k,-px.pivot[1]*k,cw*k,ch*k);
    g.restore();return true;}
  // ── iso 改寫版特效(pixelfx 的 src/fx/**/*-iso)──────────────────────────────
  // 作者文件 docs/AUTHORING.md「The game's camera」:1 特效美術 px = 1 英雄美術 px、地板是 2:1 橢圓、整張圖不縮放。
  // 英雄 1x 表 67 px 高 = 21 世界單位,所以 1 美術 px = 21/67 世界單位;每張表的 tune 是「看得清楚」的讀圖微調
  // (命中/刀光那種一小撮白火花在草地上太細,放大 1.3–1.55 倍才讀得出來;範圍/地面類維持 1.0–1.35)。
  // from/to = 這張表實際要播的時間軸(秒):from 對到「打擊真的落下」那一刻(age 0 = 命中瞬間),to 截掉過長的尾巴。
  // 每張表選 from/to/tune 的理由寫在 output/vfx-iso/README.md 的對照表。
  const ISO_PX=21/67;
  const ISO_FX={
    'hit-spark-iso':{from:0,to:.47,tune:1.6},            // 火花最亮在 f0,所以命中當下就從頭播;1:1 時白芯只有 ~7 px,放大到讀得出「被打到」
    'blade-hit-iso':{from:0,to:.53,tune:1.65},           // 暴擊那一刀:比普攻大一點
    'blade-hit-heavy-iso':{from:0,to:.53,tune:1.55},     // 重砍(狂戰普攻):放大到約英雄身高 2/3 才讀得出重量
    'whirlwind-iso':{from:0,to:.8,tune:1.35},            // 旋風半徑 ~32 世界單位(約 1.5 個英雄高)
    'great-slash-iso':{from:.02,to:.8,tune:1.55},        // 聖騎大斬:弧長要跨過目標身體,1:1 時只有細線
    'dagger-flurry-iso':{from:.25,to:.7,tune:1.55},      // 前 .25 s 只有零星刀光,打擊在中段;連刺要包住目標
    'warp-iso':{from:.3,to:2.6,tune:1.15},
    'divine-shield-iso':{from:.05,to:3.0,tune:1.15},
    'heal-aoe-iso':{from:.55,to:2.3,tune:1.15},          // 綻放在 ~1.03 s,回血數字跳出時剛好開花
    'magic-circle-cast-iso':{from:.9,to:2.0,tune:1.2},   // 法陣 FLASH(1.52)對到火龍捲 release(.55)
    'soul-rise-iso':{from:.1,to:3.4,tune:1.35},          // 靈魂輪廓很細,放大才看得出是「離體的魂」
    'coin-drop-iso':{from:0,to:3.2,tune:1.3},
    'portal-iso':{from:0,to:4.5,tune:1.25},
    'smite-iso':{from:.4,to:1.9,tune:1.45},              // 光錘 0.57 s 落地 → 命中後 .17 s 砸到
    'frost-nova-iso':{from:.35,to:1.6,tune:.75},         // 法師普攻命中的第二層冰爆:小尺寸,不搶火球爆炸的戲
    'ground-slam-iso':{from:.25,to:2.5,tune:1.1},        // 大地震擊 0.6 s 落地 → 命中後 .35 s 砸到
  };
  let isoDrawn=0,isoLast=null,isoSeen=new Set(),isoLasts={};
  globalThis.__mistvaleIso=()=>({drawn:isoDrawn,last:isoLast,seen:[...isoSeen],lasts:isoLasts});   // 驗收用:最後一次畫出的 iso 特效 + 這一輪畫過哪些表
  globalThis.__mistvaleIsoClear=()=>{isoSeen.clear();isoDrawn=0;isoLast=null;isoLasts={};};   // 驗收用:清掉 drawn/seen 再跑一次情境
  globalThis.__mistvaleIsoTable=()=>({px:ISO_PX,sheets:JSON.parse(JSON.stringify(ISO_FX))});   // 驗收用:iso 表的 from/to/tune 與 1:1 尺度
  // 畫一張 iso 表。age = 從「命中/事件那一刻」起算的秒數(和 drawVfxSheet 的 age 同義),
  // pivot 就是地板接觸點,所以直接給目標腳下的螢幕座標;播到 to 就停,不會停在最後一格。
  function drawIso(id,age,x,y,{rot=0,alpha=1,flip=false,tune=1,dy=0}={}){
    const c=ISO_FX[id];if(!c)return false;
    const t=c.from+age;if(t<0||t>c.to)return false;
    const k=ISO_PX*scale*(c.tune||1)*tune,fade=t>c.to-.12?Math.max(0,(c.to-t)/.12):1;
    if(fade<=0)return false;
    const ok=drawVfxSheet(id,t,x,y-dy*scale,k,{alpha:alpha*fade,rot,flip});
    if(ok){isoDrawn++;isoSeen.add(id);isoLast={sheet:id,age:+age.toFixed(2),t:+t.toFixed(2),x:Math.round(x),y:Math.round(y-dy*scale),k:+k.toFixed(3),iso:true,ok};isoLasts[id]=isoLast;state.lastVfxDraw=isoLast;}
    return ok;
  }
  // 暴擊的白光一閃:iso 表沒有側視 crit-hit 的金爆,補一顆很短的白芯(只給畫面,不動傷害)
  function pixelFlash(x,y,r,a){if(a<=0)return;g.save();g.globalAlpha=Math.min(.9,.85*a);g.fillStyle='#fff';g.beginPath();g.arc(R(x),R(y),r*scale,0,Math.PI*2);g.fill();g.restore();}
  const CINDER_TUNE=1.05, FIRE_K=0.19, SPARK_K=0.13, CRIT_K=0.06, LEAF_K=0.3;   // 美術像素 → 世界單位(英雄 66px = 21 單位);火龍捲 iso 表和英雄同為 1:1,只留 ±15% 微調(T94:量到 5.4 個英雄高,乘 1.05 進目標 5.5–6.5)
  // 牧師普攻:pixelfx impacts/holy-hit(= holy/smite 前 1.3 秒)。表在 0.54 秒時光錘落地,所以用 HOLY_LAND+age 對齊:
  // 飛行段(age<0,0.16 秒)就開始畫,看得到目標上的光點和落下的光錘,命中那一刻剛好砸到;腳下原點,最後一段淡出。
  const HOLY_LAND=.54,HOLY_K=.14,HEAL_K=.55,HEAL_LEAD=.17;
  function drawHolyHit(age,p){const t=HOLY_LAND/VFX_SPEED+age;if(t<0)return false;const st=age*VFX_SPEED,fade=st<.5?1:Math.max(0,1-(st-.5)/.26);
    return fade<=0?!!vfxSheet('holy-hit'):drawVfxSheet('holy-hit',t,p.x,p.y,HOLY_K*scale,{alpha:fade});}
  // 近戰職業普攻命中(pixelfx 表,原點都是表裡替身的腳下):t0 = 命中那一刻(age 0)對到表的第幾秒,dx = 表裡打擊點在替身前方幾美術 px。
  // 把表往攻擊方退 dx,打擊點就落在目標身上;表往 +x 揮,攻擊者在右邊(往左打)整張水平翻面。命中前(age<0)也畫,看得到刀落下。
  // 2026-11:這裡全部改吃 iso 改寫版(1 特效 px = 1 英雄 px,尺度由 ISO_FX 管),側視原表只當後備:
  //   黑騎士 heavy-cleave → impacts/blade-hit-iso(heavy):短促的重砍,取代暗紫色盤
  //   狂戰士 berserk-hit → impacts/blade-hit-iso(heavy):同一張重砍,取代側視噴濺
  //   聖騎士 parry → melee/great-slash-iso:完整一道大斬弧(parry 是正上方爆開,iso 版有地平面方向)
  //   刺客 double-slash → melee/dagger-flurry-iso:連刺刀光(表在 pivot 右側 6~41 px,往攻擊方退 12 px 讓刀光包住目標)
  const MELEE_FX={darkknight:{sheet:'blade-hit-heavy-iso',dx:0,iso:true},berserker:{sheet:'blade-hit-heavy-iso',dx:0,iso:true},
    paladin:{sheet:'great-slash-iso',dx:12,iso:true},assassin:{sheet:'dagger-flurry-iso',dx:12,iso:true}};
  function drawMeleeSheet(e,age,p){const c=MELEE_FX[e.cls];if(!c)return false;
    const src=screenPoint(e.sourceX??e.x,e.sourceZ??e.z),dir=src.x>p.x?-1:1;
    // 暴擊/重擊:職業那一刀之外再補一道 impacts/blade-hit-iso 的白色傷口(放大 20%),讀得出「這下特別重」;
    // 側視的 crit-hit 金爆只留給箭矢(iso 版沒有對應的爆閃,箭矢用 hit-spark 放大 + 白光代替)。
    if(c.iso&&e.crit){drawIso('blade-hit-iso',age,p.x-dir*c.dx*ISO_PX*scale,p.y,{flip:dir<0,tune:1.2});
      if(age<.1)pixelFlash(p.x-dir*c.dx*ISO_PX*scale,p.y-11*scale,6,1-age/.1);}
    if(c.iso)return drawIso(c.sheet,age,p.x-dir*c.dx*ISO_PX*scale,p.y,{flip:dir<0});
    const t=c.t0/VFX_SPEED+age;if(t<0)return false;
    const k=c.k*scale,st=age*VFX_SPEED,fade=st<c.fadeAt?1:Math.max(0,1-(st-c.fadeAt)/c.fadeLen);
    return fade<=0?!!vfxSheet(c.sheet):drawVfxSheet(c.sheet,t,p.x-dir*c.dx*k,p.y,k,{alpha:fade,flip:dir<0});}
  // 牧師補血:pixelfx holy/priest-heal(holy/heal 前 1.4 秒、不含替身)。提前 HEAL_LEAD 秒開始,回血數字跳出時花瓣剛好綻開。
  function drawPriestHeal(t0,p){const t=HEAL_LEAD/VFX_SPEED+t0;if(t<0)return false;const st=t*VFX_SPEED,fade=st<1.1?1:Math.max(0,(1.4-st)/.3);
    return fade<=0?!!vfxSheet('priest-heal'):drawVfxSheet('priest-heal',t,p.x,p.y,HEAL_K*scale,{alpha:fade});}
  let cinderDrawn=0,cinderLast=null;
  globalThis.__mistvaleCinder=()=>({drawn:cinderDrawn,last:cinderLast});   // 驗收用:最後一次畫出來的火龍捲(幀/位置)
  let fireballDrawn=0,fireballLast=null;
  globalThis.__mistvaleFireball=()=>({drawn:fireballDrawn,last:fireballLast});   // 驗收用:法師普攻火球(飛行位置)
  let arrowLast=null;
  globalThis.__mistvaleArrow=()=>({last:arrowLast});   // 驗收用:弓箭手箭矢的螢幕位置
  globalThis.__mistvaleShots=()=>(state.shots||[]).map(s=>({x:+s.x.toFixed(2),z:+s.z.toFixed(2),kind:s.kind||'spell',left:+s.left.toFixed(2),dmg:s.dmg,big:!!s.big,wait:+(s.wait||0).toFixed(2),fx:s.fx||null}));   // 驗收用:飛行中的箭/法球
  globalThis.__mistvalePilot=()=>{const p=state.pilot;if(!p)return null;const h=state.hunters.find(q=>q.id===p.id);return h?{id:h.id,cls:h.classId,x:+h.x.toFixed(1),z:+h.z.toFixed(1),t:+state.time.toFixed(2)}:null;};   // 驗收用:目前操控的角色
  globalThis.__mistvaleGale=()=>state.lastGale||null;   // 驗收用:上一次疾風箭雨開了幾支箭
  globalThis.__mistvaleTestFx=()=>state.lastTestFx||null;   // 驗收用:最後一次按的測試特效
  globalThis.__mistvaleVfxDraw=()=>state.lastVfxDraw||null;   // 驗收用:最後一次 vfxsheet 實際繪製
  globalThis.__mistvalePilotSkill=()=>state.lastPilotSkill||null;   // 驗收用:手動放技能時職業/技能
  globalThis.__mistvaleEnemies=()=>(state.enemies||[]).filter(e=>e.hp>0).map(e=>({id:e.id,type:e.type,hp:e.hp,x:+e.x.toFixed(1),z:+e.z.toFixed(1)}));   // 驗收用:場上魔物血量/位置
  function drawCinder(age,p){if(age<0)return true;const sh=vfxSheet('cinder-cyclone-iso');if(!sh)return false;
    const px=sh.meta.meta.pixelfx;cinderDrawn++;cinderLast={age:+age.toFixed(2),i:Math.min(px.frames-1,Math.floor(age*vfxSpeed('cinder-cyclone-iso')*px.fps)),x:Math.round(p.x),y:Math.round(p.y)};
    return drawVfxSheet('cinder-cyclone-iso',age,p.x,p.y,heroArt('sorcerer')*CINDER_TUNE*scale);}
  function drawSkillFx(e,age0,delay,p){const cls=e.cls||'archer',cfg=SKILL_FX[cls];
    if(cls==='priest'&&e.fx==='holy'){// 暗癒禱言(iso 版 heal-aoe-iso:地上光環綻放→隊友腳下纏繞)取代側視 priest-heal;
      if(e.iso==='heal-aoe'&&vfxSheet('heal-aoe-iso')){drawIso('heal-aoe-iso',age0-delay,p.x,p.y);return;}   // 表不在才退回下面那張
      if(drawPriestHeal(age0-delay,p))return;if(age0<delay)return;}   // 牧師普攻補血:隊友腳下 pixelfx 聖光(花瓣→光環上升→小愛心)
    if(e.fx==='cinder'&&!e.self){drawCinder(age0-delay,p);return;}
    if(!cfg||!heroSheets[cls]?.fx){const age=age0-delay,o={...e,type:e.fx==='gale'?'arrow':e.fx};if(age<0){if(o.type!=='slash')drawProjectile(o,Math.min(1,age0/Math.max(.01,delay)),p);return;}if(o.type==='slash')drawSlash(o,age,p);else drawImpact(o,age,p);return;}
    const fly=cfg.fly.length&&!e.self?.18:0,start=delay-fly;if(age0<start)return;const a=screenPoint(e.sourceX??e.x,e.sourceZ??e.z);
    if(age0<delay){const u=(age0-start)/fly,x=a.x+(p.x-a.x)*u,y=a.y-12*scale+(p.y-11*scale-(a.y-12*scale))*u,ang=Math.atan2(p.y-11*scale-(a.y-12*scale),p.x-a.x);
      if(!fxFrame(cls,cfg.fly[Math.min(cfg.fly.length-1,Math.floor(u*cfg.fly.length))],x,y,cfg.size,{rot:ang}))line(g,x-6*scale,y,x,y,'#5fd8ff',2*scale);return;}
    const t=age0-delay,len=cfg.hit.length*.12;if(t>len)return;const fr=cfg.hit[Math.min(cfg.hit.length-1,Math.floor(t/.12))];
    fxFrame(cls,fr,p.x,p.y-11*scale,cfg.size*(e.self?1:.9)+t*20,{alpha:1-t/len*.4});}
  function drawAtlasEffect(e,age,p,fade){
    const id=FX_SPRITE[e.type];if(!id)return !!(e.value||e.text);  // 純數字飄字沒有圖,不算退回
    // 升級/收穫等事件光效:頭頂上方、小、半透明,不蓋住正在打的人。
    const w=(e.type==='victory'?18:11)*(.8+Math.min(1,age*2)*.3);
    return !!drawAtlasDetail(id,{x:p.x,y:p.y-(24+age*12)*scale},w,w,0,fade*.75);
  }
  function drawProcEffect(e,age,p,fade){
    procUse['fx:'+e.type]=(procUse['fx:'+e.type]||0)+1;
    g.globalAlpha=fade;const s=scale;
    if(['heal','level','upgrade','victory','harvest','rally','recruit','purchase'].includes(e.type)){const color=e.type==='heal'?'#b9e5b6':e.type==='upgrade'||e.type==='level'?'#fff0a2':'#d6e9bf';for(let i=0;i<6;i++){const a=i*Math.PI/3+age,x=p.x+Math.cos(a)*(10+age*8)*s,y=p.y-10*s+Math.sin(a)*7*s-age*18*s;pixel(g,x-s,y-3*s,2*s,6*s,color);pixel(g,x-3*s,y-s,6*s,2*s,color);}}
    g.globalAlpha=1;
  }
  // 把錄製時記下的點擊框、標籤、覆蓋層補回這一幀(順序和逐一繪製時相同)
  const pushSide=s=>{for(const x of s.h)hits.push(x);for(const x of s.u)uiLabels.push(x);for(const x of s.t)screenTexts.push(x);for(const x of s.o)overlays.push(x);};
  // 錄製靜態層:只畫不會動的物件到 fsc,同時錄下靜態影子(ssc)與每個裝飾的繪製範圍。
  // 錄製時的副作用(點擊範圍、標籤、覆蓋層)錄完就還原,真正繪製時才算數,避免重複。
  function recordStatic(all,vk){
    const h0=hits.length,u0=uiLabels.length,t0=screenTexts.length,o0=overlays.length;
    for(const c of [fsc,ssc]){c.save();c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,c.canvas.width,c.canvas.height);c.restore();}
    staticBox.clear();staticSide.clear();g=fsc;casting=true;
    try{for(const item of all){
      if(isMoving(item))continue;
      if(item.type==='building'){   // 建築的範圍取它的點擊框(外加留白);點擊框、標籤與覆蓋層一併記下來
        const h0b=hits.length,u0b=uiLabels.length,t0b=screenTexts.length,o0b=overlays.length;
        shadowMode='record';boxSink=null;drawBuilding(item.data);
        const hb=hits.slice(h0b).find(h=>h.id===item.data.id&&h.w!==undefined);
        staticSide.set(item.data,{h:hits.slice(h0b),u:uiLabels.slice(u0b),t:screenTexts.slice(t0b),o:overlays.slice(o0b)});
        if(hb){const m=BUILDING_PAD*scale;staticBox.set(item.data,{x0:hb.x-m,y0:hb.y-m,x1:hb.x+hb.w+m,y1:hb.y+hb.h+m});}else staticBox.set(item.data,'always');
        continue;}
      if(item.type!=='decor')continue;
      const d=item.data,p=screenPoint(d.x,d.z);
      if(p.x<-100||p.x>width+100||p.y<-70||p.y>height+260){staticBox.set(d,'none');continue;}   // 跟 drawDecoration 的剔除條件一致
      shadowMode='record';boxSink=[];drawDecoration(d);const sink=boxSink;boxSink=null;
      if(!sink.length){staticBox.set(d,'always');continue;}   // 沒走圖集(程序繪製等):範圍不明,每幀都畫
      let x0=p.x,y0=p.y,x1=p.x,y1=p.y;for(let i=0;i<sink.length;i+=4){x0=Math.min(x0,sink[i]);y0=Math.min(y0,sink[i+1]);x1=Math.max(x1,sink[i+2]);y1=Math.max(y1,sink[i+3]);}
      const m=DECOR_PAD*scale;staticBox.set(d,{x0:x0-m,y0:y0-m,x1:x1+m,y1:y1+m});
    }}
    finally{g=bg;casting=false;shadowMode='normal';boxSink=null;}
    hits.length=h0;uiLabels.length=u0;screenTexts.length=t0;overlays.length=o0;
    staticKey=vk;staticGen++;
  }
  // 每幀都要重畫的物件:單位、會動的裝飾、(沒有概念圖時)會冒煙的建築
  const isMoving=item=>item.type==='hunter'||item.type==='wanderer'||item.type==='enemy'||(item.type==='decor'&&(!!item.data.walk||item.data.regionSign||ANIMATED_DECOR.has(item.data.type)))||(item.type==='building'&&!atlasCell(item.data.id)&&['forge','enhancement','restaurant','inn','hall'].includes(item.data.id));
  // 把地面、影子、精靈依序合成到 comp(rects=裝置像素範圍,null=整張)。順序和直接畫到螢幕相同。
  function paintComp(rects){
    cmp.save();cmp.setTransform(1,0,0,1,0,0);cmp.globalAlpha=1;
    if(rects&&rects.length){devPath(cmp,rects);cmp.clip();}
    cmp.drawImage(bgCache,0,0);if(shadowsOn){cmp.globalAlpha=SHADOW_ALPHA;cmp.drawImage(shadowLayer,0,0);cmp.globalAlpha=1;}cmp.drawImage(spriteLayer,0,0);
    cmp.restore();
  }
  // 驗收/除錯用:逼下一幀整張重畫(檢查「畫面上有沒有殘影」時拿來對照)
  globalThis.__mistvaleForceFull=()=>{lastViewKey=null;};   // 讓下一幀走「整張重畫所有物件」的路徑(驗收對照用)
  // 除錯/效能觀察用:目前用了哪一種合成模式、畫布解析度、上一幀的合成範圍數量
  const perfStat={mode:'-',modeFrames:{direct:0,region:0,full:0},rects:0};
  // 除錯:GL 繪製器狀態(批次數、實例數、材質數與 MB、不支援的呼叫計數);2D 模式回 {mode:'2d'}
  globalThis.__mistvaleGL=()=>glr?{mode:'gl',...glr.stats()}:{mode:glKeep?'2d (gl lost)':'2d'};
  // 驗收用(gl_compare):固定世界時鐘(花粉、脈動等跟 elapsed 走的動態),兩種繪製器才能比同一幀
  globalThis.__mistvaleClock=v=>{if(Number.isFinite(v))elapsed=v;return elapsed;};
  globalThis.__mistvalePerf=()=>({...perfStat,renderer:glr?'gl':'2d',texts:screenTexts.length+uiLabels.length,canvas:[canvas.width,canvas.height],dpr:renderDprMax,coarse:coarsePointer,scale:+scale.toFixed(2),phase:+phase.toFixed(3),night:+nightLast.toFixed(3)});
  // T95:驗收用 —— 目前的震動位移(螢幕 px)與純量震幅(px)。沒在震就是 0。
  globalThis.__mistvaleShake=()=>({x:+shakeX.toFixed(3),y:+shakeY.toFixed(3),amp:+shakeAmpNow().toFixed(3)});
  // T106:驗收用 —— 停格狀態(次數、被跳過的重畫幀數、還剩幾毫秒)。
  globalThis.__mistvaleHitstop=()=>({seq:hitStopSeq,count:hitStopCount,skipped:hitStopSkipped,frozen:performance.now()<hitStopUntil,left:+Math.max(0,hitStopUntil-performance.now()).toFixed(1)});
  function render(){
    if(glr){glr.begin(canvas.width,canvas.height);if(glGroundSeen!==groundGen){glGroundSeen=groundGen;glr.invalidate(ground);glr.invalidate(villageLayer);}}
    DPRK=canvas.width/width;if(canvas.style.transform)canvas.style.transform='';for(const c of [bg,sg,spg,ssc,bgc,fsc,rdc,cmp]){c.setTransform(DPRK,0,0,DPRK,0,0);c.imageSmoothingEnabled=false;}
    screen.imageSmoothingEnabled=false;g.imageSmoothingEnabled=false;hits.length=0;uiLabels.length=0;screenTexts.length=0;
    const gx=camPxX()+R(-groundOrigin.x*scale),gy=camPxY()+R(-groundOrigin.y*scale);
    // 鏡頭、縮放、畫布大小、地形、村莊都沒變 = 靜止;連續兩幀靜止才錄製,之後每幀直接複製快取
    // 建築的等級與位置也要算進去:地面重算可能要等貼圖載完才會跑,不能只靠 terrainRevision
    const bsig=BUILDINGS.map(b=>{const p=state.layout?.[b.id]||b;return JSON.stringify([getLevel(b.id),state.buildings?.[b.id]??null,p]);}).join('|');
    // 選取的建築(光圈)與畫質設定也會改變靜態層的畫法,所以一起算進去
    const vk=[camPxX(),camPxY(),scale,width,height,canvas.width,terrainRevision,terrainPatternRev,villageReady,detailLod.length,atlasLod.length,sharedAtlas?.size||0,bsig,selected,quality].join('|'),settled=!glr&&vk===lastViewKey;lastViewKey=vk;   // GL 模式不走靜止快取
    // 地面+海洋+村莊(地面縮放是最貴的一次大面積繪製)。走快取的那幀背景只留在快取層,合成時才用到,不先畫到螢幕上
    const replayNow=settled||staticKey===vk;
    if(bgKey===vk){if(!replayNow)copyLayer(g,bgCache);}
    else{const prev=g,rec=replayNow;if(rec)g=bgc;
    try{
    // 地面畫布外也是同一片海:底色+海材質,材質原點對齊地面畫布,拉遠時不會露出一條平塗色帶。
    g.fillStyle=groundBase('ocean')||'#407b86';g.fillRect(0,0,width,height);
    if(groundPatterns.ocean){g.save();g.globalAlpha=TERRAIN_TEX_ALPHA;g.translate(gx,gy);g.scale(scale*TERRAIN_TEX_SCALE,scale*TERRAIN_TEX_SCALE*TERRAIN_TEX_SQUASH);g.fillStyle=groundPatterns.ocean;
      const k=scale*TERRAIN_TEX_SCALE;g.fillRect(-gx/k,-gy/(k*TERRAIN_TEX_SQUASH),width/k,height/(k*TERRAIN_TEX_SQUASH));g.restore();}
    g.drawImage(ground,gx,gy,Math.round(ground.width/GROUND_RES*scale),Math.round(ground.height/GROUND_RES*scale));
    if(villageReady)g.drawImage(villageLayer,camPxX()+R(VBOX.x0*scale),camPxY()+R(VBOX.y0*scale),Math.round(VBOX.w*scale),Math.round(VBOX.h*scale));
    }finally{g=prev;}
    if(rec)bgKey=vk;}
    if(glr&&shadowsOn)glr.composite(SHADOW_ALPHA);   // GL:影子 FBO(物件那一輪才畫進去,present 時先算好)壓在地面上、物件底下
    const all=[];
    // 會動的單位跟建築的前後:單一 x+z 排序鍵對「點 vs 長方形佔地」會錯(站在建築西南側、已經在南牆前面的人被屋子蓋住)。
    // 正確判定:從單位往鏡頭方向(+x,+z 對角)射出,射線穿過佔地 → 在建築後面;否則在前面。只調整畫面上可能重疊的建築。
    const bkeys=BUILDINGS.filter(b=>getLevel(b.id)>0&&b.id!=='dungeon').map(b=>{const p=state.layout?.[b.id]||b;return{x0:p.x-b.w/2,x1:p.x+b.w/2,z0:p.z-b.d/2,z1:p.z+b.d/2,key:p.x+p.z+.2,sx:p.x-p.z,half:(conceptBuildingWidth(b.id)/2+30)/9};});
    globalThis.__mistvaleDecorKey=q=>depth(q.x,q.z,q.x+q.z);
    const depth=(x,z,key)=>{for(const B of bkeys){if(Math.abs((x-z)-B.sx)>B.half)continue;
      // 往鏡頭(+t)穿過佔地 → 在建築後面;往反方向(−t)穿過 → 在建築前面;都沒穿過(在旁邊)→ 不限制。
      const lo=Math.max(B.x0-x,B.z0-z),hi=Math.min(B.x1-x,B.z1-z);if(lo>hi)continue;if(hi>=0&&lo>=0)key=Math.min(key,B.key-.001);else if(lo<=0&&hi<=0)key=Math.max(key,B.key+.001);}return key;};
    // 街上走的村民/獵人:沿自己那條街來回(三角波),面向跟著走的方向。
    for(const d of decorations)if(d.walk){const w=d.walk,t=((elapsed*w.speed+w.t0)/w.len)%2,u=t<1?t:2-t,nx=w.ax+(w.bx-w.ax)*u,nz=w.az+(w.bz-w.az)*u,sd=(nx-d.x)-(nz-d.z),sy=(nx-d.x)+(nz-d.z);if(Math.abs(sd)>1e-5)d.flip=sd<0;d.vdir=moveDir(nx-d.x,nz-d.z,d.vdir);d.x=nx;d.z=nz;}
    for(const d of decorations){const p=screenPoint(d.x,d.z);if(p.x>-100&&p.x<width+100&&p.y>-40&&p.y<height+260)all.push({sort:d.type==='streamBridge'||d.type==='frozenPond'?-1e9:depth(d.x,d.z,d.x+d.z),type:'decor',data:d});}  // 橋面是地面:過橋的人永遠畫在上面
    for(const b of BUILDINGS){const p=state.layout?.[b.id]||b;all.push({sort:p.x+p.z+.2,type:'building',data:b});}
    // 畫面外的單位不畫、也不算進會動的範圍:世界變緊湊後,手機縮小時仍有一半的世界在畫面外,那些單位每幀白白花排序、陰影與重繪。
    // 判斷用單位的框(HERO_BOX/MON_BOX:左右、頭上、腳下的世界單位)放大 1.5 倍,完全在畫面外才略過。
    const seen=(x,z,box)=>{const p=screenPoint(x,z),m=1.5*scale;return p.x>-box[0]*m&&p.x<width+box[0]*m&&p.y>-box[2]*m&&p.y<height+box[1]*m;};
    for(const h of state.hunters||[])if(seen(h.x,h.z,HERO_BOX))all.push({sort:depth(h.x,h.z,h.x+h.z+.32),type:'hunter',data:h});  // 跟魔物同深度時獵人畫在前面
    for(const w of state.wanderers||[])if(seen(w.x,w.z,HERO_BOX))all.push({sort:depth(w.x,w.z,w.x+w.z+.32),type:'wanderer',data:w});  // 流浪英雄:野外自己打怪,不是我方單位
    for(const e of state.enemies||[])if(seen(e.x,e.z,MON_BOX.map(v=>v*ENEMY_SIZE(e.type)/28)))all.push({sort:depth(e.x,e.z,e.x+e.z+.3),type:'enemy',data:e});
    all.sort((a,b)=>a.sort-b.sort);
    drawOrder=all.map(i=>i.type==='building'?i.data.id:i.type==='hunter'?'hunter:'+i.data.id:i.type);
    // 靜止時(鏡頭連續兩幀不動):靜態物件整層用快取,每幀只在會動的物件範圍內重畫;鏡頭還在動就照原本順序整張畫
    if(settled&&staticKey!==vk)recordStatic(all,vk);
    let compMode='direct',compRects=null;   // 合成方式:direct=直接畫到螢幕;region=只重算 compRects 範圍;full=整張重算
    if(staticKey===vk){
      // 只剩「快取層剛重建」才需要整張合成(comp 圖層已移除,compValid 不再有意義)
      const fullRebuild=!compValid||spgGen!==staticGen||sgGen!==staticGen,dirtyPrev=spgPrev.concat(sgPrev);   // 上一幀動過的範圍(下面會還原,先記下)
      const dyn=[];
      for(const item of all)if(isMoving(item)){const q=item.type==='building'?(state.layout?.[item.data.id]||item.data):item.data,p=screenPoint(q.x,q.z);
        const [X,U,D]=item.type==='hunter'||item.type==='wanderer'?HERO_BOX:item.type==='enemy'?MON_BOX.map(v=>v*ENEMY_SIZE(item.data.type)/28):item.type==='building'?DYN_BOX.map(v=>v*3):DYN_BOX;
        dyn.push({x0:p.x-X*scale,x1:p.x+X*scale,y0:p.y-U*scale,y1:p.y+D*scale});}
      const U={x0:1e9,y0:1e9,x1:-1e9,y1:-1e9};for(const b of dyn){U.x0=Math.min(U.x0,b.x0);U.y0=Math.min(U.y0,b.y0);U.x1=Math.max(U.x1,b.x1);U.y1=Math.max(U.y1,b.y1);}
      const hitDyn=b=>{if(b.x1<U.x0||b.x0>U.x1||b.y1<U.y0||b.y0>U.y1)return false;for(const q of dyn)if(q.x0<b.x1&&q.x1>b.x0&&q.y0<b.y1&&q.y1>b.y0)return true;return false;};
      // 精靈層與影子層沿用上一幀:只把上一幀會動的範圍還原成靜態內容(其餘範圍本來就是靜態內容);沒有對應的快取時才整張覆蓋
      const devR=[];for(const b of dyn){const x0=Math.floor(b.x0*DPRK),y0=Math.floor(b.y0*DPRK);devR.push(x0,y0,Math.ceil(b.x1*DPRK)-x0,Math.ceil(b.y1*DPRK)-y0);}
      if(spgGen===staticGen){spg.save();spg.setTransform(1,0,0,1,0,0);spg.globalAlpha=1;devPath(spg,spgPrev);spg.clip();spg.clearRect(0,0,spg.canvas.width,spg.canvas.height);spg.drawImage(fullStatic,0,0);spg.restore();}
      else copyTo(spg,fullStatic);
      if(sgGen===staticGen){sg.save();sg.setTransform(1,0,0,1,0,0);sg.globalAlpha=1;devPath(sg,sgPrev);sg.clip();sg.clearRect(0,0,sg.canvas.width,sg.canvas.height);sg.drawImage(shadowStatic,0,0);sg.restore();}
      else copyTo(sg,shadowStatic);
      spgGen=sgGen=staticGen;
      // 會動的範圍內:在暫存層上清空範圍,依原本順序重畫所有碰到這個範圍的物件(不剪裁,剪裁繪圖會讓邊界像素略有不同),
      // 最後只把範圍內的結果覆蓋回精靈層;範圍外保留快取的內容
      const rectPath=ctx=>{ctx.beginPath();for(const b of dyn){const x0=Math.floor(b.x0*DPRK),y0=Math.floor(b.y0*DPRK);ctx.rect(x0,y0,Math.ceil(b.x1*DPRK)-x0,Math.ceil(b.y1*DPRK)-y0);}};
      rdc.save();rdc.setTransform(1,0,0,1,0,0);rectPath(rdc);rdc.clip();rdc.clearRect(0,0,rdc.canvas.width,rdc.canvas.height);rdc.restore();
      shadowSink=[];g=rdc;casting=true;
      try{for(const item of all){
        const moving=isMoving(item);let draw=true;shadowMode=moving?'normal':'skip';   // 靜態的影子已在快取裡
        if(!moving&&item.type==='decor'){const b=staticBox.get(item.data);if(b==='none')draw=false;else if(b&&b!=='always'&&!hitDyn(b))draw=false;}
        if(!draw)continue;
        if(item.type==='decor')drawDecoration(item.data);
        else if(item.type==='building'){   // 靜態建築:不碰到會動的範圍就完全不用畫,點擊框與標籤直接用錄製時的結果;碰到的才畫
          const b=staticBox.get(item.data),side=staticSide.get(item.data),touch=!b||b==='always'||hitDyn(b);
          if(side&&!touch)pushSide(side);
          else if(side){const h0b=hits.length,u0b=uiLabels.length,t0b=screenTexts.length,o0b=overlays.length;g=rdc;drawBuilding(item.data);hits.length=h0b;uiLabels.length=u0b;screenTexts.length=t0b;overlays.length=o0b;pushSide(side);}
          else{g=rdc;drawBuilding(item.data);}   // 會冒煙的建築(每幀都在變):照常每幀畫
        }
        else if(item.type==='hunter')drawHunter(item.data);else if(item.type==='wanderer')drawHunter(item.data,true);else drawEnemy(item.data);}}
      finally{casting=false;g=bg;shadowMode='normal';}
      spg.save();spg.setTransform(1,0,0,1,0,0);spg.globalAlpha=1;rectPath(spg);spg.clip();spg.clearRect(0,0,spg.canvas.width,spg.canvas.height);spg.drawImage(rdl,0,0);spg.restore();
      // 記下這一幀動過的範圍,下一幀還原用
      spgPrev=devR;const sinkR=shadowSink;shadowSink=null;sgPrev=[];
      for(let i=0;i<sinkR.length;i+=4){const x0=Math.floor(sinkR[i]*DPRK),y0=Math.floor(sinkR[i+1]*DPRK);sgPrev.push(x0,y0,Math.ceil(sinkR[i+2]*DPRK)-x0,Math.ceil(sinkR[i+3]*DPRK)-y0);}
      // 合成範圍 = 上一幀與這一幀動過的精靈與影子範圍。以 16×16 格子估計聯集面積(重疊的範圍只算一次),
      // 超過四成畫面時,直接畫到螢幕反而比較省(裁剪合成在範圍很大時變慢)。
      if(fullRebuild)compMode='full';
      else{compRects=dirtyPrev.concat(devR,sgPrev);
        const TW=Math.ceil(canvas.width/16),TH=Math.ceil(canvas.height/16);if(tileMark.length<TW*TH)tileMark=new Uint8Array(TW*TH);tileMark.fill(0,0,TW*TH);let tiles=0;
        for(let i=0;i<compRects.length;i+=4){const tx0=Math.max(0,compRects[i]>>4),ty0=Math.max(0,compRects[i+1]>>4),tx1=Math.min(TW,(compRects[i]+compRects[i+2]+15)>>4),ty1=Math.min(TH,(compRects[i+1]+compRects[i+3]+15)>>4);
          for(let ty=ty0;ty<ty1;ty++)for(let tx=tx0;tx<tx1;tx++){const k=ty*TW+tx;if(!tileMark[k]){tileMark[k]=1;tiles++;}}}
        compMode=tiles<.4*TW*TH?'region':'direct';}
    }else{
      spgGen=sgGen=-1;   // 整張重畫後,兩層就不再對應任何快取版本
      if(!glr){sg.clearRect(0,0,width,height);spg.clearRect(0,0,width,height);}   // GL 的清單每幀 begin() 就清空(spg 跟地面同一條清單,不能清)
      g=spg;casting=true;
      try{for(const item of all){shadowMode='normal';if(item.type==='decor')drawDecoration(item.data);else if(item.type==='building')drawBuilding(item.data);else if(item.type==='hunter')drawHunter(item.data);else if(item.type==='wanderer')drawHunter(item.data,true);else drawEnemy(item.data);}}
      finally{casting=false;g=bg;shadowMode='normal';}
    }
    // 影子整層一次壓上地面(重疊處不會疊黑),再蓋上所有物件。
    if(glr)compMode='gl';
    perfStat.mode=compMode;perfStat.modeFrames[compMode]=(perfStat.modeFrames[compMode]||0)+1;perfStat.rects=compRects?compRects.length/4:0;
    if(compMode==='gl'){}   // GL:影子與物件已經依序排在主清單裡
    else if(compMode==='direct'){
      if(staticKey===vk)copyLayer(g,bgCache);   // 走快取但範圍太大:背景還沒畫到螢幕上,這裡補上
      g.save();g.setTransform(1,0,0,1,0,0);if(shadowsOn){g.globalAlpha=SHADOW_ALPHA;g.drawImage(shadowLayer,0,0);g.globalAlpha=1;}g.drawImage(spriteLayer,0,0);g.restore();
      compValid=false;   // comp 已經不是這一幀的畫面,下一幀要整張重做
    }else{
      // 原版做法:三層先合成到 comp(只重算動過的範圍),再把 comp 整張貼到螢幕。
      // 整張貼不可省 —— 特效、傷害數字、花粉/雪、殘影、建築名牌只畫在螢幕上,只有整張覆蓋才會被清掉,
      // 一旦改成「只貼動過的範圍」,這些東西就會留在畫面上變成殘影(2026-10-20 踩過)。
      paintComp(compMode==='full'?null:compRects);
      g.save();g.setTransform(1,0,0,1,0,0);g.globalAlpha=1;g.drawImage(comp,0,0);g.restore();
      compValid=true;
    }
    // 戰鬥中的獵人被前面的大魔物/樹擋住時,疊一層半透明的自己(沒被擋的地方疊上去看不出差別)。
    for(const h of state.hunters||[])ghostHunter(h);
    for(const f of overlays.splice(0))f();
    flushTopVfx();
    if(document.body.dataset.artReview==='1')uiLabels.length=0;
    drawShotArrows();
    // T69:死亡特效先畫、其餘特效後畫 —— 同一個 frame 裡爆炸才會蓋在正在倒下的魔物上。
    {const fxList=state.effects||[];for(const e of fxList)if(e.type==='death')drawEffect(e);for(const e of fxList)if(e.type!=='death')drawEffect(e);}
    drawChatter();
    // 動作實驗室預覽:直接把那一格畫在畫面中央(純預覽,不影響模擬)
    if(posePreview){
      const sh=heroSheets[posePreview.classId],m=sh&&sh.meta,a=m&&m.actions[posePreview.act];
      if(a){
        const idx=Math.max(0,Math.min(a.frames-1,posePreview.i|0)),size=Math.round(190*scale*0.62);
        const px=Math.round(width/2-size/2),py=Math.round(Math.min(height*0.62,height-170)-size);
        g.save();g.imageSmoothingEnabled=false;g.globalAlpha=1;
        const ax=a.cell*(a.cols?idx%a.cols:idx),ay=a.y+(a.cols?Math.floor(idx/a.cols):0)*a.cell;
        if(posePreview.facing<0){g.translate(px+size,py);g.scale(-1,1);g.drawImage(sh.img,ax,ay,a.cell,a.cell,0,0,size,size);}
        else g.drawImage(sh.img,ax,ay,a.cell,a.cell,px,py,size,size);
        g.restore();
        // 零件層（劍等）：同一格位、同一個框，跟遊戲裡一樣疊在身體上
        if(partsVisible)for(const part of m.parts||[]){const ps=heroSheets[part.sheet],pa=ps?.meta.actions[posePreview.act];if(!pa)continue;
          const pi=Math.max(0,Math.min(pa.frames-1,idx));g.save();g.imageSmoothingEnabled=false;
          if(posePreview.facing<0){g.translate(px+size,py);g.scale(-1,1);g.drawImage(ps.img,pa.cell*pi,pa.y,pa.cell,pa.cell,0,0,size,size);}
          else g.drawImage(ps.img,pa.cell*pi,pa.y,pa.cell,pa.cell,px,py,size,size);
          g.restore();}
      }
    }
    // T130:鐵匠鋪煙囪煙霧。位置由建築繪製時記下的 rect 換算（圖片右上方那個煙囪口），
    // 不畫進建築層（建築會被凍結成靜態快取，畫進去煙會凍住）；用時間決定位置，不存粒子陣列。
    // 12 顆互相重疊的煙球：越往上越大、越淡、左右擺動越大，疊起來是一縷連續的煙而不是一串點。
    if(quality&&smokeSpot&&(state.buildings?.forge||0)>0&&!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches){
      const lv=state.buildings.forge,cx=smokeSpot.x,cy=smokeSpot.y,k=Math.max(.75,scale);
      const puffs=[];
      for(let i=0;i<12;i++){
        const rate=.075+lv*.014,t=((elapsed*rate+i/12+.03*lv)%1+1)%1;
        const rise=(2+t*42)*k;
        const sway=(Math.sin(t*2.7+i*1.9)*1.2+Math.sin(t*7.3+i*.7)*.6+(t-.5)*5)*k;
        const x=cx+sway,y=cy-rise;
        const w=Math.max(2,Math.round((2.4+t*6.6)*k)),h=Math.max(2,Math.round(w*.88));
        g.globalAlpha=Math.pow(1-t,1.15)*.7;
        const body=t<.22?'#8b8274':'#e4ddc9', face=t<.22?'#a49a89':'#f1ead8';
        pixel(g,x+1,y,w-2,h,body);pixel(g,x,y+1,w,h-2,body);          // 切掉四角,不要看起來像方塊
        pixel(g,x+2,y+1,Math.max(1,w-4),Math.max(1,h-3),face);        // 亮面往左上偏,像被煙囪口的火照亮
        puffs.push({x:Math.round(x),y:Math.round(y),w,h,a:+g.globalAlpha.toFixed(3),t:+t.toFixed(2)});
      }
      g.globalAlpha=1;
      globalThis.__mistvaleSmoke={count:puffs.length,minY:Math.min(...puffs.map(o=>o.y)),spot:smokeSpot,last:puffs};
    }else{
      globalThis.__mistvaleSmoke={count:0,minY:null,spot:smokeSpot,last:[]};
    }

    // T131:夜晚的燈光——每棟有蓋的建築，門口/鋪面上一圈暖光（燈光灑在地上，村莊才像有人住）。
    // 位置每幀由世界座標投影，不吃靜態快取的結果；燈比夜色暗一點，所以先畫光、再讓夜色覆蓋層壓過去。
    if(nightLast>.02){
      const lit=[];
      for(const b of BUILDINGS){
        const lv=getLevel(b.id); if(!lv)continue;
        const lay=state.layout?.[b.id]||b;
        lit.push({id:b.id,lv,x:lay.x,z:lay.z});
      }
      const tn=Math.min(1,nightLast/.85),pts=[],winPts=[];
      const rm=matchMedia('(prefers-reduced-motion: reduce)').matches;
      if(lightsCanvas.width!==width||lightsCanvas.height!==height){lightsCanvas.width=width;lightsCanvas.height=height;lightsW=width;lightsH=height;}
      const lg=lightsG;lg.setTransform(1,0,0,1,0,0);lg.clearRect(0,0,lightsCanvas.width,lightsCanvas.height);lg.globalCompositeOperation='lighter';
      for(let i=0;i<lit.length;i++){
        const sp=lit[i];
        // 位置用建築的互動矩形（= 圖片最下面那一排的門口），燈光才會落在「門前的地上」，
        // 而不是壓在房子正面；沒有矩形時退回世界座標投影。
        const gs=glowSpots.get(sp.id);
        const p2=gs
          ?{x:gs.x+(gs.bb.x0+gs.bb.x1)*.5*gs.w, y:gs.y+gs.bb.y1*gs.h+1*scale}   // 用「不透明範圍」的底緣＝門口前的地面
          :screenPoint(sp.x,sp.z);
        const fl=.84+.16*Math.sin(elapsed*1.6+i*2.1)*Math.sin(elapsed*.7+i);
        const warm=sp.id==='forge'?'#ffb45a':'#ffd08a';
        const rx=Math.max(14,40*scale),ry=Math.max(6,15*scale);
        const cx2=R(p2.x),cy2=R(p2.y+2*scale);
        const grd=lg.createRadialGradient(cx2,cy2,0,cx2,cy2,rx);   // 中心亮、外圈淡的暖光
        grd.addColorStop(0,'rgba(255,238,196,'+(Math.min(1,tn*.85*fl)).toFixed(3)+')');
        grd.addColorStop(.45,'rgba(255,193,94,'+(Math.min(1,tn*.42*fl)).toFixed(3)+')');
        grd.addColorStop(1,'rgba(255,170,60,0)');
        lg.fillStyle=grd;lg.beginPath();lg.ellipse(cx2,cy2,rx,ry,0,0,Math.PI*2);lg.fill();
        pts.push({id:sp.id,x:Math.round(p2.x),y:Math.round(p2.y)});
        // T133:窗光——用同一份不透明範圍定位，窗戶才會落在房子的立面上。
        if(gs){
          const wins=NIGHT_WINDOWS[sp.id]||[[.42,.46]];
          for(let w=0;w<wins.length;w++){
            const wx=R(gs.x+(gs.bb.x0+(gs.bb.x1-gs.bb.x0)*wins[w][0])*gs.w);
            const wy=R(gs.y+(gs.bb.y0+(gs.bb.y1-gs.bb.y0)*wins[w][1])*gs.h);
            const ww=Math.max(3,Math.round(4.6*scale)),wh=Math.max(2,Math.round(3.4*scale));
            const wf=rm?.88:(.72+.28*Math.sin(elapsed*(2.1+w*.7)+i*1.7+w*.9));
            const wa=Math.min(1,tn*.9*wf);
            lg.fillStyle='rgba(255,214,140,'+(wa*.55).toFixed(3)+')';
            lg.fillRect(wx-ww*1.4,wy-wh*1.3,ww*2.8,wh*2.6);   // 窗外的暈
            lg.fillStyle='rgba(255,222,164,'+wa.toFixed(3)+')';
            lg.fillRect(wx,wy,ww,wh);
            winPts.push({id:sp.id,x:Math.round(wx+ww/2),y:Math.round(wy+wh/2)});
          }
        }
      }
      lg.globalCompositeOperation='source-over';
      globalThis.__mistvaleNight={strength:+nightLast.toFixed(3),pools:lit.length,ids:lit.map(o=>o.id),pts,windows:winPts.length,winPts};
    }else{
      if(lightsW){lightsG.setTransform(1,0,0,1,0,0);lightsG.clearRect(0,0,lightsW,lightsH);}
      globalThis.__mistvaleNight={strength:+(nightLast||0).toFixed(3),pools:0,ids:[],pts:[],windows:0,winPts:[]};
    }
    // Small ambient birds and bright drifting pollen keep the village alive.
    if(quality){for(let i=0;i<12;i++){const x=((elapsed*(2+i%3)+i*79)%width),y=(i*47+Math.sin(elapsed*.5+i)*7)%(height);g.globalAlpha=.4;pixel(g,x,y,1,1,'#f2e9be');}g.globalAlpha=1;}
    const cb=biomeAt((cam.x/PX+cam.y/PY)/2,(cam.y/PY-cam.x/PX)/2);if(quality&&cb==='snow'&&!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches){for(let i=0;i<34;i++){const x=(i*59+Math.sin(elapsed*.4+i)*12+width)%width,y=(i*41+elapsed*(6+i%4))%height;pixel(g,x,y,i%4===0?2:1,1,'#eff5e7');}}
    // T135:雨天——溫帶生態圈偶爾下雨（用 state.time 決定，同一個時間一定是同樣天氣）
    {
      const wetBe=['village','meadow','forest','birch','taiga','mountain'].includes(cb);
      const shower=Math.sin((state.time||0)*0.037+1.7)>.55;
      const rmR=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      const rainOn=!!(quality&&wetBe&&shower&&!rmR);
      if(rainOn){
        const n=Math.round(120+60*Math.min(1,Math.max(0,(scale-1)*1.4)));   // 放大時多一點雨絲，手機不減量
        for(let i=0;i<n;i++){
          const sp=430+(i%5)*46;
          const x=((i*67+elapsed*sp*0.22)%(width+24))-12;
          const y=((i*53+elapsed*sp)%(height+16))-8;
          const near=i%9===0;
          const len=(near?22:14)+(i%4===0?4:0);
          g.globalAlpha=near?.46:.30+(i%3)*.08;
          pixel(g,Math.round(x),Math.round(y),near?2:1,len,'#e6f2fa');
          pixel(g,Math.round(x)-1,Math.round(y)+len-4,1,4,'#cfe2ee');
        }
        g.globalAlpha=.40;
        for(let i=0;i<14;i++){
          const x=(i*131+Math.floor(elapsed*2.3+i)*37)%(width-10)+5;
          const y=(i*97+Math.floor(elapsed*2.3+i)*53)%(height-24)+18;
          pixel(g,x,y,3,1,'#dbeaf2');
        }
        g.globalAlpha=1;
      }
      const wantTint=rainOn?1:0;
      if(Math.abs(wantTint-rainTintShown)>.02){rainTintShown=wantTint;rainTint.style.opacity=wantTint?'1':'0';}
    // T137:陣雨時偶爾打雷——用時間函數決定(每 23 秒一格,偶數格同時下雨才打),可重現、可測
    const tNow=state.time||0, per=Math.floor(tNow/23);
    if(per!==lastBoltPer){lastBoltPer=per;if(rainOn&&per%2===0){boltT=1;boltCount++;boltPeak=0;}}
    if(boltT>0){boltT=Math.max(0,boltT-.07);const bo=boltT*boltT*.58;boltPeak=Math.max(boltPeak,bo);boltLayer.style.opacity=bo.toFixed(3);}
    else if(boltShown){boltLayer.style.opacity='0';}
    boltShown=boltT>0?1:0;
    globalThis.__mistvaleStorm={raining:!!rainOn,count:boltCount,flash:boltT>0,opacity:+parseFloat(boltLayer.style.opacity||'0').toFixed(3),peak:+boltPeak.toFixed(3)};
      globalThis.__mistvaleRain={on:rainOn,biome:cb,shower,drops:rainOn?Math.round(120+60*Math.min(1,Math.max(0,(scale-1)*1.4))):0,tint:rainTintShown};
    }
    // 夜晚變暗:用 DOM 覆蓋層的 CSS 透明度(合成器做,幾乎不花 GPU),
    // 以前是每幀對整張畫布 fillRect 一次(手機上等於多一次滿版填色)。
    const night=nightOn&&phase>.5?Math.sin((phase-.5)*Math.PI*2)*.85:0;   // T131:正片疊底層，0.85 ≈ 深夜
    nightLast=night;
    if(Math.abs(night-nightShown)>.008){nightShown=night;nightLayer.style.opacity=night>0?night.toFixed(3):'0';}
    // Placement preview projects to the same coordinate system as simulation.
    if(placing&&hover){const blk=blockAt(hover.x,hover.z),snap=blk&&blk.use!=='plaza'?blk:hover,p=screenPoint(snap.x,snap.z),sp=atlasCell(placing)||buildingSprite(placing),w=conceptBuildingWidth(placing);ring(p,30,'#d8ebac');drawSprite(sp,p,w,w*sp.height/sp.width,9,.55);textLabel(PLACE_HINT_COARSE?'點擊放置 · 點取消鈕結束':'點擊放置 · ESC 取消',p.x,p.y+22,{color:'#e6edbf'});}
    // 地名:拉遠才顯示,畫在戰鬥空地外緣(北邊)而不是空地中央。
    if(scale<1.2){for(const r of REGIONS){const p=screenPoint(r.x,r.z);textLabel(r.name,p.x,p.y-6,{color:'#ffe6a6',size:8,clamp:true});}}
    screen.setTransform(1,0,0,1,0,0);if(glr)screen.clearRect(0,0,canvas.width,canvas.height);const k=canvas.width/width;screen.save();screen.textAlign='center';screen.textBaseline='middle';
    placedLabels=[];for(const t of screenTexts)drawScreenText(t,k);
    drawMapLabels(k);screen.restore();
    if(glr)glr.present();
  }
  let followFn=null,followOpts={};   // 跟隨:回傳 {x,z} 時每幀把鏡頭目標移到那裡(手動操控用)
  // 螢幕方向 → 世界方向(手動操控的搖桿用):iso 是 (x−z)*PX、(x+z)*PY,反解回來就是世界方向。
  // 長度不重要(pilotStep 會自己正規化成單位向量),只有方向要對:手指往右上,角色就往畫面右上走。
  function dirFromScreen(dx,dy){return{x:(dx/PX+dy/PY)/2,z:(dy/PY-dx/PX)/2};}
  // 跟隨的鏡頭目標。預設(centerBody)把「角色本體的中心」釘在畫面正中央,不是腳底:
  // 腳底螢幕 y = height/2 + 50 − cam.y*scale + iso.y*scale,角色身高 = 21 邏輯單位,
  // 所以 cam.y 要多 50/scale、再減掉半個身高,腳底剛好落在中心下方半個身高處。
  function followTarget(fp){
    const p=iso(fp.x,fp.z);
    if(!followOpts.centerBody)return p;
    const half=(Number.isFinite(fp.h)?fp.h:HERO_H)/2;
    return{x:p.x,y:p.y-half+50/scale};
  }
  function update(dt,nextState){
    // T141：放手後的滑行（指數衰減；拖曳或跟隨時立刻停）
    if(inertia&&!followFn){const f=Math.pow(.86,Math.max(1,dt*1000)/16.7);inertia.vx*=f;inertia.vy*=f;if(Math.abs(inertia.vx)<.006&&Math.abs(inertia.vy)<.006){inertia=null;}else{target.x-=inertia.vx*dt*1000/scale;target.y-=inertia.vy*dt*1000/scale;cam={...target};clampCam();}}if(disposed)return;
    if(followFn){const fp=followFn();if(fp){homeFraming=false;target=followTarget(fp);if(followOpts.snap){cam.x=target.x;cam.y=target.y;}}}if(nextState){const first=state!==nextState;state=nextState;if(first)lastShakeSeq=state.shake?.seq??0;const key=BUILDINGS.map(b=>`${b.id}:${state.buildings?.[b.id]>0}:${state.layout?.[b.id]?.x??b.x}:${state.layout?.[b.id]?.z??b.z}`).join('|');if(!terrainLoadsPending&&(key!==landscapeKey||terrainPatternRev!==lastPatternRev)){lastPatternRev=terrainPatternRev;landscapeKey=key;generateGround();}}
    // T106:停格。命中那一幀照畫(凍住的要是「打下去」的畫面),之後到 hitStopUntil 前整幀跳過。
    if(state.hitstop&&state.hitstop.seq!==hitStopSeq){hitStopSeq=state.hitstop.seq;if(hitStopAllowed()&&state.hitstop.ms>0){hitStopUntil=performance.now()+state.hitstop.ms;hitStopPainted=-2;hitStopCount++;}}
    if(performance.now()<hitStopUntil&&hitStopPainted===hitStopSeq){hitStopSkipped++;return;}
    elapsed+=Math.min(dt||0,.1);heroLodScale=scale*DPRK;if((++atlasTick%10)===0)ensureAtlas();   /* 素材載入只發生在前幾秒:每 10 幀檢查一次就夠 */const t=1-Math.exp(-Math.max(.016,dt||.016)*7);cam.x+=(target.x-cam.x)*t;cam.y+=(target.y-cam.y)*t;variantNew=0;   /* 每幀新換色格的額度歸零(variantCell) */if(hiQueue.length&&!interacting())pumpHi();
    // T95:新的震動請求(seq 變了才啟動;讀檔/第一次拿到 state 時只記 seq,不會突然震)
    if(state.shake&&state.shake.seq!==lastShakeSeq){lastShakeSeq=state.shake.seq;shake(state.shake.amp,state.shake.ms);}
    stepShake(Math.min(dt||0,.1));
    render();
    hitStopPainted=hitStopSeq;}
  function setTime(p){phase=typeof p==='number'?((p%1)+1)%1:.15;}
  function setQuality(v){quality=v!==false&&v!=='low';}
  // 讀取完成判斷(pixel-ui.js 靠它決定何時進村莊):村莊地板(含地面貼圖)已用貼圖畫好、每棟建築都有 Xilurus 圖(不是程序版)。
  // 圖片本身是否都載完由 asset-loading.js 的 assetProgress() 另外看。
  function assetsReady(){return villageReady&&BUILDINGS.every(b=>atlasCell(b.id)||atlasFrameFor(b.id,false));}
  // 驗收用:退回程序繪製的建築計數(進村時必須是 0 且不再增加)。
  // 預熱:把角色與魔物的圖片解碼好(idle 時段一次兩張),進村時才不會停頓。
  const warmDone=new Set();
  function warmupAssets(){
    if(typeof createImageBitmap!=='function')return true;
    const list=[...Object.values(heroSheets).map(s=>s&&s.img),...Object.values(monsterSheets).map(s=>s&&s.img)].filter(im=>im&&im.complete&&im.naturalWidth&&!warmDone.has(im));
    if(!list.length)return true;
    for(const im of list.slice(0,8)){warmDone.add(im);createImageBitmap(im).then(b=>b.close()).catch(()=>{});}   // L2(載入加速):一次 8 張(解碼在工作執行緒,主執行緒只發請求),讀取畫面不必等好幾十幀
    return false;
  }
  function dispose(){disposed=true;for(const[type,fn]of[['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',up],['wheel',wheel],['pointerdown',stopHomeFraming]])canvas.removeEventListener(type,fn);spriteCache.clear();glCanvas?.remove();if(texRelease&&glKeep)texRelease=null;}
  const responsiveResize=()=>{resize();if(homeFraming)focusHome();render();};
  function stopHomeFraming(){homeFraming=false;}
  canvas.addEventListener('pointerdown',stopHomeFraming);
  // —— 村長手動把角色叫進村莊：設定頁按鈕用（每次一職業一位，重複按就多幾位）——————
  function spawnVillager(cls){
    if(!cls||!heroSheets[cls])return null;
    const alongX=Math.random()<.5;
    const lines=alongX?STREET_Z:STREET_X;
    const line=lines[Math.floor(Math.random()*lines.length)];
    const lo=alongX?STREET_X[0]:STREET_Z[0],hi=alongX?STREET_X.at(-1):STREET_Z.at(-1);
    const c=lo+Math.random()*(hi-lo),span=3+Math.random()*6;
    const a=Math.max(lo,c-span),b=Math.min(hi,c+span),off=(Math.random()-.5)*.8;
    const walk=alongX?{ax:a,az:line+off,bx:b,bz:line+off}:{ax:line+off,az:a,bx:line+off,bz:b};
    walk.len=Math.hypot(walk.bx-walk.ax,walk.bz-walk.az)||1;
    walk.speed=.55+Math.random()*.5;walk.t0=Math.random()*20;
    const d={type:'npc',cls,x:walk.ax,z:walk.az,phase:Math.random()*6,size:1,walk};
    decorations.push(d);
    decorations.sort((p,q)=>p.x+p.z-q.x-q.z);
    return d;
  }
  function spawnClassVillagers(clsList){
    const list=(clsList&&clsList.length?clsList:Object.keys(globalThis.PIXEL_ASSETS?.heroSheets||{}))
      .filter(cls=>heroSheets[cls]&&heroSheets[cls].meta.kind!=='part');   // 零件表不是角色，不要叫進村
    return list.filter(cls=>spawnVillager(cls));
  }
  resize();render();return{update,resize:responsiveResize,project,assetsReady,warmupAssets,textFont,textSize,focus:(id)=>{homeFraming=false;focus(id);},/* 驗收用:建築與地區立牌的可點範圍 */enemyFacing:()=>[...drawnFacing.entries()].filter(([k])=>k.startsWith('enemy:')).map(([k,v])=>({id:k.slice(6),f:v.f,act:v.act||null,t:v.t})),hitRects:()=>hits.filter(h=>BUILDINGS.some(h2=>h2.id===h.id)).map(h=>({id:h.id,x:h.x,y:h.y,w:h.w,h:h.h})),unitRects:()=>hits.filter(h=>String(h.id).startsWith('hunter:')).map(h=>({id:String(h.id).slice(7),x:h.x,y:h.y,w:h.w,h:h.h})),foeRects:()=>hits.filter(h=>String(h.id).startsWith('foe:')).map(h=>({id:String(h.id).slice(4),x:h.x,y:h.y,w:h.w,h:h.h})),signRects:()=>hits.filter(h=>String(h.id).startsWith('region:')).map(h=>({id:h.id,x:h.x,y:h.y,w:h.w,h:h.h})),buildingScale:id=>effectiveScale(id),/* T113：相機中心的世界座標（村莊環境音只在看得到村莊時響） */cameraXZ:()=>{const r=viewRect();const p=unproject(r.left+r.width/2,r.top+r.height/2);return{x:p.x,z:p.z};},lookAt:(x,z,v)=>{homeFraming=false;if(v)scale=Math.max(zoomFloor(),Math.min(ZOOM_MAX,v));target=iso(x,z);cam={...target};},zoomTo:(v)=>{homeFraming=false;scale=Math.max(zoomFloor(),Math.min(ZOOM_MAX,v));},getScale:()=>scale,panState:()=>({inertia:inertia?{vx:inertia.vx,vy:inertia.vy}:null,lastTapT}),setSelected,zoomBy,placeMode,setTime,setQuality,setFollow:(fn,opts)=>{followFn=typeof fn==='function'?fn:null;followOpts=(followFn&&opts&&typeof opts==='object')?opts:{};},dirFromScreen,followInfo:()=>followFn?(followOpts.centerBody?{centerBody:true,snap:!!followOpts.snap}:{centerBody:false,snap:!!followOpts.snap}):null,setShadows:(v)=>{shadowsOn=v!==false;compValid=false;},shake,hitStop:(ms)=>{if(!hitStopAllowed()||!(ms>0))return 0;hitStopUntil=performance.now()+ms;hitStopSeq++;hitStopPainted=-2;hitStopCount++;return ms;},unproject,setNight:(v)=>{nightOn=v!==false;},
    setDpr:(v)=>{dprCap=v==='auto'||v==null?null:Math.max(1,Math.min(3,Number(v)||autoDpr()));renderDprMax=Math.max(1,Math.min(dprCap||autoDpr(),globalThis.devicePixelRatio||1));resize();compValid=false;render();},
    dispose,drawDungeonStrip,spawnVillager,spawnClassVillagers,setPartsVisible:(v)=>{partsVisible=v!==false;},getPartsVisible:()=>partsVisible,landscapeStats:()=>({roads:roads.length,terrainRevision,
    decor:decorations.map(d=>({type:d.type,x:d.x,z:d.z,region:d.regionId||null}))})};
}

export const createPixelWorld = createWorld;
