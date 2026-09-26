/** Real CTA departures, destination preservation and native/reduced-motion behavior.
 * The matrix accelerates only the landing scene's performance/rAF clock. It does
 * not stub the launch handler, scene, navigation, app, storage or network. Real
 * recordings remain unaccelerated and are the only duration/visual evidence.
 * Never connects a wallet, signs, submits, or creates an on-chain object.
 */
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const base = process.env.APP_BASE_URL || 'http://127.0.0.1:4192';
const output = path.resolve(process.env.JOURNEY_OUTPUT || 'artifacts/verification/instrument-journeys');
const scope = process.env.JOURNEY_SCOPE || 'all';
const mobile = process.env.JOURNEY_MOBILE === '1';
const appDelayMs = Number(process.env.JOURNEY_APP_DELAY_MS ?? 1500);
if (!Number.isFinite(appDelayMs) || appDelayMs < 0) throw new Error('JOURNEY_APP_DELAY_MS must be a nonnegative number');
const only = process.env.JOURNEY_CASES?.split(',');
if (!['all', 'real', 'matrix', 'fallbacks'].includes(scope)) throw new Error('JOURNEY_SCOPE must be all, real, matrix or fallbacks');
const viewport = mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 };
const realCases = new Set(['landing-pod', 'landing-fade', 'landing-envoy', 'detail-fade', 'detail-pod', 'directory-generic']);
const cases = [
  ...['fade', 'pod', 'trigger', 'envoy'].map(id => ({ name: `landing-${id}`, route: '/', id })),
  ...['fade', 'pod', 'trigger', 'envoy', 'ramp', 'ledger'].map(id => ({ name: `detail-${id}`, route: `/${id}`, id })),
  { name: 'detail-generic', route: '/ledger', id: null },
  { name: 'directory-generic', route: '/instruments', id: null },
].filter(test => !only || only.includes(test.name));
await mkdir(output, { recursive: true });
const report = { at: new Date().toISOString(), base, viewport, scope, appScriptDelayMs: appDelayMs, status: 'running', cases: [], fallbacks: [], failures: [], consoleErrors: [], pageErrors: [], requestFailures: [], rawConsoleErrors: [], rawRequestFailures: [], expectedInjectedDiagnostics: [], csp: [], note: 'Real recordings establish observed flow and timing, not smooth/native GPU performance. Accelerated matrix results establish routing/lifecycle only. All network diagnostics are retained and gated.' };
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/google/chrome/chrome', headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });

