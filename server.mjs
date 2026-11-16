import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import {promisify} from 'node:util';
// 2026-11-01: PORT/HOST env so a branch worktree can run its own preview server
const PORT=Number(process.env.PORT)||5024,HOST=process.env.HOST||'100.79.149.0';
const project=path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
// 2026-11-16 perf: MISTVALE_ROOT lets a perf experiment serve a frozen copy of the build
// (output/perf-load/net/...) without touching the live outputs/ directory.
const root=process.env.MISTVALE_ROOT
  ? path.resolve(process.env.MISTVALE_ROOT)
  : (path.basename(path.dirname(project))==='work'?path.resolve(project,'../../outputs'):path.join(project,'dist'));
// 2026-10-15:PWA 檔案要真的送出去(以前每個路徑都回遊戲 HTML,sw.js/manifest/icon 全是 HTML →
// service worker 註冊不起來、手機加到主畫面的圖示也是舊的)。
const PWA=path.join(project,'pwa');
const MIME={'.js':'text/javascript; charset=utf-8','.webmanifest':'application/manifest+json; charset=utf-8',
            '.png':'image/png','.webp':'image/webp','.json':'application/json; charset=utf-8','.html':'text/html; charset=utf-8'};

// ── 2026-11-16 perf-net S1/S2: compression + validators ────────────────────────────────
// Before this change the HTML was served with `Cache-Control: no-store` and no
// Content-Encoding: every reload re-downloaded 2.99 MB and every /media file was refetched
// in full (no ETag / Last-Modified). Now:
//   * HTML: brotli (or gzip) negotiated from Accept-Encoding, strong ETag per representation,
//     `Cache-Control: no-cache` (always revalidate, so a rebuilt file still reaches players),
//     304 on If-None-Match / If-Modified-Since. `Vary: Accept-Encoding` is mandatory here.
//   * /media/* + PWA files: strong ETag from size+mtime, Last-Modified, 304 on revalidation.
//     Still `no-cache` so a changed asset is seen on the next reload.
//   * X-Mistvale-Build: sha of the HTML bytes (same value in the 200 and the 304) — pwa/sw.js
//     uses it as the cache version, so a rebuild bumps the SW cache without editing sw.js.
const brotli=promisify(zlib.brotliCompress), gzip=promisify(zlib.gzip);
const BROTLI_OPTS={params:{[zlib.constants.BROTLI_PARAM_QUALITY]:5}};   // q5 ≈ 105 ms / 3 MB; q11 ≈ 6.8 s is not acceptable per request

// Pick the best Content-Encoding the client accepts. `q=0` (or `identity` only) means no encoding.
function pickEncoding(header){
  if(!header)return 'identity';
  const q=new Map();
  for(const part of String(header).split(',')){
    const [tok,...params]=part.split(';');
    const name=(tok||'').trim().toLowerCase();
    if(!name)continue;
    let qv=1;
    for(const p of params){const m=/^\s*q\s*=\s*([0-9.]+)/i.exec(p);if(m)qv=Number(m[1]);}
    q.set(name,Number.isFinite(qv)?qv:0);
  }
  for(const enc of ['br','gzip']){
    const qv=q.has(enc)?q.get(enc):(q.has('*')?q.get('*'):0);
    if(qv>0)return enc;
  }
  return 'identity';
}
// Does the request's conditional headers say "my copy is still current"?
function notModified(req,etag,st){
  const inm=req.headers['if-none-match'];
  if(inm!==undefined){
    // RFC 9110: If-None-Match takes precedence; If-Modified-Since is ignored when it is present.
    if(String(inm)==='*')return true;
    return String(inm).split(',').some(t=>t.trim()===etag);
  }
  const ims=req.headers['if-modified-since'];
  if(ims){
    const t=Date.parse(ims);
    if(Number.isFinite(t)&&Math.floor(st.mtimeMs/1000)<=Math.floor(t/1000))return true;
  }
  return false;
}
// HTML payload cache: one entry per (mtime,size) of the built file. Compression is async
// (libuv threadpool) so a cold server never blocks the event loop for ~100 ms.
const htmlPath=path.join(root,'暮影村.html');
let htmlCache=null, htmlLoading=null;
async function loadHtml(){
  const st=await fs.stat(htmlPath);
  const key=st.mtimeMs+':'+st.size;
  if(htmlCache&&htmlCache.key===key)return htmlCache;
  if(htmlLoading)return htmlLoading;
  htmlLoading=(async()=>{
    const raw=await fs.readFile(htmlPath);
    const build=crypto.createHash('sha1').update(raw).digest('hex').slice(0,20);
    const [br,gz]=await Promise.all([brotli(raw,BROTLI_OPTS),gzip(raw,{level:9})]);
    htmlCache={key,raw,gz,br,build,mtimeMs:st.mtimeMs,size:st.size};
    return htmlCache;
  })().finally(()=>{htmlLoading=null;});
  return htmlLoading;
}
// Warm the compressed copies right after listen(): the first real visitor then never waits
// for compression. Failure is harmless (the file may not exist yet on a fresh checkout).
function warmHtml(){loadHtml().catch(()=>{});}

