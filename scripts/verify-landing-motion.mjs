/** Visual navigation/interaction QA. No wallet connection or transaction. */
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.BASE_URL || 'http://127.0.0.1:4192';
const output = process.env.QA_OUTPUT_DIR || 'artifacts/verification/landing-motion';
const heroOnly = process.env.QA_HERO_ONLY === '1';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', headless: true,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const report = { base, at: new Date().toISOString(), checks: [], errors: [], screenshots: [], status: 'running' };
const shot = async (page, name, fullPage = false) => {
  const file = `${output}/${name}.png`;
  await page.screenshot({ path: file, fullPage, timeout: 60000 });
  report.screenshots.push({ name, file });
};
const check = (name, evidence = {}) => report.checks.push({ name, ...evidence });
const revealPage = async page => {
  const count = await page.locator('[data-reveal]').count();
  for (let i = 0; i < count; i++) {
    await page.locator('[data-reveal]').nth(i).scrollIntoViewIfNeeded();
    await expect(page.locator('[data-reveal]').nth(i)).toHaveClass(/is-revealed/);
    await expect(page.locator('[data-reveal]').nth(i)).toHaveCSS('opacity', '1');
  }
  return count;
};
try {
  for (const width of heroOnly ? [390, 320] : [1440, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: width === 1440 ? 1000 : 844 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push({ width, type: 'page', message: error.message }));
    page.on('console', message => { if (message.type() === 'error') report.errors.push({ width, type: 'console', message: message.text(), location: message.location() }); });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.orbital-scene')).toHaveClass(/is-ready/, { timeout: 30000 });
    await page.evaluate(() => document.fonts.ready);
    await shot(page, `${width}-hero`);
    const wordCount = await page.locator('.orbital-home').evaluate(el => el.innerText.trim().split(/\s+/).filter(Boolean).length);
    // The original homepage had roughly402 visible words; SVG numbers/labels count here too.
    expect(wordCount, 'Visible text should be substantially shorter').toBeLessThan(310);
    check(`${width}: shorter landing`, { wordCount });
    if (heroOnly) {
      const actions = await page.locator('.orbital-actions a').evaluateAll(links => links.map(link => {
        const box = link.getBoundingClientRect();
        return { label: link.textContent.trim(), x: box.x, y: box.y, width: box.width, height: box.height,
          background: getComputedStyle(link).backgroundColor,
          receivesPointer: link.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)) };
      }));
      expect(actions).toHaveLength(2);
      for (const action of actions) {
        expect(action.x).toBeGreaterThanOrEqual(0); expect(action.x + action.width).toBeLessThanOrEqual(width);
        expect(action.height).toBeGreaterThanOrEqual(44); expect(action.receivesPointer).toBe(true);
      }
      expect(Math.abs(actions[0].y - actions[1].y), 'Mobile actions should share one compact row').toBeLessThan(2);
      expect(actions[1].background, 'Secondary action needs a surface over the bright disk').not.toBe('rgba(0, 0, 0, 0)');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      check(`${width}: readable compact mobile actions`, { actions });
      await context.close();
      continue;
    }

    if (width < 700) {
      await page.getByRole('button', { name: 'Open navigation menu' }).click();
      const mobile = page.getByRole('navigation', { name: 'Mobile navigation' });
      await expect(mobile).toBeVisible();
      await shot(page, `${width}-menu`);
      await mobile.getByRole('link', { name: /^Instruments/ }).click();
      await expect(mobile).toBeHidden();
    } else {
      await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Instruments', exact: true }).click();
    }
    await expect(page).toHaveURL(/#instruments$/);
    await expect.poll(() => page.locator('#instruments').evaluate(el => Math.abs(el.getBoundingClientRect().top))).toBeLessThan(180);
    const nav = await page.locator('.orbital-nav').boundingBox();
    expect(nav.y).toBeGreaterThanOrEqual(-1); expect(nav.y + nav.height).toBeLessThan(180);
    check(`${width}: section navigation stays visible`, { nav });

    const explorer = page.locator('.instrument-explorer');
    const tabs = explorer.getByRole('tablist', { name: 'Explore instruments' });
    await expect(tabs.getByRole('tab')).toHaveCount(4);
    for (const slug of ['fade', 'pod', 'trigger', 'envoy']) {
      await page.locator(`#explorer-tab-${slug}`).click();
      await expect(explorer).toHaveAttribute('data-selected', slug);
      const panel = page.locator(`#explorer-panel-${slug}`);
      await expect(panel).toBeVisible();
      await expect(panel.getByRole('link', { name: 'View details', exact: true })).toHaveAttribute('href', `/${slug}`);
      await expect(panel.getByRole('link', { name: /^Open / })).toHaveAttribute('href', `/app/?tab=${slug}`);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await panel.scrollIntoViewIfNeeded();
      await expect(panel.locator('.art-world')).toHaveCSS('opacity', '1');
      await expect(panel.locator('.explorer-copy')).toHaveCSS('opacity', '1');
      if (width !== 320) await shot(page, `${width}-explorer-${slug}`);
    }
    check(`${width}: four visual instruments and native destinations`);
    await page.locator('#explorer-tab-fade').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#explorer-tab-pod')).toBeFocused();
    await expect(explorer).toHaveAttribute('data-selected', 'pod');
    check(`${width}: keyboard product selection`);

    if (width === 1440) {
      const visual = page.locator('#explorer-panel-pod .explorer-visual');
      await visual.scrollIntoViewIfNeeded();
      const bounds = await visual.boundingBox();
      const styles = () => explorer.evaluate(el => [el, ...el.querySelectorAll('[style]')].map(node => node.getAttribute('style')).join('|'));
      await page.mouse.move(bounds.x + bounds.width * .2, bounds.y + bounds.height * .4, { steps: 10 });
      await page.waitForTimeout(400); const left = await styles();
      await shot(page, '1440-pointer-left');
      await page.mouse.move(bounds.x + bounds.width * .8, bounds.y + bounds.height * .6, { steps: 15 });
      await page.waitForTimeout(400); const right = await styles();
      expect(right, 'Pointer position must drive the visual, independently from CSS ambient animation').not.toBe(left);
      await shot(page, '1440-pointer-right');
      check('1440: pointer position changes the visual layer');
    }

    const revealed = await revealPage(page);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForTimeout(500);
    await shot(page, `${width}-full-revealed`, true);
    check(`${width}: all reveal content inspected`, { revealed, height: await page.evaluate(() => document.documentElement.scrollHeight) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await context.close();
  }
  expect(report.errors).toEqual([]);
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.failure = { message: error.message, stack: error.stack };
  throw error;
} finally {
  await browser.close();
  await writeFile(`${output}/results.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, checks: report.checks, errors: report.errors, output }));
}
