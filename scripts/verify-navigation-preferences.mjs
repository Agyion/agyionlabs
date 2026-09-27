/** Read-only navigation preference QA against an assembled landing + app preview.
 * Uses real, unaccelerated flight timing. Never connects a wallet or submits a transaction.
 * Start only after the shared browser/GPU verification slot has been released.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { chromium, expect } from '@playwright/test'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BASE = (process.env.BASE_URL || 'http://127.0.0.1:4292').replace(/\/$/, '')
const LAYOUT_ONLY = process.env.QA_LAYOUT_ONLY === '1'
const OUTPUT = path.resolve(process.env.QA_OUTPUT_DIR || `artifacts/verification/2026-09-27-${LAYOUT_ONLY ? 'preference-contrast' : 'navigation-preferences'}`)
const WIDTHS = (process.env.QA_WIDTHS || (LAYOUT_ONLY ? '320,390' : '1440,390')).split(',').map(Number)
if (WIDTHS.some(width => !Number.isInteger(width) || width < 280)) throw new Error('Invalid viewport widths')
const SOURCES = ['scripts/verify-navigation-preferences.mjs', 'shared/flight-handoff.ts', 'shared/flight-preference.ts', 'shared/module-camera.ts', 'shared/space-scene.ts', 'landing/src/components/FlightPreference.tsx', 'landing/src/styles/flight-preference.css', 'landing/src/components/OrbitalScene.tsx', 'landing/src/components/NavPill.tsx', 'landing/src/components/DetailWorld.tsx', 'landing/src/pages/Home.tsx', 'landing/src/pages/Instruments.tsx', 'app/app/components/app/AppShell.tsx', 'app/app/components/app/OrbitalBackdrop.tsx', 'app/app/orbital.css', 'app/app/console-surface.css']
const hashes = () => SOURCES.filter(file => fs.existsSync(path.join(ROOT, file))).map(file => ({ file, sha256: createHash('sha256').update(fs.readFileSync(path.join(ROOT, file))).digest('hex') }))
const executablePath = [process.env.CHROMIUM_PATH, '/opt/google/chrome/chrome', chromium.executablePath()].find(candidate => candidate && fs.existsSync(candidate))
if (!executablePath) throw new Error('Set CHROMIUM_PATH to an installed Chromium browser')
fs.mkdirSync(OUTPUT, { recursive: true })
const report = { base: BASE, scope: LAYOUT_ONLY ? 'homepage contrast and placement only' : 'navigation preferences', startedAt: new Date().toISOString(), status: 'running', widths: WIDTHS, sourcesAtStart: hashes(), checks: [], pages: [], screenshots: [], limits: 'Navigation, preference and interaction checks only. Browser storage disabled within one document tests in-memory SPA persistence, not persistence across reload. Software graphics do not measure native GPU frame rate. No wallet, signing or chain transaction.' }
const persist = () => fs.writeFileSync(path.join(OUTPUT, 'results.json'), JSON.stringify(report, null, 2))
const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
let page, diagnostic
const preference = () => page.getByRole('checkbox', { name: 'Skip animation', exact: true })
async function check(name, action) {
  const entry = { name, pass: false }; report.checks.push(entry)
  try { entry.evidence = await action(); entry.pass = true; console.log(`PASS ${name}`) }
  catch (error) { entry.error = error.stack || error.message; throw error }
  finally { persist() }
}
async function newPage(context, label) {
  page = await context.newPage(); page.setDefaultTimeout(20000)
  diagnostic = { label, events: [], documentRequests: [], pageErrors: [], consoleErrors: [], requestFailures: [], httpErrors: [], csp: [] }
  report.pages.push(diagnostic); const d = diagnostic
  page.on('pageerror', error => d.pageErrors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') d.consoleErrors.push({ text: message.text(), location: message.location() }) })
  page.on('requestfailed', request => d.requestFailures.push({ url: request.url(), error: request.failure()?.errorText }))
  page.on('response', response => { if (response.status() >= 400) d.httpErrors.push({ url: response.url(), status: response.status() }) })
  page.on('request', request => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) d.documentRequests.push({ url: request.url(), at: Date.now() }) })
  await page.exposeBinding('__navigationPreferenceEvidence', (_source, event) => { d.events.push(event); if (event.kind === 'csp') d.csp.push(event) })
  await page.addInitScript(() => {
    const send = event => { void window.__navigationPreferenceEvidence({ url: location.href, at: Date.now(), ...event }).catch(() => {}) }
    let last = ''
    const state = () => {
      const event = { kind: 'state', launching: document.documentElement?.classList.contains('is-launching') || false, phase: document.querySelector('.orbital-canvas,.orbital-scene__canvas')?.dataset.flightPhase || null, arriving: Boolean(document.querySelector('.station-arriving')), bridge: Boolean(document.getElementById('agyion-flight-bridge')), poster: Boolean(document.querySelector('.orbital-arrival-poster')) }
      const key = JSON.stringify(event); if (last !== key) { last = key; send(event) }
    }
    new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) {
        if (node instanceof Element && (node.id === 'agyion-flight-bridge' || node.querySelector('#agyion-flight-bridge'))) send({ kind: 'bridge-added' })
      }
      state()
    }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-flight-phase'] })
    const appClicks = new WeakMap()
    document.addEventListener('click', event => {
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (!anchor || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const url = new URL(anchor.href, location.href)
      if (url.origin !== location.origin || !/^\/app\/?$/.test(url.pathname)) return
      appClicks.set(event, { at: Date.now(), href: url.href })
    }, true)
    // Read handler results in the bubble phase. Native browser dispatch can
    // drain microtasks between capture listeners, before the launch listener.
    document.addEventListener('click', event => {
      const intent = appClicks.get(event)
      if (intent) send({ kind: 'launch-click', ...intent, prevented: event.defaultPrevented, launching: document.documentElement.classList.contains('is-launching') })
    })
    document.addEventListener('securitypolicyviolation', event => send({ kind: 'csp', directive: event.violatedDirective, blockedURI: event.blockedURI }))
  })
}
async function home({ ready = false } = {}) {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  await expect(preference()).toBeVisible()
  if (ready) await expect(page.locator('.orbital-scene')).toHaveClass(/is-ready/, { timeout: 60000 })
}
async function appReady(tab = null) {
  await expect(page.locator('.station-app')).toBeVisible()
  await expect(page.locator('.orbital-backdrop')).toHaveClass(/is-ready/, { timeout: 60000 })
  await expect(page.locator('.orbital-canvas')).toHaveAttribute('data-flight-phase', 'interactive')
  await expect(page.locator('.station-app')).not.toHaveClass(/station-arriving/)
  if (tab) {
    await expect(page.locator(`#tab-${tab}`)).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator(`#panel-${tab}`)).toBeVisible()
  }
}
async function seedHandoff() {
  await page.evaluate(() => {
    const at = Date.now(), id = `qa-stale-navigation-${at}`
    sessionStorage.setItem('agyion:arrival', JSON.stringify({ at, id }))
    sessionStorage.setItem('agyion:flight-frame', JSON.stringify({ at, id, pose: { elapsed: 12, ringFocus: 0, yaw: 0, pitch: 0, zoom: 0 }, data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=' }))
  })
}
async function noHandoff() {
  expect(await page.evaluate(() => [sessionStorage.getItem('agyion:arrival'), sessionStorage.getItem('agyion:flight-frame')])).toEqual([null, null])
  await expect(page.locator('#agyion-flight-bridge,.orbital-arrival-poster')).toHaveCount(0)
}
function noAppArrivalSince(eventOffset) {
  const events = diagnostic.events.slice(eventOffset).filter(event => /^\/app\/?$/.test(new URL(event.url).pathname))
  expect(events.some(event => event.kind === 'bridge-added' || event.bridge || event.poster || event.arriving || event.phase === 'arriving'), JSON.stringify(events)).toBe(false)
  return events
}
async function depart(anchor, { tab = null, skip = true, keyboard = false } = {}) {
  const eventOffset = diagnostic.events.length, requestOffset = diagnostic.documentRequests.length
  if (keyboard) { await anchor.focus(); await page.keyboard.press('Enter') } else await anchor.click()
  if (!skip) {
    await expect(page.locator('html')).toHaveClass(/is-launching/)
    expect(new URL(page.url()).pathname).not.toBe('/app/')
  }
  await expect(page).toHaveURL(`${BASE}/app/${tab ? `?tab=${tab}` : ''}`, { timeout: skip ? 15000 : 25000 })
  await appReady(tab)
  const click = diagnostic.events.slice(eventOffset).find(event => event.kind === 'launch-click')
  const request = diagnostic.documentRequests.slice(requestOffset).find(event => /^\/app\/?$/.test(new URL(event.url).pathname))
  expect(click, 'The real CTA click is recorded').toBeTruthy(); expect(request, 'The app document request is recorded').toBeTruthy()
  const requestDelayMs = request.at - click.at
  if (skip) { expect(click.launching).toBe(false); expect(requestDelayMs).toBeLessThan(3000); noAppArrivalSince(eventOffset); await noHandoff() }
  else { expect(click.launching).toBe(true); expect(requestDelayMs).toBeGreaterThanOrEqual(9000); expect(requestDelayMs).toBeLessThan(18000) }
  return { requestDelayMs, click, appUrl: page.url() }
}
async function nativeLinks(anchor) {
  await seedHandoff()
  const result = await anchor.evaluate(element => {
    const before = [sessionStorage.getItem('agyion:arrival'), sessionStorage.getItem('agyion:flight-frame')]
    const target = element.getAttribute('target'), results = []
    for (const mode of ['ctrl', 'meta', 'shift', 'alt', 'middle', 'new-tab', 'download']) {
      if (mode === 'new-tab') element.setAttribute('target', '_blank')
      if (mode === 'download') element.setAttribute('download', '')
      document.addEventListener('click', event => { results.push({ mode, native: !event.defaultPrevented, launching: document.documentElement.classList.contains('is-launching') }); event.preventDefault() }, { once: true })
      element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: mode === 'middle' ? 1 : 0, ctrlKey: mode === 'ctrl', metaKey: mode === 'meta', shiftKey: mode === 'shift', altKey: mode === 'alt' }))
      if (target === null) element.removeAttribute('target'); else element.setAttribute('target', target)
      element.removeAttribute('download')
    }
    const after = [sessionStorage.getItem('agyion:arrival'), sessionStorage.getItem('agyion:flight-frame')]
    return { results, unchangedHandoff: JSON.stringify(before) === JSON.stringify(after) }
  })
  expect(result.results).toHaveLength(7)
  expect(result.results.every(item => item.native && !item.launching)).toBe(true)
  expect(result.unchangedHandoff).toBe(true)
  return result
}
async function shot(name) {
  const filename = path.join(OUTPUT, `${name}.png`)
  await page.screenshot({ path: filename, animations: 'disabled', timeout: 60000 }); report.screenshots.push(filename)
}
// Diagnostics remain strict but are aggregated only after the UI matrix. An
// external RPC failure must not prevent later widths from being exercised.
try {
  if (LAYOUT_ONLY) {
    for (const width of WIDTHS) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: 'no-preference', deviceScaleFactor: 1 })
      await newPage(context, `${width}px homepage preference contrast`)
      await home({ ready: true })
      await check(`${width}px: readable homepage preference with live scene, usable hit area and no overlap`, async () => {
        const label = preference().locator('..')
        const evidence = await label.evaluate(element => {
          const box = element.getBoundingClientRect(), text = element.querySelector('span').getBoundingClientRect(), style = getComputedStyle(element)
          const hit = document.elementFromPoint(text.left + text.width / 2, text.top + text.height / 2)
          const launch = document.querySelector('.immersive-launch').getBoundingClientRect()
          return { left: box.left, right: box.right, top: box.top, height: box.height, viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth, launchBottom: launch.bottom, hit: Boolean(hit && element.contains(hit)), background: style.backgroundColor, color: style.color, opacity: style.opacity }
        })
        expect(evidence.left).toBeGreaterThanOrEqual(0); expect(evidence.right).toBeLessThanOrEqual(width)
        expect(evidence.scrollWidth).toBeLessThanOrEqual(width + 1); expect(evidence.height).toBeGreaterThanOrEqual(44)
        expect(evidence.top).toBeGreaterThanOrEqual(evidence.launchBottom - 1); expect(evidence.hit).toBe(true); expect(evidence.opacity).toBe('1')
        const channels = color => color.match(/[\d.]+/g).map(Number)
        const background = channels(evidence.background), foreground = channels(evidence.color)
        const alpha = background[3] ?? 1
        const luminance = rgb => rgb.slice(0, 3).map(channel => channel / 255).map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4).reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0)
        // A white scene behind the translucent dark plate is its brightest
        // possible background. The actual moving halo cannot be brighter.
        const brightestBackground = background.slice(0, 3).map(channel => channel * alpha + 255 * (1 - alpha))
        const textLuminance = luminance(foreground), backgroundLuminance = luminance(brightestBackground)
        const contrast = (Math.max(textLuminance, backgroundLuminance) + .05) / (Math.min(textLuminance, backgroundLuminance) + .05)
        expect(alpha).toBeGreaterThanOrEqual(.8); expect(foreground[3] ?? 1).toBe(1); expect(contrast).toBeGreaterThanOrEqual(4.5)
        await label.click(); await expect(preference()).toBeChecked()
        await preference().uncheck(); await expect(preference()).not.toBeChecked()
        await shot(`home-preference-${width}`)
        return { ...evidence, contrastAgainstWhiteScene: contrast }
      })
      await context.close()
    }
  } else {
  for (const width of WIDTHS) {
    const context = await browser.newContext({ viewport: { width, height: width < 800 ? 844 : 1000 }, reducedMotion: 'no-preference', deviceScaleFactor: 1 })
    await newPage(context, `${width}px navigation preferences`)
    await home()
    await check(`${width}px: one homepage Launch app and a usable skip checkbox`, async () => {
      await expect(page.getByRole('link', { name: 'Launch app', exact: true })).toHaveCount(1)
      await expect(page.locator('.orbital-nav__launch')).toHaveCount(0)
      await expect(page.locator('.immersive-launch')).toBeVisible()
      await expect(preference()).not.toBeChecked()
      await page.locator('.immersive-intro .flight-preference').click(); await expect(preference()).toBeChecked()
      await preference().uncheck(); await expect(preference()).not.toBeChecked()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      if (width < 800) { await page.getByRole('button', { name: 'Open navigation menu', exact: true }).click(); await expect(page.getByRole('navigation', { name: 'Mobile navigation', exact: true })).toBeVisible(); await page.keyboard.press('Escape') }
      await shot(`home-${width}`)
    })
    await check(`${width}px: native modified and new-tab launches stay native`, () => nativeLinks(page.locator('.immersive-launch')))
    await check(`${width}px: checkbox keyboard operation persists across reload and route remount`, async () => {
      await preference().focus(); await page.keyboard.press('Space'); await expect(preference()).toBeChecked()
      await page.reload({ waitUntil: 'domcontentloaded' }); await expect(preference()).toBeChecked()
      await page.locator('.home-horizon__explore').click(); await expect(page).toHaveURL(`${BASE}/instruments`)
      await page.locator('.orbital-brand').click(); await expect(preference()).toBeChecked()
    })
    await check(`${width}px: another tab can change a saved preference while its control is unmounted`, async () => {
      // Keep this document's module alive while the real router renders its 404
      // route, which has no preference subscriber. No page or handler is mocked.
      await preference().uncheck(); await preference().check()
      await page.evaluate(() => {
        const state = { ...history.state, key: `qa-preference-${Date.now()}`, idx: (history.state?.idx ?? 0) + 1 }
        history.pushState(state, '', '/qa-unmounted-preference')
        dispatchEvent(new PopStateEvent('popstate', { state }))
      })
      await expect(page).toHaveURL(`${BASE}/qa-unmounted-preference`)
      await expect(preference()).toHaveCount(0)
      const other = await context.newPage()
      const d = diagnostic
      other.on('pageerror', error => d.pageErrors.push(`Preference peer: ${error.message}`))
      other.on('console', message => { if (message.type() === 'error') d.consoleErrors.push({ text: `Preference peer: ${message.text()}`, location: message.location() }) })
      try {
        await other.goto(`${BASE}/instruments`, { waitUntil: 'domcontentloaded' })
        const otherPreference = other.getByRole('checkbox', { name: 'Skip animation', exact: true })
        await expect(otherPreference).toBeChecked(); await otherPreference.uncheck()
        await expect.poll(() => page.evaluate(() => localStorage.getItem('agyion:skip-flight'))).toBe('0')
      } finally { await other.close() }
      await page.locator('.orbital-brand').click(); await expect(preference()).not.toBeChecked()
      await preference().check()
    })
    await check(`${width}px: checked keyboard launch bypasses flight and clears stale handoff`, async () => { await seedHandoff(); return depart(page.locator('.immersive-launch'), { keyboard: true }) })
    await check(`${width}px: simplified app header retains functional instrument tabs`, async () => {
      const header = page.locator('.station-topbar')
      await expect(header.getByRole('link', { name: 'Overview', exact: true })).toHaveCount(0)
      await expect(header.getByRole('button', { name: 'Instruments', exact: true })).toHaveCount(0)
      await expect(page.getByRole('tablist', { name: 'Console instruments', exact: true }).getByRole('tab')).toHaveCount(6)
      await page.locator('#tab-trigger').click(); await expect(page.locator('#panel-trigger')).toBeVisible()
      await page.getByRole('button', { name: 'Close instrument', exact: true }).click(); await expect(page.locator('.station-workspace')).toHaveAttribute('aria-hidden', 'true')
      await page.locator('#tab-pod').focus(); await page.keyboard.press('Enter'); await expect(page.locator('#panel-pod')).toBeVisible()
      await shot(`app-${width}`)
    })
    await check(`${width}px: direct app entry suppresses a fresh old bridge when skip is saved`, async () => {
      await seedHandoff(); const offset = diagnostic.events.length
      await page.goto(`${BASE}/app/?tab=pod`, { waitUntil: 'domcontentloaded' }); await appReady('pod'); await noHandoff(); noAppArrivalSince(offset)
    })
    await check(`${width}px: detail launch preserves Pod destination with skip enabled`, async () => {
      await page.goto(`${BASE}/pod`, { waitUntil: 'domcontentloaded' }); await expect(page.locator('.product-launch')).toBeVisible()
      await seedHandoff(); return depart(page.locator('.product-launch'), { tab: 'pod' })
    })
    await home({ ready: true })
    await check(`${width}px: unchecking restores the full departure`, async () => {
      await preference().uncheck(); await expect(preference()).not.toBeChecked()
      return depart(page.locator('.immersive-launch'), { skip: false })
    })
    await check(`${width}px: reduced motion still bypasses flight with checkbox unchecked`, async () => {
      await page.emulateMedia({ reducedMotion: 'reduce' }); await home(); await expect(preference()).not.toBeChecked()
      await seedHandoff(); return depart(page.locator('.immersive-launch'))
    })
    await check(`${width}px: blocked storage preserves the choice across SPA remount`, async () => {
      await page.emulateMedia({ reducedMotion: 'no-preference' }); await home()
      await page.evaluate(() => Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('Blocked for this QA document', 'SecurityError') } }))
      await preference().check(); await expect(preference()).toBeChecked()
      await page.locator('.home-horizon__explore').click(); await expect(page).toHaveURL(`${BASE}/instruments`)
      await page.locator('.orbital-brand').click(); await expect(preference()).toBeChecked()
      return depart(page.locator('.immersive-launch'))
    })
    await context.close()
  }
  const narrowContext = await browser.newContext({ viewport: { width: 320, height: 844 }, reducedMotion: 'reduce', deviceScaleFactor: 1 })
  await newPage(narrowContext, '320px preference placement only')
  for (const route of ['/', '/pod', '/instruments']) {
    await check(`320px: preference placement on ${route}`, async () => {
      await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' })
      await expect(preference()).toBeVisible(); await preference().scrollIntoViewIfNeeded()
      const bounds = await preference().locator('..').evaluate(label => {
        const box = label.getBoundingClientRect(), span = label.querySelector('span'), text = span.getBoundingClientRect()
        const hit = document.elementFromPoint(text.left + text.width / 2, text.top + text.height / 2)
        return { left: box.left, right: box.right, top: box.top, height: box.height, viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth, hit: Boolean(hit && label.contains(hit)) }
      })
      expect(bounds.left).toBeGreaterThanOrEqual(0); expect(bounds.right).toBeLessThanOrEqual(bounds.viewport)
      expect(bounds.height).toBeGreaterThanOrEqual(44); expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.viewport + 1); expect(bounds.hit).toBe(true)
      if (route !== '/instruments') {
        const launch = await page.locator(route === '/' ? '.immersive-launch' : '.product-launch').boundingBox()
        expect(bounds.top).toBeGreaterThanOrEqual(launch.y + launch.height - 1)
      }
      await shot(`preference-320-${route === '/' ? 'home' : route.slice(1)}`)
      return bounds
    })
  }
  await narrowContext.close()
  }
  report.sourcesAtEnd = hashes(); expect(report.sourcesAtEnd, 'Reviewed sources must remain stable during verification').toEqual(report.sourcesAtStart)
  report.status = 'passed'
} catch (error) { report.status = 'failed'; report.failure = error.stack || error.message }
finally {
  await browser.close()
  report.diagnosticCounts = Object.fromEntries(['pageErrors', 'consoleErrors', 'requestFailures', 'httpErrors', 'csp'].map(key => [key, report.pages.reduce((sum, page) => sum + page[key].length, 0)]))
  report.uiStatus = !report.failure && report.checks.length > 0 && report.checks.every(check => check.pass) ? 'passed' : 'failed'
  report.diagnosticStatus = Object.values(report.diagnosticCounts).some(count => count > 0) ? 'failed' : 'passed'
  report.status = report.uiStatus === 'passed' && report.diagnosticStatus === 'passed' ? 'passed' : 'failed'
  report.finishedAt = new Date().toISOString(); persist()
}
console.log(JSON.stringify({ status: report.status, uiStatus: report.uiStatus, diagnosticStatus: report.diagnosticStatus, diagnosticCounts: report.diagnosticCounts, checks: report.checks.length, output: OUTPUT, failure: report.failure }, null, 2))
if (report.status !== 'passed') process.exitCode = 1
