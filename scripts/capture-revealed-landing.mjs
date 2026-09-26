/** Scroll each section into view before capturing the complete landing page. */
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const output = process.argv[2] || 'artifacts/verification/final-landing';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/opt/google/chrome/chrome', headless: true,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
});
const checks = [];
let failure = null;
try {
  for (const width of [360, 1440]) {
    const height = width === 360 ? 800 : 1000;
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: 'no-preference' });
    const page = await context.newPage();
    const errors = [], requestFailures = [], seen = new Set(), visibleChecks = [];
    const check = { width, height, visibleChecks, errors, requestFailures };
    checks.push(check);
    page.on('pageerror', error => errors.push({ type: 'pageerror', message: error.message }));
    page.on('console', message => {
      if (message.type() === 'error') errors.push({ type: 'console', message: message.text(), location: message.location() });
    });
    page.on('requestfailed', request => requestFailures.push({ url: request.url(), error: request.failure()?.errorText }));
    await page.goto('http://127.0.0.1:4192/');
    await expect(page.locator('.orbital-scene')).toHaveClass(/is-ready/, { timeout: 30000 });
    await page.evaluate(() => document.fonts.ready);
    const rows = page.locator('.orbital-instrument,.orbital-process__steps li');
    const rowCount = await rows.count();
    expect(rowCount, 'Four instruments and three process rows are present').toBe(7);
    const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    check.pageHeight = pageHeight;
    for (let y = 0; y < pageHeight; y += Math.round(height * .75)) {
      await page.evaluate(top => window.scrollTo({ top, behavior: 'instant' }), y);
      await page.waitForTimeout(300);
      const visible = await rows.evaluateAll(elements => elements.map((element, index) => {
        const rect = element.getBoundingClientRect(), center = rect.top + rect.height / 2;
        return {
          index, inViewport: center >= 0 && center <= innerHeight,
          revealed: element.classList.contains('is-revealed'),
          opacity: Number(getComputedStyle(element).opacity),
          title: element.querySelector('h3')?.textContent,
        };
      }).filter(item => item.inViewport));
      for (const item of visible) {
        seen.add(item.index);
        expect(item.revealed).toBe(true);
        // The observer and stagger may start on a later paint on SwiftShader.
        // Verify the completed reveal while the row is still in the viewport.
        await expect(rows.nth(item.index)).toHaveCSS('opacity', '1');
        const settledOpacity = await rows.nth(item.index).evaluate(element => Number(getComputedStyle(element).opacity));
        visibleChecks.push({ ...item, settledOpacity });
      }
    }
    check.observedRows = seen.size;
    expect(seen.size, 'Each instrument and process row was visibly revealed in the viewport').toBe(rowCount);
    const revealItems = page.locator('[data-reveal]');
    check.allReveals = await revealItems.count();
    for (let index = 0; index < check.allReveals; index++) {
      await expect(revealItems.nth(index)).toHaveClass(/is-revealed/);
      await expect(revealItems.nth(index)).toHaveCSS('opacity', '1');
    }
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${output}/landing-${width}-revealed.png`, fullPage: true, timeout: 60000 });
    expect(errors).toEqual([]);
    expect(requestFailures).toEqual([]);
    await context.close();
  }
  console.log(JSON.stringify({ output, checks: checks.map(({ visibleChecks, ...check }) => check) }));
} catch (error) {
  failure = { message: error.message, stack: error.stack };
  throw error;
} finally {
  try { await writeFile(`${output}/revealed-results.json`, JSON.stringify({ checks, failure }, null, 2)); }
  finally { await browser.close(); }
}
