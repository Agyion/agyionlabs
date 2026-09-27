/** Read-only camera measurements with real mouse and CDP touch input. No scene/clock overrides. */
import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const base = process.env.BASE_URL || 'http://127.0.0.1:4292';
const output = process.env.QA_OUTPUT_DIR || 'artifacts/verification/2026-09-27-orbit-sensitivity-increase';
await mkdir(output, { recursive: true });
// Reuse the read-only WebGL observation from the pointer QA harness.
const source = await readFile('scripts/verify-pointer-response.mjs', 'utf8');
const start = source.indexOf('window.__pointerProbe =');
const end = source.indexOf('\n      });', start);
if (start < 0 || end < 0) throw new Error('Pointer observation source unavailable');
const probe = source.slice(start, end);
const coefficients = { landing: { previousYaw: .25, newYaw: .375 }, app: { previousYaw: .0625, newYaw: .09375 }, pitch: { previous: .25, current: .375 }, increaseFactor: 1.5 };
const report = { base, status: 'running', coefficients, measurement: 'Camera orbit yaw from the fixed stars view matrix inverse, around the settled landing (z=0) and app (z=60) pivots; app pitch from its viewing basis. Real mouse drags and trusted mobile touch input, including native page scrolling. SwiftShader is not native GPU performance evidence.', routes: [], pageErrors: [], consoleErrors: [], requestFailures: [] };
const browser = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
// Invert the rigid view transform to obtain the rendered camera position.
// Mobile landing aims right of the orbit center, so view-direction yaw alone
// does not equal the orbit angle. The settled world pivots are z=0 and z=60.
const eye = matrix => [0, 4, 8].map(index => -(matrix[index] * matrix[12] + matrix[index + 1] * matrix[13] + matrix[index + 2] * matrix[14]));
const orbitYaw = (matrix, route) => { const position = eye(matrix); return Math.atan2(position[0], position[2] - (route === 'app' ? 60 : 0)); };
const pitch = matrix => Math.asin(Math.max(-1, Math.min(1, matrix[6])));
const delta = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
const matrix = page => page.evaluate(() => window.__pointerProbe.matrix);
const difference = (before, after) => Math.max(...[0, 1, 2, 4, 5, 6, 8, 9, 10].map(index => Math.abs(before[index] - after[index])));
async function dragPath(page, selector, mobile, vertical = false, verticalDistance = 200) {
  const path = await page.evaluate(({ selector, mobile, vertical, verticalDistance }) => {
    const canvas = document.querySelector(selector);
    const distance = mobile ? 160 : 120;
    const candidates = vertical
      ? [.94, .86, .72, .12].map(x => ({ x: innerWidth * x, y: innerHeight * .76, dx: 0, dy: -verticalDistance }))
      : [.55, .64, .43, .33, .74, .24].flatMap(y => (mobile ? [.18, .35] : [.76, .57]).map(x => ({ x: innerWidth * x, y: innerHeight * y, dx: distance, dy: 0 })));
    for (const candidate of candidates) {
      const points = Array.from({ length: 13 }, (_, index) => ({ x: candidate.x + candidate.dx * index / 12, y: candidate.y + candidate.dy * index / 12 }));
      if (points.every(point => document.elementFromPoint(point.x, point.y) === canvas)) return points;
    }
    return null;
  }, { selector, mobile, vertical, verticalDistance });
  expect(path, 'The complete drag path must hit the actual scene canvas, not text or controls').not.toBeNull();
  return path;
}
async function touchDrag(client, page, path) {
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...path[0], id: 1, radiusX: 3, radiusY: 3, force: 1 }] });
  for (const point of path.slice(1)) {
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...point, id: 1, radiusX: 3, radiusY: 3, force: 1 }] });
    // Human-speed input lets the browser negotiate native scrolling. This does
    // not set application time or use a synthetic DOM pointer event.
    await page.waitForTimeout(25);
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
try {
  for (const sample of [
    { name: 'desktop-reduced', mobile: false, reduced: true, viewport: { width: 1440, height: 1000 } },
    { name: 'mobile-reduced', mobile: true, reduced: true, viewport: { width: 390, height: 844 } },
    { name: 'mobile-normal', mobile: true, reduced: false, viewport: { width: 390, height: 844 } },
  ]) {
    const measurements = [];
    for (const route of ['landing', 'app']) {
      const label = `${sample.name}-${route}`;
      const context = await browser.newContext({ viewport: sample.viewport, deviceScaleFactor: 1, isMobile: sample.mobile, hasTouch: sample.mobile, reducedMotion: sample.reduced ? 'reduce' : 'no-preference' });
      const page = await context.newPage();
      page.on('pageerror', error => report.pageErrors.push({ label, message: error.message }));
      page.on('console', error => { if (error.type() === 'error') report.consoleErrors.push({ label, message: error.text(), location: error.location() }); });
      page.on('requestfailed', request => report.requestFailures.push({ label, url: request.url(), error: request.failure()?.errorText }));
      await page.addInitScript({ content: probe });
      await page.addInitScript(() => {
        window.__touchEvidence = [];
        for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) document.addEventListener(type, event => {
          if (event.target instanceof HTMLCanvasElement && event.pointerType === 'touch') window.__touchEvidence.push({ type, trusted: event.isTrusted, x: event.clientX, y: event.clientY });
        }, { passive: true, capture: true });
      });
      try {
        await page.goto(`${base}/${route === 'app' ? 'app/' : ''}`, { waitUntil: 'domcontentloaded' });
        await expect(page.locator(route === 'app' ? '.orbital-backdrop' : '.orbital-scene')).toHaveClass(/is-ready/, { timeout: 60000 });
        await expect.poll(() => page.evaluate(() => window.__pointerProbe.matrix?.length), { timeout: 30000 }).toBe(16);
        const selector = route === 'app' ? '.orbital-canvas canvas' : '.orbital-scene__canvas canvas';
        const canvas = page.locator(selector);
        const bounds = await canvas.boundingBox();
        const before = await matrix(page);
        const path = await dragPath(page, selector, sample.mobile);
        const dragPixels = path.at(-1).x - path[0].x;
        const expected = dragPixels * Math.PI * 2 / bounds.width * coefficients[route].newYaw;
        const scrollBefore = await page.evaluate(() => scrollY);
        const client = sample.mobile ? await context.newCDPSession(page) : null;
        if (client) await touchDrag(client, page, path);
        else {
          await page.mouse.move(path[0].x, path[0].y); await page.mouse.down();
          await page.mouse.move(path.at(-1).x, path.at(-1).y, { steps: 12 }); await page.mouse.up();
          await page.mouse.move(20, 20);
        }
        await expect.poll(async () => delta(orbitYaw(before, route), orbitYaw(await matrix(page), route)), { timeout: 15000 }).toBeCloseTo(expected, 4);
        const actual = delta(orbitYaw(before, route), orbitYaw(await matrix(page), route));
        expect(await page.evaluate(() => scrollY), 'Horizontal scene dragging must not scroll the page').toBe(scrollBefore);
        const touchEvidence = await page.evaluate(() => window.__touchEvidence);
        if (sample.mobile) {
          expect(touchEvidence.filter(event => event.type === 'pointerdown' && event.trusted).length).toBe(1);
          expect(touchEvidence.filter(event => event.type === 'pointermove' && event.trusted).length).toBeGreaterThan(0);
          expect(touchEvidence.some(event => event.type === 'pointercancel')).toBe(false);
        }
        await page.screenshot({ path: `${output}/${label}-drag.png` });
        await canvas.focus(); await page.keyboard.press('Home');
        await expect.poll(async () => delta(orbitYaw(before, route), orbitYaw(await matrix(page), route)), { timeout: 15000 }).toBeCloseTo(0, 4);
        await page.keyboard.press('ArrowRight');
        await expect.poll(async () => delta(orbitYaw(before, route), orbitYaw(await matrix(page), route)), { timeout: 15000 }).toBeCloseTo(.07, 4);
        await page.keyboard.press('Home');
        await expect.poll(async () => delta(orbitYaw(before, route), orbitYaw(await matrix(page), route)), { timeout: 15000 }).toBeCloseTo(0, 4);
        const result = { label, route, viewport: sample.viewport, reducedMotion: sample.reduced, bounds, dragPixels, previousCoefficient: coefficients[route].previousYaw, newCoefficient: coefficients[route].newYaw, expectedRadians: expected, actualRadians: actual, cameraBefore: eye(before), cameraAfterReset: eye(await matrix(page)), keyboardRadians: .07, resetPassed: true, touchEvidence };
        if (sample.mobile && sample.reduced && route === 'app') {
          expect(await canvas.evaluate(element => getComputedStyle(element).touchAction)).toBe('none');
          const pitchBefore = await matrix(page);
          const previousEvents = await page.evaluate(() => window.__touchEvidence.length);
          const verticalPath = await dragPath(page, selector, true, true, 96);
          const pixels = verticalPath.at(-1).y - verticalPath[0].y;
          const expectedPitch = pixels * Math.PI / Math.max(300, bounds.height) * coefficients.pitch.current;
          await touchDrag(client, page, verticalPath);
          await expect.poll(async () => pitch(await matrix(page)) - pitch(pitchBefore), { timeout: 15000 }).toBeCloseTo(expectedPitch, 4);
          const pitchAfter = await matrix(page);
          expect(delta(orbitYaw(pitchBefore, route), orbitYaw(pitchAfter, route))).toBeCloseTo(0, 4);
          expect(await page.evaluate(() => scrollY)).toBe(scrollBefore);
          const verticalTouch = await page.evaluate(start => window.__touchEvidence.slice(start), previousEvents);
          expect(verticalTouch.some(event => event.type === 'pointermove' && event.trusted)).toBe(true);
          expect(verticalTouch.some(event => event.type === 'pointercancel')).toBe(false);
          result.verticalDrag = { pixels, previousCoefficient: coefficients.pitch.previous, newCoefficient: coefficients.pitch.current, expectedRadians: expectedPitch, actualRadians: pitch(pitchAfter) - pitch(pitchBefore), yawChange: delta(orbitYaw(pitchBefore, route), orbitYaw(pitchAfter, route)), touchEvidence: verticalTouch };
          await page.screenshot({ path: `${output}/${label}-vertical-drag.png` });
        }
        if (sample.mobile && route === 'landing') {
          expect(await canvas.evaluate(element => getComputedStyle(element).touchAction)).toBe('pan-y');
          expect(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBeGreaterThan(20);
          const scrollMatrix = await matrix(page);
          const verticalPath = await dragPath(page, selector, true, true);
          await touchDrag(client, page, verticalPath);
          await expect.poll(() => page.evaluate(() => scrollY), { timeout: 10000 }).toBeGreaterThan(20);
          const scrollAfter = await page.evaluate(() => scrollY);
          expect(difference(scrollMatrix, await matrix(page)), 'A native vertical swipe must not rotate the world').toBeLessThan(.0003);
          result.nativeScroll = { touchAction: 'pan-y', before: scrollBefore, after: scrollAfter, cameraBasisChange: difference(scrollMatrix, await matrix(page)), trustedCancel: await page.evaluate(() => window.__touchEvidence.some(event => event.type === 'pointercancel' && event.trusted)) };
          expect(result.nativeScroll.trustedCancel, 'The browser should take ownership of the vertical page gesture').toBe(true);
          await page.screenshot({ path: `${output}/${label}-native-scroll.png` });
        }
        measurements.push(actual); report.routes.push(result);
      } finally { await context.close(); }
    }
    expect(measurements[1] / measurements[0], `${sample.name}: existing app-to-landing ratio remains one quarter`).toBeCloseTo(.25, 4);
  }
  report.status = report.pageErrors.length || report.consoleErrors.length || report.requestFailures.length ? 'failed' : 'passed';
} catch (error) { report.status = 'failed'; report.failure = { message: error.message, stack: error.stack }; }
finally { await browser.close(); await writeFile(`${output}/results.json`, JSON.stringify(report, null, 2)); }
console.log(JSON.stringify(report)); if (report.status !== 'passed') process.exitCode = 1;
