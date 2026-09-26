import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { chromium } from '@playwright/test';

const out = path.resolve('artifacts/research/2026-09-25-crypto-design/interactions');
fs.mkdirSync(out, { recursive: true });
const report = { date: new Date().toISOString(), method: 'Serial read-only reference-app interactions. No wallet connection, signing or transaction submission. Errors retained. Software browser; no performance conclusions.', sessions: [] };
const save = () => fs.writeFileSync(path.join(out, 'interactions.json'), JSON.stringify(report, null, 2));
const browser = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
let context, page, session;
const locator = c => c.placeholder ? page.getByPlaceholder(c.placeholder, { exact: true }) : c.role ? page.getByRole(c.role, { name: c.name, exact: true }) : page.getByText(c.text, { exact: true });
const snapshot = async name => {
  const file = `${session.id}-${session.width}-${name}.png`;
  await page.screenshot({ path: path.join(out, file), timeout: 15000 });
  const body = (await page.locator('body').innerText()).slice(0, 12000);
  const controls = await page.locator('a,button,input,select,[role="option"]').evaluateAll(els => els.filter(e => e.getBoundingClientRect().width && e.getBoundingClientRect().height).map(e => ({ tag: e.tagName, role: e.getAttribute('role'), text: (e.innerText || e.getAttribute('aria-label') || e.getAttribute('placeholder') || '').trim().slice(0, 100), href: e.getAttribute('href'), placeholder: e.getAttribute('placeholder') })).slice(0, 130));
  session.states.push({ name, file, url: page.url(), body, controls }); save();
  console.log(JSON.stringify({ name, file, url: page.url(), body: body.slice(0, 700), controls: controls.slice(0, 35) }));
};
console.log('READY');
try {
  for await (const line of readline.createInterface({ input: process.stdin, crlfDelay: Infinity })) {
    if (!line.trim()) continue;
    const command = JSON.parse(line);
    try {
      if (command.action === 'open') {
        if (context) await context.close();
        session = { id: command.id, width: command.width ?? 1440, actions: [], states: [], errors: [], failedRequests: [], badResponses: [] }; report.sessions.push(session);
        context = await browser.newContext({ viewport: { width: session.width, height: session.width < 700 ? 844 : 1000 }, deviceScaleFactor: 1, isMobile: session.width < 700, hasTouch: session.width < 700 });
        page = await context.newPage(); page.setDefaultTimeout(8000);
        page.on('pageerror', e => session.errors.push({ message: e.message }));
        page.on('console', m => { if (m.type() === 'error') session.errors.push({ message: m.text(), location: m.location() }); });
        page.on('requestfailed', r => session.failedRequests.push({ url: r.url(), error: r.failure()?.errorText }));
        page.on('response', r => { if (r.status() >= 400) session.badResponses.push({ url: r.url(), status: r.status() }); });
        try { await page.goto(command.url, { waitUntil: 'domcontentloaded', timeout: 30000 }); } catch (e) { session.errors.push({ navigation: e.message }); }
        await page.waitForTimeout(command.wait ?? 6000);
      } else if (command.action === 'click') await locator(command).first().click();
      else if (command.action === 'fill') await locator(command).fill(command.value);
      else if (command.action === 'key') await page.keyboard.press(command.key);
      else if (command.action === 'wait') await page.waitForTimeout(command.ms);
      else if (command.action === 'close') break;
      session.actions.push(command);
      if (command.after) await page.waitForTimeout(command.after);
      if (command.snapshot) await snapshot(command.snapshot);
      else save();
    } catch (e) { session.errors.push({ action: command, error: e.message }); save(); console.log(JSON.stringify({ actionError: e.message })); }
  }
} finally { if (context) await context.close(); await browser.close(); save(); console.log('BROWSER CLOSED'); }
