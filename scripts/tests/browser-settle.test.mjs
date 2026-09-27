import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { boundedEvaluation, settleRenderedPage, waitForFonts, waitForFrames } from '../lib/browser-settle.mjs';

// This runs the exact serialized browser callback in an isolated fake DOM. It
// tests timeout semantics; it is not browser/GPU visual evidence.
const never = () => new Promise(() => {});
const fakePage = (document = {}, requestAnimationFrame = callback => setTimeout(callback, 0)) => ({
  evaluate: (callback, argument) => vm.runInNewContext(`(${callback.toString()})(argument)`, {
    document: { fonts: { ready: Promise.resolve() }, getAnimations: () => [], querySelector: () => ({}), ...document },
    requestAnimationFrame, argument,
  }),
});
const deadline = { timeoutMs: 40 };

test('font and frame promises have an external deadline even if the browser never replies', async () => {
  await assert.rejects(waitForFonts(fakePage({ fonts: { ready: never() } }), deadline), /Font readiness timed out/);
  await assert.rejects(waitForFrames(fakePage({}, () => {}), deadline), /Two rendered frames timed out/);
  await assert.rejects(boundedEvaluation({ evaluate: never }, () => true, undefined, deadline), /Browser observation timed out/);
});

test('a paused finite transition fails instead of silently declaring a settled page', async () => {
  await assert.rejects(settleRenderedPage(fakePage({
    getAnimations: () => [{ effect: { getComputedTiming: () => ({ endTime: 300 }) }, finished: never() }],
  }), deadline), /Rendered page settling timed out/);
});

test('ambient infinite animations are excluded and finite transitions actually finish', async () => {
  let finished = false;
  const finite = new Promise(resolve => setTimeout(() => { finished = true; resolve(); }, 10));
  await settleRenderedPage(fakePage({ getAnimations: () => [
    { effect: { getComputedTiming: () => ({ endTime: Infinity }) }, finished: never() },
    { effect: { getComputedTiming: () => ({ endTime: 10 }) }, finished: finite },
  ] }), { timeoutMs: 1000 });
  assert.equal(finished, true);
});

test('cancelled transitions do not hang and missing targets fail', async () => {
  await settleRenderedPage(fakePage({ getAnimations: () => [{
    effect: { getComputedTiming: () => ({ endTime: 200 }) }, get finished() { return Promise.reject(new Error('cancelled')); },
  }] }));
  await assert.rejects(settleRenderedPage(fakePage({ querySelector: () => null }), { selector: '.missing' }), /Missing settling target/);
});

test('synchronous and asynchronous evaluation failures remain failures, and invalid bounds are rejected', async () => {
  await assert.rejects(boundedEvaluation({ evaluate: () => { throw new Error('closed'); } }, () => {}, undefined), /closed/);
  await assert.rejects(boundedEvaluation({ evaluate: () => Promise.reject(new Error('navigation')) }, () => {}, undefined), /navigation/);
  for (const timeoutMs of [0, -1, Infinity, NaN]) await assert.rejects(waitForFonts(fakePage(), { timeoutMs }), /positive and finite/);
  await waitForFonts(fakePage());
  await waitForFrames(fakePage());
});
