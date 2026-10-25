// check_facing.mjs — 實機每一幀比對「畫出來的朝向/動畫」與「實際移動方向/攻擊目標」(用 __mistvaleFacing() hook)。
// 用法:npm run build 後 node pipeline/scripts/check/check_facing.mjs [秒數=60] [鏡頭 world | look:x,z,縮放] [截圖前綴]
// 項目:heroWalk 走路圖朝向＝螢幕上移動方向;heroAnim 走路圖⇔真的在走;heroCombat 蓄力/出手朝目標、受擊朝打來的一側;enemy* 同理。*Bad 應全為 0。
import path from 'node:path';import fs from 'node:fs';
import {pathToFileURL} from 'node:url';import {execSync} from 'node:child_process';
const pw=await import(pathToFileURL(path.join(execSync('npm root -g').toString().trim(),'playwright','index.js')).href);
const {chromium}=pw.default||pw;
const html=process.env.HTML||path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'../../../../../outputs/暮影村.html');
const secs=+(process.argv[2]||60),view=process.argv[3]||'world',shots=process.argv[4];
const b=await chromium.launch();const p=await b.newPage({viewport:{width:1440,height:900}});
const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto(pathToFileURL(html).href+'?preview=1',{waitUntil:'load',timeout:180000});
await p.waitForTimeout(1500);
// 開場畫面已經拿掉了(載入完成直接進村):有 #start-button 才按,沒有就等遊戲自己起來。
if(await p.$('#start-button'))await p.waitForFunction(()=>globalThis.__mistvaleGame&&document.body.dataset.fps!==undefined,null,{timeout:120000});   // 開始畫面已在 2026-10-19 移除,等遊戲自己開好就好
await p.waitForFunction(()=>globalThis.__mistvaleFacing&&globalThis.__mistvaleGame&&document.body.dataset.fps,null,{timeout:120000});
await p.evaluate(v=>{
 const V=__mistvaleView,G=__mistvaleGame;if(v.startsWith('look:')){const [x,z,s]=v.slice(5).split(',').map(Number);V.lookAt(x,z,s);}else V.focus(v);
 const prev=new Map(),lastMoved=new Map(),R=globalThis.__fc={n:0,heroWalk:0,heroWalkBad:0,heroAnimBad:0,heroCombat:0,heroCombatBad:0,enemyWalk:0,enemyWalkBad:0,enemyCombat:0,enemyCombatBad:0,enemyAnimBad:0,examples:[],poses:{}};
 // 走路的姿勢會「停下來後再維持 0.18 秒」(避免 idle/walk 每幀互換),所以站著畫走路姿勢算正常,
 // 只有「停超過 0.25 秒還在畫走路」才當錯。位置也改成跟「上一次真的被畫出來的那一幀」比,
 // 不然沒被畫到的幀會讓位移與姿勢對不上(誤判成 idle while walking)。
 const sx=(x,z)=>x-z,bad=(k,o)=>{R[k]++;if(R.examples.length<40)R.examples.push({k,...o});};
 const orig=V.update.bind(V);V.update=(dt,state)=>{const r=orig(dt,state),F=__mistvaleFacing(),t=state.time;
  for(const h of [...state.hunters,...(state.wanderers||[])]){const d=F[h.id];if(!d||d.t!==t||h.hp<=0)continue;const o=prev.get(h.id);prev.set(h.id,{x:h.x,z:h.z});if(!o)continue;
   const dsx=sx(h.x,h.z)-sx(o.x,o.z),moved=Math.hypot(h.x-o.x,h.z-o.z);
   if(moved>.001)lastMoved.set(h.id,t);
   if(d.pose.startsWith('walk')){if(moved<.001){if(t-(lastMoved.get(h.id)??-9)>.25)bad('heroAnimBad',{id:h.id,why:'walk pose but standing',st:h.status});}else if(Math.abs(dsx)>.01){R.heroWalk++;if(Math.sign(dsx)!==d.f)bad('heroWalkBad',{id:h.id,dsx:+dsx.toFixed(3),f:d.f,st:h.status});}}
   else if(['idle','idle2','blink','rest','eat','drink','sleep','bandaged','trade','train','victory','dead','falling','getup'].includes(d.pose)){if(moved>.02&&h.status!=='戰鬥中')bad('heroAnimBad',{id:h.id,why:'idle pose while walking',moved:+moved.toFixed(3),st:h.status});}
   else{const tgt=(d.pose==='hurt'||d.pose==='hurt2')?{x:h.hitFromX,z:h.hitFromZ}:(d.pose==='strike'||d.pose==='strike2')?{x:h.atkX,z:h.atkZ}:state.enemies.find(e=>e.id===h.targetId);if(tgt&&tgt.x!=null){const ds=sx(tgt.x,tgt.z)-sx(h.x,h.z);if(Math.abs(ds)>.4){R.heroCombat++;if(Math.sign(ds)!==d.f)bad('heroCombatBad',{id:h.id,pose:d.pose,ds:+ds.toFixed(2),f:d.f});}}}}
  for(const e of state.enemies){const d=F['enemy:'+e.id];if(!d||d.t!==t)continue;const o=prev.get(e.id);prev.set(e.id,{x:e.x,z:e.z});if(!o)continue;
   const dsx=sx(e.x,e.z)-sx(o.x,o.z),moved=Math.hypot(e.x-o.x,e.z-o.z);
   if(!e.engaged&&([3,6,10,11].includes(d.frame)||(e.type==='slime'&&d.frame===0&&moved>.003))){if(Math.abs(dsx)>.006){R.enemyWalk++;if(Math.sign(dsx)!==d.f)bad('enemyWalkBad',{id:e.id,type:e.type,dsx:+dsx.toFixed(3),f:d.f});}}
   else if(!e.engaged&&(d.frame===0||d.frame===5)&&e.type!=='slime'&&moved>.01)bad('enemyAnimBad',{id:e.id,type:e.type,why:'idle frame while moving',moved:+moved.toFixed(3)});
   else if([1,2,4,7,8].includes(d.frame)){const tgt=(d.frame===4||d.frame===8)?{x:e.hitFromX,z:e.hitFromZ}:(d.frame===2||d.frame===7)?{x:e.atkX,z:e.atkZ}:{x:e.facingX,z:e.facingZ};if(tgt.x!=null){const ds=sx(tgt.x,tgt.z)-sx(e.x,e.z);if(Math.abs(ds)>.4){R.enemyCombat++;if(Math.sign(ds)!==d.f)bad('enemyCombatBad',{id:e.id,frame:d.frame,ds:+ds.toFixed(2),f:d.f});}}}}
  for(const v of Object.values(F)){const k=v.pose??('m'+v.frame);R.poses[k]=(R.poses[k]||0)+1;}R.n++;return r;};
},view);
if(shots){for(let i=0;i<6;i++){await p.waitForTimeout(secs*1000/6);await p.screenshot({path:`${shots}-${i}.png`});}}
else await p.waitForTimeout(secs*1000);
const r=await p.evaluate(()=>globalThis.__fc);console.log(JSON.stringify({...r,examples:r.examples.slice(0,25),poses:r.poses},null,0));console.log('errors',errs);
await b.close();
