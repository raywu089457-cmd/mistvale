// capture.mjs — 用「跟概念圖同構圖」拍遊戲畫面（只拍 canvas，不含 UI／名牌），給 metrics.py 比對。
// 用法：node pipeline/scripts/align/capture.mjs <out.png> [html路徑] [視窗邊長=1000]
// 構圖：art-complete 模式（全部建築、無名牌、暫停），大廳寬＝畫面 35%（概念圖大廳約 440/1254），
//       鏡頭中心＝紀念碑往下 17 單位（概念圖中心在雕像下方）。
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {execSync} from 'node:child_process';
let pw;try{pw=await import('playwright');}catch{pw=await import(pathToFileURL(path.join(execSync('npm root -g').toString().trim(),'playwright','index.js')).href);}
const {chromium}=pw.default||pw;
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const [out='align-game.png',htmlArg,sizeArg='1000']=process.argv.slice(2);
const html=htmlArg||path.resolve(root,'../../outputs/暮影村.html'),size=+sizeArg;
const b=await chromium.launch();const p=await b.newPage({viewport:{width:size,height:size}});
const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto(pathToFileURL(html).href+'?preview=art-complete',{waitUntil:'load',timeout:180000});
await p.waitForTimeout(1500);await p.click('#start-button');
// 建築已改走 sharedAtlas（單張圖 PIXEL_ASSETS.hall/inn/…，由 build.mjs 嵌入），
// 舊的 buildingsAtlas 不存在 → __mistvaleAtlas().ready 會永遠 false，所以不能拿它當就緒條件。
// 改成：基礎 hook 都 ready，且畫面真的畫出東西（取樣像素的色數夠多＝地形＋建築都上了）。
await p.waitForFunction(()=>{
  if(!(globalThis.__mistvaleDetails?.().ready&&globalThis.__mistvaleHero?.().ready&&globalThis.__mistvaleIcons?.().ready))return false;
  const cv=[...document.querySelectorAll('canvas')].sort((a,b)=>b.width*b.height-a.width*a.height)[0];
  if(!cv||!cv.width)return false;
  try{const d=cv.getContext('2d').getImageData(0,0,cv.width,cv.height).data,seen=new Set();
    for(let i=0;i<d.length;i+=16004){seen.add((d[i]<<16)|(d[i+1]<<8)|d[i+2]);if(seen.size>140)return true;}
    return seen.size>140;
  }catch{return false;}
},null,{timeout:120000});
const info=await p.evaluate(()=>{const cv=[...document.querySelectorAll('canvas')].sort((a,b)=>b.width*b.height-a.width*a.height)[0];
  const s=.35*cv.width/112;__mistvaleView.lookAt(-6.1,3.9,s);return{w:cv.width,h:cv.height,s};});
await p.waitForTimeout(2500);
const url=await p.evaluate(()=>{__mistvaleResetProc();return new Promise(r=>setTimeout(()=>{const cv=[...document.querySelectorAll('canvas')].sort((a,b)=>b.width*b.height-a.width*a.height)[0];r(cv.toDataURL('image/png'));},1200));});
fs.writeFileSync(out,Buffer.from(url.split(',')[1],'base64'));
const proc=await p.evaluate(()=>__mistvaleDetails().proc);
await b.close();
console.log(JSON.stringify({out,canvas:[info.w,info.h],scale:+info.s.toFixed(3),proc,errors:errs}));
