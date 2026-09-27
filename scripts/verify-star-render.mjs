// Use a local Vite server that allows the shared directory; this is a render fixture, not a production-page test.
import { chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
const base = process.argv[2] || 'http://127.0.0.1:4471';
const output = path.resolve(process.argv[3] || 'artifacts/verification/2026-09-27-orbit-refinement');
const sharedPath = path.dirname(fileURLToPath(new URL('../shared/star-field.ts', import.meta.url)));
const sceneUrl = `/@fs${sharedPath}/space-scene.ts`;
const starsUrl = `/@fs${sharedPath}/star-field.ts`;
await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:'/opt/google/chrome/chrome',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const report={checks:[],errors:[]};
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
 page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text())});
 await page.addInitScript(()=>{
  window.__starProbe={draws:[],isolate:false};
  const states=new WeakMap(); const get=g=>{if(!states.has(g))states.set(g,{sources:new WeakMap(),shaders:new WeakMap(),stars:new WeakSet(),p:null,viewport:[],target:null});return states.get(g)};
  for(const p of [WebGLRenderingContext.prototype,WebGL2RenderingContext.prototype]){
   const source=p.shaderSource;p.shaderSource=function(s,c){get(this).sources.set(s,c);return source.call(this,s,c)};
   const attach=p.attachShader;p.attachShader=function(program,shader){const g=get(this);g.shaders.set(program,[...(g.shaders.get(program)||[]),shader]);return attach.call(this,program,shader)};
   const link=p.linkProgram;p.linkProgram=function(program){const g=get(this);if((g.shaders.get(program)||[]).some(s=>(g.sources.get(s)||'').includes('AGYION_STAR_FIELD')))g.stars.add(program);return link.call(this,program)};
   const use=p.useProgram;p.useProgram=function(program){get(this).p=program;return use.call(this,program)};
   const viewport=p.viewport;p.viewport=function(...v){get(this).viewport=v;return viewport.apply(this,v)};
   const bind=p.bindFramebuffer;p.bindFramebuffer=function(t,f){get(this).target=f;return bind.call(this,t,f)};
   for(const method of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced']){
    const draw=p[method];if(!draw)continue;
    p[method]=function(...args){const g=get(this);const star=g.stars.has(g.p);if(star)window.__starProbe.draws.push({viewport:g.viewport,screen:g.target===null,count:args[2],buffer:[this.drawingBufferWidth,this.drawingBufferHeight]});return draw.apply(this,args)};
   }
  }
 });
 await page.route('**/__star-study',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><body style="margin:0;background:#07090d"><div id="scene" style="width:100vw;height:100vh"></div></body>'}));
 await page.goto(`${base}/__star-study`);
 for(const item of [{name:'landing',mode:'landing',width:1440,height:900},{name:'app',mode:'station',width:1440,height:900},{name:'mobile',mode:'station',width:390,height:844}]){
  await page.setViewportSize({width:item.width,height:item.height});
  await page.evaluate(async ({item, sceneUrl})=>{window.study?.dispose();const {createOrbitalScene}=await import(sceneUrl);window.study=createOrbitalScene(document.getElementById('scene'),{mode:item.mode,reducedMotion:true,interactive:true,showExhibits:false});},{item,sceneUrl});
  await page.screenshot({path:`${output}/stars-after-${item.name}.png`});
  await page.mouse.move(item.width*.7,item.height*.2);await page.mouse.down();await page.mouse.move(item.width*.7+36,item.height*.2+15,{steps:12});await page.mouse.up();
  await page.screenshot({path:`${output}/stars-after-${item.name}-drag.png`});
  const draws=await page.evaluate(()=>window.__starProbe.draws.splice(0));
  if(!draws.length||draws.some(draw=>!draw.screen||draw.viewport[2]!==draw.buffer[0]||draw.viewport[3]!==draw.buffer[1]))throw new Error('Stars are not rendering at display resolution');
  report.checks.push({name:item.name,draws:draws.length,viewport:draws.at(-1).viewport,buffer:draws.at(-1).buffer,passed:true});
 }
 const filtering = await page.evaluate(async(starsUrl)=>{
  window.study.dispose();
  const THREE=await import('/node_modules/.vite/deps/three.js');
  const {createStarField}=await import(starsUrl);
  const results=[];
  for(const pixelRatio of [1,1.5]){
   const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});
   renderer.setSize(128,128);renderer.setPixelRatio(pixelRatio);renderer.setClearColor(0,1);renderer.outputColorSpace=THREE.SRGBColorSpace;
   const star=createStarField(pixelRatio);star.resize(128,128);
   const mask=new THREE.DataTexture(new Uint8Array([0,0,0,0]),1,1);mask.needsUpdate=true;star.setOcclusion(mask);
   const geometry=star.scene.children[0].geometry;
   geometry.setDrawRange(0,1);geometry.attributes.position.setXYZ(0,0,0,-2300);geometry.attributes.color.setXYZ(0,1,1,1);geometry.attributes.aSize.setX(0,3.2);geometry.attributes.aIntensity.setX(0,.5);
   const camera=new THREE.PerspectiveCamera(44,1,.1,4000);const gl=renderer.getContext();
   const values=[];
   const measure=()=>{renderer.render(star.scene,camera);const pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);let energy=0;for(let i=0;i<pixels.length;i+=4)energy+=pixels[i];return energy};
   for(let offset=0;offset<10;offset++){camera.rotation.y=Math.atan((offset/10)*2/128/camera.projectionMatrix.elements[0]);values.push(measure());}
   mask.image.data[3]=255;mask.needsUpdate=true;const hidden=measure();
   const spread=(Math.max(...values)-Math.min(...values))/(values.reduce((a,b)=>a+b,0)/values.length);
   results.push({pixelRatio,energy:values,variation:spread,opaqueShadowEnergy:hidden,passed:spread<.035&&hidden===0});
   star.dispose();mask.dispose();renderer.dispose();renderer.forceContextLoss();
  }
  return results;
 },starsUrl);
 report.filtering=filtering;
 if(filtering.some(item=>!item.passed))throw new Error('Subpixel star energy or opaque occultation failed');
 report.passed=report.errors.length===0;
 console.log(JSON.stringify(report));
}finally{await writeFile(`${output}/star-render-study.json`,JSON.stringify(report,null,2));await browser.close()}
if(report.passed!==true)process.exitCode=1;
