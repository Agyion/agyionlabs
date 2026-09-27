import { settleRenderedPage } from './lib/browser-settle.mjs';
/** Isolated layout fixtures, not transaction history or network verification.
 * Seeds two unsigned, clearly labelled records in fresh local preview contexts.
 * Only opens their details. Never connects a wallet, signs, exports or submits.
 */
import fs from 'node:fs'
import path from 'node:path'
import { chromium, expect } from '@playwright/test'

const BASE = (process.env.BASE_URL || 'http://127.0.0.1:4292').replace(/\/$/, '')
const ORIGIN = new URL(BASE).origin
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(BASE).hostname)) {
  throw new Error('Synthetic records may only be seeded in an isolated local preview context')
}
const OUTPUT = path.resolve(process.env.QA_OUTPUT_DIR || 'artifacts/verification/2026-09-27-ledger-long-amounts')
const WIDTHS = (process.env.QA_WIDTHS || '320,390,768,1440').split(',').map(Number)
if (WIDTHS.some(width => !Number.isInteger(width) || width < 280)) throw new Error('Invalid viewport matrix')
const executablePath = [process.env.CHROMIUM_PATH, '/opt/google/chrome/chrome', chromium.executablePath()].find(candidate => candidate && fs.existsSync(candidate))
if (!executablePath) throw new Error('Chromium not found')

const fixtures = [
  { seq: 1, amount: (2n ** 127n - 1n).toString(), bound: 'i128 maximum' },
  { seq: 2, amount: (-(2n ** 127n)).toString(), bound: 'i128 minimum' },
].map(({ seq, amount, bound }) => ({
  seq,
  ts: '2026-09-27T12:00:00.000Z',
  ledger: null,
  template: 'pod',
  action: 'synthetic_layout_fixture',
  refId: `layout-${seq}`,
  amount,
  status: 'recorded',
  detail: `SYNTHETIC QA FIXTURE: ${bound}. Layout check only. Not a transaction, wallet balance or network verification.`,
  txHash: null,
}))
const display = minor => {
  const value = BigInt(minor), absolute = value < 0n ? -value : value
  const whole = (absolute / 10000000n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const fraction = (absolute % 10000000n).toString().padStart(7, '0').replace(/0+$/, '')
  return `${value < 0n ? '-' : ''}${whole}${fraction ? `.${fraction.padEnd(2, '0')}` : ''} USDC`
}
fs.mkdirSync(OUTPUT, { recursive: true })
const report = {
  base: BASE, startedAt: new Date().toISOString(), status: 'running', uiStatus: 'running', diagnosticStatus: 'running',
  fixtureOnly: true, widths: WIDTHS, fixtures, checks: [], pages: [], screenshots: [],
  limits: 'Synthetic unsigned records in newly created local browser contexts only. Tests display and detail expansion, not transaction validity, wallet balances, network confirmation or physical-device rendering speed. All external request failures remain in the strict diagnostic result.',
}
const persist = () => fs.writeFileSync(path.join(OUTPUT, 'results.json'), JSON.stringify(report, null, 2))
const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })

async function check(name, work) {
  const item = { name, pass: false }; report.checks.push(item)
  try { item.evidence = await work(); item.pass = true; console.log(`PASS ${name}`) }
  catch (error) { item.error = error.stack || error.message; console.log(`FAIL ${name}: ${error.message}`) }
  finally { persist() }
}

async function settle(page) { await settleRenderedPage(page) }