async function serveHtml(req,res){
  const h=await loadHtml();
  const enc=pickEncoding(req.headers['accept-encoding']);
  const etag=`"${h.build}${enc==='br'?'-br':enc==='gzip'?'-gz':''}"`;
  const headers={
    'Content-Type':'text/html; charset=utf-8',
    'Cache-Control':'no-cache',   // 2026-11-16: was no-store; no-cache still revalidates on every load,
                                  // so a rebuild is picked up immediately, but an unchanged build costs ~200 B.
    'ETag':etag,
    'Last-Modified':new Date(h.mtimeMs).toUTCString(),
    'Vary':'Accept-Encoding',
    'X-Mistvale-Build':h.build,
  };
  if(notModified(req,etag,{mtimeMs:h.mtimeMs})){res.writeHead(304,headers);res.end();return;}
  let body=h.raw, coding='identity';
  if(enc==='br'){body=h.br;coding='br';}
  else if(enc==='gzip'){body=h.gz;coding='gzip';}
  if(coding!=='identity')headers['Content-Encoding']=coding;
  headers['Content-Length']=body.length;
  res.writeHead(200,headers);
  res.end(req.method==='HEAD'?undefined:body);
}

// /media/* and the PWA files: validators only. These are already-compressed images, so
// gzip/brotli would only burn CPU (and can grow PNG/WebP by a few bytes).
async function serveFile(req,res,filePath,type,extraHeaders){
  const st=await fs.stat(filePath);
  if(!st.isFile()||st.size===0)throw Object.assign(new Error('not a file'),{code:'ENOENT'});
  const etag=`"m${st.size.toString(16)}-${Math.round(st.mtimeMs).toString(16)}"`;
  const headers={
    'Content-Type':type||MIME[path.extname(filePath)]||'application/octet-stream',
    'Cache-Control':'no-cache',   // revalidate every load; content updates are still seen
    'ETag':etag,
    'Last-Modified':new Date(st.mtimeMs).toUTCString(),
    ...extraHeaders,
  };
  if(notModified(req,etag,st)){res.writeHead(304,headers);res.end();return;}
  const body=await fs.readFile(filePath);
  headers['Content-Length']=body.length;
  res.writeHead(200,headers);
  res.end(req.method==='HEAD'?undefined:body);
}

http.createServer(async(req,res)=>{
  try{
    if(req.url.startsWith('/favicon')){res.writeHead(204).end();return;}
    // 2026-10-26:效能回報(遊戲網址加 ?perf=1 時每 3 秒 POST 一次)→ 一行一筆寫進 output/perf-log/perf-<日期>.jsonl
    if(req.method==='POST'&&req.url.startsWith('/perf')){
      let body='';for await(const c of req){body+=c;if(body.length>65536)break;}
      try{const rec=JSON.parse(body);rec.ip=req.socket.remoteAddress;const dir=path.join(project,'output','perf-log');await fs.mkdir(dir,{recursive:true});
        await fs.appendFile(path.join(dir,`perf-${new Date().toISOString().slice(0,10)}.jsonl`),JSON.stringify(rec)+'\n');}catch{}
      res.writeHead(204).end();return;
    }
    // 2026-10-27:大張圖改成外部檔案(build.mjs → <out>/media/...),要真的送出去,不能回 HTML。
    const urlPath=decodeURIComponent(new URL(req.url,'http://x').pathname);
    if(urlPath.startsWith('/media/')){
      const rel=urlPath.slice('/media/'.length).split('/').filter(s=>s&&s!=='..'&&s!=='.');
      const file=path.join(root,'media',...rel);
      const mediaRoot=path.resolve(root,'media')+path.sep;
      if(!path.resolve(file).startsWith(mediaRoot))throw Object.assign(new Error('bad path'),{code:'ENOENT'});
      const type=rel.at(-1).endsWith('.json')?'application/json; charset=utf-8':(MIME[path.extname(rel.at(-1))]||'application/octet-stream');
      await serveFile(req,res,file,type);return;
    }
    const name=path.basename(new URL(req.url,'http://x').pathname);
    if(name&&/^(sw\.js|manifest\.webmanifest|icon-192\.png|icon-512\.png|icon-maskable-512\.png|apple-touch-icon\.png)$/.test(name)){
      await serveFile(req,res,path.join(PWA,name),MIME[path.extname(name)]||'application/octet-stream');return;
    }
    await serveHtml(req,res);
  }catch(e){
    if(e&&e.code==='ENOENT'){res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'}).end('Not found');return;}
    res.writeHead(503,{'Content-Type':'text/plain; charset=utf-8'}).end('Building Mistvale...');
  }
}).listen(PORT,HOST,()=>{console.log(`Mistvale http://${HOST}:${PORT}`);warmHtml();});
