// check_one_monster.mjs <type> [秒數=120] — 實機測一種魔物:開局草原有牠(或強制生一隻),記錄每幀 act/i(必須存在且在範圍內),
// 每個動作截一張特寫、被打倒時截死亡三張 → output/audit/<type>/。獵人先在旁邊觀察 25 秒(待機/四方向走路),再出征。
import path from 'node:path';import fs from 'node:fs';import {pathToFileURL,fileURLToPath} from 'node:url';import {execSync} from 'node:child_process';
const pw=await import(pathToFileURL(path.join(execSync('npm root -g').toString().trim(),'playwright','index.js')).href);const {chromium}=pw.default||pw;
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');const html=process.env.HTML||path.resolve(root,'../../outputs/暮影村.html');
const type=process.argv[2]||'ogre',secs=+(process.argv[3]||120),out=path.join(root,'output/audit',type);fs.mkdirSync(out,{recursive:true});for(const f of fs.readdirSync(out))fs.unlinkSync(path.join(out,f));
const b=await chromium.launch({channel:'chromium'});const p=await b.newPage({viewport:{width:1280,height:800}});
const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto(pathToFileURL(html).href+'?preview=1',{waitUntil:'load',timeout:180000});await p.waitForTimeout(1500);await p.click('#start-button');
await p.waitForFunction(t=>globalThis.__mistvaleFacing&&globalThis.__mistvaleGame&&globalThis.PIXEL_ASSETS?.monsterSheets?.[t],type,{timeout:60000});
const n=await p.evaluate(t=>__mistvaleGame.state.enemies.filter(e=>e.type===t).length,type);
const meta=await p.evaluate(t=>PIXEL_ASSETS.monsterSheets[t].meta.actions,type);
const seen={},bad=new Set(),shots={};const t0=Date.now();let dead=false,phase='watch';
const shoot=async(name,x,z)=>{await p.evaluate(([x,z])=>__mistvaleView.lookAt(x,z,5),[x,z]);await p.screenshot({path:path.join(out,name),clip:{x:640-170,y:450-230,width:340,height:270}});};
while(Date.now()-t0<secs*1000&&!(dead&&Object.keys(shots).length>=5)){
  if(phase==='watch'&&Date.now()-t0>25000){phase='fight';await p.evaluate(t=>{const S=__mistvaleGame.state,e=S.enemies.find(e=>e.type===t);for(const h of S.hunters){h.huntRegion='meadow';h.task=null;h.route=[];h.status='出征中';if(e){h.x=e.x-2+Math.random();h.z=e.z-2+Math.random();}}},type);}
  const r=await p.evaluate(t=>{const S=__mistvaleGame.state,F=__mistvaleFacing(),o=[];for(const e of S.enemies.filter(e=>e.type===t)){const v=F['enemy:'+e.id];if(v&&v.t===S.time&&v.act)o.push({act:v.act,i:v.i,x:e.x,z:e.z,f:v.f});}
    const d=S.effects.find(f=>f.type==='death'&&f.enemyType===t&&f.age<.1);return{o,d:d?{x:d.x,z:d.z}:null};},type);
  for(const v of r.o){seen[v.act]=(seen[v.act]||0)+1;if(!meta[v.act])bad.add('missing '+v.act);else if(v.i<0||v.i>=meta[v.act].frames)bad.add(`${v.act} i=${v.i}`);
    if(!shots[v.act]){await shoot(`${v.act}.png`,v.x,v.z);shots[v.act]=v.f;}}
  if(r.d&&!dead){dead=true;for(const [k,dt] of [[0,150],[1,350],[2,500]]){await p.waitForTimeout(dt);await shoot(`death_${k}.png`,r.d.x,r.d.z);}}
  if(phase==='fight')await p.evaluate(t=>{for(const h of __mistvaleGame.state.hunters)if(h.hp<=0)h.hp=h.maxHp;},type);
  await p.waitForTimeout(80);
}
console.log(JSON.stringify({type,spawned:n,seen,bad:[...bad],shots:Object.keys(shots),dead,errors:errs.slice(0,5)}));await b.close();
