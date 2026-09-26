/** Immersive landing UX matrix. Use one isolated browser/GPU slot. */
import fs from 'node:fs'
import path from 'node:path'
import { chromium, expect } from '@playwright/test'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173'
const OUTPUT = process.env.QA_OUTPUT_DIR || '/tmp/agyion-landing-qa'
const candidates = [process.env.CHROMIUM_PATH, chromium.executablePath(), '/opt/google/chrome/chrome', '/snap/bin/chromium', '/usr/bin/chromium'].filter(Boolean)
const executablePath = candidates.find(candidate => fs.existsSync(candidate))
if (!executablePath) throw new Error('Chromium is required. Set CHROMIUM_PATH or install the Playwright browser.')
fs.mkdirSync(OUTPUT, { recursive: true })
const report = { base: BASE, status: 'running', startedAt: new Date().toISOString(), checks: [], pages: [], screenshots: [], failure: null,
  limits: 'SwiftShader checks interaction correctness and saved appearance, not native GPU performance. The flight destination is an isolated same-origin fixture; app behavior has its own suite.' }
const persist = () => fs.writeFileSync(path.join(OUTPUT, 'results.json'), JSON.stringify(report, null, 2))
const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
let currentDiagnostic
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
  const diagnostic = { label, phase: 'setup', consoleErrors: [], pageErrors: [], requestFailures: [], httpErrors: [] }
  report.pages.push(diagnostic); currentDiagnostic = diagnostic
  page.on('pageerror', error => diagnostic.pageErrors.push({ phase: diagnostic.phase, message: error.message, stack: error.stack }))
  page.on('console', message => {
    if (message.type() === 'error') diagnostic.consoleErrors.push({ phase: diagnostic.phase, message: message.text(), location: message.location(), expected: expectedNoWebGL && /Error creating WebGL context/i.test(message.text()) })
  })
  page.on('requestfailed', request => diagnostic.requestFailures.push({ phase: diagnostic.phase, url: request.url(), method: request.method(), error: request.failure()?.errorText }))
  page.on('response', response => { if (response.status() >= 400) diagnostic.httpErrors.push({ phase: diagnostic.phase, url: response.url(), status: response.status() }) })
  return { page, diagnostic }
}
function clean(diagnostic) {
  expect(diagnostic.pageErrors, 'Unexpected JavaScript errors').toEqual([])
  expect(diagnostic.consoleErrors.filter(error => !error.expected), 'Unexpected console errors').toEqual([])
  expect(diagnostic.requestFailures, 'Failed requests remain visible in the report').toEqual([])
  expect(diagnostic.httpErrors, 'HTTP errors remain visible in the report').toEqual([])
}
async function capture(page, filename) {
  const output = path.join(OUTPUT, filename)
  await page.screenshot({ path: output, fullPage: true, animations: 'disabled', timeout: 60000 })
  report.screenshots.push(output)
}
const world = page => page.locator('.orbital-home--immersive')
const controls = page => page.getByRole('group', { name: 'Instruments', exact: true })
const exhibit = (page, slug) => page.locator(`#exhibit-${slug}`)
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
  await page.evaluate(() => document.fonts.ready)
}
async function navigationLink(page, name) {
  const desktop = page.getByRole('navigation', { name: 'Main navigation', exact: true })
  if (await desktop.isVisible()) return desktop.getByRole('link', { name, exact: true })
  const mobile = page.getByRole('navigation', { name: 'Mobile navigation', exact: true })
  if (!await mobile.isVisible()) await page.getByRole('button', { name: 'Open navigation menu', exact: true }).click()
  return mobile.getByRole('link', { name, exact: true })
}
async function focusReturned(page, opener) {
  if (await opener.isVisible()) await expect(opener).toBeFocused()
  else await expect.poll(() => page.evaluate(() => {
    const active = document.activeElement
    return active instanceof HTMLElement && active !== document.body && active.getClientRects().length > 0
      && (active.id === 'instruments' || active.id === 'instrument-stage' || active.matches('.orbital-nav__toggle') || !!active.closest('.immersive-instruments'))
  }), { message: 'Closing a mobile dialog must restore a visible navigation/instrument target, not a hidden menu link or body' }).toBe(true)
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
      proto.linkProgram = function (program) { const s = state(this); if (/PointsMaterial/.test((s.shaders.get(program) || []).map(shader => s.sources.get(shader) || '').join('\n'))) s.stars.add(program); return link.call(this, program) }
      proto.getUniformLocation = function (program, name) { const item = location.call(this, program, name); if (item) state(this).uniforms.set(item, { name, star: state(this).stars.has(program) }); return item }
      proto.uniformMatrix4fv = function (item, transpose, values, ...rest) { const uniform = item && state(this).uniforms.get(item); if (uniform?.star && uniform.name === 'modelViewMatrix') window.__landingProbe.matrix = Array.from(values).slice(rest[0] || 0, (rest[0] || 0) + 16); return matrix.call(this, item, transpose, values, ...rest) }
    }
  })
}
const basisChange = (a, b) => Math.max(...[0, 1, 2, 4, 5, 6, 8, 9, 10].map(index => Math.abs(a[index] - b[index])))

