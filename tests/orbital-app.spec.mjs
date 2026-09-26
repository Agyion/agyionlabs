import { test, expect } from '@playwright/test';

async function readyScene(page) {
  await expect(page.locator('.orbital-backdrop')).toHaveClass(/is-ready/);
  await expect(page.locator('.orbital-canvas canvas')).toBeVisible();
}

// Crop only the exposed scene: headings, dock, drawer and dev chrome cannot
// manufacture a passing camera assertion by changing their text or position.
async function sceneRaster(page) {
  const bounds = await page.locator('.orbital-canvas canvas').boundingBox();
  if (!bounds) throw new Error('The interactive scene is not visible');
  return page.screenshot({ clip: {
    x: Math.ceil(bounds.x + 8), y: Math.ceil(bounds.y + bounds.height * .3),
    width: Math.floor(Math.min(620, bounds.width * .43)), height: Math.floor(bounds.height * .43),
  }, style: '.station-workspace { visibility: hidden !important; }' });
}

async function staticScene(page, path = '/app/') {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(path);
  await readyScene(page);
  await page.mouse.move(2, 2);
}

async function expectSceneChanged(page, before, message) {
  await expect.poll(async () => before.equals(await sceneRaster(page)), { message, timeout: 10000 }).toBe(false);
}

