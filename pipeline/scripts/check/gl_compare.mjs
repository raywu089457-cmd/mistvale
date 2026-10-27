// gl_compare.mjs — 世界繪製 2D(預設)與 WebGL2(?renderer=gl)逐場景截圖比對 + 每幀時間。
// 用法:npm run build 後 node pipeline/scripts/check/gl_compare.mjs [輸出資料夾=output/gl-compare] [場景名,…]
// 做法:兩個分頁(2d / gl)載入同一個 HTML → 都暫停 → 把 2d 分頁的模擬狀態 JSON 複製到兩邊 → 兩邊用同一組亂數種子、
//   固定 dt 手動跑 90 步(讓會動單位的面向/走路記憶一致)→ 每個場景兩邊做同樣的鏡頭/時間/選取設定 → 截圖、在瀏覽器裡算像素差。
// 輸出:<場景>-2d.png / -gl.png / -diff.png(紅 = 差異)、summary.json。差異門檻:任一色版差 > 24 算不同。
// 「靜態區」比例 = 扣掉英雄/魔物/特效周圍的框之後的差異(單位的走路相位等繪製記憶兩邊不同,見報告)。
// 2dcache:2D 分頁「目前畫面(靜止快取/髒矩形)」對「強制整張重畫」的差,> 0 表示 2D 快取路徑本身畫錯(殘影/漏畫),差異圖 <場景>-2dcache-diff.png。
// 時間:同一幀重畫 20 次取平均(含 GPU 同步:2D getImageData、GL readPixels)。無頭 Chromium 的 WebGL 是 SwiftShader(CPU 模擬 GPU),
//   GL 數字只供參考、不代表真機;still = 鏡頭不動(2D 走靜止快取),pan = 每幀移鏡頭(2D 不能用快取);cpu = GL 只算 JS(每幀不等 GPU,最後才同步一次)。
import path from 'node:path';import fs from 'node:fs';import {pathToFileURL,fileURLToPath} from 'node:url';import {execSync} from 'node:child_process';
const pw=await import(pathToFileURL(path.join(execSync('npm root -g').toString().trim(),'playwright','index.js')).href);const {chromium}=pw.default||pw;
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const html=process.env.HTML||[path.resolve(root,'../../outputs/暮影村.html'),path.join(root,'dist/暮影村.html')].find(f=>fs.existsSync(f));
const out=path.resolve(root,process.argv[2]||'output/gl-compare');fs.mkdirSync(out,{recursive:true});
const only=process.argv[3]?new Set(process.argv[3].split(',')):null;
// 場景:每個都是「在頁面裡執行」的設定(兩個分頁執行同一段)
const SCENES=[
  {name:'village',desc:'村莊中心(首頁構圖)',setup:'V.focus("home")'},
  {name:'zoomout',desc:'拉遠看全世界(含地名文字)',setup:'V.focus("world")'},
  {name:'zoomin',desc:'拉近村莊廣場',setup:'V.lookAt(-8,2,4.2)'},
  {name:'snow',desc:'雪地',setup:'V.focus("region:snow")'},
  {name:'combat',desc:'戰鬥中的獵人',setup:'const h=G.state.hunters.find(h=>h.status==="戰鬥中"&&h.hp>0)||G.state.hunters.find(h=>h.hp>0&&!h.inVillage);if(h)V.lookAt(h.x,h.z,2.6);'},
  {name:'night',desc:'夜晚(村莊)',setup:'V.focus("home");G.state.time=Math.floor(G.state.time/240)*240+180;'},
  {name:'selected',desc:'選取建築(城鎮大廳)',setup:'V.setSelected("hall");V.focus("hall");'},
  {name:"labels",desc:"縮放 1.18(地名 + 建築名牌同時出現)",setup:"V.lookAt(-8,2,1.18)"},
].filter(s=>!only||only.has(s.name));
const b=await chromium.launch({args:['--allow-file-access-from-files','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const errs={'2d':[],gl:[]};
async function open(r){const p=await b.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});p.on('pageerror',e=>errs[r].push(e.message));
  await p.goto(pathToFileURL(html).href+'?preview=1&renderer='+r,{waitUntil:'load',timeout:180000});
  await p.waitForFunction(()=>globalThis.__mistvaleGame&&globalThis.__mistvaleView&&document.body.dataset.fps,null,{timeout:180000});
  await p.waitForFunction(()=>globalThis.__mistvaleDetails?.().ready!==false,null,{timeout:60000}).catch(()=>{});
  await p.waitForTimeout(2500);
  // 介面(上下列、面板、提示)藏起來,只留世界畫布與夜晚覆蓋層
  await p.addStyleTag({content:'body>*:not(canvas):not([data-keep]){visibility:hidden!important}'});
  await p.evaluate(()=>{for(const el of document.body.children)if(el.tagName==='DIV'&&el.style.background&&el.style.pointerEvents==='none'&&el.style.position==='fixed')el.dataset.keep='1';});
  return p;}
const P={'2d':await open('2d'),gl:await open('gl')};
const info=await P.gl.evaluate(()=>{const c=document.createElement('canvas').getContext('webgl2'),d=c&&c.getExtension('WEBGL_debug_renderer_info');return{webgl2:!!c,renderer:d?c.getParameter(d.UNMASKED_RENDERER_WEBGL):c?.getParameter(c.RENDERER),gl:globalThis.__mistvaleGL?.()};});
console.log('GL:',JSON.stringify({webgl2:info.webgl2,renderer:info.renderer,mode:info.gl?.mode}));
if(info.gl?.mode!=='gl')console.log('!! gl 分頁沒有進 GL 模式(WebGL2 不可用?),比較沒有意義');
// 同一份狀態 + 同一組亂數 + 固定 dt
const snap=await P['2d'].evaluate(()=>{__mistvaleGame.state.paused=true;return JSON.stringify(__mistvaleGame.state);});
const prep=async p=>p.evaluate(snap=>{const G=__mistvaleGame,V=__mistvaleView,s=JSON.parse(snap);for(const k of Object.keys(G.state))if(!(k in s))delete G.state[k];Object.assign(G.state,s);G.state.paused=true;
  let a=20261027;Math.random=()=>{a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};
  globalThis.__mistvaleClock?.(100);V.focus('home');
  for(let i=0;i<90;i++){G.state.paused=false;try{G.tick(1/30);}finally{G.state.paused=true;}V.setTime((G.state.time%240)/240);V.update(1/30,G.state);}
  return{time:G.state.time,hunters:G.state.hunters.map(h=>[h.id,+h.x.toFixed(3),+h.z.toFixed(3),h.status]).slice(0,3)};},snap);
const ra=await prep(P['2d']),rb=await prep(P.gl);
const same=JSON.stringify(ra)===JSON.stringify(rb);console.log('state replay identical:',same,JSON.stringify(ra).slice(0,160));
const base=await P['2d'].evaluate(()=>JSON.stringify(__mistvaleGame.state));
// 單位/特效的畫面框(不算進「靜態區」)
const unitBoxes=p=>p.evaluate(()=>{const V=__mistvaleView,S=__mistvaleGame.state,k=V.getScale(),r=[];
  for(const u of [...S.hunters,...(S.wanderers||[]),...S.enemies]){if(!Number.isFinite(u.x))continue;const q=V.project(u.x,0,u.z);r.push([q.x-45*k,q.y-75*k,q.x+45*k,q.y+20*k]);}
  for(const e of S.effects||[]){const q=V.project(e.x||0,0,e.z||0);r.push([q.x-40*k,q.y-60*k,q.x+40*k,q.y+25*k]);}return r;});
async function timing(p,mode){return p.evaluate(async([mode,isGL])=>{const V=__mistvaleView,G=__mistvaleGame,N=20;
  const sync=isGL&&document.querySelector('canvas[aria-hidden]')?(()=>{const gl=document.querySelector('canvas[aria-hidden]').getContext('webgl2'),px=new Uint8Array(4);return()=>gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,px);})():(()=>{const c=document.querySelector('#world').getContext('2d');return()=>c.getImageData(0,0,1,1);})();
  const s=V.getScale();for(let i=0;i<3;i++)V.update(0,G.state);sync();
  const t0=performance.now();for(let i=0;i<N;i++){if(mode==='pan')V.zoomTo(s*(i%2?1.0001:1));if(mode==='pan')__mistvaleForceFull();V.update(0,G.state);if(mode!=='cpu')sync();}
  const ms=(performance.now()-t0)/N;sync();V.zoomTo(s);V.update(0,G.state);return +ms.toFixed(2);},[mode,mode&&p===P.gl]);}
