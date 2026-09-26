/** Product-page regression harness, 2026-09-26. Uses its own browser, never the user's IAB. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { chromium, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4192';
const OUTPUT = path.resolve(process.env.QA_OUTPUT_DIR || 'artifacts/verification/product-pages/2026-09-26');
const PRODUCTS = { fade: 'Fade', pod: 'Pod', trigger: 'Trigger', envoy: 'Envoy', ramp: 'Ramp', ledger: 'Ledger' };
const routes = (process.env.QA_ROUTES || Object.keys(PRODUCTS).join(',')).split(',').map(value => value.trim()).filter(Boolean);
const widths = (process.env.QA_WIDTHS || '1440,768,390,320').split(',').map(Number);
const motions = (process.env.QA_MOTIONS || 'no-preference,reduce').split(',');
if (routes.some(route => !Object.hasOwn(PRODUCTS, route)) || widths.some(width => !Number.isSafeInteger(width) || width < 280) || motions.some(mode => !['no-preference', 'reduce'].includes(mode))) throw new Error('Invalid QA_ROUTES, QA_WIDTHS or QA_MOTIONS.');
const executablePath = [process.env.CHROMIUM_PATH, '/opt/google/chrome/chrome', chromium.executablePath(), '/usr/bin/chromium'].filter(Boolean).find(candidate => fs.existsSync(candidate));
if (!executablePath) throw new Error('Set CHROMIUM_PATH to an installed Chromium browser.');
fs.mkdirSync(OUTPUT, { recursive: true });
const report = {
  version: 1, startedAt: new Date().toISOString(), base: BASE, routes, widths, motions, status: 'running',
  checks: [], screenshots: [], failures: [], pageErrors: [], consoleErrors: [], requestFailures: [], httpErrors: [], csp: [],
  limits: 'Local Chromium/SwiftShader functional and saved-appearance evidence, not a native-GPU or real-phone performance claim. Product illustrations move no funds; launch destination/flight is covered separately. No request failure is suppressed. Historical detail-pages-check.mjs is retained unchanged.',
};
const persist = () => fs.writeFileSync(path.join(OUTPUT, 'results.json'), JSON.stringify(report, null, 2));
const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
let active;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sourceFiles = ['scripts/verify-product-pages.mjs', 'landing/src/components/DetailWorld.tsx', 'landing/src/components/InstrumentMechanism.tsx', 'landing/src/components/instrumentMechanismState.ts', 'landing/src/styles/product-pages.css', 'landing/src/styles/instrument-mechanism.css'];
report.sourcesAtStart = sourceFiles.map(file => ({ file, sha256: createHash('sha256').update(fs.readFileSync(file)).digest('hex') }));

async function check(name, action) {
  const entry = { name, status: 'running' }; report.checks.push(entry); active.phase = name;
  try { entry.evidence = await action(); entry.status = 'passed'; console.log(`PASS ${name}`); }
  catch (error) {
    entry.status = 'failed'; entry.error = { message: error.message, stack: error.stack };
    report.failures.push({ ...active, ...entry.error }); console.log(`FAIL ${name}: ${error.message}`);
    throw error;
  } finally { persist(); }
}

async function trackedPage(context) {
  const page = await context.newPage(); page.setDefaultTimeout(12000);
  const meta = () => ({ ...active, url: page.url() });
  page.on('pageerror', error => report.pageErrors.push({ ...meta(), message: error.message, stack: error.stack }));
  page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push({ ...meta(), message: message.text(), location: message.location() }); });
  page.on('requestfailed', request => report.requestFailures.push({ ...meta(), request: request.url(), method: request.method(), error: request.failure()?.errorText }));
  page.on('response', response => { if (response.status() >= 400) report.httpErrors.push({ ...meta(), request: response.url(), status: response.status() }); });
  await page.exposeBinding('__productCsp', (_source, detail) => report.csp.push({ ...meta(), ...detail }));
  await page.addInitScript(() => {
    window.__productGL = { draws: 0 };
    document.addEventListener('securitypolicyviolation', event => window.__productCsp({ directive: event.violatedDirective, blockedURI: event.blockedURI }));
    for (const prototype of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
      for (const method of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
        const original = prototype[method];
        if (original) prototype[method] = function (...args) { window.__productGL.draws++; return original.apply(this, args); };
      }
    }
  });
  return page;
}

async function capture(page, name, fullPage = false) {
  const file = path.join(OUTPUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage, timeout: 60000 });
  report.screenshots.push({ ...active, file, fullPage }); return file;
}

async function ready(page, slug) {
  await expect(page.locator(`.product-page[data-instrument="${slug}"]`)).toBeVisible();
  await expect(page.locator('.product-wordmark')).toHaveAccessibleName(PRODUCTS[slug]);
  await expect(page.locator('#mechanism svg')).toHaveCount(1);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('.product-hero__aside')).toHaveCSS('opacity', '1');
  await expect(page.locator('.product-wordmark > span').first()).toHaveCSS('opacity', '1');
}

async function navigationLink(page, name) {
  const desktop = page.getByRole('navigation', { name: 'Main navigation', exact: true });
  if (await desktop.isVisible()) return desktop.getByRole('link', { name, exact: true });
  const mobile = page.getByRole('navigation', { name: 'Mobile navigation', exact: true });
  if (!await mobile.isVisible()) await page.getByRole('button', { name: 'Open navigation menu', exact: true }).click();
  return mobile.getByRole('link', { name, exact: true });
}

async function geometry(page) {
  return page.evaluate(() => {
    const visible = element => {
      const style = getComputedStyle(element);
      return element.getClientRects().length && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0 && !element.closest('[hidden]');
    };
    const rect = element => { const box = element.getBoundingClientRect(); return { x: box.x, y: box.y + scrollY, width: box.width, height: box.height }; };
    const overflow = [], green = [];
    for (const element of document.querySelectorAll('.product-page__body *')) {
      if (!visible(element)) continue;
      const box = element.getBoundingClientRect();
      if (!(element instanceof SVGElement) && box.width && (box.left < -1 || box.right > innerWidth + 1)) overflow.push({ tag: element.tagName, class: element.className, text: element.textContent.trim().slice(0, 80), x: box.x, width: box.width });
      const style = getComputedStyle(element);
      for (const property of ['color', 'backgroundColor', 'fill', 'stroke']) {
        const numbers = style[property]?.match(/^rgba?\((\d+)[ ,]+(\d+)[ ,]+(\d+)(?:[ ,/]+([\d.]+))?\)$/);
        if (numbers) {
          const [r, g, b] = numbers.slice(1, 4).map(Number), alpha = numbers[4] === undefined ? 1 : Number(numbers[4]);
          if (alpha > .1 && g > r + 25 && g > b + 20) green.push({ tag: element.tagName, class: element.getAttribute('class'), property, value: style[property] });
        }
      }
    }
    const pairs = [['.product-wordmark', '.product-hero__aside'], ['.product-experiment', '.product-rules'], ['.product-rules', '.product-footer']];
    const overlaps = [];
    for (const [a, b] of pairs) {
      const left = document.querySelector(a), right = document.querySelector(b);
      if (!left || !right) continue;
      const l = left.getBoundingClientRect(), r = right.getBoundingClientRect();
      if (Math.min(l.right, r.right) - Math.max(l.left, r.left) > 2 && Math.min(l.bottom, r.bottom) - Math.max(l.top, r.top) > 2) overlaps.push({ a, b, left: rect(left), right: rect(right) });
    }
    const wordmark = document.querySelector('.product-wordmark');
    return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, height: innerHeight, documentHeight: document.documentElement.scrollHeight, overflow, overlaps, green, wordmark: wordmark && rect(wordmark) };
  });
}

async function svgState(page) {
  return page.locator('#mechanism svg').evaluate(svg => {
    const box = svg.getBoundingClientRect();
    const shapes = [...svg.querySelectorAll('g,path,circle,ellipse,rect,line,polyline,polygon')].map(element => {
      const style = getComputedStyle(element), ctm = element.getCTM(), bounds = element.getBBox();
      return { tag: element.tagName, attributes: [...element.attributes].filter(attribute => attribute.name !== 'class').map(attribute => [attribute.name, attribute.value]), transform: style.transform, opacity: style.opacity, dash: style.strokeDashoffset, bounds: [bounds.x, bounds.y, bounds.width, bounds.height], matrix: ctm && [ctm.a, ctm.b, ctm.c, ctm.d, ctm.e, ctm.f] };
    });
    return { rect: { x: box.x, y: box.y, width: box.width, height: box.height }, viewBox: svg.getAttribute('viewBox'), shapes };
  });
}

async function sampleMotion(page, reduced) {
  await page.locator('#mechanism svg').scrollIntoViewIfNeeded();
  await pause(350);
  const samples = [];
  for (let frame = 0; frame < 6; frame++) {
    const state = await svgState(page);
    samples.push({ at: Date.now(), rect: state.rect, viewBox: state.viewBox, signature: digest(state.shapes) });
    if (frame < 5) await pause(140);
  }
  const first = samples[0];
  for (const sample of samples) {
    expect(sample.viewBox).toBe(first.viewBox);
    for (const key of ['x', 'y', 'width', 'height']) expect(Math.abs(sample.rect[key] - first.rect[key]), `Stable SVG ${key} while internal parts move`).toBeLessThan(.8);
  }
  const unique = new Set(samples.map(sample => sample.signature)).size;
  if (reduced) expect(unique, 'Reduced motion keeps ambient mechanism geometry stationary').toBe(1);
  else expect(unique, 'Continuous animation changes actual SVG geometry over multiple frames').toBeGreaterThanOrEqual(4);
  return { unique, samples };
}

async function mechanismPath(page, slug, prefix, reduced) {
  const root = page.locator(`.instrument-mechanism[data-mechanism="${slug}"]`);
  const svg = root.locator('.im-stage svg'), original = await svg.elementHandle();
  const results = [];
  const button = action => root.locator(`[data-action="${action}"]`);
  const reset = async () => {
    await button('reset').click();
    await expect(root).toHaveAttribute('data-outcome', 'ready');
    await expect(root).toHaveAttribute('data-running', 'false');
    await expect(root.locator('.im-result__title')).toHaveText('Your move.');
  };
  const run = async (action, outcome, sample = false) => {
    const startedAt = Date.now();
    await button(action).focus(); await page.keyboard.press('Enter');
    if (!reduced) {
      await expect(root).toHaveAttribute('data-running', 'true');
      await svg.scrollIntoViewIfNeeded();
    }
    let motion;
    if (sample) {
      if (reduced) await expect(root).toHaveAttribute('data-outcome', outcome);
      motion = await sampleMotion(page, reduced);
      if (!reduced) await expect(root).toHaveAttribute('data-running', 'true');
      await capture(page, `${prefix}-${outcome}-midway`);
    }
    await expect(root).toHaveAttribute('data-outcome', outcome, { timeout: 12000 });
    await expect(root).toHaveAttribute('data-running', 'false');
    await expect(root.locator('.im-result__title')).not.toHaveText('Following the mechanism…');
    if (/pod-time|pod-signature|trigger-invalid|envoy-(ungranted|revoked|expired|limit|positive)|ledger-mismatch/.test(outcome)) {
      expect(Number(await root.locator('[data-motion="deny"]').evaluate(element => getComputedStyle(element).opacity))).toBeGreaterThan(.9);
    }
    results.push({ action, outcome, elapsedMs: Date.now() - startedAt, motion, result: await root.locator('.im-result__copy').innerText() });
    return outcome;
  };
  await expect(root).toHaveAttribute('data-outcome', 'ready');
  await expect(root.locator('svg')).toHaveAttribute('viewBox', '0 0 1000 520');
  if (slug === 'fade') {
    await run('claim', 'fade-pays', true);
    const range = root.getByRole('slider', { name: 'Elapsed time', exact: true });
    await range.focus(); await page.keyboard.press('Home');
    await expect(range).toHaveValue('0');
    const pricePoint = () => root.locator('[data-motion="price-dot"]').evaluate(dot => {
      const svg = dot.ownerSVGElement, point = svg.createSVGPoint(); point.x = dot.cx.baseVal.value; point.y = dot.cy.baseVal.value;
      const transformed = point.matrixTransform(svg.getScreenCTM().inverse().multiply(dot.getScreenCTM()));
      return { x: transformed.x, y: transformed.y };
    });
    await expect.poll(async () => { const point = await pricePoint(); return Math.max(Math.abs(point.x - 120), Math.abs(point.y - 130)); }, { message: 'A changed slider positions the marker before running another claim' }).toBeLessThan(.01);
    await run('claim', 'fade-costs');
    if (reduced) {
      await range.focus(); for (let i = 0; i < 67; i++) await page.keyboard.press('ArrowRight');
      await run('claim', 'fade-zero');
    }
    await reset();
    await expect.poll(async () => { const point = await pricePoint(); return Math.max(Math.abs(point.x - 549), Math.abs(point.y - 280)); }, { message: 'Reset restores the selected75 marker without stale GSAP cleanup coordinates' }).toBeLessThan(.01);
  } else if (slug === 'pod') {
    await run('open', 'pod-time', true);
    await root.getByRole('checkbox', { name: 'Unlock ledger reached', exact: true }).check();
    if (reduced) await run('open', 'pod-signature');
    await root.getByRole('checkbox', { name: 'Recipient signature valid', exact: true }).check();
    const before = await root.locator('[data-motion="door-left"]').evaluate(element => element.getCTM().e);
    await run('open', 'pod-open');
    const after = await root.locator('[data-motion="door-left"]').evaluate(element => element.getCTM().e);
    expect(Math.abs(after - before), 'Authorized Pod opens the physical shell').toBeGreaterThan(10);
  } else if (slug === 'trigger') {
    await run('submit', 'trigger-payout', true);
    await root.getByRole('combobox', { name: 'Evidence to submit', exact: true }).selectOption('invalid');
    await run('submit', 'trigger-invalid');
    if (reduced) {
      await root.getByRole('combobox', { name: 'Evidence to submit', exact: true }).selectOption('expired');
      await expect(button('submit')).toHaveAccessibleName('Claim refund');
      await run('submit', 'trigger-refund');
    }
  } else if (slug === 'envoy') {
    await run('request', 'envoy-ungranted', true);
    await run('grant', 'envoy-grant');
    const count = root.getByRole('slider', { name: 'Claims already used', exact: true });
    if (reduced) {
      await count.focus(); await page.keyboard.press('End'); await expect(count).toHaveValue('50');
      await run('request', 'envoy-limit');
      await count.focus(); await page.keyboard.press('Home');
      await root.getByRole('checkbox', { name: 'Past expiry', exact: true }).check();
      await run('request', 'envoy-expired');
      await root.getByRole('checkbox', { name: 'Past expiry', exact: true }).uncheck();
      await root.getByRole('checkbox', { name: 'Positive price', exact: true }).check();
      await run('request', 'envoy-positive');
      await root.getByRole('checkbox', { name: 'Positive price', exact: true }).uncheck();
    }
    await run('request', 'envoy-owner'); await expect(count).toHaveValue('1');
    await run('replay', 'envoy-owner'); await expect(count).toHaveValue('1');
    await run('revoke', 'envoy-revoke');
    await run('request', 'envoy-revoked'); await expect(count).toHaveValue('1');
    if (reduced) {
      await expect(button('grant')).toHaveAccessibleName('Grant a new mandate');
      await run('grant', 'envoy-grant'); await expect(count).toHaveValue('0');
    }
  } else if (slug === 'ramp') {
    await run('bridge', 'ramp-mock', true);
    const deposit = await root.locator('.im-result__copy').innerText();
    await root.getByRole('combobox', { name: 'Route direction', exact: true }).selectOption('out');
    await run('bridge', 'ramp-mock');
    expect(await root.locator('.im-result__copy').innerText()).not.toBe(deposit);
    await expect(root.locator('.im-result__detail')).toContainText('No bank transfer');
  } else {
    await run('bundle', 'ledger-reference', true);
    await expect(root.locator('.im-result__detail')).toContainText('unsigned');
    await root.getByRole('checkbox', { name: 'Alter the exported content', exact: true }).check();
    await run('bundle', 'ledger-mismatch');
  }
  await capture(page, `${prefix}-outcome`);
  await reset();
  if (slug === 'pod') for (const box of await root.getByRole('checkbox').all()) await expect(box).not.toBeChecked();
  if (slug === 'envoy') await expect(root.getByRole('slider', { name: 'Claims already used' })).toHaveValue('0');
  if (!reduced) {
    const action = { fade: 'claim', pod: 'open', trigger: 'submit', envoy: 'request', ramp: 'bridge', ledger: 'bundle' }[slug];
    await button(action).click(); await expect(root).toHaveAttribute('data-running', 'true');
    await svg.scrollIntoViewIfNeeded();
    await pause(200); await reset(); await pause(400);
    await expect(root).toHaveAttribute('data-outcome', 'ready');
  }
  expect(await original.evaluate(element => element.isConnected && element === document.querySelector('#mechanism svg')), 'Actions and reset retain one SVG scene instead of remounting frames').toBe(true);
  await original.dispose();
  return { results, reset: true, sameSvg: true, cancelledMidway: !reduced };
}

try {
  for (const width of widths) for (const motion of motions) {
    const height = width >= 768 ? 1000 : width === 390 ? 844 : 800;
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: motion, isMobile: width < 768, hasTouch: width < 768 });
    const page = await trackedPage(context);
    try {
      for (const slug of routes) {
        active = { width, motion, route: `/${slug}`, phase: 'load' };
        const prefix = `${slug}-${width}-${motion === 'reduce' ? 'reduced' : 'motion'}`;
        try {
          await page.goto(`${BASE}/${slug}`, { waitUntil: 'domcontentloaded' });
          await ready(page, slug);
          await check(`${prefix}: hierarchy, explicit app target, opaque surface and idle flight renderer`, async () => {
            await expect(page.locator('.product-launch')).toHaveAttribute('href', `/app/?tab=${slug}`);
            await expect(page.locator('.product-hero__strip a')).toHaveAttribute('href', '/instruments');
            await expect(page.locator('.orbital-scene')).toBeHidden();
            await expect(page.locator('.orbital-scene canvas')).toHaveCount(0);
            await expect(page.getByRole('button', { name: /pause.*motion|resume.*motion/i })).toHaveCount(0);
            await expect(page.locator('.product-limits')).not.toHaveAttribute('open', '');
            expect(await page.evaluate(() => window.__productGL.draws), 'No background WebGL work before launch intent').toBe(0);
            await page.locator('.product-launch').focus();
            if (motion === 'reduce') await expect(page.locator('.orbital-scene canvas')).toHaveCount(0);
            else {
              try { await expect(page.locator('.orbital-scene')).toHaveClass(/is-ready/, { timeout: 15000 }); }
              catch (error) {
                report.failures.push({ ...active, message: 'Focused CTA warm-up diagnostic', detail: await page.evaluate(() => ({ canvas: document.querySelectorAll('.orbital-scene canvas').length, phase: document.querySelector('.orbital-scene__canvas')?.getAttribute('data-flight-phase'), draws: window.__productGL.draws, focused: document.activeElement?.outerHTML, resources: performance.getEntriesByType('resource').filter(entry => /space-scene|three|scene-compositor|black-hole/.test(entry.name)).map(entry => ({ url: entry.name, duration: entry.duration, transferSize: entry.transferSize })) })) });
                throw error;
              }
              await expect(page.locator('.orbital-scene canvas')).toHaveCount(1);
              await expect(page.locator('.orbital-scene canvas')).not.toHaveAttribute('tabindex', '0');
            }
            await expect(page.locator('.orbital-scene')).toBeHidden();
            // Intent starts real prefetch requests. Let them finish before this
            // harness navigates away; retain any genuine failed requests.
            await page.waitForLoadState('networkidle');
            await pause(150);
            const before = await page.evaluate(() => window.__productGL.draws);
            await pause(350);
            const after = await page.evaluate(() => window.__productGL.draws);
            expect(after, 'A hidden blackhole renderer must not keep drawing behind the product').toBe(before);
            const layout = await geometry(page);
            const assets = await page.evaluate(() => [...document.querySelectorAll('script[src],link[rel="stylesheet"]')].map(element => element.getAttribute('src') || element.getAttribute('href')));
            expect(layout.scrollWidth).toBeLessThanOrEqual(width + 1);
            expect(layout.overflow).toEqual([]); expect(layout.overlaps).toEqual([]); expect(layout.green).toEqual([]);
            await capture(page, `${prefix}-hero`);
            return { layout, assets, draws: { before, after } };
          });
          if (slug === 'fade' && motion === 'no-preference' && [1440, 390].includes(width)) await check(`${prefix}: motion preference discards stale renderer readiness and new intent prepares one fresh scene`, async () => {
            const oldCanvas = await page.locator('.orbital-scene canvas').elementHandle();
            await page.locator('.product-hero__explore').focus();
            await expect(page.locator('.product-hero__explore')).toBeFocused();
            await page.emulateMedia({ reducedMotion: 'reduce' });
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            await expect(page.locator('.orbital-scene canvas')).toHaveCount(0);
            await expect(page.locator('.orbital-scene')).not.toHaveClass(/is-ready/);
            expect(await oldCanvas.evaluate(element => element.isConnected)).toBe(false);
            await page.emulateMedia({ reducedMotion: 'no-preference' });
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            await expect(page.locator('.orbital-scene canvas')).toHaveCount(0);
            await expect(page.locator('.orbital-scene')).not.toHaveClass(/is-ready/);
            await page.locator('.product-hero__explore').focus();
            await expect(page.locator('.product-hero__explore')).toBeFocused();
            await page.locator('.product-launch').focus();
            await expect(page.locator('.product-launch')).toBeFocused();
            await expect(page.locator('.orbital-scene')).toHaveClass(/is-ready/, { timeout: 15000 });
            await expect(page.locator('.orbital-scene canvas')).toHaveCount(1);
            await expect(page.locator('.orbital-scene')).toBeHidden();
            await pause(200);
            const before = await page.evaluate(() => window.__productGL.draws);
            await pause(350);
            const after = await page.evaluate(() => window.__productGL.draws);
            expect(after).toBe(before);
            await oldCanvas.dispose();
            return { oldCanvasDisconnected: true, zeroCanvasWithoutNewIntent: true, pausedDraws: { before, after } };
          });
          await check(`${prefix}: native mechanism anchor and initially honest state`, async () => {
            await page.locator('.product-hero__explore').focus(); await page.keyboard.press('Enter');
            await expect(page).toHaveURL(new RegExp(`/${slug}#mechanism$`));
            await expect(page.locator('#mechanism')).toBeFocused();
            await expect.poll(() => page.locator('#mechanism').evaluate(element => Math.abs(element.getBoundingClientRect().top - parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop))), { message: 'The mechanism anchor settles just below fixed navigation, without applying header spacing twice' }).toBeLessThan(2);
            await expect(page.locator('.instrument-mechanism')).toHaveAttribute('data-outcome', 'ready');
            const state = await svgState(page);
            await capture(page, `${prefix}-mechanism`);
            return { rect: state.rect, viewBox: state.viewBox };
          });
          await check(`${prefix}: continuous state paths, conditions, branches and reset`, () => mechanismPath(page, slug, prefix, motion === 'reduce'));
          await check(`${prefix}: conditions, focus, layout and product navigation`, async () => {
            const summary = page.locator('.product-limits summary');
            await summary.focus(); await page.keyboard.press('Enter');
            await expect(page.locator('.product-limits')).toHaveAttribute('open', '');
            await expect(page.locator('.product-limits li').first()).toBeVisible();
            const layout = await geometry(page);
            expect(layout.scrollWidth).toBeLessThanOrEqual(width + 1);
            expect(layout.overflow).toEqual([]); expect(layout.overlaps).toEqual([]); expect(layout.green).toEqual([]);
            await page.keyboard.press('Enter');
            await expect(page.locator('.product-limits')).not.toHaveAttribute('open', '');
            await page.locator('.product-launch').focus();
            await expect(page.locator('.product-launch')).toBeFocused();
            expect(await page.locator('.product-launch').evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe('none');
            await page.waitForLoadState('networkidle');
            await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo({ top: 0, behavior: 'instant' }); });
            await capture(page, `${prefix}-full`, true);
            const next = Object.keys(PRODUCTS)[(Object.keys(PRODUCTS).indexOf(slug) + 1) % 6];
            await page.getByRole('link', { name: `Explore ${PRODUCTS[next]}`, exact: true }).click();
            await expect(page).toHaveURL(new RegExp(`/${next}$`)); await ready(page, next);
            await page.goBack(); await ready(page, slug);
            await (await navigationLink(page, 'Instruments')).click();
            await expect(page).toHaveURL(/\/instruments$/);
            await expect(page.locator('.directory-item')).toHaveCount(6);
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            for (const id of Object.keys(PRODUCTS)) await expect(page.locator(`.directory-item[href="/${id}"]`)).toBeVisible();
            await page.locator(`.directory-item[href="/${slug}"]`).focus();
            await expect(page.locator(`.directory-item[href="/${slug}"]`)).toBeFocused();
            await page.keyboard.press('Enter');
            await ready(page, slug);
            return layout;
          });
        } catch (error) {
          if (!report.failures.some(failure => failure.width === width && failure.motion === motion && failure.route === `/${slug}` && failure.message === error.message)) report.failures.push({ ...active, message: error.message, stack: error.stack });
          console.log(`CASE FAILED ${prefix}: ${error.message}`); persist();
          await capture(page, `${prefix}-failure`, true).catch(error => report.failures.push({ ...active, message: `Failure screenshot: ${error.message}` }));
        }
      }
    } finally {
      await page.waitForLoadState('networkidle').catch(error => report.failures.push({ ...active, message: `Requests did not settle before context teardown: ${error.message}` }));
      await context.close();
    }
  }
  for (const key of ['pageErrors', 'consoleErrors', 'requestFailures', 'httpErrors', 'csp']) if (report[key].length) report.failures.push({ type: key, count: report[key].length, message: 'Strict, unfiltered browser error gate failed.' });
  report.status = report.failures.length ? 'failed' : 'passed';
} catch (error) {
  report.status = 'failed'; report.failures.push({ ...active, message: error.message, stack: error.stack });
} finally {
  await browser.close(); report.finishedAt = new Date().toISOString();
  report.sourcesAtEnd = sourceFiles.map(file => ({ file, sha256: createHash('sha256').update(fs.readFileSync(file)).digest('hex') }));
  persist();
  fs.writeFileSync(path.join(OUTPUT, 'README.md'), `# Product page browser evidence — 2026-09-26\n\nRun: ${report.startedAt} → ${report.finishedAt}\n\nStatus: **${report.status}**. ${report.checks.filter(check => check.status === 'passed').length}/${report.checks.length} assertions groups passed; ${report.failures.length} recorded failures.\n\nWidths: ${widths.join(', ')}. Motion modes: ${motions.join(', ')}. Routes: ${routes.join(', ')}.\n\n[Full machine-readable results](./results.json) retain source hashes, timing samples, screenshots and all page/console/network/HTTP/CSP errors. Screenshots require independent visual inspection; passing checks are not a design approval.\n\n${report.limits}\n`);
}
console.log(JSON.stringify({ status: report.status, checks: report.checks.length, failures: report.failures.length, output: OUTPUT }));
if (report.status !== 'passed') process.exitCode = 1;
