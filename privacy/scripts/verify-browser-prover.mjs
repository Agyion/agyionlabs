/** Actual browser-only local-worker proof QA; never submits a transaction.
 * Prepare bundles: BROWSER_PROVER_PREPARE_ONLY=1 node privacy/scripts/verify-browser-prover.mjs
 * Run: PRIVACY_PROVER_MANIFEST=/abs/cases.json node privacy/scripts/verify-browser-prover.mjs
 * Manifest uses the prover-integration.test.mjs schema; only transition is used.
 * No witness or decrypted note is sent through Playwright or served by HTTP.
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const root=fileURLToPath(new URL('../../',import.meta.url));
const output=path.resolve(process.env.BROWSER_PROVER_OUTPUT||path.join(root,'artifacts/verification/privacy-browser-prover'));
fs.mkdirSync(output,{recursive:true});
const esbuildPath=[path.join(root,'node_modules/esbuild/lib/main.js'),path.join(root,'landing/node_modules/esbuild/lib/main.js'),path.join(root,'app/node_modules/esbuild/lib/main.js')].find(p=>fs.existsSync(p));
if(!esbuildPath)throw new Error('A local esbuild installation is required; no package is downloaded by this harness.');
const {build}=await import(pathToFileURL(esbuildPath).href);
const common={bundle:true,format:'esm',platform:'browser',target:'chrome120',conditions:['browser'],define:{'process.browser':'true'},logLevel:'silent',sourcemap:false};
await build({...common,entryPoints:[path.join(root,'privacy/scripts/browser-prover-entry.mjs')],outfile:path.join(output,'harness.mjs')});
await build({...common,entryPoints:[path.join(root,'privacy/src/prover-worker.mjs')],outfile:path.join(output,'prover-worker.mjs')});
if(process.env.BROWSER_PROVER_PREPARE_ONLY==='1'){
 console.log(JSON.stringify({status:'bundled-only',output,actualBrowserProofRun:false}));
}else{
 if(!process.env.PRIVACY_PROVER_MANIFEST)throw new Error('PRIVACY_PROVER_MANIFEST is required for real browser proof QA.');
 const manifestPath=path.resolve(process.env.PRIVACY_PROVER_MANIFEST),manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8')),caseData=manifest.transition;
 if(!caseData)throw new Error('Pinned transition artifact case is required.');
 const file=name=>path.resolve(path.dirname(manifestPath),caseData[name]);
 const files=new Map([
  ['/harness.mjs',{path:path.join(output,'harness.mjs'),type:'text/javascript'}],
  ['/prover-worker.mjs',{path:path.join(output,'prover-worker.mjs'),type:'text/javascript'}],
  ['/circuit.wasm',{path:file('wasm'),type:'application/wasm'}],
  ['/circuit.zkey',{path:file('zkey'),type:'application/octet-stream'}],
  ['/verification-key.json',{path:file('verificationKey'),type:'application/json'}],
 ]);
 for(const entry of files.values())if(!fs.existsSync(entry.path))throw new Error('A required pinned artifact is missing.');
 const html='<!doctype html><meta charset="utf-8"><link rel="icon" href="/favicon.ico"><title>Local privacy prover verification</title><style>body{background:#080a10;color:#f7f3ec;font:16px system-ui;padding:40px;max-width:900px;margin:auto}h1{font-size:30px}pre{white-space:pre-wrap;font-size:13px;color:#b8c6da}</style><h1>Local privacy prover</h1><p>Development proof test. Synthetic local trees and test units. Deposit, Pod, Trigger, Envoy and encrypted recovery; no chain call or production privacy claim.</p><p id="status">Starting</p><pre id="result"></pre><script type="module" src="/harness.mjs"></script>';
 const report={at:new Date().toISOString(),status:'running',checks:[],requests:[],unexpectedRequests:[],console:[],pageErrors:[],httpErrors:[],csp:[],workerCount:0,closedWorkers:0,
  boundary:'Actual browser local worker with pinned development artifacts. No network prover, wallet, chain inclusion, production ceremony or independent audit. Fixture archive anchor is locally generated.'};
 const server=http.createServer((req,res)=>{
  const route=req.url;
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self'; style-src 'unsafe-inline'; img-src 'self'");
  if(route==='/'){res.setHeader('Content-Type','text/html');res.end(req.method==='HEAD'?'':html);return;}
  if(route==='/favicon.ico'){res.writeHead(204);res.end();return;}
  if(route==='/case.json'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({pins:caseData.pins}));return;}
  const found=files.get(route);
  if(!found){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',found.type);res.setHeader('Content-Length',fs.statSync(found.path).size);
  if(req.method==='HEAD')res.end();else fs.createReadStream(found.path).pipe(res);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}`;
 const allowed=new Set(['/', '/case.json','/favicon.ico',...files.keys()]);
 let browser;
 try{
  const executablePath=[process.env.CHROMIUM_PATH,'/opt/google/chrome/chrome',chromium.executablePath(),'/usr/bin/chromium'].filter(Boolean).find(p=>fs.existsSync(p));
  if(!executablePath)throw new Error('Chromium not available.');
  browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox','--disable-background-networking']});
  const context=await browser.newContext({viewport:{width:1100,height:900},serviceWorkers:'block'});
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url()),approved=url.origin===base&&allowed.has(url.pathname)&&url.search===''&&req.method()==='GET'&&req.postData()===null;
   const safe={method:req.method(),resourceType:req.resourceType(),approved,path:approved?url.pathname:'[redacted unexpected URL]',bodyBytes:req.postDataBuffer()?.length||0};
   report.requests.push(safe);
   if(!approved){report.unexpectedRequests.push(safe);await route.abort();}else await route.continue();
  });
  const page=await context.newPage(),workerClosures=[];
  page.on('worker',worker=>{
   report.workerCount++;
   workerClosures.push(new Promise(resolve=>worker.once('close',()=>{report.closedWorkers++;resolve();})));
  });
  page.on('console',message=>report.console.push({type:message.type(),characters:message.text().length}));
  page.on('pageerror',()=>report.pageErrors.push({error:'SANITIZED_PAGE_ERROR'}));
  page.on('response',response=>{if(response.status()>=400)report.httpErrors.push({status:response.status()});});
  await page.exposeBinding('__recordProverCsp',()=>report.csp.push({violation:true}));
  await page.addInitScript(()=>document.addEventListener('securitypolicyviolation',()=>globalThis.__recordProverCsp()));
  // The module can spend seconds proving; do not tie navigation's default
  // timeout to top-level-await completion of that cryptographic workload.
  await page.goto(base,{waitUntil:'commit',timeout:60_000});
  await page.waitForFunction(()=>['passed','failed'].includes(globalThis.__localProverReport?.status),undefined,{timeout:600_000});
  report.browser=await page.evaluate(()=>globalThis.__localProverReport);
  let closeTimeout;
  try{await Promise.race([Promise.all(workerClosures),new Promise((_,reject)=>{closeTimeout=setTimeout(()=>reject(new Error('WORKER_NOT_CLOSED')),5000);})]);}
  finally{clearTimeout(closeTimeout);}
  const expectedFlows=['Deposit','Pod claim','Trigger attestation','Envoy payment'];
  report.checks=[
   {name:'actual browser proof and local note recovery',passed:report.browser.status==='passed'},
   {name:'all four actual proof flows completed',passed:report.browser.flows?.length===expectedFlows.length&&expectedFlows.every((name,i)=>report.browser.flows[i].name===name&&report.browser.flows[i].status==='passed')},
   {name:'complete vault, private draft and note backup restored',passed:['complete vault backup checked including both grant keysets','encrypted vault restores the exact local keys','original complete vault forgotten','wrong vault password rejected','restored Pod draft preserves all157 public bindings','restored Pod note opening remains commitment-bound'].every(name=>report.browser.checks?.some(check=>check.name===name&&check.passed===true))},
   {name:'exactly one dedicated worker with no spawned pool',passed:report.workerCount===1},
   {name:'cancelled proof worker actually closed',passed:report.closedWorkers===1&&report.browser.checks?.some(check=>check.name==='in-flight worker termination rejects without a proof result'&&check.passed===true)},
   {name:'only public same-origin GET assets requested',passed:report.unexpectedRequests.length===0},
   {name:'no console output or page errors',passed:report.console.length===0&&report.pageErrors.length===0},
   {name:'no HTTP or CSP failures',passed:report.httpErrors.length===0&&report.csp.length===0},
  ];
  report.status=report.checks.every(c=>c.passed)?'passed':'failed';
  await page.screenshot({path:path.join(output,'browser-result.png'),fullPage:true});
 }catch{
  report.status='failed';report.harnessError='SANITIZED_BROWSER_HARNESS_FAILURE';
 }finally{
  await browser?.close();await new Promise(resolve=>server.close(resolve));
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
 }
 console.log(JSON.stringify({status:report.status,output,checks:report.checks,browser:report.browser}));
 if(report.status!=='passed')process.exitCode=1;
}
