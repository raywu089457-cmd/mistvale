// gl-renderer.js — 世界畫面的 WebGL2 繪製(階段 1,網址 ?renderer=gl 才開)。
// ① 實例化四邊形批次器:每個實例 = 材質格(uv)+ 2x3 仿射矩陣 + 預乘顏色/透明度 + 閃色;一次最多綁 16 張材質,
//    依呼叫順序切批次(順序跟 2D 一模一樣)。材質 = 圖片/畫布/ImageBitmap 延遲上傳(預乘 alpha、NEAREST),
//    超過 MAX_TEXTURE_SIZE 的大圖(地面畫布)自動切塊。
// ② 長得像 CanvasRenderingContext2D 的轉接物件(ctx):pixel-world.js 的繪圖函式照舊呼叫 g.drawImage/fillRect/…,
//    呼叫被轉成實例排進清單,present() 才一次送進 GPU。只實作世界繪圖用得到的子集;
//    矩形與貼圖是精確的,ellipse/arc/多邊形/線/虛線是近似(三角扇、無反鋸齒)。其他呼叫靜默略過但計數(stats().unsupported)。
const FL=20;   // 每實例 float 數:矩陣 a,b,c,d | e,f,模式,材質槽 | uv 4 | 顏色 4(預乘) | 閃色 4
const TAU=Math.PI*2;
// CanvasPattern 看不到來源圖:建立 pattern 的地方登記一下(tagPattern),fillRect 用 pattern 時才找得到材質。
const patternSrc=new WeakMap();
export function tagPattern(pat,img){if(pat&&img)patternSrc.set(pat,img);return pat;}

// ── 顏色字串 → [r,g,b,a](0–1)。常見格式自己解析;其他交給 2D 畫布正規化。無效 → null(跟 canvas 一樣保留舊值)
const colorCache=new Map();let colorProbe=null;
function parseFast(s){
  if(s.charCodeAt(0)===35){const h=s.slice(1);if(!/^[0-9a-f]+$/i.test(h))return null;const n=h.length;
    if(n===3||n===4){const v=[...h].map(c=>parseInt(c+c,16)/255);return[v[0],v[1],v[2],n===4?v[3]:1];}
    if(n===6||n===8){const v=[0,2,4,6].map(i=>parseInt(h.slice(i,i+2),16)/255);return[v[0],v[1],v[2],n===8?v[3]:1];}return null;}
  const m=/^rgba?\(\s*([-\d.]+%?)[\s,]+([-\d.]+%?)[\s,]+([-\d.]+%?)(?:\s*[,/]\s*([-\d.]+%?))?\s*\)$/i.exec(s);if(!m)return null;
  const ch=v=>Math.max(0,Math.min(1,v.endsWith('%')?parseFloat(v)/100:parseFloat(v)/255)),al=v=>v==null?1:Math.max(0,Math.min(1,v.endsWith('%')?parseFloat(v)/100:parseFloat(v)));
  const c=[ch(m[1]),ch(m[2]),ch(m[3]),al(m[4])];return c.some(Number.isNaN)?null:c;}
function parseColor(s){if(typeof s!=='string')return null;let c=colorCache.get(s);if(c!==undefined)return c;
  c=parseFast(s.trim());
  if(!c){try{colorProbe||=document.createElement('canvas').getContext('2d');colorProbe.fillStyle='#010203';colorProbe.fillStyle=s;const n=colorProbe.fillStyle;c=n==='#010203'&&s.trim().toLowerCase()!=='#010203'?null:parseFast(n)||(n==='transparent'?[0,0,0,0]:null);}catch{c=null;}}
  if(colorCache.size>4096)colorCache.clear();colorCache.set(s,c);return c;}

