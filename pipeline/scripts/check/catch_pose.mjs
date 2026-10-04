// catch_pose.mjs — 在實機上抓特定姿勢的特寫截圖（驗收：victory/windup 頭頂有沒有被切）。
// 用法：npm run build 後 node pipeline/scripts/check/catch_pose.mjs <pose> <輸出.png> [等待秒數=120]
import path from 'node:path';import fs from 'node:fs';
import {pathToFileURL} from 'node:url';import {execSync} from 'node:child_process';
const pw=await import(pathToFileURL(path.join(execSync('npm root -g').toString().trim(),'playwright','index.js')).href);
const {chromium}=pw.default||pw;
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'../../..');
const pose=process.argv[2]||'victory',out=process.argv[3]||`output/audit/pose-${pose}.png`,wait=+(process.argv[4]||120);
const html=process.env.HTML||path.resolve(root,'../../outputs/暮影村.html');
const b=await chromium.launch();const p=await b.newPage({viewport:{width:1440,height:900}});
const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto(pathToFileURL(html).href+'?preview=1',{waitUntil:'load',timeout:180000});
await p.waitForTimeout(1500);await p.click('#start-button');
await p.waitForFunction(()=>globalThis.__mistvaleDetails?.().ready&&globalThis.__mistvaleGame,null,{timeout:60000});
await p.evaluate(()=>{const V=__mistvaleView,G=__mistvaleGame;V.lookAt(19,3,3.4);G.state.speed=3;
  // 把獵人叫到草原空地打獵(手動指定狩獵區+傳送),才會有打倒目標的歡呼
  for(const h of G.state.hunters){if(h.hp>0){h.huntRegion='meadow';h.task=null;h.route=[];h.status='出征中';h.x=17+(h.id.charCodeAt(1)%3);h.z=2+(h.id.charCodeAt(1)%4);}}
  for(const e of G.state.enemies)e.hp=Math.min(e.hp,20);});
const t0=Date.now();let caught=null;
while(Date.now()-t0<wait*1000){
  await p.evaluate(()=>{const s=__mistvaleGame.state;for(const e of s.enemies)e.hp=Math.min(e.hp,6);for(const h of s.hunters)if(h.hp<=0)h.hp=h.maxHp;});  // 把魔物打殘,讓獵人收割(觸發歡呼)
  const hit=await p.evaluate(want=>{const F=__mistvaleFacing();for(const [id,d] of Object.entries(F)){if(d.pose===want){return{id,x:d.x,z:d.z};}}return null;},pose);
  if(hit){
    await p.evaluate(([x,z])=>{__mistvaleView.lookAt(x,z,3.4);},[hit.x,hit.z]);
    await p.waitForTimeout(120);
    const again=await p.evaluate((want)=>{const F=__mistvaleFacing();for(const d of Object.values(F))if(d.pose===want)return true;return false;},pose);
    if(again){await p.screenshot({path:out});caught=hit;break;}
  }
  await p.waitForTimeout(120);
}
console.log(JSON.stringify({pose,out,caught,errors:errs}));
await b.close();
process.exit(caught?0:1);
