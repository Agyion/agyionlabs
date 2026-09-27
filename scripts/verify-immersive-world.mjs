import { waitForFonts } from './lib/browser-settle.mjs';
// Historical physical home-gallery harness. Its removed exhibit selectors are
// not current acceptance; use landing/tests/e2e/matrix.mjs for canonical routes.
/** Actual WebGL interactions and current-render evidence; no wallet or chain writes. */
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const output = process.env.QA_OUTPUT_DIR || 'artifacts/verification/immersive-world';
const base = process.env.BASE_URL || 'http://127.0.0.1:4192';
await mkdir(output, { recursive: true });
const report = { base, at: new Date().toISOString(), status: 'running', checks: [], errors: [], profiles: [], screenshots: [], limitation: 'SwiftShader software rendering; measured frame rates do not establish native GPU performance.' };
const browser = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
let failure;
const pass = (name, evidence) => { report.checks.push({ name, evidence }); console.log(`PASS ${name}`); };
const difference = (a,b) => Math.max(...[0,1,2,4,5,6,8,9,10].map(i => Math.abs(a[i]-b[i])));
try {
 for (const [width,height,reduced] of [[1440,1000,true],[390,844,true],[320,740,true],[1440,1000,false]]) {
  const label=`${width}-${reduced?'reduced':'normal'}`;
  const context=await browser.newContext({viewport:{width,height},reducedMotion:reduced?'reduce':'no-preference',deviceScaleFactor:1});
  const page=await context.newPage(); page.setDefaultTimeout(30000);
  page.on('pageerror',e=>report.errors.push({label,type:'page',message:e.message}));
  page.on('console',m=>{if(m.type()==='error')report.errors.push({label,type:'console',message:m.text()})});
  await page.addInitScript(()=>{
   const state=window.__worldEvidence={selected:[],matrix:null,frames:[],phase:'startup'};
   window.addEventListener('agyion:exhibit-select',e=>state.selected.push(e.detail.id));
   const native=requestAnimationFrame;let frame=null;
   window.requestAnimationFrame=callback=>native.call(window,time=>{frame={time,draws:0,phase:state.phase};try{callback(time)}finally{if(frame.draws)state.frames.push(frame);frame=null}});
   const contexts=new WeakMap();const data=gl=>{if(!contexts.has(gl))contexts.set(gl,{sources:new WeakMap(),shaders:new WeakMap(),stars:new WeakSet(),uniforms:new WeakMap()});return contexts.get(gl)};
   for(const proto of [WebGLRenderingContext.prototype,WebGL2RenderingContext.prototype]) {
    const source=proto.shaderSource;proto.shaderSource=function(shader,text){data(this).sources.set(shader,text);return source.call(this,shader,text)};
    const attach=proto.attachShader;proto.attachShader=function(program,shader){const d=data(this),list=d.shaders.get(program)||[];list.push(shader);d.shaders.set(program,list);return attach.call(this,program,shader)};
    const link=proto.linkProgram;proto.linkProgram=function(program){const d=data(this);if((d.shaders.get(program)||[]).some(s=>/PointsMaterial|AGYION_STAR_FIELD/.test(d.sources.get(s)||'')))d.stars.add(program);return link.call(this,program)};
    const location=proto.getUniformLocation;proto.getUniformLocation=function(program,name){const result=location.call(this,program,name);if(result&&name==='modelViewMatrix'&&data(this).stars.has(program))data(this).uniforms.set(result,true);return result};
    const matrix=proto.uniformMatrix4fv;proto.uniformMatrix4fv=function(location,transpose,value){if(data(this).uniforms.has(location))state.matrix=Array.from(value);return matrix.call(this,location,transpose,value)};
    for(const name of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced']) {const draw=proto[name];proto[name]=function(...args){if(frame)frame.draws++;return draw.apply(this,args)}}
   }
  });
  await page.goto(base,{waitUntil:'networkidle'});await expect(page.locator('.orbital-scene')).toHaveClass(/is-ready/);await waitForFonts(page);
  const shot=async name=>{const file=`${output}/${label}-${name}.png`;await page.screenshot({path:file,animations:'disabled'});report.screenshots.push(file)};
  await shot('initial');
  if(reduced) {
   // Surface coordinates found by projecting/raycasting the actual geometry at
   // the reduced-motion pose; this browser check verifies the DOM/event bridge.
   const points=width===1440?[['fade',692,639],['pod',944,730],['trigger',1227,689],['envoy',1248,424]]:width===390?[['fade',97,459],['pod',91,302],['trigger',305,454],['envoy',304,297]]:[['fade',74,403],['pod',69,265],['trigger',256,398],['envoy',255,260]];
   for(const [id,x,y] of points) {
    await page.goto(`${base}/#home`,{waitUntil:'domcontentloaded'});
    await expect(page.locator('.orbital-home')).toHaveAttribute('data-view','home');
    await expect(page.locator('.orbital-home')).toHaveAttribute('data-selected','none');
    const count=await page.evaluate(()=>window.__worldEvidence.selected.length);
    const hit=await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.tagName,{x,y});expect(hit).toBe('CANVAS');
    await page.mouse.click(x,y);
    await expect.poll(()=>page.evaluate(()=>window.__worldEvidence.selected.length)).toBeGreaterThan(count);
    await expect(page.locator('.orbital-home')).toHaveAttribute('data-selected',id);
    await expect(page.locator(`#exhibit-${id}`)).toHaveAttribute('aria-pressed','true');
    await expect(page.locator('.orbital-home')).toHaveAttribute('data-view','instruments');
    expect(new URL(page.url()).pathname).toBe('/');await shot(`physical-${id}`);
   }
   pass(`${label}: four physical surfaces open matching exploration stages without leaving the landing`,points);
   if(width===1440) {
    await page.locator('#exhibit-pod').click();
    const beforePath=`${output}/motion-change-pod-before.png`,afterPath=`${output}/motion-change-pod-after.png`;
    const clip={x:815,y:245,width:390,height:430};
    await page.screenshot({path:beforePath,clip});
    const changeMotion=async reducedMotion=>{
     const outgoing=await page.locator('.orbital-scene__canvas canvas').elementHandle();
     if(!outgoing)throw new Error('Motion change requires the current rendered canvas');
     try {
      await page.emulateMedia({reducedMotion});
      // The outgoing canvas and ready class remain until React handles the
      // media event; only compare after that exact renderer is replaced.
      await expect.poll(()=>outgoing.evaluate(element=>element.isConnected),{timeout:60000}).toBe(false);
      await expect(page.locator('.orbital-scene__canvas canvas')).toBeVisible({timeout:60000});
      await expect(page.locator('.orbital-scene')).toHaveClass(/is-ready/,{timeout:60000});
     } finally {await outgoing.dispose();}
    };
    await changeMotion('no-preference');await page.waitForTimeout(500);
    await changeMotion('reduce');
    await expect(page.locator('.orbital-home')).toHaveAttribute('data-selected','pod');
    await page.screenshot({path:afterPath,clip});
    const pixels=JSON.parse(execFileSync('python3',['-c',"from PIL import Image,ImageChops\nimport sys,json\nd=list(ImageChops.difference(Image.open(sys.argv[1]).convert('RGB'),Image.open(sys.argv[2]).convert('RGB')).getdata())\nprint(json.dumps({'over12':sum(max(p)>12 for p in d),'maxDelta':max(max(p) for p in d)}))",beforePath,afterPath],{encoding:'utf8'}));
    expect(pixels.over12,'The selected physical Pod pose/light must survive renderer recreation').toBeLessThan(20);
    pass('Motion-preference changes preserve both selected UI and the physical Pod',pixels);
   }
   await page.goto(`${base}/#home`,{waitUntil:'domcontentloaded'});
   await expect(page.locator('.orbital-home')).toHaveAttribute('data-view','home');
   const first=await page.evaluate(()=>window.__worldEvidence.matrix);await page.locator('canvas').focus();await page.keyboard.press('ArrowRight');
   const moved=await page.evaluate(()=>window.__worldEvidence.matrix);expect(difference(first,moved)).toBeGreaterThan(.001);
   pass(`${label}: explicit camera control remains available`,{matrixDelta:difference(first,moved)});
  } else {
   await page.evaluate(()=>window.__worldEvidence.phase='ambient');await page.waitForTimeout(5000);
   const first=await page.evaluate(()=>window.__worldEvidence.matrix);
   await page.mouse.move(1310,290);await page.waitForTimeout(900);
   const moved=await page.evaluate(()=>window.__worldEvidence.matrix);expect(difference(first,moved)).toBeGreaterThan(.001);
   pass('Normal mouse movement changes the real camera basis',{matrixDelta:difference(first,moved)});
   await page.locator('#exhibit-pod').click();await page.waitForTimeout(900);await shot('selected-pod');
   const frames=await page.evaluate(()=>window.__worldEvidence.frames.filter(f=>f.phase==='ambient'));
   const duration=frames.at(-1).time-frames[0].time;
   report.profiles.push({label,frames:frames.length,fps:(frames.length-1)*1000/duration,meanDraws:frames.reduce((s,f)=>s+f.draws,0)/frames.length,maxDraws:Math.max(...frames.map(f=>f.draws))});
  }
  await context.close();
 }
 expect(report.errors).toEqual([]);report.status='passed';
} catch(error) {failure=error;report.status='failed';report.failure={message:error.message,stack:error.stack};}
finally {await browser.close();await writeFile(`${output}/results.json`,JSON.stringify(report,null,2));}
console.log(JSON.stringify(report));if(failure)throw failure;
