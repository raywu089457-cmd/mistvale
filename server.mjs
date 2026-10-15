import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const project=path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
const root=path.basename(path.dirname(project))==='work'?path.resolve(project,'../../outputs'):path.join(project,'dist');
// 2026-10-15:PWA 檔案要真的送出去(以前每個路徑都回遊戲 HTML,sw.js/manifest/icon 全是 HTML →
// service worker 註冊不起來、手機加到主畫面的圖示也是舊的)。
const PWA=path.join(project,'pwa');
const MIME={'.js':'text/javascript; charset=utf-8','.webmanifest':'application/manifest+json; charset=utf-8',
            '.png':'image/png','.json':'application/json; charset=utf-8','.html':'text/html; charset=utf-8'};
http.createServer(async(req,res)=>{
  try{
    if(req.url.startsWith('/favicon')){res.writeHead(204).end();return;}
    const name=path.basename(new URL(req.url,'http://x').pathname);
    if(name&&/^(sw\.js|manifest\.webmanifest|icon-192\.png|icon-512\.png|icon-maskable-512\.png|apple-touch-icon\.png)$/.test(name)){
      const file=await fs.readFile(path.join(PWA,name));
      res.writeHead(200,{'Content-Type':MIME[path.extname(name)]||'application/octet-stream','Cache-Control':'no-cache'});
      res.end(file);return;
    }
    const file=await fs.readFile(path.join(root,'暮影村.html'));
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
    res.end(file);
  }catch{res.writeHead(503).end('Building Mistvale...');}
}).listen(5024,'100.79.149.0',()=>console.log('Mistvale http://100.79.149.0:5024'));