test('six instruments navigate, direct links and browser history retain the selected console', async ({ page }) => {
  const errors=[]; page.on('pageerror', e=>errors.push(e.message));
  await page.goto('/app/');
  await expect(page.locator('.station-workspace')).toBeHidden();
  await expect(page.getByRole('button', { name: /^(Pause motion|Resume motion|Motion reduced)$/ })).toHaveCount(0);
  await expect(page.getByRole('tab')).toHaveCount(6);
  await expect(page.locator('#tab-fade')).toHaveAttribute('aria-selected','true');
  for (const id of ['pod','trigger','envoy','ledger']) {
    await page.locator(`#tab-${id}`).click();
    await expect(page).toHaveURL(new RegExp(`tab=${id}`));
    await expect(page.locator(`#panel-${id}`)).toBeVisible();
    await expect(page.locator('.station-workspace')).not.toContainText('Application error');
  }
  await page.goBack();
  await expect(page.locator('#tab-envoy')).toHaveAttribute('aria-selected','true');
  await page.goto('/app/?tab=pod');
  await expect(page.locator('#panel-pod')).toBeVisible();
  await expect(page.getByRole('slider',{name:'Mission timeline'})).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('instrument dock is keyboard-operable and focus follows selection', async ({ page }) => {
  await page.goto('/app/');
  await page.locator('#tab-fade').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#tab-pod')).toBeFocused();
  await expect(page.locator('#panel-pod')).toBeVisible();
  await page.keyboard.press('End');
  await expect(page.locator('#tab-ledger')).toBeFocused();
  await page.keyboard.press('Home');
  await expect(page.locator('#tab-fade')).toBeFocused();
});

test('all consoles fit mobile width including ledger', async ({ page }) => {
  await page.setViewportSize({width:360,height:800});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/app/');
  for (const id of ['fade','pod','trigger','envoy','ramp','ledger']) {
    await page.locator(`#tab-${id}`).click();
    await expect(page.locator(`#panel-${id}`)).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${id} horizontal overflow`).toBe(true);
    const drawer = await page.locator('.station-workspace').boundingBox();
    expect(drawer.x, `${id} drawer left edge`).toBeGreaterThanOrEqual(-1);
    expect(drawer.x + drawer.width, `${id} drawer right edge`).toBeLessThanOrEqual(361);
  }
});

test('reduced motion stops ambient movement without adding a motion button or covering the scene', async ({ page }) => {
  const errors=[]; page.on('pageerror', e=>errors.push(e.message));
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/app/?tab=ledger');
  await expect(page.getByRole('button',{name:/^(Pause motion|Resume motion|Motion reduced)$/})).toHaveCount(0);
  await expect(page.locator('#panel-ledger')).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.locator('.orbital-backdrop')).toHaveClass(/is-ready/);
  const withFallback=await page.locator('.orbital-backdrop').screenshot();
  await page.locator('.orbital-fallback').evaluate(el=>el.remove());
  const withoutFallback=await page.locator('.orbital-backdrop').screenshot();
  expect(withFallback.equals(withoutFallback),'Hidden SVG must not paint over the rendered scene').toBe(true);
  const before = await sceneRaster(page);
  await page.waitForTimeout(250);
  expect(before.equals(await sceneRaster(page)), 'Reduced motion must stop automatic scene movement').toBe(true);
  expect(errors).toEqual([]);
});

test('WebGL unavailable renders fallback without blocking instruments', async ({ page }) => {
  await page.addInitScript(()=>{
    const getContext=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(type,...args){
      if(type==='webgl'||type==='webgl2'||type==='experimental-webgl')return null;
      return getContext.call(this,type,...args);
    };
  });
  await page.goto('/app/?tab=pod');
  await expect(page.getByRole('status').filter({hasText:/Static view|3D view unavailable/})).toBeVisible();
  await expect(page.locator('#panel-pod')).toBeVisible();
  await page.locator('#tab-ledger').click();
  await expect(page.locator('#panel-ledger')).toBeVisible();
});

test('graphics recovery preserves the completed escape instead of replaying it', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('agyion:arrival', JSON.stringify({ at: Date.now() }));
    const raf = window.requestAnimationFrame.bind(window);
    const now = performance.now.bind(performance);
    window.requestAnimationFrame = callback => raf(time => {
      if (!window.__freezeScene) window.__sceneTime = time;
      callback(window.__freezeScene ? window.__sceneTime : time);
    });
    performance.now = () => window.__freezeScene ? window.__sceneTime : now();
  });
  await page.goto('/app/');
  await readyScene(page);
  await expect(page.locator('.station-app')).toHaveClass(/station-arriving/);
  await expect(page.locator('.station-app')).not.toHaveClass(/station-arriving/, { timeout: 15000 });
  await page.mouse.move(2, 2);
  await page.waitForTimeout(1400);
  // Stop time, not rendering, so a context rebuild cannot hide a position reset
  // behind the ordinary ring rotation or changing gas texture.
  await page.evaluate(() => { window.__freezeScene = true; });
  await page.waitForTimeout(300);
  const before = await sceneRaster(page);
  await page.locator('.orbital-canvas canvas').evaluate(canvas => {
    const recovery = canvas.getContext('webgl2').getExtension('WEBGL_lose_context');
    if (!recovery) throw new Error('Context-loss testing is unavailable');
    window.__restoreGraphics = () => recovery.restoreContext();
    recovery.loseContext();
  });
  await expect(page.locator('.orbital-backdrop')).not.toHaveClass(/is-ready/);
  await page.evaluate(() => window.__restoreGraphics());
  await readyScene(page);
  await page.waitForTimeout(300);
  const after = await sceneRaster(page);
  await testInfo.attach('before-context-loss', { body: before, contentType: 'image/png' });
  await testInfo.attach('after-context-recovery', { body: after, contentType: 'image/png' });
  expect(before.equals(after), 'Restoring graphics must preserve the spacecraft and camera positions').toBe(true);
  await expect(page.locator('.station-app')).not.toHaveClass(/station-arriving/);
});

test('combined site launches the console and serves real missing-asset errors', async ({page, request}) => {
  const violations=[]; await page.addInitScript(()=>{window.__csp=[];document.addEventListener('securitypolicyviolation',e=>window.__csp.push(e.violatedDirective))});
  await page.goto('/');
  await expect(page.getByRole('heading',{level:1})).toHaveText(/^agyion\s*labs$/i);
  await page.getByRole('link',{name:'Launch app',exact:true}).first().click();
  // The complete9.8-second departure precedes the document handoff.
  await expect(page.locator('#tab-fade')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.orbital-backdrop')).toHaveClass(/is-ready/);
  expect(await page.evaluate(()=>window.__csp)).toEqual(violations);
  const missing=await request.get('/assets/nonexistent.js');expect(missing.status()).toBe(404);
  const headers=(await request.get('/app/')).headers();
  expect(headers['x-frame-options']).toBe('DENY');expect(headers['x-content-type-options']).toBe('nosniff');expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(headers['content-security-policy']).not.toContain("script-src 'self' 'unsafe-inline'");
});

test('wallet selection opens without CSP or application errors', async ({page}) => {
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.__csp=[];document.addEventListener('securitypolicyviolation',e=>window.__csp.push(e.violatedDirective))});
  await page.goto('/app/');
  await page.getByRole('button',{name:'Connect wallet',exact:true}).click();
  await expect(page.getByText('Freighter',{exact:true}).first()).toBeVisible({timeout:20000});
  expect(errors).toEqual([]);expect(await page.evaluate(()=>window.__csp)).toEqual([]);
});

test('shader compilation failure preserves the static view and console', async ({page}) => {
  await page.addInitScript(()=>{
    const original=WebGL2RenderingContext.prototype.shaderSource;
    WebGL2RenderingContext.prototype.shaderSource=function(shader,source){
      original.call(this,shader,source+'\n deliberately_invalid_shader_source;\n');
    };
  });
  await page.goto('/app/?tab=pod');
  await expect(page.getByRole('status').filter({hasText:/Static view|3D view unavailable/})).toBeVisible();
  await expect(page.locator('.orbital-fallback')).toBeVisible();
  await expect(page.locator('#panel-pod')).toBeVisible();
  await page.locator('#tab-ledger').click();
  await expect(page.locator('#panel-ledger')).toBeVisible();
});

test('drag changes the actual 3D view without selecting an instrument or opening a drawer', async ({ page }) => {
  await staticScene(page);
  const before = await sceneRaster(page);
  const canvas = await page.locator('canvas').boundingBox();
  await page.mouse.move(canvas.x + canvas.width * .58, canvas.y + canvas.height * .55);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width * .76, canvas.y + canvas.height * .64, { steps: 14 });
  await page.mouse.up(); await page.mouse.move(2, 2);
  await expectSceneChanged(page, before, 'A camera drag must change rendered scene pixels');
  await expect(page.locator('#tab-fade')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.station-workspace')).toBeHidden();
  await expect(page).toHaveURL(/\/app\/$/);
});

test('wheel zoom changes the 3D view while the fullscreen app stays in place', async ({ page }) => {
  await staticScene(page);
  const before = await sceneRaster(page);
  const canvas = await page.locator('canvas').boundingBox();
  await page.mouse.move(canvas.x + canvas.width * .7, canvas.y + canvas.height * .5);
  await page.mouse.wheel(0, -420); await page.mouse.move(2, 2);
  await expectSceneChanged(page, before, 'Scene wheel input must zoom the rendered world');
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.locator('.station-workspace')).toBeHidden();
  await expect(page.locator('#tab-fade')).toHaveAttribute('aria-selected', 'true');
});

test('keyboard camera controls work on the focused canvas and Home restores the view', async ({ page }) => {
  await staticScene(page);
  const canvas = page.locator('.orbital-canvas canvas');
  await canvas.focus();
  const initial = await sceneRaster(page);
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('+');
  await expectSceneChanged(page, initial, 'Focused-canvas keys must change the camera');
  await expect(page.locator('#tab-fade')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Home');
  await expect.poll(async () => initial.equals(await sceneRaster(page)), { message: 'Home restores the initial orbit', timeout: 10000 }).toBe(true);
});

test('instrument selection moves the camera and Instruments returns to the open scene', async ({ page }) => {
  await staticScene(page, '/app/?tab=fade');
  const fade = await sceneRaster(page);
  await page.locator('#tab-pod').click();
  await expect(page.locator('#panel-pod')).toBeVisible();
  await page.mouse.move(2, 2);
  await expectSceneChanged(page, fade, 'Selecting a module must move its 3D view, not only replace the form');
  const pod = await sceneRaster(page);
  await page.getByRole('button', { name: /^Instruments/ }).click();
  await expect(page.locator('.station-workspace')).toBeHidden();
  await expectSceneChanged(page, pod, 'Instruments must return the camera to exploration');
  await expect(page.locator('#tab-pod')).toHaveAttribute('aria-selected', 'true');
});

test('closing and reopening an instrument preserves its unsent form draft', async ({ page }) => {
  await staticScene(page, '/app/?tab=pod');
  const amount = page.getByLabel('Amount (USDC)', { exact: true });
  const minutes = page.getByLabel('Unlock in (minutes)', { exact: false });
  await amount.fill('731.25'); await minutes.fill('13');
  await page.getByRole('button', { name: 'Close instrument', exact: true }).click();
  await expect(page.locator('.station-workspace')).toBeHidden();
  await page.locator('#tab-pod').click();
  await expect(page.locator('#panel-pod')).toBeVisible();
  await expect(amount).toHaveValue('731.25'); await expect(minutes).toHaveValue('13');
  await page.getByRole('button', { name: /^Instruments/ }).click();
  await page.getByRole('button', { name: /^Open Pod/ }).click();
  await expect(amount).toHaveValue('731.25'); await expect(minutes).toHaveValue('13');
});
