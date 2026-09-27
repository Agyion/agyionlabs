import { cp, mkdir, readFile, stat, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildAppAssetManifest } from './app-asset-manifest.mjs';
import { buildSiteHeaders } from './site-headers.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const site=path.join(root,process.argv.includes('--demo') ? 'artifacts/mock-site' : 'app/site');
await rm(site,{recursive:true,force:true});await mkdir(site,{recursive:true});
await cp(path.join(root,'landing/dist'),site,{recursive:true});
for(const item of ['_next','app','404.html','favicon.svg','zk','places']) await cp(path.join(root,'app/out',item),path.join(site,item),{recursive:true});
const [appBuild, loadable] = await Promise.all(['app-build-manifest.json', 'react-loadable-manifest.json'].map(async file => JSON.parse(await readFile(path.join(root, 'app/.next', file), 'utf8'))));
const appAssets = buildAppAssetManifest(appBuild, loadable);
for (const { href } of appAssets.assets) {
  if (!(await stat(path.join(site, href.slice(1)))).isFile()) throw new Error(`App warmup asset is not a file: ${href}`);
}
await writeFile(path.join(site, 'app-assets.json'), `${JSON.stringify(appAssets)}\n`);
await mkdir(path.join(site,'fonts'),{recursive:true});
await cp(path.join(root,'app/out/fonts'),path.join(site,'fonts'),{recursive:true});
// Explicit document routes keep missing scripts/assets as 404s, never landing HTML.
for(const route of ['instruments','fade','pod','trigger','envoy','ramp','ledger']) await cp(path.join(site,'index.html'),path.join(site,`${route}.html`));
const hashes=new Set();
for(const file of ['index.html','app/index.html','404.html']) {
 const html=await readFile(path.join(site,file),'utf8');
 for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
  if(!/\bsrc\s*=/.test(match[1]) && match[2].trim()) hashes.add(`'sha256-${createHash('sha256').update(match[2]).digest('base64')}'`);
 }
}
const csp=`default-src 'self'; script-src 'self' 'wasm-unsafe-eval' ${[...hashes].join(' ')}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https: wss:; frame-src https:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`;
if(csp.length+30>2000) throw new Error('CSP exceeds Cloudflare _headers line limit');
await writeFile(path.join(site,'_headers'),buildSiteHeaders(csp));
console.log(`Combined site ready (${hashes.size} inline script hashes; ${csp.length} CSP characters).`);
