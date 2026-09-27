import { settleRenderedPage } from './lib/browser-settle.mjs';
/** Actual assembled-site UI checks. No wallet connection, signing or transaction.
 * The reduced-motion matrix checks structure at three widths. Separate normal-motion
 * cases wait for real transitions and capture their intermediate and settled states.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { chromium, expect } from '@playwright/test'
import { auditRenderedTypography } from './lib/typography-audit.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BASE = (process.env.BASE_URL || 'http://127.0.0.1:4292').replace(/\/$/, '')
const SCOPE = process.env.QA_SCOPE || 'all'
if (!['all', 'app', 'landing'].includes(SCOPE)) throw new Error('Invalid QA_SCOPE')
const OUTPUT = path.resolve(process.env.QA_OUTPUT_DIR || 'artifacts/verification/2026-09-27-workspace-redesign')
const WIDTHS = (process.env.QA_WIDTHS || '1440,390,320').split(',').map(Number)
const MOTION_WIDTHS = (process.env.QA_MOTION_WIDTHS || '1440,390').split(',').filter(Boolean).map(Number)
const PRODUCTS = ['fade', 'pod', 'trigger', 'envoy', 'ramp', 'ledger']
const NAME = { fade: 'Fade', pod: 'Pod', trigger: 'Trigger', envoy: 'Envoy', ramp: 'Ramp', ledger: 'Ledger' }
const WRITE_LABEL = { fade: 'Lock the pot', pod: 'Bury the pod', trigger: 'Lock the escrow', envoy: 'Grant mandate' }
const LABELS = { fade: [/^Start price/, /^Floor price/, /^Pot \(/], pod: [/^Amount \(/, /^Unlock in/], trigger: [/^Amount \(/, /^Beneficiary/, /^Attester pubkey/], envoy: [/^Valid for/, /^Agent key/], ramp: [/^TRY amount/] }
const DRAFT = { fade: { label: /^Start price/, value: '901' }, pod: { label: /^Amount \(/, value: '731.25' }, trigger: { label: /^Amount \(/, value: '143.9' }, envoy: { label: /^Valid for/, value: '47' }, ramp: { label: /^TRY amount/, value: '1250' } }
const SOURCE_FILES = ['scripts/verify-workspace-redesign.mjs', 'scripts/lib/typography-audit.mjs', 'landing/src/pages/Instruments.tsx', 'landing/src/components/DetailWorld.tsx', 'landing/src/components/InstrumentExample.tsx', 'landing/src/components/ExampleArtwork.tsx', 'landing/src/components/instrumentExamples.ts', 'landing/src/styles/product-pages.css', 'landing/src/styles/instrument-surfaces.css', 'landing/src/components/InstrumentObject.tsx', 'app/app/components/app/AppShell.tsx', 'app/app/orbital.css', 'app/app/console-surface.css', 'app/app/instrument-workspaces.css', ...PRODUCTS.map(id => `app/app/components/app/${NAME[id]}Panel.tsx`)]
const hashes = () => SOURCE_FILES.filter(file => fs.existsSync(path.join(ROOT, file))).map(file => ({ file, sha256: createHash('sha256').update(fs.readFileSync(path.join(ROOT, file))).digest('hex') }))
if ([...WIDTHS, ...MOTION_WIDTHS].some(width => !Number.isInteger(width) || width < 280)) throw new Error('Invalid viewport matrix')
const executablePath = [process.env.CHROMIUM_PATH, '/opt/google/chrome/chrome', chromium.executablePath()].find(candidate => candidate && fs.existsSync(candidate))
if (!executablePath) throw new Error('Chromium not found')
fs.mkdirSync(OUTPUT, { recursive: true })
const report = { base: BASE, scope: SCOPE, output: OUTPUT, startedAt: new Date().toISOString(), status: 'running', uiStatus: 'running', diagnosticStatus: 'running', widths: WIDTHS, normalMotionWidths: MOTION_WIDTHS, sourcesAtStart: hashes(), checks: [], pages: [], screenshots: [], limits: 'Fresh disconnected contexts. Editing unsigned drafts and opening panels only. The six detail pages exercise their first step and reset; full stories have a separate verify-instrument-examples.mjs matrix. All browser/CSP/HTTP/request diagnostics are retained and fail the strict diagnostic result, including external RPC failures. Such failures do not abort subsequent UI cases. SwiftShader and touch emulation do not establish physical-device frame rate.' }
report.typography = []
const persist = () => fs.writeFileSync(path.join(OUTPUT, 'results.json'), JSON.stringify(report, null, 2))
const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
let page, diagnostic
async function check(name, work) {
  const item = { name, pass: false }; report.checks.push(item)
  try { item.evidence = await work(); item.pass = true; console.log(`PASS ${name}`) }
  catch (error) { item.error = error.stack || error.message; console.log(`FAIL ${name}: ${error.message}`); await capture(`failure-${report.checks.length}`).catch(() => {}) }
  finally { persist() }
  return item.pass
}
async function trackedPage(context, label) {
  page = await context.newPage(); page.setDefaultTimeout(12000)
  diagnostic = { label, pageErrors: [], consoleErrors: [], warnings: [], requestFailures: [], httpErrors: [], csp: [], externalRequests: [], rpcMethods: [], prohibitedRequests: [], unclassifiedPosts: [] }
  report.pages.push(diagnostic); const entry = diagnostic
  const external = url => /^https?:/.test(url) && new URL(url).origin !== new URL(BASE).origin
  page.on('pageerror', error => entry.pageErrors.push({ url: page.url(), message: error.message }))
  page.on('console', message => {
    const item = { url: page.url(), message: message.text(), location: message.location() }
    if (message.type() === 'error') entry.consoleErrors.push(item)
    else if (message.type() === 'warning') entry.warnings.push(item)
  })
  page.on('requestfailed', request => entry.requestFailures.push({ url: request.url(), external: external(request.url()), error: request.failure()?.errorText }))
  page.on('response', response => { if (response.status() >= 400) entry.httpErrors.push({ url: response.url(), external: external(response.url()), status: response.status() }) })
  page.on('request', request => {
    if (external(request.url())) entry.externalRequests.push({ url: request.url(), method: request.method() })
    if (request.method() === 'GET' || request.method() === 'HEAD') return
    let body; try { body = request.postDataJSON() } catch { /* Diagnostic only. Never expose request bodies or keys. */ }
    const rpcMethod = body && typeof body.method === 'string' ? body.method : null
    const item = { url: request.url(), httpMethod: request.method(), rpcMethod }
    if (rpcMethod) entry.rpcMethods.push(item); else entry.unclassifiedPosts.push(item)
    if (/^(sendTransaction|submitTransaction|submit_transaction)$/i.test(rpcMethod || '') || /\/transactions\/?$/.test(new URL(request.url()).pathname)) entry.prohibitedRequests.push(item)
  })
  await page.exposeBinding('__workspaceCsp', (_source, event) => entry.csp.push(event))
  await page.addInitScript(() => document.addEventListener('securitypolicyviolation', event => {
    void window.__workspaceCsp({ url: location.href, blockedURI: event.blockedURI, directive: event.violatedDirective }).catch(() => {})
  }))
  return page
}
async function capture(name, fullPage = false) {
  const file = path.join(OUTPUT, `${diagnostic.label.replace(/[^a-z0-9-]/gi, '-')}-${name}.png`)
  await page.screenshot({ path: file, fullPage, timeout: 45000 })
  report.screenshots.push({ file, url: page.url(), width: page.viewportSize().width })
}
async function settle(selector = '.station-workspace') { await settleRenderedPage(page, { selector }) }

