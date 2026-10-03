import {getRoads,roadStyle,onRoad,ARENAS,arenaAt,keepTallDecoration,canopyObscures} from './landscape-layout.js';
import { BUILDINGS, CLASSES, RARITIES } from './pixel-data.js';
import {WORLD,REGIONS,BRIDGES,VILLAGE_BRIDGES,creekX,riverX,biomeAt,BIOME_PALETTE,inVillage,isBridge} from './overworld.js';
import {conceptGroundAt,inConceptFrame,CONCEPT_TREES} from './concept-ground.js';
import {conceptToWorld,CONCEPT_PROPS,CONCEPT_FENCES,CONCEPT_PEOPLE} from './concept-props.js';

// All artwork is rendered to a small integer pixel buffer and enlarged without
// interpolation. World coordinates are shared with the village simulation.
const PX = 9, PY = 4.5;
const ATLAS_ORDER = ['hall','trading','restaurant','inn','tavern','clinic','forge','academy','training','sanctuary','house','bounty','enhancement','dungeon','fountain','well'];
const palettes = {
  berserker: ['#713c38','#b35442','#e78451','#ffc184'],
  ranger: ['#334b35','#548052','#8faf60','#d5d784'],
  paladin: ['#665740','#b48e45','#e5c269','#ffebac'],
  sorcerer: ['#4e3b69','#8061a6','#b28bc9','#e2bce6'],
  darkknight: ['#303c56','#526384','#8a9abb','#c4cbda'],
};
const spriteCache = new Map(), buildingCache = new Map();
let sharedAtlas = null, atlasAttempt = null;

const makeCanvas = (w,h) => { const c=document.createElement('canvas');c.width=w;c.height=h;return c; };
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
function shadowFor(img,sx,sy,sw,sh,flip,wpp,grounded,capWorld){
  let m=shadowCache.get(img);if(!m){m=new Map();shadowCache.set(img,m);}
  const key=`${sx},${sy},${sw},${sh},${flip?1:0},${wpp},${grounded?1:0},${capWorld}`;let r=m.get(key);if(r)return r;
  const src=makeCanvas(sw,sh),sc=src.getContext('2d',{willReadFrequently:true});sc.drawImage(img,sx,sy,sw,sh,0,0,sw,sh);
  const a=sc.getImageData(0,0,sw,sh).data,cap=capWorld/wpp,ex=Math.ceil(cap*SHADOW_SX)+2,ey=Math.ceil(cap*SHADOW_SY)+2,W=sw+ex,H=sh+ey,out=new Uint8ClampedArray(W*H);
  const base=new Int32Array(sw).fill(-1);let bottom=-1;
  for(let x=0;x<sw;x++)for(let y=sh-1;y>=0;y--)if(a[(y*sw+x)*4+3]>40){base[x]=y;if(y>bottom)bottom=y;break;}
  for(let X=0;X<sw;X++){const x=flip?sw-1-X:X,b=grounded?bottom:base[x];if(b<0)continue;
    for(let y=0;y<=b;y++){if(a[(y*sw+x)*4+3]<=40)continue;const h=b-y;if(h>cap)continue;
      const dx=Math.round(X+ex-h*SHADOW_SX),dy=Math.round(b+h*SHADOW_SY),v=255*(1-.72*h/cap),i=dy*W+dx;
      if(dy>=0&&dy<H&&dx>=0&&dx<W-1){if(v>out[i])out[i]=v;if(v>out[i+1])out[i+1]=v;}}}
  const cv=makeCanvas(W,H),cx=cv.getContext('2d'),id=cx.createImageData(W,H);
  for(let i=0;i<out.length;i++){if(!out[i])continue;id.data[i*4]=SHADOW_RGB[0];id.data[i*4+1]=SHADOW_RGB[1];id.data[i*4+2]=SHADOW_RGB[2];id.data[i*4+3]=out[i];}
  cx.putImageData(id,0,0);r={cv,ex,W,H};m.set(key,r);return r;
}

function heroSprite(classId='berserker',frame=0,facing=1,variant=0,lodScale=heroLodScale,pose='idle') {
  heroUse.calls++;
  const hf=heroFrameFor(classId,lodScale);
  // 戰鬥姿勢圖(heropose 圖集,<職業>_windup/_strike/_hurt):倍率跟待機圖同一個,腳底(foot)對齊畫布中線,
  // 武器往外伸就把畫布加寬,人不會因為姿勢不同而忽大忽小。沒有姿勢圖就用待機圖。
  const pf=pose!=='idle'&&hf?heroFrameFor(`${classId}_${pose}`,lodScale):null;
  if(pf&&pf.sc===hf.sc){const key=`${classId}:${pose}:${facing}:${variant%3}:${pf.sc}`;if(spriteCache.has(key))return spriteCache.get(key);
    const cell=pf.cell,res=pf.sc===2?2:1,H=35*res,k=(H-res)/hf.cell.h,dw=Math.max(1,Math.round(cell.w*k)),dh=Math.max(1,Math.round(cell.h*k)),fx=(cell.foot??cell.w/2)*k;
    const half=Math.ceil(Math.max(20*res,fx,dw-fx)),c=makeCanvas(half*2,H),g=c.getContext('2d');g.imageSmoothingEnabled=false;g.save();if(facing<0){g.translate(c.width,0);g.scale(-1,1);}
    g.drawImage(pf.img,cell.x,cell.y,cell.w,cell.h,Math.round(half-fx),H-dh,dw,dh);g.restore();
    g.globalCompositeOperation='source-atop';g.fillStyle=HERO_TINT[variant%3];g.fillRect(0,0,c.width,c.height);heroUse.atlas++;spriteCache.set(key,c);return c;}
  // key 要帶 LOD —— 不然放大後快取裡還是 1x 的圖,2x 永遠用不到。
  const key=`${classId}:${frame}:${facing}:${variant%3}:${hf?hf.sc:0}`;
  if(spriteCache.has(key))return spriteCache.get(key);
  // ── 圖集優先 ────────────────────────────────────────────────────────
  // 28x35 是遊戲既定的角色畫布;把出土角色 contain 進去、底部對齊(腳 = 基準線),
  // frame 1 往上 1px 做走路起伏。variant 用一層極淡的染色保留「同職業不同人」的差異。
  // 圖集還沒載完時 heroFrameFor 回 null,自動退回下面的程序繪製。
  if(hf){
    // 畫布 40×35:拿大武器的角色以高度對齊,不被寬度壓小(繪製時寬度跟著畫布比例走)。
    const cell=hf.cell,resolution=hf.sc===2?2:1,c=makeCanvas(40*resolution,35*resolution),g=c.getContext('2d');
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
    heroUse.atlas++;spriteCache.set(key,c);return c;
  }
  heroUse.proc++;
  const c=makeCanvas(28,35),g=c.getContext('2d');g.imageSmoothingEnabled=false;
  const p=palettes[classId]||palettes.berserker;
  const outline='#29272d',skin=['#f3c69a','#dfad85','#d59a73'][variant%3],skinShade=['#bd865f','#b37c5a','#ae755a'][variant%3];
  const bob=frame===1?1:0;
  g.save();if(facing<0){g.translate(28,0);g.scale(-1,1);}g.translate(0,bob);
  // Cape, boots, and broad chibi head use one-pixel contour clusters.
  polygon(g,[[7,17],[18,17],[22,28],[6,29]],outline);
  polygon(g,[[8,18],[17,18],[20,27],[8,27]],p[0]);
  pixel(g,9,24,5,6-frame,outline);pixel(g,15,24,5,5+frame,outline);
  pixel(g,10,25,3,3-frame,'#84705b');pixel(g,16,25,3,2+frame,'#84705b');
  pixel(g,8,29-frame,6,2,'#392d2a');pixel(g,15,29+frame,6,2,'#392d2a');
  pixel(g,8,17,12,9,outline);pixel(g,9,18,10,7,p[1]);pixel(g,10,18,3,6,p[2]);pixel(g,10,18,8,2,p[3]);
  pixel(g,9,23,10,2,'#54422d');pixel(g,13,23,3,2,'#e6ba63');
  pixel(g,6,18,3,6,outline);pixel(g,7,19,2,4,p[2]);pixel(g,7,23,3,3,skin);
  pixel(g,19,18,3,6,outline);pixel(g,19,19,2,4,p[2]);pixel(g,20,23,3,3,skin);
  pixel(g,8,6,12,12,outline);pixel(g,6,9,16,6,outline);pixel(g,7,10,14,5,skinShade);
  pixel(g,9,7,10,10,skin);pixel(g,8,9,12,6,skin);pixel(g,11,15,7,1,skinShade);
  pixel(g,11,11,2,2,'#302c30');pixel(g,17,11,2,2,'#302c30');pixel(g,11,11,1,1,'#fff2d0');pixel(g,17,11,1,1,'#fff2d0');
  pixel(g,10,14,2,1,'#d78d74');pixel(g,18,14,2,1,'#d78d74');
  if(classId==='ranger') {
    polygon(g,[[7,10],[6,5],[10,2],[18,3],[21,7],[21,10],[17,7],[12,8]],outline);
    polygon(g,[[8,7],[9,4],[15,3],[19,6],[20,8],[14,6]],p[1]);pixel(g,10,4,5,2,p[2]);
    pixel(g,17,1,2,6,'#e0d390');pixel(g,18,1,3,2,'#f2ecd0');
    line(g,24,13,26,19,'#482d28',2);line(g,26,19,24,27,'#482d28',2);line(g,24,13,24,27,'#efc47b');pixel(g,24,19,3,1,'#faf1c8');
  } else if(classId==='sorcerer') {
    polygon(g,[[6,8],[10,6],[13,0],[17,2],[20,7],[23,9],[22,11],[5,11]],outline);
    polygon(g,[[8,8],[12,6],[14,2],[17,4],[19,8]],p[1]);pixel(g,12,5,2,2,p[2]);pixel(g,7,9,14,1,p[2]);pixel(g,14,8,3,2,'#d6ad50');
    pixel(g,24,10,2,19,'#503827');pixel(g,25,12,1,15,'#bc9262');pixel(g,22,6,6,6,outline);pixel(g,23,7,4,4,'#8dd7e3');pixel(g,24,7,2,2,'#e6ffff');
  } else if(classId==='paladin'||classId==='darkknight') {
    const metal=classId==='paladin'?['#676977','#bbc3cc','#e5e8dd']:['#3e4258','#707e9b','#9fadc4'];
    polygon(g,[[7,10],[7,5],[10,2],[19,3],[21,6],[21,12],[18,12],[18,8],[10,8],[10,12]],outline);
    polygon(g,[[8,9],[8,6],[11,3],[18,4],[20,6],[20,10],[18,10],[18,7],[10,7],[10,10]],metal[1]);pixel(g,10,4,7,2,metal[2]);pixel(g,14,3,2,6,metal[2]);
    pixel(g,9,18,10,6,metal[0]);pixel(g,10,18,8,4,metal[1]);pixel(g,12,18,2,3,metal[2]);
    polygon(g,[[3,18],[9,17],[12,19],[11,26],[7,29],[3,25]],outline);
    polygon(g,[[4,19],[9,18],[11,20],[10,25],[7,27],[4,24]],p[1]);line(g,7,19,7,26,p[3]);line(g,4,21,10,21,p[3]);
    pixel(g,23,11,2,15,outline);pixel(g,24,11,1,12,metal[2]);pixel(g,21,22,6,2,'#d0a64d');pixel(g,23,24,2,4,'#755036');
    if(classId==='darkknight'){pixel(g,6,4,2,4,'#bbc5d4');pixel(g,20,4,3,2,'#bbc5d4');pixel(g,11,11,2,1,'#e15b5b');pixel(g,17,11,2,1,'#e15b5b');}
  } else {
    polygon(g,[[7,9],[6,6],[9,3],[10,1],[13,3],[16,1],[17,3],[20,3],[22,7],[20,10],[18,7],[15,8],[13,6],[10,9]],outline);
    polygon(g,[[8,6],[10,4],[11,3],[14,5],[17,3],[20,5],[20,7],[17,6],[15,7],[13,5],[10,7]],'#b96938');pixel(g,10,4,3,2,'#e6a054');
    polygon(g,[[23,8],[26,10],[24,22],[21,22]],outline);polygon(g,[[24,10],[25,11],[23,20],[22,21]],'#b6c3c9');pixel(g,23,12,1,7,'#eef2df');pixel(g,20,22,6,2,'#e1b252');pixel(g,21,24,2,5,'#69452d');
  }
  pixel(g,10,9,2,1,'#ffe2b1');pixel(g,16,9,2,1,'#ffe2b1');pixel(g,10,20,2,1,p[3]);pixel(g,17,20,2,1,p[0]);pixel(g,12,25,2,1,'#e4ca85');pixel(g,9,28-frame,3,1,'#a49479');pixel(g,16,28+frame,3,1,'#a49479');g.restore();spriteCache.set(key,c);return c;
}

export function spriteDataURL(classId='berserker',rarity='normal') {
  const c=makeCanvas(84,90),g=c.getContext('2d');g.imageSmoothingEnabled=false;
  const color=RARITIES.find(r=>r.id===rarity)?.color||'#c6bb9c';
  const sprite=heroSprite(classId,0,1,hash(classId)%3,2.5);g.fillStyle=color+'20';g.fillRect(4,4,76,80);g.drawImage(sprite,0,0,sprite.width,sprite.height,7,-4,70,87.5);return c.toDataURL();
}
export function drawPortrait(canvas,hunter={},options={}) {
  const g=canvas.getContext('2d');g.imageSmoothingEnabled=false;g.clearRect(0,0,canvas.width,canvas.height);
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
const heroUse={calls:0,atlas:0,proc:0};
const HERO_TINT=['rgba(255,225,190,.10)','rgba(190,215,255,.10)','rgba(255,200,215,.10)'];
function heroFrameFor(classId,sc){
  const pick=sc>=2.2?2:1;
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
  const assets=globalThis.PIXEL_ASSETS||{};
  for(const [sheetKey,manKey] of [['heroAtlas','heroManifest'],['heroAtlas2x','heroManifest2x'],['heroposeAtlas','heroposeManifest'],['heroposeAtlas2x','heroposeManifest2x']]){
    if(!assets[sheetKey]||!assets[manKey]||loadedAssetKeys.has(sheetKey))continue;
    loadedAssetKeys.add(sheetKey);
    const m=(typeof assets[manKey]==='string')?JSON.parse(assets[manKey]):assets[manKey];
    const im=new Image();
    im.onload=()=>{heroAtlasLod.push({img:im,scale:m.scale>=0.2?2:1,frames:m.cells});
      // spriteCache 只存角色圖。圖集載入前建的程序版會被快取住永遠不換,
      // 所以圖集一到就整批清掉,下一幀全部改用圖集重建。
      spriteCache.clear();heroUse.atlas=heroUse.proc=0;
      globalThis.dispatchEvent(new CustomEvent('pixel-assets-ready'));};
    im.onerror=()=>loadedAssetKeys.delete(sheetKey);
    im.src=assets[sheetKey];
  }
}

// ── 無縫地面材質(整片 pattern,不是逐格貼圖) ─────────────────────────
// 地面材質縮放:1.0 = 一比一。0.5 讓草葉落在 1~3px(跟建築細節同一個量級)。
const TERRAIN_TEX_SCALE=.5;
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
const GRASS_TONE={village:{mean:[66,124,38],sd:[24,30,14]},meadow:{mean:[72,128,41],sd:[24,30,14]},birch:{mean:[86,148,56],sd:[18,22,12]},
  // 村莊外的延伸:水取樣自概念圖右下溪流 (31,140,201);海再深一階。森林地面取概念圖左下松林的暗綠 (58,88,44)。
  river:{mean:[31,140,201],sd:[20,34,34]},taiga:{mean:[63,104,52],sd:[22,26,16]},
  // 概念圖沒有雪地/山地/沙漠:用概念圖裡最接近的顏色延伸——雪＝概念圖的暖白(炊煙、羊毛 230,224,214),
  // 山地＝概念圖石材灰(紀念碑、溪邊石),沙漠＝概念圖土路黃(203,168,72)偏亮一階。
  // 雪再往概念圖最亮的暖色(羊皮紙 217,187,161)靠:暮光下的雪,48 色票裡沒有冷白,冷白整片都不算數。
  snow:{mean:[222,201,178],sd:[10,10,12]},mountain:{mean:[124,126,120],sd:[30,28,26]},desert:{mean:[210,172,82],sd:[18,16,13]},ocean:{mean:[26,108,172],sd:[18,28,30]},forest:{mean:[52,90,40],sd:[20,26,14]}};
const groundBase=b=>GRASS_TONE[b]?'#'+GRASS_TONE[b].mean.map(v=>v.toString(16).padStart(2,'0')).join(''):BIOME_PALETTE[b];
// 小地圖/世界地圖用同一套對齊概念圖的地面色,地圖跟畫面看起來才是同一個世界。
// 石板/土路色取自 plaza.png、road.png 的取樣平均。
export const MAP_PALETTE=Object.fromEntries(Object.keys(BIOME_PALETTE).map(b=>[b,groundBase(b)]));
export const MAP_ACCENT={grass:'#86b04a',snow:'#f1f4e4',desert:'#e9c993',mountain:'#bfc3b6',road:'#cd9e4e',sea:'#1a6cac'};
let terrainPatternRev=0;
function ensureTerrainAtlas(){
  const assets=globalThis.PIXEL_ASSETS||{};
  if(!assets.terrainAtlas||!assets.terrainManifest||loadedAssetKeys.has('terrainAtlas'))return;
  loadedAssetKeys.add('terrainAtlas');
  const m=(typeof assets.terrainManifest==='string')?JSON.parse(assets.terrainManifest):assets.terrainManifest;
  const im=new Image();
  im.onload=()=>{
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
      groundPatterns[name]=cx.createPattern(cv,'repeat');
    }
    terrainPatternRev++;   // generateGround 會偵測到這個變化並重畫
    globalThis.dispatchEvent(new CustomEvent('pixel-assets-ready'));
  };
  im.onerror=()=>loadedAssetKeys.delete('terrainAtlas');
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
    const im=new Image();im.onload=()=>{conceptTex[name]=im;terrainPatternRev++;globalThis.dispatchEvent(new CustomEvent('pixel-assets-ready'));};
    im.onerror=()=>loadedAssetKeys.delete(key);im.src=assets[key];
  }
}
function ensurePlazaTile(){
  const assets=globalThis.PIXEL_ASSETS||{};
  for(const key of ['plaza','road']){
    if(!assets[key]||loadedAssetKeys.has(key))continue;
    loadedAssetKeys.add(key);
    const im=new Image();
    // 3/4 俯視的壓扁先在載入時用平滑縮放烘進材質,繪製時 1:1 貼上;不然最近鄰的小數縮放會產生摩爾紋斜條。
    im.onload=()=>{const h=Math.max(1,Math.round(im.height*PAVE_SQUASH/.5)),cv=makeCanvas(im.width,h),cx=cv.getContext('2d');cx.imageSmoothingEnabled=true;cx.imageSmoothingQuality='high';cx.drawImage(im,0,0,im.width,h);
      const pat=cx.createPattern(cv,'repeat');if(key==='plaza')plazaPattern=pat;else roadPattern=pat;
      terrainPatternRev++;globalThis.dispatchEvent(new CustomEvent('pixel-assets-ready'));};
    im.onerror=()=>loadedAssetKeys.delete(key);
    im.src=assets[key];
  }
}

