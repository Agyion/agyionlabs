/** Read-only browser diagnosis. Ablations affect this isolated browser page only. */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const url = process.argv[2] || 'http://127.0.0.1:4192/app/';
const output = process.argv[3] || 'docs/verification/2026-09-24-orbital-performance-followup.json';
const followup = process.env.PROFILE_FOLLOWUP === '1';
const quick = process.env.PROFILE_QUICK === '1';
const software = process.env.PROFILE_ANGLE !== 'native';
const browser = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', headless: true,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', ...(software ? ['--use-angle=swiftshader'] : [])] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, reducedMotion: 'no-preference' });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.addInitScript(() => {
  const state = window.__orbitProfile = { phase: 'startup', skip: [], frames: [], draws: [], longTasks: [], contexts: [], marks: [{phase:'startup', at:0, skip:[]}], resolutions: [], shaderWork: [], programs: [], renderTargets: [] };
  let activeFrame = null;
  const observeReady = () => {
    const observer = new MutationObserver(() => {
      if (document.querySelector('.orbital-backdrop.is-ready')) {
        state.readyAt = performance.now(); observer.disconnect();
      }
    });
    observer.observe(document.documentElement, {subtree:true, childList:true, attributes:true, attributeFilter:['class']});
  };
  if (document.documentElement) observeReady(); else document.addEventListener('DOMContentLoaded',observeReady,{once:true});
  const nativeRaf = requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) => nativeRaf((time) => {
    const frame = { at: performance.now(), stamp: time, phase: state.phase, cpuMs: 0, draws: {}, submitted: {}, drawCpuMs: {} };
    activeFrame = frame;
    const start = performance.now();
    try { callback(time); } finally {
      frame.cpuMs = performance.now() - start;
      activeFrame = null;
      if (Object.keys(frame.draws).length) state.frames.push(frame);
    }
  });
  try { new PerformanceObserver((list) => state.longTasks.push(...list.getEntries().map((entry) => ({ at: entry.startTime, duration: entry.duration, phase: state.phase })))).observe({ type: 'longtask', buffered: true }); } catch {}
  const contextState = new WeakMap();
  function data(gl) {
    if (!contextState.has(gl)) {
      const extension = gl.getExtension('WEBGL_debug_renderer_info');
      state.contexts.push({ renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), vendor: extension ? gl.getParameter(extension.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR), timerQuery: !!gl.getExtension('EXT_disjoint_timer_query_webgl2') });
      contextState.set(gl, { shaderSources: new WeakMap(), programShaders: new WeakMap(), programLabels: new WeakMap(), current: 'other', size: '', viewport: [0,0,gl.drawingBufferWidth,gl.drawingBufferHeight], framebuffer: null, framebufferIds: new WeakMap(), nextFramebufferId: 1, seenTargets: new Set() });
    }
    return contextState.get(gl);
  }
  const labelSource = (source) => (source.includes('diskImage(') || (source.includes('uniform vec3 uHolePos') && source.includes('uniform float uHoleR'))) ? 'disk' : source.includes('varying vec2 vDisk') ? 'gas-plane' : source.includes('uniform bool uExtract') ? 'bloom' : source.includes('uniform sampler2D uFrame') ? 'composite' : source.includes('MeshDepthMaterial') ? 'shadow' : source.includes('PointsMaterial') ? 'stars' : 'geometry';
  for (const proto of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
    const bindFramebuffer = proto.bindFramebuffer;
    proto.bindFramebuffer = function (target, framebuffer) {
      if (target === this.FRAMEBUFFER || target === this.DRAW_FRAMEBUFFER) data(this).framebuffer = framebuffer;
      return bindFramebuffer.call(this,target,framebuffer);
    };
    const viewport = proto.viewport;
    proto.viewport = function (x,y,width,height) { data(this).viewport = [x,y,width,height]; return viewport.call(this,x,y,width,height); };
    const shaderSource = proto.shaderSource;
    proto.shaderSource = function (shader, source) { data(this).shaderSources.set(shader, source); return shaderSource.call(this, shader, source); };
    const compile = proto.compileShader;
    proto.compileShader = function (shader) {
      const at = performance.now(); const result = compile.call(this, shader);
      state.shaderWork.push({ at, phase: state.phase, operation: 'compileShader', category: labelSource(data(this).shaderSources.get(shader) || ''), cpuMs: performance.now() - at });
      return result;
    };
    for (const name of ['getProgramParameter', 'getShaderParameter', 'getProgramInfoLog', 'getShaderInfoLog']) {
      const call = proto[name];
      proto[name] = function (...args) { const at = performance.now(); const result = call.apply(this,args); const cpuMs = performance.now() - at;
        if (cpuMs > .5) state.shaderWork.push({ at, phase: state.phase, operation: name, argument: typeof args[1] === 'number' ? args[1] : undefined, cpuMs }); return result; };
    }
    const attach = proto.attachShader;
    proto.attachShader = function (program, shader) { const d = data(this); const list = d.programShaders.get(program) || []; list.push(shader); d.programShaders.set(program, list); return attach.call(this, program, shader); };
    const link = proto.linkProgram;
    proto.linkProgram = function (program) {
      const d = data(this); const source = (d.programShaders.get(program) || []).map((shader) => d.shaderSources.get(shader)).join('\n');
      const label = labelSource(source);
      state.programs.push({ category: label, phase: state.phase, chars: source.length, types: [...source.matchAll(/#define SHADER_TYPE ([^\n]+)/g)].map((match) => match[1]), uniforms: [...new Set([...source.matchAll(/uniform \w+ (\w+)/g)].map((match) => match[1]))] });
      d.programLabels.set(program, label); const at = performance.now(); const result = link.call(this, program);
      state.shaderWork.push({ at, phase: state.phase, operation: 'linkProgram', category: label, cpuMs: performance.now() - at }); return result;
    };
    const use = proto.useProgram;
    proto.useProgram = function (program) { const d = data(this); d.current = d.programLabels.get(program) || 'other'; return use.call(this, program); };
    for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
      const draw = proto[name]; if (!draw) continue;
      proto[name] = function (...args) {
        const d = data(this); const category = d.current; const at = performance.now(); const submitted = !state.skip.includes(category);
        if (activeFrame) { activeFrame.draws[category] = (activeFrame.draws[category] || 0) + 1; if (submitted) activeFrame.submitted[category] = (activeFrame.submitted[category] || 0) + 1; }
        let result; if (submitted) result = draw.apply(this, args);
        const cpuMs = performance.now() - at;
        if (activeFrame) activeFrame.drawCpuMs[category] = (activeFrame.drawCpuMs[category] || 0) + cpuMs;
        if (category === 'disk') state.draws.push({ at, phase: state.phase, category, submitted, cpuMs });
        let target = 'screen';
        if (d.framebuffer) {
          if (!d.framebufferIds.has(d.framebuffer)) d.framebufferIds.set(d.framebuffer,`framebuffer-${d.nextFramebufferId++}`);
          target = d.framebufferIds.get(d.framebuffer);
        }
        const targetKey = `${category}:${target}:${d.viewport.join(',')}`;
        if (!d.seenTargets.has(targetKey)) { d.seenTargets.add(targetKey); state.renderTargets.push({at,phase:state.phase,category,target,viewport:[...d.viewport]}); }
        const size = `${this.drawingBufferWidth}x${this.drawingBufferHeight}`;
        if (size !== d.size) { d.size = size; state.resolutions.push({ at, phase: state.phase, size }); }
        return result;
      };
    }
  }
});
const begin = async (phase, skip = []) => page.evaluate(({ phase, skip }) => { const s = window.__orbitProfile; s.phase = phase; s.skip = skip; s.marks.push({ phase, at: performance.now(), skip }); }, { phase, skip });
try {
  let gpuInfo;
  try { const session = await browser.newBrowserCDPSession(); const info = await session.send('SystemInfo.getInfo'); gpuInfo = { devices: info.gpu.devices, featureStatus: info.gpu.featureStatus }; } catch {}
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('canvas', { timeout: 60000 });
  if (url.includes('127.0.0.1')) await page.locator('.orbital-backdrop.is-ready').waitFor({ timeout: 60000 });
  await page.waitForTimeout(url.includes('127.0.0.1') ? 2500 : 11000);
  await begin('ambient'); await page.waitForTimeout(quick ? 5000 : 6000);
  const bounds = await page.locator('canvas').first().boundingBox();
  await begin('drag');
  await page.mouse.move(bounds.x + bounds.width * .48, bounds.y + bounds.height * .48);
  await page.mouse.down();
  const dragStarted = Date.now();
  for (let i = 0; quick ? Date.now() - dragStarted < 3000 : i < 48; i += 1) {
    await page.mouse.move(bounds.x + bounds.width * (.48 + .14 * Math.sin(i / 8)), bounds.y + bounds.height * (.48 + .12 * Math.sin(i / 6)));
    await page.waitForTimeout(60);
  }
  await page.mouse.up();
  await begin('module-selection');
  const local = url.includes('127.0.0.1');
  if (local) {
    for (const id of (quick ? ['pod'] : ['pod', 'trigger', 'envoy'])) { await page.locator(`#tab-${id}`).click(); await page.waitForTimeout(1300); }
  } else {
    const buttons = await page.getByRole('button').allTextContents();
    console.log(JSON.stringify({ liveButtons: buttons.slice(0,40) }));
    for (const id of (quick ? ['pod'] : ['pod', 'trigger', 'envoy'])) {
      const instrument = page.locator('.dock-item').filter({hasText: new RegExp(id, 'i')}).first();
      if (await instrument.count()) { await instrument.click(); await page.waitForTimeout(1300); }
    }
  }
  if (quick) { await begin('drawer'); await page.waitForTimeout(3000); }
  if (!quick && followup) {
    await page.waitForTimeout(1200);
    await begin('drawer-blur'); await page.waitForTimeout(6000);
    await page.evaluate(() => {
      window.__profileFilters = [...document.querySelectorAll('*')].filter((element) => getComputedStyle(element).backdropFilter !== 'none').map((element) => ({ element, value: element.style.getPropertyValue('backdrop-filter'), priority: element.style.getPropertyPriority('backdrop-filter') }));
      for (const {element} of window.__profileFilters) element.style.setProperty('backdrop-filter', 'none', 'important');
    });
    await begin('drawer-no-blur'); await page.waitForTimeout(6000);
    await page.evaluate(() => { for (const {element,value,priority} of window.__profileFilters) { if (value) element.style.setProperty('backdrop-filter',value,priority); else element.style.removeProperty('backdrop-filter'); } });
    await begin('drawer-blur-restored'); await page.waitForTimeout(6000);
  }
  if (!quick) {
  if (followup) await begin('drawer-close');
  if (local) await page.getByRole('button', { name: 'Close instrument', exact: true }).click();
  else { const close = page.getByRole('button', {name:'Close console',exact:true}); if (await close.count()) await close.click(); }
  await page.waitForTimeout(1600);
  await begin('ambient-control'); await page.waitForTimeout(6000);
  if (!followup) {
    await begin('ablate-disk', ['disk']); await page.waitForTimeout(6000);
    await begin('ablate-shadow', ['shadow']); await page.waitForTimeout(6000);
    await begin('ablate-bloom', ['bloom']); await page.waitForTimeout(6000);
    await begin('ablate-disk-and-shadow', ['disk', 'shadow']); await page.waitForTimeout(6000);
  }
  }
  const state = await page.evaluate(() => { window.__orbitProfile.marks.push({ phase: 'end', at: performance.now() }); window.__orbitProfile.assets = performance.getEntriesByType('resource').filter(e=>e.initiatorType==='script').map(e=>e.name); return window.__orbitProfile; });
  const percentile = (values, fraction) => { const sorted = [...values].sort((a,b) => a-b); return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? null; };
  const mean = (values) => values.length ? values.reduce((sum, v) => sum+v, 0) / values.length : null;
  const summary = [];
  for (let i = 0; i < state.marks.length - 1; i += 1) {
    const mark = state.marks[i], end = state.marks[i+1].at; const frames = state.frames.filter((f) => f.phase === mark.phase);
    const intervals = frames.slice(1).map((frame, n) => frame.stamp - frames[n].stamp);
    const disks = state.draws.filter((draw) => draw.phase === mark.phase && draw.submitted);
    const diskIntervals = disks.slice(1).map((draw,n) => draw.at-disks[n].at);
    const categories = [...new Set(frames.flatMap((frame) => Object.keys(frame.draws)))];
    const byCategory = Object.fromEntries(categories.map((category) => [category, { attemptedPerFrame: mean(frames.map((f) => f.draws[category] || 0)), submittedPerFrame: mean(frames.map((f) => f.submitted[category] || 0)), submissionCpuMsPerFrame: mean(frames.map((f) => f.drawCpuMs[category] || 0)) }]));
    summary.push({ phase: mark.phase, durationMs: end-mark.at, frames: frames.length, fps: frames.length*1000/(end-mark.at), frameIntervalMedian: percentile(intervals,.5), frameIntervalP95: percentile(intervals,.95), callbackCpuMedian: percentile(frames.map((f)=>f.cpuMs),.5), callbackCpuP95:percentile(frames.map((f)=>f.cpuMs),.95), diskUpdates:disks.length, diskDrawsPerFrame:frames.length ? disks.length / frames.length : null, longTaskCount:state.longTasks.filter(t=>t.phase===mark.phase).length, maxBlockingShaderCallMs:Math.max(0,...state.shaderWork.filter(w=>w.phase===mark.phase).map(w=>w.cpuMs)), diskIntervalMedian:percentile(diskIntervals,.5), diskIntervalP95:percentile(diskIntervals,.95), categories:byCategory });
  }
  const result = { at:new Date().toISOString(),url,followup,quick,forcedSoftware:software,gpuInfo,errors,summary,state };
  await mkdir(output.slice(0,output.lastIndexOf('/')), {recursive:true}); await writeFile(output, JSON.stringify(result,null,2));
  console.log(JSON.stringify({output,contexts:state.contexts,resolutions:state.resolutions,errors,summary},null,2));
} finally { await browser.close(); }