async function diff(a,bb,boxes){const q=await b.newPage();try{return await q.evaluate(async([a,bb,boxes])=>{
  const load=src=>new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=src;});
  const [A,B]=await Promise.all([load(a),load(bb)]),w=A.width,h=A.height,c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');
  x.drawImage(A,0,0);const da=x.getImageData(0,0,w,h);x.clearRect(0,0,w,h);x.drawImage(B,0,0);const db=x.getImageData(0,0,w,h);
  const mask=new Uint8Array(w*h);for(const [x0,y0,x1,y1] of boxes)for(let y=Math.max(0,y0|0);y<Math.min(h,y1);y++)for(let X=Math.max(0,x0|0);X<Math.min(w,x1);X++)mask[y*w+X]=1;
  const o=x.createImageData(w,h);let n=0,ns=0,nsTot=0,any=0;
  for(let i=0;i<w*h;i++){const j=i*4,d=Math.max(Math.abs(da.data[j]-db.data[j]),Math.abs(da.data[j+1]-db.data[j+1]),Math.abs(da.data[j+2]-db.data[j+2]));
    if(d)any++;const bad=d>24;if(bad)n++;if(!mask[i]){nsTot++;if(bad)ns++;}
    const gray=(da.data[j]+da.data[j+1]+da.data[j+2])/3*.35+160;o.data[j]=bad?255:gray;o.data[j+1]=bad?0:gray;o.data[j+2]=bad?(mask[i]?255:0):gray;o.data[j+3]=255;}
  x.putImageData(o,0,0);return{ratio:n/(w*h),staticRatio:nsTot?ns/nsTot:0,anyRatio:any/(w*h),png:c.toDataURL('image/png')};},[a,bb,boxes]);}finally{await q.close();}}
