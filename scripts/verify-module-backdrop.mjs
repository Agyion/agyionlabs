/** Observe real rendered camera matrices during module selection. Read only. */
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { chromium, expect } from '@playwright/test'
import { Matrix4, PerspectiveCamera, Vector3 } from 'three'

const BASE = (process.env.BASE_URL || 'http://127.0.0.1:4292').replace(/\/$/, '')
const OUTPUT = path.resolve(process.env.QA_OUTPUT_DIR || 'artifacts/verification/2026-09-27-module-backdrop')
const WIDTHS = (process.env.QA_WIDTHS || '1440,390').split(',').map(Number)
const ORDER = ['fade', 'envoy', 'pod', 'ramp', 'trigger', 'ledger', 'fade']
const files = ['scripts/verify-module-backdrop.mjs', 'shared/module-camera.ts', 'shared/space-scene.ts', 'shared/star-field.ts', 'app/app/components/app/OrbitalBackdrop.tsx']
const hashes = () => files.map(file => ({ file, sha256: createHash('sha256').update(fs.readFileSync(file)).digest('hex') }))
const source = fs.readFileSync('scripts/verify-pointer-response.mjs', 'utf8')
const start = source.indexOf('window.__pointerProbe ='), end = source.indexOf('\n      });', start)
if (start < 0 || end < 0) throw new Error('Existing view-matrix observer is unavailable')
const probe = source.slice(start, end)
fs.mkdirSync(OUTPUT, { recursive: true })
const report = { base: BASE, status: 'running', uiStatus: 'running', diagnosticStatus: 'running', startedAt: new Date().toISOString(), sourcesAtStart: hashes(), checks: [], pages: [], screenshots: [], limits: 'Uses real WebGL camera uniforms, actual UI clicks and normal motion. No clock, shader uniform, application state or animation speed overrides. Intermediate frames are checked after the initial overview-to-focus approach. Actual elapsed spin phases are recorded by wall time only; exhaustive ring-phase coverage belongs to unit tests. No wallet or transaction action.' }
const persist = () => fs.writeFileSync(path.join(OUTPUT, 'results.json'), JSON.stringify(report, null, 2))
const browser = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] })
function project(sample, aspect) {
  const view = new Matrix4().fromArray(sample.matrix), inverse = view.clone().invert()
  const camera = new PerspectiveCamera(44, aspect, .1, 4000)
  const cameraHole = new Vector3(-240, -10, -600).applyMatrix4(view)
  const ndc = cameraHole.clone().applyMatrix4(camera.projectionMatrix)
  return { at: sample.at, ndc: ndc.toArray(), cameraZ: cameraHole.z, eye: new Vector3().setFromMatrixPosition(inverse).toArray() }
}
try {
  for (const width of WIDTHS) {
    const context = await browser.newContext({ viewport: { width, height: width < 600 ? 900 : 1000 }, deviceScaleFactor: 1, reducedMotion: 'no-preference' })
    const page = await context.newPage(); page.setDefaultTimeout(15000)
    const diagnostics = { width, pageErrors: [], consoleErrors: [], requestFailures: [], httpErrors: [], csp: [] }; report.pages.push(diagnostics)
    page.on('pageerror', error => diagnostics.pageErrors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') diagnostics.consoleErrors.push({ text: message.text(), location: message.location() }) })
    page.on('requestfailed', request => diagnostics.requestFailures.push({ url: request.url(), error: request.failure()?.errorText }))
    page.on('response', response => { if (response.status() >= 400) diagnostics.httpErrors.push({ url: response.url(), status: response.status() }) })
    await page.exposeBinding('__moduleCsp', (_source, event) => diagnostics.csp.push(event))
    const observeFrames = () => {
      const probe = window.__pointerProbe; let matrix = null
      probe.samples = []; probe.record = false
      Object.defineProperty(probe, 'matrix', { get() { return matrix }, set(value) { matrix = value; if (probe.record) probe.samples.push({ at: performance.now(), matrix: value }) } })
      document.addEventListener('securitypolicyviolation', event => { void window.__moduleCsp({ directive: event.violatedDirective, blockedURI: event.blockedURI }).catch(() => {}) })
    }
    // One init script guarantees observer installation follows the probe.
    await page.addInitScript({ content: `${probe}\n;(${observeFrames.toString()})();` })
    try {
      await page.goto(`${BASE}/app/`, { waitUntil: 'domcontentloaded' })
      await expect(page.locator('.orbital-backdrop')).toHaveClass(/is-ready/, { timeout: 60000 })
      await expect.poll(() => page.evaluate(() => window.__pointerProbe.matrix?.length)).toBe(16)
      const canvas = await page.locator('.orbital-canvas canvas').boundingBox(), aspect = canvas.width / canvas.height
      let previousEye = null
      for (const [index, id] of ORDER.entries()) {
        const check = { width, instrument: id, index, pass: false }; report.checks.push(check)
        try {
          await page.evaluate(() => { window.__pointerProbe.record = true; window.__pointerProbe.samples = [] })
          await page.locator(`#tab-${id}`).click(); await expect(page.locator(`#panel-${id}`)).toBeVisible()
          // Actual rendered samples, rather than a guessed screenshot delay.
          await expect.poll(() => page.evaluate(() => window.__pointerProbe.samples.length), { timeout: 25000 }).toBeGreaterThanOrEqual(40)
          const samples = await page.evaluate(() => { window.__pointerProbe.record = false; return window.__pointerProbe.samples })
          const projected = samples.map(sample => project(sample, aspect)), last = projected.at(-1)
          check.frames = projected
          const selected = index === 0 ? projected.slice(-5) : projected
          const violations = selected.filter(sample => sample.cameraZ >= 0 || Math.abs(sample.ndc[0]) > 1 || Math.abs(sample.ndc[1]) > 1 || sample.ndc[2] < -1 || sample.ndc[2] > 1)
          check.projectionViolations = violations
          expect(violations, 'The black-hole center must stay in front and inside the frame while focus travels').toEqual([])
          if (previousEye) {
            check.eyeTravel = new Vector3(...last.eye).distanceTo(new Vector3(...previousEye))
            expect(check.eyeTravel, 'Selecting a different module must actually translate the camera').toBeGreaterThan(.1)
          }
          previousEye = last.eye
          const screenshot = path.join(OUTPUT, `${width}-${index}-${id}.png`); await page.screenshot({ path: screenshot, timeout: 45000 }); report.screenshots.push(screenshot)
          check.pass = true; console.log(`PASS ${width}: ${id}, ${projected.length} actual frame matrices`)
        } catch (error) { check.error = error.stack || error.message; console.log(`FAIL ${width}: ${id}: ${error.message}`) }
        finally { persist() }
      }
    } finally { await context.close() }
  }
  report.sourcesAtEnd = hashes(); expect(report.sourcesAtEnd).toEqual(report.sourcesAtStart)
} catch (error) { report.failure = error.stack || error.message }
finally {
  await browser.close()
  report.diagnosticCounts = Object.fromEntries(['pageErrors', 'consoleErrors', 'requestFailures', 'httpErrors', 'csp'].map(key => [key, report.pages.reduce((sum, page) => sum + page[key].length, 0)]))
  report.uiStatus = !report.failure && report.checks.length === WIDTHS.length * ORDER.length && report.checks.every(check => check.pass) ? 'passed' : 'failed'
  report.diagnosticStatus = Object.values(report.diagnosticCounts).some(count => count > 0) ? 'failed' : 'passed'
  report.status = report.uiStatus === 'passed' && report.diagnosticStatus === 'passed' ? 'passed' : 'failed'
  report.finishedAt = new Date().toISOString(); persist()
}
console.log(JSON.stringify({ status: report.status, uiStatus: report.uiStatus, diagnosticStatus: report.diagnosticStatus, checks: report.checks.length, diagnosticCounts: report.diagnosticCounts, output: OUTPUT, failure: report.failure }, null, 2))
if (report.status !== 'passed') process.exitCode = 1
