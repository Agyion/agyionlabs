/** Canonical directory and hero UX matrix. Use one isolated browser/GPU slot.
 * The retired home-gallery selection/scroll assertions intentionally live nowhere:
 * /instruments owns the six product links; /#instruments is a replace-only alias.
 * Run against the final built preview, with same-origin app arrival fixtures.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { chromium, expect } from '@playwright/test'
import { waitForFonts, waitForFrames } from '../../../scripts/lib/browser-settle.mjs'

const BASE = (process.env.BASE_URL || 'http://127.0.0.1:4173').replace(/\/$/, '')
const OUTPUT = path.resolve(process.env.QA_OUTPUT_DIR || '/tmp/agyion-landing-qa')
const WIDTHS = (process.env.QA_WIDTHS || '1440,768,390,320').split(',').map(Number)
const MOTIONS = (process.env.QA_MOTIONS || 'no-preference,reduce').split(',')
const SCOPE = process.env.QA_SCOPE || 'full'
const PRODUCTS = ['fade', 'pod', 'trigger', 'envoy', 'ramp', 'ledger']
if (WIDTHS.some(width => !Number.isInteger(width) || width < 280) || MOTIONS.some(motion => !['no-preference', 'reduce'].includes(motion))) throw new Error('Invalid width or motion configuration')
if (!['full', 'routes'].includes(SCOPE)) throw new Error('Invalid QA scope; use full or routes')
const candidates = [process.env.CHROMIUM_PATH, chromium.executablePath(), '/opt/google/chrome/chrome', '/snap/bin/chromium', '/usr/bin/chromium'].filter(Boolean)
const executablePath = candidates.find(candidate => fs.existsSync(candidate))
if (!executablePath) throw new Error('Chromium is required. Set CHROMIUM_PATH or install the Playwright browser.')
fs.mkdirSync(OUTPUT, { recursive: true })
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const SOURCES = ['scripts/lib/browser-settle.mjs', 'landing/tests/e2e/matrix.mjs', 'landing/src/App.tsx', 'landing/src/pages/Home.tsx', 'landing/src/pages/Instruments.tsx', 'landing/src/components/NavPill.tsx', 'landing/src/components/Footer.tsx', 'landing/src/components/OrbitalScene.tsx', 'landing/src/components/DetailWorld.tsx', 'landing/src/components/InstrumentExample.tsx', 'landing/src/components/ExampleArtwork.tsx', 'landing/src/components/instrumentExamples.ts', 'landing/src/styles/instrument-example.css', 'landing/src/styles/product-pages.css', 'landing/src/styles/home-gateway.css', 'landing/src/styles/orbital.css']
const sourceHashes = () => SOURCES.map(file => ({ file, sha256: createHash('sha256').update(fs.readFileSync(path.join(ROOT, file))).digest('hex') }))
const report = { version: 3, base: BASE, scope: SCOPE, widths: WIDTHS, motions: MOTIONS, sourcesAtStart: sourceHashes(), status: 'running', startedAt: new Date().toISOString(), checks: [], skippedChecks: [], pages: [], screenshots: [], failure: null,
  limits: 'SwiftShader checks interaction correctness and saved appearance, not native GPU performance. The flight destination is an isolated same-origin fixture; app behavior has its own suite.' }
const persist = () => fs.writeFileSync(path.join(OUTPUT, 'results.json'), JSON.stringify(report, null, 2))
const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
let currentDiagnostic
let currentPage
async function check(name, action) {
  const result = { name, pass: false }
  report.checks.push(result)
  if (currentDiagnostic) currentDiagnostic.phase = name
  try { result.evidence = await action(); result.pass = true; console.log(`PASS ${name}`) }
  catch (error) { result.error = { message: error.message, stack: error.stack }; throw error }
  finally { persist() }
}
async function trackedPage(context, label, expectedNoWebGL = false) {
  const page = await context.newPage()
  currentPage = page
  const diagnostic = { label, phase: 'setup', consoleErrors: [], pageErrors: [], requestFailures: [], httpErrors: [], csp: [] }
  report.pages.push(diagnostic); currentDiagnostic = diagnostic
  page.on('pageerror', error => diagnostic.pageErrors.push({ phase: diagnostic.phase, message: error.message, stack: error.stack }))
  page.on('console', message => {
    if (message.type() === 'error') diagnostic.consoleErrors.push({ phase: diagnostic.phase, message: message.text(), location: message.location(), expected: expectedNoWebGL && /Error creating WebGL context/i.test(message.text()) })
  })
  page.on('requestfailed', request => diagnostic.requestFailures.push({ phase: diagnostic.phase, url: request.url(), method: request.method(), error: request.failure()?.errorText }))
  page.on('response', response => { if (response.status() >= 400) diagnostic.httpErrors.push({ phase: diagnostic.phase, url: response.url(), status: response.status() }) })
  await page.exposeBinding('__landingCsp', (_source, violation) => diagnostic.csp.push({ phase: diagnostic.phase, ...violation }))
  await page.addInitScript(() => document.addEventListener('securitypolicyviolation', event => window.__landingCsp({ directive: event.violatedDirective, blockedURI: event.blockedURI })))
  return { page, diagnostic }
}
function clean(diagnostic) {
  expect(diagnostic.pageErrors, 'Unexpected JavaScript errors').toEqual([])
  expect(diagnostic.consoleErrors.filter(error => !error.expected), 'Unexpected console errors').toEqual([])
  expect(diagnostic.requestFailures, 'Failed requests remain visible in the report').toEqual([])
  expect(diagnostic.httpErrors, 'HTTP errors remain visible in the report').toEqual([])
  expect(diagnostic.csp, 'Content security policy violations remain visible in the report').toEqual([])
}
async function capture(page, filename) {
  const output = path.join(OUTPUT, filename)
  await page.screenshot({ path: output, fullPage: true, animations: 'disabled', timeout: 60000 })
  report.screenshots.push(output)
}
const world = page => page.locator('.orbital-home')
const gateway = page => page.locator('.home-horizon__explore')
const launch = page => page.locator('.immersive-launch')
async function noOverflow(page) {
  const dimensions = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, height: innerHeight, scrollHeight: document.documentElement.scrollHeight, scrollY }))
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width + 1)
  return dimensions
}
async function homeReady(page) {
  await expect(world(page)).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^agyion\s*labs$/i)
  await expect(page.locator('.orbital-scene')).toHaveClass(/is-ready/, { timeout: 30000 })
  await expect(page.locator('.orbital-scene canvas')).toHaveCount(1)
  await expect(page.locator('.orbital-fallback')).toBeHidden()
  await waitForFonts(page)
}
async function navigationLink(page, name) {
  const desktop = page.getByRole('navigation', { name: 'Main navigation', exact: true })
  if (await desktop.isVisible()) return desktop.getByRole('link', { name, exact: true })
  const mobile = page.getByRole('navigation', { name: 'Mobile navigation', exact: true })
  if (!await mobile.isVisible()) await page.getByRole('button', { name: 'Open navigation menu', exact: true }).click()
  return mobile.getByRole('link', { name, exact: true })
}
async function visibleFocus(page) {
  await expect.poll(() => page.evaluate(() => {
    const active = document.activeElement
    return active instanceof HTMLElement && active !== document.body && active.getClientRects().length > 0
      && getComputedStyle(active).visibility !== 'hidden' && !active.closest('[inert]')
  }), { message: 'Navigation must leave focus on a visible, usable target rather than body or a hidden menu' }).toBe(true)
}
async function canonicalLinks(page, active = false) {
  await expect(page.locator('a[href="/#instruments"], a[href="#instruments"]')).toHaveCount(0)
  const links = page.locator('.orbital-nav a[href="/instruments"]')
  await expect(links).toHaveCount(2)
  for (const link of await links.all()) {
    if (active) await expect(link).toHaveAttribute('aria-current', 'page')
    else await expect(link).not.toHaveAttribute('aria-current', 'page')
  }
}
async function directoryReady(page) {
  await expect(page).toHaveURL(/\/instruments$/)
  await expect(page.locator('.instrument-directory')).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Instruments')
  const directory = page.getByRole('navigation', { name: 'Choose an instrument', exact: true })
  await expect(directory).toHaveCount(1)
  await expect(directory.getByRole('link')).toHaveCount(6)
  expect(await directory.getByRole('link').evaluateAll(links => links.map(link => link.getAttribute('href')))).toEqual(PRODUCTS.map(slug => `/${slug}`))
  await expect(world(page)).toHaveCount(0)
  await expect(page.locator('.orbital-scene canvas')).toHaveCount(0)
  await canonicalLinks(page, true)
  await noOverflow(page)
}
async function nativeModifiers(link, plainAnchor = false) {
  // Observe at document bubble, after React's delegated Link handler and the
  // document capture flight handler. Cancel only the browser's final default.
  // React Router reads target from its rendered props; mutating that DOM
  // attribute does not create a genuine new-tab Link fixture. Plain app anchors
  // are handled by the flight listener, which intentionally reads the live DOM.
  const evidence = await link.evaluate((anchor, isPlainAnchor) => {
    const originalTarget = anchor.getAttribute('target')
    const results = []
    for (const mode of ['ctrl', 'meta', 'shift', 'alt', 'middle', ...(isPlainAnchor ? ['blank'] : [])]) {
      if (mode === 'blank') anchor.target = '_blank'
      document.addEventListener('click', event => {
        results.push({ mode, native: !event.defaultPrevented })
        event.preventDefault()
      }, { once: true })
      anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: mode === 'middle' ? 1 : 0, ctrlKey: mode === 'ctrl', metaKey: mode === 'meta', shiftKey: mode === 'shift', altKey: mode === 'alt' }))
      if (originalTarget === null) anchor.removeAttribute('target')
      else anchor.setAttribute('target', originalTarget)
    }
    return results
  }, plainAnchor)
  expect(evidence).toHaveLength(plainAnchor ? 6 : 5)
  expect(evidence.every(item => item.native), JSON.stringify(evidence)).toBe(true)
  return evidence
}
// Capture existing GL submissions and fixed-star camera basis, without changing
// time, uniforms or animation. This separates explicit input from ambient motion.
async function installCameraProbe(page) {
  await page.addInitScript(() => {
    window.__landingProbe = { draws: 0, matrix: null }
    const contexts = new WeakMap()
    const state = gl => {
      if (!contexts.has(gl)) contexts.set(gl, { sources: new WeakMap(), shaders: new WeakMap(), stars: new WeakSet(), uniforms: new WeakMap() })
      return contexts.get(gl)
    }
    for (const proto of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
      for (const method of ['drawArrays', 'drawElements']) {
        const original = proto[method]
        proto[method] = function (...args) { window.__landingProbe.draws++; return original.apply(this, args) }
      }
      const source = proto.shaderSource, attach = proto.attachShader, link = proto.linkProgram, location = proto.getUniformLocation, matrix = proto.uniformMatrix4fv
      proto.shaderSource = function (shader, text) { state(this).sources.set(shader, text); return source.call(this, shader, text) }
      proto.attachShader = function (program, shader) { const s = state(this), list = s.shaders.get(program) || []; list.push(shader); s.shaders.set(program, list); return attach.call(this, program, shader) }
      proto.linkProgram = function (program) { const s = state(this); if (/PointsMaterial|AGYION_STAR_FIELD/.test((s.shaders.get(program) || []).map(shader => s.sources.get(shader) || '').join('\n'))) s.stars.add(program); return link.call(this, program) }
      proto.getUniformLocation = function (program, name) { const item = location.call(this, program, name); if (item) state(this).uniforms.set(item, { name, star: state(this).stars.has(program) }); return item }
      proto.uniformMatrix4fv = function (item, transpose, values, ...rest) { const uniform = item && state(this).uniforms.get(item); if (uniform?.star && uniform.name === 'modelViewMatrix') window.__landingProbe.matrix = Array.from(values).slice(rest[0] || 0, (rest[0] || 0) + 16); return matrix.call(this, item, transpose, values, ...rest) }
    }
  })
}
const basisChange = (a, b) => Math.max(...[0, 1, 2, 4, 5, 6, 8, 9, 10].map(index => Math.abs(a[index] - b[index])))

try {
  for (const width of WIDTHS) for (const motion of MOTIONS) {
    const context = await browser.newContext({ viewport: { width, height: width <= 390 ? 800 : 1000 }, reducedMotion: motion })
    const label = `${width}px ${motion}`
    const { page, diagnostic } = await trackedPage(context, label)
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })
    await check(`${label}: one hero, compact footer, canonical gateway and no duplicate gallery`, async () => {
      await homeReady(page)
      await expect(page.locator('#home')).toHaveCount(1)
      await expect(page.locator('#instruments, .home-gallery, #instrument-stage, .instrument-mechanism')).toHaveCount(0)
      await expect(page.getByRole('group', { name: 'Choose an instrument', exact: true })).toHaveCount(0)
      await expect(page.locator('vite-error-overlay')).toHaveCount(0)
      await expect(page.getByRole('button', { name: /pause.*motion|resume.*motion/i })).toHaveCount(0)
      await expect(gateway(page)).toHaveAttribute('href', '/instruments')
      await expect(gateway(page)).toBeVisible()
      await expect(launch(page)).toHaveAttribute('href', '/app/')
      await expect(launch(page)).toBeVisible()
      await expect(page.locator('.home-colophon')).toHaveCount(1)
      const support = page.getByRole('navigation', { name: 'Supporting tools', exact: true })
      for (const slug of ['ramp', 'ledger']) await expect(support.locator(`a[href='/${slug}']`)).toBeVisible()
      await canonicalLinks(page)
      const dimensions = await noOverflow(page)
      expect(dimensions.scrollHeight, 'Home should remain a hero with a small supporting footer').toBeLessThan(dimensions.height * 1.8)
      const hero = await page.locator('#home').boundingBox()
      expect(hero.height).toBeGreaterThanOrEqual(dimensions.height * .85)
      await capture(page, `landing-${width}-${motion}.png`)
      clean(diagnostic)
      return { ...dimensions, assets: await page.locator('script[src], link[rel=stylesheet]').evaluateAll(elements => elements.map(element => element.getAttribute('src') || element.getAttribute('href'))) }
    })
    await check(`${label}: clear canvas remains interactive behind the hero copy`, async () => {
      const canvas = page.locator('.orbital-scene canvas')
      await expect(canvas).toHaveAttribute('tabindex', '0')
      const surface = await page.evaluate(() => {
        const header = document.querySelector('.orbital-nav').getBoundingClientRect()
        const horizon = document.querySelector('.home-horizon').getBoundingClientRect()
        let hits = 0
        for (const fx of [.2, .35, .5, .65, .8, .9]) for (const fy of [.2, .4, .6, .8]) {
          const x = innerWidth * fx, y = header.bottom + (Math.min(horizon.top, innerHeight) - header.bottom) * fy
          if (document.elementFromPoint(x, y)?.tagName === 'CANVAS') hits++
        }
        return { hits, samples: 24 }
      })
      expect(surface.hits, 'Content wrappers must leave a substantial canvas area hittable').toBeGreaterThanOrEqual(10)
      await expect(page.locator('.orbital-nav')).toHaveCSS('position', 'fixed')
      return surface
    })
    if (width <= 768) await check(`${label}: mobile menu Escape restores its toggle`, async () => {
      const toggle = page.getByRole('button', { name: 'Open navigation menu', exact: true })
      await toggle.click()
      await expect(page.getByRole('navigation', { name: 'Mobile navigation', exact: true })).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(toggle).toBeFocused()
      await expect(page.getByRole('navigation', { name: 'Mobile navigation', exact: true })).toBeHidden()
    })
    await check(`${label}: gateway and navigation preserve native modifiers`, async () => {
      const before = page.url()
      const gatewayModes = await nativeModifiers(gateway(page))
      const navigationModes = await nativeModifiers(await navigationLink(page, 'Instruments'))
      await expect(page).toHaveURL(before)
      await expect(page.locator('html')).not.toHaveClass(/is-launching/)
      if (await page.getByRole('navigation', { name: 'Mobile navigation', exact: true }).isVisible()) await page.keyboard.press('Escape')
      return { gatewayModes, navigationModes }
    })
    await check(`${label}: keyboard gateway opens the six-link directory; Back and Forward preserve route`, async () => {
      await gateway(page).focus()
      await expect(gateway(page)).toBeFocused()
      const canvas = await page.locator('.orbital-scene canvas').elementHandle()
      await page.keyboard.press('Enter')
      await directoryReady(page)
      await visibleFocus(page)
      await expect.poll(() => canvas.evaluate(element => element.isConnected)).toBe(false)
      await canvas.dispose()
      await expect(page.getByRole('navigation', { name: 'Mobile navigation', exact: true })).toBeHidden()
      await page.goBack()
      await expect(page).toHaveURL(`${BASE}/`)
      await homeReady(page)
      await page.goForward()
      await directoryReady(page)
      await capture(page, `directory-${width}-${motion}.png`)
    })
    await check(`${label}: directory link, native detail route and immediate Back restore directory position`, async () => {
      const detailLink = page.getByRole('navigation', { name: 'Choose an instrument', exact: true }).locator('a[href="/pod"]')
      const native = await nativeModifiers(detailLink)
      await detailLink.focus()
      await detailLink.scrollIntoViewIfNeeded()
      await waitForFrames(page)
      const before = await page.evaluate(() => scrollY)
      await page.keyboard.press('Enter')
      await expect(page.locator('.product-page[data-instrument="pod"]')).toBeVisible()
      await canonicalLinks(page, true)
      await expect(page.locator('.product-launch')).toHaveAttribute('href', '/app/?tab=pod')
      await page.goBack()
      await directoryReady(page)
      await expect.poll(() => page.evaluate(y => Math.abs(scrollY - y), before)).toBeLessThan(3)
      await visibleFocus(page)
      await page.goForward()
      await expect(page.locator('.product-page[data-instrument="pod"]')).toBeVisible()
      await page.getByRole('link', { name: '← All instruments', exact: true }).click()
      await directoryReady(page)
      return { native, directoryScroll: before }
    })
    await check(`${label}: Home and Instruments navigation share the canonical directory`, async () => {
      await (await navigationLink(page, 'Home')).click()
      await homeReady(page)
      await expect(page).toHaveURL(/\/#home$/)
      await (await navigationLink(page, 'Instruments')).click()
      await directoryReady(page)
      await expect(page.getByRole('navigation', { name: 'Mobile navigation', exact: true })).toBeHidden()
      await (await navigationLink(page, 'Instruments')).click()
      await expect(page.locator('#directory-title')).toBeFocused()
      await expect(page.getByRole('navigation', { name: 'Mobile navigation', exact: true })).toBeHidden()
      await directoryReady(page)
    })
    await check(`${label}: no obsolete How modal links or dialog`, async () => {
      await expect(page.getByRole('link', { name: 'How it works', exact: true })).toHaveCount(0)
      await expect(page.getByRole('dialog', { name: 'How it works', exact: true })).toHaveCount(0)
      await expect(page.locator('a[href="/#how-it-works"], a[href="#how-it-works"]')).toHaveCount(0)
      await directoryReady(page)
    })
    await check(`${label}: legacy hash replaces its history entry with the canonical catalog`, async () => {
      await page.goto(`${BASE}/fade`, { waitUntil: 'domcontentloaded' })
      await expect(page.locator('.product-page[data-instrument="fade"]')).toBeVisible()
      // A real document navigation models an old bookmark or external link.
      await page.goto(`${BASE}/#instruments`, { waitUntil: 'domcontentloaded' })
      await directoryReady(page)
      await expect(page.locator('#instruments, .home-gallery')).toHaveCount(0)
      await page.goBack()
      await expect(page).toHaveURL(/\/fade$/)
      await expect(page.locator('.product-page[data-instrument="fade"]')).toBeVisible()
      await page.goForward()
      await directoryReady(page)
      return { alias: '/#instruments', destination: '/instruments', back: '/fade' }
    })
    await check(`${label}: no runtime, CSP or asset errors`, async () => clean(diagnostic))
    await context.close()
  }

  if (SCOPE === 'routes') {
    report.skippedChecks.push({ name: 'Dedicated reduced-motion orbit, six everyday examples, app flights, motion-change and no-WebGL fixtures', reason: 'Outside focused route/history scope' })
  } else {

  const reduced = await browser.newContext({ viewport: { width: 360, height: 800 }, reducedMotion: 'reduce' })
  const { page, diagnostic } = await trackedPage(reduced, 'Reduced motion and routes')
  await installCameraProbe(page)
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await homeReady(page)
  await check('Reduced motion: fallback is absent, ambient rendering stops and explicit keyboard orbit works', async () => {
    await expect(page.locator('.orbital-fallback')).toHaveCSS('display', 'none')
    await expect(page.locator('.orbital-scene canvas')).toHaveCount(1)
    await expect.poll(() => page.evaluate(() => window.__landingProbe.matrix?.length || 0)).toBe(16)
    await page.waitForTimeout(500)
    const before = await page.evaluate(() => structuredClone(window.__landingProbe))
    await page.waitForTimeout(400)
    const stationary = await page.evaluate(() => structuredClone(window.__landingProbe))
    expect(stationary.draws, 'Reduced motion must not continuously redraw the world').toBe(before.draws)
    const canvas = page.locator('.orbital-scene canvas')
    await canvas.focus()
    await page.keyboard.press('ArrowRight')
    await expect.poll(() => page.evaluate(() => window.__landingProbe.draws)).toBeGreaterThan(before.draws)
    const orbit = await page.evaluate(() => structuredClone(window.__landingProbe))
    expect(basisChange(before.matrix, orbit.matrix), 'Explicit keyboard orbit must change the actual camera basis').toBeGreaterThan(.002)
    await page.keyboard.press('Home')
    const reset = await page.evaluate(() => structuredClone(window.__landingProbe))
    expect(basisChange(before.matrix, reset.matrix)).toBeLessThan(.0001)
    return { before, stationary, orbit, reset }
  })
  await check('Keyboard skip link reaches main without requiring the scene', async () => {
    await page.locator('.orbital-scene canvas').evaluate(element => element.blur())
    await page.locator('.skip-link').focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('#main')).toBeFocused()
  })
  for (const slug of PRODUCTS) await check(`/${slug}: everyday example, native destination, keyboard controls and scene teardown`, async () => {
    await page.goto(`${BASE}/instruments`, { waitUntil: 'domcontentloaded' })
    await directoryReady(page)
    await page.getByRole('navigation', { name: 'Choose an instrument', exact: true }).locator(`a[href='/${slug}']`).focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(new RegExp(`/${slug}$`))
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const detail = page.locator(`.product-page[data-instrument='${slug}']`)
    await expect(detail).toBeVisible()
    await canonicalLinks(page, true)
    await expect(page.locator('.orbital-scene canvas')).toHaveCount(0)
    await expect(detail.locator('.product-launch')).toHaveAttribute('href', `/app/?tab=${slug}`)
    const example = detail.locator(`.instrument-example[data-example='${slug}']`)
    await expect(example.locator('svg')).toHaveCount(1)
    await expect(example).toHaveAttribute('data-stage', '0')
    await expect(example).toHaveAttribute('data-status', 'ready')
    await example.locator('[data-action="next"]').focus()
    await page.keyboard.press('Enter')
    await expect(example).toHaveAttribute('data-stage', '1')
    await expect(example).toHaveAttribute('data-status', 'step')
    await example.locator('[data-action="reset"]').focus()
    await page.keyboard.press('Enter')
    await expect(example).toHaveAttribute('data-stage', '0')
    await expect(example).toHaveAttribute('data-status', 'ready')
    await expect(detail.locator('.product-limits')).not.toHaveAttribute('open', '')
    await detail.locator('.product-limits summary').focus()
    await page.keyboard.press('Enter')
    await expect(detail.locator('.product-limits')).toHaveAttribute('open', '')
    await page.keyboard.press('Enter')
    await expect(detail.locator('.product-limits')).not.toHaveAttribute('open', '')
    await noOverflow(page)
    const outgoing = await example.locator('svg').elementHandle()
    await page.getByRole('link', { name: 'Agyion Labs home', exact: true }).first().click()
    await homeReady(page)
    await expect.poll(() => outgoing.evaluate(element => element.isConnected)).toBe(false)
    await outgoing.dispose()
  })
  await check('Directory and next-product links support keyboard, route history and distinct example scenes', async () => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto(`${BASE}/instruments`, { waitUntil: 'domcontentloaded' })
    await directoryReady(page)
    await waitForFrames(page)
    await page.getByRole('navigation', { name: 'Choose an instrument', exact: true }).locator('a[href="/fade"]').focus()
    await expect(page.getByRole('navigation', { name: 'Choose an instrument', exact: true }).locator('a[href="/fade"]')).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/fade$/)
    const fadeScene = await page.locator('[data-example="fade"] svg').elementHandle()
    await capture(page, 'product-fade-before-next-pod.png')
    await page.getByRole('link', { name: 'Explore Pod', exact: true }).focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/pod$/)
    await expect(page.locator('[data-example="pod"] svg')).toHaveCount(1)
    await expect(page.locator('[data-example="pod"]')).toHaveAttribute('data-stage', '0')
    await expect.poll(() => fadeScene.evaluate(element => element.isConnected)).toBe(false)
    await fadeScene.dispose()
    await expect(page.locator('.orbital-scene canvas')).toHaveCount(0)
    await page.goBack()
    await expect(page).toHaveURL(/\/fade$/)
    await expect(page.locator('[data-example="fade"]')).toHaveAttribute('data-status', 'ready')
    await expect(page.locator('[data-example="fade"]')).toHaveAttribute('data-stage', '0')
    await page.setViewportSize({ width: 360, height: 800 })
    await page.getByRole('link', { name: 'Agyion Labs home', exact: true }).first().click()
    await homeReady(page)
    return { fromDirectory: 'fade', next: 'pod', back: 'fade' }
  })
  await check('Legacy How hash replaces itself with the canonical examples directory', async () => {
    await page.goto(`${BASE}/fade`, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('.product-page[data-instrument="fade"]')).toBeVisible()
    await page.goto(`${BASE}/#how-it-works`, { waitUntil: 'domcontentloaded' })
    await directoryReady(page)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.goBack()
    await expect(page).toHaveURL(/\/fade$/)
    await page.goForward()
    await directoryReady(page)
  })
  for (const directWidth of [1440, 360]) {
    const directContext = await browser.newContext({ viewport: { width: directWidth, height: 800 }, reducedMotion: 'reduce' })
    const { page: directPage, diagnostic: directDiagnostic } = await trackedPage(directContext, `${directWidth}px fresh legacy How URL`)
    await check(`${directWidth}px: fresh legacy How URL opens the examples directory without a modal`, async () => {
      await directPage.goto(`${BASE}/#how-it-works`, { waitUntil: 'networkidle' })
      await directoryReady(directPage)
      await expect(directPage.getByRole('dialog')).toHaveCount(0)
      await expect(directPage.getByRole('link', { name: 'How it works', exact: true })).toHaveCount(0)
      clean(directDiagnostic)
    })
    await directContext.close()
  }
  currentDiagnostic = diagnostic
  currentPage = page
  for (const [source, destination, selector, name] of [['/', '/app/', '.immersive-launch', 'Hero'], ['/pod', '/app/?tab=pod', '.product-launch', 'Pod']]) await check(`Reduced motion: ${name} navigates directly to its own workspace without a flight marker`, async () => {
    await page.goto(`${BASE}${source}`, { waitUntil: 'domcontentloaded' })
    await page.route(`**${destination}`, route => route.fulfill({ contentType: 'text/html', body: `<title>Direct ${name} fixture</title>` }))
    await page.locator(selector).click()
    await page.waitForURL(`${BASE}${destination}`, { timeout: 4000 })
    await expect(page).toHaveTitle(`Direct ${name} fixture`)
    expect(await page.evaluate(() => sessionStorage.getItem('agyion:arrival'))).toBeNull()
  })
  await check('Reduced motion and detail routes have no runtime or asset errors', async () => clean(diagnostic))
  await reduced.close()

  for (const [source, destination, selector, name] of [['/', '/app/', '.immersive-launch', 'Hero'], ['/pod', '/app/?tab=pod', '.product-launch', 'Pod detail']]) {
    const flightContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const { page: flight, diagnostic: flightDiagnostic } = await trackedPage(flightContext, `${name} normal launch`)
    await flight.route(`**${destination}`, route => route.fulfill({ contentType: 'text/html', body: `<title>${name} arrival fixture</title><main>Station</main>` }))
    await flight.goto(`${BASE}${source}`, { waitUntil: 'domcontentloaded' })
    if (source === '/') await homeReady(flight)
    else await expect(flight.locator('.product-page[data-instrument="pod"]')).toBeVisible()
    const departure = flight.locator(selector)
    await check(`${name}: modified, middle-click and new-tab launch preserve native behavior`, async () => {
      const native = await nativeModifiers(departure, true)
      await expect(flight.locator('html')).not.toHaveClass(/is-launching/)
      await expect(departure).toHaveAttribute('href', destination)
      return native
    })
    await check(`${name}: destination survives the complete 9.8-second flight and settled handoff`, async () => {
      // Focus warms a detail's on-demand renderer before timing the actual flight.
      await departure.focus()
      await expect(flight.locator('.orbital-scene')).toHaveClass(/is-ready/, { timeout: 30000 })
      await flight.waitForLoadState('networkidle')
      const canvas = await flight.locator('.orbital-scene canvas').elementHandle()
      const started = Date.now()
      await departure.click()
      await expect(flight.locator('html')).toHaveClass(/is-launching/)
      await expect(flight.locator('.orbital-scene__canvas')).toHaveAttribute('data-flight-phase', 'launching')
      expect(await canvas.evaluate(element => element.isConnected && element === document.querySelector('.orbital-scene canvas'))).toBe(true)
      const geometry = await flight.locator('.orbital-scene canvas').boundingBox()
      expect(Math.abs(geometry.x)).toBeLessThan(1)
      expect(Math.abs(geometry.y)).toBeLessThan(1)
      expect(geometry.width).toBe(1440)
      expect(geometry.height).toBe(1000)
      await canvas.dispose()
      await flight.waitForURL(`${BASE}${destination}`, { timeout: 17000 })
      const duration = Date.now() - started
      expect(duration).toBeGreaterThan(9500)
      expect(duration).toBeLessThan(18000)
      await expect(flight).toHaveTitle(`${name} arrival fixture`)
      const handoff = await flight.evaluate(() => ({ marker: JSON.parse(sessionStorage.getItem('agyion:arrival') || 'null'), frame: JSON.parse(sessionStorage.getItem('agyion:flight-frame') || 'null') }))
      expect(handoff.marker).not.toBeNull()
      expect(handoff.frame).not.toBeNull()
      expect(Date.now() - handoff.marker.at).toBeLessThan(5000)
      expect(handoff.marker.settled).toBe(true)
      expect(handoff.frame.id).toBe(handoff.marker.id)
      expect(handoff.frame.at).toBe(handoff.marker.at)
      for (const key of ['elapsed', 'ringFocus', 'yaw', 'pitch', 'zoom']) expect(Number.isFinite(handoff.frame.pose[key])).toBe(true)
      return { duration, destination, geometry, marker: handoff.marker, pose: handoff.frame.pose }
    })
    await check(`${name}: no runtime or asset errors`, async () => clean(flightDiagnostic))
    await flightContext.close()
  }

  const preferenceContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'no-preference' })
  const { page: preferencePage, diagnostic: preferenceDiagnostic } = await trackedPage(preferenceContext, 'Motion change during launch')
  await preferencePage.route('**/app/', route => route.fulfill({ contentType: 'text/html', body: '<title>Motion preference arrival</title>' }))
  await preferencePage.goto(BASE, { waitUntil: 'domcontentloaded' })
  await homeReady(preferencePage)
  await check('Reducing motion during launch still completes the requested navigation', async () => {
    await launch(preferencePage).click()
    await expect(preferencePage.locator('html')).toHaveClass(/is-launching/)
    await preferencePage.emulateMedia({ reducedMotion: 'reduce' })
    await preferencePage.waitForURL('**/app/', { timeout: 4000 })
    await expect(preferencePage).toHaveTitle('Motion preference arrival')
    clean(preferenceDiagnostic)
  })
  await preferenceContext.close()

  const fallback = await browser.newContext({ viewport: { width: 360, height: 800 } })
  await fallback.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (type, ...args) { return String(type).startsWith('webgl') ? null : original.call(this, type, ...args) }
  })
  const { page: fallbackPage, diagnostic: fallbackDiagnostic } = await trackedPage(fallback, 'Expected WebGL-unavailable fixture', true)
  await fallbackPage.route('**/app/', route => route.fulfill({ contentType: 'text/html', body: '<title>Fallback arrival fixture</title>' }))
  await fallbackPage.goto(BASE, { waitUntil: 'domcontentloaded' })
  await check('Without WebGL, the hero, canonical directory, product details and direct launch remain usable', async () => {
    await expect(fallbackPage.locator('.orbital-fallback')).toBeVisible()
    await expect(fallbackPage.getByRole('heading', { level: 1 })).toHaveText(/^agyion\s*labs$/i)
    await expect(fallbackPage.getByRole('button', { name: /pause.*motion|resume.*motion|static space/i })).toHaveCount(0)
    await expect(fallbackPage.locator('.home-gallery, #instruments, .instrument-mechanism')).toHaveCount(0)
    await expect(gateway(fallbackPage)).toHaveAttribute('href', '/instruments')
    await noOverflow(fallbackPage)
    await capture(fallbackPage, 'landing-fallback.png')
    await gateway(fallbackPage).focus()
    await fallbackPage.keyboard.press('Enter')
    await directoryReady(fallbackPage)
    await fallbackPage.getByRole('navigation', { name: 'Choose an instrument', exact: true }).locator('a[href="/trigger"]').click()
    await expect(fallbackPage.locator('.product-page[data-instrument="trigger"]')).toBeVisible()
    await expect(fallbackPage.locator('.product-launch')).toHaveAttribute('href', '/app/?tab=trigger')
    await canonicalLinks(fallbackPage, true)
    await fallbackPage.getByRole('link', { name: 'Agyion Labs home', exact: true }).first().click()
    await expect(fallbackPage.locator('.orbital-fallback')).toBeVisible()
    await launch(fallbackPage).click()
    await fallbackPage.waitForURL('**/app/', { timeout: 4000 })
    await expect(fallbackPage).toHaveTitle('Fallback arrival fixture')
    expect(await fallbackPage.evaluate(() => sessionStorage.getItem('agyion:arrival'))).toBeNull()
  })
  await check('No-WebGL fixture has only the expected context-creation diagnostic', async () => clean(fallbackDiagnostic))
  await fallback.close()
  }
  for (const diagnostic of report.pages) clean(diagnostic)
  report.status = 'passed'
  console.log(`\n${report.checks.length} checks passed. Screenshots: ${OUTPUT}`)
} catch (error) {
  report.status = 'failed'; report.failure = { message: error.message, stack: error.stack }
  if (currentPage && !currentPage.isClosed()) await capture(currentPage, 'failure.png').catch(() => {})
  throw error
} finally {
  report.finishedAt = new Date().toISOString()
  report.sourcesAtEnd = sourceHashes()
  persist()
  await browser.close()
}
