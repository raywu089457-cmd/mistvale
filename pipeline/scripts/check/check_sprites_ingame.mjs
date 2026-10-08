// check_sprites_ingame.mjs — 實機檢查新規格英雄/魔物 sheet:逐幀記錄每隻角色畫的 act / i,
// 驗:act 存在於 sheet、i 在 0..frames-1、每個職業/魔物各動作都出現過;並替每個「職業 × 動作」抓一張特寫(output/audit/sprites/)。
// 用法:node build.mjs 後 node pipeline/scripts/check/check_sprites_ingame.mjs [秒數=150]
import path from 'node:path';import fs from 'node:fs';import {pathToFileURL,fileURLToPath} from 'node:url';import {execSync} from 'node:child_process';
const pw=await import(pathToFileURL(path.join(execSync('npm root -g').toString().trim(),'playwright','index.js')).href);const {chromium}=pw.default||pw;
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');const html=process.env.HTML||path.resolve(root,'../../outputs/暮影村.html');
const secs=+(process.argv[2]||150),out=path.join(root,'output/audit/sprites');fs.mkdirSync(out,{recursive:true});
const b=await chromium.launch({channel:'chromium'});const p=await b.newPage({viewport:{width:1280,height:800}});
const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto(pathToFileURL(html).href+'?preview=1',{waitUntil:'load',timeout:180000});await p.waitForTimeout(1500);await p.click('#start-button');
await p.waitForFunction(()=>globalThis.__mistvaleFacing&&globalThis.__mistvaleGame&&globalThis.__mistvaleDetails?.().ready,null,{timeout:60000});
await p.waitForFunction(()=>Object.keys(globalThis.__mistvaleHeroSheets?.()||{}).length>=7,null,{timeout:60000});
// 街頭 NPC(黑騎士/祭司等):鏡頭對準,各截一張
for(const cls of ['darkknight','priest']){const d=await p.evaluate(c=>__mistvaleDecor().find(d=>d.type==='npc'&&d.cls===c),cls);
  if(d){await p.evaluate(([x,z])=>__mistvaleView.lookAt(x,z,5),[d.x,d.z]);await p.waitForTimeout(400);await p.screenshot({path:path.join(out,`${cls}_npc.png`),clip:{x:640-200,y:400-200,width:400,height:300}});}}
// 每職業至少一隻獵人;一半出去打獵(戰鬥/受擊/倒地),一半留村(四方向走路、待機)。魔物種類輪流改成四種(含 boss)。
await p.evaluate(()=>{const G=__mistvaleGame,S=G.state,C=['paladin','berserker','archer','ranger','sorcerer'];  // 可玩職業;黑騎士/祭司只在街上(NPC)
  S.hunters.forEach((h,k)=>{h.classId=C[k%5];});
  while(S.hunters.length<10){const src=S.hunters[S.hunters.length%S.hunters.length];S.hunters.push({...JSON.parse(JSON.stringify(src)),id:src.id+'x'+S.hunters.length,classId:C[S.hunters.length%5]});}
  S.hunters.forEach((h,k)=>{if(k%2===0){h.huntRegion='meadow';h.task=null;h.route=[];h.status='出征中';h.x=17+k%3;h.z=2+k%4;}});
  S.enemies.forEach((e,k)=>{e.type=['slime','wolf','golem','boss'][k%4];});G.state.speed=2;});
const r=await p.evaluate(async secs=>{
  const S=()=>__mistvaleGame.state,M={};const sheets=__mistvaleHeroSheets();const bad=[],seen={},want=[];
  const kindOf=(id)=>{if(id.startsWith('enemy:')){const e=S().enemies.find(e=>'enemy:'+e.id===id);return e?(e.type==='boss'?'treant':e.type):null;}const h=S().hunters.find(h=>h.id===id);return h?.classId;};
  const t0=performance.now();let last=null,ticks=0;
  await new Promise(res=>{const step=()=>{const st=S().time;if(st!==last){last=st;ticks++;
      if(ticks%15===0){for(const e of S().enemies)if(e.type&&!['slime','wolf','golem','boss'].includes(e.type))e.type='slime';}
      for(const [id,v] of Object.entries(__mistvaleFacing())){if(v.t!==st||!v.act)continue;const k=kindOf(id);if(!k)continue;
        const key=k+'/'+v.act;seen[key]=(seen[key]||0)+1;
        const meta=id.startsWith('enemy:')?globalThis.PIXEL_ASSETS.monsterSheets[k]?.meta:null,acts=meta?Object.keys(meta.actions):sheets[k]?.actions;
        const fr=meta?meta.actions[v.act]?.frames:null;
        if(!acts||!acts.includes(v.act))bad.push(`${key} act missing`);else if(fr&&(v.i<0||v.i>=fr))bad.push(`${key} i=${v.i} frames=${fr}`);}}
    if(performance.now()-t0<secs*1000)requestAnimationFrame(step);else res();};step();});
  return{ticks,seen,bad:[...new Set(bad)].slice(0,30)};},Math.min(secs,60));
// 特寫:每個 kind/act 抓一張(鏡頭對準牠,放大 5 倍)
const shots={};const t1=Date.now();
while(Date.now()-t1<secs*1000){
  const cand=await p.evaluate(()=>{const S=__mistvaleGame.state,F=__mistvaleFacing(),o=[];for(const [id,v] of Object.entries(F)){if(v.t!==S.time||!v.act)continue;
    let k;if(id.startsWith('enemy:')){const e=S.enemies.find(e=>'enemy:'+e.id===id);if(!e)continue;k=e.type==='boss'?'treant':e.type;}else k=S.hunters.find(h=>h.id===id)?.classId;if(k)o.push({id,k,act:v.act,i:v.i,x:v.x,z:v.z});}return o;});
  const c=cand.find(c=>!shots[c.k+'_'+c.act]);
  if(c){await p.evaluate(([x,z])=>__mistvaleView.lookAt(x,z,5),[c.x,c.z]);await p.waitForTimeout(60);
    const still=await p.evaluate(([id,act])=>__mistvaleFacing()[id]?.act===act,[c.id,c.act]);
    if(still){const f=path.join(out,`${c.k}_${c.act}.png`);await p.screenshot({path:f,clip:{x:640-150,y:400-190,width:300,height:260}});shots[c.k+'_'+c.act]=c.i;}}
  else await p.waitForTimeout(150);
  if(Date.now()-t1>20000&&Date.now()%7<1)await p.evaluate(()=>{const S=__mistvaleGame.state;for(const h of S.hunters)if(h.hp<=0)h.hp=h.maxHp;});
}
console.log(JSON.stringify({...r,shots:Object.keys(shots).sort(),errors:errs.slice(0,5)},null,0));
await b.close();
