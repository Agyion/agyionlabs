import { waitForFrames } from './lib/browser-settle.mjs';
/** Normal-motion document handoff and direct-input checks. No wallet or transactions. */
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const base = process.env.APP_BASE_URL || 'http://127.0.0.1:4192';
const recheck = process.env.FLIGHT_RECHECK === '1';
const mobile = process.env.FLIGHT_MOBILE === '1';
const exploration = process.env.FLIGHT_EXPLORATION === '1';
const scrollExploration = process.env.FLIGHT_SCROLL === '1';
const viewport = mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 };
const output = path.resolve(process.env.FLIGHT_OUTPUT || `artifacts/verification/single-flight-final${mobile ? '-mobile' : ''}${exploration ? '-exploration' : ''}`);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/opt/google/chrome/chrome', headless: true,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
});
const context = await browser.newContext({
  viewport, deviceScaleFactor: 1, reducedMotion: 'no-preference', isMobile: mobile, hasTouch: mobile,
  recordVideo: { dir: path.join(output, 'video'), size: viewport },
});
const recordingRequestedAt = Date.now();
const page = await context.newPage();
page.setDefaultTimeout(30000);
const result = {
  at: new Date().toISOString(), base, viewport, mobile, exploration, normalMotion: true, scope: recheck ? 'handoff recheck' : 'handoff and direct input', status: 'running',
  note: 'Flight duration and continuity checks do not establish a smooth frame rate.',
  recording: { requestedAt: recordingRequestedAt },
  checks: {}, events: [], screenshots: [], pageErrors: [], consoleErrors: [], csp: [], requestFailures: [],
};
let failure;
let navigationAt;
let releaseScriptsAt = 0;
let delayedScriptCount = 0;
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
page.on('pageerror', error => result.pageErrors.push({ message: error.message, url: page.url() }));
page.on('console', message => { if (message.type() === 'error') result.consoleErrors.push({ message: message.text(), location: message.location(), url: page.url() }); });
page.on('requestfailed', request => result.requestFailures.push({ url: request.url(), error: request.failure()?.errorText }));
page.on('framenavigated', frame => {
  if (frame === page.mainFrame() && new URL(frame.url()).pathname === '/app/' && navigationAt === undefined) navigationAt = Date.now();
});
await page.exposeBinding('__recordFlightEvidence', (_source, entry) => {
  result.events.push({ ...entry, observedAt: Date.now() });
  if (entry.kind === 'csp') result.csp.push(entry);
});
await page.addInitScript(({ recordLaunchGeometry }) => {
  let last = '';
  const send = data => { void window.__recordFlightEvidence({ url: location.href, at: performance.now(), ...data }).catch(() => {}); };
  const captureGeometry = reason => {
    const host = document.querySelector('.orbital-scene__canvas, .orbital-canvas');
    const canvas = host?.querySelector('canvas');
    const boundsOf = element => {
      if (!element) return null;
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height };
    };
    const bounds = boundsOf(canvas);
    const geometry = {
      kind: 'canvas-geometry', reason, phase: host?.dataset.flightPhase ?? null,
      launching: document.documentElement.classList.contains('is-launching'),
      view: document.querySelector('.orbital-home--immersive')?.dataset.view ?? null,
      bounds, hostBounds: boundsOf(host), sectionBounds: boundsOf(host?.closest('section')),
      buffer: canvas ? { width: canvas.width, height: canvas.height } : null,
      aspect: bounds?.height ? bounds.width / bounds.height : null,
      scroll: { x: scrollX, y: scrollY },
      viewport: { width: innerWidth, height: innerHeight },
    };
    send(geometry);
    return geometry;
  };
  if (recordLaunchGeometry) {
    window.__captureFlightGeometry = captureGeometry;
    // This listener is installed before the application capture listener. Keep
    // both sides of its synchronous launch class/scroll changes as evidence.
    document.addEventListener('click', event => {
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!anchor || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const destination = new URL(anchor.href, location.href);
      if (destination.origin !== location.origin || !/^\/app\/?$/.test(destination.pathname) || destination.searchParams.has('tab')) return;
      captureGeometry('launch-click-before-handlers');
      queueMicrotask(() => captureGeometry('launch-click-after-handlers'));
      requestAnimationFrame(() => {
        captureGeometry('launch-first-frame');
        requestAnimationFrame(() => captureGeometry('launch-second-frame'));
      });
      for (const milliseconds of [80, 250, 1000]) setTimeout(() => captureGeometry(`launch-after-${milliseconds}ms`), milliseconds);
    }, true);
  }
  for (const proto of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
    const link = proto.linkProgram;
    proto.linkProgram = function(program) {
      send({ kind: 'shader-link', phase: document.querySelector('.orbital-scene__canvas, .orbital-canvas')?.dataset.flightPhase ?? null });
      return link.call(this, program);
    };
  }
  const record = () => {
    const host = document.querySelector('.orbital-canvas, .orbital-scene__canvas');
    const bridge = document.getElementById('agyion-flight-bridge');
    const ready = Boolean(document.querySelector('.orbital-backdrop.is-ready'));
    const phase = host?.dataset.flightPhase || null;
    const heading = document.querySelector('.station-vista__heading');
    const footer = document.querySelector('.station-scene-footer');
    const headingStyle = heading ? getComputedStyle(heading) : null;
    const state = {
      kind: 'state', phase, ready, bridge: Boolean(bridge), bridgeLoaded: Boolean(bridge?.complete && bridge.naturalWidth),
      headingPresent: Boolean(heading), headingOpacity: headingStyle ? Number(headingStyle.opacity) : null,
      headingVisibility: headingStyle?.visibility ?? null,
      footerOpacity: footer ? Number(getComputedStyle(footer).opacity) : null,
    };
    const key = JSON.stringify(state);
    if (key !== last) { last = key; send(state); }
    window.__flightTiming ??= {};
    if (ready && window.__flightTiming.readyAt === undefined) window.__flightTiming.readyAt = performance.now();
    if (phase === 'interactive' && ready && window.__flightTiming.interactiveAt === undefined) window.__flightTiming.interactiveAt = performance.now();
  };
  new MutationObserver(record).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-flight-phase', 'src'] });
  document.addEventListener('load', record, true);
  document.addEventListener('securitypolicyviolation', event => send({ kind: 'csp', directive: event.violatedDirective, blockedURI: event.blockedURI }));
}, { recordLaunchGeometry: exploration });
const scriptGate = async route => {
  if (route.request().resourceType() !== 'script') return route.continue();
  if (!releaseScriptsAt) releaseScriptsAt = Date.now() + 1500;
  const remaining = releaseScriptsAt - Date.now();
  if (remaining > 0) { delayedScriptCount += 1; await delay(remaining); }
  await route.continue();
};
const shot = async name => {
  const file = path.join(output, `${name}.png`);
  await page.screenshot({ path: file, timeout: 60000 });
  result.screenshots.push({ name, file, url: page.url(), at: Date.now() });
};
const readyScene = async () => {
  await expect(page.locator('.orbital-backdrop')).toHaveClass(/is-ready/, { timeout: 60000 });
  await expect(page.locator('.orbital-canvas canvas')).toBeVisible();
};
const freshArrival = async () => {
  await page.evaluate(() => {
    sessionStorage.removeItem('agyion:flight-frame');
    sessionStorage.setItem('agyion:arrival', JSON.stringify({ at: Date.now() }));
  });
  await page.goto(`${base}/app/`, { waitUntil: 'domcontentloaded' });
  await readyScene();
  await expect(page.locator('.orbital-canvas')).toHaveAttribute('data-flight-phase', 'arriving');
};

