import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const entry = '/docs/research/2026-09-25-crypto-design/index.html';
const allowed = ['/docs/research/2026-09-25-crypto-design/', '/artifacts/research/2026-09-25-crypto-design/', '/artifacts/research/fade-characterization/', '/artifacts/verification/', '/app/public/fonts/', '/landing/public/fonts/'];
const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.json':'application/json', '.md':'text/plain; charset=utf-8', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp', '.woff2':'font/woff2' };
const server = http.createServer((req,res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    if (pathname === '/') { res.writeHead(302, { Location: entry }); res.end(); return; }
    const file = path.resolve(root, `.${pathname}`);
    const relative = `/${path.relative(root, file).split(path.sep).join('/')}`;
    const ext = path.extname(file);
    if (!['GET','HEAD'].includes(req.method) || !file.startsWith(`${root}${path.sep}`) || !allowed.some(prefix => relative.startsWith(prefix)) || !types[ext] || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404); res.end('Not found'); return;
    }
    res.writeHead(200, { 'Content-Type':types[ext], 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' });
    if (req.method === 'HEAD') res.end(); else fs.createReadStream(file).pipe(res);
  } catch { res.writeHead(400); res.end('Bad request'); }
});
server.listen(4193, '127.0.0.1', () => console.log(`Design research: http://127.0.0.1:4193${entry}`));
