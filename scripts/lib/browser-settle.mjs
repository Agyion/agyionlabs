/** Bound browser-side promises from Node, where a paused page cannot stop the clock.
 * Playwright's locator timeout does not bound page.evaluate promises. A timeout
 * is a failed observation, never evidence that the page finished settling.
 */
export async function boundedEvaluation(page, callback, argument, { timeoutMs = 10000, label = 'Browser observation' } = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Browser observation timeout must be positive and finite');
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(() => page.evaluate(callback, argument)),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function waitForFonts(page, options) {
  return boundedEvaluation(page, async () => { await document.fonts.ready; }, undefined, { label: 'Font readiness', ...options });
}

export function waitForFrames(page, options) {
  return boundedEvaluation(page, () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))), undefined, { label: 'Two rendered frames', ...options });
}

/** Wait for the current finite transitions, including native view transitions.
 * Infinite ambient animations intentionally continue. Cancelled transitions are
 * finished for this observation; a paused finite transition instead times out.
 * This is a snapshot of current animations, not proof that no new one can start.
 */
export function settleRenderedPage(page, { selector, ...options } = {}) {
  return boundedEvaluation(page, async selector => {
    await document.fonts.ready;
    if (selector && !document.querySelector(selector)) throw new Error(`Missing settling target: ${selector}`);
    const finite = document.getAnimations().filter(animation => Number.isFinite(Number(animation.effect?.getComputedTiming().endTime)));
    await Promise.all(finite.map(animation => animation.finished.catch(() => {})));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  }, selector, { label: 'Rendered page settling', ...options });
}
