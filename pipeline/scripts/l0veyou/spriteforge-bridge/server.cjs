/* server.cjs — spriteforge 的 l0veyou 橋接伺服器（.cjs 因為 mistvale/package.json 是 type:module）（取代 OpenAI gpt-image-1 端點）
 *
 * 為什麼：spriteforge 原本唯一綁死的就是 js/api.js 的 callOpenAIEdit() → api.openai.com/v1/images/edits。
 * 這裡把它換成「本機 /api/edit」，由 server.js 用 CDP 驅動你已登入的 Chrome 去操作
 * l0veyou（l0veyou.com，預設模型 GPT Image 2），所以完全不用 API key。
 *
 * 流程：前端送出 { prompt, image } → /api/edit 回 { jobId } → 前端輪詢 /api/job/<id>
 *      → 完成回 { status:"done", dataUrl:"data:image/png;base64,..." }
 *
 * 前端要改的地方（js/api.js 的 callOpenAIEdit 整段換掉）：
 *   export async function callOpenAIEdit(prompt, imageFile, apiKey) {
 *     const form = new FormData();
 *     form.append('prompt', prompt);
 *     if (imageFile) form.append('image', imageFile);
 *     const { jobId } = await (await fetch('/api/edit', { method:'POST', body: form })).json();
 *     for (let i = 0; i < 240; i++) {                 // 最多等 40 分鐘
 *       await new Promise(r => setTimeout(r, 10000));
 *       const job = await (await fetch('/api/job/' + jobId)).json();
 *       if (job.status === 'done')  return job.dataUrl;
 *       if (job.status === 'error') throw new Error(job.error);
 *     }
 *     throw new Error('l0veyou timeout');
 *   }
 *
 * 啟動：
 *   node server.cjs                      # 預設 CDP 9447、PORT 3033、靜態目錄就是本專案
 *   L0VEYOU_CDP=9447 PORT=3033 node server.cjs
 *
 * 前置：先用該 profile 開好 Chrome 並登入 l0veyou
 *   chrome --remote-debugging-port=9447 --user-data-dir=<repo>/work/.l0veyou-profile https://l0veyou.com/chat
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 3033);   // 3000 常被別的程式佔用
const CDP_PORT = Number(process.env.L0VEYOU_CDP || 9447);
const SITE = process.env.L0VEYOU_URL || 'https://l0veyou.com/chat';   // 正式站（不是海外客鏡像）
const WAIT_MS = Number(process.env.L0VEYOU_WAIT_MS || 40 * 60 * 1000);
const STATIC_ROOT = __dirname;

/* ------------------------------------------------------------------ 極簡 CDP 客戶端 */
// 2026-10-23 修：連線斷掉時要把等待中的指令全部判失敗，每個指令也要有超時——
// 以前 ws 一斷 send() 就永遠不回，job 卡在 running（圖其實早就生好了）。
const SEND_TIMEOUT_MS = 30000;
class CDP {
  constructor(wsUrl) { this.ws = new WebSocket(wsUrl); this.id = 0; this.pending = new Map(); this.ready = new Promise((res, rej) => {
    this.ws.onopen = res; this.ws.onerror = rej; });
    this.ws.onclose = () => { for (const p of this.pending.values()) p.rej(new Error('CDP 連線中斷')); this.pending.clear(); }; }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      const timer = setTimeout(() => { if (this.pending.delete(id)) rej(new Error(`CDP ${method} 超過 ${SEND_TIMEOUT_MS / 1000} 秒沒回應`)); }, SEND_TIMEOUT_MS);
      this.pending.set(id, { res: (v) => { clearTimeout(timer); res(v); }, rej: (e) => { clearTimeout(timer); rej(e); } });
      try { this.ws.send(JSON.stringify({ id, method, params, sessionId })); } catch (e) { this.pending.delete(id); clearTimeout(timer); rej(e); }
    });
  }
  wire() { this.ws.onmessage = (e) => { const m = JSON.parse(e.data);
    if (m.id && this.pending.has(m.id)) { const p = this.pending.get(m.id); this.pending.delete(m.id);
      m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } }; }
  close() { try { this.ws.close(); } catch {} }
}