try {
  for (const width of [1440, 768, 360, 320]) {
    const context = await browser.newContext({ viewport: { width, height: width <= 360 ? 800 : 1000 } })
    const { page, diagnostic } = await trackedPage(context, `${width}px normal`)
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })
    await check(`${width}px: one immersive world, readable identity and no overflow`, async () => {
      await homeReady(page)
      await expect(world(page)).toHaveAttribute('data-selected', 'none')
      await expect(controls(page).getByRole('button')).toHaveCount(4)
      await expect(controls(page).locator('[aria-pressed=true]')).toHaveCount(0)
      await expect(page.locator('vite-error-overlay')).toHaveCount(0)
      await expect(page.getByRole('button', { name: /pause.*motion|resume.*motion/i })).toHaveCount(0)
      const dimensions = await noOverflow(page)
      expect(dimensions.scrollHeight - dimensions.height, 'Home stays a single viewport rather than a long scrolling landing').toBeLessThanOrEqual(80)
      clean(diagnostic)
      return dimensions
    })
    await check(`${width}px: clear world accepts input while native launch and supporting links remain reachable`, async () => {
      const canvas = page.locator('.orbital-scene canvas')
      await expect(canvas).toHaveAttribute('tabindex', '0')
      const surface = await page.evaluate(() => {
        const header = document.querySelector('.orbital-nav').getBoundingClientRect()
        const dock = document.querySelector('#instruments').getBoundingClientRect()
        let hits = 0
        for (const fx of [.2, .35, .5, .65, .8, .9]) for (const fy of [.2, .4, .6, .8]) {
          const x = innerWidth * fx, y = header.bottom + (Math.min(dock.top, innerHeight) - header.bottom) * fy
          if (document.elementFromPoint(x, y)?.tagName === 'CANVAS') hits++
        }
        return { hits, samples: 24 }
      })
      expect(surface.hits, 'Content wrappers must leave a substantial canvas area hittable').toBeGreaterThanOrEqual(10)
      await expect(launch(page)).toHaveAttribute('href', '/app/')
      await expect(launch(page)).toBeVisible()
      for (const slug of ['ramp', 'ledger']) await expect(page.getByRole('navigation', { name: 'Supporting tools' }).locator(`a[href='/${slug}']`)).toBeVisible()
      await expect(page.locator('.orbital-nav')).toHaveCSS('position', 'fixed')
      return surface
    })
    if (width <= 768) await check(`${width}px: mobile menu Escape returns focus`, async () => {
      const toggle = page.getByRole('button', { name: 'Open navigation menu', exact: true })
      await toggle.click()
      await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(toggle).toBeFocused()
      await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toBeHidden()
    })
    await check(`${width}px: Instruments hash stays in the world and Home clears selection`, async () => {
      await (await navigationLink(page, 'Instruments')).click()
      await expect(page).toHaveURL(/#instruments$/)
      await expect(page.locator('#instrument-stage')).toBeFocused()
      await expect(world(page)).toHaveAttribute('data-view', 'instruments')
      await expect(page.locator('.immersive-intro')).toBeHidden()
      await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(3)
      await exhibit(page, 'pod').click()
      await expect(world(page)).toHaveAttribute('data-selected', 'pod')
      await (await navigationLink(page, 'Home')).click()
      await expect(page).toHaveURL(/#home$/)
      await expect(world(page)).toHaveAttribute('data-selected', 'none')
      await expect(controls(page).locator('[aria-pressed=true]')).toHaveCount(0)
      await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(3)
    })
    await check(`${width}px: four pressed controls expose matching native detail and workspace links`, async () => {
      for (const [slug, name] of [['fade', 'Fade'], ['pod', 'Pod'], ['trigger', 'Trigger'], ['envoy', 'Envoy']]) {
        await exhibit(page, slug).click()
        await expect(exhibit(page, slug)).toHaveAttribute('aria-pressed', 'true')
        await expect(controls(page).locator('[aria-pressed=true]')).toHaveCount(1)
        await expect(world(page)).toHaveAttribute('data-selected', slug)
        await expect(page.locator('#exhibit-title')).toContainText(name)
        await expect(page.locator('#exhibit-title')).toBeVisible()
        await expect(page.locator('#instrument-stage').getByRole('link', { name: 'Details', exact: true })).toHaveAttribute('href', `/${slug}`)
        await expect(page.getByRole('link', { name: `Open ${name}`, exact: true })).toHaveAttribute('href', `/app/?tab=${slug}`)
        await noOverflow(page)
      }
    })
    await check(`${width}px: arrows, wrapping, Home and End select; hover preserves keyboard context`, async () => {
      await exhibit(page, 'envoy').focus()
      for (const [key, slug] of [['ArrowRight', 'fade'], ['ArrowLeft', 'envoy'], ['ArrowLeft', 'trigger'], ['Home', 'fade'], ['End', 'envoy']]) {
        await page.keyboard.press(key)
        await expect(exhibit(page, slug)).toBeFocused()
        await expect(exhibit(page, slug)).toHaveAttribute('aria-pressed', 'true')
      }
      const details = page.locator('#instrument-stage').getByRole('link', { name: 'Details', exact: true })
      await details.focus()
      await exhibit(page, 'pod').hover()
      await expect(world(page)).toHaveAttribute('data-selected', 'envoy')
      await expect(details).toBeFocused()
      await expect(details).toHaveAttribute('href', '/envoy')
    })
    await check(`${width}px: native How dialog closes with Escape and Close, returning focus and selection`, async () => {
      await (await navigationLink(page, 'Instruments')).click()
      await exhibit(page, 'pod').click()
      for (const method of ['Escape', 'Close']) {
        const opener = await navigationLink(page, 'How it works')
        await opener.click()
        await expect(page).toHaveURL(/#how-it-works$/)
        const dialog = page.getByRole('dialog', { name: 'How it works', exact: true })
        await expect(dialog).toBeVisible()
        expect(await dialog.evaluate(element => element.matches(':modal'))).toBe(true)
        const close = dialog.getByRole('button', { name: 'Close', exact: true })
        await expect(close).toBeFocused()
        await expect(dialog.getByRole('tab')).toHaveCount(3)
        await dialog.getByRole('tab', { name: 'Result', exact: true }).click()
        await expect(dialog.getByRole('tabpanel')).toContainText('Claims and refunds require a transaction.')
        await page.keyboard.press('Tab')
        expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true)
        await page.keyboard.press('Shift+Tab')
        expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true)
        if (method === 'Escape') await page.keyboard.press('Escape')
        else await close.click()
        await expect(dialog).toBeHidden()
        await expect(page).toHaveURL(/#instruments$/)
        await expect(world(page)).toHaveAttribute('data-selected', 'pod')
        await focusReturned(page, opener)
        await expect(world(page)).toHaveAttribute('data-view', 'instruments')
      }
    })
    await check(`${width}px: browser Back from explanation preserves the chosen instrument`, async () => {
      await (await navigationLink(page, 'Home')).click()
      await expect(world(page)).toHaveAttribute('data-selected', 'none')
      await exhibit(page, 'pod').click()
      await (await navigationLink(page, 'How it works')).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await page.goBack()
      await expect(page).toHaveURL(/#instruments$/)
      await expect(page.getByRole('dialog')).toBeHidden()
      await expect(world(page)).toHaveAttribute('data-selected', 'pod')
    })
    await (await navigationLink(page, 'Home')).click()
    await expect(world(page)).toHaveAttribute('data-selected', 'none')
    await capture(page, `landing-${width}.png`)
    await exhibit(page, 'fade').click()
    await capture(page, `landing-${width}-fade.png`)
    await check(`${width}px: no runtime or asset errors`, async () => clean(diagnostic))
    await context.close()
  }

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
  for (const slug of ['fade', 'pod', 'trigger', 'envoy', 'ramp', 'ledger']) await check(`/${slug}: spatial detail, manual conditions, native app destination and renderer teardown`, async () => {
    await page.goto(`${BASE}/${slug}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const detail = page.locator(`.detail-world[data-instrument='${slug}']`)
    await expect(detail).toBeVisible()
    await expect(page.locator('.orbital-scene')).toHaveClass(/is-ready/, { timeout: 30000 })
    await expect(page.locator('.orbital-scene canvas')).toHaveCount(1)
    await expect(detail.locator('.detail-world__launch')).toHaveAttribute('href', `/app/?tab=${slug}`)
    const tabs = detail.getByRole('tablist').getByRole('tab')
    await expect(tabs).toHaveCount(3)
    await tabs.nth(0).focus()
    await page.keyboard.press('End')
    await expect(tabs.nth(2)).toBeFocused()
    await expect(detail).toHaveAttribute('data-step', '2')
    await expect(detail.getByRole('tabpanel')).toHaveCount(1)
    await page.keyboard.press('Home')
    await expect(detail).toHaveAttribute('data-step', '0')
    await expect(detail.locator('.detail-world__limits')).not.toHaveAttribute('open', '')
    await detail.locator('.detail-world__limits summary').click()
    await expect(detail.locator('.detail-world__limits')).toHaveAttribute('open', '')
    await detail.locator('.detail-world__limits summary').click()
    await noOverflow(page)
    const outgoing = await page.locator('.orbital-scene canvas').elementHandle()
    await page.getByRole('link', { name: 'Agyion Labs home', exact: true }).first().click()
    await homeReady(page)
    await expect.poll(() => outgoing.evaluate(element => element.isConnected)).toBe(false)
    await outgoing.dispose()
  })
  await check('A physical detail object opens its matching detail route and retains one renderer', async () => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto(`${BASE}/fade`, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('.orbital-scene')).toHaveClass(/is-ready/, { timeout: 30000 })
    // Pod center observed in the saved1440×1000 reduced-motion Fade stage-0
    // raster: detail-world-final-verified/fade-1440-stage-0-scene.png.
    const point = { x: 917, y: 759 }
    expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, point)).toBe('CANVAS')
    await capture(page, 'detail-fade-before-physical-pod.png')
    await page.mouse.click(point.x, point.y)
    await expect(page).toHaveURL(/\/pod$/)
    await expect(page.locator('.detail-world')).toHaveAttribute('data-instrument', 'pod')
    await expect(page.locator('.orbital-scene')).toHaveClass(/is-ready/, { timeout: 30000 })
    await expect(page.locator('.orbital-scene canvas')).toHaveCount(1)
    await page.setViewportSize({ width: 360, height: 800 })
    await page.getByRole('link', { name: 'Agyion Labs home', exact: true }).first().click()
    await homeReady(page)
    return point
  })
  await check('Same-document How hash opens without scroll and restores the existing visible focus', async () => {
    const opener = await page.evaluateHandle(() => document.activeElement)
    expect(await opener.evaluate(element => element instanceof HTMLElement && element !== document.body && element.getClientRects().length > 0)).toBe(true)
    await page.goto(`${BASE}/#how-it-works`, { waitUntil: 'domcontentloaded' })
    const dialog = page.getByRole('dialog', { name: 'How it works', exact: true })
    await expect(dialog).toBeVisible()
    expect(await dialog.evaluate(element => element.matches(':modal'))).toBe(true)
    await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeFocused()
    await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(3)
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(page).toHaveURL(/#home$/)
    await expect.poll(() => opener.evaluate(element => element === document.activeElement && element.isConnected && element.getClientRects().length > 0)).toBe(true)
    await opener.dispose()
  })
  const directContext = await browser.newContext({ viewport: { width: 360, height: 800 }, reducedMotion: 'reduce' })
  const { page: directPage, diagnostic: directDiagnostic } = await trackedPage(directContext, 'Fresh direct How URL')
  await check('Fresh direct How URL focuses Close and returns to visible mobile navigation', async () => {
    await directPage.goto(`${BASE}/#how-it-works`, { waitUntil: 'networkidle' })
    const dialog = directPage.getByRole('dialog', { name: 'How it works', exact: true })
    await expect(dialog).toBeVisible()
    expect(await dialog.evaluate(element => element.matches(':modal'))).toBe(true)
    await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeFocused()
    await expect.poll(() => directPage.evaluate(() => scrollY)).toBeLessThan(3)
    await directPage.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(directPage).toHaveURL(/#home$/)
    await expect(directPage.getByRole('button', { name: 'Open navigation menu', exact: true })).toBeFocused()
    clean(directDiagnostic)
  })
  await directContext.close()
  currentDiagnostic = diagnostic
  await check('Reduced motion retains instrument selection and native direct workspace navigation', async () => {
    await exhibit(page, 'pod').click()
    await expect(exhibit(page, 'pod')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.immersive-exhibit__story')).toHaveCSS('animation-name', 'none')
    await page.route('**/app/?tab=pod', route => route.fulfill({ contentType: 'text/html', body: '<title>Direct Pod fixture</title>' }))
    await page.getByRole('link', { name: 'Open Pod', exact: true }).click()
    await page.waitForURL('**/app/?tab=pod', { timeout: 2500 })
    await expect(page).toHaveTitle('Direct Pod fixture')
    expect(await page.evaluate(() => sessionStorage.getItem('agyion:arrival'))).toBeNull()
  })
  await check('Reduced motion and detail routes have no runtime or asset errors', async () => clean(diagnostic))
  await reduced.close()

  const flightContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const { page: flight, diagnostic: flightDiagnostic } = await trackedPage(flightContext, 'Normal launch')
  await flight.route('**/app/?tab=pod', route => route.fulfill({ contentType: 'text/html', body: '<title>Station arrival fixture</title><main>Station</main>' }))
  await flight.goto(BASE, { waitUntil: 'domcontentloaded' })
  await homeReady(flight)
  await check('Modified, middle-click and new-tab links preserve native behavior', async () => {
    const native = await launch(flight).evaluate(anchor => {
      const results = []
      for (const mode of ['ctrl', 'meta', 'shift', 'alt', 'middle', 'blank']) {
        if (mode === 'blank') anchor.target = '_blank'
        anchor.addEventListener('click', event => { results.push({ mode, native: !event.defaultPrevented }); event.preventDefault() }, { once: true })
        anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: mode === 'middle' ? 1 : 0, ctrlKey: mode === 'ctrl', metaKey: mode === 'meta', shiftKey: mode === 'shift', altKey: mode === 'alt' }))
        anchor.removeAttribute('target'); anchor.href = '/app/'
      }
      return results
    })
    expect(native.every(item => item.native)).toBe(true)
    await expect(flight.locator('html')).not.toHaveClass(/is-launching/)
    return native
  })
  await check('Open Pod preserves its destination through the complete 9.8-second flight and settled handoff', async () => {
    await exhibit(flight, 'pod').click()
    await expect(flight).toHaveURL(/#instruments$/)
    await expect(world(flight)).toHaveAttribute('data-view', 'instruments')
    const openPod = flight.locator('#instrument-stage').getByRole('link', { name: 'Open Pod', exact: true })
    await expect(openPod).toBeVisible()
    const started = Date.now()
    await openPod.click()
    await expect(flight.locator('html')).toHaveClass(/is-launching/)
    await expect(flight.locator('.orbital-scene__canvas')).toHaveAttribute('data-flight-phase', 'launching')
    await flight.waitForURL('**/app/?tab=pod', { timeout: 15000 })
    const duration = Date.now() - started
    expect(duration).toBeGreaterThan(9500)
    expect(duration).toBeLessThan(15000)
    await expect(flight).toHaveTitle('Station arrival fixture')
    const handoff = await flight.evaluate(() => ({ marker: JSON.parse(sessionStorage.getItem('agyion:arrival') || 'null'), frame: JSON.parse(sessionStorage.getItem('agyion:flight-frame') || 'null') }))
    expect(Date.now() - handoff.marker.at).toBeLessThan(5000)
    expect(handoff.marker.settled).toBe(true)
    expect(handoff.frame.id).toBe(handoff.marker.id)
    expect(handoff.frame.at).toBe(handoff.marker.at)
    for (const key of ['elapsed', 'ringFocus', 'yaw', 'pitch', 'zoom']) expect(Number.isFinite(handoff.frame.pose[key])).toBe(true)
    return { duration, marker: handoff.marker, pose: handoff.frame.pose }
  })
  await check('Launch has no runtime or asset errors', async () => clean(flightDiagnostic))
  await flightContext.close()

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
  await check('Without WebGL, content, four controls, native details and direct launch remain usable', async () => {
    await expect(fallbackPage.locator('.orbital-fallback')).toBeVisible()
    await expect(fallbackPage.getByRole('heading', { level: 1 })).toHaveText(/^agyion\s*labs$/i)
    await expect(fallbackPage.getByRole('button', { name: /pause.*motion|resume.*motion|static space/i })).toHaveCount(0)
    await expect(controls(fallbackPage).getByRole('button')).toHaveCount(4)
    await exhibit(fallbackPage, 'trigger').click()
    await expect(fallbackPage.getByRole('link', { name: 'Open Trigger', exact: true })).toHaveAttribute('href', '/app/?tab=trigger')
    await expect(fallbackPage.locator('#instrument-stage').getByRole('link', { name: 'Details', exact: true })).toHaveAttribute('href', '/trigger')
    await noOverflow(fallbackPage)
    await capture(fallbackPage, 'landing-fallback.png')
    await fallbackPage.locator('.orbital-nav__launch').click()
    await fallbackPage.waitForURL('**/app/', { timeout: 2500 })
    await expect(fallbackPage).toHaveTitle('Fallback arrival fixture')
  })
  await check('No-WebGL fixture has only the expected context-creation diagnostic', async () => clean(fallbackDiagnostic))
  await fallback.close()
  report.status = 'passed'
  console.log(`\n${report.checks.length} checks passed. Screenshots: ${OUTPUT}`)
} catch (error) {
  report.status = 'failed'; report.failure = { message: error.message, stack: error.stack }; throw error
} finally {
  persist()
  await browser.close()
}
