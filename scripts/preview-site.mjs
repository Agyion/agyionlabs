/** Local static preview: same explicit routes and generated headers as the Cloudflare asset config. */
import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {staticPreviewHeaders} from './static-preview-headers.mjs';
const root=path.resolve(process.env.SITE_DIR||fileURLToPath(new URL('../app/site',import.meta.url)));
const port=Number(process.env.PORT||4192);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.ico':'image/x-icon','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.wasm':'application/wasm','.txt':'text/plain; charset=utf-8'};
http.createServer(async(req,res)=>{
 try {
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'});return res.end();}
  const resolved=path.resolve(root,'.'+pathname);
  if(resolved!==root&&!resolved.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  let file;let status=200;
  for(const candidate of [resolved,path.join(resolved,'index.html'),resolved+'.html']){
   if(await stat(candidate).then(s=>s.isFile()).catch(()=>false)){file=candidate;break;}
  }
  if(!file){file=path.join(root,'404.html');status=404;}
  if(file.endsWith('/index.html')&&!pathname.endsWith('/')&&!pathname.endsWith('.html')){res.writeHead(307,{Location:pathname+'/'+new URL(req.url,'http://localhost').search});return res.end();}
  const rules=await readFile(path.join(root,'_headers'),'utf8').catch(()=>'');
  const headers={'content-type':mime[path.extname(file)]||'application/octet-stream',...staticPreviewHeaders(rules,pathname)};
  res.writeHead(status,headers);res.end(req.method==='HEAD'?undefined:await readFile(file));
 }catch{res.writeHead(500);res.end('Preview could not serve this asset.');}
}).listen(port,'127.0.0.1',()=>console.log(`Preview http://127.0.0.1:${port}`));