async function typography(label, scope = 'body', options = {}) {
  const result = await page.locator(scope).evaluate(auditRenderedTypography, options)
  report.typography.push({ label, url: page.url(), width: page.viewportSize().width, ...result })
  persist()
  return result
}
async function fit(scope) {
  const result = await scope.evaluate(element => {
    const box = element.getBoundingClientRect()
    const visible = child => child.getClientRects().length && getComputedStyle(child).visibility !== 'hidden' && !child.closest('[hidden], [aria-hidden="true"]')
    const clipped = [...element.querySelectorAll('input:not([type=checkbox]),textarea,select,button,summary,h1,h2,h3,h4,p,dt,dd')].filter(visible).flatMap(child => {
      if (child.classList.contains('sr-only')) return []
      const rect = child.getBoundingClientRect()
      const textOverflow = !(child instanceof HTMLInputElement || child instanceof HTMLTextAreaElement) && child.scrollWidth > child.clientWidth + 2 && child.clientWidth > 0
      return rect.left < box.left - 2 || rect.right > box.right + 2 || textOverflow ? [{ tag: child.tagName, text: child.textContent?.trim().slice(0, 120), left: rect.left, right: rect.right, width: rect.width, scrollWidth: child.scrollWidth, clientWidth: child.clientWidth }] : []
    })
    return { viewport: innerWidth, documentWidth: document.documentElement.scrollWidth, box: { left: box.left, right: box.right, top: box.top, bottom: box.bottom }, clipped }
  })
  expect(result.documentWidth, 'No horizontal page overflow').toBeLessThanOrEqual(result.viewport + 1)
  expect(result.box.left).toBeGreaterThanOrEqual(-1); expect(result.box.right).toBeLessThanOrEqual(result.viewport + 1)
  expect(result.clipped, 'Text and controls must remain inside their surface').toEqual([])
  return result
}
async function reachable(control) {
  await control.scrollIntoViewIfNeeded()
  await expect(control).toBeVisible()
  const result = await control.evaluate(element => {
    const r = element.getBoundingClientRect()
    const x = r.left + r.width / 2, y = r.top + r.height / 2
    const hits = document.elementsFromPoint(x, y)
    const top = hits[0]
    let withinClip = x >= 0 && x <= innerWidth && y >= 0 && y <= innerHeight
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      const css = getComputedStyle(parent), b = parent.getBoundingClientRect()
      if (/(hidden|auto|scroll|clip)/.test(css.overflowX) && (x < b.left || x > b.right)) withinClip = false
      if (/(hidden|auto|scroll|clip)/.test(css.overflowY) && (y < b.top || y > b.bottom)) withinClip = false
    }
    return { text: element.textContent?.trim().slice(0, 120) || element.getAttribute('aria-label'), width: r.width, height: r.height, withinClip, uncovered: !!top && (top === element || element.contains(top)), obstruction: top?.className || top?.tagName }
  })
  expect(result.width).toBeGreaterThan(12); expect(result.height).toBeGreaterThanOrEqual(30)
  expect(result.withinClip, JSON.stringify(result)).toBe(true)
  expect(result.uncovered, JSON.stringify(result)).toBe(true)
  return result
}
async function returnTop() {
  await page.locator('.station-drawer-scroll').evaluate(element => { element.scrollTop = 0 })
  await page.locator('.station-workspace').evaluate(element => { element.scrollTop = 0 })
  await settle()
}
async function openPanel(id) {
  const tab = page.locator(`#tab-${id}`)
  await tab.click(); await expect(tab).toHaveAttribute('aria-selected', 'true')
  const panel = page.locator(`#panel-${id}`)
  await expect(panel).toBeVisible(); await expect(page.locator('.station-workspace')).toHaveAttribute('data-instrument', id)
  await settle(); return panel
}
async function appReady() {
  await expect(page.locator('.station-app')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Connect wallet', exact: true })).toBeVisible()
  await expect(page.locator('.orbital-backdrop')).toHaveClass(/is-ready/, { timeout: 60000 })
  await expect(page.locator('.station-app')).not.toHaveClass(/station-arriving/)
}
async function checkDisconnected(id, panel) {
  await expect(page.getByRole('button', { name: 'Connect wallet', exact: true })).toBeVisible()
  if (WRITE_LABEL[id]) {
    const action = panel.getByRole('button', { name: WRITE_LABEL[id], exact: true })
    await expect(action).toBeDisabled()
    const readiness = page.locator('main.station-app')
    await expect(readiness).toHaveAttribute('data-protocol-readiness', /^(ready|unavailable|incompatible)$/, { timeout: 20000 })
    const status = await readiness.getAttribute('data-protocol-readiness')
    if (status !== 'ready') await expect(action).toHaveAttribute('aria-describedby', 'protocol-availability')
    return { status, action: WRITE_LABEL[id], disabled: true, layout: await reachable(action) }
  }
  if (id === 'ramp') {
    await expect(panel.getByRole('button', { name: 'Get deposit instructions', exact: true })).toBeDisabled()
    await expect(panel.getByRole('button', { name: 'Connect to anchor (SEP-10)', exact: true })).toBeDisabled()
    return { disabled: ['Get deposit instructions', 'Connect to anchor (SEP-10)'] }
  }
  await expect(panel.getByRole('heading', { name: 'No activity recorded yet', exact: true })).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Clear history', exact: true })).toBeDisabled()
  return { records: 0, disabled: ['Clear history'] }
}
try {
  for (const width of WIDTHS) {
    const context = await browser.newContext({ viewport: { width, height: width < 600 ? 900 : 1000 }, deviceScaleFactor: 1, isMobile: width < 600, hasTouch: width < 600, reducedMotion: 'reduce' })
    await trackedPage(context, `${width}-reduced`)
    if (SCOPE !== 'app') {
    await check(`${width}: catalog contains six concrete, usable product links`, async () => {
      await page.goto(`${BASE}/instruments`, { waitUntil: 'domcontentloaded' })
      await expect(page.locator('#directory-title')).toBeVisible(); await settle('.instrument-collection')
      const links = page.locator('nav[aria-label="Choose an instrument"] a[href]')
      await expect(links).toHaveCount(6)
      expect(await links.evaluateAll(items => items.map(item => item.getAttribute('href')))).toEqual(PRODUCTS.map(id => `/${id}`))
      expect(await page.locator('body').innerText()).not.toMatch(/Agyion instruments/i)
      for (const link of await links.all()) {
        await expect(link.locator('h2')).toBeVisible(); await expect(link.locator('svg.instrument-object')).toHaveCount(1)
        await reachable(link)
      }
      const result = await fit(page.locator('.instrument-collection')); await page.evaluate(() => scrollTo(0, 0)); await typography('catalog'); await capture('catalog', true); return result
    })
    for (const id of PRODUCTS) await check(`${width}: ${NAME[id]} detail opens from its real catalog link and keeps its example`, async () => {
      await page.goto(`${BASE}/instruments`, { waitUntil: 'domcontentloaded' })
      await page.locator(`nav[aria-label="Choose an instrument"] a[href="/${id}"]`).click()
      await expect(page).toHaveURL(new RegExp(`/${id}/?(?:[#?].*)?$`))
      const article = page.locator(`article[data-instrument="${id}"]`)
      await expect(article).toBeVisible(); await settle('article')
      await expect(article.locator('h1')).toHaveAccessibleName(NAME[id])
      await expect(article.locator('.product-launch')).toHaveAttribute('href', `/app/?tab=${id}`)
      expect(await page.locator('body').innerText()).not.toMatch(/Agyion instruments/i)
      await fit(article); await capture(`detail-${id}-hero`)
      const example = article.locator(`[data-example="${id}"]`)
      await expect(example).toHaveAttribute('data-stage', '0')
      await expect(example.locator('svg')).toHaveCount(1)
      await expect(example.locator('.example-action-panel')).toBeVisible()
      await reachable(example.locator('[data-action="next"]'))
      await example.locator('[data-action="next"]').click(); await expect(example).toHaveAttribute('data-stage', '1')
      await example.locator('[data-action="reset"]').click(); await expect(example).toHaveAttribute('data-stage', '0')
      await expect(example.locator('[data-action="next"]')).toBeFocused()
      await example.scrollIntoViewIfNeeded(); await typography(`detail-${id}`); await capture(`detail-${id}-example`)
      return { route: new URL(page.url()).pathname, firstStep: true, reset: true }
    })
    }
    if (SCOPE === 'landing') { await context.close(); continue }
    await check(`${width}: app renders the real disconnected workspace`, async () => {
      await page.goto(`${BASE}/app/?tab=fade`, { waitUntil: 'domcontentloaded' }); await appReady(); await settle()
      await expect(page.locator('.station-header-nav')).toHaveCount(0)
      expect(await page.locator('.station-dock [role=tab]').count()).toBe(6)
    })
    for (const id of PRODUCTS) await check(`${width}: ${NAME[id]} has real fields, accessible actions and protected writes`, async () => {
      const panel = await openPanel(id)
      await expect(panel.locator('.instrument-panel,.panel-ledger')).toHaveCount(1)
      for (const label of LABELS[id] || []) { const field = panel.getByLabel(label); await expect(field).toBeVisible(); await reachable(field) }
      for (const button of await panel.locator('button:visible').all()) { expect((await button.innerText()).trim() || await button.getAttribute('aria-label')).toBeTruthy(); await reachable(button) }
      const gate = await checkDisconnected(id, panel)
      const layout = await fit(page.locator('.station-workspace'))
      await returnTop()
      await typography(`app-${id}`, '.station-app', { expectedCenters: { 'workspace-heading': 1, [id === 'ledger' ? 'ledger-heading' : 'workbench-heading']: 1, ...(id === 'ledger' ? {} : { 'primary-button': 1 }) } })
      await capture(`app-${id}-top`)
      const actions = id in WRITE_LABEL ? panel.getByRole('button', { name: WRITE_LABEL[id], exact: true }) : id === 'ramp' ? panel.getByRole('button', { name: 'Get deposit instructions', exact: true }) : panel.getByRole('button', { name: 'Download Proof Pack', exact: true })
      await reachable(actions); await capture(`app-${id}-action`)
      if (DRAFT[id]) await panel.getByLabel(DRAFT[id].label).fill(DRAFT[id].value)
      if (id === 'pod') await panel.getByLabel(/^Unlock in/).fill('13')
      if (id === 'trigger') await panel.getByLabel(/^Attester pubkey/).fill('1'.repeat(64))
      if (id === 'envoy') {
        const limits = panel.locator('.envoy-contract-limits'); await limits.locator('summary').click()
        await panel.getByLabel(/^Max per tx/).fill('33'); await panel.getByLabel(/^Daily cap/).fill('120')
        await fit(page.locator('.station-workspace')); await typography('app-envoy-limits', '.station-app'); await capture('app-envoy-limits')
      }
      if (id === 'ramp') {
        await panel.getByRole('button', { name: 'Withdraw', exact: true }).click()
        await panel.getByLabel(/^Amount \(/).fill('42'); await panel.getByLabel(/^Destination IBAN/).fill('TR000000000000000000000000')
        await expect(panel.getByRole('button', { name: 'Register withdrawal', exact: true })).toBeDisabled()
        await reachable(panel.getByRole('button', { name: 'Register withdrawal', exact: true })); await typography('app-ramp-withdrawal', '.station-app'); await capture('app-ramp-withdrawal')
        await panel.getByRole('button', { name: 'Deposit', exact: true }).click()
      }
      return { gate, layout, headings: await panel.locator('h2,h3,h4').allTextContents() }
    })
    for (const id of Object.keys(DRAFT)) await check(`${width}: ${NAME[id]} keeps its unsigned draft after switching instruments`, async () => {
      const panel = await openPanel(id); await expect(panel.getByLabel(DRAFT[id].label)).toHaveValue(DRAFT[id].value)
      if (id === 'pod') await expect(panel.getByLabel(/^Unlock in/)).toHaveValue('13')
      if (id === 'trigger') await expect(panel.getByLabel(/^Attester pubkey/)).toHaveValue('1'.repeat(64))
      if (id === 'envoy') { await expect(panel.getByLabel(/^Max per tx/)).toHaveValue('33'); await expect(panel.getByLabel(/^Daily cap/)).toHaveValue('120') }
      if (id === 'ramp') { await panel.getByRole('button', { name: 'Withdraw', exact: true }).click(); await expect(panel.getByLabel(/^Amount \(/)).toHaveValue('42'); await expect(panel.getByLabel(/^Destination IBAN/)).toHaveValue('TR000000000000000000000000') }
    })
    await check(`${width}: help, Escape, close and reopen retain focus and the ordinary Pod draft`, async () => {
      const panel = await openPanel('pod'); await returnTop()
      const help = page.getByRole('button', { name: 'About Pod', exact: true })
      await reachable(help); await help.click(); await expect(page.locator('#instrument-help')).toBeVisible()
      await settle(); await typography('app-pod-help', '.station-app')
      await page.keyboard.press('Escape'); await expect(page.locator('#instrument-help')).toHaveCount(0); await expect(help).toBeFocused()
      await expect(page.locator('.station-workspace')).toBeVisible()
      await page.keyboard.press('Escape'); await expect(page.locator('.station-workspace')).toBeHidden(); await expect(page.locator('#tab-pod')).toBeFocused()
      await page.keyboard.press('Enter'); await expect(panel).toBeVisible(); await settle(); await expect(panel.getByLabel(/^Amount \(/)).toHaveValue('731.25')
      await page.getByRole('button', { name: 'Close instrument', exact: true }).click(); await expect(page.locator('.station-workspace')).toBeHidden(); await expect(page.locator('#tab-pod')).toBeFocused()
      await page.locator('#tab-pod').click(); await expect(panel.getByLabel(/^Amount \(/)).toHaveValue('731.25')
    })
    await check(`${width}: no wallet connected and no transaction submitted`, async () => {
      await expect(page.getByRole('button', { name: 'Connect wallet', exact: true })).toBeVisible(); expect(diagnostic.prohibitedRequests).toEqual([])
    })
    await context.close()
  }
  for (const width of SCOPE === 'landing' ? [] : MOTION_WIDTHS) {
    const context = await browser.newContext({ viewport: { width, height: width < 600 ? 900 : 1000 }, deviceScaleFactor: 1, isMobile: width < 600, hasTouch: width < 600, reducedMotion: 'no-preference' })
    await trackedPage(context, `${width}-normal`)
    await check(`${width}: normal-motion workspace opens and closes without empty or obstructed content`, async () => {
      await page.goto(`${BASE}/app/`, { waitUntil: 'domcontentloaded' }); await appReady()
      await expect(page.locator('.station-workspace')).toBeHidden(); await capture('orbit')
      await page.locator('#tab-fade').click(); await expect(page.locator('#panel-fade')).toBeVisible()
      const motion = await page.locator('.station-workspace').evaluate(element => ({ opacity: getComputedStyle(element).opacity, transform: getComputedStyle(element).transform, animations: element.getAnimations({ subtree: true }).map(animation => ({ duration: animation.effect?.getComputedTiming().duration, playState: animation.playState })) }))
      await page.waitForTimeout(120); await capture('fade-opening')
      await settle(); await expect(page.locator('#panel-fade').getByLabel(/^Start price/)).toBeVisible(); await capture('fade-settled')
      await reachable(page.locator('#panel-fade').getByRole('button', { name: 'Lock the pot', exact: true }))
      const pod = await openPanel('pod'); await expect(pod.getByLabel(/^Amount \(/)).toBeVisible(); await returnTop(); await capture('pod-settled')
      await page.getByRole('button', { name: 'Close instrument', exact: true }).click(); await expect(page.locator('.station-workspace')).toBeHidden(); await capture('orbit-restored')
      return motion
    })
    await context.close()
  }
  await check('Review source set remains unchanged while the final artifact is checked', async () => {
    report.sourcesAtEnd = hashes(); expect(report.sourcesAtEnd).toEqual(report.sourcesAtStart)
  })
  await check('Visible typography, centering and text clipping meet the reviewed thresholds', async () => {
    const violations = report.typography.flatMap(item => item.violations.map(violation => ({ label: item.label, width: item.width, ...violation })))
    const summary = { surfaces: report.typography.length, examinedTextRuns: report.typography.reduce((sum, item) => sum + item.text.length, 0), violations }
    fs.writeFileSync(path.join(OUTPUT, 'typography.json'), JSON.stringify({ summary, surfaces: report.typography }, null, 2))
    expect(summary.surfaces, 'At least one actual rendered surface was scanned').toBeGreaterThan(0)
    expect(violations, 'Every violation is retained in typography.json; hidden/closed exclusions have recorded reasons').toEqual([])
    return summary
  })
} catch (error) { report.failure = error.stack || error.message }
finally {
  await browser.close()
  const diagnosticKeys = ['pageErrors', 'consoleErrors', 'requestFailures', 'httpErrors', 'csp', 'prohibitedRequests']
  report.diagnosticCounts = Object.fromEntries(diagnosticKeys.map(key => [key, report.pages.reduce((sum, item) => sum + item[key].length, 0)]))
  report.uiStatus = !report.failure && report.checks.length > 0 && report.checks.every(item => item.pass) ? 'passed' : 'failed'
  report.diagnosticStatus = Object.values(report.diagnosticCounts).some(count => count > 0) ? 'failed' : 'passed'
  report.status = report.uiStatus === 'passed' && report.diagnosticStatus === 'passed' ? 'passed' : 'failed'
  report.finishedAt = new Date().toISOString(); persist()
}
console.log(JSON.stringify({ status: report.status, uiStatus: report.uiStatus, diagnosticStatus: report.diagnosticStatus, checks: report.checks.length, failedChecks: report.checks.filter(item => !item.pass).map(item => ({ name: item.name, error: item.error })), diagnosticCounts: report.diagnosticCounts, output: OUTPUT, failure: report.failure }, null, 2))
if (report.status !== 'passed') process.exitCode = 1
