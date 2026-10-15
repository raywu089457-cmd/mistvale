// generate_video.mjs — 用已登入的 l0veyou 瀏覽器生一段影片（i2v:參考圖 + 提示詞），存成 .mp4。
// 站上的影片模型在模型選單裡:MiniMax H3 生成视频极速版 / LTX 视频（比例只有 16:9 與 9:16）。
// 前置:專用瀏覽器開著（CDP 9447、已登入）。
// 用法:[REF=參考圖.png] node pipeline/scripts/l0veyou/generate_video.mjs <prompt檔> <輸出路徑.mp4> [截圖目錄] [比例 16:9|9:16] [模型名]
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {execSync} from 'node:child_process';
let pw;try{pw=await import('playwright');}catch{pw=await import(pathToFileURL(path.join(execSync('npm root -g').toString().trim(),'playwright','index.js')).href);}
const {chromium}=pw.default||pw;
let [promptFile,outFile,shotDir='',ratio='16:9',modelName='MiniMax H3 生成视频极速版']=process.argv.slice(2);
const prompt=fs.readFileSync(promptFile,'utf8').trim();
const log=(...a)=>console.log(new Date().toISOString().slice(11,19),...a);
const b=await chromium.connectOverCDP('http://127.0.0.1:9447');const ctx=b.contexts()[0];
let p=null;
for(const q of ctx.pages()){const st=await Promise.race([q.evaluate(()=>({rs:document.readyState,t:document.body?document.body.innerText:''})),new Promise(r=>setTimeout(()=>r({rs:'timeout',t:''}),5000))]);
  if(q.url().includes('l0veyou.com/chat')&&st.rs==='loading'&&!st.t){await q.close().catch(()=>{});log('closed stuck tab');continue;}
  if(!p&&q.url().includes('l0veyou.com/chat')&&st.rs==='complete'&&st.t&&!st.t.includes('登录 / 注册'))p=q;}
if(!p){log('NO_LOGGED_IN_TAB');process.exit(2);}
await p.bringToFront();await p.waitForTimeout(500);
await p.locator('button.new-chat').click();await p.waitForTimeout(1500);
// 選影片模型（模型選單裡有「视频」badge 的那些）
let cur=(await p.locator('button.model-trigger').innerText()).trim();
if(!/视频/.test(cur)){
  await p.locator('button.model-trigger').click();await p.waitForTimeout(900);
  await p.getByText(modelName,{exact:true}).first().click().catch(async()=>{await p.getByText(/生成视频极速版|LTX 视频/,{exact:false}).first().click();});
  await p.waitForTimeout(1000);
  cur=(await p.locator('button.model-trigger').innerText()).trim();
}
log('model:',cur);
if(!/视频/.test(cur)){log('MODEL_NOT_VIDEO');process.exit(4);}
await p.locator('button.ratio-btn').filter({hasText:new RegExp('^'+ratio+'$')}).first().click().catch(()=>{});
await p.waitForTimeout(400);
log('ratio:',(await p.locator('button.ratio-btn.active').innerText().catch(()=>'?')).trim());
if(process.env.REF){await p.locator('input.file-input').setInputFiles(process.env.REF);await p.waitForTimeout(9000);log('ref attached',process.env.REF);}
const before=new Set(await p.evaluate(()=>[...document.querySelectorAll('video')].map(v=>v.currentSrc||v.src)));
const ta=p.locator('textarea[aria-label="消息输入框"]');await ta.click();await ta.fill(prompt);await p.waitForTimeout(400);
if(shotDir)await p.screenshot({path:shotDir+'/l0v-vid-1-ready.png'});
await p.locator('button.send').click();log('sent, prompt chars',prompt.length);
const t0=Date.now();let got=null,lastTxt='';
while(Date.now()-t0<14*60e3){
  await p.waitForTimeout(6000);
  const vids=await p.evaluate(()=>[...document.querySelectorAll('video')].map(v=>({src:v.currentSrc||v.src,w:v.videoWidth,h:v.videoHeight,ready:v.readyState})));
  const fresh=vids.filter(v=>v.src&&!before.has(v.src));
  if(fresh.length){got=fresh[fresh.length-1];log('video el',got.w+'x'+got.h,'ready',got.ready,'after',Math.round((Date.now()-t0)/1000)+'s','src='+(got.src.startsWith('blob:')?'blob':got.src.slice(0,70)));break;}
  const txt=await p.evaluate(()=>{const m=document.querySelector('main')||document.body;return m.innerText.slice(-200);});
  if(txt!==lastTxt){lastTxt=txt;log('tail:',txt.replace(/\s+/g,' ').slice(-140));}
}
if(shotDir)await p.screenshot({path:shotDir+'/l0v-vid-2-result.png'});
if(!got){log('NO_VIDEO');process.exit(3);}
let buf;
if(got.src.startsWith('blob:')){
  const b64=await p.evaluate(async u=>{const r=await fetch(u);const ab=await r.arrayBuffer();const bytes=new Uint8Array(ab);let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode.apply(null,bytes.subarray(i,i+8192));return btoa(s);},got.src);
  buf=Buffer.from(b64,'base64');log('blob fetched',buf.length,'bytes');
}else{
  const r=await ctx.request.get(got.src);log('http',r.status(),r.headers()['content-type']);buf=await r.body();
}
const out=outFile.replace(/\.(mp4|webm|mov)$/i,'')+'.mp4';
fs.writeFileSync(out,buf);log('saved',out,buf.length,'bytes');
await b.close().catch(()=>{});
