// generate.mjs — 用已登入的 l0veyou 瀏覽器生一張圖（GPT Image 2），原圖存到 output/l0veyou/。
// 前置：先開專用瀏覽器（獨立設定檔、CDP 9447），使用者在視窗裡登入一次，之後設定檔記得登入：
//   "<playwright chromium>/chrome.exe" --remote-debugging-port=9447 --user-data-dir="<work>/.l0veyou-profile" https://l0veyou.com/chat
// 用法：[REF=參考圖.png] node pipeline/scripts/l0veyou/generate.mjs <prompt檔> <輸出路徑（副檔名自動依內容改 .png/.jpg）> [截圖目錄] [比例 1:1|16:9|...]
// 每次都開新對話（避免「多參考圖」拿前一張當參考）。4 欄物件表用 16:9；生完一定跑 sheet_to_atlas.py 的碰邊檢查。
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {execSync} from 'node:child_process';
let pw;try{pw=await import('playwright');}catch{pw=await import(pathToFileURL(path.join(execSync('npm root -g').toString().trim(),'playwright','index.js')).href);}
const {chromium}=pw.default||pw;
setTimeout(()=>{console.log('WATCHDOG');process.exit(4);},6*60e3).unref?.();   // Windows 的 timeout 殺不掉卡住的 CDP 連線,自己設上限
let [promptFile,outFile,shotDir='',ratio='1:1']=process.argv.slice(2);
const prompt=fs.readFileSync(promptFile,'utf8').trim();
const log=(...a)=>console.log(new Date().toISOString().slice(11,19),...a);
const b=await chromium.connectOverCDP('http://127.0.0.1:9447');const ctx=b.contexts()[0];
// 關掉卡在 loading 的空白分頁，改用已登入、載入完成的分頁（使用者登入用的那個）。
let p=null;
for(const q of ctx.pages()){const st=await Promise.race([q.evaluate(()=>({rs:document.readyState,t:document.body?document.body.innerText:''})),new Promise(r=>setTimeout(()=>r({rs:'timeout',t:''}),5000))]);
  if(q.url().includes('l0veyou.com/chat')&&st.rs==='loading'&&!st.t){await q.close().catch(()=>{});log('closed stuck tab');continue;}
  if(!p&&q.url().includes('l0veyou.com/chat')&&st.rs==='complete'&&st.t&&!st.t.includes('登录 / 注册'))p=q;}
if(!p){log('NO_LOGGED_IN_TAB');process.exit(2);}
await p.bringToFront();await p.waitForTimeout(500);
await p.locator('button.new-chat').click();await p.waitForTimeout(1500);
const rail=p.locator('button.rail-btn',{hasText:'AI 生图'});if(await rail.count()&&!(await rail.getAttribute('class')).includes('active')){await rail.click();await p.waitForTimeout(800);}
const model=(await p.locator('button.model-trigger').innerText()).trim();log('model:',model);
const WANT=process.env.MODEL||'GPT Image 2';   // 例:MODEL='GPT Image 2.5 满血版'
if(model!==WANT){await p.locator('button.model-trigger').click();await p.waitForTimeout(600);await p.getByText(WANT,{exact:true}).last().click();await p.waitForTimeout(600);log('model now:',(await p.locator('button.model-trigger').innerText()).trim());}
await p.locator('button.ratio-btn').filter({hasText:new RegExp('^'+ratio+'$')}).click();await p.waitForTimeout(300);log('ratio:',(await p.locator('button.ratio-btn.active').first().innerText()).trim());
// 「多參考圖」若存在且開著就關掉（文件說會用前面的圖當參考、污染風格）
const multi=await p.evaluate(()=>[...document.querySelectorAll('*')].filter(e=>e.children.length===0&&/多参考图|多參考圖/.test(e.textContent||'')).map(e=>e.parentElement.outerHTML.slice(0,300)));
if(multi.length)log('multi-ref control:',multi.join(' | '));
if(process.env.REF){await p.locator('input.file-input').setInputFiles(process.env.REF);await p.waitForTimeout(6000);log('ref attached',process.env.REF);}
const before=new Set(await p.evaluate(()=>[...document.images].map(i=>i.currentSrc||i.src)));
const ta=p.locator('textarea[aria-label="消息输入框"]');await ta.click();await ta.fill(prompt);await p.waitForTimeout(400);
if(shotDir)await p.screenshot({path:shotDir+'/l0v-gen-1-ready.png'});
await p.locator('button.send').click();log('sent, prompt chars',prompt.length);
const t0=Date.now();let url=null,lastTxt='';
while(Date.now()-t0<5*60e3){
  await p.waitForTimeout(5000);
  const imgs=await p.evaluate(()=>[...document.images].map(i=>({src:i.currentSrc||i.src,w:i.naturalWidth,h:i.naturalHeight,done:i.complete})));
  const fresh=imgs.filter(i=>!before.has(i.src)&&!i.src.startsWith('data:')&&!i.src.startsWith('blob:')&&i.done&&i.w>=512&&i.h>=384);
  if(fresh.length){url=fresh[fresh.length-1].src;log('image',fresh[fresh.length-1].w+'x'+fresh[fresh.length-1].h,'after',Math.round((Date.now()-t0)/1000),'s');break;}
  const txt=await p.evaluate(()=>{const m=document.querySelector('main')||document.body;return m.innerText.slice(-400);});
  if(txt!==lastTxt){lastTxt=txt;log('page tail:',txt.replace(/\s+/g,' ').slice(-200));}
}
if(shotDir)await p.screenshot({path:shotDir+'/l0v-gen-2-result.png'});
if(!url){log('NO_IMAGE');process.exit(3);}
log('url:',url.slice(0,160));
let buf;
if(url.startsWith('data:')){buf=Buffer.from(url.split(',')[1],'base64');}
else{const r=await ctx.request.get(url);log('http',r.status(),r.headers()['content-type']);buf=await r.body();}
// 16:9 回 PNG、1:1 常回 JPEG：副檔名照內容
const ext=buf.slice(0,4).toString('hex')==='89504e47'?'.png':'.jpg';outFile=outFile.replace(/\.(png|jpe?g)$/i,'')+ext;
fs.writeFileSync(outFile,buf);log('saved',outFile,buf.length,'bytes');
await b.close().catch(()=>{}); // 只斷開 CDP 連線，不會關掉使用者的瀏覽器
