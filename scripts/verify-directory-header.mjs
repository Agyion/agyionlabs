import { settleRenderedPage } from './lib/browser-settle.mjs';
/** Focused directory header placement/preference QA. No wallet or transaction. */
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { chromium, expect } from '@playwright/test'

const BASE = (process.env.BASE_URL || 'http://127.0.0.1:4292').replace(/\/$/, '')
const OUTPUT = path.resolve(process.env.QA_OUTPUT_DIR || 'artifacts/verification/2026-09-27-directory-header')
const WIDTHS = (process.env.QA_WIDTHS || '1440,1001,1000,768,390,320').split(',').map(Number)
const NORMAL_FLIGHT = process.env.QA_NORMAL_FLIGHT !== '0'
if (WIDTHS.some(width => !Number.isInteger(width) || width < 280)) throw new Error('Invalid widths')
const FILES = ['scripts/verify-directory-header.mjs', 'landing/src/components/NavPill.tsx', 'landing/src/pages/Instruments.tsx', 'landing/src/components/FlightPreference.tsx', 'landing/src/styles/flight-preference.css', 'landing/src/styles/orbital.css', 'landing/src/styles/instrument-surfaces.css', 'shared/flight-preference.ts']
const hashes = () => FILES.map(file => ({ file, sha256: createHash('sha256').update(fs.readFileSync(file)).digest('hex') }))
fs.mkdirSync(OUTPUT, { recursive: true })
const report = { base: BASE, normalFlight: NORMAL_FLIGHT, startedAt: new Date().toISOString(), status: 'running', sourcesAtStart: hashes(), checks: [], pages: [], screenshots: [], limits: 'Directory-only placement check at configured widths, saved preference/route roundtrip, actual checked header launch at every width and one unchecked normal flight when1440 is included and QA_NORMAL_FLIGHT is not0. No wallet connection, key generation or transaction. Diagnostics stay strict and are retained through the matrix.' }
const persist = () => fs.writeFileSync(path.join(OUTPUT, 'results.json'), JSON.stringify(report, null, 2))
const browser = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] })
async function settled(page) { await settleRenderedPage(page) }