const VS=`#version 300 es
layout(location=0) in vec4 aM;layout(location=1) in vec4 aT;layout(location=2) in vec4 aUV;layout(location=3) in vec4 aC;layout(location=4) in vec4 aF;
uniform vec2 uView;out vec2 vUV;out vec4 vC;out vec4 vF;flat out int vU;
void main(){vec2 q=vec2(float(gl_VertexID&1),float(gl_VertexID>>1));
  if(aT.z>.5&&q.x>.5&&q.y>.5)q.x=0.;   // 三角形模式:第 4 角收到第 3 角(第二個三角形退化)
  vec2 p=aT.xy+aM.xy*q.x+aM.zw*q.y;gl_Position=vec4(p.x/uView.x*2.-1.,1.-p.y/uView.y*2.,0.,1.);
  vUV=mix(aUV.xy,aUV.zw,q);vC=aC;vF=aF;vU=int(aT.w+.5);}`;
const FS=n=>`#version 300 es
precision highp float;uniform sampler2D uT[${n}];in vec2 vUV;in vec4 vC;in vec4 vF;flat in int vU;out vec4 o;
vec4 tx(int i,vec2 uv){switch(i){${Array.from({length:n},(_,i)=>`case ${i}:return texture(uT[${i}],uv);`).join('')}}return vec4(0.);}
void main(){vec4 t=tx(vU,vUV);t.rgb=mix(t.rgb,vF.rgb*t.a,vF.a);o=t*vC;}`;