async function instrumentPage(page, evidence, speed = 1) {
  page.setDefaultTimeout(30000);
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const entry = { case: evidence.name, at: Date.now(), url: page.url(), message: message.text(), location: message.location() };
    report.rawConsoleErrors.push(entry);
    // This exact response is intentionally injected by the module-failure case;
    // nothing from a live endpoint or a different asset is reclassified.
    if (evidence.fixture === 'module-failure' && evidence.injectedResponseStatus === 503 && entry.location.url === evidence.injectedAsset && /503/.test(entry.message)) {
      const expected = { kind: 'console', ...entry }; evidence.injectedDiagnostics.push(expected); report.expectedInjectedDiagnostics.push(expected);
    }
    else report.consoleErrors.push(entry);
  });
  page.on('pageerror', error => report.pageErrors.push({ case: evidence.name, at: Date.now(), url: page.url(), message: error.message }));
  page.on('requestfailed', request => {
    const entry = { case: evidence.name, at: Date.now(), url: request.url(), error: request.failure()?.errorText };
    report.rawRequestFailures.push(entry);
    if (entry.url === evidence.injectedAsset && entry.error === 'net::ERR_ABORTED' && (evidence.fixture === 'queue-timeout' || (evidence.fixture === 'module-failure' && evidence.injectedResponseStatus === 503))) {
      const expected = { kind: 'request', ...entry }; evidence.injectedDiagnostics.push(expected); report.expectedInjectedDiagnostics.push(expected);
    }
    else report.requestFailures.push(entry);
  });
  await page.exposeBinding('__journeyEvidence', (_source, event) => {
    evidence.events.push(event);
    if (event.kind === 'csp') report.csp.push({ case: evidence.name, ...event });
  });
  await page.addInitScript(({ speed }) => {
    const nativeNow = performance.now.bind(performance);
    const nativeRAF = requestAnimationFrame.bind(window);
    const start = nativeNow();
    const isApp = /^\/app\/?$/.test(location.pathname);
    const send = data => { void window.__journeyEvidence({ url: location.href, at: nativeNow(), sceneTime: performance.now(), wallTime: Date.now(), ...data }).catch(() => {}); };
    const contextCanvases = new WeakSet();
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      const started = nativeNow();
      const context = getContext.call(this, type, ...args);
      if (/^webgl2?$/.test(type) && context && !contextCanvases.has(this)) {
        contextCanvases.add(this);
        send({ kind: 'context-created', type, duration: nativeNow() - started, antialias: args[0]?.antialias });
      }
      return context;
    };
    if (speed !== 1 && !isApp) {
      // Keep Date.now and timer deadlines native: marker freshness and the
      // application deadline fallback still run against real wall-clock time.
      Object.defineProperty(performance, 'now', { configurable: true, value: () => start + (nativeNow() - start) * speed });
      window.requestAnimationFrame = callback => nativeRAF(time => callback(start + (time - start) * speed));
      nativeRAF(first => nativeRAF(second => send({ kind: 'clock-fixture', speed, nativeInterval: second - first, sceneInterval: (second - first) * speed, dateIsNative: true })));
    }
    if (isApp) {
      try {
        const marker = JSON.parse(sessionStorage.getItem('agyion:arrival') || 'null');
        const frame = JSON.parse(sessionStorage.getItem('agyion:flight-frame') || 'null');
        send({ kind: 'incoming-handoff', marker, frame: frame && { at: frame.at, id: frame.id, pose: frame.pose, hasImage: /^data:image\/(?:webp|png);base64,/.test(frame.data || '') } });
      } catch (error) { send({ kind: 'incoming-handoff-error', message: String(error) }); }
    }
    let last = '';
    const state = () => {
      const host = document.querySelector('.orbital-scene__canvas, .orbital-canvas');
      const canvas = host?.querySelector('canvas');
      const rect = canvas?.getBoundingClientRect();
      const event = { kind: 'state', phase: host?.dataset.flightPhase || null, launching: document.documentElement.classList.contains('is-launching'), ready: Boolean(document.querySelector('.orbital-backdrop.is-ready')), bridge: Boolean(document.getElementById('agyion-flight-bridge')), bounds: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null };
      const key = JSON.stringify(event);
      if (key !== last) { last = key; send(event); }
    };
    new MutationObserver(state).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'data-flight-phase'] });
    document.addEventListener('securitypolicyviolation', event => send({ kind: 'csp', directive: event.violatedDirective, blockedURI: event.blockedURI }));
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === 'mark' && entry.name.startsWith('agyion:scene-')) send({ kind: 'startup-mark', name: entry.name, startTime: entry.startTime });
        if (entry.entryType === 'resource' && entry.name.includes('/_next/')) send({ kind: 'app-resource', name: entry.name, initiatorType: entry.initiatorType, startTime: entry.startTime, duration: entry.duration, transferSize: entry.transferSize, encodedBodySize: entry.encodedBodySize });
      }
    }).observe({ entryTypes: ['resource', 'mark'] });
    for (const proto of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
      const link = proto.linkProgram;
      proto.linkProgram = function (program) { send({ kind: 'shader-link', phase: document.querySelector('.orbital-scene__canvas, .orbital-canvas')?.dataset.flightPhase || null }); return link.call(this, program); };
    }
  }, { speed });
}

