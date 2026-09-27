import { waitForFonts } from './lib/browser-settle.mjs';
/** Isolated QA: read the fixed stars' view basis so world animation cannot fake pointer motion. */
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const base = process.env.BASE_URL || 'http://127.0.0.1:4192';
const output = process.env.QA_OUTPUT_DIR || 'artifacts/verification/pointer-response';
const viewport = { width: 1440, height: 1000 };
const dockOnly = process.env.QA_DOCK_ONLY === '1';
const reducedOnly = process.env.QA_REDUCED_ONLY === '1';
const report = { base, viewport, dockOnly, reducedOnly, startedAt: new Date().toISOString(), status: 'running',
  measurement: 'Camera rotation from the fixed, identity-transform star mesh modelViewMatrix. Ring rotation and animated gas do not enter this basis. No clock or animation overrides.',
  renderingLimit: 'Headless Chromium uses SwiftShader; this is interaction correctness, not native GPU smoothness or performance evidence.',
  checks: [], pages: [], screenshots: [], previewMeasurements: [], failure: null };
await mkdir(output, { recursive: true });
const persist = () => writeFile(`${output}/results.json`, JSON.stringify(report, null, 2));
const browser = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', headless: true,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });

async function check(name, action) {
  const result = { name, status: 'running' }; report.checks.push(result);
  try { result.evidence = await action(); result.status = 'passed'; }
  catch (error) { result.status = 'failed'; result.error = { message: error.message, stack: error.stack }; }
  await persist(); console.log(`${result.status.toUpperCase()} ${name}`);
}
async function capture(page, name, clip) {
  const path = `${output}/${name}.png`;
  const image = await page.screenshot({ path, ...(clip ? { clip } : {}), timeout: 60000 });
  report.screenshots.push({ name, path }); return image;
}
const matrix = page => page.evaluate(() => window.__pointerProbe.matrix);
function difference(first, second) {
  if (!first || !second) throw new Error('No star view-matrix capture; do not substitute animated screenshots for camera evidence.');
  return Math.max(...[0, 1, 2, 4, 5, 6, 8, 9, 10].map(index => Math.abs(first[index] - second[index])));
}
async function unchangedApp(page, originalUrl) {
  expect(page.url()).toBe(originalUrl);
  await expect(page.locator('.station-workspace')).toBeHidden();
  await expect(page.locator('#tab-fade')).toHaveAttribute('aria-selected', 'true');
}
async function neutralPointer(page, route) {
  const selector = route === 'app' ? '.station-topbar' : '.orbital-nav';
  const bounds = await page.locator(selector).boundingBox();
  if (!bounds) throw new Error(`No rendered ${selector} for a neutral pointer location`);
  const point = { x: bounds.x + Math.min(12, bounds.width / 2), y: bounds.y + bounds.height / 2 };
  const covered = await page.evaluate(({ selector, point }) => {
    const header = document.querySelector(selector);
    const hit = document.elementFromPoint(point.x, point.y);
    return !!header && !!hit && header.contains(hit);
  }, { selector, point });
  expect(covered, 'Neutral pointer must hit the rendered header, never the scene underneath').toBe(true);
  await page.mouse.move(point.x, point.y);
  return { selector, bounds, point };
}
function scenePixels(beforePath, afterPath, hoverPath) {
  return JSON.parse(execFileSync('python3', ['-c', `
import json,sys
from PIL import Image,ImageChops
a=Image.open(sys.argv[1]).convert('RGB'); b=Image.open(sys.argv[2]).convert('RGB')
diff=ImageChops.difference(a,b); pixels=list(diff.getdata())
result={'changedPixels':sum(max(pixel)>0 for pixel in pixels),'over10Channel':sum(max(pixel)>10 for pixel in pixels),'bounds':diff.getbbox(),'maxChannelDelta':max(max(pixel) for pixel in pixels)}
if len(sys.argv)>3:
 hover=Image.open(sys.argv[3]).convert('RGB'); mask=list(ImageChops.difference(a,hover).getdata())
 residuals=[pixels[index] for index,pixel in enumerate(mask) if max(pixel)>10]
 result.update({'previewMaskPixels':len(residuals),'unclearedPreviewPixels':sum(max(pixel)>0 for pixel in residuals),'maxPreviewResidual':max((max(pixel) for pixel in residuals),default=0)})
print(json.dumps(result))
`, beforePath, afterPath, ...(hoverPath ? [hoverPath] : [])], { encoding: 'utf8' }));
}

