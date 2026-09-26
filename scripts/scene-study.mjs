/** Isolated visual study against the actual Vite-transformed scene module. */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const out = process.argv[2] || 'artifacts/verification/scene-study';
const browser = await chromium.launch({executablePath:'/opt/google/chrome/chrome',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const page = await browser.newPage({viewport:{width:1440,height:916},deviceScaleFactor:1});
if (process.env.HIGH_QUALITY_STUDY === '1') {
 // Exercise the high-quality rendering branch on a software device. This is
 // strictly a still-image check, never evidence of hardware performance.
 await page.addInitScript(()=>{
  const get=WebGL2RenderingContext.prototype.getParameter;
  WebGL2RenderingContext.prototype.getParameter=function(name){return name===0x9246?'QA high-quality profile':get.call(this,name);};
 });
}
const errors = [];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,500));});
await page.route('**/__scene-study', route=>route.fulfill({contentType:'text/html',body:'<!doctype html><body style="margin:0;background:#07090d"><div id="scene" style="width:100vw;height:100vh"></div></body>'}));
try {
 await mkdir(out,{recursive:true});
 await page.goto('http://127.0.0.1:4173/__scene-study');
 for(const shot of [{id:'landing',mode:'landing'},{id:'app',mode:'station'},{id:'module',mode:'station',panel:true},{id:'mobile',mode:'station',small:true}]) {
  await page.setViewportSize(shot.small?{width:390,height:754}:{width:1440,height:916});
  await page.evaluate(async (shot)=>{
   window.study?.dispose();
   const {createOrbitalScene}=await import('/@fs/home/apo110/agyion/shared/space-scene.ts');
   window.study=createOrbitalScene(document.querySelector('#scene'),{mode:shot.mode,reducedMotion:true,interactive:true});
   window.study.setSelected('fade');window.study.setPanelOpen(!!shot.panel);
  },shot);
  await page.screenshot({path:`${out}/${shot.id}.png`,timeout:60000});
 }
 console.log(JSON.stringify({out,errors}));
} finally {await browser.close();}
