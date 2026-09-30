import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const project=path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
const root=path.basename(path.dirname(project))==='work'?path.resolve(project,'../../outputs'):path.join(project,'dist');
http.createServer(async(req,res)=>{try{if(req.url.startsWith('/favicon')){res.writeHead(204).end();return;}const file=await fs.readFile(path.join(root,'暮影村.html'));res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(file);}catch{res.writeHead(503).end('Building Mistvale...');}}).listen(5024,'100.79.149.0',()=>console.log('Mistvale http://100.79.149.0:5024'));