try {
  for (const reduced of (reducedOnly ? [true] : [false, true])) {
    for (const route of (dockOnly ? ['app'] : ['landing', 'app'])) {
      const label = `${route}-${reduced ? 'reduced' : 'normal'}`;
      const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: reduced ? 'reduce' : 'no-preference' });
      const page = await context.newPage();
      const diagnostics = { label, phase: 'setup', consoleErrors: [], pageErrors: [], requestFailures: [], httpErrors: [] };
      report.pages.push(diagnostics);
      page.on('console', message => { if (message.type() === 'error') diagnostics.consoleErrors.push({ phase: diagnostics.phase, message: message.text(), location: message.location() }); });
      page.on('pageerror', error => diagnostics.pageErrors.push({ phase: diagnostics.phase, message: error.message, stack: error.stack }));
      page.on('requestfailed', request => diagnostics.requestFailures.push({ phase: diagnostics.phase, url: request.url(), method: request.method(), error: request.failure()?.errorText }));
      page.on('response', response => { if (response.status() >= 400) diagnostics.httpErrors.push({ phase: diagnostics.phase, url: response.url(), status: response.status() }); });
      await page.addInitScript(() => {
        window.__pointerProbe = { matrix: null, matrixUpdates: 0, starProgramCount: 0 };
        const contexts = new WeakMap();
        const data = gl => {
          if (!contexts.has(gl)) contexts.set(gl, { sources: new WeakMap(), shaders: new WeakMap(), stars: new WeakSet(), uniforms: new WeakMap() });
          return contexts.get(gl);
        };
        // Shader/type and uniform names identify the existing fixed star object;
        // no rendering calls, uniforms, clocks or application state are altered.
        for (const proto of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
          const shaderSource = proto.shaderSource;
          proto.shaderSource = function(shader, source) { data(this).sources.set(shader, source); return shaderSource.call(this, shader, source); };
          const attachShader = proto.attachShader;
          proto.attachShader = function(program, shader) { const state = data(this); const list = state.shaders.get(program) || []; list.push(shader); state.shaders.set(program, list); return attachShader.call(this, program, shader); };
          const linkProgram = proto.linkProgram;
          proto.linkProgram = function(program) {
            const state = data(this);
            const source = (state.shaders.get(program) || []).map(shader => state.sources.get(shader) || '').join('\n');
            if (/PointsMaterial|AGYION_STAR_FIELD/.test(source)) { state.stars.add(program); window.__pointerProbe.starProgramCount++; }
            return linkProgram.call(this, program);
          };
          const getUniformLocation = proto.getUniformLocation;
          proto.getUniformLocation = function(program, name) { const location = getUniformLocation.call(this, program, name); if (location) data(this).uniforms.set(location, { name, star: data(this).stars.has(program) }); return location; };
          const uniformMatrix4fv = proto.uniformMatrix4fv;
          proto.uniformMatrix4fv = function(location, transpose, value, ...rest) {
            const uniform = location && data(this).uniforms.get(location);
            if (uniform?.star && uniform.name === 'modelViewMatrix') {
              const offset = rest[0] || 0;
              window.__pointerProbe.matrix = Array.from(value).slice(offset, offset + 16);
              window.__pointerProbe.matrixUpdates++;
            }
            return uniformMatrix4fv.call(this, location, transpose, value, ...rest);
          };
        }
      });
      try {
        await page.goto(`${base}${route === 'app' ? '/app/' : '/'}`, { waitUntil: 'domcontentloaded' });
        await expect(page.locator(route === 'app' ? '.orbital-backdrop' : '.orbital-scene')).toHaveClass(/is-ready/, { timeout: 30000 });
        await waitForFonts(page);
        await expect.poll(() => page.evaluate(() => window.__pointerProbe.matrix?.length ?? 0)).toBe(16);
        const originalUrl = page.url();
        // Outside both scene surfaces: no initial hover aim, no dock preview.
        diagnostics.neutralPointer = await neutralPointer(page, route);
        await page.waitForTimeout(1800);
        if (!dockOnly) {
        diagnostics.phase = 'passive mouse aim';
        await check(`${label}: passive mouse ${reduced ? 'does not move' : 'moves'} the camera without selecting`, async () => {
          const before = await matrix(page);
          await capture(page, `${label}-before`);
          await page.waitForTimeout(500);
          const stationary = await matrix(page);
          expect(difference(before, stationary), 'World animation alone must not change the camera basis').toBeLessThan(.0001);
          await page.mouse.move(1235, 330, { steps: 12 });
          if (reduced) {
            await page.waitForTimeout(900);
            expect(difference(before, await matrix(page)), 'Reduced motion disables incidental aim').toBeLessThan(.0001);
          } else await expect.poll(async () => difference(before, await matrix(page)), { timeout: 8000 }).toBeGreaterThan(.008);
          await page.waitForTimeout(reduced ? 0 : 1600);
          const after = await matrix(page);
          await capture(page, `${label}-after-passive-move`);
          expect(page.url()).toBe(originalUrl);
          if (route === 'app') await unchangedApp(page, originalUrl);
          return { before, stationary, after, stationaryBasisChange: difference(before, stationary), passiveBasisChange: difference(before, after) };
        });
        diagnostics.phase = 'pointer leave';
        await check(`${label}: leaving the world restores the neutral camera basis`, async () => {
          await neutralPointer(page, route);
          const baseline = report.checks.find(item => item.name === `${label}: passive mouse ${reduced ? 'does not move' : 'moves'} the camera without selecting`)?.evidence?.before;
          if (!baseline) throw new Error('Passive baseline did not succeed; leave cannot be proven.');
          await expect.poll(async () => difference(baseline, await matrix(page)), { timeout: 8000 }).toBeLessThan(.0004);
          const returned = await matrix(page);
          await capture(page, `${label}-after-leave`);
          return { baseline, returned, basisChange: difference(baseline, returned) };
        });
        diagnostics.phase = 'drag and reset';
        await check(`${label}: drag still orbits and Home restores its baseline`, async () => {
          const before = await matrix(page);
          // Move into the canvas and immediately press: direct input is exercised,
          // not the mouse aim that the no-button test measured above.
          await page.mouse.move(1120, 540);
          await page.mouse.down();
          await page.mouse.move(1260, 590, { steps: 16 });
          await page.mouse.up();
          await neutralPointer(page, route);
          await expect.poll(async () => difference(before, await matrix(page)), { timeout: 8000 }).toBeGreaterThan(.025);
          const dragged = await matrix(page);
          await capture(page, `${label}-after-drag`);
          if (route === 'app') await unchangedApp(page, originalUrl);
          await page.locator(route === 'app' ? '.orbital-canvas canvas' : '.orbital-scene__canvas canvas').focus();
          await page.keyboard.press('Home');
          await expect.poll(async () => difference(before, await matrix(page)), { timeout: 8000 }).toBeLessThan(.0004);
          return { before, dragged, reset: await matrix(page), dragBasisChange: difference(before, dragged) };
        });
        }
        if (route === 'app') {
          diagnostics.phase = 'dock hover and focus';
          await check(`${label}: dock hover and focus preview without selecting or opening`, async () => {
            const pot = page.getByLabel('Pot (USDC)', { exact: false });
            let draft = null;
            if (dockOnly) {
              await page.getByRole('button', { name: 'Open Fade', exact: true }).click();
              await expect(page.locator('#panel-fade')).toBeVisible();
              await pot.fill('918.27');
              await page.getByRole('button', { name: 'Close instrument', exact: true }).click();
              await expect(page.locator('.station-workspace')).toBeHidden();
              draft = await pot.inputValue();
              expect(draft).toBe('918.27');
            }
            await neutralPointer(page, route);
            await page.locator('canvas').evaluate(element => element.blur());
            await page.waitForTimeout(dockOnly && !reduced ? 2500 : 500);
            const before = await matrix(page);
            const crop = { x: 400, y: 180, width: 900, height: 620 };
            const beforeImage = await capture(page, `${label}-dock-before`, reduced ? crop : undefined);
            await page.locator('#tab-pod').hover();
            await unchangedApp(page, originalUrl);
            if (draft !== null) await expect(pot).toHaveValue(draft);
            await page.waitForTimeout(500);
            expect(difference(before, await matrix(page)), 'Preview changes illumination, not the selected camera').toBeLessThan(.0004);
            const hoverImage = await capture(page, `${label}-dock-hover`, reduced ? crop : undefined);
            if (reduced) expect(beforeImage.equals(hoverImage), 'With world motion stopped and UI outside the crop, bay illumination must visibly change').toBe(false);
            const pixelChange = reduced ? scenePixels(`${output}/${label}-dock-before.png`, `${output}/${label}-dock-hover.png`) : null;
            if (dockOnly && pixelChange) expect(pixelChange.over10Channel, 'The physical bay rims must cover substantially more than the previous 19 lamp pixels').toBeGreaterThan(200);
            await neutralPointer(page, route);
            await page.locator('#tab-pod').focus();
            await expect(page.locator('#tab-pod')).toBeFocused();
            await unchangedApp(page, originalUrl);
            if (draft !== null) await expect(pot).toHaveValue(draft);
            await page.waitForTimeout(400);
            expect(difference(before, await matrix(page))).toBeLessThan(.0004);
            await capture(page, `${label}-dock-focus`, reduced ? crop : undefined);
            await page.locator('#tab-pod').evaluate(element => element.blur());
            await neutralPointer(page, route);
            await page.waitForTimeout(reduced ? 100 : 900);
            await unchangedApp(page, originalUrl);
            if (draft !== null) await expect(pot).toHaveValue(draft);
            await capture(page, `${label}-dock-after-leave`, reduced ? crop : undefined);
            const clearing = reduced ? scenePixels(`${output}/${label}-dock-before.png`, `${output}/${label}-dock-after-leave.png`, `${output}/${label}-dock-hover.png`) : null;
            const evidence = { label, before, after: await matrix(page), noSelection: true, noNavigation: true, reducedSceneOnlyPixelProof: reduced, pixelChange, clearing, preservedDraft: draft };
            report.previewMeasurements.push(evidence);
            if (clearing) {
              // The prior strict PNG comparison detected 1 to 2/255 background
              // presentation differences outside the bays. Keep that bound
              // explicit, while requiring every changed preview pixel to clear.
              expect(clearing.previewMaskPixels).toBeGreaterThan(200);
              expect(clearing.unclearedPreviewPixels, 'Every visible preview pixel must return exactly to its baseline after leave and blur').toBe(0);
              expect(clearing.maxChannelDelta, 'Unrelated scene changes above the observed 2/255 presentation bound must still fail').toBeLessThanOrEqual(2);
            }
            return evidence;
          });
        }
      } catch (error) {
        report.checks.push({ name: `${label} setup`, status: 'failed', error: { message: error.message, stack: error.stack } });
      } finally {
        diagnostics.phase = 'teardown'; await context.close(); await persist();
      }
    }
  }
  const failed = report.checks.filter(item => item.status !== 'passed');
  const pageErrors = report.pages.flatMap(page => page.pageErrors);
  const diagnostics = report.pages.flatMap(page => [...page.consoleErrors, ...page.requestFailures, ...page.httpErrors]);
  report.status = failed.length || pageErrors.length ? 'failed' : diagnostics.length ? 'interaction_passed_with_runtime_diagnostics' : 'passed';
  report.failure = failed.length || pageErrors.length ? { failedChecks: failed.map(item => item.name), pageErrors } : null;
  await persist();
  expect(failed, 'Pointer checks failed; preserved report contains exact evidence').toEqual([]);
  expect(pageErrors).toEqual([]);
  console.log(JSON.stringify({ output, status: report.status, checks: report.checks.length, screenshots: report.screenshots.length, diagnostics: diagnostics.length }));
} catch (error) {
  report.status = 'failed'; report.failure = { ...report.failure, message: error.message, stack: error.stack }; throw error;
} finally { try { await persist(); } finally { await browser.close(); } }
if (report.status !== 'passed') process.exitCode = 1;
