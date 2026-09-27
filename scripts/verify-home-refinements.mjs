import { waitForFonts } from './lib/browser-settle.mjs';
/** Read-only visual checks. The particle experiment is not a production deployment. */
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4292';
const output='artifacts/verification/2026-09-27-home-refinements';
await mkdir(output,{recursive:true});
const report={base,checks:[],errors:[],screenshots:[],status:'running'};
const browser=await chromium.launch({executablePath:'/opt/google/chrome/chrome',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'no-preference'});
page.on('pageerror',e=>report.errors.push(e.message));
page.on('console',e=>{if(e.type()==='error')report.errors.push(e.text())});
const pixels=()=>page.locator('.wordmark-particles').evaluate(c=>{if(!c.width||!c.height)return {count:0,hash:0,width:c.width,height:c.height};const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let count=0,hash=0;for(let i=3;i<d.length;i+=4)if(d[i]>15){count++;hash=(hash+i*d[i])%1000000007}return {count,hash,width:c.width,height:c.height}});
const check=async(name,fn)=>{await fn();report.checks.push(name)};
try{
 await page.goto(base,{waitUntil:'networkidle'});
 await expect(page.locator('.orbital-scene')).toHaveClass(/is-ready/,{timeout:60000});
 await waitForFonts(page);
 await check('No How popup or navigation link',async()=>{await expect(page.getByRole('link',{name:'How it works',exact:true})).toHaveCount(0);await expect(page.locator('dialog')).toHaveCount(0)});
 await check('Letter fragments visible and moving',async()=>{
  await expect.poll(async()=>(await pixels()).count,{timeout:15000}).toBeGreaterThan(12);
  const a=await pixels();await page.waitForTimeout(750);const b=await pixels();expect(b.hash).not.toBe(a.hash);report.particlePixels={a,b};
  expect(await page.locator('.wordmark-particles').evaluate(c=>getComputedStyle(c).pointerEvents)).toBe('none');
 });
 await page.screenshot({path:`${output}/home-desktop.png`});report.screenshots.push('home-desktop.png');
 await check('Reduced motion clears and hides particles',async()=>{await page.emulateMedia({reducedMotion:'reduce'});await expect(page.locator('.wordmark-particles')).toBeHidden();await expect.poll(async()=>(await pixels()).count).toBe(0)});
 await check('Motion can resume without an empty zero-sized canvas',async()=>{await page.emulateMedia({reducedMotion:'no-preference'});await expect.poll(async()=>(await pixels()).count,{timeout:15000}).toBeGreaterThan(12);expect((await pixels()).width).toBeGreaterThan(0)});
 await check('Short viewport resize keeps particles aligned with the scene',async()=>{
  const dimensions=()=>page.locator('.wordmark-particles').evaluate(c=>({cssHeight:c.getBoundingClientRect().height,backingHeight:c.height,ratio:Math.min(devicePixelRatio||1,1.5),heroHeight:c.closest('.immersive-world').getBoundingClientRect().height}));
  await page.setViewportSize({width:1000,height:600});
  await expect.poll(async()=>{const d=await dimensions();return d.backingHeight===Math.round(d.cssHeight*d.ratio)}).toBe(true);
  const before=await dimensions();
  await page.setViewportSize({width:1000,height:400});
  await expect.poll(async()=>{const d=await dimensions();return d.backingHeight===Math.round(d.cssHeight*d.ratio)}).toBe(true);
  const after=await dimensions();
  expect(after.cssHeight).toBeLessThan(before.cssHeight);
  await expect.poll(async()=>(await pixels()).count,{timeout:15000}).toBeGreaterThan(8);
  report.shortViewport={before,after};
 });
 await check('Particles pause when their canvas scrolls out of view',async()=>{
  await page.setViewportSize({width:1000,height:240});
  await expect.poll(()=>page.locator('.wordmark-particles').evaluate(c=>c.getBoundingClientRect().height)).toBe(240);
  await page.evaluate(()=>window.scrollTo({top:450,behavior:'instant'}));
  await expect.poll(()=>page.locator('.wordmark-particles').evaluate(c=>c.getBoundingClientRect().bottom)).toBeLessThanOrEqual(0);
  expect(await page.locator('.immersive-world').evaluate(h=>h.getBoundingClientRect().bottom)).toBeGreaterThan(0);
  await expect.poll(async()=>(await pixels()).count).toBe(0);
  await page.waitForTimeout(150);expect((await pixels()).count).toBe(0);
  await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
  await expect.poll(async()=>(await pixels()).count,{timeout:15000}).toBeGreaterThan(8);
 });
 await check('Graphics context loss clears the old projection and recovers cleanly',async()=>{
  await page.setViewportSize({width:1440,height:1000});
  await expect(page.locator('.orbital-scene')).toHaveClass(/is-ready/,{timeout:60000});
  await expect.poll(async()=>(await pixels()).count,{timeout:15000}).toBeGreaterThan(12);
  const supported=await page.locator('.orbital-scene__canvas canvas').evaluate(c=>{
   const extension=c.getContext('webgl2')?.getExtension('WEBGL_lose_context');
   if(!extension)return false;
   window.__wordmarkLossExtension=extension;extension.loseContext();return true;
  });
  expect(supported,'Chromium must expose WEBGL_lose_context for this recovery check').toBe(true);
  await expect(page.locator('.orbital-scene')).not.toHaveClass(/is-ready/);
  await expect(page.locator('.orbital-fallback')).toBeVisible();
  await expect.poll(async()=>(await pixels()).count).toBe(0);
  // A resize must not republish a projection from the unavailable renderer.
  await page.setViewportSize({width:1400,height:900});
  await page.waitForTimeout(250);expect((await pixels()).count).toBe(0);
  await page.evaluate(()=>{window.__wordmarkLossExtension.restoreContext();delete window.__wordmarkLossExtension});
  await expect(page.locator('.orbital-scene')).toHaveClass(/is-ready/,{timeout:60000});
  await expect.poll(async()=>(await pixels()).count,{timeout:15000}).toBeGreaterThan(12);
 });
 await check('Mobile particles remain visible without horizontal overflow',async()=>{await page.setViewportSize({width:390,height:844});await expect.poll(async()=>(await pixels()).count,{timeout:15000}).toBeGreaterThan(8);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)});
 await page.screenshot({path:`${output}/home-mobile.png`});report.screenshots.push('home-mobile.png');
 await check('Old How link reaches the canonical examples page',async()=>{await page.goto(`${base}/#how-it-works`);await expect(page).toHaveURL(`${base}/instruments`);await expect(page.locator('#directory-title')).toBeVisible();await expect(page.locator('dialog')).toHaveCount(0)});
 await check('Home re-entry mounts one functioning particle canvas',async()=>{await page.locator('.orbital-brand').click();await expect(page.locator('.wordmark-particles')).toHaveCount(1);await expect.poll(async()=>(await pixels()).count,{timeout:15000}).toBeGreaterThan(8)});
 for(const route of ['/','/app/'])await check(`${route} raster favicon served`,async()=>{const html=await(await page.request.get(base+route)).text();expect(html).toContain('/favicon-96.png');const icon=await page.request.get(base+'/favicon-96.png');expect(icon.status()).toBe(200);expect(icon.headers()['content-type']).toContain('image/png');expect((await icon.body()).subarray(1,4).toString()).toBe('PNG')});
 await check('Classic ICO fallback served as an icon',async()=>{const icon=await page.request.get(base+'/favicon.ico');expect(icon.status()).toBe(200);expect(icon.headers()['content-type']).toMatch(/image\/(x-icon|vnd.microsoft.icon)/);expect([...(await icon.body()).subarray(0,4)]).toEqual([0,0,1,0])});
 expect(report.errors).toEqual([]);report.status='passed';
}catch(e){report.status='failed';report.failure=e.stack||e.message}
finally{await browser.close();await writeFile(`${output}/results.json`,JSON.stringify(report,null,2));}
console.log(JSON.stringify(report,null,2));if(report.status!=='passed')process.exitCode=1;