const summarizeExplorationGeometry = () => {
  if (!exploration) return;
  const samples = result.events.filter(event => event.kind === 'canvas-geometry' && new URL(event.url).pathname === '/');
  const before = samples.find(event => event.reason === 'launch-click-before-handlers');
  const immediate = samples.filter(event => before && event.at >= before.at && event.at - before.at <= 150 && event.launching);
  result.checks.explorationLaunchGeometry = {
    samples,
    beforeClick: before ?? null,
    immediateSamples: immediate,
    instantaneousAspectChange: before?.aspect && immediate.length
      ? immediate.some(event => event.aspect !== null && Math.abs(event.aspect - before.aspect) / before.aspect > .005)
      : null,
    maxImmediateAspectChangeRatio: before?.aspect && immediate.length
      ? Math.max(...immediate.map(event => event.aspect === null ? 0 : Math.abs(event.aspect - before.aspect) / before.aspect))
      : null,
    immediateScrollChange: before && immediate.length
      ? immediate.some(event => event.scroll.x !== before.scroll.x || event.scroll.y !== before.scroll.y)
      : null,
    note: 'Changes above 0.5% within 150ms are recorded, not treated as proof of a visible jump or a failed continuity assertion.',
  };
};

try {
  await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.orbital-scene')).toHaveClass(/is-ready/, { timeout: 60000 });
  await shot('01-landing');
  if (exploration) {
    if (mobile) await page.getByRole('button', { name: 'Open navigation menu', exact: true }).click();
    await page.getByRole('navigation', { name: mobile ? 'Mobile navigation' : 'Main navigation', exact: true }).getByRole('link', { name: 'Instruments', exact: true }).click();
    await expect(page.locator('.orbital-home--immersive')).toHaveAttribute('data-view', 'instruments');
    await page.locator('#exhibit-pod').click();
    await expect(page.locator('.orbital-home--immersive')).toHaveAttribute('data-selected', 'pod');
    await expect(page.locator('#instrument-stage')).toBeVisible();
    await expect(page.locator('#exhibit-title')).toContainText('Pod');
    await page.waitForTimeout(1600);
    if (scrollExploration) {
      await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
      await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
      await waitForFrames(page);
    }
    result.checks.explorationBeforeLaunch = await page.evaluate(() => window.__captureFlightGeometry('exploration-settled-before-launch'));
    await shot('01b-exploration-settled');
    expect(result.checks.explorationBeforeLaunch.bounds.width, 'Long exploration content must not resize the scene before departure').toBe(viewport.width);
    expect(result.checks.explorationBeforeLaunch.bounds.height, 'The scene keeps the same viewport lens before and during departure').toBe(viewport.height);
    expect(result.checks.explorationBeforeLaunch.bounds.y, 'Scrolling the reading content must not move the departure canvas').toBe(0);
  }
  await page.route('**/_next/**/*.js', scriptGate);
  const launchAt = Date.now();
  result.recording.launchAt = launchAt;
  const navigation = page.waitForURL('**/app/', { waitUntil: 'commit', timeout: 15000 });
  await page.locator(exploration ? '.orbital-nav__launch' : '.orbital-hero a[href="/app/"]').click({ noWaitAfter: true });
  await expect(page.locator('.orbital-scene__canvas')).toHaveAttribute('data-flight-phase', 'launching');
  const landingBounds = await page.locator('.orbital-scene__canvas canvas').boundingBox();
  if (exploration) result.checks.explorationAfterLaunch = await page.evaluate(() => window.__captureFlightGeometry('launching-observed'));
  await page.waitForTimeout(Math.max(0, launchAt + 3600 - Date.now()));
  result.checks.oldMidpointPhase = await page.locator('.orbital-scene__canvas').getAttribute('data-flight-phase');
  expect(result.checks.oldMidpointPhase).toBe('launching');
  expect(new URL(page.url()).pathname).toBe('/');
  await shot('02-landing-former-midpoint');
  await page.waitForTimeout(Math.max(0, launchAt + 8600 - Date.now()));
  await shot('02b-landing-near-destination');
  await navigation;
  result.recording.navigationAt = navigationAt;
  result.checks.completeJourneyMs = navigationAt - launchAt;
  expect(result.checks.completeJourneyMs, 'Navigation must wait for the entire9.8s journey').toBeGreaterThanOrEqual(9500);
  await expect(page.locator('#agyion-flight-bridge')).toBeVisible({ timeout: 5000 });
  await expect.poll(() => page.locator('#agyion-flight-bridge').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
  const bridge = await page.locator('#agyion-flight-bridge').evaluate(image => ({
    width: image.getBoundingClientRect().width, height: image.getBoundingClientRect().height,
    sourceMatches: image.src === JSON.parse(sessionStorage.getItem('agyion:flight-frame')).data,
    settled: JSON.parse(sessionStorage.getItem('agyion:arrival')).settled === true,
    canvasExists: Boolean(document.querySelector('.orbital-canvas canvas')),
  }));
  expect(bridge.sourceMatches).toBe(true);
  expect(bridge.settled).toBe(true);
  expect(bridge.canvasExists, 'The saved frame must bridge the page before app graphics exist').toBe(false);
  expect(bridge.width).toBe(viewport.width); expect(bridge.height).toBe(viewport.height);
  result.checks.delayedScripts = delayedScriptCount;
  result.checks.bridgeBeforeGraphics = bridge;
  expect(delayedScriptCount).toBeGreaterThan(0);
  await shot('03-navigation-bridge');
  await readyScene();
  result.recording.readyObservedAt = Date.now();
  await expect(page.locator('.orbital-canvas')).toHaveAttribute('data-flight-phase', 'interactive');
  let bridgeWasVisible = false;
  let bridgeDroppedBeforeGraphics = false;
  for (const event of result.events.filter(event => event.kind === 'state' && new URL(event.url).pathname === '/app/')) {
    if (event.bridge) bridgeWasVisible = true;
    else if (bridgeWasVisible && !event.ready) bridgeDroppedBeforeGraphics = true;
  }
  result.checks.bridgeHeldUntilGraphics = !bridgeDroppedBeforeGraphics;
  expect(bridgeDroppedBeforeGraphics, 'A decoded component poster must not uncover unready app controls').toBe(false);
  const appBounds = await page.locator('.orbital-canvas canvas').boundingBox();
  result.checks.sceneBounds = { landing: landingBounds, app: appBounds };
  expect(landingBounds.x).toBe(0); expect(landingBounds.y).toBe(0);
  expect(landingBounds.width).toBe(viewport.width); expect(landingBounds.height).toBe(viewport.height);
  expect(appBounds.x).toBe(0); expect(appBounds.y).toBe(0);
  expect(appBounds.width).toBe(viewport.width); expect(appBounds.height).toBe(viewport.height);
  await shot('04-renderer-ready');
  await expect(page.locator('.orbital-canvas')).toHaveAttribute('data-flight-phase', 'interactive', { timeout: 15000 });
  await expect(page.locator('.station-app')).not.toHaveClass(/station-arriving/);
  await expect(page.locator('#agyion-flight-bridge, .orbital-arrival-poster')).toHaveCount(0);
  result.checks.arrivalTiming = await page.evaluate(() => window.__flightTiming);
  expect(result.checks.arrivalTiming.interactiveAt - result.checks.arrivalTiming.readyAt, 'The completed destination must not start another6.2s approach').toBeLessThan(200);
  const appStates = result.events.filter(event => event.kind === 'state' && new URL(event.url).pathname === '/app/');
  result.checks.noSecondApproach = appStates.every(event => event.phase !== 'arriving');
  expect(result.checks.noSecondApproach).toBe(true);
  result.checks.landingShaderLinksDuringFlight = result.events.filter(event => event.kind === 'shader-link' && new URL(event.url).pathname === '/' && ['launching', 'handoff'].includes(event.phase)).length;
  expect(result.checks.landingShaderLinksDuringFlight, 'The detailed station must be prepared before launch, never compiled during its approach').toBe(0);
  const exposedUnreadyStates = appStates.filter(event => event.phase !== null && !event.ready && !event.bridge);
  result.checks.controlsHiddenUntilGraphics = exposedUnreadyStates.every(event =>
    (event.headingPresent === false || event.headingVisibility === 'hidden' || event.headingOpacity === 0) && event.footerOpacity <= .11);
  expect(result.checks.controlsHiddenUntilGraphics, 'App controls must not flash before the destination renderer is ready').toBe(true);
  await shot('05-destination-ready');
  await page.waitForTimeout(6500);
  await expect(page.locator('.orbital-canvas')).toHaveAttribute('data-flight-phase', 'interactive');
  await shot('05b-destination-after-former-second-leg');
  await page.unroute('**/_next/**/*.js', scriptGate);

  for (const input of recheck ? [] : ['drag', 'wheel', 'keyboard', 'module']) {
    await freshArrival();
    const before = Date.now();
    const bounds = await page.locator('.orbital-canvas canvas').boundingBox();
    const x = bounds.x + bounds.width * .72, y = bounds.y + bounds.height * .46;
    if (input === 'drag') {
      await page.mouse.move(x, y); await page.mouse.down();
      await page.mouse.move(x + 110, y + 35, { steps: 8 }); await page.mouse.up();
    } else if (input === 'wheel') {
      await page.mouse.move(x, y); await page.mouse.wheel(0, -140);
    } else if (input === 'keyboard') {
      await page.locator('.orbital-canvas canvas').focus(); await page.keyboard.press('ArrowRight');
    } else {
      await page.locator('#tab-pod').click();
      await expect(page.locator('#panel-pod')).toBeVisible();
    }
    await expect(page.locator('.orbital-canvas')).toHaveAttribute('data-flight-phase', 'interactive', { timeout: 2000 });
    await expect(page.locator('.station-app')).not.toHaveClass(/station-arriving/);
    result.checks[`interrupt-${input}`] = { completed: true, responseMs: Date.now() - before };
    if (input !== 'module') {
      await expect(page.locator('.station-workspace')).toBeHidden();
      await expect(page.locator('#tab-fade')).toHaveAttribute('aria-selected', 'true');
    }
  }
  if (!recheck) {
    await shot('06-module-interruption');
    await page.getByRole('button', { name: 'Close instrument', exact: true }).click();
    await expect(page.locator('.station-workspace')).toBeHidden();
  }
  await expect(page.getByRole('button', { name: /^(Pause motion|Resume motion)$/ })).toHaveCount(0);
  expect(result.pageErrors).toEqual([]); expect(result.csp).toEqual([]);
  if (!recheck) expect(result.consoleErrors).toEqual([]);
  // A focused repeat retains every console/network error without repeating the
  // original broad error gate; it never labels such a run as error-free.
  result.status = result.consoleErrors.length || result.requestFailures.length ? 'checks-passed-with-runtime-diagnostics' : 'passed';
} catch (error) {
  failure = error;
  result.status = 'failed'; result.failure = { message: error.message, stack: error.stack, url: page.url() };
  await shot('failure').catch(() => {});
} finally {
  result.recording.stopRequestedAt = Date.now();
  await context.close();
  result.recording.stoppedAt = Date.now();
  result.video = await page.video()?.path();
  summarizeExplorationGeometry();
  await writeFile(path.join(output, 'verification.json'), JSON.stringify(result, null, 2));
  await browser.close();
}
console.log(JSON.stringify({ status: result.status, output, checks: result.checks, errors: result.pageErrors, consoleErrors: result.consoleErrors, requestFailures: result.requestFailures, csp: result.csp }));
if (failure) throw failure;
if (result.status !== 'passed') process.exitCode = 1;