/** 連到 l0veyou 分頁（直接用分頁自己的 ws，不需要 attachToTarget）。 */
async function connect() {
  const cdp = new CDP(await targetUrl());
  await cdp.ready; cdp.wire();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  return cdp;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function targetUrl() {
  let list;
  try {
    list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
  } catch {
    throw new Error(`CDP ${CDP_PORT} 沒有回應 —— Chrome 沒開，或沒帶 --remote-debugging-port=${CDP_PORT}（用 .l0veyou-profile 開並登入）`);
  }
  const page = list.find((t) => t.type === 'page' && t.url.startsWith('http'));
  if (!page) throw new Error(`CDP ${CDP_PORT} 找不到可用分頁`);
  return page.webSocketDebuggerUrl;
}

/** 在頁面裡跑 JS（回傳值會被 JSON 化）。 */
async function evaluate(cdp, expression, sessionId) {
  const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text || 'page error');
  return r.result.value;
}

/* ------------------------------------------------------------------ l0veyou 操作 */
async function generate(prompt, imagePath) {
  // 直接連 l0veyou 分頁自己的 ws（以前先 attachToTarget 再帶 sessionId，多一層、斷線也不知道）
  let cdp = await connect();
  const sessionId = undefined;

  // 1. 新對話
  await evaluate(cdp, `(() => { const b = document.querySelector('button.new-chat'); if (b) { b.click(); return 'new-chat'; } return 'no-new-chat'; })()`, sessionId);
  await sleep(1500);

  // 2. 上傳參考圖（照片）——走 DOM.setFileInputFiles 才會觸發 change 事件
  if (imagePath) {
    const doc = await cdp.send('DOM.getDocument', {}, sessionId);
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: 'input[type=file]' }, sessionId);
    if (nodeId) await cdp.send('DOM.setFileInputFiles', { nodeId, files: [imagePath] }, sessionId);
    await sleep(2500);
  }

  // 3. 選模型（預設就是 GPT Image 2，先按開來看有沒有這個字）＋ 1:1 比例
  await evaluate(cdp, `(() => {
    const t = document.querySelector('button.model-trigger');
    if (t) t.click();
    return !!t; })()`, sessionId);
  await sleep(800);
  await evaluate(cdp, `(() => {
    const want = /GPT\\s*Image\\s*2/i;
    const hit = [...document.querySelectorAll('button,[role=option],[role=menuitem]')].find(e => want.test(e.textContent||''));
    if (hit) { hit.click(); return 'model-ok'; }
    document.body.click(); return 'model-default';
  })()`, sessionId);
  await sleep(600);
  await evaluate(cdp, `(() => { const b = [...document.querySelectorAll('button.ratio-btn')].find(e => /1\\s*:\\s*1/.test(e.textContent||''));
    if (b) { b.click(); return 'ratio-1:1'; } return 'ratio-default'; })()`, sessionId);

  // 4. 貼提示詞（用 native setter 讓 React 收到 change）
  const ta = 'textarea[aria-label="消息输入框"]';
  await evaluate(cdp, `(() => {
    const el = document.querySelector(${JSON.stringify(ta)});
    if (!el) return 'no-textarea';
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(el, ${JSON.stringify(prompt)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return 'typed'; })()`, sessionId);
  await sleep(400);

  // 5. 送出前先記下畫面上既有的圖（記在 Node 這邊——放在 window 上，頁面一換就不見）
  const before = await evaluate(cdp, `[...document.querySelectorAll('img')].map(i => i.currentSrc || i.src).filter(Boolean)`, sessionId);
  const sent = await evaluate(cdp, `(() => { const b = document.querySelector('button.send'); if (b) { b.click(); return 'sent'; } return 'no-send'; })()`, sessionId);
  if (sent !== 'sent') { cdp.close(); throw new Error('找不到送出鈕（button.send）'); }

  // 6. 等成品圖：l0veyou 生好的圖 alt 就是提示詞 → 優先認 alt；沒有 alt 才退回「送出後新出現、夠大、載完」的圖。
  //    任何一次輪詢失敗（連線斷、頁面重整、超時）就重連再等，不再讓 job 永遠卡在 running。
  const probe = `((before, prompt) => {
    const ok = (i) => i.complete && i.naturalWidth > 256 && !/avatar|logo|icon/i.test(i.src) && !before.includes(i.currentSrc || i.src);
    const imgs = [...document.querySelectorAll('img')].filter(ok);
    const hit = imgs.filter(i => (i.alt || '').trim() === prompt.trim()).pop() || imgs.pop();
    return hit ? { src: hit.currentSrc || hit.src, size: hit.naturalWidth + 'x' + hit.naturalHeight, byAlt: (hit.alt || '').trim() === prompt.trim() } : null;
  })(${JSON.stringify(before)}, ${JSON.stringify(prompt)})`;
  const started = Date.now();
  while (Date.now() - started < WAIT_MS) {
    await sleep(5000);
    try {
      const hit = await evaluate(cdp, probe, sessionId);
      if (hit) { cdp.close(); return { ...hit, elapsed: Math.round((Date.now() - started) / 1000) }; }
    } catch (e) {
      console.warn(`[l0veyou] 輪詢失敗（${e.message}），重連再等`);
      cdp.close();
      try { cdp = await connect(); } catch (e2) { console.warn(`[l0veyou] 重連失敗：${e2.message}`); }
    }
  }
  cdp.close();
  throw new Error(`等 ${Math.round(WAIT_MS / 60000)} 分鐘沒看到成品圖（網站慢或選擇器變了）`);
}