async function shot(page, name) { const file = path.join(OUTPUT, `${name}.png`); await page.screenshot({ path: file, timeout: 45000 }); report.screenshots.push(file) }
async function appReady(page) {
  await expect(page.locator('.station-app')).toBeVisible()
  await expect(page.locator('.orbital-backdrop')).toHaveClass(/is-ready/, { timeout: 60000 })
  await expect(page.locator('.orbital-canvas')).toHaveAttribute('data-flight-phase', 'interactive', { timeout: 20000 })
  await expect(page.locator('.station-app')).not.toHaveClass(/station-arriving/)
}
try {
  for (const width of WIDTHS) {
    const context = await browser.newContext({ viewport: { width, height: width <= 800 ? 900 : 1000 }, deviceScaleFactor: 1, reducedMotion: 'no-preference', isMobile: width <= 600, hasTouch: width <= 600 })
    const page = await context.newPage(); page.setDefaultTimeout(15000)
    const data = { width, pageErrors: [], consoleErrors: [], requestFailures: [], httpErrors: [], csp: [], events: [], documents: [] }; report.pages.push(data)
    page.on('pageerror', error => data.pageErrors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') data.consoleErrors.push({ message: message.text(), location: message.location() }) })
    page.on('requestfailed', request => data.requestFailures.push({ url: request.url(), error: request.failure()?.errorText }))
    page.on('response', response => { if (response.status() >= 400) data.httpErrors.push({ url: response.url(), status: response.status() }) })
    page.on('request', request => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) data.documents.push({ url: request.url(), at: Date.now() }) })
    await page.exposeBinding('__directoryEvent', (_source, event) => { data.events.push(event); if (event.kind === 'csp') data.csp.push(event) })
    await page.addInitScript(() => {
      const send = event => { void window.__directoryEvent({ url: location.href, at: Date.now(), ...event }).catch(() => {}) }
      let last = ''
      new MutationObserver(() => {
        const state = { kind: 'state', launching: document.documentElement?.classList.contains('is-launching') || false, arriving: Boolean(document.querySelector('.station-arriving')), bridge: Boolean(document.getElementById('agyion-flight-bridge')) }
        const key = JSON.stringify(state); if (key !== last) { last = key; send(state) }
      }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
      document.addEventListener('click', event => { const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null; if (anchor && new URL(anchor.href).pathname === '/app/') send({ kind: 'launch-click' }) }, true)
      document.addEventListener('securitypolicyviolation', event => send({ kind: 'csp', blockedURI: event.blockedURI, directive: event.violatedDirective }))
    })
    const item = { width, pass: false }; report.checks.push(item)
    try {
      await page.goto(`${BASE}/instruments`, { waitUntil: 'domcontentloaded' }); await settled(page)
      const header = page.locator('.orbital-nav'), preference = page.getByRole('checkbox', { name: 'Skip animation', exact: true }), launch = page.getByRole('link', { name: 'Launch app', exact: true })
      await expect(launch).toHaveCount(1); await expect(preference).toHaveCount(1)
      await expect(header.getByRole('link', { name: 'Launch app', exact: true })).toHaveCount(1)
      await expect(header.getByRole('checkbox', { name: 'Skip animation', exact: true })).toHaveCount(1)
      await expect(page.locator('.directory-footer a[href="/app/"],.directory-footer .flight-preference')).toHaveCount(0)
      const measure = () => header.evaluate(element => {
        const box = node => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height } }
        const visible = node => node.getClientRects().length && getComputedStyle(node).display !== 'none'
        const controls = [...element.querySelectorAll('.orbital-brand,.orbital-nav__desktop a,.orbital-nav__launch,.flight-preference,.orbital-nav__toggle')].filter(visible).map(node => {
          const r = box(node), hit = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2)
          return { className: node.className, text: node.textContent.trim(), ...r, fontSize: parseFloat(getComputedStyle(node).fontSize), hit: Boolean(hit && node.contains(hit)) }
        })
        return { header: box(element), title: box(document.getElementById('directory-title')), controls, documentWidth: document.documentElement.scrollWidth, viewport: innerWidth, preferenceTextSize: parseFloat(getComputedStyle(element.querySelector('.flight-preference span')).fontSize) }
      })
      const geometry = await measure(); item.geometry = geometry
      expect(geometry.documentWidth).toBeLessThanOrEqual(width + 1); expect(geometry.preferenceTextSize).toBeGreaterThanOrEqual(14)
      expect(geometry.title.top).toBeGreaterThanOrEqual(geometry.header.bottom - 1)
      for (const control of geometry.controls) {
        expect(control.left).toBeGreaterThanOrEqual(0); expect(control.right).toBeLessThanOrEqual(width); expect(control.hit).toBe(true)
        if (/launch|flight-preference|toggle/.test(control.className)) { expect(control.height).toBeGreaterThanOrEqual(44); expect(control.fontSize).toBeGreaterThanOrEqual(14) }
      }
      for (let i = 0; i < geometry.controls.length; i++) for (let j = i + 1; j < geometry.controls.length; j++) {
        const a = geometry.controls[i], b = geometry.controls[j]
        expect(Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1, `Header controls overlap: ${a.className}/${b.className}`).toBe(false)
      }
      const prefBox = geometry.controls.find(control => control.className.includes('flight-preference')), launchBox = geometry.controls.find(control => control.className.includes('orbital-nav__launch'))
      expect(Math.min(prefBox.bottom, launchBox.bottom) - Math.max(prefBox.top, launchBox.top), 'Preference stays beside the header launch').toBeGreaterThan(20)
      await shot(page, `directory-${width}-header`)
      if (await page.getByRole('button', { name: 'Open navigation menu', exact: true }).isVisible()) {
        await page.getByRole('button', { name: 'Open navigation menu', exact: true }).click(); await settled(page)
        await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toBeVisible(); await shot(page, `directory-${width}-menu`)
        await page.keyboard.press('Escape')
      }
      await page.evaluate(() => scrollTo(0, 500))
      if (width <= 800) { await page.getByRole('button', { name: 'Open navigation menu', exact: true }).click(); await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('link', { name: 'Instruments' }).click() }
      else await header.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Instruments', exact: true }).click()
      await settled(page); await expect(page.locator('#directory-title')).toBeFocused()
      await expect.poll(async () => { const g = await measure(); return g.title.top - g.header.bottom }, { timeout: 10000 }).toBeGreaterThanOrEqual(-1)
      await preference.locator('..').click(); await expect(preference).toBeChecked()
      expect(await page.evaluate(() => localStorage.getItem('agyion:skip-flight'))).toBe('1')
      await page.locator('.orbital-brand').click(); await expect(page).toHaveURL(`${BASE}/`)
      await expect(page.getByRole('checkbox', { name: 'Skip animation', exact: true })).toBeChecked()
      await page.locator('.home-horizon__explore').click(); await expect(page).toHaveURL(`${BASE}/instruments`)
      await expect(preference).toBeChecked(); await expect(preference).toHaveCount(1)
      const eventStart = data.events.length, documentStart = data.documents.length
      await launch.click(); await expect(page).toHaveURL(`${BASE}/app/`); await appReady(page)
      const events = data.events.slice(eventStart), click = events.find(event => event.kind === 'launch-click'), request = data.documents.slice(documentStart).find(request => new URL(request.url).pathname === '/app/')
      expect(click).toBeTruthy(); expect(request).toBeTruthy(); item.skipRequestDelayMs = request.at - click.at; expect(item.skipRequestDelayMs).toBeLessThan(3000)
      expect(events.some(event => event.launching || event.arriving || event.bridge)).toBe(false)
      await expect(page.getByRole('button', { name: 'Connect wallet', exact: true })).toBeVisible(); await shot(page, `directory-${width}-skip-arrival`)
      if (width === 1440 && NORMAL_FLIGHT) {
        await page.goto(`${BASE}/instruments`, { waitUntil: 'domcontentloaded' }); await preference.uncheck(); expect(await page.evaluate(() => localStorage.getItem('agyion:skip-flight'))).toBe('0')
        const eventStart = data.events.length, documentStart = data.documents.length
        await launch.click(); await expect(page.locator('html')).toHaveClass(/is-launching/)
        await expect(page).toHaveURL(`${BASE}/app/`, { timeout: 25000 }); await appReady(page)
        const click = data.events.slice(eventStart).find(event => event.kind === 'launch-click'), request = data.documents.slice(documentStart).find(request => new URL(request.url).pathname === '/app/')
        item.normalRequestDelayMs = request.at - click.at; expect(item.normalRequestDelayMs).toBeGreaterThanOrEqual(9000); expect(item.normalRequestDelayMs).toBeLessThan(18000)
      }
      item.pass = true; console.log(`PASS ${width}: directory header placement, stored preference and actual launch`)
    } catch (error) { item.error = error.stack || error.message; console.log(`FAIL ${width}: ${error.message}`); await shot(page, `failure-${width}`).catch(() => {}) }
    finally { await context.close(); persist() }
  }
  report.sourcesAtEnd = hashes(); expect(report.sourcesAtEnd).toEqual(report.sourcesAtStart)
} catch (error) { report.failure = error.stack || error.message }
finally {
  await browser.close()
  report.diagnosticCounts = Object.fromEntries(['pageErrors', 'consoleErrors', 'requestFailures', 'httpErrors', 'csp'].map(key => [key, report.pages.reduce((sum, page) => sum + page[key].length, 0)]))
  report.uiStatus = !report.failure && report.checks.length === WIDTHS.length && report.checks.every(check => check.pass) ? 'passed' : 'failed'
  report.diagnosticStatus = Object.values(report.diagnosticCounts).some(count => count > 0) ? 'failed' : 'passed'
  report.status = report.uiStatus === 'passed' && report.diagnosticStatus === 'passed' ? 'passed' : 'failed'
  report.finishedAt = new Date().toISOString(); persist()
}
console.log(JSON.stringify({ status: report.status, uiStatus: report.uiStatus, diagnosticStatus: report.diagnosticStatus, checks: report.checks.length, diagnosticCounts: report.diagnosticCounts, output: OUTPUT, failure: report.failure }, null, 2))
if (report.status !== 'passed') process.exitCode = 1
