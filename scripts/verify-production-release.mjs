/** Public, read-only production release checks. No wallet connection or transaction. */
import { chromium, expect, request } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { compareReleaseBody, assertReleaseCsp, assertHtmlCacheControl } from './release-integrity.mjs';
import { releaseExpectations, readinessPattern, assertPublishedKernelBundle } from './release-expectations.mjs';
import { expectedInstanceKey, assertObservedKernelReadback } from './release-kernel-readback.mjs';
import { settleRenderedPage, waitForFonts } from './lib/browser-settle.mjs';
const expected=releaseExpectations(process.env);
const base=expected.base;
const expectedFootprint=expected.contractId?expectedInstanceKey(expected.contractId):null;
const output=process.env.RELEASE_OUTPUT||'artifacts/verification/2026-09-26-cloudflare-release/live';
await mkdir(output,{recursive:true});
const report={base,expected,at:new Date().toISOString(),status:'running',http:[],ui:[],pageErrors:[],consoleErrors:[],requestFailures:[],csp:[],kernelReadRequests:[],kernelReadbacks:[],kernelReadbackFailures:[],networkReadbacks:[]};
const identityResponses=[];
const userAgent='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const api=await request.newContext({userAgent});
let browser;
const hash=b=>createHash('sha256').update(b).digest('hex');
const panelHeadings={fade:'Find a pickup',pod:'Pod · Private',trigger:'Trigger · Private',envoy:'Envoy · Private',ramp:'Transfer',ledger:'Activity'};
try{
 const verifiedAppBundles=[];
 const routes=[['/','index.html'],['/app/','app/index.html'],...['instruments','fade','pod','trigger','envoy','ramp','ledger'].map(x=>[`/${x}`,`${x}.html`]),['/app-assets.json','app-assets.json'],...['favicon.svg','favicon-96.png','favicon.ico','apple-touch-icon.png'].map(x=>[`/${x}`,x])];
 const manifest=JSON.parse(await readFile('app/site/app-assets.json','utf8'));
 for(const entry of manifest.assets)routes.push([entry.href,entry.href.slice(1)]);
 const landing=await readFile('app/site/index.html','utf8');
 for(const [,href]of landing.matchAll(/(?:src|href)="(\/assets\/[^"?]+\.(?:js|css))"/g))routes.push([href,href.slice(1)]);
 for(const [route,file]of routes){
  const response=await api.get(`${base}${route}`);expect(response.status(),route).toBe(200);
  const body=await response.body(),headers=response.headers();
  const expectedBody=await readFile(`app/site/${file}`);
  const evidence={route,status:response.status(),sha256:hash(body),expectedSha256:hash(expectedBody),headers:{csp:headers['content-security-policy'],cacheControl:headers['cache-control'],hsts:headers['strict-transport-security']}};
  report.http.push(evidence);
  // no-transform requires exact HTML bytes too; historical JSD normalization
  // remains available for old evidence but is never accepted for this release.
  if(file.endsWith('.html'))assertHtmlCacheControl(headers['cache-control']);
  const {applicationBody:comparableBody,edgeInjection}=compareReleaseBody(body,expectedBody);
  Object.assign(evidence,{applicationSha256:hash(comparableBody),edgeInjection});
  expect(hash(comparableBody),`${route}: deployed application bytes match reviewed artifact`).toBe(hash(expectedBody));
  if(route.startsWith('/_next/static/')&&route.endsWith('.js'))verifiedAppBundles.push({route,body:comparableBody});
  expect(headers['x-content-type-options']).toBe('nosniff');expect(headers['x-frame-options']).toBe('DENY');
  assertReleaseCsp(headers['content-security-policy']);
 }
 report.kernelBundle=assertPublishedKernelBundle(verifiedAppBundles,expected);
 for(const route of ['/assets/release-check-missing.js','/_next/static/release-check-missing.js','/.env','/app/.env']){
  const response=await api.get(`${base}${route}`);expect(response.status(),route).toBe(404);report.http.push({route,status:response.status()});
 }
 browser=await chromium.launch({executablePath:'/opt/google/chrome/chrome',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader']});
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce',userAgent});
 await page.exposeFunction('__releaseCSP',e=>report.csp.push(e));
 await page.addInitScript(()=>document.addEventListener('securitypolicyviolation',e=>window.__releaseCSP({url:location.href,blockedURI:e.blockedURI,directive:e.violatedDirective})));
 page.on('pageerror',e=>report.pageErrors.push({url:page.url(),message:e.message}));
 page.on('console',e=>{if(e.type()==='error')report.consoleErrors.push({url:page.url(),message:e.text(),location:e.location()})});
 page.on('requestfailed',r=>report.requestFailures.push({url:r.url(),error:r.failure()?.errorText}));
 page.on('request',r=>{
  if(r.method()!=='POST'||new URL(r.url()).origin!=='https://soroban-testnet.stellar.org')return;
  try{
   const body=r.postDataJSON();
   if(body?.method==='getLedgerEntries'&&Array.isArray(body.params?.keys))report.kernelReadRequests.push({url:r.url(),keys:body.params.keys.filter(key=>typeof key==='string')});
  }catch{/* Non-JSON traffic cannot establish a kernel identity read. */}
 });
 page.on('response',response=>{
  if(!expectedFootprint||new URL(response.url()).origin!=='https://soroban-testnet.stellar.org')return;
  let body;try{body=response.request().postDataJSON();}catch{return;}
  if(body?.method!=='getNetwork'&&!(body?.method==='getLedgerEntries'&&body.params?.keys?.includes(expectedFootprint)))return;
  identityResponses.push((async()=>{
   try{
    expect(response.ok(),'Kernel identity RPC HTTP status').toBe(true);
    const raw=await response.json();
    if(body.method==='getNetwork'){
     expect(raw.error).toBeUndefined();expect(raw.result?.passphrase).toBe('Test SDF Network ; September 2015');
     report.networkReadbacks.push({passphrase:raw.result.passphrase});
    }else report.kernelReadbacks.push(assertObservedKernelReadback(raw,expected));
   }catch(error){report.kernelReadbackFailures.push({method:body.method,message:error.message});}
  })());
 });
 await page.goto(base,{waitUntil:'domcontentloaded'});
 await expect(page.locator('.orbital-scene')).toHaveClass(/is-ready/,{timeout:60000});
 await waitForFonts(page);await page.screenshot({path:`${output}/landing-desktop.png`});
 await expect(page.getByRole('link',{name:'How it works',exact:true})).toHaveCount(0);
 await page.getByRole('navigation',{name:'Main navigation',exact:true}).getByRole('link',{name:'Instruments',exact:true}).click();
 await expect(page.locator('#directory-title')).toBeVisible();
 report.ui.push('Landing scene and canonical Instruments navigation');
 await page.goto(`${base}/app/?tab=fade`,{waitUntil:'domcontentloaded'});
 await expect(page.locator('.orbital-backdrop')).toHaveClass(/is-ready/,{timeout:60000});
 await expect(page.locator('.station-dock [role="tab"]')).toHaveCount(6);
 await expect(page.locator('.station-open-instrument')).toHaveCount(0);
 await waitForFonts(page);
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:width===1440?1000:844});
  for(const id of ['fade','pod','trigger','envoy','ramp','ledger']){
   await page.locator(`#tab-${id}`).click();await expect(page.locator(`#panel-${id}`)).toBeVisible();
   await expect(page.locator(`#panel-${id}`).getByRole('heading',{name:panelHeadings[id],exact:true}),`${id}: actual task interface`).toBeVisible();
   if(['pod','trigger','envoy'].includes(id)){
    await expect(page.locator(`#panel-${id} [data-private-instrument="${id}"]`)).toBeVisible();
    await expect(page.locator(`#panel-${id}`).getByText('Experimental testnet. One operator holds the development trustee keys. Deposits, withdrawals and fee payers remain public.',{exact:true})).toBeVisible();
    await expect(page.locator(`#panel-${id}`).getByRole('button',{name:'Prepare private operation',exact:true})).toBeDisabled();
   }
   await settleRenderedPage(page,{selector:`#panel-${id}`});
   await page.locator('.station-drawer-scroll').evaluate(el=>{el.scrollTop=0});
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   const workspace=await page.locator('.station-workspace').boundingBox();expect(workspace.x).toBeGreaterThanOrEqual(0);expect(workspace.x+workspace.width).toBeLessThanOrEqual(width+1);
   await page.screenshot({path:`${output}/${width}-${id}.png`});report.ui.push(`${width}px: ${id} workspace`);
  }
 }
 await page.locator('#tab-fade').click();
 await expect(page.locator('main.station-app')).toHaveAttribute('data-protocol-readiness',readinessPattern(expected.readiness),{timeout:30000});
 report.protocolStatus={readiness:await page.locator('main.station-app').getAttribute('data-protocol-readiness'),message:await page.locator('#protocol-availability').count()?await page.locator('#protocol-availability').innerText():null};
 if(expectedFootprint){
  await Promise.all(identityResponses);
  expect(report.kernelReadbackFailures,'Every observed identity response must match').toEqual([]);
  expect(report.kernelReadbacks.length,'Actual matching kernel response observed').toBeGreaterThan(0);
  expect(report.networkReadbacks.length,'Actual matching testnet network response observed').toBeGreaterThan(0);
  expect(report.kernelReadRequests.some(request=>request.keys.includes(expectedFootprint)),'Browser reads the exact expected testnet kernel instance').toBe(true);
  report.protocolStatus.observedContractInstance=expected.contractId;
 }
 const fade=page.locator('#panel-fade');
 await fade.getByRole('button',{name:'Sell',exact:true}).click();
 await expect(fade.getByRole('button',{name:'Save listing and fund offer',exact:true})).toHaveCount(0);
 await expect(fade.getByRole('button',{name:'Register merchant key',exact:true})).toHaveCount(0);
 await expect(fade.getByRole('button',{name:'Connect wallet',exact:true})).toBeVisible();
 await fade.getByRole('button',{name:'Find a pickup',exact:true}).click();
 await fade.locator('summary').filter({hasText:'Existing public positions'}).click();
 await expect(fade.getByRole('heading',{name:'Load an existing Fade',exact:true})).toBeVisible();
 await expect(fade.getByRole('button',{name:'Lock the pot',exact:true})).toHaveCount(0);
 report.ui.push(expected.readiness==='ready'?'Original kernel verified and original record reader preserved; disconnected marketplace cannot fund or register':'Original kernel gate remains unavailable as expected; disconnected marketplace cannot fund or register');
 await page.getByRole('button',{name:'Close instrument',exact:true}).click();
 await expect(page.locator('.station-workspace')).toBeHidden();await page.screenshot({path:`${output}/app-mobile-orbit.png`});
 report.status=report.pageErrors.length||report.consoleErrors.length||report.requestFailures.length||report.csp.length?'failed':'passed';
}catch(e){report.status='failed';report.failure={message:e.message,stack:e.stack};}
finally{await browser?.close();await api.dispose();await writeFile(`${output}/results.json`,JSON.stringify(report,null,2));}
console.log(JSON.stringify({status:report.status,httpChecks:report.http.length,uiChecks:report.ui.length,protocolStatus:report.protocolStatus,failure:report.failure,pageErrors:report.pageErrors,consoleErrors:report.consoleErrors,requestFailures:report.requestFailures,csp:report.csp}));
if(report.status!=='passed')process.exitCode=1;
