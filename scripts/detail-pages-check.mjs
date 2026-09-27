import { waitForFonts, waitForFrames } from './lib/browser-settle.mjs';
/** Interactive detail-route QA. Run only with the shared browser/GPU lease. */
import fs from 'node:fs';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4192';
const OUTPUT = path.resolve(process.env.QA_OUTPUT_DIR || 'artifacts/verification/detail-world-pages');
const STOP_ON_FAILURE = process.env.DETAIL_FAIL_FAST !== '0';
const ROUTES = {
  fade: { title: 'Fade', tabs: ['Set', 'Claim', 'Settle'] },
  pod: { title: 'Pod', tabs: ['Locked', 'Ready', 'Opened'] },
  trigger: { title: 'Trigger', tabs: ['Define', 'Sign', 'Execute'] },
  envoy: { title: 'Envoy', tabs: ['Authorize', 'Claim', 'Revoke'] },
  ramp: { title: 'Ramp', tabs: ['Connect', 'Quote', 'Request'] },
  ledger: { title: 'Ledger', tabs: ['Review', 'Export', 'Verify'] },
};
const requestedRoutes = process.env.QA_ROUTES?.trim();
const selectedRoutes = requestedRoutes
  ? [...new Set(requestedRoutes.split(/[,\s]+/).map(route => route.replace(/^\/|\/$/g, '')))]
  : Object.keys(ROUTES);
for (const route of selectedRoutes) {
  if (!Object.hasOwn(ROUTES, route)) throw new Error(`Unknown QA_ROUTES entry: ${route}. Choose ${Object.keys(ROUTES).join(', ')}.`);
}
const candidates = [process.env.CHROMIUM_PATH, '/opt/google/chrome/chrome', chromium.executablePath(), '/usr/bin/chromium'].filter(Boolean);
const executablePath = candidates.find(candidate => fs.existsSync(candidate));
if (!executablePath) throw new Error('Chromium is required; set CHROMIUM_PATH.');
fs.mkdirSync(OUTPUT, { recursive: true });
const report = {
  at: new Date().toISOString(), base: BASE, routes: selectedRoutes, status: 'running', checks: [], failures: [], screenshots: [],
  pageErrors: [], consoleErrors: [], requestFailures: [], httpErrors: [], csp: [],
  note: 'Reduced motion isolates deliberate condition changes. Scene comparisons hide HTML; supporting diagram comparisons exclude captions. No wallet, transaction, fabricated record or simulated success is submitted. Counts and pixels do not establish aesthetic acceptance or a frame rate.',
};
const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });

async function pixelDifference(page, before, after) {
  return page.evaluate(async ([a64, b64]) => {
    const decode = async data => {
      const image = new Image(); image.src = `data:image/png;base64,${data}`; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
      return { width: canvas.width, height: canvas.height, pixels: context.getImageData(0, 0, canvas.width, canvas.height).data };
    };
    const [a, b] = await Promise.all([decode(a64), decode(b64)]);
    if (a.width !== b.width || a.height !== b.height) throw new Error('Stage rasters changed dimensions.');
    let changed = 0;
    for (let i = 0; i < a.pixels.length; i += 4) {
      if (Math.abs(a.pixels[i] - b.pixels[i]) + Math.abs(a.pixels[i + 1] - b.pixels[i + 1]) + Math.abs(a.pixels[i + 2] - b.pixels[i + 2]) > 18) changed++;
    }
    const pixels = a.width * a.height;
    return { width: a.width, height: a.height, changed, pixels, fraction: changed / pixels };
  }, [before.toString('base64'), after.toString('base64')]);
}