// ── 地圖細節圖集(樹、岩石、村莊家具) ──────────────────────────────────
// key 就是裝飾型別,剛好 1:1 對上 drawDecoration() 的分支。
const detailLod=[];
// 樹用 variant%4 選型:0 松 / 1 闊葉 / 2 樺 / 3 雪松(跟 treeSprite 的 type 一致)
const TREE_ATLAS=['pine','oak','birch','snowpine'];
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
  const assets=globalThis.PIXEL_ASSETS||{};
  // props / monsters / flora 是 l0veyou 生的圖集,同契約、cell id 不重複,所以共用 detailLod。
  for(const [sheetKey,manKey] of [['detailsAtlas','detailsManifest'],
                                  ['detailsAtlas2x','detailsManifest2x'],
                                  ['propsAtlas','propsManifest'],['propsAtlas2x','propsManifest2x'],
                                  ['monstersAtlas','monstersManifest'],['monstersAtlas2x','monstersManifest2x'],['monsteratkAtlas','monsteratkManifest'],['monsteratkAtlas2x','monsteratkManifest2x'],
                                  ['floraAtlas','floraManifest'],['floraAtlas2x','floraManifest2x'],
                                  ['villagersAtlas','villagersManifest'],['villagersAtlas2x','villagersManifest2x'],
                                  ['yardAtlas','yardManifest'],['yardAtlas2x','yardManifest2x'],
                                  ['townAtlas','townManifest'],['townAtlas2x','townManifest2x'],['town2Atlas','town2Manifest'],['town2Atlas2x','town2Manifest2x'],
                                  ['iconsAtlas','iconsManifest'],['iconsAtlas2x','iconsManifest2x'],
                                  ['vfxAtlas','vfxManifest'],['vfxAtlas2x','vfxManifest2x']]){
    if(!assets[sheetKey]||!assets[manKey]||loadedAssetKeys.has(sheetKey))continue;
    loadedAssetKeys.add(sheetKey);
    const m=(typeof assets[manKey]==='string')?JSON.parse(assets[manKey]):assets[manKey];
    const im=new Image();
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
const conceptBuildingWidth=id=>({hall:112,inn:94,tavern:165,house:100,bounty:48,dungeon:77}[id]||86);
// 大廳與地下城要比店鋪大。舊版是 hall:79 / dungeon:77,換算成倍率。
const BUILDING_SCALE={hall:1.11,dungeon:1.08};
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
    const im=new Image();
    im.onload=()=>{
      const k=(m.scale===0.5)?(1/(ATLAS_REF_WIDTH_1X)):(1/(ATLAS_REF_WIDTH_1X*2));
      atlasLod.push({img:im,k,scale:m.scale===0.5?1:2,frames:m.cells});
      globalThis.dispatchEvent(new CustomEvent('pixel-assets-ready'));
    };
    im.onerror=()=>loadedAssetKeys.delete(urlKey);
    im.src=assets[urlKey];
  }
}
function ensureAtlas() {
  ensureAtlasManifest();
  ensureDetailAtlas();
  ensureTerrainAtlas();
  ensurePlazaTile();ensureConceptTextures();
  ensureHeroAtlas();
  const assets=globalThis.PIXEL_ASSETS||{};
  // 舊的硬切格圖集載入已由上面的 manifest 圖集取代(列切線原本是猜的)。

  for(const b of [...BUILDINGS,{id:'monument'}]){const src=assets[b.id];if(!src||loadedAssetKeys.has(b.id))continue;loadedAssetKeys.add(b.id);
    const im=new Image();im.onload=()=>{const cell=makeCanvas(im.width,im.height),c=cell.getContext('2d');c.drawImage(im,0,0);const pixels=c.getImageData(0,0,im.width,im.height),d=pixels.data;let x0=im.width,y0=im.height,x1=0,y1=0;
      const alphaAsset=globalThis.PIXEL_ASSETS?.alphaAssets?.[b.id];
      for(let y=0;y<im.height;y++)for(let x=0;x<im.width;x++){const j=(y*im.width+x)*4;if(!alphaAsset&&d[j]>160&&d[j+2]>130&&d[j+1]<130&&d[j]>d[j+1]*1.5&&d[j+2]>d[j+1]*1.5)d[j+3]=0;if(!alphaAsset&&b.id==='inn'&&y<im.height*.25&&d[j+1]>100&&d[j+2]>d[j+1]*1.10)d[j+3]=0;if(d[j+3]>32){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}}
      c.putImageData(pixels,0,0);if(x1>x0&&y1>y0){const sourceWidth=x1-x0+1,sourceHeight=y1-y0+1,out=makeCanvas(alphaAsset?sourceWidth:384,alphaAsset?sourceHeight:Math.round(384*sourceHeight/sourceWidth)),g=out.getContext('2d');g.imageSmoothingEnabled=false;g.drawImage(cell,x0,y0,sourceWidth,sourceHeight,0,0,out.width,out.height);sharedAtlas||=new Map();sharedAtlas.set(b.id,out);globalThis.dispatchEvent(new CustomEvent('pixel-assets-ready'));}
    };im.onerror=()=>loadedAssetKeys.delete(b.id);im.src=src;
  }
}

function treeSprite(seed=0,type=0) {
 const c=makeCanvas(58,84),g=c.getContext('2d'),r=rnd(seed),snow=type===3,birch=type===2,pine=type===0||snow;
 pixel(g,25,44,7,34,'#273d32');pixel(g,26,45,5,32,birch?'#e6e4c7':'#815c38');pixel(g,26,49,2,25,birch?'#ffffde':'#b58b54');pixel(g,21,77,18,3,'#49613d');
 if(birch)for(let i=0;i<6;i++)pixel(g,26+i%2,48+i*5,4-i%2,2,'#66685c');
 const pal=snow?['#304b50','#547571','#b4d8d3','#e8f3e5']:pine?['#243f37','#345e43','#538347','#7ca658']:birch?['#3b542d','#678641','#a1b85a','#d4d77d']:['#263f2d','#47733b','#78a24d','#a9c46b'];
 const blobs=pine?[[29,14,8,12],[29,28,15,12],[29,42,21,12],[29,56,26,12]]:[[29,15,14,12],[16,30,15,16],[40,28,16,15],[26,42,23,18],[42,48,12,13],[13,47,11,12]];
 const inside=(x,y)=>blobs.some(([cx,cy,rx,ry])=>((x-cx)/rx)**2+((y-cy)/ry)**2<1);
 for(let y=1;y<70;y++)for(let x=2;x<56;x++)if(inside(x,y)){
   const edge=!inside(x-1,y)||!inside(x+1,y)||!inside(x,y-1)||!inside(x,y+1),cluster=Math.sin(x*.53+y*.34)*Math.cos(y*.77-x*.21),light=(1-x/58)*.52+(1-y/80)*.4+cluster*.23;
   const k=edge?0:light>.66?3:light>.40?2:1;pixel(g,x,y,1,1,pal[k]);if(!edge&&r()<.07)pixel(g,x,y,2,1,pal[Math.max(1,k-1)]);
 }
 if(snow){for(let i=0;i<24;i++){const x=6+r()*45,y=12+r()*46;if(inside(x,y))pixel(g,x,y,3,1,'#f2f6df');}}
 return c;
}

const enemyCache=new Map();
function enemySprite(type='slime',frame=0) {
  const key=type+frame;if(enemyCache.has(key))return enemyCache.get(key);
  const c=makeCanvas(54,54),g=c.getContext('2d'),o='#293436';
  if(type==='slime') {
    const bob=frame?1:0;polygon(g,[[11,42],[12,32+bob],[16,26+bob],[26,24+bob],[34,28+bob],[37,35],[38,43],[34,46],[15,46]],o);
    polygon(g,[[13,41],[14,33+bob],[18,28+bob],[26,26+bob],[33,30+bob],[35,36],[36,43],[31,45],[16,44]],'#64a66b');
    polygon(g,[[28,28+bob],[33,31+bob],[35,36],[35,43],[30,44],[30,39],[32,36]],'#438762');
    pixel(g,18,29+bob,9,4,'#b8db8e');pixel(g,15,33+bob,4,7,'#94c678');
    pixel(g,20,28+bob,5,2,'#e0edb2');pixel(g,17,31+bob,3,2,'#d1e6a3');
    pixel(g,15,37,2,4,'#bddb95');pixel(g,18,40,3,2,'#83ba78');
    pixel(g,22,36,2,3,'#2e3a39');pixel(g,30,36,2,3,'#2e3a39');
    pixel(g,22,36,1,1,'#e9f2c9');pixel(g,30,36,1,1,'#e9f2c9');
    pixel(g,25,41,4,1,'#435247');pixel(g,21,43,12,1,'#44896a');
    pixel(g,16,44,5,1,'#95c37f');pixel(g,30,42,3,1,'#326950');
  }else if(type==='wolf') {
    polygon(g,[[8,37],[5,29],[12,34],[20,28],[33,29],[41,25],[42,33],[46,36],[44,42],[38,42],[35,49],[30,49],[30,42],[20,42],[17,49],[12,49],[13,41]],o);
    polygon(g,[[10,36],[8,32],[14,36],[22,30],[33,31],[39,28],[40,35],[44,37],[42,40],[35,40],[32,47],[31,40],[19,40],[15,47],[15,39]],'#929b9e');
    polygon(g,[[12,35],[16,32],[22,31],[28,33],[25,37],[16,38]],'#c7ccbd');
    pixel(g,19,31,12,4,'#dce0d1');pixel(g,25,35,9,4,'#677580');pixel(g,16,38,9,3,'#78858a');
    pixel(g,38,33,2,2,'#edb75a');pixel(g,43,37,2,2,'#242b2d');pixel(g,14+(frame?1:0),46,4,2,'#65757b');
    pixel(g,18,41,4,2,'#b3bec0');pixel(g,29,42,5,2,'#495960');
  }else if(type==='boss') {
    polygon(g,[[8,43],[5,28],[9,19],[15,17],[13,7],[22,12],[26,8],[32,12],[43,6],[40,19],[47,23],[50,40],[45,47],[37,45],[35,52],[27,52],[24,47],[21,52],[11,52],[12,46]],o);
    polygon(g,[[9,39],[9,25],[15,21],[21,18],[30,16],[39,20],[44,25],[47,39],[41,42],[35,39],[33,48],[28,48],[25,43],[20,48],[14,48],[15,40]],'#766559');
    polygon(g,[[15,9],[20,16],[18,23],[14,18]],'#ccbb90');polygon(g,[[41,9],[35,16],[36,23],[41,18]],'#ccbb90');pixel(g,18,24,19,13,'#977e60');pixel(g,18,26,6,4,'#e98a43');pixel(g,30,26,6,4,'#e98a43');pixel(g,20,27,2,2,'#ffeaaa');pixel(g,32,27,2,2,'#ffeaaa');pixel(g,24,33,8,3,'#3a3634');pixel(g,20,37,16,2,'#d0be96');pixel(g,20,37,3,5,'#f4e6ba');pixel(g,33,37,3,5,'#f4e6ba');pixel(g,11,28,4,10,'#9e8667');pixel(g,41,30,4,8,'#514c47');
  }else {
    polygon(g,[[9,43],[9,26],[15,21],[17,12],[33,10],[40,18],[40,26],[46,30],[45,45],[36,47],[34,52],[27,52],[24,46],[21,52],[12,51]],o);
    polygon(g,[[12,42],[12,28],[19,25],[20,15],[32,13],[37,20],[35,28],[43,32],[42,42],[33,42],[32,49],[28,49],[25,40],[20,48],[15,48]],'#888a7e');
    polygon(g,[[15,39],[16,28],[21,25],[25,27],[23,34],[19,40]],'#a7aa9e');polygon(g,[[27,15],[32,13],[37,20],[35,28],[30,27]],'#6e7776');
    polygon(g,[[20,17],[31,15],[34,21],[31,27],[21,26]],'#b5b4a0');pixel(g,22,21,3,3,'#9bd3c5');pixel(g,29,21,3,3,'#9bd3c5');pixel(g,24,32,9,7,'#666f69');pixel(g,27,33,3,4,'#b8ce9f');pixel(g,13,28,5,4,'#b0ad99');pixel(g,36,33,5,3,'#a3a48f');pixel(g,19,43,5,3,'#6c7675');pixel(g,30,44,5,3,'#c1c2b1');
  }enemyCache.set(key,c);return c;
}