async function openSource(page, test) {
  await page.goto(`${base}${test.route}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  if (test.route === '/') {
    await expect(page.locator('.orbital-scene')).toHaveClass(/is-ready/, { timeout: 60000 });
    await expect(page.locator('.orbital-home--gallery')).toBeVisible();
    await page.locator('#instruments').scrollIntoViewIfNeeded();
    await page.locator(`#exhibit-${test.id}`).click();
    await expect(page.locator(`#exhibit-${test.id}`)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#instrument-stage')).toBeVisible();
    await expect(page.locator('#instrument-stage .instrument-mechanism')).toHaveAttribute('data-mechanism', test.id);
    return page.locator(`#instrument-stage a[href="/app/?tab=${test.id}"]`);
  }
  // Detail scenes may be created on departure; loading a detail must not need a
  // hidden WebGL renderer before its native CTA becomes available.
  return test.id ? page.locator(`.product-launch[href="/app/?tab=${test.id}"]`).first() : page.locator('.orbital-nav__launch').first();
}

async function nativeGuards(anchor) {
  return anchor.evaluate(element => {
    const originalTarget = element.getAttribute('target');
    const originalDownload = element.getAttribute('download');
    const results = [];
    for (const mode of ['ctrl', 'meta', 'shift', 'alt', 'middle', 'blank', 'download']) {
      if (mode === 'blank') element.setAttribute('target', '_blank');
      if (mode === 'download') element.setAttribute('download', '');
      const preventNavigation = event => { results.push({ mode, native: !event.defaultPrevented }); event.preventDefault(); };
      element.addEventListener('click', preventNavigation, { once: true });
      element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: mode === 'middle' ? 1 : 0, ctrlKey: mode === 'ctrl', metaKey: mode === 'meta', shiftKey: mode === 'shift', altKey: mode === 'alt' }));
      if (originalTarget === null) element.removeAttribute('target'); else element.setAttribute('target', originalTarget);
      if (originalDownload === null) element.removeAttribute('download'); else element.setAttribute('download', originalDownload);
    }
    return results;
  });
}

