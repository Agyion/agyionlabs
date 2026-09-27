/** Read-only examples QA against a final assembled preview. No app transaction or wallet. */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { chromium, expect } from '@playwright/test'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BASE = (process.env.BASE_URL || 'http://127.0.0.1:4292').replace(/\/$/, '')
const OUTPUT = path.resolve(process.env.QA_OUTPUT_DIR || 'artifacts/verification/2026-09-27-instrument-examples')
const WIDTHS = (process.env.QA_WIDTHS || '1440,768,390,320').split(',').map(Number)
const MOTIONS = (process.env.QA_MOTIONS || 'no-preference,reduce').split(',')
const FULL_MOTION_WIDTHS = (process.env.QA_FULL_MOTION_WIDTHS || '1440,390').split(',').map(Number)
const PRODUCTS = (process.env.QA_PRODUCTS || 'fade,pod,trigger,envoy,ramp,ledger').split(',')
const SOURCES = ['landing/src/components/InstrumentExample.tsx', 'landing/src/components/ExampleArtwork.tsx', 'landing/src/components/instrumentExamples.ts', 'landing/src/components/DetailWorld.tsx', 'landing/src/pages/Instruments.tsx', 'landing/src/pages/Instrument.tsx', 'landing/src/pages/Ramp.tsx', 'landing/src/pages/Ledger.tsx', 'landing/src/styles/instrument-example.css', 'landing/src/styles/product-pages.css', 'landing/src/styles/instrument-surfaces.css', 'landing/src/components/InstrumentObject.tsx']
const hashes = () => SOURCES.map(file => ({ file, sha256: createHash('sha256').update(fs.readFileSync(path.join(ROOT, file))).digest('hex') }))
const FAILURE_AT = { fade: 2, pod: 1, trigger: 1, envoy: 1, ramp: 1, ledger: 1 }
const FINAL_BALANCES = { fade: ['Receives 8 USDC', 'Pickup confirmed', 'Pays 8 USDC'], pod: ['Claim confirmed', 'Capsule opened', 'Receives 200 USDC'], trigger: ['Payment completed', 'Proof accepted', 'Receives 150 USDC'], envoy: ['Receives 2 USDC', 'Receives nothing', 'Pickup confirmed'], ramp: ['Simulation only', 'Example completed', '10 test USDC'], ledger: ['150 USDC entry', 'Record preserved', 'Noor · 150 USDC'] }
if (WIDTHS.some(w => !Number.isInteger(w) || w < 280) || MOTIONS.some(m => !['no-preference', 'reduce'].includes(m)) || PRODUCTS.some(s => !(s in FAILURE_AT))) throw new Error('Invalid QA matrix')
const executablePath = [process.env.CHROMIUM_PATH, '/opt/google/chrome/chrome', chromium.executablePath()].find(p => p && fs.existsSync(p))
if (!executablePath) throw new Error('No Chromium executable found')
fs.mkdirSync(OUTPUT, { recursive: true })
const report = { base: BASE, startedAt: new Date().toISOString(), status: 'running', widths: WIDTHS, motions: MOTIONS, fullMotionWidths: FULL_MOTION_WIDTHS, products: PRODUCTS, sourcesAtStart: hashes(), checks: [], screenshots: [], pages: [], limits: 'Read-only fictional illustrations. All widths exercise complete reduced-motion stories. Normal motion exercises complete stories at fullMotionWidths, and layout plus first-step/reset at other widths. Browser tests do not validate live settlement, privacy or contract safety. Software-rendered graphics do not measure native GPU performance.' }
const persist = () => fs.writeFileSync(path.join(OUTPUT, 'results.json'), JSON.stringify(report, null, 2))
let page
let diagnostic
const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
async function check(name, run) {
  const entry = { name, pass: false }
  report.checks.push(entry)
  try { entry.evidence = await run(); entry.pass = true; console.log(`PASS ${name}`) }
  catch (error) { entry.error = error.stack || error.message; throw error }
  finally { persist() }
}
async function trackedPage(context, label) {
  page = await context.newPage()
  diagnostic = { label, pageErrors: [], consoleErrors: [], failedRequests: [], httpErrors: [], writes: [], externalRequests: [] }
  report.pages.push(diagnostic)
  const d = diagnostic
  page.on('pageerror', error => d.pageErrors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') d.consoleErrors.push(message.text()) })
  page.on('requestfailed', request => d.failedRequests.push({ url: request.url(), error: request.failure()?.errorText }))
  page.on('response', response => { if (response.status() >= 400) d.httpErrors.push({ url: response.url(), status: response.status() }) })
  page.on('request', request => {
    if (!['GET', 'HEAD'].includes(request.method())) d.writes.push({ method: request.method(), url: request.url() })
    if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== new URL(BASE).origin) d.externalRequests.push(request.url())
  })
  return page
}
const example = slug => page.locator(`[data-example="${slug}"]`)
async function ready(slug) {
  await page.goto(`${BASE}/${slug}`, { waitUntil: 'networkidle' })
  const card = example(slug)
  await expect(card).toHaveAttribute('data-stage', '0')
  await expect(card).toHaveAttribute('data-status', 'ready')
  await card.scrollIntoViewIfNeeded()
  await expect(card.locator('[data-example-token]')).toHaveAttribute('opacity', '0')
  return card
}
async function advance(card, stage, keyboard = false) {
  const button = card.locator('[data-action="next"]')
  if (keyboard) { await button.focus(); await page.keyboard.press('Enter') }
  else await button.click()
  await expect(card).toHaveAttribute('data-stage', String(stage), { timeout: 7000 })
  await expect(card).toHaveAttribute('data-status', stage === 3 ? 'complete' : 'step')
  await expect(card).toHaveAttribute('aria-busy', 'false')
  await expect(card.locator('[role=status]')).not.toHaveText('')
  await expect(card.locator(stage === 3 ? '[data-action="reset"]' : '[data-action="next"]')).toBeFocused()
}
async function reset(card) {
  await card.locator('[data-action="reset"]').focus()
  await page.keyboard.press('Enter')
  await expect(card).toHaveAttribute('data-stage', '0')
  await expect(card).toHaveAttribute('data-status', 'ready')
  await expect(card.locator('[data-action="next"]')).toBeFocused()
  await expect(card.locator('[data-example-token]')).toHaveAttribute('opacity', '0')
}
async function layout(card) {
  const dimensions = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }))
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width + 1)
  const clipped = await card.evaluate(element => {
    const bounds = element.getBoundingClientRect()
    return [...element.querySelectorAll('button,h2,h3,p,.example-actors span,.example-balances > div,.example-progress li')].flatMap(child => {
      if (child.classList.contains('sr-only')) return []
      const r = child.getBoundingClientRect()
      const textOverflow = child.scrollWidth > child.clientWidth + 2 && child.clientWidth > 0
      return r.left < bounds.left - 1 || r.right > bounds.right + 1 || textOverflow ? [{ text: child.textContent, width: r.width, scrollWidth: child.scrollWidth, clientWidth: child.clientWidth }] : []
    })
  })
  expect(clipped, 'Text and controls stay inside the card without horizontal clipping').toEqual([])
  const hidden = await card.locator('.sr-only').evaluateAll(items => items.map(item => ({ width: item.getBoundingClientRect().width, height: item.getBoundingClientRect().height, clip: getComputedStyle(item).clipPath })))
  expect(hidden.every(item => item.width === 1 && item.height === 1 && item.clip === 'inset(50%)'), 'Screen reader text must not duplicate the visible story').toBe(true)
  for (const button of await card.locator('.example-controls button:visible').all()) {
    const box = await button.boundingBox()
    expect(box.height).toBeGreaterThanOrEqual(43)
  }
  return dimensions
}
async function capture(card, name) {
  const target = path.join(OUTPUT, `${name}.png`)
  await card.screenshot({ path: target, animations: 'disabled' })
  report.screenshots.push(target)
}
function clean() {
  for (const key of ['pageErrors', 'consoleErrors', 'failedRequests', 'httpErrors', 'writes', 'externalRequests']) expect(diagnostic[key], key).toEqual([])
}
try {
  for (const width of WIDTHS) for (const motion of MOTIONS) {
    const context = await browser.newContext({ viewport: { width, height: width < 800 ? 900 : 1000 }, reducedMotion: motion })
    await trackedPage(context, `${width}px ${motion}`)
    await check(`${width}px ${motion}: six readable directory examples`, async () => {
      await page.goto(`${BASE}/instruments`, { waitUntil: 'networkidle' })
      const links = page.locator('nav[aria-label="Choose an instrument"] .collection-object')
      await expect(links).toHaveCount(6)
      await expect(links.locator('.instrument-object')).toHaveCount(6)
      const summaries = await links.locator('.collection-object__caption p').allTextContents()
      expect(summaries).toHaveLength(6)
      expect(summaries.every(summary => summary.trim().split(/\s+/).length >= 7), 'Each object keeps its real-life example summary').toBe(true)
      expect(new Set(summaries).size).toBe(6)
      expect(await links.evaluateAll(items => items.map(item => item.getAttribute('href')))).toEqual(['/fade', '/pod', '/trigger', '/envoy', '/ramp', '/ledger'])
      expect(await page.locator('body').innerText()).not.toMatch(/[\u2013\u2014]/)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      const target = path.join(OUTPUT, `directory-${width}-${motion}.png`)
      await page.screenshot({ path: target, fullPage: true, animations: 'disabled' }); report.screenshots.push(target)
    })
    for (const slug of PRODUCTS) {
      const label = `${slug} ${width}px ${motion}`
      if (motion === 'no-preference' && !FULL_MOTION_WIDTHS.includes(width)) {
        await check(`${label}: responsive layout, animated first step and keyboard reset`, async () => {
          const card = await ready(slug)
          await layout(card)
          await capture(card, `${slug}-${width}-${motion}-initial`)
          await advance(card, 1, true)
          await layout(card)
          await reset(card)
        })
        continue
      }
      await check(`${label}: complete four-step story, amounts, stable artwork and keyboard focus`, async () => {
        const card = await ready(slug)
        await expect(card.locator('.example-disclosure')).toContainText('No money moves')
        await expect(card.locator('.example-progress li')).toHaveCount(4)
        await expect(card.locator('svg')).toHaveCount(1)
        const svg = await card.locator('svg').elementHandle()
        expect(await card.innerText()).not.toMatch(/[\u2013\u2014]/)
        await layout(card)
        await capture(card, `${slug}-${width}-${motion}-initial`)
        for (const stage of [1, 2, 3]) {
          await advance(card, stage, true)
          await layout(card)
          if (slug === 'fade' && stage === 2) await expect(card.locator('.example-outcome h3')).toContainText('Nothing is paid yet')
          if (slug === 'envoy' && stage === 2) await expect(card.locator('.example-balances')).toContainText('1 of 50 claims')
        }
        expect(await card.locator('.example-balances strong').allTextContents()).toEqual(FINAL_BALANCES[slug])
        expect(await svg.evaluate(element => element.isConnected && element === document.querySelector('.instrument-example svg'))).toBe(true)
        await svg.dispose()
        await expect(card.locator('[data-action="next"], [data-action="alternative"]')).toHaveCount(0)
        await expect(card.locator('[data-example-token]')).toHaveAttribute('opacity', '0')
        await capture(card, `${slug}-${width}-${motion}-complete`)
        return { balances: FINAL_BALANCES[slug], finalStage: 3 }
      })
      await check(`${label}: blocked attempt preserves stage, announces result and resets`, async () => {
        const card = example(slug)
        await reset(card)
        for (let stage = 1; stage <= FAILURE_AT[slug]; stage++) await advance(card, stage)
        const balances = await card.locator('.example-balances strong').allTextContents()
        await card.locator('[data-action="alternative"]').focus()
        await page.keyboard.press('Enter')
        await expect(card).toHaveAttribute('data-status', 'blocked', { timeout: 7000 })
        await expect(card).toHaveAttribute('data-stage', String(FAILURE_AT[slug]))
        await expect(card.locator('[data-action="next"], [data-action="alternative"]')).toHaveCount(0)
        await expect(card.locator('[data-action="reset"]')).toBeFocused()
        expect(await card.locator('.example-balances strong').allTextContents()).toEqual(balances)
        await expect(card.locator('[role=status]')).not.toHaveText('')
        await layout(card)
        await reset(card)
        await page.waitForTimeout(250)
        await expect(card).toHaveAttribute('data-stage', '0')
      })
    }
    await check(`${width}px ${motion}: no browser, asset, wallet or remote network errors`, async () => clean())
    await context.close()
  }
  const context = await browser.newContext({ viewport: { width: 390, height: 900 }, reducedMotion: 'no-preference' })
  await trackedPage(context, 'Animation interruption regressions')
  await check('Rapid repeated activation advances one step and motion visibly progresses', async () => {
    const card = await ready('fade')
    await card.locator('[data-action="next"]').focus()
    await card.locator('[data-action="next"]').evaluate(button => { button.click(); button.click(); button.click() })
    await expect(card).toHaveAttribute('data-status', 'running')
    await expect(card.locator('[data-action="next"]')).toBeDisabled()
    const first = await card.locator('[data-example-token]').getAttribute('transform')
    await page.waitForTimeout(400)
    const second = await card.locator('[data-example-token]').getAttribute('transform')
    expect(second).not.toBe(first)
    expect(Number(await card.locator('[data-example-token]').getAttribute('opacity'))).toBeGreaterThan(0)
    await expect(card).toHaveAttribute('data-stage', '1', { timeout: 7000 })
    await expect(card).toHaveAttribute('data-status', 'step')
    await page.waitForTimeout(300)
    await expect(card).toHaveAttribute('data-stage', '1')
    return { first, second }
  })
  await check('Reset during animation cancels its result and returns focus to the first action', async () => {
    const card = example('fade')
    await reset(card)
    await card.locator('[data-action="next"]').click()
    await expect(card).toHaveAttribute('data-status', 'running')
    await reset(card)
    await page.waitForTimeout(2400)
    await expect(card).toHaveAttribute('data-stage', '0')
    await expect(card).toHaveAttribute('data-status', 'ready')
  })
  await check('Enabling reduced motion mid-animation finishes exactly once', async () => {
    const card = await ready('pod')
    await card.locator('[data-action="next"]').click()
    await expect(card).toHaveAttribute('data-status', 'running')
    await page.waitForTimeout(250)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(card).toHaveAttribute('data-stage', '1')
    await expect(card).toHaveAttribute('data-status', 'step')
    await page.waitForTimeout(2300)
    await expect(card).toHaveAttribute('data-stage', '1')
    await advance(card, 2)
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await advance(card, 3)
  })
  await check('Navigation during animation disposes the old scene and history restores a fresh example', async () => {
    const card = await ready('trigger')
    await card.locator('[data-action="next"]').click()
    const svg = await card.locator('svg').elementHandle()
    await page.getByRole('link', { name: '← All instruments', exact: true }).click()
    await expect(page).toHaveURL(/\/instruments$/)
    expect(await svg.evaluate(element => element.isConnected)).toBe(false)
    await page.waitForTimeout(2300)
    await page.goBack()
    await expect(page).toHaveURL(/\/trigger$/)
    await expect(example('trigger')).toHaveAttribute('data-stage', '0')
    await expect(example('trigger')).toHaveAttribute('data-status', 'ready')
    await svg.dispose()
  })
  await check('Animation interruption checks produce no errors or transactions', async () => clean())
  await context.close()
  report.sourcesAtEnd = hashes()
  expect(report.sourcesAtEnd, 'Source files must not change during final browser evidence').toEqual(report.sourcesAtStart)
  report.status = 'passed'
} catch (error) {
  report.status = 'failed'
  report.failure = error.stack || error.message
  if (page && !page.isClosed()) {
    const target = path.join(OUTPUT, 'failure.png')
    try { await page.screenshot({ path: target, fullPage: true }); report.screenshots.push(target) } catch {}
  }
  console.error(report.failure)
  process.exitCode = 1
} finally {
  report.finishedAt = new Date().toISOString()
  report.passed = report.checks.filter(check => check.pass).length
  report.total = report.checks.length
  persist()
  await browser.close()
  console.log(`${report.status.toUpperCase()} ${report.passed}/${report.total}. ${OUTPUT}`)
}
