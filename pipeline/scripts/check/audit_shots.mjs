// audit_shots.mjs — 視覺體檢取證：全地圖各區 × 各縮放、戰鬥特寫、UI 面板截圖，存到 output/audit/。
// 用法：npm run build 後 node pipeline/scripts/check/audit_shots.mjs [輸出目錄=output/audit] [1440x900]
import path from 'node:path';import fs from 'node:fs';
import {pathToFileURL} from 'node:url';import {execSync} from 'node:child_process';
const pw=await import(pathToFileURL(path.join(execSync('npm root -g').toString().trim(),'playwright','index.js')).href);
const {chromium}=pw.default||pw;
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'../../..');
const outDir=process.argv[2]||path.join(root,'output/audit');
const [W,H]=(process.argv[3]||'1440x900').split('x').map(Number);
const html=process.env.HTML||path.resolve(root,'../../outputs/暮影村.html');
fs.mkdirSync(outDir,{recursive:true});
const b=await chromium.launch();const p=await b.newPage({viewport:{width:W,height:H}});
const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto(pathToFileURL(html).href+'?preview=1',{waitUntil:'load',timeout:180000});
await p.waitForTimeout(1500);
const shot=async name=>{const f=path.join(outDir,name+'.png');await p.screenshot({path:f});console.log('shot',name);};
await shot('00-title');
await p.click('#start-button');
await p.waitForFunction(()=>globalThis.__mistvaleDetails?.().ready&&globalThis.__mistvaleGame&&globalThis.__mistvaleDecor?.().length>500,null,{timeout:60000});
await p.waitForTimeout(2500);
const regions=['village','meadow','forest','taiga','snow','mountain','desert','birch'];
const zooms={far:0.9,mid:1.8,close:3.4};
for(const id of regions){
  for(const [zn,z] of Object.entries(zooms)){
    await p.evaluate(([id,z])=>{const V=__mistvaleView;V.focus(id==='village'?'home':'region:'+id);V.zoomTo(z);},[id,z]);
    await p.waitForTimeout(2600);
    await shot(`${id}-${zn}`);
  }
}
// 戰鬥特寫：找一隻魔物，鏡頭對準
await p.evaluate(()=>{const G=__mistvaleGame,V=__mistvaleView;const e=G.state.enemies[0];
  if(e)V.lookAt(e.x,e.z,3.4);else V.focus('region:meadow');});
await p.waitForTimeout(2200);await shot('combat-close');
await p.waitForTimeout(1200);await shot('combat-close2');
// 村莊特寫：廣場、建築群
await p.evaluate(()=>{__mistvaleView.lookAt(-8,2,3.6);});await p.waitForTimeout(2400);await shot('plaza-close');
await p.evaluate(()=>{__mistvaleView.lookAt(-6,10,2.6);});await p.waitForTimeout(2200);await shot('village-mid-close');
await p.evaluate(()=>{__mistvaleView.lookAt(4,-2,2.6);});await p.waitForTimeout(2200);await shot('village-north');
// UI 面板
const panels=['建設','獵人','交易','製作','地下城','競技場','委託','倉庫','世界圖','說明','設定'];
for(const name of panels){
  const ok=await p.evaluate(n=>{const btns=[...document.querySelectorAll('button,[role=button],.tab,.nav-item')];
    const b=btns.find(x=>(x.textContent||'').trim().startsWith(n));if(b){b.click();return true;}return false;},name);
  await p.waitForTimeout(1200);
  if(ok)await shot('ui-'+name);
}
const proc=await p.evaluate(()=>__mistvaleDetails().proc);
console.log(JSON.stringify({proc,errors:errs}));
await b.close();
