import {getRoads,roadStyle,onRoad,ARENAS,arenaAt,keepTallDecoration,canopyObscures} from './landscape-layout.js';
import { BUILDINGS, CLASSES, RARITIES } from './pixel-data.js';
import {WORLD,REGIONS,BRIDGES,VILLAGE_BRIDGES,creekX,riverX,biomeAt,BIOME_PALETTE,inVillage,isBridge} from './overworld.js';

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

function heroSprite(classId='berserker',frame=0,facing=1,variant=0) {
  heroUse.calls++;
  const hf=heroFrameFor(classId,heroLodScale);
  // key 要帶 LOD —— 不然放大後快取裡還是 1x 的圖,2x 永遠用不到。
  const key=`${classId}:${frame}:${facing}:${variant%3}:${hf?hf.sc:0}`;
  if(spriteCache.has(key))return spriteCache.get(key);
  // ── 圖集優先 ────────────────────────────────────────────────────────
  // 28x35 是遊戲既定的角色畫布;把出土角色 contain 進去、底部對齊(腳 = 基準線),
  // frame 1 往上 1px 做走路起伏。variant 用一層極淡的染色保留「同職業不同人」的差異。
  // 圖集還沒載完時 heroFrameFor 回 null,自動退回下面的程序繪製。
  if(hf){
    const cell=hf.cell,c=makeCanvas(28,35),g=c.getContext('2d');
    g.imageSmoothingEnabled=false;
    const k=Math.min(28/cell.w,(35-1)/cell.h);
    const dw=Math.max(1,Math.round(cell.w*k)),dh=Math.max(1,Math.round(cell.h*k));
    g.save();
    if(facing<0){g.translate(28,0);g.scale(-1,1);}
    g.drawImage(hf.img,cell.x,cell.y,cell.w,cell.h,
                Math.round((28-dw)/2),35-dh-(frame?1:0),dw,dh);
    g.restore();
    g.globalCompositeOperation='source-atop';
    g.fillStyle=HERO_TINT[variant%3];g.fillRect(0,0,28,35);
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
  g.fillStyle=color+'20';g.fillRect(4,4,76,80);g.drawImage(heroSprite(classId,0,1,hash(classId)%3),0,0,28,35,7,-4,70,87.5);return c.toDataURL();
}
export function drawPortrait(canvas,hunter={},options={}) {
  const g=canvas.getContext('2d');g.imageSmoothingEnabled=false;g.clearRect(0,0,canvas.width,canvas.height);
  const s=options.scale||Math.min(canvas.width/28,canvas.height/34);g.drawImage(heroSprite(hunter.classId,0,1,hash(hunter.id||hunter.classId)%3),Math.round((canvas.width-28*s)/2),Math.round(canvas.height-34*s),28*s,35*s);
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
  for(const [sheetKey,manKey] of [['heroAtlas','heroManifest'],['heroAtlas2x','heroManifest2x']]){
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
      groundPatterns[name]=cx.createPattern(cv,'repeat');
    }
    terrainPatternRev++;   // generateGround 會偵測到這個變化並重畫
    globalThis.dispatchEvent(new CustomEvent('pixel-assets-ready'));
  };
  im.onerror=()=>loadedAssetKeys.delete('terrainAtlas');
  im.src=assets.terrainAtlas;
}