export function createGLRenderer(canvas,{onLost=()=>{},onRestored=()=>{},budgetMB=256}={}){
  let gl=null;
  try{gl=canvas.getContext('webgl2',{alpha:false,antialias:false,depth:false,stencil:false,premultipliedAlpha:true,preserveDrawingBuffer:false,powerPreference:'high-performance'});}catch{gl=null;}
  if(!gl)return null;
  let prog,vao,buf,uView,MAXU=16,MAXT=4096,white=null,fbo=null,fboTex=null,fboW=0,fboH=0,lost=false;
  let texMap=new WeakMap();const reg=new Set();let bytes=0,frame=0,uploads=0,draws=0,inst=0;
  const BUDGET=budgetMB*1048576,uns={};
  const miss=k=>{uns[k]=(uns[k]||0)+1;};
  let W=1,H=1;
  function init(){
    const sh=(t,s)=>{const o=gl.createShader(t);gl.shaderSource(o,s);gl.compileShader(o);if(!gl.getShaderParameter(o,gl.COMPILE_STATUS)&&!gl.isContextLost())throw new Error('gl shader: '+gl.getShaderInfoLog(o));return o;};
    MAXU=Math.max(1,Math.min(16,gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS)|0));MAXT=Math.max(1024,gl.getParameter(gl.MAX_TEXTURE_SIZE)|0);
    prog=gl.createProgram();gl.attachShader(prog,sh(gl.VERTEX_SHADER,VS));gl.attachShader(prog,sh(gl.FRAGMENT_SHADER,FS(MAXU)));gl.linkProgram(prog);
    if(!gl.getProgramParameter(prog,gl.LINK_STATUS)&&!gl.isContextLost())throw new Error('gl link: '+gl.getProgramInfoLog(prog));
    gl.useProgram(prog);uView=gl.getUniformLocation(prog,'uView');gl.uniform1iv(gl.getUniformLocation(prog,'uT'),Int32Array.from({length:MAXU},(_,i)=>i));
    vao=gl.createVertexArray();gl.bindVertexArray(vao);buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);
    for(let i=0;i<5;i++){gl.enableVertexAttribArray(i);gl.vertexAttribDivisor(i,1);}
    gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.disable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);
    white={tex:mkTex(new Uint8Array([255,255,255,255]),0,0,1,1,1,1,false),w:1,h:1,used:0,bytes:4};
    fbo=gl.createFramebuffer();fboTex=null;fboW=fboH=0;
  }
  // ── 材質 ─────────────────────────────────────────────────────────────
  function mkTex(src,x,y,w,h,fw,fh,repeat){const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);
    const wrap=repeat?gl.REPEAT:gl.CLAMP_TO_EDGE;gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,wrap);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,wrap);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
    if(src instanceof Uint8Array)gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,src);
    else if(x||y||w!==fw||h!==fh){   // 大圖切塊:WebGL2 的 UNPACK_SKIP_* 可以直接從圖片/畫布取子矩形;不支援就先複製到暫存畫布
      let ok=false;try{gl.pixelStorei(gl.UNPACK_SKIP_PIXELS,x);gl.pixelStorei(gl.UNPACK_SKIP_ROWS,y);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,src);ok=gl.getError()===gl.NO_ERROR;}catch{ok=false;}
      gl.pixelStorei(gl.UNPACK_SKIP_PIXELS,0);gl.pixelStorei(gl.UNPACK_SKIP_ROWS,0);
      if(!ok){const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(src,x,y,w,h,0,0,w,h);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,c);c.width=c.height=0;}}
    else gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,src);
    uploads++;return t;}
  const srcSize=s=>[s.naturalWidth??s.width??0,s.naturalHeight??s.height??0];
  // 來源 → 材質(clamp 與 repeat 分開)。圖片還沒載完/畫布 0 大小 → null(2D 也畫不出東西)。畫布尺寸變了就重傳。
  function entry(src,repeat=false){
    if(!src||lost)return null;if(src.complete===false)return null;const [w,h]=srcSize(src);if(!(w>0&&h>0))return null;
    let r=texMap.get(src);if(!r){r={};texMap.set(src,r);}const k=repeat?'rep':'clamp';let e=r[k];
    if(e&&!e.dead&&e.w===w&&e.h===h){e.used=frame;return e;}
    if(e)free(e);
    e={w,h,used:frame,bytes:w*h*4,tex:null,tiles:null,dead:false};
    try{if(w<=MAXT&&h<=MAXT)e.tex=mkTex(src,0,0,w,h,w,h,repeat);
      else{if(repeat){miss('repeatTooBig');return null;}e.tiles=[];const TS=Math.min(MAXT,4096);
        for(let y=0;y<h;y+=TS)for(let x=0;x<w;x+=TS){const tw=Math.min(TS,w-x),th=Math.min(TS,h-y);e.tiles.push({x,y,w:tw,h:th,used:frame,tex:mkTex(src,x,y,tw,th,w,h,false)});}}}
    catch(err){miss('upload:'+(err?.name||'error'));return null;}   // 例:跨來源污染的圖(SecurityError)
    r[k]=e;reg.add(e);bytes+=e.bytes;return e;}
  function free(e){if(e.dead)return;e.dead=true;if(e.tex)gl.deleteTexture(e.tex);if(e.tiles)for(const t of e.tiles)gl.deleteTexture(t.tex);reg.delete(e);bytes-=e.bytes;}
  // 呼叫端的快取把畫布丟掉時(影子 LRU、換色格)主動釋放;地面重畫時讓舊材質失效重傳。
  function release(src){const r=src&&texMap.get(src);if(!r)return;if(r.clamp)free(r.clamp);if(r.rep)free(r.rep);texMap.delete(src);}
  // 總量超過預算:丟掉 90 幀以上沒畫到的材質(最舊先丟)。呼叫端沒主動釋放的(tinted 等 WeakMap 快取)也靠這裡回收。
  function evict(){if(bytes<=BUDGET||frame%30)return;const old=[...reg].filter(e=>frame-e.used>90).sort((a,b)=>a.used-b.used);for(const e of old){if(bytes<=BUDGET*.8)break;free(e);}}

  // ── 指令清單 ─────────────────────────────────────────────────────────
  const mkList=()=>({f:new Float32Array(FL*1024),t:[],n:0});
  const lists={main:mkList(),shadow:mkList()};
  let fboEntry={tex:null,w:1,h:1,used:0};
  function slot(L,tex){if((L.n+1)*FL>L.f.length){const f=new Float32Array(L.f.length*2);f.set(L.f);L.f=f;}L.t[L.n]=tex;return(L.n++)*FL;}
  // 一個實例:t = 材質(entry 或切塊),m = 6 個矩陣值(單位正方形 → 裝置像素),uv,顏色(預乘),模式 0 四邊形 / 1 三角形
  function put(L,t,a,b,c,d,e,f,u0,v0,u1,v1,cr,cg,cb,ca,mode=0){const F=L.f,i=slot(L,t);
    F[i]=a;F[i+1]=b;F[i+2]=c;F[i+3]=d;F[i+4]=e;F[i+5]=f;F[i+6]=mode;F[i+7]=0;F[i+8]=u0;F[i+9]=v0;F[i+10]=u1;F[i+11]=v1;
    F[i+12]=cr;F[i+13]=cg;F[i+14]=cb;F[i+15]=ca;F[i+16]=F[i+17]=F[i+18]=F[i+19]=0;}
  function drawList(L){if(!L.n)return;const F=L.f,T=L.t,batches=[];let start=0,units=[],used=new Map();
    for(let i=0;i<L.n;i++){const t=T[i];let u=used.get(t);if(u===undefined){if(units.length===MAXU){batches.push([start,i,units]);start=i;units=[];used=new Map();}u=units.length;units.push(t);used.set(t,u);}F[i*FL+7]=u;}
    batches.push([start,L.n,units]);
    gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,F.subarray(0,L.n*FL),gl.STREAM_DRAW);
    for(const [s,e,us] of batches){for(let k=0;k<us.length;k++){gl.activeTexture(gl.TEXTURE0+k);gl.bindTexture(gl.TEXTURE_2D,us[k].tex);}
      const o=s*FL*4;for(let a=0;a<5;a++)gl.vertexAttribPointer(a,4,gl.FLOAT,false,FL*4,o+[0,16,32,48,64][a]);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP,0,4,e-s);draws++;}
    inst+=L.n;}
  function ensureFbo(){if(fboTex&&fboW===W&&fboH===H)return;if(fboTex)gl.deleteTexture(fboTex);fboTex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,fboTex);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,W,H,0,gl.RGBA,gl.UNSIGNED_BYTE,null);gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,fboTex,0);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    fboW=W;fboH=H;fboEntry={tex:fboTex,w:W,h:H,used:0};}
  let wantShadow=false;
  // 每幀開頭:清空清單、對齊畫布大小
  function begin(w,h){W=Math.max(1,w|0);H=Math.max(1,h|0);if(canvas.width!==W)canvas.width=W;if(canvas.height!==H)canvas.height=H;
    for(const L of Object.values(lists)){L.n=0;L.t.length=0;}frame++;draws=inst=0;wantShadow=false;if(!lost)ensureFbo();}
  // 在主清單目前位置插入「影子層整張以 alpha 壓上」(影子 FBO 在 present 時先畫好)
  function composite(alpha){if(lost)return;wantShadow=true;put(lists.main,fboEntry,W,0,0,H,0,0,0,1,1,0,alpha,alpha,alpha,alpha);}
  function present(){if(lost||gl.isContextLost())return;gl.useProgram(prog);gl.bindVertexArray(vao);gl.uniform2f(uView,W,H);
    if(wantShadow){gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.viewport(0,0,W,H);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);drawList(lists.shadow);}
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,W,H);gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT);drawList(lists.main);
    // 每幀最後把綁定的材質解開:下一幀影子 FBO 當繪製目標時,不能同時還綁在某個材質槽上(回饋迴圈)
    for(let k=0;k<MAXU;k++){gl.activeTexture(gl.TEXTURE0+k);gl.bindTexture(gl.TEXTURE_2D,null);}
    evict();}

  // ── 2D 轉接物件 ──────────────────────────────────────────────────────
  function ctx(name){const L=lists[name];
    let s={a:1,b:0,c:0,d:1,e:0,f:0,alpha:1,fill:'#000000',fillC:[0,0,0,1],fillP:null,stroke:'#000000',strokeC:[0,0,0,1],lw:1,dash:[],dashOff:0,op:'source-over',smooth:true,cap:'butt',join:'miter',font:'10px sans-serif',align:'start',base:'alphabetic',filter:'none'};
    const stack=[];let path=[],cur=null;
    const ok=(...v)=>v.every(Number.isFinite);
    const X=(x,y)=>s.a*x+s.c*y+s.e,Y=(x,y)=>s.b*x+s.d*y+s.f;
    const opCheck=()=>{if(s.op!=='source-over')miss('composite:'+s.op);if(s.filter!=='none')miss('filter');};
    // 裝置座標矩形(經過目前矩陣)→ 一個實例
    function quad(t,dx,dy,dw,dh,u0,v0,u1,v1,cr,cg,cb,ca){put(L,t,s.a*dw,s.b*dw,s.c*dh,s.d*dh,s.a*dx+s.c*dy+s.e,s.b*dx+s.d*dy+s.f,u0,v0,u1,v1,cr,cg,cb,ca);}
    function image(img,sx,sy,sw,sh,dx,dy,dw,dh){
      if(!ok(sx,sy,sw,sh,dx,dy,dw,dh))return;
      if(sw<0){sx+=sw;sw=-sw;}if(sh<0){sy+=sh;sh=-sh;}if(dw<0){dx+=dw;dw=-dw;}if(dh<0){dy+=dh;dh=-dh;}
      if(!sw||!sh||!dw||!dh)return;const e=entry(img);if(!e)return;opCheck();
      const kx=dw/sw,ky=dh/sh,al=s.alpha;if(al<=0)return;
      // 來源矩形裁到圖內,目的地等比例縮(跟 canvas 規格一樣;不裁的話 CLAMP 會把邊緣像素拉長)
      const x0=Math.max(sx,0),y0=Math.max(sy,0),x1=Math.min(sx+sw,e.w),y1=Math.min(sy+sh,e.h);if(x1<=x0||y1<=y0)return;
      if(!e.tiles){quad(e,dx+(x0-sx)*kx,dy+(y0-sy)*ky,(x1-x0)*kx,(y1-y0)*ky,x0/e.w,y0/e.h,x1/e.w,y1/e.h,al,al,al,al);return;}
      for(const t of e.tiles){const a0=Math.max(x0,t.x),b0=Math.max(y0,t.y),a1=Math.min(x1,t.x+t.w),b1=Math.min(y1,t.y+t.h);if(a1<=a0||b1<=b0)continue;
        quad(t,dx+(a0-sx)*kx,dy+(b0-sy)*ky,(a1-a0)*kx,(b1-b0)*ky,(a0-t.x)/t.w,(b0-t.y)/t.h,(a1-t.x)/t.w,(b1-t.y)/t.h,al,al,al,al);}}
    const solid=c=>{const a=c[3]*s.alpha;return a>0?[c[0]*a,c[1]*a,c[2]*a,a]:null;};
    function tri(c,x0,y0,x1,y1,x2,y2){put(L,white,x1-x0,y1-y0,x2-x0,y2-y0,x0,y0,.5,.5,.5,.5,c[0],c[1],c[2],c[3],1);}
    function seg(c,x0,y0,x1,y1,w){const dx=x1-x0,dy=y1-y0,l=Math.hypot(dx,dy);if(!l)return;const nx=-dy/l*w/2,ny=dx/l*w/2;put(L,white,dx,dy,2*nx,2*ny,x0-nx,y0-ny,.5,.5,.5,.5,c[0],c[1],c[2],c[3]);}
    // 多邊形填色:凸的用三角扇,凹的用耳切法(簡單多邊形);自交的近似
    function fillPoly(c,p){let n=p.length/2;if(n>2&&p[0]===p[2*n-2]&&p[1]===p[2*n-1])n--;if(n<3)return;
      let area=0,convex=true,sign=0;for(let i=0;i<n;i++){const j=(i+1)%n,k=(i+2)%n;area+=p[2*i]*p[2*j+1]-p[2*j]*p[2*i+1];
        const cr=(p[2*j]-p[2*i])*(p[2*k+1]-p[2*j+1])-(p[2*j+1]-p[2*i+1])*(p[2*k]-p[2*j]);if(cr){const sg=Math.sign(cr);if(sign&&sg!==sign)convex=false;sign=sg;}}
      if(convex){for(let i=1;i<n-1;i++)tri(c,p[0],p[1],p[2*i],p[2*i+1],p[2*i+2],p[2*i+3]);return;}
      const idx=[...Array(n).keys()],o=area>0?1:-1;let guard=n*n+8;
      const cross=(a,b,q)=>(p[2*b]-p[2*a])*(p[2*q+1]-p[2*a+1])-(p[2*b+1]-p[2*a+1])*(p[2*q]-p[2*a]);
      while(idx.length>3&&guard-->0){let cut=false;
        for(let i=0;i<idx.length;i++){const a=idx[(i+idx.length-1)%idx.length],b=idx[i],q=idx[(i+1)%idx.length];if(cross(a,b,q)*o<=0)continue;
          let inside=false;for(const r of idx){if(r===a||r===b||r===q)continue;if(cross(a,b,r)*o>0&&cross(b,q,r)*o>0&&cross(q,a,r)*o>0){inside=true;break;}}
          if(inside)continue;tri(c,p[2*a],p[2*a+1],p[2*b],p[2*b+1],p[2*q],p[2*q+1]);idx.splice(i,1);cut=true;break;}
        if(!cut)break;}
      for(let i=1;i<idx.length-1;i++)tri(c,p[2*idx[0]],p[2*idx[0]+1],p[2*idx[i]],p[2*idx[i]+1],p[2*idx[i+1]],p[2*idx[i+1]+1]);}
    function newSub(x,y){cur={p:[x,y],closed:false};path.push(cur);}
    const g={
      get canvas(){return{width:W,height:H};},
      get globalAlpha(){return s.alpha;},set globalAlpha(v){v=+v;if(v>=0&&v<=1)s.alpha=v;},
      get fillStyle(){return s.fill;},set fillStyle(v){if(typeof v==='string'){const c=parseColor(v);if(c){s.fill=v;s.fillC=c;s.fillP=null;}}else if(v&&typeof v==='object'){s.fill=v;s.fillP=v;}},
      get strokeStyle(){return s.stroke;},set strokeStyle(v){if(typeof v==='string'){const c=parseColor(v);if(c){s.stroke=v;s.strokeC=c;}}else if(v){miss('strokePattern');}},
      get lineWidth(){return s.lw;},set lineWidth(v){v=+v;if(v>0&&Number.isFinite(v))s.lw=v;},
      get lineDashOffset(){return s.dashOff;},set lineDashOffset(v){v=+v;if(Number.isFinite(v))s.dashOff=v;},
      get globalCompositeOperation(){return s.op;},set globalCompositeOperation(v){s.op=String(v);},
      get imageSmoothingEnabled(){return s.smooth;},set imageSmoothingEnabled(v){s.smooth=!!v;},   // 一律 NEAREST(世界繪圖本來就關平滑)
      imageSmoothingQuality:'low',
      get lineCap(){return s.cap;},set lineCap(v){s.cap=v;},get lineJoin(){return s.join;},set lineJoin(v){s.join=v;},miterLimit:10,
      get font(){return s.font;},set font(v){s.font=v;},get textAlign(){return s.align;},set textAlign(v){s.align=v;},get textBaseline(){return s.base;},set textBaseline(v){s.base=v;},
      get filter(){return s.filter;},set filter(v){s.filter=String(v);},
      save(){stack.push({...s,dash:s.dash.slice()});},restore(){if(stack.length)s=stack.pop();},
      setTransform(a,b,c,d,e,f){if(a&&typeof a==='object'){({a,b,c,d,e,f}=a);}else if(a===undefined){a=d=1;b=c=e=f=0;}if(!ok(a,b,c,d,e,f))return;s.a=a;s.b=b;s.c=c;s.d=d;s.e=e;s.f=f;},
      resetTransform(){s.a=s.d=1;s.b=s.c=s.e=s.f=0;},
      getTransform(){return new DOMMatrix([s.a,s.b,s.c,s.d,s.e,s.f]);},
      translate(x,y){if(!ok(x,y))return;s.e+=s.a*x+s.c*y;s.f+=s.b*x+s.d*y;},
      scale(x,y){if(!ok(x,y))return;s.a*=x;s.b*=x;s.c*=y;s.d*=y;},
      rotate(r){if(!ok(r))return;const co=Math.cos(r),si=Math.sin(r),{a,b,c,d}=s;s.a=a*co+c*si;s.b=b*co+d*si;s.c=c*co-a*si;s.d=d*co-b*si;},
      transform(A,B,C,D,E,F){if(!ok(A,B,C,D,E,F))return;const {a,b,c,d,e,f}=s;s.a=a*A+c*B;s.b=b*A+d*B;s.c=a*C+c*D;s.d=b*C+d*D;s.e=a*E+c*F+e;s.f=b*E+d*F+f;},
      drawImage(img,a1,a2,a3,a4,a5,a6,a7,a8){const n=arguments.length,[iw,ih]=img?srcSize(img):[0,0];
        if(n===3)image(img,0,0,iw,ih,a1,a2,iw,ih);else if(n===5)image(img,0,0,iw,ih,a1,a2,a3,a4);else if(n===9)image(img,a1,a2,a3,a4,a5,a6,a7,a8);else miss('drawImage/'+n);},
      fillRect(x,y,w,h){if(!ok(x,y,w,h)||!w||!h)return;if(w<0){x+=w;w=-w;}if(h<0){y+=h;h=-h;}opCheck();
        if(s.fillP){const src=patternSrc.get(s.fillP),e=src&&entry(src,true);if(!e){miss('pattern');return;}const al=s.alpha;if(al>0)quad(e,x,y,w,h,x/e.w,y/e.h,(x+w)/e.w,(y+h)/e.h,al,al,al,al);return;}
        const c=solid(s.fillC);if(c)quad(white,x,y,w,h,.5,.5,.5,.5,c[0],c[1],c[2],c[3]);},
      // 整張清掉 = 這層從頭開始;局部清除(要改混色模式)階段 1 不支援
      clearRect(x,y,w,h){const xs=[X(x,y),X(x+w,y),X(x,y+h),X(x+w,y+h)],ys=[Y(x,y),Y(x+w,y),Y(x,y+h),Y(x+w,y+h)];
        if(Math.min(...xs)<=0&&Math.min(...ys)<=0&&Math.max(...xs)>=W&&Math.max(...ys)>=H){L.n=0;L.t.length=0;if(name==='main')wantShadow=false;}else miss('clearRect');},
      beginPath(){path=[];cur=null;},
      moveTo(x,y){if(ok(x,y))newSub(X(x,y),Y(x,y));},
      lineTo(x,y){if(!ok(x,y))return;if(!cur){newSub(X(x,y),Y(x,y));return;}cur.p.push(X(x,y),Y(x,y));},
      closePath(){if(cur&&cur.p.length){cur.closed=true;newSub(cur.p[0],cur.p[1]);}},
      rect(x,y,w,h){if(!ok(x,y,w,h))return;newSub(X(x,y),Y(x,y));cur.p.push(X(x+w,y),Y(x+w,y),X(x+w,y+h),Y(x+w,y+h),X(x,y+h),Y(x,y+h));cur.closed=true;newSub(X(x,y),Y(x,y));},
      ellipse(x,y,rx,ry,rot,a0,a1,ccw=false){if(!ok(x,y,rx,ry,rot,a0,a1)||rx<0||ry<0)return;
        let sw=a1-a0;if(!ccw){if(sw>=TAU)sw=TAU;else{sw%=TAU;if(sw<0)sw+=TAU;}}else{if(-sw>=TAU)sw=-TAU;else{sw%=TAU;if(sw>0)sw-=TAU;}}
        const r=Math.max(rx,ry)*Math.sqrt(Math.abs(s.a*s.d-s.b*s.c)),n=Math.max(2,Math.ceil(Math.abs(sw)/TAU*Math.max(12,Math.min(96,r*1.2)))),co=Math.cos(rot),si=Math.sin(rot);
        for(let i=0;i<=n;i++){const t=a0+sw*i/n,ex=rx*Math.cos(t),ey=ry*Math.sin(t),px=x+co*ex-si*ey,py=y+si*ex+co*ey;if(i===0&&!(cur&&cur.p.length))newSub(X(px,py),Y(px,py));else cur.p.push(X(px,py),Y(px,py));}},
      arc(x,y,r,a0,a1,ccw=false){g.ellipse(x,y,r,r,0,a0,a1,ccw);},
      fill(a){if(a&&typeof a==='object'){miss('fill(Path2D)');return;}opCheck();if(s.fillP){miss('fillPattern');return;}const c=solid(s.fillC);if(!c)return;for(const sp of path)if(sp.p.length>=6)fillPoly(c,sp.p);},
      stroke(a){if(a&&typeof a==='object'){miss('stroke(Path2D)');return;}opCheck();const c=solid(s.strokeC);if(!c)return;const k=Math.sqrt(Math.abs(s.a*s.d-s.b*s.c)),w=s.lw*k;
        const dash=s.dash.length?s.dash.map(v=>v*k):null,dl=dash?dash.reduce((q,v)=>q+v,0):0;
        for(const sp of path){const p=sp.p.slice();if(sp.closed&&p.length>=4)p.push(p[0],p[1]);if(p.length<4)continue;
          if(!dash||!(dl>0)){for(let i=0;i+3<p.length;i+=2)seg(c,p[i],p[i+1],p[i+2],p[i+3],w);continue;}
          // 虛線:沿路徑累積長度,依 dash 樣式切段(lineDashOffset 一併算進去)
          let di=0,left=dash[0],on=true,off=((s.dashOff*k)%dl+dl)%dl;while(off>0){if(off>=left){off-=left;di=(di+1)%dash.length;left=dash[di];on=!on;}else{left-=off;off=0;}}
          for(let i=0;i+3<p.length;i+=2){let x0=p[i],y0=p[i+1];const x1=p[i+2],y1=p[i+3];let L0=Math.hypot(x1-x0,y1-y0);if(!L0)continue;const ux=(x1-x0)/L0,uy=(y1-y0)/L0;
            while(L0>0){const st=Math.min(left,L0),nx=x0+ux*st,ny=y0+uy*st;if(on)seg(c,x0,y0,nx,ny,w);x0=nx;y0=ny;L0-=st;left-=st;if(left<=1e-6){di=(di+1)%dash.length;left=dash[di];on=!on;}}}}},
      setLineDash(a){if(!Array.isArray(a)||!a.every(v=>Number.isFinite(v)&&v>=0))return;s.dash=a.length%2?[...a,...a]:a.slice();},
      getLineDash(){return s.dash.slice();},
      clip(){miss('clip');},fillText(){miss('fillText');},strokeText(){miss('strokeText');},measureText(t){miss('measureText');return{width:0};},
      createPattern(){miss('createPattern');return null;},getImageData(){miss('getImageData');return null;},putImageData(){miss('putImageData');},
    };
    return g;}

  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();lost=true;try{onLost();}catch(err){console.error(err);}});
  canvas.addEventListener('webglcontextrestored',()=>{texMap=new WeakMap();reg.clear();bytes=0;try{init();lost=false;onRestored();}catch(err){console.error(err);}});
  try{init();}catch(err){console.error(err);return null;}
  return{gl,canvas,ctx,begin,composite,present,release,invalidate:release,get lost(){return lost||gl.isContextLost();},
    stats:()=>({lost,draws,instances:inst,textures:reg.size,mb:+(bytes/1048576).toFixed(1),uploads,maxTexture:MAXT,units:MAXU,unsupported:{...uns},renderer:gl.getParameter(gl.RENDERER)}),
    resetStats(){for(const k in uns)delete uns[k];uploads=0;}};
}
