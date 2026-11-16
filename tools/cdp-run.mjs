// cdp-run.mjs — 不需要 playwright 的瀏覽器驅動(直接用本機 Chrome 的 DevTools 協定)。2026-11-16:這台機器的全域 playwright 不見了,tools/checks/*.mjs 跑不動時用它。
// 用法:先開遊戲伺服器(預設 http://127.0.0.1:5030/?preview=1,可在劇本寫 url),再 node tools/cdp-run.mjs 劇本.json
// 劇本:{url?,w?,h?,dpr?,settle?,out?,steps:[["wait",ms],["shot",名稱],["tap",x,y],["click",css選擇器],["drag",x1,y1,x2,y2],["eval",js],["log",js,標籤]]}
// 截圖存到劇本旁的 shots/(或 out);頁面錯誤最後印在 errs。範例劇本:tools/checks/building-upgrade.cdp.json
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const S = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const OUT = S.out || path.join(path.dirname(process.argv[2]), 'shots');
fs.mkdirSync(OUT, { recursive: true });
const port = 9300 + Math.floor(Math.random() * 500);
const prof = path.join((await import('node:os')).tmpdir(), 'mistvale-cdp-' + port);   // Chrome 設定檔放系統暫存,不寫進 repo
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--mute-audio', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let tabs;
for (let i = 0; i < 150; i++) { try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (tabs.find(t => t.type === 'page')) break; } catch { } await sleep(200); }
if (!tabs?.find?.(t => t.type === 'page')) { console.error('Chrome 沒有在 30 秒內啟動(remote-debugging-port ' + port + ')'); chrome.kill(); process.exit(1); }
const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pend = new Map(); const errs = [];
ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } else if (d.method === 'Runtime.exceptionThrown') errs.push((d.params.exceptionDetails.exception?.description || JSON.stringify(d.params.exceptionDetails)).slice(0, 500)); };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async js => { const r = await send('Runtime.evaluate', { expression: js, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) return 'ERR ' + JSON.stringify(r.result.exceptionDetails).slice(0, 300); return r.result?.result?.value; };
await send('Runtime.enable'); await send('Page.enable');
const mobile = (S.w || 402) < 768;
await send('Emulation.setDeviceMetricsOverride', { width: S.w || 402, height: S.h || 712, deviceScaleFactor: S.dpr || 2, mobile });
if (mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Page.navigate', { url: S.url || 'http://127.0.0.1:5030/?preview=1' });
for (let i = 0; i < 300; i++) { const ok = await ev(`!!(globalThis.__mistvaleGame && !document.querySelector('#loading'))`); if (ok === true) break; await sleep(500); }
await sleep(S.settle ?? 1500);
const tap = async (x, y) => {
  if (mobile) { await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await sleep(40); await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
  else { for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }); }
};
for (const [op, ...a] of S.steps || []) {
  if (op === 'wait') await sleep(a[0]);
  else if (op === 'shot') { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, a[0] + '.png'), Buffer.from(r.result.data, 'base64')); console.log('shot', a[0]); }
  else if (op === 'drag') {   // ["drag",x1,y1,x2,y2,ms?]:單指拖曳(手機)或滑鼠拖曳(桌機),用來平移地圖
    const [x1, y1, x2, y2] = a, n = 12;
    if (mobile) { await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x1, y: y1 }] }); for (let i = 1; i <= n; i++) { await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x1 + (x2 - x1) * i / n, y: y1 + (y2 - y1) * i / n }] }); await sleep(16); } await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
    else { await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x1, y: y1, button: 'left', clickCount: 1 }); for (let i = 1; i <= n; i++) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x1 + (x2 - x1) * i / n, y: y1 + (y2 - y1) * i / n, button: 'left', buttons: 1 }); await sleep(16); } await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x2, y: y2, button: 'left', clickCount: 1 }); }
    await sleep(a[4] ?? 500);
  }
  else if (op === 'tap') { await tap(a[0], a[1]); await sleep(a[2] ?? 400); }
  else if (op === 'click') { const r = await ev(`(()=>{const e=document.querySelector(${JSON.stringify(a[0])});if(!e)return null;const b=e.getBoundingClientRect();return [b.x+b.width/2,b.y+b.height/2]})()`); if (!r) console.log('noel', a[0]); else await tap(r[0], r[1]); await sleep(a[1] ?? 400); }
  else if (op === 'eval') await ev(a[0]);
  else if (op === 'log') console.log(a[1] || 'log', JSON.stringify(await ev(a[0])));
}
console.log('errs', errs);
ws.close(); chrome.kill();
await sleep(300);
try { fs.rmSync(prof, { recursive: true, force: true }); } catch { }
process.exit(0);
