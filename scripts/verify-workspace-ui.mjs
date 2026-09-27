import { waitForFonts } from './lib/browser-settle.mjs';
/** Local workspace QA. No wallet connection, signing or transaction submission. */
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.BASE_URL || 'http://127.0.0.1:4192';
const output = process.env.QA_OUTPUT_DIR || 'artifacts/verification/workspace-ui';
const checkFilter = process.env.QA_CHECK_FILTER ? new RegExp(process.env.QA_CHECK_FILTER) : null;
const tabs = ['fade', 'pod', 'trigger', 'envoy', 'ramp', 'ledger'];
const report = { base, selection: process.env.QA_CHECK_FILTER || 'all', startedAt: new Date().toISOString(), status: 'running', noTransactions: true, checks: [], pages: [], screenshots: [], failure: null };
await mkdir(output, { recursive: true });
const persist = () => writeFile(`${output}/results.json`, JSON.stringify(report, null, 2));
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/google/chrome/chrome', headless: true,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
});

function observe(page, label) {
  const diagnostics = { label, phase: 'navigation', consoleErrors: [], pageErrors: [], requestFailures: [], httpErrors: [] };
  report.pages.push(diagnostics);
  page.on('console', message => {
    if (message.type() === 'error') diagnostics.consoleErrors.push({ at: Date.now(), phase: diagnostics.phase, message: message.text(), location: message.location(), pageUrl: page.url() });
  });
  page.on('pageerror', error => diagnostics.pageErrors.push({ at: Date.now(), phase: diagnostics.phase, message: error.message, stack: error.stack, pageUrl: page.url() }));
  page.on('requestfailed', request => diagnostics.requestFailures.push({ at: Date.now(), phase: diagnostics.phase, url: request.url(), method: request.method(), resourceType: request.resourceType(), error: request.failure()?.errorText }));
  page.on('response', response => {
    if (response.status() >= 400) diagnostics.httpErrors.push({ at: Date.now(), phase: diagnostics.phase, url: response.url(), status: response.status() });
  });
  return diagnostics;
}

async function check(name, action) {
  if (checkFilter && !checkFilter.test(name)) return;
  const result = { name, status: 'running' };
  report.checks.push(result);
  try { result.evidence = await action(); result.status = 'passed'; }
  catch (error) { result.status = 'failed'; result.error = { message: error.message, stack: error.stack }; }
  await persist();
  console.log(`${result.status.toUpperCase()} ${name}`);
}

async function screenshot(page, name) {
  const path = `${output}/${name}.png`;
  await page.screenshot({ path, timeout: 60000 });
  report.screenshots.push({ name, path, url: page.url(), at: Date.now() });
}

async function select(page, id) {
  await page.locator(`#tab-${id}`).click();
  await expect(page.locator(`#tab-${id}`)).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator(`#panel-${id}`)).toBeVisible();
  await expect(page.locator('.station-workspace')).toHaveAttribute('aria-hidden', 'false');
  await page.locator('.station-drawer-scroll').evaluate(element => { element.scrollTop = 0; });
}

