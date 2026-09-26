import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAppAssetManifest, ORBITAL_BACKDROP_IMPORT } from '../app-asset-manifest.mjs';

const layout = ['static/chunks/runtime-abc123.js', 'static/css/layout-abc123.css'];
const page = [layout[0], 'static/chunks/app/app/page-def456.js'];
const scene = ['static/chunks/scene-456abc.js', 'static/chunks/three-123def.js'];
const manifests = () => [
  { pages: { '/layout': layout, '/app/page': page, '/unrelated': ['static/chunks/unrelated.js'] } },
  { [ORBITAL_BACKDROP_IMPORT]: { files: scene }, 'other -> module': { files: ['static/chunks/other.js'] } },
];

test('includes only the app page, shared layout and exact scene import, once each', () => {
  assert.deepEqual(buildAppAssetManifest(...manifests()), {
    version: 1,
    assets: [...layout, page[1], ...scene].map(file => ({ href: `/_next/${file}`, as: file.endsWith('.css') ? 'style' : 'script' })),
  });
});

test('fails assembly when a required entry is missing instead of guessing chunk names', () => {
  const [app, loadable] = manifests();
  assert.throws(() => buildAppAssetManifest({ pages: { '/layout': layout } }, loadable), /\/app\/page/);
  assert.throws(() => buildAppAssetManifest(app, {}), /OrbitalBackdrop/);
  assert.throws(() => buildAppAssetManifest(app, { [ORBITAL_BACKDROP_IMPORT]: { files: [] } }), /OrbitalBackdrop/);
});

test('rejects nonstatic, traversal, encoded, query, absolute and unsupported assets', () => {
  for (const file of ['https://other.test/static/x.js', '//other.test/x.js', '/static/x.js', 'static/../secret.js', 'static/chunks/%2e%2e/x.js', 'static/chunks/x.js?x', 'static/chunks/x.js#x', 'static\\chunks\\x.js', 'static//x.js', 'static/media/font.woff2', 'static/chunks/x.json']) {
    const [app, loadable] = manifests();
    app.pages['/app/page'] = [file];
    assert.throws(() => buildAppAssetManifest(app, loadable), /asset/i, file);
  }
});