async function runJourney(test) {
  const real = realCases.has(test.name);
  const speed = real ? 1 : 12;
  const evidence = { ...test, realMotion: real, speed, appScriptDelayMs: real ? appDelayMs : 0, status: 'running', events: [], screenshots: [] };
  report.cases.push(evidence);
  evidence.recording = { requestedAt: Date.now() };
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: 'no-preference', isMobile: mobile, hasTouch: mobile, ...(real ? { recordVideo: { dir: path.join(output, test.name, 'video'), size: viewport } } : {}) });
  const page = await context.newPage();
  const capture = async name => {
    const file = path.join(output, `${test.name}-${name}.png`);
    await page.screenshot({ path: file, timeout: 60000 }); evidence.screenshots.push({ name, file, at: Date.now(), url: page.url() });
  };
  try {
    await instrumentPage(page, evidence, speed);
    const anchor = await openSource(page, test);
    await expect(anchor).toBeVisible();
    const expected = test.id ? `/app/?tab=${test.id}` : '/app/';
    await expect(anchor).toHaveAttribute('href', expected);
    evidence.nativeGuards = await nativeGuards(anchor);
    expect(evidence.nativeGuards.every(item => item.native)).toBe(true);
    await expect(page.locator('html')).not.toHaveClass(/is-launching/);
    await capture('source');
    let releaseScriptsAt = 0;
    if (real && appDelayMs > 0) await page.route('**/_next/**/*.js', async route => {
      releaseScriptsAt ||= Date.now() + appDelayMs;
      const wait = releaseScriptsAt - Date.now();
      if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
      await route.continue();
    });
    let navigatedAt;
    page.on('framenavigated', frame => { if (frame === page.mainFrame() && /^\/app\/?$/.test(new URL(frame.url()).pathname)) navigatedAt ??= Date.now(); });
    const navigation = page.waitForURL(url => url.pathname === '/app/' && url.searchParams.get('tab') === test.id, { waitUntil: 'commit', timeout: 30000 });
    navigation.catch(() => {}); // Awaited below; retain rejection while checking departure.
    evidence.clickedAt = Date.now();
    await anchor.click({ noWaitAfter: true });
    await expect(page.locator('html')).toHaveClass(/is-launching/, { timeout: 60000 });
    await expect(page.locator('.orbital-scene__canvas')).toHaveAttribute('data-flight-phase', 'launching', { timeout: 60000 });
    evidence.launchObservedAt = evidence.events.find(event => event.kind === 'state' && event.phase === 'launching')?.wallTime ?? Date.now();
    evidence.recording.launchAt = evidence.launchObservedAt;
    if (real) {
      await page.waitForTimeout(Math.max(0, evidence.launchObservedAt + 3600 - Date.now()));
      expect(new URL(page.url()).pathname).toBe(test.route);
      await expect(page.locator('.orbital-scene__canvas')).toHaveAttribute('data-flight-phase', 'launching');
      await capture('midpoint');
      await page.waitForTimeout(Math.max(0, evidence.launchObservedAt + 8600 - Date.now()));
      await capture('near-destination');
    }
    await navigation;
    evidence.navigatedAt = navigatedAt;
    evidence.recording.navigationAt = navigatedAt;
    evidence.departureMs = navigatedAt - evidence.clickedAt;
    evidence.visibleFlightMs = navigatedAt - evidence.launchObservedAt;
    if (real) expect(evidence.visibleFlightMs).toBeGreaterThanOrEqual(9500);
    await expect(page).toHaveURL(`${base}${expected}`);
    if (real && appDelayMs > 0) { await expect(page.locator('#agyion-flight-bridge')).toBeVisible({ timeout: 5000 }); await capture('bridge'); }
    await expect(page.locator('.orbital-backdrop')).toHaveClass(/is-ready/, { timeout: 60000 });
    evidence.recording.readyObservedAt = Date.now();
    await expect(page.locator('.orbital-canvas')).toHaveAttribute('data-flight-phase', 'interactive');
    await expect(page.locator('#agyion-flight-bridge, .orbital-arrival-poster')).toHaveCount(0, { timeout: 15000 });
    if (test.id) { await expect(page.locator(`#panel-${test.id}`)).toBeVisible(); await expect(page.locator(`#tab-${test.id}`)).toHaveAttribute('aria-selected', 'true'); }
    await capture('destination');
    // The state observer sees app startup from the first mutation, so absence
    // of an arriving phase cannot be manufactured by waiting until it finishes.
    const appStates = evidence.events.filter(event => event.kind === 'state' && /^\/app\/?$/.test(new URL(event.url).pathname));
    evidence.bridgeObserved = appStates.some(event => event.bridge);
    expect(appStates.some(event => event.phase === 'interactive' && event.ready)).toBe(true);
    expect(appStates.some(event => event.phase === 'arriving'), 'A completed journey must not start a second approach').toBe(false);
    const incoming = evidence.events.find(event => event.kind === 'incoming-handoff');
    expect(incoming?.marker?.settled).toBe(true);
    expect(incoming.frame.id).toBe(incoming.marker.id);
    expect(incoming.frame.at).toBe(incoming.marker.at);
    expect(incoming.frame.hasImage).toBe(true);
    for (const key of ['elapsed', 'ringFocus', 'yaw', 'pitch', 'zoom']) expect(Number.isFinite(incoming.frame.pose[key])).toBe(true);
    evidence.shaderLinksDuringFlight = evidence.events.filter(event => event.kind === 'shader-link' && !/^\/app\/?$/.test(new URL(event.url).pathname) && ['launching', 'handoff'].includes(event.phase)).length;
    expect(evidence.shaderLinksDuringFlight).toBe(0);
    if (!real) {
      const fixture = evidence.events.find(event => event.kind === 'clock-fixture');
      expect(fixture?.nativeInterval).toBeGreaterThan(0);
      expect(fixture.sceneInterval / fixture.nativeInterval).toBe(speed);
      const departure = evidence.events.find(event => event.kind === 'state' && event.phase === 'launching');
      const handoff = evidence.events.find(event => event.kind === 'state' && event.phase === 'handoff');
      evidence.fixtureFlightMs = handoff?.sceneTime - departure?.sceneTime;
      expect(evidence.fixtureFlightMs).toBeGreaterThanOrEqual(9000);
      expect(evidence.visibleFlightMs).toBeLessThan(9500);
    }
    evidence.status = 'passed';
  } catch (error) {
    evidence.status = 'failed'; evidence.failure = { message: error.message, stack: error.stack, url: page.url() };
    report.failures.push({ case: test.name, ...evidence.failure }); await capture('failure').catch(() => {});
  } finally {
    evidence.recording.stopRequestedAt = Date.now();
    await context.close(); evidence.recording.stoppedAt = Date.now();
    if (real) evidence.video = await page.video()?.path();
    await writeFile(path.join(output, `${test.name}.json`), JSON.stringify(evidence, null, 2));
    await mkdir(path.join(output, test.name), { recursive: true });
    await writeFile(path.join(output, test.name, 'verification.json'), JSON.stringify(evidence, null, 2));
  }
}

