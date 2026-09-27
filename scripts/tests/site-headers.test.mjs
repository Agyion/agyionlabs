import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSiteHeaders } from '../site-headers.mjs';

const csp = "default-src 'self'; script-src 'self' 'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'";

// Cloudflare applies every matching rule and comma-joins duplicate fields.
// Model that documented behavior, rather than assuming the last rule wins.
function responseHeaders(document, pathname) {
  const headers = {};
  let applies = false;
  for (const line of document.split('\n')) {
    if (!line.trim()) continue;
    if (!line.startsWith(' ')) {
      const expression = line.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
      applies = new RegExp(`^${expression}$`).test(pathname);
    } else if (applies) {
      const separator = line.indexOf(':');
      const name = line.slice(0, separator).trim().toLowerCase();
      const value = line.slice(separator + 1).trim();
      headers[name] = headers[name] ? `${headers[name]}, ${value}` : value;
    }
  }
  return headers;
}

test('all real HTML routes and aliases prohibit transformation without duplicate caching directives', () => {
  const document = buildSiteHeaders(csp);
  const paths = ['/', '/index.html', '/app', '/app/', '/app/index.html', '/404', '/404/', '/404.html'];
  for (const route of ['instruments', 'fade', 'pod', 'trigger', 'envoy', 'ramp', 'ledger']) {
    paths.push(`/${route}`, `/${route}/`, `/${route}.html`);
  }
  for (const pathname of paths) {
    const headers = responseHeaders(document, pathname);
    assert.equal(headers['cache-control'], 'public, max-age=0, must-revalidate, no-transform', pathname);
    assert.equal(headers['content-security-policy'], csp, pathname);
  }
});

test('hashed assets retain exactly one immutable cache policy and non-HTML app resources still revalidate', () => {
  const document = buildSiteHeaders(csp);
  for (const pathname of ['/_next/static/chunks/app/page-abc.js', '/_next/static/css/abc.css', '/assets/index-abc.js', '/assets/index-abc.css']) {
    assert.equal(responseHeaders(document, pathname)['cache-control'], 'public, max-age=31536000, immutable', pathname);
  }
  for (const pathname of ['/app/index.txt', '/app/nested/data.txt', '/app-assets.json']) {
    assert.equal(responseHeaders(document, pathname)['cache-control'], 'public, max-age=0, must-revalidate', pathname);
  }
  for (const pathname of ['/fonts/Inter.woff2', '/favicon.svg', '/zk/artifact.wasm', '/unknown-document']) {
    assert.equal(responseHeaders(document, pathname)['cache-control'], undefined, pathname);
  }
});

test('security headers stay unchanged and Cloudflare header limits are respected', () => {
  const document = buildSiteHeaders(csp);
  assert.deepEqual(responseHeaders(document, '/favicon.svg'), {
    'content-security-policy': csp,
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'permissions-policy': 'camera=(), microphone=(), geolocation=(self)',
    'strict-transport-security': 'max-age=31536000',
  });
  assert.ok(document.split('\n').filter(line => line.startsWith('/')).length <= 100);
  assert.ok(document.split('\n').every(line => line.length <= 2000));
});

test('content-addressed private prover data is immutable binary data without CDN rewriting', () => {
  const headers = responseHeaders(buildSiteHeaders(csp), '/zk/private/' + 'a'.repeat(64) + '.bin');
  assert.equal(headers['cache-control'], 'public, max-age=31536000, immutable, no-transform');
  assert.equal(headers['content-type'], 'application/octet-stream');
  assert.equal(headers['x-content-type-options'], 'nosniff');
  assert.equal(headers['content-security-policy'], csp);
});