// ── 地圖細節圖集(樹、岩石、村莊家具) ──────────────────────────────────
// key 就是裝飾型別,剛好 1:1 對上 drawDecoration() 的分支。
const detailLod=[];
// 樹用 variant%4 選型:0 松 / 1 闊葉 / 2 樺 / 3 雪松(跟 treeSprite 的 type 一致)
const TREE_ATLAS=['pine','oak','birch','snowpine'];
const detailUse={draw1x:0,draw2x:0};
function detailFrameFor(id,prefer2x){
  if(prefer2x)for(const lod of detailLod)if(lod.scale===2&&lod.frames[id])return lod;
  for(const lod of detailLod)if(lod.frames[id])return lod;
  return null;
}
function ensureDetailAtlas(){
  const assets=globalThis.PIXEL_ASSETS||{};
  for(const [sheetKey,manKey] of [['detailsAtlas','detailsManifest'],
                                  ['detailsAtlas2x','detailsManifest2x']]){
    if(!assets[sheetKey]||!assets[manKey]||loadedAssetKeys.has(sheetKey))continue;
    loadedAssetKeys.add(sheetKey);
    const m=(typeof assets[manKey]==='string')?JSON.parse(assets[manKey]):assets[manKey];
    const im=new Image();
    im.onload=()=>{detailLod.push({img:im,scale:m.scale===0.5?1:2,frames:m.cells});
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
// 大廳與地下城要比店鋪大。舊版是 hall:79 / dungeon:77,換算成倍率。
const BUILDING_SCALE={hall:1.11,dungeon:1.08};
// 除錯用:console 打 __mistvaleAtlas() 看圖集載入狀況
globalThis.__mistvaleHero=()=>({ready:heroAtlasLod.length>0,lods:heroAtlasLod.map(l=>({scale:l.scale,cells:Object.keys(l.frames).length})),use:{...heroUse}});
globalThis.__mistvaleDetails=()=>({ready:detailLod.length>0,use:Object.assign({},detailUse)});
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
  ensureHeroAtlas();
  const assets=globalThis.PIXEL_ASSETS||{};
  // 舊的硬切格圖集載入已由上面的 manifest 圖集取代(列切線原本是猜的)。

  for(const b of [...BUILDINGS,{id:'monument'}]){const src=assets[b.id];if(!src||loadedAssetKeys.has(b.id))continue;loadedAssetKeys.add(b.id);
    const im=new Image();im.onload=()=>{const cell=makeCanvas(im.width,im.height),c=cell.getContext('2d');c.drawImage(im,0,0);const pixels=c.getImageData(0,0,im.width,im.height),d=pixels.data;let x0=im.width,y0=im.height,x1=0,y1=0;
      for(let y=0;y<im.height;y++)for(let x=0;x<im.width;x++){const j=(y*im.width+x)*4;if(d[j]>160&&d[j+2]>130&&d[j+1]<130&&d[j]>d[j+1]*1.5&&d[j+2]>d[j+1]*1.5)d[j+3]=0;if(b.id==='inn'&&y<im.height*.25&&d[j+1]>100&&d[j+2]>d[j+1]*1.10)d[j+3]=0;if(d[j+3]>32){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}}
      c.putImageData(pixels,0,0);if(x1>x0&&y1>y0){const out=makeCanvas(384,Math.round(384*(y1-y0+1)/(x1-x0+1))),g=out.getContext('2d');g.imageSmoothingEnabled=false;g.drawImage(cell,x0,y0,x1-x0+1,y1-y0+1,0,0,out.width,out.height);sharedAtlas||=new Map();sharedAtlas.set(b.id,out);globalThis.dispatchEvent(new CustomEvent('pixel-assets-ready'));}
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
    pixel(g,18,29+bob,9,4,'#b8db8e');pixel(g,15,33+bob,4,7,'#94c678');pixel(g,22,36,2,3,'#2e3a39');pixel(g,30,36,2,3,'#2e3a39');pixel(g,25,41,4,1,'#435247');pixel(g,21,43,12,1,'#44896a');
  }else if(type==='wolf') {
    polygon(g,[[8,37],[5,29],[12,34],[20,28],[33,29],[41,25],[42,33],[46,36],[44,42],[38,42],[35,49],[30,49],[30,42],[20,42],[17,49],[12,49],[13,41]],o);
    polygon(g,[[10,36],[8,32],[14,36],[22,30],[33,31],[39,28],[40,35],[44,37],[42,40],[35,40],[32,47],[31,40],[19,40],[15,47],[15,39]],'#929b9e');pixel(g,19,31,12,4,'#c7ccbd');pixel(g,25,35,9,4,'#677580');pixel(g,38,33,2,2,'#edb75a');pixel(g,43,37,2,2,'#242b2d');pixel(g,14+(frame?1:0),46,4,2,'#65757b');
  }else if(type==='boss') {
    polygon(g,[[8,43],[5,28],[9,19],[15,17],[13,7],[22,12],[26,8],[32,12],[43,6],[40,19],[47,23],[50,40],[45,47],[37,45],[35,52],[27,52],[24,47],[21,52],[11,52],[12,46]],o);
    polygon(g,[[9,39],[9,25],[15,21],[21,18],[30,16],[39,20],[44,25],[47,39],[41,42],[35,39],[33,48],[28,48],[25,43],[20,48],[14,48],[15,40]],'#766559');
    polygon(g,[[15,9],[20,16],[18,23],[14,18]],'#ccbb90');polygon(g,[[41,9],[35,16],[36,23],[41,18]],'#ccbb90');pixel(g,18,24,19,13,'#977e60');pixel(g,18,26,6,4,'#e98a43');pixel(g,30,26,6,4,'#e98a43');pixel(g,20,27,2,2,'#ffeaaa');pixel(g,32,27,2,2,'#ffeaaa');pixel(g,24,33,8,3,'#3a3634');pixel(g,20,37,16,2,'#d0be96');pixel(g,20,37,3,5,'#f4e6ba');pixel(g,33,37,3,5,'#f4e6ba');pixel(g,11,28,4,10,'#9e8667');pixel(g,41,30,4,8,'#514c47');
  }else {
    polygon(g,[[9,43],[9,26],[15,21],[17,12],[33,10],[40,18],[40,26],[46,30],[45,45],[36,47],[34,52],[27,52],[24,46],[21,52],[12,51]],o);
    polygon(g,[[12,42],[12,28],[19,25],[20,15],[32,13],[37,20],[35,28],[43,32],[42,42],[33,42],[32,49],[28,49],[25,40],[20,48],[15,48]],'#888a7e');polygon(g,[[20,17],[31,15],[34,21],[31,27],[21,26]],'#b5b4a0');pixel(g,22,21,3,3,'#9bd3c5');pixel(g,29,21,3,3,'#9bd3c5');pixel(g,24,32,9,7,'#666f69');pixel(g,27,33,3,4,'#b8ce9f');pixel(g,13,28,5,4,'#b0ad99');pixel(g,36,33,5,3,'#a3a48f');
  }enemyCache.set(key,c);return c;
}

export function createWorld(canvas,{onSelect=()=>{},onPlace=()=>{}}={}) {
  ensureAtlas();
  const screen=canvas.getContext('2d',{alpha:false}),buffer=makeCanvas(800,500),g=buffer.getContext('2d',{alpha:false});
  canvas.style.imageRendering='pixelated';canvas.style.touchAction='none';screen.imageSmoothingEnabled=false;g.imageSmoothingEnabled=false;
  let width=800,height=500,scale=.9,elapsed=0,phase=.15,selected=null,placing=null,state={buildings:{},hunters:[],enemies:[],effects:[]},disposed=false,quality=true,baseScale=1.95;
  let cam={x:-6,y:2},target={x:-6,y:2},pointer=null,hover=null,lastSource=null,pinchDistance=0;
  const uiLabels=[],hits=[],pointers=new Map(),previousPositions=new Map(),treeCanvases=Array.from({length:16},(_,i)=>treeSprite(i*782+19,i%4));
  const decorations=[];let roads=getRoads(),landscapeKey='',terrainRevision=0,lastPatternRev=-1;
  const ground=makeCanvas(2400,1450),gc=ground.getContext('2d');gc.imageSmoothingEnabled=false;
  const groundOrigin={x:1100,y:560};
  const worldPos=(x,z)=>{const p=iso(x,z);return{x:p.x+groundOrigin.x,y:p.y+groundOrigin.y};};

  function diamond(ctx,x,z,rx,rz,color){const a=worldPos(x-rx,z-rz),b=worldPos(x+rx,z-rz),c=worldPos(x+rx,z+rz),d=worldPos(x-rx,z+rz);polygon(ctx,[[a.x,a.y],[b.x,b.y],[c.x,c.y],[d.x,d.y]],color);}
  function generateGround(){
    const rand=rnd(349180);decorations.length=0;roads=getRoads(state.layout||{},state.buildings||{});terrainRevision++;
    gc.fillStyle='#417d90';gc.fillRect(0,0,ground.width,ground.height);
    const road=(x,z)=>onRoad(x,z,roads);
    // 底層:按生態域「整片」填無縫材質。一格菱形只有 9x5 螢幕像素,逐格貼圖
    // 塞不進細節;整片填才會有連續的草/沙/雪紋理。pattern 垂直壓 0.5 符合等角透視。
    // 材質還沒載完時 tiled=false,退回原本的平塗菱形,不開天窗。
    const tiled=Object.keys(groundPatterns).length>0;
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
        gc.fillStyle=BIOME_PALETTE[b]||'#7a9460';gc.fillRect(0,0,ground.width,ground.height);
        gc.globalAlpha=TERRAIN_TEX_ALPHA;
        gc.scale(TERRAIN_TEX_SCALE,TERRAIN_TEX_SCALE*TERRAIN_TEX_SQUASH);
        gc.fillStyle=pat;
        gc.fillRect(0,0,ground.width/TERRAIN_TEX_SCALE,ground.height/(TERRAIN_TEX_SCALE*TERRAIN_TEX_SQUASH));
        gc.restore();
      }
    }
    for(let z=WORLD.minZ;z<WORLD.maxZ;z++)for(let x=WORLD.minX;x<WORLD.maxX;x++){
      const p=worldPos(x,z),biome=biomeAt(x,z),base=BIOME_PALETTE[biome],n=Math.floor(rand()*13)-6;
      if(!tiled)diamond(gc,x,z,.51,.51,shade(base,n));
      if(biome==='ocean'||biome==='river'||biome==='ice'){if(rand()<.4)pixel(gc,p.x-4,p.y,4+rand()*6,1,biome==='ice'?'#d1edeb':'#89c4c6');if(biome==='river')pixel(gc,p.x-2,p.y+2,4,1,'#347887');continue;}
      if(biome==='bridge'){if(!tiled)diamond(gc,x,z,.51,.51,'#79583b');for(let i=-3;i<4;i+=2)pixel(gc,p.x-7,p.y+i,14,1,i%3?'#c3a16b':'#947245');continue;}
      const clearing=arenaAt(x,z);
      if(clearing){const colors={meadow:'#aeb27d',forest:'#a4a77c',taiga:'#99aaa0',snow:'#e5eee7',mountain:'#b6b6a5',desert:'#e3c28a',birch:'#b9c18a'};const cc=shade(colors[clearing.id]||'#b5b68a',n/2);if(tiled){gc.save();gc.globalAlpha=.5;diamond(gc,x,z,.51,.51,cc);gc.restore();}else diamond(gc,x,z,.51,.51,cc);if(rand()<.17)pixel(gc,p.x-2,p.y,3,1,shade(colors[clearing.id]||'#b5b68a',-13));continue;}
      if(road(x,z)){diamond(gc,x,z,.60,.60,roadStyle(x,z,roads)==='stone'?'#d8c0a8':biome==='snow'?'#b8c5bf':'#c9a877');if(roadStyle(x,z,roads)==='stone'){for(let i=0;i<4;i++){const dx=(i%2)*7-6,dy=Math.floor(i/2)*3-2;pixel(gc,p.x+dx,p.y+dy,6,2,rand()>.5?'#e4d0b2':'#b0a184');pixel(gc,p.x+dx,p.y+dy,5,1,'#f0e2c6');}}else{pixel(gc,p.x-5,p.y-1,7,1,biome==='snow'?'#97afad':'#9f8960');pixel(gc,p.x+1,p.y+1,5,1,biome==='snow'?'#d4dfd7':'#c9b386');if(rand()<.2)pixel(gc,p.x-2,p.y,2,1,'#ddd0a9');}continue;}
      if(biome==='desert'){pixel(gc,p.x-5+rand()*7,p.y-2,4,1,'#eed298');if(rand()<.24)pixel(gc,p.x,p.y+2,3,1,'#bb935e');}
      else if(biome==='mountain'){pixel(gc,p.x-5,p.y-2,5,2,'#bfc0b2');pixel(gc,p.x+2,p.y,4,1,'#777f7b');if(rand()<.12)pixel(gc,p.x,p.y,2,2,'#bf9974');}
      else if(biome==='snow'){if(rand()<.4)pixel(gc,p.x-4,p.y-1,6,1,'#f1f3df');if(rand()<.15)pixel(gc,p.x+1,p.y+1,3,1,'#a8c9cb');}
      else {if(rand()<.65){pixel(gc,p.x-3,p.y-2,2,3,shade(base,-20));pixel(gc,p.x,p.y-1,2,2,shade(base,24));}if(rand()<.15){pixel(gc,p.x+3,p.y-2,2,1,'#c2c982');pixel(gc,p.x+1,p.y,1,2,shade(base,-12));}}
    }
    // Central monument plaza and aprons, based on the original concept composition.
    for(let z=-5;z<10;z+=.5)for(let x=-17;x<1;x+=.5){if(((x+8)/7.2)**2+((z-2)/6.6)**2>1)continue;const p=worldPos(x,z),v=Math.floor(rand()*22);diamond(gc,x,z,.30,.30,`rgb(${214+v},${186+v},${156+v})`);pixel(gc,p.x-3,p.y+2,5,1,'#a68d67');}
    for(const b of BUILDINGS.filter(b=>b.id!=='dungeon')){const p=state.layout?.[b.id]||b;diamond(gc,p.x,p.z,b.w*.6,b.d*.6,'#b3b09a');}
    diamond(gc,-25,14,2.2,4.5,'#745536');for(let z=10;z<18;z+=.6)for(let x=-27;x<-23;x+=.6){const p=worldPos(x,z);pixel(gc,p.x,p.y-4,1,5,'#ba973d');pixel(gc,p.x-1,p.y-3,3,1,'#eac665');pixel(gc,p.x,p.y-5,1,2,'#f1dc8e');}
    // Small decorative fishing pond; the main river is an actual navigation boundary.
    diamond(gc,-19,-23,3.4,2.7,'#bbbc8a');diamond(gc,-19,-23,2.9,2.2,'#609da2');
    for(let z=WORLD.minZ+3;z<WORLD.maxZ-2;z+=3.6)for(let x=WORLD.minX+3;x<WORLD.maxX-2;x+=3.9){
      const xx=x+rand()*.9,zz=z+rand()*.9,bio=biomeAt(xx,zz);if(['ocean','river','ice','bridge'].includes(bio)||road(xx,zz))continue;
      if(inVillage(xx,zz)&&rand()>.08)continue;
      if(arenaAt(xx,zz,2)||BUILDINGS.some(b=>{const p=state.layout?.[b.id]||b;return Math.abs(xx-p.x)<4&&Math.abs(zz-p.z)<4.5;}))continue;
      const chance=bio==='forest'?.46:bio==='taiga'?.43:bio==='birch'?.34:bio==='snow'?.28:bio==='meadow'?.08:.04;
      if(rand()<chance){const type=bio==='taiga'?0:bio==='snow'?3:bio==='birch'?2:1;decorations.push({type:'tree',x:xx,z:zz,variant:type+Math.floor(rand()*4)*4,size:.62+rand()*.26});}
      else if(bio==='desert'&&rand()<.23)decorations.push({type:'cactus',x:xx,z:zz,size:.8+rand()*.5});
      else if(bio==='mountain'&&rand()<.62)decorations.push({type:'outcrop',x:xx,z:zz,size:1+rand()*.7});
      else if(rand()<.22)decorations.push({type:bio==='snow'?'rock':bio==='forest'?'mushroom':'flowers',x:xx,z:zz,variant:Math.floor(rand()*5),size:1});
    }
    for(const [x,z,v]of[[-17,-9,1],[-17,0,5],[-15,19,1],[-6,20,2],[7,19,6],[10,-14,0],[12,11,1],[-21,13,2]])decorations.push({type:'tree',x,z,variant:v,size:.86});
    decorations.push({type:'monument',x:-8,z:2,size:1},{type:'well',x:-9.5,z:17.8,size:.56});
    for(let z=-23;z<25;z+=.85){if((z>-1&&z<5)||(z>16&&z<20))continue;decorations.push({type:'fence',x:9,z,size:1});}
    for(const z of[-1,5,16,20])decorations.push({type:'gate',x:9.1,z,size:1});
    for(const[x,z]of[[-7,4],[-7,-5],[1,4],[1,11],[-7,12],[7,2],[13,2]])decorations.push({type:'lamp',x,z,size:1});
    for(const z of VILLAGE_BRIDGES)for(let i=-3;i<=3;i++){decorations.push({type:'bridgeRail',x:creekX(z)+i,z:z-1.5,size:1},{type:'bridgeRail',x:creekX(z)+i,z:z+1.5,size:1});}
    for(const z of BRIDGES)for(let i=-4;i<=4;i++){decorations.push({type:'bridgeRail',x:riverX(z)+i,z:z-1.5,size:1},{type:'bridgeRail',x:riverX(z)+i,z:z+1.5,size:1});}
    for(const r of REGIONS.filter(r=>r.id!=='village')){decorations.push({type:'signpost',x:r.x-3,z:r.z+3,region:r,size:1});}
    decorations.push({type:'cave',x:52,z:-40,size:1.2},{type:'ruins',x:54,z:30,size:1},{type:'ruins',x:-17,z:39,size:1});
    for(let i=0;i<10;i++)decorations.push({type:'animal',x:13+rand()*8,z:12+rand()*7,variant:i%3,phase:rand()*6,size:1});
    for(let i=decorations.length-1;i>=0;i--){const d=decorations[i];if(['tree','cactus','outcrop','ruins','cave'].includes(d.type)&&!keepTallDecoration(d,roads,state.layout||{}))decorations.splice(i,1);}
    for(const a of ARENAS){for(let i=0;i<16;i++){const t=i*Math.PI/8,p=worldPos(a.x+Math.cos(t)*a.rx,a.z+Math.sin(t)*a.rz);stone(gc,p.x-2,p.y-1,4,2);}decorations.push({type:'arenaFlag',x:a.x-a.rx-1,z:a.z,region:a,size:1});}
    for(let i=0;i<10;i++){const t=i*Math.PI/5,x=-8+Math.cos(t)*4.9,z=2+Math.sin(t)*4.5;if(!onRoad(x,z,roads,.7))decorations.push({type:'garden',x,z,size:1});}
    for(const[x,z]of[[-11.5,-1],[-4.5,-1],[-12,5.5],[-4.5,6.5],[-18,1],[-6,-9],[3,11]])if(!onRoad(x,z,roads,.15))decorations.push({type:'lamp',x,z,size:1});
    decorations.sort((a,b)=>a.x+a.z-b.x-b.z);
  }

  generateGround();

  function resize(){const r=canvas.getBoundingClientRect();const actualWidth=Math.max(320,Math.round(r.width||innerWidth)),actualHeight=Math.max(260,Math.round(r.height||innerHeight));canvas.width=actualWidth;canvas.height=actualHeight;width=actualWidth;height=actualHeight;buffer.width=width;buffer.height=height;screen.imageSmoothingEnabled=false;g.imageSmoothingEnabled=false;const n=2*Math.max(.62,Math.min(1.18,width/1140,(height/2-56)/300));scale*=n/baseScale;baseScale=n;if(!lastSource){scale=n;lastSource=true;}}
  function screenPoint(x,z,y=0){const p=iso(x,z);return{x:Math.round(width/2+(p.x-cam.x)*scale),y:Math.round(height/2+50+(p.y-cam.y-y*8)*scale)};}
  function project(x,y=0,z=0){const p=screenPoint(x,z,y);return{x:p.x*canvas.width/width,y:p.y*canvas.height/height,visible:p.x>=0&&p.x<=width&&p.y>=0&&p.y<=height};}
  function unproject(clientX,clientY){const r=canvas.getBoundingClientRect(),sx=(clientX-r.left)*width/r.width,sy=(clientY-r.top)*height/r.height,ix=(sx-width/2)/scale+cam.x,iy=(sy-height/2-50)/scale+cam.y;return{x:(ix/PX+iy/PY)/2,z:(iy/PY-ix/PX)/2,sx,sy};}
  function focus(id){let pos;if(id==='home'||!id){target={x:-6,y:2};scale=baseScale;return;}if(id==='world'){target={x:45,y:75};scale=Math.min(width/1750,(height-55)/910);return;}if(id.startsWith?.('region:'))pos=REGIONS.find(r=>r.id===id.slice(7));else if(id==='hunt')pos={x:17,z:3};else if(id.startsWith?.('hunter:'))pos=state.hunters?.find(h=>String(h.id)===id.slice(7));else pos=BUILDINGS.find(b=>b.id===id);if(pos){const override=state.layout?.[id];const p=iso(override?.x??pos.x,override?.z??pos.z);target={x:p.x,y:p.y+(id.startsWith?.('region:')?30:-25)};scale=Math.max(baseScale,Math.min(3.1,baseScale*1.28));}}
  function setSelected(id){selected=id;}
  function zoomBy(factor){scale=Math.max(.48,Math.min(5.4,scale*factor));}
  function placeMode(id){placing=id;canvas.style.cursor=id?'crosshair':'grab';}
  const clampCam=()=>{target.x=Math.max(-800,Math.min(925,target.x));target.y=Math.max(-370,Math.min(560,target.y));};
  function down(e){if(e.button!==undefined&&e.button!==0&&e.button!==1)return;canvas.setPointerCapture?.(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===2){const pts=[...pointers.values()];pinchDistance=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y);pointer=null;return;}pointer={id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,moved:false};canvas.style.cursor=placing?'crosshair':'grabbing';}
  function move(e){hover=unproject(e.clientX,e.clientY);if(pointers.has(e.pointerId))pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===2){const pts=[...pointers.values()],dist=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y);if(pinchDistance)zoomBy(dist/pinchDistance);pinchDistance=dist;return;}if(!pointer||pointer.id!==e.pointerId)return;const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;if(Math.hypot(e.clientX-pointer.startX,e.clientY-pointer.startY)>5)pointer.moved=true;target.x-=dx/scale;target.y-=dy/scale;cam={...target};clampCam();pointer.x=e.clientX;pointer.y=e.clientY;}
  function up(e){const p=pointer;pointers.delete(e.pointerId);pinchDistance=0;pointer=null;canvas.style.cursor=placing?'crosshair':'grab';if(!p||p.moved)return;const q=unproject(e.clientX,e.clientY);if(placing){onPlace(placing,Math.round(q.x*2)/2,Math.round(q.z*2)/2);return;}for(let i=hits.length-1;i>=0;i--){const hit=hits[i];if(q.sx>=hit.x&&q.sx<=hit.x+hit.w&&q.sy>=hit.y&&q.sy<=hit.y+hit.h){onSelect(hit.id);return;}}onSelect(null);}
  function wheel(e){e.preventDefault();const before=unproject(e.clientX,e.clientY);zoomBy(e.deltaY<0?1.1:1/1.1);const after=unproject(e.clientX,e.clientY),b=iso(before.x,before.z),a=iso(after.x,after.z);target.x+=b.x-a.x;target.y+=b.y-a.y;cam={...target};clampCam();}
  canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);canvas.addEventListener('wheel',wheel,{passive:false});canvas.style.cursor='grab';

  function shadow(p,w=12,h=4){g.fillStyle='#304a3660';g.beginPath();g.ellipse(p.x,p.y,Math.max(2,w*scale),Math.max(1,h*scale),0,0,Math.PI*2);g.fill();}
  function drawSprite(sprite,p,w,h,offset=0,alpha=1){const ww=Math.round(w*scale),hh=Math.round(h*scale);g.globalAlpha=alpha;g.drawImage(sprite,Math.round(p.x-ww/2),Math.round(p.y-hh+offset*scale),ww,hh);g.globalAlpha=1;return{x:p.x-ww/2,y:p.y-hh+offset*scale,w:ww,h:hh};}
  // 把圖集物件 contain 進「世界單位外框」並畫出。回傳 true = 畫成功。
  // contain 而不是拉伸:保持出土物件的等比,尺寸由外框決定(版面才不會跑掉)。
  function drawAtlasDetail(id,p,bw,bh,offset=0,alpha=1){
    const lod=detailFrameFor(id,scale>=2.2);
    if(!lod)return false;
    const c=lod.frames[id];
    const rs=Math.min(bw*scale/c.w,bh*scale/c.h);
    const dw=Math.max(1,Math.round(c.w*rs)),dh=Math.max(1,Math.round(c.h*rs));
    if(lod.scale===2)detailUse.draw2x++;else detailUse.draw1x++;
    g.globalAlpha=alpha;
    g.drawImage(lod.img,c.x,c.y,c.w,c.h,Math.round(p.x-dw/2),Math.round(p.y-dh+offset*scale),dw,dh);
    g.globalAlpha=1;
    return true;
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
    g.drawImage(lod.img,c.x,c.y,c.w,c.h,dx,dy,dw,dh);
    return {x:dx,y:dy,w:dw,h:dh};
  }
  function ring(p,w=18,color='#ffe795'){g.strokeStyle='#435041';g.lineWidth=3;g.beginPath();g.ellipse(p.x,p.y,w*scale,w*.43*scale,0,0,Math.PI*2);g.stroke();g.strokeStyle=color;g.lineWidth=1;g.stroke();}
  function textLabel(text,x,y,{color='#fff7d9',size=7,back=true}={}){g.font=`bold ${size*2}px "Microsoft JhengHei", "Noto Sans TC", sans-serif`;g.textAlign='center';g.textBaseline='middle';const tw=Math.ceil(g.measureText(text).width);if(back){pixel(g,x-tw/2-4,y-9,tw+8,19,'#333a2dde');pixel(g,x-tw/2-3,y+9,tw+6,1,'#a6a07988');}g.fillStyle='#25302c';g.fillText(text,Math.round(x),Math.round(y+1));g.fillStyle=color;g.fillText(text,Math.round(x),Math.round(y));}
  function bar(x,y,w,frac,color){pixel(g,x-1,y-1,w+2,6,'#262e2ddd');pixel(g,x,y,w,4,'#644943');pixel(g,x,y,Math.max(0,w*Math.min(1,frac)),4,color);pixel(g,x,y,Math.max(0,w*Math.min(1,frac)),2,shade(color,25));}
  function getLevel(id){const level=state.buildings?.[id];return typeof level==='number'?level:level?.level??1;}

  function drawBuilding(b){const layout=state.layout?.[b.id]||b,p=screenPoint(layout.x,layout.z),level=getLevel(b.id),s=selected===b.id;
    if(s)ring(p,31,'#ffdc7b');
    if(!level){
      const r=24*scale;polygon(g,[[p.x-r,p.y],[p.x,p.y-r*.5],[p.x+r,p.y],[p.x,p.y+r*.5]],'#716b4f99');g.strokeStyle='#c6bc90';g.lineWidth=1;g.setLineDash([3,2]);g.beginPath();g.moveTo(p.x-r,p.y);g.lineTo(p.x,p.y-r*.5);g.lineTo(p.x+r,p.y);g.lineTo(p.x,p.y+r*.5);g.closePath();g.stroke();g.setLineDash([]);textLabel('+',p.x,p.y-7,{size:16,color:'#f1dfab',back:false});textLabel(b.name,p.x,p.y+13,{color:'#dfd6b7'});hits.push({id:b.id,x:p.x-r,y:p.y-r*.6,w:r*2,h:r*1.5});return;
    }
    let rect=drawAtlasBuilding(b.id,p,9);
    if(!rect){const sprite=buildingSprite(b.id),w=b.id==='hall'?79:b.id==='dungeon'?77:71;rect=drawSprite(sprite,p,w,72,9);}
    // 下面冒煙那段用的是「世界單位」的高度(會再乘 scale),照舊版語意換算回去。
    const h=rect.h/scale;hits.push({id:b.id,...rect});
    // Smoke is made from individual four-pixel clusters and never blurs the art.
    if(['forge','enhancement','restaurant','inn','hall'].includes(b.id)){
      for(let i=0;i<3;i++){const t=(elapsed*.3+i*.33)%1,xx=p.x+(18+t*5)*scale,yy=p.y+(-h+12-t*22)*scale;g.globalAlpha=(1-t)*.4;pixel(g,xx,yy,Math.max(2,4*scale),Math.max(2,3*scale),'#e5dfc8');pixel(g,xx+1,yy-1,Math.max(2,2*scale),1,'#f7ecd5');g.globalAlpha=1;}
    }
    if(scale>1.12||s)uiLabels.push({text:`${b.name} Lv.${level}`,x:p.x,y:p.y+10*scale,color:s?'#ffe195':'#fff5d1'});
    const products={restaurant:'food',inn:'bed',tavern:'drink',clinic:'bandage'},pid=products[b.id];
    const stock=pid?(state.stocks?.[pid]??state.stock?.[pid]??state.products?.[pid]??state.inventory?.[pid]):null;
    if(pid&&stock===0){textLabel('!',p.x+27*scale,p.y-45*scale,{size:9,color:'#ffda87'});}
  }
  function drawDecoration(d){const p=screenPoint(d.x,d.z);if(p.x<-100||p.x>width+100||p.y<-70||p.y>height+260)return;
    if(d.type==='monument'){const sp=atlasCell('monument')||buildingSprite('fountain');drawSprite(sp,p,74,74*sp.height/sp.width,8);return;}
    if(d.type==='garden'){const s=scale;pixel(g,p.x-7*s,p.y-2*s,15*s,5*s,'#706448');pixel(g,p.x-6*s,p.y-3*s,13*s,4*s,'#405a30');for(let i=0;i<6;i++){const xx=p.x+(i*2-5)*s,yy=p.y-(3+i%2)*s;pixel(g,xx,yy,2*s,2*s,i%3?'#b5bc64':'#e4b277');pixel(g,xx,yy-s,s,s,i%3?'#f0e2bb':'#e7998b');}return;}
    if(d.type==='tree'&&!drawAtlasDetail(TREE_ATLAS[(d.variant||0)%4],p,50*d.size,72*d.size,4,([...(state.hunters||[]),...(state.enemies||[])].some(a=>a.hp>0&&a.x+a.z<d.x+d.z+.2&&canopyObscures(d.x,d.z,d.size,a.x,a.z,4))?.18:1))){drawSprite(treeCanvases[d.variant],p,50*d.size,72*d.size,4,1);return;}
    if(d.type==='arenaFlag'){const ss=scale;pixel(g,p.x,p.y-26*ss,2*ss,28*ss,'#664b31');pixel(g,p.x+2*ss,p.y-25*ss,12*ss,12*ss,'#954f45');pixel(g,p.x+4*ss,p.y-22*ss,7*ss,2*ss,'#ead08c');if(scale>.6)uiLabels.push({text:d.region.name+' · 戰鬥空地',x:p.x,y:p.y-35*ss,color:'#f1dd9e'});return;}
    if(d.type==='mushroom'){const s=scale;pixel(g,p.x,p.y-5*s,2*s,6*s,'#e2d6b0');pixel(g,p.x-3*s,p.y-7*s,8*s,4*s,'#9c584d');pixel(g,p.x-2*s,p.y-8*s,6*s,2*s,'#ce7a63');pixel(g,p.x-s,p.y-7*s,2*s,s,'#f3ddb4');pixel(g,p.x+2*s,p.y-6*s,s,s,'#efd2a1');return;}
    if(d.type==='flowers'){const cols=['#f4e7ad','#e9b057','#d98691','#99b6e0','#eee8cd'];for(let i=0;i<4;i++){const x=p.x+(i*3-5)*scale,y=p.y-(2+i%2)*scale;pixel(g,x,y,1,4*scale,'#4d733d');pixel(g,x-scale,y-scale,3*scale,2*scale,cols[(d.variant+i)%5]);pixel(g,x,y-scale,scale,scale,'#e7c363');}return;}
    if(d.type==='cactus'){const s=scale*d.size;pixel(g,p.x-3*s,p.y-28*s,7*s,30*s,'#365d3a');pixel(g,p.x-2*s,p.y-27*s,4*s,27*s,'#76904c');pixel(g,p.x-1*s,p.y-25*s,s,25*s,'#a8ad65');pixel(g,p.x-9*s,p.y-18*s,6*s,5*s,'#4f773f');pixel(g,p.x-10*s,p.y-25*s,4*s,11*s,'#698948');pixel(g,p.x+4*s,p.y-14*s,6*s,4*s,'#4d713c');pixel(g,p.x+7*s,p.y-21*s,4*s,10*s,'#829b55');for(let k=0;k<5;k++)pixel(g,p.x+2*s,p.y-(5+k*4)*s,s,s,'#d6d29b');return;}
    if(d.type==='outcrop'||d.type==='cave'||d.type==='ruins'){
      const hh0=d.type==='cave'?38:d.type==='ruins'?28:17;
      if(drawAtlasDetail(d.type==='ruins'?'ruin':d.type,p,38*d.size,hh0*d.size)){
        if(d.type==='cave')textLabel('鐵脊礦坑',p.x,p.y+16*scale,{color:'#e3d5b0'});
        return;}
      const s=scale*d.size,hh=hh0;polygon(g,[[p.x-19*s,p.y],[p.x-17*s,p.y-hh*s],[p.x+8*s,p.y-(hh+5)*s],[p.x+22*s,p.y-12*s],[p.x+20*s,p.y+7*s],[p.x-6*s,p.y+10*s]],'#565e5e');polygon(g,[[p.x-17*s,p.y-hh*s],[p.x+8*s,p.y-(hh+5)*s],[p.x+19*s,p.y-12*s],[p.x-5*s,p.y-4*s]],'#a5aba1');for(let i=0;i<5;i++)pixel(g,p.x-(12-i*5)*s,p.y-(hh-5-i%2*4)*s,4*s,2*s,i%2?'#c2bcb0':'#8f958c');if(d.type==='cave'){pixel(g,p.x-9*s,p.y-24*s,19*s,25*s,'#343e40');pixel(g,p.x-6*s,p.y-21*s,13*s,23*s,'#1d2930');pixel(g,p.x-15*s,p.y-16*s,3*s,5*s,'#e6a94c');pixel(g,p.x+15*s,p.y-15*s,3*s,5*s,'#ffd574');textLabel('鐵脊礦坑',p.x,p.y+16*s,{color:'#e3d5b0'});}else if(d.type==='ruins'){pixel(g,p.x-13*s,p.y-31*s,6*s,28*s,'#c3b489');pixel(g,p.x+8*s,p.y-26*s,6*s,29*s,'#a7a780');pixel(g,p.x-5*s,p.y-15*s,8*s,2*s,'#617b53');}else{pixel(g,p.x+4*s,p.y-11*s,3*s,3*s,'#ba8c66');pixel(g,p.x-8*s,p.y-9*s,3*s,2*s,'#d3a47a');}return;}
    if(d.type==='bridgeRail'){const s=scale;pixel(g,p.x,p.y-8*s,2*s,10*s,'#6c5034');line(g,p.x-5*s,p.y-6*s,p.x+5*s,p.y-2*s,'#bfa172',2*s);return;}
    if(d.type==='signpost'&&!drawAtlasDetail('signpost',p,17,21)){const s=scale;pixel(g,p.x,p.y-18*s,2*s,19*s,'#624a31');pixel(g,p.x-7*s,p.y-21*s,17*s,8*s,'#48392b');pixel(g,p.x-6*s,p.y-20*s,15*s,6*s,'#c4a66c');pixel(g,p.x-3*s,p.y-18*s,9*s,s,'#79613c');if(scale>1.3)textLabel(d.region.name,p.x,p.y-28*s,{color:'#f7e6b2',size:7});return;}
    if(d.type==='animal'){const s=scale,bob=Math.sin(elapsed*2+d.phase)>0?1:0;pixel(g,p.x-6*s,p.y-7*s,13*s,7*s,d.variant===1?'#a47d54':'#ebe7ce');pixel(g,p.x+5*s,p.y-9*s,5*s,6*s,d.variant===1?'#694b36':'#d4c9ad');pixel(g,p.x+8*s,p.y-8*s,s,s,'#383b2b');pixel(g,p.x-4*s,p.y,2*s,(3+bob)*s,'#514335');pixel(g,p.x+4*s,p.y,2*s,(4-bob)*s,'#514335');return;}

    if(d.type==='fountain'||d.type==='well'){
      if(d.type==='well'&&drawAtlasDetail('well',p,90*d.size,91*d.size,8))return;
      const sp=atlasCell(d.type)||buildingSprite(d.type);drawSprite(sp,p,90*d.size,91*d.size,8);if(d.type==='fountain'){g.globalAlpha=.6;for(let i=0;i<4;i++){const yy=((elapsed*10+i*4)%16);pixel(g,p.x+(i%2?4:-4)*scale,p.y-(26-yy)*scale,1,2,'#e1f7e2');}g.globalAlpha=1;}return;}
    if(d.type==='rock'&&!drawAtlasDetail('boulders',p,13,10)){polygon(g,[[p.x-6*scale,p.y],[p.x-4*scale,p.y-6*scale],[p.x+2*scale,p.y-8*scale],[p.x+7*scale,p.y-2*scale],[p.x+5*scale,p.y+2*scale]],'#616e60');polygon(g,[[p.x-4*scale,p.y-5*scale],[p.x+2*scale,p.y-7*scale],[p.x+5*scale,p.y-3*scale],[p.x-1*scale,p.y-2*scale]],'#a4aa8c');return;}
    if(d.type==='bush'){pixel(g,p.x-5*scale,p.y-5*scale,11*scale,5*scale,'#4b7045');pixel(g,p.x-3*scale,p.y-8*scale,7*scale,6*scale,'#638b4c');pixel(g,p.x-2*scale,p.y-8*scale,4*scale,2*scale,'#87a85d');if(d.variant%2){pixel(g,p.x-2*scale,p.y-4*scale,2*scale,2*scale,'#d7af6a');pixel(g,p.x+3*scale,p.y-5*scale,2*scale,2*scale,'#cc7a72');}return;}
    // 圍欄不能用圖集:遊戲是「單柱+橫桿」反覆排列成連續柵欄,
    // 但圖集給的是「兩柱一段」的完整護欄板,排起來會變一段一段的鋸齒。
    // 要用的話得另外生一張「單柱+左右短橫桿」的可拼接單位。
    if(d.type==='fence'){pixel(g,p.x-2*scale,p.y-13*scale,4*scale,15*scale,'#67533a');polygon(g,[[p.x-2*scale,p.y-13*scale],[p.x,p.y-17*scale],[p.x+2*scale,p.y-13*scale]],'#67533a');pixel(g,p.x-1*scale,p.y-12*scale,2*scale,12*scale,'#b49a61');line(g,p.x-5*scale,p.y-6*scale,p.x+5*scale,p.y-11*scale,'#6e573a',2*scale);return;}
    if(d.type==='gate'){pixel(g,p.x-3*scale,p.y-28*scale,6*scale,30*scale,'#574733');pixel(g,p.x-2*scale,p.y-27*scale,3*scale,28*scale,'#b0935e');polygon(g,[[p.x-5*scale,p.y-23*scale],[p.x,p.y-35*scale],[p.x+5*scale,p.y-23*scale]],'#595a4a');pixel(g,p.x+3*scale,p.y-26*scale,10*scale,14*scale,'#904c43');pixel(g,p.x+5*scale,p.y-23*scale,6*scale,2*scale,'#e2bd72');return;}
    if(d.type==='lamp'&&!drawAtlasDetail('lamppost',p,8,24)){pixel(g,p.x,p.y-21*scale,2*scale,22*scale,'#4e4937');pixel(g,p.x-3*scale,p.y-24*scale,8*scale,7*scale,'#454935');pixel(g,p.x-2*scale,p.y-23*scale,6*scale,5*scale,'#e3b96a');pixel(g,p.x-1*scale,p.y-23*scale,2*scale,4*scale,'#ffe6a0');if(phase>.55){g.globalAlpha=.07;g.fillStyle='#ffd57b';g.beginPath();g.arc(p.x,p.y-20*scale,16*scale,0,Math.PI*2);g.fill();g.globalAlpha=1;}return;}
  }

  function drawHunter(h){if(!Number.isFinite(h.x)||!Number.isFinite(h.z))return;const p=screenPoint(h.x,h.z),old=previousPositions.get(h.id),moving=old&&Math.hypot(h.x-old.x,h.z-old.z)>.005;let facing=old?.facing||1;if(old&&Math.abs(h.x-old.x-(h.z-old.z))>.002)facing=h.x-old.x-(h.z-old.z)>0?1:-1;previousPositions.set(h.id,{x:h.x,z:h.z,facing});const frame=(moving||h.status==='戰鬥中')?Math.floor(elapsed*7+hash(h.id)%5)%2:0,isSelected=selected===`hunter:${h.id}`;
    shadow(p,6,2.4);if(isSelected)ring(p,11,'#fff1b0');
    if(h.dead||h.hp<=0){g.save();g.translate(p.x,p.y-3*scale);g.rotate(Math.PI/2);g.globalAlpha=.55;g.drawImage(heroSprite(h.classId,0,facing,hash(h.id)%3),-8*scale,-12*scale,16*scale,21*scale);g.restore();textLabel('✦',p.x,p.y-23*scale,{color:'#e7d8ef',back:false});return;}
    const sprite=heroSprite(h.classId,frame,facing,hash(h.id)%3),rect=drawSprite(sprite,p,16.5,21,2);hits.push({id:`hunter:${h.id}`,...rect});
    const full=(h.hp??1)/(h.maxHp||1);if(full<.99||isSelected||h.status==='戰鬥中')bar(p.x-9*scale,p.y-22*scale,18*scale,full,full<.35?'#df795c':'#84bf6a');
    if(isSelected)textLabel(`${h.name||'獵人'} Lv.${h.level||1}`,p.x,p.y-30*scale,{color:RARITIES.find(r=>r.id===h.rarity)?.color||'#ffe19a'});
    if(!isSelected&&scale>.65){let symbol='';if(h.status?.includes('治療')||h.status?.includes('休養'))symbol='+';else if(h.status?.includes('休息')||h.status?.includes('旅館'))symbol='z';else if(h.status?.includes('用餐'))symbol='♥';else if(h.status?.includes('飲用'))symbol='♪';else if(h.status?.includes('訓練'))symbol='↑';else if(h.status?.includes('交易'))symbol='$';if(symbol)textLabel(symbol,p.x+9*scale,p.y-23*scale-Math.sin(elapsed*3)*1.3,{size:8,color:'#f7e1a0'});}
  }
  function drawEnemy(e){if(!Number.isFinite(e.x)||!Number.isFinite(e.z)||e.hp<=0)return;const p=screenPoint(e.x,e.z),boss=e.type==='boss',sz=boss?50:e.type==='golem'?33:e.type==='wolf'?31:28;shadow(p,boss?17:10,boss?5:3);drawSprite(enemySprite(e.type,Math.floor(elapsed*3+hash(e.id)%3)%2),p,sz,sz,2);if(e.hp<e.maxHp||boss||(state.hunters||[]).some(h=>h.targetId===e.id)){bar(p.x-(boss?17:10)*scale,p.y-(sz-4)*scale,(boss?34:20)*scale,e.hp/(e.maxHp||1),boss?'#d27967':'#c68764');if(boss)textLabel('森林領主',p.x,p.y-(sz+5)*scale,{color:'#ffcc97'});}}
  function drawEffect(e){const age=e.age||0,p=screenPoint(e.x||0,e.z||0),fade=Math.max(0,1-age/1.5);if(!fade)return;g.globalAlpha=fade;const s=scale;
    if(e.type==='arrow'){const a=screenPoint(e.sourceX??e.x,e.sourceZ??e.z),u=Math.min(1,age*5),x=a.x+(p.x-a.x)*u,y=a.y-15*s+(p.y-a.y)*u;line(g,x-5*s,y-2*s,x+4*s,y+1*s,'#513e2e',2*s);line(g,x-3*s,y-2*s,x+3*s,y,'#eedda9',s);pixel(g,x+3*s,y-1*s,2*s,3*s,'#c7d5c6');}
    if(e.type==='slash'){const k=Math.min(1,age*3);g.strokeStyle='#fff0bc';g.lineWidth=3*s;g.beginPath();g.ellipse(p.x,p.y-11*s,14*s,10*s,-.5,-2+k,1+k);g.stroke();g.strokeStyle='#e6b955';g.lineWidth=s;g.stroke();}
    if(e.type==='spell'){const a=screenPoint(e.sourceX??e.x,e.sourceZ??e.z),u=Math.min(1,age*4),x=a.x+(p.x-a.x)*u,y=a.y+(p.y-a.y)*u-14*s;pixel(g,x-3*s,y-3*s,6*s,6*s,'#8a68b9');pixel(g,x-2*s,y-2*s,4*s,4*s,'#c49dea');pixel(g,x-s,y-s,2*s,2*s,'#f0e0fc');for(let i=0;i<5;i++){const an=i*1.256+age*4;pixel(g,p.x+Math.cos(an)*age*14*s,p.y-10*s+Math.sin(an)*age*14*s,2*s,2*s,'#d8b8ef');}}
    if(['heal','level','upgrade','victory','harvest','rally','recruit','purchase'].includes(e.type)){const color=e.type==='heal'?'#b9e5b6':e.type==='upgrade'||e.type==='level'?'#fff0a2':'#d6e9bf';for(let i=0;i<6;i++){const a=i*Math.PI/3+age,x=p.x+Math.cos(a)*(10+age*8)*s,y=p.y-10*s+Math.sin(a)*7*s-age*18*s;pixel(g,x-s,y-3*s,2*s,6*s,color);pixel(g,x-3*s,y-s,6*s,2*s,color);}}
    if(e.value||e.text){const txt=e.text||String(e.value);textLabel(txt,p.x,p.y-(25+age*18)*s,{color:e.color||(e.type==='hit'?'#ffac93':e.type==='heal'?'#c7ffbd':'#fff0b4'),size:8,back:false});}
    g.globalAlpha=1;
  }

  function render(){
    screen.imageSmoothingEnabled=false;g.imageSmoothingEnabled=false;g.fillStyle='#407b86';g.fillRect(0,0,width,height);hits.length=0;uiLabels.length=0;
    const gx=Math.round(width/2+(-groundOrigin.x-cam.x)*scale),gy=Math.round(height/2+50+(-groundOrigin.y-cam.y)*scale);g.drawImage(ground,gx,gy,Math.round(ground.width*scale),Math.round(ground.height*scale));
    if(quality){for(let z=WORLD.minZ+3;z<WORLD.maxZ-2;z+=4){if(isBridge(riverX(z),z))continue;const p=screenPoint(riverX(z)+Math.sin(elapsed*.45+z)*.6,z+Math.sin(elapsed*.3+z)*.4);if(p.x>0&&p.x<width&&p.y>0&&p.y<height){pixel(g,p.x-3*scale,p.y,6*scale,Math.max(1,scale),'#91c9cd');pixel(g,p.x+1*scale,p.y+2*scale,3*scale,Math.max(1,scale),'#6fb2bb');}}}
    const all=[];
    for(const d of decorations){const p=screenPoint(d.x,d.z);if(p.x>-100&&p.x<width+100&&p.y>-40&&p.y<height+260)all.push({sort:d.x+d.z,type:'decor',data:d});}
    for(const b of BUILDINGS){const p=state.layout?.[b.id]||b;all.push({sort:p.x+p.z+.2,type:'building',data:b});}
    for(const h of state.hunters||[])all.push({sort:h.x+h.z+.3,type:'hunter',data:h});
    for(const e of state.enemies||[])all.push({sort:e.x+e.z+.3,type:'enemy',data:e});
    all.sort((a,b)=>a.sort-b.sort);
    for(const item of all){if(item.type==='decor')drawDecoration(item.data);else if(item.type==='building')drawBuilding(item.data);else if(item.type==='hunter')drawHunter(item.data);else drawEnemy(item.data);}
    for(const e of state.effects||[])drawEffect(e);
    // Small ambient birds and bright drifting pollen keep the village alive.
    if(quality){for(let i=0;i<12;i++){const x=((elapsed*(2+i%3)+i*79)%width),y=(i*47+Math.sin(elapsed*.5+i)*7)%(height);g.globalAlpha=.4;pixel(g,x,y,1,1,'#f2e9be');}g.globalAlpha=1;}
    const cb=biomeAt((cam.x/PX+cam.y/PY)/2,(cam.y/PY-cam.x/PX)/2);if(quality&&cb==='snow'&&!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches){for(let i=0;i<34;i++){const x=(i*59+Math.sin(elapsed*.4+i)*12+width)%width,y=(i*41+elapsed*(6+i%4))%height;pixel(g,x,y,i%4===0?2:1,1,'#eff5e7');}}
    const night=phase>.5?Math.sin((phase-.5)*Math.PI*2)*.15:0;if(night>0){g.fillStyle=`rgba(32,43,79,${night})`;g.fillRect(0,0,width,height);}
    // Placement preview projects to the same coordinate system as simulation.
    if(placing&&hover){const p=screenPoint(hover.x,hover.z),sp=atlasCell(placing)||buildingSprite(placing);ring(p,30,'#d8ebac');drawSprite(sp,p,71,73,9,.55);textLabel('點擊放置 · ESC 取消',p.x,p.y+22,{color:'#e6edbf'});}
    if(scale<1.2){for(const r of REGIONS){const p=screenPoint(r.x,r.z);textLabel(r.name,p.x,p.y+14,{color:'#ffe6a6',size:8});}}
    screen.drawImage(buffer,0,0,canvas.width,canvas.height);screen.save();screen.font='bold 11px Microsoft JhengHei';screen.textAlign='center';screen.textBaseline='middle';for(const l of uiLabels){const x=Math.round(l.x*canvas.width/width),y=Math.round(l.y*canvas.height/height),tw=screen.measureText(l.text).width;screen.fillStyle='#263827e3';screen.fillRect(x-tw/2-5,y-8,tw+10,17);screen.fillStyle=l.color;screen.fillText(l.text,x,y);}screen.restore();
  }
  function update(dt,nextState){if(disposed)return;if(nextState){state=nextState;const key=BUILDINGS.map(b=>`${b.id}:${state.buildings?.[b.id]>0}:${state.layout?.[b.id]?.x??b.x}:${state.layout?.[b.id]?.z??b.z}`).join('|');if(key!==landscapeKey||terrainPatternRev!==lastPatternRev){lastPatternRev=terrainPatternRev;landscapeKey=key;generateGround();}}elapsed+=Math.min(dt||0,.1);heroLodScale=scale;ensureAtlas();const t=1-Math.exp(-Math.max(.016,dt||.016)*7);cam.x+=(target.x-cam.x)*t;cam.y+=(target.y-cam.y)*t;render();}
  function setTime(p){phase=typeof p==='number'?((p%1)+1)%1:.15;}
  function setQuality(v){quality=v!==false&&v!=='low';}
  function dispose(){disposed=true;for(const[type,fn]of[['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',up],['wheel',wheel]])canvas.removeEventListener(type,fn);spriteCache.clear();enemyCache.clear();}
  resize();render();return{update,resize,project,focus,setSelected,zoomBy,placeMode,setTime,setQuality,dispose,landscapeStats:()=>({trees:decorations.filter(d=>d.type==='tree').length,arenas:ARENAS.length,roads:roads.length,terrainRevision})};
}

export const createPixelWorld = createWorld;
