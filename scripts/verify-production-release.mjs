/** Public, read-only production release checks. No wallet connection or transaction. */
import { chromium, expect, request } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { compareReleaseBody, assertReleaseCsp } from './release-integrity.mjs';
const base='https://agyionlabs.dev';
const output=process.env.RELEASE_OUTPUT||'artifacts/verification/2026-09-26-cloudflare-release/live';
await mkdir(output,{recursive:true});
const report={base,at:new Date().toISOString(),status:'running',http:[],ui:[],pageErrors:[],consoleErrors:[],requestFailures:[],csp:[]};
const userAgent='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const api=await request.newContext({userAgent});
let browser;
const hash=b=>createHash('sha256').update(b).digest('hex');
try{
 const routes=[['/','index.html'],['/app/','app/index.html'],...['instruments','fade','pod','trigger','envoy','ramp','ledger'].map(x=>[`/${x}`,`${x}.html`]),['/app-assets.json','app-assets.json']];
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
  const {applicationBody:comparableBody,edgeInjection}=compareReleaseBody(body,expectedBody,file.endsWith('.html'));
  Object.assign(evidence,{applicationSha256:hash(comparableBody),edgeInjection});
  expect(hash(comparableBody),`${route}: deployed application bytes match reviewed artifact`).toBe(hash(expectedBody));
  expect(headers['x-content-type-options']).toBe('nosniff');expect(headers['x-frame-options']).toBe('DENY');
  assertReleaseCsp(headers['content-security-policy']);
 }
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
 await page.goto(base,{waitUntil:'domcontentloaded'});
 await expect(page.locator('.orbital-scene')).toHaveClass(/is-ready/,{timeout:60000});
 await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:`${output}/landing-desktop.png`});
 await page.getByRole('navigation',{name:'Main navigation',exact:true}).getByRole('link',{name:'How it works',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'How it works',exact:true})).toBeVisible();
 await page.keyboard.press('Escape');await expect(page.getByRole('dialog',{name:'How it works',exact:true})).toHaveCount(0);
 report.ui.push('Landing scene and How dialog opened and closed');
 await page.goto(`${base}/app/?tab=fade`,{waitUntil:'domcontentloaded'});
 await expect(page.locator('.orbital-backdrop')).toHaveClass(/is-ready/,{timeout:60000});
 await page.evaluate(()=>document.fonts.ready);
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:width===1440?1000:844});
  for(const id of ['fade','pod','trigger','envoy','ramp','ledger']){
   await page.locator(`#tab-${id}`).click();await expect(page.locator(`#panel-${id}`)).toBeVisible();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   const workspace=await page.locator('.station-workspace').boundingBox();expect(workspace.x).toBeGreaterThanOrEqual(0);expect(workspace.x+workspace.width).toBeLessThanOrEqual(width+1);
   await page.screenshot({path:`${output}/${width}-${id}.png`});report.ui.push(`${width}px: ${id} workspace`);
  }
 }
 await page.locator('#tab-fade').click();
 await expect(page.locator('#protocol-availability')).toHaveAttribute('data-readiness',/incompatible|unavailable/,{timeout:30000});
 report.protocolStatus={readiness:await page.locator('#protocol-availability').getAttribute('data-readiness'),message:await page.locator('#protocol-availability').innerText()};
 await expect(page.getByRole('button',{name:'Lock the pot',exact:true})).toBeDisabled();
 report.ui.push('Protocol write gate remains disabled on old/unavailable testnet kernel');
 await page.getByRole('button',{name:'Close instrument',exact:true}).click();
 await expect(page.locator('.station-workspace')).toBeHidden();await page.screenshot({path:`${output}/app-mobile-orbit.png`});
 report.status=report.pageErrors.length||report.consoleErrors.length||report.requestFailures.length||report.csp.length?'failed':'passed';
}catch(e){report.status='failed';report.failure={message:e.message,stack:e.stack};}
finally{await browser?.close();await api.dispose();await writeFile(`${output}/results.json`,JSON.stringify(report,null,2));}
console.log(JSON.stringify({status:report.status,httpChecks:report.http.length,uiChecks:report.ui.length,protocolStatus:report.protocolStatus,failure:report.failure,pageErrors:report.pageErrors,consoleErrors:report.consoleErrors,requestFailures:report.requestFailures,csp:report.csp}));
if(report.status!=='passed')process.exitCode=1;
