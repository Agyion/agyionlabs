/** Actual bundled wallet chooser under the release CSP. No provider is selected or connected. */
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { releaseExpectations, readinessPattern } from './release-expectations.mjs';
const expected = releaseExpectations({ ...process.env, PUBLIC_BASE_URL: process.env.APP_BASE_URL || process.env.PUBLIC_BASE_URL || 'http://127.0.0.1:4192' });
const base = expected.base;
const output = process.env.WALLET_QA_OUTPUT || 'artifacts/verification/product-pages/wallet-modal';
await mkdir(output, { recursive: true });
const report = { base, expected, at: new Date().toISOString(), status: 'running', checks: [], diagnostics: [], errors: [], csp: [], noWalletSelected: true };
const browser = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  page.on('pageerror', error => report.errors.push({ kind: 'page', message: error.message }));
  page.on('console', message => { if (message.type() === 'error') report.errors.push({ kind: 'console', message: message.text() }); });
  page.on('requestfailed', request => report.errors.push({ kind: 'network', url: request.url(), message: request.failure()?.errorText }));
  await page.exposeFunction('__walletCSP', event => report.csp.push(event));
  await page.addInitScript(() => document.addEventListener('securitypolicyviolation', event => window.__walletCSP({ directive: event.violatedDirective, blockedURI: event.blockedURI })));
  await page.goto(`${base}/app/?tab=fade`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.orbital-backdrop')).toHaveClass(/is-ready/, { timeout: 60000 });
  await expect(page.locator('main.station-app')).toHaveAttribute('data-protocol-readiness', readinessPattern(expected.readiness), { timeout: 30000 });
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    await page.getByRole('button', { name: 'Connect wallet', exact: true }).click();
    const chooser = page.locator('.stellar-wallets-kit');
    await expect(chooser.getByRole('heading', { name: 'Connect Wallet', exact: true })).toBeVisible();
    await expect(chooser.getByText('Freighter', { exact: true })).toBeVisible();
    for (const wallet of ['xBull', 'LOBSTR', 'WalletConnect', 'HOT']) await expect(chooser.getByText(wallet, { exact: true })).toHaveCount(0);
    const box = await chooser.locator('section').first().boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
    await page.screenshot({ path: `${output}/${width}.png` });
    const diagnostic = { width, beforeClose: await chooser.locator('header button').evaluateAll(buttons => buttons.map(button => ({ text: button.textContent, title: button.title, label: button.getAttribute('aria-label'), svgPath: button.querySelector('path')?.getAttribute('d') }))), clickedAt: new Date().toISOString() };
    report.diagnostics.push(diagnostic);
    await chooser.locator('header button').last().click();
    try { await expect(chooser).toHaveCount(0); }
    catch (error) {
      diagnostic.firstCloseFailed = error.message;
      diagnostic.remainingAfterFirstClick = await chooser.count();
      await page.screenshot({ path: `${output}/${width}-first-close-failed.png` });
      // Preserve the failure. A second click only diagnoses whether the first
      // click was lost while the provider availability check was still pending.
      await chooser.locator('header button').last().click();
      try { await expect(chooser).toHaveCount(0); diagnostic.secondCloseSucceeded = true; }
      catch { diagnostic.secondCloseSucceeded = false; }
      throw error;
    }
    await expect(page.getByRole('button', { name: 'Connect wallet', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Lock the pot', exact: true })).toBeDisabled();
    report.checks.push({ width, chooserOpened: true, expectedProviders: true, cancelRestored: true, writesClosed: true });
  }
  await page.waitForLoadState('networkidle');
  report.status = report.errors.length || report.csp.length ? 'failed' : 'passed';
} catch (error) { report.status = 'failed'; report.failure = { message: error.message, stack: error.stack }; }
finally { await browser.close(); await writeFile(`${output}/results.json`, `${JSON.stringify(report, null, 2)}\n`); }
console.log(JSON.stringify(report));
if (report.status !== 'passed') process.exitCode = 1;
