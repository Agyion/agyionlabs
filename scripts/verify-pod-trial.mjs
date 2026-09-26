/** Public UI only. No wallet, transaction, or simulated settlement. */
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const output = 'artifacts/verification/research-fixes/pod-trial';
await mkdir(output, { recursive: true });
const report = { checks: [], screenshots: [], errors: [], status: 'running' };
const browser = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
try {
  for (const width of [1440, 390, 360]) {
    const context = await browser.newContext({ viewport: { width, height: width > 700 ? 1000 : 844 }, reducedMotion: 'reduce', isMobile: width < 700, hasTouch: width < 700 });
    const page = await context.newPage();
    page.on('pageerror', e => report.errors.push({ width, kind: 'page', message: e.message }));
    page.on('console', e => { if (e.type() === 'error') report.errors.push({ width, kind: 'console', message: e.text() }); });
    page.on('requestfailed', r => report.errors.push({ width, kind: 'network', url: r.url(), message: r.failure()?.errorText }));
    for (const source of ['home', 'detail']) {
      await page.goto(`http://127.0.0.1:4192/${source === 'detail' ? 'pod' : '#instruments'}`);
      await expect(page.locator('.orbital-scene')).toHaveClass(/is-ready/, { timeout: 60000 });
      if (source === 'home') await page.locator('#exhibit-pod').click();
      const trial = page.getByRole('region', { name: 'Pod interactive example' });
      await expect(trial).toBeVisible();
      await expect(trial).toHaveAttribute('data-stage', '0');
      const checks = trial.getByRole('checkbox');
      await expect(checks).toHaveCount(3);
      const open = trial.getByRole('button', { name: 'Open capsule', exact: true });
      await expect(open).toBeDisabled();
      // Keyboard activation and independent missing-condition behavior.
      await checks.nth(0).focus(); await page.keyboard.press('Space');
      await checks.nth(1).check();
      await expect(open).toBeDisabled();
      await expect(trial).toHaveAttribute('data-stage', '0');
      await checks.nth(2).check();
      await expect(trial).toHaveAttribute('data-stage', '1');
      await expect(open).toBeEnabled();
      const shot = async phase => { const file = `${output}/${width}-${source}-${phase}.png`; await page.screenshot({ path: file, fullPage: true }); report.screenshots.push(file); };
      await shot('ready');
      await open.click();
      await expect(trial).toHaveAttribute('data-stage', '2');
      await shot('opened');
      await checks.nth(0).uncheck();
      await expect(trial).toHaveAttribute('data-stage', '0');
      await expect(trial.getByRole('button', { name: 'Open capsule', exact: true })).toBeDisabled();
      await trial.getByRole('button', { name: 'Reset example', exact: true }).click();
      for (let i = 0; i < 3; i++) await expect(checks.nth(i)).not.toBeChecked();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const launch = source === 'detail' ? page.locator('.detail-world__launch') : page.locator('#instrument-stage a[href="/app/?tab=pod"]');
      await expect(launch).toHaveAttribute('href', '/app/?tab=pod');
      await launch.scrollIntoViewIfNeeded();
      const box = await launch.boundingBox();
      expect(box.width).toBeGreaterThan(44); expect(box.height).toBeGreaterThanOrEqual(44);
      report.checks.push({ width, source, conditions: 'independent', keyboard: 'Space toggles', opening: 'explicit', reset: 'clears all', launch: 'correct destination', overflow: false });
    }
    await context.close();
  }
  report.status = report.errors.length ? 'failed' : 'passed';
} catch (e) { report.errors.push({ kind: 'assertion', message: e.message }); report.status = 'failed'; }
finally { await browser.close(); await writeFile(`${output}/verification.json`, JSON.stringify(report, null, 2)); }
console.log(JSON.stringify(report));
if (report.status !== 'passed') process.exitCode = 1;
