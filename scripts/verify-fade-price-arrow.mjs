import { settleRenderedPage } from './lib/browser-settle.mjs';
/** Read-only, actual glyph geometry for the Fade price connector.
 * Run only while holding the shared GPU slot. No wallet or transaction actions.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { chromium, expect } from '@playwright/test'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BASE = (process.env.BASE_URL || 'http://127.0.0.1:4292').replace(/\/$/, '')
const OUTPUT = path.resolve(process.env.QA_OUTPUT_DIR || 'artifacts/verification/2026-09-27-readable-workspaces/fade-arrow')
const WIDTHS = (process.env.QA_WIDTHS || '1440,1024,768,390,320').split(',').map(Number)
const SOURCES = ['scripts/verify-fade-price-arrow.mjs', 'app/app/components/app/FadePanel.tsx', 'app/app/instrument-workspaces.css', 'app/app/console-surface.css', 'app/app/orbital.css']
const hashes = () => SOURCES.map(file => ({ file, sha256: createHash('sha256').update(fs.readFileSync(path.join(ROOT, file))).digest('hex') }))
if (WIDTHS.some(width => !Number.isInteger(width) || width < 280)) throw new Error('Invalid widths')
fs.mkdirSync(OUTPUT, { recursive: true })
const report = { base: BASE, startedAt: new Date().toISOString(), status: 'running', uiStatus: 'running', diagnosticStatus: 'running', sourcesAtStart: hashes(), checks: [], pages: [], screenshots: [], limits: 'Actual Range glyph bounds, not the full-width arrow span. Desktop center tolerance is1 CSS pixel. Mobile arrow is intentionally hidden. Fresh disconnected contexts, no wallet connection, signing, draft-secret preparation, or transaction action. This targeted test does not establish blanket alignment coverage.' }
const persist = () => fs.writeFileSync(path.join(OUTPUT, 'results.json'), JSON.stringify(report, null, 2))
const executablePath = [process.env.CHROMIUM_PATH, '/opt/google/chrome/chrome', chromium.executablePath()].find(file => file && fs.existsSync(file))
const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
try {
  for (const width of WIDTHS) {
    const context = await browser.newContext({ viewport: { width, height: width <= 600 ? 900 : 1000 }, deviceScaleFactor: 1, isMobile: width <= 600, hasTouch: width <= 600, reducedMotion: 'reduce' })
    const page = await context.newPage(); page.setDefaultTimeout(15000)
    const errors = { width, pageErrors: [], consoleErrors: [], requestFailures: [], httpErrors: [], csp: [] }; report.pages.push(errors)
    page.on('pageerror', error => errors.pageErrors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.consoleErrors.push({ text: message.text(), location: message.location() }) })
    page.on('requestfailed', request => errors.requestFailures.push({ url: request.url(), error: request.failure()?.errorText }))
    page.on('response', response => { if (response.status() >= 400) errors.httpErrors.push({ url: response.url(), status: response.status() }) })
    await page.exposeBinding('__arrowCsp', (_source, data) => errors.csp.push(data))
    await page.addInitScript(() => document.addEventListener('securitypolicyviolation', event => { void window.__arrowCsp({ blockedURI: event.blockedURI, directive: event.violatedDirective }).catch(() => {}) }))
    const check = { width, name: width > 600 ? 'Visible arrow glyph centers on both price inputs and their container' : 'Phone price layout and reachable action stay intact', pass: false }; report.checks.push(check)
    try {
      await page.goto(`${BASE}/app/?tab=fade`, { waitUntil: 'domcontentloaded' })
      await expect(page.locator('.orbital-backdrop')).toHaveClass(/is-ready/, { timeout: 60000 })
      await expect(page.locator('#panel-fade')).toBeVisible()
      await settleRenderedPage(page)
      await page.locator('.station-drawer-scroll').evaluate(element => { element.scrollTop = 0 })
      const geometry = await page.locator('.fade-price-endpoints').evaluate(container => {
        const box = element => { const r = element.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height, cx: (r.left + r.right) / 2 } }
        const arrow = container.querySelector('.fade-price-connector'), inputs = [...container.querySelectorAll('input')]
        const range = document.createRange(); range.selectNodeContents(arrow)
        const r = range.getBoundingClientRect()
        return { container: box(container), inputs: inputs.map(box), glyph: { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height, cx: (r.left + r.right) / 2 }, display: getComputedStyle(arrow).display, documentWidth: document.documentElement.scrollWidth, viewport: innerWidth, workspace: box(document.querySelector('.station-workspace')), dock: box(document.querySelector('.station-dock')), tabs: [...document.querySelectorAll('.station-dock [role=tab]')].map(tab => ({ text: tab.textContent.trim(), ...box(tab) })) }
      })
      check.geometry = geometry
      expect(geometry.inputs).toHaveLength(2)
      expect(geometry.documentWidth).toBeLessThanOrEqual(width + 1)
      for (const input of geometry.inputs) { expect(input.width).toBeGreaterThan(0); expect(input.left).toBeGreaterThanOrEqual(0); expect(input.right).toBeLessThanOrEqual(width) }
      if (width > 600) {
        expect(geometry.display).not.toBe('none'); expect(geometry.glyph.width).toBeGreaterThan(0)
        const offsets = [...geometry.inputs, geometry.container].map(box => Math.abs(geometry.glyph.cx - box.cx)); check.centerOffsets = offsets
        expect(Math.max(...offsets), 'The rendered arrow glyph must align, not merely its full-width span').toBeLessThanOrEqual(1)
        expect(geometry.glyph.top).toBeGreaterThanOrEqual(geometry.inputs[0].bottom)
        expect(geometry.glyph.bottom).toBeLessThanOrEqual(geometry.inputs[1].top)
      } else {
        expect(geometry.display).toBe('none'); expect(geometry.glyph.width).toBe(0)
        if (width > 360) { expect(Math.abs(geometry.inputs[0].top - geometry.inputs[1].top)).toBeLessThanOrEqual(1); expect(geometry.inputs[1].left).toBeGreaterThan(geometry.inputs[0].right) }
        else { expect(geometry.inputs[1].top).toBeGreaterThan(geometry.inputs[0].bottom); expect(Math.abs(geometry.inputs[0].cx - geometry.inputs[1].cx)).toBeLessThanOrEqual(1) }
      }
      expect(geometry.workspace.bottom).toBeLessThanOrEqual(geometry.dock.top)
      for (const tab of geometry.tabs) { expect(tab.left).toBeGreaterThanOrEqual(0); expect(tab.right).toBeLessThanOrEqual(width); expect(tab.height).toBeGreaterThanOrEqual(44) }
      const topImage = path.join(OUTPUT, `fade-${width}-top.png`); await page.screenshot({ path: topImage }); report.screenshots.push(topImage)
      const ticketImage = path.join(OUTPUT, `fade-${width}-price-ticket.png`); await page.locator('.fade-price-ticket').screenshot({ path: ticketImage }); report.screenshots.push(ticketImage)
      const action = page.getByRole('button', { name: 'Lock the pot', exact: true }); await expect(action).toBeDisabled(); await action.scrollIntoViewIfNeeded()
      const actionGeometry = await action.evaluate(element => { const r = element.getBoundingClientRect(), x = (r.left + r.right) / 2, y = (r.top + r.bottom) / 2, hit = document.elementFromPoint(x, y); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, centerUncovered: Boolean(hit && element.contains(hit)), viewport: innerWidth } })
      check.action = actionGeometry
      expect(actionGeometry.centerUncovered).toBe(true); expect(actionGeometry.left).toBeGreaterThanOrEqual(0); expect(actionGeometry.right).toBeLessThanOrEqual(width)
      const actionImage = path.join(OUTPUT, `fade-${width}-action.png`); await page.screenshot({ path: actionImage }); report.screenshots.push(actionImage)
      if (width === 1440 || width === 390) {
        await page.locator('#tab-trigger').click(); await expect(page.locator('#panel-trigger')).toBeVisible()
        await settleRenderedPage(page)
        await page.locator('.station-drawer-scroll').evaluate(element => { element.scrollTop = 0 })
        const transparency = await page.locator('.station-workspace').evaluate(workspace => {
          const css = getComputedStyle(workspace)
          const opacity = element => { let value = 1; for (let node = element; node; node = node.parentElement) value *= Number(getComputedStyle(node).opacity); return value }
          const controls = [...workspace.querySelectorAll('.station-workspace-title h2,#panel-trigger .workbench-heading h3,#panel-trigger .field-label,#panel-trigger input:not(:disabled),#panel-trigger .btn-primary')].filter(element => element.getClientRects().length)
          return { background: css.backgroundColor, workspaceOpacity: opacity(workspace), controls: controls.map(element => ({ tag: element.tagName, className: element.className, effectiveOpacity: opacity(element) })) }
        })
        check.transparency = transparency
        const color = transparency.background.match(/[\d.]+/g).map(Number)
        expect(color.slice(0, 3)).toEqual([21, 21, 21]); expect(color[3]).toBeCloseTo(.94, 5)
        expect(transparency.workspaceOpacity).toBe(1); expect(transparency.controls.length).toBeGreaterThan(3)
        for (const control of transparency.controls) expect(control.effectiveOpacity).toBe(1)
        const triggerImage = path.join(OUTPUT, `trigger-${width}-window.png`); await page.screenshot({ path: triggerImage }); report.screenshots.push(triggerImage)
      }
      check.pass = true; console.log(`PASS ${width}: ${check.name}`)
    } catch (error) { check.error = error.stack || error.message; console.log(`FAIL ${width}: ${error.message}`) }
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
