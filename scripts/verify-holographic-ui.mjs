/** User-visible exploration and projected workspace regressions. Never signs or submits. */
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const base = process.env.APP_BASE_URL || 'http://127.0.0.1:4192';
const output = path.resolve(process.env.HOLOGRAPHIC_OUTPUT || 'artifacts/verification/holographic-ui');
const scope = process.env.HOLOGRAPHIC_SCOPE || 'all';
if (!['all', 'landing', 'app'].includes(scope)) throw new Error('HOLOGRAPHIC_SCOPE must be all, landing or app');
await mkdir(output, { recursive: true });
const report = { at: new Date().toISOString(), base, scope, status: 'running', checks: [], screenshots: [], failures: [], consoleErrors: [], pageErrors: [], requestFailures: [], csp: [], note: 'Reduced motion isolates explicit UI and camera changes from ambient movement. No transaction, wallet connection, record import or fake success is performed. Visual captures require human review; these checks do not establish a frame rate.' };
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/google/chrome/chrome', headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const names = { fade: 'Fade', pod: 'Pod', trigger: 'Trigger', envoy: 'Envoy', ramp: 'Ramp', ledger: 'Ledger' };
const now = () => Date.now();

async function pixelDifference(page, before, after) {
  return page.evaluate(async ([left, right]) => {
    const read = async data => {
      const image = new Image(); image.src = `data:image/png;base64,${data}`; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
      return { width: canvas.width, height: canvas.height, data: context.getImageData(0, 0, canvas.width, canvas.height).data };
    };
    const [a, b] = await Promise.all([read(left), read(right)]);
    if (a.width !== b.width || a.height !== b.height) throw new Error('Raster comparisons require equal dimensions');
    let changed = 0;
    for (let i = 0; i < a.data.length; i += 4) {
      if (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]) > 18) changed++;
    }
    return { pixels: a.width * a.height, changed, fraction: changed / (a.width * a.height) };
  }, [before.toString('base64'), after.toString('base64')]);
}

async function sceneRaster(page) {
  const canvas = page.locator('.orbital-scene__canvas canvas');
  // A motion-preference change can remove the previous canvas after its old
  // ready class was observed. Wait for the current canvas and renderer together.
  await expect(canvas).toBeVisible({ timeout: 60000 });
  await expect(page.locator('.orbital-scene')).toHaveClass(/is-ready/, { timeout: 60000 });
  if (!await canvas.boundingBox()) throw new Error('Landing scene is not visible');
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('The camera comparison requires a fixed viewport');
  const scroll = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
  try {
    await page.evaluate(() => window.scrollTo({ left: 0, top: 0, behavior: 'instant' }));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
    // The viewport stays fixed while the mobile exploration layout can grow.
    // Hide HTML paint without changing layout, so text and document height
    // cannot manufacture evidence of physical product movement in the world.
    return await page.screenshot({ clip: { x: 0, y: 0, ...viewport }, style: 'body *, body *::before, body *::after { transition:none !important; animation:none !important; visibility:hidden !important } canvas { visibility:visible !important; outline:none !important }' });
  } finally {
    await page.evaluate(position => window.scrollTo({ left: position.x, top: position.y, behavior: 'instant' }), scroll);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  }
}

