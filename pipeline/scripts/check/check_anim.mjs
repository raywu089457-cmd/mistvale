// check_anim.mjs — 動畫流暢度:實機逐幀記錄每隻角色畫出來的姿勢/格,找「閃一格」(A→B→A 且 B 只出現 1 幀,B 不是走路循環格)
// 2026-11-13: hitShown 只算受擊 0.4 秒內有被畫到的實體;鏡頭外的另列 hitsOffscreen(以前會被算成「沒顯示」而誤判失敗)。
// 與走路循環跳格(walkN 之後不是 walkN 或 walk(N+1));受擊回饋:每次被打(hitAt)0.4 秒內要畫出受擊/出手/倒地格(出手中被打保留出手圖)。
// 門檻:閃格率 ≤ 0.5% 的姿勢切換、走路跳格 0、受擊有畫出 ≥ 95%。
import path from 'node:path';import {pathToFileURL,fileURLToPath} from 'node:url';import {execSync} from 'node:child_process';
const pw=await import(pathToFileURL(path.join(execSync('npm root -g').toString().trim(),'playwright','index.js')).href);const {chromium}=pw.default||pw;
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');const html=process.env.HTML||path.resolve(root,'../../outputs/暮影村.html');
const secs=+(process.argv[2]||60),view=process.argv[3]||'look:19,3,2.6';
// 2026-10-27 起大圖是 media/ 外部檔:file:// 開要允許同資料夾存取,不然畫布被污染(getImageData 失敗、角色與影子畫不出來)
const b=await chromium.launch({args:['--allow-file-access-from-files']});const p=await b.newPage({viewport:{width:1440,height:900}});
await p.goto(pathToFileURL(html).href+'?preview=1'+(process.env.RENDERER?'&renderer='+process.env.RENDERER:'')+(process.env.DOLL_QS?'&'+process.env.DOLL_QS:''),{waitUntil:'load',timeout:180000});await p.waitForTimeout(1500);await p.waitForFunction(()=>globalThis.__mistvaleGame&&document.body.dataset.fps!==undefined,null,{timeout:120000});   // 開始畫面已在 2026-10-19 移除,等遊戲自己開好就好
await p.waitForFunction(()=>globalThis.__mistvaleFacing&&globalThis.__mistvaleDetails?.().ready,null,{timeout:60000});
// 紙娃娃英雄是預設(docs/PAPERDOLL.md §13)。DOLL=off → 用 __mistvaleDoll hook 切回 sheet 英雄;DOLL=hero:paladin → 只換一職業;
// 沒設 DOLL = 預設(紙娃娃),等它的資料載好再量。
if(process.env.DOLL)await p.evaluate(s=>globalThis.__mistvaleDoll(s),process.env.DOLL);
if(globalThis.process&&await p.evaluate(()=>!!globalThis.__mistvaleDoll?.().on)){
 await p.waitForFunction(()=>{const s=globalThis.__mistvaleDoll();return s.ready||s.failed;},null,{timeout:60000});
 const ds=await p.evaluate(()=>globalThis.__mistvaleDoll());console.log('doll',JSON.stringify({on:ds.on,all:ds.all,ready:ds.ready,failed:ds.failed,base:ds.base}));if(!ds.ready){console.log('doll data failed to load');process.exit(2);}}
else console.log('doll off (hero sheets)');
const r=await p.evaluate(async([secs,view])=>{const V=__mistvaleView;if(view.startsWith('look:')){const [x,z,s]=view.slice(5).split(',').map(Number);V.lookAt(x,z,s);}
 const hist=new Map(),t0=performance.now();let frames=0,dollN=0;const hits=new Map(),seenHurt=new Map(),dmg=new Set(),hitIds=new Set();
 await new Promise(res=>{let last=null;const step=()=>{const F=__mistvaleFacing(),st=__mistvaleGame.state.time;if(st!==last){last=st;frames++;const S=__mistvaleGame.state;for(const e of [...S.hunters,...S.enemies]){const id=S.hunters.includes(e)?e.id:'enemy:'+e.id;if(e.hitAt!=null&&e.hitAt<=st&&!hitIds.has(id+'@'+e.hitAt)){hitIds.add(id+'@'+e.hitAt);hits.set(id+'@'+e.hitAt,{id,t:e.hitAt,hurt:false});}}for(const fx of S.effects)if(fx.value!=null)dmg.add(fx.id);
   for(const [id,v] of Object.entries(F)){if(v.t!==st)continue;for(const hv of hits.values())if(hv.id===id&&st>=hv.t&&st-hv.t<.4)hv.drawn=true;const k0=v.pose??('m'+v.frame),k=v.doll?(v.doll.act==='walk'?'walk'+(v.doll.slot+1):v.doll.act==='idle'?'idle':k0+'#'+v.doll.act+':'+v.doll.slot):k0;if(v.doll)dollN++;if(k0==='hurt'||k0==='hurt2'||k0==='falling'||k0==='m4'||k0==='m8'||k0==='strike'||k0==='m2'||k0==='m7'||k0==='strike2'||k0==='dead')for(const [hk,hv] of hits)if(hv.id===id&&st-hv.t<.4&&st>=hv.t)hv.hurt=true;let h=hist.get(id);if(!h)hist.set(id,h=[]);h.push(k);}}
  if(performance.now()-t0<secs*1000)requestAnimationFrame(step);else res();};step();});
 let switches=0,flicker=0,walkSkip=0;const ex=[],fc={};
 for(const [id,h] of hist){for(let i=1;i<h.length;i++){if(h[i]!==h[i-1])switches++;
   if(i>=2&&h[i]===h[i-2]&&h[i-1]!==h[i]&&!/^walk|^m(3|6|10|11)$|^m[05]$|^idle2?$|^blink$/.test(h[i-1])){flicker++;fc[h[i-1]]=(fc[h[i-1]]||0)+1;if(ex.length<10)ex.push(id+': '+h.slice(i-3,i+2).join('>'));}
   const a=/^walk(\d)$/.exec(h[i-1]),c=/^walk(\d)$/.exec(h[i]);if(a&&c){const d=(+c[1]-+a[1]+4)%4;if(d>1)walkSkip++;}}}
 const H0=[...hits.values()].filter(h=>h.t<__mistvaleGame.state.time-.5),H=H0.filter(h=>h.drawn);return{hitsOffscreen:H0.length-H.length,frames,dollSamples:dollN,entities:hist.size,switches,flicker,walkSkip,byPose:fc,ex,hits:H.length,hitShown:H.filter(h=>h.hurt).length,dmgNumbers:dmg.size};},[secs,view]);
console.log(JSON.stringify(r));await b.close();process.exit(r.flicker>r.switches*.005||r.walkSkip||r.hitShown<r.hits*.95?1:0);