export function createWorld(canvas,{onSelect=()=>{},onPlace=()=>{},getState=()=>null}={}) {
  ensureAtlas();
  const screen=canvas.getContext('2d',{alpha:false}),buffer=makeCanvas(800,500),bg=buffer.getContext('2d',{alpha:false});
  // 物件先畫到 spriteLayer、影子畫到 shadowLayer;地面 → 整層影子 → 物件。g 指向「目前在畫的那一層」。
  const shadowLayer=makeCanvas(800,500),sg=shadowLayer.getContext('2d'),spriteLayer=makeCanvas(800,500),spg=spriteLayer.getContext('2d');
  let g=bg,casting=false;
  canvas.style.imageRendering='pixelated';canvas.style.touchAction='none';screen.imageSmoothingEnabled=false;bg.imageSmoothingEnabled=false;
  let width=800,height=500,scale=.9,elapsed=0,phase=.15,selected=null,placing=null,state={buildings:{},hunters:[],enemies:[],effects:[]},disposed=false,quality=true,baseScale=1.95;
  let cam={x:-90,y:-27},target={x:-90,y:-27},pointer=null,hover=null,lastSource=null,pinchDistance=0,homeFraming=false;
  const uiLabels=[],hits=[],pointers=new Map(),previousPositions=new Map(),treeCanvases=Array.from({length:16},(_,i)=>treeSprite(i*782+19,i%4));
  const decorations=[];let roads=getRoads(),landscapeKey='',terrainRevision=0,lastPatternRev=-1;
  // 地面畫布解析度:桌機 2 倍(放大時材質細節跟 2x 精靈一致,不會一塊一塊),手機 1 倍省記憶體。繪圖座標仍是 2400x1450 邏輯單位。
  const GROUND_RES=((globalThis.screen?.width||0)>=1024&&!globalThis.matchMedia?.('(pointer:coarse)').matches)?2:1;
  const ground=makeCanvas(2400*GROUND_RES,1450*GROUND_RES),gc=ground.getContext('2d');gc.imageSmoothingEnabled=false;
  const groundOrigin={x:1100,y:560};
  const worldPos=(x,z)=>{const p=iso(x,z);return{x:p.x+groundOrigin.x,y:p.y+groundOrigin.y};};

  function diamond(ctx,x,z,rx,rz,color){const a=worldPos(x-rx,z-rz),b=worldPos(x+rx,z-rz),c=worldPos(x+rx,z+rz),d=worldPos(x-rx,z+rz);polygon(ctx,[[a.x,a.y],[b.x,b.y],[c.x,c.y],[d.x,d.y]],color);}
  function generateGround(){
    gc.setTransform(GROUND_RES,0,0,GROUND_RES,0,0);gc.imageSmoothingEnabled=false;
    const rand=rnd(349180);decorations.length=0;roads=getRoads(state.layout||{},state.buildings||{});terrainRevision++;
    // 世界外圍的海:用對齊概念圖水色的 ocean 材質鋪滿,不再是一片平塗青色。
    gc.fillStyle=groundBase('ocean')||'#417d90';gc.fillRect(0,0,ground.width,ground.height);
    if(groundPatterns.ocean){gc.save();gc.globalAlpha=TERRAIN_TEX_ALPHA;gc.scale(TERRAIN_TEX_SCALE,TERRAIN_TEX_SCALE*TERRAIN_TEX_SQUASH);gc.fillStyle=groundPatterns.ocean;
      gc.fillRect(0,0,ground.width/TERRAIN_TEX_SCALE,ground.height/(TERRAIN_TEX_SCALE*TERRAIN_TEX_SQUASH));gc.restore();}
    const road=(x,z)=>onRoad(x,z,roads);
    // 底層:按生態域「整片」填無縫材質。一格菱形只有 9x5 螢幕像素,逐格貼圖
    // 塞不進細節;整片填才會有連續的草/沙/雪紋理。pattern 垂直壓 0.5 符合等角透視。
    // 材質還沒載完時 tiled=false,退回原本的平塗菱形,不開天窗。
    const tiled=Object.keys(groundPatterns).length>0,roadCells=[],stoneCells=[],clearCells=[];
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
      const clearing=arenaAt(x,z);
      if(clearing){const colors={meadow:'#aeb27d',forest:'#a4a77c',taiga:'#99aaa0',snow:'#d6bfa4',mountain:'#b6b6a5',desert:'#e3c28a',birch:'#b9c18a'};const cc=shade(colors[clearing.id]||'#b5b68a',n/2);if(roadPattern&&clearing.id!=='snow'&&clearing.id!=='taiga'){clearCells.push(x,z);rand();continue;}if(tiled){gc.save();gc.globalAlpha=.5;diamond(gc,x,z,.51,.51,cc);gc.restore();}else diamond(gc,x,z,.51,.51,cc);if(rand()<.17)pixel(gc,p.x-2,p.y,3,1,shade(colors[clearing.id]||'#b5b68a',-13));continue;}
      // 雪地空地/雪路跟著 GRASS_TONE.snow 的暮光暖白走(踩過的雪暗一階),不用冷灰藍。
      // 土路色:概念圖土路取樣平均 (202,146,69)=#ca9245,明暗點綴跟著同一個色相。
      if(road(x,z)&&biome!=='snow'&&(roadStyle(x,z,roads)==='stone'?plazaPattern:roadPattern)){const st=roadStyle(x,z,roads)==='stone';if(conceptGroundAt(x,z)==='.')(st?stoneCells:roadCells).push(x,z);for(let i=st?4:1;i>0;i--)rand();continue;}  // 概念圖畫框內的路面由概念圖地面圖負責  // 跟原分支吃一樣多的亂數
      if(road(x,z)){diamond(gc,x,z,.60,.60,roadStyle(x,z,roads)==='stone'?'#d8c0a8':biome==='snow'?'#c4ad94':'#ca9245');if(roadStyle(x,z,roads)==='stone'){for(let i=0;i<4;i++){const dx=(i%2)*7-6,dy=Math.floor(i/2)*3-2;pixel(gc,p.x+dx,p.y+dy,6,2,rand()>.5?'#e4d0b2':'#b0a184');pixel(gc,p.x+dx,p.y+dy,5,1,'#f0e2c6');}}else{pixel(gc,p.x-5,p.y-1,7,1,biome==='snow'?'#a8927c':'#a06c34');pixel(gc,p.x+1,p.y+1,5,1,biome==='snow'?'#dcc6ac':'#e0ae68');if(rand()<.2)pixel(gc,p.x-2,p.y,2,1,'#ecc27e');}continue;}
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
    const fillPave=(path,pat,alpha=1,tint=null)=>{if(!pat)return false;gc.save();gc.clip(path);gc.globalAlpha=alpha;gc.save();gc.scale(.5,.5);gc.fillStyle=pat;gc.fillRect(0,0,ground.width*2,ground.height*2);gc.restore();if(tint){gc.globalAlpha=1;gc.fillStyle=tint;gc.fillRect(0,0,ground.width,ground.height);}gc.restore();return true;};
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
      // 河岸岩石:概念圖溪流兩岸有灰石。
      const rr=rnd(9137);for(let z=WORLD.minZ;z<WORLD.maxZ;z++)for(let x=WORLD.minX;x<WORLD.maxX;x++){if(biomeAt(x,z)!=='river')continue;
        for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const nb=biomeAt(x+dx,z+dz);if(WET.includes(nb)||!nb||rr()>.28)continue;
          const rx=x+dx*.62+(rr()-.5)*.5,rz=z+dz*.62+(rr()-.5)*.5;if(road(rx,rz)||onRoad(rx,rz,roads,.8))continue;decorations.push({type:'rock',x:rx,z:rz,size:.45+rr()*.5});}}}
    // 路與戰鬥空地:整片 clip 後填概念圖對齊的材質(不逐格貼,紋理才連續)。空地是半透明土 → 踩出來的草地。
    const fillCells=(cells,half,pat,alpha,edge)=>{if(!cells.length)return;const path=new Path2D();
      for(let i=0;i<cells.length;i+=2){const x0=cells[i],z0=cells[i+1],q=worldPos(x0-half,z0-half),r=worldPos(x0+half,z0-half),t=worldPos(x0+half,z0+half),u=worldPos(x0-half,z0+half);
        path.moveTo(q.x,q.y);path.lineTo(r.x,r.y);path.lineTo(t.x,t.y);path.lineTo(u.x,u.y);path.closePath();}
      if(edge){gc.save();gc.translate(0,1);gc.fillStyle=edge;gc.fill(path);gc.restore();}
      gc.save();gc.clip(path);gc.globalAlpha=alpha;gc.scale(.5,.5);gc.fillStyle=pat;gc.fillRect(0,0,ground.width*2,ground.height*2);gc.restore();};
    // 戰鬥空地:用「不規則橢圓」取代一格一格的菱形聯集(邊緣不再是直的鋸齒),中央踩得較禿、邊緣淡出到草地。
    if(roadPattern){for(const a of ARENAS){if(a.id==='snow'||a.id==='taiga'||a.id==='desert')continue;/* 沙地本來就是裸地,疊土反而髒 */const ring=(k,j)=>{const path=new Path2D();
        for(let i=0;i<=48;i++){const t=i/48*Math.PI*2,r=k*(1+.1*Math.sin(3*t+a.x)+.07*Math.sin(7*t+a.z)+j*.05*Math.sin(13*t)),q=worldPos(a.x+Math.cos(t)*a.rx*r,a.z+Math.sin(t)*a.rz*r);i?path.lineTo(q.x,q.y):path.moveTo(q.x,q.y);}
        path.closePath();return path;};
      fillPave(ring(1.02,1),roadPattern,.32);fillPave(ring(.86,1),roadPattern,.38);fillPave(ring(.62,0),roadPattern,.3);}}
    else fillCells(clearCells,.51,roadPattern,.6,null);
    // 海岸:陸地碰到海的地方鋪一條沙岸(沙漠材質,裁在陸地內)再放礁石,不是森林直接切進海裡。
    {const WET2=['ocean'],beach=new Path2D(),sr=rnd(6627);let any=false;
      for(let z=WORLD.minZ;z<WORLD.maxZ;z++)for(let x=WORLD.minX;x<WORLD.maxX;x++){const b=biomeAt(x,z);if(b==='ocean'||b==='river'||b==='ice'||b==='bridge')continue;
        for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){if(!WET2.includes(biomeAt(x+dx,z+dz)))continue;any=true;
          for(let k=0;k<3;k++){const c=worldPos(x+dx*(.25+sr()*.3)+(dz?sr()-.5:0),z+dz*(.25+sr()*.3)+(dx?sr()-.5:0)),r=.3+sr()*.35;addEllipse(beach,c.x,c.y,r*12.7,r*6.4);}
          if(sr()<.16&&b!=='snow')decorations.push({type:'rock',x:x+dx*.45+(sr()-.5)*.6,z:z+dz*.45+(sr()-.5)*.6,size:.5+sr()*.6});}}
      if(any&&groundPatterns.desert){const land=[];for(let z=WORLD.minZ;z<WORLD.maxZ;z++)for(let x=WORLD.minX;x<WORLD.maxX;x++){const b=biomeAt(x,z);if(b!=='ocean'&&b!=='river'&&b!=='ice'&&b!=='bridge')land.push(x,z);}
        gc.save();gc.clip(cellPath(land,.5));fillTerrain(null,0,'desert',beach);gc.restore();}}
    fillCells(roadCells,.6,roadPattern,1,'#7a5a30');
    fillCells(stoneCells,.6,plazaPattern,1,'#8a7a62');
    // Unreachable woodland scenery continues beyond the village's west edge.
    const woodCells=[];
    for(let z=-35;z<35;z++)for(let x=-52;x<WORLD.minX+1;x++){
      woodCells.push(x,z);rand();  // 原本平塗菱形吃一個亂數;改成整片林地材質,亂數照吃

      if(x<-32&&x%3===0&&z%3===0&&rand()>.22)decorations.push({type:'tree',x:x+(rand()-.5)*1.6,z:z+(rand()-.5)*1.6,variant:rand()<.35?0:1,size:(.58+rand()*.25)*.72});
    }
    // 西側林地:跟村外森林同一套概念圖對齊的地面(底色+材質),不再是平塗菱形。
    fillTerrain(woodCells,.56,'forest');
    // 西側林地補密樹(獨立亂數):概念圖村莊外圍是一圈密松林。
    {const r3=rnd(51177);for(let z=-34;z<34;z+=1.3)for(let x=-50;x<WORLD.minX-.5;x+=1.3){if(r3()<.62)decorations.push({type:'tree',x:x+r3()*.9,z:z+r3()*.9,variant:r3()<.6?0:1,size:.42+r3()*.18});}}
    // Central monument plaza and aprons, based on the original concept composition.
    const plazaCells=[];
    const earthCells=[];
    for(let z=-24;z<26;z+=.5)for(let x=-28;x<9;x+=.5){
      // 概念圖畫框內:地面直接照概念圖分類(pipeline/scripts/align/concept_ground.py)。
      const cg=conceptGroundAt(x,z),wet=['ocean','river','ice','bridge'].includes(biomeAt(x,z));
      if(cg!=='.'){if(!wet&&cg==='s')plazaCells.push(x,z);else if(!wet&&cg==='e')earthCells.push(x,z);continue;}
      if(z<-20||z>=23||x<-25||x>=7)continue;
      const plaza=((x+8)/12.5)**2+((z-2)/10.5)**2<=1;
      const hallApproach=Math.abs((x-z)+10)<3.2&&x+z>=-30&&x+z<=-7;
      const southStreet=Math.abs((x-z)+10)<3.8&&x+z>8&&x+z<23;
      const forecourt=BUILDINGS.some(b=>{
        if(b.id==='dungeon'||state.buildings?.[b.id]===0)return false;
        const q=state.layout?.[b.id]||b;
        return Math.abs(x-q.x)<=b.w*.85&&z>=q.z-b.d*.15&&z<=q.z+b.d*.5+2.2;
      });
      if(!plaza&&!hallApproach&&!southStreet&&!forecourt)continue;
      const p=worldPos(x,z),v=Math.floor(rand()*18);
      if(plazaPattern){plazaCells.push(x,z);rand();continue;}  // 照樣消耗亂數,後面的裝飾位置才不會變
      diamond(gc,x,z,.30,.30,`rgb(${216+v},${193+v},${162+v})`);
      pixel(gc,p.x-3,p.y+2,5,1,'#aa9373');
      if(rand()<.18)pixel(gc,p.x-2,p.y-1,3,1,'#f0dfbd');
    }
    // 概念圖的廣場是一整片石板:先描邊(深色路緣)再整片填 pattern,石塊不會被格子切碎。
    if(earthCells.length&&roadPattern){
      const path=new Path2D();
      for(let i=0;i<earthCells.length;i+=2){const x0=earthCells[i],z0=earthCells[i+1];
        const q=worldPos(x0-.27,z0-.27),r=worldPos(x0+.27,z0-.27),t=worldPos(x0+.27,z0+.27),u=worldPos(x0-.27,z0+.27);
        path.moveTo(q.x,q.y);path.lineTo(r.x,r.y);path.lineTo(t.x,t.y);path.lineTo(u.x,u.y);path.closePath();}
      gc.save();gc.clip(path);gc.scale(.5,.5);gc.fillStyle=roadPattern;gc.fillRect(0,0,ground.width*2,ground.height*2);gc.restore();
    }
    if(plazaCells.length){
      const path=new Path2D();
      for(let i=0;i<plazaCells.length;i+=2){const x0=plazaCells[i],z0=plazaCells[i+1];
        const q=worldPos(x0-.27,z0-.27),r=worldPos(x0+.27,z0-.27),t=worldPos(x0+.27,z0+.27),u=worldPos(x0-.27,z0+.27);
        path.moveTo(q.x,q.y);path.lineTo(r.x,r.y);path.lineTo(t.x,t.y);path.lineTo(u.x,u.y);path.closePath();}
      gc.save();gc.translate(0,1.5);gc.fillStyle='#8a7a62';gc.fill(path);gc.restore();
      gc.save();gc.clip(path);gc.scale(.5,.5);gc.fillStyle=plazaPattern;gc.fillRect(0,0,ground.width*2,ground.height*2);gc.restore();
    }
    // 建築地基:概念圖建築都坐在石板上 → 用廣場石板,不再是平塗灰菱形。
    for(const b of BUILDINGS.filter(b=>b.id!=='dungeon'&&state.buildings?.[b.id]!==0)){const p=state.layout?.[b.id]||b;if(!fillPave(diamondPath(p.x,p.z,b.w*.6,b.d*.6),plazaPattern,1,'rgba(60,45,30,.12)'))diamond(gc,p.x,p.z,b.w*.6,b.d*.6,'#b3b09a');}
    // 菜園翻土:土路材質壓暗成濕土色(概念圖左上菜園),不再是平塗咖啡色。
    if(!fillPave(diamondPath(-25,14,2.2,4.5),roadPattern,1,'rgba(72,40,14,.5)'))diamond(gc,-25,14,2.2,4.5,'#745536');
    // 田:概念圖左上的菜園。麥穗與高麗菜改成 flora 圖集的裝飾(會跟角色正確前後排序)。
    for(let z=10.2;z<18;z+=.95)for(let x=-26.6;x<-23.2;x+=.85)decorations.push({type:x<-25.4?'cabbage':'wheat',x,z,variant:Math.round(x*7+z*13)&1,size:1});  // 不吃 rand(),後面的隨機裝飾位置不變
    // Small decorative fishing pond; the main river is an actual navigation boundary.
    // 釣魚池:沙岸用土路材質、水面用對齊概念圖溪流色的水材質。
    if(!fillPave(diamondPath(-19,-23,3.4,2.7),roadPattern,1,'rgba(255,240,200,.18)'))diamond(gc,-19,-23,3.4,2.7,'#bbbc8a');
    if(groundPatterns.river)fillTerrain(null,0,'river',diamondPath(-19,-23,2.9,2.2));else diamond(gc,-19,-23,2.9,2.2,'#609da2');
    for(let z=WORLD.minZ+3;z<WORLD.maxZ-2;z+=3.6)for(let x=WORLD.minX+3;x<WORLD.maxX-2;x+=3.9){
      const xx=x+rand()*.9,zz=z+rand()*.9,bio=biomeAt(xx,zz);if(['ocean','river','ice','bridge'].includes(bio)||road(xx,zz))continue;
      if(inVillage(xx,zz)&&rand()>.08)continue;
      if(arenaAt(xx,zz,2)||BUILDINGS.some(b=>{const p=state.layout?.[b.id]||b;return Math.abs(xx-p.x)<4&&Math.abs(zz-p.z)<4.5;}))continue;
      const chance=bio==='forest'?.46:bio==='taiga'?.43:bio==='birch'?.34:bio==='snow'?.28:bio==='meadow'?.08:.04;
      if(rand()<chance){const type=bio==='taiga'?0:bio==='snow'?3:bio==='birch'?2:1;decorations.push({type:'tree',x:xx,z:zz,variant:type+Math.floor(rand()*4)*4,size:(.62+rand()*.26)*.7});}
      else if(bio==='desert'&&rand()<.23)decorations.push({type:'cactus',x:xx,z:zz,size:.8+rand()*.5});
      else if(bio==='mountain'&&rand()<.62)decorations.push({type:'outcrop',x:xx,z:zz,size:1+rand()*.7});
      else if(rand()<.22)decorations.push({type:bio==='snow'||bio==='desert'||bio==='mountain'?'rock':bio==='forest'?'mushroom':'flowers',x:xx,z:zz,variant:Math.floor(rand()*5),size:1});
    }
    // 概念圖的林地是密到看不見地面的松林:林地生態域再補一層密樹(獨立亂數,不動到上面既有的擺放)。
    {const r2=rnd(77031);for(let z=WORLD.minZ+1;z<WORLD.maxZ-1;z+=1.2)for(let x=WORLD.minX+1;x<WORLD.maxX-1;x+=1.25){  // 樹變小 → 密度加倍,林地才一樣看不到地面
      const xx=x+r2()*1.1,zz=z+r2()*1.1,bio=biomeAt(xx,zz),roll=r2();
      const dense=bio==='forest'?.7:bio==='taiga'?.62:bio==='birch'?.38:bio==='snow'?.2:bio==='desert'?.16:bio==='mountain'?.2:0;if(roll>=dense)continue;
      if(road(xx,zz)||onRoad(xx,zz,roads,1.2)||inVillage(xx,zz)||arenaAt(xx,zz,3))continue;
      // 沙漠補仙人掌與碎石、山地補岩峰與碎石(不是樹)。
      if(bio==='desert'){decorations.push(r2()<.6?{type:'cactus',x:xx,z:zz,size:.75+r2()*.5}:{type:'rock',x:xx,z:zz,size:.7+r2()*.6});continue;}
      if(bio==='mountain'){decorations.push(r2()<.45?{type:'outcrop',x:xx,z:zz,size:.7+r2()*.5}:{type:'rock',x:xx,z:zz,size:.8+r2()*.7});continue;}
      if(BUILDINGS.some(b=>{const q=state.layout?.[b.id]||b;return Math.abs(xx-q.x)<4.5&&Math.abs(zz-q.z)<5;}))continue;
      const type=bio==='snow'?3:bio==='taiga'?(r2()<.35?3:0):bio==='birch'?(r2()<.6?2:1):(r2()<.55?0:1);
      decorations.push({type:'tree',x:xx,z:zz,variant:type+Math.floor(r2()*4)*4,size:.42+r2()*.2});}}
    for(const [x,z,v]of[[-17,-9,1],[-17,0,5],[-15,19,1],[-6,20,2],[7,19,6],[10,-14,0],[12,11,1],[-21,13,2]])decorations.push({type:'tree',x,z,variant:v,size:.5});  // 概念圖松樹約 120px → 30 單位
    // A mixed woodland rim frames the village without occupying its streets.
    for(let i=0;i<12;i++){
      const candidates=[{x:-28,z:-21+i*4.2},{x:-26+i*2.6,z:28},{x:-28+i*2.2,z:-28}];
      for(const point of candidates){
        const tree={type:'tree',...point,variant:i%3===0?0:1,size:.42};
        if(keepTallDecoration(tree,roads,state.layout||{}))decorations.push(tree);
      }
    }
    for(const b of BUILDINGS){
      if(b.id==='dungeon'||state.buildings?.[b.id]===0)continue;
      const pos=state.layout?.[b.id]||b;
      // 概念圖:交易所旁是紅白條紋攤位,酒館/鐵匠/旅館/餐廳門邊堆木桶木箱,其餘是花圃。
      const sideProp=side=>b.id==='trading'&&side<0?'stall':['tavern','forge','inn','restaurant'].includes(b.id)&&side>0?'barrels':'garden';
      for(const side of[-1,1]){
        const x=pos.x+side*(b.w/2+.7),z=pos.z+b.d/2+.4;
        if(!onRoad(x,z,roads,.35))decorations.push({type:sideProp(side),x,z,variant:side<0?0:2,size:sideProp(side)==='garden'?.8:1});
      }
    }
    decorations.push({type:'monument',x:-8,z:2,size:1},{type:'well',x:-10.5,z:22.5,size:.56});
    for(let z=-23;z<25;z+=.85){if((z>-1&&z<5)||(z>16&&z<20))continue;decorations.push({type:'fence',x:9,z,size:1});}
    for(const z of[-1,5,16,20])decorations.push({type:'gate',x:9.1,z,size:1});
    for(const[x,z]of[[-7,4],[-7,-5],[1,4],[1,11],[-7,12],[7,2],[13,2]])decorations.push({type:'lamp',x,z,size:1});
    for(const z of VILLAGE_BRIDGES)for(let i=-3;i<=3;i++){const u=i+3,last=i===3;decorations.push({type:'bridgeRail',x:creekX(z)+i,z:z-1.5,u,last,size:1},{type:'bridgeRail',x:creekX(z)+i,z:z+1.5,u,last,size:1});}
    for(let z=-22;z<25;z+=2.4){
      if(VILLAGE_BRIDGES.some(bridge=>Math.abs(z-bridge)<2.5))continue;
      for(const side of[-1,1]){
        if(rand()<.4)continue;
        const x=creekX(z)+side*(1.8+rand()*.35);
        if(onRoad(x,z,roads,.6)||BUILDINGS.some(b=>{const pos=state.layout?.[b.id]||b;return Math.abs(x-pos.x)<b.w/2+1&&Math.abs(z-pos.z)<b.d/2+1;}))continue;
        decorations.push({type:'rock',x,z:z+(rand()-.5)*.65,size:.65+rand()*.55});
        if(rand()<.45)decorations.push({type:'flowers',x:x+side*.7,z:z+.4,variant:2,size:1});
      }
    }
    for(const z of BRIDGES)for(let i=-4;i<=4;i++){const u=i+4,last=i===4;decorations.push({type:'bridgeRail',x:riverX(z)+i,z:z-1.5,u,last,size:1},{type:'bridgeRail',x:riverX(z)+i,z:z+1.5,u,last,size:1});}
    for(const r of REGIONS.filter(r=>r.id!=='village')){decorations.push({type:'signpost',x:r.x-3,z:r.z+3,region:r,size:1});}
    decorations.push({type:'cave',x:52,z:-40,size:1.2},{type:'ruins',x:54,z:30,size:1},{type:'ruins',x:-17,z:39,size:1});
    for(let i=0;i<10;i++)decorations.push({type:'animal',x:13+rand()*8,z:12+rand()*7,variant:i%3,phase:rand()*6,size:1});
    for(let i=decorations.length-1;i>=0;i--){const d=decorations[i];if(['tree','cactus','outcrop','ruins','cave'].includes(d.type)&&!keepTallDecoration(d,roads,state.layout||{}))decorations.splice(i,1);}
    for(const a of ARENAS){for(let i=0;i<16;i++){const t=i*Math.PI/8;decorations.push({type:'rock',x:a.x+Math.cos(t)*a.rx,z:a.z+Math.sin(t)*a.rz,size:.42});}/* 空地外圈石頭改用岩石圖集 */decorations.push({type:'arenaFlag',x:a.x-a.rx-1,z:a.z,region:a,size:1});}
    for(let i=0;i<10;i++){const t=i*Math.PI/5,x=-8+Math.cos(t)*4.9,z=2+Math.sin(t)*4.5;if(!onRoad(x,z,roads,.7))decorations.push({type:'garden',x,z,size:1});}
    for(const [x,z,v] of [[-14,-2,0],[-11,-1,1],[-5,-1,2],[-2,1,0],[-15,7,1],[-5,8,2],[-13,11,0],[-4,12,1]]){
      if(!onRoad(x,z,roads,.7)&&!BUILDINGS.some(b=>{const q=state.layout?.[b.id]||b;return Math.abs(x-q.x)<b.w/2+1&&Math.abs(z-q.z)<b.d/2+1;}))decorations.push({type:'garden',x,z,variant:v,size:.72});
    }
    for(const[x,z]of[[-11.5,-1],[-4.5,-1],[-12,5.5],[-4.5,6.5],[-18,1],[-6,-9],[3,11]])if(!onRoad(x,z,roads,.15))decorations.push({type:'lamp',x,z,size:1});
    // 概念圖:村民在攤位、佈告欄、酒館前與廣場上走動閒聊;貓狗趴在路邊。
    {const front=(id,dx,dz)=>{const b=BUILDINGS.find(q=>q.id===id);if(!b||state.buildings?.[id]===0)return null;const q=state.layout?.[id]||b;return{x:q.x+dx,z:q.z+b.d/2+dz};};
     const spots=[['merchant',front('trading',-1.2,1.4)],['farmer',front('restaurant',1,1.3)],['maid',front('tavern',1.4,1.2)],['smith',front('forge',-1.3,1.3)],
       ['elder',{x:-12.2,z:5.6}],['child',{x:-4.8,z:-1.4}],['farmer',{x:-3.6,z:6.2}],['merchant',{x:-12.6,z:-.8}],['cat',front('inn',1.6,.8)],['dog',front('house',-1.5,1.1)],['dog',{x:-5.2,z:6.8}]];
     spots.forEach(([who,pt],i)=>{if(pt)decorations.push({type:'villager',who,x:pt.x,z:pt.z,phase:i*1.7,flip:i%2===1,size:1});});}
    // l0veyou yard 圖集:田邊稻草人/推車、牧場水槽/草捆、鐵匠鋪柴堆、酒館木箱、委託所寶箱、水井燈籠。
    // 位置用「看得到」求出來:不在路上、不壓建築、不被後畫的建築/樹冠/名牌蓋住(預設布局)。
    // 交易所四周全被旅館/治療所擋住,木箱改放酒館前。依建築的偏移會跟著搬屋走;落在路上或壓到建築就不放。
    {const rel=(id,dx,dz)=>{const b=BUILDINGS.find(q=>q.id===id);if(!b||state.buildings?.[id]===0)return null;const q=state.layout?.[id]||b;return{x:q.x+dx,z:q.z+dz};};
     const free=pt=>pt&&!onRoad(pt.x,pt.z,roads,.5)&&!BUILDINGS.some(b=>{const q=state.layout?.[b.id]||b;return Math.abs(pt.x-q.x)<b.w/2+.6&&Math.abs(pt.z-q.z)<b.d/2+.6;});
     for(const[type,pt,variant]of[['scarecrow',{x:-27.65,z:16.85},0],['wheelbarrow',{x:-24.5,z:19.95},1],['trough',{x:14.5,z:11},0],['hayBale',{x:19.8,z:11.6},0],
       ['firewood',rel('forge',4.65,1.3),0],['crates',rel('tavern',-.5,3.6),1],['chest',rel('bounty',3.45,-1.15),0],['lantern',{x:-9.75,z:21.1},0]])
       if(free(pt))decorations.push({type,x:pt.x,z:pt.z,variant,size:1});}
    // 概念圖:紀念碑本身已帶旗;另在南街入口兩側立藍底金邊村旗。
    for(const[x,z]of[[4.1,9.9],[-.1,14.1]])decorations.push({type:'villageBanner',x,z,size:.9});
    // 概念圖畫框內的樹照概念圖樹冠種(pipeline/scripts/align/concept_ground.py):先拿掉程序撒的樹,再放概念圖的。
    for(let i=decorations.length-1;i>=0;i--){const d=decorations[i];if(d.type==='tree'&&inConceptFrame(d.x,d.z))decorations.splice(i,1);}
    for(const[x,z,variant,size]of CONCEPT_TREES){
      if(onRoad(x,z,roads,.4)||arenaAt(x,z,1)||['ocean','river','ice','bridge'].includes(biomeAt(x,z)))continue;
      if(BUILDINGS.some(b=>{const q=state.layout?.[b.id]||b;return Math.abs(x-q.x)<b.w/2+.8&&Math.abs(z-q.z)<b.d/2+.8;}))continue;
      decorations.push({type:'tree',x,z,variant,size});}
    // 概念圖畫框內的家具、角色照概念圖擺(src/concept-props.js):先清掉程序擺的,再放概念圖的。結構物(柵欄、閘門、橋欄、紀念碑、岩石)不動。
    {const FURNITURE=new Set(['garden','lamp','villageBanner','villager','stall','barrels','chest','crates','hayBale','firewood','trough','scarecrow','lantern','wheelbarrow','animal','flowers','mushroom','bush']);
     for(let i=decorations.length-1;i>=0;i--){const d=decorations[i];if(FURNITURE.has(d.type)&&inConceptFrame(d.x,d.z))decorations.splice(i,1);}
     const blocked=(x,z)=>['ocean','river','ice','bridge'].includes(biomeAt(x,z))||BUILDINGS.some(b=>{const q=state.layout?.[b.id]||b;return Math.abs(x-q.x)<b.w/2+.2&&Math.abs(z-q.z)<b.d/2+.2;});
     for(const[type,u,v,o={}]of CONCEPT_PROPS){const{x,z}=conceptToWorld(u,v);if(!blocked(x,z))decorations.push({type,x,z,variant:o.f?1:0,size:o.s||1});}
     for(const[u1,v1,u2,v2]of CONCEPT_FENCES){const a=conceptToWorld(u1,v1),b=conceptToWorld(u2,v2),dx=b.x-a.x,dz=b.z-a.z,n=Math.max(1,Math.round(Math.hypot(dx,dz)/2));
       for(let i=0;i<n;i++){const t=(i+.5)/n,x=a.x+dx*t,z=a.z+dz*t;if(!blocked(x,z))decorations.push({type:'fenceRail',x,z,variant:Math.abs(dx)>Math.abs(dz)?1:0,size:1});}}
     CONCEPT_PEOPLE.forEach((q,i)=>{const{x,z}=conceptToWorld(q.u,q.v);if(blocked(x,z))return;
       const flip=q.flip??i%2===1;decorations.push(q.cls?{type:'npc',cls:q.cls,x,z,phase:i*1.3,flip,size:1}:{type:'villager',who:q.who,x,z,phase:i*1.7,flip,size:1});});}
    decorations.sort((a,b)=>a.x+a.z-b.x-b.z);
    buildVillageLayer();
  }
  // 村莊高解析地面層:概念圖畫框(x-z∈[-28.1,7.36]、x+z∈[-40.7,30.2])以 VRES px/單位重畫草/土路/石板,
  // 材質是概念圖像素(1 材質 px = 1/3.93 單位,跟概念圖同尺度)。大地面畫布只有 GROUND_RES,放大會糊。
  const VRES=GROUND_RES*2,VBOX={x0:-28.1*9,y0:-40.7*4.5,w:35.5*9,h:70.95*4.5};
  const villageLayer=makeCanvas(Math.ceil(VBOX.w*VRES),Math.ceil(VBOX.h*VRES)),vc=villageLayer.getContext('2d');let villageReady=false;
  function buildVillageLayer(){
    villageReady=false;if(!conceptTex.grass||!conceptTex.earth||!conceptTex.stone)return;
    vc.setTransform(1,0,0,1,0,0);vc.clearRect(0,0,villageLayer.width,villageLayer.height);
    vc.setTransform(VRES,0,0,VRES,-VBOX.x0*VRES,-VBOX.y0*VRES);vc.imageSmoothingEnabled=false;
    const cells={land:new Path2D(),e:new Path2D(),s:new Path2D()},h=.27;
    const add=(path,x,z)=>{const q=iso(x-h,z-h),r=iso(x+h,z-h),t=iso(x+h,z+h),u=iso(x-h,z+h);path.moveTo(q.x,q.y);path.lineTo(r.x,r.y);path.lineTo(t.x,t.y);path.lineTo(u.x,u.y);path.closePath();};
    for(let z=-24;z<26;z+=.5)for(let x=-28;x<9;x+=.5){const c=conceptGroundAt(x,z);if(c==='.'||!inConceptFrame(x,z))continue;
      if(['ocean','river','ice','bridge'].includes(biomeAt(x,z))||arenaAt(x,z))continue;
      add(cells.land,x,z);if(c==='e')add(cells.e,x,z);else if(c==='s')add(cells.s,x,z);}
    const fill=(path,img)=>{vc.save();vc.clip(path);const pat=vc.createPattern(img,'repeat');vc.scale(1/3.93,1/3.93);vc.fillStyle=pat;vc.fillRect(VBOX.x0*3.93,VBOX.y0*3.93,VBOX.w*3.93,VBOX.h*3.93);vc.restore();};
    fill(cells.land,conceptTex.grass);fill(cells.e,conceptTex.earth);
    vc.save();vc.translate(0,1.2);vc.fillStyle='rgba(120,95,80,.75)';vc.fill(cells.s);vc.restore();   // 石板外緣一圈灰縫色(概念圖廣場邊)
    fill(cells.s,conceptTex.stone);
    villageReady=true;
  }

  generateGround();

  function resize(){const r=canvas.getBoundingClientRect();const actualWidth=Math.max(320,Math.round(r.width||innerWidth)),actualHeight=Math.max(260,Math.round(r.height||innerHeight));canvas.width=actualWidth;canvas.height=actualHeight;width=actualWidth;height=actualHeight;buffer.width=width;buffer.height=height;for(const c of [shadowLayer,spriteLayer]){c.width=width;c.height=height;}screen.imageSmoothingEnabled=false;bg.imageSmoothingEnabled=false;sg.imageSmoothingEnabled=false;spg.imageSmoothingEnabled=false;const n=2*Math.max(.62,Math.min(1.18,width/1140,(height/2-56)/300));scale*=n/baseScale;baseScale=n;if(!lastSource){scale=n;lastSource=true;}}
  function screenPoint(x,z,y=0){const p=iso(x,z);return{x:Math.round(width/2+(p.x-cam.x)*scale),y:Math.round(height/2+50+(p.y-cam.y-y*8)*scale)};}
  function project(x,y=0,z=0){const p=screenPoint(x,z,y);return{x:p.x*canvas.width/width,y:p.y*canvas.height/height,visible:p.x>=0&&p.x<=width&&p.y>=0&&p.y<=height};}
  function unproject(clientX,clientY){const r=canvas.getBoundingClientRect(),sx=(clientX-r.left)*width/r.width,sy=(clientY-r.top)*height/r.height,ix=(sx-width/2)/scale+cam.x,iy=(sy-height/2-50)/scale+cam.y;return{x:(ix/PX+iy/PY)/2,z:(iy/PY-ix/PX)/2,sx,sy};}
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
    if(!bounds.length)return;
    const left=Math.min(...bounds.map(b=>b.left)),right=Math.max(...bounds.map(b=>b.right));
    const top=Math.min(...bounds.map(b=>b.top)),bottom=Math.max(...bounds.map(b=>b.bottom));
    const plaza=iso(-8,2),originY=height/2+62;
    const topMargin=(document.querySelector('#topbar')?.getBoundingClientRect().height||76)+16;
    const bottomMargin=(document.querySelector('#bottom-bar')?.getBoundingClientRect().height||94)+16;
    const room=(available,extent)=>available/Math.max(1,extent);
    scale=Math.max(.48,Math.min(baseScale,
      room(width/2-24,plaza.x-left),room(width/2-24,right-plaza.x),
      room(originY-topMargin,plaza.y-top),room(height-bottomMargin-originY,bottom-plaza.y)));
    target={x:plaza.x,y:plaza.y-12/scale};cam={...target};
  }
  function focus(id){let pos;if(id==='home'||!id){focusHome();return;}if(id==='world'){target={x:45,y:75};scale=Math.min(width/1750,(height-55)/910);return;}if(id.startsWith?.('region:'))pos=REGIONS.find(r=>r.id===id.slice(7));else if(id==='hunt')pos={x:17,z:3};else if(id.startsWith?.('hunter:'))pos=state.hunters?.find(h=>String(h.id)===id.slice(7));else pos=BUILDINGS.find(b=>b.id===id);if(pos){const override=state.layout?.[id];const p=iso(override?.x??pos.x,override?.z??pos.z);target={x:p.x,y:p.y+(id.startsWith?.('region:')?30:-25)};scale=Math.max(baseScale,Math.min(3.1,baseScale*1.28));}}
  function setSelected(id){selected=id;}
  function zoomBy(factor){homeFraming=false;scale=Math.max(.48,Math.min(5.4,scale*factor));}
  function placeMode(id){placing=id;canvas.style.cursor=id?'crosshair':'grab';}
  const clampCam=()=>{target.x=Math.max(-800,Math.min(925,target.x));target.y=Math.max(-370,Math.min(560,target.y));};
  function down(e){if(e.button!==undefined&&e.button!==0&&e.button!==1)return;canvas.setPointerCapture?.(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===2){const pts=[...pointers.values()];pinchDistance=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y);pointer=null;return;}pointer={id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,moved:false};canvas.style.cursor=placing?'crosshair':'grabbing';}
  function move(e){hover=unproject(e.clientX,e.clientY);if(pointers.has(e.pointerId))pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===2){const pts=[...pointers.values()],dist=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y);if(pinchDistance)zoomBy(dist/pinchDistance);pinchDistance=dist;return;}if(!pointer||pointer.id!==e.pointerId)return;const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;if(Math.hypot(e.clientX-pointer.startX,e.clientY-pointer.startY)>5)pointer.moved=true;target.x-=dx/scale;target.y-=dy/scale;cam={...target};clampCam();pointer.x=e.clientX;pointer.y=e.clientY;}
  function up(e){const p=pointer;pointers.delete(e.pointerId);pinchDistance=0;pointer=null;canvas.style.cursor=placing?'crosshair':'grab';if(!p||p.moved)return;const q=unproject(e.clientX,e.clientY);if(placing){onPlace(placing,Math.round(q.x*2)/2,Math.round(q.z*2)/2);return;}for(let i=hits.length-1;i>=0;i--){const hit=hits[i];if(q.sx>=hit.x&&q.sx<=hit.x+hit.w&&q.sy>=hit.y&&q.sy<=hit.y+hit.h){onSelect(hit.id);return;}}onSelect(null);}
  function wheel(e){e.preventDefault();const before=unproject(e.clientX,e.clientY);zoomBy(e.deltaY<0?1.1:1/1.1);const after=unproject(e.clientX,e.clientY),b=iso(before.x,before.z),a=iso(after.x,after.z);target.x+=b.x-a.x;target.y+=b.y-a.y;cam={...target};clampCam();}
  canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);canvas.addEventListener('wheel',wheel,{passive:false});canvas.style.cursor='grab';

  // 腳底接觸暗(很小、很貼地):真正的影子是 cast() 的剪影投影。
  function contact(p,w=5){g.fillStyle='#221a3a40';g.beginPath();g.ellipse(p.x-.6*scale,p.y,Math.max(2,w*scale),Math.max(1,w*.32*scale),0,0,Math.PI*2);g.fill();}
  function shadow(p,w=12,h=4,color='#304a3660'){g.fillStyle=color;g.beginPath();g.ellipse(p.x,p.y,Math.max(2,w*scale),Math.max(1,h*scale),0,0,Math.PI*2);g.fill();}
  // 投影:物件畫出去的同時把它的剪影影子畫進 shadowLayer。cap = 影子最長幾個世界單位(樹冠長、建築短)。
  const SHADOW_CAP={building:32,tree:58,char:40,prop:30},SHADOW_ALPHA=.56;
  function cast(img,sx,sy,sw,sh,dx,dy,dw,dh,flip=false,grounded=true,kind='prop'){
    if(!casting||!img||sw<2||sh<2||dw<2||dh<2)return;
    const wpp=2**(Math.round(Math.log2(dh/scale/sh)*8)/8),s=shadowFor(img,sx,sy,sw,sh,flip,wpp,grounded,SHADOW_CAP[kind]||30),k=dw/sw;
    sg.drawImage(s.cv,Math.round(dx-s.ex*k),Math.round(dy),Math.round(s.W*k),Math.round(s.H*k));
  }
  function drawSprite(sprite,p,w,h,offset=0,alpha=1,kind=null){const ww=Math.round(w*scale),hh=Math.round(h*scale);if(kind)cast(sprite,0,0,sprite.width,sprite.height,Math.round(p.x-ww/2),Math.round(p.y-hh+offset*scale),ww,hh,false,kind!=='building',kind);g.globalAlpha=alpha;g.drawImage(sprite,Math.round(p.x-ww/2),Math.round(p.y-hh+offset*scale),ww,hh);
    if(flashNext){g.globalAlpha=alpha*flashNext.alpha;g.drawImage(tinted(sprite,0,0,sprite.width,sprite.height,flashNext.color),Math.round(p.x-ww/2),Math.round(p.y-hh+offset*scale),ww,hh);}g.globalAlpha=1;return{x:p.x-ww/2,y:p.y-hh+offset*scale,w:ww,h:hh};}
  // 把圖集物件 contain 進「世界單位外框」並畫出。回傳 true = 畫成功。
  // contain 而不是拉伸:保持出土物件的等比,尺寸由外框決定(版面才不會跑掉)。
  // 平貼地面的不投影;寬的(圍籬、攤位、桌椅)每欄自己的地面;其他(人、樹、旗、燈)整張一個地面。
  const FLAT_DETAIL=new Set(['flowerYellow','flowerPink','flowerBlue','flowerWhite','plot','wheat','cabbage','garden']);
  const WIDE_DETAIL=new Set(['fenceRail','fence','stall','fruitStand','tableSet','bench','handCart','well','flowerBox','riverRocks','boulders','outcrop','cave','ruin','trough','crates','barrels','hayBale','firewood','sacks','railing','signpost']);
  const CHAR_DETAIL=new Set(['merchant','farmer','child','elder','smith','maid','cat','dog','sheep','goat']);
  function drawAtlasDetail(id,p,bw,bh,offset=0,alpha=1,flip=false){
    const lod=detailFrameFor(id,scale>=2.2);
    if(!lod)return false;
    const c=lod.frames[id];
    const rs=Math.min(bw*scale/c.w,bh*scale/c.h);
    const dw=Math.max(1,Math.round(c.w*rs)),dh=Math.max(1,Math.round(c.h*rs));
    if(lod.scale===2)detailUse.draw2x++;else detailUse.draw1x++;
    g.globalAlpha=alpha;
    const dx=Math.round(p.x-dw/2),dy=Math.round(p.y-dh+offset*scale);
    if(!FLAT_DETAIL.has(id))cast(lod.img,c.x,c.y,c.w,c.h,dx,dy,dw,dh,flip,!WIDE_DETAIL.has(id),TREE_ATLAS.includes(id)?'tree':CHAR_DETAIL.has(id)?'char':'prop');
    if(flip){g.save();g.translate(dx+dw,dy);g.scale(-1,1);g.drawImage(lod.img,c.x,c.y,c.w,c.h,0,0,dw,dh);g.restore();}
    else g.drawImage(lod.img,c.x,c.y,c.w,c.h,dx,dy,dw,dh);
    g.globalAlpha=1;
    return {x:dx,y:dy,w:dw,h:dh};
  }
  // 用「每來源像素」的統一倍率畫。不把寬度硬塞成固定值,所以寬一點的建築就真的寬一點。
  function drawAtlasBuilding(id,p,offset=0){
    const prefer2x=scale>=2.2;
    atlasUse.lastScale=scale;
    const lod=atlasFrameFor(id,prefer2x);
    if(!lod)return null;
    if(lod.scale===2)atlasUse.draw2x++;else atlasUse.draw1x++;
    const c=lod.frames[id];
    // lod.k 是「每來源像素多少世界單位」的倒數基準,要再乘回舊版的世界寬度 71,
  // 否則會畫成 1px 寬(漏乘就等於隱形 —— 踩過一次)。
  const k=BUILDING_WORLD_WIDTH*lod.k*(BUILDING_SCALE[id]||1);
    const dw=Math.max(1,Math.round(c.w*k*scale)),dh=Math.max(1,Math.round(c.h*k*scale));
    const dx=Math.round(p.x-dw/2),dy=Math.round(p.y-dh+offset*scale);
    cast(lod.img,c.x,c.y,c.w,c.h,dx,dy,dw,dh,false,false,'building');
    g.drawImage(lod.img,c.x,c.y,c.w,c.h,dx,dy,dw,dh);
    return {x:dx,y:dy,w:dw,h:dh};
  }
  function ring(p,w=18,color='#ffe795'){g.strokeStyle='#435041';g.lineWidth=3;g.beginPath();g.ellipse(p.x,p.y,w*scale,w*.43*scale,0,0,Math.PI*2);g.stroke();g.strokeStyle=color;g.lineWidth=1;g.stroke();}
  function textLabel(text,x,y,opts={}){if(casting){overlays.push(()=>textLabel(text,x,y,opts));return;}const {color='#fff7d9',size=7,back=true}=opts;if(document.body.dataset.artReview==='1')return;g.font=`bold ${size*2}px "Microsoft JhengHei", "Noto Sans TC", sans-serif`;g.textAlign='center';g.textBaseline='middle';const tw=Math.ceil(g.measureText(text).width);if(back){pixel(g,x-tw/2-5,y-10,tw+10,21,'#1c0e06cc');pixel(g,x-tw/2-4,y-9,tw+8,19,'#4a2611e6');pixel(g,x-tw/2-4,y-9,tw+8,2,'#8a5530e6');pixel(g,x-tw/2-3,y+9,tw+6,1,'#dab247aa');}g.fillStyle='#1c0e06';g.fillText(text,Math.round(x),Math.round(y+1));g.fillStyle=color;g.fillText(text,Math.round(x),Math.round(y));}
  // 物件那一輪(casting)裡畫的血條、名牌延後到最上層:不會被後畫的魔物、樹蓋住。
  const overlays=[];
  function bar(x,y,w,frac,color){if(casting){overlays.push(()=>bar(x,y,w,frac,color));return;}pixel(g,x-1,y-1,w+2,6,'#1c0e06dd');pixel(g,x,y,w,4,'#5a2f14');pixel(g,x,y,Math.max(0,w*Math.min(1,frac)),4,color);pixel(g,x,y,Math.max(0,w*Math.min(1,frac)),2,shade(color,25));}
  function getLevel(id){const level=state.buildings?.[id];return typeof level==='number'?level:level?.level??1;}

  const SPRITE_SHIFT={tavern:[10,18]};
  function drawBuilding(b){const layout=state.layout?.[b.id]||b;let p=screenPoint(layout.x,layout.z);const level=getLevel(b.id),s=selected===b.id;
    if(s)ring(p,31,'#ffdc7b');
    if(!level){
      // 空地:l0veyou 的施工地基(石基、木樁、繩子、木板堆),取代虛線菱形。
      if(drawAtlasDetail('plot',p,52,40,10)){textLabel(b.name,p.x,p.y+13*scale,{color:'#dfd6b7'});hits.push({id:b.id,x:p.x-26*scale,y:p.y-30*scale,w:52*scale,h:42*scale});return;}
      procUse['plot']=(procUse['plot']||0)+1;
      const r=24*scale;polygon(g,[[p.x-r,p.y],[p.x,p.y-r*.5],[p.x+r,p.y],[p.x,p.y+r*.5]],'#716b4f99');g.strokeStyle='#c6bc90';g.lineWidth=1;g.setLineDash([3,2]);g.beginPath();g.moveTo(p.x-r,p.y);g.lineTo(p.x,p.y-r*.5);g.lineTo(p.x+r,p.y);g.lineTo(p.x,p.y+r*.5);g.closePath();g.stroke();g.setLineDash([]);textLabel('+',p.x,p.y-7,{size:16,color:'#f1dfab',back:false});textLabel(b.name,p.x,p.y+13,{color:'#dfd6b7'});hits.push({id:b.id,x:p.x-r,y:p.y-r*.6,w:r*2,h:r*1.5});return;
    }
    const conceptSprite=atlasCell(b.id);
    const conceptWidth=conceptBuildingWidth(b.id);
    // 酒館 v3 連露台:圖往右下畫(露台在佔地前方),對齊概念圖左下的酒館;佔地與道路不變。
    const sh=SPRITE_SHIFT[b.id];if(sh)p={x:p.x+sh[0]*scale,y:p.y+sh[1]*scale};
    // 影子:剪影投影(往左下),取代舊的腳下大橢圓——概念圖沒有大片暗橢圓。
    let rect=conceptSprite?drawSprite(conceptSprite,p,conceptWidth,conceptWidth*conceptSprite.height/conceptSprite.width,9,1,'building'):drawAtlasBuilding(b.id,p,9);
    if(!rect){const sprite=atlasCell(b.id)||buildingSprite(b.id),w=conceptBuildingWidth(b.id);rect=drawSprite(sprite,p,w,w*sprite.height/sprite.width,9,1,'building');}
    // 下面冒煙那段用的是「世界單位」的高度(會再乘 scale),照舊版語意換算回去。
    const h=rect.h/scale;hits.push({id:b.id,...rect});
    // Smoke is made from individual four-pixel clusters and never blurs the art.
    if(!conceptSprite&&['forge','enhancement','restaurant','inn','hall'].includes(b.id)){
      for(let i=0;i<3;i++){const t=(elapsed*.3+i*.33)%1,xx=p.x+(18+t*5)*scale,yy=p.y+(-h+12-t*22)*scale;g.globalAlpha=(1-t)*.4;pixel(g,xx,yy,Math.max(2,4*scale),Math.max(2,3*scale),'#e5dfc8');pixel(g,xx+1,yy-1,Math.max(2,2*scale),1,'#f7ecd5');g.globalAlpha=1;}
    }
    if(scale>1.12||s)uiLabels.push({text:`${b.name} Lv.${level}`,x:p.x,y:p.y+10*scale,color:s?'#ffe195':'#fff5d1'});
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
    villageBanner:['villageBanner',12,20,1],arenaFlag:['arenaFlag',11,19,1],gate:['gate',12,19,1],stall:['stall',30,22,2],barrels:['barrels',12,11,1],
    // yard 圖集:以人物 12.6、木桶堆 11、路燈 15 為尺。
    chest:['chest',8,7,1],crates:['crates',8,10,1],hayBale:['hayBale',9,9,1],firewood:['firewood',9,8,1],
    trough:['trough',11,9,1],scarecrow:['scarecrow',11,14,1],lantern:['lantern',8,15,1],wheelbarrow:['wheelbarrow',11,9,1],
    // town/town2 圖集(概念圖道具):尺寸照概念圖量(K=3.93 px/單位)。圍籬一段 2 格,底部偏移 4.5(下端柱腳在中點下方)。
    archeryTarget:['archeryTarget',15,19,1],dummy:['dummy',10,15,1],weaponRack:['weaponRack',14,18,1],anvilStump:['anvilStump',10,9,1],
    tableSet:['tableSet',20,16,1],bench:['bench',16,10,1],handCart:['handCart',16,13,1],flowerBox:['flowerBox',12,10,1],
    purpleBanner:['purpleBanner',9,30,1],fenceRail:['fenceRail',18,18,4.5],fruitStand:['fruitStand',22,26,1],sacks:['sacks',11,11,1],
    barrel:['barrel',6,8,1],bucket:['bucket',5,6,1],flowerBush:['flowerBush',12,11,1],riverRocks:['riverRocks',14,11,1]};
  // 驗收用:每一個畫面上的裝飾都該來自圖集/概念圖素材。退回程序繪製就記在 procUse,
  // __mistvaleDetails().proc 應該是空物件。
  function drawDecoration(d){const p=screenPoint(d.x,d.z);if(p.x<-100||p.x>width+100||p.y<-70||p.y>height+260)return;
    const before=detailUse.draw1x+detailUse.draw2x;drawDecorationArt(d,p);
    if(detailUse.draw1x+detailUse.draw2x===before&&!(d.type==='monument'&&atlasCell('monument')))procUse[d.type]=(procUse[d.type]||0)+1;}
  function drawDecorationArt(d,p){
    const prop=PROP_ATLAS[d.type];
    if(prop){const k=d.size||1;if(drawAtlasDetail(prop[0],p,prop[1]*k,prop[2]*k,prop[3],1,(d.variant||0)%2===1&&d.type!=='gate')){
      if(d.type==='arenaFlag'&&scale>.6)uiLabels.push({text:d.region.name+' · 戰鬥空地',x:p.x,y:p.y-26*scale,color:'#f1dd9e'});
      return;}}
    if(d.type==='flowers'&&drawAtlasDetail(FLOWER_ATLAS[(d.variant||0)%4],p,9*(d.size||1),7*(d.size||1),1,1,(d.variant||0)>=4))return;
    if((d.type==='wheat'||d.type==='cabbage')&&drawAtlasDetail(d.type,p,d.type==='wheat'?9:10,d.type==='wheat'?9:7,1,1,(d.variant||0)%2===1))return;
    if(d.type==='wheat'){for(let i=-1;i<=1;i++){const xx=p.x+i*2*scale;pixel(g,xx,p.y-5*scale,scale,6*scale,'#ba973d');pixel(g,xx-scale,p.y-5*scale,3*scale,scale,'#eac665');pixel(g,xx,p.y-7*scale,scale,2*scale,'#f1dc8e');}return;}
    if(d.type==='cabbage'){pixel(g,p.x-3*scale,p.y-4*scale,7*scale,4*scale,'#4f8a3c');pixel(g,p.x-2*scale,p.y-5*scale,5*scale,3*scale,'#9cc964');return;}
    if(d.type==='bridgeRail'&&d.u!==undefined&&drawRailSlice(d.u,d.last,p))return;
    // 概念圖街上滿是村民與貓狗:純裝飾(不參與模擬),原地輕微上下呼吸。
    if(d.type==='npc'){const bob=Math.sin(elapsed*2.1+d.phase)>.55?1:0,hf=heroFrameFor(d.cls,heroLodScale);contact(p,5);
      {const sp=heroSprite(d.cls,bob,d.flip?-1:1,Math.floor(d.phase*7)%3);drawSprite(sp,p,21*CHAR_SCALE*sp.width/sp.height,21*CHAR_SCALE,1.2,1,'char');};if(hf)detailUse.draw1x++;return;}
    if(d.type==='villager'){const pet=d.who==='cat'||d.who==='dog',bob=Math.sin(elapsed*2.2+d.phase)>.4?1:0,k=CHAR_SCALE;contact(p,pet?4:5);
      const kid=d.who==='child';if(drawAtlasDetail(d.who,p,(pet?10:kid?13:15)*k,(pet?9:kid?16.5:20)*k,1.2-bob*.4,1,d.flip))return;  // 村民跟英雄同一批風格、同像素密度;小孩矮一截
      pixel(g,p.x-3*scale,p.y-14*scale,6*scale,12*scale,'#8a6a48');pixel(g,p.x-2*scale,p.y-18*scale,4*scale,4*scale,'#f0c9a0');return;}
    if(d.type==='animal'&&detailFrameFor('sheep')){const goat=d.variant===1,bob=Math.sin(elapsed*2+d.phase)>0?1:0;contact(p,4);
      if(drawAtlasDetail(goat?'goat':'sheep',p,goat?9.5:10,goat?10:8.5,.6-bob*.4,1,Math.sin(elapsed*.21+d.phase*3)<0)){return;}}
    if(d.type==='monument'){const sp=atlasCell('monument')||buildingSprite('fountain');drawSprite(sp,p,68,68*sp.height/sp.width,8,1,'building');return;}
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
    if(d.type==='tree'&&!drawAtlasDetail(TREE_ATLAS[(d.variant||0)%4],p,50*d.size,72*d.size,4,([...(state.hunters||[]),...(state.enemies||[])].some(a=>a.hp>0&&a.x+a.z<d.x+d.z+.2&&canopyObscures(d.x,d.z,d.size,a.x,a.z,4))?.18:1))){drawSprite(treeCanvases[d.variant],p,50*d.size,72*d.size,4,1,'tree');return;}
    if(d.type==='arenaFlag'){const ss=scale;pixel(g,p.x,p.y-26*ss,2*ss,28*ss,'#664b31');pixel(g,p.x+2*ss,p.y-25*ss,12*ss,12*ss,'#954f45');pixel(g,p.x+4*ss,p.y-22*ss,7*ss,2*ss,'#ead08c');if(scale>.6)uiLabels.push({text:d.region.name+' · 戰鬥空地',x:p.x,y:p.y-35*ss,color:'#f1dd9e'});return;}
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
        if(d.type==='cave')textLabel('鐵脊礦坑',p.x,p.y+16*scale,{color:'#e3d5b0'});
        return;}
      const s=scale*d.size,hh=hh0;polygon(g,[[p.x-19*s,p.y],[p.x-17*s,p.y-hh*s],[p.x+8*s,p.y-(hh+5)*s],[p.x+22*s,p.y-12*s],[p.x+20*s,p.y+7*s],[p.x-6*s,p.y+10*s]],'#565e5e');polygon(g,[[p.x-17*s,p.y-hh*s],[p.x+8*s,p.y-(hh+5)*s],[p.x+19*s,p.y-12*s],[p.x-5*s,p.y-4*s]],'#a5aba1');for(let i=0;i<5;i++)pixel(g,p.x-(12-i*5)*s,p.y-(hh-5-i%2*4)*s,4*s,2*s,i%2?'#c2bcb0':'#8f958c');if(d.type==='cave'){pixel(g,p.x-9*s,p.y-24*s,19*s,25*s,'#343e40');pixel(g,p.x-6*s,p.y-21*s,13*s,23*s,'#1d2930');pixel(g,p.x-15*s,p.y-16*s,3*s,5*s,'#e6a94c');pixel(g,p.x+15*s,p.y-15*s,3*s,5*s,'#ffd574');textLabel('鐵脊礦坑',p.x,p.y+16*s,{color:'#e3d5b0'});}else if(d.type==='ruins'){pixel(g,p.x-13*s,p.y-31*s,6*s,28*s,'#c3b489');pixel(g,p.x+8*s,p.y-26*s,6*s,29*s,'#a7a780');pixel(g,p.x-5*s,p.y-15*s,8*s,2*s,'#617b53');}else{pixel(g,p.x+4*s,p.y-11*s,3*s,3*s,'#ba8c66');pixel(g,p.x-8*s,p.y-9*s,3*s,2*s,'#d3a47a');}return;}
    if(d.type==='bridgeRail'){
      const s=scale;pixel(g,p.x-s,p.y-10*s,4*s,12*s,'#49362a');pixel(g,p.x,p.y-9*s,2*s,10*s,'#b08654');
      pixel(g,p.x-s,p.y-11*s,4*s,2*s,'#d1ab73');pixel(g,p.x-s,p.y-4*s,4*s,s,'#5a5146');
      line(g,p.x-5*s,p.y-7*s,p.x+5*s,p.y-3*s,'#61442e',3*s);
      line(g,p.x-5*s,p.y-8*s,p.x+5*s,p.y-4*s,'#c69d65',s);return;
    }
    if(d.type==='signpost'){
      if(!drawAtlasDetail('signpost',p,13,16)){const s=scale;pixel(g,p.x,p.y-18*s,2*s,19*s,'#624a31');pixel(g,p.x-7*s,p.y-21*s,17*s,8*s,'#48392b');pixel(g,p.x-6*s,p.y-20*s,15*s,6*s,'#c4a66c');pixel(g,p.x-3*s,p.y-18*s,9*s,s,'#79613c');}
      if(scale>1.3)textLabel(d.region.name,p.x,p.y-22*scale,{color:'#f7e6b2',size:7});return;
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
      const s=scale;pixel(g,p.x-3*s,p.y-28*s,6*s,30*s,'#574733');pixel(g,p.x-2*s,p.y-27*s,3*s,28*s,'#b0935e');
      polygon(g,[[p.x-5*s,p.y-23*s],[p.x,p.y-35*s],[p.x+5*s,p.y-23*s]],'#595a4a');
      pixel(g,p.x-3*s,p.y-12*s,6*s,2*s,'#554c42');pixel(g,p.x-3*s,p.y-24*s,6*s,2*s,'#554c42');
      pixel(g,p.x+3*s,p.y-27*s,12*s,2*s,'#dfb653');pixel(g,p.x+3*s,p.y-25*s,10*s,14*s,'#244b87');
      pixel(g,p.x+4*s,p.y-24*s,2*s,12*s,'#3b77b0');
      line(g,p.x+8*s,p.y-23*s,p.x+8*s,p.y-14*s,'#eee6c9',s);
      line(g,p.x+5*s,p.y-22*s,p.x+11*s,p.y-17*s,'#eee6c9',s);
      line(g,p.x+11*s,p.y-22*s,p.x+5*s,p.y-17*s,'#eee6c9',s);return;
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
  function screenDir(fx,fz,tx,tz){const dx=(tx-fx-(tz-fz))*PX,dy=(tx-fx+(tz-fz))*PY,l=Math.hypot(dx,dy)||1;return{x:dx/l,y:dy/l};}
  function combatPose(a,isEnemy,target){
    const t=state.time||0,out={pose:'idle',ox:0,oy:0,lean:0,sx:1,sy:1,flash:0,flashColor:'#ffffff',face:0,k:0};
    const atk=t-(a.atkAt??-99),hit=t-(a.hitAt??-99),engaged=isEnemy?a.engaged:a.status==='戰鬥中';
    const ranged=!isEnemy&&(a.classId==='ranger'||a.classId==='sorcerer'||a.classId==='priest');
    const tx=target?.x??(isEnemy?a.facingX:null),tz=target?.z??(isEnemy?a.facingZ:null);
    if(atk>=0&&atk<.36&&a.atkX!=null){const d=screenDir(a.x,a.z,a.atkX,a.atkZ);out.face=d.x;out.pose='strike';
      if(ranged){const k=atk<.06?atk/.06:Math.max(0,1-(atk-.06)/.3);out.k=k;out.ox=-d.x*1.8*k;out.oy=-d.y*.9*k;out.lean=-d.x*.1*k;}
      else{const reach=isEnemy?(a.type==='boss'?8:a.type==='wolf'?7:5):5.5,k=atk<.07?ease(atk/.07):Math.max(0,1-(atk-.07)/.29);out.k=k;
        out.ox=d.x*reach*k;out.oy=d.y*reach*.7*k;out.lean=d.x*.24*k;out.sx=1+.07*k;out.sy=1-.06*k;
        if(isEnemy&&a.type==='slime')out.oy-=7*Math.sin(Math.min(1,atk/.22)*Math.PI);
        if(isEnemy&&a.type==='wolf')out.oy-=3.5*Math.sin(Math.min(1,atk/.2)*Math.PI);}
    }else if(engaged&&tx!=null&&(a.attackTimer??9)<.3){const d=screenDir(a.x,a.z,tx,tz),k=ease(1-Math.max(0,a.attackTimer)/.3);out.face=d.x;out.pose='windup';out.k=k;
      out.ox=-d.x*2*k;out.oy=-d.y*k;out.lean=-d.x*.16*k;out.sx=1+.05*k;out.sy=1-.08*k;}
    else if(engaged&&tx!=null)out.face=screenDir(a.x,a.z,tx,tz).x;
    if(hit>=0&&hit<.32&&a.hitFromX!=null){const d=screenDir(a.hitFromX,a.hitFromZ,a.x,a.z),k=hit<.05?hit/.05:Math.max(0,1-(hit-.05)/.27);
      out.ox+=d.x*3.2*k+Math.sin(hit*95)*.9*k;out.oy+=d.y*1.6*k;out.lean+=d.x*.14*k;if(out.pose!=='strike')out.pose='hurt';
      out.flash=hit<.14?1-hit/.14:0;out.flashColor=isEnemy?'#ffffff':'#ff6a52';}
    return out;
  }
  // 受擊閃光:同剪影上色(快取),drawSprite/drawAtlasMonster 畫完本體後疊上去。
  let flashNext=null;
  const tintCache=new WeakMap();
  function tinted(img,sx,sy,sw,sh,color){let m=tintCache.get(img);if(!m){m=new Map();tintCache.set(img,m);}const key=`${sx},${sy},${sw},${sh},${color}`;let c=m.get(key);if(c)return c;
    c=makeCanvas(sw,sh);const x=c.getContext('2d');x.drawImage(img,sx,sy,sw,sh,0,0,sw,sh);x.globalCompositeOperation='source-in';x.fillStyle=color;x.fillRect(0,0,sw,sh);m.set(key,c);return c;}
  // 以腳底為軸剪切(前傾/後仰)與縮放;影子(cast)跟著位移但不跟著傾斜。
  function posed(p,pose,draw){const q={x:Math.round(p.x+pose.ox*scale),y:Math.round(p.y+pose.oy*scale)};g.save();g.translate(q.x,q.y);g.transform(pose.sx,0,-pose.lean,pose.sy,0,0);g.translate(-q.x,-q.y);
    if(pose.flash>0)flashNext={color:pose.flashColor,alpha:Math.min(1,pose.flash*.9)};try{return draw(q);}finally{flashNext=null;g.restore();}}
  // 蓄力時武器/法杖上的光點:近戰一閃、法系聚光。
  function chargeGlow(h,p,pose,facing){if(pose.pose!=='windup'||!quality)return;const s=scale,k=pose.k,caster=h.classId==='sorcerer'||h.classId==='priest';
    const x=p.x+(pose.ox+facing*(caster?8:-6))*s,y=p.y+(pose.oy-(caster?17:19))*s,col=h.classId==='sorcerer'?'#d9a8ff':h.classId==='priest'?'#ffe9a0':h.classId==='ranger'?'#e8f2c0':'#fff4c8';
    g.save();g.globalAlpha=.25+.55*k;g.fillStyle=col;const r=(caster?2+3*k:1+2*k)*s;g.beginPath();g.arc(x,y,r,0,Math.PI*2);g.fill();
    g.globalAlpha=.9*k;pixel(g,x-r*1.6,y-.5*s,r*3.2,Math.max(1,s),'#ffffff');pixel(g,x-.5*s,y-r*1.6,Math.max(1,s),r*3.2,'#ffffff');
    if(caster)for(let i=0;i<4;i++){const an=i*1.57+elapsed*6,rr=(7-5*k)*s;pixel(g,x+Math.cos(an)*rr,y+Math.sin(an)*rr*.6,Math.max(1,s),Math.max(1,s),col);}
    g.restore();}

  function ghostHunter(h){if(!(h.hp>0)||h.status!=='戰鬥中'||!Number.isFinite(h.x))return;const p=screenPoint(h.x,h.z);if(p.x<-40||p.x>width+40||p.y<-40||p.y>height+60)return;
    const target=h.targetId?(state.enemies||[]).find(e=>e.id===h.targetId&&e.hp>0):null,pose={...combatPose(h,false,target),flash:0},facing=previousPositions.get(h.id)?.facing||1;
    const sprite=heroSprite(h.classId,0,facing,hash(h.id)%3,heroLodScale,pose.pose);posed(p,pose,q=>drawSprite(sprite,q,21*CHAR_SCALE*sprite.width/sprite.height,21*CHAR_SCALE,1.2,.38));}
  function drawHunter(h){if(!Number.isFinite(h.x)||!Number.isFinite(h.z))return;const p=screenPoint(h.x,h.z),old=previousPositions.get(h.id),moving=old&&Math.hypot(h.x-old.x,h.z-old.z)>.005;let facing=old?.facing||1;if(old&&Math.abs(h.x-old.x-(h.z-old.z))>.002)facing=h.x-old.x-(h.z-old.z)>0?1:-1;
    const isSelected=selected===`hunter:${h.id}`;
    contact(p,5);if(isSelected)ring(p,8,'#fff1b0');
    if(h.dead||h.hp<=0){previousPositions.set(h.id,{x:h.x,z:h.z,facing});g.save();g.translate(p.x,p.y-3*scale);g.rotate(Math.PI/2);g.globalAlpha=.55;{const sp=heroSprite(h.classId,0,facing,hash(h.id)%3),dw=21*sp.width/sp.height;g.drawImage(sp,-dw/2*scale*CHAR_SCALE,-12*scale*CHAR_SCALE,dw*scale*CHAR_SCALE,21*scale*CHAR_SCALE);}g.restore();textLabel('✦',p.x,p.y-15*scale,{color:'#e7d8ef',back:false});return;}
    const target=h.status==='戰鬥中'&&h.targetId?(state.enemies||[]).find(e=>e.id===h.targetId&&e.hp>0):null,pose=combatPose(h,false,target);
    if(pose.face)facing=pose.face>0?1:-1;previousPositions.set(h.id,{x:h.x,z:h.z,facing});
    const frame=moving&&pose.pose==='idle'?Math.floor(elapsed*7+hash(h.id)%5)%2:0;
    const sprite=heroSprite(h.classId,frame,facing,hash(h.id)%3,heroLodScale,pose.pose),rect=posed(p,pose,q=>drawSprite(sprite,q,21*CHAR_SCALE*sprite.width/sprite.height,21*CHAR_SCALE,1.2,1,'char'));hits.push({id:`hunter:${h.id}`,...padHit(rect,14,18)});  // 圖變小,點擊範圍保底
    chargeGlow(h,p,pose,facing);
    const full=(h.hp??1)/(h.maxHp||1);if(full<.99||isSelected||h.status==='戰鬥中')bar(p.x-7*scale,p.y-24*scale,14*scale,full,full<.35?'#df795c':'#84bf6a');
    if(isSelected)textLabel(`${h.name||'獵人'} Lv.${h.level||1}`,p.x,p.y-31*scale,{color:RARITIES.find(r=>r.id===h.rarity)?.color||'#ffe19a'});
    if(!isSelected&&scale>.65){let symbol='';if(h.status?.includes('治療')||h.status?.includes('休養'))symbol='+';else if(h.status?.includes('休息')||h.status?.includes('旅館'))symbol='z';else if(h.status?.includes('用餐'))symbol='♥';else if(h.status?.includes('飲用'))symbol='♪';else if(h.status?.includes('訓練'))symbol='↑';else if(h.status?.includes('交易'))symbol='$';if(symbol)textLabel(symbol,p.x+6*scale,p.y-24*scale-Math.sin(elapsed*3)*1.3,{size:8,color:'#f7e1a0'});}
  }
  // 橋欄:flora 的 railing 是「正面欄杆接成長條再剪切成等角斜向」的一整條。
  // 每個 bridgeRail 裝飾只畫長條上屬於自己那一格(u)的切片;最後一根(last)只畫柱子。
  // 欄杆高 12 世界像素;切片寬 = 一格世界單位(螢幕 9:4.5),剛好對上剪切斜率 0.5。
  function drawRailSlice(u,last,p){
    const lod=detailFrameFor('railing',scale>=2.2),c=lod?.frames.railing;if(!c?.frontH)return false;
    const k=12*scale/c.frontH,uw=9*scale/k,half=c.postW/2;
    const a=last?0:u*uw,w=last?c.postW:Math.min(uw+1,c.w-u*uw);if(w<=0)return false;
    const anchor=a+half;
    g.drawImage(lod.img,c.x+a,c.y,w,c.h,Math.round(p.x-half*k),Math.round(p.y-(c.frontH+anchor*.5)*k),Math.max(1,Math.round(w*k)),Math.round(c.h*k));
    if(lod.scale===2)detailUse.draw2x++;else detailUse.draw1x++;
    return true;
  }
  // 魔物圖集(l0veyou 生):各格大小不同,倍率一律以第 0 格算,動畫才不會忽大忽小。
  // frame:0 待機、1 蓄力(狼伏低、魔像舉拳、領主怒吼)、2 出手(有攻擊圖集才有,沒有退回 1)。
  function drawAtlasMonster(type,frame,p,sz,flip,alpha=1){
    let id=type+frame,lod=detailFrameFor(id,scale>=2.2);if(!lod&&frame===2){id=type+'1';lod=detailFrameFor(id,scale>=2.2);}
    const ref=lod?.frames[type+'0'];if(!lod||!ref)return null;
    const c=lod.frames[id],rs=sz*scale/Math.max(ref.w,ref.h),dw=Math.max(1,Math.round(c.w*rs)),dh=Math.max(1,Math.round(c.h*rs));
    const dx=Math.round(p.x-dw/2),dy=Math.round(p.y-dh+2*scale);
    cast(lod.img,c.x,c.y,c.w,c.h,dx,dy,dw,dh,flip,true,'char');
    const fl=flashNext,ga=g.globalAlpha;g.globalAlpha=ga*alpha;
    const put=(img,sx,sy,sw,sh)=>{if(flip){g.save();g.translate(dx+dw,dy);g.scale(-1,1);g.drawImage(img,sx,sy,sw,sh,0,0,dw,dh);g.restore();}else g.drawImage(img,sx,sy,sw,sh,dx,dy,dw,dh);};
    put(lod.img,c.x,c.y,c.w,c.h);
    if(fl){g.globalAlpha=ga*alpha*fl.alpha;put(tinted(lod.img,c.x,c.y,c.w,c.h,fl.color),0,0,c.w,c.h);}
    g.globalAlpha=ga;
    return {x:dx,y:dy,w:dw,h:dh};
  }
  const ENEMY_SIZE=type=>type==='boss'?50:(type==='golem'?33:type==='wolf'?31:28)*CHAR_SCALE;
  function drawEnemy(e){if(!Number.isFinite(e.x)||!Number.isFinite(e.z)||e.hp<=0)return;const p=screenPoint(e.x,e.z),boss=e.type==='boss',sz=ENEMY_SIZE(e.type),seed=hash(e.id)%97;
    const old=previousPositions.get('enemy:'+e.id),moving=old&&Math.hypot(e.x-old.x,e.z-old.z)>.003,pose=combatPose(e,true,null);
    let flip=old?(e.x-old.x-(e.z-old.z)<-.002?true:e.x-old.x-(e.z-old.z)>.002?false:old.flip):false;if(pose.face)flip=pose.face<0;
    previousPositions.set('enemy:'+e.id,{x:e.x,z:e.z,flip});
    // 待機呼吸(史萊姆 Q 彈)、移動時跳步;攻擊/受擊的位移疊在上面。
    const breathe=Math.sin(elapsed*(e.type==='slime'?5:3)+seed),amp=e.type==='slime'?.07:.025;pose.sy*=1+amp*breathe;pose.sx*=1-amp*.6*breathe;
    if(moving&&pose.pose==='idle')pose.oy-=Math.abs(Math.sin(elapsed*(e.type==='wolf'?11:7)+seed))*(e.type==='slime'?3:e.type==='wolf'?1.8:1);
    const frame=pose.pose==='strike'?2:pose.pose==='windup'?1:0;
    // 被獵人鎖定:腳下紅色目標圈(誰在打誰一眼看得出來)。
    const targeted=(state.hunters||[]).some(h=>h.targetId===e.id&&h.status==='戰鬥中');
    if(targeted){const r=(boss?15:9)*scale,pulse=1+.06*Math.sin(elapsed*6);g.save();g.strokeStyle='#2a0d0a99';g.lineWidth=Math.max(2,scale*1.4);g.beginPath();g.ellipse(p.x,p.y+scale,r*pulse,r*.42*pulse,0,0,Math.PI*2);g.stroke();
      g.strokeStyle='#ff7a55d0';g.lineWidth=Math.max(1,scale*.7);g.setLineDash([3*scale,2*scale]);g.lineDashOffset=-elapsed*8*scale;g.stroke();g.setLineDash([]);g.restore();}
    contact(p,boss?12:7);
    const rect=posed(p,pose,q=>drawAtlasMonster(e.type,frame,q,sz,flip));
    if(!rect){procUse['enemy:'+e.type]=(procUse['enemy:'+e.type]||0)+1;posed(p,pose,q=>drawSprite(enemySprite(e.type,frame%2),q,sz,sz,2,1,'char'));}
    if(e.hp<e.maxHp||boss||targeted){bar(p.x-(boss?17:10)*scale,p.y-(sz+3)*scale,(boss?34:20)*scale,e.hp/(e.maxHp||1),boss?'#d27967':'#c68764');if(boss)textLabel('森林領主',p.x,p.y-(sz+11)*scale,{color:'#ffcc97'});}}

  // ── 戰鬥特效 ──────────────────────────────────────────────────────────
  // 時間軸:effect 生出來就是「出手」;e.delay 秒後才「命中」(箭/法球飛行中),命中後才有斬痕、火花、數字。
  // 圖集特效:l0veyou vfx(斬擊、法球、治療、星、命中、閃光)與 icons 的箭;粒子是程序像素(不算退回)。
  const FX_SPRITE={slash:'fxSlash',heal:'fxHeal',level:'fxStar',victory:'fxStar',harvest:'fxStar',rally:'fxStar',recruit:'fxStar',purchase:'fxStar',upgrade:'fxSparkle',hit:'fxHit'};
  function fxSprite(id,x,y,size,{rot=0,flip=false,alpha=1,sy=1}={}){const lod=detailFrameFor(id,size*scale>=40);if(!lod)return false;const c=lod.frames[id],k=size*scale/Math.max(c.w,c.h);
    g.save();g.globalAlpha=alpha;g.translate(Math.round(x),Math.round(y));if(rot)g.rotate(rot);g.scale(flip?-1:1,sy);g.drawImage(lod.img,c.x,c.y,c.w,c.h,-c.w*k/2,-c.h*k/2,c.w*k,c.h*k);g.restore();
    if(lod.scale===2)detailUse.draw2x++;else detailUse.draw1x++;return true;}
  // 命中火花:幾顆像素往外噴、受重力落下。
  function sparks(x,y,age,seed,n,cols,speed=26){if(age>.45)return;const s=scale,r=rnd(seed);for(let i=0;i<n;i++){const an=r()*Math.PI*2,v=(.5+r())*speed,px=x+Math.cos(an)*v*age*s,py=y+(Math.sin(an)*v*.6*age+60*age*age)*s,sz=Math.max(1,Math.round((r()<.3?2:1)*s));
    g.globalAlpha=Math.max(0,1-age/.45);pixel(g,px,py,sz,sz,cols[i%cols.length]);}g.globalAlpha=1;}
  function drawProjectile(e,u,p){const s=scale,a=screenPoint(e.sourceX??e.x,e.sourceZ??e.z),lob=e.type==='arrow'?Math.sin(u*Math.PI)*5:Math.sin(u*Math.PI)*2;
    const at=v=>({x:a.x+(p.x-a.x)*v,y:a.y+(p.y-a.y)*v-(12+(e.type==='arrow'?lob:lob))*s});const q=at(u);
    if(e.type==='arrow'){const prev=at(Math.max(0,u-.12)),ang=Math.atan2(q.y-prev.y,q.x-prev.x);
      g.save();g.globalAlpha=.55;g.strokeStyle='#fff6d8';g.lineWidth=Math.max(1,s*.8);g.beginPath();g.moveTo(prev.x,prev.y);g.lineTo(q.x,q.y);g.stroke();g.restore();
      if(!fxSprite('arrow',q.x,q.y,13,{rot:ang+Math.PI/4})){line(g,q.x-Math.cos(ang)*6*s,q.y-Math.sin(ang)*6*s,q.x,q.y,'#513e2e',2*s);}return;}
    if(e.type==='spell'){for(let i=4;i>=1;i--){const t=at(Math.max(0,u-i*.06));g.globalAlpha=.12*(5-i);g.fillStyle='#c79cff';g.beginPath();g.arc(t.x,t.y,(2+(4-i)*.6)*s,0,Math.PI*2);g.fill();}g.globalAlpha=1;
      g.save();g.globalAlpha=.35;g.fillStyle='#e7cfff';g.beginPath();g.arc(q.x,q.y,7*s,0,Math.PI*2);g.fill();g.restore();
      if(!fxSprite('fxOrb',q.x,q.y,11,{rot:elapsed*6})){pixel(g,q.x-3*s,q.y-3*s,6*s,6*s,'#8a68b9');}return;}
    if(e.type==='holy'){g.save();g.globalAlpha=.25+.5*u;g.fillStyle='#fff3c0';g.beginPath();g.ellipse(p.x,p.y,10*s*u,4*s*u,0,0,Math.PI*2);g.fill();g.restore();}
  }
  function drawSlash(e,age,p){const s=scale,src=screenPoint(e.sourceX??e.x,e.sourceZ??e.z),fromRight=src.x>p.x,r=rnd(hash(e.id)),tilt=(r()-.5)*.8;
    const cx=p.x+(fromRight?3:-3)*s,cy=p.y-11*s,k=Math.min(1,age/.12),alpha=age<.12?1:Math.max(0,1-(age-.12)/.3);
    // 斬痕:新月從攻擊方掃過目標(放大+淡出),中心白色閃光
    if(alpha>0)fxSprite('fxSlash',cx,cy,(20+10*k)*(e.cls==='berserker'?1.15:1),{rot:tilt+(fromRight?.3:-.3),flip:fromRight,alpha,sy:.85});
    if(age<.16)fxSprite('fxHit',p.x,cy,10+age*60,{alpha:1-age/.16});
    sparks(p.x,cy,age,hash(e.id),9,['#fff7d0','#ffd56a','#ff9c4a']);
    if(e.cls==='paladin'&&age<.3){g.save();g.globalAlpha=.6*(1-age/.3);g.strokeStyle='#fff2b0';g.lineWidth=Math.max(1,s);g.beginPath();g.ellipse(p.x,p.y,(6+age*40)*s,(2.5+age*16)*s,0,0,Math.PI*2);g.stroke();g.restore();}}
  function drawImpact(e,age,p){const s=scale,cy=p.y-11*s;
    if(e.type==='arrow'){if(age<.14)fxSprite('fxHit',p.x,cy,8+age*50,{alpha:1-age/.14});sparks(p.x,cy,age,hash(e.id),6,['#fff4c8','#e8d090']);return;}
    if(e.type==='spell'){const t=Math.min(1,age/.35);g.save();g.globalAlpha=.7*(1-t);g.strokeStyle='#b98aff';g.lineWidth=Math.max(1,2*s*(1-t));g.beginPath();g.ellipse(p.x,p.y,(4+16*t)*s,(1.8+7*t)*s,0,0,Math.PI*2);g.stroke();g.restore();
      if(age<.3)fxSprite('fxSparkle',p.x,cy,14+age*40,{alpha:1-age/.3,rot:age*3});sparks(p.x,cy,age,hash(e.id),12,['#f1e0ff','#c79cff','#8f6ad8'],32);return;}
    if(e.type==='holy'){const t=Math.min(1,age/.4);g.save();g.globalAlpha=.55*(1-t);g.fillStyle='#fff3c0';g.fillRect(p.x-4*s*(1-t*.5),p.y-60*s,8*s*(1-t*.5),60*s);g.restore();if(age<.3)fxSprite('fxSparkle',p.x,cy,16,{alpha:1-age/.3});return;}
    if(e.type==='hit'){const boss=e.by==='boss',src=screenPoint(e.sourceX??e.x,e.sourceZ??e.z),dir=src.x>p.x?-1:1,t=Math.min(1,age/.08),a=age<.08?1:Math.max(0,1-(age-.08)/.3);
      // 爪痕:三道斜線由打來的方向劃過,白芯紅邊
      if(a>0){g.save();g.globalAlpha=a;for(let i=-1;i<=1;i++){const x0=p.x+(i*3-dir*5)*s,y0=cy-(6+i)*s,x1=x0+dir*10*t*s*(boss?1.5:1),y1=y0+9*t*s*(boss?1.5:1);line(g,x0,y0,x1,y1,'#c8322a',Math.max(2,2*s));line(g,x0,y0,x1,y1,'#fff0e0',Math.max(1,s*.8));}g.restore();}
      if(age<.14)fxSprite('fxHit',p.x,cy,(boss?14:9)+age*40,{alpha:1-age/.14});sparks(p.x,cy,age,hash(e.id),7,['#ffd0b8','#e8584a']);}
  }
  function drawDeath(e,age,p){const type=e.enemyType||'slime',sz=ENEMY_SIZE(type),s=scale,t=Math.max(0,(age-.1)/.6);
    if(t<1){const pose={pose:'hurt',ox:0,oy:0,lean:0,sx:1+.25*t,sy:Math.max(.08,1-ease(t)*.92),flash:age<.18?1:0,flashColor:'#ffffff'};
      posed(p,pose,q=>drawAtlasMonster(type,0,q,sz,!!e.flipHint,1-t*t));}
    // 煙塵往外擴、魂火往上飄
    const r=rnd(hash(e.id)+7);for(let i=0;i<10;i++){const an=r()*Math.PI*2,d=(6+r()*10)*Math.min(1,age/.5),x=p.x+Math.cos(an)*d*s,y=p.y-2*s+Math.sin(an)*d*.4*s,a=Math.max(0,1-age/1.1);
      g.globalAlpha=a*.7;const sz2=Math.max(2,Math.round((2+r()*2)*s));pixel(g,x-sz2/2,y-sz2/2,sz2,sz2,i%2?'#d8ccb4':'#a89c88');}
    for(let i=0;i<5;i++){const x=p.x+(r()-.5)*12*s,y=p.y-(8+age*30+r()*8)*s,a=Math.max(0,1-age/1.2);g.globalAlpha=a;pixel(g,x,y,Math.max(1,2*s),Math.max(1,2*s),i%2?'#cfe8ff':'#9ad0ff');}
    g.globalAlpha=1;if(age>.1&&age<.4)fxSprite('fxStar',p.x,p.y-sz*.4*s,14+(age-.1)*30,{alpha:1-(age-.1)/.3});}
  function damageText(e,age,p){const txt=e.text||String(e.value),hero=e.type==='hit',crit=e.crit,pop=age<.12?1+.7*(1-age/.12):1,rise=ease(Math.min(1,age/.7))*16;
    const col=e.color||(hero?'#ff8a6e':e.type==='heal'?'#c7ffbd':crit?'#ffe066':'#fff3d0'),size=Math.round((crit?10:hero?8:8.5)*pop);
    const dx=e.type==='loot'?0:((hash(e.id)%9)-4)*1.2*scale;textLabel(crit?txt+'!':txt,p.x+dx,p.y-(27+rise)*scale,{color:col,size,back:false});}
  function drawEffect(e){const age0=e.age||0,delay=e.delay||0,age=age0-delay,p=screenPoint(e.x||0,e.z||0);
    if(age<0){if(e.type==='arrow'||e.type==='spell'||e.type==='holy')drawProjectile(e,Math.min(1,age0/Math.max(.01,delay)),p);return;}
    const fade=Math.max(0,1-age/1.5);if(!fade)return;
    if(e.type==='death'){drawDeath(e,age,p);return;}
    if(e.type==='slash')drawSlash(e,age,p);
    else if(e.type==='arrow'||e.type==='spell'||e.type==='holy'||e.type==='hit')drawImpact(e,age,p);
    else if(!drawAtlasEffect(e,age,p,fade))drawProcEffect(e,age,p,fade);
    if(e.value||e.text)damageText(e,age,p);
    g.globalAlpha=1;
  }
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
  function render(){
    screen.imageSmoothingEnabled=false;g.imageSmoothingEnabled=false;hits.length=0;uiLabels.length=0;
    const gx=Math.round(width/2+(-groundOrigin.x-cam.x)*scale),gy=Math.round(height/2+50+(-groundOrigin.y-cam.y)*scale);
    // 地面畫布外也是同一片海:底色+海材質,材質原點對齊地面畫布,拉遠時不會露出一條平塗色帶。
    g.fillStyle=groundBase('ocean')||'#407b86';g.fillRect(0,0,width,height);
    if(groundPatterns.ocean){g.save();g.globalAlpha=TERRAIN_TEX_ALPHA;g.translate(gx,gy);g.scale(scale*TERRAIN_TEX_SCALE,scale*TERRAIN_TEX_SCALE*TERRAIN_TEX_SQUASH);g.fillStyle=groundPatterns.ocean;
      const k=scale*TERRAIN_TEX_SCALE;g.fillRect(-gx/k,-gy/(k*TERRAIN_TEX_SQUASH),width/k,height/(k*TERRAIN_TEX_SQUASH));g.restore();}
    g.drawImage(ground,gx,gy,Math.round(ground.width/GROUND_RES*scale),Math.round(ground.height/GROUND_RES*scale));
    if(villageReady)g.drawImage(villageLayer,Math.round(width/2+(VBOX.x0-cam.x)*scale),Math.round(height/2+50+(VBOX.y0-cam.y)*scale),Math.round(VBOX.w*scale),Math.round(VBOX.h*scale));
    if(quality){for(let z=WORLD.minZ+3;z<WORLD.maxZ-2;z+=4){if(isBridge(riverX(z),z))continue;const p=screenPoint(riverX(z)+Math.sin(elapsed*.45+z)*.6,z+Math.sin(elapsed*.3+z)*.4);if(p.x>0&&p.x<width&&p.y>0&&p.y<height){pixel(g,p.x-3*scale,p.y,6*scale,Math.max(1,scale),'#a8ddf7');pixel(g,p.x+1*scale,p.y+2*scale,3*scale,Math.max(1,scale),'#5fb0e6');}}}
    const all=[];
    for(const d of decorations){const p=screenPoint(d.x,d.z);if(p.x>-100&&p.x<width+100&&p.y>-40&&p.y<height+260)all.push({sort:d.x+d.z,type:'decor',data:d});}
    for(const b of BUILDINGS){const p=state.layout?.[b.id]||b;all.push({sort:p.x+p.z+.2,type:'building',data:b});}
    for(const h of state.hunters||[])all.push({sort:h.x+h.z+.3,type:'hunter',data:h});
    for(const e of state.enemies||[])all.push({sort:e.x+e.z+.3,type:'enemy',data:e});
    all.sort((a,b)=>a.sort-b.sort);
    sg.clearRect(0,0,width,height);spg.clearRect(0,0,width,height);g=spg;casting=true;
    try{for(const item of all){if(item.type==='decor')drawDecoration(item.data);else if(item.type==='building')drawBuilding(item.data);else if(item.type==='hunter')drawHunter(item.data);else drawEnemy(item.data);}}
    finally{casting=false;g=bg;}
    // 影子整層一次壓上地面(重疊處不會疊黑),再蓋上所有物件。
    g.save();g.globalAlpha=SHADOW_ALPHA;g.drawImage(shadowLayer,0,0);g.restore();g.drawImage(spriteLayer,0,0);
    // 戰鬥中的獵人被前面的大魔物/樹擋住時,疊一層半透明的自己(沒被擋的地方疊上去看不出差別)。
    for(const h of state.hunters||[])ghostHunter(h);
    for(const f of overlays.splice(0))f();
    if(document.body.dataset.artReview==='1')uiLabels.length=0;
    for(const e of state.effects||[])drawEffect(e);
    // Small ambient birds and bright drifting pollen keep the village alive.
    if(quality){for(let i=0;i<12;i++){const x=((elapsed*(2+i%3)+i*79)%width),y=(i*47+Math.sin(elapsed*.5+i)*7)%(height);g.globalAlpha=.4;pixel(g,x,y,1,1,'#f2e9be');}g.globalAlpha=1;}
    const cb=biomeAt((cam.x/PX+cam.y/PY)/2,(cam.y/PY-cam.x/PX)/2);if(quality&&cb==='snow'&&!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches){for(let i=0;i<34;i++){const x=(i*59+Math.sin(elapsed*.4+i)*12+width)%width,y=(i*41+elapsed*(6+i%4))%height;pixel(g,x,y,i%4===0?2:1,1,'#eff5e7');}}
    const night=phase>.5?Math.sin((phase-.5)*Math.PI*2)*.15:0;if(night>0){g.fillStyle=`rgba(32,43,79,${night})`;g.fillRect(0,0,width,height);}
    // Placement preview projects to the same coordinate system as simulation.
    if(placing&&hover){const p=screenPoint(hover.x,hover.z),sp=atlasCell(placing)||buildingSprite(placing),w=conceptBuildingWidth(placing);ring(p,30,'#d8ebac');drawSprite(sp,p,w,w*sp.height/sp.width,9,.55);textLabel('點擊放置 · ESC 取消',p.x,p.y+22,{color:'#e6edbf'});}
    if(scale<1.2){for(const r of REGIONS){const p=screenPoint(r.x,r.z);textLabel(r.name,p.x,p.y+14,{color:'#ffe6a6',size:8});}}
    screen.drawImage(buffer,0,0,canvas.width,canvas.height);screen.save();screen.font='bold 11px Microsoft JhengHei';screen.textAlign='center';screen.textBaseline='middle';for(const l of uiLabels){const x=Math.round(l.x*canvas.width/width),y=Math.round(l.y*canvas.height/height),tw=screen.measureText(l.text).width;screen.fillStyle='#1c0e06cc';screen.fillRect(x-tw/2-6,y-9,tw+12,19);screen.fillStyle='#4a2611e6';screen.fillRect(x-tw/2-5,y-8,tw+10,17);screen.fillStyle='#8a5530e6';screen.fillRect(x-tw/2-5,y-8,tw+10,2);screen.fillStyle='#dab247aa';screen.fillRect(x-tw/2-4,y+8,tw+8,1);screen.fillStyle=l.color;screen.fillText(l.text,x,y);}screen.restore();
  }
  function update(dt,nextState){if(disposed)return;if(nextState){state=nextState;const key=BUILDINGS.map(b=>`${b.id}:${state.buildings?.[b.id]>0}:${state.layout?.[b.id]?.x??b.x}:${state.layout?.[b.id]?.z??b.z}`).join('|');if(key!==landscapeKey||terrainPatternRev!==lastPatternRev){lastPatternRev=terrainPatternRev;landscapeKey=key;generateGround();}}elapsed+=Math.min(dt||0,.1);heroLodScale=scale;ensureAtlas();const t=1-Math.exp(-Math.max(.016,dt||.016)*7);cam.x+=(target.x-cam.x)*t;cam.y+=(target.y-cam.y)*t;render();}
  function setTime(p){phase=typeof p==='number'?((p%1)+1)%1:.15;}
  function setQuality(v){quality=v!==false&&v!=='low';}
  function dispose(){disposed=true;for(const[type,fn]of[['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',up],['wheel',wheel],['pointerdown',stopHomeFraming]])canvas.removeEventListener(type,fn);spriteCache.clear();enemyCache.clear();}
  const responsiveResize=()=>{resize();if(homeFraming)focusHome();render();};
  function stopHomeFraming(){homeFraming=false;}
  canvas.addEventListener('pointerdown',stopHomeFraming);
  resize();render();return{update,resize:responsiveResize,project,focus:(id)=>{homeFraming=false;focus(id);},hitRects:()=>hits.filter(h=>BUILDINGS.some(b=>b.id===h.id)).map(h=>({id:h.id,x:h.x,y:h.y,w:h.w,h:h.h})),lookAt:(x,z,v)=>{homeFraming=false;if(v)scale=Math.max(.48,Math.min(5.4,v));target=iso(x,z);cam={...target};},zoomTo:(v)=>{homeFraming=false;scale=Math.max(.48,Math.min(5.4,v));},getScale:()=>scale,setSelected,zoomBy,placeMode,setTime,setQuality,dispose,landscapeStats:()=>({trees:decorations.filter(d=>d.type==='tree').length,arenas:ARENAS.length,roads:roads.length,terrainRevision,
    decor:decorations.map(d=>({type:d.type,x:d.x,z:d.z}))})};
}

export const createPixelWorld = createWorld;
