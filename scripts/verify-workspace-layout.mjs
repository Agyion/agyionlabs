import { waitForFonts } from './lib/browser-settle.mjs';
/** Focused layout supplement. Header size changes are isolated DOM fixtures; no wallet or transaction actions. */
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.BASE_URL || 'http://127.0.0.1:4192';
const output = process.env.QA_OUTPUT_DIR || 'artifacts/verification/workspace-layout';
const scope = process.env.QA_SCOPE || 'all';
if (!['all', 'desktop-primary'].includes(scope)) throw new Error(`Unknown QA_SCOPE: ${scope}`);
const viewports = scope === 'desktop-primary'
  ? [['desktop', 1440, 1000]]
  : [['desktop', 1440, 1000], ['portrait', 390, 844], ['landscape', 844, 390]];
const tabs = ['fade', 'pod', 'trigger', 'envoy', 'ramp', 'ledger'];
const report = { base, scope, startedAt: new Date().toISOString(), status: 'running', noTransactions: true, checks: [], pages: [], screenshots: [], failure: null };
await mkdir(output, { recursive: true });
const persist = () => writeFile(`${output}/results.json`, JSON.stringify(report, null, 2));
const browser = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });

async function check(name, action) {
  const result = { name, status: 'running' };
  report.checks.push(result);
  try { result.evidence = await action(); result.status = 'passed'; }
  catch (error) { result.status = 'failed'; result.error = { message: error.message, stack: error.stack }; }
  await persist();
  console.log(`${result.status.toUpperCase()} ${name}`);
}
async function shot(page, name) {
  const path = `${output}/${name}.png`;
  await page.screenshot({ path, timeout: 60000 });
  report.screenshots.push({ name, path, url: page.url() });
}
async function open(page, id) {
  await page.locator(`#tab-${id}`).click();
  await expect(page.locator(`#panel-${id}`)).toBeVisible();
  await page.evaluate(() => {
    document.querySelector('.station-workspace').scrollTop = 0;
    document.querySelector('.station-drawer-scroll').scrollTop = 0;
  });
}
async function geometry(page) {
  return page.evaluate(() => {
    const header = document.querySelector('.station-topbar').getBoundingClientRect();
    const workspace = document.querySelector('.station-workspace').getBoundingClientRect();
    const canvas = document.querySelector('.orbital-canvas canvas').getBoundingClientRect();
    return {
      headerHeight: header.height, headerBottom: header.bottom,
      measuredTop: parseFloat(getComputedStyle(document.querySelector('.station-app')).getPropertyValue('--station-top')),
      workspaceTop: workspace.top, workspaceBottom: workspace.bottom,
      canvas: { x: canvas.x, y: canvas.y, width: canvas.width, height: canvas.height },
      viewport: { width: innerWidth, height: innerHeight },
    };
  });
}
function assertSceneBounds(evidence) {
  expect(Math.abs(evidence.canvas.x)).toBeLessThan(1);
  expect(Math.abs(evidence.canvas.y), 'Canvas starts at the viewport origin').toBeLessThan(1);
  expect(Math.abs(evidence.canvas.width - evidence.viewport.width)).toBeLessThan(1);
  expect(Math.abs(evidence.canvas.height - evidence.viewport.height), 'Header growth does not resize the 3D world').toBeLessThan(1);
}
async function headerFixture(page, label) {
  await open(page, 'fade');
  const before = await geometry(page);
  assertSceneBounds(before);
  const oldStyle = await page.locator('.station-topbar').getAttribute('style');
  try {
    await page.locator('.station-topbar').evaluate((element, height) => {
      element.dataset.qaFixture = 'taller-header-no-wallet';
      element.style.height = `${height + 48}px`;
    }, before.headerHeight);
    await expect.poll(async () => {
      const state = await geometry(page);
      return Math.abs(state.measuredTop - Math.ceil(state.headerHeight));
    }).toBeLessThan(1);
    const after = await geometry(page);
    expect(after.headerHeight - before.headerHeight).toBeGreaterThanOrEqual(47);
    expect(after.workspaceTop, 'Workspace stays below the taller rendered header').toBeGreaterThanOrEqual(after.headerBottom);
    assertSceneBounds(after);
    await shot(page, `${label}-header-height-fixture`);
    return { fixtureOnly: true, before, after };
  } finally {
    await page.locator('.station-topbar').evaluate((element, previous) => {
      delete element.dataset.qaFixture;
      if (previous === null) element.removeAttribute('style'); else element.setAttribute('style', previous);
    }, oldStyle);
    await expect.poll(async () => (await geometry(page)).measuredTop).toBe(Math.ceil(before.headerHeight));
  }
}