async function layoutEvidence(page, { firstInput = true } = {}) {
  const evidence = await page.evaluate(() => {
    const workspace = document.querySelector('.station-workspace');
    const scroll = document.querySelector('.station-drawer-scroll');
    const panel = document.querySelector('.station-console');
    const box = workspace.getBoundingClientRect(), scrollBox = scroll.getBoundingClientRect();
    const rendered = element => {
      const style = getComputedStyle(element), rect = element.getBoundingClientRect();
      const closedDetails = element.closest('details:not([open])');
      if (closedDetails && !closedDetails.querySelector('summary')?.contains(element)) return false;
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && !element.closest('[hidden]');
    };
    const controls = [...panel.querySelectorAll('input,select,textarea,button,summary')].filter(rendered);
    const horizontalClipping = controls.flatMap(element => {
      const rect = element.getBoundingClientRect();
      let left = scrollBox.left, right = scrollBox.right;
      for (let ancestor = element.parentElement; ancestor && ancestor !== workspace; ancestor = ancestor.parentElement) {
        if (['hidden', 'clip', 'auto', 'scroll'].includes(getComputedStyle(ancestor).overflowX)) {
          const ancestorBox = ancestor.getBoundingClientRect();
          left = Math.max(left, ancestorBox.left); right = Math.min(right, ancestorBox.right);
        }
      }
      return rect.left < left - 1 || rect.right > right + 1
        ? [{ tag: element.tagName, label: element.getAttribute('aria-label') || element.labels?.[0]?.textContent?.trim() || element.textContent?.trim(), left: rect.left, right: rect.right, allowedLeft: left, allowedRight: right }]
        : [];
    });
    const first = controls.find(element => element.matches('input:not([type=checkbox]),select,textarea')) || controls[0];
    const firstBox = first?.getBoundingClientRect();
    return {
      viewport: { width: innerWidth, height: innerHeight },
      workspace: { x: box.x, y: box.y, width: box.width, height: box.height, right: box.right, bottom: box.bottom },
      centeredOffset: Math.abs(box.x + box.width / 2 - innerWidth / 2),
      documentOverflow: document.documentElement.scrollWidth - innerWidth,
      internalHorizontalOverflow: scroll.scrollWidth - scroll.clientWidth,
      verticalScrollAvailable: scroll.scrollHeight > scroll.clientHeight,
      firstControl: firstBox ? { tag: first.tagName, top: firstBox.top, bottom: firstBox.bottom, viewportTop: scrollBox.top, viewportBottom: scrollBox.bottom } : null,
      horizontalClipping,
    };
  });
  expect(evidence.workspace.x).toBeGreaterThanOrEqual(-1);
  expect(evidence.workspace.right).toBeLessThanOrEqual(evidence.viewport.width + 1);
  expect(evidence.workspace.y).toBeGreaterThanOrEqual(-1);
  expect(evidence.workspace.bottom).toBeLessThanOrEqual(evidence.viewport.height + 1);
  expect(evidence.centeredOffset, 'Workspace is centered in the viewport').toBeLessThan(2);
  expect(evidence.documentOverflow).toBeLessThanOrEqual(1);
  expect(evidence.internalHorizontalOverflow, 'Only vertical workspace scrolling is allowed').toBeLessThanOrEqual(1);
  expect(evidence.horizontalClipping, 'Fields and controls must not be horizontally clipped').toEqual([]);
  if (firstInput) {
    expect(evidence.firstControl).not.toBeNull();
    expect(evidence.firstControl.top).toBeGreaterThanOrEqual(evidence.firstControl.viewportTop - 1);
    expect(evidence.firstControl.bottom, 'The first control is available without scrolling past introductory content').toBeLessThanOrEqual(evidence.firstControl.viewportBottom + 1);
  }
  return evidence;
}

const ledgerFixture = [
  { seq: 1, ts: '2026-09-24T12:00:00.000Z', ledger: null, template: 'fade', action: 'qa_fixture', refId: 'QA-ONLY-FADE', amount: '1250000000', status: 'recorded', detail: 'Synthetic UI fixture only. No transaction was submitted.', txHash: null },
  { seq: 2, ts: '2026-09-24T12:05:00.000Z', ledger: null, template: 'pod', action: 'qa_fixture', refId: 'QA-ONLY-POD', amount: '5000000000', status: 'recorded', detail: 'Synthetic capsule history for layout verification. No funds are locked.', txHash: null },
];