try {
  for (const mobile of [false, true]) {
    const label = mobile ? 'mobile' : 'desktop';
    const viewport = mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 };
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: 'reduce', isMobile: mobile, hasTouch: mobile });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push({ label, at: now(), url: page.url(), message: message.text(), location: message.location() }); });
    page.on('pageerror', error => report.pageErrors.push({ label, at: now(), url: page.url(), message: error.message }));
    page.on('requestfailed', request => report.requestFailures.push({ label, at: now(), url: request.url(), error: request.failure()?.errorText }));
    await page.exposeBinding('__holographicCsp', (_source, entry) => report.csp.push({ label, at: now(), ...entry }));
    await page.addInitScript(() => document.addEventListener('securitypolicyviolation', event => window.__holographicCsp({ directive: event.violatedDirective, blockedURI: event.blockedURI })));
    const record = (name, evidence = {}) => report.checks.push({ label, name, ...evidence });
    const shot = async name => {
      await page.mouse.move(2, 2);
      const file = path.join(output, `${label}-${name}.png`);
      await page.screenshot({ path: file, timeout: 60000 });
      report.screenshots.push({ label, name, file, url: page.url() });
    };
    const fit = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label}: horizontal overflow`).toBe(true);
    const nav = async id => {
      if (mobile) {
        await page.getByRole('button', { name: 'Open navigation menu', exact: true }).click();
        await page.locator(`#orbital-mobile-menu a[href="/#${id}"]`).click();
      } else await page.locator(`.orbital-nav__desktop a[href="/#${id}"]`).click();
    };
    const landingReady = async () => expect(page.locator('.orbital-scene')).toHaveClass(/is-ready/, { timeout: 60000 });
    const appReady = async () => expect(page.locator('.orbital-backdrop')).toHaveClass(/is-ready/, { timeout: 60000 });
    const changeLandingMotion = async reducedMotion => {
      const outgoing = await page.locator('.orbital-scene__canvas canvas').elementHandle();
      if (!outgoing) throw new Error('Motion change requires the current rendered scene');
      try {
        await page.emulateMedia({ reducedMotion });
        // Both the old canvas and its ready class remain valid until React
        // receives the media event. Require replacement before comparing worlds.
        await expect.poll(() => outgoing.evaluate(element => element.isConnected), { timeout: 60000 }).toBe(false);
        await expect(page.locator('.orbital-scene__canvas canvas')).toBeVisible({ timeout: 60000 });
        await landingReady();
      } finally { await outgoing.dispose(); }
    };
    try {
      if (scope !== 'app') {
        await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
        await landingReady();
        await expect(page.locator('.orbital-home')).toHaveAttribute('data-view', 'home');
        await shot('01-home');
        const homeScene = await sceneRaster(page);
        await nav('instruments');
        const stage = page.locator('#instrument-stage');
        await expect(page).toHaveURL(/#instruments$/);
        await expect(page.locator('.orbital-home')).toHaveAttribute('data-view', 'instruments');
        await expect(stage).toBeVisible();
        await expect(stage).toBeFocused();
        await expect(page.locator('.immersive-intro')).toHaveAttribute('aria-hidden', 'true');
        expect(await page.locator('.immersive-intro').evaluate(element => element.inert)).toBe(true);
        const exploration = await pixelDifference(page, homeScene, await sceneRaster(page));
        expect(exploration.fraction, 'Instruments must alter the physical scene, not only a URL or label').toBeGreaterThan(.001);
        record('distinct exploration view', { exploration });
        let previous = await sceneRaster(page);
        for (const id of ['fade', 'pod', 'trigger', 'envoy']) {
          await page.locator(`#exhibit-${id}`).click();
          await expect(page.locator(`#exhibit-${id}`)).toHaveAttribute('aria-pressed', 'true');
          await expect(page.locator('#exhibit-title')).toContainText(names[id]);
          await expect(stage.getByRole('link', { name: /Details/ })).toHaveAttribute('href', `/${id}`);
          await expect(stage.locator(`a[href="/app/?tab=${id}"]`)).toHaveAttribute('href', `/app/?tab=${id}`);
          const current = await sceneRaster(page);
          if (id !== 'fade') {
            const delta = await pixelDifference(page, previous, current);
            expect(delta.fraction, `${id}: changing the product must change physical scene pixels`).toBeGreaterThan(.001);
            record(`physical ${id} selection`, delta);
          }
          previous = current;
          await fit(); await shot(`02-exhibit-${id}`);
        }
        await stage.getByRole('button', { name: 'Next instrument', exact: true }).click();
        await expect(page.locator('#exhibit-fade')).toHaveAttribute('aria-pressed', 'true');
        await stage.getByRole('button', { name: 'Previous instrument', exact: true }).click();
        await expect(page.locator('#exhibit-envoy')).toHaveAttribute('aria-pressed', 'true');
        await page.locator('#exhibit-pod').click();
        await nav('instruments');
        await expect(stage).toBeFocused();
        await expect(page.locator('#exhibit-pod')).toHaveAttribute('aria-pressed', 'true');
        record('wrap navigation and repeated Instruments focus preserve selection');

        await nav('how-it-works');
        const dialog = page.getByRole('dialog', { name: 'How it works', exact: true });
        await expect(dialog).toBeVisible();
        await expect(page.locator('#instrument-stage')).toBeHidden();
        await expect(page.locator('.immersive-console')).toBeHidden();
        await expect(page.locator('.orbital-scene__canvas canvas')).toBeVisible();
        await expect(dialog.getByRole('button', { name: /^Close/ })).toBeFocused();
        const terms = dialog.getByRole('tab', { name: 'Terms', exact: true });
        await expect(terms).toHaveAttribute('aria-selected', 'true');
        await page.waitForTimeout(1000);
        await expect(terms).toHaveAttribute('aria-selected', 'true');
        const firstOptics = await dialog.locator('.mechanism-optics').screenshot();
        for (const name of ['Terms', 'Wallet', 'Result']) {
          await dialog.getByRole('tab', { name, exact: true }).click();
          await expect(dialog.getByRole('tabpanel', { name, exact: true })).toBeVisible();
          await shot(`03-how-${name.toLowerCase()}`);
        }
        const optics = await pixelDifference(page, firstOptics, await dialog.locator('.mechanism-optics').screenshot());
        expect(optics.fraction, 'The selected explanation stage must change the optical illustration').toBeGreaterThan(.001);
        await expect(dialog.getByRole('tabpanel', { name: 'Result', exact: true })).toContainText('Claims and refunds require a transaction');
        await page.keyboard.press('Home');
        await expect(terms).toBeFocused();
        await page.keyboard.press('ArrowRight');
        await expect(dialog.getByRole('tab', { name: 'Wallet', exact: true })).toBeFocused();
        await dialog.getByRole('tabpanel', { name: 'Wallet', exact: true }).focus();
        await page.keyboard.press('Tab');
        await expect(dialog.getByRole('button', { name: /^Close/ })).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(dialog).not.toBeVisible();
        await expect(page.locator('.orbital-home')).toHaveAttribute('data-view', 'instruments');
        await expect(page.locator('#exhibit-pod')).toHaveAttribute('aria-pressed', 'true');
        await nav('how-it-works'); await page.goBack();
        await expect(dialog).not.toBeVisible();
        await expect(page.locator('#exhibit-pod')).toHaveAttribute('aria-pressed', 'true');
        record('manual explanation stages, keyboard trap, Escape and browser Back', { optics });

        await page.mouse.move(2, 2);
        const selectedStatic = await sceneRaster(page);
        await changeLandingMotion('no-preference');
        await page.waitForTimeout(600);
        await expect(page.locator('.orbital-home')).toHaveAttribute('data-view', 'instruments');
        await expect(page.locator('#exhibit-pod')).toHaveAttribute('aria-pressed', 'true');
        await changeLandingMotion('reduce');
        await page.mouse.move(2, 2);
        await expect(page.locator('#exhibit-title')).toContainText('Pod');
        const selectedRestored = await sceneRaster(page);
        await writeFile(path.join(output, `${label}-motion-before.png`), selectedStatic);
        await writeFile(path.join(output, `${label}-motion-after.png`), selectedRestored);
        const retained = await pixelDifference(page, selectedStatic, selectedRestored);
        expect(retained.fraction, 'Motion preference changes must restore the selected physical exhibit and exploration view').toBeLessThan(.001);
        record('motion preference preserves UI and physical selection', retained);
        await nav('home');
        await expect(page.locator('.orbital-home')).toHaveAttribute('data-view', 'home');
        await expect(page.locator('.immersive-intro')).not.toHaveAttribute('aria-hidden', 'true');
        await page.goBack();
        await expect(page.locator('.orbital-home')).toHaveAttribute('data-view', 'instruments');
        record('Home and browser Back restore the intended view');
      }

      if (scope !== 'landing') {
        await page.goto(`${base}/app/?tab=fade`, { waitUntil: 'domcontentloaded' });
        await appReady();
        const readReadiness = () => page.evaluate(() => document.querySelector('.protocol-status')?.getAttribute('data-readiness') ?? 'ready');
        await expect.poll(readReadiness, { timeout: 20000 }).not.toBe('checking');
        const readinessState = await readReadiness();
        record('observed live protocol readiness', { readiness: readinessState });
        const workspace = page.locator('.station-workspace');
        for (const id of Object.keys(names)) {
          await page.locator(`#tab-${id}`).click();
          await expect(page.locator(`#panel-${id}`)).toBeVisible();
          await expect(workspace).toHaveAttribute('data-instrument', id);
          const panel = page.locator(`#panel-${id}`);
          await fit();
          const box = await workspace.boundingBox();
          expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
          const surfaces = await workspace.evaluate(element => {
            const css = getComputedStyle(element);
            return { background: css.backgroundColor, backgroundImage: css.backgroundImage, backdropFilter: css.backdropFilter };
          });
          expect(surfaces.backdropFilter).toBe('none');
          const withWorld = await workspace.screenshot();
          const withoutWorld = await workspace.screenshot({ style: '.orbital-canvas { visibility:hidden !important }' });
          const transmission = await pixelDifference(page, withWorld, withoutWorld);
          expect(transmission.fraction, `${id}: the 3D world must remain visible through the projected workspace`).toBeGreaterThan(.01);
          const fields = await panel.locator('input:not([type=checkbox]), select, textarea').evaluateAll(elements => elements.filter(element => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden').map(element => {
            const css = getComputedStyle(element); const r = element.getBoundingClientRect();
            return { label: element.labels?.[0]?.textContent || element.getAttribute('aria-label'), fontSize: parseFloat(css.fontSize), foreground: css.color, background: css.backgroundColor, width: r.width, height: r.height, left: r.left, right: r.right };
          }));
          for (const field of fields) {
            expect(field.label, `${id}: each field needs an accessible label`).toBeTruthy();
            expect(field.width).toBeGreaterThan(50); expect(field.height).toBeGreaterThanOrEqual(32);
            expect(field.fontSize).toBeGreaterThanOrEqual(13);
            expect(field.left).toBeGreaterThanOrEqual(box.x - 1); expect(field.right).toBeLessThanOrEqual(box.x + box.width + 1);
          }
          record(`${id} projected frame and field layout`, { surfaces, transmission, fields });

          if (id === 'fade') {
            await panel.getByLabel(/^Start price/).fill('900');
            await expect(panel.getByRole('img', { name: /^Draft price curve from/ })).toHaveAttribute('aria-label', /900/);
          } else if (id === 'pod') {
            const amount = panel.getByLabel('Amount (USDC)', { exact: true });
            const minutes = panel.getByLabel('Unlock in (minutes)', { exact: false });
            await amount.fill('731.25'); await minutes.fill('13');
            await expect(panel.getByRole('img', { name: /^Pod draft: opening requires/ })).toBeVisible();
            await expect(panel.getByRole('region', { name: 'Unlock conditions', exact: true })).toContainText('731.25');
            await page.getByRole('button', { name: 'Close instrument', exact: true }).click();
            await expect(workspace).toBeHidden();
            await page.locator('#tab-pod').click();
            await expect(amount).toHaveValue('731.25'); await expect(minutes).toHaveValue('13');
            record('unsent Pod draft survives workspace close/reopen');
          } else if (id === 'trigger') {
            await panel.getByLabel('Attester pubkey (hex)', { exact: false }).fill('1'.repeat(64));
            await expect(panel.getByRole('img', { name: /^Draft escrow:/ })).toHaveAttribute('aria-label', /entered, not verified/);
          } else if (id === 'envoy') {
            if (mobile) { const summary = await panel.locator('.instrument-aside').first().boundingBox(); const form = await panel.locator('.instrument-main').first().boundingBox(); expect(summary.y).toBeLessThan(form.y); record('mobile Envoy shows effective authority before its form'); }
            await expect(panel.locator('.envoy-scope')).toContainText('50');
            await panel.locator('.envoy-contract-limits summary').click();
            await panel.getByLabel('Max per tx (USDC)', { exact: false }).fill('33');
            await panel.getByLabel('Daily cap (USDC)', { exact: false }).fill('120');
            await expect(panel.getByRole('img', { name: /^Draft authority:/ })).toHaveAttribute('aria-label', /Per claim 33 USDC, daily cap 120 USDC/);
            await panel.getByLabel('Max per tx (USDC)', { exact: false }).fill('150');
            await expect(panel.getByRole('img', { name: /^Draft authority:/ })).toHaveAttribute('aria-label', /exceeds the daily cap/);
          } else if (id === 'ramp') {
            await panel.getByLabel('TRY amount', { exact: false }).fill('1250');
            await expect(panel.getByRole('img', { name: /^Draft deposit:/ })).toHaveAttribute('aria-label', /1,?250 TRY to USDC/);
            await panel.getByRole('button', { name: 'Withdraw', exact: true }).click();
            await panel.getByLabel('Amount (USDC)', { exact: true }).fill('42');
            await expect(panel.getByRole('img', { name: /^Draft withdraw:/ })).toHaveAttribute('aria-label', /42 USDC to simulated TRY/);
          } else {
            await expect(panel.getByLabel('Local record summary', { exact: true })).toContainText('Records0');
            await expect(panel.getByRole('heading', { name: 'No activity recorded yet', exact: true })).toBeVisible();
            await expect(panel.getByRole('button', { name: 'Clear history', exact: true })).toBeDisabled();
          }
          record(`${id} presentation follows actual unsent state`);
          await page.locator('.station-drawer-scroll').evaluate(element => { element.scrollTop = 0; });
          await workspace.evaluate(element => { element.scrollTop = 0; });
          await shot(`04-app-${id}`);
        }
        await page.locator('#tab-pod').click();
        const retainedPod = page.locator('#panel-pod');
        await expect(retainedPod.getByLabel('Amount (USDC)', { exact: true })).toHaveValue('731.25');
        await expect(retainedPod.getByLabel('Unlock in (minutes)', { exact: false })).toHaveValue('13');
        await retainedPod.getByRole('button', { name: 'Prepare pod secret', exact: true }).click();
        const secret = await retainedPod.getByLabel('Generated Pod secret', { exact: true }).inputValue();
        expect(secret).toMatch(/^[a-f0-9]{64}$/);
        const backup = retainedPod.getByRole('checkbox', { name: 'I saved this secret outside this page.', exact: true });
        await expect(backup).not.toBeChecked();
        await expect(retainedPod.getByRole('button', { name: 'Bury the pod', exact: true })).toBeDisabled();
        await backup.check();
        await page.getByRole('button', { name: 'About Pod', exact: true }).click();
        await expect(page.getByRole('region', { name: 'How Pod works', exact: true })).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(workspace).toBeVisible();
        await expect(page.getByRole('region', { name: 'How Pod works', exact: true })).toHaveCount(0);
        await expect(retainedPod.getByLabel('Generated Pod secret', { exact: true })).toHaveValue(secret);
        await expect(backup).toBeChecked();
        record('Pod secret and saved acknowledgement survive in-place help without funding');
        await page.locator('#tab-fade').click();
        await page.locator('#tab-pod').click();
        await expect(retainedPod.getByLabel('Generated Pod secret', { exact: true })).toHaveCount(0);
        await expect(retainedPod.getByLabel('Amount (USDC)', { exact: true })).toHaveValue('731.25');
        await expect(retainedPod.getByLabel('Unlock in (minutes)', { exact: false })).toHaveValue('13');
        await retainedPod.getByRole('button', { name: 'Prepare pod secret', exact: true }).click();
        const replacement = await retainedPod.getByLabel('Generated Pod secret', { exact: true }).inputValue();
        expect(replacement).toMatch(/^[a-f0-9]{64}$/); expect(replacement).not.toBe(secret);
        await expect(backup).not.toBeChecked();
        await expect(retainedPod.getByRole('button', { name: 'Bury the pod', exact: true })).toBeDisabled();
        record('Switching instruments clears the V3 credential and backup acknowledgement while retaining amount/time');
        await page.getByRole('button', { name: 'Close instrument', exact: true }).click();
        await expect(workspace).toBeHidden();
        await page.locator('#tab-pod').click();
        await expect(retainedPod.getByLabel('Generated Pod secret', { exact: true })).toHaveCount(0);
        await expect(retainedPod.getByLabel('Amount (USDC)', { exact: true })).toHaveValue('731.25');
        await expect(retainedPod.getByLabel('Unlock in (minutes)', { exact: false })).toHaveValue('13');
        record('Closing the workspace clears the V3 credential while retaining amount/time');
        await page.getByRole('button', { name: 'Close instrument', exact: true }).click();
        await expect(workspace).toBeHidden();
        const hiddenPolls = [];
        const watchPolls = request => { try { if (JSON.parse(request.postData() || '{}').method === 'getLatestLedger') hiddenPolls.push(request.url()); } catch { /* Other request bodies are not RPC polls. */ } };
        page.on('request', watchPolls);
        await page.waitForTimeout(5400);
        page.off('request', watchPolls);
        expect(hiddenPolls, 'Closed, retained instruments must not keep polling the ledger').toEqual([]);
        record('retained hidden instruments stop ledger polling');

        await expect(page.getByRole('button', { name: /^(Pause motion|Resume motion)$/ })).toHaveCount(0);
      }
    } catch (error) {
      report.failures.push({ label, message: error.message, stack: error.stack, url: page.url() });
      await shot('failure').catch(() => {});
    } finally { await context.close(); }
  }
  // Keep the error gate strict. External diagnostics remain visible; no network
  // endpoint, local asset error or application failure is silently filtered.
  if (report.consoleErrors.length || report.pageErrors.length || report.requestFailures.length || report.csp.length) report.failures.push({ name: 'browser error gate', message: 'Console, application, network or CSP errors were recorded; inspect the unfiltered arrays.' });
  report.status = report.failures.length ? 'failed' : 'passed';
} finally {
  await browser.close();
  await writeFile(path.join(output, 'verification.json'), JSON.stringify(report, null, 2));
}
console.log(JSON.stringify({ status: report.status, output, checks: report.checks.length, failures: report.failures, consoleErrors: report.consoleErrors, pageErrors: report.pageErrors, requestFailures: report.requestFailures, csp: report.csp }));
if (report.status !== 'passed') process.exitCode = 1;
