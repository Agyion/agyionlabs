/** Two-scene homepage regression. Own browser only; no signing or chain writes. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { chromium, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4192';
const OUTPUT = path.resolve(process.env.QA_OUTPUT_DIR || 'artifacts/verification/home-gallery');
const widths = (process.env.QA_WIDTHS || '1440,768,390,320').split(',').map(Number);
const motions = (process.env.QA_MOTIONS || 'no-preference,reduce').split(',');
const scope = process.env.QA_SCOPE || 'full';
if (!['full', 'routes'].includes(scope)) throw new Error('Invalid QA scope');
if (widths.some(n => !Number.isInteger(n) || n < 280) || motions.some(m => !['no-preference', 'reduce'].includes(m))) throw new Error('Invalid width or motion configuration');
const executablePath = [process.env.CHROMIUM_PATH, '/opt/google/chrome/chrome', chromium.executablePath()].filter(Boolean).find(file => fs.existsSync(file));
if (!executablePath) throw new Error('Chromium is unavailable');
const files = ['scripts/verify-home-gallery.mjs', 'landing/src/App.tsx', 'landing/src/pages/Home.tsx', 'landing/src/components/HomeInstrumentGallery.tsx', 'landing/src/styles/home-gallery.css', 'landing/src/components/OrbitalScene.tsx', 'landing/src/components/NavPill.tsx', 'landing/src/components/InstrumentMechanism.tsx', 'landing/src/styles/orbital.css', 'landing/src/components/ProductRouteLink.tsx', 'landing/src/components/productRouteTransition.ts', 'landing/src/lib/routeScroll.ts', 'landing/src/styles/product-route-transition.css'];
const hashes = () => files.map(file => ({ file, sha256: createHash('sha256').update(fs.readFileSync(file)).digest('hex') }));
fs.mkdirSync(OUTPUT, { recursive: true });
const report = { version: 2, base: BASE, scope, startedAt: new Date().toISOString(), status: 'running', widths, motions, sourcesAtStart: hashes(), checks: [], skippedChecks: [], screenshots: [], failures: [], pageErrors: [], consoleErrors: [], requestFailures: [], httpErrors: [], csp: [], limits: 'Chromium/SwiftShader UI evidence, not real-phone/native-GPU performance. Normal flights are unaccelerated; their same-origin destination is an isolated fixture. Hero mesh absence is checked by the source option and saved appearance, not private Three.js runtime introspection. No wallet or chain action. Routes scope deliberately omits product animation sweeps and departure checks; omitted groups are listed separately, never counted as passing.' };
const persist = () => fs.writeFileSync(path.join(OUTPUT, 'results.json'), JSON.stringify(report, null, 2));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
let active = {};
async function check(name, fn) {
  if (scope === 'routes' && !/Source contract:|hero and opaque|native section navigation|How dialog|same-path Back|native Details|immediate Back|direct instruments hash/.test(name)) {
    report.skippedChecks.push({ name, reason: 'Outside focused route/history scope' }); return;
  }
  active.phase = name; const result = { name, status: 'running' }; report.checks.push(result);
  try { result.evidence = await fn(); result.status = 'passed'; console.log(`PASS ${name}`); }
  catch (error) { result.status = 'failed'; result.error = error.message; report.failures.push({ ...active, message: error.message, stack: error.stack }); throw error; }
  finally { persist(); }
}
async function trackedPage(context) {
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  const meta = () => ({ ...active, url: page.url() });
  page.on('console', entry => { if (entry.type() === 'error') report.consoleErrors.push({ ...meta(), message: entry.text(), location: entry.location() }); });
  page.on('pageerror', error => report.pageErrors.push({ ...meta(), message: error.message }));
  page.on('requestfailed', request => report.requestFailures.push({ ...meta(), request: request.url(), error: request.failure()?.errorText }));
  page.on('response', response => { if (response.status() >= 400) report.httpErrors.push({ ...meta(), request: response.url(), status: response.status() }); });
  await page.exposeBinding('__galleryCsp', (_source, entry) => report.csp.push({ ...meta(), ...entry }));
  await page.addInitScript(() => {
    window.__galleryProbe = { draws: 0, launchFrames: [] };
    document.addEventListener('securitypolicyviolation', e => window.__galleryCsp({ directive: e.violatedDirective, blockedURI: e.blockedURI }));
    for (const proto of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) for (const method of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
      const original = proto[method]; if (original) proto[method] = function (...args) { window.__galleryProbe.draws++; return original.apply(this, args); };
    }
    const sampleLaunch = () => {
      if (!document.documentElement.classList.contains('is-launching')) return;
      const canvas = document.querySelector('.orbital-scene canvas'), rect = canvas?.getBoundingClientRect();
      if (!rect || window.__galleryProbe.launchFrames.length >= 24) return;
      window.__galleryProbe.launchFrames.push({ at: performance.now(), phase: document.querySelector('.orbital-scene__canvas')?.dataset.flightPhase, scrollY, x: rect.x, y: rect.y, width: rect.width, height: rect.height, bufferWidth: canvas.width, bufferHeight: canvas.height, viewportWidth: innerWidth, viewportHeight: innerHeight });
      requestAnimationFrame(sampleLaunch);
    };
    let recordingLaunch = false;
    new MutationObserver(records => {
      if (!records.some(record => record.target === document.documentElement)) return;
      if (!document.documentElement?.classList.contains('is-launching')) { recordingLaunch = false; return; }
      if (recordingLaunch) return;
      recordingLaunch = true; sampleLaunch();
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['class'] });
  });
  return page;
}
async function screenshot(page, name, fullPage = false) {
  const file = path.join(OUTPUT, `${name}.png`); await page.screenshot({ path: file, fullPage, timeout: 60000 }); report.screenshots.push({ ...active, file }); return file;
}
const world = page => page.locator('.orbital-home--gallery');
const control = (page, id) => page.locator(`#exhibit-${id}`);
const mechanism = page => page.locator('#instrument-stage .instrument-mechanism');
async function frames(page) { await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
async function ready(page) {
  await expect(world(page)).toBeVisible(); await expect(page.locator('#home .orbital-scene')).toHaveClass(/is-ready/, { timeout: 60000 });
  await expect(page.locator('.orbital-scene canvas')).toHaveCount(1); await expect(mechanism(page)).toHaveCount(1); await page.evaluate(() => document.fonts.ready);
}
async function nav(page, name) {
  const desktop = page.getByRole('navigation', { name: 'Main navigation', exact: true });
  if (await desktop.isVisible()) return desktop.getByRole('link', { name, exact: true });
  const mobile = page.getByRole('navigation', { name: 'Mobile navigation', exact: true });
  if (!await mobile.isVisible()) await page.getByRole('button', { name: 'Open navigation menu', exact: true }).click();
  return mobile.getByRole('link', { name, exact: true });
}
async function layout(page) {
  return page.evaluate(() => {
    const box = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x: r.x, y: r.y, top: r.top + scrollY, bottom: r.bottom + scrollY, width: r.width, height: r.height }; };
    return { width: innerWidth, height: innerHeight, scrollY, documentHeight: document.documentElement.scrollHeight, scrollWidth: document.documentElement.scrollWidth, hero: box('#home'), gallery: box('#instruments'), stage: box('#instrument-stage'), galleryBackground: getComputedStyle(document.querySelector('#instruments')).backgroundColor };
  });
}
async function gallery(page) {
  await (await nav(page, 'Instruments')).click(); await expect(page).toHaveURL(/\/#instruments$/);
  await expect.poll(() => page.locator('#instruments').evaluate(element => Math.abs(element.getBoundingClientRect().top - parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop)))).toBeLessThan(3);
  await expect(page.locator('#instruments [aria-pressed="true"]')).toHaveCount(1);
}
async function choose(page, id) {
  await control(page, id).click(); await expect(control(page, id)).toHaveAttribute('aria-pressed', 'true');
  await expect(mechanism(page)).toHaveAttribute('data-mechanism', id);
  await expect(page.locator('#instrument-stage a[href="/' + id + '"]')).toHaveAccessibleName(/Details/);
  await expect(page.locator(`#instrument-stage a[href="/app/?tab=${id}"]`)).toBeVisible();
}
async function geometry(page) {
  return mechanism(page).locator('.im-stage svg').evaluate(svg => {
    const r = svg.getBoundingClientRect();
    return { rect: { x: r.x, y: r.y, width: r.width, height: r.height }, viewBox: svg.getAttribute('viewBox'), shapes: [...svg.querySelectorAll('g,path,circle,ellipse,rect,line')].map(e => ({ attrs: [...e.attributes].filter(a => a.name !== 'class').map(a => [a.name, a.value]), transform: getComputedStyle(e).transform, opacity: getComputedStyle(e).opacity, dash: getComputedStyle(e).strokeDashoffset })) };
  });
}
const outcomes = { fade: 'fade-pays', pod: 'pod-open', trigger: 'trigger-payout', envoy: 'envoy-owner' };
async function preview(page, id, reduced) {
  const root = mechanism(page), outcome = outcomes[id], svg = root.locator('.im-stage svg');
  await expect(root.locator('input,select,textarea,[data-action="reset"]')).toHaveCount(0);
  await expect(root.locator('button')).toHaveCount(1);
  const replay = root.locator('[data-action="replay"]');
  await svg.scrollIntoViewIfNeeded();
  await expect(root).toHaveAttribute('data-outcome', outcome, { timeout: 12000 });
  await expect(root).toHaveAttribute('data-running', 'false');
  const claims = root.locator('text.im-rule-value').filter({ hasText: /\/\s*50/ });
  if (id === 'envoy') await expect(claims).toHaveText('01 / 50');
  const original = await svg.elementHandle();
  await replay.focus(); await expect(replay).toBeFocused(); await page.keyboard.press('Enter');
  await svg.scrollIntoViewIfNeeded();
  if (reduced) await expect(root).toHaveAttribute('data-outcome', outcome);
  else { await expect(root).toHaveAttribute('data-running', 'true'); await expect(replay).toBeDisabled(); }
  await pause(150);
  const samples = [];
  for (let index = 0; index < 5; index++) { const state = await geometry(page); samples.push({ at: Date.now(), rect: state.rect, viewBox: state.viewBox, digest: digest(state.shapes) }); await pause(130); }
  for (const item of samples) for (const key of ['x', 'y', 'width', 'height']) expect(Math.abs(item.rect[key] - samples[0].rect[key]), `Stable SVG ${key}`).toBeLessThan(1);
  expect(new Set(samples.map(s => s.viewBox)).size).toBe(1);
  if (reduced) expect(new Set(samples.map(s => s.digest)).size).toBe(1);
  else expect(new Set(samples.map(s => s.digest)).size).toBeGreaterThanOrEqual(3);
  await expect(root).toHaveAttribute('data-outcome', outcome, { timeout: 12000 }); await expect(root).toHaveAttribute('data-running', 'false');
  if (id === 'envoy') await expect(claims).toHaveText('01 / 50');
  expect(await original.evaluate(e => e.isConnected)).toBe(true); await original.dispose();
  return { outcome, automaticSampleCompleted: true, replayRetainsSvg: true, ...(id === 'envoy' ? { claimsBeforeAndAfterReplay: '01 / 50' } : {}), samples };
}

try {
  await check('Source contract: hero disables physical product exhibits', async () => {
    const source = fs.readFileSync('landing/src/pages/Home.tsx', 'utf8');
    expect(source).toMatch(/<OrbitalScene\b[^>]*\bshowExhibits=\{false\}/s);
    return { source: 'landing/src/pages/Home.tsx', showExhibits: false, limit: 'Source assertion plus screenshots; no invented runtime mesh count.' };
  });
  for (const width of widths) for (const motion of motions) {
    const height = width >= 768 ? 1000 : width === 390 ? 844 : 800, reduced = motion === 'reduce';
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: motion, isMobile: width < 768, hasTouch: width < 768 });
    const page = await trackedPage(context), prefix = `${width}-${reduced ? 'reduced' : 'motion'}`; active = { width, motion };
    try {
      await page.goto(BASE, { waitUntil: 'domcontentloaded' }); await ready(page);
      await check(`${prefix}: hero and opaque product gallery occupy separate natural document sections`, async () => {
        const measured = await layout(page);
        expect(measured.scrollY).toBeLessThan(3); expect(measured.hero.height).toBeGreaterThanOrEqual(height * .85);
        expect(measured.gallery.top).toBeGreaterThanOrEqual(measured.hero.bottom - 1);
        expect(measured.documentHeight).toBeGreaterThan(height * 1.6); expect(measured.scrollWidth).toBeLessThanOrEqual(width + 1);
        expect(measured.galleryBackground, 'The gallery uses a fully opaque surface').toMatch(/^rgb\(/);
        expect(await page.locator('#home .instrument-mechanism, #home [id^="exhibit-"]').count()).toBe(0);
        await expect(control(page, 'fade')).toHaveAttribute('aria-pressed', 'true');
        await expect(mechanism(page)).toHaveAttribute('data-running', reduced ? 'false' : 'true');
        if (!reduced) await expect(mechanism(page).locator('[data-action="replay"]')).toBeDisabled();
        await expect(page.getByRole('button', { name: /pause.*motion|resume.*motion/i })).toHaveCount(0);
        const assets = await page.evaluate(() => [...document.querySelectorAll('script[src],link[rel="stylesheet"]')].map(e => e.getAttribute('src') || e.getAttribute('href')));
        await screenshot(page, `${prefix}-hero`); return { ...measured, assets };
      });
      await check(`${prefix}: native section navigation, wheel scrolling and offscreen hero pause`, async () => {
        await gallery(page); const before = await layout(page); expect(before.scrollY).toBeGreaterThan(height * .5);
        await page.mouse.move(width * .5, height * .65); await page.mouse.wheel(0, 180);
        await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before.scrollY + 80);
        await mechanism(page).locator('.im-stage svg').scrollIntoViewIfNeeded(); await pause(350);
        expect(await page.locator('#home').evaluate(e => e.getBoundingClientRect().bottom)).toBeLessThanOrEqual(0);
        const drawsBefore = await page.evaluate(() => window.__galleryProbe.draws); await pause(400);
        const drawsAfter = await page.evaluate(() => window.__galleryProbe.draws); expect(drawsAfter).toBe(drawsBefore);
        await screenshot(page, `${prefix}-gallery`); return { before, drawsBefore, drawsAfter };
      });
      for (const id of ['fade', 'pod', 'trigger', 'envoy']) await check(`${prefix}: ${id} selection runs its own continuous mechanism and honest result`, async () => {
        await choose(page, id); await expect(page.locator('#instrument-stage .instrument-mechanism')).toHaveCount(1);
        const evidence = await preview(page, id, reduced);
        await screenshot(page, `${prefix}-${id}-result`);
        if (id === 'fade') {
          const position = await page.evaluate(() => scrollY);
          await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' })); await frames(page);
          await screenshot(page, `${prefix}-gallery-full`, true);
          await page.evaluate(y => window.scrollTo({ top: y, behavior: 'instant' }), position); await frames(page);
        }
        expect((await layout(page)).scrollWidth).toBeLessThanOrEqual(width + 1); return evidence;
      });
      await check(`${prefix}: arrows and rapid switches keep one fresh mechanism`, async () => {
        await control(page, 'envoy').focus();
        for (const [key, id] of [['ArrowRight', 'fade'], ['ArrowLeft', 'envoy'], ['Home', 'fade'], ['End', 'envoy']]) {
          await page.keyboard.press(key); await expect(control(page, id)).toBeFocused(); await expect(control(page, id)).toHaveAttribute('aria-pressed', 'true'); await expect(mechanism(page)).toHaveAttribute('data-mechanism', id);
        }
        await choose(page, 'fade'); const old = await mechanism(page).locator('svg').elementHandle();
        if (await mechanism(page).locator('[data-action="replay"]').isEnabled()) await mechanism(page).locator('[data-action="replay"]').click();
        for (const id of ['trigger', 'pod', 'envoy', 'fade']) await choose(page, id);
        expect(await old.evaluate(e => e.isConnected)).toBe(false); await old.dispose();
        await mechanism(page).locator('.im-stage svg').scrollIntoViewIfNeeded();
        await expect(mechanism(page)).toHaveAttribute('data-outcome', 'fade-pays', { timeout: 12000 }); await expect(mechanism(page)).toHaveAttribute('data-running', 'false');
      });
      if (!reduced) await check(`${prefix}: a running SVG pauses outside the viewport and resumes on return`, async () => {
        await mechanism(page).locator('[data-action="replay"]').click(); await mechanism(page).locator('.im-stage svg').scrollIntoViewIfNeeded(); await pause(200);
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' })); await pause(250);
        const first = digest((await geometry(page)).shapes); await pause(550); const second = digest((await geometry(page)).shapes);
        expect(second).toBe(first); await expect(mechanism(page)).toHaveAttribute('data-running', 'true');
        await mechanism(page).locator('.im-stage svg').scrollIntoViewIfNeeded(); await expect(mechanism(page)).toHaveAttribute('data-outcome', 'fade-pays', { timeout: 12000 });
        return { stationaryOffscreen: true, completedAfterReturn: true };
      });
      await check(`${prefix}: How dialog restores gallery scroll, selection and visible focus`, async () => {
        await choose(page, 'pod'); await mechanism(page).locator('.im-stage svg').scrollIntoViewIfNeeded();
        const opener = await nav(page, 'How it works'), before = await page.evaluate(() => scrollY); await opener.click();
        const dialog = page.getByRole('dialog', { name: 'How it works', exact: true }); await expect(dialog).toBeVisible();
        await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
        await dialog.getByRole('tab', { name: 'Result', exact: true }).click(); await page.keyboard.press('Tab'); expect(await dialog.evaluate(e => e.contains(document.activeElement))).toBe(true);
        await page.keyboard.press('Escape'); await expect(dialog).toBeHidden();
        await expect(control(page, 'pod')).toHaveAttribute('aria-pressed', 'true');
        await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before - 3); await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(before + 3);
        expect(await page.evaluate(() => { const e = document.activeElement; return e instanceof HTMLElement && e !== document.body && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden'; })).toBe(true);
        return { before, after: await page.evaluate(() => scrollY) };
      });
      await check(`${prefix}: same-path Back restores the older product and gallery scroll`, async () => {
        await gallery(page); await choose(page, 'envoy'); await mechanism(page).locator('.im-stage svg').scrollIntoViewIfNeeded(); await frames(page);
        const originalCanvas = await page.locator('.orbital-scene canvas').elementHandle();
        const before = await page.evaluate(() => scrollY);
        await (await nav(page, 'Home')).click(); await expect(page).toHaveURL(/\/#home$/); await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(3);
        await page.mouse.move(width * .5, height * .6); await page.mouse.wheel(0, height);
        await choose(page, 'pod'); await expect(page).toHaveURL(/\/#home$/);
        await page.goBack(); await expect(page).toHaveURL(/\/#instruments$/); await expect(control(page, 'envoy')).toHaveAttribute('aria-pressed', 'true');
        await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before - 3); await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(before + 3);
        expect(await originalCanvas.evaluate(element => element.isConnected && element === document.querySelector('.orbital-scene canvas'))).toBe(true); await originalCanvas.dispose();
        return { before, after: await page.evaluate(() => scrollY), selectedAfterBack: 'envoy' };
      });
      await check(`${prefix}: native Details then Back returns to the gallery`, async () => {
        await choose(page, 'pod');
        const details = page.locator('#instrument-stage a[href="/pod"]');
        const native = await details.evaluate(anchor => {
          const results = [];
          for (const mode of ['ctrl', 'meta', 'shift', 'alt', 'middle', 'blank', 'download']) {
            if (mode === 'blank') anchor.target = '_blank';
            if (mode === 'download') anchor.setAttribute('download', '');
            document.addEventListener('click', event => { results.push({ mode, native: !event.defaultPrevented }); event.preventDefault(); }, { once: true });
            anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: mode === 'middle' ? 1 : 0, ctrlKey: mode === 'ctrl', metaKey: mode === 'meta', shiftKey: mode === 'shift', altKey: mode === 'alt' }));
            anchor.removeAttribute('target'); anchor.removeAttribute('download');
          }
          return results;
        });
        expect(native.every(item => item.native), JSON.stringify(native)).toBe(true);
        const transitionSupported = await page.evaluate(() => {
          window.__galleryRouteTransitions = [];
          window.__galleryRouteSnapshots = [];
          new MutationObserver(() => { const id = document.documentElement.dataset.productRouteTransition; if (id) window.__galleryRouteTransitions.push(id); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-product-route-transition'] });
          if (typeof document.startViewTransition !== 'function') return false;
          const native = document.startViewTransition.bind(document);
          document.startViewTransition = callback => native(async () => {
            await callback();
            const title = document.querySelector('.product-page [data-product-transition-title]'), ancestors = [];
            for (let node = title; node; node = node.parentElement) ancestors.push({ tag: node.tagName, class: node.getAttribute('class'), opacity: getComputedStyle(node).opacity });
            window.__galleryRouteSnapshots.push({ pathname: location.pathname, titlePresent: Boolean(title), transitionName: title && getComputedStyle(title).viewTransitionName, ancestors });
          });
          return true;
        });
        await details.click(); await expect(page.locator('.product-page[data-instrument="pod"]')).toBeVisible();
        let snapshots = [];
        if (transitionSupported && !reduced) {
          expect(await page.evaluate(() => window.__galleryRouteTransitions)).toContain('pod');
          await expect.poll(() => page.evaluate(() => window.__galleryRouteSnapshots.length)).toBeGreaterThan(0);
          snapshots = await page.evaluate(() => window.__galleryRouteSnapshots);
          expect(snapshots.at(-1).pathname).toBe('/pod'); expect(snapshots.at(-1).titlePresent).toBe(true); expect(snapshots.at(-1).transitionName).toBe('product-title');
          for (const ancestor of snapshots.at(-1).ancestors) expect(Number(ancestor.opacity), `${ancestor.tag}.${ancestor.class} snapshot opacity`).toBe(1);
        }
        await page.goBack(); await ready(page); await expect(page).toHaveURL(/\/#instruments$/);
        await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(height * .5); await expect(mechanism(page)).toBeVisible();
        await expect(control(page, 'pod')).toHaveAttribute('aria-pressed', 'true');
        return { native, transitionSupported, snapshots, selectionAfterBack: 'pod' };
      });
      await check(`${prefix}: immediate Back after the product is visible restores exact gallery position`, async () => {
        await choose(page, 'trigger');
        const details = page.locator('#instrument-stage a[href="/trigger"]');
        await details.scrollIntoViewIfNeeded(); await frames(page);
        const before = await page.evaluate(() => scrollY);
        expect(before).toBeGreaterThan(height * .5);
        await details.click(); await expect(page.locator('.product-page[data-instrument="trigger"]')).toBeVisible();
        const visibleAt = Date.now();
        // No transition-completion, shader-readiness or network-idle wait before Back.
        const backStartedAt = Date.now(); await page.goBack();
        await expect(page).toHaveURL(/\/#instruments$/); await ready(page);
        await expect.poll(() => page.evaluate(y => Math.abs(scrollY - y), before)).toBeLessThan(3);
        await expect(control(page, 'trigger')).toHaveAttribute('aria-pressed', 'true');
        return { before, after: await page.evaluate(() => scrollY), millisecondsFromVisibleToBack: backStartedAt - visibleAt, selectedAfterBack: 'trigger' };
      });
      await check(`${prefix}: direct instruments hash lands on the real gallery`, async () => {
        await page.goto(`${BASE}/#instruments`, { waitUntil: 'domcontentloaded' }); await ready(page);
        await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(height * .5); await expect(page.locator('#instruments')).toBeFocused();
        expect((await layout(page)).scrollWidth).toBeLessThanOrEqual(width + 1); await screenshot(page, `${prefix}-direct-gallery`);
      });
      if (width === 1440 && !reduced) await check(`${prefix}: Back cancels an in-progress same-document departure`, async () => {
        await page.goto(`${BASE}/#home`, { waitUntil: 'domcontentloaded' }); await ready(page); await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(3);
        await gallery(page); await choose(page, 'envoy');
        const canvas = await page.locator('.orbital-scene canvas').elementHandle();
        const anchor = page.locator('#instrument-stage a[href="/app/?tab=envoy"]'); await anchor.focus(); await page.waitForLoadState('networkidle');
        const startedAt = Date.now(); await anchor.click(); await expect(page.locator('.orbital-scene__canvas')).toHaveAttribute('data-flight-phase', 'launching');
        await page.goBack(); await expect(page).toHaveURL(/\/#home$/); await expect(page.locator('html')).not.toHaveClass(/is-launching/);
        await expect(page.locator('.orbital-scene__canvas')).toHaveAttribute('data-flight-phase', 'landing');
        expect(await page.locator('.orbital-home--gallery').evaluate(e => e.inert)).toBe(false);
        expect(await page.locator('.orbital-nav').evaluate(e => e.inert)).toBe(false);
        expect(await canvas.evaluate(e => e.isConnected && e === document.querySelector('.orbital-scene canvas'))).toBe(true); await canvas.dispose();
        await page.waitForTimeout(Math.max(0, 11000 - (Date.now() - startedAt)));
        await expect(page).toHaveURL(/\/#home$/); await expect(page.locator('.orbital-scene__canvas')).toHaveAttribute('data-flight-phase', 'landing');
        const saved = await page.evaluate(() => ({ marker: sessionStorage.getItem('agyion:arrival'), frame: sessionStorage.getItem('agyion:flight-frame') }));
        expect(saved).toEqual({ marker: null, frame: null }); await screenshot(page, `${prefix}-cancelled-flight`);
        return { waitedMs: Date.now() - startedAt, retainedCanvas: true, clearedHandoff: saved, nextCheck: 'A fresh explicit departure must still complete.' };
      });
      if (reduced || [1440, 390].includes(width)) await check(`${prefix}: scrolled application departure preserves viewport geometry and target`, async () => {
        await choose(page, 'envoy'); const anchor = page.locator('#instrument-stage a[href="/app/?tab=envoy"]'); await anchor.focus(); await page.waitForLoadState('networkidle');
        const before = { scrollY: await page.evaluate(() => scrollY), canvas: await page.locator('.orbital-scene canvas').boundingBox() };
        expect(before.scrollY).toBeGreaterThan(height * .5);
        const original = await page.locator('.orbital-scene canvas').elementHandle();
        await page.route('**/app/?tab=envoy', route => route.fulfill({ contentType: 'text/html', body: '<title>Gallery flight fixture</title><main>Envoy arrival</main>' }));
        await page.evaluate(() => { window.__galleryProbe.launchFrames = []; });
        const started = Date.now(); await anchor.click(); let launchFrames = [];
        if (!reduced) {
          await expect(page.locator('.orbital-scene__canvas')).toHaveAttribute('data-flight-phase', 'launching');
          expect(await original.evaluate(e => e.isConnected && e === document.querySelector('.orbital-scene canvas'))).toBe(true);
          await expect.poll(() => page.evaluate(() => window.__galleryProbe.launchFrames.length)).toBeGreaterThan(2);
          launchFrames = await page.evaluate(() => window.__galleryProbe.launchFrames);
          for (const frame of launchFrames) {
            expect(Math.abs(frame.x)).toBeLessThan(1); expect(Math.abs(frame.y)).toBeLessThan(1); expect(Math.abs(frame.width - width)).toBeLessThan(1); expect(Math.abs(frame.height - height)).toBeLessThan(1);
            expect(Math.abs(frame.bufferWidth / frame.bufferHeight - width / height)).toBeLessThan(.01);
          }
          await screenshot(page, `${prefix}-gallery-departure`);
        }
        await page.waitForURL('**/app/?tab=envoy', { timeout: reduced ? 4000 : 16000 }); await expect(page).toHaveTitle('Gallery flight fixture');
        const elapsedMs = Date.now() - started; if (!reduced) expect(elapsedMs).toBeGreaterThan(9500);
        const arrival = await page.evaluate(() => ({ marker: JSON.parse(sessionStorage.getItem('agyion:arrival') || 'null'), frame: JSON.parse(sessionStorage.getItem('agyion:flight-frame') || 'null') }));
        if (reduced) expect(arrival.marker).toBeNull(); else { expect(arrival.marker.settled).toBe(true); expect(arrival.frame.id).toBe(arrival.marker.id); }
        await original.dispose(); return { before, launchFrames, elapsedMs, settled: arrival.marker?.settled ?? false };
      });
    } catch (error) {
      if (!report.failures.some(f => f.width === width && f.motion === motion && f.message === error.message)) report.failures.push({ ...active, message: error.message, stack: error.stack });
      console.log(`FAIL ${prefix}: ${error.message}`); await screenshot(page, `${prefix}-failure`, true).catch(() => {}); persist();
    } finally {
      await page.waitForLoadState('networkidle').catch(error => report.failures.push({ ...active, message: `Unsettled teardown: ${error.message}` })); await context.close();
    }
  }
  for (const key of ['pageErrors', 'consoleErrors', 'requestFailures', 'httpErrors', 'csp']) if (report[key].length) report.failures.push({ type: key, count: report[key].length, message: 'Strict unfiltered diagnostics failed' });
  report.status = report.failures.length ? 'failed' : 'passed';
} catch (error) { report.status = 'failed'; report.failures.push({ ...active, message: error.message, stack: error.stack }); }
finally { await browser.close(); report.finishedAt = new Date().toISOString(); report.sourcesAtEnd = hashes(); persist(); }
console.log(JSON.stringify({ status: report.status, passed: report.checks.filter(c => c.status === 'passed').length, checks: report.checks.length, failures: report.failures.length, output: OUTPUT }));
if (report.status !== 'passed') process.exitCode = 1;