try {
  for (const [width, height] of [[1440, 1000], [768, 1000], [390, 844]]) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const diagnostics = observe(page, `${width}px reduced-motion workspace`);
    try {
      await page.goto(`${base}/app/?tab=fade`);
      await expect(page.locator('.orbital-backdrop')).toHaveClass(/is-ready/, { timeout: 30000 });
      await waitForFonts(page);
      for (const id of tabs) {
        diagnostics.phase = `${id} initial form`;
        await check(`${width}px ${id}: initial content and bounds`, async () => {
          await select(page, id);
          await screenshot(page, `${width}-${id}`);
          if (id === 'ledger') await expect(page.getByRole('heading', { name: 'No activity recorded yet' })).toBeVisible();
          await expect(page.locator('.station-console .panel-hero')).toHaveCount(0);
          return layoutEvidence(page);
        });
      }

      diagnostics.phase = 'Fade preview and workspace close';
      await check(`${width}px Fade: read-only draft, close and Escape preserve it`, async () => {
        await select(page, 'fade');
        await page.getByLabel(/^Pot \(/).fill('123.45');
        await page.getByLabel(/^Start price/).fill('100');
        await page.getByLabel(/^Floor price/).fill('-25');
        await page.getByLabel(/^Duration \(minutes\)/).fill('10');
        await expect(page.getByRole('img', { name: 'Draft price curve from 100 to -25 USDC over 120 ledgers' })).toBeVisible();
        await page.getByRole('button', { name: 'Close instrument', exact: true }).click();
        await expect(page.locator('.station-workspace')).toHaveAttribute('aria-hidden', 'true');
        await expect(page.locator('#tab-fade')).toBeFocused();
        await page.locator('#tab-fade').click();
        await expect(page.getByLabel(/^Pot \(/)).toHaveValue('123.45');
        await page.getByLabel(/^Pot \(/).focus();
        await page.keyboard.press('Escape');
        await expect(page.locator('.station-workspace')).toHaveAttribute('aria-hidden', 'true');
        await expect(page.locator('#tab-fade')).toBeFocused();
        await page.locator('#tab-fade').click();
        await expect(page.getByLabel(/^Pot \(/)).toHaveValue('123.45');
        await expect(page.getByRole('button', { name: 'Lock the pot', exact: true })).toBeDisabled();
        return { retainedPot: '123.45', draftPreviewOnly: true };
      });

      diagnostics.phase = 'Keyboard tab navigation';
      await check(`${width}px instrument tabs: arrow keys, Home, End and wrapping`, async () => {
        await page.locator('#tab-fade').focus();
        for (const [key, id] of [['ArrowRight', 'pod'], ['End', 'ledger'], ['Home', 'fade'], ['ArrowLeft', 'ledger']]) {
          await page.keyboard.press(key);
          await expect(page.locator(`#tab-${id}`)).toBeFocused();
          await expect(page.locator(`#tab-${id}`)).toHaveAttribute('aria-selected', 'true');
          await expect(page.locator(`#panel-${id}`)).toBeVisible();
          await expect(page.locator('.station-dock [tabindex="0"]')).toHaveCount(1);
        }
        return { keys: ['ArrowRight', 'End', 'Home', 'ArrowLeft'], oneTabStop: true };
      });

      diagnostics.phase = 'Pod secret preparation without submission';
      await check(`${width}px Pod: secret acknowledgement without a transaction`, async () => {
        await select(page, 'pod');
        await page.getByRole('button', { name: 'Prepare pod secret', exact: true }).click();
        const secret = page.getByLabel('Generated Pod secret', { exact: true });
        expect(await secret.inputValue()).toMatch(/^[a-f0-9]{64}$/);
        await expect(page.getByRole('checkbox', { name: 'I saved this secret outside this page.', exact: true })).not.toBeChecked();
        await expect(page.getByRole('button', { name: 'Bury the pod', exact: true })).toBeDisabled();
        await page.getByRole('checkbox', { name: 'I saved this secret outside this page.', exact: true }).check();
        await expect(page.getByRole('checkbox', { name: 'I saved this secret outside this page.', exact: true })).toBeChecked();
        await expect(page.getByRole('button', { name: 'Bury the pod', exact: true })).toBeDisabled();
        await screenshot(page, `${width}-pod-prepared-unused-secret`);
        return { ephemeralUnusedSecretOnly: true, submissionDisabledWithoutWallet: true, layout: await layoutEvidence(page, { firstInput: false }) };
      });

      diagnostics.phase = 'Ramp direction and draft retention';
      await check(`${width}px Ramp: direction is exclusive and both drafts survive switching`, async () => {
        await select(page, 'ramp');
        await page.getByLabel(/^TRY amount/).fill('2185');
        await page.getByRole('button', { name: 'Withdraw', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Withdraw', exact: true })).toHaveAttribute('aria-pressed', 'true');
        await expect(page.getByLabel(/^TRY amount/)).toBeHidden();
        await page.getByLabel('Amount (USDC)', { exact: true }).fill('42.5');
        await page.getByLabel('Destination IBAN (TRY)', { exact: true }).fill('TR330006100519786457841326');
        await page.getByRole('button', { name: 'Deposit', exact: true }).click();
        await expect(page.getByLabel(/^TRY amount/)).toHaveValue('2185');
        await expect(page.getByLabel('Destination IBAN (TRY)', { exact: true })).toBeHidden();
        await page.getByRole('button', { name: 'Withdraw', exact: true }).click();
        await expect(page.getByLabel('Amount (USDC)', { exact: true })).toHaveValue('42.5');
        await expect(page.getByLabel('Destination IBAN (TRY)', { exact: true })).toHaveValue('TR330006100519786457841326');
        await expect(page.getByRole('button', { name: 'Register withdrawal', exact: true })).toBeDisabled();
        await page.locator('.station-drawer-scroll').evaluate(element => { element.scrollTop = 0; });
        await screenshot(page, `${width}-ramp-withdraw`);
        return { depositDraft: '2185', withdrawalDraft: '42.5', submissionDisabledWithoutWallet: true, layout: await layoutEvidence(page) };
      });

      diagnostics.phase = 'Synthetic local Ledger fixture';
      await check(`${width}px Ledger: explicit local fixture and accessible record details`, async () => {
        await page.evaluate(entries => localStorage.setItem('agyion.ledger.v1', JSON.stringify(entries)), ledgerFixture);
        await select(page, 'ledger');
        await expect(page.getByText('2 records saved in this browser', { exact: true })).toBeVisible();
        const toggle = page.getByRole('button', { name: 'Record 2: pod qa fixture, 500 USDC, recorded. Details', exact: true });
        await expect(toggle).toHaveAttribute('aria-expanded', 'false');
        await toggle.focus();
        await page.keyboard.press('Enter');
        await expect(toggle).toHaveAttribute('aria-expanded', 'true');
        await expect(page.locator('#record-detail-2')).toBeVisible();
        await expect(page.getByText(ledgerFixture[1].detail, { exact: true })).toBeVisible();
        await screenshot(page, `${width}-ledger-synthetic-records`);
        const layout = await layoutEvidence(page, { firstInput: false });
        await page.keyboard.press('Space');
        await expect(toggle).toHaveAttribute('aria-expanded', 'false');
        await expect(page.locator('#record-detail-2')).toHaveCount(0);
        return { fixtureOnly: true, localIsolatedContext: true, detailsKeyboardOperable: true, layout };
      });
    } catch (error) {
      report.checks.push({ name: `${width}px context setup`, status: 'failed', error: { message: error.message, stack: error.stack } });
    } finally {
      diagnostics.phase = 'context teardown';
      await context.close();
      await persist();
    }
  }

  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, reducedMotion: 'no-preference' });
  const page = await context.newPage();
  const diagnostics = observe(page, 'Normal-motion workspace opening');
  try {
    await check('Normal motion: the workspace animates into its centered position', async () => {
      await page.goto(`${base}/app/`);
      await expect(page.locator('.orbital-backdrop')).toHaveClass(/is-ready/, { timeout: 30000 });
      diagnostics.phase = 'normal opening';
      await page.evaluate(() => {
        window.__workspaceSamples = [];
        const start = performance.now();
        function sample() {
          const element = document.querySelector('.station-workspace'), box = element.getBoundingClientRect();
          window.__workspaceSamples.push({ at: performance.now() - start, opacity: Number(getComputedStyle(element).opacity), top: box.top, width: box.width });
          if (performance.now() - start < 2200) requestAnimationFrame(sample);
        }
        requestAnimationFrame(sample);
      });
      await page.locator('#tab-pod').click();
      await expect(page.locator('#panel-pod')).toBeVisible();
      await page.waitForTimeout(2300);
      const samples = await page.evaluate(() => window.__workspaceSamples);
      expect(samples.some(sample => sample.opacity > 0 && sample.opacity < 1), 'Opening has observable intermediate frames').toBe(true);
      await screenshot(page, 'normal-workspace-opening');
      return { samples, layout: await layoutEvidence(page) };
    });
  } finally { diagnostics.phase = 'context teardown'; await context.close(); }

  const failedChecks = report.checks.filter(result => result.status !== 'passed');
  expect(report.checks.length, 'QA_CHECK_FILTER must select at least one actual check').toBeGreaterThan(0);
  const runtimeFailures = report.pages.flatMap(page => [
    ...page.consoleErrors, ...page.pageErrors, ...page.requestFailures, ...page.httpErrors,
  ].map(error => ({ page: page.label, ...error })));
  report.status = failedChecks.length || runtimeFailures.length ? 'failed' : 'passed';
  report.failure = report.status === 'failed' ? { failedChecks: failedChecks.map(result => result.name), runtimeFailures } : null;
  await persist();
  expect(failedChecks, 'All workspace checks must pass; see results.json for every failure').toEqual([]);
  expect(runtimeFailures, 'Runtime/network errors are retained and are not suppressed').toEqual([]);
  console.log(JSON.stringify({ output, checks: report.checks.length, screenshots: report.screenshots.length, status: report.status }));
} catch (error) {
  report.status = 'failed';
  report.failure = { ...report.failure, message: error.message, stack: error.stack };
  throw error;
} finally {
  try { await persist(); } finally { await browser.close(); }
}