async function horizontalFit(locator) {
  const result = await locator.evaluate(element => {
    const rect = element.getBoundingClientRect(), tolerance = 1.5
    const amount = element.matches('.ledger-entry__amount') ? element : null
    const range = document.createRange(); range.selectNodeContents(element)
    const textRects = [...range.getClientRects()].filter(box => box.width > 0 && box.height > 0).map(box => ({ left: box.left, right: box.right, top: box.top, bottom: box.bottom }))
    const ancestors = []
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      const css = getComputedStyle(parent), box = parent.getBoundingClientRect()
      if (/(hidden|clip|auto|scroll)/.test(css.overflowX)) ancestors.push({ className: parent.className, left: box.left, right: box.right })
    }
    const boundaries = [{ className: 'element', left: rect.left, right: rect.right }, { className: 'viewport', left: 0, right: innerWidth }, ...ancestors]
    const clippedText = textRects.filter(box => boundaries.some(boundary => box.left < boundary.left - tolerance || box.right > boundary.right + tolerance))
    return {
      text: element.textContent?.trim(), width: rect.width, left: rect.left, right: rect.right,
      viewport: innerWidth, documentWidth: document.documentElement.scrollWidth,
      scrollWidth: element.scrollWidth, clientWidth: element.clientWidth,
      textRects, lineCount: new Set(textRects.map(box => Math.round(box.top))).size,
      clippedText, boundaries, isAmount: !!amount,
    }
  })
  expect(result.documentWidth, 'Page must not overflow horizontally').toBeLessThanOrEqual(result.viewport + 1)
  expect(result.width).toBeGreaterThan(0)
  expect(result.left).toBeGreaterThanOrEqual(-1.5)
  expect(result.right).toBeLessThanOrEqual(result.viewport + 1.5)
  expect(result.scrollWidth, 'Text must fit its own box').toBeLessThanOrEqual(result.clientWidth + 1)
  expect(result.clippedText, 'Every rendered text line must fit its clipping ancestors').toEqual([])
  return result
}

