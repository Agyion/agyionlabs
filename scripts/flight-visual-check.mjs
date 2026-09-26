/** Normal-motion, local-only walkthrough. No wallet or chain operations. */
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const output = 'artifacts/verification/film-flight';
await mkdir(output, {recursive:true});
const browser = await chromium.launch({executablePath:'/opt/google/chrome/chrome',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const page = await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1,reducedMotion:'no-preference'});
const errors=[], shots=[], requestFailures=[], consoleErrors=[], pageErrors=[];
let failure=null, status='running', checks=null;
page.on('pageerror',e=>{
 errors.push(e.message);
 pageErrors.push({message:e.message,stack:e.stack,url:page.url(),at:Date.now()});
});
page.on('console',m=>{
 if(m.type()!=='error')return;
 errors.push(m.text());
 consoleErrors.push({message:m.text(),location:m.location(),url:page.url(),at:Date.now()});
});
page.on('requestfailed',request=>requestFailures.push({
 url:request.url(),method:request.method(),resourceType:request.resourceType(),
 error:request.failure()?.errorText??'Unknown request failure',pageUrl:page.url(),at:Date.now(),
}));
const persist=()=>writeFile(`${output}/walkthrough.json`,JSON.stringify({
 normalMotion:true,status,failure,checks,errors,consoleErrors,pageErrors,requestFailures,shots,
},null,2));
const shot=async name=>{await page.screenshot({path:`${output}/${name}.png`,timeout:60000});shots.push({name,url:page.url(),at:Date.now()});};
try {
 await page.goto('http://127.0.0.1:4192/');
 await expect(page.locator('.orbital-scene')).toHaveClass(/is-ready/,{timeout:30000});
 await shot('01-landing');
 await page.getByRole('link',{name:'Launch app',exact:true}).first().click({noWaitAfter:true});
 await page.waitForURL('**/app/',{timeout:20000});
 await expect(page.locator('.orbital-backdrop')).toHaveClass(/is-ready/,{timeout:30000});
 await shot('02-arrival');
 await page.waitForTimeout(2200);await shot('03-approach');
 await expect(page.locator('.station-app')).not.toHaveClass(/station-arriving/,{timeout:12000});
 await shot('04-overview');
 for(const id of ['fade','pod','trigger','envoy','ramp','ledger']){
  await page.locator(`#tab-${id}`).click();
  await expect(page.locator(`#panel-${id}`)).toBeVisible();
  await page.waitForTimeout(1500);await shot(`module-${id}`);
 }
 await page.getByRole('button',{name:'Close instrument',exact:true}).click();
 await page.getByRole('button',{name:/^Instruments/}).click();
 await page.waitForTimeout(1600);
 const canvas=await page.locator('.orbital-canvas canvas').boundingBox();
 await page.mouse.move(canvas.width*.6,canvas.y+canvas.height*.48);await page.mouse.down();
 await page.mouse.move(canvas.width*.82,canvas.y+canvas.height*.6,{steps:24});await page.mouse.up();
 await page.waitForTimeout(500);await shot('05-user-orbit');
 await page.mouse.wheel(0,-240);await page.waitForTimeout(500);await shot('06-user-zoom');
 await page.setViewportSize({width:390,height:844});
 await page.goto('http://127.0.0.1:4192/');
 await expect(page.locator('.orbital-scene')).toHaveClass(/is-ready/,{timeout:30000});
 await shot('07-mobile-landing');
 await page.getByRole('link',{name:'Launch app',exact:true}).first().click();
 await page.waitForURL('**/app/');
 await expect(page.locator('.orbital-backdrop')).toHaveClass(/is-ready/,{timeout:30000});
 await page.locator('#tab-pod').click();
 await expect(page.locator('.station-app')).not.toHaveClass(/station-arriving/);
 await page.waitForTimeout(1600);await shot('08-mobile-module');
 await page.getByRole('button',{name:'Close instrument',exact:true}).click();
 await page.getByRole('button',{name:/^Instruments/}).click();
 await page.waitForTimeout(1600);await shot('09-mobile-orbit');
 checks={viewportFits:await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),
  noBrowserErrors:errors.length===0,noFailedRequests:requestFailures.length===0};
 const failedChecks=Object.entries(checks).filter(([,passed])=>!passed).map(([name])=>name);
 status=failedChecks.length?'failed':'collected';
 failure=failedChecks.length?{name:'WalkthroughValidationFailure',checks:failedChecks,url:page.url(),at:Date.now()}:null;
 await persist();
 expect(checks.viewportFits).toBe(true);
 expect(errors).toEqual([]);
 expect(requestFailures).toEqual([]);
 status='passed';
 console.log(JSON.stringify({output,errors,requestFailures,shots:shots.length}));
}catch(error){
 status='failed';
 failure={name:error.name,message:error.message,stack:error.stack,url:page.url(),at:Date.now(),checks};
 throw error;
}finally{
 try{await persist();}finally{await browser.close();}
}