const paint = page => waitForFrames(page);
const ready = async page => {
  await expect(page.locator('.detail-world')).toBeVisible();
  await expect(page.locator('.orbital-scene')).toHaveClass(/is-ready/, { timeout: 60000 });
  await expect(page.locator('.orbital-scene__canvas canvas')).toHaveCount(1);
  await expect(page.locator('.orbital-scene__canvas canvas')).toBeVisible();
  await waitForFonts(page);
  await expect(page.locator('#main')).toHaveCSS('opacity', '1');
};
async function raster(page, core) {
  await page.mouse.move(1, 1);
  await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
  await paint(page);
  if (!core) return page.locator('.detail-world__visual svg').screenshot();
  return page.screenshot({
    clip: { x: 0, y: 0, ...page.viewportSize() },
    style: 'body *, body *::before, body *::after { visibility:hidden !important; transition:none !important; animation:none !important } .orbital-scene__canvas canvas { visibility:visible !important; outline:none !important }',
  });
}
async function layout(page) {
  return page.evaluate(() => {
    const missing = [];
    for (const element of document.querySelectorAll('.detail-world h1, .detail-world__promise, .detail-conditions__tabs button, .detail-conditions__sentence:not([hidden]), .detail-world__launch, .detail-world__caveat, .detail-world__limits summary, .detail-world__footer a')) {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (box.width <= 0 || box.height <= 0 || style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0 || box.left < -1 || box.right > innerWidth + 1) missing.push(element.textContent.trim());
    }
    const count = element => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const text = [];
      let node;
      while ((node = walker.nextNode())) {
        if (!node.textContent.trim()) continue;
        const parent = node.parentElement;
        if (!parent || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(parent.tagName)) continue;
        if (parent.closest('[hidden]')) continue;
        const closed = parent.closest('details:not([open])');
        if (closed && !closed.querySelector(':scope > summary')?.contains(parent)) continue;
        if (getComputedStyle(parent).visibility === 'hidden') continue;
        const range = document.createRange(); range.selectNodeContents(node);
        if (Array.from(range.getClientRects()).some(box => box.width > 0 && box.height > 0)) text.push(node.textContent.trim());
      }
      return text.join(' ').split(/\s+/).filter(Boolean).length;
    };
    const scene = document.querySelector('.orbital-scene__canvas canvas').getBoundingClientRect();
    return {
      overflow: document.documentElement.scrollWidth > innerWidth + 1, missing,
      visibleWords: count(document.body), detailWords: count(document.querySelector('.detail-world')),
      documentHeight: document.documentElement.scrollHeight, viewport: { width: innerWidth, height: innerHeight },
      canvas: { x: scene.x, y: scene.y, width: scene.width, height: scene.height },
    };
  });
}