/* ------------------------------------------------------------------ HTTP */
const jobs = new Map();

function json(res, code, body) {
  const data = JSON.stringify(body);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(data) });
  res.end(data);
}

function readBody(req) {
  return new Promise((res) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => res(Buffer.concat(c))); });
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json',
  '.gif': 'image/gif', '.ico': 'image/x-icon' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/health') {
    try {
      const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
      return json(res, 200, { ok: true, cdp: CDP_PORT, pages: list.filter((t) => t.type === 'page').length });
    } catch (e) { return json(res, 503, { ok: false, error: String(e.message) }); }
  }

  if (url.pathname === '/api/edit' && req.method === 'POST') {
    const raw = await readBody(req);
    const ctype = req.headers['content-type'] || '';
    let prompt = '', imagePath = null;
    if (ctype.includes('multipart/form-data')) {
      // 極簡 multipart 解析：只需要 prompt 與 image 兩個欄位
      const boundary = '--' + ctype.split('boundary=')[1];
      const parts = raw.toString('latin1').split(boundary).slice(1, -1);
      for (const part of parts) {
        const [head, ...rest] = part.split('\r\n\r\n');
        const body = rest.join('\r\n\r\n');
        const name = (head.match(/name="([^"]+)"/) || [])[1];
        if (name === 'prompt') prompt = Buffer.from(body.replace(/\r\n$/, ''), 'latin1').toString('utf8');
        if (name === 'image') {
          const tmp = path.join(require('os').tmpdir(), `sf-ref-${Date.now()}.png`);
          fs.writeFileSync(tmp, Buffer.from(body.replace(/\r\n$/, ''), 'latin1'));
          imagePath = tmp;
        }
      }
    } else {
      const b = JSON.parse(raw.toString('utf8') || '{}');
      prompt = b.prompt || ''; imagePath = b.imagePath || null;
    }
    if (!prompt) return json(res, 400, { error: 'prompt 是必填' });

    const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    jobs.set(jobId, { status: 'running', started: Date.now() });
    json(res, 202, { jobId, note: 'l0veyou 一張 5–12 分鐘，請輪詢 /api/job/<id>' });

    generate(prompt, imagePath).then(async (out) => {
      let dataUrl = out.src;
      if (/^https?:/.test(out.src)) {                       // 遠端圖 → 抓回來轉 data URL
        const r = await fetch(out.src);                     // l0veyou 回的是 JPEG，mime 照實際的標
        const mime = (r.headers.get('content-type') || 'image/png').split(';')[0];
        dataUrl = `data:${mime};base64,` + Buffer.from(await r.arrayBuffer()).toString('base64');
      }
      jobs.set(jobId, { status: 'done', dataUrl, size: out.size, elapsed: out.elapsed });
    }).catch((e) => jobs.set(jobId, { status: 'error', error: String(e.message || e) }))
      .finally(() => { if (imagePath) try { fs.unlinkSync(imagePath); } catch {} });
    return;
  }

  if (url.pathname.startsWith('/api/job/')) {
    const job = jobs.get(url.pathname.slice('/api/job/'.length));
    return job ? json(res, 200, job) : json(res, 404, { error: 'unknown job' });
  }

  // 靜態檔（spriteforge 本體）
  const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
  const file = path.join(STATIC_ROOT, rel);
  if (!file.startsWith(STATIC_ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory())
    return json(res, 404, { error: 'not found' });
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

server.listen(PORT, () => {
  console.log(`spriteforge + l0veyou bridge → http://localhost:${PORT}`);
  console.log(`  CDP ${CDP_PORT}（需先用 .l0veyou-profile 開 Chrome 並登入 ${SITE}）`);
  console.log(`  端點：POST /api/edit（prompt[, image]）→ {jobId}；GET /api/job/<id>；GET /api/health`);
});
