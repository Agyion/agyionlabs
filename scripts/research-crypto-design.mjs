import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const out = path.resolve('artifacts/research/2026-09-25-crypto-design');
fs.mkdirSync(out, { recursive: true });
const sites = [
  ['stellar', 'https://stellar.org/'], ['solana', 'https://solana.com/'],
  ['celestia', 'https://celestia.org/'], ['monad', 'https://monad.xyz/'],
  ['aave', 'https://aave.com/'], ['morpho', 'https://morpho.org/'],
  ['cow', 'https://cow.fi/'], ['uniswap', 'https://app.uniswap.org/'],
  ['aave-pro', 'https://pro.aave.com/'], ['morpho-app', 'https://app.morpho.org/vaults'],
  ['cow-swap', 'https://swap.cow.fi/'], ['agyion', 'http://127.0.0.1:4192/'],
];
const requested = process.env.RESEARCH_SITES?.split(',');
const browser = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', headless: true,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const report = { date: new Date().toISOString(), method: 'Read-only browser inspection. No wallet connection or submission. Software rendering; no native GPU performance conclusions. Banners and naturally occurring failures are retained.', sites: [] };
try {
  for (const [id, url] of sites.filter(([id]) => !requested || requested.includes(id))) {
    for (const width of [1440, 390]) {
      const height = width === 1440 ? 1000 : 844;
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: width < 700, hasTouch: width < 700 });
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      const entry = { id, url, width, height, errors: [], shots: [] };
      report.sites.push(entry);
      page.on('pageerror', e => entry.errors.push(e.message.slice(0, 300)));
      try {
        try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }); }
        catch (e) { entry.navigationWarning = e.message.slice(0, 300); }
        await page.waitForTimeout(id === 'agyion' ? 7000 : 3500);
        await page.evaluate(() => Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 3000))]));
        entry.finalUrl = page.url(); entry.title = await page.title();
        entry.body = (await page.locator('body').innerText()).slice(0, 18000);
        entry.controls = await page.locator('a,button,input,select').evaluateAll(els => els.filter(e => e.getBoundingClientRect().width && e.getBoundingClientRect().height).map(e => ({ tag: e.tagName, text: (e.innerText || e.getAttribute('aria-label') || e.getAttribute('placeholder') || '').trim().slice(0,100), href: e.getAttribute('href'), type: e.getAttribute('type') })).slice(0,100));
        const shot = async suffix => { const file = `${id}-${width}-${suffix}.png`; await page.screenshot({ path: path.join(out, file), timeout: 20000 }); entry.shots.push(file); };
        await shot('first');
        if (width === 1440) {
          await page.mouse.move(1050, 480, { steps: 12 });
          await page.waitForTimeout(1200); await shot('motion');
          await page.evaluate(() => window.scrollTo({ top: innerHeight * .82, behavior: 'instant' }));
          await page.waitForTimeout(1800); await shot('next');
        }
        entry.overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      } catch(e) { entry.error = e.message.slice(0, 500); }
      fs.writeFileSync(path.join(out, 'capture-report.json'), JSON.stringify(report, null, 2));
      console.log(JSON.stringify({ id, width, title: entry.title, finalUrl: entry.finalUrl, shots: entry.shots.length, error: entry.error || entry.navigationWarning }));
      await context.close();
    }
  }
} finally { await browser.close(); }
