// check-changes.mjs — 驗這次六項改動：開場畫面/委託面板/小地圖/村莊裝飾/流浪英雄速度與 AI
import path from 'node:path'; import fs from 'node:fs';
import {pathToFileURL} from 'node:url'; import {execSync} from 'node:child_process';
let pw; try { pw = await import('playwright'); }
catch { pw = await import(pathToFileURL(path.join(execSync('npm root -g').toString().trim(),'playwright','index.js')).href); }
const {chromium} = pw.default || pw;
const file='C:/Users/ray/Documents/Codex/2026-09-29/new-chat/outputs/暮影村.html';
const out='C:/Users/ray/Documents/Codex/2026-09-29/new-chat/work/mistvale/output';
const b=await chromium.connectOverCDP('http://127.0.0.1:9447'); const ctx=b.contexts()[0];
const p=await ctx.newPage();
const errors=[]; p.on('pageerror',e=>errors.push(String(e)));
try{
  await p.setViewportSize({width:1280,height:720});
  await p.goto(pathToFileURL(file).href,{waitUntil:'domcontentloaded',timeout:90000});
  await p.waitForTimeout(9000);
  const ui=await p.evaluate(()=>({
    startScreen:!!document.querySelector('#start-screen'),
    startButton:!!document.querySelector('#start-button'),
    leftHidden:document.querySelector('#left-panel')?.classList.contains('hidden'),
    reopenVisible:!document.querySelector('#reopen-left')?.classList.contains('hidden'),
    minimap:!!document.querySelector('#minimap-v3')||!!document.querySelector('.world-minimap'),
    started:globalThis.__mistvaleGame?.state ? !document.hidden : null,
    gameUiVisible:!document.querySelector('#game-ui')?.classList.contains('hidden'),
    npcDecor:(globalThis.__mistvaleDecorations||[]).filter(d=>d.type==='npc'||d.type==='villager').length,
  }));
  console.log('UI',JSON.stringify(ui));
  // 讓遊戲跑一段時間，看流浪英雄的 AI
  const wander=await p.evaluate(async()=>{
    const g=globalThis.__mistvaleGame,w=globalThis.__mistvaleView;
    const before=g.state.wanderers.map(x=>({id:x.id,cls:x.classId,region:x.huntRegion,gold:x.gold}));
    const t0=performance.now(); g.state.paused=false;
    await new Promise(res=>{const tick=()=>{g.tick(0.05);w.update(0.05,g.state);if(performance.now()-t0<45000)requestAnimationFrame(tick);else res();};tick();});
    g.state.paused=true;
    const classes=g.state.hunters[0]?g.state.hunters[0].classId:null;
    return {before, after:g.state.wanderers.map(x=>({id:x.id,cls:x.classId,region:x.huntRegion,gold:x.gold,satiety:Math.round(x.satiety),stamina:Math.round(x.stamina),status:x.status,task:x.task,
      speed:+x.speed.toFixed(2), classSpeed:+((g.state.hunters.find(h=>h.classId===x.classId)||{}).speed||0).toFixed(2)})),
      purchases:g.state.counts.wandererPurchases||0, wanderKills:g.state.wanderKills, time:Math.round(g.state.time)};
  });
  console.log('WANDER',JSON.stringify(wander));
  console.log('pageerrors',errors.length,errors.slice(0,3));
  await p.bringToFront();
  await p.evaluate(()=>{let d=document.getElementById('nudge');if(!d){d=document.createElement('div');d.id='nudge';d.style.cssText='position:fixed;left:-99px;top:-99px;width:1px;height:1px';document.body.appendChild(d);}});
  await p.waitForTimeout(200);
  await p.screenshot({path:path.join(out,'check-changes.png')});
  await p.close();
} finally { await b.close().catch(()=>{}); }
