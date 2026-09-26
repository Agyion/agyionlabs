/** Render built documents with external scripts/styles blocked.
 * This failure fixture tests the CSS-independent canvas, not flight/GPU smoothness.
 */
import http from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';

const output = path.resolve(process.env.PAINT_OUTPUT || 'artifacts/security/2026-09-26/document-paint');
await mkdir(output, { recursive: true });
const documents = new Map(await Promise.all([
  ['/', 'app/site/index.html'], ['/app/', 'app/site/app/index.html'],
].map(async ([route, file]) => [route, await readFile(file, 'utf8')])));
const server = http.createServer((request, response) => {
  const html = documents.get(request.url);
  if (!html) { response.writeHead(404); response.end(); return; }
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(html);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/google/chrome/chrome', headless: true, args: ['--no-sandbox'] });
const report = { fixture: 'built-document-with-external-CSS-and-JS-blocked', cases: [] };
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const blocked = [];
    const failures = [];
    page.on('requestfailed', request => failures.push({ url: request.url(), reason: request.failure()?.errorText }));
    await page.route('**/*', route => {
      if (route.request().resourceType() === 'document') return route.continue();
      blocked.push({ url: route.request().url(), type: route.request().resourceType() });
      return route.abort('blockedbyclient');
    });
    for (const route of documents.keys()) {
      blocked.length = 0; failures.length = 0;
      await page.goto(base + route, { waitUntil: 'load' });
      await expect.poll(() => page.evaluate(() => document.documentElement && getComputedStyle(document.documentElement).backgroundColor)).toBe('rgb(7, 9, 13)');
      const state = await page.evaluate(() => ({ background: getComputedStyle(document.documentElement).backgroundColor, scheme: getComputedStyle(document.documentElement).colorScheme, sheets: [...document.styleSheets].map(sheet => {
        try { return { href: sheet.href, rules: sheet.cssRules.length }; }
        catch (error) { return { href: sheet.href, rules: null, error: error.name }; }
      }) }));
      console.log(JSON.stringify({ route, viewport, state }));
      expect(state.background).toBe('rgb(7, 9, 13)');
      expect(state.scheme).toBe('dark');
      expect(state.sheets.filter(sheet => sheet.href && sheet.rules > 0)).toEqual([]);
      for (const sheet of state.sheets.filter(sheet => sheet.href)) expect(blocked.some(resource => resource.url === sheet.href && resource.type === 'stylesheet')).toBe(true);
      expect(blocked.some(resource => resource.type === 'stylesheet')).toBe(true);
      const screenshot = path.join(output, `${route === '/' ? 'landing' : 'app'}-${viewport.width}.png`);
      await page.screenshot({ path: screenshot });
      report.cases.push({ route, viewport, state, screenshot, intentionallyBlocked: [...blocked], expectedRequestFailures: [...failures] });
    }
    await context.close();
  }
  await writeFile(path.join(output, 'verification.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