async function runReducedMotion(route) {
  const test = { name: route === '/' ? 'reduced-landing-pod' : 'reduced-detail-pod', route, id: 'pod' };
  const evidence = { ...test, events: [], status: 'running' }; report.fallbacks.push(evidence);
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce', deviceScaleFactor: 1 });
  const page = await context.newPage();
  try {
    await instrumentPage(page, evidence);
    const anchor = await openSource(page, test);
    const start = Date.now();
    await anchor.click();
    await expect(page).toHaveURL(`${base}/app/?tab=pod`, { timeout: 5000 });
    evidence.navigationMs = Date.now() - start;
    await expect(page.locator('#panel-pod')).toBeVisible();
    const landingStates = evidence.events.filter(event => event.kind === 'state' && !/^\/app\/?$/.test(new URL(event.url).pathname));
    expect(landingStates.some(event => event.phase === 'launching')).toBe(false);
    const incoming = evidence.events.find(event => event.kind === 'incoming-handoff');
    expect(incoming?.marker).toBeNull();
    evidence.status = 'passed';
  } catch (error) { evidence.status = 'failed'; evidence.failure = { message: error.message, stack: error.stack }; report.failures.push({ case: test.name, ...evidence.failure }); }
  finally { await context.close(); }
}

/** Discover the dynamic entry from the actual served HTML/import graph. */
async function discoverSceneChunk() {
  const htmlResponse = await fetch(`${base}/pod`);
  if (!htmlResponse.ok) throw new Error(`Detail HTML returned ${htmlResponse.status}`);
  const html = await htmlResponse.text();
  const entry = [...html.matchAll(/<script\b(?=[^>]*\btype=["']module["'])[^>]*\bsrc=["']([^"']+)["']/g)][0]?.[1];
  if (!entry) throw new Error('No module entry in the served detail HTML');
  const entryURL = new URL(entry, base).href;
  const entryResponse = await fetch(entryURL);
  if (!entryResponse.ok) throw new Error(`Landing entry returned ${entryResponse.status}`);
  const source = await entryResponse.text();
  const imports = [...source.matchAll(/import\(["']([^"']*space-scene[^"']*\.js)["']\)/g)].map(match => new URL(match[1], entryURL).href);
  const urls = [...new Set(imports)];
  if (urls.length !== 1) throw new Error(`Expected one observed space-scene import; found ${urls.length}`);
  report.sceneChunk = { document: htmlResponse.url, entry: entryURL, import: urls[0] };
  return urls[0];
}

async function runReadinessFixture(fixture, sceneURL) {
  const evidence = { name: `early-${fixture}`, fixture, injectedAsset: sceneURL, injectedDiagnostics: [], events: [], status: 'running' };
  report.fallbacks.push(evidence);
  const context = await browser.newContext({ viewport, reducedMotion: 'no-preference', deviceScaleFactor: 1 });
  const page = await context.newPage();
  let releaseResponse;
  const heldResponse = new Promise(resolve => { releaseResponse = resolve; });
  let intercepted;
  const requestSeen = new Promise(resolve => { intercepted = resolve; });
  let responseReleased = false;
  try {
    await instrumentPage(page, evidence, fixture === 'delayed-ready' ? 12 : 1);
    await page.route(sceneURL, async route => {
      evidence.requestHeldAt = Date.now(); intercepted();
      await heldResponse; responseReleased = true;
      if (fixture === 'queue-timeout') await route.abort('aborted');
      else if (fixture === 'module-failure') { evidence.injectedResponseStatus = 503; await route.fulfill({ status: 503, contentType: 'text/javascript', body: '// Deliberately unavailable scene module for this isolated regression.' }); }
      else await route.continue();
    });
    // No screenshot or renderer wait before this click: the fixture reproduces
    // clicking the real usable detail CTA while its dynamic import is pending.
    const anchor = await openSource(page, { route: '/pod', id: 'pod' });
    await expect(anchor).toBeVisible();
    await expect.poll(() => evidence.requestHeldAt, { timeout: 15000 }).toBeTruthy();
    expect(responseReleased).toBe(false);
    const navigation = page.waitForURL(`${base}/app/?tab=pod`, { waitUntil: 'commit', timeout: 20000 });
    navigation.catch(() => {}); // Awaited below; retain rejection while checking departure.
    evidence.clickedAt = Date.now();
    await anchor.click({ noWaitAfter: true });
    await expect(page.locator('html')).toHaveClass(/is-launching/);
    expect(new URL(page.url()).pathname).toBe('/pod');
    await expect(page.locator('.orbital-scene__canvas canvas')).toHaveCount(0);
    evidence.queuedWithoutRenderer = true;
    if (fixture === 'delayed-ready') {
      await page.waitForTimeout(900);
      expect(new URL(page.url()).pathname).toBe('/pod');
      evidence.releasedAt = Date.now(); releaseResponse();
      await expect(page.locator('.orbital-scene__canvas')).toHaveAttribute('data-flight-phase', 'launching', { timeout: 60000 });
    } else if (fixture === 'module-failure') {
      evidence.releasedAt = Date.now(); releaseResponse();
    }
    await navigation;
    evidence.navigationMs = Date.now() - evidence.clickedAt;
    if (fixture === 'queue-timeout') {
      expect(responseReleased, 'The queue must fail open before the stalled scene returns').toBe(false);
      expect(evidence.navigationMs).toBeGreaterThanOrEqual(2800);
      expect(evidence.navigationMs).toBeLessThan(5500);
      releaseResponse();
    }
    if (fixture === 'module-failure') expect(evidence.navigationMs).toBeLessThan(3000);
    await expect(page.locator('.orbital-backdrop')).toHaveClass(/is-ready/, { timeout: 60000 });
    await expect(page.locator('#panel-pod')).toBeVisible();
    const incoming = evidence.events.find(event => event.kind === 'incoming-handoff');
    if (fixture === 'delayed-ready') {
      expect(incoming?.marker?.settled).toBe(true);
      expect(incoming.frame.id).toBe(incoming.marker.id);
      const departure = evidence.events.find(event => event.kind === 'state' && event.phase === 'launching');
      const handoff = evidence.events.find(event => event.kind === 'state' && event.phase === 'handoff');
      evidence.fixtureFlightMs = handoff?.sceneTime - departure?.sceneTime;
      expect(evidence.fixtureFlightMs).toBeGreaterThanOrEqual(9000);
      expect(evidence.events.some(event => event.kind === 'state' && event.phase === 'arriving')).toBe(false);
    } else {
      expect(incoming?.marker).toBeNull();
      expect(evidence.events.some(event => event.kind === 'state' && event.phase === 'launching')).toBe(false);
    }
    evidence.status = 'passed';
  } catch (error) { evidence.status = 'failed'; evidence.failure = { message: error.message, stack: error.stack, url: page.url() }; report.failures.push({ case: evidence.name, ...evidence.failure }); }
  finally { releaseResponse(); await context.close(); }
}

try {
  for (const test of cases) {
    const real = realCases.has(test.name);
    if (scope === 'fallbacks' || (scope === 'real' && !real) || (scope === 'matrix' && real)) continue;
    await runJourney(test);
    console.log(JSON.stringify({ case: test.name, status: report.cases.at(-1).status }));
  }
  if (scope === 'all' || scope === 'fallbacks') {
    for (const route of ['/', '/pod']) await runReducedMotion(route);
    const sceneURL = await discoverSceneChunk();
    for (const fixture of ['delayed-ready', 'module-failure', 'queue-timeout']) await runReadinessFixture(fixture, sceneURL);
  }
  if (report.consoleErrors.length || report.pageErrors.length || report.requestFailures.length || report.csp.length) report.failures.push({ case: 'strict-error-gate', message: 'Unfiltered browser/network/CSP diagnostics were recorded.' });
  report.status = report.failures.length ? 'failed' : 'passed';
} finally { await browser.close(); await writeFile(path.join(output, 'verification.json'), JSON.stringify(report, null, 2)); }
console.log(JSON.stringify({ output, status: report.status, cases: report.cases.map(({ name, status, departureMs, visibleFlightMs }) => ({ name, status, departureMs, visibleFlightMs })), failures: report.failures, consoleErrors: report.consoleErrors, pageErrors: report.pageErrors, requestFailures: report.requestFailures, csp: report.csp }));
if (report.status !== 'passed') process.exitCode = 1;