async function reachableControls(page) {
  const workspace = page.locator('.station-workspace');
  await workspace.locator('details').evaluateAll(elements => elements.forEach(element => { element.open = true; }));
  const controls = workspace.locator('input,select,textarea,button,a,summary');
  const reached = [];
  for (let index = 0; index < await controls.count(); index++) {
    const control = controls.nth(index);
    if (!await control.isVisible()) continue;
    await control.scrollIntoViewIfNeeded();
    const state = await control.evaluate(element => {
      const rect = element.getBoundingClientRect(), box = document.querySelector('.station-workspace').getBoundingClientRect();
      const centerX = rect.left + rect.width / 2, centerY = rect.top + rect.height / 2;
      const hit = document.elementFromPoint(centerX, centerY);
      return {
        tag: element.tagName, label: element.getAttribute('aria-label') || element.labels?.[0]?.textContent?.trim() || element.textContent?.trim(),
        top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right,
        bounds: { top: box.top, bottom: box.bottom, left: box.left, right: box.right },
        receivesPointer: !!hit && (hit === element || element.contains(hit)),
        workspaceScrollTop: document.querySelector('.station-workspace').scrollTop,
        documentScrollY: window.scrollY,
      };
    });
    expect(state.top, state.label).toBeGreaterThanOrEqual(state.bounds.top - 1);
    expect(state.bottom, state.label).toBeLessThanOrEqual(state.bounds.bottom + 1);
    expect(state.left, state.label).toBeGreaterThanOrEqual(state.bounds.left - 1);
    expect(state.right, state.label).toBeLessThanOrEqual(state.bounds.right + 1);
    expect(state.receivesPointer, `${state.label} is not covered by another layer`).toBe(true);
    expect(state.documentScrollY).toBe(0);
    reached.push(state);
  }
  expect(reached.length).toBeGreaterThan(0);
  return reached;
}