try {
  widths: for (const width of [1440, 390, 360]) {
    const viewport = { width, height: width === 1440 ? 1000 : width === 390 ? 844 : 800 };
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: 'reduce', isMobile: width < 700, hasTouch: width < 700 });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    const meta = () => ({ width, url: page.url(), at: Date.now() });
    page.on('pageerror', error => report.pageErrors.push({ ...meta(), message: error.message }));
    page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push({ ...meta(), message: message.text(), location: message.location() }); });
    page.on('requestfailed', request => report.requestFailures.push({ ...meta(), request: request.url(), error: request.failure()?.errorText }));
    page.on('response', response => { if (response.status() >= 400) report.httpErrors.push({ ...meta(), request: response.url(), status: response.status() }); });
    await page.exposeBinding('__detailCsp', (_source, entry) => report.csp.push({ ...meta(), ...entry }));
    await page.addInitScript(() => document.addEventListener('securitypolicyviolation', event => {
      void window.__detailCsp({ directive: event.violatedDirective, blockedURI: event.blockedURI });
    }));
    const shot = async (slug, suffix, fullPage = false) => {
      const file = path.join(OUTPUT, `${slug}-${width}-${suffix}.png`);
      await page.screenshot({ path: file, fullPage, timeout: 60000 });
      report.screenshots.push({ route: `/${slug}`, width, suffix, file, url: page.url() });
    };
    try {
      for (const slug of selectedRoutes) {
        const data = ROUTES[slug];
        const check = { route: `/${slug}`, width, status: 'running', stages: [], screenshots: [] };
        report.checks.push(check);
        try {
          await page.goto(`${BASE}/${slug}`, { waitUntil: 'domcontentloaded' });
          await ready(page);
          const world = page.locator('.detail-world');
          const core = !['ramp', 'ledger'].includes(slug);
          await expect(world).toHaveAttribute('data-instrument', slug);
          await expect(page.getByRole('heading', { level: 1 })).toHaveText(data.title);
          await expect(page.locator('.detail-world__back')).toHaveAttribute('href', '/#instruments');
          const launch = page.locator('.detail-world__launch');
          await expect(launch).toHaveAttribute('href', `/app/?tab=${slug}`);
          await expect(launch).toHaveAccessibleName(slug === 'pod' ? 'Launch Pod app' : `Open ${data.title}`);
          const tabs = page.getByRole('tablist', { name: `${data.title} conditions`, exact: true });
          if (slug !== 'pod') { await expect(tabs.getByRole('tab')).toHaveCount(3); await expect(page.getByRole('tabpanel')).toHaveCount(1); }
          const limits = page.locator('.detail-world__limits');
          await expect(limits).not.toHaveAttribute('open', '');
          await expect(page.locator('.detail-world__visual')).toHaveCount(core ? 0 : 1);
          const related = page.getByRole('navigation', { name: 'Explore instruments', exact: true });
          await expect(related.getByRole('link')).toHaveCount(6);
          await expect(related.locator('[aria-current="page"]')).toHaveText(new RegExp(`^${data.title}`));
          await expect(page.locator('canvas')).toHaveCount(1);
          await expect(page.locator('vite-error-overlay')).toHaveCount(0);
          if (slug !== 'pod') await expect(tabs.getByRole('tab', { name: data.tabs[0], exact: true })).toHaveAttribute('aria-selected', 'true');
          await page.waitForTimeout(300);
          await expect(world).toHaveAttribute('data-step', '0');
          let previous;
          for (const [index, name] of data.tabs.entries()) {
            let sentence;
            if (slug === 'pod') {
              const trial = page.getByRole('region', { name: 'Pod interactive example' });
              if (index === 1) { const conditions = trial.getByRole('checkbox'); for (let i=0;i<3;i++) await conditions.nth(i).check(); }
              if (index === 2) await trial.getByRole('button', { name: 'Open capsule', exact: true }).click();
              await expect(world).toHaveAttribute('data-step', String(index));
              sentence = await trial.getByRole('status').innerText();
            } else {
            await tabs.getByRole('tab', { name, exact: true }).click();
            await expect(world).toHaveAttribute('data-step', String(index));
            await expect(tabs.getByRole('tab', { name, exact: true })).toHaveAttribute('aria-selected', 'true');
            await expect(page.getByRole('tabpanel')).toHaveCount(1);
            const panel = page.getByRole('tabpanel', { name, exact: true });
            await expect(panel).toBeVisible();
            sentence = (await panel.innerText()).trim();
            expect(sentence.length).toBeGreaterThan(15);
            expect((sentence.match(/[.!?](?:\s|$)/g) || []).length, 'One condition sentence is visible at a time').toBeLessThanOrEqual(1);
            }
            const current = await raster(page, core);
            const file = path.join(OUTPUT, `${slug}-${width}-stage-${index}-${core ? 'scene' : 'diagram'}.png`);
            fs.writeFileSync(file, current);
            const difference = previous ? await pixelDifference(page, previous, current) : null;
            if (difference) expect(difference.fraction, `${slug} stage ${index}: ${core ? 'physical model' : 'diagram geometry'} must change without HTML copy manufacturing the difference`).toBeGreaterThan(.0002);
            check.stages.push({ index, name, sentence, file, difference });
            previous = current;
          }
          if (slug !== 'pod') {
          await tabs.getByRole('tab', { name: data.tabs[2], exact: true }).focus();
          await page.keyboard.press('Home');
          await expect(tabs.getByRole('tab', { name: data.tabs[0], exact: true })).toBeFocused();
          await page.keyboard.press('End');
          await expect(tabs.getByRole('tab', { name: data.tabs[2], exact: true })).toBeFocused();
          await page.keyboard.press('ArrowRight');
          await expect(tabs.getByRole('tab', { name: data.tabs[0], exact: true })).toBeFocused();
          await expect(world).toHaveAttribute('data-step', '0');
          } else { await page.getByRole('button', { name: 'Reset example', exact: true }).click(); }
          const summary = limits.locator('summary');
          await summary.focus(); await page.keyboard.press('Enter');
          await expect(limits).toHaveAttribute('open', '');
          await expect(limits.locator('li').first()).toBeVisible();
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
          await page.keyboard.press('Enter');
          await expect(limits).not.toHaveAttribute('open', '');
          await launch.focus();
          await expect(launch).toBeFocused();
          expect(await launch.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe('none');
          if (width < 700) {
            const toggle = page.getByRole('button', { name: 'Open navigation menu', exact: true });
            await toggle.click();
            await expect(page.getByRole('navigation', { name: 'Mobile navigation', exact: true })).toBeVisible();
            await page.keyboard.press('Escape');
            await expect(toggle).toBeFocused();
            await expect(page.getByRole('navigation', { name: 'Mobile navigation', exact: true })).toBeHidden();
          }
          await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); });
          await page.mouse.move(1, 1); await paint(page);
          check.layout = await layout(page);
          expect(check.layout.overflow, `${slug} ${width}px horizontal overflow`).toBe(false);
          expect(check.layout.missing, `${slug} ${width}px hidden or clipped content`).toEqual([]);
          expect(check.layout.canvas).toEqual({ x: 0, y: 0, ...viewport });
          await shot(slug, 'viewport');
          await shot(slug, 'full', true);

          // Exercise real route navigation and teardown; do not click Open here,
          // because the separately recorded normal-motion journey owns that check.
          const nextSlug = Object.keys(ROUTES)[(Object.keys(ROUTES).indexOf(slug) + 1) % Object.keys(ROUTES).length];
          await related.getByRole('link', { name: ROUTES[nextSlug].title, exact: true }).click();
          await expect(page).toHaveURL(new RegExp(`/${nextSlug}$`));
          await ready(page);
          await expect(page.locator('.detail-world')).toHaveAttribute('data-instrument', nextSlug);
          await page.goBack({ waitUntil: 'domcontentloaded' });
          await ready(page);
          await expect(page.locator('.detail-world')).toHaveAttribute('data-instrument', slug);
          check.routeReturn = true;
          check.status = 'passed';
          console.log(`PASS /${slug} ${width}px: one world, manual conditions, geometry response, links, focus and overflow`);
        } catch (error) {
          check.status = 'failed';
          const failure = { route: `/${slug}`, width, message: error.message, stack: error.stack, url: page.url() };
          report.failures.push(failure);
          await shot(slug, 'failure').catch(() => {});
          console.log(`FAIL /${slug} ${width}px: ${error.message}`);
          if (STOP_ON_FAILURE) break widths;
        }
      }
    } finally { await context.close(); }
  }
  if (['pageErrors', 'consoleErrors', 'requestFailures', 'httpErrors', 'csp'].some(key => report[key].length)) report.failures.push({ name: 'strict browser error gate', message: 'Unfiltered application, console, network, HTTP or CSP errors were recorded.' });
  report.status = report.failures.length ? 'failed' : 'passed';
} finally {
  await browser.close();
  fs.writeFileSync(path.join(OUTPUT, 'checks.json'), JSON.stringify(report, null, 2));
}
console.log(JSON.stringify({ status: report.status, output: OUTPUT, checks: report.checks.length, failures: report.failures, pageErrors: report.pageErrors, consoleErrors: report.consoleErrors, requestFailures: report.requestFailures, httpErrors: report.httpErrors, csp: report.csp }));
if (report.status !== 'passed') process.exitCode = 1;