try {
  for (const width of WIDTHS) {
    const context = await browser.newContext({ viewport: { width, height: width < 600 ? 900 : 1000 }, deviceScaleFactor: 1, isMobile: width < 600, hasTouch: width < 600, reducedMotion: 'reduce' })
    const page = await context.newPage(); page.setDefaultTimeout(15000)
    const diagnostics = { width, pageErrors: [], consoleErrors: [], warnings: [], requestFailures: [], httpErrors: [], csp: [], externalRequests: [], rpcMethods: [], prohibitedRequests: [], unclassifiedPosts: [] }
    report.pages.push(diagnostics)
    const isExternal = url => /^https?:/.test(url) && new URL(url).origin !== ORIGIN
    page.on('pageerror', error => diagnostics.pageErrors.push(error.message))
    page.on('console', message => {
      const item = { text: message.text(), location: message.location() }
      if (message.type() === 'error') diagnostics.consoleErrors.push(item)
      else if (message.type() === 'warning') diagnostics.warnings.push(item)
    })
    page.on('requestfailed', request => diagnostics.requestFailures.push({ url: request.url(), external: isExternal(request.url()), error: request.failure()?.errorText }))
    page.on('response', response => { if (response.status() >= 400) diagnostics.httpErrors.push({ url: response.url(), external: isExternal(response.url()), status: response.status() }) })
    page.on('request', request => {
      if (isExternal(request.url())) diagnostics.externalRequests.push({ url: request.url(), method: request.method() })
      if (['GET', 'HEAD'].includes(request.method())) return
      let body; try { body = request.postDataJSON() } catch { /* Record method only, not request bodies. */ }
      const rpcMethod = body && typeof body.method === 'string' ? body.method : null
      const item = { url: request.url(), method: request.method(), rpcMethod }
      if (rpcMethod) diagnostics.rpcMethods.push(item); else diagnostics.unclassifiedPosts.push(item)
      if (/^(sendTransaction|submitTransaction|submit_transaction)$/i.test(rpcMethod || '') || /\/transactions\/?$/.test(new URL(request.url()).pathname)) diagnostics.prohibitedRequests.push(item)
    })
    await page.exposeBinding('__ledgerCsp', (_source, event) => diagnostics.csp.push(event))
    await page.addInitScript(({ origin, entries }) => {
      if (location.origin !== origin) return
      // This context has no persistent user profile. Only these unsigned fixtures are stored.
      for (const entry of entries) localStorage.setItem(`agyion.ledger.v2:entry:qa-layout-${entry.seq}`, JSON.stringify({ generation: 'legacy', entry }))
      document.addEventListener('securitypolicyviolation', event => {
        void window.__ledgerCsp({ blockedURI: event.blockedURI, directive: event.violatedDirective }).catch(() => {})
      })
    }, { origin: ORIGIN, entries: fixtures })
    try {
      await check(`${width}: synthetic records are visibly local and unsigned`, async () => {
        await page.goto(`${BASE}/app/?tab=ledger`, { waitUntil: 'domcontentloaded' })
        await expect(page.locator('.panel-ledger')).toBeVisible()
        await expect(page.locator('.ledger-entry')).toHaveCount(2)
        await settle(page)
        await expect(page.getByRole('button', { name: 'Connect wallet', exact: true })).toBeVisible()
        await expect(page.locator('.ledger-register__count dd')).toHaveText('2')
        await expect(page.locator('.ledger-register__hashes dd')).toHaveText('0')
        await expect(page.locator('.panel-ledger .instrument-disclosure')).toHaveText('Local history is not chain verification. Exports may be unsigned.')
        return { records: 2, hashes: 0, connected: false, realTransactions: 0 }
      })
      for (const fixture of fixtures) await check(`${width}: signed i128 ${fixture.seq === 1 ? 'maximum' : 'minimum'} remains complete and details expand`, async () => {
        const button = page.locator(`.ledger-entry__button[aria-controls="record-detail-${fixture.seq}"]`)
        const amount = button.locator('.ledger-entry__amount')
        await amount.scrollIntoViewIfNeeded(); await expect(amount).toHaveText(display(fixture.amount))
        await expect(button).toHaveAttribute('aria-label', new RegExp(display(fixture.amount).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
        const collapsed = await horizontalFit(amount)
        if (width < 600) expect(collapsed.lineCount, 'Narrow rows must wrap a maximal amount').toBeGreaterThan(1)
        await button.click(); await expect(button).toHaveAttribute('aria-expanded', 'true')
        const details = page.locator(`#record-detail-${fixture.seq}`)
        await expect(details).toBeVisible(); await settle(page)
        await expect(details).toContainText(fixture.detail)
        await expect(details).toContainText('Transaction hash not recorded')
        await expect(details.locator('a')).toHaveCount(0)
        const expanded = []
        for (const value of await details.locator('dd').all()) expanded.push(await horizontalFit(value))
        const screenshot = path.join(OUTPUT, `${width}-i128-${fixture.seq === 1 ? 'maximum' : 'minimum'}.png`)
        await button.scrollIntoViewIfNeeded(); await page.screenshot({ path: screenshot })
        report.screenshots.push({ file: screenshot, width, fixture: fixture.seq })
        await button.click(); await expect(button).toHaveAttribute('aria-expanded', 'false')
        return { exactDisplay: display(fixture.amount), collapsed, expanded }
      })
      await check(`${width}: fixture inspection never submits a transaction`, async () => {
        await expect(page.getByRole('button', { name: 'Connect wallet', exact: true })).toBeVisible()
        expect(diagnostics.prohibitedRequests).toEqual([])
        expect(diagnostics.unclassifiedPosts).toEqual([])
        return { connected: false, submissionRequests: 0, rpcMethods: [...new Set(diagnostics.rpcMethods.map(request => request.rpcMethod))] }
      })
    } finally { await context.close(); persist() }
  }
} catch (error) {
  report.fatal = error.stack || error.message
} finally {
  await browser.close()
  report.uiStatus = !report.fatal && report.checks.length === WIDTHS.length * 4 && report.checks.every(check => check.pass) ? 'passed' : 'failed'
  const errors = report.pages.some(page => ['pageErrors', 'consoleErrors', 'requestFailures', 'httpErrors', 'csp', 'prohibitedRequests', 'unclassifiedPosts'].some(key => page[key].length))
  report.diagnosticStatus = errors ? 'failed' : 'passed'
  report.status = report.uiStatus === 'passed' && report.diagnosticStatus === 'passed' ? 'passed' : 'failed'
  report.finishedAt = new Date().toISOString(); persist()
  console.log(JSON.stringify({ status: report.status, uiStatus: report.uiStatus, diagnosticStatus: report.diagnosticStatus, checks: report.checks.length, passed: report.checks.filter(check => check.pass).length, output: OUTPUT }, null, 2))
  if (report.status !== 'passed') process.exitCode = 1
}
