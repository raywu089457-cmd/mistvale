// check_anim.mjs — 動畫流暢度:實機逐幀記錄每隻角色畫出來的姿勢/格,找「閃一格」(A→B→A 且 B 只出現 1 幀,B 不是走路循環格)
// 與走路循環跳格(walkN 之後不是 walkN 或 walk(N+1));受擊回饋:每次被打(hitAt)0.4 秒內要畫出受擊/出手/倒地格(出手中被打保留出手圖)。
// 門檻:閃格率 ≤ 0.5% 的姿勢切換、走路跳格 0、受擊有畫出 ≥ 95%。
import path from 'node:path';import {pathToFileURL,fileURLToPath} from 'node:url';import {execSync} from 'node:child_process';
const pw=await import(pathToFileURL(path.join(execSync('npm root -g').toString().trim(),'playwright','index.js')).href);const {chromium}=pw.default||pw;
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');const html=process.env.HTML||path.resolve(root,'../../outputs/暮影村.html');
const secs=+(process.argv[2]||60),view=process.argv[3]||'look:19,3,2.6';
const b=await chromium.launch();const p=await b.newPage({viewport:{width:1440,height:900}});
await p.goto(pathToFileURL(html).href+'?preview=1',{waitUntil:'load',timeout:180000});await p.waitForTimeout(1500);await p.click('#start-button');
await p.waitForFunction(()=>globalThis.__mistvaleFacing&&globalThis.__mistvaleDetails?.().ready,null,{timeout:60000});
const r=await p.evaluate(async([secs,view])=>{const V=__mistvaleView;if(view.startsWith('look:')){const [x,z,s]=view.slice(5).split(',').map(Number);V.lookAt(x,z,s);}
 const hist=new Map(),t0=performance.now();let frames=0;const hits=new Map(),seenHurt=new Map(),dmg=new Set(),hitIds=new Set();
 await new Promise(res=>{let last=null;const step=()=>{const F=__mistvaleFacing(),st=__mistvaleGame.state.time;if(st!==last){last=st;frames++;const S=__mistvaleGame.state;for(const e of [...S.hunters,...S.enemies]){const id=S.hunters.includes(e)?e.id:'enemy:'+e.id;if(e.hitAt!=null&&e.hitAt<=st&&!hitIds.has(id+'@'+e.hitAt)){hitIds.add(id+'@'+e.hitAt);hits.set(id+'@'+e.hitAt,{id,t:e.hitAt,hurt:false});}}for(const fx of S.effects)if(fx.value!=null)dmg.add(fx.id);
   for(const [id,v] of Object.entries(F)){if(v.t!==st)continue;const k=v.pose??('m'+v.frame);if(k==='hurt'||k==='m4'||k==='m8'||k==='strike'||k==='m2'||k==='m7'||k==='strike2'||k==='dead')for(const [hk,hv] of hits)if(hv.id===id&&st-hv.t<.4&&st>=hv.t)hv.hurt=true;let h=hist.get(id);if(!h)hist.set(id,h=[]);h.push(k);}}
  if(performance.now()-t0<secs*1000)requestAnimationFrame(step);else res();};step();});
 let switches=0,flicker=0,walkSkip=0;const ex=[],fc={};
 for(const [id,h] of hist){for(let i=1;i<h.length;i++){if(h[i]!==h[i-1])switches++;
   if(i>=2&&h[i]===h[i-2]&&h[i-1]!==h[i]&&!/^walk|^m[36]$|^m[05]$|^idle2?$/.test(h[i-1])){flicker++;fc[h[i-1]]=(fc[h[i-1]]||0)+1;if(ex.length<10)ex.push(id+': '+h.slice(i-3,i+2).join('>'));}
   const a=/^walk(\d)$/.exec(h[i-1]),c=/^walk(\d)$/.exec(h[i]);if(a&&c){const d=(+c[1]-+a[1]+4)%4;if(d>1)walkSkip++;}}}
 const H=[...hits.values()].filter(h=>h.t<__mistvaleGame.state.time-.5);return{frames,entities:hist.size,switches,flicker,walkSkip,byPose:fc,ex,hits:H.length,hitShown:H.filter(h=>h.hurt).length,dmgNumbers:dmg.size};},[secs,view]);
console.log(JSON.stringify(r));await b.close();process.exit(r.flicker>r.switches*.005||r.walkSkip||r.hitShown<r.hits*.95?1:0);