try {
  for (const [label, width, height] of viewports) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const diagnostics = { label, phase: 'navigation', consoleErrors: [], pageErrors: [], requestFailures: [], httpErrors: [] };
    report.pages.push(diagnostics);
    page.on('console', message => { if (message.type() === 'error') diagnostics.consoleErrors.push({ phase: diagnostics.phase, message: message.text(), location: message.location() }); });
    page.on('pageerror', error => diagnostics.pageErrors.push({ phase: diagnostics.phase, message: error.message, stack: error.stack }));
    page.on('requestfailed', request => diagnostics.requestFailures.push({ phase: diagnostics.phase, url: request.url(), method: request.method(), error: request.failure()?.errorText }));
    page.on('response', response => { if (response.status() >= 400) diagnostics.httpErrors.push({ phase: diagnostics.phase, url: response.url(), status: response.status() }); });
    try {
      await page.goto(`${base}/app/?tab=fade`);
      await expect(page.locator('.orbital-backdrop')).toHaveClass(/is-ready/, { timeout: 30000 });
      await waitForFonts(page);
      if (label === 'desktop') {
        for (const [id, action] of [['fade', 'Lock the pot'], ['trigger', 'Lock the escrow'], ['envoy', 'Grant mandate']]) {
          diagnostics.phase = `${id} primary visibility`;
          await check(`${label} ${id}: primary action is fully visible without scrolling`, async () => {
            await open(page, id);
            await shot(page, `${label}-${id}-primary`);
            const evidence = await page.getByRole('button', { name: action, exact: true }).evaluate(element => {
              const button = element.getBoundingClientRect(), scroll = document.querySelector('.station-drawer-scroll'), box = scroll.getBoundingClientRect();
              const hit = document.elementFromPoint(button.left + button.width / 2, button.top + button.height / 2);
              return { top: button.top, bottom: button.bottom, visibleTop: box.top, visibleBottom: box.bottom, internalScroll: scroll.scrollTop, workspaceScroll: document.querySelector('.station-workspace').scrollTop, uncovered: !!hit && (hit === element || element.contains(hit)) };
            });
            expect(evidence.internalScroll).toBe(0); expect(evidence.workspaceScroll).toBe(0);
            expect(evidence.top).toBeGreaterThanOrEqual(evidence.visibleTop);
            expect(evidence.bottom).toBeLessThanOrEqual(evidence.visibleBottom);
            expect(evidence.uncovered).toBe(true);
            return evidence;
          });
        }
      }
      if (label === 'portrait') {
        for (const id of tabs) {
          diagnostics.phase = `${id} input sizing`;
          await check(`${label} ${id}: every text input is at least 16px`, async () => {
            await open(page, id);
            if (id === 'pod') await page.getByRole('button', { name: 'Prepare pod secret', exact: true }).click();
            const inputs = await page.locator('.station-console input:not([type=checkbox]),.station-console textarea,.station-console select').evaluateAll(elements => elements.map(element => ({ label: element.getAttribute('aria-label') || element.labels?.[0]?.textContent?.trim(), fontSize: parseFloat(getComputedStyle(element).fontSize) })));
            for (const input of inputs) expect(input.fontSize, input.label).toBeGreaterThanOrEqual(16);
            return { inputs, includesHiddenDirectionAndTechnicalFields: true, noSubmission: true };
          });
        }
      }
      if (label === 'landscape') {
        for (const id of tabs) {
          diagnostics.phase = `${id} whole-workspace scroll`;
          await check(`${label} ${id}: every visible control is reachable by workspace scrolling`, async () => {
            await open(page, id);
            await shot(page, `${label}-${id}-before-scroll`);
            const reached = await reachableControls(page);
            expect(await page.locator('.station-workspace').evaluate(element => getComputedStyle(element).overflowY)).toBe('auto');
            await page.locator('.station-workspace').evaluate(element => { element.scrollTop = element.scrollHeight; });
            await shot(page, `${label}-${id}-after-scroll`);
            if (id === 'ramp') {
              await page.getByRole('button', { name: 'Withdraw', exact: true }).click();
              reached.push(...await reachableControls(page));
              await shot(page, 'landscape-ramp-withdraw-after-scroll');
            }
            return { reached };
          });
        }
      }
      if (scope === 'all') {
        diagnostics.phase = 'DOM-only header height fixture';
        await check(`${label}: measured header keeps overlays clear and canvas full viewport`, () => headerFixture(page, label));
      }
    } catch (error) {
      report.checks.push({ name: `${label} context setup`, status: 'failed', error: { message: error.message, stack: error.stack } });
    } finally { diagnostics.phase = 'context teardown'; await context.close(); await persist(); }
  }
  const failed = report.checks.filter(check => check.status !== 'passed');
  const pageErrors = report.pages.flatMap(page => page.pageErrors);
  const networkOrConsoleErrors = report.pages.flatMap(page => [...page.consoleErrors, ...page.requestFailures, ...page.httpErrors]);
  report.status = failed.length || pageErrors.length ? 'failed' : networkOrConsoleErrors.length ? 'layout_passed_with_runtime_diagnostics' : 'passed';
  report.failure = failed.length || pageErrors.length ? { failedChecks: failed.map(check => check.name), pageErrors } : null;
  await persist();
  expect(failed, 'Layout assertions remain strict; all diagnostics are saved').toEqual([]);
  expect(pageErrors).toEqual([]);
  console.log(JSON.stringify({ output, checks: report.checks.length, screenshots: report.screenshots.length, status: report.status, networkOrConsoleDiagnostics: networkOrConsoleErrors.length }));
} catch (error) {
  report.status = 'failed'; report.failure = { ...report.failure, message: error.message, stack: error.stack }; throw error;
} finally { try { await persist(); } finally { await browser.close(); } }
if (report.status !== 'passed') process.exitCode = 1;