const rows=[];
for(const sc of SCENES){
  // 每個場景從同一份狀態開始(前一個場景改過的時間/選取還原)
  for(const r of ['2d','gl'])await P[r].evaluate(([snap,code])=>{const G=__mistvaleGame,V=__mistvaleView,s=JSON.parse(snap);Object.assign(G.state,s);G.state.paused=true;V.setSelected(null);globalThis.__mistvaleClock?.(103);
    new Function('G','V',code)(G,V);V.setTime((G.state.time%240)/240);
    // focus() 只設目標、鏡頭每幀平滑靠過去:畫到鏡頭位置連續 5 幀不變才算到位(兩個分頁才會是同一個畫面)
    let last='',same=0;for(let i=0;i<400&&same<5;i++){V.update(0,G.state);const q=V.project(0,0,0),k=q.x+','+q.y;same=k===last?same+1:0;last=k;}},[base,sc.setup]);
  await Promise.all(['2d','gl'].map(r=>P[r].waitForTimeout(900)));   // 讓 10fps 的暫停迴圈畫幾幀(GL 第一次用到的材質在這裡上傳)
  const shot={};for(const r of ['2d','gl']){const f=path.join(out,`${sc.name}-${r}.png`);await P[r].screenshot({path:f});shot[r]='data:image/png;base64,'+fs.readFileSync(f).toString('base64');}
  const boxes=await unitBoxes(P['2d']);const d=await diff(shot['2d'],shot.gl,boxes);fs.writeFileSync(path.join(out,`${sc.name}-diff.png`),Buffer.from(d.png.split(',')[1],'base64'));
  // 2D 自己的對照:目前畫面(走靜止快取/髒矩形)vs 強制整張重畫的同一幀(在同一段 JS 裡讀畫布,不會被下一幀插隊)
  const pair=await P['2d'].evaluate(()=>{const c=document.querySelector('#world'),V=__mistvaleView,G=__mistvaleGame;V.update(0,G.state);V.update(0,G.state);const a=c.toDataURL();__mistvaleForceFull();V.update(0,G.state);return[a,c.toDataURL()];});
  const dc=await diff(pair[0],pair[1],[]);if(dc.ratio>0)fs.writeFileSync(path.join(out,`${sc.name}-2dcache-diff.png`),Buffer.from(dc.png.split(',')[1],'base64'));
  const t={still2d:await timing(P['2d'],'still'),stillGL:await timing(P.gl,'still'),pan2d:await timing(P['2d'],'pan'),panGL:await timing(P.gl,'pan'),cpuGL:await timing(P.gl,'cpu')};
  const st=await P.gl.evaluate(()=>globalThis.__mistvaleGL?.()||{unsupported:{}});const tx=await P['2d'].evaluate(()=>__mistvalePerf().texts);
  const row={scene:sc.name,desc:sc.desc,diff:+(d.ratio*100).toFixed(3),staticDiff:+(d.staticRatio*100).toFixed(3),anyDiff:+(d.anyRatio*100).toFixed(2),cache2d:+(dc.ratio*100).toFixed(3),texts:tx,ms:t,gl:{draws:st.draws,instances:st.instances,textures:st.textures,mb:st.mb,unsupported:st.unsupported}};
  rows.push(row);console.log(`${sc.name.padEnd(9)} 差異 ${String(row.diff).padStart(6)}%  靜態區 ${String(row.staticDiff).padStart(6)}%  (任何差 ${row.anyDiff}%)  2D快取vs整張 ${row.cache2d}%  文字 ${tx}  ms 2d still/pan ${t.still2d}/${t.pan2d}  gl ${t.stillGL}/${t.panGL} (JS ${t.cpuGL})  批次 ${st.draws} 實例 ${st.instances} 材質 ${st.textures}(${st.mb} MB)${Object.keys(st.unsupported).length?' 不支援 '+JSON.stringify(st.unsupported):''}`);
}
const summary={html,renderer:info.renderer,note:'GL 在無頭 Chromium 是 SwiftShader(CPU 模擬),時間只供參考',stateReplayIdentical:same,rows,errors:errs};
fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(summary,null,1));
console.log('errors',JSON.stringify(errs));console.log('輸出:',out);
await b.close();
