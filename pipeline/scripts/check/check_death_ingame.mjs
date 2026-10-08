// check_death_ingame.mjs — 實機抓死亡動畫:每個可玩職業讓一名戰鬥中的獵人倒下(同 pixel-game died()),每種魔物等一隻被打倒(effect 'death'),
// 各在倒下後 0.15 / 0.5 / 1.0 秒截特寫 → output/audit/sprites/death_<kind>.png(三張並排)。
// 用法:node build.mjs 後 node pipeline/scripts/check/check_death_ingame.mjs [秒數=120]
import path from 'node:path';import fs from 'node:fs';import {pathToFileURL,fileURLToPath} from 'node:url';import {execSync} from 'node:child_process';
const pw=await import(pathToFileURL(path.join(execSync('npm root -g').toString().trim(),'playwright','index.js')).href);const {chromium}=pw.default||pw;
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');const html=process.env.HTML||path.resolve(root,'../../outputs/暮影村.html');
const secs=+(process.argv[2]||120),out=path.join(root,'output/audit/sprites');fs.mkdirSync(out,{recursive:true});
const b=await chromium.launch({channel:'chromium'});const p=await b.newPage({viewport:{width:1280,height:800}});
const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto(pathToFileURL(html).href+'?preview=1',{waitUntil:'load',timeout:180000});await p.waitForTimeout(1500);await p.click('#start-button');
await p.waitForFunction(()=>globalThis.__mistvaleFacing&&globalThis.__mistvaleGame&&Object.keys(globalThis.__mistvaleHeroSheets?.()||{}).length>=7,null,{timeout:60000});
await p.evaluate(()=>{const S=__mistvaleGame.state,C=['paladin','berserker','archer','ranger','sorcerer'];
  while(S.hunters.length<10){const src=S.hunters[0];S.hunters.push({...JSON.parse(JSON.stringify(src)),id:src.id+'x'+S.hunters.length});}
  S.hunters.forEach((h,k)=>{h.classId=C[k%5];h.huntRegion='meadow';h.task=null;h.route=[];h.status='出征中';h.x=17+k%3;h.z=2+k%4;});
  S.enemies.forEach((e,k)=>{e.type=['slime','wolf','golem','boss'][k%4];});S.speed=1;});
const shoot=async(name,x,z)=>{await p.evaluate(([x,z])=>__mistvaleView.lookAt(x,z,5),[x,z]);await p.screenshot({path:path.join(out,name),clip:{x:640-160,y:450-210,width:320,height:250}});};
const done={},t0=Date.now();
while(Date.now()-t0<secs*1000&&Object.keys(done).length<9){
  // 魔物:找剛產生的 death effect
  const fx=await p.evaluate(seen=>{const S=__mistvaleGame.state;const e=S.effects.find(f=>f.type==='death'&&!seen.includes(f.enemyType==='boss'?'treant':f.enemyType)&&f.age<.08);return e?{k:e.enemyType==='boss'?'treant':e.enemyType,x:e.x,z:e.z}:null;},Object.keys(done));
  if(fx){for(const [k2,dt] of [[0,150],[1,350],[2,500]]){await p.waitForTimeout(dt);await shoot(`death_${fx.k}_${k2}.png`,fx.x,fx.z);}done[fx.k]=1;continue;}
  // 英雄:每職業一次,挑戰鬥中的讓他倒下
  const h=await p.evaluate(seen=>{const S=__mistvaleGame.state;const h=S.hunters.find(h=>h.hp>0&&h.status==='戰鬥中'&&!seen.includes(h.classId));if(!h)return null;
    h.hp=0;h.reviveTimer=8;h.status='復活中';h.targetId=null;h.route=[];h.task='revive';return{k:h.classId,x:h.x,z:h.z,id:h.id};},Object.keys(done));
  if(h){for(const [k2,dt] of [[0,150],[1,350],[2,500]]){await p.waitForTimeout(dt);const pos=await p.evaluate(id=>{const h=__mistvaleGame.state.hunters.find(h=>h.id===id);return{x:h.x,z:h.z,act:__mistvaleFacing()[id]?.act,i:__mistvaleFacing()[id]?.i};},h.id);
      await shoot(`death_${h.k}_${k2}.png`,pos.x,pos.z);if(k2===2)console.log(h.k,pos.act,pos.i);}done[h.k]=1;continue;}
  await p.evaluate(()=>{for(const e of __mistvaleGame.state.enemies)e.hp=Math.min(e.hp,8);});await p.waitForTimeout(100);
}
console.log(JSON.stringify({done:Object.keys(done),errors:errs.slice(0,5)}));await b.close();
