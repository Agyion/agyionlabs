import { waitForFonts } from './lib/browser-settle.mjs';
/** Final visual/control checks. Wallet fragments are explicitly synthetic SSR fixtures; no signing. */
import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const base='http://127.0.0.1:4192';
const output=process.env.POLISH_OUTPUT || 'artifacts/verification/2026-09-26-polish/after';
await mkdir(output,{recursive:true});
const report={at:new Date().toISOString(),checks:[],screenshots:[],consoleErrors:[],pageErrors:[],requestFailures:[],status:'running'};
const names={fade:'Fade',pod:'Pod',trigger:'Trigger',envoy:'Envoy',ramp:'Ramp',ledger:'Ledger'};
const browser=await chromium.launch({executablePath:'/opt/google/chrome/chrome',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const appHTML=await readFile('app/site/app/index.html','utf8');
const styles=[...appHTML.matchAll(/<link\b[^>]*href="([^"?]+\.css)[^"]*"[^>]*>/g)].map(m=>m[1]);
const point=r=>({x:r.x,y:r.y,width:r.width,height:r.height,right:r.x+r.width,bottom:r.y+r.height});
try {
 for(const width of (process.env.POLISH_WIDTHS||'1440,768,390,320').split(',').map(Number)) {
  const page=await browser.newPage({viewport:{width,height:width>700?1000:844},reducedMotion:'reduce',deviceScaleFactor:1});
  page.on('pageerror',e=>report.pageErrors.push({width,message:e.message}));
  page.on('console',e=>{if(e.type()==='error')report.consoleErrors.push({width,url:page.url(),message:e.text(),location:e.location()})});
  page.on('requestfailed',r=>report.requestFailures.push({width,url:r.url(),message:r.failure()?.errorText}));
  const capture=async name=>{const file=`${output}/${width}-${name}.png`;await page.mouse.move(1,1);await page.screenshot({path:file});report.screenshots.push(file)};
  const fit=async()=>expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width}: viewport overflow`).toBe(true);
  const buttons=async(scope,name)=>{
   const entries=await scope.locator('.btn').evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length&&getComputedStyle(n).visibility!=='hidden').map(n=>{
    const r=n.getBoundingClientRect(),css=getComputedStyle(n);
    const children=[...n.childNodes].flatMap(e=>{
     if(e.nodeType===Node.ELEMENT_NODE)return e.classList.contains('btn__sweep')?[]:[e.getBoundingClientRect()];
     if(e.nodeType!==Node.TEXT_NODE||!e.textContent.trim())return [];
     const range=document.createRange();range.selectNodeContents(e);return [range.getBoundingClientRect()];
    });
    const left=Math.min(...children.map(r=>r.left)),right=Math.max(...children.map(r=>r.right));
    return {text:n.textContent.trim(),width:r.width,height:r.height,groupOffset:(left+right-r.left-r.right)/2,verticalOffset:Math.max(...children.map(c=>Math.abs((c.top+c.bottom-r.top-r.bottom)/2))),textAlign:css.textAlign,clipped:n.scrollWidth>n.clientWidth+1};
   }));
   for(const e of entries){expect(e.height,`${name}: ${e.text} hit height`).toBeGreaterThanOrEqual(43.9);expect(Math.abs(e.groupOffset),`${name}: ${e.text} horizontal center`).toBeLessThan(1.1);expect(e.verticalOffset,`${name}: ${e.text} vertical center`).toBeLessThan(1.1);expect(e.clipped,`${name}: ${e.text} clipped`).toBe(false)}
   report.checks.push({width,name,buttons:entries});
  };
  await page.goto(`${base}/app/?tab=fade`,{waitUntil:'domcontentloaded'});
  await expect(page.locator('.orbital-backdrop')).toHaveClass(/is-ready/,{timeout:60000});
  await waitForFonts(page);
  const topbarMarkup=await page.locator('.station-topbar').evaluate(n=>n.outerHTML);
  for(const [id,name]of Object.entries(names)){
   await page.locator(`#tab-${id}`).click();await expect(page.locator(`#panel-${id}`)).toBeVisible();
   const workspace=page.locator('.station-workspace');
   const title=point(await page.locator('.station-workspace-title').boundingBox()),tools=point(await page.locator('.station-workspace-tools').boundingBox());
   expect(title.right,`${width}/${id}: title overlaps tools`).toBeLessThanOrEqual(tools.x+1);
   const box=await workspace.boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width+1);
   await fit();await buttons(workspace,`${id} button alignment`);await capture(`app-${id}`);
   await page.getByRole('button',{name:`About ${name}`,exact:true}).click();
   const help=page.getByRole('region',{name:`How ${name} works`,exact:true});await expect(help).toBeVisible();
   expect(await help.evaluate(n=>n.scrollWidth<=n.clientWidth+1)).toBe(true);
   if(width===320||width===1440)await capture(`help-${id}`);
   await page.keyboard.press('Escape');await expect(help).toHaveCount(0);await expect(workspace).toBeVisible();
   if(id==='ramp'){await page.locator('#panel-ramp').getByRole('button',{name:'Withdraw',exact:true}).click();await buttons(workspace,'withdraw buttons');await capture('app-ramp-withdraw')}
   for(const summary of await page.locator(`#panel-${id} details:not([open])>summary`).all())await summary.click();
   await buttons(workspace,`${id} expanded controls`);await fit();
  }
  if(width===1440){
   await page.getByRole('button',{name:'Close instrument',exact:true}).click();await page.locator('.orbital-canvas canvas').focus();
   for(const [name,yaw,pitch]of [['front',0,0],['quarter',10,0],['side',22,0],['rear',43,0],['below',10,8]]){
    await page.keyboard.press('Home');for(let i=0;i<5;i++)await page.keyboard.press('+');for(let i=0;i<yaw;i++)await page.keyboard.press('ArrowRight');for(let i=0;i<pitch;i++)await page.keyboard.press('ArrowDown');
    const file=`${output}/model-${name}.png`;await page.screenshot({path:file,style:'body * {visibility:hidden!important} canvas {visibility:visible!important;outline:none!important}'});report.screenshots.push(file);
   }
  }
  await page.goto(`${base}/#how-it-works`,{waitUntil:'domcontentloaded'});
  const dialog=page.getByRole('dialog',{name:'How it works',exact:true});await expect(dialog).toBeVisible();
  for(const stage of ['Terms','Wallet','Result']){
   await dialog.getByRole('tab',{name:stage,exact:true}).click();
   const label=dialog.locator('[aria-selected="true"] .mechanism-tab__label');
   const offset=await label.evaluate(n=>{const a=n.getBoundingClientRect(),b=n.parentElement.getBoundingClientRect();return (a.left+a.right-b.left-b.right)/2});expect(Math.abs(offset)).toBeLessThan(1.1);
  }
  await fit();await capture('landing-how');await page.keyboard.press('Escape');
  for(const id of ['fade','pod','trigger','envoy','ramp','ledger']){
   await page.goto(`${base}/${id}`,{waitUntil:'domcontentloaded'});
   const launch=page.locator('.detail-world__launch');await expect(launch).toBeVisible();
   const center=await launch.evaluate(n=>{const text=[...n.childNodes].find(c=>c.nodeType===Node.TEXT_NODE&&c.textContent.trim());const range=document.createRange();range.selectNodeContents(text);const a=range.getBoundingClientRect(),b=n.getBoundingClientRect();return {offset:(a.left+a.right-b.left-b.right)/2,height:b.height,clipped:n.scrollWidth>n.clientWidth+1}});
   expect(Math.abs(center.offset),`${id}: launch label center`).toBeLessThan(1.1);expect(center.height).toBeGreaterThanOrEqual(44);expect(center.clipped).toBe(false);await fit();
   for(const label of await page.locator('.detail-condition__label').all()){
    const offset=await label.evaluate(n=>{const a=n.getBoundingClientRect(),b=n.parentElement.getBoundingClientRect();return (a.left+a.right-b.left-b.right)/2});expect(Math.abs(offset),`${id}: condition center`).toBeLessThan(1.1);
   }
   if(id==='pod'||id==='envoy')await capture(`detail-${id}`);
   report.checks.push({width,name:`${id} detail controls`,center});
  }
  if(width<=390){
   for(const fixture of ['wallet-connected-long','wallet-connected-demo','wallet-disconnected-error','wallet-connecting']){
    const fragment=await readFile(`artifacts/verification/2026-09-26-polish/fixtures/${fixture}.html`,'utf8');
    const fixtureTopbar=await page.evaluate(({markup,fragment})=>{const dom=new DOMParser().parseFromString(markup,'text/html');dom.querySelector('.wallet-bar').outerHTML=fragment;return dom.body.innerHTML},{markup:topbarMarkup,fragment});
    await page.route(`**/__${fixture}`,r=>r.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles.map(h=>`<link rel="stylesheet" href="${h}">`).join('')}<body><main class="station-app">${fixtureTopbar}</main></body>`}));
    await page.goto(`${base}/__${fixture}`);await waitForFonts(page);await fit();await buttons(page.locator('.station-topbar'),`${fixture} synthetic layout`);await capture(fixture);
   }
  }
  await page.close();
 }
 report.status=report.consoleErrors.length||report.pageErrors.length||report.requestFailures.length?'failed':'passed';
}catch(error){report.status='failed';report.failure={message:error.message,stack:error.stack};}
finally{await browser.close();await writeFile(`${output}/verification.json`,JSON.stringify(report,null,2));}
console.log(JSON.stringify({output,status:report.status,checks:report.checks.length,failure:report.failure,consoleErrors:report.consoleErrors,pageErrors:report.pageErrors,requestFailures:report.requestFailures}));
if(report.status!=='passed')process.exitCode=1;
