/** Compatibility entry point for the retired two-scene home-gallery suite.
 * Home no longer owns instrument selection, gallery scroll restoration, SVG
 * previews, or gallery-to-detail shared transitions. Those assertions are retired.
 * The canonical matrix verifies /instruments, all six detail routes, the legacy
 * hash redirect, keyboard/history/focus, hero flights and progressive fallbacks.
 * Keep old invocation paths useful without keeping a second competing contract.
 */
process.env.BASE_URL ||= 'http://127.0.0.1:4192'
process.env.QA_OUTPUT_DIR ||= 'artifacts/verification/canonical-instruments'
console.log('Home-gallery assertions are retired. Running the canonical /instruments matrix.')
await import('../landing/tests/e2e/matrix.mjs')
