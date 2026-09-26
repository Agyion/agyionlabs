/** Read-only camera measurement from the fixed stars. Real pointer input; no scene/clock overrides. */
import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const output='artifacts/verification/2026-09-26-polish/sensitivity';
await mkdir(output,{recursive:true});
// Reuse the established, read-only WebGL observation from the pointer QA harness.
const source=await readFile('scripts/verify-pointer-response.mjs','utf8');
const start=source.indexOf('window.__pointerProbe =');
const end=source.indexOf('\n      });',start);
if(start<0||end<0)throw new Error('Pointer observation source unavailable');
const probe=source.slice(start,end);
const report={status:'running',measurement:'Fixed stars camera yaw from the view matrix, with real mouse drags; reduced motion isolates the camera. SwiftShader is not native GPU performance evidence.',routes:[],pageErrors:[],consoleErrors:[],requestFailures:[]};
const browser=await chromium.launch({executablePath:'/opt/google/chrome/chrome',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const yaw=m=>Math.atan2(m[2],m[10]);
const delta=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
try{
 for(const route of ['landing','app']){
  const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  page.on('pageerror',e=>report.pageErrors.push({route,message:e.message}));
  page.on('console',e=>{if(e.type()==='error')report.consoleErrors.push({route,message:e.text(),location:e.location()})});
  page.on('requestfailed',r=>report.requestFailures.push({route,url:r.url(),error:r.failure()?.errorText}));
  await page.addInitScript({content:probe});
  await page.goto(`http://127.0.0.1:4192/${route==='app'?'app/':''}`,{waitUntil:'domcontentloaded'});
  await expect(page.locator(route==='app'?'.orbital-backdrop':'.orbital-scene')).toHaveClass(/is-ready/,{timeout:60000});
  await expect.poll(()=>page.evaluate(()=>window.__pointerProbe.matrix?.length)).toBe(16);
  const canvas=page.locator(route==='app'?'.orbital-canvas canvas':'.orbital-scene__canvas canvas');
  const bounds=await canvas.boundingBox();
  const before=await page.evaluate(()=>window.__pointerProbe.matrix);
  const expected=120*Math.PI*2/bounds.width*(route==='app'?.25:1);
  expect(await page.evaluate(()=>document.elementFromPoint(1100,540)?.tagName),'Drag starts on the actual canvas').toBe('CANVAS');
  await page.mouse.move(1100,540);await page.mouse.down();await page.mouse.move(1220,540,{steps:12});await page.mouse.up();
  await page.mouse.move(20,20);
  await expect.poll(async()=>delta(yaw(before),yaw(await page.evaluate(()=>window.__pointerProbe.matrix))),{timeout:10000}).toBeCloseTo(expected,4);
  const after=await page.evaluate(()=>window.__pointerProbe.matrix);
  const dragged=delta(yaw(before),yaw(after));
  await page.screenshot({path:`${output}/${route}-drag.png`});
  await canvas.focus();await page.keyboard.press('Home');
  await expect.poll(async()=>delta(yaw(before),yaw(await page.evaluate(()=>window.__pointerProbe.matrix)))).toBeCloseTo(0,4);
  await page.keyboard.press('ArrowRight');
  await expect.poll(async()=>delta(yaw(before),yaw(await page.evaluate(()=>window.__pointerProbe.matrix)))).toBeCloseTo(.07,4);
  report.routes.push({route,bounds,dragPixels:120,expectedRadians:expected,actualRadians:dragged,keyboardRadians:.07,resetPassed:true});
  await page.close();
 }
 report.appToLandingRatio=report.routes[1].actualRadians/report.routes[0].actualRadians;
 expect(report.appToLandingRatio).toBeCloseTo(.25,4);
 report.status=report.pageErrors.length||report.consoleErrors.length||report.requestFailures.length?'failed':'passed';
}catch(e){report.status='failed';report.failure={message:e.message,stack:e.stack};}
finally{await browser.close();await writeFile(`${output}/results.json`,JSON.stringify(report,null,2));}
console.log(JSON.stringify(report));if(report.status!=='passed')process.exitCode=1;
